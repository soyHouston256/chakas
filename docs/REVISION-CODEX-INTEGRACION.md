# Revisión de Codex · integración del arte

**Revisor:** OpenAI Codex CLI 0.160.1 (`codex exec --sandbox read-only`), 2026-10-08.
**Alcance:** `git diff 48153f0..cd80179 -- game.js index.html tests/game.cjs` (48153f0 = `game.js` formateado con prettier, sin cambios de comportamiento).

## Salida de Codex (literal)

- **P1 — `game.js:89` (hitbox), `game.js:235` y `game.js:327`: los perros quedan inmunes a piedras normales y escupitajos desde el suelo.** El perro empieza en `y=414`; la piedra ocupa `405..413` y el escupitajo `392..400`. Confirmé que ambos dan `overlap=false` incluso alineados horizontalmente. Saltar tampoco permite bajar la piedra. **Arreglo:** compatibilizar las trayectorias con el hitbox autorizado `44×26`, conservando velocidades, daño y cadencia; añadir pruebas de impactos reales contra perros.

- **P2 — `game.js:421–425`: lanzamiento desincronizado al recibir daño.** `hurt` tiene prioridad mientras `throwT` sigue consumiéndose. Al volver a `throw`, `setAnim` reinicia `animT`: reproduce el inicio de una acción cuyo proyectil ya salió y la corta cuando vence el tiempo restante. Reproducción: quedan `0,065 s` de lanzamiento pero `animT=0`. **Arreglo:** conservar un reloj independiente desde el disparo y usarlo al recuperar `throw`, o cancelar su animación al recibir daño, sin modificar el disparo.

- **P2 — `tests/game.cjs:80–114`: cobertura insuficiente de los contratos de integración.** Se verifica el tamaño del perro, pero ningún impacto contra él; los stubs tampoco registran `w/h/facing` ni las transformaciones del contexto, y todas las duraciones son `0,4`. Esto deja pasar el P1 y no comprueba anclas ni relojes con duraciones reales. **Arreglo:** añadir esos casos y comprobar llamadas y transformaciones con las dimensiones y duraciones de la API real.

`node tests/game.cjs` y los cuatro `node --check` pasan. Las coordenadas de fondo/mundo, anclas, cadáveres y fallback por globales ausentes están bien; no identifiqué regresiones importantes de rendimiento ni nuevos P0.
## Evaluación de Claude

| Hallazgo | Veredicto | Acción |
|---|---|---|
| P1 · Perros inmunes a piedras y escupitajos | **Aceptado.** Reproducido: la piedra sale en `player.y+23` (405..413) y el escupitajo en `GROUND-48` (392..400); el nuevo hitbox del perro empieza en 414. | Nueva función `hitsEnemy()` para los proyectiles aliados: usa la caja normal ampliada hacia arriba `hurtPad` (22 px en el perro, 0 en el resto). Así el perro conserva la caja de contacto baja 44×26 (se puede saltar), pero recibe impactos en la misma franja vertical de 48 px que antes. Dos tests nuevos: impacto de piedra y de escupitajo contra el perro. |
| P2 · `throw` desincronizado tras recibir daño | **Aceptado.** | `hit()` pone `player.throwT = 0`: el daño cancela la pose de lanzamiento. No afecta al disparo ni al cooldown. Test añadido. |
| P2 · Cobertura de tests de la integración | **Aceptado en parte.** | El stub registra ahora `w/h/facing`. Los tests comprueban el hitbox del perro (44×26 apoyado en y=440), el del capitán (72×96) y que `facing` sea ±1. **Rechazado:** verificar transformaciones de `ctx` y duraciones reales con stubs. El anclaje lo resuelve `art/sprites.js`, no `game.js`, y se valida visualmente con capturas en Chromium. Simular canvas en Node no aporta más que esas capturas. |

Codex no encontró regresiones de coordenadas, fallback ni rendimiento. `draw()` mide unos 1,5 ms/frame en Chromium headless.

Nota: un efecto del hitbox del perro que Codex no menciona es que los disparos del perro salen ahora desde `e.y+22 = 436`, a ras de suelo. Siguen golpeando al héroe de pie (382..440) y se esquivan saltando. No se cambia en esta fase: que un perro dispare balas es un problema de diseño ya cubierto por P1-5 de `REVISION-CLAUDE.md`.
