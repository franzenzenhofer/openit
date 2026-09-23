import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { webkitTimeToMs, type BrowserProfile } from './bookmarks.js';
import type { Link } from './links.js';

const SQLITE = '/usr/bin/sqlite3';
const TIMEOUT_MS = 5000;
const MAX_BUFFER = 8 * 1024 * 1024;
/** Per profile. The whole history of a browser is not an index, it is a diary. */
export const HISTORY_LIMIT = 400;

/**
 * Read-only in three separate ways, because this is the user's browsing history and openit is
 * not the program that owns it: the file is copied first, the copy is opened `immutable=1` so
 * sqlite writes no journal beside it, and the copy is deleted in a `finally`.
 *
 * Reading it at all is opt-in (`openit setup --history`), and it stays off by default.
 */
const SELECT = 'SELECT url, title, visit_count, last_visit_time FROM urls'
  + ' WHERE hidden = 0 AND url NOT LIKE \'chrome%\''
  + ` ORDER BY visit_count DESC LIMIT ${String(HISTORY_LIMIT)};`;

interface Row {
  readonly url?: unknown;
  readonly title?: unknown;
  readonly last_visit_time?: unknown;
}

const isRecord = (value: unknown): value is Row =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const parseRows = (raw: string): Link[] => {
  if (raw.trim() === '') return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.flatMap((row): Link[] => {
    if (!isRecord(row) || typeof row.url !== 'string') return [];
    return [{
      url: row.url,
      title: typeof row.title === 'string' ? row.title : '',
      source: 'history',
      at: webkitTimeToMs(row.last_visit_time),
    }];
  });
};

const query = (file: string): string => {
  const result = spawnSync(SQLITE, ['-json', `file:${file}?immutable=1`, SELECT], {
    encoding: 'utf8', timeout: TIMEOUT_MS, maxBuffer: MAX_BUFFER,
  });
  return result.status === 0 && typeof result.stdout === 'string' ? result.stdout : '';
};

export const readHistoryFile = (source: string): Link[] => {
  if (!existsSync(source) || !existsSync(SQLITE)) return [];
  const dir = mkdtempSync(join(tmpdir(), 'openit-history-'));
  try {
    const copy = join(dir, 'History');
    copyFileSync(source, copy);
    return parseRows(query(copy));
  } catch {
    // A locked, moved or unreadable history file is simply one source that has nothing to say.
    return [];
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

export const readHistory = (profiles: readonly BrowserProfile[]): Link[] =>
  profiles.flatMap((profile) => readHistoryFile(join(profile.dir, 'History')));
