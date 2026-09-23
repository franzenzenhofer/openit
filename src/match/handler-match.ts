import { matchName } from '@franzenzenhofer/intent-core/match/score';
import { resolveExecutable } from '@franzenzenhofer/intent-core/executable';
import { HANDLER_THRESHOLD, MATCH } from './constants.js';
import { LIMIT } from './constants.js';
import type { ParsedQuery } from './tokenize.js';
import type { AppRef, Handler } from '../handler.js';
import type { HandlerRule } from '../config.js';

export interface HandlerChoice {
  readonly handler: Handler;
  readonly score: number;
}

export type HandlerOutcome =
  | { readonly kind: 'handler'; readonly handler: Handler }
  | { readonly kind: 'unknown'; readonly word: string; readonly closest: readonly string[] };

const scoreApps = (word: string, apps: readonly AppRef[]): HandlerChoice[] =>
  apps
    .map((app) => ({ handler: { kind: 'app', app } as Handler, score: matchName(word, app.name, MATCH) }))
    .filter((choice) => choice.score > 0)
    .sort((a, b) => b.score - a.score);

const templateFor = (rule: HandlerRule): Handler | null => {
  const command = resolveExecutable(rule.command);
  if (command === null) return null;
  return {
    kind: 'command',
    template: { label: rule.ext === '*' ? rule.command : `${rule.command} (${rule.ext})`, command, args: rule.args },
  };
};

/**
 * A taught command handler, matched by its own name. These are user-authored only and a model
 * can never reach them - running a command is execution, not opening.
 */
const scoreCommands = (word: string, rules: readonly HandlerRule[]): HandlerChoice[] =>
  rules
    .filter((rule) => rule.command !== '')
    .flatMap((rule) => {
      const handler = templateFor(rule);
      if (handler === null) return [];
      const score = matchName(word, rule.ext === '*' ? rule.command : rule.ext, MATCH);
      return score > 0 ? [{ handler, score }] : [];
    })
    .sort((a, b) => b.score - a.score);

export const handlerLabelOf = (choice: HandlerChoice): string =>
  choice.handler.kind === 'app' ? choice.handler.app.name
    : choice.handler.kind === 'command' ? choice.handler.template.label : 'Finder';

export interface HandlerInput {
  readonly query: ParsedQuery;
  readonly apps: readonly AppRef[];
  readonly rules: readonly HandlerRule[];
}

/**
 * The one rule that matters most in openit:
 *
 *  - implicit handler, low confidence -> the LaunchServices default, silently. That is exactly
 *    what a double-click does, so it is never worse than the status quo.
 *  - explicit handler, low confidence -> refuse and name the closest apps. Someone who typed
 *    `with sublime` and got Preview was handed a wrong answer, not a graceful one.
 */
export const resolveHandler = (input: HandlerInput): HandlerOutcome => {
  const { query } = input;
  if (query.reveal) return { kind: 'handler', handler: { kind: 'reveal' } };
  const word = query.handlerWord;
  if (word === null) return { kind: 'handler', handler: { kind: 'default' } };
  const scored = [...scoreCommands(word, input.rules), ...scoreApps(word, input.apps)]
    .sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (best !== undefined && best.score >= HANDLER_THRESHOLD.hit) {
    return { kind: 'handler', handler: best.handler };
  }
  if (!query.handlerExplicit) return { kind: 'handler', handler: { kind: 'default' } };
  return {
    kind: 'unknown',
    word,
    closest: scored.slice(0, LIMIT.suggestions).map(handlerLabelOf),
  };
};
