import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { makeFixture } from './fixtures.js';

const fixture = makeFixture();
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const CLI = join(ROOT, 'dist', 'openit.js');

beforeAll(() => {
  expect(spawnSync('node', [join(ROOT, 'scripts', 'build.mjs')], { encoding: 'utf8' }).status).toBe(0);
});

interface Run {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

const openit = (...args: string[]): Run => {
  const result = spawnSync('node', [CLI, ...args], {
    encoding: 'utf8',
    cwd: fixture.home,
    env: {
      PATH: process.env['PATH'] ?? '/usr/bin:/bin',
      HOME: fixture.home,
      OPENIT_CONFIG_DIR: fixture.config,
      OPENIT_DATA_DIR: fixture.data,
    },
  });
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
};

const config = (): Record<string, unknown> =>
  JSON.parse(readFileSync(join(fixture.config, 'config.json'), 'utf8')) as Record<string, unknown>;

describe('setup', () => {
  it('writes a config, an index and an app list, without a question when told not to ask', () => {
    const run = openit('setup', '--yes', '--root', fixture.root, '--depth', '2', '--no-ai');
    expect(run.status).toBe(0);
    expect(config()).toMatchObject({ ai: { enabled: false } });
    expect(existsSync(join(fixture.data, 'index.json'))).toBe(true);
    expect(existsSync(join(fixture.data, 'apps.json'))).toBe(true);
  });

  it('says what it will send to a model, before it is ever used', () => {
    const run = openit('setup', '--yes', '--ai');
    expect(run.stderr).toContain('never sent');
    openit('setup', '--yes', '--no-ai');
  });

  it('refuses an option it does not know rather than ignoring it', () => {
    expect(openit('setup', '--recursive').status).toBe(1);
  });
});

describe('doctor', () => {
  it('reports what openit can actually see on this machine', () => {
    // After setup, so there are roots to report on; doctor is a report, not a guess.
    openit('setup', '--yes', '--root', fixture.root, '--depth', '2', '--no-ai');
    const run = openit('doctor');
    expect(run.status).toBe(0);
    for (const line of ['opener', 'index', 'apps', 'links', 'spotlight', 'tty', 'ai']) {
      expect(run.stderr).toContain(line);
    }
  });

  it('says loudly when the opener is not the system opener', () => {
    const shouted = spawnSync('node', [CLI, 'doctor'], {
      encoding: 'utf8',
      env: {
        PATH: process.env['PATH'] ?? '/usr/bin:/bin',
        HOME: fixture.home,
        OPENIT_CONFIG_DIR: fixture.config,
        OPENIT_DATA_DIR: fixture.data,
        OPENIT_OPEN_BIN: '/bin/echo',
      },
    });
    expect(shouted.stderr).toContain('NOT the system opener');
  });

  it('keeps stdout clean, so `openit doctor > file` writes nothing', () => {
    expect(openit('doctor').stdout).toBe('');
  });
});

describe('link', () => {
  it('teaches a name for a page, lists it, and forgets it', () => {
    expect(openit('link', 'add', 'gsc', 'https://search.google.com/search-console').status).toBe(0);
    expect(openit('link', 'list').stderr).toContain('gsc');
    expect(openit('link', 'forget', 'gsc').status).toBe(0);
    expect(openit('link', 'list').stderr).toContain('no links taught yet');
  });

  it('refuses to teach a name for a javascript: link', () => {
    const run = openit('link', 'add', 'pwn', 'javascript:alert(1)');
    expect(run.status).toBe(5);
    expect(run.stderr).toContain('never opens javascript:');
  });

  it('refuses a URL carrying credentials', () => {
    expect(openit('link', 'add', 'bank', 'https://user:pw@bank.test/').status).toBe(5);
  });

  it('refuses a name nobody could type again on purpose', () => {
    expect(openit('link', 'add', 'two words', 'https://a.test/').status).toBe(1);
    expect(openit('link', 'add', 'a‮b', 'https://a.test/').status).toBe(1);
  });

  it('says what it wanted when the arguments are wrong', () => {
    expect(openit('link', 'add', 'only-a-name').status).toBe(1);
    expect(openit('link', 'nonsense').status).toBe(1);
  });
});

describe('alias', () => {
  it('remembers a thing under words, and forgets it again', () => {
    const add = openit('alias', 'add', fixture.root, '--', 'my projects');
    expect(add.status).toBe(0);
    expect(openit('alias', 'list').stderr).toContain('my projects');
    expect(openit('alias', 'forget', '--', 'MY   Projects').status).toBe(0);
    expect(openit('alias', 'list').stderr).toContain('nothing remembered yet');
  });

  it('refuses to remember something that is not there', () => {
    expect(openit('alias', 'add', join(fixture.root, 'nope'), '--', 'gone').status).toBe(1);
  });

  it('refuses to remember a link openit would never open', () => {
    expect(openit('alias', 'add', 'javascript:alert(1)', '--', 'pwn').status).toBe(5);
  });
});

describe('handler', () => {
  it('teaches an app for a kind and shows it back', () => {
    expect(openit('handler', 'set', '--kind', 'pdf', '--app', 'Preview').status).toBe(0);
    expect(openit('handler', 'list').stderr).toContain('Preview');
    expect(openit('handler', 'forget', '--kind', 'pdf').status).toBe(0);
  });

  it('refuses a kind that is not a kind, and an app that is not installed', () => {
    expect(openit('handler', 'set', '--kind', 'rechnung', '--app', 'Preview').status).toBe(1);
    expect(openit('handler', 'set', '--kind', 'pdf', '--app', 'No Such App').status).toBe(1);
  });

  it('refuses a command that does not exist, checked when it is taught', () => {
    const run = openit('handler', 'set', '--ext', 'md', '--command', 'definitely-not-installed');
    expect(run.status).toBe(1);
    expect(run.stderr).toContain('no such executable');
  });

  it('refuses arguments that do not say exactly once where the target goes', () => {
    const run = openit('handler', 'set', '--ext', 'md', '--command', '/bin/echo', '--args', 'a,b');
    expect(run.status).toBe(1);
    expect(run.stderr).toContain('{target}');
  });

  it('refuses to be told both an app and a command', () => {
    expect(openit('handler', 'set', '--ext', 'md', '--app', 'Preview', '--command', '/bin/echo').status)
      .toBe(1);
  });
});

describe('index', () => {
  it('counts what it knows, and rebuilds it on request', () => {
    writeFileSync(join(fixture.data, 'index.json'), '{"nonsense": true}');
    const run = openit('index', '--refresh');
    expect(run.status).toBe(0);
    expect(run.stderr).toContain('directories');
    expect(run.stderr).toContain('links');
  });

  it('refuses an option it does not know', () => {
    expect(openit('index', '--everything').status).toBe(1);
  });
});
