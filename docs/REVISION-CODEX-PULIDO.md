# Revisión de Codex — lote de pulido (mapa móvil, cartela, héroe, piquero, arena, aviso del jefe)

Revisión de `git diff 4971e6b..HEAD` con `codex exec --sandbox read-only` (solo lectura).
Abajo, el texto íntegro de Codex y, después, la evaluación de cada hallazgo.

## Texto de Codex

1. **Alta — `game.js:59` (interacción con `game.js:624` y `game.js:705`): la apacheta permite derrotar al jefe con boleadoras infinitas.**  
   Mantener **E** repone piedras y boleadoras cada fotograma, sin consumir cargas ni exigir soltar la tecla. La nueva apacheta queda dentro del alcance de las boleadoras cuando el capitán se acerca; cada impacto lo aturde durante 0,7 s y cancela su preparación, mientras lanzar otra tarda 0,5 s. Reproduje la victoria permaneciendo en `x=3500`, manteniendo únicamente **E+L**, con los soldados anteriores eliminados: terminó con **5 corazones, 24 piedras y 3 boleadoras**, sin esquivar. La recuperación al 60 % al reaparecer no limita este abuso durante una misma vida.  
   **Arreglo sugerido:** limitar la recarga de la apacheta de arena por intento, o bloquearla mientras el jefe esté activo. Añadir una prueba que impida encadenar boleadoras indefinidamente desde ese punto.

2. **Media — `game.js:771` y `game.js:789`: la alerta del perro no espera los 0,7 s previstos antes de perseguir.**  
   `DOG.notice` se guarda en `e.cool`, pero el movimiento empieza cuando `e.cool < DOG.cool - 0.45`, es decir, **0,85 s**. Si el cooldown anterior ya se agotó mientras el perro esperaba, el nuevo valor de 0,7 cumple esa condición inmediatamente. Reproduje que, tras activarse, pasa de `x=620` a `x≈618,83` en el siguiente fotograma, con **0,683 s de alerta todavía pendientes**. Incluso el primer perro con cooldown inicial de 1 s espera mucho menos que los 0,7 s anunciados.  
   **Arreglo sugerido:** representar la alerta con un temporizador separado y retornar mientras siga activo. Probar que la posición permanece fija durante toda la alerta, tanto al inicio como después de esperar fuera de su alcance de activación.

3. **Media — `tests/game.cjs:897` y `tests/game.cjs:900`: la prueba de integración del mapa pasa aunque el mapa real no se dibuje.**  
   `realMap()` crea un contexto sin `document` ni `OffscreenCanvas`; por ello, `RM.draw()` devuelve `false` cuando intenta preparar los lienzos. El adaptador de la prueba descarta ese resultado y devuelve siempre `true`. Además, fuerza `stageW` directamente: no ejercita el `ResizeObserver`, y el rectángulo CSS simulado ya tiene exactamente la proporción esperada. Estas pruebas verifican coordenadas y atributos, pero no detectan fallos de preparación, dibujo ni integración entre CSS, observador y tamaño del canvas.  
   **Arreglo sugerido:** proporcionar lienzos funcionales al módulo y comprobar el resultado de `draw()`. Añadir una prueba en navegador que cambie el ancho real del escenario, espere al observador, toque iconos y rótulos, y compruebe el regreso a 960×540 al jugar.

**Resumen:** `node tests/game.cjs` pasa. El problema principal es la recarga ilimitada durante el combate del jefe; también falla la espera de alerta del perro. No encontré crecimiento ilimitado en las cachés usadas por estos cambios, y los avisos nuevos del jefe y del piquero eliminan su parpadeo con movimiento reducido. La cobertura del mapa necesita ejercitar el dibujo y el layout reales.

## Evaluación y decisiones

| # | Hallazgo | Decisión | Cambio |
|---|----------|----------|--------|
| 1 | Apacheta de la arena: mantener E daba piedras y boleadoras infinitas (bloqueo por aturdimiento del jefe). | **Aceptado.** Es real: la recarga continua al mantener E, sumada al aturdimiento de 0,7 s, trivializaba al jefe. | Con el capitán vivo, la apacheta de la arena recarga **una vez por vida** y solo con pulsación nueva de E (`ARENA_RELOADS`, `world.arenaReloads`, se repone al reaparecer). El aviso «E · RECARGAR» se oculta cuando ya no queda recarga. Prueba: mantener E+L no repone boleadoras. Las demás apachetas no cambian. |
| 2 | La alerta del perro (0,7 s) se guardaba en `cool`, y el movimiento empezaba antes de terminar. | **Aceptado.** | Temporizador propio `e.alert`: durante la alerta el perro mira al héroe sin moverse ni atacar; se reinicia al reaparecer. Prueba: la posición no cambia durante la alerta aunque `cool` fuera 0. El primer perro sigue costando como mucho 1 corazón al caminar sin disparar. |
| 3 | La prueba de integración del mapa vertical no dibujaba de verdad (sin lienzos) ni ejercitaba el `ResizeObserver`/CSS. | **Aceptado en parte.** | `tests/game.cjs` carga `art/map.js` con lienzos falsos funcionales: `prepare()` y `draw()` devuelven `true` en ambos encuadres, `stageAt` usa la vista del último dibujo, `buttonAt` es falso en vertical, y el juego con interfaz usa ese módulo real para el toque (icono y rótulo). El observador y la CSS reales se comprueban en el navegador (Playwright, `polish.js`): a 390×844 el canvas pasa a 780×1040 con proporción 3:4, un toque real sobre «Ciudad de los Reyes» la selecciona y, al jugar, vuelve a 960×540 (16:9). No se añade un navegador a `npm test` (el proyecto no tiene dependencias); se deja en el script de capturas. |

Pruebas: `npm test` pasa. Capturas sin errores de consola; `draw()` ≈0,3 ms/fotograma de media (p95 ≤0,7 ms) y `drawMap()` ≈0,13 ms.
