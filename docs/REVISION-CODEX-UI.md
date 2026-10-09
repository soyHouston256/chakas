# Revisión de Codex · Interfaz v2

Revisión de solo lectura con `codex exec --sandbox read-only` (Codex CLI 0.160.1) sobre
`git diff 6c2c183..HEAD`, con los mockups `*-v2.dc.html` y las capturas de 1440×900 y 390×844.
Abajo está la evaluación de Claude para cada hallazgo y, después, el informe original.

## Evaluación y cambios aplicados

| # | Hallazgo | Decisión | Cambio |
|---|----------|----------|--------|
| 1 | Sin `ui.js`, el título HTML tapa el canvas (regresión del fallback) | **Aceptado** | `ui.js` pone `body.has-ui`; sin esa clase se ocultan las capas HTML (HUD, pantallas, ruta, panel, botones `data-action`) y el canvas no se atenúa. Comprobado en el navegador bloqueando `ui.js`: HUD de canvas y tarjeta clásica. |
| 2 | Espacio sobre un botón enfocado salta mientras se juega | **Aceptado** | Enter/Espacio sobre un control activan solo ese control en todos los estados. El test que fijaba el salto se ha corregido. |
| 3 | Teclas mantenidas en el título llegan al juego | **Aceptado** | Fuera de `playing` ninguna tecla entra en `keys` (queda retenida hasta soltarla); al salir de `playing` (`pause`, derrota, victoria, mapa, título) las teclas pulsadas pasan a retenidas (`holdKeys`). Los toques solo cuentan jugando. Hay tests nuevos. |
| 4 | Los diálogos no son modales | **Aceptado (parcial)** | Pausa y derrota/victoria con `aria-modal="true"`; la cabecera queda `inert` mientras están abiertos; los botones táctiles salen del orden de tabulación (`tabindex=-1`, son de puntero). No hay trampa de Tab con JS: tras `inert` no quedan controles fuera del diálogo. Al reanudar, el foco se suelta (`blur`), porque el canvas no es enfocable a propósito. |
| 5 | En móvil no hay pausa táctil | **Aceptado** | Botón táctil «Pausa» (`uiAction('pause')`). |
| 6 | En móvil, el foco del mapa queda fuera de la vista | **Aceptado** | Al entrar al mapa, el foco va a la fila de la etapa elegida con `scrollIntoView({block:'nearest'})`. Enter (o un toque) sobre la fila ya elegida la juega, igual que el segundo toque en el canvas. Ahora la UI se sincroniza justo después de cada tecla del mapa, para que el foco siga a la selección sin esperar al siguiente frame. |
| 7 | En los menús móviles el canvas deja de ser 16:9 (`object-fit: cover`) | **Rechazado** | Es intencionado. En título, pausa y resultado, el canvas es solo fondo atenuado detrás de un panel más alto que 195 px; mientras se juega y en el mapa (donde importan las coordenadas del puntero) el canvas mantiene su caja 16:9 exacta. |
| 8 | «sí/no» y «Salir al título» sobre cochinilla: 4.39:1 | **Aceptado** | Crema sobre la fila actual (≈5.5:1). |
| 9 | Filas del mapa de 36 px | **Aceptado** | 44 px en todas las modalidades; se compactaron otros espaciados para que el panel quepa a 1440 px. |
| 10 | `prefers-reduced-motion` solo afecta al CSS | **Aceptado (parcial)** | Con movimiento reducido, `renderT` se congela fuera del juego (título, pausa, mapa: olas, pulsos y nubes decorativas). Jugando, las animaciones se mantienen porque comunican el estado del juego. |
| 11 | Los tests no cubren `ui.js` real | **Parcial** | Expectativa de Espacio corregida y añadidos tests de teclas retenidas, pausa táctil y «elegir de nuevo = jugar». La integración del DOM real (foco, visibilidad, tamaños) se verifica con el guion de Playwright (`ui/shots.js`, `ui/fallback.js` en el scratchpad), no en `npm test`: meter un DOM simulado completo sería frágil y añadiría dependencias a un proyecto que no tiene ninguna. |
| 12 | «Opciones» del título sustituido por «Sonido» | **Rechazado** | El sonido es la única opción del juego, así que un panel «Opciones» con un solo interruptor añadiría un paso sin aportar nada. Es una desviación documentada; si se añaden más opciones, se reintroduce. |

