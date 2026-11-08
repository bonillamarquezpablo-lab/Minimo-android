# Referencia visual del agua costera

Este conjunto de pruebas captura la línea base del juego **0.6.271** sin modificar el código de juego publicado.

## Reproducibilidad

El workflow construye el commit base y modifica exclusivamente `dist/index.html`, una copia temporal de CI. El modo determinista solo se activa en esa copia cuando la URL lleva `?test=1`.

Parámetros admitidos por el fixture:
- `t`: instante de simulación en segundos. El reloj de simulación queda congelado tras aplicar ese instante.
- `tide`: `high`, `low` o `natural`.
- `cam`: `shore`, `mid` o `lod`.
- `seed`: semilla determinista para `Math.random`.

Cada ejecución genera 27 capturas: tres posiciones de cámara, tres instantes (0, 60 y 180 s) y tres estados de marea. También genera `reference.json` con el estado del panel, datos del renderer, valores de costa y muestras de vértices.

## Rendimiento

No se miden FPS ni tiempos de fotograma en SwiftShader/CI porque no representan el rendimiento del dispositivo. Esos datos se deben registrar en el **Samsung Galaxy S26 Ultra** con `?debug=1`.

La velocidad física de la resaca se informa como `no implementado`; este fixture no inventa esa magnitud.
