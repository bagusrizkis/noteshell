import { Snippet, hashId } from "./types.js";

// Universal line-comment matcher:
//   leading whitespace, one of (#, //, --, ;), optional space, marker ($ or run:), command.
// Covers every common scripting / config language without per-language tables.
const COMMENT_MARKER_RE = /^\s*(?:#|\/\/|--|;)[ \t]*(?:\$ |run:\s*)(.+)$/;

export function parseComments(text: string, uri: string): Snippet[] {
  const lines = text.split(/\r?\n/);
  const snippets: Snippet[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(COMMENT_MARKER_RE);
    if (!m) continue;
    const cmd = m[1].trim();
    if (!cmd) continue;
    snippets.push({
      id: hashId(`${uri}:cm:${i}:${cmd}`),
      range: { startLine: i, endLine: i },
      commandText: cmd,
      source: "comment",
    });
  }
  return snippets;
}
