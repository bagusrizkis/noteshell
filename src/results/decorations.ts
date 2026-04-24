import * as vscode from "vscode";
import { ExecutionResult, ResultStore } from "./resultStore.js";

function formatDuration(ms?: number): string {
  if (ms === undefined) return "";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function summaryFor(result: ExecutionResult): { text: string; color: vscode.ThemeColor } {
  const duration = formatDuration(result.durationMs);
  switch (result.status) {
    case "queued":
      return {
        text: "  ⏳ Queued",
        color: new vscode.ThemeColor("noteshell.runningForeground"),
      };
    case "running":
      return {
        text: "  ⏳ Running…",
        color: new vscode.ThemeColor("noteshell.runningForeground"),
      };
    case "fireAndForget":
      return {
        text: "  ▶ sent to terminal",
        color: new vscode.ThemeColor("noteshell.runningForeground"),
      };
    case "failed":
      return {
        text: `  ✗ exit ${result.exitCode ?? "?"}${duration ? " · " + duration : ""}${result.truncated ? " · truncated" : ""}`,
        color: new vscode.ThemeColor("noteshell.errorForeground"),
      };
    case "done":
    default:
      return {
        text: `  ✓ exit ${result.exitCode ?? 0}${duration ? " · " + duration : ""}${result.truncated ? " · truncated" : ""}`,
        color: new vscode.ThemeColor("noteshell.successForeground"),
      };
  }
}

export class DecorationsController implements vscode.Disposable {
  private readonly decorationType: vscode.TextEditorDecorationType;
  private readonly disposables: vscode.Disposable[] = [];
  private readonly snippetRanges = new Map<string, Map<string, vscode.Range>>();

  constructor(private readonly store: ResultStore) {
    this.decorationType = vscode.window.createTextEditorDecorationType({
      isWholeLine: false,
      rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
    });

    this.disposables.push(
      store.onDidChange(() => this.refreshAll()),
      vscode.window.onDidChangeActiveTextEditor(() => this.refreshAll()),
      vscode.window.onDidChangeVisibleTextEditors(() => this.refreshAll()),
    );
  }

  setSnippetLines(docUri: string, lines: Map<string, vscode.Range>): void {
    this.snippetRanges.set(docUri, lines);
    this.refreshAll();
  }

  private refreshAll(): void {
    for (const editor of vscode.window.visibleTextEditors) {
      this.refresh(editor);
    }
  }

  private refresh(editor: vscode.TextEditor): void {
    const docUri = editor.document.uri.toString();
    const ranges = this.snippetRanges.get(docUri);
    if (!ranges) {
      editor.setDecorations(this.decorationType, []);
      return;
    }
    const results = this.store.forDocument(docUri);
    const opts: vscode.DecorationOptions[] = [];
    for (const r of results) {
      const range = ranges.get(r.snippetId);
      if (!range) continue;
      const summary = summaryFor(r);
      opts.push({
        range,
        renderOptions: {
          after: {
            contentText: summary.text,
            color: summary.color,
            fontStyle: "italic",
          },
        },
      });
    }
    editor.setDecorations(this.decorationType, opts);
  }

  dispose(): void {
    this.decorationType.dispose();
    for (const d of this.disposables) d.dispose();
  }
}
