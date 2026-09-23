import { matchName } from '@franzenzenhofer/intent-core/match/score';
import { HANDLER_THRESHOLD, LIMIT, MATCH } from './constants.js';
import { extensionOf } from '../risk/classify.js';
import { commandHandler, ruleNames } from '../act/command.js';
import { matchesKind, type FileKind } from './kinds.js';
import type { ParsedQuery } from './tokenize.js';
import type { AppRef, Handler } from '../handler.js';
import type { HandlerRule } from '../config.js';
import type { Target } from '../target.js';

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

const appNamed = (name: string, apps: readonly AppRef[]): AppRef | undefined =>
  apps.find((app) => app.name.toLowerCase() === name.toLowerCase());

const handlerOf = (rule: HandlerRule, apps: readonly AppRef[]): Handler | null => {
  if (rule.command !== '') return commandHandler(rule);
  const app = appNamed(rule.app, apps);
  return app === undefined ? null : { kind: 'app', app };
};

/**
 * A taught rule, matched by its own names: what it runs, what app it names, and the extension
 * or kind it was taught for. `openit cdai in claude` finds it by the first of those.
 */
const scoreRules = (word: string, rules: readonly HandlerRule[], apps: readonly AppRef[]): HandlerChoice[] =>
  rules
    .flatMap((rule): HandlerChoice[] => {
      const handler = handlerOf(rule, apps);
      if (handler === null) return [];
      const score = Math.max(...ruleNames(rule).map((name) => matchName(word, name, MATCH)));
      return score > 0 ? [{ handler, score }] : [];
    })
    .sort((a, b) => b.score - a.score);

const appliesTo = (rule: HandlerRule, target: Target): boolean => {
  if (target.kind !== 'file') return false;
  if (rule.ext === '*') return true;
  if (rule.ext !== '') return extensionOf(target.ref) === rule.ext;
  return matchesKind(target.ref, rule.kind as FileKind);
};

/**
 * The handler a taught rule gives this one thing when nobody named one. An extension is more
 * specific than a kind, and a kind is more specific than "everything", so they are tried in
 * that order - and a rule whose app or command is no longer installed is simply not a rule.
 */
export const handlerForTarget = (
  target: Target,
  rules: readonly HandlerRule[],
  apps: readonly AppRef[],
): Handler | null => {
  const matching = rules.filter((rule) => appliesTo(rule, target));
  const byExtension = matching.find((rule) => rule.ext !== '' && rule.ext !== '*');
  const byKind = matching.find((rule) => rule.kind !== '');
  const catchAll = matching.find((rule) => rule.ext === '*');
  for (const rule of [byExtension, byKind, catchAll]) {
    if (rule === undefined) continue;
    const handler = handlerOf(rule, apps);
    if (handler !== null) return handler;
  }
  return null;
};

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
  const scored = [...scoreRules(word, input.rules, input.apps), ...scoreApps(word, input.apps)]
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
