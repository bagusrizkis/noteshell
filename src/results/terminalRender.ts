import { Terminal } from "@xterm/headless";
import { SerializeAddon } from "@xterm/addon-serialize";

interface RenderOptions {
  cols?: number;
  scrollback?: number;
}

async function writeAndSettle(term: Terminal, data: string): Promise<void> {
  await new Promise<void>((resolve) => {
    term.write(data, () => resolve());
  });
}

function makeTerminal(opts: RenderOptions): Terminal {
  const cols = opts.cols ?? 200;
  const scrollback = opts.scrollback ?? 20000;
  return new Terminal({ cols, rows: 24, scrollback, allowProposedApi: true });
}

// Render raw PTY bytes through a headless terminal and return plain text
// matching what VSCode's integrated terminal would visually show.
export async function renderWithTerminal(
  rawOutput: string,
  opts: RenderOptions = {},
): Promise<string> {
  if (!rawOutput) return "";
  const term = makeTerminal(opts);
  await writeAndSettle(term, rawOutput);

  const buf = term.buffer.active;
  const lines: string[] = [];
  for (let y = 0; y < buf.length; y++) {
    const line = buf.getLine(y);
    lines.push(line ? line.translateToString(true) : "");
  }
  term.dispose();

  while (lines.length && lines[lines.length - 1] === "") lines.pop();
  while (lines.length && lines[0] === "") lines.shift();

  return lines.join("\n") + (lines.length ? "\n" : "");
}

// Any CSI sequence whose final byte is NOT "m" (non-SGR — cursor moves, erase,
// etc). We strip these since they're meaningless for display and leak as
// literal text when rendered to HTML.
const NON_SGR_CSI_RE = /\x1B\[[0-9;?]*[ -/]*[@-ln-~]/g;

// Render raw PTY bytes through a headless terminal and return an ANSI stream
// containing only the meaningful content (OSC stripped, SGR colors preserved).
// Suitable for feeding into an ANSI-to-HTML renderer.
export async function renderToAnsi(
  rawOutput: string,
  opts: RenderOptions = {},
): Promise<string> {
  if (!rawOutput) return "";
  const term = makeTerminal(opts);
  const serialize = new SerializeAddon();
  term.loadAddon(serialize);
  await writeAndSettle(term, rawOutput);

  let ansi = serialize.serialize({ scrollback: term.buffer.active.length });
  term.dispose();

  // Strip non-SGR CSI sequences (cursor movements etc).
  ansi = ansi.replace(NON_SGR_CSI_RE, "");

  // Trim trailing whitespace per line (padding from fixed terminal width).
  const lines = ansi.split("\n").map((l) => l.replace(/\s+$/, ""));
  while (lines.length && lines[lines.length - 1] === "") lines.pop();
  while (lines.length && lines[0] === "") lines.shift();
  return lines.join("\n") + (lines.length ? "\n" : "");
}
