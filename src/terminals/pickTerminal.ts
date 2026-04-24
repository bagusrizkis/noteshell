import * as vscode from "vscode";

export interface TerminalPick {
  terminal: vscode.Terminal;
  isNew: boolean;
}

const NEW_TERMINAL_LABEL = "$(plus) New terminal";

export async function pickTerminal(
  preferredName?: string,
): Promise<TerminalPick | undefined> {
  const terminals = vscode.window.terminals;

  const items: (vscode.QuickPickItem & { terminal?: vscode.Terminal; isNew?: boolean })[] = [];

  for (const t of terminals) {
    const processId = await Promise.resolve(t.processId).catch(() => undefined);
    const detail = processId ? `pid ${processId}` : undefined;
    items.push({
      label: `$(terminal) ${t.name}`,
      detail,
      terminal: t,
    });
  }

  items.push({ label: NEW_TERMINAL_LABEL, isNew: true });

  if (terminals.length === 0) {
    items[0].picked = true;
  }

  const activeName = vscode.window.activeTerminal?.name ?? preferredName;
  const sorted = activeName
    ? items.sort((a, b) => {
        if (a.terminal?.name === activeName) return -1;
        if (b.terminal?.name === activeName) return 1;
        return 0;
      })
    : items;

  const picked = await vscode.window.showQuickPick(sorted, {
    title: "Noteshell — Run in terminal",
    placeHolder: "Pick a terminal to run the snippet in",
    ignoreFocusOut: false,
  });

  if (!picked) return undefined;

  if (picked.isNew) {
    const term = vscode.window.createTerminal("Noteshell");
    return { terminal: term, isNew: true };
  }

  if (picked.terminal) {
    return { terminal: picked.terminal, isNew: false };
  }

  return undefined;
}
