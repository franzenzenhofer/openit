import { describe, expect, it } from 'vitest';
import { consentRank, requiredConsent, type Assessment, type Origin, type Subject } from '../src/risk/policy.js';
import type { TargetClass } from '../src/risk/classes.js';
import type { SchemeClass } from '../src/risk/scheme.js';
import type { HandlerKind } from '../src/risk/bundle.js';

const CLASSES: TargetClass[] = [
  'directory', 'document', 'unknown', 'code', 'locator',
  'script', 'executable', 'installer', 'application', 'bundle',
];
const SCHEMES: SchemeClass[] = ['web', 'message', 'apple', 'custom', 'forbidden', 'file'];
const ORIGINS: Origin[] = ['literal', 'alias', 'deterministic', 'ai'];
const HANDLERS: HandlerKind[] = ['default', 'viewer', 'editor', 'browser', 'terminal', 'installer', 'unknown'];

const path = (klass: TargetClass): Subject => ({ kind: 'path', klass });
const link = (scheme: SchemeClass, hasUserInfo = false): Subject =>
  ({ kind: 'url', scheme, hasUserInfo });

const at = (over: Partial<Assessment> = {}): Assessment => ({
  subject: path('document'),
  origin: 'literal',
  quarantined: false,
  escapesRoots: false,
  external: false,
  handler: 'default',
  handlerFromAi: false,
  reveal: false,
  ...over,
});

/** The whole cross-product, generated rather than written out. */
const everyAssessment = (): Assessment[] => {
  const subjects: Subject[] = [
    ...CLASSES.map(path),
    ...SCHEMES.flatMap((scheme) => [link(scheme), link(scheme, true)]),
  ];
  const all: Assessment[] = [];
  for (const subject of subjects) {
    for (const origin of ORIGINS) {
      for (const handler of HANDLERS) {
        for (const quarantined of [false, true]) {
          for (const escapesRoots of [false, true]) {
            for (const external of [false, true]) {
              for (const reveal of [false, true]) {
                all.push(at({ subject, origin, handler, quarantined, escapesRoots, external, reveal }));
              }
            }
          }
        }
      }
    }
  }
  return all;
};

const runsCode = (a: Assessment): boolean =>
  a.subject.kind === 'path' && RUNS_CODE.includes(a.subject.klass);

const RUNS_CODE: TargetClass[] = ['application', 'installer', 'bundle', 'executable', 'script'];

describe('named rules a human can read', () => {
  it('opens a plain document you typed the path to, silently', () => {
    expect(requiredConsent(at())).toBe('allow');
  });

  it('opens a folder and a web page you typed, silently', () => {
    expect(requiredConsent(at({ subject: path('directory') }))).toBe('allow');
    expect(requiredConsent(at({ subject: link('web') }))).toBe('allow');
  });

  it('asks before composing a message or placing a call', () => {
    expect(requiredConsent(at({ subject: link('message') }))).toBe('confirm');
  });

  it('asks twice before an app, an installer or a script', () => {
    for (const klass of RUNS_CODE) expect(requiredConsent(at({ subject: path(klass) }))).toBe('verify');
  });

  it('never opens javascript:, data:, vbscript: or about:, from any origin', () => {
    for (const origin of ORIGINS) {
      expect(requiredConsent(at({ subject: link('forbidden'), origin }))).toBe('refuse');
      expect(requiredConsent(at({ subject: link('forbidden'), origin, reveal: true }))).toBe('refuse');
    }
  });

  it('refuses a URL carrying credentials', () => {
    expect(requiredConsent(at({ subject: link('web', true) }))).toBe('refuse');
  });

  it('refuses every quarantined thing that can execute, even one you typed', () => {
    for (const klass of RUNS_CODE) {
      expect(requiredConsent(at({ subject: path(klass), quarantined: true }))).toBe('refuse');
    }
  });

  it('only asks once more about a quarantined document', () => {
    expect(requiredConsent(at({ subject: path('document'), quarantined: true }))).toBe('confirm');
  });

  it('treats a terminal handler as execution', () => {
    expect(requiredConsent(at({ handler: 'terminal' }))).toBe('verify');
    expect(requiredConsent(at({ handler: 'terminal', origin: 'deterministic' }))).toBe('refuse');
  });

  it('refuses a handler the model chose that is not a viewer, editor or browser', () => {
    expect(requiredConsent(at({ origin: 'ai', handlerFromAi: true, handler: 'terminal' }))).toBe('refuse');
    expect(requiredConsent(at({ origin: 'ai', handlerFromAi: true, handler: 'viewer' }))).toBe('confirm');
  });

  it('lets reveal show anything on disk, because Finder executes nothing', () => {
    for (const klass of CLASSES) {
      expect(requiredConsent(at({ subject: path(klass), reveal: true, quarantined: true }))).toBe('allow');
    }
  });

  it('asks once more about a deterministically matched link than a typed one', () => {
    expect(requiredConsent(at({ subject: link('web'), origin: 'literal' }))).toBe('allow');
    expect(requiredConsent(at({ subject: link('web'), origin: 'deterministic' }))).toBe('confirm');
  });
});

