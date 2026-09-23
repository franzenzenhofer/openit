import { handlerKind, type HandlerKind } from './bundle.js';
import { classifyPath, type TargetFacts } from './classify.js';
import { locatorUrl } from './locator.js';
import { consentRank, requiredConsent, type Assessment, type Consent, type Origin, type Subject } from './policy.js';
import { readQuarantine, type Quarantine } from './quarantine.js';
import { parseUrl, type ParsedUrl } from './scheme.js';
import { APP_DIRS } from '../store/apps.js';
import type { Handler } from '../handler.js';
import type { Target } from '../target.js';

export interface AssessInput {
  readonly target: Target;
  readonly handler: Handler;
  readonly origin: Origin;
  readonly roots: readonly string[];
  readonly reveal: boolean;
  /** The handler came out of the model rather than out of the user's words. */
  readonly handlerFromAi: boolean;
}

export interface Assessed {
  readonly consent: Consent;
  readonly assessment: Assessment;
  readonly facts: TargetFacts | null;
  readonly quarantine: Quarantine | null;
  readonly url: ParsedUrl | null;
  /** Where a locator points, once it has been followed. */
  readonly redirect: ParsedUrl | null;
}

const kindOf = (handler: Handler): HandlerKind => {
  if (handler.kind === 'command') return 'terminal';
  if (handler.kind !== 'app') return 'default';
  return handlerKind(handler.app.path, handler.app.bundleId);
};

/** An application openit found where macOS keeps applications, rather than one lying about. */
const isCurated = (facts: TargetFacts): boolean =>
  facts.klass === 'application'
  && APP_DIRS().some((dir) => facts.realPath.startsWith(`${dir}/`));

const urlSubject = (url: ParsedUrl): Subject =>
  ({ kind: 'url', scheme: url.klass, hasUserInfo: url.hasUserInfo });

const forUrl = (input: AssessInput, url: ParsedUrl): Assessed => {
  const assessment: Assessment = {
    subject: urlSubject(url),
    origin: input.origin,
    quarantined: false,
    escapesRoots: false,
    external: false,
    handler: kindOf(input.handler),
    handlerFromAi: input.handlerFromAi,
    curated: false,
    reveal: false,
  };
  return {
    consent: requiredConsent(assessment), assessment, facts: null, quarantine: null,
    url, redirect: null,
  };
};

const higher = (a: Consent, b: Consent): Consent => (consentRank(a) >= consentRank(b) ? a : b);

const RUNS_CODE: ReadonlySet<string> = new Set([
  'application', 'installer', 'bundle', 'executable', 'script',
]);

/**
 * When a quarantine attribute is a reason to stop.
 *
 * For anything that can execute, its mere presence is: that is the bit Gatekeeper itself acts
 * on, and an executable that arrived from anywhere is the case this whole layer exists for.
 * For a document, only the download bit counts - a file a sandboxed app wrote carries the
 * attribute too, and asking about those would train the person to say yes without reading.
 */
const isRisky = (quarantine: Quarantine | null, klass: string): boolean => {
  if (quarantine === null || quarantine.userApproved) return false;
  return quarantine.downloaded || RUNS_CODE.has(klass);
};

/**
 * A locator is judged twice: as the file it is, and as the place it points at. The stricter of
 * the two answers wins, because opening it does both.
 */
const followLocator = (input: AssessInput, base: Assessed): Assessed => {
  const target = locatorUrl(input.target.ref);
  const redirect = target === null ? null : parseUrl(target);
  if (redirect === null) return { ...base, consent: higher(base.consent, 'verify') };
  const inner = requiredConsent({ ...base.assessment, subject: urlSubject(redirect) });
  return { ...base, consent: higher(base.consent, inner), redirect };
};

/** Everything the policy needs, read from the real filesystem, for the ONE chosen target. */
export const assess = (input: AssessInput): Assessed => {
  const url = input.target.kind === 'url' ? parseUrl(input.target.ref) : null;
  if (input.target.kind === 'url') {
    // A URL that will not even parse is not something to guess about.
    return url === null
      ? forUrl(input, { url: new URL('about:blank'), scheme: 'about', klass: 'forbidden', hasUserInfo: false })
      : forUrl(input, url);
  }
  const facts = classifyPath(input.target.ref, input.roots);
  const quarantine = facts.exists ? readQuarantine(input.target.ref) : null;
  const assessment: Assessment = {
    subject: { kind: 'path', klass: facts.klass },
    origin: input.origin,
    quarantined: isRisky(quarantine, facts.klass),
    escapesRoots: facts.escapesRoots,
    external: facts.volume === 'external',
    handler: kindOf(input.handler),
    handlerFromAi: input.handlerFromAi,
    curated: isCurated(facts),
    reveal: input.reveal,
  };
  const base: Assessed = {
    consent: requiredConsent(assessment), assessment, facts, quarantine, url: null, redirect: null,
  };
  if (facts.klass !== 'locator' || input.reveal) return base;
  return followLocator(input, base);
};
