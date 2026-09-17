/**
 * Dónde va cada `.xpp` que deja una exportación de carpeta.
 *
 * Vive fuera de la capa de VS Code a propósito. Es aritmética de rutas, que es
 * fácil de equivocar —separadores de Windows, rutas relativas, el archivo que
 * cuelga directamente de la raíz— y acá se puede testear con Node a secas, sin
 * levantar el editor.
 */

import { basename, dirname, join, relative } from 'node:path';

/** Cómo se ordenan los `.xpp` de una exportación de carpeta. */
export type ExportLayout = 'mirror' | 'byType' | 'xppSource';

/**
 * El modelo al que pertenece un artefacto, deducido de dónde está.
 *
 * Un repositorio de metadatos de D365FO guarda cada artefacto en
 * `<Paquete>/<Modelo>/<Tipo>/<Nombre>.xml`, así que el modelo es la carpeta que
 * contiene a la del tipo.
 *
 * Solo se sube ese nivel cuando la carpeta que contiene al archivo es
 * efectivamente la del tipo. Si el árbol no sigue la convención —un export
 * anterior, una carpeta armada a mano— subir a ciegas tomaría como modelo algo
 * que no lo es, así que en ese caso se usa la carpeta contenedora tal cual.
 */
function modelOf(sourceFile: string, kind: string): string {
    const container = dirname(sourceFile);
    if (basename(container).toLowerCase() === kind.toLowerCase()) {
        return basename(dirname(container));
    }
    return basename(container);
}

/**
 * Ruta completa del `.xpp` de un artefacto, según el modo elegido.
 *
 * Devuelve la ruta del archivo y no la de la carpeta porque `xppSource` cambia
 * también el nombre: el tipo va adelante, separado con guión bajo, que es la
 * convención con la que D365FO nombra los archivos de su propia carpeta
 * `XppSource`.
 *
 * | Modo | Resultado |
 * |---|---|
 * | `mirror` | `out/MiModulo/AxClass/Foo.xpp` |
 * | `byType` | `out/AxClass/Foo.xpp` |
 * | `xppSource` | `out/MiModelo/AxClass_Foo.xpp` |
 *
 * No crea nada. Quien escribe el archivo crea la carpeta en ese momento, y por
 * eso un directorio del origen cuyos XML no tengan código X++ no deja una
 * carpeta vacía del otro lado.
 *
 * `mirror` asume que `sourceFile` está debajo de `sourceRoot`, que es lo que
 * garantiza la búsqueda que alimenta la exportación. Si no lo estuviera, la
 * ruta relativa treparía con `..` y la salida se escaparía de `outputRoot`.
 */
export function targetPathFor(
    layout: ExportLayout,
    outputRoot: string,
    sourceRoot: string,
    sourceFile: string,
    kind: string,
    name: string
): string {
    switch (layout) {
        case 'byType':
            return join(outputRoot, kind, `${name}.xpp`);
        case 'xppSource':
            return join(outputRoot, modelOf(sourceFile, kind), `${kind}_${name}.xpp`);
        default:
            // `relative` devuelve '' cuando el archivo cuelga directo de la
            // raíz, y `join` lo absorbe sin dejar un separador colgando.
            return join(outputRoot, relative(sourceRoot, dirname(sourceFile)), `${name}.xpp`);
    }
}
