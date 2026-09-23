import { dropStopwords, isYear, splitWords } from '@franzenzenhofer/intent-core/match/words';
import { pathReading, urlReadings } from '@franzenzenhofer/intent-core/match/url';
import { STOPWORDS, YEARS } from './constants.js';
import { takeFlags, takeKinds, takeOperands, takeOrder, type Order } from './operators.js';
import type { FileKind } from './kinds.js';
import type { TargetKind } from '../target.js';

export interface ParsedQuery {
  readonly raw: string;
  /** Search terms, lowercased, operators and stopwords removed. */
  readonly tokens: readonly string[];
  readonly order: Order;
  readonly years: readonly string[];
  /** `in <x>` before it is known whether it names a place or an app. */
  readonly inWord: string | null;
  /** `with <app>`, always a handler. */
  readonly withWord: string | null;
  /** Restrict candidates to this root name. */
  readonly scope: string | null;
  /** The user named the handler, which changes the failure mode entirely. */
  readonly handlerWord: string | null;
  readonly handlerExplicit: boolean;
  readonly kinds: readonly FileKind[];
  readonly targetKinds: readonly TargetKind[];
  readonly reveal: boolean;
  readonly newInstance: boolean;
  readonly background: boolean;
  /** Folders a spelled path puts above its own name: required, worth no score. */
  readonly within: readonly string[];
}

export const tokenize = (input: string): ParsedQuery => {
  const words = splitWords(input);
  const operands = takeOperands(words);
  const flags = takeFlags(operands.rest);
  const ordered = takeOrder(flags.rest);
  const years = ordered.rest.filter((word) => isYear(word, YEARS));
  const searchable = ordered.rest.filter((word) => !isYear(word, YEARS));
  const { kinds, targetKinds } = takeKinds(searchable);
  const tokens = dropStopwords(searchable, STOPWORDS);
  const withWord = operands.taken.withWord;
  return {
    raw: input,
    // An operator or a year can also be the entire query, and then it is a literal name.
    tokens: tokens.length > 0 ? tokens : words,
    order: ordered.taken,
    years,
    inWord: operands.taken.inWord,
    withWord,
    scope: null,
    handlerWord: withWord,
    handlerExplicit: withWord !== null,
    kinds,
    targetKinds,
    ...flags.taken,
    within: [],
  };
};

export const tokenizeArgs = (args: readonly string[]): ParsedQuery => tokenize(args.join(' '));

/**
 * `in <x>` resolved against reality.
 *
 * An EXACT root or directory name means a place; only then does an app name get a look in.
 * Prefix would not do: ~/dev really contains chrome-tab-group-cleaner, which would otherwise
 * beat Google Chrome for `in chrome`.
 */
export const resolveIn = (
  query: ParsedQuery,
  namesPlace: (word: string) => boolean,
  namesApp: (word: string) => boolean,
): ParsedQuery => {
  const word = query.inWord;
  if (word === null) return query;
  if (namesPlace(word)) return { ...query, scope: word };
  if (query.handlerWord === null && namesApp(word)) {
    return { ...query, handlerWord: word, handlerExplicit: true };
  }
  return { ...query, scope: word };
};

/** Every reading of the query, best understood first: what was typed, then the names it carries. */
export const readings = (query: ParsedQuery): ParsedQuery[] => {
  const all: ParsedQuery[] = [query];
  const spelled = pathReading(query.tokens);
  if (spelled !== null) {
    all.push({ ...query, tokens: spelled.tokens, within: [...query.within, ...spelled.within] });
  }
  for (const tokens of urlReadings(query.tokens)) all.push({ ...query, tokens });
  return all;
};
