import { describe, expect, it } from 'vitest';
import { readings, resolveIn, tokenize } from '../src/match/tokenize.js';
import { kindOfWord, matchesKind, targetKindWord } from '../src/match/kinds.js';

const never = (): boolean => false;
const always = (): boolean => true;

describe('the words a person types', () => {
  it('keeps the search terms and drops the filler', () => {
    expect(tokenize('open the report please').tokens).toEqual(['report']);
  });

  it('never lets filler erase the whole query', () => {
    // A folder really can be called "the open one"; removing every word answers nothing.
    expect(tokenize('open it').tokens).toEqual(['open', 'it']);
  });

  it('reads `with <app>` as a handler, always', () => {
    const query = tokenize('report with preview');
    expect(query).toMatchObject({ tokens: ['report'], withWord: 'preview', handlerExplicit: true });
  });

  it('reads `in <x>` as neither a place nor an app until it is asked', () => {
    expect(tokenize('report in dev')).toMatchObject({ inWord: 'dev', scope: null });
  });

  it('takes an order word out of the search terms', () => {
    expect(tokenize('latest screenshot')).toMatchObject({ order: 'latest', tokens: ['screenshot'] });
    expect(tokenize('last rechnung')).toMatchObject({ order: 'latest', tokens: ['rechnung'] });
    expect(tokenize('oldest invoice')).toMatchObject({ order: 'oldest' });
  });

  it('takes a year out of the search terms and keeps it as a requirement', () => {
    expect(tokenize('rechnung 2025')).toMatchObject({ years: ['2025'], tokens: ['rechnung'] });
  });

  it('reads the flags that are words', () => {
    expect(tokenize('new terminal window')).toMatchObject({ newInstance: true });
    expect(tokenize('open the deck in background')).toMatchObject({ background: true });
  });
});

describe('revealing rather than opening', () => {
  it('reads "in finder" as do not open it', () => {
    expect(tokenize('show report in finder')).toMatchObject({ reveal: true, tokens: ['report'] });
  });

  it('reads a bare reveal word too', () => {
    expect(tokenize('reveal report')).toMatchObject({ reveal: true, tokens: ['report'] });
  });

  it('does not read "show me the report" as revealing it', () => {
    expect(tokenize('show me the report')).toMatchObject({ reveal: false, tokens: ['report'] });
  });

  it('never lets "finder" be mistaken for a place to search in', () => {
    expect(tokenize('report in finder').inWord).toBeNull();
  });
});

describe('`in <x>` against reality', () => {
  const query = tokenize('readme in cdai');

  it('means a place when something really is called that', () => {
    expect(resolveIn(query, always, never)).toMatchObject({ scope: 'cdai', handlerWord: null });
  });

  it('means an app when no place is called that and an app is', () => {
    expect(resolveIn(query, never, always))
      .toMatchObject({ handlerWord: 'cdai', handlerExplicit: true });
  });

  it('falls back to a place when it is neither, so the words still narrow the search', () => {
    expect(resolveIn(query, never, never)).toMatchObject({ scope: 'cdai' });
  });

  it('never overrides a handler the user named outright', () => {
    const named = tokenize('readme in cdai with preview');
    expect(resolveIn(named, never, always).handlerWord).toBe('preview');
  });
});

describe('kinds', () => {
  it('names only formats, never subjects', () => {
    expect(kindOfWord('pdf')).toBe('pdf');
    expect(kindOfWord('screenshot')).toBe('screenshot');
    // 2045 files on this machine are named Rechnung-*.pdf: it is the query, not a filter.
    expect(kindOfWord('rechnung')).toBeUndefined();
    expect(kindOfWord('invoice')).toBeUndefined();
    expect(kindOfWord('bill')).toBeUndefined();
  });

  it('keeps a kind word as a search term as well as a filter', () => {
    // ...which is what lets `openit pages` still open Pages.app, and `openit pdf` find a
    // folder called pdf while still preferring actual PDFs.
    expect(tokenize('pdf')).toMatchObject({ kinds: ['pdf'], tokens: ['pdf'] });
    expect(tokenize('pages').tokens).toEqual(['pages']);
  });

  it('knows a screenshot by the name macOS gives it', () => {
    expect(matchesKind('/Users/f/Desktop/Screenshot 2026-09-07 at 21.58.04.png', 'screenshot')).toBe(true);
    expect(matchesKind('/Users/f/Desktop/cat.png', 'screenshot')).toBe(false);
    expect(matchesKind('/Users/f/Desktop/cat.png', 'image')).toBe(true);
  });

  it('reads the words that name a kind of thing rather than a format', () => {
    expect(targetKindWord('folder')).toBe('dir');
    expect(targetKindWord('app')).toBe('app');
    expect(targetKindWord('bookmark')).toBe('url');
  });
});

describe('the readings of one query', () => {
  it('tries what was typed first', () => {
    expect(readings(tokenize('veganblatt.at'))[0]?.tokens).toEqual(['veganblatt.at']);
  });

  it('then reads a URL as the names it carries', () => {
    const all = readings(tokenize('https://www.veganblatt.at/rezepte'));
    expect(all.some((one) => one.tokens.includes('veganblatt'))).toBe(true);
  });

  it('reads a spelled path as its name, with the folders above it required', () => {
    const all = readings(tokenize('dev/cdai/README.md'));
    const spelled = all.find((one) => one.within.length > 0);
    expect(spelled?.tokens).toContain('readme');
    expect(spelled?.within).toContain('cdai');
  });
});
