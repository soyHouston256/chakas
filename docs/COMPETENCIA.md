# Modalidades y competencia

Sacsayhuamán tiene un recorrido de 5.670 unidades (35 % más que las 4.200 anteriores), doce enemigos regulares, ocho apachetas y una terraza opcional. Las otras cuatro etapas siguen anunciadas para futuras entregas.

## Modalidades

| Modalidad | Velocidad enemiga | Frecuencia de ataques | Velocidad de proyectiles | Piedras de fuego iniciales | Recarga de llama |
|---|---:|---:|---:|---:|---:|
| Chasqui | 0,8× | 0,8× | 0,85× | 7 | 10 |
| Inka | 1× | 1× | 1× | 5 | 8 |
| Pachacútec | 1,2× | 1,25× | 1,15× | 3 | 6 |

La modalidad se fija al iniciar. Las preparaciones visibles de ataque y la vida del jefe se mantienen; los rangos e insignias no otorgan ventajas de combate. Son nombres temáticos, no una clasificación histórica.

## Puntaje y progresión

Quipu final = 1.000 por victoria + 100 por enemigo regular + 300 por terraza opcional + máximo(0, 500 − 100 × muertes) + máximo(0, 300 − segundos activos). La pausa no cuenta. La terraza también entrega una piedra de fuego.

XP por victoria = 100 + parte entera(quipu / 20). Rangos: Caminante (0), Guardián del Camino (500), Guerrero de la Huaraca (1.500), Protector de las Cumbres (3.500), Leyenda de los Andes (7.000).

Seis insignias: primera victoria, victoria sin morir, al menos diez lanzamientos con precisión del 70 % (piedras y boleadoras), cinco impactos de llama, terraza opcional y victoria en Pachacútec. Se conservan una sola vez en el perfil.

El ranking conserva la mejor partida por jugador, etapa y modalidad. Desempata por menos muertes, menor tiempo activo, fecha y un identificador estable. La semana comienza el lunes a las 00:00 UTC; los tres primeros reciben medallas visibles mientras ocupan esas posiciones. Estas medallas son posiciones semanales, no trofeos históricos permanentes.

## MongoDB y ejecución

```sh
docker compose -f docker-compose.online.yml up --build -d
```

Abre http://localhost:8080. El compose crea MongoDB local con volumen persistente, API y nginx; solo el sitio expone un puerto en localhost. Para usar tu instancia, copia `.env.example` a `.env` y define `MONGODB_URI` y `MONGODB_DB`. El servicio Mongo local puede quedar sin uso; para un despliegue con base externa puedes omitirlo junto con la dependencia `api.depends_on.mongo` en tu configuración de despliegue. Usa `COOKIE_SECURE=true` cuando el sitio se sirva por HTTPS.

La API usa `players` y `runs`: el perfil incluye XP, insignias y etapas completadas; las partidas guardan modalidad, versión de reglas, métricas y resultado. Los rankings se calculan desde las partidas con índices, sin duplicar los datos en otras colecciones. La finalización tiene una guarda atómica para no otorgar XP dos veces al reenviar o repetir solicitudes concurrentes.

El perfil invitado usa una cookie HttpOnly. Borrar los datos del sitio pierde el acceso a esa identidad; aún no hay recuperación ni cuentas para otro dispositivo. El alias no autentica ni tiene que ser único. La URI de MongoDB vive exclusivamente en la API.

Sin API puedes abrir `index.html` o usar `npm run dev`: XP e insignias se guardan localmente y las partidas no entran en la clasificación ni se suben posteriormente. Los perfiles local y online conservan progresiones separadas.

También puedes desarrollar sin Docker: ejecuta `npm ci` en `server/`, inicia `MONGODB_URI=... node server/index.cjs` y, en otra terminal, `npm run dev:online`. El juego se abre en http://localhost:5174 y usa la API de localhost:3000. `API_URL` permite cambiar la dirección local de la API; este proxy de desarrollo sirve solamente el build público.

## Verificación y límites

```sh
npm test
npm run check
npm run build:dist
cd server
npm ci
cd ..
TEST_MONGODB_URI=mongodb://127.0.0.1:27017 node --test tests/server-integration.cjs
```

La integración usa una base de prueba con nombre propio y la elimina al terminar. Sin `TEST_MONGODB_URI`, esa prueba se omite explícitamente. Las pruebas restantes cubren el motor, recompensas locales, sesión inicial, abandono, reintentos y reglas del servidor.

El servidor deriva el puntaje y valida límites, propiedad de la partida y tiempo transcurrido. Recibe métricas del navegador: esto no constituye verificación autoritativa del combate. La clasificación casual está implementada; una competencia con premios necesita una verificación adicional de eventos o una simulación reproducible. El balance y la duración real requieren playtesting.
