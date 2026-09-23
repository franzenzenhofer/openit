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

/**
 * The structural test for "this app runs what you hand it", and the one field that actually
 * says so: CFBundleTypeRole.
 *
 * Declaring public.unix-executable or public.shell-script is NOT the signal - Sublime Text
 * declares both, because it opens a shell script to edit it, and an early version of this file
 * refused every `openit --with sublime` on that basis. Terminal.app declares the same types
 * with role Shell, and that word is the difference between displaying a file and executing it.
 */
const SHELL_ROLE = 'shell';

interface BundleInfo {
  readonly id: string;
  readonly runsWhatItOpens: boolean;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const hasShellRole = (info: Record<string, unknown>): boolean => {
  const types = info['CFBundleDocumentTypes'];
  if (!Array.isArray(types)) return false;
  return types.some((entry) => {
    if (!isRecord(entry)) return false;
    const role = entry['CFBundleTypeRole'];
    return typeof role === 'string' && role.toLowerCase() === SHELL_ROLE;
  });
};

/** One plutil spawn for the ONE chosen handler, never while ranking. */
const readInfo = (appPath: string): BundleInfo | null => {
  const plist = join(appPath, 'Contents', 'Info.plist');
  const result = spawnSync(PLUTIL, ['-convert', 'json', '-o', '-', '--', plist], {
    encoding: 'utf8', timeout: TIMEOUT_MS, maxBuffer: MAX_BUFFER,
  });
  if (result.status !== 0 || typeof result.stdout !== 'string') return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  const id = parsed['CFBundleIdentifier'];
  return {
    id: typeof id === 'string' ? id : '',
    runsWhatItOpens: hasShellRole(parsed),
  };
};

export const bundleIdOf = (appPath: string): string | null => {
  const id = readInfo(appPath)?.id ?? '';
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
 * nobody listed here is still a terminal. The id is read from the bundle when the caller does
 * not already carry one - the app index stores paths, not identities.
 */
export const handlerKind = (appPath: string, bundleId: string | null): HandlerKind => {
  const info = appPath === '' ? null : readInfo(appPath);
  const id = (bundleId ?? info?.id ?? '').toLowerCase();
  const listed = id === '' ? null : known(id);
  if (listed !== null) return listed;
  if (info === null) return 'unknown';
  return info.runsWhatItOpens ? 'terminal' : 'unknown';
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
