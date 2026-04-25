import * as vscode from "vscode";
import { Logger } from "./logger.js";
import { ResultStore } from "./results/resultStore.js";
import { DecorationsController } from "./results/decorations.js";
import { showOutputDocument } from "./results/outputDocument.js";
import { showOutputWebview } from "./results/outputWebview.js";
import { NoteshellCodeLensProvider } from "./codeLensProvider.js";
import { Runner } from "./runner.js";
import { pickTerminal } from "./terminals/pickTerminal.js";
import { TerminalMemento } from "./terminals/memento.js";
import { buildSelectionSnippet } from "./parsers/shell.js";
import { onExtensionsChanged } from "./languageDetection.js";

export function activate(context: vscode.ExtensionContext): void {
  const logger = new Logger();
  const store = new ResultStore();
  const decorations = new DecorationsController(store);
  const memento = new TerminalMemento(context.workspaceState);
  const provider = new NoteshellCodeLensProvider(store, decorations);
  const runner = new Runner(store, logger);

  const selectors: vscode.DocumentSelector = [
    { language: "markdown" },
    { language: "shellscript" },
    { scheme: "file" },
    { scheme: "untitled" },
  ];

  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(selectors, provider),
  );

  async function resolveTerminal(docUri: vscode.Uri): Promise<vscode.Terminal | undefined> {
    const remember = vscode.workspace
      .getConfiguration("noteshell")
      .get<boolean>("rememberTerminalPerFile", true);
    if (remember) {
      const existing = await memento.recall(docUri);
      if (existing) return existing;
    }
    const picked = await pickTerminal();
    if (!picked) return undefined;
    if (remember) await memento.remember(docUri, picked.terminal);
    return picked.terminal;
  }

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "noteshell.runAtPosition",
      async (uri: vscode.Uri, snippetId: string) => {
        const doc = await vscode.workspace.openTextDocument(uri);
        provider.parseIfNeeded(doc);
        const snippet = provider.getSnippet(uri, snippetId);
        if (!snippet) {
          vscode.window.showWarningMessage("Noteshell: snippet not found (file may have changed).");
          return;
        }
        const terminal = await resolveTerminal(uri);
        if (!terminal) return;
        await runner.run(snippet, terminal, uri);
      },
    ),

    vscode.commands.registerCommand(
      "noteshell.runSelection",
      async (
        uri?: vscode.Uri,
        rangeArg?: { startLine: number; endLine: number; startCol?: number; endCol?: number },
      ) => {
        let docUri: vscode.Uri;
        let text: string;
        let snippetRange: { startLine: number; endLine: number; startCol?: number; endCol?: number };

        if (uri && rangeArg) {
          // Invoked from CodeLens with the range captured at render-time.
          const doc = await vscode.workspace.openTextDocument(uri);
          const start = new vscode.Position(rangeArg.startLine, rangeArg.startCol ?? 0);
          const endLine = doc.lineAt(Math.min(rangeArg.endLine, doc.lineCount - 1));
          const endCol = rangeArg.endCol ?? endLine.range.end.character;
          const end = new vscode.Position(rangeArg.endLine, endCol);
          text = doc.getText(new vscode.Range(start, end));
          docUri = uri;
          snippetRange = rangeArg;
        } else {
          // Invoked from command palette / context menu — use active selection.
          const editor = vscode.window.activeTextEditor;
          if (!editor) return;
          const sel = editor.selection;
          if (sel.isEmpty) {
            vscode.window.showInformationMessage("Noteshell: no selection.");
            return;
          }
          text = editor.document.getText(sel);
          docUri = editor.document.uri;
          snippetRange = {
            startLine: sel.start.line,
            endLine: sel.end.line,
            startCol: sel.start.character,
            endCol: sel.end.character,
          };
        }

        const snippet = buildSelectionSnippet(text, snippetRange, docUri.toString());
        if (!snippet) return;
        const terminal = await resolveTerminal(docUri);
        if (!terminal) return;
        await runner.run(snippet, terminal, docUri);
      },
    ),

    vscode.commands.registerCommand("noteshell.pickTerminal", async (uri?: vscode.Uri) => {
      const targetUri = uri ?? vscode.window.activeTextEditor?.document.uri;
      if (!targetUri) return;
      const picked = await pickTerminal();
      if (!picked) return;
      await memento.remember(targetUri, picked.terminal);
      vscode.window.showInformationMessage(`Noteshell: using '${picked.terminal.name}' for this file.`);
    }),

    vscode.commands.registerCommand("noteshell.showOutput", async (snippetId: string) => {
      const result = store.get(snippetId);
      if (!result) return;
      const viewer = vscode.workspace
        .getConfiguration("noteshell")
        .get<"log" | "terminal">("outputViewer", "log");
      if (viewer === "terminal") {
        await showOutputWebview(result);
      } else {
        await showOutputDocument(result);
      }
    }),

    vscode.commands.registerCommand("noteshell.clearResults", () => {
      store.clear();
    }),
  );

  context.subscriptions.push(
    vscode.window.onDidCloseTerminal((t) => memento.pruneClosed(t)),
    onExtensionsChanged(),
  );

  context.subscriptions.push(logger, store, decorations, provider);
}

export function deactivate(): void {}
