# Nivel 1 — Patrulla de Exploradores

## Ejecución

El workflow `.github/workflows/explorer-patrol.yml` arranca el juego en Chromium con `?test=1`, completa la entrada de prueba y utiliza los hooks aislados `window.__ELSN_TEST__` para visitar los puntos de observación de las 13 islas.

Se ejecuta:
- Cada seis horas mediante GitHub Actions.
- Manualmente desde Actions → **Patrulla Nivel 1 — Exploradores EL SIN NOMBRE** → **Run workflow**.
- En la rama de desarrollo de esta tarea, también al hacer push.

En `?test=1`, la precarga de efectos de sonido dispone de hasta 30 segundos para absorber variaciones del navegador de CI; el arranque normal conserva su argumento actual de 6,5 segundos. El runner registra estados HTTP de audio y reconoce `boot-failed` para no confundir un fallo de arranque con una espera infinita.

El horario de seis horas de GitHub Actions se activa cuando el workflow está integrado en la rama predeterminada; mientras esta PR siga abierta, la ejecución disponible es manual o por push a la rama de la PR.

## Lecturas

- Eira: contadores expuestos de pisadas húmedas, partículas activas/emitidas y medidas explícitas de salto en la costa.
- Sól: hierba, draw calls, actualización del mundo, preparación de render y frame time.
- Ulf: auditorías existentes de cimentación con tolerancia de 2 cm.
- Týr: inventario disponible y comprobación de si el runtime expone un catálogo de actividades.

Los datos ausentes permanecen como no medidos. Un contador global de hierba no se presenta como cobertura por isla; tampoco se inventan actividades faltantes.

## Límite actual de locomoción

La API de prueba existente permite cambiar y verificar la cámara por coordenadas, pero no expone un método de locomoción autónoma de NPC. Por eso, en esta entrega los cuatro exploradores realizan una **patrulla técnica por puntos de observación**, no una caminata física de personajes. No se generan pasos sintéticos ni se declara una ruta física bloqueada sin recorrerla.

Para evolucionar al movimiento real habrá que añadir después una API de navegación de prueba que pueda conducir un actor temporal en el renderer desechable y devolver su posición, colisiones y estado de navegación. No se incorpora esa modificación al juego normal en esta fase.

## Informe y panel

El runner guarda `artifacts/explorer-patrol/report.json`. El publicador copia el último informe y el histórico por ID de ejecución a la rama `inspector-status`:
- `inspector/data/explorer-patrol/latest.json`
- `inspector/data/explorer-patrol/runs/<run-id>.json`

El Inspector Center lee el último JSON y muestra el estado de cada explorador, sus mediciones, datos pendientes y un botón para copiar cada incidencia.

## Seguridad

No se llaman APIs externas de IA ni servicios de visión. No se cambia la partida normal, no se escribe en `main` desde el runner y no se modifica la escena fuera de `?test=1`. Los informes se publican en la rama de estado del Inspector.
