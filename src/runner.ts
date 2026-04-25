import * as vscode from "vscode";
import { Snippet } from "./parsers/types.js";
import { ResultStore, ExecutionResult } from "./results/resultStore.js";
import { waitForShellIntegration } from "./terminals/shellIntegrationWait.js";
import { applyAnsiMode } from "./results/ansi.js";
import { renderWithTerminal } from "./results/terminalRender.js";
import { gateRun } from "./trust.js";
import { Logger } from "./logger.js";

const HARD_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const END_EVENT_GRACE_MS = 3000; // After read stream closes, wait 3s for end event.

export class Runner {
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

  async run(snippet: Snippet, terminal: vscode.Terminal, docUri: vscode.Uri): Promise<void> {
    const gate = await gateRun(snippet.commandText);
    if (!gate.ok) {
      this.logger.info(`refused to run ${snippet.id}: ${gate.reason}`);
      return;
    }

    const startedAt = Date.now();
    this.store.set({
      snippetId: snippet.id,
      status: "running",
      output: "",
      rawOutput: "",
      truncated: false,
      startedAt,
      commandText: snippet.commandText,
      docUri: docUri.toString(),
    });

    try {
      await Promise.race([
        this.execute(snippet, terminal, startedAt),
        new Promise<void>((_, reject) =>
          setTimeout(() => reject(new Error("run hard-timeout (10 minutes)")), HARD_TIMEOUT_MS),
        ),
      ]);
    } catch (err) {
      this.logger.error(`run ${snippet.id} failed`, err);
      const existing = this.store.get(snippet.id);
      if (existing && (existing.status === "running" || existing.status === "queued")) {
        this.store.update(snippet.id, {
          status: "failed",
          durationMs: Date.now() - startedAt,
        });
      }
    }
  }

  private async execute(
    snippet: Snippet,
    terminal: vscode.Terminal,
    startedAt: number,
  ): Promise<void> {
    const cfg = vscode.workspace.getConfiguration("noteshell");
    const ansiMode = cfg.get<"strip" | "preserve">("ansiInOutput", "strip");
    const cap = cfg.get<number>("outputCapBytes", 2_000_000);

    terminal.show(true);

    const si = await waitForShellIntegration(terminal);
    if (!si) {
      this.logger.warn(
        `shell integration not available on terminal '${terminal.name}' within 3s — falling back to sendText.`,
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

    // Subscribe to end events BEFORE awaiting the read stream so we don't miss
    // events that fire during the stream. Match by reference; multi-line
    // commands fire one end event per sub-execution but the API contract is
    // that we get back at least one matching the returned `execution`.
    const endPromise = this.awaitEnd(execution, terminal);
    const rawOutput = await this.readStream(execution, cap);

    // After the read stream closes, give the end event a short grace window.
    // If it never fires (multi-line / bug), proceed with unknown exit code so
    // the snippet doesn't stay stuck on "running" forever.
    const endEvent = await Promise.race([
      endPromise,
      new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), END_EVENT_GRACE_MS)),
    ]);

    const duration = Date.now() - startedAt;
    const truncated = rawOutput.length >= cap;
    const rawFinal = truncated ? rawOutput.slice(0, cap) : rawOutput;
    const output =
      ansiMode === "strip"
        ? await this.renderClean(rawFinal)
        : applyAnsiMode(rawFinal, ansiMode);
    const exitCode = endEvent?.exitCode;

    const patch: Partial<ExecutionResult> = {
      status: exitCode === undefined || exitCode === 0 ? "done" : "failed",
      exitCode,
      output,
      rawOutput: rawFinal,
      durationMs: duration,
      truncated,
    };
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

  private awaitEnd(
    execution: vscode.TerminalShellExecution,
    terminal: vscode.Terminal,
  ): Promise<vscode.TerminalShellExecutionEndEvent | undefined> {
    return new Promise((resolve) => {
      let lastTerminalEvent: vscode.TerminalShellExecutionEndEvent | undefined;
      const sub = vscode.window.onDidEndTerminalShellExecution((e) => {
        // Strict reference match — preferred.
        if (e.execution === execution) {
          sub.dispose();
          resolve(e);
          return;
        }
        // Fallback: track end events from same terminal so we have *something*
        // to use if the strict match never lands (compound command / sub-execution
        // reference mismatch). The grace-window race in execute() resolves with
        // undefined first if no strict match arrives; we just keep this around
        // for diagnostic completeness.
        if (e.terminal === terminal) {
          lastTerminalEvent = e;
        }
      });
      // Diagnostic only — no resolve from fallback path. The grace-window race
      // in execute() handles unblocking. We just log if a same-terminal event
      // arrived but no strict match did.
      void lastTerminalEvent;
    });
  }
}
