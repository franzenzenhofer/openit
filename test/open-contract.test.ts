import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { OPEN_FRAGMENTS } from '../src/act/errors.js';
import { makeFixture } from './fixtures.js';

const fixture = makeFixture();
const OPEN = '/usr/bin/open';
const TIMEOUT_MS = 10_000;

/**
 * The real /usr/bin/open, with inputs that can only fail.
 *
 * openit tells one failure from another by matching fragments of open(1)'s own prose, and that
 * prose is OS-version dependent. This is where the fragments are pinned to the real thing, so
 * an OS upgrade that rewords them fails the build instead of quietly degrading every error
 * message to "something went wrong".
 *
 * Nothing here can launch anything: every case names something that does not exist.
 */
const failing = (args: readonly string[]): { status: number | null; stderr: string } => {
  const result = spawnSync(OPEN, args, { encoding: 'utf8', timeout: TIMEOUT_MS });
  return { status: result.status, stderr: result.stderr ?? '' };
};

const fragment = (failure: string): string =>
  OPEN_FRAGMENTS.find(([, kind]) => kind === failure)?.[0] ?? '';

describe('the contract with the real open(1)', () => {
  it('exits 1 and says so when the file is not there', () => {
    const result = failing(['--', join(fixture.docs, 'definitely-not-here.pdf')]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(fragment('missing-target'));
  });

  it('says so when no installed app claims a bundle id', () => {
    const result = failing(['-b', 'com.example.definitely.not.installed', '--', join(fixture.docs, 'report.pdf')]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(fragment('unknown-bundle-id'));
  });

  it('says so when an app is named and not found - the case openit never produces', () => {
    const result = failing(['-a', 'No Such Application At All', '--', join(fixture.docs, 'report.pdf')]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(fragment('unknown-app'));
  });

  it('says so when nothing on this Mac handles a scheme', () => {
    const result = failing(['-u', 'openit-nonexistent-scheme://nothing']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(fragment('no-scheme-handler'));
  });

  it('reports every one of these failures as the same exit code, which is why the prose matters', () => {
    const statuses = [
      failing(['--', join(fixture.docs, 'definitely-not-here.pdf')]).status,
      failing(['-b', 'com.example.nope', '--', join(fixture.docs, 'report.pdf')]).status,
    ];
    expect(new Set(statuses)).toEqual(new Set([1]));
  });
});
