/**
 * Lectura de la configuración de la extensión.
 *
 * Todo en un solo lugar para que cada comando no tenga que acordarse del nombre
 * exacto de cada opción ni de su valor por defecto.
 */

import * as vscode from 'vscode';

export type AutoPreviewMode = 'never' | 'ask' | 'onOpen';
export type ViewColumnMode = 'beside' | 'active' | 'replace';
export type FolderPicker = 'dialog' | 'quickPick';

export interface TranspileConfig {
    autoPreview: AutoPreviewMode;
    autoPreviewTypes: string[];
    include: string[];
    exclude: string[];
    skipEmpty: boolean;
    viewColumn: ViewColumnMode;
    preserveFocus: boolean;
    eol: 'crlf' | 'lf';
    stripDocComments: boolean;
    headerComment: boolean;
    outputDirectory: string;
    folderPicker: FolderPicker;
}

export function readConfig(scope?: vscode.Uri): TranspileConfig {
    const c = vscode.workspace.getConfiguration('xpp', scope);
    return {
        autoPreview: c.get<AutoPreviewMode>('transpile.autoPreview', 'never'),
        autoPreviewTypes: c.get<string[]>('transpile.autoPreviewTypes', []),
        include: c.get<string[]>('transpile.include', []),
        exclude: c.get<string[]>('transpile.exclude', []),
        skipEmpty: c.get<boolean>('transpile.skipEmpty', true),
        viewColumn: c.get<ViewColumnMode>('transpile.viewColumn', 'beside'),
        preserveFocus: c.get<boolean>('transpile.preserveFocus', true),
        eol: c.get<'crlf' | 'lf'>('transpile.eol', 'crlf'),
        stripDocComments: c.get<boolean>('transpile.stripDocComments', false),
        headerComment: c.get<boolean>('transpile.headerComment', false),
        outputDirectory: c.get<string>('transpile.outputDirectory', ''),
        folderPicker: c.get<FolderPicker>('transpile.folderPicker', 'dialog')
    };
}

/** Traduce la opción a la columna del editor donde mostrar la vista. */
export function resolveViewColumn(mode: ViewColumnMode): vscode.ViewColumn {
    switch (mode) {
        case 'active':
        case 'replace':
            return vscode.ViewColumn.Active;
        default:
            return vscode.ViewColumn.Beside;
    }
}

/**
 * Coincidencia de una ruta contra una lista de patrones glob.
 *
 * Se usa `RelativePattern` cuando la ruta cae dentro de una carpeta del área de
 * trabajo, porque es lo que permite escribir patrones relativos al proyecto.
 * Para archivos de afuera se compara contra la ruta absoluta.
 */
function matchesAny(uri: vscode.Uri, patterns: readonly string[]): boolean {
    if (patterns.length === 0) {
        return false;
    }
    const folder = vscode.workspace.getWorkspaceFolder(uri);
    const relative = folder
        ? vscode.workspace.asRelativePath(uri, false).replace(/\\/g, '/')
        : uri.fsPath.replace(/\\/g, '/');

    return patterns.some((pattern) => globToRegExp(pattern).test(relative));
}

/**
 * Convierte un glob a expresión regular.
 *
 * Cubre lo que se usa en la práctica para filtrar rutas de metadatos: `**` para
 * cualquier cantidad de segmentos, `*` dentro de un segmento, `?` para un
 * carácter y `{a,b}` para alternativas.
 */
export function globToRegExp(glob: string): RegExp {
    let out = '';
    for (let i = 0; i < glob.length; i++) {
        const c = glob[i];
        if (c === '*') {
            if (glob[i + 1] === '*') {
                // `**/` consume cualquier cantidad de segmentos, incluido ninguno.
                if (glob[i + 2] === '/') {
                    out += '(?:.*/)?';
                    i += 2;
                } else {
                    out += '.*';
                    i += 1;
                }
            } else {
                out += '[^/]*';
            }
        } else if (c === '?') {
            out += '[^/]';
        } else if (c === '{') {
            out += '(?:';
        } else if (c === '}') {
            out += ')';
        } else if (c === ',') {
            out += '|';
        } else if ('.+^$()|[]\\/'.includes(c)) {
            out += '\\' + c;
        } else {
            out += c;
        }
    }
    return new RegExp('^' + out + '$', 'i');
}

/** ¿La ruta pasa los filtros `include` / `exclude`? */
export function passesPathFilters(uri: vscode.Uri, config: TranspileConfig): boolean {
    if (matchesAny(uri, config.exclude)) {
        return false;
    }
    // Una lista `include` vacía significa "todo"; si tiene algo, es lista blanca.
    return config.include.length === 0 || matchesAny(uri, config.include);
}

/** ¿El tipo de artefacto está entre los que se abren solos? */
export function passesTypeFilter(kind: string, config: TranspileConfig): boolean {
    return (
        config.autoPreviewTypes.length === 0 ||
        config.autoPreviewTypes.some((t) => t.toLowerCase() === kind.toLowerCase())
    );
}
