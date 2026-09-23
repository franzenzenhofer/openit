import { describe, expect, it } from 'vitest';
import { buildOpenArgv, FORBIDDEN_FLAGS, type OpenHandler, type OpenPlan } from '../src/act/argv.js';

const plan = (over: Partial<OpenPlan> = {}): OpenPlan => ({
  target: { kind: 'path', path: '/Users/f/Downloads/report.pdf' },
  handler: { kind: 'default' },
  reveal: false,
  background: false,
  newInstance: false,
  wait: false,
  ...over,
});

const handlers: OpenHandler[] = [
  { kind: 'default' },
  { kind: 'app', appPath: '/System/Applications/Preview.app' },
  { kind: 'bundleId', bundleId: 'com.apple.Preview' },
];

describe('buildOpenArgv', () => {
  it('opens a document with the system default', () => {
    expect(buildOpenArgv(plan())).toEqual(['--', '/Users/f/Downloads/report.pdf']);
  });

  it('names an app by absolute bundle path, never by display name', () => {
    expect(buildOpenArgv(plan({ handler: { kind: 'app', appPath: '/A/Preview.app' } })))
      .toEqual(['-a', '/A/Preview.app', '--', '/Users/f/Downloads/report.pdf']);
  });

  it('falls back to a bundle id only when asked to', () => {
    expect(buildOpenArgv(plan({ handler: { kind: 'bundleId', bundleId: 'com.apple.Preview' } })))
      .toEqual(['-b', 'com.apple.Preview', '--', '/Users/f/Downloads/report.pdf']);
  });

  it('always sends a URL through -u, so it can never be read as a path', () => {
    const argv = buildOpenArgv(plan({ target: { kind: 'url', url: 'https://example.com/a' } }));
    expect(argv).toEqual(['-u', 'https://example.com/a']);
    expect(argv).not.toContain('--');
  });

  it('puts a dash-leading path after the -- guard', () => {
    const argv = buildOpenArgv(plan({ target: { kind: 'path', path: '/x/-dashfile.txt' } }));
    expect(argv.at(-2)).toBe('--');
    expect(argv.at(-1)).toBe('/x/-dashfile.txt');
  });

  it('emits the flags it was asked for, and never -W together with -g', () => {
    expect(buildOpenArgv(plan({ reveal: true }))[0]).toBe('-R');
    expect(buildOpenArgv(plan({ newInstance: true }))).toContain('-n');
    expect(buildOpenArgv(plan({ background: true, wait: true }))).not.toContain('-W');
    expect(buildOpenArgv(plan({ wait: true }))).toContain('-W');
  });

  it('carries exactly one operand for every possible plan', () => {
    for (const handler of handlers) {
      for (const reveal of [true, false]) {
        for (const background of [true, false]) {
          const argv = buildOpenArgv(plan({ handler, reveal, background }));
          const separator = argv.indexOf('--');
          expect(separator).toBeGreaterThan(-1);
          expect(argv.length - separator - 1).toBe(1);
        }
      }
    }
  });

  it('never emits an argument-injection or file-write flag, in any combination', () => {
    const every: OpenPlan[] = [];
    for (const handler of handlers) {
      for (const reveal of [true, false]) {
        for (const newInstance of [true, false]) {
          for (const wait of [true, false]) {
            every.push(plan({ handler, reveal, newInstance, wait }));
            every.push(plan({ handler, reveal, newInstance, wait, target: { kind: 'url', url: 'https://x.test/' } }));
          }
        }
      }
    }
    for (const candidate of every) {
      const argv = buildOpenArgv(candidate);
      for (const forbidden of FORBIDDEN_FLAGS) expect(argv).not.toContain(forbidden);
    }
  });
});
