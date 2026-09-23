import { spawnSync } from 'node:child_process';

const PLUTIL = '/usr/bin/plutil';
const TIMEOUT_MS = 2000;
const MAX_BUFFER = 64 * 1024;
const MAX_URL = 2048;

/**
 * A .webloc or .inetloc is a redirect with a file extension. Opening one goes wherever it
 * points, so openit reads the destination and judges THAT as well - historically this is
 * exactly where a "harmless bookmark file" turned into `shortcuts://` or `file://`.
 */
export const locatorUrl = (path: string): string | null => {
  const result = spawnSync(PLUTIL, ['-extract', 'URL', 'raw', '-o', '-', '--', path], {
    encoding: 'utf8', timeout: TIMEOUT_MS, maxBuffer: MAX_BUFFER,
  });
  if (result.status !== 0 || typeof result.stdout !== 'string') return null;
  const url = result.stdout.trim();
  return url === '' || url.length > MAX_URL ? null : url;
};