Verificación tras los cambios: `npm test` pasa, las capturas `ui-*-desktop.png`/`ui-*-mobile.png` se rehicieron, no hay errores de consola ni scroll horizontal (390 px) y el fallback sin `ui.js` funciona.

## Informe original de Codex

Revisión de `git diff 6c2c183..HEAD`, sin modificar archivos. **No encontré P0; sí varios P1 que conviene corregir antes de aprobar.** `npm test` pasa.

1. **P1 — El fallback sin `ui.js` queda tapado por el título HTML.**  
   [game.js:1485](/Users/maxhoustonramirezmartel/code/project/chankas/game.js:1485), [style.css:390](/Users/maxhoustonramirezmartel/code/project/chankas/style.css:390).  
   Sin `ui.js`, nadie actualiza `stage.dataset.state`, que permanece en `menu`. Aunque `#start` abra el mapa o comience la partida, `.title-screen` sigue visible sobre el canvas; sus botones tampoco tienen handlers. El HUD HTML permanece vacío o desactualizado. Es una regresión respecto a `6c2c183`.  
   **Arreglo:** habilitar las capas HTML mediante una clase puesta por `UI.init`; en fallback, ocultarlas y conservar únicamente canvas, overlay clásico y controles funcionales.

2. **P1 — Espacio sobre un botón enfocado se convierte en salto durante `playing`.**  
   [game.js:319](/Users/maxhoustonramirezmartel/code/project/chankas/game.js:319), [game.js:338](/Users/maxhoustonramirezmartel/code/project/chankas/game.js:338).  
   La protección de controles solo existe fuera de `playing`. Al enfocar «Sonido» con Tab y pulsar Espacio, se cancela la activación nativa y se añade `Space` a `keys`. Lo reproduje: `preventDefault=true` y `player.vy=-490`.  
   **Arreglo:** dar prioridad a Enter/Espacio sobre controles en todos los estados, antes de gestionar las teclas del juego.

3. **P1 — El inicio directo permite que teclas retenidas del título lleguen al juego.**  
   [game.js:345](/Users/maxhoustonramirezmartel/code/project/chankas/game.js:345), [game.js:1435](/Users/maxhoustonramirezmartel/code/project/chankas/game.js:1435).  
   Las teclas no consumidas por el menú entran en `keys`. Mantener J en el título y hacer clic en «Comenzar expedición» inicia disparando: reproduje `ammo=23`, `shots.length=1`. La nueva ruta llama directamente a `reset()`, evitando el `keys.clear()` de `openMap()`.  
   **Arreglo:** aceptar entradas de juego únicamente en `playing` y bloquear hasta `keyup` las teclas retenidas al cambiar de pantalla.

4. **P1 — Los diálogos permiten sacar el foco y activar acciones del fondo.**  
   [index.html:127](/Users/maxhoustonramirezmartel/code/project/chankas/index.html:127), [index.html:197](/Users/maxhoustonramirezmartel/code/project/chankas/index.html:197), [ui.js:175](/Users/maxhoustonramirezmartel/code/project/chankas/ui.js:175).  
   Pausa y resultados tienen `role="dialog"`, pero no delimitan la navegación con Tab ni vuelven inerte el fondo. El usuario puede llegar a la cabecera y activar «Mapa», abandonando la pantalla mediante una acción exterior. Al reanudar, se hace `blur()` en lugar de enfocar una superficie de juego identificable.  
   **Arreglo:** implementar diálogos modales con `aria-modal`, fondo `inert`, contención de Tab y destino explícito del foco al cerrarlos.

5. **P1 — En móvil falta una acción táctil para pausar.**  
   [index.html:236](/Users/maxhoustonramirezmartel/code/project/chankas/index.html:236).  
   Los controles incluyen movimiento, salto, armas y recarga, pero ninguna pausa. P/Esc requieren teclado; «Mapa del camino» cambia de estado y abandona la partida en curso.  
   **Arreglo:** añadir un botón visible de pausa, de al menos 44×44 px, conectado a una acción de pausa del juego.

6. **P2 — El foco automático del mapa puede quedar fuera de pantalla a 390 px.**  
   [ui.js:167](/Users/maxhoustonramirezmartel/code/project/chankas/ui.js:167), [ui.js:184](/Users/maxhoustonramirezmartel/code/project/chankas/ui.js:184).  
   Entrar al mapa enfoca `mpPlay` con `preventScroll:true`. En móvil, ese botón está debajo del canvas, las cinco etapas y los textos históricos: puede recibir foco sin quedar visible.  
   **Arreglo:** enfocar la etapa seleccionada y desplazarla a la vista cuando sea necesario, o permitir el desplazamiento al botón principal.

