# CHANKAS · Camino de resistencia

Primera versión web jugable basada en `data.txt`. Juego de acción lateral original, inspirado libremente en la resistencia andina de 1536. El protagonista y el capitán son ficticios. No representa una reconstrucción histórica.

## Jugar

Abre `index.html` directamente en tu navegador. No requiere instalación ni conexión. También puedes ejecutar `npm run dev` y visitar http://localhost:5173.

- A/D o flechas: caminar; Espacio, W o arriba: saltar.
- J: huaraca; K: piedra incendiaria (5 por partida); L: boleadora.
- E cerca de una apacheta: llenar la manta (24 piedras). E junto a la llama: +8 piedras de sus
  alforjas (5 cargas, que se reponen en cada apacheta nueva).
- P o Esc: pausa (menú con inventario). Enter / flechas en el título, la pausa y el mapa.
  Controles táctiles debajo del juego.
- Derrota al capitán al final para ganar. Si pierdes tus seis corazones, puedes reiniciar.

La llama sigue al protagonista y escupe automáticamente a los enemigos cercanos. Los enemigos tienen roles de aproximación, tiro y patrulla. No hay sangre. Activa el sonido con el botón superior.

## Verificación

`npm run check` comprueba sintaxis. `npm test` verifica munición, recarga, salto, pausa, derrota y victoria con un entorno DOM simulado. La revisión visual y el balance con jugadores reales quedan pendientes: este entorno bloqueó el servidor local y el navegador de pruebas bloqueó las URLs file.

## Alcance

Un nivel, tres roles de enemigo, un jefe, una compañera, munición limitada, recargas, ataque normal e incendiario, puntaje, pausa y reinicio. Arte geométrico original en Canvas y efectos sintetizados. Sin dependencias externas.

Pendiente: sprites animados de producción, música, accesibilidad ampliada, más niveles, boleadoras, rescates y validación histórica con bibliografía primaria. El balance inicial requiere playtesting; esta es una base funcional, no una versión comercial terminada.

## Interfaz

`ui.js` pinta la interfaz HTML del diseño «Chankas · Interfaz v2» (HUD sobre el canvas, barra de
ruta, título, pausa e inventario, panel «Las cinco cuerdas» del mapa). `game.js` sigue siendo la
fuente de verdad: expone `uiView()` (modelo de vista puro) y `uiAction()`; `ui.js` solo escribe en
el DOM cuando un valor cambia. Sin `ui.js`, el juego vuelve al HUD dibujado en el canvas. Los
tokens de color y tipografía (Jersey 10, Pixelify Sans, Atkinson Hyperlegible) están en `style.css`.

Coordinación y decisiones: `docs/COORDINACION.md`.
