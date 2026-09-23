import { existsSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { tryReadJson } from '@franzenzenhofer/intent-core/json';
import type { Link } from './links.js';

/**
 * Chromium browsers only, and on purpose: their bookmarks are a plain JSON file this process
 * can already read. Safari's live in a binary plist under TCC, where reading them would raise
 * a permission dialog the user did not ask for, to answer a question openit can answer without.
 */
const BROWSER_DIRS: readonly (readonly [string, readonly string[]])[] = [
  ['Chrome', ['Google', 'Chrome']],
  ['Chrome Beta', ['Google', 'Chrome Beta']],
  ['Brave', ['BraveSoftware', 'Brave-Browser']],
  ['Edge', ['Microsoft Edge']],
  ['Vivaldi', ['Vivaldi']],
  ['Chromium', ['Chromium']],
  ['Arc', ['Arc', 'User Data']],
];

const MAX_DEPTH = 12;
/** Chrome stores microseconds since 1601; this is the gap to the Unix epoch, in milliseconds. */
const WEBKIT_EPOCH_OFFSET_MS = 11_644_473_600_000;
const MICROS_PER_MILLI = 1000;

export interface BrowserProfile {
  readonly browser: string;
  readonly profile: string;
  readonly dir: string;
}

const supportDir = (): string => join(homedir(), 'Library', 'Application Support');

const isDir = (path: string): boolean => {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
};

/** Every profile of every installed Chromium browser: people keep work in "Profile 2". */
export const browserProfiles = (base: string = supportDir()): BrowserProfile[] => {
  const found: BrowserProfile[] = [];
  for (const [browser, segments] of BROWSER_DIRS) {
    const root = join(base, ...segments);
    if (!isDir(root)) continue;
    let names: string[] = [];
    try {
      names = readdirSync(root);
    } catch {
      continue;
    }
    for (const name of names) {
      const dir = join(root, name);
      if (existsSync(join(dir, 'Bookmarks')) || existsSync(join(dir, 'History'))) {
        found.push({ browser, profile: name, dir });
      }
    }
  }
  return found;
};

export const webkitTimeToMs = (value: unknown): number => {
  const micros = typeof value === 'string' ? Number.parseInt(value, 10) : Number(value);
  if (!Number.isFinite(micros) || micros <= 0) return 0;
  return Math.round(micros / MICROS_PER_MILLI) - WEBKIT_EPOCH_OFFSET_MS;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const walk = (node: unknown, depth: number, out: Link[]): void => {
  if (!isRecord(node) || depth > MAX_DEPTH) return;
  const children = node['children'];
  if (Array.isArray(children)) {
    for (const child of children) walk(child, depth + 1, out);
    return;
  }
  const url = node['url'];
  const name = node['name'];
  if (node['type'] !== 'url' || typeof url !== 'string') return;
  out.push({
    url,
    title: typeof name === 'string' ? name : '',
    source: 'bookmark',
    at: webkitTimeToMs(node['date_added']),
  });
};

export const readBookmarkFile = (file: string): Link[] => {
  const parsed = tryReadJson(file);
  if (!isRecord(parsed)) return [];
  const roots = parsed['roots'];
  if (!isRecord(roots)) return [];
  const found: Link[] = [];
  for (const root of Object.values(roots)) walk(root, 0, found);
  return found;
};

export const readBookmarks = (profiles: readonly BrowserProfile[]): Link[] =>
  profiles.flatMap((profile) => readBookmarkFile(join(profile.dir, 'Bookmarks')));
