import {
  BACKGROUND_WORDS, HERE_WORD, IN_OPERATOR, LATEST_WORDS, NEW_WORDS, OLDEST_WORDS,
  REVEAL_WORDS, SHOW_WORDS, WITH_OPERATOR,
} from './constants.js';
import { kindOfWord, targetKindWord, type FileKind } from './kinds.js';
import type { TargetKind } from '../target.js';

export type Order = 'latest' | 'oldest' | 'none';

export interface Flags {
  readonly reveal: boolean;
  readonly newInstance: boolean;
  readonly background: boolean;
}

export interface Scan<T> {
  readonly rest: string[];
  readonly taken: T;
}

/**
 * `with <app>` is unambiguous and always names a handler. `in <x>` is not, so it is only
 * captured here; whether it means a place or an app is decided later, against the real roots
 * and the real app index.
 */
export interface Operands {
  readonly withWord: string | null;
  readonly inWord: string | null;
  /**
   * `in finder` and `in the background` name no place and no app. They are read here rather
   * than by the flag scan because `in` would otherwise swallow the word that carries the
   * meaning, and the query would go looking for a folder called "finder".
   */
  readonly reveal: boolean;
  readonly background: boolean;
}

export const takeOperands = (words: readonly string[]): Scan<Operands> => {
  const rest: string[] = [];
  let withWord: string | null = null;
  let inWord: string | null = null;
  let reveal = false;
  let background = false;
  for (let i = 0; i < words.length; i += 1) {
    const word = words[i];
    if (word === undefined) continue;
    // "in the background" is the same phrase as "in background" with a stopword in it.
    const next = words[i + 1] === 'the' ? words[i + 2] : words[i + 1];
    const skip = words[i + 1] === 'the' ? 2 : 1;
    const operand = word === WITH_OPERATOR || word === IN_OPERATOR;
    if (operand && next !== undefined && REVEAL_WORDS.has(next)) {
      reveal = true;
      i += skip;
      continue;
    }
    if (operand && next !== undefined && BACKGROUND_WORDS.has(next)) {
      background = true;
      i += skip;
      continue;
    }
    if (word === WITH_OPERATOR && next !== undefined && withWord === null) {
      withWord = next;
      i += 1;
      continue;
    }
    if (word === IN_OPERATOR && next !== undefined && inWord === null) {
      inWord = next;
      i += 1;
      continue;
    }
    rest.push(word);
  }
  return { rest, taken: { withWord, inWord, reveal, background } };
};

/** Scanned before stopword removal, because "show" and "in" would otherwise vanish first. */
export const takeFlags = (words: readonly string[]): Scan<Flags> => {
  const rest: string[] = [];
  let reveal = false;
  let newInstance = false;
  let background = false;
  for (const word of words) {
    if (SHOW_WORDS.has(word)) continue;
    if (REVEAL_WORDS.has(word)) {
      reveal = true;
      continue;
    }
    if (NEW_WORDS.has(word)) {
      newInstance = true;
      continue;
    }
    if (BACKGROUND_WORDS.has(word)) {
      background = true;
      continue;
    }
    rest.push(word);
  }
  return { rest, taken: { reveal, newInstance, background } };
};

export const takeOrder = (words: readonly string[]): Scan<Order> => {
  const rest: string[] = [];
  let order: Order = 'none';
  for (const word of words) {
    if (LATEST_WORDS.has(word) && order === 'none') {
      order = 'latest';
      continue;
    }
    if (OLDEST_WORDS.has(word) && order === 'none') {
      order = 'oldest';
      continue;
    }
    rest.push(word);
  }
  return { rest, taken: order };
};

export interface Kinds {
  readonly kinds: FileKind[];
  readonly targetKinds: TargetKind[];
}

/**
 * Kind words become filters AND stay tokens. That is what lets `openit pages` open Pages.app
 * while `openit the cdai readme` still filters to markdown.
 */
export const takeKinds = (words: readonly string[]): Kinds => {
  const kinds: FileKind[] = [];
  const targetKinds: TargetKind[] = [];
  for (const word of words) {
    const kind = kindOfWord(word);
    if (kind !== undefined && !kinds.includes(kind)) kinds.push(kind);
    const targetKind = targetKindWord(word);
    if (targetKind !== undefined && !targetKinds.includes(targetKind)) targetKinds.push(targetKind);
  }
  return { kinds, targetKinds };
};

export const isHere = (word: string | null): boolean => word === HERE_WORD;
