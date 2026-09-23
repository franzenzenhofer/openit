import { basename } from 'node:path';
import { resolveExecutable } from '@franzenzenhofer/intent-core/executable';
import { TARGET_PLACEHOLDER, validTemplate, type CommandTemplate, type Handler } from '../handler.js';
import type { HandlerRule } from '../config.js';

/**
 * A taught command handler: `openit cdai in claude`.
 *
 * Running a command is execution by definition, so every one of these is user-authored, none
 * is ever selectable by a model, and all of them inherit the terminal-class consent rules -
 * openit asks for a typed word before any of them runs, every single time.
 *
 * The discipline that makes them safe to have at all:
 *  - the command is resolved to an ABSOLUTE executable when it is taught, not when it is run
 *  - the arguments are an argv array; no string is ever handed to a shell
 *  - exactly one argument carries {target}, so a rule cannot smuggle a second operand in
 */
export const commandName = (rule: HandlerRule): string => basename(rule.command);

/** The words a taught rule answers to: what it runs, and what it was taught for. */
export const ruleNames = (rule: HandlerRule): string[] => {
  const names = [commandName(rule), rule.app].filter((name) => name !== '');
  if (rule.ext !== '' && rule.ext !== '*') names.push(rule.ext);
  if (rule.kind !== '') names.push(rule.kind);
  return names;
};

export const templateFor = (rule: HandlerRule): CommandTemplate | null => {
  if (rule.command === '') return null;
  const command = resolveExecutable(rule.command);
  if (command === null) return null;
  const args = rule.args.length === 0 ? [TARGET_PLACEHOLDER] : [...rule.args];
  const template: CommandTemplate = { label: commandName(rule), command, args };
  return validTemplate(template) ? template : null;
};

export const commandHandler = (rule: HandlerRule): Handler | null => {
  const template = templateFor(rule);
  return template === null ? null : { kind: 'command', template };
};