describe('invariants over the whole cross-product', () => {
  const all = everyAssessment();

  it('covers a real matrix', () => {
    expect(all.length).toBeGreaterThan(4000);
  });

  it('INV-8 is total: no input throws, every input answers', () => {
    for (const assessment of all) {
      const consent = requiredConsent(assessment);
      expect(['allow', 'confirm', 'verify', 'refuse']).toContain(consent);
    }
  });

  it('INV-1 the model is never trusted with a typed confirmation', () => {
    for (const assessment of all.filter((a) => a.origin === 'ai')) {
      expect(requiredConsent(assessment)).not.toBe('verify');
    }
  });

  it('INV-2 the model can never cause code execution', () => {
    for (const assessment of all) {
      if (assessment.origin !== 'ai' || assessment.reveal) continue;
      if (runsCode(assessment)) expect(requiredConsent(assessment)).toBe('refuse');
    }
  });

  it('INV-3 nothing that runs code is ever waved through', () => {
    for (const assessment of all.filter((a) => !a.reveal && runsCode(a))) {
      expect(requiredConsent(assessment)).not.toBe('allow');
    }
  });

  it('INV-4 a quarantined executable is refused from every origin', () => {
    for (const assessment of all) {
      if (assessment.reveal || !assessment.quarantined || !runsCode(assessment)) continue;
      expect(requiredConsent(assessment)).toBe('refuse');
    }
  });

  it('INV-5 a terminal handler always needs at least a typed confirmation', () => {
    for (const assessment of all.filter((a) => !a.reveal && a.handler === 'terminal')) {
      expect(consentRank(requiredConsent(assessment))).toBeGreaterThanOrEqual(consentRank('verify'));
    }
  });

  it('INV-6 reveal always allows a path', () => {
    for (const assessment of all) {
      if (!assessment.reveal || assessment.subject.kind !== 'path') continue;
      expect(requiredConsent(assessment)).toBe('allow');
    }
  });

  it('INV-9 a forbidden scheme is refused no matter what else is true', () => {
    for (const assessment of all.filter((a) => a.subject.kind === 'url' && a.subject.scheme === 'forbidden')) {
      expect(requiredConsent(assessment)).toBe('refuse');
    }
  });

  const raises = (from: Assessment, to: Assessment): void => {
    const before = requiredConsent(from);
    const after = requiredConsent(to);
    expect(consentRank(after)).toBeGreaterThanOrEqual(consentRank(before));
  };

  it('INV-7 is monotone: no upgrade ever lowers the answer', () => {
    for (const assessment of all.filter((a) => !a.reveal)) {
      raises(assessment, { ...assessment, quarantined: true });
      raises(assessment, { ...assessment, escapesRoots: true });
      raises(assessment, { ...assessment, external: true });
      if (assessment.origin === 'literal') {
        raises(assessment, { ...assessment, origin: 'deterministic' });
      }
    }
  });
});
