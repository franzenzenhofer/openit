import { existsSync } from 'node:fs';
import { configFile, contractTilde, dataDir, hasPrivateMode, stateFile } from '@franzenzenhofer/intent-core/paths';
import { loadIndex } from '@franzenzenhofer/intent-core/store/indexer';
import { loadVisits } from '@franzenzenhofer/intent-core/store/visits';
import { resolveExecutable } from '@franzenzenhofer/intent-core/executable';
import { backendLabel, resolveAiBackend } from '@franzenzenhofer/intent-core/ai/backend';
import { hasTty } from '@franzenzenhofer/intent-core/picker';
import { loadConfig } from '../config.js';
import { loadAppIndex } from '../store/apps.js';
import { docTargets } from '../store/docs.js';
import { isOverridden, resolveOpenBin, SYSTEM_OPEN } from '../act/open-bin.js';
import { isIdentity } from '../identity.js';
import { EXIT, note, type ExitCode } from '../protocol.js';

const say = (label: string, value: string): void => note(`  ${label.padEnd(12)} ${value}`);

const opener = (): void => {
  const bin = resolveOpenBin();
  if (isOverridden()) {
    say('opener', `${bin ?? 'not found'}  ← OPENIT_OPEN_BIN is set, this is NOT the system opener`);
    return;
  }
  say('opener', bin ?? `${SYSTEM_OPEN} (missing)`);
};

export const runDoctor = (): ExitCode => {
  const config = loadConfig();
  note('openit doctor');
  say('node', process.version);
  say('config', `${contractTilde(configFile())}${existsSync(configFile()) ? '' : ' (not written yet)'}`);
  say('data', contractTilde(dataDir()));
  say('private', hasPrivateMode(dataDir(), true) ? 'yes (0700)' : 'no - run any openit command to tighten');
  opener();
  for (const root of config.roots) say('root', `${contractTilde(root.path)} depth ${String(root.depth)}`);
  for (const root of config.docRoots) say('docs', `${contractTilde(root.path)} depth ${String(root.depth)}`);
  const index = loadIndex();
  say('index', `${String(index.entries.length)} directories${index.truncated === null ? '' : ` (truncated: ${index.truncated})`}`);
  say('files', String(docTargets(config.docRoots, config.ignore).length));
  say('apps', String(loadAppIndex().apps.length));
  const db = loadVisits({ file: () => stateFile('db.json'), isIdentity });
  say('history', `${String(db.records.length)} remembered opens`);
  const backend = config.ai.enabled ? resolveAiBackend(config.ai) : null;
  say('ai', config.ai.enabled ? (backend === null ? 'enabled, no backend found' : backendLabel(backend)) : 'off');
  say('fzf', resolveExecutable('fzf') ?? 'not installed (numbered picker)');
  say('tty', hasTty() ? 'yes' : 'no - consent fails closed');
  return EXIT.ok;
};
