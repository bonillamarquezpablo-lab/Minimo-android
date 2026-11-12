# Hrafn — comparación visual antes/después

El módulo captura las mismas cuatro fases horarias en dos builds del juego, usando Chromium, viewport, escala y controles de reloj iguales. Produce PNG originales por versión, láminas lado a lado, mapas de diferencias y un manifiesto JSON.

## Uso
1. Construye y sirve dos builds equivalentes en URLs distintas.
2. Define `HRAFN_BEFORE_URL` y `HRAFN_AFTER_URL`.
3. Ejecuta `node scripts/hrafn-before-after.mjs`.
4. Ejecuta `python scripts/create_hrafn_ab_report.py artifacts/hrafn-before-after`.

Ambas builds deben exponer los hooks de prueba `?test=1`, `window.__ELSN_TEST__.captureCanvas()` y `window.__ELSN_ATMOSPHERE_CONTROLS`. Las URLs deben apuntar a la misma escena y contenido para que la comparación sea válida.

Los mapas de diferencias muestran cambios de píxeles, no juzgan automáticamente si un cambio es mejor. La revisión humana sigue siendo obligatoria. Si no se dispone de una build anterior equivalente, el módulo falla explícitamente en lugar de inventar una referencia. No modifica partidas ni archivos de producción.
