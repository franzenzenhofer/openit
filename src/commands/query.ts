import { existsSync } from 'node:fs';
import { pick, toItems } from '@franzenzenhofer/intent-core/picker';
import type { Scored } from '@franzenzenhofer/intent-core/match/decide';
import { loadConfig, allRoots, type Config } from '../config.js';
import { literalTarget } from '../match/literal.js';
import { loadTaught } from '../store/links.js';
import { resolveHandler } from '../match/handler-match.js';
import { resolveIn, tokenizeArgs, type ParsedQuery } from '../match/tokenize.js';
import { LIMIT, LITERAL_SCORE } from '../match/constants.js';
import { rootNames, tier1 } from '../sources.js';
import {
  aiCandidates, decideFrom, deterministicPool, rescan, scoreContext, spotlightPool,
  type QueryContext, type Resolution,
} from '../pipeline.js';
import { askAi } from '../ai/client.js';
import { appName } from '../handler.js';
import { normalizeIntent, recall } from '../store/memory.js';
import { EXIT, fail, note, type ExitCode } from '../protocol.js';
import { displayTarget } from '../display.js';
import { act, type ActMode } from './act.js';
import type { Target } from '../target.js';
import type { Action } from '../action.js';
import type { Handler } from '../handler.js';
import type { TargetDecision } from '../match/resolve.js';
import type { Origin } from '../risk/policy.js';

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

/**
 * Tier 0.5. A name the user taught by hand is not a search term, it IS the answer - which is
 * what makes `openit gsc` permanent. Ranking would only ever put it near the six directories
 * that happen to start with the same three letters.
 */
const taughtTarget = (query: ParsedQuery): Target | null => {
  if (query.tokens.length !== 1) return null;
  const word = query.tokens[0];
  const link = loadTaught().find((taught) => taught.name === word);
  if (link === undefined) return null;
  return { kind: 'url', ref: link.url, name: link.name, mtime: link.addedAt, source: 'link-index' };
};

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

/**
 * A remembered answer: the same words, the same thing, the same app. Re-read from the store
 * and then classified from scratch like anything else - being remembered is not evidence that
 * a file is still what it was when it was remembered.
 */
const rememberedAction = (
  args: readonly string[],
  explicitHandler: boolean,
): Shortcut | null => {
  const found = recall(normalizeIntent(args.join(' ')));
  if (found === undefined) return null;
  const { kind, ref, handler } = found.value;
  const target: Target = {
    kind, ref, name: ref.split('/').filter((part) => part !== '').at(-1) ?? ref,
    mtime: 0, source: 'alias',
  };
  if (explicitHandler || handler === null || !existsSync(handler)) {
    return { target, origin: 'alias', handler: null };
  }
  return {
    target,
    origin: 'alias',
    handler: { kind: 'app', app: { name: appName(handler), path: handler, bundleId: null } },
  };
};

interface Understood {
  readonly query: ParsedQuery;
  readonly handler: Handler;
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
  if (handler.kind === 'handler') return { query, handler: handler.handler };
  const closest = handler.closest.length === 0
    ? 'nothing like it is installed' : `closest: ${handler.closest.join(', ')}`;
  return fail(`no application matches "${handler.word}"`, closest), EXIT.noMatch;
};

interface Shortcut {
  readonly target: Target;
  readonly origin: Origin;
  /** A remembered answer carries the app it was opened with, unless the user named one now. */
  readonly handler: Handler | null;
}

/** The answers that are not searches at all: spelled out, taught by name, or remembered. */
const withoutSearching = (
  args: readonly string[],
  query: ParsedQuery,
): Shortcut | null => {
  const literal = literalTarget(args);
  if (literal !== null) return { target: literal, origin: 'literal', handler: null };
  const taught = taughtTarget(query);
  if (taught !== null) return { target: taught, origin: 'alias', handler: null };
  return rememberedAction(args, query.handlerWord !== null);
};

export const runQuery = async (args: readonly string[], options: QueryOptions): Promise<ExitCode> => {
  if (tokenizeArgs(args).tokens.length === 0) {
    return fail('nothing to open', 'usage: openit <words describing what to open>'), EXIT.error;
  }
  const config = loadConfig();
  const understood = understand(args, config, options);
  if (typeof understood === 'number') return understood;
  const { query, handler } = understood;
  const run = (found: Shortcut, score: number, reason?: string): Promise<ExitCode> =>
    act({
      action: buildAction(query, found.target, found.handler ?? handler, options),
      origin: found.origin,
      roots: allRoots(config),
      score,
      handlerFromAi: false,
      mode: options.mode,
      intent: found.origin === 'ai' ? normalizeIntent(args.join(' ')) : null,
      ...(reason === undefined ? {} : { reason }),
    });
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
