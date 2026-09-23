import { existsSync } from 'node:fs';
import { tryReadJson } from '@franzenzenhofer/intent-core/json';
import { absolutize, configFile, writeAtomic } from '@franzenzenhofer/intent-core/paths';
import type { AiConfig } from '@franzenzenhofer/intent-core/ai/backend';
import type { RootConfig } from '@franzenzenhofer/intent-core/store/indexer';

export const DEFAULT_DEPTH = 3;
export const MAX_DEPTH = 64;
const DEFAULT_TIMEOUT_MS = 45_000;

export const DEFAULT_IGNORE = [
  'node_modules', '.git', 'dist', 'build', '.venv', 'venv', '__pycache__', '.next', '.cache',
];

/** A place whose files are listed directly, shallowly: Downloads, Desktop, Screenshots. */
export interface DocRoot {
  readonly path: string;
  readonly depth: number;
}

/** A taught way to open a kind of thing. Extensions win over kinds, kinds over nothing. */
export interface HandlerRule {
  /** A file extension without the dot, '*' for everything, or '' when this rule names a kind. */
  readonly ext: string;
  /** A FileKind name - pdf, screenshot, deck - or '' when this rule names an extension. */
  readonly kind: string;
  /** An app display name, or the empty string when `command` is set. */
  readonly app: string;
  readonly command: string;
  readonly args: readonly string[];
}

export interface Config {
  readonly roots: readonly RootConfig[];
  readonly docRoots: readonly DocRoot[];
  readonly ignore: readonly string[];
  readonly handlers: readonly HandlerRule[];
  /** Reading browser history is the user's whole browsing history, so it is opt-in. */
  readonly history: boolean;
  readonly ai: AiConfig;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const boundedDepth = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_DEPTH;
  return Math.min(MAX_DEPTH, Math.max(1, Math.trunc(value)));
};

const readRoot = (value: unknown): RootConfig | undefined => {
  if (!isRecord(value) || typeof value['path'] !== 'string' || value['path'] === '') return undefined;
  return { path: absolutize(value['path']), depth: boundedDepth(value['depth']) };
};

const readStrings = (value: unknown, fallback: readonly string[]): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [...fallback];

const readHandler = (value: unknown): HandlerRule | undefined => {
  if (!isRecord(value)) return undefined;
  const ext = typeof value['ext'] === 'string' ? value['ext'].toLowerCase() : '';
  const kind = typeof value['kind'] === 'string' ? value['kind'].toLowerCase() : '';
  if (ext === '' && kind === '') return undefined;
  const app = typeof value['app'] === 'string' ? value['app'] : '';
  const command = typeof value['command'] === 'string' ? value['command'] : '';
  if (app === '' && command === '') return undefined;
  return { ext, kind, app, command, args: readStrings(value['args'], []) };
};

export const DEFAULT_AI: AiConfig = {
  enabled: true, command: 'auto', args: [], model: '', timeoutMs: DEFAULT_TIMEOUT_MS,
};

const readAi = (value: unknown): AiConfig => {
  if (!isRecord(value)) return DEFAULT_AI;
  const timeout = value['timeoutMs'];
  return {
    enabled: typeof value['enabled'] === 'boolean' ? value['enabled'] : DEFAULT_AI.enabled,
    command: typeof value['command'] === 'string' && value['command'] !== ''
      ? value['command'] : DEFAULT_AI.command,
    args: readStrings(value['args'], []),
    model: typeof value['model'] === 'string' ? value['model'] : '',
    timeoutMs: typeof timeout === 'number' && Number.isFinite(timeout) && timeout > 0
      ? timeout : DEFAULT_TIMEOUT_MS,
  };
};

export const emptyConfig = (): Config => ({
  roots: [], docRoots: [], ignore: [...DEFAULT_IGNORE], handlers: [], history: false, ai: DEFAULT_AI,
});

export const loadConfig = (): Config => {
  const file = configFile();
  if (!existsSync(file)) return emptyConfig();
  const parsed = tryReadJson(file);
  if (!isRecord(parsed)) return emptyConfig();
  const roots = Array.isArray(parsed['roots'])
    ? parsed['roots'].map(readRoot).filter((r): r is RootConfig => r !== undefined) : [];
  const docRoots = Array.isArray(parsed['docRoots'])
    ? parsed['docRoots'].map(readRoot).filter((r): r is DocRoot => r !== undefined) : [];
  const handlers = Array.isArray(parsed['handlers'])
    ? parsed['handlers'].map(readHandler).filter((h): h is HandlerRule => h !== undefined) : [];
  return {
    roots,
    docRoots,
    ignore: readStrings(parsed['ignore'], DEFAULT_IGNORE),
    handlers,
    history: parsed['history'] === true,
    ai: readAi(parsed['ai']),
  };
};

export const saveConfig = (config: Config): void => {
  writeAtomic(configFile(), `${JSON.stringify(config, null, 2)}\n`);
};

/** Every place openit is allowed to answer with, for root containment checks. */
export const allRoots = (config: Config): string[] =>
  [...config.roots, ...config.docRoots].map((root) => root.path);
