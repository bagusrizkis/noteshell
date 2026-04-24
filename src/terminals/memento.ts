import * as vscode from "vscode";

interface StoredTerminal {
  name: string;
  processId?: number;
}

const STATE_PREFIX = "noteshell.terminalFor:";

export class TerminalMemento {
  constructor(private readonly state: vscode.Memento) {}

  private keyFor(uri: vscode.Uri): string {
    return `${STATE_PREFIX}${uri.toString()}`;
  }

  async remember(uri: vscode.Uri, terminal: vscode.Terminal): Promise<void> {
    const processId = await Promise.resolve(terminal.processId).catch(() => undefined);
    const stored: StoredTerminal = { name: terminal.name, processId };
    await this.state.update(this.keyFor(uri), stored);
  }

  async recall(uri: vscode.Uri): Promise<vscode.Terminal | undefined> {
    const stored = this.state.get<StoredTerminal>(this.keyFor(uri));
    if (!stored) return undefined;
    const terminals = vscode.window.terminals;

    if (stored.processId !== undefined) {
      for (const t of terminals) {
        const pid = await Promise.resolve(t.processId).catch(() => undefined);
        if (pid === stored.processId) return t;
      }
    }
    return terminals.find((t) => t.name === stored.name);
  }

  forget(uri: vscode.Uri): Thenable<void> {
    return this.state.update(this.keyFor(uri), undefined);
  }

  pruneClosed(closed: vscode.Terminal): void {
    const keys = this.state.keys().filter((k) => k.startsWith(STATE_PREFIX));
    for (const key of keys) {
      const stored = this.state.get<StoredTerminal>(key);
      if (!stored) continue;
      if (stored.name === closed.name) {
        void this.state.update(key, undefined);
      }
    }
  }
}
