import { runContained } from '@franzenzenhofer/intent-core/ai/spawn';
import { product } from '@franzenzenhofer/intent-core/product';
import type { Plan } from '../action.js';
import { translateOpenError, timeoutFailure, type TranslatedFailure } from './errors.js';

const TIMEOUT_MS = 10_000;
const MAX_OUTPUT_BYTES = 64 * 1024;
const MAX_STDERR_BYTES = 4096;

/**
 * open(1) normally returns in under 50ms, but `-W` blocks by design and a LaunchServices
 * database that is rebuilding can stall a plain open for many seconds. A launcher that can hang
 * forever is a launcher nobody trusts.
 */
export const openTimeoutMs = (plan: Plan): number =>
  plan.action.wait ? Number.POSITIVE_INFINITY : TIMEOUT_MS;

/**
 * The child gets this process's environment minus every one of openit's own variables, so a
 * test seam or a debug switch can never leak into a launched application.
 */
export const childEnv = (env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv => {
  const prefix = `${product().envPrefix}_`;
  const clean: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(env)) {
    if (!key.startsWith(prefix)) clean[key] = value;
  }
  return clean;
};

export type Launched =
  | { readonly kind: 'ok' }
  | { readonly kind: 'failed'; readonly failure: TranslatedFailure };

/**
 * A direct execve of the opener with an argv array. No string is ever concatenated into a
 * command line, no glob is expanded, and $IFS is never consulted.
 */
export const runOpen = async (plan: Plan): Promise<Launched> => {
  const timeout = openTimeoutMs(plan);
  try {
    const result = await runContained(plan.command, plan.argv, {
      timeoutMs: Number.isFinite(timeout) ? timeout : 0x7fffffff,
      maxOutputBytes: MAX_OUTPUT_BYTES,
      maxStderrBytes: MAX_STDERR_BYTES,
      label: 'open',
      captureStdout: false,
      env: childEnv(),
    });
    if (result.status === 0) return { kind: 'ok' };
    return { kind: 'failed', failure: translateOpenError(result.stderr, openPlanOf(plan)) };
  } catch {
    return { kind: 'failed', failure: timeoutFailure(openPlanOf(plan)) };
  }
};

/** Only the two fields the error wording needs; the full plan never leaves this module. */
const openPlanOf = (plan: Plan) => ({
  target: plan.action.target.kind === 'url'
    ? ({ kind: 'url', url: plan.action.target.ref } as const)
    : ({ kind: 'path', path: plan.action.target.ref } as const),
  handler: { kind: 'default' } as const,
  reveal: false,
  background: false,
  newInstance: false,
  wait: false,
});
