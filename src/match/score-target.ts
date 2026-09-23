import { frecencyBonus, looseScore, matchName } from '@franzenzenhofer/intent-core/match/score';
import { BONUS, LIMIT, MATCH, SCORE } from './constants.js';
import { matchesKind } from './kinds.js';
import type { ParsedQuery } from './tokenize.js';
import type { Target } from '../target.js';

const DAY_MS = 86_400_000;
const RECENCY_HALF_LIFE_DAYS = 30;

export interface ScoreContext {
  readonly cwd: string;
  readonly frecency: ReadonlyMap<string, number>;
  readonly nowMs: number;
}

const parentPath = (path: string): string => {
  const idx = path.lastIndexOf('/');
  return idx <= 0 ? '' : path.slice(0, idx);
};

const tokenScore = (token: string, target: Target): number => {
  const nameScore = matchName(token, target.name, MATCH);
  if (nameScore > SCORE.none) return nameScore;
  if (target.kind === 'url') return target.ref.toLowerCase().includes(token) ? SCORE.pathOnly : SCORE.none;
  return parentPath(target.ref).toLowerCase().includes(token) ? SCORE.pathOnly : SCORE.none;
};

const passesFilters = (query: ParsedQuery, target: Target): boolean => {
  const lower = target.ref.toLowerCase();
  if (query.targetKinds.length > 0 && !query.targetKinds.includes(target.kind)) return false;
  if (!query.years.every((year) => lower.includes(year))) return false;
  if (!query.within.every((folder) => lower.includes(folder))) return false;
  if (query.scope !== null && !lower.includes(query.scope.toLowerCase())) return false;
  if (query.kinds.length === 0) return true;
  // A kind filter is about files; a folder, an app or a link is never excluded by one.
  if (target.kind !== 'file') return true;
  return query.kinds.some((kind) => matchesKind(target.ref, kind));
};

/** Multi token AND: every token must match somewhere, the mean match class is the base score. */
export const matchQuality = (query: ParsedQuery, target: Target): number => {
  if (!passesFilters(query, target) || query.tokens.length === 0) return SCORE.none;
  let sum = 0;
  for (const token of query.tokens) {
    const single = tokenScore(token, target);
    if (single === SCORE.none) return SCORE.none;
    sum += single;
  }
  return sum / query.tokens.length;
};

const brevityBonus = (query: ParsedQuery, target: Target): number => {
  const queried = query.tokens.reduce((sum, token) => sum + token.length, 0);
  if (queried === 0 || target.name.length === 0) return 0;
  return BONUS.brevity * Math.min(1, queried / target.name.length);
};

const recencyBonus = (target: Target, nowMs: number): number => {
  if (target.mtime <= 0) return 0;
  const days = Math.max(0, (nowMs - target.mtime) / DAY_MS);
  return BONUS.recency / (1 + days / RECENCY_HALF_LIFE_DAYS);
};

const kindBonus = (query: ParsedQuery, target: Target): number => {
  if (query.kinds.length === 0 || target.kind !== 'file') return 0;
  return query.kinds.some((kind) => matchesKind(target.ref, kind)) ? BONUS.kindMatch : 0;
};

const appBonus = (query: ParsedQuery, target: Target): number => {
  if (target.kind !== 'app' || query.tokens.length !== 1) return 0;
  return target.name.toLowerCase() === query.tokens[0] ? BONUS.appExact : 0;
};

export const contextualScore = (
  query: ParsedQuery,
  target: Target,
  context: ScoreContext,
  quality: number,
): number => {
  const under = target.kind !== 'url' && target.ref !== context.cwd
    && target.ref.startsWith(`${context.cwd}/`) ? BONUS.underCwd : 0;
  return quality
    + frecencyBonus(context.frecency.get(target.ref) ?? 0, BONUS.frecency)
    + under
    + brevityBonus(query, target)
    + recencyBonus(target, context.nowMs)
    + kindBonus(query, target)
    + appBonus(query, target);
};

/** Relaxed match, used only to give the AI tier something to look at when nothing matched. */
export const looseTargets = (query: ParsedQuery, targets: readonly Target[]): Target[] =>
  targets
    .map((target) => ({ target, score: looseScore(query.tokens, target.name, MATCH) }))
    .filter((scored) => scored.score > SCORE.none)
    .sort((a, b) => b.score - a.score)
    .slice(0, LIMIT.aiTargets)
    .map((scored) => scored.target);
