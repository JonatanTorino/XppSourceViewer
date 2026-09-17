/**
 * Comandos de transpilación y la vista virtual de X++.
 */

import { promises as fs } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';

import * as vscode from 'vscode';

import { readConfig, resolveViewColumn } from '../config';
import { XPP_SCHEME } from '../extension';
import type { Logger } from '../logger';
import { type ExportLayout, targetPathFor } from '../exportLayout';
import { NotMetadataError, transpile, type TranspileResult } from '../transpiler';

/**
 * URI del documento virtual con el X++ de un XML dado.
 *
 * La ruta original viaja en el query para que el proveedor pueda releerla, y el
 * path lleva el nombre del artefacto con extensión `.xpp` para que el editor
 * aplique el resaltado del lenguaje.
 */
export function previewUriFor(source: vscode.Uri, artifactName: string): vscode.Uri {
    const name = artifactName || basename(source.fsPath, extname(source.fsPath));
    return vscode.Uri.parse(`${XPP_SCHEME}:/${encodeURIComponent(name)}.xpp`).with({
        query: source.toString()
    });
}

/** Transpila el contenido de un archivo aplicando la configuración vigente. */
export function transpileWithConfig(uri: vscode.Uri, xml: string): TranspileResult {
    const config = readConfig(uri);
    return transpile(xml, {
        eol: config.eol,
        stripDocComments: config.stripDocComments,
        headerComment: config.headerComment,
        sourceLabel: config.headerComment ? vscode.workspace.asRelativePath(uri, false) : undefined
    });
}

/** Sirve el contenido de los documentos virtuales `xpp-preview:`. */
export class XppContentProvider
    implements vscode.TextDocumentContentProvider, vscode.Disposable
{
    private readonly onDidChangeEmitter = new vscode.EventEmitter<vscode.Uri>();
    readonly onDidChange = this.onDidChangeEmitter.event;

    private readonly subscriptions: vscode.Disposable[] = [];

    constructor(private readonly output: Logger) {
        // Si el XML de origen se guarda, la vista se regenera sola.
        this.subscriptions.push(
            vscode.workspace.onDidSaveTextDocument((document) => {
                this.refreshFor(document.uri);
            }),
            // Cambiar cómo se emite el código tiene que verse sin reabrir nada.
            vscode.workspace.onDidChangeConfiguration((e) => {
                if (
                    e.affectsConfiguration('xpp.transpile.stripDocComments') ||
                    e.affectsConfiguration('xpp.transpile.headerComment') ||
                    e.affectsConfiguration('xpp.transpile.eol')
                ) {
                    this.refreshAll();
                }
            })
        );
    }

    private refreshFor(sourceUri: vscode.Uri): void {
        const key = sourceUri.toString();
        for (const open of vscode.workspace.textDocuments) {
            if (open.uri.scheme === XPP_SCHEME && open.uri.query === key) {
                this.onDidChangeEmitter.fire(open.uri);
            }
        }
    }

    private refreshAll(): void {
        for (const open of vscode.workspace.textDocuments) {
            if (open.uri.scheme === XPP_SCHEME) {
                this.onDidChangeEmitter.fire(open.uri);
            }
        }
    }

    async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
        const source = vscode.Uri.parse(uri.query);
        try {
            const xml = await fs.readFile(source.fsPath, 'utf8');
            const result = transpileWithConfig(source, xml);

            for (const diagnostic of result.diagnostics) {
                this.output.appendLine(
                    `[${diagnostic.severity}] ${basename(source.fsPath)}: ${diagnostic.message}`
                );
            }

            if (result.empty) {
                return [
                    `// ${result.kind} ${result.name}`,
                    '//',
                    '// This artifact carries no embedded X++ source.',
                    ...result.diagnostics.map((d) => `// ${d.message}`)
                ].join('\n');
            }
            return result.xpp;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.output.error(`Could not reconstruct ${source.fsPath}: ${message}`);
            return `// Could not reconstruct this file.\n// ${message}`;
        }
    }

    dispose(): void {
        for (const s of this.subscriptions) {
            s.dispose();
        }
        this.onDidChangeEmitter.dispose();
    }
}

