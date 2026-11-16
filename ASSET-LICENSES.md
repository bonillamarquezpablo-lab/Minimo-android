# Recursos de EL SIN NOMBRE 0.6.129

Esta distribución se construye desde GitHub Actions y copia los recursos al paquete estático publicado. El navegador los recibe desde el mismo origen HTTPS; no necesita descargar modelos ni sonidos por separado.

## Motor gráfico
- Babylon.js 7.54.3 y Babylon GLTF Loader.
- Licencia: Apache License 2.0.
- Fuente oficial: https://github.com/BabylonJS/Babylon.js
- Distribución: CDN oficial de Babylon.js, descargada durante el build y servida localmente por GitHub Pages.

## Modelos 3D CC0
- Viking rigged: Grab3D, CC0 1.0. https://grab3d.com/models/characters/viking/
- Armored Knight rigged: Grab3D, CC0 1.0. https://grab3d.com/
- Man Base Mesh rigged: Grab3D, CC0 1.0. https://grab3d.com/models/characters/man-base-character/
- Seagull GLB: Gobkit free CC0 library, CC0 1.0. https://gobkit.com/freebies
- Deer, Stag and Wolf animated GLB: Quaternius Ultimate Animated Animals, CC0 1.0; pinned to commit `6d6de54a1d7143cf5487462d147bbef039de4837` and packaged locally under `assets/models/wildlife/`. https://github.com/nishit47/Blender-Pre-vis-Pipeline---Screenplay-to-Animatic

## Modelos arbóreos CC0
- Pino silvestre adulto: Innerscene, GLB con mapas de textura y materiales; CC0 1.0. Empaquetado en `assets/models/forest/mature-scots-pine-tree.glb`. Fuente: https://www.innerscene.com/tools/library/3d-parts/mature-scots-pine-tree-280307e1
- Pícea de Noruega adulta: Innerscene, GLB con mapas de textura y materiales; CC0 1.0. Empaquetado en `assets/models/forest/mature-norway-spruce-tree.glb`. Fuente: https://www.innerscene.com/tools/library/3d-parts/mature-norway-spruce-tree-48c2566f
- Roble urbano de hojas detalladas: Innerscene, GLB CC0 1.0 con geometría de follaje detallada; empaquetado en `assets/models/forest/oak-detailed.glb`. Fuente: https://www.innerscene.com/tools/library/3d-parts/oak-street-tree-detailed-leaves-a273fef9
- Los tres modelos se descargan y validan durante la compilación. La partida solo utiliza archivos locales; se conservan materiales y UV y se instancian plantillas compartidas entre árboles para limitar duplicaciones.

## Audio CC0
- Pasos de hojas, barro, grava, piedra y madera, y barridos de batalla: TinyWorlds / Kenney, CC0 1.0, distribuidos por Open Game SFX Index. https://opengameart.org/content/different-steps-on-wood-stone-leaves-gravel-and-mud
- Impactos y sonidos de batalla: Kenney / OpenGameArt, CC0 1.0. https://kenney.nl/assets/impact-sounds
- Corte de madera: Kenney RPG Audio, CC0. https://kenney.nl/assets/rpg-audio

## Arena costera fotogramétrica
- Albedo, normal OpenGL y roughness: **Ground 060 — Sand with shells**, ambientCG.
- Fuente: https://ambientcg.com/view?id=Ground060
- Descarga empaquetada: Ground060_2K-JPG.zip; el build extrae solo los tres mapas usados.
- Licencia: Creative Commons CC0 1.0 Universal; redistribución dentro del videojuego permitida.
- La textura se mezcla con el grano procedural existente y se muestrea en varias escalas/offsets para reducir la repetición visible.

## Entorno de iluminación nórdico
- Archivo distribuido: `assets/environmentSpecular.env`.
- Origen: generado proceduralmente para EL SIN NOMBRE; creación propia del proyecto, sin licencia ni dependencia de terceros.
- Formato: entorno prefiltrado compatible con Babylon.js, 128 px, 8 niveles prefiltrados y polinomios de iluminación difusa.
- El build copia el archivo local desde `scripts/nordic/environmentSpecular.env`; no descarga ni sustituye este recurso desde el CDN de Babylon.js.

El archivo assets/asset-manifest.json generado en cada build contiene URL de origen, tamaño y SHA-256 de cada recurso distribuido.
