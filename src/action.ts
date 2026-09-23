import { contractTilde } from '@franzenzenhofer/intent-core/paths';
import { buildOpenArgv, type OpenHandler, type OpenPlan } from './act/argv.js';
import { TARGET_PLACEHOLDER, handlerLabel, validTemplate, type Handler } from './handler.js';
import { quoteArgv } from './quote.js';
import type { Target } from './target.js';

export interface Action {
  readonly target: Target;
  readonly handler: Handler;
  readonly newInstance: boolean;
  readonly background: boolean;
  readonly reveal: boolean;
  readonly wait: boolean;
}

/** A fully decided action plus the exact argv it becomes. The whole testable surface. */
export interface Plan {
  readonly action: Action;
  readonly command: string;
  readonly argv: readonly string[];
  /** "~/dev/cdai/README.md with Sublime Text" */
  readonly label: string;
  /** The command line a person could paste, already quoted. */
  readonly printed: string;
}

export type Planned = Plan | { readonly error: string };

export const isPlan = (planned: Planned): planned is Plan => !('error' in planned);

export const displayRef = (target: Target): string =>
  target.kind === 'url' ? target.ref : contractTilde(target.ref);

const labelOf = (action: Action): string => {
  const what = displayRef(action.target);
  if (action.reveal || action.handler.kind === 'reveal') return `${what} revealed in Finder`;
  const who = handlerLabel(action.handler);
  // Silence about the handler means "whatever a double-click would do", which is the truth.
  return who === '' ? what : `${what} with ${who}`;
};

const openHandler = (handler: Handler): OpenHandler => {
  if (handler.kind !== 'app') return { kind: 'default' };
  if (handler.app.path !== '') return { kind: 'app', appPath: handler.app.path };
  return handler.app.bundleId === null
    ? { kind: 'default' }
    : { kind: 'bundleId', bundleId: handler.app.bundleId };
};

const openPlan = (action: Action): OpenPlan => ({
  target: action.target.kind === 'url'
    ? { kind: 'url', url: action.target.ref }
    : { kind: 'path', path: action.target.ref },
  handler: openHandler(action.handler),
  reveal: action.reveal || action.handler.kind === 'reveal',
  background: action.background,
  newInstance: action.newInstance,
  wait: action.wait,
});

const plannedCommand = (action: Action, command: string, argv: readonly string[]): Plan => ({
  action,
  command,
  argv,
  label: labelOf(action),
  printed: quoteArgv(command, argv),
});

/** Pure: an Action in, the exact process invocation out. Nothing here touches the disk. */
export const planAction = (action: Action, openBin: string): Planned => {
  if (action.handler.kind === 'command') {
    const { template } = action.handler;
    if (!validTemplate(template)) {
      return { error: `handler "${template.label}" does not say where the target goes` };
    }
    if (action.target.kind === 'url' && !template.command.includes('open')) {
      return { error: `handler "${template.label}" takes a file, not a link` };
    }
    const argv = template.args.map((arg) => arg.replaceAll(TARGET_PLACEHOLDER, action.target.ref));
    return plannedCommand(action, template.command, argv);
  }
  return plannedCommand(action, openBin, buildOpenArgv(openPlan(action)));
};
