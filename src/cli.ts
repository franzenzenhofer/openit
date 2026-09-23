import { setProduct } from '@franzenzenhofer/intent-core/product';
import { secureExistingState } from '@franzenzenhofer/intent-core/paths';
import packageJson from '../package.json' with { type: 'json' };
import { EXIT, fail, note, type ExitCode } from './protocol.js';
import { parseArgs } from './commands/options.js';
import { runQuery } from './commands/query.js';
import type { ActMode } from './commands/act.js';
import { runSetup } from './commands/setup.js';
import { runDoctor } from './commands/doctor.js';
import { runIndex } from './commands/index-cmd.js';
import { runLink } from './commands/link.js';
import { runAlias } from './commands/alias.js';
import { runHandler } from './commands/handler.js';

setProduct({ name: 'openit', envPrefix: 'OPENIT' });

const VERSION = `openit ${packageJson.version}`;

const USAGE = `openit - say what to open, it works out what and with what, then opens it

openit <words>                open the thing you mean
openit --with <app> <words>   name the handler yourself
openit --reveal <words>       show it in Finder, launch nothing
openit --new|--background|--wait
openit --dry-run <words>      print the plan, spawn nothing
openit plan -- <words>        one JSON object on stdout
openit which -- <words>       the resolved path or URL on stdout
openit setup [--yes] [--root <path>] [--depth <n>] [--ai|--no-ai]
openit index [--refresh]      show or rebuild what openit knows
openit link add <name> <url>  teach a name for a page
openit link list | forget <name>
openit alias list | add <thing> -- <words> | forget -- <words>
openit handler set --kind pdf --app Preview
openit handler list | forget --kind pdf
openit doctor                 show what openit sees on this machine
openit --version

Exit codes: 0 opened, 1 error, 3 declined, 4 no match, 5 refused, 6 open failed.
stdout carries the plan and nothing else; every human-readable byte goes to stderr.`;

const queryArgs = (args: readonly string[]): string[] => {
  const rest = args.slice(1);
  return rest[0] === '--' ? rest.slice(1) : rest;
};

const run = async (args: readonly string[], mode: ActMode): Promise<ExitCode> => {
  const parsed = parseArgs(args);
  if (parsed.error !== null) return fail(parsed.error, USAGE.split('\n')[2] ?? ''), EXIT.error;
  return runQuery(parsed.words, { ...parsed.options, mode: mode === 'run' ? parsed.options.mode : mode });
};

const dispatch = async (args: readonly string[]): Promise<ExitCode> => {
  const command = args[0];
  if (command === undefined || command === '--help' || command === '-h') {
    note(USAGE);
    return command === undefined ? EXIT.error : EXIT.ok;
  }
  if (command === '--version' || command === '-v') {
    note(VERSION);
    return EXIT.ok;
  }
  if (command === 'setup') return runSetup(args.slice(1));
  if (command === 'doctor') return runDoctor();
  if (command === 'index') return runIndex(args.slice(1));
  if (command === 'link') return runLink(args.slice(1));
  if (command === 'alias') return runAlias(args.slice(1));
  if (command === 'handler') return runHandler(args.slice(1));
  if (command === 'plan') return run(queryArgs(args), 'json');
  if (command === 'which') return run(queryArgs(args), 'which');
  return run(args, 'run');
};

export const main = async (argv: readonly string[]): Promise<ExitCode> => {
  try {
    secureExistingState();
    return await dispatch(argv);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
    return EXIT.error;
  }
};

process.exitCode = await main(process.argv.slice(2));
