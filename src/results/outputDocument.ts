import * as vscode from "vscode";
import { ExecutionResult } from "./resultStore.js";

function header(result: ExecutionResult): string {
  const started = new Date(result.startedAt).toISOString();
  const duration = result.durationMs !== undefined ? `${result.durationMs}ms` : "—";
  const exit = result.exitCode !== undefined ? String(result.exitCode) : "unknown";
  const trunc = result.truncated ? " (truncated)" : "";
  return [
    `# Noteshell output`,
    `# started:  ${started}`,
    `# duration: ${duration}`,
    `# exit:     ${exit}${trunc}`,
    `# command:  ${result.commandText.split(/\r?\n/).join(" ↵ ")}`,
    ``,
  ].join("\n");
}

export async function showOutputDocument(result: ExecutionResult): Promise<void> {
  const content = header(result) + (result.output || "(no captured output)");
  const doc = await vscode.workspace.openTextDocument({
    content,
    language: "log",
  });
  await vscode.window.showTextDocument(doc, {
    viewColumn: vscode.ViewColumn.Beside,
    preview: true,
    preserveFocus: true,
  });
}
