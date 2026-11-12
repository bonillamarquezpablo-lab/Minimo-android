# EL SIN NOMBRE — Capítulo I: Un hombre sin tierra

Videojuego web 3D construido con Babylon.js.

## Enlace del juego

Cuando se complete la activación inicial de GitHub Pages:

https://bonillamarquezpablo-lab.github.io/Minimo-android/

No utilizar enlaces raw de GitHub, jsDelivr o raw.githack para ejecutar la página como destino final.

## Inspector independiente\n\nEl panel de auditorías vive fuera del videojuego y se publica en:\n\nhttps://bonillamarquezpablo-lab.github.io/Minimo-android/inspector/\n\nPermite consultar la última ejecución y el avance de cada fase. Para iniciar una auditoría, abre el flujo de GitHub Actions desde el panel y confirma allí el nivel elegido; no se guardan claves de acceso en el navegador.\n\n## Activación inicial (una sola vez)

La compilación del paquete ya está automatizada. GitHub Pages aún debe habilitarse una vez desde la configuración del repositorio:

1. Abrir https://github.com/bonillamarquezpablo-lab/Minimo-android/settings/pages
2. En **Build and deployment → Source**, elegir **GitHub Actions**.
3. Guardar si GitHub muestra el botón.

Después, el flujo `.github/workflows/deploy-pages.yml` construye y publica el juego automáticamente en cada cambio de `main`.

La primera activación requiere que alguien con permisos administrativos del repositorio cambie esta opción. La integración conectada no tiene permiso de API para crear el sitio Pages por sí misma.

## Recursos incluidos

El proceso `scripts/build_site.py` descarga y verifica en cada compilación:

- Babylon.js 7.54.3 y el importador glTF.
- Modelos GLB del protagonista, guerreros, aldeanos y gaviota.
- Entorno gráfico y sonidos CC0.
- Manifiesto de recursos con origen, tamaño y SHA-256.

Los recursos se sirven desde el propio sitio HTTPS. Los jugadores no necesitan descargar modelos ni sonidos por separado.

## Caché

`sw.js` guarda la aplicación y los recursos en Cache Storage. La primera apertura necesita conexión; las siguientes pueden reutilizar la caché si el navegador la conserva.

## Navegadores

Safari y Chrome son los recomendados. Instagram puede abrir el enlace dentro de su navegador integrado, pero la compatibilidad WebGL depende de sus restricciones; si bloquea WebGL, usar "Abrir en Safari" o "Abrir en Chrome".

## Licencias

Consulta [ASSET-LICENSES.md](ASSET-LICENSES.md). El manifiesto de cada compilación se genera en `dist/assets/asset-manifest.json`.
