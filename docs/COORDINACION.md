# Primera versión y revisión con Claude

## Lectura del plan

Se conserva la ruta sierra a costa como dirección futura, la huaraca, la manta con piedras finitas, montones de recarga y la llama compañera. Se reduce el alcance inicial a un paso andino con un capitán ficticio. Los cinco escenarios del plan quedan para versiones posteriores.

No se dan por comprobadas las afirmaciones históricas de data.txt: sus citas no incluyen enlaces ni páginas de libros y el propio texto señala verificaciones pendientes. La primera versión declara su carácter ficticio y evita presentar personajes reales o victorias como reconstrucción histórica.

## Coordinación intentada

Se encontró Claude CLI instalado y se solicitó una revisión de alcance, riesgos y cinco criterios de aceptación, sin escritura de archivos. Respondió: `Not logged in · Please run /login`. No hubo revisión de Claude ni contribución suya al código.

Para retomar: ejecutar `claude`, iniciar sesión mediante `/login` y pedirle que revise data.txt, README.md, game.js y tests/game.cjs. Encargo sugerido:

> Revisa esta primera versión web jugable sin modificar archivos. Evalúa el balance de los enemigos, el suministro de piedras, los controles táctiles, el jefe y la fidelidad al alcance de data.txt. Prioriza cinco mejoras concretas y detecta errores de combate. Distingue hechos históricos verificados de ficción.

## Criterios implementados

- Una partida completa tiene inicio, combate, jefe, victoria y derrota.
- La huaraca consume munición y la recarga funciona solo cerca de un montón.
- La llama acompaña y ayuda sin poder montarse.
- Hay teclado y botones táctiles, pausa y reinicio.
- Los personajes, dibujos y sonidos son originales; se declara ficción.

## Siguiente revisión

Probar en navegador de escritorio y teléfono; medir dificultad y duración; validar representación cultural con especialistas antes de publicar. Phaser y TypeScript siguen siendo una opción de migración cuando crezca el proyecto: Canvas sin dependencias permite probar el núcleo ahora.
