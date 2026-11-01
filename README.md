# EL SIN NOMBRE — Capítulo I: Un hombre sin tierra

Videojuego web 3D construido con Babylon.js.

## Jugar

**Enlace HTTPS para compartir:**  
https://cdn.jsdelivr.net/gh/bonillamarquezpablo-lab/Minimo-android@gh-pages/index.html

Comparte ese enlace con tus amigos. No tienen que descargar el HTML, instalar una app ni elegir modelos: abren la dirección en Safari, Chrome o un navegador integrado compatible con WebGL.

## Paquete web autónomo

El repositorio conserva el HTML del juego y un proceso de construcción. En cada publicación, GitHub Actions ejecuta `scripts/build_site.py` y descarga, comprueba y reúne:

- Babylon.js 7.54.3 y el importador glTF.
- Vikingos, caballeros, aldeanos y gaviotas en GLB.
- Entorno gráfico.
- Sonidos Foley CC0.

El paquete se publica en la rama `gh-pages`; el enlace HTTPS se sirve desde jsDelivr. Los recursos se sirven desde el mismo origen CDN, por lo que el juego no necesita leer modelos de Grab3D ni audio de repositorios externos durante la partida.

## Primera carga y caché

La primera apertura necesita conexión porque el navegador descarga el paquete de recursos. `sw.js` guarda la aplicación y los recursos en Cache Storage para acelerar las siguientes aperturas y permitir recuperación sin conexión cuando el navegador conserve la caché.

En iPhone, comparte el enlace HTTPS. Safari es la opción más compatible; el navegador interno de Instagram también puede abrirlo, aunque el soporte de WebGL depende de las restricciones que aplique la propia aplicación anfitriona.

## Publicación y actualización

Cada cambio en `main` ejecuta el flujo `.github/workflows/deploy-pages.yml`. El proceso descarga y valida los modelos y sonidos, construye `dist/` y reemplaza la rama `gh-pages` con el paquete completo. El enlace para compartir no cambia.

## Licencias

Consulta [ASSET-LICENSES.md](ASSET-LICENSES.md). El archivo `assets/asset-manifest.json` se genera en cada build con origen, tamaño y SHA-256 de cada recurso.
