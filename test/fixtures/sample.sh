#!/usr/bin/env bash
# Noteshell fixture: shell script
# Each blank-line-separated block below should get its own Runner.

echo "block 1 line 1"
echo "block 1 line 2"

ls -1 | head -3

for i in 1 2 3; do
  echo "counting $i"
done

false

echo "after a failing block"
