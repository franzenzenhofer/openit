import { basename } from 'node:path';

export interface AppRef {
  /** "Sublime Text" - what the user types and what the picker shows. */
  readonly name: string;
  /** "/Applications/Sublime Text.app" - one inode, verifiable before the decision. */
  readonly path: string;
  /** Stable identity across moves and renames. Resolved lazily, never used to launch. */
  readonly bundleId: string | null;
}

/**
 * A taught way to open something that is not an app: `openit cdai in claude`. Execution by
 * definition, so these are user-authored only and a model can never select one.
 */
export interface CommandTemplate {
  readonly label: string;
  /** Absolute path to the executable, resolved when the handler was taught. */
  readonly command: string;
  /** Exactly one entry contains the {target} placeholder. */
  readonly args: readonly string[];
}

export const TARGET_PLACEHOLDER = '{target}';

export type Handler =
  | { readonly kind: 'default' }
  | { readonly kind: 'app'; readonly app: AppRef }
  | { readonly kind: 'reveal' }
  | { readonly kind: 'command'; readonly template: CommandTemplate };

export const appName = (path: string): string => basename(path).replace(/\.app$/iu, '');

export const handlerLabel = (handler: Handler): string => {
  if (handler.kind === 'app') return handler.app.name;
  if (handler.kind === 'command') return handler.template.label;
  if (handler.kind === 'reveal') return 'Finder';
  return '';
};

/** A template is only usable when it says exactly once where the target goes. */
export const validTemplate = (template: CommandTemplate): boolean =>
  template.command.startsWith('/')
  && template.args.filter((arg) => arg.includes(TARGET_PLACEHOLDER)).length === 1;
