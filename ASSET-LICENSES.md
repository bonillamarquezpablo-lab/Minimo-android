# Recursos de EL SIN NOMBRE 0.6.126

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

## Audio CC0
- Pasos de hojas, barro, grava, piedra y madera, y barridos de batalla: TinyWorlds / Kenney, CC0 1.0, distribuidos por Open Game SFX Index. https://opengameart.org/content/different-steps-on-wood-stone-leaves-gravel-and-mud
- Impactos y sonidos de batalla: Kenney / OpenGameArt, CC0 1.0. https://kenney.nl/assets/impact-sounds
- Corte de madera: Kenney RPG Audio, CC0. https://kenney.nl/assets/rpg-audio

El archivo assets/asset-manifest.json generado en cada build contiene URL de origen, tamaño y SHA-256 de cada recurso distribuido.
