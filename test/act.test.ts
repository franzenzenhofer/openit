import { copyFileSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { planAction, type Action } from '../src/action.js';
import { childEnv, openTimeoutMs, runOpen } from '../src/act/run.js';
import { OPEN_FRAGMENTS, translateOpenError } from '../src/act/errors.js';
import { makeFixture } from './fixtures.js';
import type { OpenPlan } from '../src/act/argv.js';
import type { Target } from '../src/target.js';

const fixture = makeFixture();
const SHIMS = join(dirname(fileURLToPath(import.meta.url)), 'shims');

/** A copy of one shim in its own directory, so its argv log belongs to this test alone. */
const shim = (name: string): { readonly bin: string; readonly log: string; readonly dir: string } => {
  const dir = mkdtempSync(join(tmpdir(), 'openit-shim-'));
  const bin = join(dir, name);
  copyFileSync(join(SHIMS, name), bin);
  return { bin, log: join(dir, 'argv.log'), dir };
};

const readArgv = (log: string): string[][] =>
  readFileSync(log, 'utf8')
    .split('\u001e')
    .map((run) => run.split('\u0000').filter((arg) => arg !== ''));

const action = (target: Target, over: Partial<Action> = {}): Action => ({
  target,
  handler: { kind: 'default' },
  newInstance: false,
  background: false,
  reveal: false,
  wait: false,
  ...over,
});

const file = (name: string): Target =>
  ({ kind: 'file', ref: join(fixture.docs, name), name, mtime: 0, source: 'doc-index' });

const planFor = (target: Target, bin: string) => {
  const planned = planAction(action(target), bin);
  if ('error' in planned) throw new Error(planned.error);
  return planned;
};

describe('the opener openit actually runs', () => {
  it('runs the exact argv it printed, and nothing else', async () => {
    const opener = shim('open-ok.sh');
    const target = file('report.pdf');
    const launched = await runOpen(planFor(target, opener.bin));
    expect(launched.kind).toBe('ok');
    expect(readArgv(opener.log)).toEqual([['--', target.ref]]);
  });

  it('carries a filename containing a newline through unharmed', async () => {
    const name = 'two\nlines.txt';
    writeFileSync(join(fixture.docs, name), 'x');
    const opener = shim('open-ok.sh');
    await runOpen(planFor(file(name), opener.bin));
    expect(readArgv(opener.log)[0]?.[1]).toBe(join(fixture.docs, name));
  });

  it('keeps each invocation separate in the log', async () => {
    const opener = shim('open-ok.sh');
    await runOpen(planFor(file('report.pdf'), opener.bin));
    await runOpen(planFor(file('photo.jpg'), opener.bin));
    expect(readArgv(opener.log)).toHaveLength(2);
  });

  it('turns open(1) prose into a failure a person can act on', async () => {
    const opener = shim('open-missing.sh');
    const launched = await runOpen(planFor(file('gone.pdf'), opener.bin));
    expect(launched).toMatchObject({ kind: 'failed', failure: { failure: 'missing-target' } });
    expect(existsSync(opener.log)).toBe(false);
  });

  it('kills the whole process group when the opener hangs', async () => {
    const opener = shim('open-hang.sh');
    const launched = await runOpen(planFor(file('report.pdf'), opener.bin));
    expect(launched).toMatchObject({ kind: 'failed', failure: { failure: 'timeout' } });
    const pidFile = join(opener.dir, 'child.pid');
    expect(existsSync(pidFile)).toBe(true);
    const pid = Number.parseInt(readFileSync(pidFile, 'utf8').trim(), 10);
    expect(() => process.kill(pid, 0)).toThrow();
  }, 30_000);

  it('drains a noisy opener instead of deadlocking on it, and repeats back a bounded line', async () => {
    const opener = shim('open-noisy.sh');
    const launched = await runOpen(planFor(file('report.pdf'), opener.bin));
    expect(launched.kind).toBe('failed');
    if (launched.kind !== 'failed') return;
    expect(launched.failure.message.length).toBeLessThan(300);
  });
});

describe('what the opener is allowed to inherit', () => {
  it('strips every one of openit\'s own variables out of the child environment', () => {
    const env = childEnv({ PATH: '/usr/bin', OPENIT_OPEN_BIN: '/tmp/evil', OPENIT_DEBUG: '1', HOME: '/h' });
    expect(env).toEqual({ PATH: '/usr/bin', HOME: '/h' });
  });

  it('waits without a deadline only when the user asked it to wait', () => {
    const target = file('report.pdf');
    expect(openTimeoutMs(planFor(target, '/usr/bin/open'))).toBe(10_000);
    const waiting = planAction(action(target, { wait: true }), '/usr/bin/open');
    expect('error' in waiting ? 0 : openTimeoutMs(waiting)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('open(1) failures, translated', () => {
  const plan: OpenPlan = {
    target: { kind: 'url', url: 'weird-scheme://x' },
    handler: { kind: 'default' },
    reveal: false, background: false, newInstance: false, wait: false,
  };

  it('names the scheme nothing handles', () => {
    const failure = translateOpenError('No application knows how to open weird-scheme://x', plan);
    expect(failure.failure).toBe('no-scheme-handler');
    expect(failure.message).toContain('weird-scheme:');
  });

  it('keeps an unrecognised message rather than inventing one', () => {
    const failure = translateOpenError('something new in macOS 27', plan);
    expect(failure.failure).toBe('unknown');
    expect(failure.message).toContain('something new in macOS 27');
  });

  it('flattens the prose onto one line', () => {
    const failure = translateOpenError('line one\nline two\u001b[31m', plan);
    expect(failure.message).not.toContain('\n');
  });

  it('knows exactly four fragments, and the contract test pins them to the real open(1)', () => {
    expect(OPEN_FRAGMENTS).toHaveLength(4);
  });
});
