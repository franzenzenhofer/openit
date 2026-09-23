import { note } from '@franzenzenhofer/intent-core/protocol';

export { emit, note, fail } from '@franzenzenhofer/intent-core/protocol';

/**
 * cdai's exit code is a request - "please cd here". openit's is a receipt: 0 means code is
 * already running. So every non-zero code below also carries the guarantee that nothing was
 * launched, and that guarantee is what the test suite asserts hardest.
 *
 * 2 is deliberately unused: many shells read it as misuse of a builtin, and open(1) itself only
 * ever returns 0 or 1, so leaving it empty removes an ambiguity.
 */
export const EXIT = {
  /** It was opened, or --dry-run printed the plan it would have run. */
  ok: 0,
  /** openit's own fault: bad usage, unreadable config, corrupt state. */
  error: 1,
  /**
   * A target was found, a question was asked, and the answer was no - including the answer
   * "there is nobody to ask". Consent fails closed in every direction.
   */
  declined: 3,
  /** The words named nothing openable. There was nothing to launch. */
  noMatch: 4,
  /**
   * A target was found and policy forbade opening it. No question was asked, because at this
   * level there is no answer that would have helped.
   */
  refused: 5,
  /**
   * openit decided, consent was given, and open(1) itself failed: the file vanished, no app
   * claims the bundle id, no handler for the scheme, or it hung and was killed. open(1) reports
   * every one of those as exit 1 with prose on stderr, so this is where that prose becomes a
   * distinguishable outcome again.
   */
  launchFailed: 6,
} as const;

export type ExitCode = (typeof EXIT)[keyof typeof EXIT];

/** What happened, in one line, on stderr. Silence about the handler means "as you'd double-click". */
export const announce = (label: string): void => {
  note(`→ ${label}`);
};
