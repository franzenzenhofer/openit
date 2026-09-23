import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { LIMIT } from '../match/constants.js';
import type { Target } from '../target.js';

const DEPTH = 2;

const mtimeOf = (path: string): number => {
  try {
    return statSync(path).mtimeMs;
  } catch {
    return 0;
  }
};

const list = (dir: string, depth: number, ignore: readonly string[], out: Target[]): void => {
  if (depth <= 0 || out.length >= LIMIT.lazyChildren) return;
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (out.length >= LIMIT.lazyChildren) return;
    if (entry.name.startsWith('.') || ignore.includes(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isFile()) {
      out.push({ kind: 'file', ref: path, name: entry.name, mtime: mtimeOf(path), source: 'lazy-child' });
      continue;
    }
    if (entry.isDirectory()) list(path, depth - 1, ignore, out);
  }
};

/**
 * The second half of resolving "the cdai readme": rank directories with the whole token set,
 * then list the few best ones and rank the same tokens over their children. Indexing 103,929
 * files to find this would cost a hundred times what listing three directories does.
 */
export const childTargets = (dirs: readonly string[], ignore: readonly string[]): Target[] => {
  const out: Target[] = [];
  for (const dir of dirs.slice(0, LIMIT.lazyParents)) list(dir, DEPTH, ignore, out);
  return out;
};
