import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { DocRoot } from '../config.js';
import type { Target } from '../target.js';

const MAX_FILES = 5000;

const statMtime = (path: string): number => {
  try {
    return statSync(path).mtimeMs;
  } catch {
    return 0;
  }
};

const walk = (dir: string, depth: number, ignore: readonly string[], out: Target[]): void => {
  if (depth < 0 || out.length >= MAX_FILES) return;
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (out.length >= MAX_FILES) return;
    if (entry.name.startsWith('.') || ignore.includes(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(path, depth - 1, ignore, out);
      continue;
    }
    if (!entry.isFile()) continue;
    out.push({ kind: 'file', ref: path, name: entry.name, mtime: statMtime(path), source: 'doc-index' });
  }
};

/**
 * The files openit is expected to know by heart: Downloads, Desktop, Screenshots, Documents.
 * Measured at 476 files across all four on this machine, listed in 32ms including node boot, so
 * this is read fresh on every invocation rather than cached and risked going stale.
 */
export const docTargets = (roots: readonly DocRoot[], ignore: readonly string[]): Target[] => {
  const out: Target[] = [];
  for (const root of roots) walk(root.path, Math.max(0, root.depth - 1), ignore, out);
  return out;
};
