# EL SIN NOMBRE — Laboratorio autónomo y NPC especialistas

## Objetivo

Permitir que el proyecto inspeccione y mida una compilación sin que el jugador tenga que abrir el juego. GitHub Actions construye el juego en un runner aislado, arranca Chromium, ejecuta el Inspector unificado y conserva los resultados como artefactos. Los NPC especialistas analizan los manifiestos y convierten las observaciones en tareas priorizadas.

Esto es una ejecución de laboratorio en la nube. No mantiene abierto el navegador del móvil ni reproduce la GPU Adreno física del Galaxy S26 Ultra.

## Rutina prevista

- Cada noche a las 02:17 en \`Europe/Madrid\`: inspección completa de arranque, texturas, cimentación, estructuras, costa, agua, inventario y capturas.
- Cada domingo a las 02:47 en \`Europe/Madrid\`: inspección profunda con comparación antes/después y rendimiento cuando el baseline es válido.
- Se conserva también la ejecución manual rápida/completa/profunda del Inspector.

Los eventos programados de GitHub Actions solo se ejecutan desde la rama predeterminada. Por tanto, esta rutina empieza cuando el cambio esté incorporado a \`main\`; una PR abierta no activa todavía el horario.

## NPC especialistas

| NPC | Responsabilidad | Entradas |
|---|---|---|
| Eira — Rendimiento | FPS, frame time, etapas CPU/JavaScript, GPU si está disponible, draw calls y arranque | Hrafn, Player Startup, telemetría del juego |
| Sól — Calidad visual | Agua, espuma, sombras, iluminación, materiales, texturas y regresiones de captura | Capturas sincronizadas, láminas e informes |
| Ulf — Mundo y geometría | Islas, terreno, orillas, cimentación, edificios flotantes/intersecciones y recursos | Auditoría de estructuras, grounding y texturas |
| Týr — Pruebas y validación | Arranque, contratos, fases fallidas/omitidas, artefactos y regresiones | Manifiesto del Inspector y pruebas CI |
| Coordinador | Une las conclusiones, elimina duplicados y crea una lista priorizada de tareas | Todos los informes |

## Contrato de evidencia

- Cada conclusión debe enlazar con un dato o artefacto concreto.
- \`null\`, ausente y no medido nunca equivalen a cero.
- Una fase omitida no cuenta como aprobada. Los estados desconocidos tampoco se convierten en fallos ni en aprobaciones: quedan como evidencia incompleta.
- Los especialistas solo clasifican fallos con estados explícitos (`failed`, `failure`, `error`, `timed_out` o `cancelled`). Las fases nuevas o no reconocidas se contabilizan aparte.
- La extracción de FPS y frame time usa nombres de campos normalizados; si el objeto de rendimiento existe pero no contiene una métrica reconocible, el informe lo marca como no utilizable.
- Chromium/SwiftShader se marca como entorno de emulación, nunca como resultado de Adreno.
- La comparación de píxeles es evidencia, no un juicio automático de calidad.
- No se inventa CPU total, RAM Android, VRAM ni temperatura cuando el navegador no los expone.
- Las regresiones de FPS requieren baseline comparable, misma semilla y mismo perfil.
- Ningún diagnóstico visual o geométrico puede justificar por sí solo borrar contenido o bajar calidad gráfica.

## Autonomía y límites de reparación

La primera entrega automatiza recopilación, clasificación, asignación de tareas y publicación de los informes. Las pruebas de los especialistas son ahora una barrera obligatoria del workflow: si el análisis o sus contratos fallan, la ejecución no puede aparecer como correcta. No cambia el código del juego ni despliega reparaciones.

### Revisión visual multimodal opcional

Se incorpora `scripts/ai-visual-review.mjs`, una pasarela de solo lectura compatible con la API Responses de OpenAI. Consume las láminas de captura, el informe de especialistas y genera `artifacts/ai-visual-review/report.json` y `report.md`. Si falta la credencial o el modelo, deja el estado `skipped` de forma explícita; nunca finge que una revisión IA se ejecutó. Valida el JSON de salida, limita el tamaño de las imágenes y no aplica cambios de código.

Para activarla, el propietario debe añadir en GitHub Actions:
- Secret `LAB_AI_API_KEY` con una clave de API del proveedor.
- Repository variable `LAB_AI_MODEL` con un modelo habilitado para visión en la cuenta.
- Opcionalmente, `LAB_AI_RESPONSES_URL` si se usa un endpoint compatible distinto.

La suscripción ChatGPT no equivale a una clave API ni incluye automáticamente saldo de API. El uso puede generar costes independientes.

Los agentes capaces de investigar, escribir parches y abrir PR necesitan una segunda fase separada con permisos mínimos y credenciales de escritura. No se habilitan aquí: una respuesta de modelo no debe convertirse directamente en código ejecutable ni en un despliegue.

Cuando se incorpore esa capa, cada especialista deberá trabajar en una rama efímera, proponer un parche, ejecutar pruebas unitarias, smoke tests y comparación visual, y descartar el cambio si falla cualquier protección. Ninguna reparación debe llegar a producción si no mantiene las funciones, la identidad visual y la calidad gráfica.

## Artefactos

Cada ejecución produce:

- \`artifacts/unified-inspector/manifest.json\` y \`inspection-report.md\`.
- Informes originales de arranque, texturas, geometría, costa, capturas y comparación Hrafn.
- \`artifacts/autonomous-agents/report.json\` y \`report.md\`, con el estado de cada especialista y sus tareas.
- Una copia JSON del informe de especialistas en la rama \`inspector-status\`, asociada al ID de la ejecución.
