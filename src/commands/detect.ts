import { existsSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_DEPTH, type DocRoot } from '../config.js';
import type { RootConfig } from '@franzenzenhofer/intent-core/store/indexer';

const PROJECT_DIRS = ['dev', 'code', 'src', 'projects', 'work', 'Developer', 'repos', 'git'];
const DOC_DIRS: readonly (readonly [string, number])[] = [
  ['Downloads', 1], ['Desktop', 1], ['Documents', 2], [join('Pictures', 'Screenshots'), 1],
];
/**
 * Matched against the NAMES in the home directory rather than joined onto it: a Dropbox for
 * Business folder is called "f19n Dropbox", not "Dropbox", and a fixed list of paths would
 * miss the one place on this machine where 2045 invoices actually live.
 */
const CLOUD_PATTERN = /dropbox|onedrive|nextcloud|owncloud|drive|icloud/iu;
const CLOUD_PATHS = [join('Library', 'CloudStorage')];

const isDir = (path: string): boolean => {
  try {
    return existsSync(path) && statSync(path).isDirectory();
  } catch {
    return false;
  }
};

/** Where projects live: the conventional names, plus a cloud drive if one is obviously there. */
const cloudDirs = (home: string): string[] => {
  let names: string[] = [];
  try {
    names = readdirSync(home);
  } catch {
    return [];
  }
  const matched = names
    .filter((name) => !name.startsWith('.') && CLOUD_PATTERN.test(name))
    .map((name) => join(home, name));
  return [...matched, ...CLOUD_PATHS.map((name) => join(home, name))].filter(isDir);
};

export const detectRoots = (): RootConfig[] => {
  const home = homedir();
  const found = PROJECT_DIRS.map((name) => join(home, name)).filter(isDir);
  return [...found, ...cloudDirs(home)].map((path) => ({ path, depth: DEFAULT_DEPTH }));
};

/** Where documents land. Shallow on purpose: these are listed, not crawled. */
export const detectDocRoots = (): DocRoot[] => {
  const home = homedir();
  return DOC_DIRS
    .map(([name, depth]) => ({ path: join(home, name), depth }))
    .filter((root) => isDir(root.path));
};
