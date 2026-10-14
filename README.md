# CHANKAS · Camino de resistencia

Primera versión web jugable basada en `data.txt`. Juego de acción lateral original, inspirado libremente en la resistencia andina de 1536. El protagonista y el capitán son ficticios. No representa una reconstrucción histórica.

## Jugar

Abre `index.html` directamente en tu navegador. No requiere instalación ni conexión. También puedes ejecutar `npm run dev` y visitar http://localhost:5173.

- A/D o flechas: caminar; Espacio, W o arriba: saltar.
- J: huaraca; K: piedra incendiaria (5 por partida); L: boleadora.
- H (o el botón «Llama» en móvil): la llama escupe al enemigo visible más cercano (hasta 240 px).
  Tiene 3 escupitajos propios, recupera uno cada 6 s de juego, hace 1 de daño y aturde 0,5 s.
- E cerca de una apacheta: llenar la manta (24 piedras). E junto a la llama: +8 piedras de sus
  alforjas (5 cargas, que se reponen en cada apacheta nueva).
- P o Esc: pausa (menú con inventario). Enter / flechas en el título, la pausa y el mapa.
  Con ratón, barra de controles debajo del juego.
- Móvil (en horizontal): cruceta a la izquierda; SALTAR y LANZAR a la derecha; encima, el arma
  (tocar = siguiente arma), la llama y Recargar cuando sirve. Mandos translúcidos y sin zoom.
- Rótulos breves al empezar y ante el capitán: Enter o un toque los omiten.
- Derrota al capitán al final para ganar. Si pierdes tus seis corazones, puedes reiniciar.

La llama sigue al protagonista y escupe cuando se lo ordenas; los enemigos escupidos se limpian la cara indignados y el capitán tiene su propia reacción. Si llegas al capitán sin haberla usado, la llama escupe una vez por su cuenta y te enseña la tecla (solo una vez por partida). Los enemigos tienen roles de aproximación, tiro y patrulla. No hay sangre. Activa el sonido con el botón superior.

## Despliegue

Imagen Docker lista para producción (nginx sin privilegios, cabeceras de seguridad y CSP
estricta, `/healthz`). Prueba local: `npm run docker:build && npm run docker:run` y abre
http://localhost:8080. Guía completa (Fly.io, Render/Railway, VPS con Caddy e itch.io con
`npm run package:itch`): [DEPLOY.md](DEPLOY.md).

## Competencia y modalidades

Elige **Chasqui**, **Inka** o **Pachacútec** antes de empezar. Sacsayhuamán tiene un recorrido 35 % más largo, nuevos encuentros y una terraza opcional. Gana XP, cinco rangos y seis insignias; compite en clasificaciones semanal y general separadas por modalidad.

Para activar perfiles y leaderboard con MongoDB:

```sh
docker compose -f docker-compose.online.yml up --build -d
```

Abre http://localhost:8080. Puedes configurar tu instancia con `MONGODB_URI` en `.env` (ver `.env.example`). Sin API el juego conserva progreso local y funciona sin clasificación. Reglas, arquitectura, pruebas y límites: [docs/COMPETENCIA.md](docs/COMPETENCIA.md).

## Verificación del juego

`npm run check` comprueba sintaxis. `npm test` verifica munición, recarga, salto, pausa, derrota y victoria con un entorno DOM simulado. Las pruebas también cubren sesión inicial, progreso local, reintentos y reglas del leaderboard. La integración real con MongoDB se ejecuta con `TEST_MONGODB_URI`; el balance con jugadores reales queda pendiente.

## Alcance

Un nivel, tres roles de enemigo, un jefe, una compañera, munición limitada, recargas, ataque normal e incendiario, puntaje, pausa y reinicio. Arte geométrico original en Canvas y efectos sintetizados. El cliente funciona sin dependencias externas; la API opcional utiliza el driver de MongoDB.

Pendiente: sprites animados de producción, música, accesibilidad ampliada, más niveles, boleadoras, rescates y validación histórica con bibliografía primaria. El balance inicial requiere playtesting; esta es una base funcional, no una versión comercial terminada.

## Interfaz

`ui.js` pinta la interfaz HTML del diseño «Chankas · Interfaz v2» (HUD sobre el canvas, barra de
ruta, título, pausa e inventario, panel «Las cinco cuerdas» del mapa). `game.js` sigue siendo la
fuente de verdad: expone `uiView()` (modelo de vista puro) y `uiAction()`; `ui.js` solo escribe en
el DOM cuando un valor cambia. Sin `ui.js`, el juego vuelve al HUD dibujado en el canvas. Los
tokens de color y tipografía (Jersey 10, Pixelify Sans, Atkinson Hyperlegible) están en `style.css`.

Coordinación y decisiones: `docs/COORDINACION.md`.
