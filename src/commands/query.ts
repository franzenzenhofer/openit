import { existsSync } from 'node:fs';
import { pick, toItems } from '@franzenzenhofer/intent-core/picker';
import type { Scored } from '@franzenzenhofer/intent-core/match/decide';
import { loadConfig, allRoots, type Config } from '../config.js';
import { withoutSearching, type Shortcut } from '../match/shortcuts.js';
import { handlerForTarget, resolveHandler } from '../match/handler-match.js';
import { resolveIn, tokenizeArgs, type ParsedQuery } from '../match/tokenize.js';
import { LIMIT, LITERAL_SCORE } from '../match/constants.js';
import { rootNames, tier1 } from '../sources.js';
import {
  aiCandidates, decideFrom, deterministicPool, rescan, scoreContext, spotlightPool,
  type QueryContext, type Resolution,
} from '../pipeline.js';
import { askAi } from '../ai/client.js';
import { normalizeIntent } from '../store/memory.js';
import { EXIT, fail, note, type ExitCode } from '../protocol.js';
import { displayTarget } from '../display.js';
import { act, type ActMode } from './act.js';
import type { Target } from '../target.js';
import type { Action } from '../action.js';
import type { AppRef, Handler } from '../handler.js';
import type { TargetDecision } from '../match/resolve.js';

export interface QueryOptions {
  readonly mode: ActMode;
  readonly wait: boolean;
  readonly withWord: string | null;
  readonly reveal: boolean;
  readonly newInstance: boolean;
  readonly background: boolean;
}

const buildAction = (
  query: ParsedQuery, target: Target, handler: Handler, options: QueryOptions,
): Action => ({
  target,
  handler,
  newInstance: query.newInstance || options.newInstance,
  background: query.background || options.background,
  reveal: query.reveal || options.reveal,
  wait: options.wait,
});

const suggest = (query: ParsedQuery, guesses: readonly Scored<Target>[], config: Config): ExitCode => {
  fail(`no match for "${query.raw}"`);
  for (const guess of guesses.slice(0, LIMIT.suggestions)) {
    process.stderr.write(`        ${displayTarget(guess.item)}\n`);
  }
  const roots = config.roots.length + config.docRoots.length;
  process.stderr.write(`        searched ${String(roots)} ${roots === 1 ? 'root' : 'roots'}, freshly scanned\n`);
  process.stderr.write('        not there? `openit setup --root <path>`, or reach deeper with `--depth <n>`\n');
  return EXIT.noMatch;
};

const chooseTarget = (decision: TargetDecision): Target | null => {
  if (decision.kind === 'hit') return decision.item;
  if (decision.kind !== 'choose') return null;
  const chosen = pick(toItems(decision.candidates.map((c) => c.item.ref)));
  if (chosen === null) return null;
  return decision.candidates.find((c) => c.item.ref === chosen)?.item ?? null;
};

const answered = (decision: TargetDecision): Resolution => {
  const target = chooseTarget(decision);
  if (target === null) return { kind: 'declined' };
  return {
    kind: 'target',
    resolved: { target, score: decision.kind === 'hit' ? decision.score : 0, origin: 'deterministic' },
  };
};

/** The deterministic tiers, cheapest first, each one entered only because the last was unsure. */
const resolve = async (
  query: ParsedQuery,
  config: Config,
  context: QueryContext,
): Promise<Resolution> => {
  let pool = deterministicPool(query, config, context);
  let decision = decideFrom(pool.attempt);
  if (decision.kind === 'unsure') {
    // Nothing answered, so the one thing that can change the answer is data openit lacks.
    pool = rescan(query, pool, config, context);
    decision = decideFrom(pool.attempt);
  }
  if (decision.kind === 'unsure') {
    pool = spotlightPool(query, pool, context);
    decision = decideFrom(pool.attempt);
  }
  if (decision.kind !== 'unsure') return answered(decision);
  const asked = await askAi({
    query: query.raw,
    targets: aiCandidates(query, pool, context),
    roots: context.roots,
    ai: config.ai,
  });
  if (asked.kind === 'target') {
    return { kind: 'target', resolved: { target: asked.target, score: 0, origin: 'ai', reason: asked.reason } };
  }
  note(`openit: the model had no answer (${asked.why})`);
  return { kind: 'none', guesses: pool.attempt.ranked };
};