7. **P2 — El canvas deja de ocupar una caja 16:9 en los menús móviles.**  
   [style.css:364](/Users/maxhoustonramirezmartel/code/project/chankas/style.css:364).  
   `height:100%` estira la caja del canvas hasta la altura que impone la pantalla superpuesta. Las capturas de título y pausa móvil muestran un escenario vertical; `object-fit:cover` recorta el contenido. `aspect-ratio` no conserva la proporción cuando ambas dimensiones quedan determinadas.  
   **Arreglo:** mantener el canvas con `height:auto` y separar el crecimiento de los paneles móviles de su caja 16:9.

8. **P2 — Algunos textos seleccionados no alcanzan 4.5:1.**  
   [style.css:430](/Users/maxhoustonramirezmartel/code/project/chankas/style.css:430), [style.css:435](/Users/maxhoustonramirezmartel/code/project/chankas/style.css:435).  
   El valor «sí/no» conserva `#DCCFB4` sobre el fondo seleccionado `#A8301F`: **4.39:1**. «Salir al título» seleccionado en pausa presenta la misma combinación, con texto de 18 px.  
   **Arreglo:** usar `#F2E6CC` para esos textos cuando la fila esté seleccionada; da aproximadamente **5.46:1**.

9. **P2 — Las filas del mapa bajan de los 44 px solicitados.**  
   [style.css:840](/Users/maxhoustonramirezmartel/code/project/chankas/style.css:840).  
   En escritorio con puntero fino se reduce `min-height` a 36 px. Además, `pointer:fine` no descarta que exista una pantalla táctil como entrada secundaria.  
   **Arreglo:** conservar 44 px en todas las modalidades.

10. **P2 — `prefers-reduced-motion` solo afecta al CSS.**  
    [style.css:1076](/Users/maxhoustonramirezmartel/code/project/chankas/style.css:1076), [game.js:1472](/Users/maxhoustonramirezmartel/code/project/chankas/game.js:1472).  
    La regla elimina transiciones CSS, pero el tiempo de render continúa avanzando y alimenta las animaciones decorativas del escenario y del mapa, incluso en menús.  
    **Arreglo:** consultar `matchMedia` desde JS y reducir las animaciones decorativas, conservando las señales necesarias para jugar.

11. **P2 — Los tests omiten la implementación real de la interfaz y fijan una conducta incorrecta.**  
    [tests/game.cjs:601](/Users/maxhoustonramirezmartel/code/project/chankas/tests/game.cjs:601), [tests/game.cjs:649](/Users/maxhoustonramirezmartel/code/project/chankas/tests/game.cjs:649).  
    `UISTUB` sustituye completamente a `ui.js`; no se comprueban foco, visibilidad, eventos nativos, responsive ni escrituras del DOM. El test de Espacio sobre un botón durante `playing` exige que salte, contradiciendo el requisito de activar solo ese botón. Los tests de fallback tampoco cargan el HTML/CSS actual.  
    **Arreglo:** corregir esa expectativa y añadir pruebas de integración con `ui.js` real para teclado, diálogos, fallback y ambos tamaños. Medir también que sincronizar una vista idéntica no produzca mutaciones.

12. **P2 — El título cambia una opción del diseño sin implementar su destino.**  
    [index.html:114](/Users/maxhoustonramirezmartel/code/project/chankas/index.html:114).  
    `Titulo-v2` muestra «Opciones»; la implementación la sustituye por «Sonido». Es una diferencia funcional y textual concreta respecto al mockup.  
    **Arreglo:** implementar «Opciones» con su panel correspondiente o actualizar el diseño acordado.

La tipografía, paleta, tejido, HUD, inventario de pausa y panel del mapa mantienen una fidelidad general buena. No traté los valores simulados ni las imágenes `/_blob` como discrepancias. Las capturas no muestran desbordamiento horizontal evidente.

El HUD usa correctamente `put()` para evitar escrituras cuando los valores no cambian; no encontré layout thrash por frame. Las pruebas existentes cubren bien varias reglas del juego y las nuevas alforjas, aunque no sustituyen la integración del DOM.

**Límite de verificación:** la herramienta de navegador rechazó la ejecución porque exige aprobación y la política de esta sesión la prohíbe. La revisión visual se apoya en las capturas proporcionadas; las reproducciones de teclado se ejecutaron con los handlers reales en el harness de tests.