import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { stateFile } from '@franzenzenhofer/intent-core/paths';
import { describe, expect, it } from 'vitest';
import {
  buildQuery, indexedRoots, probeRoot, quoteQueryValue, spotlightCoverage, spotlightTargets,
} from '../src/store/spotlight.js';
import { makeFixture } from './fixtures.js';

const fixture = makeFixture();

describe('mdfind query building', () => {
  it('requires every token to be in the file name, never in its contents', () => {
    expect(buildQuery(['rechnung', '2025']))
      .toBe('(kMDItemFSName == "*rechnung*"cd) && (kMDItemFSName == "*2025*"cd)');
  });

  it('escapes the quote that would otherwise end the literal', () => {
    expect(quoteQueryValue('say "hi"')).toBe('say \\"hi\\"');
    expect(buildQuery(['a"b'])).toBe('(kMDItemFSName == "*a\\"b*"cd)');
  });

  it('escapes the backslash before the quote, so the escape cannot be escaped', () => {
    expect(quoteQueryValue('a\\"b')).toBe('a\\\\\\"b');
  });

  it('drops tokens too short or too long to be worth a Spotlight round trip', () => {
    expect(buildQuery(['a'])).toBeNull();
    expect(buildQuery(['x'.repeat(65)])).toBeNull();
  });

  it('drops tokens carrying control or formatting characters', () => {
    expect(buildQuery(['re‮chnung'])).toBeNull();
    expect(buildQuery(['bad\u0000name'])).toBeNull();
  });

  it('has nothing to ask when no token survives', () => {
    expect(buildQuery([])).toBeNull();
  });
});

describe('capability probe', () => {
  it('reports a temp tree as unindexed rather than pretending to cover it', () => {
    // Real /usr/bin/mdfind against a real directory: a just-made temp tree is never indexed.
    expect(probeRoot(fixture.docs)).toBe(false);
  });

  it('says false for a directory that is not there', () => {
    expect(probeRoot(join(fixture.home, 'nope'))).toBe(false);
  });

  it('remembers what it probed, so the cost is once a day and not once a query', () => {
    const file = stateFile('spotlight.json');
    if (existsSync(file)) writeFileSync(file, '');
    expect(spotlightCoverage([fixture.docs])).toEqual([{ root: fixture.docs, indexed: false }]);
    const cached = JSON.parse(readFileSync(file, 'utf8')) as { roots: Record<string, boolean> };
    expect(cached.roots[fixture.docs]).toBe(false);
  });

  it('only searches roots it has proven it can search', () => {
    expect(indexedRoots([fixture.docs, fixture.root])).toEqual([]);
  });
});

describe('spotlightTargets', () => {
  it('answers nothing, rather than everything, for an unindexed root', () => {
    expect(spotlightTargets(['report'], [fixture.docs])).toEqual([]);
  });

  it('never runs at all when the query has no usable token', () => {
    expect(spotlightTargets(['a'], [fixture.docs])).toEqual([]);
  });
});
