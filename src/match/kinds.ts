import { basename, extname } from 'node:path';
import type { TargetKind } from '../target.js';

export type FileKind =
  | 'pdf' | 'screenshot' | 'image' | 'video' | 'audio'
  | 'note' | 'doc' | 'sheet' | 'deck' | 'archive';

interface KindRule {
  readonly kind: FileKind;
  readonly words: readonly string[];
  readonly extensions: readonly string[];
  /** Also required somewhere in the path, lowercased. */
  readonly inPath?: string;
}

/**
 * Format-naming words only.
 *
 * `rechnung`, `invoice` and `bill` are deliberately NOT kinds: on this machine 2045 files are
 * literally named Rechnung-*.pdf, so turning the strongest available search token into a silent
 * extension filter would destroy the exact query the feature exists for.
 */
const RULES: readonly KindRule[] = [
  { kind: 'pdf', words: ['pdf'], extensions: ['pdf'] },
  {
    kind: 'screenshot',
    words: ['screenshot', 'screenshots', 'screengrab', 'screencap'],
    extensions: ['png', 'jpg', 'jpeg', 'heic'],
    // macOS names them "Screenshot 2026-09-07 at 21.58.04.png".
    inPath: 'screenshot',
  },
  {
    kind: 'image',
    words: ['image', 'images', 'picture', 'photo', 'pic'],
    extensions: ['png', 'jpg', 'jpeg', 'gif', 'heic', 'webp', 'svg', 'tiff', 'bmp'],
  },
  { kind: 'video', words: ['video', 'movie', 'clip'], extensions: ['mp4', 'mov', 'm4v', 'avi', 'mkv', 'webm'] },
  { kind: 'audio', words: ['audio', 'song', 'track', 'recording'], extensions: ['mp3', 'm4a', 'wav', 'aiff', 'flac'] },
  { kind: 'note', words: ['note', 'notes', 'md', 'markdown', 'readme'], extensions: ['md', 'markdown', 'txt'] },
  { kind: 'doc', words: ['doc', 'document'], extensions: ['pdf', 'docx', 'doc', 'pages', 'odt', 'rtf'] },
  { kind: 'sheet', words: ['sheet', 'spreadsheet', 'csv', 'xls'], extensions: ['xlsx', 'xls', 'csv', 'numbers'] },
  { kind: 'deck', words: ['deck', 'slides', 'presentation'], extensions: ['pptx', 'key', 'ppt'] },
  { kind: 'archive', words: ['zip', 'archive'], extensions: ['zip', 'tar', 'gz', 'dmg'] },
];

const BY_WORD = new Map<string, FileKind>(
  RULES.flatMap((rule) => rule.words.map((word) => [word, rule.kind] as const)),
);

const BY_KIND = new Map<FileKind, KindRule>(RULES.map((rule) => [rule.kind, rule]));

export const kindOfWord = (word: string): FileKind | undefined => BY_WORD.get(word);

const TARGET_KIND_WORDS = new Map<string, TargetKind>([
  ['app', 'app'], ['application', 'app'], ['apps', 'app'],
  ['link', 'url'], ['url', 'url'], ['site', 'url'], ['page', 'url'], ['bookmark', 'url'],
  ['folder', 'dir'], ['dir', 'dir'], ['directory', 'dir'], ['project', 'dir'],
  ['file', 'file'],
]);

export const targetKindWord = (word: string): TargetKind | undefined => TARGET_KIND_WORDS.get(word);

export const matchesKind = (path: string, kind: FileKind): boolean => {
  const rule = BY_KIND.get(kind);
  if (rule === undefined) return false;
  const extension = extname(basename(path)).replace(/^\./u, '').toLowerCase();
  if (!rule.extensions.includes(extension)) return false;
  return rule.inPath === undefined || path.toLowerCase().includes(rule.inPath);
};
