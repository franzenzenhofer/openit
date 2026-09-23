import { contractTilde } from '@franzenzenhofer/intent-core/paths';
import { loadIndex, refreshIndex } from '@franzenzenhofer/intent-core/store/indexer';
import { loadConfig } from '../config.js';
import { buildAppIndex, loadAppIndex, saveAppIndex } from '../store/apps.js';
import { docTargets } from '../store/docs.js';
import { buildLinkIndex, loadLinkIndex, loadTaught, saveLinkIndex } from '../store/links.js';
import { EXIT, fail, note, type ExitCode } from '../protocol.js';

export const runIndex = (args: readonly string[]): ExitCode => {
  const refresh = args.includes('--refresh');
  const unknown = args.find((arg) => arg !== '--refresh');
  if (unknown !== undefined) return fail(`unknown option ${unknown}`, 'usage: openit index [--refresh]'), EXIT.error;
  const config = loadConfig();
  const index = refresh ? refreshIndex(config) : loadIndex();
  const apps = refresh ? buildAppIndex() : loadAppIndex();
  if (refresh) saveAppIndex(apps);
  const docs = docTargets(config.docRoots, config.ignore);
  const links = refresh ? buildLinkIndex(config.history) : loadLinkIndex(config.history);
  if (refresh) saveLinkIndex(links);
  note(`openit: ${String(index.entries.length)} directories under ${String(config.roots.length)} roots`);
  if (index.truncated !== null) note(`        crawl stopped early (${index.truncated})`);
  note(`openit: ${String(docs.length)} files in ${String(config.docRoots.length)} document roots`);
  note(`openit: ${String(apps.apps.length)} applications`);
  note(`openit: ${String(links.length)} links${config.history ? ' (bookmarks and history)' : ' (bookmarks; history is off)'}, ${String(loadTaught().length)} taught by hand`);
  for (const root of config.roots) note(`          ${contractTilde(root.path)}`);
  return EXIT.ok;
};
