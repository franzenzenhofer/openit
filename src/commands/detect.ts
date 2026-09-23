import { existsSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_DEPTH, type DocRoot } from '../config.js';
import type { RootConfig } from '@franzenzenhofer/intent-core/store/indexer';

const PROJECT_DIRS = ['dev', 'code', 'src', 'projects', 'work', 'Developer', 'repos', 'git'];
const DOC_DIRS: readonly (readonly [string, number])[] = [
  ['Downloads', 1], ['Desktop', 1], ['Documents', 2], [join('Pictures', 'Screenshots'), 1],
];
const CLOUD_HINTS = ['Dropbox', 'Library/CloudStorage', 'iCloud Drive'];

const isDir = (path: string): boolean => {
  try {
    return existsSync(path) && statSync(path).isDirectory();
  } catch {
    return false;
  }
};

/** Where projects live: the conventional names, plus a cloud drive if one is obviously there. */
export const detectRoots = (): RootConfig[] => {
  const home = homedir();
  const found = PROJECT_DIRS.map((name) => join(home, name)).filter(isDir);
  const cloud = CLOUD_HINTS.map((name) => join(home, name)).filter(isDir);
  return [...found, ...cloud].map((path) => ({ path, depth: DEFAULT_DEPTH }));
};

/** Where documents land. Shallow on purpose: these are listed, not crawled. */
export const detectDocRoots = (): DocRoot[] => {
  const home = homedir();
  return DOC_DIRS
    .map(([name, depth]) => ({ path: join(home, name), depth }))
    .filter((root) => isDir(root.path));
};
