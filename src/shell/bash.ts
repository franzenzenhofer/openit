/** Completion wiring only; see the note in zsh.ts for why there is no wrapper function. */
export const BASH_INIT = `_openit() {
  local IFS=$'\\n'
  COMPREPLY=($(openit complete -- "\${COMP_WORDS[@]:1:COMP_CWORD}" 2>/dev/null))
}
complete -o default -F _openit openit`;
