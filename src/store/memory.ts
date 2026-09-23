import {
  findAlias, forgetAlias, loadAliases, normalizeIntent, rememberAlias, type Alias, type AliasSpec,
} from '@franzenzenhofer/intent-core/store/aliases';
import { stateFile } from '@franzenzenhofer/intent-core/paths';
import type { TargetKind } from '../target.js';

const ALIAS_FILE = 'aliases.json';
const MILLIS_PER_SECOND = 1000;
const MAX_REF = 4096;

/**
 * What openit remembers is an ACTION, not a path: the thing AND the app that was chosen for
 * it. That is what makes a remembered answer reproduce what actually happened rather than
 * something adjacent to it - and it is why `openit gsc` stays `openit gsc`.
 *
 * The handler is stored as an absolute bundle path, which can be stat'd and re-read before it
 * is used again. A recalled alias is never trusted on sight: it is classified from scratch,
 * like any other target, and a thing that has become an application since it was remembered is
 * asked about again.
 */
export interface Remembered {
  readonly kind: TargetKind;
  readonly ref: string;
  /** Absolute path of the app that was used, or null for the system default. */
  readonly handler: string | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const KINDS: readonly TargetKind[] = ['file', 'dir', 'app', 'url'];

export const readRemembered = (value: unknown): Remembered | undefined => {
  if (!isRecord(value)) return undefined;
  const { kind, ref, handler } = value;
  if (typeof kind !== 'string' || !KINDS.includes(kind as TargetKind)) return undefined;
  if (typeof ref !== 'string' || ref === '' || ref.length > MAX_REF) return undefined;
  if (kind !== 'url' && !ref.startsWith('/')) return undefined;
  if (handler !== null && (typeof handler !== 'string' || !handler.startsWith('/'))) return undefined;
  return { kind: kind as TargetKind, ref, handler };
};

export const memorySpec: AliasSpec<Remembered> = {
  file: () => stateFile(ALIAS_FILE),
  readValue: readRemembered,
};

export const recall = (query: string): Alias<Remembered> | undefined =>
  findAlias(memorySpec, query);

export const memories = (): readonly Alias<Remembered>[] => loadAliases(memorySpec);

export const remember = (query: string, value: Remembered, now: number = Date.now()): void => {
  rememberAlias(memorySpec, query, value, Math.floor(now / MILLIS_PER_SECOND));
};

export const forget = (query: string): boolean => forgetAlias(memorySpec, query);

export { normalizeIntent };
