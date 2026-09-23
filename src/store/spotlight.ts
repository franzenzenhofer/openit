import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { basename } from 'node:path';
import { tryReadJson } from '@franzenzenhofer/intent-core/json';
import { stateFile, writeAtomic } from '@franzenzenhofer/intent-core/paths';
import { LIMIT } from '../match/constants.js';
import type { Target } from '../target.js';

const MDFIND = '/usr/bin/mdfind';
const PROBE_FILE = 'spotlight.json';
const PROBE_TTL_MS = 24 * 60 * 60 * 1000;
const QUERY_TIMEOUT_MS = 1500;
const PROBE_TIMEOUT_MS = 2000;
const MAX_BUFFER = 8 * 1024 * 1024;
const MIN_TOKEN = 2;
const MAX_TOKEN = 64;
/** Names tried per root before it is called unindexed. */
const PROBE_NAMES = 3;

/** Quoted mdfind literal. Backslash first, or the quote escape would be escaped in turn. */
export const quoteQueryValue = (value: string): string =>
  value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');

const usable = (token: string): boolean =>
  token.length >= MIN_TOKEN && token.length <= MAX_TOKEN && !/[\p{Cc}\p{Cf}]/u.test(token);

/**
 * Every token has to appear in the file's own name. Spotlight also indexes file CONTENTS, and
 * a content match would answer "rechnung" with every document that merely mentions one.
 */
export const buildQuery = (tokens: readonly string[]): string | null => {
  const clauses = tokens
    .filter(usable)
    .map((token) => `(kMDItemFSName == "*${quoteQueryValue(token)}*"cd)`);
  return clauses.length === 0 ? null : clauses.join(' && ');
};

const runMdfind = (args: readonly string[], timeoutMs: number): string | null => {
  if (!existsSync(MDFIND)) return null;
  const result = spawnSync(MDFIND, args, {
    encoding: 'utf8', timeout: timeoutMs, maxBuffer: MAX_BUFFER,
  });
  if (result.status !== 0 || typeof result.stdout !== 'string') return null;
  return result.stdout;
};

/**
 * Whether Spotlight can answer for this place at all.
 *
 * Asked by naming something openit can see with its own eyes and checking whether Spotlight
 * can see it too. A broad probe like `*a*` is the obvious alternative and the wrong one: it
 * costs O(matches), and it timed out at two seconds on the 360,000 item Dropbox tree here -
 * which would have written down "not indexed" for the one root that is.
 *
 * Not a formality either way: on this machine ~/dev, ~/Downloads and ~/Desktop are NOT indexed
 * while ~/Documents and the Dropbox tree are. A tier that assumed coverage would quietly
 * return nothing for most roots, and `openit doctor` would have no way to say so.
 */
export const probeRoot = (root: string): boolean => {
  let names: string[];
  try {
    names = readdirSync(root);
  } catch {
    return false;
  }
  const candidates = names
    .filter((name) => !name.startsWith('.') && !/[\p{Cc}]/u.test(name))
    .slice(0, PROBE_NAMES);
  return candidates.some((name) => {
    const out = runMdfind(
      ['-onlyin', root, '-count', `kMDItemFSName == "${quoteQueryValue(name)}"`],
      PROBE_TIMEOUT_MS,
    );
    return out !== null && Number.parseInt(out.trim(), 10) > 0;
  });
};

interface ProbeCache {
  readonly version: number;
  readonly generatedAt: number;
  readonly roots: Record<string, boolean>;
}

const VERSION = 1;

const readCache = (now: number): ProbeCache => {
  const parsed = tryReadJson(stateFile(PROBE_FILE));
  if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
    const record = parsed as Record<string, unknown>;
    const generatedAt = typeof record['generatedAt'] === 'number' ? record['generatedAt'] : 0;
    const roots = record['roots'];
    if (record['version'] === VERSION && now - generatedAt <= PROBE_TTL_MS
      && typeof roots === 'object' && roots !== null) {
      return { version: VERSION, generatedAt, roots: roots as Record<string, boolean> };
    }
  }
  return { version: VERSION, generatedAt: now, roots: {} };
};

export interface RootCoverage {
  readonly root: string;
  readonly indexed: boolean;
}

/** Probed once a day per root, because a privacy exclusion is not something that moves often. */
export const spotlightCoverage = (
  roots: readonly string[],
  now: number = Date.now(),
): RootCoverage[] => {
  const cache = readCache(now);
  const known = { ...cache.roots };
  let learned = false;
  for (const root of roots) {
    if (typeof known[root] === 'boolean') continue;
    known[root] = probeRoot(root);
    learned = true;
  }
  if (learned) {
    try {
      writeAtomic(stateFile(PROBE_FILE),
        `${JSON.stringify({ version: VERSION, generatedAt: cache.generatedAt, roots: known })}\n`);
    } catch {
      // A read-only state directory costs one probe per run, never an answer.
    }
  }
  return roots.map((root) => ({ root, indexed: known[root] === true }));
};

export const indexedRoots = (roots: readonly string[], now: number = Date.now()): string[] =>
  spotlightCoverage(roots, now).filter((one) => one.indexed).map((one) => one.root);

const targetOf = (path: string): Target | null => {
  try {
    const stats = statSync(path);
    return {
      kind: stats.isDirectory() ? (/\.app$/iu.test(path) ? 'app' : 'dir') : 'file',
      ref: path,
      name: basename(path),
      mtime: stats.mtimeMs,
      source: 'spotlight',
    };
  } catch {
    // Indexed a moment ago, gone now. Spotlight is a cache like any other.
    return null;
  }
};

/**
 * Tier 2. Entered only when the cheap tiers were unsure, and scoped to the configured roots
 * that are actually indexed, one mdfind each - 30ms scoped against 560ms machine-wide here.
 */
export const spotlightTargets = (
  tokens: readonly string[],
  roots: readonly string[],
  now: number = Date.now(),
): Target[] => {
  const query = buildQuery(tokens);
  if (query === null) return [];
  const found: Target[] = [];
  const seen = new Set<string>();
  for (const root of indexedRoots(roots, now)) {
    const out = runMdfind(['-onlyin', root, query], QUERY_TIMEOUT_MS);
    if (out === null) continue;
    for (const line of out.split('\n')) {
      if (line === '' || seen.has(line) || found.length >= LIMIT.spotlight) continue;
      seen.add(line);
      const target = targetOf(line);
      if (target !== null) found.push(target);
    }
  }
  return found;
};
