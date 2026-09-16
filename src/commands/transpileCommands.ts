/**
 * Comandos de transpilación y la vista virtual de X++.
 */

import { promises as fs } from 'node:fs';
import { basename, extname, join } from 'node:path';

import * as vscode from 'vscode';

import { readConfig, resolveViewColumn } from '../config';
import { XPP_SCHEME } from '../extension';
import type { Logger } from '../logger';
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
                    '// Este artefacto no tiene código X++ embebido.',
                    ...result.diagnostics.map((d) => `// ${d.message}`)
                ].join('\n');
            }
            return result.xpp;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.output.error(`No se pudo transpilar ${source.fsPath}: ${message}`);
            return `// No se pudo transpilar este archivo.\n// ${message}`;
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
    vscode.window.showWarningMessage('Abrí un XML de metadatos de D365FO para transpilarlo.');
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
 */
export async function openPreview(
    source: vscode.Uri,
    options: { silent?: boolean } = {}
): Promise<boolean> {
    const config = readConfig(source);
    const result = await transpileFile(source);

    if (!result) {
        if (!options.silent) {
            void vscode.window.showWarningMessage(
                `${basename(source.fsPath)} no es un XML de metadatos de D365FO.`
            );
        }
        return false;
    }
    if (result.empty && config.skipEmpty) {
        if (!options.silent) {
            void vscode.window.showInformationMessage(
                `${result.kind} ${result.name} no tiene código X++.`
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
        preserveFocus: config.preserveFocus
    });
    return true;
}

export function registerTranspileCommands(
    context: vscode.ExtensionContext,
    output: Logger
): void {
    const report = (error: unknown): void => {
        const message = error instanceof Error ? error.message : String(error);
        output.error(message);
        void vscode.window.showErrorMessage(`No se pudo transpilar: ${message}`);
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
            const source = await resolveSource(candidate);
            if (!source) {
                return;
            }
            try {
                const result = await transpileFile(source);
                if (!result || result.empty) {
                    vscode.window.showWarningMessage(
                        `${basename(source.fsPath)} no tiene código X++ para exportar.`
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
                const open = await vscode.workspace.openTextDocument(target);
                await vscode.window.showTextDocument(open);
                output.info(`Exportado ${result.kind} ${result.name} a ${target.fsPath}`);
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
                        openLabel: 'Exportar esta carpeta'
                    })
                )?.[0];
            if (!root) {
                return;
            }

            const destination = await vscode.window.showOpenDialog({
                canSelectFolders: true,
                canSelectFiles: false,
                openLabel: 'Guardar los .xpp acá'
            });
            if (!destination?.[0]) {
                return;
            }
            const outputRoot = destination[0].fsPath;

            await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: 'Exportando metadatos a X++',
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
                            const targetDir = join(outputRoot, result.kind);
                            await fs.mkdir(targetDir, { recursive: true });
                            await fs.writeFile(
                                join(targetDir, `${result.name}.xpp`),
                                result.xpp,
                                'utf8'
                            );
                            written++;
                        } catch (error) {
                            skipped++;
                            output.warn(
                                `Se omitió ${file.fsPath}: ${
                                    error instanceof Error ? error.message : String(error)
                                }`
                            );
                        }
                    }

                    const summary = `Se exportaron ${written} artefactos a ${outputRoot}. Se omitieron ${skipped} sin código X++.`;
                    output.info(summary);
                    void vscode.window.showInformationMessage(summary);
                }
            );
        })
    );
}