/** Desde la vista X++ se vuelve al XML que la originó, que viaja en el query. */
function sourceOfPreview(uri: vscode.Uri): vscode.Uri | undefined {
    if (uri.scheme === XPP_SCHEME && uri.query) {
        return vscode.Uri.parse(uri.query);
    }
    return undefined;
}

/**
 * ¿El comando se invocó parado sobre una vista X++? Devuelve su URI.
 *
 * Solo se mira el editor activo cuando el menú no pasó nada. Si el menú pasó un
 * archivo —el clic derecho sobre un XML en el explorador— la vista que esté
 * abierta puede ser de otro artefacto, y cerrarla sería cerrar lo que no toca.
 */
function invokedFromPreview(candidate?: vscode.Uri): vscode.Uri | undefined {
    if (candidate) {
        return candidate.scheme === XPP_SCHEME ? candidate : undefined;
    }
    const active = vscode.window.activeTextEditor?.document.uri;
    return active?.scheme === XPP_SCHEME ? active : undefined;
}

/** La pestaña abierta con ese URI, si hay alguna. */
function tabFor(uri: vscode.Uri): vscode.Tab | undefined {
    const key = uri.toString();
    for (const group of vscode.window.tabGroups.all) {
        for (const tab of group.tabs) {
            if (tab.input instanceof vscode.TabInputText && tab.input.uri.toString() === key) {
                return tab;
            }
        }
    }
    return undefined;
}

/**
 * Deja el archivo recién escrito en el lugar que ocupaba la vista virtual.
 *
 * Una vez que el `.xpp` existe en el disco, la vista es una copia redundante del
 * mismo contenido: dejar las dos abiertas obliga a elegir cuál mirar, y la que
 * no se puede editar es justamente la que queda arriba.
 *
 * Se abre el archivo primero y se cierra la vista después. Al revés, cerrar la
 * última pestaña de un grupo lo colapsa, y el archivo terminaría apareciendo en
 * otra columna.
 */
async function replacePreviewWithFile(
    previewUri: vscode.Uri,
    target: vscode.Uri
): Promise<void> {
    const tab = tabFor(previewUri);
    const document = await vscode.workspace.openTextDocument(target);
    await vscode.window.showTextDocument(document, {
        viewColumn: tab?.group.viewColumn ?? vscode.ViewColumn.Active,
        preview: false
    });
    if (tab) {
        await vscode.window.tabGroups.close(tab);
    }
}

/** Resuelve el XML sobre el que actuar: el que pasó el menú, o el del editor activo. */
async function resolveSource(candidate?: vscode.Uri): Promise<vscode.Uri | undefined> {
    // Los botones del título del editor pasan el URI del editor activo, que sobre
    // la vista X++ es el documento virtual. Hay que desenvolverlo: su `fsPath` no
    // existe en el disco y leerlo termina en un ENOENT contra la raíz del disco.
    if (candidate) {
        return sourceOfPreview(candidate) ?? candidate;
    }
    const active = vscode.window.activeTextEditor?.document;
    if (active?.languageId === 'xml') {
        return active.uri;
    }
    if (active) {
        const source = sourceOfPreview(active.uri);
        if (source) {
            return source;
        }
    }
    vscode.window.showWarningMessage('Open a D365FO metadata XML to reconstruct its X++.');
    return undefined;
}

/** Transpila un archivo del disco, devolviendo `undefined` si no es de metadatos. */
async function transpileFile(uri: vscode.Uri): Promise<TranspileResult | undefined> {
    const xml = await fs.readFile(uri.fsPath, 'utf8');
    try {
        return transpileWithConfig(uri, xml);
    } catch (error) {
        if (error instanceof NotMetadataError) {
            return undefined;
        }
        throw error;
    }
}

