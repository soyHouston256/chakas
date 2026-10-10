# Revisión de Codex · contenedor y despliegue

Revisión de `git diff fe04a0b..HEAD` (Dockerfile, `deploy/nginx/*`, `scripts/build-dist.cjs`,
`.dockerignore`, `docker-compose.yml`, `fly.toml`, CI, `DEPLOY.md`, cambios de CSP en
`index.html`/`ui.js`) con `codex exec --sandbox read-only`. Foco: seguridad (cabeceras, CSP,
no-root, superficie de ataque, archivos filtrados), corrección, caché, higiene de imagen y
exactitud de la guía. Docker no estaba disponible (daemon detenido), así que Codex razonó
sobre la imagen `nginx-unprivileged` real y el código fuente de nginx.

## Hallazgos y decisión

| # | Sev. | Hallazgo | Decisión |
|---|---|---|---|
| 1 | Alta | `GET /` devolvía 404: `location /` con `try_files $uri =404` no prueba directorios, así que `index` nunca actuaba. | **Aceptado.** Nueva `location = /` con `try_files /index.html =404` (`no-cache` + cabeceras). |
| 2 | Media | `?v=<hash>` no identifica el archivo servido (nginx ignora la query): en un despliegue gradual el HTML A podía recibir el JS B y cachearlo un año como inmutable; además cualquier `?v=` activaba `immutable`. | **Aceptado.** `build-dist.cjs` ahora publica nombres físicos con hash (`game.<hash>.js`, `style.<hash>.css`) y nginx solo marca `immutable` lo que casa con `\.[0-9a-f]{12}\.(js\|css)$`. Se eliminó el `map $arg_v`. Un HTML nuevo que llegue a una máquina vieja recibe 404 `no-store` (no se cachea). |
| 3 | Baja | El `return 405` del nivel `server` salía sin CSP ni demás cabeceras (solo se incluían en las `location`). | **Aceptado.** `security-headers.inc` también se incluye a nivel `server`; las `location` lo siguen incluyendo porque su `add_header Cache-Control` anula la herencia. |
| 4 | Baja | En CI, agotar los 20 intentos de `/healthz` no fallaba el paso (el último `sleep` devuelve 0). | **Aceptado.** Tras el bucle, `curl -fsS /healthz` obligatorio y comprobación de que `/` da 200. |
| 5 | Baja | `DEPLOY.md` decía que Node solo hacía falta fuera de Docker, pero los comandos locales usaban `npm run`. | **Aceptado.** Requisito aclarado y comandos `docker build`/`docker run` completos al lado de los atajos npm. |

No hubo hallazgos rechazados. Codex no objetó la CSP (sin `'unsafe-inline'`), el usuario no
root, la lista blanca de `.dockerignore`, la validación de `FRAME_ANCESTORS` ni los pines de
imagen.

## Reverificación

- `npm test`: OK. `npm run build:dist` / `npm run package:itch`: 9 / 8 archivos, sin `data.txt`,
  `docs/`, `tests/` ni previews.
- Chromium headless contra `dist/web` servido con las mismas cabeceras que la plantilla de nginx
  (CSP leída de `security-headers.inc.template`): título → nivel → pausa → mapa → nivel, 3
  fuentes de Google cargadas, 0 violaciones CSP, 0 errores de consola (salvo el 404 esperado al
  pedir `/data.txt`). JS/CSS con hash → `immutable`.
- Pendiente con Docker en marcha: `docker build`, `docker compose up` (read_only + tmpfs) y
  `nginx -t` reales; el workflow de CI cubre build + smoke test.
