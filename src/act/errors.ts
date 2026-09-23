import { flattenText } from '@franzenzenhofer/intent-core/ai/text';
import type { OpenPlan } from './argv.js';

const MAX_DETAIL = 120;

export type LaunchFailure =
  | 'missing-target'
  | 'unknown-bundle-id'
  | 'unknown-app'
  | 'no-scheme-handler'
  | 'timeout'
  | 'unknown';

export interface TranslatedFailure {
  readonly failure: LaunchFailure;
  readonly message: string;
  readonly hint: string;
}

/**
 * open(1) exits 1 for every failure; the reason lives only in its stderr prose, and that prose
 * is OS-version dependent. Matching is deliberately loose - a substring of a stable fragment -
 * and test/open-contract.test.ts pins each fragment against the real /usr/bin/open, so an OS
 * upgrade that rewords them fails the build instead of quietly degrading every error to
 * "something went wrong".
 */
export const OPEN_FRAGMENTS: ReadonlyArray<readonly [string, LaunchFailure]> = [
  ['does not exist', 'missing-target'],
  ['LSCopyApplicationURLsForBundleIdentifier', 'unknown-bundle-id'],
  ['Unable to find application named', 'unknown-app'],
  ['No application knows how to open', 'no-scheme-handler'],
];

const classify = (stderr: string): LaunchFailure => {
  const found = OPEN_FRAGMENTS.find(([fragment]) => stderr.includes(fragment));
  return found?.[1] ?? 'unknown';
};

const scheme = (plan: OpenPlan): string => {
  if (plan.target.kind !== 'url') return '';
  const colon = plan.target.url.indexOf(':');
  return colon === -1 ? plan.target.url : plan.target.url.slice(0, colon);
};

const wording = (failure: LaunchFailure, plan: OpenPlan): readonly [string, string] => {
  if (failure === 'missing-target') {
    return ['it disappeared between the match and the launch', 'openit index --refresh'];
  }
  if (failure === 'unknown-bundle-id') {
    return ['no installed app claims that bundle id', 'name the app instead: openit --with <app> <words>'];
  }
  if (failure === 'unknown-app') {
    // Unreachable: openit only ever names an app by absolute path. Say so rather than guess.
    return ['open was given an app name, which is a bug in openit', 'please report this'];
  }
  if (failure === 'no-scheme-handler') {
    return [`nothing on this Mac handles ${scheme(plan)}:`, 'openit --with <app> <words>'];
  }
  if (failure === 'timeout') {
    return ['open did not come back and was stopped', 'try again, or check LaunchServices'];
  }
  return ['open refused the launch', 'openit doctor'];
};

export const translateOpenError = (stderr: string, plan: OpenPlan): TranslatedFailure => {
  const failure = classify(stderr);
  const [message, hint] = wording(failure, plan);
  const detail = flattenText(stderr, MAX_DETAIL);
  return { failure, message: detail === '' ? message : `${message}: ${detail}`, hint };
};

export const timeoutFailure = (plan: OpenPlan): TranslatedFailure => {
  const [message, hint] = wording('timeout', plan);
  return { failure: 'timeout', message, hint };
};
