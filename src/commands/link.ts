import { loadTaught, saveTaught, type TaughtLink } from '../store/links.js';
import { parseUrl } from '../risk/scheme.js';
import { sanitizeLabel } from '../ai/sanitize.js';
import { EXIT, fail, note, type ExitCode } from '../protocol.js';

const USAGE = 'openit link add <name> <url> | list | forget <name>';
const MAX_NAME = 40;
const MAX_LINKS = 256;

/**
 * A name openit can match and a person can read: one lowercase word of letters, digits, dashes
 * or dots. Deliberately narrow - a taught name is matched against every query, and a name
 * carrying spaces or invisible characters would be a name nobody could type again on purpose.
 */
export const isLinkName = (name: string): boolean =>
  /^[a-z0-9][a-z0-9.-]*$/u.test(name) && name.length <= MAX_NAME;

const listLinks = (links: readonly TaughtLink[]): ExitCode => {
  if (links.length === 0) {
    note('openit: no links taught yet');
    note(`        ${USAGE}`);
    return EXIT.ok;
  }
  for (const link of links) note(`  ${link.name.padEnd(16)} ${sanitizeLabel(link.url, 120)}`);
  return EXIT.ok;
};

const addLink = (links: readonly TaughtLink[], name: string, url: string): ExitCode => {
  if (!isLinkName(name)) {
    return fail(`"${sanitizeLabel(name, MAX_NAME)}" is not a usable name`,
      'one word: letters, digits, dashes or dots'), EXIT.error;
  }
  const parsed = parseUrl(url);
  if (parsed === null) return fail(`"${sanitizeLabel(url, 80)}" is not a URL`, USAGE), EXIT.error;
  if (parsed.klass === 'forbidden' || parsed.klass === 'file') {
    // Teaching a name for it would only move the refusal from now to later.
    return fail(`openit never opens ${parsed.scheme}: links`, 'nothing was saved'), EXIT.refused;
  }
  if (parsed.hasUserInfo) {
    return fail('that URL carries a user name and password', 'nothing was saved'), EXIT.refused;
  }
  const kept = links.filter((link) => link.name !== name);
  if (kept.length >= MAX_LINKS) {
    return fail(`that is ${String(MAX_LINKS)} links already`, 'openit link forget <name>'), EXIT.error;
  }
  saveTaught([...kept, { name, url, addedAt: Date.now() }]);
  note(`openit: ${name} is ${sanitizeLabel(url, 120)}`);
  return EXIT.ok;
};

const forgetLink = (links: readonly TaughtLink[], name: string): ExitCode => {
  const kept = links.filter((link) => link.name !== name);
  if (kept.length === links.length) {
    return fail(`no link named "${sanitizeLabel(name, MAX_NAME)}"`, 'openit link list'), EXIT.error;
  }
  saveTaught(kept);
  note(`openit: forgot ${name}`);
  return EXIT.ok;
};

export const runLink = (args: readonly string[]): ExitCode => {
  const [verb, name, url] = args;
  const links = loadTaught();
  if (verb === undefined || verb === 'list') return listLinks(links);
  if (verb === 'add') {
    if (name === undefined || url === undefined) return fail('add needs a name and a URL', USAGE), EXIT.error;
    return addLink(links, name.toLowerCase(), url);
  }
  if (verb === 'forget') {
    if (name === undefined) return fail('forget needs a name', USAGE), EXIT.error;
    return forgetLink(links, name.toLowerCase());
  }
  return fail(`unknown link command "${sanitizeLabel(verb, MAX_NAME)}"`, USAGE), EXIT.error;
};
