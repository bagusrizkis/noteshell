import * as vscode from "vscode";

export type RunStatus = "running" | "queued" | "done" | "failed" | "fireAndForget";

export interface ExecutionResult {
  snippetId: string;
  status: RunStatus;
  exitCode?: number;
  output: string;
  rawOutput: string;
  durationMs?: number;
  truncated: boolean;
  startedAt: number;
  commandText: string;
  docUri: string;
}

export class ResultStore {
  private readonly results = new Map<string, ExecutionResult>();
  private readonly emitter = new vscode.EventEmitter<string>();
  readonly onDidChange = this.emitter.event;

  get(snippetId: string): ExecutionResult | undefined {
    return this.results.get(snippetId);
  }

  set(result: ExecutionResult): void {
    this.results.set(result.snippetId, result);
    this.emitter.fire(result.snippetId);
  }

  update(snippetId: string, patch: Partial<ExecutionResult>): void {
    const existing = this.results.get(snippetId);
    if (!existing) return;
    this.results.set(snippetId, { ...existing, ...patch });
    this.emitter.fire(snippetId);
  }

  forDocument(docUri: string): ExecutionResult[] {
    const out: ExecutionResult[] = [];
    for (const r of this.results.values()) {
      if (r.docUri === docUri) out.push(r);
    }
    return out;
  }

  clear(): void {
    const ids = [...this.results.keys()];
    this.results.clear();
    for (const id of ids) this.emitter.fire(id);
  }

  dispose(): void {
    this.emitter.dispose();
  }
}
