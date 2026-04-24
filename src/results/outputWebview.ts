import * as vscode from "vscode";
import { ExecutionResult } from "./resultStore.js";
import { renderToAnsi } from "./terminalRender.js";

const panels = new Map<string, vscode.WebviewPanel>();

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function ansiToHtml(raw: string): string {
  const resetColor = "</span>";
  let out = "";
  let open = 0;
  let i = 0;
  while (i < raw.length) {
    const esc = raw.indexOf("[", i);
    if (esc === -1) {
      out += escapeHtml(raw.slice(i));
      break;
    }
    out += escapeHtml(raw.slice(i, esc));
    const end = raw.indexOf("m", esc);
    if (end === -1) {
      i = esc + 2;
      continue;
    }
    const codes = raw
      .slice(esc + 2, end)
      .split(";")
      .map((n) => parseInt(n, 10) || 0);
    for (const code of codes) {
      if (code === 0) {
        while (open > 0) {
          out += resetColor;
          open--;
        }
      } else if (code === 1) {
        out += `<span style="font-weight:bold">`;
        open++;
      } else if (code === 3) {
        out += `<span style="font-style:italic">`;
        open++;
      } else if (code === 4) {
        out += `<span style="text-decoration:underline">`;
        open++;
      } else if (code >= 30 && code <= 37) {
        const colors = ["#000", "#cd3131", "#0dbc79", "#e5e510", "#2472c8", "#bc3fbc", "#11a8cd", "#e5e5e5"];
        out += `<span style="color:${colors[code - 30]}">`;
        open++;
      } else if (code >= 90 && code <= 97) {
        const colors = ["#666", "#f14c4c", "#23d18b", "#f5f543", "#3b8eea", "#d670d6", "#29b8db", "#e5e5e5"];
        out += `<span style="color:${colors[code - 90]}">`;
        open++;
      }
    }
    i = end + 1;
  }
  while (open > 0) {
    out += resetColor;
    open--;
  }
  return out;
}

async function renderHtml(result: ExecutionResult): Promise<string> {
  const started = new Date(result.startedAt).toISOString();
  const exit = result.exitCode !== undefined ? String(result.exitCode) : "?";
  const duration = result.durationMs !== undefined ? `${result.durationMs}ms` : "—";
  let bodyAnsi: string;
  try {
    bodyAnsi = result.rawOutput ? await renderToAnsi(result.rawOutput) : (result.output || "(no captured output)");
  } catch {
    bodyAnsi = result.output || result.rawOutput || "(no captured output)";
  }
  const body = ansiToHtml(bodyAnsi);
  const trunc = result.truncated ? `<div class="trunc">Output truncated at cap.</div>` : "";
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
  <style>
    body { font-family: var(--vscode-editor-font-family, monospace); font-size: 13px; color: var(--vscode-editor-foreground); background: var(--vscode-editor-background); margin: 0; padding: 12px; }
    header { border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: 8px; margin-bottom: 8px; opacity: 0.75; }
    pre { white-space: pre-wrap; word-break: break-word; margin: 0; }
    .trunc { color: var(--vscode-editorWarning-foreground); margin-top: 8px; }
    .meta { display: grid; grid-template-columns: max-content 1fr; gap: 2px 12px; }
  </style>
</head>
<body>
  <header>
    <div class="meta">
      <div>started</div><div>${escapeHtml(started)}</div>
      <div>duration</div><div>${escapeHtml(duration)}</div>
      <div>exit</div><div>${escapeHtml(exit)}</div>
      <div>command</div><div>${escapeHtml(result.commandText)}</div>
    </div>
  </header>
  <pre>${body}</pre>
  ${trunc}
</body>
</html>`;
}

export async function showOutputWebview(result: ExecutionResult): Promise<void> {
  let panel = panels.get(result.snippetId);
  if (!panel) {
    panel = vscode.window.createWebviewPanel(
      "noteshellOutput",
      `Noteshell · ${truncateTitle(result.commandText)}`,
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      { enableScripts: false, retainContextWhenHidden: true },
    );
    panels.set(result.snippetId, panel);
    panel.onDidDispose(() => panels.delete(result.snippetId));
  }
  panel.webview.html = await renderHtml(result);
  panel.reveal(vscode.ViewColumn.Beside, true);
}

function truncateTitle(s: string): string {
  const firstLine = s.split(/\r?\n/)[0];
  return firstLine.length > 48 ? firstLine.slice(0, 45) + "…" : firstLine;
}
