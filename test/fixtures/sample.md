# Noteshell fixture: markdown

A plain bash block — the Runner appears once, above the fence.

```bash
echo "hello from bash block"
date
```

A shell block — same treatment.

```shell
ls -1 | head -3
```

A console block — Runners appear only above `$ ` lines. The output lines are ignored. A `> ` continuation folds into the previous command.

```console
$ echo first
first
$ for i in 1 2 3; do
>   echo $i
> done
1
2
3
$ true
```

A sh block that fails — the summary should be red.

```sh
false
```

A very long-running block — watch the running state.

```bash
sleep 2 && echo done
```
