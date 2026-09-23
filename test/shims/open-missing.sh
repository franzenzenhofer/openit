#!/bin/sh
# What open(1) says, and the status it exits with, when the thing is not there any more.
printf 'The file %s does not exist.\n' "$*" >&2
exit 1
