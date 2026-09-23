/**
 * Completion wiring only; see the note in zsh.ts for why there is no wrapper function.
 *
 * Globbing is turned off around the substitution: `COMPREPLY=($(...))` expands `*`, `?` and
 * `[...]` against the current directory, and bookmark titles and filenames carry all three -
 * so the completion list quietly became a list of unrelated local files. The previous setting
 * is restored, because a shell that comes back from a Tab with noglob on is worse than one
 * that completes badly.
 */
export const BASH_INIT = `_openit() {
  local IFS=$'\\n'
  local had_noglob=0
  case $- in *f*) had_noglob=1 ;; esac
  set -f
  COMPREPLY=($(openit complete -- "\${COMP_WORDS[@]:1:COMP_CWORD}" 2>/dev/null))
  [ "$had_noglob" = 1 ] || set +f
}
complete -o default -F _openit openit`;
