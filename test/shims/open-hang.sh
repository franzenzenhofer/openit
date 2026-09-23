#!/bin/sh
# Never returns, and leaves a child behind: openit must kill the whole process group, not just
# the process it spawned. The child writes its pid down so the test can prove it died.
dir="$(dirname "$0")"
sh -c 'echo $$ > "$0"/child.pid; sleep 120' "$dir" &
sleep 120
