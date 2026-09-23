/** Completion wiring only; see the note in zsh.ts for why there is no wrapper function. */
export const FISH_INIT = `function __openit_complete
  set -l words (commandline -opc) (commandline -ct)
  openit complete -- $words[2..-1] 2>/dev/null
end
complete -c openit -f -a '(__openit_complete)'`;
