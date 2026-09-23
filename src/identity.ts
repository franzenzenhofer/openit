import { isAbsolute } from 'node:path';
import { isProtocolSafePath } from '@franzenzenhofer/intent-core/paths';

const MAX_URL = 2048;

/**
 * What openit will record a visit against. Unlike a directory jumper, a launcher's history is
 * half filesystem and half web, and both halves have to survive a round trip through JSON.
 */
export const isIdentity = (value: string): boolean => {
  if (!isProtocolSafePath(value)) return false;
  if (isAbsolute(value)) return true;
  return value.length <= MAX_URL && /^[a-z][a-z0-9+.-]*:\/\//iu.test(value);
};
