const ESC = String.fromCharCode(0x1b);
const BEL = String.fromCharCode(0x07);
const FF = String.fromCharCode(0x0c);
const VT = String.fromCharCode(0x0b);

// OSC (Operating System Command): ESC ] ... terminator (BEL, ST, or implicit at next OSC start).
const OSC_RE = new RegExp(
  `${ESC}\\][^${BEL}]*?(?:${BEL}|${ESC}\\\\|(?=${ESC}\\]))`,
  "g",
);
// DCS (Device Control String): ESC P ... ESC \
const DCS_RE = new RegExp(`${ESC}P[^${ESC}]*${ESC}\\\\`, "g");
// CSI (Control Sequence Introducer): ESC [ params command
const CSI_RE = new RegExp(`${ESC}\\[[0-9;?]*[ -/]*[@-~]`, "g");
// Single-char escape sequences (charset selection, etc.)
const SIMPLE_ESC_RE = new RegExp(`${ESC}[=>()*+\\-./#]`, "g");
// Lone escapes with single trailing char
const LONE_ESC_RE = new RegExp(`${ESC}[NOP\\\\^_X]`, "g");
// Leftover BEL / FF / VT
const STRAGGLER_RE = new RegExp(`[${BEL}${FF}${VT}]`, "g");

// Defensive fallbacks for when the ESC byte gets stripped somewhere in the
// pipeline (observed in VSCode's rendering of captured output). These match
// the specific OSC sequences VSCode's shell integration emits: 633;A/B/C/D/E/P
// and terminal-title OSCs 0/1/2/7 — using hex escapes for ESC (\x1B) and BEL
// (\x07) so the source is robust against control-char stripping in editors.
const OSC_633_FALLBACK = /\]633;[A-Z](?:;[^\r\n\]\x07\x1B]*?)?(?:\x07|\x1B\\)?/g;
const OSC_TITLE_FALLBACK = /\][0127];[^\r\n\x07\x1B]*?(?:\\|\x07|\x1B\\|(?=\]|\r|\n|$))/g;

// Zsh PROMPT_EOL_MARK: a line that is just `%` padded with whitespace.
const ZSH_EOL_MARK_RE = /^%\s*$/;

export function stripAnsi(input: string): string {
  return input
    .replace(OSC_RE, "")
    .replace(OSC_633_FALLBACK, "")
    .replace(OSC_TITLE_FALLBACK, "")
    .replace(DCS_RE, "")
    .replace(CSI_RE, "")
    .replace(SIMPLE_ESC_RE, "")
    .replace(LONE_ESC_RE, "");
}

export function cleanOutput(input: string): string {
  return stripAnsi(input)
    .replace(/\r\n/g, "\n")
    .replace(/\r(?!\n)/g, "\n")
    .replace(STRAGGLER_RE, "")
    .split("\n")
    .map((l) => l.replace(/\s+$/, ""))
    .filter((l) => !ZSH_EOL_MARK_RE.test(l))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\n+/, "")
    .replace(/\n+$/, "\n");
}

export function applyAnsiMode(input: string, mode: "strip" | "preserve"): string {
  return mode === "strip" ? cleanOutput(input) : input;
}
