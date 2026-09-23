/**
 * The only place in openit where an argv for open(1) is ever built.
 *
 * Invariants, all asserted in test/argv.test.ts:
 *  - flags first, then a literal `--`, then exactly ONE operand
 *  - a URL always goes through `-u`, so a URL that also spells a path can never be read as one
 *  - an app is named by its absolute bundle path, never by a display name anyone can claim
 *  - --args, --env, --stdin, --stdout, --stderr, --arch, -f, -h, -s, -e and -t are never
 *    emitted: each is the difference between "open this" and "run this, like so"
 */

export type OpenTarget =
  | { readonly kind: 'path'; readonly path: string }
  | { readonly kind: 'url'; readonly url: string };

export type OpenHandler =
  | { readonly kind: 'default' }
  /** Preferred: one inode, already stat'd, plist-read and quarantine-checked. */
  | { readonly kind: 'app'; readonly appPath: string }
  /** Fallback: LaunchServices resolves it at launch time, from state anything can influence. */
  | { readonly kind: 'bundleId'; readonly bundleId: string };

export interface OpenPlan {
  readonly target: OpenTarget;
  readonly handler: OpenHandler;
  /** -R. Selects in Finder instead of opening. The one flag that executes nothing. */
  readonly reveal: boolean;
  /** -g. */
  readonly background: boolean;
  /** -n. */
  readonly newInstance: boolean;
  /** -W. Never combined with background. */
  readonly wait: boolean;
}

/** Flags openit will never emit, kept as data so a test can assert the whole list at once. */
export const FORBIDDEN_FLAGS = [
  '--args', '--env', '--stdin', '--stdout', '--stderr', '--arch',
  '-f', '-h', '-s', '-e', '-t', '-i', '-o',
] as const;

const handlerArgs = (handler: OpenHandler): string[] => {
  if (handler.kind === 'app') return ['-a', handler.appPath];
  if (handler.kind === 'bundleId') return ['-b', handler.bundleId];
  return [];
};

const flags = (plan: OpenPlan): string[] => [
  ...(plan.reveal ? ['-R'] : []),
  ...(plan.newInstance ? ['-n'] : []),
  ...(plan.background ? ['-g'] : []),
  ...(plan.wait && !plan.background ? ['-W'] : []),
];

export const buildOpenArgv = (plan: OpenPlan): string[] => {
  const head = [...flags(plan), ...handlerArgs(plan.handler)];
  // -u takes the URL as its own value, so there is no operand and no `--` to separate.
  if (plan.target.kind === 'url') return [...head, '-u', plan.target.url];
  return [...head, '--', plan.target.path];
};
