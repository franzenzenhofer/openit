import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { configFile } from '@franzenzenhofer/intent-core/paths';
import { describe, expect, it } from 'vitest';
import {
  allRoots, DEFAULT_DEPTH, emptyConfig, loadConfig, MAX_DEPTH, saveConfig,
} from '../src/config.js';
import { makeFixture } from './fixtures.js';

const fixture = makeFixture();

const write = (value: unknown): void => {
  writeFileSync(configFile(), typeof value === 'string' ? value : JSON.stringify(value));
};

describe('reading a config file that may be anything at all', () => {
  it('reads what it wrote', () => {
    const config = {
      ...emptyConfig(),
      roots: [{ path: fixture.root, depth: 2 }],
      docRoots: [{ path: fixture.docs, depth: 1 }],
      handlers: [{ ext: 'pdf', kind: '', app: 'Preview', command: '', args: [] }],
      history: true,
    };
    saveConfig(config);
    expect(loadConfig()).toMatchObject({
      roots: [{ path: fixture.root, depth: 2 }],
      history: true,
      handlers: [{ ext: 'pdf', app: 'Preview' }],
    });
  });

  it('falls back to an empty config rather than throwing on nonsense', () => {
    write('not json at all');
    expect(loadConfig().roots).toEqual([]);
    write([1, 2, 3]);
    expect(loadConfig().roots).toEqual([]);
    write({ roots: 'not an array' });
    expect(loadConfig().roots).toEqual([]);
  });

  it('drops a root that is not a root', () => {
    write({ roots: [{ path: fixture.root }, { path: '' }, 'nope', { depth: 3 }] });
    expect(loadConfig().roots).toEqual([{ path: fixture.root, depth: DEFAULT_DEPTH }]);
  });

  it('bounds a depth, because a depth of a million is a crawl of the whole disk', () => {
    write({ roots: [{ path: fixture.root, depth: 1_000_000 }] });
    expect(loadConfig().roots[0]?.depth).toBe(MAX_DEPTH);
    write({ roots: [{ path: fixture.root, depth: -4 }] });
    expect(loadConfig().roots[0]?.depth).toBe(1);
    write({ roots: [{ path: fixture.root, depth: 'deep' }] });
    expect(loadConfig().roots[0]?.depth).toBe(DEFAULT_DEPTH);
  });

  it('expands a root written with a tilde into the path it means', () => {
    write({ roots: [{ path: '~/dev', depth: 1 }] });
    expect(loadConfig().roots[0]?.path.startsWith('~')).toBe(false);
  });

  it('drops a handler rule that names nothing to open with', () => {
    write({ handlers: [{ ext: 'pdf' }, { app: 'Preview' }, { ext: 'md', app: 'Sublime Text' }] });
    expect(loadConfig().handlers).toEqual([
      { ext: 'md', kind: '', app: 'Sublime Text', command: '', args: [] },
    ]);
  });

  it('keeps the AI tier off when the file says off, and sane when the file is broken', () => {
    write({ ai: { enabled: false } });
    expect(loadConfig().ai.enabled).toBe(false);
    write({ ai: { timeoutMs: -1, command: '' } });
    expect(loadConfig().ai).toMatchObject({ enabled: true, command: 'auto', timeoutMs: 45_000 });
  });

  it('treats history as off unless it says true, because it is somebody\'s browsing', () => {
    write({ history: 'yes' });
    expect(loadConfig().history).toBe(false);
  });

  it('lists every place openit may answer with', () => {
    write({
      roots: [{ path: fixture.root, depth: 1 }],
      docRoots: [{ path: fixture.docs, depth: 1 }],
    });
    expect(allRoots(loadConfig())).toEqual([fixture.root, fixture.docs]);
  });

  it('has no roots at all before setup has run', () => {
    writeFileSync(join(fixture.config, 'config.json'), '');
    expect(loadConfig()).toMatchObject({ roots: [], docRoots: [] });
  });
});
