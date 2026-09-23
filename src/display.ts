import { contractTilde } from '@franzenzenhofer/intent-core/paths';
import { sanitizeLabel } from './ai/sanitize.js';
import type { Target } from './target.js';

const MAX_LABEL = 120;

/**
 * Every path and every title openit prints goes through here. A filename carrying a
 * right-to-left override renders as something else entirely, and the line it would reshape is
 * the line asking whether to open it.
 */
export const displayPath = (path: string): string =>
  sanitizeLabel(contractTilde(path), MAX_LABEL);

export const displayTarget = (target: Target): string =>
  target.kind === 'url' ? sanitizeLabel(target.ref, MAX_LABEL) : displayPath(target.ref);
