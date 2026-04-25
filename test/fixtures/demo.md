# Noteshell demo

Click **▶ Run** above any block. Output appears in your terminal **and** as an inline summary below.

## Quick output

```bash
echo "hello from noteshell"
date
```

## Multiple commands per block

```bash
ls -1 | head -3
pwd
```

## Console-style block

In `console` blocks only `$ `-prefixed lines are runnable. Output lines are skipped automatically.

```console
$ echo "first line"
first line
$ for i in 1 2 3; do
>   echo "counting $i"
> done
counting 1
counting 2
counting 3
```

## Selection runner

Highlight any range below — a `▶ Run selection` lens appears above your selection.

```bash
echo "line one"
echo "line two"
echo "line three"
echo "line four"
```

## Click "Show output"

After a run, a `$(output) Show output` lens shows up next to *Run again*. Click it to open the full capture, rendered through xterm-headless so it matches the terminal byte-for-byte — including ANSI colors and progress bars.

```bash
ls --color=always | head -5
```
