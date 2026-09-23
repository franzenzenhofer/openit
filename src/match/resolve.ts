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

/**
 * One thing is named exactly what was typed, and nothing else is.
 *
 * The general gap of 250 exists because thousands of Rechnung-2025NNNN.pdf differ by four
 * digits, and it costs this case: `openit whatsapp` scored WhatsApp.app 1000 and
 * whatsapp-bridge 800, a gap of 200, and asked. An exact name is not a near miss - it is the
 * answer, as long as it is the only one.
 */
const soleExactName = (query: ParsedQuery, ranked: readonly Scored<Target>[]): Scored<Target> | null => {
  const exact = ranked.filter((scored) => scored.quality >= SCORE.exact);
  if (exact.length === 1) return exact[0] ?? null;
  // Three things here are literally called "whatsapp": the app, and two source folders inside
  // one project. One word that names an installed application is a request to launch it -
  // finding the folder is what cdai is for.
  const apps = exact.filter((scored) => scored.item.kind === 'app');
  return query.tokens.length === 1 && apps.length === 1 ? apps[0] ?? null : null;
};

export const decideTargets = (
  query: ParsedQuery,
  ranked: readonly Scored<Target>[],
): TargetDecision => {
  if (query.order !== 'none') return applyOrder(query, ranked);
  const decision = decide(ranked, THRESHOLD);
  if (decision.kind === 'hit') return decision;
  const exact = soleExactName(query, ranked);
  return exact === null ? decision : { kind: 'hit', item: exact.item, score: exact.score };
};
