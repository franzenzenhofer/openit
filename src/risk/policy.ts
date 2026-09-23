import type { TargetClass } from './classes.js';
import type { SchemeClass } from './scheme.js';
import type { HandlerKind } from './bundle.js';

/** Ordered. Every modifier can only move a decision UP this ladder, never down. */
export type Consent = 'allow' | 'confirm' | 'verify' | 'refuse';

const LADDER: readonly Consent[] = ['allow', 'confirm', 'verify', 'refuse'];

const index = (consent: Consent): number => LADDER.indexOf(consent);
const bump = (consent: Consent): Consent =>
  LADDER[Math.min(index(consent) + 1, LADDER.length - 1)] ?? 'refuse';
const atLeast = (a: Consent, b: Consent): Consent => (index(a) >= index(b) ? a : b);

/** Where the answer came from. The model is the only origin that can be refused outright. */
export type Origin = 'literal' | 'alias' | 'deterministic' | 'ai';

/**
 * A path has a class and a URL has a scheme, and nothing has both. Making that a union rather
 * than two optional fields is what stops the table ever being asked a question reality cannot
 * pose - an "application" that is also an https link.
 */
export type Subject =
  | { readonly kind: 'path'; readonly klass: TargetClass }
  | { readonly kind: 'url'; readonly scheme: SchemeClass; readonly hasUserInfo: boolean };

export interface Assessment {
  readonly subject: Subject;
  readonly origin: Origin;
  /** Carries com.apple.quarantine and nobody has approved it yet. */
  readonly quarantined: boolean;
  readonly escapesRoots: boolean;
  readonly external: boolean;
  readonly handler: HandlerKind;
  readonly handlerFromAi: boolean;
  /** -R. Finder executes nothing, so this is the universal downgrade. */
  readonly reveal: boolean;
}

const INERT: ReadonlySet<TargetClass> = new Set(['directory', 'document', 'unknown', 'code']);

const CLASS_BASE: Record<TargetClass, Consent> = {
  directory: 'allow',
  document: 'allow',
  unknown: 'allow',
  code: 'allow',
  locator: 'confirm',
  script: 'verify',
  executable: 'verify',
  application: 'verify',
  bundle: 'verify',
  installer: 'verify',
};

const SCHEME_BASE: Record<SchemeClass, Consent> = {
  web: 'allow',
  message: 'confirm',
  apple: 'confirm',
  custom: 'verify',
  forbidden: 'refuse',
  // openit never emits `-u file://...`; reaching here at all means something went wrong.
  file: 'refuse',
};

export const baseConsent = (assessment: Assessment): Consent =>
  assessment.subject.kind === 'path'
    ? CLASS_BASE[assessment.subject.klass]
    : SCHEME_BASE[assessment.subject.scheme];

/** Only a path can run code on a double-click; a link is judged entirely by its scheme. */
const runsCode = (subject: Subject): boolean =>
  subject.kind === 'path' && !INERT.has(subject.klass);

const contextual = (assessment: Assessment, from: Consent): Consent => {
  let level = from;
  // A matched title and the URL behind it are different strings, so a link that was merely
  // matched is asked about. A typed one and a taught one are not: in both cases this exact URL
  // is the one the user themselves put in front of openit.
  const typed = assessment.origin === 'literal' || assessment.origin === 'alias';
  if (assessment.subject.kind === 'url' && !typed) level = bump(level);
  if (assessment.quarantined) {
    if (runsCode(assessment.subject)) return 'refuse';
    level = bump(level);
  }
  if (assessment.escapesRoots) {
    if (assessment.origin !== 'literal' && index(from) >= index('verify')) return 'refuse';
    level = bump(level);
  }
  if (assessment.external) level = bump(level);
  return level;
};

const byHandler = (assessment: Assessment, from: Consent): Consent => {
  if (assessment.handlerFromAi
    && !['viewer', 'editor', 'browser', 'default'].includes(assessment.handler)) return 'refuse';
  if (assessment.handler === 'terminal') {
    // A terminal, or a taught command handler, turns the target into something to execute. The
    // person may ask for that - by naming it - and is then asked to type a word back. What is
    // refused outright is a model having picked either half of it: the thing that gets run, or
    // the thing that runs it.
    return assessment.origin === 'ai' ? 'refuse' : atLeast(from, 'verify');
  }
  return assessment.handler === 'installer' ? atLeast(from, 'verify') : from;
};

/**
 * Pure, total and monotone: no input throws, every input returns a level, and adding
 * quarantine, a root escape, an external volume or a weaker origin never lowers the answer.
 * `reveal` is the one deliberate exception, and it is a downgrade to `allow` because selecting
 * something in Finder executes nothing at all.
 */
export const requiredConsent = (assessment: Assessment): Consent => {
  if (assessment.subject.kind === 'url' && assessment.subject.hasUserInfo) return 'refuse';
  const base = baseConsent(assessment);
  if (base === 'refuse') return 'refuse';
  // Revealing a path shows it; it never opens it. A URL cannot be revealed, so it is unaffected.
  if (assessment.reveal && assessment.subject.kind === 'path') return 'allow';
  const level = byHandler(assessment, contextual(assessment, base));
  if (assessment.origin !== 'ai') return level;
  // A hard cap at `confirm`: the model may pick a document, a folder or a web page, and that
  // pick is always shown before it happens. Anything that would need more than a yes is refused
  // rather than asked, because there is no answer that would make it safe for a model to choose.
  return index(level) >= index('verify') ? 'refuse' : atLeast(level, 'confirm');
};

export const consentRank = index;
