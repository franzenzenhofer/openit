import { collapseChains, decide, dropDescendants, rank, type Decision, type Scored } from '@franzenzenhofer/intent-core/match/decide';
import { LIMIT, ORDERED_HIT, THRESHOLD } from './constants.js';
import { contextualScore, matchQuality, type ScoreContext } from './score-target.js';
import { SCORE } from './constants.js';
import type { ParsedQuery } from './tokenize.js';
import type { Target } from '../target.js';

export type TargetDecision = Decision<Target>;

const pathOf = (target: Target): string => target.ref;

export const rankTargets = (
  query: ParsedQuery,
  targets: readonly Target[],
  context: ScoreContext,
): Scored<Target>[] => {
  const ranked = rank(
    targets,
    (target) => {
      const quality = matchQuality(query, target);
      if (quality === SCORE.none) return null;
      return { quality, score: contextualScore(query, target, context, quality) };
    },
    (a, b) => a.ref.localeCompare(b.ref),
  );
  // A directory and its own ancestor are the same place; two spellings are not two answers.
  return collapseChains(ranked, pathOf);
};

/**
 * `latest`/`oldest`: mtime decides outright. Across thousands of near-identical invoice names
 * no single one wins on text, but the newest one is still a definite answer.
 */
const applyOrder = (query: ParsedQuery, ranked: readonly Scored<Target>[]): TargetDecision => {
  const best = ranked[0];
  if (best === undefined) return { kind: 'unsure', candidates: [] };
  if (best.quality < ORDERED_HIT) return { kind: 'unsure', candidates: ranked.slice(0, LIMIT.aiTargets) };
  const pool = dropDescendants(
    ranked.filter((scored) => scored.quality >= best.quality - THRESHOLD.gap),
    pathOf,
  );
  const newest = query.order === 'latest';
  const chosen = [...pool].sort((a, b) =>
    (newest ? b.item.mtime - a.item.mtime : a.item.mtime - b.item.mtime))[0];
  return chosen === undefined
    ? { kind: 'unsure', candidates: ranked }
    : { kind: 'hit', item: chosen.item, score: chosen.score };
};

export const decideTargets = (
  query: ParsedQuery,
  ranked: readonly Scored<Target>[],
): TargetDecision =>
  query.order === 'none' ? decide(ranked, THRESHOLD) : applyOrder(query, ranked);
