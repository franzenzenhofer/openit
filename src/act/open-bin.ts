import { resolveExecutable } from '@franzenzenhofer/intent-core/executable';
import { productEnv } from '@franzenzenhofer/intent-core/product';

export const SYSTEM_OPEN = '/usr/bin/open';

/**
 * The system opener, or a test override. Read from the environment ONLY, never from config: a
 * config file is data that editors, sync clients and other programs write, and the one thing
 * that must never be redirectable by data is the process that executes things. An environment
 * variable is already at the same trust level as this process.
 */
export const resolveOpenBin = (): string | null => {
  const override = productEnv('OPEN_BIN');
  if (override !== undefined) return resolveExecutable(override);
  return resolveExecutable(SYSTEM_OPEN);
};

export const isOverridden = (): boolean => productEnv('OPEN_BIN') !== undefined;
