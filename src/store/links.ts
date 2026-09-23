import { existsSync } from 'node:fs';
import { hostLabels, pathNames } from '@franzenzenhofer/intent-core/match/url';
import { tryReadJson } from '@franzenzenhofer/intent-core/json';
import { stateFile, writeAtomic } from '@franzenzenhofer/intent-core/paths';
import { LIMIT } from '../match/constants.js';
import { sanitizeLabel } from '../ai/sanitize.js';
import { parseUrl } from '../risk/scheme.js';
import { browserProfiles, readBookmarks } from './bookmarks.js';
import { readHistory } from './history.js';
import type { Target } from '../target.js';

export type LinkSource = 'bookmark' | 'history' | 'taught';

export interface Link {
  readonly url: string;
  readonly title: string;
  readonly source: LinkSource;
  /** When it was bookmarked or last visited, in milliseconds. */
  readonly at: number;
}

/** A link the user named themselves: `openit link add gsc https://...`. */
export interface TaughtLink {
  readonly name: string;
  readonly url: string;
  readonly addedAt: number;
}

const LINKS_FILE = 'links.json';
const INDEX_FILE = 'url-index.json';
const VERSION = 1;
const INDEX_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_TITLE = 80;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * One spelling per place, for deduplication only - what is opened is always the URL as it was
 * bookmarked. The fragment and a bare trailing slash are display, not identity.
 */
export const normalizeUrl = (url: string): string => {
  const parsed = parseUrl(url);
  if (parsed === null) return url.trim().toLowerCase();
  const host = parsed.url.hostname.replace(/^www\./u, '');
  const path = parsed.url.pathname === '/' ? '' : parsed.url.pathname.replace(/\/$/u, '');
  return `${parsed.scheme}://${host}${path}${parsed.url.search}`;
};

const isWeb = (url: string): boolean => parseUrl(url)?.klass === 'web';

/** Newest first, one entry per place, bookmarks ahead of history when both know it. */
export const mergeLinks = (links: readonly Link[]): Link[] => {
  const byKey = new Map<string, Link>();
  for (const link of [...links].sort((a, b) => b.at - a.at)) {
    const key = normalizeUrl(link.url);
    const seen = byKey.get(key);
    if (seen === undefined || (seen.title === '' && link.title !== '')) byKey.set(key, link);
  }
  return [...byKey.values()].slice(0, LIMIT.urlIndex);
};

const readLink = (value: unknown, source: LinkSource): Link | undefined => {
  if (!isRecord(value) || typeof value['url'] !== 'string') return undefined;
  const at = typeof value['at'] === 'number' ? value['at'] : 0;
  const title = typeof value['title'] === 'string' ? value['title'] : '';
  return { url: value['url'], title, source, at };
};

export const loadTaught = (): TaughtLink[] => {
  const parsed = tryReadJson(stateFile(LINKS_FILE));
  if (!isRecord(parsed) || !Array.isArray(parsed['links'])) return [];
  return parsed['links'].flatMap((value): TaughtLink[] => {
    if (!isRecord(value)) return [];
    const { name, url, addedAt } = value;
    if (typeof name !== 'string' || name === '' || typeof url !== 'string') return [];
    if (parseUrl(url) === null) return [];
    return [{ name, url, addedAt: typeof addedAt === 'number' ? addedAt : 0 }];
  });
};

export const saveTaught = (links: readonly TaughtLink[]): void => {
  writeAtomic(stateFile(LINKS_FILE), `${JSON.stringify({ version: VERSION, links }, null, 2)}\n`);
};

/** Bookmarks always; history only when the user turned it on. Cached, because both cost. */
export const buildLinkIndex = (history: boolean, now: number = Date.now()): Link[] => {
  const profiles = browserProfiles();
  const found = [
    ...readBookmarks(profiles).filter((link) => isWeb(link.url)),
    ...(history ? readHistory(profiles).filter((link) => isWeb(link.url)) : []),
  ];
  return mergeLinks(found.map((link) => ({ ...link, at: link.at === 0 ? now : link.at })));
};

export const saveLinkIndex = (links: readonly Link[], now: number = Date.now()): void => {
  try {
    writeAtomic(stateFile(INDEX_FILE),
      `${JSON.stringify({ version: VERSION, generatedAt: now, links })}\n`);
  } catch {
    // A read-only state directory costs a rebuild per run, never an answer.
  }
};

export const loadLinkIndex = (history: boolean, now: number = Date.now()): Link[] => {
  const file = stateFile(INDEX_FILE);
  const parsed = existsSync(file) ? tryReadJson(file) : undefined;
  if (isRecord(parsed) && parsed['version'] === VERSION && Array.isArray(parsed['links'])) {
    const generatedAt = typeof parsed['generatedAt'] === 'number' ? parsed['generatedAt'] : 0;
    if (now - generatedAt <= INDEX_TTL_MS) {
      return parsed['links'].flatMap((value) => {
        const link = readLink(value, 'bookmark');
        return link === undefined ? [] : [link];
      });
    }
  }
  const built = buildLinkIndex(history, now);
  saveLinkIndex(built, now);
  return built;
};

const nameOf = (link: Link): string => {
  const title = sanitizeLabel(link.title, MAX_TITLE);
  return title === '' ? (hostLabels(link.url)[0] ?? link.url) : title;
};

/**
 * A page is named by its title AND by the host that serves it, and `openit veganblatt` may
 * mean either. Both are scored, so neither spelling is the only way in.
 */
export const linkTargets = (links: readonly Link[], taught: readonly TaughtLink[]): Target[] => [
  ...taught.map((link): Target => ({
    kind: 'url',
    ref: link.url,
    name: link.name,
    aka: hostLabels(link.url),
    mtime: link.addedAt,
    source: 'link-index',
  })),
  ...links.map((link): Target => ({
    kind: 'url',
    ref: link.url,
    name: nameOf(link),
    aka: [...hostLabels(link.url), ...pathNames(link.url)],
    mtime: link.at,
    source: 'link-index',
  })),
];
