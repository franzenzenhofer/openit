#!/bin/sh
# 200 KB of stderr from a program that then fails: the drain has to keep reading it, and what
# openit repeats back has to stay bounded.
i=0
while [ $i -lt 2000 ]; do
  printf 'noise %s 0123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123\n' "$i" >&2
  i=$((i + 1))
done
exit 1
