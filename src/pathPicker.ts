/**
 * Descomponer una ruta mientras se la escribe.
 *
 * Sirve para ofrecer las subcarpetas que siguen a lo ya tipeado, sin tener que
 * terminar de escribir la ruta. Vive fuera de la capa de VS Code porque los
 * casos borde son varios —la raíz de un disco, los separadores mezclados, el
 * segmento a medio escribir— y acá se pueden probar con Node a secas.
 *
 * Se aceptan `/` y `\` indistintamente: en Windows mucha gente escribe con
 * barra normal por costumbre, y rechazarlo sería pelearse con quien escribe.
 */

/** Una ruta a medio tipear, partida en lo que se puede listar y lo que filtra. */
export interface TypedPath {
    /** Carpeta a listar. Vacío cuando todavía no hay ninguna que se pueda leer. */
    dir: string;
    /** Lo escrito del último segmento. Filtra los resultados. */
    prefix: string;
}

const SEPARATORS = ['/', '\\'];

/** Índice del último separador, sea cual sea. */
function lastSeparator(value: string): number {
    return Math.max(...SEPARATORS.map((s) => value.lastIndexOf(s)));
}

/**
 * Parte lo tipeado en la carpeta a listar y el prefijo con que filtrar.
 *
 * `C:\Repos\Jo`  -> lista `C:\Repos`, filtra por `Jo`
 * `C:\Repos\`    -> lista `C:\Repos`, sin filtro
 * `C:\`          -> lista la raíz del disco, sin filtro
 *
 * Sin ningún separador no hay nada que listar: `Repos` a secas no dice respecto
 * de qué, y adivinar una base llevaría a ofrecer carpetas de otro lado.
 */
export function splitTypedPath(value: string): TypedPath {
    const trimmed = value.trim();
    if (!trimmed) {
        return { dir: '', prefix: '' };
    }

    // `C:` sin barra ya identifica un disco, y listarlo es lo que se espera.
    if (/^[A-Za-z]:$/.test(trimmed)) {
        return { dir: `${trimmed}\\`, prefix: '' };
    }

    const cut = lastSeparator(trimmed);
    if (cut < 0) {
        return { dir: '', prefix: trimmed };
    }

    // La raíz es el único caso donde el separador forma parte de la carpeta:
    // `C:\` es un directorio y `C:` es otra cosa.
    const dir = cut === 0 || /^[A-Za-z]:$/.test(trimmed.slice(0, cut)) ? trimmed.slice(0, cut + 1) : trimmed.slice(0, cut);

    return { dir, prefix: trimmed.slice(cut + 1) };
}

/**
 * Las carpetas que siguen a lo tipeado.
 *
 * El filtro no distingue mayúsculas porque en Windows las rutas tampoco, y
 * obligar a acertarlas sería exactamente la molestia que esto viene a evitar.
 */
export function filterDirs(names: readonly string[], prefix: string): string[] {
    const needle = prefix.toLowerCase();
    return names
        .filter((name) => name.toLowerCase().startsWith(needle))
        .sort((a, b) => a.localeCompare(b));
}