interface Understood {
  readonly query: ParsedQuery;
  readonly handler: Handler;
  readonly apps: readonly AppRef[];
}

/** The words, read against the real roots and the real app index. */
const understand = (args: readonly string[], config: Config, options: QueryOptions): Understood | ExitCode => {
  const parsed = tokenizeArgs(args);
  const apps = tier1(config, { version: 0, generatedAt: 0, configKey: '', truncated: null, entries: [] }).apps;
  const names = rootNames(config);
  const withWord = options.withWord ?? parsed.withWord;
  const query = resolveIn(
    { ...parsed, withWord, handlerWord: withWord, handlerExplicit: withWord !== null },
    (word) => names.has(word) || existsSync(word),
    (word) => apps.apps.some((app) => app.name.toLowerCase().startsWith(word)),
  );
  const handler = resolveHandler({ query, apps: apps.apps, rules: config.handlers });
  if (handler.kind === 'handler') return { query, handler: handler.handler, apps: apps.apps };
  const closest = handler.closest.length === 0
    ? 'nothing like it is installed' : `closest: ${handler.closest.join(', ')}`;
  return fail(`no application matches "${handler.word}"`, closest), EXIT.noMatch;
};

interface OpenInput {
  readonly args: readonly string[];
  readonly config: Config;
  readonly understood: Understood;
  readonly options: QueryOptions;
  readonly found: Shortcut;
  readonly score: number;
  readonly reason?: string;
}

/**
 * Nobody named a handler, so a rule taught for this kind of file is what a double click would
 * have done had the user set it in Finder - which is what they asked for.
 */
const handlerFor = (input: OpenInput): Handler => {
  const chosen = input.found.handler ?? input.understood.handler;
  if (chosen.kind !== 'default') return chosen;
  return handlerForTarget(input.found.target, input.config.handlers, input.understood.apps) ?? chosen;
};

const open = (input: OpenInput): Promise<ExitCode> => {
  const { found, config, options } = input;
  return act({
    action: buildAction(input.understood.query, found.target, handlerFor(input), options),
    origin: found.origin,
    roots: allRoots(config),
    score: input.score,
    handlerFromAi: false,
    mode: options.mode,
    intent: found.origin === 'ai' ? normalizeIntent(input.args.join(' ')) : null,
    ...(input.reason === undefined ? {} : { reason: input.reason }),
  });
};

export const runQuery = async (args: readonly string[], options: QueryOptions): Promise<ExitCode> => {
  if (tokenizeArgs(args).tokens.length === 0) {
    return fail('nothing to open', 'usage: openit <words describing what to open>'), EXIT.error;
  }
  const config = loadConfig();
  const understood = understand(args, config, options);
  if (typeof understood === 'number') return understood;
  const run = (found: Shortcut, score: number, reason?: string): Promise<ExitCode> =>
    open({ args, config, understood, options, found, score, ...(reason === undefined ? {} : { reason }) });
  const { query } = understood;
  const shortcut = withoutSearching(args, query);
  if (shortcut !== null) return run(shortcut, LITERAL_SCORE);
  if (config.roots.length === 0 && config.docRoots.length === 0) {
    return fail('no roots configured', 'run `openit setup` once to pick what to learn'), EXIT.error;
  }
  const resolution = await resolve(query, config, scoreContext(config));
  if (resolution.kind === 'declined') return EXIT.declined;
  if (resolution.kind === 'none') return suggest(query, resolution.guesses, config);
  const { target, score, origin, reason } = resolution.resolved;
  return run({ target, origin, handler: null }, score, reason);
};
