/**
 * Dónde va cada `.xpp` que deja una exportación de carpeta.
 *
 * Vive fuera de la capa de VS Code a propósito. Es aritmética de rutas, que es
 * fácil de equivocar —separadores de Windows, rutas relativas, el archivo que
 * cuelga directamente de la raíz— y acá se puede testear con Node a secas, sin
 * levantar el editor.
 */

import { dirname, join, relative } from 'node:path';

/** Cómo se ordenan los `.xpp` de una exportación de carpeta. */
export type ExportLayout = 'mirror' | 'byType';

/**
 * Carpeta destino de un artefacto según el modo elegido.
 *
 * `byType` aplana: toda la exportación termina en una carpeta por tipo, y de
 * dónde salió cada archivo se pierde. `mirror` calcula la ruta relativa a la
 * carpeta de origen, así que la salida reproduce el árbol tal cual.
 *
 * No crea nada. Quien escribe el archivo crea la carpeta en ese momento, y por
 * eso un directorio del origen cuyos XML no tengan código X++ no deja una
 * carpeta vacía del otro lado.
 *
 * Asume que `sourceFile` está debajo de `sourceRoot`, que es lo que garantiza
 * la búsqueda que alimenta la exportación. Si no lo estuviera, la ruta relativa
 * treparía con `..` y la salida se escaparía de `outputRoot`.
 */
export function targetDirFor(
    layout: ExportLayout,
    outputRoot: string,
    sourceRoot: string,
    sourceFile: string,
    kind: string
): string {
    if (layout === 'byType') {
        return join(outputRoot, kind);
    }
    // `relative` devuelve '' cuando el archivo cuelga directo de la raíz, y
    // `join` lo absorbe sin dejar un separador colgando.
    return join(outputRoot, relative(sourceRoot, dirname(sourceFile)));
}
