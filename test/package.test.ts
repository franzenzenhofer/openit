import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import packageJson from '../package.json' with { type: 'json' };

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const home = mkdtempSync(join(tmpdir(), 'openit-pack-'));

/** npm 11 reports the packed tarballs as an array, npm 12 as an object keyed by package name. */
const packedFilename = (stdout: string): string => {
  const parsed = JSON.parse(stdout) as unknown;
  const packed = (Array.isArray(parsed) ? parsed : Object.values(parsed as object)) as unknown[];
  const first = packed[0];
  const filename = typeof first === 'object' && first !== null && 'filename' in first
    ? (first as { filename: unknown }).filename
    : undefined;
  expect(typeof filename).toBe('string');
  return filename as string;
};

let archive = '';
let installedBin = '';

beforeAll(() => {
  expect(spawnSync('node', [join(ROOT, 'scripts', 'build.mjs')], { encoding: 'utf8' }).status).toBe(0);
  const packed = spawnSync('npm', ['pack', '--json', '--pack-destination', home], {
    cwd: ROOT, encoding: 'utf8',
  });
  expect(packed.status).toBe(0);
  archive = join(home, packedFilename(packed.stdout));
  const prefix = join(home, 'installed');
  mkdirSync(prefix);
  const installed = spawnSync(
    'npm',
    ['install', '--prefix', prefix, '--ignore-scripts', '--no-audit', '--no-fund', archive],
    { encoding: 'utf8' },
  );
  expect(installed.status).toBe(0);
  installedBin = join(prefix, 'node_modules', 'openit', 'dist', 'openit.js');
}, 120_000);

describe('the thing that actually gets installed', () => {
  it('runs from the packed tarball and reports the release version', () => {
    const version = spawnSync('node', [installedBin, '--version'], { encoding: 'utf8' });
    expect(version.status).toBe(0);
    // stdout is the machine channel; even the version is a message, so it goes to stderr.
    expect(version.stdout).toBe('');
    expect(version.stderr.trim()).toBe(`openit ${packageJson.version}`);
  });

  it('is one file with no runtime dependencies', () => {
    const listing = spawnSync('tar', ['-tzf', archive], { encoding: 'utf8' });
    expect(listing.status).toBe(0);
    expect(listing.stdout).toContain('package/dist/openit.js');
    expect(listing.stdout).toContain('package/README.md');
    expect(listing.stdout).toContain('package/LICENSE');
    expect(listing.stdout).not.toContain('package/src/');
    expect(listing.stdout).not.toContain('package/test/');
    expect(Object.hasOwn(packageJson, 'dependencies')).toBe(false);
  });

  it('declares itself for macOS and a Node it can rely on', () => {
    expect(packageJson.os).toEqual(['darwin']);
    expect(packageJson.engines.node).toBe('>=20');
  });
});
