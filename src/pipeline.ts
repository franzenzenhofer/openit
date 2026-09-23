import { loadIndex, matchesConfig, refreshIndex, type DirIndex } from '@franzenzenhofer/intent-core/store/indexer';
import { frecencyByKey, loadVisits } from '@franzenzenhofer/intent-core/store/visits';
import { stateFile } from '@franzenzenhofer/intent-core/paths';
import type { Scored } from '@franzenzenhofer/intent-core/match/decide';
import { decideTargets, rankTargets, type TargetDecision } from './match/resolve.js';
import { dirCandidates, looseTargets } from './match/score-target.js';
import { LIMIT } from './match/constants.js';
import { readings, type ParsedQuery } from './match/tokenize.js';
import { tier1, tier1b } from './sources.js';
import { spotlightTargets } from './store/spotlight.js';
import { isIdentity } from './identity.js';
import { allRoots, type Config } from './config.js';
import type { ScoreContext } from './match/score-target.js';
import type { Target } from './target.js';
import type { Origin } from './risk/policy.js';

const DB_FILE = 'db.json';
const MILLIS_PER_SECOND = 1000;

export interface Resolved {
  readonly target: Target;
  readonly score: number;
  readonly origin: Origin;
  /** The model's own words, when a model is what answered. Printed quoted and attributed. */
  readonly reason?: string;
}

export type Resolution =
  | { readonly kind: 'target'; readonly resolved: Resolved }
  /** A picker was shown and nobody chose. Nothing was launched and nothing should be. */
  | { readonly kind: 'declined' }
  | { readonly kind: 'none'; readonly guesses: readonly Scored<Target>[] };

export interface QueryContext extends ScoreContext {
  readonly roots: readonly string[];
}

export const scoreContext = (config: Config): QueryContext => {
  const db = loadVisits({ file: () => stateFile(DB_FILE), isIdentity });
  return {
    cwd: process.cwd(),
    frecency: frecencyByKey(db, Math.floor(Date.now() / MILLIS_PER_SECOND)),
    nowMs: Date.now(),
    roots: allRoots(config),
  };
};

export const freshIndex = (config: Config): DirIndex => {
  const index = loadIndex();
  return matchesConfig(index, config) ? index : refreshIndex(config);
};

export interface Attempt {
  readonly ranked: Scored<Target>[];
  readonly query: ParsedQuery;
}

/** Every reading of the query, best understood first, over one pool of candidates. */
export const bestReading = (
  query: ParsedQuery,
  targets: readonly Target[],
  context: ScoreContext,
): Attempt => {
  let fallback: Attempt = { ranked: [], query };
  for (const reading of readings(query)) {
    const ranked = rankTargets(reading, targets, context);
    if (ranked.length > 0) return { ranked, query: reading };
    if (fallback.ranked.length === 0) fallback = { ranked, query: reading };
  }
  return fallback;
};

export interface Pool {
  readonly targets: Target[];
  readonly attempt: Attempt;
}

/**
 * Tier 1 and 1b: everything cached or one shallow listing deep, then the children of the
 * directories that matched best. A project directory is rarely what someone means when they
 * also said "readme".
 */
export const deterministicPool = (
  query: ParsedQuery,
  config: Config,
  context: ScoreContext,
): Pool => {
  const targets = [...tier1(config, freshIndex(config)).targets];
  let attempt = bestReading(query, targets, context);
  const expanded = tier1b(config, dirCandidates(attempt.query, targets));
  if (expanded.length === 0) return { targets, attempt };
  targets.push(...expanded);
  attempt = bestReading(query, targets, context);
  return { targets, attempt };
};

/** A rescan is the only thing that can change the answer when the words matched nothing. */
export const rescan = (query: ParsedQuery, pool: Pool, config: Config, context: ScoreContext): Pool => {
  const rescanned = tier1(config, refreshIndex(config)).targets;
  const lazy = pool.targets.filter((target) => target.source === 'lazy-child');
  const targets = [...rescanned, ...lazy];
  return { targets, attempt: bestReading(query, targets, context) };
};

/**
 * Tier 2. One mdfind per indexed root, entered only because the cached tiers were unsure -
 * it is the only tier that can see a file openit was never told to index.
 */
export const spotlightPool = (
  query: ParsedQuery,
  pool: Pool,
  context: QueryContext,
): Pool => {
  const found = spotlightTargets([...query.tokens, ...query.years], context.roots);
  if (found.length === 0) return pool;
  const targets = [...pool.targets, ...found];
  return { targets, attempt: bestReading(query, targets, context) };
};

/**
 * What the model is allowed to look at: the things this query loosely resembles, plus the
 * things this person actually opens. Both are already in the pool - the model is never given
 * a reason to widen the search, only to read the same shortlist differently.
 */
export const aiCandidates = (
  query: ParsedQuery,
  pool: Pool,
  context: QueryContext,
): Target[] => {
  const frecent = pool.targets
    .filter((target) => (context.frecency.get(target.ref) ?? 0) > 0)
    .sort((a, b) => (context.frecency.get(b.ref) ?? 0) - (context.frecency.get(a.ref) ?? 0))
    .slice(0, LIMIT.aiFrecent);
  const seen = new Set<string>();
  return [...looseTargets(query, pool.targets), ...frecent].filter((target) => {
    if (seen.has(target.ref)) return false;
    seen.add(target.ref);
    return true;
  });
};

export const decideFrom = (attempt: Attempt): TargetDecision =>
  decideTargets(attempt.query, attempt.ranked);
