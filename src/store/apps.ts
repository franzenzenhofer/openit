import { existsSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { tryReadJson } from '@franzenzenhofer/intent-core/json';
import { stateFile, writeAtomic } from '@franzenzenhofer/intent-core/paths';
import { LIMIT } from '../match/constants.js';
import { appName, type AppRef } from '../handler.js';
import type { Target } from '../target.js';

const APPS_FILE = 'apps.json';
const VERSION = 1;
const TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Five fixed directories, not Spotlight.
 *
 * `mdfind kMDItemContentType == 'com.apple.application-bundle'` returns 383 bundles on this
 * machine, of which about 270 are noise: 117 CoreServices internals, Xcode simulator builds,
 * Script Editor droplets, and a puppeteer fixture literally named chrome.app sitting inside a
 * client folder. A bounded readdir of these five places returns 116 real apps in 5ms.
 */
export const APP_DIRS = (): string[] => [
  '/Applications',
  '/System/Applications',
  '/System/Applications/Utilities',
  join(homedir(), 'Applications'),
];

/** Only Finder matters out of the 117 bundles in CoreServices, so it is named rather than crawled. */
const EXTRA_APPS = ['/System/Library/CoreServices/Finder.app'];

const isApp = (path: string): boolean => {
  try {
    return statSync(path).isDirectory() && statSync(join(path, 'Contents', 'MacOS')).isDirectory();
  } catch {
    return false;
  }
};

const appsIn = (dir: string): string[] => {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  const direct = names.filter((name) => name.endsWith('.app')).map((name) => join(dir, name));
  // One level of grouping folders, which is how Adobe and Microsoft install.
  const nested = names
    .filter((name) => !name.endsWith('.app') && !name.startsWith('.'))
    .flatMap((name) => {
      const sub = join(dir, name);
      try {
        return readdirSync(sub).filter((n) => n.endsWith('.app')).map((n) => join(sub, n));
      } catch {
        return [];
      }
    });
  return [...direct, ...nested];
};

export interface AppIndex {
  readonly version: number;
  readonly generatedAt: number;
  readonly apps: readonly AppRef[];
}

export const buildAppIndex = (now: number = Date.now()): AppIndex => {
  const seen = new Set<string>();
  const apps: AppRef[] = [];
  for (const path of [...APP_DIRS().flatMap(appsIn), ...EXTRA_APPS]) {
    if (seen.has(path) || apps.length >= LIMIT.apps || !isApp(path)) continue;
    seen.add(path);
    // Bundle ids are resolved lazily, only when a handler is taught: open -a <absolute path>
    // is always sufficient, and 116 plutil spawns at index time would not be.
    apps.push({ name: appName(path), path, bundleId: null });
  }
  return { version: VERSION, generatedAt: now, apps };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const readApp = (value: unknown): AppRef | undefined => {
  if (!isRecord(value)) return undefined;
  const { name, path, bundleId } = value;
  if (typeof name !== 'string' || name === '') return undefined;
  if (typeof path !== 'string' || !path.startsWith('/')) return undefined;
  return { name, path, bundleId: typeof bundleId === 'string' ? bundleId : null };
};

export const saveAppIndex = (index: AppIndex): void => {
  writeAtomic(stateFile(APPS_FILE), `${JSON.stringify(index)}\n`);
};

export const loadAppIndex = (now: number = Date.now()): AppIndex => {
  const file = stateFile(APPS_FILE);
  const parsed = existsSync(file) ? tryReadJson(file) : undefined;
  if (isRecord(parsed) && parsed['version'] === VERSION && Array.isArray(parsed['apps'])) {
    const generatedAt = typeof parsed['generatedAt'] === 'number' ? parsed['generatedAt'] : 0;
    if (now - generatedAt <= TTL_MS) {
      return {
        version: VERSION,
        generatedAt,
        apps: parsed['apps'].map(readApp).filter((app): app is AppRef => app !== undefined),
      };
    }
  }
  const built = buildAppIndex(now);
  try {
    saveAppIndex(built);
  } catch {
    // A read-only state directory still leaves a usable in-memory index.
  }
  return built;
};

export const appTargets = (index: AppIndex): Target[] =>
  index.apps.map((app) => ({ kind: 'app', ref: app.path, name: app.name, mtime: 0, source: 'app-index' }));
