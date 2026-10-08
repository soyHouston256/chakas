# Revisión de Claude para Codex · prototipo v0.1

**Estado:** jugable de principio a fin (inicio → 8 enemigos → capitán → victoria/derrota). Base sólida para iterar. Hay 3 bugs reales de lógica y varios huecos frente al MVP de `data.txt`. No modifiqué ningún archivo: solo creé este documento.

## Resultados de verificación (2026-10-07)

- `npm test` → `OK: inicio, munición, fuego, recarga, salto, pausa, derrota y victoria.`
- `node --check game.js` → sin errores.
- `python3 -m http.server` (puerto 5391) → `index.html`, `game.js` (9248 B) y `style.css` responden 200.
- Sonda propia en `vm` (mismo arnés que `tests/game.cjs`) que confirmó los bugs P0-1, P0-2 y P1-1 de abajo.

Nota: las líneas de `game.js` miden hasta ~1000 caracteres; cito `archivo:línea` y el fragmento concreto.

---

## P0 · Bloqueantes (bugs confirmados)

- [ ] **P0-1 · La victoria puede convertirse en derrota en el mismo frame.** `game.js:17` `hit()` no comprueba `state`, y `game.js:22` sigue procesando disparos después de `state='won'`. Reproducido: si el jefe muere y una bala enemiga alcanza al jugador con 1 de vida en el mismo `update`, el estado final es `lost`. Lo mismo ocurre a la inversa (derrota → victoria).
  *Arreglo:* al inicio de `hit()` usar `if(state!=='playing'||player.inv>0)return;`, y en los bucles de `update` usar `if(state!=='playing')return;` tras cada cambio de estado. Añadir este caso a `tests/game.cjs`.

- [ ] **P0-2 · Disparan enemigos que no se ven.** `game.js:21` dispara si `Math.abs(e.x-player.x)<650`, pero la cámara deja solo 280 px a la izquierda del jugador (`game.js:23`, `cam=player.x-280`). Reproducido: con un enemigo en x=900 y el jugador en 1500 (`cam=1220`), el enemigo dispara desde fuera de la pantalla. Los perseguidores (`type 0`) que dejas atrás te siguen y disparan sin aparecer en pantalla.
  *Arreglo:* disparar solo si `e.x+e.w>cam && e.x<cam+W`. Activar la IA según la cámara y no según `|dx|<850`.

- [ ] **P0-3 · Los checkpoints no existen en la práctica.** `game.js:20` guarda `world.checkpoint=player.x` al recargar, pero nunca se lee. Al morir, `hit()` (`game.js:17`) manda al menú, y el botón ejecuta `reset()` completo (`game.js:11`). Con un nivel de 4200 px y un jefe de 32 PV, morir ante el capitán obliga a repetir todo. `data.txt:80` pide que los montones sean checkpoints.
  *Arreglo:* separar `resetRun()` (vida, posición en `world.checkpoint`, manta llena, se mantienen los enemigos muertos y la puntuación) de `newGame()`. Ofrecer «Continuar desde el montón» y «Empezar de nuevo» en la pantalla de derrota.

## P1 · Importantes

- [ ] **P1-1 · La llama escupe en dirección contraria.** `game.js:21` usa `vx:dir*-400`, donde `dir` es la dirección enemigo→jugador, no llama→enemigo. Reproducido: con la llama en 920, el enemigo en 960 y el jugador en 1000, `vx=-400`. Falla con cualquier enemigo situado entre la llama y el héroe.
  *Arreglo:* `vx:Math.sign(e.x-world.llama)*400`.

- [ ] **P1-2 · El jefe es casi imposible de esquivar.** En `game.js:21`, el capitán dispara cada 0,85 s dos balas a la vez, en `y+22` (366) y `y+55` (399). La de 399 golpea al héroe de pie. La de 366 golpea en casi todo el salto: solo se libra con `player.y` entre 278 y 308, unos 0,44 s en el ápice. Como no hay agacharse, el combate se reduce a intercambiar golpes.
  *Arreglo:* alternar patrones (alto y bajo, nunca juntos), dejar un hueco legible de ≥0,6 s y anunciar cada ataque con 0,3 s de preparación (parpadeo o pose). Añadir fases con el 50 % de vida.

- [ ] **P1-3 · El daño por contacto no empuja al jugador.** `game.js:21` llama a `hit()` si hay solapamiento, pero los `type 0` y el jefe se pegan a `player.x` y quitan vida cada 1,5 s hasta que saltas.
  *Arreglo:* en `hit()` aplicar `player.vy=-250` y un empuje horizontal contrario al atacante. Los enemigos no deben avanzar mientras solapan con el jugador.

- [ ] **P1-4 · Una manta vacía no deja ninguna salida.** Con `ammo=0` y `fire=0` solo queda caminar hacia atrás (`game.js:18`). El último montón está en 3200 (`game.js:6`) y el jefe en 3910 con 32 PV, más que la manta llena (24). Hoy no bloquea la partida porque el jefe te sigue, pero frustra. *Arreglo (elegir uno):* un golpe cuerpo a cuerpo de 1 de daño sin munición (macana, ya prevista en `data.txt:13`), una regeneración lenta de 1 piedra cada 3 s hasta 6, o un montón en la arena del jefe (~3700).

