import { resolveExecutable } from '@franzenzenhofer/intent-core/executable';
import { loadConfig, saveConfig, type HandlerRule } from '../config.js';
import { loadAppIndex } from '../store/apps.js';
import { kindOfWord } from '../match/kinds.js';
import { TARGET_PLACEHOLDER } from '../handler.js';
import { templateFor } from '../act/command.js';
import { sanitizeLabel } from '../ai/sanitize.js';
import { EXIT, fail, note, type ExitCode } from '../protocol.js';

const USAGE = [
  'usage:',
  '  openit handler set --kind pdf --app Preview',
  '  openit handler set --ext md --command /usr/bin/env --args "code,{target}"',
  '  openit handler list',
  '  openit handler forget --kind pdf | --ext md',
].join('\n');

const MAX_SHOWN = 80;

interface Options {
  readonly ext: string;
  readonly kind: string;
  readonly app: string;
  readonly command: string;
  readonly args: readonly string[];
  readonly error: string | null;
}

const EMPTY: Options = { ext: '', kind: '', app: '', command: '', args: [], error: null };

export const parseHandlerArgs = (args: readonly string[]): Options => {
  let options = EMPTY;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    const next = args[i + 1];
    if (arg === undefined) continue;
    if (next === undefined) return { ...options, error: `${arg} needs a value` };
    if (arg === '--ext') options = { ...options, ext: next.replace(/^\./u, '').toLowerCase() };
    else if (arg === '--kind') options = { ...options, kind: next.toLowerCase() };
    else if (arg === '--app') options = { ...options, app: next };
    else if (arg === '--command') options = { ...options, command: next };
    else if (arg === '--args') options = { ...options, args: next.split(',').map((one) => one.trim()) };
    else return { ...options, error: `unknown option ${arg}` };
    i += 1;
  }
  return options;
};

const describe = (rule: HandlerRule): string => {
  const what = rule.ext === '' ? `kind ${rule.kind}` : `.${rule.ext}`;
  const who = rule.command === '' ? rule.app : `${rule.command} ${rule.args.join(' ')}`;
  return `  ${what.padEnd(16)} ${sanitizeLabel(who, MAX_SHOWN)}`;
};

const sameTarget = (a: HandlerRule, b: HandlerRule): boolean =>
  a.ext === b.ext && a.kind === b.kind;

/** A rule that names neither a real kind nor an openable handler is not a rule worth keeping. */
const rejection = (options: Options): string | null => {
  if (options.ext === '' && options.kind === '') return 'say which files: --ext <ext> or --kind <kind>';
  if (options.ext !== '' && options.kind !== '') return 'one of --ext or --kind, not both';
  if (options.kind !== '' && kindOfWord(options.kind) === undefined) return `no such kind: ${options.kind}`;
  if (options.app === '' && options.command === '') return 'say what opens them: --app <name> or --command <path>';
  if (options.app !== '' && options.command !== '') return 'one of --app or --command, not both';
  return null;
};

const missingApp = (name: string): boolean =>
  !loadAppIndex().apps.some((app) => app.name.toLowerCase() === name.toLowerCase());

/**
 * A command handler is execution, so it is checked the moment it is taught rather than the
 * moment it runs: the executable must resolve to an absolute path that exists now, and exactly
 * one argument must say where the target goes.
 */
const commandRejection = (rule: HandlerRule): string | null => {
  if (resolveExecutable(rule.command) === null) return `no such executable: ${rule.command}`;
  return templateFor(rule) === null
    ? `--args must contain ${TARGET_PLACEHOLDER} exactly once`
    : null;
};

const set = (args: readonly string[]): ExitCode => {
  const options = parseHandlerArgs(args);
  if (options.error !== null) return fail(options.error, USAGE), EXIT.error;
  const rejected = rejection(options);
  if (rejected !== null) return fail(rejected, USAGE), EXIT.error;
  const rule: HandlerRule = {
    ext: options.ext, kind: options.kind, app: options.app,
    command: options.command, args: options.args,
  };
  if (rule.command === '' && missingApp(rule.app)) {
    return fail(`no application named "${sanitizeLabel(rule.app, 40)}" is installed`,
      'openit doctor lists what openit can see'), EXIT.error;
  }
  if (rule.command !== '') {
    const bad = commandRejection(rule);
    if (bad !== null) return fail(bad, USAGE), EXIT.error;
  }
  const config = loadConfig();
  saveConfig({ ...config, handlers: [...config.handlers.filter((one) => !sameTarget(one, rule)), rule] });
  note(`openit: ${describe(rule).trim()}`);
  return EXIT.ok;
};

const list = (): ExitCode => {
  const { handlers } = loadConfig();
  if (handlers.length === 0) {
    note('openit: no handlers taught; everything opens the way a double click would');
    note(`        ${USAGE.split('\n')[1] ?? ''}`);
    return EXIT.ok;
  }
  for (const rule of handlers) note(describe(rule));
  return EXIT.ok;
};

const forget = (args: readonly string[]): ExitCode => {
  const options = parseHandlerArgs(args);
  if (options.error !== null) return fail(options.error, USAGE), EXIT.error;
  if (options.ext === '' && options.kind === '') return fail('say which rule: --ext or --kind', USAGE), EXIT.error;
  const config = loadConfig();
  const kept = config.handlers.filter(
    (rule) => !sameTarget(rule, { ...rule, ext: options.ext, kind: options.kind }),
  );
  if (kept.length === config.handlers.length) return fail('no such handler', 'openit handler list'), EXIT.error;
  saveConfig({ ...config, handlers: kept });
  note('openit: forgotten');
  return EXIT.ok;
};

export const runHandler = (args: readonly string[]): ExitCode => {
  const command = args[0];
  if (command === undefined || command === 'list') return list();
  if (command === 'set') return set(args.slice(1));
  if (command === 'forget') return forget(args.slice(1));
  return fail(`unknown handler command "${sanitizeLabel(command, 40)}"`, USAGE), EXIT.error;
};
