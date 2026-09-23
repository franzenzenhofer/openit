import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { makeFixture, quarantine } from './fixtures.js';

const fixture = makeFixture();
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const CLI = join(ROOT, 'dist', 'openit.js');
const SHIMS = join(ROOT, 'test', 'shims');
const EXPECT = '/usr/bin/expect';
const TIMED_OUT = 99;

beforeAll(() => {
  expect(spawnSync('node', [join(ROOT, 'scripts', 'build.mjs')], { encoding: 'utf8' }).status).toBe(0);
});

const document = join(fixture.docs, 'consent.pdf');
writeFileSync(document, '%PDF-1.4\n');
const application = join(fixture.docs, 'Fake.app');

writeFileSync(join(fixture.config, 'config.json'), JSON.stringify({
  roots: [{ path: fixture.root, depth: 3 }],
  docRoots: [{ path: fixture.docs, depth: 1 }],
  ignore: [], handlers: [], history: false,
  ai: { enabled: false, command: 'auto', args: [], model: '', timeoutMs: 1000 },
}));

interface Answered {
  readonly status: number | null;
  readonly opened: boolean;
  readonly output: string;
}

/**
 * A real pseudo-terminal, driven by expect(1).
 *
 * Consent reads /dev/tty directly, so there is no way to test it through a pipe: a test that
 * fed stdin would only ever prove the no-terminal path, which is the one path that is easy.
 */
const answer = (target: string, prompt: string, reply: string): Answered => {
  const opener = mkdtempSync(join(tmpdir(), 'openit-consent-'));
  const openBin = join(opener, 'open-ok.sh');
  copyFileSync(join(SHIMS, 'open-ok.sh'), openBin);
  const script = join(opener, 'ask.exp');
  writeFileSync(script, [
    'set timeout 20',
    `spawn -noecho node {${CLI}} {${target}}`,
    'expect {',
    `  {${prompt}} { send -- "${reply}" }`,
    `  timeout { exit ${String(TIMED_OUT)} }`,
    '}',
    'expect eof',
    'catch wait result',
    'exit [lindex $result 3]',
  ].join('\n'));
  const run = spawnSync(EXPECT, ['-f', script], {
    encoding: 'utf8',
    env: {
      PATH: process.env['PATH'] ?? '/usr/bin:/bin',
      HOME: fixture.home,
      TERM: 'dumb',
      OPENIT_CONFIG_DIR: fixture.config,
      OPENIT_DATA_DIR: fixture.data,
      OPENIT_OPEN_BIN: openBin,
    },
  });
  return {
    status: run.status,
    // The shim creates its log on first call, so its absence is proof nothing was launched.
    opened: existsSync(join(opener, 'argv.log')),
    output: `${run.stdout ?? ''}${run.stderr ?? ''}`,
  };
};

const askDocument = (reply: string): Answered => {
  quarantine(document);
  return answer(document, 'open it?', reply);
};

const askApplication = (reply: string): Answered => answer(application, 'to open it', reply);

describe('a question that a yes answers', () => {
  it('opens on y', () => {
    const run = askDocument('y\r');
    expect(run.status).toBe(0);
    expect(run.opened).toBe(true);
  });

  it('opens on a bare Enter, because the default is the one shown in [Y/n]', () => {
    const run = askDocument('\r');
    expect(run.status).toBe(0);
    expect(run.opened).toBe(true);
  });

  it('declines on n, exits 3, and launches nothing', () => {
    const run = askDocument('n\r');
    expect(run.status).toBe(3);
    expect(run.opened).toBe(false);
  });

  it('declines when the terminal closes before an answer', () => {
    const run = askDocument('\u0004');
    expect(run.status).toBe(3);
    expect(run.opened).toBe(false);
  });

  it('says what it is about to open, and why it is asking', () => {
    const run = askDocument('n\r');
    expect(run.output).toContain('downloaded with Google Chrome');
  });
});

describe('a question that only the word answers', () => {
  it('opens when the word is typed exactly', () => {
    const run = askApplication('application\r');
    expect(run.status).toBe(0);
    expect(run.opened).toBe(true);
  });

  it('declines a half-typed word, because this is never a prefix match', () => {
    const run = askApplication('applic\r');
    expect(run.status).toBe(3);
    expect(run.opened).toBe(false);
  });

  it('declines a y, which is the whole point of asking this way', () => {
    const run = askApplication('y\r');
    expect(run.status).toBe(3);
    expect(run.opened).toBe(false);
  });

  it('declines the name of the thing itself, which is attacker-chosen text', () => {
    const run = askApplication('Fake.app\r');
    expect(run.status).toBe(3);
    expect(run.opened).toBe(false);
  });

  it('declines a bare Enter', () => {
    const run = askApplication('\r');
    expect(run.status).toBe(3);
    expect(run.opened).toBe(false);
  });

  it('names the class rather than the filename, so the word cannot be spoofed', () => {
    const run = askApplication('\r');
    expect(run.output).toContain('APPLICATION BUNDLE');
    expect(run.output).toContain('type  application');
  });
});
