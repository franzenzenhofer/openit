import { existsSync, statSync } from 'node:fs';
import { spelledPath } from '@franzenzenhofer/intent-core/paths';
import { parseUrl } from '../risk/scheme.js';
import type { Target } from '../target.js';

const mtimeOf = (path: string): number => {
  try {
    return statSync(path).mtimeMs;
  } catch {
    return 0;
  }
};

const nameOf = (path: string): string => path.split('/').filter((p) => p !== '').at(-1) ?? path;

const pathTarget = (path: string): Target => ({
  kind: statSync(path).isDirectory() ? (/\.app$/iu.test(path) ? 'app' : 'dir') : 'file',
  ref: path,
  name: nameOf(path),
  mtime: mtimeOf(path),
  source: 'literal',
});

/**
 * A scheme and something after it. Deliberately not "scheme://": `mailto:`, `tel:` and
 * `javascript:` have no authority component, and a tool that only recognised the double slash
 * would answer "no match" for a javascript: link instead of refusing it - which is the whole
 * difference between saying nothing was found and saying no.
 */
const SPELLED_URL = /^[a-z][a-z0-9+.-]+:.+$/iu;

/**
 * Tier 0. A thing the user spelled out is not a search: it is the answer. A path that exists,
 * a file:// URL, or any other URL, all name exactly one thing and nothing else can outrank it.
 */
export const literalTarget = (args: readonly string[]): Target | null => {
  if (args.length !== 1) return null;
  const word = args[0];
  if (word === undefined || word === '') return null;
  const spelled = spelledPath(word);
  if (spelled !== null && existsSync(spelled)) return pathTarget(spelled);
  if (!SPELLED_URL.test(word) || parseUrl(word) === null) return null;
  return { kind: 'url', ref: word, name: word, mtime: 0, source: 'literal' };
};
