/**
 * Registro de la extensión.
 *
 * Se apoya en `OutputChannel`, que existe desde las primeras versiones de la
 * API, en vez de `LogOutputChannel`, que es bastante más reciente. Lo único que
 * aporta el segundo son los niveles, que acá se resuelven con un prefijo.
 */

import * as vscode from 'vscode';

export class Logger implements vscode.Disposable {
    private readonly channel: vscode.OutputChannel;

    constructor(name: string) {
        this.channel = vscode.window.createOutputChannel(name);
    }

    info(message: string): void {
        this.write('info', message);
    }

    warn(message: string): void {
        this.write('warn', message);
    }

    error(message: string): void {
        this.write('error', message);
    }

    appendLine(message: string): void {
        this.channel.appendLine(message);
    }

    show(preserveFocus = true): void {
        this.channel.show(preserveFocus);
    }

    private write(level: string, message: string): void {
        const stamp = new Date().toISOString().slice(11, 23);
        this.channel.appendLine(`[${stamp}] [${level}] ${message}`);
    }

    dispose(): void {
        this.channel.dispose();
    }
}
