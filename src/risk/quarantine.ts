import { spawnSync } from 'node:child_process';

const XATTR = '/usr/bin/xattr';
const ATTRIBUTE = 'com.apple.quarantine';
const TIMEOUT_MS = 2000;
const MAX_BUFFER = 8192;
/** LaunchServices sets this bit once a person has said yes to this exact file. */
const USER_APPROVED = 0x0040;

export interface Quarantine {
  readonly raw: string;
  readonly flags: number;
  /** "Google Chrome", "Safari" - who put it there. */
  readonly agent: string;
  readonly at: number | null;
  readonly userApproved: boolean;
}

export const parseQuarantine = (raw: string): Quarantine | null => {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  const [flagField, timeField, agent] = trimmed.split(';');
  const flags = Number.parseInt(flagField ?? '', 16);
  if (!Number.isFinite(flags)) return null;
  const at = Number.parseInt(timeField ?? '', 16);
  return {
    raw: trimmed,
    flags,
    agent: (agent ?? '').trim(),
    at: Number.isFinite(at) && at > 0 ? at : null,
    userApproved: (flags & USER_APPROVED) !== 0,
  };
};

/**
 * One xattr spawn, ~1.4ms, for the ONE chosen target. Node has no xattr API. This is never
 * called while ranking: a per-candidate spawn over a 50k index is 70 seconds, and the CPU gate
 * in test/latency.test.ts exists to keep it that way.
 */
export const readQuarantine = (path: string): Quarantine | null => {
  const result = spawnSync(XATTR, ['-p', ATTRIBUTE, '--', path], {
    encoding: 'utf8',
    timeout: TIMEOUT_MS,
    maxBuffer: MAX_BUFFER,
  });
  if (result.status !== 0 || typeof result.stdout !== 'string') return null;
  return parseQuarantine(result.stdout);
};
