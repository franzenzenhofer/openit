import { confirm, hasTty } from '@franzenzenhofer/intent-core/picker';
import { absolutize, contractTilde } from '@franzenzenhofer/intent-core/paths';
import { refreshIndex } from '@franzenzenhofer/intent-core/store/indexer';
import { backendLabel, resolveAiBackend } from '@franzenzenhofer/intent-core/ai/backend';
import { DEFAULT_DEPTH, DEFAULT_IGNORE, loadConfig, saveConfig, type Config } from '../config.js';
import { buildAppIndex, saveAppIndex } from '../store/apps.js';
import { detectDocRoots, detectRoots } from './detect.js';
import { EXIT, fail, note, type ExitCode } from '../protocol.js';

export interface SetupOptions {
  readonly yes: boolean;
  readonly ai: boolean | null;
  readonly history: boolean | null;
  readonly roots: string[];
  readonly depth: number | null;
  readonly remove: string[];
  readonly error: string | null;
}

const EMPTY: SetupOptions = {
  yes: false, ai: null, history: null, roots: [], depth: null, remove: [], error: null,
};

export const parseSetup = (args: readonly string[]): SetupOptions => {
  let options = EMPTY;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    const next = args[i + 1];
    if (arg === '--yes' || arg === '-y') options = { ...options, yes: true };
    else if (arg === '--ai') options = { ...options, ai: true };
    else if (arg === '--no-ai') options = { ...options, ai: false };
    else if (arg === '--history') options = { ...options, history: true };
    else if (arg === '--no-history') options = { ...options, history: false };
    else if (arg === '--root' && next !== undefined) {
      options = { ...options, roots: [...options.roots, absolutize(next)] };
      i += 1;
    } else if (arg === '--remove-root' && next !== undefined) {
      options = { ...options, remove: [...options.remove, absolutize(next)] };
      i += 1;
    } else if (arg === '--depth' && next !== undefined) {
      const depth = Number.parseInt(next, 10);
      options = Number.isFinite(depth) && depth > 0
        ? { ...options, depth }
        : { ...options, error: `--depth wants a number, not "${next}"` };
      i += 1;
    } else options = { ...options, error: `unknown option ${String(arg)}` };
  }
  return options;
};

const merged = (current: Config, options: SetupOptions): Config => {
  const depth = options.depth ?? DEFAULT_DEPTH;
  const detected = current.roots.length === 0 ? detectRoots() : [...current.roots];
  const added = options.roots.map((path) => ({ path, depth }));
  const roots = [...detected, ...added]
    .filter((root) => !options.remove.includes(root.path))
    .filter((root, i, all) => all.findIndex((other) => other.path === root.path) === i);
  return {
    ...current,
    roots,
    docRoots: current.docRoots.length === 0 ? detectDocRoots() : current.docRoots,
    ignore: current.ignore.length === 0 ? DEFAULT_IGNORE : current.ignore,
    history: options.history ?? current.history,
    ai: { ...current.ai, enabled: options.ai ?? current.ai.enabled },
  };
};

const disclose = (config: Config): void => {
  if (!config.ai.enabled) {
    note('openit: AI tier off - deterministic matching only');
    return;
  }
  const backend = resolveAiBackend(config.ai);
  const label = backend === null ? 'none found yet' : backendLabel(backend);
  note(`openit: AI tier on (${label})`);
  note('        when nothing matches, your words and up to 40 candidate names may be sent to it');
  note('        file contents, full URLs and anything outside your roots are never sent');
};

export const runSetup = (args: readonly string[]): ExitCode => {
  const options = parseSetup(args);
  if (options.error !== null) return fail(options.error), EXIT.error;
  const current = loadConfig();
  // Never from an empty config: `merged` already re-detects roots when there are none, and
  // starting from scratch silently dropped taught handlers and re-armed the AI tier.
  const next = merged(current, options);
  if (next.roots.length === 0 && next.docRoots.length === 0) {
    return fail('found nothing to learn', 'openit setup --root <path>'), EXIT.error;
  }
  note('openit: roots');
  for (const root of next.roots) note(`          ${contractTilde(root.path)} (depth ${String(root.depth)})`);
  for (const root of next.docRoots) note(`          ${contractTilde(root.path)} (files, depth ${String(root.depth)})`);
  disclose(next);
  if (!options.yes && hasTty() && !confirm('openit: save this?')) return EXIT.declined;
  saveConfig(next);
  const index = refreshIndex(next);
  saveAppIndex(buildAppIndex());
  note(`openit: indexed ${String(index.entries.length)} directories`);
  note('openit: try `openit doctor`, then `openit --dry-run latest screenshot`');
  return EXIT.ok;
};
