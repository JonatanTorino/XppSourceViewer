/**
 * Indicador de la barra de estado.
 *
 * Deja ver de un vistazo si la vista X++ se va a abrir sola, y cambiarlo con un
 * clic sin pasar por la configuración.
 *
 * La pausa es **de la sesión**, no se persiste: es una pausa, no un cambio de
 * preferencia. Al reabrir VS Code vuelve a lo que diga la configuración.
 */

import * as vscode from 'vscode';

import { readConfig } from './config';

export class AutoPreviewState implements vscode.Disposable {
    private suspended = false;
    private readonly item: vscode.StatusBarItem;
    private readonly subscriptions: vscode.Disposable[] = [];
    private readonly onDidChangeEmitter = new vscode.EventEmitter<boolean>();

    readonly onDidChange = this.onDidChangeEmitter.event;

    constructor() {
        this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        this.subscriptions.push(
            vscode.window.onDidChangeActiveTextEditor(() => this.refresh()),
            vscode.workspace.onDidChangeConfiguration((e) => {
                if (e.affectsConfiguration('xpp.transpile')) {
                    this.refresh();
                }
            })
        );
        this.refresh();
    }

    /** ¿Se debe abrir la vista automáticamente en este momento? */
    isAutoActive(): boolean {
        return !this.suspended && readConfig().autoPreview !== 'never';
    }

    isSuspended(): boolean {
        return this.suspended;
    }

    /** Alterna la pausa y devuelve el estado resultante. */
    toggleSuspended(): boolean {
        this.suspended = !this.suspended;
        this.refresh();
        this.onDidChangeEmitter.fire(this.suspended);
        return this.suspended;
    }

    /**
     * Actualiza el texto y la acción del indicador.
     *
     * El clic hace lo más útil según el estado: si la apertura automática está
     * andando, la pausa; si está pausada, la reanuda; y si está apagada por
     * configuración, abre la vista del archivo actual.
     */
    private refresh(): void {
        const editor = vscode.window.activeTextEditor;
        const relevant =
            editor?.document.languageId === 'xml' ||
            editor?.document.languageId === 'xpp' ||
            editor?.document.uri.scheme === 'xpp-preview';

        if (!relevant) {
            this.item.hide();
            return;
        }

        const mode = readConfig().autoPreview;

        if (mode === 'never') {
            this.item.text = '$(file-code) X++';
            this.item.tooltip =
                'View this artifact as X++.\nAutomatic opening is off (xpp.transpile.autoPreview).';
            this.item.command = 'xpp.transpile.toggle';
            this.item.backgroundColor = undefined;
        } else if (this.suspended) {
            this.item.text = '$(circle-slash) X++ paused';
            this.item.tooltip =
                'Automatic opening is paused for this session.\nClick to resume it.';
            this.item.command = 'xpp.transpile.toggleAuto';
            this.item.backgroundColor = new vscode.ThemeColor(
                'statusBarItem.warningBackground'
            );
        } else {
            this.item.text = mode === 'ask' ? '$(question) X++ ask' : '$(sync) X++ auto';
            this.item.tooltip =
                'Automatic opening is active.\nClick to pause it for this session.';
            this.item.command = 'xpp.transpile.toggleAuto';
            this.item.backgroundColor = undefined;
        }

        this.item.show();
    }

    dispose(): void {
        this.item.dispose();
        this.onDidChangeEmitter.dispose();
        for (const s of this.subscriptions) {
            s.dispose();
        }
    }
}
