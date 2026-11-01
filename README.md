# EL SIN NOMBRE — Capítulo I: Un hombre sin tierra

Videojuego web 3D construido con Babylon.js.

## Enlace del juego

**Dirección definitiva cuando GitHub Pages esté activado:**

https://bonillamarquezpablo-lab.github.io/Minimo-android/

No usar enlaces `rawcdn.githack.com` ni `cdn.jsdelivr.net` para abrir el HTML como página: esos servicios sirven archivos del repositorio como proxy y no sustituyen un alojamiento web propio fiable.

## Activación inicial de GitHub Pages (una sola vez)

El paquete del videojuego ya se construye y publica automáticamente en la rama `gh-pages`. Para que GitHub lo sirva como una web real:

1. Abre https://github.com/bonillamarquezpablo-lab/Minimo-android/settings/pages
2. En **Build and deployment**, selecciona **Deploy from a branch**.
3. En **Branch**, selecciona `gh-pages`.
4. En la carpeta selecciona `/(root)`.
5. Pulsa **Save**.

GitHub habilitará entonces el dominio `github.io`. No hay que volver a hacer estos pasos en futuras versiones.

## Paquete web autónomo

Cada cambio en `main` ejecuta `.github/workflows/deploy-pages.yml` y `scripts/build_site.py`. El proceso reúne y verifica en un paquete:

- Babylon.js 7.54.3 y el importador glTF.
- Modelos GLB del protagonista, guerreros, aldeanos y gaviota.
- Entorno gráfico y sonidos CC0.
- Manifiesto con origen, tamaño y SHA-256 de cada recurso.

Los recursos se sirven desde el propio sitio HTTPS. El usuario no tiene que descargar ni seleccionar los modelos por separado.

## Primera carga y caché

La primera visita necesita conexión para descargar el paquete de recursos. `sw.js` guarda la aplicación y los recursos en Cache Storage para acelerar las visitas siguientes y permitir recuperación sin conexión mientras el navegador conserve la caché.

## Navegadores

Safari y Chrome son las opciones recomendadas. Instagram puede abrir la dirección en su navegador integrado, pero el soporte WebGL depende de las restricciones que aplique su navegador interno. Si no habilita WebGL, utiliza **Abrir en Safari** o **Abrir en Chrome**.

## Licencias

Consulta [ASSET-LICENSES.md](ASSET-LICENSES.md). El manifiesto de recursos se genera en `dist/assets/asset-manifest.json` durante cada publicación.
