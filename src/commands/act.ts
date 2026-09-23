import { recordVisit } from '@franzenzenhofer/intent-core/store/visits';
import { stateFile } from '@franzenzenhofer/intent-core/paths';
import { planAction, isPlan, type Action, type Plan } from '../action.js';
import { announce, EXIT, fail, type ExitCode } from '../protocol.js';
import { granted } from '../consent.js';
import { assess } from '../risk/assess.js';
import { resolveOpenBin } from '../act/open-bin.js';
import { runOpen } from '../act/run.js';
import { preview, previewJson, previewWhich, type PreviewInput } from '../preview.js';
import type { Origin } from '../risk/policy.js';
import { isIdentity } from '../identity.js';

const DB_FILE = 'db.json';
const MILLIS_PER_SECOND = 1000;

export type ActMode = 'run' | 'dry-run' | 'json' | 'which';

export interface ActInput {
  readonly action: Action;
  readonly origin: Origin;
  readonly roots: readonly string[];
  readonly score: number;
  readonly handlerFromAi: boolean;
  readonly mode: ActMode;
}

const remember = (action: Action): void => {
  try {
    recordVisit(
      { file: () => stateFile(DB_FILE), isIdentity },
      action.target.ref,
      Math.floor(Date.now() / MILLIS_PER_SECOND),
    );
  } catch {
    // A busy or read-only state directory must never stop something from opening.
  }
};

/** Everything decided, nothing done. Either the whole decision, or the code to exit with. */
const prepare = (input: ActInput): PreviewInput | { readonly code: ExitCode } => {
  const openBin = resolveOpenBin();
  if (openBin === null) return fail('no opener found', 'expected /usr/bin/open'), { code: EXIT.error };
  const planned = planAction(input.action, openBin);
  if (!isPlan(planned)) return fail(planned.error), { code: EXIT.error };
  const assessed = assess({
    target: input.action.target,
    handler: input.action.handler,
    origin: input.origin,
    roots: input.roots,
    reveal: input.action.reveal || input.action.handler.kind === 'reveal',
    handlerFromAi: input.handlerFromAi,
  });
  return { plan: planned, assessed, origin: input.origin, score: input.score };
};

/** The three modes that decide and print but never ask and never launch. */
const show = (mode: Exclude<ActMode, 'run'>, shown: PreviewInput): ExitCode => {
  if (mode === 'json') return previewJson(shown), EXIT.ok;
  if (mode === 'which') return previewWhich(shown);
  preview(shown);
  return shown.assessed.consent === 'refuse' ? EXIT.refused : EXIT.ok;
};

const launch = async (input: ActInput, planned: Plan): Promise<ExitCode> => {
  const launched = await runOpen(planned);
  if (launched.kind === 'failed') {
    fail(launched.failure.message, launched.failure.hint);
    return EXIT.launchFailed;
  }
  announce(planned.label);
  remember(input.action);
  return EXIT.ok;
};

/** Decide, show, ask, and only then act. Every exit before `launch` launched nothing. */
export const act = async (input: ActInput): Promise<ExitCode> => {
  const prepared = prepare(input);
  if ('code' in prepared) return prepared.code;
  if (input.mode !== 'run') return show(input.mode, prepared);
  if (prepared.assessed.consent === 'refuse') return preview(prepared), EXIT.refused;
  if (!granted(prepared.assessed, prepared.plan)) return EXIT.declined;
  return launch(input, prepared.plan);
};
