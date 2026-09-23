import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { classifyPath } from '../src/risk/classify.js';
import { makeFixture } from './fixtures.js';

const fixture = makeFixture();
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const CLI = join(ROOT, 'dist', 'openit.js');
const SHIMS = join(ROOT, 'test', 'shims');

const RUNS = 10;
/** A launcher is a reflex. Anything a person can feel is a bug in the hot path. */
const PLAN_MEDIAN_MS = 150;
const PLAN_P95_MS = 250;
/** The same work plus the spawn of the opener itself. */
const OPEN_MEDIAN_MS = 200;
const OPEN_P95_MS = 350;
const LARGE_INDEX_ENTRIES = 50_000;
/**
 * CPU time, not wall clock: this gate exists to catch an accidental per-candidate xattr or
 * mdls call, and one of those is 1.4ms. Times fifty thousand candidates that is seventy
 * seconds, which this turns into a red build rather than a shipped hang.
 *
 * The cap is deliberately far above the real cost - 723ms on the machine openit was written
 * on, 1020ms on a shared CI runner, which failed a 1000ms line at 2% over while telling nobody
 * anything. This guards against an order-of-magnitude regression, not against runner variance,
 * and 70 seconds is still fourteen times past it.
 */
const LARGE_CLASSIFY_BUDGET_MS = 5000;

const opener = mkdtempSync(join(tmpdir(), 'openit-latency-'));
const openBin = join(opener, 'open-ok.sh');

beforeAll(() => {
  expect(spawnSync('node', [join(ROOT, 'scripts', 'build.mjs')], { encoding: 'utf8' }).status).toBe(0);
  copyFileSync(join(SHIMS, 'open-ok.sh'), openBin);
  // A big, plausible tree: many near-identical names is openit's actual worst case.
  const many = join(fixture.docs, 'many');
  mkdirSync(many, { recursive: true });
  for (let i = 0; i < 500; i += 1) {
    writeFileSync(join(many, `Rechnung-2025${String(i).padStart(4, '0')}.pdf`), '%PDF\n');
  }
  writeFileSync(join(fixture.config, 'config.json'), JSON.stringify({
    roots: [{ path: fixture.root, depth: 3 }],
    docRoots: [{ path: fixture.docs, depth: 2 }],
    ignore: ['node_modules'], handlers: [], history: false,
    ai: { enabled: false, command: 'auto', args: [], model: '', timeoutMs: 1000 },
  }));
});

const run = (args: readonly string[]): number => {
  const started = Date.now();
  const result = spawnSync('node', [CLI, ...args], {
    encoding: 'utf8',
    cwd: fixture.home,
    env: {
      PATH: process.env['PATH'] ?? '/usr/bin:/bin',
      HOME: fixture.home,
      OPENIT_CONFIG_DIR: fixture.config,
      OPENIT_DATA_DIR: fixture.data,
      OPENIT_OPEN_BIN: openBin,
    },
  });
  expect(result.status).toBe(0);
  return Date.now() - started;
};

const percentile = (values: readonly number[], share: number): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * share) - 1)] ?? Number.POSITIVE_INFINITY;
};

const timings = (args: readonly string[]): number[] => {
  run(args); // once to warm the index, which is what a second query would find
  return Array.from({ length: RUNS }, () => run(args));
};

const elapsedCpuMs = (started: ReturnType<typeof process.cpuUsage>): number => {
  const elapsed = process.cpuUsage(started);
  return (elapsed.user + elapsed.system) / 1000;
};

describe('latency', () => {
  it('decides in well under the time a person can feel', () => {
    const measured = timings(['plan', '--', 'latest', 'rechnung']);
    expect(percentile(measured, 0.5)).toBeLessThan(PLAN_MEDIAN_MS);
    expect(percentile(measured, 0.95)).toBeLessThan(PLAN_P95_MS);
  }, 60_000);

  it('decides and launches in well under the time a person can feel', () => {
    const measured = timings([join(fixture.docs, 'report.pdf')]);
    expect(percentile(measured, 0.5)).toBeLessThan(OPEN_MEDIAN_MS);
    expect(percentile(measured, 0.95)).toBeLessThan(OPEN_P95_MS);
  }, 60_000);

  it('classifies a fifty thousand entry index without ever spawning anything per candidate', () => {
    const paths = Array.from(
      { length: LARGE_INDEX_ENTRIES },
      (_, i) => join(fixture.docs, 'many', `Rechnung-2025${String(i).padStart(4, '0')}.pdf`),
    );
    const started = process.cpuUsage();
    for (const path of paths) classifyPath(path, [fixture.docs]);
    expect(elapsedCpuMs(started)).toBeLessThan(LARGE_CLASSIFY_BUDGET_MS);
  }, 60_000);
});
