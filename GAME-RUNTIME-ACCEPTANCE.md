# EL SIN NOMBRE — Puerta de aceptación de ejecución

Esta puerta valida el paquete que se integrará en `main` antes de aprobar una PR y vuelve a ejecutarse sobre el lanzamiento de `main` antes de publicar GitHub Pages.

## Qué comprueba

1. Ejecuta contratos de navegación, perfiles gráficos, arranque, recursos, atmósfera, costa, campaña, Inspector Center e inspección Babylon.js.
2. Construye el paquete completo y valida los 30 recursos de publicación, sus hashes y el manifiesto.
3. Sirve el paquete por HTTPS local con un certificado efímero para que Chromium pueda registrar y activar el Service Worker.
4. Completa el flujo real de primera partida o jugador guardado, comprueba el GLB real del protagonista y los NPC obligatorios, espera a que termine la barrera bloqueante y entra en campaña.
5. Espera a que el bucle de mundo produzca un tick verificable. Si no ocurre, conserva diagnóstico de estado del motor, contador y recorder en el artefacto.
6. Observa los primeros 20 segundos de partida y detecta importaciones GLB, peticiones no musicales, descargas tardías y errores JS/runtime/promesas.
7. Verifica identidad persistida, control del Service Worker, cachés no vacías y un tercer arranque sin red a partir de Cache Storage.
8. Conserva manifiesto y logs incluso cuando una comprobación falla.

## Qué demuestra

Demuestra que el paquete construido puede arrancar en Chromium, cargar los recursos obligatorios, entrar en una campaña real, completar el smoke de juego, preparar el Service Worker y volver a iniciar el juego desde las cachés del navegador cuando el runner está sin conexión.

## Qué no demuestra

- Chromium usa SwiftShader en GitHub Actions; sus FPS no representan la GPU Adreno del Galaxy S26 Ultra.
- La prueba offline utiliza caché de Chromium en escritorio y no reproduce cuotas, suspensión o presión de almacenamiento de Android.
- No mide temperatura física, RAM total de Android ni estabilidad térmica prolongada.
- No sustituye la inspección visual A/B de las 13 islas ni una prueba manual en el teléfono.

Por tanto, 120 FPS estables siguen siendo un objetivo y no deben inferirse de estas pruebas.

## Seguridad de integración

Los workflows de aceptación solo construyen y prueban. No publican desde ramas de PR, no crean commits, no fusionan código y no alteran el motor del juego ni su calidad gráfica.

## Integración con main

Esta puerta se ejecuta en pull requests cuyo destino es `main` y puede lanzarse manualmente. Es independiente de ramas de laboratorio no fusionadas. Comprueba contratos del juego, compilación, arranque real y reinicio offline con Playwright; no ejecuta el Auditor del Inspector Center.
