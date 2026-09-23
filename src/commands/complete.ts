import { emit } from '@franzenzenhofer/intent-core/protocol';
import { matchName } from '@franzenzenhofer/intent-core/match/score';
import { LIMIT, MATCH, SCORE } from '../match/constants.js';
import { loadConfig } from '../config.js';
import { freshIndex } from '../pipeline.js';
import { tier1 } from '../sources.js';
import { memories } from '../store/memory.js';
import { loadTaught } from '../store/links.js';
import { isHonest } from '../ai/sanitize.js';
import { EXIT, type ExitCode } from '../protocol.js';

/**
 * Completion is deterministic and model-free, always. It is also allowed to be wrong about
 * nothing: a Tab that reached for Spotlight or a model would either block the terminal or
 * quietly spend money, so this never leaves the cached tiers.
 */
export const SUBCOMMANDS = [
  'plan', 'which', 'setup', 'doctor', 'index', 'link', 'alias', 'handler', 'init', 'complete',
];

const OPTIONS = ['--with', '--reveal', '--new', '--background', '--wait', '--dry-run', '--version'];

/** A name a shell can insert again as one word, and a person can read. */
const usable = (name: string): boolean =>
  name !== '' && isHonest(name) && !name.includes('\n');

const names = (): string[] => {
  const config = loadConfig();
  const sources = tier1(config, freshIndex(config));
  return [
    ...loadTaught().map((link) => link.name),
    ...memories().map((alias) => alias.query),
    ...sources.targets.map((target) => target.name),
  ].filter(usable);
};

const ranked = (word: string, all: readonly string[]): string[] => {
  const seen = new Set<string>();
  return all
    .map((name) => ({ name, score: matchName(word, name, MATCH) }))
    .filter((one) => one.score > SCORE.none)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .filter((one) => {
      const key = one.name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, LIMIT.picker)
    .map((one) => one.name);
};

export const completeQuery = (args: readonly string[]): string[] => {
  const words = args[0] === '--' ? args.slice(1) : [...args];
  const word = (words.at(-1) ?? '').toLowerCase();
  if (word.startsWith('-')) return OPTIONS.filter((option) => option.startsWith(word));
  const subcommands = words.length <= 1
    ? SUBCOMMANDS.filter((command) => command.startsWith(word)) : [];
  if (word === '') return subcommands;
  return [...subcommands, ...ranked(word, names())];
};

export const runComplete = (args: readonly string[]): ExitCode => {
  for (const completion of completeQuery(args)) emit(completion);
  return EXIT.ok;
};
