# Revisión de Codex · Interfaz «arte clave», ruta I–V, pantalla completa y móvil

Comando: `codex exec --sandbox read-only -C <proyecto> "<prompt en español>" < /dev/null`
Alcance: `git diff HEAD` (incluye trabajo previo del usuario: dificultades, competencia, API, nginx;
y cambios de otro agente en `art/sprites.js` / `art/background.js`). Foco pedido: rediseño de la UI
según `keyart-ref.png` y `keyart-mobile-ref.png`, ruta nueva, pantalla completa, PWA, metadatos,
build-dist/CSP, accesibilidad, responsive, rendimiento, pruebas e historia.

## Evaluación de los hallazgos

| # | Prio | Hallazgo | Decisión |
|---|------|----------|----------|
| 1 | P1 | Modales sin aislar el HUD/mandos; el aviso de giro no era enfocable | **Aceptado.** `ui.js` `setInert()`: con pausa, derrota/victoria o «Gira tu teléfono», quedan inertes el resto de la página, la franja, el HUD, la barra de controles y la cruceta (y todo `#play` durante el aviso de giro). `#rotate-screen` lleva `tabindex="-1"` y recibe el foco. No se añadió una trampa de Tab propia: con `inert` el foco ya no puede ir a contenido de la página. |
| 2 | P1 | Mandos táctiles inaccesibles para lectores de pantalla | **Aceptado en parte.** Un `click` sin puntero (`detail === 0`, activación de VoiceOver/TalkBack) en Huaraca/Fuego/Bola elige el arma. Mover/saltar/disparar en tiempo real siguen siendo de puntero o teclado (todas las acciones tienen tecla: A/D, Espacio, J/K/L, H, E, P, F); hacer la cruceta «accionable» por AT no aporta una forma jugable. |
| 3 | P1 | Una pausa por giro + suspensión explícita podía reanudarse sola al volver a horizontal | **Aceptado.** `uiAction('suspend')` retira la autorización (`rotateHeld = false`) si la pausa venía del giro. Prueba añadida (giro → suspensión → horizontal = sigue en pausa). |
| 4 | P1 | El servidor confía en las métricas del cliente | **No corregido aquí (trabajo previo del usuario, fuera del alcance de la UI).** Se deja anotado para el usuario. |
| 5 | P1 | Límite de peticiones por IP del proxy detrás de nginx | **No corregido aquí (trabajo previo del usuario).** Anotado. |
| 6 | P2 | `img-src` incluye `data:` (tejidos tocapu en CSS) | **Rechazado.** `data:` ya estaba en la CSP de HEAD; el arte clave, iconos y manifiesto se sirven desde `'self'`. Externalizar los tejidos es un cambio independiente. |
| 7 | P2 | En 844×390 la cruceta y el disparo quedan en los márgenes, no sobre la escena | **Rechazado (decisión deliberada).** El lienzo se mantiene 16:9 sin recorte (el suelo y los enemigos no se tapan); los mandos ocupan los márgenes laterales libres y, cuando no hay margen (pantalla completa), se superponen a la escena. La fila de armas sí va sobre el juego, como en la referencia. |
| 8 | P2 | La cruceta soltaba teclas compartidas por dos dedos; faltaba `lostpointercapture` | **Aceptado.** `bindPad` calcula la unión de teclas de todos los dedos antes de soltar y limpia con `lostpointercapture`. |
| 9 | P2 | `npm test` no ejecuta las pruebas de competencia/servidor; no hay pruebas de navegador | **Rechazado en parte.** Las suites `tests/competition.cjs` y `tests/server-rules.cjs` son trabajo del usuario y `server/` no entra en la imagen Docker (romperían el build); se ejecutaron aparte (9/9). Las comprobaciones de navegador se hicieron con Playwright contra `dist/` con la CSP de producción (capturas y cero errores). El `EPERM` que vio Codex viene de su sandbox de solo lectura (no puede crear el directorio temporal), no del proyecto. |
| 10 | P2 | Cronología: «1536» fijo para una ruta hasta 1539; El Callao vuelve a 1536 | **Aceptado.** Título «HISTORIA ALTERNATIVA · DESDE 1536», cartela del mapa «1536–1539», manifiesto/description «desde 1536»; El Callao tiene año **«Ficción»**. Se suavizó la frase absoluta: ahora dice que Quizo Yupanqui atacó Lima en 1536 y que la marcha al mar y la quema de barcos **no ocurrieron**. |

