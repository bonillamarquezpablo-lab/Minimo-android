# Fase 1 — Contrato de diagnóstico y evidencias

## Propósito

Medir el juego mientras se ejecuta en el dispositivo objetivo, separar observaciones de hipótesis y evitar que los datos ausentes se conviertan en diagnósticos falsos. Esta fase no modifica modelos, animaciones, combate, calidad visual ni comportamiento del juego.

## Fuentes y alcance

| Dato | Fuente | Qué permite afirmar |
|---|---|---|
| FPS y frame time p50/p95/p99 | Diagnóstico del motor en ejecución | Fluidez y distribución de tiempos de fotograma de esa sesión |
| Actualización del mundo y envío de render | Tiempos de etapa del motor / JavaScript | Duración de esas etapas; no porcentaje total de CPU |
| Tiempo GPU | Babylon EngineInstrumentation, opcional | Solo se informa cuando el contador GPU entrega un valor |
| Draw calls, mallas, vértices y resolución | Runtime del juego | Carga de escena y configuración efectiva observada |
| Heap JavaScript | \`performance.memory\`, cuando Chromium lo permite | Memoria del heap JS; no RAM total del teléfono |
| Device Memory y hardwareConcurrency | Navegador | Estimaciones/capacidades reportadas; no uso real de RAM o CPU |
| Temperatura, RAM total, VRAM | No expuestas por la página web | No disponibles; requieren una vía Android nativa o herramienta externa |

La marca manual de Galaxy S26 Ultra es una declaración del usuario. No es una verificación criptográfica del dispositivo. Los resultados de Chromium + SwiftShader se etiquetan como emulación y nunca como rendimiento de la GPU Adreno física.

## Perfilador GPU

La medición normal no activa el perfilador. El modo detallado añade \`profile=1\` únicamente al juego abierto dentro del Inspector para solicitar los contadores de Babylon. Puede añadir carga de medición; por eso el informe conserva si se activó y no mezcla esa sesión con una sesión normal.

Un contador inexistente o no disponible se representa como \`null\`, nunca como \`0 ms\`. Cero y ausencia no son equivalentes.

## Reglas contra falsos diagnósticos

- Los valores nulos, vacíos, no finitos y booleanos no se aceptan como mediciones numéricas.
- Una ventana sin muestras válidas no se interpreta como rendimiento perfecto.
- Los percentiles incoherentes generan advertencias de calidad de datos.
- Tres intervalos válidos como mínimo para una clasificación probable de estabilidad.
- Una sola sesión no puede producir un resultado confirmado. La confirmación requiere repetición y al menos dos sesiones independientes.
- Superar el presupuesto de frame time identifica una observación de rendimiento; no identifica por sí solo si la causa es CPU, GPU, memoria, temperatura o red.
- La falta de temperatura, RAM total o VRAM se muestra como limitación, no como cero ni como fallo.

## Objetivo de rendimiento

La referencia de evaluación es 120 FPS (8,33 ms por fotograma). El Inspector también registra el objetivo interno que el propio juego comunique, si existe. No se asume que el motor esté configurado o sea capaz de mantener 120 FPS porque ese sea el objetivo deseado.

## Calidad visual

El diagnóstico numérico no puede declarar por sí solo que el agua, la espuma, las sombras, las texturas o la geometría estén mal. La revisión visual exige capturas comparables con la misma cámara, isla, hora, perfil gráfico y estado del mundo. Las diferencias de píxeles son evidencia para inspeccionar, no una puntuación automática de calidad.

## Seguridad y límites de cambios

Esta Fase 1 es de solo lectura respecto al juego. No modifica guerreros ni protagonista, no ejecuta reparaciones y no escribe en \`main\`. Los informes JSON se guardan bajo demanda por el usuario. Los NPC especialistas y agentes externos se conectarán después, una vez que el contrato de medición esté validado.
