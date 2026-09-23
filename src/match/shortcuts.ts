import { existsSync } from 'node:fs';
import { appName, type Handler } from '../handler.js';
import { literalTarget } from './literal.js';
import { loadTaught } from '../store/links.js';
import { normalizeIntent, recall } from '../store/memory.js';
import type { ParsedQuery } from './tokenize.js';
import type { Target } from '../target.js';
import type { Origin } from '../risk/policy.js';

export interface Shortcut {
  readonly target: Target;
  readonly origin: Origin;
  /** A remembered answer carries the app it was opened with, unless the user named one now. */
  readonly handler: Handler | null;
}

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

/** The answers that are not searches at all: spelled out, taught by name, or remembered. */
export const withoutSearching = (
  args: readonly string[],
  query: ParsedQuery,
): Shortcut | null => {
  const literal = literalTarget(args);
  if (literal !== null) return { target: literal, origin: 'literal', handler: null };
  const taught = taughtTarget(query);
  if (taught !== null) return { target: taught, origin: 'alias', handler: null };
  return rememberedAction(args, query.handlerWord !== null);
};