/**
 * Abre la vista X++ de un XML.
 *
 * `silent` evita los avisos cuando la apertura la dispara el usuario al abrir un
 * archivo cualquiera, en vez de pedirla explícitamente.
 *
 * `preserveFocus` por defecto es `false`: quien invoca el comando pidió ver el
 * X++, y dejarle el cursor en el XML es lo contrario de lo que pidió. Solo la
 * apertura automática lo pasa en `true`, porque ahí nadie pidió nada.
 */
export async function openPreview(
    source: vscode.Uri,
    options: { silent?: boolean; preserveFocus?: boolean } = {}
): Promise<boolean> {
    const config = readConfig(source);
    const result = await transpileFile(source);

    if (!result) {
        if (!options.silent) {
            void vscode.window.showWarningMessage(
                `${basename(source.fsPath)} is not a D365FO metadata XML.`
            );
        }
        return false;
    }
    if (result.empty && config.skipEmpty) {
        if (!options.silent) {
            void vscode.window.showInformationMessage(
                `${result.kind} ${result.name} carries no X++ source.`
            );
        }
        return false;
    }

    const document = await vscode.workspace.openTextDocument(previewUriFor(source, result.name));
    await vscode.languages.setTextDocumentLanguage(document, 'xpp');

    // `replace` cierra el XML; las otras dos lo dejan abierto.
    if (config.viewColumn === 'replace') {
        await vscode.window.showTextDocument(document, {
            preview: false,
            viewColumn: vscode.ViewColumn.Active
        });
        return true;
    }

    await vscode.window.showTextDocument(document, {
        preview: true,
        viewColumn: resolveViewColumn(config.viewColumn),
        preserveFocus: options.preserveFocus ?? false
    });
    return true;
}

/**
 * Pregunta cómo ordenar la salida.
 *
 * Se pregunta en vez de configurarse porque la respuesta depende de para qué es
 * la exportación, no de una preferencia estable: espejar sirve para comparar
 * contra el repositorio de origen, y agrupar por tipo sirve para leer todo un
 * tipo de artefacto de corrido. La misma persona quiere una u otra según el día.
 *
 * Devuelve `undefined` si se cancela, que es distinto de elegir un default.
 */
async function askExportLayout(): Promise<ExportLayout | undefined> {
    const picked = await vscode.window.showQuickPick(
        [
            {
                label: 'Mirror source folders',
                detail:
                    'Keep the folder structure of the metadata repository. Only the folders that end up with a file are created.',
                layout: 'mirror' as const
            },
            {
                label: 'Group by artifact type',
                detail: 'One folder per artifact type: AxClass, AxForm, AxTable...',
                layout: 'byType' as const
            },
            {
                label: 'XppSource convention',
                detail:
                    'One folder per model, with the type as a prefix: MyModel/AxClass_Foo.xpp. The same shape D365FO uses for its own XppSource folder.',
                layout: 'xppSource' as const
            }
        ],
        {
            title: 'Export metadata folder to .xpp',
            placeHolder: 'How should the exported files be organised?'
        }
    );
    return picked?.layout;
}

