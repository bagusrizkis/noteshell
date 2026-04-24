"""Noteshell fixture: python with marker-prefixed comments.

Python is enabled by default in `noteshell.commentScanLanguages`,
so the `# $ ...` and `# run: ...` comments below should show Runners
out of the box. Plain comments (no marker) never get a Runner.
"""

# $ echo "runnable via $ marker"
# run: date
# this comment has no marker and should NOT get a Runner
# $ ls -1 | head -3


def greet(name: str) -> str:
    # $ printf "ran from inside a function's comment\n"
    return f"hello, {name}"
