import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeFixture, quarantine } from './fixtures.js';

const fixture = makeFixture();
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const CLI = join(ROOT, 'dist', 'openit.js');
const SHIMS = join(ROOT, 'test', 'shims');

/** Built here rather than assumed: an e2e test that runs a stale bundle proves nothing. */
beforeAll(() => {
  const built = spawnSync('node', [join(ROOT, 'scripts', 'build.mjs')], { encoding: 'utf8' });
  expect(built.status).toBe(0);
});

const opener = mkdtempSync(join(tmpdir(), 'openit-e2e-'));
const openBin = join(opener, 'open-ok.sh');
copyFileSync(join(SHIMS, 'open-ok.sh'), openBin);
const argvLog = join(opener, 'argv.log');

const config = {
  roots: [{ path: fixture.root, depth: 3 }],
  docRoots: [{ path: fixture.docs, depth: 1 }],
  ignore: ['node_modules', '.git'],
  handlers: [],
  history: false,
  // Off in every test: an end to end run must never reach for a model on someone's machine.
  ai: { enabled: false, command: 'auto', args: [], model: '', timeoutMs: 1000 },
};
writeFileSync(join(fixture.config, 'config.json'), JSON.stringify(config));

interface Run {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

const openit = (args: readonly string[], env: NodeJS.ProcessEnv = {}): Run => {
  const result = spawnSync('node', [CLI, ...args], {
    encoding: 'utf8',
    cwd: fixture.home,
    env: {
      PATH: process.env['PATH'] ?? '/usr/bin:/bin',
      HOME: fixture.home,
      OPENIT_CONFIG_DIR: fixture.config,
      OPENIT_DATA_DIR: fixture.data,
      OPENIT_OPEN_BIN: openBin,
      ...env,
    },
  });
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
};

describe('what comes out on stdout', () => {
  it('prints one line, the exact argv, and spawns nothing', () => {
    const run = openit(['--dry-run', 'report']);
    expect(run.status).toBe(0);
    expect(run.stdout.trim().split('\n')).toHaveLength(1);
    expect(run.stdout).toContain('report.pdf');
    expect(existsSync(argvLog)).toBe(false);
  });

  it('puts every human-readable byte on stderr', () => {
    const run = openit(['--dry-run', 'report']);
    expect(run.stderr).toContain('would open');
    expect(run.stdout).not.toContain('would open');
  });

  it('answers `which` with the thing itself and nothing else', () => {
    const run = openit(['which', '--', 'report']);
    expect(run.status).toBe(0);
    expect(run.stdout.trim()).toBe(join(fixture.docs, 'report.pdf'));
  });

  it('answers `plan` with one JSON object on one line', () => {
    const run = openit(['plan', '--', 'report']);
    const parsed = JSON.parse(run.stdout) as Record<string, unknown>;
    expect(parsed).toMatchObject({ consent: 'allow', class: 'document', command: openBin });
  });

  it('says what it would do with the handler that was named', () => {
    const run = openit(['--dry-run', '--reveal', 'report']);
    expect(run.stdout).toContain("'-R'");
    expect(run.stdout).not.toContain("'-a'");
  });

  it('prints the version on stderr, keeping stdout clean for the plan', () => {
    const run = openit(['--version']);
    expect(run.status).toBe(0);
    expect(run.stdout).toBe('');
    expect(run.stderr).toContain('openit');
  });
});

describe('the exit code is a receipt', () => {
  it('0 means it was opened, and the argv proves what was opened', () => {
    const run = openit([join(fixture.docs, 'report.pdf')]);
    expect(run.status).toBe(0);
    expect(existsSync(argvLog)).toBe(true);
  });

  it('4 means the words named nothing openable', () => {
    const run = openit(['--dry-run', 'zzqqxx-nothing-is-called-this']);
    expect(run.status).toBe(4);
    expect(run.stdout).toBe('');
  });

  it('1 means openit itself could not proceed', () => {
    expect(openit([]).status).toBe(1);
    expect(openit(['--dry-run', '--nonsense', 'report']).status).toBe(1);
  });
});

describe('nothing is launched before consent, and nothing at all when it is refused', () => {
  const quiet = mkdtempSync(join(tmpdir(), 'openit-quiet-'));
  const quietBin = join(quiet, 'open-ok.sh');
  copyFileSync(join(SHIMS, 'open-ok.sh'), quietBin);
  const quietLog = join(quiet, 'argv.log');

  it('declines with 3 when there is nobody to ask, and launches nothing', () => {
    const doc = join(fixture.docs, 'quarantined.pdf');
    writeFileSync(doc, '%PDF-1.4\n');
    expect(quarantine(doc)).toBe(true);
    const run = openit([doc], { OPENIT_OPEN_BIN: quietBin });
    expect(run.status).toBe(3);
    // The shim creates its log on first call. Its absence is the proof.
    expect(existsSync(quietLog)).toBe(false);
  });

  it('refuses with 5 without asking anything, and launches nothing', () => {
    const app = join(fixture.docs, 'Quarantined.app');
    spawnSync('/bin/cp', ['-R', join(fixture.docs, 'Fake.app'), app]);
    expect(quarantine(app)).toBe(true);
    const run = openit([app], { OPENIT_OPEN_BIN: quietBin });
    expect(run.status).toBe(5);
    expect(run.stderr).toContain('would refuse');
    expect(existsSync(quietLog)).toBe(false);
  });

  it('still refuses in --dry-run, and says so with the same code', () => {
    const run = openit(['--dry-run', join(fixture.docs, 'Quarantined.app')], { OPENIT_OPEN_BIN: quietBin });
    expect(run.status).toBe(5);
    expect(run.stdout).toBe('');
    expect(existsSync(quietLog)).toBe(false);
  });

  it('withholds a refused thing from `which`, so a script cannot open it anyway', () => {
    const run = openit(['which', '--', join(fixture.docs, 'Quarantined.app')], { OPENIT_OPEN_BIN: quietBin });
    expect(run.status).toBe(5);
    expect(run.stdout).toBe('');
  });

  it('describes a refusal in `plan` without handing over a command to run', () => {
    const run = openit(['plan', '--', 'javascript:alert(1)'], { OPENIT_OPEN_BIN: quietBin });
    expect(run.status).toBe(5);
    const parsed = JSON.parse(run.stdout) as Record<string, unknown>;
    expect(parsed).toMatchObject({ consent: 'refuse', command: null, argv: [] });
    expect(existsSync(quietLog)).toBe(false);
  });

  it('never emits -u file://, and never opens a javascript: link', () => {
    const run = openit(['--dry-run', 'javascript:alert(1)'], { OPENIT_OPEN_BIN: quietBin });
    expect(run.status).toBe(5);
    expect(existsSync(quietLog)).toBe(false);
  });
});

describe('a taught command handler', () => {
  const taught = mkdtempSync(join(tmpdir(), 'openit-taught-'));
  const witness = join(taught, 'it-ran');
  const notes = join(fixture.docs, 'taught-notes.txt');

  beforeAll(() => {
    writeFileSync(notes, 'hello\n');
    writeFileSync(join(fixture.config, 'config.json'), JSON.stringify({
      ...config,
      handlers: [{ ext: 'txt', kind: '', app: '', command: '/usr/bin/touch', args: [witness, '{target}'] }],
    }));
  });

  afterAll(() => {
    writeFileSync(join(fixture.config, 'config.json'), JSON.stringify(config));
  });

  it('asks for a typed word, and runs nothing when there is nobody to ask', () => {
    const run = openit([notes]);
    expect(run.status).toBe(3);
    expect(run.stderr).toContain('RUNS what you give it');
    expect(existsSync(witness)).toBe(false);
  });

  it('is not what "show it in Finder" runs', () => {
    // The whole point of --reveal is that it launches nothing. It used to launch this.
    const run = openit(['--reveal', notes]);
    expect(run.status).toBe(0);
    expect(existsSync(witness)).toBe(false);
    expect(readFileSync(argvLog, 'utf8')).toContain('-R');
  });
});

describe('the thing openit is for', () => {
  it('opens the newest of many near-identical names', () => {
    const run = openit(['--dry-run', 'latest', 'report']);
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('report.pdf');
  });

  it('finds a file by the folder it is in and its own name', () => {
    const run = openit(['--dry-run', 'the', 'cdai', 'readme']);
    expect(run.status).toBe(0);
    expect(run.stdout).toContain(join(fixture.root, 'cdai', 'README.md'));
  });

  it('opens a folder named in one word', () => {
    const run = openit(['--dry-run', 'almanac']);
    expect(run.status).toBe(0);
    expect(run.stdout).toContain(join(fixture.root, 'almanac'));
  });

  it('survives a name made entirely of things that usually break shells', () => {
    const run = openit(['--dry-run', join(fixture.docs, '-dashfile.txt')]);
    expect(run.status).toBe(0);
    expect(run.stdout).toContain("'--'");
  });
});
