import * as vscode from "vscode";
import { Snippet } from "./parsers/types.js";
import { ResultStore, ExecutionResult } from "./results/resultStore.js";
import { waitForShellIntegration } from "./terminals/shellIntegrationWait.js";
import { applyAnsiMode } from "./results/ansi.js";
import { renderWithTerminal } from "./results/terminalRender.js";
import { gateRun } from "./trust.js";
import { Logger } from "./logger.js";

type TerminalQueue = Promise<void>;

export class Runner {
  private readonly queues = new WeakMap<vscode.Terminal, TerminalQueue>();
  private fallbackNoticeShown = false;

  constructor(
    private readonly store: ResultStore,
    private readonly logger: Logger,
  ) {}

  private maybeNotifyFallback(): void {
    if (this.fallbackNoticeShown) return;
    this.fallbackNoticeShown = true;
    void vscode.window
      .showWarningMessage(
        "Noteshell: shell integration isn't active, so output and exit codes can't be captured. Commands will run in the terminal but show only '▶ sent to terminal'.",
        "Open Logs",
        "Learn More",
      )
      .then((choice) => {
        if (choice === "Open Logs") this.logger.show();
        else if (choice === "Learn More") {
          void vscode.env.openExternal(
            vscode.Uri.parse("https://code.visualstudio.com/docs/terminal/shell-integration"),
          );
        }
      });
  }

  async run(
    snippet: Snippet,
    terminal: vscode.Terminal,
    docUri: vscode.Uri,
  ): Promise<void> {
    const gate = await gateRun(snippet.commandText);
    if (!gate.ok) {
      this.logger.info(`refused to run ${snippet.id}: ${gate.reason}`);
      return;
    }

    const existing = this.queues.get(terminal) ?? Promise.resolve();
    this.store.set({
      snippetId: snippet.id,
      status: "queued",
      output: "",
      rawOutput: "",
      truncated: false,
      startedAt: Date.now(),
      commandText: snippet.commandText,
      docUri: docUri.toString(),
    });

    const next = existing.then(() => this.execute(snippet, terminal));
    this.queues.set(
      terminal,
      next.catch((err) => {
        this.logger.error(`run ${snippet.id} failed`, err);
      }),
    );
    await next;
  }

  private async execute(
    snippet: Snippet,
    terminal: vscode.Terminal,
  ): Promise<void> {
    const cfg = vscode.workspace.getConfiguration("noteshell");
    const ansiMode = cfg.get<"strip" | "preserve">("ansiInOutput", "strip");
    const cap = cfg.get<number>("outputCapBytes", 2_000_000);

    terminal.show(true);

    const startedAt = Date.now();
    this.store.update(snippet.id, { status: "running", startedAt });

    const si = await waitForShellIntegration(terminal);
    if (!si) {
      this.logger.warn(
        `shell integration not available on terminal '${terminal.name}' within 3s — falling back to sendText. ` +
        `Check: (1) VSCode >= 1.99, (2) terminal.integrated.shellIntegration.enabled = true, ` +
        `(3) your shell is bash/zsh/fish/pwsh with auto-injection working.`,
      );
      this.maybeNotifyFallback();
      terminal.sendText(snippet.commandText, true);
      this.store.update(snippet.id, {
        status: "fireAndForget",
        output: "",
        rawOutput: "",
        durationMs: Date.now() - startedAt,
      });
      return;
    }

    let execution: vscode.TerminalShellExecution;
    try {
      execution = si.executeCommand(snippet.commandText);
    } catch (err) {
      this.logger.error("executeCommand failed; falling back to sendText", err);
      terminal.sendText(snippet.commandText, true);
      this.store.update(snippet.id, {
        status: "fireAndForget",
        durationMs: Date.now() - startedAt,
      });
      return;
    }

    const readPromise = this.readStream(execution, cap);
    const endPromise = this.awaitEnd(execution);

    const [rawOutput, endEvent] = await Promise.all([readPromise, endPromise]);
    const duration = Date.now() - startedAt;

    const truncated = rawOutput.length >= cap;
    const rawFinal = truncated ? rawOutput.slice(0, cap) : rawOutput;
    const output =
      ansiMode === "strip"
        ? await this.renderClean(rawFinal)
        : applyAnsiMode(rawFinal, ansiMode);
    const exitCode = endEvent?.exitCode;

    const patch: Partial<ExecutionResult> = {
      status: exitCode === 0 || exitCode === undefined ? "done" : "failed",
      exitCode,
      output,
      rawOutput: rawFinal,
      durationMs: duration,
      truncated,
    };
    if (exitCode !== undefined && exitCode !== 0) patch.status = "failed";
    this.store.update(snippet.id, patch);
  }

  private async renderClean(raw: string): Promise<string> {
    try {
      return await renderWithTerminal(raw);
    } catch (err) {
      this.logger.warn(
        `terminal emulator render failed, falling back to regex stripper: ${err instanceof Error ? err.message : String(err)}`,
      );
      return applyAnsiMode(raw, "strip");
    }
  }

  private async readStream(
    execution: vscode.TerminalShellExecution,
    cap: number,
  ): Promise<string> {
    let total = 0;
    const chunks: string[] = [];
    try {
      for await (const chunk of execution.read()) {
        if (total >= cap) break;
        chunks.push(chunk);
        total += chunk.length;
      }
    } catch (err) {
      this.logger.warn(`read stream error: ${err instanceof Error ? err.message : String(err)}`);
    }
    return chunks.join("");
  }

  private awaitEnd(execution: vscode.TerminalShellExecution): Promise<vscode.TerminalShellExecutionEndEvent | undefined> {
    return new Promise((resolve) => {
      const sub = vscode.window.onDidEndTerminalShellExecution((e) => {
        if (e.execution !== execution) return;
        sub.dispose();
        resolve(e);
      });
    });
  }
}
