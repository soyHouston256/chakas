# Revisión de Codex · mapa de misiones (diff 0158576..b23b686)

Generado con `codex exec --sandbox read-only` (OpenAI Codex CLI 0.160.1). Salida literal abajo; evaluación de Claude y estado de cada hallazgo al final.

## Salida de Codex

Ejecuté `git diff 0158576..HEAD` y `npm test`: las pruebas pasan. No modifiqué archivos. No encontré P0.

1. **P1 — `game.js:277–282`: la tecla de inicio se filtra al nivel mediante repetición.**  
   **Reproducir:** mantener J o Espacio para jugar desde el mapa. El primer `keydown` cambia a `playing`; los eventos repetidos entran en `keys`, provocando disparos o salto sin soltar la tecla. Confirmado con Node: J repetida deja `state === "playing"` y `keys.has("KeyJ") === true`.  
   **Arreglo:** bloquear la tecla que confirma la etapa hasta su `keyup`; limpiar `keys` al iniciar no basta.

2. **P2 — `art/peru-data.js:172`: el Huallaga contiene un segmento artificial de unos 620 km.**  
   **Reproducir:** abrir el mapa; se unen directamente `[-5.07,-75.61]` y `[-10.57,-76.59]`, dibujando una diagonal que atraviesa la cuenca. Los tramos importados están concatenados fuera de orden.  
   **Arreglo:** ordenar y orientar los tramos desde la naciente hasta la desembocadura, o conservarlos como polilíneas separadas.

3. **P2 — `art/map.js:637–646` / `game.js:1130`: el botón de la ficha no responde al clic ni al toque.**  
   **Reproducir:** seleccionar Sacsayhuamán y pulsar el rectángulo «▶ Enter: jugar». `stageAt()` reconoce únicamente los iconos, por lo que pulsar la ficha no hace nada.  
   **Arreglo:** añadir una zona de interacción para el botón, usando la misma escala del dibujo y comprobando `stagePlayable()`.

4. **P2 — `game.js:1132`: la etapa inicialmente seleccionada empieza al primer toque.**  
   **Reproducir:** entrar al mapa con progreso cero y tocar Sacsayhuamán una sola vez: comienza el nivel. Esto incumple el comportamiento solicitado de «segundo toque juega».  
   **Arreglo:** distinguir selección inicial de selección mediante toque; exigir una confirmación posterior sobre el mismo icono.

5. **P2 — `game.js:274–279`: los controles del mapa interceptan el teclado de botones enfocados.**  
   **Reproducir:** enfocar «Sonido» mediante Tab estando en el mapa y pulsar Espacio: se juega la etapa y se cancela la activación del botón. Enter también ejecuta `mapKey()` aunque el foco esté en ese botón.  
   **Arreglo:** excluir controles interactivos del manejador global y aplicar `preventDefault()` únicamente cuando el mapa gestione el evento.

6. **P2 — `tests/game.cjs:390` y pruebas posteriores: faltan pruebas de los caminos reales de entrada y renderizado.**  
   **Reproducir:** los defectos anteriores coexisten con `npm test` en verde. El harness descarta `addEventListener`, devuelve cero botones táctiles y sustituye `prepare/draw` por stubs.  
   **Arreglo:** registrar y ejecutar los handlers; cubrir repetición tras confirmar, foco, toque inicial, captura/cancelación táctil y blur. Añadir verificación del mapa real en navegador y mediciones separadas de `prepare()`, dibujo estable y cambio de ficha. **El objetivo de <2 ms no queda validado por estas pruebas.**

Las fichas no presentan un error histórico claro en los hechos centrales de Cusco, Ollantaytambo, Parcos y Lima; agosto de 1536 está respaldado por el [Ministerio de Cultura](https://qhapaqnan.cultura.pe/sites/default/files/mi/archivo/HistoriaX-P.pdf). El Callao describe una bahía y marca la batalla como inventada, sin afirmar una ciudad fundada en 1536; la [historia regional](https://web.regioncallao.gob.pe/historia-2/) sitúa su fundación en 1537. No identifiqué otro defecto concreto en la proyección, las coordenadas de las etapas o la ubicación aproximada de los suyus.

## Evaluación (Claude)

| # | Hallazgo | Veredicto | Acción |
|---|----------|-----------|--------|
| 1 | P1 — la tecla que confirma la etapa (J/Espacio/Enter) se filtra al nivel por autorrepetición | **Válido** | `game.js`: conjunto `swallowed`; las teclas que gestiona el mapa se ignoran (también sus repeticiones) hasta el `keyup`; se vacía en `blur`. Test con los handlers reales: J mantenida no dispara. |
| 2 | P2 — el Huallaga une dos tramos con una diagonal artificial | **Válido** | Natural Earth lo trae como MultiLineString de 2 tramos y el script lo aplanaba. `art/peru-data.js` regenerado con dos polilíneas separadas. |
| 3 | P2 — el botón «Enter: jugar» de la ficha no responde a clic/toque | **Válido** | Nuevo `ChankasMap.buttonAt(x, y)`; `mapPointer` lo usa (etapa jugable → nivel; bloqueada → aviso «Próximamente»). El cursor cambia también sobre el botón. |
| 4 | P2 — un toque sobre la etapa ya seleccionada al entrar la juega de inmediato | **Válido** | `mapS.armed`: hace falta un toque previo sobre esa etapa (o usar el botón de la ficha / Enter). El teclado desarma. |
| 5 | P2 — el mapa intercepta Enter/Espacio con el foco en un botón («Sonido») | **Válido** | Si el foco está en un control interactivo, Enter/Espacio no llegan al mapa; `preventDefault()` solo cuando el mapa gestiona la tecla. |
| 6 | P2 — los tests no recorren los handlers reales de entrada ni validan el rendimiento | **Parcialmente válido** | El harness ahora registra los `addEventListener` y los tests disparan `keydown/keyup` reales (repetición, foco, P en el mapa, toques, botón de la ficha). **Rechazado** medir < 2 ms en `npm test`: con un contexto 2D falso no significa nada; se mide en Chromium headless con Playwright (ver informe: ~0,3 ms/fotograma estable, ~0,9 ms con aviso superpuesto, ~1,2 ms con cambio de ficha en cada fotograma). |

Observaciones sin acción: Codex no encontró errores históricos en las fichas (confirma agosto de 1536 para Lima y que El Callao se presenta como bahía/fondeadero con batalla marcada como ficción; la fundación formal del puerto se data en 1537).
