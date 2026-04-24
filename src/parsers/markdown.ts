import { Snippet, hashId } from "./types.js";

const FENCE_RE = /^(\s*)(```+|~~~+)\s*([^\s`]*)\s*$/;

interface FencedBlock {
  lang: string;
  startLine: number;
  endLine: number;
  contentLines: string[];
  contentStartLine: number;
}

function findFencedBlocks(text: string): FencedBlock[] {
  const lines = text.split(/\r?\n/);
  const blocks: FencedBlock[] = [];
  let i = 0;
  while (i < lines.length) {
    const m = lines[i].match(FENCE_RE);
    if (!m) {
      i++;
      continue;
    }
    const fenceMarker = m[2];
    const lang = (m[3] || "").toLowerCase();
    const start = i;
    const contentStart = i + 1;
    let end = -1;
    let j = contentStart;
    while (j < lines.length) {
      const closing = lines[j].match(FENCE_RE);
      if (closing && closing[2].startsWith(fenceMarker[0]) && closing[2].length >= fenceMarker.length && !closing[3]) {
        end = j;
        break;
      }
      j++;
    }
    if (end === -1) {
      i = contentStart;
      continue;
    }
    blocks.push({
      lang,
      startLine: start,
      endLine: end,
      contentLines: lines.slice(contentStart, end),
      contentStartLine: contentStart,
    });
    i = end + 1;
  }
  return blocks;
}

function commandFromPlainBlock(block: FencedBlock, uri: string): Snippet | null {
  const content = block.contentLines.join("\n").trim();
  if (!content) return null;
  const startLine = block.contentStartLine;
  const endLine = block.endLine - 1;
  return {
    id: hashId(`${uri}:md:${startLine}:${content}`),
    range: { startLine, endLine },
    commandText: content,
    source: "markdown",
  };
}

function commandsFromConsoleBlock(block: FencedBlock, uri: string): Snippet[] {
  const snippets: Snippet[] = [];
  const lines = block.contentLines;
  let i = 0;
  while (i < lines.length) {
    const raw = lines[i];
    const trimmedLeft = raw.replace(/^\s+/, "");
    if (!trimmedLeft.startsWith("$ ") && trimmedLeft !== "$") {
      i++;
      continue;
    }
    const commandParts: string[] = [];
    const firstContent = trimmedLeft === "$" ? "" : trimmedLeft.slice(2);
    commandParts.push(firstContent);
    const startLine = block.contentStartLine + i;
    let endLine = startLine;
    let j = i + 1;
    while (j < lines.length) {
      const nextTrim = lines[j].replace(/^\s+/, "");
      if (nextTrim.startsWith("> ")) {
        commandParts.push(nextTrim.slice(2));
        endLine = block.contentStartLine + j;
        j++;
      } else {
        break;
      }
    }
    const command = commandParts.join("\n").trim();
    if (command) {
      snippets.push({
        id: hashId(`${uri}:console:${startLine}:${command}`),
        range: { startLine, endLine },
        commandText: command,
        source: "markdown",
      });
    }
    i = j;
  }
  return snippets;
}

export function parseMarkdown(text: string, markdownLanguages: string[], uri: string): Snippet[] {
  const allowed = new Set(markdownLanguages.map((l) => l.toLowerCase()));
  const snippets: Snippet[] = [];
  for (const block of findFencedBlocks(text)) {
    if (!allowed.has(block.lang)) continue;
    if (block.lang === "console") {
      snippets.push(...commandsFromConsoleBlock(block, uri));
    } else {
      const snip = commandFromPlainBlock(block, uri);
      if (snip) snippets.push(snip);
    }
  }
  return snippets;
}
