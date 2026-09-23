import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { stateFile } from '@franzenzenhofer/intent-core/paths';
import { describe, expect, it } from 'vitest';
import { forget, memories, readRemembered, recall, remember } from '../src/store/memory.js';
import { makeFixture } from './fixtures.js';

const fixture = makeFixture();
const report = join(fixture.docs, 'report.pdf');

describe('what may be remembered', () => {
  it('keeps the thing AND the app, which is what makes a remembered answer reproduce', () => {
    remember('the quarterly report', { kind: 'file', ref: report, handler: '/Applications/Preview.app' });
    expect(recall('the quarterly report')?.value)
      .toEqual({ kind: 'file', ref: report, handler: '/Applications/Preview.app' });
  });

  it('finds the same answer however the words were spaced or capitalised', () => {
    expect(recall('  The   Quarterly Report ')?.value.ref).toBe(report);
  });

  it('forgets on request, and says so when there was nothing to forget', () => {
    remember('throwaway', { kind: 'url', ref: 'https://a.test/', handler: null });
    expect(forget('throwaway')).toBe(true);
    expect(forget('throwaway')).toBe(false);
    expect(recall('throwaway')).toBeUndefined();
  });

  it('refuses a value that is not an action openit could carry out', () => {
    expect(readRemembered({ kind: 'file', ref: 'relative/path', handler: null })).toBeUndefined();
    expect(readRemembered({ kind: 'nonsense', ref: '/a', handler: null })).toBeUndefined();
    expect(readRemembered({ kind: 'file', ref: '/a', handler: 'Preview' })).toBeUndefined();
    expect(readRemembered({ kind: 'file' })).toBeUndefined();
    expect(readRemembered('/etc/passwd')).toBeUndefined();
  });

  it('accepts a URL value without demanding a leading slash', () => {
    expect(readRemembered({ kind: 'url', ref: 'https://a.test/x', handler: null }))
      .toEqual({ kind: 'url', ref: 'https://a.test/x', handler: null });
  });

  it('drops an entry the file has grown that is not an action, rather than trusting it', () => {
    const file = stateFile('aliases.json');
    const stored = JSON.parse(readFileSync(file, 'utf8')) as { version: number; aliases: unknown[] };
    writeFileSync(file, JSON.stringify({
      version: stored.version,
      aliases: [
        ...stored.aliases,
        { query: 'poisoned', value: { kind: 'file', ref: 'sudo rm -rf /' }, updatedAt: 1 },
      ],
    }));
    expect(memories().some((alias) => alias.query === 'poisoned')).toBe(false);
    expect(recall('the quarterly report')?.value.ref).toBe(report);
  });
});
