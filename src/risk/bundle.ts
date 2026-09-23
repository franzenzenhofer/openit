import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const PLUTIL = '/usr/bin/plutil';
const TIMEOUT_MS = 3000;
const MAX_BUFFER = 1024 * 1024;

export type HandlerKind = 'default' | 'viewer' | 'editor' | 'browser' | 'terminal' | 'installer' | 'unknown';

/** A terminal turns any file into a script: `open -a Terminal notes.txt` executes it. */
const TERMINAL_IDS = new Set([
  'com.apple.terminal', 'com.googlecode.iterm2', 'com.mitchellh.ghostty',
  'net.kovidgoyal.kitty', 'io.alacritty', 'co.zeit.hyper', 'dev.warp.warp-stable',
  'com.github.wez.wezterm', 'org.tabby', 'com.apple.scripteditor2',
]);

const BROWSER_IDS = new Set([
  'com.apple.safari', 'com.google.chrome', 'com.google.chrome.canary', 'com.brave.browser',
  'org.mozilla.firefox', 'com.microsoft.edgemac', 'company.thebrowser.browser', 'org.chromium.chromium',
]);

const INSTALLER_IDS = new Set([
  'com.apple.installer', 'com.apple.diskimagemounter', 'com.apple.archiveutility',
]);

const EDITOR_IDS = new Set([
  'com.microsoft.vscode', 'com.sublimetext.4', 'com.sublimetext.3', 'com.apple.textedit',
  'dev.zed.zed', 'com.jetbrains.intellij', 'com.apple.dt.xcode', 'com.panic.nova',
]);

const VIEWER_IDS = new Set(['com.apple.preview', 'com.apple.quicktimeplayerx', 'org.videolan.vlc']);

/** Anything that claims to open an executable or a shell script IS a terminal, whatever it is called. */
const EXECUTABLE_TYPES = ['public.unix-executable', 'public.shell-script', 'public.executable'];

const declaredTypes = (appPath: string): string => {
  const plist = join(appPath, 'Contents', 'Info.plist');
  const result = spawnSync(PLUTIL, ['-convert', 'json', '-o', '-', '--', plist], {
    encoding: 'utf8', timeout: TIMEOUT_MS, maxBuffer: MAX_BUFFER,
  });
  return result.status === 0 && typeof result.stdout === 'string' ? result.stdout : '';
};

export const bundleIdOf = (appPath: string): string | null => {
  const plist = join(appPath, 'Contents', 'Info.plist');
  const result = spawnSync(PLUTIL, ['-extract', 'CFBundleIdentifier', 'raw', '-o', '-', '--', plist], {
    encoding: 'utf8', timeout: TIMEOUT_MS, maxBuffer: MAX_BUFFER,
  });
  if (result.status !== 0 || typeof result.stdout !== 'string') return null;
  const id = result.stdout.trim();
  return id === '' ? null : id;
};

const known = (id: string): HandlerKind | null => {
  if (TERMINAL_IDS.has(id)) return 'terminal';
  if (BROWSER_IDS.has(id)) return 'browser';
  if (INSTALLER_IDS.has(id)) return 'installer';
  if (EDITOR_IDS.has(id)) return 'editor';
  return VIEWER_IDS.has(id) ? 'viewer' : null;
};

/**
 * Detected two ways, both required: a known bundle id, and structurally, because a terminal
 * nobody listed here is still a terminal.
 */
export const handlerKind = (appPath: string, bundleId: string | null): HandlerKind => {
  const id = (bundleId ?? '').toLowerCase();
  const listed = id === '' ? null : known(id);
  if (listed !== null) return listed;
  if (appPath === '') return 'unknown';
  const types = declaredTypes(appPath);
  return EXECUTABLE_TYPES.some((type) => types.includes(type)) ? 'terminal' : 'unknown';
};

/** Reads the LaunchServices handler map without depending on duti being installed. */
export const launchServicesHandlers = (): string => {
  const plist = join(
    process.env['HOME'] ?? '', 'Library', 'Preferences', 'com.apple.LaunchServices',
    'com.apple.launchservices.secure.plist',
  );
  try {
    readFileSync(plist);
  } catch {
    return '';
  }
  const result = spawnSync(PLUTIL, ['-convert', 'json', '-o', '-', '--', plist], {
    encoding: 'utf8', timeout: TIMEOUT_MS, maxBuffer: MAX_BUFFER,
  });
  return result.status === 0 && typeof result.stdout === 'string' ? result.stdout : '';
};