Verificación tras los cambios: `npm test` OK; `node tests/competition.cjs` y `node tests/server-rules.cjs` OK;
`node scripts/build-dist.cjs` → 17 archivos (assets + manifiesto, sin data.txt ni docs); capturas
1440×900, 844×390 (táctil), 390×844 sin errores de consola ni de CSP (solo los 503 esperados de `/api`
sin servidor).

## Informe original de Codex

No encontré un P0. Sí hay problemas P1 de accesibilidad, pausa automática y API. No modifiqué archivos. La evaluación visual se basa en las capturas proporcionadas; no certifica el comportamiento real en Safari/iPhone ni la ausencia de overflow mediante mediciones del navegador.

1. **P1 — Modales sin aislamiento completo ni contención del foco.**  
   **`ui.js:177–206`, `index.html:293`**. Pausa y resultado vuelven inertes los elementos externos y la franja, pero dejan disponibles elementos dentro del juego, como los botones del HUD. Tab puede salir del diálogo. Además, `focusQuiet(el.rotate)` no funciona porque `#rotate-screen` no es enfocable; el menú de pausa permanece accesible detrás del aviso.  
   **Corrección:** aislar todos los hermanos del modal activo, añadir `tabindex="-1"` al aviso, contener Tab/Shift+Tab y restaurar el foco al cerrar. Gestionar el aviso de giro como el único modal activo.

2. **P1 — Los controles táctiles no funcionan con activación de lectores de pantalla.**  
   **`game.js:600–650`, `index.html:249–269`**. Movimiento, armas y disparo dependen exclusivamente de eventos de puntero. Una activación mediante VoiceOver/TalkBack genera `click`, sin ejecutar esos manejadores. La cruceta es un `div` sin acciones accesibles y los botones tienen `tabindex="-1"`.  
   **Corrección:** ofrecer botones semánticos para cada dirección y una ruta de activación por teclado/`click`, evitando duplicar la acción del puntero. Mantener nombres y estado de selección accesibles.

3. **P1 — La pausa por giro puede reanudar una partida suspendida por otra causa.**  
   **`game.js:2323–2330`, `game.js:2415–2418`, `ui.js:425–430`**. Si el giro ya pausó la partida, `suspend` no registra una nueva causa porque el estado es `paused`. Al volver a horizontal, `rotateHeld` sigue autorizando la reanudación, aunque se haya ocultado la pestaña o salido de pantalla completa.  
   **Corrección:** registrar las causas de pausa; una suspensión explícita debe retirar la autorización de reanudación automática. Añadir pruebas combinando giro, visibilidad y salida de fullscreen.

4. **P1 — La clasificación acepta victorias y métricas inventadas. Trabajo previo de API.**  
   **`server/rules.cjs:8–21`, `server/index.cjs:44–58`**. El servidor calcula el puntaje, pero confía en `completed`, bajas, precisión, muertes y objetivo opcional enviados por el cliente. Basta iniciar una partida y enviar métricas dentro de los límites para obtener clasificación y XP sin jugar.  
   **Corrección:** validar una simulación/replay determinista o evidencia de partida en servidor. Mientras tanto, presentar el ranking como resultados declarados por el cliente y limitar recompensas repetidas.

5. **P1 — El límite de solicitudes agrupa a los jugadores detrás de nginx. Trabajo previo de API.**  
   **`server/index.cjs:24–27`, `deploy/nginx/templates/default.conf.template:19–23`**. El servidor limita por `req.socket.remoteAddress`, que detrás de nginx corresponde al proxy. Los usuarios comparten los 120 requests/minuto; las consultas automáticas pueden provocar 429 para todos.  
   **Corrección:** aplicar el límite por cliente en nginx o utilizar la IP reenviada exclusivamente desde proxies de confianza, junto con límites por sesión.

