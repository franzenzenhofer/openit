import { emit } from '@franzenzenhofer/intent-core/protocol';
import { ZSH_INIT } from '../shell/zsh.js';
import { BASH_INIT } from '../shell/bash.js';
import { FISH_INIT } from '../shell/fish.js';
import { EXIT, fail, type ExitCode } from '../protocol.js';

const USAGE = 'usage: openit init <zsh|bash|fish>';

const BY_SHELL = new Map<string, string>([
  ['zsh', ZSH_INIT],
  ['bash', BASH_INIT],
  ['fish', FISH_INIT],
]);

/**
 * What a shell should evaluate. Completion wiring and nothing else: there is no wrapper
 * function to install, because opening something is not a change to the calling shell.
 */
export const runInit = (args: readonly string[]): ExitCode => {
  const shell = args[0];
  if (shell === undefined) return fail('which shell?', USAGE), EXIT.error;
  const script = BY_SHELL.get(shell);
  if (script === undefined) return fail(`openit knows zsh, bash and fish, not "${shell}"`, USAGE), EXIT.error;
  emit(script);
  return EXIT.ok;
};
