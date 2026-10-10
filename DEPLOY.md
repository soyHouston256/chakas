# Despliegue de CHANKAS

CHANKAS es un sitio 100 % estático (HTML, CSS y JS sin build). Para producción se empaqueta en
una imagen Docker con nginx sin privilegios. Este documento explica cómo probarla en local y
cómo publicarla en Fly.io (recomendado), Render o Railway, un VPS con Caddy, o itch.io.

## Qué se publica (y qué no)

`scripts/build-dist.cjs` copia **solo** lo que el juego carga en tiempo de ejecución, y falla si
la lista no coincide con las etiquetas `<script>`/`<link>` de `index.html`:

| Se publica | No se publica |
|---|---|
| `index.html`, `style.css`, `ui.js`, `game.js` | `data.txt` (notas de diseño), `docs/`, `tests/` |
| `art/sprites.js`, `art/background.js`, `art/peru-data.js`, `art/map.js` | `art/preview-*.html` (herramientas de desarrollo; no las enlaza el juego) |
| `404.html` (solo en la imagen Docker) | `.git`, `node_modules`, `dist/`, capturas `*.png`, `scratch/` |

El `.dockerignore` es una lista blanca: `data.txt` y `docs/` ni siquiera entran al contexto de
build. Cada JS/CSS se publica con el hash de su contenido en el nombre (`game.<hash>.js`,
`style.<hash>.css`) y la copia de `index.html` apunta a esos nombres: se cachean un año como
inmutables y cada versión nueva usa URLs nuevas (sin mezclas durante despliegues graduales).

Las fuentes (Jersey 10, Pixelify Sans, Atkinson Hyperlegible) se cargan desde **Google Fonts**
(`fonts.googleapis.com` / `fonts.gstatic.com`). Ver «Privacidad» al final.

## Requisitos

- Docker (Docker Desktop o Docker Engine con BuildKit, que es el predeterminado).
- Node.js LTS/npm para los atajos `npm run ...`, las pruebas fuera de Docker y el ZIP de
  itch.io. Con solo Docker, usa los comandos `docker` equivalentes de abajo.

## Probar en local

```sh
# Imagen (el build ejecuta `npm test`; si alguna prueba falla, el build falla)
npm run docker:build    # o, sin Node: docker build -t chankas:latest .
npm run docker:run      # o, sin Node:
docker run --rm --name chankas -p 127.0.0.1:8080:8080 --read-only --tmpfs /tmp \
  --cap-drop ALL --security-opt no-new-privileges:true chankas:latest
# abre http://localhost:8080
```

Con Docker Compose (sistema de archivos de solo lectura, `cap_drop: ALL`,
`no-new-privileges`, healthcheck y `restart: unless-stopped`):

```sh
docker compose up -d --build
docker compose ps             # debe salir "healthy"
curl -i http://localhost:8080/healthz
curl -sI http://localhost:8080/            # cabeceras de seguridad
docker compose down
```

Sin Docker: `npm run dev` (servidor Python en :5173) o `npm run build:dist` para ver en
`dist/web/` exactamente lo que se publicará.

## Qué hace el servidor (nginx)

- Imagen `nginxinc/nginx-unprivileged` (usuario 101, puerto **8080**), versión y digest fijados.
  Configuración y archivos del sitio son de root: el proceso nginx no puede modificarlos.
- `GET /healthz` → `200 ok` (para healthchecks). Rutas inexistentes → `404.html` simple
  (no hay rutas de cliente). Solo `GET`/`HEAD`; otros métodos → 405. `server_tokens off`.
- gzip para HTML/CSS/JS/SVG (brotli no viene en la imagen; si la plataforma o Caddy comprimen
  con brotli/zstd, mejor).
- Caché: `/` e `index.html` → `no-cache` (se revalida con ETag); JS/CSS con hash en el nombre →
  `public, max-age=31536000, immutable`; 404 y `/healthz` → `no-store`.
- Cabeceras en todas las respuestas (también en 404):
  - `Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors <FRAME_ANCESTORS>`
    (sin `'unsafe-inline'`; `data:` solo para las grecas SVG del CSS).
  - `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`,
    `Permissions-Policy` (cámara, micrófono, geolocalización, sensores, pagos… desactivados),
    `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Resource-Policy: same-origin`.
  - No se envía `X-Frame-Options`: `frame-ancestors` lo sustituye y es configurable.
  - **HSTS** no se envía desde el contenedor porque TLS termina en la plataforma/proxy. Actívalo
    allí: en Caddy ya está en `deploy/Caddyfile`; en Cloudflare u otro CDN, en su panel. Fly.io y
    Render ya redirigen HTTP→HTTPS (`force_https`).

### FRAME_ANCESTORS (incrustar en un iframe)