6. **P2 — La implementación incumple el requisito estricto `img-src 'self'`.**  
   **`deploy/nginx/templates/security-headers.inc.template:5`, `style.css:30–32`**. La CSP permite `data:` y los tejidos CSS usan imágenes SVG mediante ese esquema. Eliminar solamente `data:` rompería esos adornos.  
   **Corrección:** externalizar los tres SVG, incluirlos en la distribución y dejar `img-src 'self'`. No encontré scripts ni estilos declarados en línea en `index.html`; las asignaciones individuales mediante CSSOM no equivalen a añadir `unsafe-inline`.

7. **P2 — En móvil horizontal los mandos quedan fuera del escenario de la referencia.**  
   **`style.css:417`, `style.css:1130–1154`, `index.html:261`**. En la captura 844×390, el escenario ocupa aproximadamente 560 px y la cruceta/disparo aparecen sobre los márgenes negros. `.pad` está anclado a `.play`, mientras `.stage` se estrecha según la altura. La referencia coloca los mandos sobre la escena.  
   **Corrección:** compartir un mismo contenedor y dimensiones para canvas, HUD y mandos; ajustar el encuadre táctil para aprovechar el ancho disponible.

8. **P2 — La cruceta pierde teclas compartidas y no limpia la captura perdida.**  
   **`game.js:614–640`**. Al levantar un dedo se elimina su tecla del `Set` global aunque otro dedo siga aportándola. Tampoco existe un manejador `lostpointercapture`, a diferencia de `holdControl`.  
   **Corrección:** calcular la unión de las aportaciones activas antes de actualizar las teclas y limpiar todos los punteros al perder captura o abandonar `playing`.

9. **P2 — La batería principal no ejecuta las nuevas pruebas ni prueba la interfaz real.**  
   **`package.json:8`, `Dockerfile:16`, `tests/game.cjs:1239–1286`**. `npm test` solo ejecuta `tests/game.cjs`; competencia y reglas del servidor quedan fuera del comando y del build Docker. Las comprobaciones nuevas usan stubs y expresiones regulares: no detectan foco, activación accesible, fullscreen, contraste u overflow.  
   **Corrección:** integrar ambas suites y añadir pruebas de navegador para los tres tamaños solicitados, modales, controles y fullscreen rechazado/prefijado.

10. **P2 — La presentación cronológica sigue diciendo “1536” para una ruta hasta 1539.**  
    **`index.html:8`, `index.html:93`, `manifest.webmanifest:4`, `art/map.js:82`, `art/map.js:133`**. Las etapas avanzan a 1537 y 1539, pero la presentación general fija 1536. El epílogo del Callao vuelve a 1536 sin explicitar el salto temporal.  
    **Corrección:** presentar “1536–1539” o “desde 1536” y etiquetar El Callao como epílogo ficticio con fecha ficticia o sin fecha.

Las capturas mantienen bien la estructura del arte clave: corazones, inventario, etapa, barra de acciones y ruta. La fidelidad es parcial en ornamentación, logo e iconos; el título sí utiliza el arte solicitado. El WebP pesa unos **89 KiB** y la imagen social unos **200 KiB**, tamaños razonables. `put()` evita escrituras redundantes y `COARSE` reutiliza `matchMedia`; no observé un problema grave de escrituras por fotograma. Los botones convencionales principales declaran mínimos de 44 px, pero eso no resuelve la accesibilidad de la cruceta.

La ruta histórica resulta coherente en sus hechos centrales: [Sacsayhuamán y Juan Pizarro](https://elperuano.pe/noticia/77106-frustrada-reconquista-del-tawantinsuyo-i), [Ollantaytambo en enero de 1537](https://www.canalipe.gob.pe/noticias/television/el-valiente-manco-inca-y-lucha-por-libertad) y [Vitcos → Espíritu Pampa, con resistencia hasta 1572](https://qhapaqnan.cultura.pe/sites/default/files/mi/archivo/RutasAncestrales.pdf). El mapa distingue expresamente La Convención como denominación actual y El Callao como ficción. Conviene evitar la afirmación absoluta «ningún ejército inca llegó a la costa»: basta afirmar que la marcha y quema de barcos representadas no ocurrieron.

**Pruebas:** las nueve pruebas de competencia y reglas del servidor pasaron al ejecutarlas directamente. `npm test` terminó con `EPERM` al intentar crear el directorio temporal de empaquetado (`tests/game.cjs:1291`); por tanto, no puedo dar por verificados el build completo ni la imagen Docker.
