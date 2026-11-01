# EL SIN NOMBRE — Capítulo I: Un hombre sin tierra

Videojuego web 3D construido con Babylon.js.

## Jugar

**Dirección del juego:**  
https://bonillamarquezpablo-lab.github.io/Minimo-android/

Una vez que GitHub Pages termine el primer despliegue, comparte esa dirección con tus amigos. No tienen que descargar el HTML, instalar una app ni seleccionar modelos manualmente: abren el enlace en Safari, Chrome o un navegador compatible con WebGL.

## Distribución web

El repositorio conserva el HTML de origen. En cada publicación, GitHub Actions ejecuta `scripts/build_site.py`, que reúne en el paquete web:

- Babylon.js 7.54.3 y el importador glTF.
- Vikingos, caballeros, aldeanos y gaviotas en GLB.
- Texturas/entorno y efectos de sonido CC0.
- Manifiesto de recursos con tamaño y SHA-256.

Todos los recursos del juego se sirven desde la misma web HTTPS. Así el navegador ya no necesita leer los modelos de Grab3D o los sonidos desde dominios externos durante la partida.

## Caché

`sw.js` guarda la aplicación y los recursos del juego en Cache Storage. La primera visita requiere conexión; después, los recursos ya descargados se reutilizan en las siguientes aperturas siempre que el navegador conserve su caché.

En iPhone, el enlace se puede abrir en Safari. Instagram puede abrirlo dentro de su navegador integrado; si el propio WebView bloquea WebGL, utiliza **Abrir en Safari** desde el menú de Instagram.

## Publicación

El flujo `.github/workflows/deploy-pages.yml` construye y publica el sitio en GitHub Pages al hacer push a `main`. Si Pages aún no está habilitado para este repositorio, en GitHub hay que ir a **Settings → Pages → Build and deployment → Source → GitHub Actions** una sola vez; después cada actualización se publica automáticamente.

## Licencias de recursos

Consulta [ASSET-LICENSES.md](ASSET-LICENSES.md). El archivo `dist/assets/asset-manifest.json` se genera con cada publicación y documenta origen, tamaño y SHA-256.
