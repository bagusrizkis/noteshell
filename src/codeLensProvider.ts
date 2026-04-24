import * as vscode from "vscode";
import { Snippet } from "./parsers/types.js";
import { parseMarkdown } from "./parsers/markdown.js";
import { parseShell } from "./parsers/shell.js";
import { parseComments } from "./parsers/commentMarker.js";
import { ResultStore } from "./results/resultStore.js";
import { DecorationsController } from "./results/decorations.js";
import { getUserInstalledLanguages } from "./languageDetection.js";

interface CacheEntry {
  version: number;
  snippets: Snippet[];
}

export class NoteshellCodeLensProvider implements vscode.CodeLensProvider, vscode.Disposable {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly emitter = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this.emitter.event;
  private readonly disposables: vscode.Disposable[] = [];
  private readonly debounceHandles = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly store: ResultStore,
    private readonly decorations: DecorationsController,
  ) {
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((e) => {
        this.scheduleInvalidate(e.document);
      }),
      vscode.workspace.onDidCloseTextDocument((doc) => {
        this.cache.delete(doc.uri.toString());
      }),
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (
          e.affectsConfiguration("noteshell.markdownLanguages") ||
          e.affectsConfiguration("noteshell.commentScanLanguages") ||
          e.affectsConfiguration("noteshell.shellScriptCodeLens")
        ) {
          this.cache.clear();
          this.emitter.fire();
        }
      }),
      this.store.onDidChange(() => this.emitter.fire()),
      vscode.window.onDidChangeTextEditorSelection(() => this.emitter.fire()),
      vscode.extensions.onDidChange(() => {
        this.cache.clear();
        this.emitter.fire();
      }),
    );
  }

  private scheduleInvalidate(doc: vscode.TextDocument): void {
    const key = doc.uri.toString();
    const prev = this.debounceHandles.get(key);
    if (prev) clearTimeout(prev);
    const handle = setTimeout(() => {
      this.cache.delete(key);
      this.emitter.fire();
      this.debounceHandles.delete(key);
    }, 300);
    this.debounceHandles.set(key, handle);
  }

  getSnippet(docUri: vscode.Uri, snippetId: string): Snippet | undefined {
    const entry = this.cache.get(docUri.toString());
    if (!entry) return undefined;
    return entry.snippets.find((s) => s.id === snippetId);
  }

  parseIfNeeded(doc: vscode.TextDocument): Snippet[] {
    const key = doc.uri.toString();
    const cached = this.cache.get(key);
    if (cached && cached.version === doc.version) return cached.snippets;

    const cfg = vscode.workspace.getConfiguration("noteshell");
    const snippets = this.parse(doc, cfg);
    this.cache.set(key, { version: doc.version, snippets });
    this.publishDecorationRanges(doc, snippets);
    return snippets;
  }

  private parse(doc: vscode.TextDocument, cfg: vscode.WorkspaceConfiguration): Snippet[] {
    const uriStr = doc.uri.toString();
    const langId = doc.languageId;
    const text = doc.getText();

    if (langId === "markdown") {
      const langs = cfg.get<string[]>("markdownLanguages", ["bash", "sh", "shell", "console"]);
      return parseMarkdown(text, langs, uriStr);
    }

    if (langId === "shellscript") {
      const mode = cfg.get<string>("shellScriptCodeLens", "perBlock");
      if (mode === "off") return [];
      if (mode === "fileOnly") {
        const cmd = text.trim();
        if (!cmd) return [];
        return [
          {
            id: `file:${uriStr}`,
            range: { startLine: 0, endLine: 0 },
            commandText: cmd,
            source: "shell",
          },
        ];
      }
      return parseShell(text, uriStr);
    }

    const scanLangs = cfg.get<string[]>("commentScanLanguages", []);
    const inList = scanLangs.map((s) => s.toLowerCase()).includes(langId.toLowerCase());
    if (!inList) return [];

    const requireInstalled = cfg.get<boolean>("commentScanRequiresInstalledLanguage", true);
    if (requireInstalled && !getUserInstalledLanguages().has(langId)) return [];

    return parseComments(text, uriStr);
  }

  private publishDecorationRanges(doc: vscode.TextDocument, snippets: Snippet[]): void {
    const map = new Map<string, vscode.Range>();
    for (const s of snippets) {
      const endLineIdx = Math.min(s.range.endLine, Math.max(0, doc.lineCount - 1));
      const line = doc.lineAt(endLineIdx);
      map.set(s.id, line.range);
    }
    this.decorations.setSnippetLines(doc.uri.toString(), map);
  }

  provideCodeLenses(doc: vscode.TextDocument): vscode.CodeLens[] {
    const snippets = this.parseIfNeeded(doc);
    const lenses: vscode.CodeLens[] = [];
    for (const s of snippets) {
      const range = new vscode.Range(s.range.startLine, 0, s.range.startLine, 0);
      lenses.push(
        new vscode.CodeLens(range, {
          title: this.titleFor(s),
          command: "noteshell.runAtPosition",
          arguments: [doc.uri, s.id],
        }),
        new vscode.CodeLens(range, {
          title: "$(arrow-swap) Switch terminal",
          command: "noteshell.pickTerminal",
          arguments: [doc.uri],
        }),
      );
      const result = this.store.get(s.id);
      if (result && (result.status === "done" || result.status === "failed")) {
        lenses.push(
          new vscode.CodeLens(range, {
            title: "$(output) Show output",
            command: "noteshell.showOutput",
            arguments: [s.id],
          }),
        );
      }
    }

    const selectionLens = this.selectionLensFor(doc, snippets);
    if (selectionLens) lenses.push(selectionLens);

    return lenses;
  }

  private selectionLensFor(
    doc: vscode.TextDocument,
    snippets: Snippet[],
  ): vscode.CodeLens | undefined {
    const editor = vscode.window.visibleTextEditors.find(
      (e) => e.document.uri.toString() === doc.uri.toString(),
    );
    if (!editor) return undefined;
    const sel = editor.selection;
    if (sel.isEmpty) return undefined;
    if (doc.getText(sel).trim().length === 0) return undefined;

    const langId = doc.languageId;
    if (langId === "shellscript") {
      // allow
    } else if (langId === "markdown") {
      // Only show when selection is inside a parsed shell-fenced block.
      const insideFence = snippets.some(
        (s) =>
          sel.start.line >= s.range.startLine && sel.end.line <= s.range.endLine,
      );
      if (!insideFence) return undefined;
    } else {
      return undefined;
    }

    const anchorLine = sel.start.line;
    const range = new vscode.Range(anchorLine, 0, anchorLine, 0);
    return new vscode.CodeLens(range, {
      title: "$(play) Run selection",
      command: "noteshell.runSelection",
      arguments: [],
    });
  }

  private titleFor(snippet: Snippet): string {
    const result = this.store.get(snippet.id);
    if (!result) return "$(play) Run";
    switch (result.status) {
      case "queued":
        return "⏳ Queued";
      case "running":
        return "⏳ Running…";
      case "fireAndForget":
        return "▶ Sent (no capture)";
      case "failed":
        return `✗ exit ${result.exitCode ?? "?"} · Run again`;
      case "done":
        return `✓ exit ${result.exitCode ?? 0} · Run again`;
      default:
        return "$(play) Run";
    }
  }

  dispose(): void {
    for (const h of this.debounceHandles.values()) clearTimeout(h);
    for (const d of this.disposables) d.dispose();
    this.emitter.dispose();
  }
}
