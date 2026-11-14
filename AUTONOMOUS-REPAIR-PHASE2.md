# Fase 2 — Validación segura de reparaciones

## Alcance

Esta fase valida un parche preparado por una persona en un runner aislado. No llama modelos externos, no necesita credenciales de escritura y no cambia el repositorio.

## Flujo

1. Recibe una tarea, entre 1 y 8 rutas autorizadas y un diff unificado.
2. Comprueba el tamaño, las rutas, los enlaces simbólicos, los borrados y los renombrados.
3. Ejecuta `git apply --check` antes de aplicar el cambio en el runner efímero.
4. Ejecuta los contratos de regresión, la compilación y el smoke real del navegador.
5. Realiza una comprobación estática final y conserva los informes como artefactos.

## Rutas permitidas

Solo `index.html` y `scripts/nordic/*.js`. No se permite cambiar pruebas, workflows, scripts de control, dependencias, manifiestos ni configuración de despliegue mediante el parche.

## Límites

- Máximo 8 archivos, 45 KB de diff y 450 líneas añadidas/eliminadas.
- No borrar ni renombrar archivos.
- No introducir red, telemetría externa, `eval`, `new Function` ni dependencias.
- Preservar las 13 islas, NPCs, animaciones, funciones, materiales, sombras, efectos, resolución y calidad gráfica.
- El workflow solo valida y conserva artefactos: no crea ramas, commits, pull requests, merges ni despliegues.
- La revisión humana sigue siendo obligatoria; las pruebas no demuestran equivalencia visual ni rendimiento de la GPU física.
