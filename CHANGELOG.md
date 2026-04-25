# Changelog

## 0.1.2 — 2026-04-25

- Fix Run selection lens not running when clicked. CodeLens click was collapsing the editor selection; the lens now passes the captured selection range as a command argument.
- Fix runs getting stuck on "Queued" forever for multi-line commands. Removed the per-terminal queue chain (terminal serializes naturally). Added a grace-window + hard timeout so a missed end event no longer hangs the run.

## 0.1.1 — 2026-04-25

- Cleaner extension description on the marketplace listing.
- Expanded keyword list for marketplace search discovery.
- `.env` files (and any `.env.*`) excluded from packaged VSIX.

## 0.1.0 — 2026-04-25

Initial release.

- Run button (CodeLens) on `bash` / `sh` / `shell` / `console` fenced blocks in markdown.
- Run button per blank-line-separated block in `.sh` files (configurable: `perBlock` / `fileOnly` / `off`).
- Run selection lens in shell scripts and inside shell-fenced markdown blocks.
- Marker-based comment detection (`# $ …` / `// run: …`) in user-installed languages.
- Terminal picker with per-file memory; `↻ Switch terminal` lens on every block.
- Captured output + exit code via VSCode Shell Integration API.
- Inline summary decoration (`✓ exit 0 · 340ms`).
- Full output viewer: `log` (read-only document) or `terminal` (webview with ANSI colors).
- Output rendered through `@xterm/headless` for a byte-accurate match to VSCode's integrated terminal — handles OSC 633, cursor movements, progress bars.
- Workspace Trust gated; confirm-before-run setting.
