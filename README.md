# CHANKAS · Camino de resistencia

Primera versión web jugable basada en `data.txt`. Juego de acción lateral original, inspirado libremente en la resistencia andina de 1536. El protagonista y el capitán son ficticios. No representa una reconstrucción histórica.

## Jugar

Abre `index.html` directamente en tu navegador. No requiere instalación ni conexión. También puedes ejecutar `npm run dev` y visitar http://localhost:5173.

- A/D o flechas: caminar; Espacio o arriba: saltar.
- J: huaraca; K: piedra incendiaria (5 por partida).
- E cerca de una bandera: llenar la manta (24 piedras).
- P: pausar y continuar. Controles táctiles debajo del juego.
- Derrota al capitán al final para ganar. Si pierdes tus seis corazones, puedes reiniciar.

La llama sigue al protagonista y escupe automáticamente a los enemigos cercanos. Los enemigos tienen roles de aproximación, tiro y patrulla. No hay sangre. Activa el sonido con el botón superior.

## Verificación

`npm run check` comprueba sintaxis. `npm test` verifica munición, recarga, salto, pausa, derrota y victoria con un entorno DOM simulado. La revisión visual y el balance con jugadores reales quedan pendientes: este entorno bloqueó el servidor local y el navegador de pruebas bloqueó las URLs file.

## Alcance

Un nivel, tres roles de enemigo, un jefe, una compañera, munición limitada, recargas, ataque normal e incendiario, puntaje, pausa y reinicio. Arte geométrico original en Canvas y efectos sintetizados. Sin dependencias externas.

Pendiente: sprites animados de producción, música, accesibilidad ampliada, más niveles, boleadoras, rescates y validación histórica con bibliografía primaria. El balance inicial requiere playtesting; esta es una base funcional, no una versión comercial terminada.

Coordinación y decisiones: `docs/COORDINACION.md`.
