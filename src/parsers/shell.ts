import { Snippet, SnippetRange, hashId } from "./types.js";

function isBlank(line: string): boolean {
  return line.trim().length === 0;
}

function isShebang(line: string, index: number): boolean {
  return index === 0 && line.startsWith("#!");
}

export function parseShell(text: string, uri: string): Snippet[] {
  const lines = text.split(/\r?\n/);
  const snippets: Snippet[] = [];
  let i = 0;
  while (i < lines.length) {
    if (isBlank(lines[i]) || isShebang(lines[i], i)) {
      i++;
      continue;
    }
    const startLine = i;
    let endLine = i;
    const buf: string[] = [];
    while (i < lines.length && !isBlank(lines[i])) {
      buf.push(lines[i]);
      endLine = i;
      i++;
    }
    const command = buf.join("\n").trim();
    if (command.length === 0) continue;
    snippets.push({
      id: hashId(`${uri}:sh:${startLine}:${command}`),
      range: { startLine, endLine },
      commandText: command,
      source: "shell",
    });
  }
  return snippets;
}

export function buildSelectionSnippet(
  text: string,
  range: SnippetRange,
  uri: string,
): Snippet | null {
  const command = text.trim();
  if (!command) return null;
  return {
    id: hashId(`${uri}:sel:${range.startLine}:${range.startCol ?? 0}:${command}`),
    range,
    commandText: command,
    source: "selection",
  };
}
