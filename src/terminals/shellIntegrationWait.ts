import * as vscode from "vscode";

export function waitForShellIntegration(
  terminal: vscode.Terminal,
  timeoutMs = 3000,
): Promise<vscode.TerminalShellIntegration | null> {
  if (terminal.shellIntegration) return Promise.resolve(terminal.shellIntegration);

  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      disposable.dispose();
      resolve(terminal.shellIntegration ?? null);
    }, timeoutMs);

    const disposable = vscode.window.onDidChangeTerminalShellIntegration((e) => {
      if (e.terminal !== terminal) return;
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      disposable.dispose();
      resolve(e.shellIntegration);
    });
  });
}
