/**
 * Completion wiring only.
 *
 * openit needs no shell function at all: `open` hands the request to LaunchServices and the
 * effect lands outside this process tree, so there is nothing for a wrapper to apply to the
 * current shell. cdai needs one because a directory change cannot outlive a child process;
 * a launcher does not.
 *
 * `${(@)words[2,CURRENT]}` and not `"${words[2,CURRENT]}"`: a quoted slice without (@) joins
 * on IFS, so openit was handed the whole command line as one argument and completed nothing
 * after the first word.
 */
export const ZSH_INIT = `_openit() {
  local -a completions
  completions=("\${(@f)$(openit complete -- \${(@)words[2,CURRENT]} 2>/dev/null)}")
  compadd -- "\${completions[@]}"
}
compdef _openit openit`;