- [ ] **P1-5 · Faltan cosas del MVP de `data.txt` (líneas 49-54, 137-148).**
  - Solo hay **1 arma secundaria** (incendiaria). Falta la **boleadora**, por ejemplo para inmovilizar 2 s o derribar al jinete.
  - Los enemigos **no salen volando** fuera de pantalla (`data.txt:148`) y desaparecen con `burst` (`game.js:22`). *Arreglo:* `e.dying=true; e.vx=±300; e.vy=-400; e.spin`. Retirarlos al salir de la pantalla y no contarlos en las colisiones.
  - **3 tipos sin lectura visual:** `person()` (`game.js:26`) dibuja a todos igual y solo cambia el largo del arma (8 o 24 px). Para leerlos por silueta: perseguidor con pica, tirador con arcabuz y fogonazo, patrulla con escudo. Considerar el perro (alano) de `data.txt:146`.
  - **Paleta:** los enemigos usan gris azulado (`#6f8589`, `#53676c`), casi el mismo tono que las montañas (`#456a71`, `#65817a`, `game.js:27`). `data.txt:123-127` pide acero, negro y rojo oscuro. *Arreglo:* `#9aa3a8` (acero), `#1c1b1d` (negro), `#7a1f22` (rojo oscuro) y un contorno de 1 px.
  - **Quipu:** hoy es solo el texto `QUIPU n` (`game.js:31`). Dibujar un cordón con nudos: uno pequeño cada 100 puntos y uno grande cada 1000.
  - El jefe es un «capitán» genérico a pie. El MVP pide jinete. Que siga siendo ficticio está bien (decisión en COORDINACION.md), pero conviene darle caballo o silueta propia.

## P2 · Mejoras de sensación de juego y salud del código

- [ ] **P2-1 · Respuesta a los impactos.** Al recibir daño, el enemigo no parpadea (`game.js:22`). Añadir `e.flash=.08` y dibujarlo en blanco, un *hitstop* de 40-60 ms al matar y un temblor de cámara (`shake=6` al recibir daño o ante el jefe, `shake*=.85`). Mostrar un número de quipu «+100» flotante.
- [ ] **P2-2 · Las plataformas parecen sólidas pero se atraviesan.** `game.js:28` dibuja columnas hasta el suelo, pero solo colisiona la parte superior (`game.js:20`). Dibujarlas como andenes flotantes o hacer los laterales sólidos.
- [ ] **P2-3 · Hitbox del jefe.** `w:72` (`game.js:9`) frente a unos 51 px dibujados (`scale 1.5`, `game.js:26`). Ajustar `w≈52` o dibujarlo con el ancho real.
- [ ] **P2-4 · Foco y teclado.** Tras pulsar «Sonido», el botón conserva el foco, y Espacio/Enter pueden activarlo durante la partida. Usar `e.currentTarget.blur()` en los `onclick` (`game.js:11-12`). Permitir empezar o reiniciar con Enter. En macOS, `keyup` no llega si Cmd está pulsado: limpiar `keys` en `visibilitychange` y en `keydown` con `metaKey`.
- [ ] **P2-5 · Móvil.** No hay botón de pausa táctil (`index.html`, `.touch`). Añadir `data-key="KeyP"` o un botón dedicado (ojo: `pause()` se dispara por `keydown`, no por `keys`).
- [ ] **P2-6 · Tiempo delta.** El tope `dt≤.033` (`game.js:32`) ralentiza el juego por debajo de 30 fps. La integración semiimplícita cambia ligeramente la altura del salto según los fps. Para la migración conviene un paso fijo de 1/60 con acumulador.
- [ ] **P2-7 · Fuentes.** `style.css` pide 'DM Sans' y 'Space Grotesk' pero no se cargan. Añadir el `<link>` de Google Fonts o quitarlas.

### Salud del código (pensando en Phaser/TS)

- [ ] **P2-8 · Formato.** `game.js` tiene 32 líneas y algunas superan 1000 caracteres. Los diffs y las revisiones son casi ilegibles. Pasarlo por Prettier (o formatearlo a mano) **antes** de seguir añadiendo funciones.
- [ ] **P2-9 · Datos fuera de la lógica.** Mover `piles`, `platforms`, los spawns de `reset()` y los números mágicos (230, 510, 1250, 620, cooldowns) a un objeto `LEVEL`/`TUNING`. Esa estructura se traslada tal cual a un JSON o Tiled para Phaser.
- [ ] **P2-10 · Separar módulos.** Separar input → simulación (`update`, pura, sin DOM) → render (`draw`) → UI (`show`). Hoy `hit()` y `update()` llaman a `show()` (DOM) desde la simulación. Conviene emitir eventos (`onWin`, `onLose`) en su lugar. Así los tests no necesitan simular el DOM.
- [ ] **P2-11 · Tipos de entidad.** `type:0..3` son números mágicos. Usar `kind:'chaser'|'shooter'|'patrol'|'boss'` con una tabla de comportamiento, que equivale a los futuros `class Enemy extends Phaser.GameObjects.Sprite`.
- [ ] **P2-12 · Ampliar los tests.** Añadir casos para P0-1 (victoria y daño en el mismo frame), P0-2 (no disparar fuera de cámara), P1-1 (dirección del escupitajo), checkpoint tras morir y `reset()` restaurando `world.checkpoint` y `fire`.

## Orden sugerido

1. P2-8 (formatear), para que el resto sea revisable.
2. P0-1, P0-2, P1-1 y P1-3: cambios pequeños, con un test cada uno.
3. P0-3 (checkpoints) y P1-2 (patrones del jefe).
4. P1-5 (enemigos que salen volando, paleta, siluetas, boleadora, quipu) y P2-1 (sensación de juego).
