import { closeSync, lstatSync, openSync, readSync, statSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { isUnderRoot, realPathOr } from '@franzenzenhofer/intent-core/paths';
import {
  BUNDLE_EXTENSIONS, CODE_EXTENSIONS, DOCUMENT_EXTENSIONS, EXECUTABLE_EXTENSIONS,
  INSTALLER_EXTENSIONS, LOCATOR_EXTENSIONS, MACHO_MAGIC, SCRIPT_EXTENSIONS, type TargetClass,
} from './classes.js';

export type Magic = 'macho' | 'shebang' | 'zip' | 'none';

export interface TargetFacts {
  readonly path: string;
  readonly realPath: string;
  readonly klass: TargetClass;
  readonly exists: boolean;
  readonly isSymlink: boolean;
  /** The link points somewhere no configured root covers. */
  readonly escapesRoots: boolean;
  readonly volume: 'boot' | 'external';
  readonly executableBit: boolean;
  readonly magic: Magic;
}

const BOOT_PREFIXES = ['/Volumes/'];
const MAGIC_BYTES = 4;
const SHEBANG = 0x2321;
const ZIP = 0x504b0304;

export const extensionOf = (path: string): string =>
  extname(basename(path)).replace(/^\./u, '').toLowerCase();

/** Four bytes, one read. Never called during ranking - only for the one chosen target. */
export const readMagic = (path: string): Magic => {
  let fd: number | undefined;
  try {
    fd = openSync(path, 'r');
    const buffer = Buffer.alloc(MAGIC_BYTES);
    const bytes = readSync(fd, buffer, 0, MAGIC_BYTES, 0);
    if (bytes >= 2 && buffer.readUInt16BE(0) === SHEBANG) return 'shebang';
    if (bytes < MAGIC_BYTES) return 'none';
    if (MACHO_MAGIC.has(buffer.readUInt32BE(0))) return 'macho';
    return buffer.readUInt32BE(0) === ZIP ? 'zip' : 'none';
  } catch {
    return 'none';
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
};

/**
 * A .app is a directory, and ANY directory holding Contents/MacOS/ launches code whatever it is
 * called. "Directories are safe" has a hole in it on day one without this.
 */
const directoryClass = (path: string): TargetClass => {
  const extension = extensionOf(path);
  try {
    if (statSync(join(path, 'Contents', 'MacOS')).isDirectory()) return 'application';
  } catch {
    // Not an application bundle; fall through to what its extension claims.
  }
  if (extension === 'app') return 'application';
  return BUNDLE_EXTENSIONS.has(extension) ? 'bundle' : 'directory';
};

const byExtension = (extension: string): TargetClass | null => {
  if (INSTALLER_EXTENSIONS.has(extension)) return 'installer';
  if (LOCATOR_EXTENSIONS.has(extension)) return 'locator';
  if (SCRIPT_EXTENSIONS.has(extension)) return 'script';
  if (EXECUTABLE_EXTENSIONS.has(extension)) return 'executable';
  if (CODE_EXTENSIONS.has(extension)) return 'code';
  return DOCUMENT_EXTENSIONS.has(extension) ? 'document' : null;
};

const fileClass = (path: string, magic: Magic, executableBit: boolean): TargetClass => {
  // Bytes outrank the name: a Mach-O called "invoice.pdf" is still a Mach-O.
  if (magic === 'macho') return 'executable';
  if (magic === 'shebang') return 'script';
  const extension = extensionOf(path);
  const claimed = byExtension(extension);
  if (claimed === 'executable' && magic === 'zip' && extension === 'jar') return 'executable';
  if (claimed !== null) return claimed;
  return executableBit ? 'executable' : 'unknown';
};

const volumeOf = (path: string): 'boot' | 'external' =>
  BOOT_PREFIXES.some((prefix) => path.startsWith(prefix)) ? 'external' : 'boot';

const missing = (path: string): TargetFacts => ({
  path,
  realPath: path,
  klass: 'unknown',
  exists: false,
  isSymlink: false,
  escapesRoots: true,
  volume: volumeOf(path),
  executableBit: false,
  magic: 'none',
});

/** Structure and bytes decide. The name is attacker-controlled text and decides nothing. */
export const classifyPath = (path: string, roots: readonly string[]): TargetFacts => {
  let link;
  try {
    link = lstatSync(path);
  } catch {
    return missing(path);
  }
  const realPath = realPathOr(path);
  let stats;
  try {
    stats = statSync(path);
  } catch {
    return { ...missing(path), isSymlink: link.isSymbolicLink() };
  }
  const executableBit = (stats.mode & 0o111) !== 0;
  const magic = stats.isDirectory() ? 'none' : readMagic(path);
  return {
    path,
    realPath,
    klass: stats.isDirectory() ? directoryClass(path) : fileClass(path, magic, executableBit),
    exists: true,
    isSymlink: link.isSymbolicLink(),
    escapesRoots: roots.length > 0 && !roots.some((root) => isUnderRoot(realPath, root)),
    volume: volumeOf(realPath),
    executableBit,
    magic,
  };
};
