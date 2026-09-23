import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { completeQuery, SUBCOMMANDS } from '../src/commands/complete.js';
import { makeFixture } from './fixtures.js';

const fixture = makeFixture();
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const CLI = join(ROOT, 'dist', 'openit.js');
const EXPECT = '/usr/bin/expect';

beforeAll(() => {
  expect(spawnSync('node', [join(ROOT, 'scripts', 'build.mjs')], { encoding: 'utf8' }).status).toBe(0);
});

writeFileSync(join(fixture.config, 'config.json'), JSON.stringify({
  roots: [{ path: fixture.root, depth: 3 }],
  docRoots: [{ path: fixture.docs, depth: 1 }],
  ignore: [], handlers: [], history: false,
  ai: { enabled: false, command: 'auto', args: [], model: '', timeoutMs: 1000 },
}));

const env = {
  PATH: process.env['PATH'] ?? '/usr/bin:/bin',
  HOME: fixture.home,
  TERM: 'dumb',
  OPENIT_CONFIG_DIR: fixture.config,
  OPENIT_DATA_DIR: fixture.data,
};

const init = (shell: string): string => {
  const run = spawnSync('node', [CLI, 'init', shell], { encoding: 'utf8', env });
  expect(run.status).toBe(0);
  return run.stdout;
};

const parses = (shell: string, args: readonly string[], script: string): boolean => {
  const file = join(mkdtempSync(join(tmpdir(), 'openit-shell-')), 'init');
  writeFileSync(file, script);
  const run = spawnSync(shell, [...args, file], { encoding: 'utf8', env });
  return run.status === 0;
};

describe('what a shell is told to evaluate', () => {
  it('is valid zsh', () => {
    expect(parses('/bin/zsh', ['-n'], init('zsh'))).toBe(true);
  });

  it('is valid bash', () => {
    expect(parses('/bin/bash', ['-n'], init('bash'))).toBe(true);
  });

  it('is valid fish, when fish is installed', () => {
    const fish = spawnSync('/usr/bin/env', ['fish', '--version'], { encoding: 'utf8' });
    if (fish.status !== 0) return;
    expect(parses('fish', ['--no-execute'], init('fish'))).toBe(true);
  });

  it('wires completion and installs no wrapper function, because opening is not a cd', () => {
    expect(init('zsh')).toContain('compdef');
    // A wrapper would have to be named `openit` exactly; the completion widget is `_openit`.
    expect(init('zsh').split('\n').some((line) => line.startsWith('openit('))).toBe(false);
    expect(init('bash')).toContain('complete -o default -F');
  });

  it('says which shells it knows when asked for one it does not', () => {
    const run = spawnSync('node', [CLI, 'init', 'csh'], { encoding: 'utf8', env });
    expect(run.status).toBe(1);
    expect(run.stderr).toContain('zsh, bash and fish');
  });
});

describe('what Tab offers', () => {
  it('offers the subcommands before anything has been typed', () => {
    expect(completeQuery([])).toEqual(SUBCOMMANDS);
  });

  it('offers the options when a dash has been typed', () => {
    expect(completeQuery(['--re'])).toEqual(['--reveal']);
  });

  it('offers what is actually there, by name', () => {
    expect(completeQuery(['--', 'repo'])).toContain('report.pdf');
  });

  it('never offers a name a shell could not insert as one word', () => {
    for (const completion of completeQuery(['--', 'invoice'])) {
      expect(completion).not.toContain('\n');
    }
  });

  it('answers at all when a directory is unreadable, rather than throwing', () => {
    const locked = join(fixture.root, 'locked');
    spawnSync('/bin/mkdir', ['-p', locked]);
    chmodSync(locked, 0o000);
    expect(() => completeQuery(['--', 'cdai'])).not.toThrow();
    chmodSync(locked, 0o755);
  });
});

describe('completion through a real zsh, on a real terminal', () => {
  it('completes a half-typed name to a real file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'openit-zsh-'));
    const rc = join(dir, 'zshrc');
    writeFileSync(rc, [
      'autoload -Uz compinit && compinit -u -d /dev/null',
      `openit() { node ${CLI} "$@" }`,
      `eval "$(node ${CLI} init zsh)"`,
    ].join('\n'));
    const script = join(dir, 'tab.exp');
    writeFileSync(script, [
      'set timeout 20',
      `spawn -noecho /bin/zsh -f`,
      `send "source ${rc}\\r"`,
      'send "openit repo\\t"',
      'expect {',
      '  "report.pdf" { exit 0 }',
      '  timeout { exit 99 }',
      '}',
    ].join('\n'));
    const run = spawnSync(EXPECT, ['-f', script], { encoding: 'utf8', env });
    expect(run.status).toBe(0);
  }, 40_000);
});
