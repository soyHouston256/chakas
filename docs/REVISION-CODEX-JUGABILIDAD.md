# Revisión de Codex · jugabilidad (diff 6471eaa..e49934d)

Generado con `codex exec --sandbox read-only` (salida literal abajo). Evaluación de Claude y estado de cada hallazgo al final.

## Salida de Codex

Ejecuté `git diff 6471eaa..HEAD`, `npm test` y sondeos con Node. Los tests pasan. No encontré P0 ni un softlock confirmado; estos son los hallazgos prioritarios:

1. **P1 — El jefe dispara fuera de cámara al terminar la preparación.** `game.js:618–631`  
   `canFire()` solo se comprueba al iniciar el ataque.  
   **Reproducir:** atraer al jefe detrás del jugador, esperar la señal y avanzar hacia la derecha. Sondeo: jugador en `2000`, jefe en `1750`, cámara en `1720`; tras avanzar durante `0,592 s`, `canFire(boss) === false`, pero aparece una bala enemiga.  
   **Arreglo:** comprobar visibilidad y alcance también al liberar el disparo; cancelar la preparación cuando deje de cumplirlos.

2. **P2 — El aturdimiento queda congelado fuera de la ventana de activación.** `game.js:500–506`  
   El `continue` impide descontar `stun` cuando la distancia supera `850`.  
   **Reproducir:** aturdir un enemigo, alejarse y regresar. En el sondeo, después de `3,2 s` fuera de alcance seguía teniendo `stun=2`. También se congela una preparación pendiente del jefe.  
   **Arreglo:** descontar los estados temporales antes del filtro de activación y cancelar ataques pendientes al desactivar al enemigo.

3. **P2 — El test “fuera de cámara por la derecha” pasa por alcance, sin probar visibilidad.** `tests/game.cjs:124–129`  
   Con el jugador inicial en `70`, coloca al tirador en `770`: sigue dentro de la cámara `0..960`. `canFire()` devuelve falso porque supera `FIRE_RANGE=620`.  
   **Reproducir:** eliminar la condición de visibilidad de `canFire()`; este caso seguiría pasando.  
   **Arreglo:** situar al jugador cerca del borde derecho del nivel y al tirador fuera de pantalla, pero a menos de `620`; añadir también el caso del jefe que sale de cámara durante la preparación.

4. **P2 — Varias pruebas no demuestran el comportamiento anunciado.** `tests/game.cjs:187–227`  
   **Reproducir:** el test de empuje acepta separación **o invulnerabilidad**, por lo que pasa sin separación; el perro recibe daño tras teletransportarlo sobre el jugador, sin comprobar que la embestida muerda; la boleadora real se elimina y se reemplaza por un impacto directo. El lanzamiento original a `150 px` del perro no acertó en el sondeo. Además, dos alturas distintas no prueban el orden del patrón.  
   **Arreglo:** avanzar frames con acciones reales y comprobar separación efectiva, contacto durante la embestida, impacto y recuperación del aturdimiento —también contra el jefe— y la secuencia exacta de disparos.
## Evaluación (Claude)

| # | Hallazgo | Veredicto | Acción |
|---|----------|-----------|--------|
| 1 | El jefe dispara fuera de cámara al terminar la preparación | **Aceptado** (reproducido) | `updateBoss()` vuelve a comprobar `canFire()` al soltar el disparo; si no se ve, cancela la preparación (`cool=0.4`). Test: jefe que sale de cámara durante la preparación no dispara. |
| 2 | `stun` (y la preparación del jefe) se congelan fuera de la ventana de activación | **Aceptado** | `e.stun` se descuenta antes del filtro de 850 px; al desactivarse se cancelan `wind` y `lunge`. Test: el aturdimiento expira con el enemigo fuera de ventana. |
| 3 | El test «fuera de cámara por la derecha» pasaba por alcance | **Aceptado** (con otro arreglo) | Con la cámara siguiendo al jugador (`cam=x-280`) es imposible estar fuera por la derecha y a menos de 620 px, así que el caso se prueba con la cámara forzada: tirador a 500 px fuera de pantalla → `canFire=false`; al entrar en cámara → `true`. |
| 4 | Tests débiles (empuje con «o invulnerable», perro teletransportado, boleadora sustituida, orden del patrón) | **Aceptado** | Empuje: exige separación real. Perro: sale a 110 px y debe morder durante `lunge`. Boleadora: lanzamiento real en arco a 150 px (Codex tenía razón: el arco antiguo pasaba por encima; ahora `vy=-180`, gravedad 700 y caja 16×16, alcance ~0–280 px), recuperación del aturdimiento y aturdimiento corto contra el jefe que cancela la preparación. Patrón del jefe: se compara la secuencia exacta con `BOSS_PATTERN`. |

Hallazgos rechazados: ninguno.

Comprobación extra: mutaciones manuales (quitar `canFire` al soltar, quitar la visibilidad en `canFire`, quitar la guarda de `state` en `hit()`, no descontar `stun`) → los cuatro hacen fallar `npm test`.

Pendiente (fuera de alcance, no bloqueante): el piquero (type 2) sigue disparando balas con la animación `thrust`; el perro del inicio (x=620) muerde pronto y quita 1–2 corazones a quien avanza sin disparar.
