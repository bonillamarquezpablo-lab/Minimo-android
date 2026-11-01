# EL SIN NOMBRE — Capítulo I: Un hombre sin tierra

Videojuego web 3D construido con Babylon.js.

## Abrir y compartir el juego

**Enlace web:**  
https://raw.githack.com/bonillamarquezpablo-lab/Minimo-android/gh-pages/index.html

El enlace sirve el HTML con el tipo de contenido web correcto. En la primera visita, raw.githack puede mostrar una pantalla breve de confirmación de seguridad antes de abrir el juego; después de confirmarlo, el navegador ejecuta la página.

## Paquete web

El flujo de GitHub Actions ejecuta `scripts/build_site.py` y reúne en un paquete:

- Babylon.js 7.54.3 y el importador glTF.
- Modelo del protagonista, caballeros, aldeanos y gaviota.
- Entorno gráfico y sonidos CC0.
- Manifiesto con URL de origen, tamaño y SHA-256 de cada recurso.

Los archivos se publican en la rama `gh-pages`. Los recursos del juego se cargan desde la misma ruta HTTPS, no desde Grab3D ni repositorios de audio durante la partida.

## Caché

`sw.js` guarda el HTML, el manifiesto y los recursos en Cache Storage. La primera apertura necesita conexión y descarga el paquete completo; las siguientes pueden reutilizar la caché si el navegador no la ha eliminado.

## Navegadores

Safari y Chrome son las opciones recomendadas. Instagram puede abrir el enlace dentro de su navegador integrado, pero el soporte WebGL depende de las restricciones de la aplicación anfitriona. Si no permite WebGL, usa "Abrir en Safari" o "Abrir en Chrome".

## Publicación

Cada cambio en `main` inicia el flujo `.github/workflows/deploy-pages.yml`: valida y descarga todos los recursos, construye `dist/` y actualiza la rama `gh-pages`. El enlace web permanece estable.

## Licencias

Consulta [ASSET-LICENSES.md](ASSET-LICENSES.md). El manifiesto generado está en `assets/asset-manifest.json`.
