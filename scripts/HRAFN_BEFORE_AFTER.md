# Hrafn — escáner visual antes/después

Hrafn forma parte del inspector único. La inspección no requiere ejecutar dos comandos ni pegar URLs manualmente: el workflow construye la versión de referencia y la candidata, arranca dos servidores aislados y lanza el mismo recorrido de captura en ambas.

## Ejecución de un solo clic

En GitHub:
1. Abre Actions → Inspector único — EL SIN NOMBRE.
2. Pulsa Run workflow.
3. En before_ref indica la rama/etiqueta que debe servir como versión ANTES. En una ejecución de PR se toma automáticamente el SHA exacto de la rama base.
4. Pulsa Run workflow. La fase de comparación se ejecuta dentro del mismo escaneo completo.

Los pushes a la rama de integración también ejecutan el workflow automáticamente.

## Qué compara

Se inicia una partida de prueba en cada build siguiendo el mismo recorrido de menú. El comparador fija la misma semilla determinista, viewport, escala y motor Chromium, espera a que el mundo esté listo y prepara los recursos para captura. Después congela el reloj en cuatro fases:
- Amanecer: 06:00.
- Mediodía: 12:00.
- Atardecer: 18:00.
- Medianoche: 00:00.

La herramienta guarda PNG originales ANTES/DESPUÉS, imágenes lado a lado, mapas de diferencias de píxeles, métricas de variación e informe Markdown. El artefacto se publica junto con el inventario, las auditorías, los diagnósticos y las capturas del inspector general.

## Interpretación y límites

Los mapas miden diferencias de píxeles; no deciden si una modificación es mejor. Un cambio de escena intencionado puede generar muchas diferencias. La comparación debe revisarse junto con el inventario y los errores de ejecución.

La referencia debe ser una versión compatible con los hooks de prueba y con el reloj atmosférico. Si falta una URL, la API de prueba, la carga completa de escena o una de las cuatro capturas, la fase falla: no inventa una referencia ni marca la inspección como correcta.

El sistema es una herramienta interna del supervisor. No añade paneles de depuración al menú ni altera partidas guardadas. El enlace público del juego solo cambia al publicar una versión aprobada en GitHub Pages; ejecutar la inspección no modifica la versión oficial.
