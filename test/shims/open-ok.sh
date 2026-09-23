#!/bin/sh
# A stand-in for /usr/bin/open that records what it was asked to do and does nothing.
#
# The log sits next to this script rather than at a path from the environment, because openit
# strips every OPENIT_* variable out of the child environment on purpose - a test seam that
# survived that stripping would be proving the wrong thing.
#
# argv is written NUL-delimited, with \36 between invocations: `echo "$@"` would destroy a
# filename containing a newline, and one of the fixtures is exactly that.
log="$(dirname "$0")/argv.log"
if [ -s "$log" ]; then printf '\036' >> "$log"; fi
for arg in "$@"; do printf '%s\000' "$arg" >> "$log"; done
exit 0
