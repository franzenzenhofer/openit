import { basename } from 'node:path';
import type { DirIndex } from '@franzenzenhofer/intent-core/store/indexer';
import { appTargets, loadAppIndex } from './store/apps.js';
import { docTargets } from './store/docs.js';
import { childTargets } from './store/lazy.js';
import { linkTargets, loadLinkIndex, loadTaught } from './store/links.js';
import type { Config } from './config.js';
import type { Target } from './target.js';

export interface Sources {
  readonly targets: readonly Target[];
  readonly apps: ReturnType<typeof loadAppIndex>;
}

const dirTargets = (index: DirIndex): Target[] =>
  index.entries.map((entry) => ({
    kind: 'dir',
    ref: entry.path,
    name: entry.name,
    mtime: entry.mtime,
    source: 'dir-index',
  }));

/**
 * Tier 1, in cost order. Everything here reads cached JSON or a shallow directory listing; the
 * expensive tiers (Spotlight, then the model) only run when this one has not answered.
 */
export const tier1 = (config: Config, index: DirIndex): Sources => {
  const apps = loadAppIndex();
  return {
    apps,
    targets: [
      ...appTargets(apps),
      ...dirTargets(index),
      ...docTargets(config.docRoots, config.ignore),
      ...linkTargets(loadLinkIndex(config.history), loadTaught()),
    ],
  };
};

/**
 * Tier 1b: the children of the directories that matched best. A project directory is rarely
 * what someone means when they also said "readme".
 */
export const tier1b = (config: Config, dirs: readonly string[]): Target[] =>
  childTargets(dirs, config.ignore);

export const rootNames = (config: Config): Set<string> =>
  new Set([...config.roots, ...config.docRoots].map((root) => basename(root.path).toLowerCase()));
