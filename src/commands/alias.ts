import { existsSync, statSync } from 'node:fs';
import { contractTilde, spelledPath } from '@franzenzenhofer/intent-core/paths';
import { forget, memories, normalizeIntent, remember } from '../store/memory.js';
import { parseUrl } from '../risk/scheme.js';
import { displayPath } from '../display.js';
import { sanitizeLabel } from '../ai/sanitize.js';
import { EXIT, fail, note, type ExitCode } from '../protocol.js';
import type { TargetKind } from '../target.js';

const USAGE = [
  'usage:',
  '  openit alias list',
  '  openit alias add <path or url> -- <words>',
  '  openit alias forget -- <words>',
].join('\n');

const MAX_SHOWN = 120;

const words = (args: readonly string[]): string => {
  const separator = args.indexOf('--');
  return normalizeIntent((separator === -1 ? args : args.slice(separator + 1)).join(' '));
};

const kindOf = (path: string): TargetKind => {
  if (!statSync(path).isDirectory()) return 'file';
  return /\.app$/iu.test(path) ? 'app' : 'dir';
};

const list = (): ExitCode => {
  const all = memories();
  if (all.length === 0) {
    note('openit: nothing remembered yet');
    note('        openit remembers an answer you said yes to, under the words you used');
    return EXIT.ok;
  }
  for (const alias of all) {
    const value = alias.value;
    const what = value.kind === 'url' ? sanitizeLabel(value.ref, MAX_SHOWN) : displayPath(value.ref);
    const who = value.handler === null ? '' : ` with ${contractTilde(value.handler)}`;
    note(`  ${alias.query}  ->  ${what}${who}`);
  }
  return EXIT.ok;
};

/**
 * Teaching by hand is not the same promotion the AI tier gets: the user is naming the thing
 * themselves, so there is nothing to confirm. It is still stored as an Action, and it is still
 * re-classified on the way back out.
 */
const add = (args: readonly string[]): ExitCode => {
  const separator = args.indexOf('--');
  const what = separator === -1 ? args[0] : args.slice(0, separator)[0];
  const query = words(args);
  if (what === undefined || query === '') return fail('alias add needs a thing and words', USAGE), EXIT.error;
  const spelled = spelledPath(what);
  if (spelled !== null && existsSync(spelled)) {
    remember(query, { kind: kindOf(spelled), ref: spelled, handler: null });
    note(`openit: "${query}" is ${displayPath(spelled)}`);
    return EXIT.ok;
  }
  const url = parseUrl(what);
  if (url === null) return fail(`no such thing: ${displayPath(what)}`, USAGE), EXIT.error;
  if (url.klass === 'forbidden' || url.klass === 'file' || url.hasUserInfo) {
    return fail(`openit never opens ${url.scheme}: links like that`, 'nothing was saved'), EXIT.refused;
  }
  remember(query, { kind: 'url', ref: what, handler: null });
  note(`openit: "${query}" is ${sanitizeLabel(what, MAX_SHOWN)}`);
  return EXIT.ok;
};

const drop = (args: readonly string[]): ExitCode => {
  const query = words(args);
  if (query === '') return fail('alias forget needs the words to forget', USAGE), EXIT.error;
  if (!forget(query)) return fail(`nothing remembered for "${query}"`, 'openit alias list'), EXIT.error;
  note(`openit: forgot "${query}"`);
  return EXIT.ok;
};

export const runAlias = (args: readonly string[]): ExitCode => {
  const command = args[0];
  if (command === undefined || command === 'list') return list();
  if (command === 'add') return add(args.slice(1));
  if (command === 'forget') return drop(args.slice(1));
  return fail(`unknown alias command "${sanitizeLabel(command, 40)}"`, USAGE), EXIT.error;
};
