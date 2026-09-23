import type { MatchOptions } from '@franzenzenhofer/intent-core/match/score';
import type { DecideThresholds } from '@franzenzenhofer/intent-core/match/decide';

/** Every tunable number openit uses lives here, so thresholds are tuned in one place. */

export const SCORE = {
  exact: 1000,
  prefix: 800,
  wordBoundary: 600,
  substring: 400,
  fuzzyMax: 380,
  /** Found nowhere in the name but present in the path above it. */
  pathOnly: 200,
  none: 0,
} as const;

export const MATCH: MatchOptions = {
  weights: SCORE,
  fuzzy: { baseShare: 0.45, densityShare: 0.35, coverageShare: 0.2 },
  typo: { minLength: 3, maxLength: 64 },
};

export const BONUS = {
  /** Weight of log2(1 + frecency), over openit's own opening history. */
  frecency: 100,
  underCwd: 25,
  brevity: 40,
  /** The query named a kind and this candidate is that kind. */
  kindMatch: 60,
  /** openit's targets are documents, not projects, so recent beats old. */
  recency: 45,
  /**
   * How far above an exact name an installed application ranks when the whole query is one
   * word. A launcher's whole job is that "chrome" means the browser.
   */
  appExact: 80,
} as const;

/**
 * `gap` is 250 where cdai uses 200. cdai ranks project directories with distinctive names;
 * openit ranks thousands of Rechnung-2025NNNN.pdf that differ by four digits, so the runner up
 * sits much closer, much more often.
 */
export const THRESHOLD: DecideThresholds = {
  hit: 550,
  gap: 250,
  candidate: 400,
  minPickerCandidates: 2,
  picker: 10,
  unsure: 30,
};

/** A thing the user spelled out in full is not a search result; nothing can outrank it. */
export const LITERAL_SCORE = 1000;

/** With an order operator mtime decides outright and the text gap is irrelevant. */
export const ORDERED_HIT = 400;

export const HANDLER_THRESHOLD = { hit: 550, candidate: 400 } as const;

export const LIMIT = {
  picker: 10,
  aiTargets: 30,
  aiFrecent: 20,
  suggestions: 3,
  /** Spotlight hits stat'd before the mtime pick. */
  spotlight: 4000,
  /** Children listed per matched directory. */
  lazyChildren: 400,
  /** Directories whose children are listed at all. */
  lazyParents: 3,
  /**
   * Bookmarks plus, when it is turned on, the most visited pages of every browser profile.
   * Measured at 452 bookmarks across seven Chrome profiles on the machine openit was written
   * on, so a few hundred would have silently truncated one real user's own bookmarks.
   */
  urlIndex: 2000,
  apps: 400,
} as const;

/**
 * Strictly smaller than cdai's, because six of cdai's stopwords are operators or kinds here:
 * `in`, `with`, `show`, `folder`, `dir`, `new`, `last`, `latest`, `first`, `oldest` and `here`
 * all mean something to openit.
 */
/**
 * `openit` is deliberately NOT in here, though it is how every command starts. A directory on
 * this machine is called openit, and a tool that cannot find the thing named after it is a
 * tool with a hole in it. The doubled `openit openit readme` costs nothing: a stopword list
 * that would erase the whole query erases nothing.
 */
export const STOPWORDS = new Set([
  'the', 'a', 'an', 'my', 'to', 'of', 'for', 'from',
  'this', 'that', 'me', 'please', 'it', 'up', 'open',
]);

export const LATEST_WORDS = new Set(['latest', 'newest', 'last', 'recent']);
export const OLDEST_WORDS = new Set(['oldest', 'first']);
export const REVEAL_WORDS = new Set(['reveal', 'finder']);
/**
 * Dropped, never acted on. "show me the invoice" means open it; only "show it in FINDER" means
 * reveal it, so the word that decides is the app's name and `show` is filler around it.
 */
export const SHOW_WORDS = new Set(['show']);
export const NEW_WORDS = new Set(['new']);
export const BACKGROUND_WORDS = new Set(['background', 'bg']);
export const WITH_OPERATOR = 'with';
export const IN_OPERATOR = 'in';
export const HERE_WORD = 'here';

export const YEARS = { min: 1990, max: 2999 } as const;
