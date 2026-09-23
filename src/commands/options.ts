import type { QueryOptions } from './query.js';

export interface ParsedArgs {
  readonly options: QueryOptions;
  readonly words: string[];
  readonly error: string | null;
}

const EMPTY: QueryOptions = {
  mode: 'run', wait: false, withWord: null, reveal: false, newInstance: false, background: false,
};

/**
 * Hand-rolled, like cdai's. --dry-run deliberately has no short flag: every single letter near
 * open(1)'s namespace already means something there, and two tools using -n for opposite things
 * would be the worst possible outcome.
 */
export const parseArgs = (args: readonly string[]): ParsedArgs => {
  let options = EMPTY;
  const words: string[] = [];
  let error: string | null = null;
  let literal = false;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === undefined) continue;
    if (literal || !arg.startsWith('--')) {
      words.push(arg);
      continue;
    }
    if (arg === '--') {
      literal = true;
      continue;
    }
    if (arg === '--dry-run') options = { ...options, mode: 'dry-run' };
    else if (arg === '--reveal') options = { ...options, reveal: true };
    else if (arg === '--new') options = { ...options, newInstance: true };
    else if (arg === '--background') options = { ...options, background: true };
    else if (arg === '--wait') options = { ...options, wait: true };
    else if (arg === '--with') {
      const next = args[i + 1];
      if (next === undefined) error = '--with needs an application name';
      else options = { ...options, withWord: next.toLowerCase() };
      i += 1;
    } else error = `unknown option ${arg}`;
  }
  return { options, words, error };
};
