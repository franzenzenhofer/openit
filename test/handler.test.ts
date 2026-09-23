import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { commandHandler, ruleNames, templateFor } from '../src/act/command.js';
import { handlerForTarget, resolveHandler } from '../src/match/handler-match.js';
import { parseHandlerArgs } from '../src/commands/handler.js';
import { planAction } from '../src/action.js';
import { tokenize } from '../src/match/tokenize.js';
import { makeFixture } from './fixtures.js';
import type { HandlerRule } from '../src/config.js';
import type { AppRef } from '../src/handler.js';
import type { Target } from '../src/target.js';

const fixture = makeFixture();

const apps: AppRef[] = [
  { name: 'Preview', path: '/System/Applications/Preview.app', bundleId: null },
  { name: 'Sublime Text', path: '/Applications/Sublime Text.app', bundleId: null },
];

const rule = (over: Partial<HandlerRule> = {}): HandlerRule =>
  ({ ext: '', kind: '', app: '', command: '', args: [], ...over });

const file = (name: string): Target =>
  ({ kind: 'file', ref: join(fixture.docs, name), name, mtime: 0, source: 'doc-index' });

describe('a taught command handler', () => {
  it('resolves the command to an absolute executable when it is taught', () => {
    const template = templateFor(rule({ ext: 'md', command: 'echo', args: ['{target}'] }));
    expect(template?.command).toBe('/bin/echo');
  });

  it('is not a handler at all when the command is not installed', () => {
    expect(templateFor(rule({ ext: 'md', command: 'definitely-not-installed' }))).toBeNull();
    expect(commandHandler(rule({ ext: 'md', command: 'definitely-not-installed' }))).toBeNull();
  });

  it('refuses a template that does not say exactly once where the target goes', () => {
    expect(templateFor(rule({ ext: 'md', command: 'echo', args: ['a', 'b'] }))).toBeNull();
    expect(templateFor(rule({ ext: 'md', command: 'echo', args: ['{target}', '{target}'] }))).toBeNull();
  });

  it('defaults to one argument, the target, when none were taught', () => {
    expect(templateFor(rule({ ext: 'md', command: 'echo' }))?.args).toEqual(['{target}']);
  });

  it('answers to what it runs, and to what it was taught for', () => {
    expect(ruleNames(rule({ ext: 'md', command: '/usr/local/bin/claude' })))
      .toEqual(['claude', 'md']);
  });

  it('becomes an argv array, never a command line', () => {
    const handler = commandHandler(rule({ ext: 'md', command: 'echo', args: ['--flag', '{target}'] }));
    const target = file('space doc with spaces.md');
    const planned = planAction({
      target, handler: handler ?? { kind: 'default' },
      newInstance: false, background: false, reveal: false, wait: false,
    }, '/usr/bin/open');
    expect(planned).toMatchObject({ command: '/bin/echo', argv: ['--flag', target.ref] });
  });
});

describe('the handler a thing gets when nobody named one', () => {
  const rules = [
    rule({ kind: 'pdf', app: 'Preview' }),
    rule({ ext: 'md', app: 'Sublime Text' }),
  ];

  it('prefers the extension rule over the kind rule', () => {
    const both = [rule({ kind: 'pdf', app: 'Sublime Text' }), rule({ ext: 'pdf', app: 'Preview' })];
    expect(handlerForTarget(file('report.pdf'), both, apps))
      .toMatchObject({ kind: 'app', app: { name: 'Preview' } });
  });

  it('applies a kind rule to a file of that kind', () => {
    expect(handlerForTarget(file('report.pdf'), rules, apps))
      .toMatchObject({ kind: 'app', app: { name: 'Preview' } });
  });

  it('leaves a file no rule mentions to the system default', () => {
    expect(handlerForTarget(file('photo.jpg'), rules, apps)).toBeNull();
  });

  it('never applies a file rule to a folder or a link', () => {
    const dir: Target = { kind: 'dir', ref: fixture.root, name: 'dev', mtime: 0, source: 'dir-index' };
    expect(handlerForTarget(dir, [rule({ ext: '*', app: 'Preview' })], apps)).toBeNull();
  });

  it('is not a rule when the app it names is no longer installed', () => {
    expect(handlerForTarget(file('report.pdf'), [rule({ kind: 'pdf', app: 'Gone' })], apps)).toBeNull();
  });
});

describe('naming a handler in the query', () => {
  const ask = (words: string, rules: HandlerRule[] = []) =>
    resolveHandler({ query: tokenize(words), apps, rules });

  it('finds a taught rule by the name of what it runs', () => {
    const taught = [rule({ ext: 'md', command: 'echo', args: ['{target}'] })];
    expect(ask('the cdai readme in echo', taught)).toMatchObject({ kind: 'handler' });
  });

  it('opens with the named app', () => {
    expect(ask('report with preview')).toMatchObject({ handler: { app: { name: 'Preview' } } });
  });

  it('refuses rather than guessing when the named app is unknown', () => {
    const outcome = ask('report with photoshop');
    expect(outcome.kind).toBe('unknown');
  });

  it('falls back to the system default when nobody named anything', () => {
    expect(ask('report')).toEqual({ kind: 'handler', handler: { kind: 'default' } });
  });

  it('reveals instead of opening when the words asked to', () => {
    expect(ask('show report in finder')).toEqual({ kind: 'handler', handler: { kind: 'reveal' } });
  });
});

describe('teaching one', () => {
  it('reads both spellings of what a rule is for', () => {
    expect(parseHandlerArgs(['--ext', '.MD', '--app', 'Sublime Text']))
      .toMatchObject({ ext: 'md', app: 'Sublime Text' });
    expect(parseHandlerArgs(['--kind', 'PDF', '--app', 'Preview'])).toMatchObject({ kind: 'pdf' });
  });

  it('splits --args on commas, into an argv array', () => {
    expect(parseHandlerArgs(['--command', '/usr/bin/env', '--args', 'code,{target}']).args)
      .toEqual(['code', '{target}']);
  });

  it('says which option went wrong', () => {
    expect(parseHandlerArgs(['--ext']).error).toBe('--ext needs a value');
    expect(parseHandlerArgs(['--nonsense', 'x']).error).toBe('unknown option --nonsense');
  });
});
