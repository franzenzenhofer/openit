import { contractTilde } from '@franzenzenhofer/intent-core/paths';
import { loadIndex, refreshIndex } from '@franzenzenhofer/intent-core/store/indexer';
import { loadConfig } from '../config.js';
import { buildAppIndex, loadAppIndex, saveAppIndex } from '../store/apps.js';
import { docTargets } from '../store/docs.js';
import { buildLinkIndex, loadLinkIndex, loadTaught, saveLinkIndex } from '../store/links.js';
import { EXIT, fail, note, type ExitCode } from '../protocol.js';

const USAGE = 'usage: openit index [--refresh] [--dirs] [--docs] [--apps] [--links]';

const PARTS = ['--dirs', '--docs', '--apps', '--links'] as const;
type Part = (typeof PARTS)[number];

interface Options {
  readonly refresh: boolean;
  readonly parts: readonly Part[];
  readonly error: string | null;
}

/** Naming no part means every part: `openit index --refresh` rebuilds the lot. */
export const parseIndexArgs = (args: readonly string[]): Options => {
  const named = args.filter((arg): arg is Part => (PARTS as readonly string[]).includes(arg));
  const unknown = args.find((arg) => arg !== '--refresh' && !(PARTS as readonly string[]).includes(arg));
  return {
    refresh: args.includes('--refresh'),
    parts: named.length === 0 ? PARTS : named,
    error: unknown === undefined ? null : `unknown option ${unknown}`,
  };
};

export const runIndex = (args: readonly string[]): ExitCode => {
  const options = parseIndexArgs(args);
  if (options.error !== null) return fail(options.error, USAGE), EXIT.error;
  const config = loadConfig();
  const { refresh, parts } = options;
  if (parts.includes('--dirs')) {
    const index = refresh ? refreshIndex(config) : loadIndex();
    note(`openit: ${String(index.entries.length)} directories under ${String(config.roots.length)} roots`);
    if (index.truncated !== null) note(`        crawl stopped early (${index.truncated})`);
    for (const root of config.roots) note(`          ${contractTilde(root.path)}`);
  }
  if (parts.includes('--docs')) {
    const docs = docTargets(config.docRoots, config.ignore);
    note(`openit: ${String(docs.length)} files in ${String(config.docRoots.length)} document roots`);
  }
  if (parts.includes('--apps')) {
    const apps = refresh ? buildAppIndex() : loadAppIndex();
    if (refresh) saveAppIndex(apps);
    note(`openit: ${String(apps.apps.length)} applications`);
  }
  if (parts.includes('--links')) {
    const links = refresh ? buildLinkIndex(config.history) : loadLinkIndex(config.history);
    if (refresh) saveLinkIndex(links);
    const where = config.history ? 'bookmarks and history' : 'bookmarks; history is off';
    note(`openit: ${String(links.length)} links (${where}), ${String(loadTaught().length)} taught by hand`);
  }
  return EXIT.ok;
};
