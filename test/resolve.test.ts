import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decideTargets, rankTargets } from '../src/match/resolve.js';
import { tokenize } from '../src/match/tokenize.js';
import { dirCandidates, looseTargets } from '../src/match/score-target.js';
import { THRESHOLD } from '../src/match/constants.js';
import type { Target } from '../src/target.js';

const HOME = '/Users/someone';
const DAY = 86_400_000;
const NOW = 1_800_000_000_000;

const file = (path: string, mtime = NOW): Target =>
  ({ kind: 'file', ref: path, name: path.split('/').at(-1) ?? path, mtime, source: 'doc-index' });

const dir = (path: string): Target =>
  ({ kind: 'dir', ref: path, name: path.split('/').at(-1) ?? path, mtime: 0, source: 'dir-index' });

const context = {
  cwd: join(HOME, 'dev'),
  frecency: new Map<string, number>(),
  nowMs: NOW,
};

const rank = (words: string, targets: readonly Target[]) =>
  rankTargets(tokenize(words), targets, context);

const decide = (words: string, targets: readonly Target[]) =>
  decideTargets(tokenize(words), rank(words, targets));

describe('ranking', () => {
  const targets = [
    dir(join(HOME, 'dev', 'cdai')),
    file(join(HOME, 'dev', 'cdai', 'README.md')),
    file(join(HOME, 'dev', 'almanac', 'README.md')),
    file(join(HOME, 'Downloads', 'report.pdf')),
  ];

  it('answers "the cdai readme" outright, with the readme and not the folder', () => {
    const decision = decide('the cdai readme', targets);
    expect(decision.kind).toBe('hit');
    expect(decision.kind === 'hit' ? decision.item.ref : '').toBe(join(HOME, 'dev', 'cdai', 'README.md'));
  });

  it('requires every token to match something, not just one of them', () => {
    expect(rank('cdai readme', [file(join(HOME, 'dev', 'other', 'README.md'))])).toEqual([]);
  });

  it('asks when two things match equally well', () => {
    const decision = decide('readme', targets);
    expect(decision.kind).toBe('choose');
  });

  it('treats a folder and its own child as one place, not two answers', () => {
    const nested = [dir(join(HOME, 'dev', 'cdai')), dir(join(HOME, 'dev', 'cdai', 'cdai'))];
    expect(rank('cdai', nested)).toHaveLength(1);
  });

  it('prefers the newer of two equally named files, without letting it win outright', () => {
    const old = file(join(HOME, 'Downloads', 'a', 'report.pdf'), NOW - 400 * DAY);
    const fresh = file(join(HOME, 'Downloads', 'b', 'report.pdf'), NOW);
    expect(rank('report', [old, fresh])[0]?.item.ref).toBe(fresh.ref);
  });

  it('lets what you actually open outrank what merely matches', () => {
    const rarely = file(join(HOME, 'Downloads', 'a', 'report.pdf'));
    const often = file(join(HOME, 'Downloads', 'b', 'report.pdf'));
    const frecency = new Map([[often.ref, 200]]);
    const ranked = rankTargets(tokenize('report'), [rarely, often], { ...context, frecency });
    expect(ranked[0]?.item.ref).toBe(often.ref);
  });

  it('never lets frecency beat a better name match', () => {
    const exact = file(join(HOME, 'Downloads', 'report.pdf'));
    const partial = file(join(HOME, 'Downloads', 'quarterly-report-final.pdf'));
    const frecency = new Map([[partial.ref, 5000]]);
    const ranked = rankTargets(tokenize('report'), [exact, partial], { ...context, frecency });
    expect(ranked[0]?.item.ref).toBe(exact.ref);
  });
});

describe('an order word', () => {
  const invoices = Array.from({ length: 20 }, (_, i) =>
    file(join(HOME, 'Downloads', `Rechnung-2025${String(i).padStart(4, '0')}.pdf`), NOW - i * DAY));

  it('decides outright across names no single one of which could win', () => {
    const decision = decide('last rechnung', invoices);
    expect(decision.kind).toBe('hit');
    expect(decision.kind === 'hit' ? decision.item.ref : '').toContain('Rechnung-20250000.pdf');
  });

  it('reads oldest as the other end of the same list', () => {
    const decision = decide('oldest rechnung', invoices);
    expect(decision.kind === 'hit' ? decision.item.ref : '').toContain('Rechnung-20250019.pdf');
  });

  it('still answers nothing when the name matched nothing', () => {
    expect(decide('last zzqq', invoices).kind).toBe('unsure');
  });
});

describe('filters', () => {
  const mixed = [
    file(join(HOME, 'Downloads', 'report.pdf')),
    file(join(HOME, 'Downloads', 'report.png')),
    dir(join(HOME, 'Downloads', 'report')),
  ];

  it('keeps only files of the kind that was named', () => {
    const ranked = rank('report pdf', mixed);
    expect(ranked.map((one) => one.item.ref)).toContain(join(HOME, 'Downloads', 'report.pdf'));
    expect(ranked.map((one) => one.item.ref)).not.toContain(join(HOME, 'Downloads', 'report.png'));
  });

  it('never excludes a folder for not being a file kind', () => {
    // The kind filter is about files. A folder called "pdf archive" is still an answer to
    // "pdf" - what it has to do, like everything else, is carry every word of the query.
    expect(rank('pdf', [dir(join(HOME, 'Downloads', 'pdf archive'))])).toHaveLength(1);
  });

  it('keeps only what the named kind of thing is', () => {
    expect(rank('report folder', mixed).every((one) => one.item.kind === 'dir')).toBe(true);
  });

  it('requires a year that was named to be in the name', () => {
    const ranked = rank('rechnung 2024', [
      file(join(HOME, 'Downloads', 'Rechnung-20240001.pdf')),
      file(join(HOME, 'Downloads', 'Rechnung-20250001.pdf')),
    ]);
    expect(ranked).toHaveLength(1);
  });
});

describe('the shortlists the later tiers get', () => {
  it('lists the children of a folder named by only part of the query', () => {
    const targets = [dir(join(HOME, 'dev', 'cdai')), dir(join(HOME, 'dev', 'almanac'))];
    expect(dirCandidates(tokenize('the cdai readme'), targets)).toEqual([join(HOME, 'dev', 'cdai')]);
  });

  it('offers a model something to look at when the strict matcher found nothing', () => {
    const targets = [file(join(HOME, 'Downloads', 'Quartalsbericht.pdf'))];
    expect(rank('quarterly report', targets)).toEqual([]);
    expect(looseTargets(tokenize('quartals'), targets)).toHaveLength(1);
  });

  it('keeps the thresholds that tell a hit from a question apart', () => {
    expect(THRESHOLD.hit).toBeGreaterThan(THRESHOLD.candidate);
    expect(THRESHOLD.gap).toBeGreaterThan(0);
  });
});
