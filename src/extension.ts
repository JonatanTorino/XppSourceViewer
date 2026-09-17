/**
 * Punto de entrada de la extensión.
 *
 * El trabajo real vive en `transpiler/`, que no sabe nada de VS Code y por eso
 * se testea con Node a secas. Este archivo solo lo conecta con la API del
 * editor: comandos, menús, y la apertura automática.
 */

import * as vscode from 'vscode';

import {
    openPreview,
    registerTranspileCommands,
    XppContentProvider
} from './commands/transpileCommands';
import { passesPathFilters, passesTypeFilter, readConfig } from './config';
import { Logger } from './logger';
import { looksLikeMetadata, transpile } from './transpiler';
import { AutoPreviewState } from './statusBar';

/** Esquema de los documentos virtuales con el X++ reconstruido. */
export const XPP_SCHEME = 'xpp-preview';

export function activate(context: vscode.ExtensionContext): void {
    const output = new Logger('X++ Source Viewer');
    const autoState = new AutoPreviewState();
    context.subscriptions.push(output, autoState);

    const provider = new XppContentProvider(output);
    context.subscriptions.push(
        vscode.workspace.registerTextDocumentContentProvider(XPP_SCHEME, provider),
        provider
    );

    registerTranspileCommands(context, output);

    // Pausa y reanuda la apertura automática sin pasar por la configuración.
    //
    // Es la salida rápida: un clic en la barra de estado y deja de abrirse
    // sola, sin tener que buscar un setting ni reiniciar nada. La pausa dura lo
    // que dure la sesión.
    context.subscriptions.push(
        vscode.commands.registerCommand('xpp.transpile.toggleAuto', () => {
            const suspended = autoState.toggleSuspended();
            output.info(
                suspended
                    ? 'Automatic opening paused for this session.'
                    : 'Automatic opening resumed.'
            );
        })
    );

    // El botón del título del editor solo aparece sobre XML que son de metadatos.
    const updateContext = (editor: vscode.TextEditor | undefined): void => {
        const isMetadata =
            editor?.document.languageId === 'xml' && looksLikeMetadata(editor.document.getText());
        void vscode.commands.executeCommand('setContext', 'xpp:isMetadata', isMetadata === true);
    };
    updateContext(vscode.window.activeTextEditor);
    context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(updateContext));

    // Apertura automática de la vista X++, desactivada por defecto.
    //
    // La vista es un documento virtual de solo lectura: no se escribe nada al
    // disco. Antes de abrir nada pasan tres filtros —la pausa de la sesión, la
    // ruta y el tipo de artefacto— para que abrir un XML cualquiera no
    // interrumpa lo que se esté haciendo.
    context.subscriptions.push(
        vscode.workspace.onDidOpenTextDocument(async (document) => {
            if (document.languageId !== 'xml' || document.uri.scheme !== 'file') {
                return;
            }
            if (!autoState.isAutoActive()) {
                return;
            }

            const config = readConfig(document.uri);
            if (!passesPathFilters(document.uri, config)) {
                return;
            }

            const text = document.getText();
            if (!looksLikeMetadata(text)) {
                return;
            }

            // Se parsea acá para poder filtrar por tipo y saltear los artefactos
            // sin código antes de abrir nada.
            let kind: string;
            let empty: boolean;
            let name: string;
            try {
                const result = transpile(text, { eol: config.eol });
                kind = result.kind;
                empty = result.empty;
                name = result.name;
            } catch {
                return;
            }

            if (!passesTypeFilter(kind, config)) {
                return;
            }
            if (empty && config.skipEmpty) {
                return;
            }

            if (config.autoPreview === 'ask') {
                const answer = await vscode.window.showInformationMessage(
                    `${kind} ${name}: view as X++?`,
                    'View',
                    'Not now',
                    'Pause for this session'
                );
                if (answer === 'Pause for this session') {
                    await vscode.commands.executeCommand('xpp.transpile.toggleAuto');
                    return;
                }
                if (answer !== 'View') {
                    return;
                }
            }

            try {
                // Nadie pidió esto: se abrio un XML y la vista aparece sola. Por eso
                // respeta `preserveFocus`, que existe para no interrumpir.
                await openPreview(document.uri, {
                    silent: true,
                    preserveFocus: config.preserveFocus
                });
            } catch (error) {
                output.error(error instanceof Error ? error.message : String(error));
            }
        })
    );

    output.info('X++ Source Viewer extension activated.');
}

export function deactivate(): void {
    // Todo lo que hay que liberar está en `context.subscriptions`.
}