export function registerTranspileCommands(
    context: vscode.ExtensionContext,
    output: Logger
): void {
    const report = (error: unknown): void => {
        const message = error instanceof Error ? error.message : String(error);
        output.error(message);
        void vscode.window.showErrorMessage(`Could not reconstruct the X++: ${message}`);
    };

    // Unico comando de vista: desde el XML abre el X++, desde el X++ vuelve al
    // XML. Tener dos comandos para esto solo generaba la duda de cual usar.
    context.subscriptions.push(
        vscode.commands.registerCommand('xpp.transpile.toggle', async () => {
            const active = vscode.window.activeTextEditor?.document;
            if (!active) {
                return;
            }
            try {
                const origin = sourceOfPreview(active.uri);
                if (origin) {
                    const original = await vscode.workspace.openTextDocument(origin);
                    await vscode.window.showTextDocument(original, { preview: false });
                    return;
                }
                if (active.languageId === 'xml') {
                    await openPreview(active.uri);
                }
            } catch (error) {
                report(error);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('xpp.transpile.saveAs', async (candidate?: vscode.Uri) => {
            // Hay que mirarlo antes de resolver: `resolveSource` desenvuelve la
            // vista hasta el XML de origen y se pierde de donde vino el comando.
            const preview = invokedFromPreview(candidate);
            const source = await resolveSource(candidate);
            if (!source) {
                return;
            }
            try {
                const result = await transpileFile(source);
                if (!result || result.empty) {
                    vscode.window.showWarningMessage(
                        `${basename(source.fsPath)} has no X++ source to export.`
                    );
                    return;
                }

                const configured = readConfig(source).outputDirectory;
                const defaultDir = configured || join(source.fsPath, '..');
                const target = await vscode.window.showSaveDialog({
                    defaultUri: vscode.Uri.file(join(defaultDir, `${result.name}.xpp`)),
                    filters: { 'X++': ['xpp'] }
                });
                if (!target) {
                    return;
                }

                await fs.writeFile(target.fsPath, result.xpp, 'utf8');
                output.info(`Exported ${result.kind} ${result.name} to ${target.fsPath}`);

                if (preview) {
                    // Se exporto parado sobre la vista: el archivo real ocupa su
                    // lugar. La vista ya no aporta nada, y es la version que no
                    // se puede editar.
                    await replacePreviewWithFile(preview, target);
                    return;
                }

                // Desde el explorador no hay ninguna vista que reemplazar, y
                // abrir el archivo sacaria del contexto a quien solo queria el
                // .xpp en el disco. El boton deja esa decision de su lado.
                const answer = await vscode.window.showInformationMessage(
                    `Exported ${result.kind} ${result.name}.`,
                    'Open'
                );
                if (answer === 'Open') {
                    const document = await vscode.workspace.openTextDocument(target);
                    await vscode.window.showTextDocument(document);
                }
            } catch (error) {
                report(error);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('xpp.transpile.folder', async (folder?: vscode.Uri) => {
            const root =
                folder ??
                (
                    await vscode.window.showOpenDialog({
                        canSelectFolders: true,
                        canSelectFiles: false,
                        openLabel: 'Export this folder'
                    })
                )?.[0];
            if (!root) {
                return;
            }

            const destination = await vscode.window.showOpenDialog({
                canSelectFolders: true,
                canSelectFiles: false,
                openLabel: 'Save the .xpp files here'
            });
            if (!destination?.[0]) {
                return;
            }
            const outputRoot = destination[0].fsPath;

            const layout = await askExportLayout();
            if (!layout) {
                return;
            }

            await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: 'Exporting metadata to X++',
                    cancellable: true
                },
                async (progress, token) => {
                    // Se excluyen las carpetas generadas por el build: `XppMetadata`
                    // trae firmas de métodos sin cuerpo y `bin` no tiene fuentes.
                    const pattern = new vscode.RelativePattern(root, '**/*.xml');
                    const files = await vscode.workspace.findFiles(
                        pattern,
                        '**/{bin,XppMetadata,Descriptor}/**'
                    );

                    let written = 0;
                    let skipped = 0;

                    for (const [index, file] of files.entries()) {
                        if (token.isCancellationRequested) {
                            break;
                        }
                        progress.report({
                            message: `${index + 1}/${files.length}`,
                            increment: 100 / Math.max(files.length, 1)
                        });

                        try {
                            const result = await transpileFile(file);
                            if (!result || result.empty) {
                                skipped++;
                                continue;
                            }
                            const target = targetPathFor(
                                layout,
                                outputRoot,
                                root.fsPath,
                                file.fsPath,
                                result.kind,
                                result.name
                            );
                            await fs.mkdir(dirname(target), { recursive: true });
                            await fs.writeFile(target, result.xpp, 'utf8');
                            written++;
                        } catch (error) {
                            skipped++;
                            output.warn(
                                `Skipped ${file.fsPath}: ${
                                    error instanceof Error ? error.message : String(error)
                                }`
                            );
                        }
                    }

                    const summary = `Exported ${written} artifacts to ${outputRoot}. Skipped ${skipped} with no X++ source.`;
                    output.info(summary);
                    void vscode.window.showInformationMessage(summary);
                }
            );
        })
    );
}
