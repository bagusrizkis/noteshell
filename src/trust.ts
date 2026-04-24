import * as vscode from "vscode";

export type ConfirmMode = "always" | "untrusted" | "never";

function previewCommand(cmd: string, maxLines = 5): string {
  const lines = cmd.split(/\r?\n/);
  if (lines.length <= maxLines) return cmd;
  return lines.slice(0, maxLines).join("\n") + `\n… (${lines.length - maxLines} more lines)`;
}

export async function gateRun(commandText: string): Promise<{ ok: boolean; reason?: string }> {
  const cfg = vscode.workspace.getConfiguration("noteshell");
  const confirm = cfg.get<ConfirmMode>("confirmBeforeRun", "untrusted");
  const trusted = vscode.workspace.isTrusted;

  if (!trusted) {
    const choice = await vscode.window.showWarningMessage(
      `Run this command in an untrusted workspace?\n\n${previewCommand(commandText)}`,
      { modal: true },
      "Run anyway",
      "Cancel",
    );
    if (choice !== "Run anyway") return { ok: false, reason: "untrusted workspace" };
    return { ok: true };
  }

  if (confirm === "always") {
    const choice = await vscode.window.showWarningMessage(
      `Run this command?\n\n${previewCommand(commandText)}`,
      { modal: true },
      "Run",
      "Cancel",
    );
    if (choice !== "Run") return { ok: false, reason: "user cancelled" };
  }
  return { ok: true };
}
