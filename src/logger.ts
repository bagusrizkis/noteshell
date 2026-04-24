import * as vscode from "vscode";

export class Logger implements vscode.Disposable {
  private readonly channel: vscode.OutputChannel;

  constructor(name = "Noteshell") {
    this.channel = vscode.window.createOutputChannel(name);
  }

  info(msg: string): void {
    this.channel.appendLine(`[info] ${msg}`);
  }

  warn(msg: string): void {
    this.channel.appendLine(`[warn] ${msg}`);
  }

  error(msg: string, err?: unknown): void {
    const detail = err instanceof Error ? `${err.message}\n${err.stack}` : err ? String(err) : "";
    this.channel.appendLine(`[error] ${msg}${detail ? "\n" + detail : ""}`);
  }

  show(): void {
    this.channel.show(true);
  }

  dispose(): void {
    this.channel.dispose();
  }
}
