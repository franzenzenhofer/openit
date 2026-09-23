import { beforeAll, describe, expect, it } from 'vitest';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { makeFixture, quarantine, type Fixture } from './fixtures.js';
import { classifyPath, extensionOf, readMagic } from '../src/risk/classify.js';
import { parseQuarantine, readQuarantine } from '../src/risk/quarantine.js';
import { classifyScheme, parseUrl, urlShape } from '../src/risk/scheme.js';
import { verifyWord } from '../src/risk/verify-word.js';

let fixture: Fixture;
const classOf = (path: string): string => classifyPath(path, [fixture.root, fixture.docs]).klass;

beforeAll(() => {
  fixture = makeFixture();
});

describe('classifyPath', () => {
  it('calls inert things inert', () => {
    expect(classOf(join(fixture.docs, 'report.pdf'))).toBe('document');
    expect(classOf(join(fixture.docs, 'photo.jpg'))).toBe('document');
    expect(classOf(join(fixture.root, 'cdai'))).toBe('directory');
    expect(classOf(join(fixture.root, 'cdai', 'README.md'))).toBe('document');
  });

  it('treats a directory holding Contents/MacOS as an application, extension or not', () => {
    expect(classOf(join(fixture.docs, 'Fake.app'))).toBe('application');
    expect(classOf(join(fixture.docs, 'NotDotApp'))).toBe('application');
  });

  it('does not believe a name: a FILE called x.app is not an application', () => {
    expect(classOf(join(fixture.docs, 'x.app'))).not.toBe('application');
  });

  it('believes the bytes: a Mach-O with no extension is an executable', () => {
    expect(readMagic(join(fixture.docs, 'bin-nodot'))).toBe('macho');
    expect(classOf(join(fixture.docs, 'bin-nodot'))).toBe('executable');
  });

  it('believes a shebang over an extension', () => {
    expect(readMagic(join(fixture.docs, 'tool'))).toBe('shebang');
    expect(classOf(join(fixture.docs, 'tool'))).toBe('script');
    expect(classOf(join(fixture.docs, 'deploy.sh'))).toBe('script');
    expect(classOf(join(fixture.docs, 'run.command'))).toBe('script');
  });

  it('knows installers, packages and locators', () => {
    expect(classOf(join(fixture.docs, 'install.pkg'))).toBe('installer');
    expect(classOf(join(fixture.docs, 'disk.dmg'))).toBe('installer');
    expect(classOf(join(fixture.docs, 'Thing.workflow'))).toBe('bundle');
    expect(classOf(join(fixture.docs, 'bookmark.webloc'))).toBe('locator');
    expect(classOf(join(fixture.docs, 'evil.inetloc'))).toBe('locator');
  });

  it('notices a symlink that leaves every configured root', () => {
    const facts = classifyPath(join(fixture.docs, 'link-out'), [fixture.root, fixture.docs]);
    expect(facts.isSymlink).toBe(true);
    expect(facts.escapesRoots).toBe(true);
    expect(facts.klass).toBe('application');
  });

  it('reports a path that is not there instead of throwing', () => {
    const facts = classifyPath(join(fixture.docs, 'nope.pdf'), [fixture.docs]);
    expect(facts.exists).toBe(false);
    expect(facts.klass).toBe('unknown');
  });

  it('reads an extension out of an adversarial name without believing it', () => {
    expect(extensionOf('invoice‮gpj.txt')).toBe('txt');
    expect(extensionOf('no-extension')).toBe('');
  });
});

describe('quarantine', () => {
  it('reads a real attribute written by the real xattr', () => {
    const path = join(fixture.docs, 'report.pdf');
    expect(quarantine(path)).toBe(true);
    const found = readQuarantine(path);
    expect(found?.agent).toBe('Google Chrome');
    expect(found?.userApproved).toBe(false);
  });

  it('is null when there is none, and null rather than a throw on garbage', () => {
    expect(readQuarantine(join(fixture.docs, 'photo.jpg'))).toBeNull();
    expect(parseQuarantine('not;a;quarantine')).toBeNull();
    expect(parseQuarantine('')).toBeNull();
  });

  it('sees the approved bit', () => {
    expect(parseQuarantine('00c3;68000000;Safari;ABC')?.userApproved).toBe(true);
  });
});

describe('schemes', () => {
  it('sorts every scheme that matters', () => {
    expect(classifyScheme('https')).toBe('web');
    expect(classifyScheme('mailto')).toBe('message');
    expect(classifyScheme('x-apple-reminderkit')).toBe('apple');
    expect(classifyScheme('shortcuts')).toBe('custom');
    expect(classifyScheme('file')).toBe('file');
    for (const bad of ['javascript', 'data', 'vbscript', 'about']) {
      expect(classifyScheme(bad)).toBe('forbidden');
    }
  });

  it('refuses a URL carrying credentials, and one carrying a newline', () => {
    expect(parseUrl('https://user:pass@example.com/')?.hasUserInfo).toBe(true);
    expect(parseUrl('https://example.com/\nx')).toBeNull();
    expect(parseUrl('not a url')).toBeNull();
  });

  it('reduces a link to a host and one path segment', () => {
    const parsed = parseUrl('https://github.com/octocat/tidewheel?token=secret#frag');
    expect(urlShape(parsed!.url)).toEqual({ site: 'github.com', route: '/octocat' });
  });
});

describe('verifyWord', () => {
  it('is derived from the structural class, never from the name', () => {
    expect(verifyWord('application', '')).toBe('application');
    expect(verifyWord('installer', '')).toBe('installer');
    expect(verifyWord('script', '')).toBe('script');
    expect(verifyWord('document', 'shortcuts')).toBe('shortcuts');
  });

describe('a directory that is not a folder', () => {
  it('reads a .mpkg, a .sparsebundle and a .scptd as what they really are', () => {
    // All three are directories on disk. Opening one mounts or installs or runs something,
    // and reading the extension only for files let every one of them through as a folder.
    for (const [name, klass] of [
      ['Suite.mpkg', 'installer'],
      ['Thing.sparsebundle', 'installer'],
      ['Script.scptd', 'script'],
    ] as const) {
      mkdirSync(join(fixture.docs, name), { recursive: true });
      expect(classifyPath(join(fixture.docs, name), [fixture.docs]).klass).toBe(klass);
    }
  });

  it('still reads an ordinary folder as a folder', () => {
    expect(classifyPath(fixture.root, [fixture.root]).klass).toBe('directory');
  });
});
});