Por defecto `FRAME_ANCESTORS="'self'"`: nadie más puede incrustar el juego en un `<iframe>`
(protección contra clickjacking). Si quieres incrustar **tu versión alojada** en otra web
(un blog, una página de itch.io con iframe propio, etc.), añade ese origen:

```sh
docker run ... -e FRAME_ANCESTORS="'self' https://midominio.com https://*.itch.io https://*.itch.zone" chankas:latest
```

Solo se admiten fuentes CSP simples (`'self'`, `'none'`, esquemas y hosts con `*`); cualquier
otro carácter hace que el contenedor no arranque. Si subes el ZIP a itch.io (más abajo) **no**
hace falta: itch sirve los archivos desde su propio dominio y con sus propias cabeceras.

## Opción recomendada: Fly.io

`fly.toml` ya está incluido (`internal_port = 8080`, healthcheck `/healthz`, HTTPS forzado,
máquinas que se apagan sin tráfico). Cambia `app` por un nombre libre y, si quieres, la región.

```sh
brew install flyctl                 # o: curl -L https://fly.io/install.sh | sh
fly auth login
fly launch --copy-config --no-deploy --name chankas-<tu-nombre>   # usa el fly.toml existente
fly deploy                          # construye la imagen (con npm test) y la publica
fly status && fly checks list
fly open                            # https://chankas-<tu-nombre>.fly.dev
# opcional
# FRAME_ANCESTORS: edita [env] en fly.toml y vuelve a ejecutar `fly deploy`
fly certs add juego.midominio.com   # dominio propio (sigue las instrucciones DNS)
```

## Render (Docker)

1. Sube el repositorio a GitHub/GitLab.
2. Render → **New → Web Service** → elige el repo → **Language: Docker** (detecta el
   `Dockerfile`).
3. **Instance type**: Free o Starter. **Health Check Path**: `/healthz`.
4. **Environment**: `PORT=8080` (Render enruta a ese puerto) y, si hace falta,
   `FRAME_ANCESTORS`.
5. **Create Web Service**. Cada push a la rama elegida redepliega. URL: `https://<servicio>.onrender.com`.

### Alternativa: Railway (Docker)

```sh
npm i -g @railway/cli
railway login
railway init                        # crea el proyecto
railway up                          # sube el código; Railway usa el Dockerfile
railway variables --set "PORT=8080" # Railway enruta al puerto de PORT
railway domain                      # genera https://<algo>.up.railway.app
```

En el panel del servicio, pon **Healthcheck Path** = `/healthz`.

## VPS con Caddy (HTTPS automático)

En un servidor Debian/Ubuntu con un dominio apuntando (registro A/AAAA) a su IP:

```sh
# 1. Docker y Caddy
curl -fsSL https://get.docker.com | sh
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy

# 2. El juego (escucha solo en 127.0.0.1:8080, ver docker-compose.yml)
git clone <url-de-tu-repo> chankas && cd chankas
sudo docker compose up -d --build
curl -fsS http://127.0.0.1:8080/healthz

# 3. Caddy delante: edita el dominio en deploy/Caddyfile y actívalo
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile
sudo systemctl reload caddy         # obtiene el certificado de Let's Encrypt automáticamente

# 4. Cortafuegos: solo SSH, HTTP y HTTPS
sudo ufw allow OpenSSH && sudo ufw allow 80,443/tcp && sudo ufw enable
```

`deploy/Caddyfile` añade HSTS (`Strict-Transport-Security`) y compresión zstd/gzip. Para
actualizar: `git pull && sudo docker compose up -d --build`.

## itch.io (HTML5, sin servidor)

```sh
npm run package:itch                # crea dist/chankas-itch.zip (requiere `zip`)
```

El ZIP contiene `index.html` en la raíz y solo los archivos de runtime. En itch.io:
**Create new project → Kind of project: HTML** → sube el ZIP → marca **This file will be
played in the browser** → tamaño del iframe recomendado **1280 × 900** (la página incluye
HUD, mapa y controles alrededor del canvas) y activa **Mobile friendly**/**Fullscreen button**
si quieres. Las cabeceras de nginx no aplican en itch (usa las suyas), así que
`FRAME_ANCESTORS` no es necesario en este caso.

## Integración continua

`.github/workflows/ci.yml` ejecuta en cada push/PR: `npm test`, `build:dist`, `docker build`
(que vuelve a ejecutar las pruebas) y un smoke test del contenedor (healthz, CSP, nosniff y que
`data.txt`/`docs/` den 404). No despliega ni usa secretos.

## Privacidad (Google Fonts)

Al cargar las fuentes desde Google, el navegador de cada jugador contacta con servidores de
Google (que ven su IP). En la UE esto puede requerir mención en la política de privacidad o
consentimiento (RGPD). Alternativa futura: descargar los `.woff2` (licencia OFL), servirlos
desde el propio sitio con `@font-face` en `style.css`, quitar los `<link>` a Google y reducir
la CSP a `style-src 'self'; font-src 'self'`.
