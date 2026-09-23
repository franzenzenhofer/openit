import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { classifyScheme, parseUrl, urlShape } from '../src/risk/scheme.js';
import { locatorUrl } from '../src/risk/locator.js';
import { parseQuarantine, readQuarantine } from '../src/risk/quarantine.js';
import { assess } from '../src/risk/assess.js';
import { verifyWord } from '../src/risk/verify-word.js';
import { makeFixture, quarantine } from './fixtures.js';
import type { Target } from '../src/target.js';

const fixture = makeFixture();

const url = (ref: string): Target => ({ kind: 'url', ref, name: ref, mtime: 0, source: 'literal' });
const path = (ref: string): Target =>
  ({ kind: 'file', ref, name: ref.split('/').at(-1) ?? ref, mtime: 0, source: 'literal' });

const judge = (target: Target, origin: 'literal' | 'deterministic' | 'ai' = 'literal') =>
  assess({
    target,
    handler: { kind: 'default' },
    origin,
    roots: [fixture.docs, fixture.root],
    reveal: false,
    handlerFromAi: false,
  });

describe('schemes', () => {
  it('sorts every scheme into what opening it can do', () => {
    expect(classifyScheme('https')).toBe('web');
    expect(classifyScheme('MAILTO')).toBe('message');
    expect(classifyScheme('x-apple-helpbasic')).toBe('apple');
    expect(classifyScheme('shortcuts')).toBe('custom');
    expect(classifyScheme('javascript')).toBe('forbidden');
    expect(classifyScheme('file')).toBe('file');
  });

  it('refuses a javascript: link from every origin, including one you typed', () => {
    for (const origin of ['literal', 'deterministic', 'ai'] as const) {
      expect(judge(url('javascript:alert(1)'), origin).consent).toBe('refuse');
    }
  });

  it('refuses a URL carrying a user name and password', () => {
    expect(judge(url('https://user:pw@example.com/')).consent).toBe('refuse');
  });

  it('asks a typed word before any other app-registered scheme', () => {
    expect(judge(url('shortcuts://run-shortcut?name=pwn')).consent).toBe('verify');
  });

  it('refuses text that is not a URL at all rather than guessing at it', () => {
    expect(parseUrl('not a url')).toBeNull();
    expect(parseUrl('https://example.com/\nHost: evil')).toBeNull();
  });

  it('tells a model the host and the first segment, and nothing else', () => {
    const parsed = parseUrl('https://github.com/octocat/secret?token=abc#frag');
    expect(parsed === null ? null : urlShape(parsed.url)).toEqual({ site: 'github.com', route: '/octocat' });
  });
});

describe('a locator is judged twice', () => {
  it('reads the URL out of a .webloc and takes the stricter of the two answers', () => {
    const bookmark = join(fixture.docs, 'bookmark.webloc');
    expect(locatorUrl(bookmark)).toBe('https://example.com/a');
    const judged = judge(path(bookmark));
    expect(judged.redirect?.klass).toBe('web');
    // The file itself is a locator, which is `confirm`; the web page it points at is `allow`.
    expect(judged.consent).toBe('confirm');
  });

  it('follows a .inetloc into the scheme it really opens', () => {
    const evil = join(fixture.docs, 'evil.inetloc');
    expect(locatorUrl(evil)).toBe('shortcuts://run-shortcut?name=pwn');
    expect(judge(path(evil)).consent).toBe('verify');
  });

  it('says nothing about a file that is not a locator', () => {
    expect(locatorUrl(join(fixture.docs, 'report.pdf'))).toBeNull();
  });
});

describe('quarantine', () => {
  it('reads the attribute a browser really wrote, through the real xattr(1)', () => {
    const file = join(fixture.docs, 'space doc with spaces.md');
    expect(quarantine(file, '0083;68000000;Safari;ABC')).toBe(true);
    expect(readQuarantine(file)).toMatchObject({ agent: 'Safari', userApproved: false });
  });

  it('reads who put it there and when', () => {
    const parsed = parseQuarantine('0083;68000000;Google Chrome;ABC');
    expect(parsed).toMatchObject({ agent: 'Google Chrome', userApproved: false });
    expect(parsed?.at).toBeGreaterThan(0);
  });

  it('knows the bit LaunchServices sets once a person has said yes to this exact file', () => {
    expect(parseQuarantine('00c3;68000000;Safari;ABC')?.userApproved).toBe(true);
  });

  it('says nothing for a file that carries no attribute at all', () => {
    expect(readQuarantine(join(fixture.docs, 'report.pdf'))).toBeNull();
    expect(parseQuarantine('')).toBeNull();
    expect(parseQuarantine('not;hex;at;all')).toBeNull();
  });

  it('asks once more about a quarantined document, and refuses a quarantined app', () => {
    const doc = join(fixture.docs, 'report.pdf');
    expect(quarantine(doc)).toBe(true);
    expect(judge(path(doc)).consent).toBe('confirm');
    const app = join(fixture.docs, 'Fake.app');
    expect(quarantine(app)).toBe(true);
    expect(judge(path(app)).consent).toBe('refuse');
  });
});

describe('the word a verify prompt asks for', () => {
  it('comes from the class, never from the name', () => {
    expect(verifyWord('application', '')).toBe('application');
    expect(verifyWord('installer', '')).toBe('installer');
    expect(verifyWord('script', '')).toBe('script');
    expect(verifyWord('unknown', 'shortcuts')).toBe('shortcuts');
    expect(verifyWord('document', '')).toBe('open');
  });

  it('is "run" whenever the handler is the thing that runs it', () => {
    expect(verifyWord('document', '', true)).toBe('run');
    expect(verifyWord('application', '', true)).toBe('run');
  });
});
