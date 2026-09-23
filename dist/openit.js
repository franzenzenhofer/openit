#!/usr/bin/env node

// node_modules/@franzenzenhofer/intent-core/dist/product.js
var current = null;
var setProduct = (product2) => {
  current = product2;
};
var product = () => {
  if (current === null)
    throw new Error("intent-core: setProduct() was never called");
  return current;
};
var productEnv = (suffix) => {
  const value = process.env[`${product().envPrefix}_${suffix}`];
  return value === void 0 || value === "" ? void 0 : value;
};

// node_modules/@franzenzenhofer/intent-core/dist/paths.js
import { homedir } from "node:os";
import { join, isAbsolute, resolve, sep } from "node:path";
import { chmodSync, existsSync, lstatSync, mkdirSync, readdirSync, realpathSync, renameSync, statSync, writeFileSync } from "node:fs";
var TMP_SUFFIX = ".tmp";
var PRIVATE_FILE_MODE = 384;
var PRIVATE_DIR_MODE = 448;
var PRIVATE_MASK = 63;
var configDir = () => {
  const override = productEnv("CONFIG_DIR");
  if (override !== void 0)
    return resolve(expandTilde(override));
  const xdg = process.env["XDG_CONFIG_HOME"];
  if (xdg !== void 0 && xdg !== "")
    return join(xdg, product().name);
  return join(homedir(), ".config", product().name);
};
var dataDir = () => {
  const override = productEnv("DATA_DIR");
  if (override !== void 0)
    return resolve(expandTilde(override));
  const xdg = process.env["XDG_DATA_HOME"];
  if (xdg !== void 0 && xdg !== "")
    return join(xdg, product().name);
  return join(homedir(), ".local", "share", product().name);
};
var configFile = () => join(configDir(), "config.json");
var stateFile = (name) => join(dataDir(), name);
var expandTilde = (input) => {
  if (input === "~")
    return homedir();
  if (input.startsWith(`~${sep}`))
    return join(homedir(), input.slice(2));
  return input;
};
var contractTilde = (input) => {
  const home = homedir();
  if (input === home)
    return "~";
  if (input.startsWith(home + sep))
    return `~${sep}${input.slice(home.length + 1)}`;
  return input;
};
var fileUrlPath = (input) => {
  if (!/^file:\/\//iu.test(input))
    return null;
  try {
    const url = new URL(input);
    if (url.hostname !== "" && url.hostname !== "localhost")
      return null;
    return decodeURIComponent(url.pathname);
  } catch {
    return null;
  }
};
var absolutize = (input) => {
  const expanded = expandTilde(input);
  return isAbsolute(expanded) ? resolve(expanded) : resolve(process.cwd(), expanded);
};
var dirOf = (file) => {
  const idx = file.lastIndexOf(sep);
  return idx <= 0 ? sep : file.slice(0, idx);
};
var ensureDir = (dir) => {
  mkdirSync(dir, { recursive: true, mode: PRIVATE_DIR_MODE });
  tightenMode(dir, PRIVATE_DIR_MODE);
};
var writeAtomic = (file, contents) => {
  ensureDir(dirOf(file));
  const tmp = `${file}.${process.pid}${TMP_SUFFIX}`;
  const mode = privateMode(file, PRIVATE_FILE_MODE);
  writeFileSync(tmp, contents, { encoding: "utf8", mode });
  chmodSync(tmp, mode);
  renameSync(tmp, file);
};
var isUnder = (child, parent) => {
  const c = resolve(child);
  const p = resolve(parent);
  return c === p || c.startsWith(p.endsWith(sep) ? p : p + sep);
};
var isUnderRoot = (child, root) => isUnder(child, root) || isUnder(realPathOr(child), realPathOr(root));
var realPathOr = (path) => {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
};
var isDirectory = (path) => {
  try {
    return existsSync(path) && statSync(path).isDirectory();
  } catch {
    return false;
  }
};
var PATH_SHAPED = /^~|\//u;
var REMOTE_URL = /^(?!file:\/\/)[a-z][a-z0-9+.-]*:\/\//iu;
var spelledPath = (word) => {
  const fileUrl = fileUrlPath(word);
  if (fileUrl === null && (REMOTE_URL.test(word) || !PATH_SHAPED.test(word)))
    return null;
  return absolutize(fileUrl ?? word);
};
var isProtocolSafePath = (path) => !/[\r\n]/u.test(path);
var privateMode = (path, fallback) => {
  try {
    const current2 = statSync(path).mode & 511;
    const privateCurrent = current2 & ~PRIVATE_MASK;
    return privateCurrent === 0 ? fallback : privateCurrent;
  } catch {
    return fallback;
  }
};
var tightenMode = (path, fallback) => {
  try {
    if (lstatSync(path).isSymbolicLink())
      return;
    chmodSync(path, privateMode(path, fallback));
  } catch {
  }
};
var entriesOf = (dir) => {
  try {
    return readdirSync(dir).map((name) => join(dir, name));
  } catch {
    return [];
  }
};
var secureExistingState = () => {
  const dirs = [configDir(), dataDir()];
  dirs.filter(existsSync).forEach((path) => tightenMode(path, PRIVATE_DIR_MODE));
  dirs.flatMap(entriesOf).forEach((path) => tightenMode(path, isDirectory(path) ? PRIVATE_DIR_MODE : PRIVATE_FILE_MODE));
};
var hasPrivateMode = (path, directory) => {
  try {
    const mode = statSync(path).mode;
    const expected = directory ? PRIVATE_DIR_MODE : PRIVATE_FILE_MODE;
    return (mode & PRIVATE_MASK) === 0 && (mode & expected) !== 0;
  } catch {
    return false;
  }
};

// package.json
var package_default = {
  name: "openit",
  version: "0.1.0",
  description: "Say what to open. It works out what you meant and which app should open it, then opens it.",
  type: "module",
  bin: { openit: "dist/openit.js" },
  files: ["dist", "README.md", "LICENSE"],
  engines: { node: ">=20" },
  os: ["darwin"],
  scripts: {
    typecheck: "tsc --noEmit",
    lint: "eslint src test scripts",
    test: "vitest run",
    build: "node scripts/build.mjs"
  },
  license: "MIT",
  author: "Franz Enzenhofer",
  repository: { type: "git", url: "git+https://github.com/franzenzenhofer/openit.git" },
  private: true,
  devDependencies: {
    "@eslint/js": "^9.39.0",
    "@franzenzenhofer/intent-core": "github:franzenzenhofer/intent-core#0e9e9dd34b344a089764086991e23b3b6a30cfde",
    "@types/node": "^22.18.0",
    "@typescript-eslint/eslint-plugin": "^8.46.0",
    "@typescript-eslint/parser": "^8.46.0",
    esbuild: "^0.28.2",
    eslint: "^9.39.0",
    typescript: "^5.9.3",
    vitest: "^3.2.4"
  }
};

// node_modules/@franzenzenhofer/intent-core/dist/protocol.js
var emit = (line3) => {
  process.stdout.write(`${line3}
`);
};
var note = (message) => {
  process.stderr.write(`${message}
`);
};
var fail = (message, hint) => {
  const prefix = product().name;
  note(`${prefix}: ${message}`);
  if (hint !== void 0)
    note(`${" ".repeat(prefix.length + 2)}${hint}`);
};

// src/protocol.ts
var EXIT = {
  /** It was opened, or --dry-run printed the plan it would have run. */
  ok: 0,
  /** openit's own fault: bad usage, unreadable config, corrupt state. */
  error: 1,
  /**
   * A target was found, a question was asked, and the answer was no - including the answer
   * "there is nobody to ask". Consent fails closed in every direction.
   */
  declined: 3,
  /** The words named nothing openable. There was nothing to launch. */
  noMatch: 4,
  /**
   * A target was found and policy forbade opening it. No question was asked, because at this
   * level there is no answer that would have helped.
   */
  refused: 5,
  /**
   * openit decided, consent was given, and open(1) itself failed: the file vanished, no app
   * claims the bundle id, no handler for the scheme, or it hung and was killed. open(1) reports
   * every one of those as exit 1 with prose on stderr, so this is where that prose becomes a
   * distinguishable outcome again.
   */
  launchFailed: 6
};
var announce = (label) => {
  note(`\u2192 ${label}`);
};

// src/commands/options.ts
var EMPTY = {
  mode: "run",
  wait: false,
  withWord: null,
  reveal: false,
  newInstance: false,
  background: false
};
var parseArgs = (args) => {
  let options = EMPTY;
  const words = [];
  let error = null;
  let literal = false;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === void 0) continue;
    if (literal || !arg.startsWith("--")) {
      words.push(arg);
      continue;
    }
    if (arg === "--") {
      literal = true;
      continue;
    }
    if (arg === "--dry-run") options = { ...options, mode: "dry-run" };
    else if (arg === "--reveal") options = { ...options, reveal: true };
    else if (arg === "--new") options = { ...options, newInstance: true };
    else if (arg === "--background") options = { ...options, background: true };
    else if (arg === "--wait") options = { ...options, wait: true };
    else if (arg === "--with") {
      const next = args[i + 1];
      if (next === void 0) error = "--with needs an application name";
      else options = { ...options, withWord: next.toLowerCase() };
      i += 1;
    } else error = `unknown option ${arg}`;
  }
  return { options, words, error };
};

// src/commands/query.ts
import { existsSync as existsSync9 } from "node:fs";

// node_modules/@franzenzenhofer/intent-core/dist/picker.js
import { spawnSync } from "node:child_process";
import { closeSync, existsSync as existsSync2, openSync, readSync } from "node:fs";

// node_modules/@franzenzenhofer/intent-core/dist/executable.js
import { accessSync, constants, statSync as statSync2 } from "node:fs";
import { delimiter, isAbsolute as isAbsolute2, join as join2, resolve as resolve2, sep as sep2 } from "node:path";
var isExecutableFile = (path) => {
  try {
    accessSync(path, constants.X_OK);
    return statSync2(path).isFile();
  } catch {
    return false;
  }
};
var resolveExecutable = (command) => {
  if (command.trim() === "")
    return null;
  if (isAbsolute2(command) || command.includes(sep2)) {
    const path = resolve2(command);
    return isExecutableFile(path) ? path : null;
  }
  for (const dir of (process.env["PATH"] ?? "").split(delimiter)) {
    const candidate = join2(dir === "" ? process.cwd() : dir, command);
    if (isExecutableFile(candidate))
      return candidate;
  }
  return null;
};

// node_modules/@franzenzenhofer/intent-core/dist/picker.js
var TTY = "/dev/tty";
var FZF = "fzf";
var READ_BUFFER_BYTES = 256;
var canOpenTty = () => {
  try {
    closeSync(openSync(TTY, "r"));
    return true;
  } catch {
    return false;
  }
};
var hasTty = () => existsSync2(TTY) && canOpenTty();
var pickWithFzf = (items) => {
  const input = items.map((item) => item.label).join("\n");
  const args = ["--height=40%", "--reverse", `--prompt=${product().name}> `];
  const result = spawnSync(FZF, args, { input, encoding: "utf8", stdio: ["pipe", "pipe", "inherit"] });
  if (result.status !== 0)
    return null;
  const chosen = result.stdout.trim();
  return items.find((item) => item.label === chosen)?.value ?? null;
};
var readLineFromTty = () => {
  const fd = openSync(TTY, "r");
  try {
    const buffer = Buffer.alloc(READ_BUFFER_BYTES);
    const bytes = readSync(fd, buffer, 0, READ_BUFFER_BYTES, null);
    return bytes === 0 ? null : buffer.toString("utf8", 0, bytes).trim();
  } finally {
    closeSync(fd);
  }
};
var pickNumbered = (items) => {
  items.forEach((item, i) => note(`  ${i + 1}) ${item.label}`));
  process.stderr.write(`${product().name}: pick 1-${items.length} (enter to abort): `);
  const choice = Number.parseInt(readLineFromTty() ?? "", 10);
  if (!Number.isFinite(choice) || choice < 1 || choice > items.length)
    return null;
  return items[choice - 1]?.value ?? null;
};
var confirm = (question) => {
  if (!hasTty()) {
    note(`${question} [no terminal, declined]`);
    return false;
  }
  process.stderr.write(`${question} [Y/n] `);
  const answer = readLineFromTty();
  if (answer === null) {
    note(`${product().name}: terminal closed before answering, declined`);
    return false;
  }
  const lower = answer.toLowerCase();
  return lower === "" || lower === "y" || lower === "yes";
};
var confirmTyped = (question, word) => {
  if (!hasTty()) {
    note(`${question} [no terminal, declined]`);
    return false;
  }
  process.stderr.write(`${question} `);
  const answer = readLineFromTty();
  if (answer === null) {
    note(`${product().name}: terminal closed before answering, declined`);
    return false;
  }
  return answer.trim().toLowerCase() === word.toLowerCase();
};
var toItems = (values) => values.map((value) => ({ value, label: contractTilde(value) }));
var pick = (items) => {
  if (items.length === 0)
    return null;
  if (!hasTty()) {
    note(`${product().name}: several matches, no terminal to ask on:`);
    items.forEach((item) => note(`  ${item.label}`));
    return null;
  }
  if (resolveExecutable(FZF) !== null)
    return pickWithFzf(items);
  return pickNumbered(items);
};

// src/config.ts
import { existsSync as existsSync3 } from "node:fs";

// node_modules/@franzenzenhofer/intent-core/dist/json.js
import { readFileSync } from "node:fs";
var tryReadJson = (file) => {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return void 0;
  }
};

// src/config.ts
var DEFAULT_DEPTH = 3;
var MAX_DEPTH = 64;
var DEFAULT_TIMEOUT_MS = 45e3;
var DEFAULT_IGNORE = [
  "node_modules",
  ".git",
  "dist",
  "build",
  ".venv",
  "venv",
  "__pycache__",
  ".next",
  ".cache"
];
var isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
var boundedDepth = (value) => {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_DEPTH;
  return Math.min(MAX_DEPTH, Math.max(1, Math.trunc(value)));
};
var readRoot = (value) => {
  if (!isRecord(value) || typeof value["path"] !== "string" || value["path"] === "") return void 0;
  return { path: absolutize(value["path"]), depth: boundedDepth(value["depth"]) };
};
var readStrings = (value, fallback) => Array.isArray(value) ? value.filter((v) => typeof v === "string") : [...fallback];
var readHandler = (value) => {
  if (!isRecord(value) || typeof value["ext"] !== "string" || value["ext"] === "") return void 0;
  const app = typeof value["app"] === "string" ? value["app"] : "";
  const command = typeof value["command"] === "string" ? value["command"] : "";
  if (app === "" && command === "") return void 0;
  return { ext: value["ext"].toLowerCase(), app, command, args: readStrings(value["args"], []) };
};
var DEFAULT_AI = {
  enabled: true,
  command: "auto",
  args: [],
  model: "",
  timeoutMs: DEFAULT_TIMEOUT_MS
};
var readAi = (value) => {
  if (!isRecord(value)) return DEFAULT_AI;
  const timeout = value["timeoutMs"];
  return {
    enabled: typeof value["enabled"] === "boolean" ? value["enabled"] : DEFAULT_AI.enabled,
    command: typeof value["command"] === "string" && value["command"] !== "" ? value["command"] : DEFAULT_AI.command,
    args: readStrings(value["args"], []),
    model: typeof value["model"] === "string" ? value["model"] : "",
    timeoutMs: typeof timeout === "number" && Number.isFinite(timeout) && timeout > 0 ? timeout : DEFAULT_TIMEOUT_MS
  };
};
var emptyConfig = () => ({
  roots: [],
  docRoots: [],
  ignore: [...DEFAULT_IGNORE],
  handlers: [],
  history: false,
  ai: DEFAULT_AI
});
var loadConfig = () => {
  const file = configFile();
  if (!existsSync3(file)) return emptyConfig();
  const parsed = tryReadJson(file);
  if (!isRecord(parsed)) return emptyConfig();
  const roots = Array.isArray(parsed["roots"]) ? parsed["roots"].map(readRoot).filter((r) => r !== void 0) : [];
  const docRoots = Array.isArray(parsed["docRoots"]) ? parsed["docRoots"].map(readRoot).filter((r) => r !== void 0) : [];
  const handlers = Array.isArray(parsed["handlers"]) ? parsed["handlers"].map(readHandler).filter((h) => h !== void 0) : [];
  return {
    roots,
    docRoots,
    ignore: readStrings(parsed["ignore"], DEFAULT_IGNORE),
    handlers,
    history: parsed["history"] === true,
    ai: readAi(parsed["ai"])
  };
};
var saveConfig = (config) => {
  writeAtomic(configFile(), `${JSON.stringify(config, null, 2)}
`);
};
var allRoots = (config) => [...config.roots, ...config.docRoots].map((root) => root.path);

// src/match/literal.ts
import { existsSync as existsSync4, statSync as statSync3 } from "node:fs";

// node_modules/@franzenzenhofer/intent-core/dist/match/url.js
var HOST_PATTERN = /^(?:[a-z0-9-]+\.)+[a-z]{2,24}(?:\/.*)?$/u;
var TLDS = /* @__PURE__ */ new Set([
  "com",
  "net",
  "org",
  "info",
  "biz",
  "io",
  "ai",
  "dev",
  "app",
  "co",
  "me",
  "tv",
  "xyz",
  "cloud",
  "site",
  "online",
  "shop",
  "blog",
  "at",
  "de",
  "ch",
  "uk",
  "eu",
  "it",
  "fr",
  "es",
  "nl",
  "pl",
  "cz",
  "hu",
  "si",
  "sk",
  "us",
  "ca",
  "au",
  "nz",
  "jp",
  "cn",
  "in",
  "br"
]);
var HOST_NOISE = /* @__PURE__ */ new Set([
  "www",
  "m",
  "web",
  "shop",
  "blog",
  "app",
  "api",
  "dev",
  "staging",
  "test",
  "mail",
  "co",
  "com",
  "net",
  "org",
  "gov",
  "gv",
  "edu",
  "ac",
  "github",
  "gitlab",
  "bitbucket",
  "codeberg",
  "sourceforge",
  "npmjs",
  "huggingface",
  "pages",
  "workers",
  "vercel",
  "netlify",
  "herokuapp",
  "replit",
  "glitch"
]);
var PATH_NOISE = /* @__PURE__ */ new Set([
  "index",
  "home",
  "en",
  "de",
  "at",
  "us",
  "uk",
  "p",
  "page",
  "pages",
  "blog",
  "post",
  "posts",
  "docs",
  "doc",
  "level",
  "tag",
  "tags",
  "category",
  "search",
  "www",
  "main",
  "master"
]);
var URL_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//u;
var LOCAL_PATH = /^~|\//u;
var PATH_DOTS = /* @__PURE__ */ new Set(["", ".", "..", "~"]);
var PAGE_SUFFIX = /\.(?:html?|php|aspx?|jsp|md)$/u;
var MIN_NAME_LENGTH = 2;
var MAX_URL_READINGS = 4;
var stripScheme = (word) => word.replace(URL_SCHEME, "").replace(/[.,;:!?]+$/u, "");
var hostLabels = (word) => {
  const bare = stripScheme(word);
  if (!HOST_PATTERN.test(bare))
    return [];
  const labels = bare.split("/")[0]?.split(".") ?? [];
  if (!TLDS.has(labels.at(-1) ?? ""))
    return [];
  return labels.slice(0, -1).filter((label) => !HOST_NOISE.has(label));
};
var pathNames = (word) => {
  const bare = stripScheme(word);
  if (!URL_SCHEME.test(word) && !HOST_PATTERN.test(bare))
    return [];
  return bare.split("/").slice(1).map((segment) => (segment.split("?")[0] ?? "").replace(PAGE_SUFFIX, "")).filter((segment) => segment.length >= MIN_NAME_LENGTH && !/^\d+$/u.test(segment) && !PATH_NOISE.has(segment)).reverse();
};
var localNames = (word) => {
  if (URL_SCHEME.test(word) || !LOCAL_PATH.test(word))
    return [];
  return word.split("/").map((segment) => segment.replace(PAGE_SUFFIX, "")).filter((segment) => !PATH_DOTS.has(segment)).reverse();
};
var urlNames = (word) => [...pathNames(word), ...hostLabels(word)];
var pathReading = (tokens) => {
  const read = [];
  const within = [];
  let spelled = false;
  for (const token of tokens) {
    const [deepest, ...above] = localNames(token);
    if (deepest === void 0) {
      read.push(token);
      continue;
    }
    spelled = true;
    read.push(deepest);
    within.push(...above);
  }
  return spelled ? { tokens: read, within } : null;
};
var urlReadings = (tokens) => {
  const names = tokens.map(urlNames);
  const depth = Math.min(MAX_URL_READINGS, Math.max(0, ...names.map((list2) => list2.length)));
  const readings2 = [];
  for (let level = 0; level < depth; level += 1) {
    const read = tokens.map((token, index2) => {
      const list2 = names[index2] ?? [];
      return list2[Math.min(level, list2.length - 1)] ?? token;
    });
    const known2 = [tokens, ...readings2];
    if (known2.some((seen) => seen.every((token, index2) => token === read[index2])))
      continue;
    readings2.push(read);
  }
  return readings2;
};

// src/match/literal.ts
var mtimeOf = (path) => {
  try {
    return statSync3(path).mtimeMs;
  } catch {
    return 0;
  }
};
var nameOf = (path) => path.split("/").filter((p) => p !== "").at(-1) ?? path;
var pathTarget = (path) => ({
  kind: statSync3(path).isDirectory() ? /\.app$/iu.test(path) ? "app" : "dir" : "file",
  ref: path,
  name: nameOf(path),
  mtime: mtimeOf(path),
  source: "literal"
});
var literalTarget = (args) => {
  if (args.length !== 1) return null;
  const word = args[0];
  if (word === void 0 || word === "") return null;
  const spelled = spelledPath(word);
  if (spelled !== null && existsSync4(spelled)) return pathTarget(spelled);
  if (!URL_SCHEME.test(word)) return null;
  return { kind: "url", ref: word, name: word, mtime: 0, source: "literal" };
};

// node_modules/@franzenzenhofer/intent-core/dist/match/score.js
var SEGMENT_SPLIT = /[^a-z0-9]+/u;
var LOG_BASE_2 = Math.LN2;
var TYPO_ONE_EDIT_PENALTY = 40;
var TYPO_TWO_EDIT_PENALTY = 80;
var LONG_TOKEN = 8;
var fuzzyScore = (token, name, options) => {
  const { weights, fuzzy } = options;
  if (token === "" || name === "")
    return weights.none;
  let first = -1;
  let last = -1;
  let cursor = 0;
  for (let i = 0; i < name.length && cursor < token.length; i += 1) {
    if (name[i] !== token[cursor])
      continue;
    if (first === -1)
      first = i;
    last = i;
    cursor += 1;
  }
  if (cursor < token.length)
    return weights.none;
  const density = token.length / (last - first + 1);
  const coverage = token.length / name.length;
  const share = fuzzy.baseShare + fuzzy.densityShare * density + fuzzy.coverageShare * coverage;
  return Math.round(weights.fuzzyMax * share);
};
var withinEdits = (input, row, column, left) => {
  while (row < input.token.length && column < input.nameLength && input.token[row] === input.name[column]) {
    row += 1;
    column += 1;
  }
  const tokenLeft = input.token.length - row;
  const nameLeft = input.nameLength - column;
  if (tokenLeft === 0 || nameLeft === 0)
    return Math.max(tokenLeft, nameLeft) <= left;
  if (left === 0 || Math.abs(tokenLeft - nameLeft) > left)
    return false;
  if (row + 1 < input.token.length && column + 1 < input.nameLength && input.token[row] === input.name[column + 1] && input.token[row + 1] === input.name[column] && withinEdits(input, row + 2, column + 2, left - 1))
    return true;
  return withinEdits(input, row + 1, column + 1, left - 1) || withinEdits(input, row + 1, column, left - 1) || withinEdits(input, row, column + 1, left - 1);
};
var hasPrefixWithin = (token, name, edits) => {
  const start = Math.max(1, token.length - edits);
  const end = Math.min(name.length, token.length + edits);
  for (let length = start; length <= end; length += 1) {
    if (withinEdits({ token, name, nameLength: length }, 0, 0, edits))
      return true;
  }
  return false;
};
var typoScore = (token, name, options) => {
  const { weights, typo } = options;
  if (token.length < typo.minLength || token.length > typo.maxLength)
    return weights.none;
  if (token[0] !== name[0])
    return weights.none;
  if (hasPrefixWithin(token, name, 1))
    return weights.fuzzyMax - TYPO_ONE_EDIT_PENALTY;
  if (token.length < LONG_TOKEN)
    return weights.none;
  return hasPrefixWithin(token, name, 2) ? weights.fuzzyMax - TYPO_TWO_EDIT_PENALTY : weights.none;
};
var hasBoundaryHit = (token, name) => name.split(SEGMENT_SPLIT).some((segment) => segment !== "" && segment.startsWith(token));
var matchName = (token, name, options) => {
  const { weights } = options;
  const lower = name.toLowerCase();
  if (lower === token)
    return weights.exact;
  if (lower.startsWith(token))
    return weights.prefix;
  if (hasBoundaryHit(token, lower))
    return weights.wordBoundary;
  if (lower.includes(token))
    return weights.substring;
  const fuzzy = fuzzyScore(token, lower, options);
  return fuzzy > weights.none ? fuzzy : typoScore(token, lower, options);
};
var frecencyBonus = (frecency2, weight) => frecency2 <= 0 ? 0 : weight * (Math.log1p(frecency2) / LOG_BASE_2);

// src/match/constants.ts
var SCORE = {
  exact: 1e3,
  prefix: 800,
  wordBoundary: 600,
  substring: 400,
  fuzzyMax: 380,
  /** Found nowhere in the name but present in the path above it. */
  pathOnly: 200,
  none: 0
};
var MATCH = {
  weights: SCORE,
  fuzzy: { baseShare: 0.45, densityShare: 0.35, coverageShare: 0.2 },
  typo: { minLength: 3, maxLength: 64 }
};
var BONUS = {
  /** Weight of log2(1 + frecency), over openit's own opening history. */
  frecency: 100,
  underCwd: 25,
  brevity: 40,
  /** The query named a kind and this candidate is that kind. */
  kindMatch: 60,
  /** openit's targets are documents, not projects, so recent beats old. */
  recency: 45,
  /** The whole query is one word and it exactly names an installed app. */
  appExact: 80
};
var THRESHOLD = {
  hit: 550,
  gap: 250,
  candidate: 400,
  minPickerCandidates: 2,
  picker: 10,
  unsure: 30
};
var LITERAL_SCORE = 1e3;
var ORDERED_HIT = 400;
var HANDLER_THRESHOLD = { hit: 550, candidate: 400 };
var LIMIT = {
  picker: 10,
  aiTargets: 30,
  aiFrecent: 20,
  suggestions: 3,
  /** Spotlight hits stat'd before the mtime pick. */
  spotlight: 4e3,
  /** Children listed per matched directory. */
  lazyChildren: 400,
  /** Directories whose children are listed at all. */
  lazyParents: 3,
  urlIndex: 300,
  apps: 400
};
var STOPWORDS = /* @__PURE__ */ new Set([
  "the",
  "a",
  "an",
  "my",
  "to",
  "of",
  "for",
  "from",
  "this",
  "that",
  "me",
  "please",
  "it",
  "up",
  "open",
  "openit"
]);
var LATEST_WORDS = /* @__PURE__ */ new Set(["latest", "newest", "last", "recent"]);
var OLDEST_WORDS = /* @__PURE__ */ new Set(["oldest", "first"]);
var REVEAL_WORDS = /* @__PURE__ */ new Set(["reveal", "finder"]);
var NEW_WORDS = /* @__PURE__ */ new Set(["new"]);
var BACKGROUND_WORDS = /* @__PURE__ */ new Set(["background", "bg"]);
var WITH_OPERATOR = "with";
var IN_OPERATOR = "in";
var YEARS = { min: 1990, max: 2999 };

// src/match/handler-match.ts
var scoreApps = (word, apps) => apps.map((app) => ({ handler: { kind: "app", app }, score: matchName(word, app.name, MATCH) })).filter((choice) => choice.score > 0).sort((a, b) => b.score - a.score);
var templateFor = (rule) => {
  const command = resolveExecutable(rule.command);
  if (command === null) return null;
  return {
    kind: "command",
    template: { label: rule.ext === "*" ? rule.command : `${rule.command} (${rule.ext})`, command, args: rule.args }
  };
};
var scoreCommands = (word, rules) => rules.filter((rule) => rule.command !== "").flatMap((rule) => {
  const handler = templateFor(rule);
  if (handler === null) return [];
  const score = matchName(word, rule.ext === "*" ? rule.command : rule.ext, MATCH);
  return score > 0 ? [{ handler, score }] : [];
}).sort((a, b) => b.score - a.score);
var handlerLabelOf = (choice) => choice.handler.kind === "app" ? choice.handler.app.name : choice.handler.kind === "command" ? choice.handler.template.label : "Finder";
var resolveHandler = (input) => {
  const { query } = input;
  if (query.reveal) return { kind: "handler", handler: { kind: "reveal" } };
  const word = query.handlerWord;
  if (word === null) return { kind: "handler", handler: { kind: "default" } };
  const scored = [...scoreCommands(word, input.rules), ...scoreApps(word, input.apps)].sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (best !== void 0 && best.score >= HANDLER_THRESHOLD.hit) {
    return { kind: "handler", handler: best.handler };
  }
  if (!query.handlerExplicit) return { kind: "handler", handler: { kind: "default" } };
  return {
    kind: "unknown",
    word,
    closest: scored.slice(0, LIMIT.suggestions).map(handlerLabelOf)
  };
};

// node_modules/@franzenzenhofer/intent-core/dist/match/words.js
var YEAR_PATTERN = /^\d{4}$/u;
var splitWords = (input) => input.toLowerCase().split(/\s+/u).filter((word) => word !== "");
var isYear = (token, range) => {
  if (!YEAR_PATTERN.test(token))
    return false;
  const value = Number.parseInt(token, 10);
  return value >= range.min && value <= range.max;
};
var dropStopwords = (words, stopwords) => {
  const kept = words.filter((word) => !stopwords.has(word));
  return kept.length > 0 ? kept : [...words];
};

// src/match/kinds.ts
import { basename, extname } from "node:path";
var RULES = [
  { kind: "pdf", words: ["pdf"], extensions: ["pdf"] },
  {
    kind: "screenshot",
    words: ["screenshot", "screenshots", "screengrab", "screencap"],
    extensions: ["png", "jpg", "jpeg", "heic"],
    // macOS names them "Screenshot 2026-09-07 at 21.58.04.png".
    inPath: "screenshot"
  },
  {
    kind: "image",
    words: ["image", "images", "picture", "photo", "pic"],
    extensions: ["png", "jpg", "jpeg", "gif", "heic", "webp", "svg", "tiff", "bmp"]
  },
  { kind: "video", words: ["video", "movie", "clip"], extensions: ["mp4", "mov", "m4v", "avi", "mkv", "webm"] },
  { kind: "audio", words: ["audio", "song", "track", "recording"], extensions: ["mp3", "m4a", "wav", "aiff", "flac"] },
  { kind: "note", words: ["note", "notes", "md", "markdown", "readme"], extensions: ["md", "markdown", "txt"] },
  { kind: "doc", words: ["doc", "document"], extensions: ["pdf", "docx", "doc", "pages", "odt", "rtf"] },
  { kind: "sheet", words: ["sheet", "spreadsheet", "csv", "xls"], extensions: ["xlsx", "xls", "csv", "numbers"] },
  { kind: "deck", words: ["deck", "slides", "presentation"], extensions: ["pptx", "key", "ppt"] },
  { kind: "archive", words: ["zip", "archive"], extensions: ["zip", "tar", "gz", "dmg"] }
];
var BY_WORD = new Map(
  RULES.flatMap((rule) => rule.words.map((word) => [word, rule.kind]))
);
var BY_KIND = new Map(RULES.map((rule) => [rule.kind, rule]));
var kindWord = (word) => BY_WORD.get(word);
var TARGET_KIND_WORDS = /* @__PURE__ */ new Map([
  ["app", "app"],
  ["application", "app"],
  ["apps", "app"],
  ["link", "url"],
  ["url", "url"],
  ["site", "url"],
  ["page", "url"],
  ["bookmark", "url"],
  ["folder", "dir"],
  ["dir", "dir"],
  ["directory", "dir"],
  ["project", "dir"],
  ["file", "file"]
]);
var targetKindWord = (word) => TARGET_KIND_WORDS.get(word);
var matchesKind = (path, kind) => {
  const rule = BY_KIND.get(kind);
  if (rule === void 0) return false;
  const extension = extname(basename(path)).replace(/^\./u, "").toLowerCase();
  if (!rule.extensions.includes(extension)) return false;
  return rule.inPath === void 0 || path.toLowerCase().includes(rule.inPath);
};

// src/match/operators.ts
var takeOperands = (words) => {
  const rest = [];
  let withWord = null;
  let inWord = null;
  for (let i = 0; i < words.length; i += 1) {
    const word = words[i];
    if (word === void 0) continue;
    const next = words[i + 1];
    if (word === WITH_OPERATOR && next !== void 0 && withWord === null) {
      withWord = next;
      i += 1;
      continue;
    }
    if (word === IN_OPERATOR && next !== void 0 && inWord === null) {
      inWord = next;
      i += 1;
      continue;
    }
    rest.push(word);
  }
  return { rest, taken: { withWord, inWord } };
};
var takeFlags = (words) => {
  const rest = [];
  let reveal = false;
  let newInstance = false;
  let background = false;
  for (const word of words) {
    if (REVEAL_WORDS.has(word)) {
      reveal = true;
      continue;
    }
    if (NEW_WORDS.has(word)) {
      newInstance = true;
      continue;
    }
    if (BACKGROUND_WORDS.has(word)) {
      background = true;
      continue;
    }
    rest.push(word);
  }
  return { rest, taken: { reveal, newInstance, background } };
};
var takeOrder = (words) => {
  const rest = [];
  let order = "none";
  for (const word of words) {
    if (LATEST_WORDS.has(word) && order === "none") {
      order = "latest";
      continue;
    }
    if (OLDEST_WORDS.has(word) && order === "none") {
      order = "oldest";
      continue;
    }
    rest.push(word);
  }
  return { rest, taken: order };
};
var takeKinds = (words) => {
  const kinds = [];
  const targetKinds = [];
  for (const word of words) {
    const kind = kindWord(word);
    if (kind !== void 0 && !kinds.includes(kind)) kinds.push(kind);
    const targetKind = targetKindWord(word);
    if (targetKind !== void 0 && !targetKinds.includes(targetKind)) targetKinds.push(targetKind);
  }
  return { kinds, targetKinds };
};

// src/match/tokenize.ts
var tokenize = (input) => {
  const words = splitWords(input);
  const operands = takeOperands(words);
  const flags3 = takeFlags(operands.rest);
  const ordered = takeOrder(flags3.rest);
  const years = ordered.rest.filter((word) => isYear(word, YEARS));
  const searchable = ordered.rest.filter((word) => !isYear(word, YEARS));
  const { kinds, targetKinds } = takeKinds(searchable);
  const tokens = dropStopwords(searchable, STOPWORDS);
  const withWord = operands.taken.withWord;
  return {
    raw: input,
    // An operator or a year can also be the entire query, and then it is a literal name.
    tokens: tokens.length > 0 ? tokens : words,
    order: ordered.taken,
    years,
    inWord: operands.taken.inWord,
    withWord,
    scope: null,
    handlerWord: withWord,
    handlerExplicit: withWord !== null,
    kinds,
    targetKinds,
    ...flags3.taken,
    within: []
  };
};
var tokenizeArgs = (args) => tokenize(args.join(" "));
var resolveIn = (query, namesPlace, namesApp) => {
  const word = query.inWord;
  if (word === null) return query;
  if (namesPlace(word)) return { ...query, scope: word };
  if (query.handlerWord === null && namesApp(word)) {
    return { ...query, handlerWord: word, handlerExplicit: true };
  }
  return { ...query, scope: word };
};
var readings = (query) => {
  const all = [query];
  const spelled = pathReading(query.tokens);
  if (spelled !== null) {
    all.push({ ...query, tokens: spelled.tokens, within: [...query.within, ...spelled.within] });
  }
  for (const tokens of urlReadings(query.tokens)) all.push({ ...query, tokens });
  return all;
};

// src/sources.ts
import { basename as basename3 } from "node:path";

// src/store/apps.ts
import { existsSync as existsSync5, readdirSync as readdirSync2, statSync as statSync4 } from "node:fs";
import { homedir as homedir2 } from "node:os";
import { join as join3 } from "node:path";

// src/handler.ts
import { basename as basename2 } from "node:path";
var TARGET_PLACEHOLDER = "{target}";
var appName = (path) => basename2(path).replace(/\.app$/iu, "");
var handlerLabel = (handler) => {
  if (handler.kind === "app") return handler.app.name;
  if (handler.kind === "command") return handler.template.label;
  if (handler.kind === "reveal") return "Finder";
  return "";
};
var validTemplate = (template) => template.command.startsWith("/") && template.args.filter((arg) => arg.includes(TARGET_PLACEHOLDER)).length === 1;

// src/store/apps.ts
var APPS_FILE = "apps.json";
var VERSION = 1;
var TTL_MS = 24 * 60 * 60 * 1e3;
var APP_DIRS = () => [
  "/Applications",
  "/System/Applications",
  "/System/Applications/Utilities",
  join3(homedir2(), "Applications")
];
var EXTRA_APPS = ["/System/Library/CoreServices/Finder.app"];
var isApp = (path) => {
  try {
    return statSync4(path).isDirectory() && statSync4(join3(path, "Contents", "MacOS")).isDirectory();
  } catch {
    return false;
  }
};
var appsIn = (dir) => {
  let names;
  try {
    names = readdirSync2(dir);
  } catch {
    return [];
  }
  const direct = names.filter((name) => name.endsWith(".app")).map((name) => join3(dir, name));
  const nested = names.filter((name) => !name.endsWith(".app") && !name.startsWith(".")).flatMap((name) => {
    const sub = join3(dir, name);
    try {
      return readdirSync2(sub).filter((n) => n.endsWith(".app")).map((n) => join3(sub, n));
    } catch {
      return [];
    }
  });
  return [...direct, ...nested];
};
var buildAppIndex = (now = Date.now()) => {
  const seen = /* @__PURE__ */ new Set();
  const apps = [];
  for (const path of [...APP_DIRS().flatMap(appsIn), ...EXTRA_APPS]) {
    if (seen.has(path) || apps.length >= LIMIT.apps || !isApp(path)) continue;
    seen.add(path);
    apps.push({ name: appName(path), path, bundleId: null });
  }
  return { version: VERSION, generatedAt: now, apps };
};
var isRecord2 = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
var readApp = (value) => {
  if (!isRecord2(value)) return void 0;
  const { name, path, bundleId } = value;
  if (typeof name !== "string" || name === "") return void 0;
  if (typeof path !== "string" || !path.startsWith("/")) return void 0;
  return { name, path, bundleId: typeof bundleId === "string" ? bundleId : null };
};
var saveAppIndex = (index2) => {
  writeAtomic(stateFile(APPS_FILE), `${JSON.stringify(index2)}
`);
};
var loadAppIndex = (now = Date.now()) => {
  const file = stateFile(APPS_FILE);
  const parsed = existsSync5(file) ? tryReadJson(file) : void 0;
  if (isRecord2(parsed) && parsed["version"] === VERSION && Array.isArray(parsed["apps"])) {
    const generatedAt = typeof parsed["generatedAt"] === "number" ? parsed["generatedAt"] : 0;
    if (now - generatedAt <= TTL_MS) {
      return {
        version: VERSION,
        generatedAt,
        apps: parsed["apps"].map(readApp).filter((app) => app !== void 0)
      };
    }
  }
  const built = buildAppIndex(now);
  try {
    saveAppIndex(built);
  } catch {
  }
  return built;
};
var appTargets = (index2) => index2.apps.map((app) => ({ kind: "app", ref: app.path, name: app.name, mtime: 0, source: "app-index" }));

// src/store/docs.ts
import { readdirSync as readdirSync3, statSync as statSync5 } from "node:fs";
import { join as join4 } from "node:path";
var MAX_FILES = 5e3;
var statMtime = (path) => {
  try {
    return statSync5(path).mtimeMs;
  } catch {
    return 0;
  }
};
var walk = (dir, depth, ignore, out) => {
  if (depth < 0 || out.length >= MAX_FILES) return;
  let entries;
  try {
    entries = readdirSync3(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (out.length >= MAX_FILES) return;
    if (entry.name.startsWith(".") || ignore.includes(entry.name)) continue;
    const path = join4(dir, entry.name);
    if (entry.isDirectory()) {
      walk(path, depth - 1, ignore, out);
      continue;
    }
    if (!entry.isFile()) continue;
    out.push({ kind: "file", ref: path, name: entry.name, mtime: statMtime(path), source: "doc-index" });
  }
};
var docTargets = (roots, ignore) => {
  const out = [];
  for (const root of roots) walk(root.path, Math.max(0, root.depth - 1), ignore, out);
  return out;
};

// src/store/lazy.ts
import { readdirSync as readdirSync4, statSync as statSync6 } from "node:fs";
import { join as join5 } from "node:path";
var DEPTH = 2;
var mtimeOf2 = (path) => {
  try {
    return statSync6(path).mtimeMs;
  } catch {
    return 0;
  }
};
var list = (dir, depth, ignore, out) => {
  if (depth <= 0 || out.length >= LIMIT.lazyChildren) return;
  let entries;
  try {
    entries = readdirSync4(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (out.length >= LIMIT.lazyChildren) return;
    if (entry.name.startsWith(".") || ignore.includes(entry.name)) continue;
    const path = join5(dir, entry.name);
    if (entry.isFile()) {
      out.push({ kind: "file", ref: path, name: entry.name, mtime: mtimeOf2(path), source: "lazy-child" });
      continue;
    }
    if (entry.isDirectory()) list(path, depth - 1, ignore, out);
  }
};
var childTargets = (dirs, ignore) => {
  const out = [];
  for (const dir of dirs.slice(0, LIMIT.lazyParents)) list(dir, DEPTH, ignore, out);
  return out;
};

// src/sources.ts
var dirTargets = (index2) => index2.entries.map((entry) => ({
  kind: "dir",
  ref: entry.path,
  name: entry.name,
  mtime: entry.mtime,
  source: "dir-index"
}));
var tier1 = (config, index2) => {
  const apps = loadAppIndex();
  return {
    apps,
    targets: [
      ...appTargets(apps),
      ...dirTargets(index2),
      ...docTargets(config.docRoots, config.ignore)
    ]
  };
};
var tier1b = (config, dirs) => childTargets(dirs, config.ignore);
var rootNames = (config) => new Set([...config.roots, ...config.docRoots].map((root) => basename3(root.path).toLowerCase()));

// node_modules/@franzenzenhofer/intent-core/dist/store/indexer.js
import { existsSync as existsSync7, readdirSync as readdirSync5, realpathSync as realpathSync3, statSync as statSync8 } from "node:fs";
import { basename as basename4, join as join6 } from "node:path";

// node_modules/@franzenzenhofer/intent-core/dist/store/lock.js
import { existsSync as existsSync6, mkdirSync as mkdirSync2, readFileSync as readFileSync2, renameSync as renameSync2, rmSync, statSync as statSync7, writeFileSync as writeFileSync2 } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname } from "node:path";
var LOCK_WAIT_MS = 5;
var LOCK_TIMEOUT_MS = 5e3;
var INVALID_LOCK_GRACE_MS = 3e4;
var isRecord3 = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
var parseLockOwner = (value) => {
  if (!isRecord3(value))
    return null;
  const { pid, token, createdAt } = value;
  if (!Number.isSafeInteger(pid) || pid <= 0)
    return null;
  if (typeof token !== "string" || token === "")
    return null;
  if (!Number.isSafeInteger(createdAt) || createdAt < 0)
    return null;
  return { pid, token, createdAt };
};
var readOwner = (ownerFile) => {
  try {
    return parseLockOwner(JSON.parse(readFileSync2(ownerFile, "utf8")));
  } catch {
    return null;
  }
};
var processIsAlive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return !(error instanceof Error && "code" in error && error.code === "ESRCH");
  }
};
var ageOf = (path, now) => {
  try {
    return Math.max(0, now - statSync7(path).mtimeMs);
  } catch {
    return 0;
  }
};
var canReclaim = (lockDir, ownerFile, now) => {
  const owner = readOwner(ownerFile);
  if (owner !== null)
    return !processIsAlive(owner.pid);
  return ageOf(lockDir, now) > INVALID_LOCK_GRACE_MS;
};
var pause = () => {
  const signal = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT));
  Atomics.wait(signal, 0, 0, LOCK_WAIT_MS);
};
var isAlreadyExists = (error) => error instanceof Error && "code" in error && error.code === "EEXIST";
var isMissing = (error) => error instanceof Error && "code" in error && error.code === "ENOENT";
var quarantine = (lockDir) => {
  const retired = `${lockDir}.trash.${process.pid}.${randomUUID()}`;
  try {
    renameSync2(lockDir, retired);
  } catch (error) {
    if (isMissing(error))
      return false;
    throw error;
  }
  rmSync(retired, { recursive: true, force: true });
  return true;
};
var claimMarker = (marker) => {
  const claimant = { pid: process.pid, token: randomUUID(), createdAt: Date.now() };
  while (true) {
    try {
      writeFileSync2(marker, JSON.stringify(claimant), { encoding: "utf8", mode: 384, flag: "wx" });
      return claimant;
    } catch (error) {
      if (isMissing(error))
        return null;
      if (!isAlreadyExists(error))
        throw error;
      const holder = readOwner(marker);
      if (holder !== null && processIsAlive(holder.pid))
        return null;
      const retired = `${marker}.trash.${process.pid}.${randomUUID()}`;
      try {
        renameSync2(marker, retired);
        rmSync(retired, { force: true });
      } catch (renameError) {
        if (!isMissing(renameError))
          throw renameError;
      }
    }
  }
};
var tryReclaim = (lockDir, ownerFile, now) => {
  const marker = `${lockDir}/reclaim`;
  const claimant = claimMarker(marker);
  if (claimant === null)
    return false;
  if (readOwner(marker)?.token === claimant.token && canReclaim(lockDir, ownerFile, now)) {
    return quarantine(lockDir);
  }
  if (readOwner(marker)?.token === claimant.token)
    rmSync(marker, { force: true });
  return false;
};
var release = (lockDir, ownerFile, token) => {
  if (readOwner(ownerFile)?.token !== token)
    return;
  quarantine(lockDir);
};
var acquire = (context) => {
  const { stateFile: stateFile2, lockDir, ownerFile, started, owner } = context;
  while (true) {
    try {
      mkdirSync2(lockDir, { mode: 448 });
    } catch (error) {
      if (!isAlreadyExists(error))
        throw error;
      if (!existsSync6(lockDir))
        continue;
      if (canReclaim(lockDir, ownerFile, Date.now()))
        tryReclaim(lockDir, ownerFile, Date.now());
      if (Date.now() - started >= LOCK_TIMEOUT_MS)
        throw new Error(`state is busy: ${stateFile2}`);
      pause();
      continue;
    }
    try {
      writeFileSync2(ownerFile, JSON.stringify(owner), { encoding: "utf8", mode: 384 });
      return;
    } catch (error) {
      quarantine(lockDir);
      throw error;
    }
  }
};
var withStateLock = (stateFile2, action) => {
  const lockDir = `${stateFile2}.lock`;
  const ownerFile = `${lockDir}/owner.json`;
  const started = Date.now();
  const owner = { pid: process.pid, token: randomUUID(), createdAt: started };
  ensureDir(dirname(stateFile2));
  acquire({ stateFile: stateFile2, lockDir, ownerFile, started, owner });
  try {
    return action();
  } finally {
    release(lockDir, ownerFile, owner.token);
  }
};

// node_modules/@franzenzenhofer/intent-core/dist/store/index-schema.js
import { realpathSync as realpathSync2 } from "node:fs";
import { isAbsolute as isAbsolute3 } from "node:path";
var PREVIOUS_INDEX_VERSION = 2;
var isRecord4 = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
var readStoredEntry = (value) => {
  if (!isRecord4(value))
    return void 0;
  const { path, name, mtime, root, realPath } = value;
  if (typeof path !== "string" || !isAbsolute3(path) || !isProtocolSafePath(path))
    return void 0;
  if (typeof name !== "string" || name === "" || !isProtocolSafePath(name))
    return void 0;
  if (typeof root !== "string" || !isAbsolute3(root))
    return void 0;
  if (typeof mtime !== "number" || !Number.isFinite(mtime) || mtime < 0)
    return void 0;
  if (realPath !== void 0 && (typeof realPath !== "string" || !isAbsolute3(realPath) || !isProtocolSafePath(realPath)))
    return void 0;
  const base = { path, name, mtime, root };
  return realPath === void 0 ? base : { ...base, realPath };
};
var currentEntry = (value) => {
  const entry = readStoredEntry(value);
  return entry?.realPath === void 0 ? void 0 : { ...entry, realPath: entry.realPath };
};
var canonical = (path) => {
  try {
    return realpathSync2(path);
  } catch {
    return void 0;
  }
};
var previousEntry = (value, roots) => {
  const entry = readStoredEntry(value);
  if (entry === void 0)
    return void 0;
  if (!roots.has(entry.root))
    roots.set(entry.root, canonical(entry.root));
  const realRoot = roots.get(entry.root);
  const realPath = canonical(entry.path);
  if (realRoot === void 0 || realPath === void 0 || !isUnder(realPath, realRoot))
    return void 0;
  return { ...entry, realPath };
};
var truncation = (value) => value === "entries" || value === "time" ? value : null;
var parseIndex = (value, currentVersion) => {
  if (!isRecord4(value) || !Array.isArray(value["entries"]))
    return void 0;
  const version = value["version"];
  if (version !== currentVersion && version !== PREVIOUS_INDEX_VERSION)
    return void 0;
  const roots = /* @__PURE__ */ new Map();
  const reader = version === currentVersion ? currentEntry : (entry) => previousEntry(entry, roots);
  const generatedAt = value["generatedAt"];
  const configKey = value["configKey"];
  return {
    index: {
      version: currentVersion,
      generatedAt: typeof generatedAt === "number" && Number.isFinite(generatedAt) && generatedAt >= 0 ? generatedAt : 0,
      configKey: typeof configKey === "string" ? configKey : "",
      truncated: truncation(value["truncated"]),
      entries: value["entries"].map(reader).filter((entry) => entry !== void 0)
    },
    migrated: version !== currentVersion
  };
};

// node_modules/@franzenzenhofer/intent-core/dist/store/indexer.js
var INDEX_VERSION = 3;
var INDEX_FILE = "index.json";
var INDEX_TTL_MS = 60 * 60 * 1e3;
var MAX_ENTRIES = 5e4;
var MAX_WALK_MS = 5e3;
var HIDDEN_PREFIX = ".";
var indexConfigKey = (config) => JSON.stringify({ roots: config.roots, ignore: config.ignore });
var emptyIndex = () => ({
  version: INDEX_VERSION,
  generatedAt: 0,
  configKey: "",
  truncated: null,
  entries: []
});
var loadIndex = () => {
  const file = stateFile(INDEX_FILE);
  if (!existsSync7(file))
    return emptyIndex();
  const loaded = parseIndex(tryReadJson(file), INDEX_VERSION);
  if (loaded === void 0)
    return emptyIndex();
  if (loaded.migrated) {
    try {
      saveIndex(loaded.index);
    } catch {
    }
  }
  return loaded.index;
};
var saveIndex = (index2) => {
  withStateLock(stateFile(INDEX_FILE), () => writeAtomic(stateFile(INDEX_FILE), `${JSON.stringify(index2)}
`));
};
var matchesConfig = (index2, config) => index2.configKey === indexConfigKey(config);
var shouldSkip = (name, ignore) => name.startsWith(HIDDEN_PREFIX) || ignore.includes(name);
var DEFAULT_LIMITS = { maxEntries: MAX_ENTRIES, maxWalkMs: MAX_WALK_MS };
var shouldStop = (state) => {
  if (state.entries.length >= state.maxEntries) {
    state.truncated = "entries";
    return true;
  }
  if (Date.now() > state.deadline) {
    state.truncated = "time";
    return true;
  }
  return false;
};
var canonical2 = (dir) => {
  try {
    return realpathSync3(dir);
  } catch {
    return void 0;
  }
};
var mtimeOf3 = (dir) => {
  try {
    return statSync8(dir).mtimeMs;
  } catch {
    return 0;
  }
};
var isDirectoryPath = (path) => {
  try {
    return statSync8(path).isDirectory();
  } catch {
    return false;
  }
};
var listDirs = (dir, ignore) => {
  let entries;
  try {
    entries = readdirSync5(dir, { withFileTypes: true }).filter((d) => d.isDirectory() || d.isSymbolicLink()).map((d) => ({ name: d.name, link: d.isSymbolicLink() }));
  } catch {
    return [];
  }
  return entries.filter((entry) => !shouldSkip(entry.name, ignore)).map((entry) => ({ path: join6(dir, entry.name), link: entry.link })).filter((entry) => !entry.link || isDirectoryPath(entry.path)).map((entry) => entry.path);
};
var walk2 = (dir, depth, root, state) => {
  if (depth > root.depth)
    return;
  if (shouldStop(state))
    return;
  for (const child of listDirs(dir, state.ignore)) {
    if (shouldStop(state))
      return;
    const real = canonical2(child);
    if (real === void 0 || !isUnder(real, state.canonicalRoot) || !isProtocolSafePath(child) || !isProtocolSafePath(real) || state.seen.has(real))
      continue;
    state.seen.add(real);
    state.entries.push({ path: child, name: basename4(child), mtime: mtimeOf3(child), root: root.path, realPath: real });
    walk2(child, depth + 1, root, state);
  }
};
var buildIndex = (config, now = Date.now(), limits = DEFAULT_LIMITS) => {
  const state = {
    entries: [],
    seen: /* @__PURE__ */ new Set(),
    deadline: Date.now() + limits.maxWalkMs,
    ignore: config.ignore,
    maxEntries: Math.max(1, limits.maxEntries),
    canonicalRoot: "",
    truncated: null
  };
  for (const root of config.roots) {
    if (!existsSync7(root.path))
      continue;
    const real = canonical2(root.path);
    if (real === void 0)
      continue;
    state.canonicalRoot = real;
    state.seen.add(real);
    walk2(root.path, 1, root, state);
  }
  return {
    version: INDEX_VERSION,
    generatedAt: now,
    configKey: indexConfigKey(config),
    truncated: state.truncated,
    entries: state.entries
  };
};
var refreshIndex = (config, now = Date.now()) => {
  const index2 = buildIndex(config, now);
  saveIndex(index2);
  return index2;
};

// node_modules/@franzenzenhofer/intent-core/dist/store/visits.js
import { existsSync as existsSync8 } from "node:fs";

// node_modules/@franzenzenhofer/intent-core/dist/store/frecency.js
var HOUR_SECONDS = 3600;
var DAY_SECONDS = 86400;
var WEEK_SECONDS = 604800;
var AGE_WEIGHT = {
  withinHour: 4,
  withinDay: 2,
  withinWeek: 0.5,
  older: 0.25
};
var AGING_THRESHOLD = 9e3;
var AGING_FACTOR = 0.9;
var AGING_DROP_BELOW = 1;
var ageWeight = (ageSeconds) => {
  if (ageSeconds < HOUR_SECONDS)
    return AGE_WEIGHT.withinHour;
  if (ageSeconds < DAY_SECONDS)
    return AGE_WEIGHT.withinDay;
  if (ageSeconds < WEEK_SECONDS)
    return AGE_WEIGHT.withinWeek;
  return AGE_WEIGHT.older;
};
var frecency = (record, nowSeconds) => record.visits * ageWeight(Math.max(0, nowSeconds - record.lastVisit));
var totalVisits = (records) => records.reduce((sum, r) => sum + r.visits, 0);
var needsAging = (records) => totalVisits(records) > AGING_THRESHOLD;
var applyAging = (records) => records.map((r) => ({ ...r, visits: r.visits * AGING_FACTOR })).filter((r) => r.visits >= AGING_DROP_BELOW);

// node_modules/@franzenzenhofer/intent-core/dist/store/db-records.js
import { isAbsolute as isAbsolute4, resolve as resolve3 } from "node:path";
var MAX_DB_RECORDS = 1e4;
var isRecord5 = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
var absolutePath = (value) => isAbsolute4(value) && isProtocolSafePath(value);
var readVisitRecord = (value, isIdentity2 = absolutePath) => {
  if (!isRecord5(value))
    return void 0;
  const { path, realPath, visits, lastVisit } = value;
  if (typeof path !== "string" || !isIdentity2(path))
    return void 0;
  if (realPath !== void 0 && (typeof realPath !== "string" || !isIdentity2(realPath))) {
    return void 0;
  }
  if (typeof visits !== "number" || !Number.isFinite(visits) || visits <= 0)
    return void 0;
  if (typeof lastVisit !== "number" || !Number.isFinite(lastVisit) || lastVisit < 0)
    return void 0;
  const record = { path, visits, lastVisit };
  return typeof realPath === "string" ? { ...record, realPath } : record;
};
var boundedRecords = (records) => [...records].sort((a, b) => b.lastVisit - a.lastVisit || b.visits - a.visits || a.path.localeCompare(b.path)).slice(0, MAX_DB_RECORDS);

// node_modules/@franzenzenhofer/intent-core/dist/store/visits.js
var DB_VERSION = 3;
var VISIT_INCREMENT = 1;
var isRecord6 = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
var identityOf = (spec) => spec.isIdentity ?? absolutePath;
var emptyVisits = () => ({ version: DB_VERSION, records: [] });
var checkVersion = (version) => {
  if (version === DB_VERSION)
    return true;
  if (typeof version === "number") {
    throw new Error(`unsupported db schema version ${String(version)}; state was not modified`);
  }
  return false;
};
var loadVisits = (spec) => {
  const path = spec.file();
  if (!existsSync8(path))
    return emptyVisits();
  const parsed = tryReadJson(path);
  if (!isRecord6(parsed) || !Array.isArray(parsed["records"]))
    return emptyVisits();
  if (!checkVersion(parsed["version"]))
    return emptyVisits();
  const identity = identityOf(spec);
  const records = parsed["records"].map((value) => readVisitRecord(value, identity)).filter((record) => record !== void 0);
  return { version: DB_VERSION, records: boundedRecords(records) };
};
var saveUnlocked = (spec, db) => {
  writeAtomic(spec.file(), `${JSON.stringify({ version: DB_VERSION, records: db.records })}
`);
};
var mergeVisit = (db, key, epoch) => {
  const byKey = new Map(db.records.map((record) => [record.realPath ?? record.path, record]));
  const existing = byKey.get(key);
  byKey.set(key, {
    path: existing?.path ?? key,
    realPath: key,
    visits: (existing?.visits ?? 0) + VISIT_INCREMENT,
    lastVisit: Math.max(existing?.lastVisit ?? 0, epoch)
  });
  const records = boundedRecords([...byKey.values()]);
  return { version: DB_VERSION, records: needsAging(records) ? applyAging(records) : records };
};
var recordVisit = (spec, key, epoch) => withStateLock(spec.file(), () => {
  if (!identityOf(spec)(key))
    return loadVisits(spec);
  const next = mergeVisit(loadVisits(spec), key, epoch);
  saveUnlocked(spec, next);
  return next;
});
var frecencyByKey = (db, nowSeconds) => new Map(db.records.map((r) => [r.realPath ?? r.path, frecency(r, nowSeconds)]));

// node_modules/@franzenzenhofer/intent-core/dist/match/path-trie.js
var node = () => ({ terminal: false, children: /* @__PURE__ */ new Map() });
var segments = (path) => path.split("/").filter((part) => part !== "");
var PathChainSet = class {
  #root = node();
  hasChain(path) {
    let current2 = this.#root;
    for (const part of segments(path)) {
      if (current2.terminal)
        return true;
      const next = current2.children.get(part);
      if (next === void 0)
        return false;
      current2 = next;
    }
    return current2.terminal || current2.children.size > 0;
  }
  add(path) {
    let current2 = this.#root;
    for (const part of segments(path)) {
      let next = current2.children.get(part);
      if (next === void 0) {
        next = node();
        current2.children.set(part, next);
      }
      current2 = next;
    }
    current2.terminal = true;
  }
};

// node_modules/@franzenzenhofer/intent-core/dist/match/decide.js
var rank = (items, evaluate, tieBreak) => {
  const scored = [];
  for (const item of items) {
    const result = evaluate(item);
    if (result !== null && result.score > 0)
      scored.push({ item, ...result });
  }
  return scored.sort((a, b) => b.quality - a.quality || b.score - a.score || tieBreak(a.item, b.item));
};
var decide = (ranked, thresholds) => {
  const best = ranked[0];
  if (best === void 0)
    return { kind: "unsure", candidates: [] };
  const runnerUp = ranked[1];
  const gap = best.quality === (runnerUp?.quality ?? 0) ? best.score - (runnerUp?.score ?? 0) : best.quality - (runnerUp?.quality ?? 0);
  if (best.quality >= thresholds.hit && gap >= thresholds.gap) {
    return { kind: "hit", item: best.item, score: best.score };
  }
  const shortlist = ranked.filter((scored) => scored.quality >= thresholds.candidate).slice(0, thresholds.picker);
  if (shortlist.length >= thresholds.minPickerCandidates) {
    return { kind: "choose", candidates: shortlist };
  }
  if (shortlist.length === 1 && best.quality >= thresholds.hit) {
    return { kind: "hit", item: best.item, score: best.score };
  }
  return { kind: "unsure", candidates: ranked.slice(0, thresholds.unsure) };
};
var collapseChains = (ranked, pathOf2) => {
  const kept = [];
  const paths = new PathChainSet();
  for (const scored of ranked) {
    const path = pathOf2(scored.item);
    if (paths.hasChain(path))
      continue;
    kept.push(scored);
    paths.add(path);
  }
  return kept;
};
var parentOf = (path) => {
  const idx = path.lastIndexOf("/");
  return idx <= 0 ? "" : path.slice(0, idx);
};
var dropDescendants = (ranked, pathOf2) => {
  const paths = new Set(ranked.map((scored) => pathOf2(scored.item)));
  return ranked.filter((scored) => {
    let parent = parentOf(pathOf2(scored.item));
    while (parent.length > 1) {
      if (paths.has(parent))
        return false;
      parent = parentOf(parent);
    }
    return true;
  });
};

// src/match/score-target.ts
var DAY_MS = 864e5;
var RECENCY_HALF_LIFE_DAYS = 30;
var parentPath = (path) => {
  const idx = path.lastIndexOf("/");
  return idx <= 0 ? "" : path.slice(0, idx);
};
var tokenScore = (token, target) => {
  const nameScore = matchName(token, target.name, MATCH);
  if (nameScore > SCORE.none) return nameScore;
  if (target.kind === "url") return target.ref.toLowerCase().includes(token) ? SCORE.pathOnly : SCORE.none;
  return parentPath(target.ref).toLowerCase().includes(token) ? SCORE.pathOnly : SCORE.none;
};
var passesFilters = (query, target) => {
  const lower = target.ref.toLowerCase();
  if (query.targetKinds.length > 0 && !query.targetKinds.includes(target.kind)) return false;
  if (!query.years.every((year) => lower.includes(year))) return false;
  if (!query.within.every((folder) => lower.includes(folder))) return false;
  if (query.scope !== null && !lower.includes(query.scope.toLowerCase())) return false;
  if (query.kinds.length === 0) return true;
  if (target.kind !== "file") return true;
  return query.kinds.some((kind) => matchesKind(target.ref, kind));
};
var matchQuality = (query, target) => {
  if (!passesFilters(query, target) || query.tokens.length === 0) return SCORE.none;
  let sum = 0;
  for (const token of query.tokens) {
    const single = tokenScore(token, target);
    if (single === SCORE.none) return SCORE.none;
    sum += single;
  }
  return sum / query.tokens.length;
};
var brevityBonus = (query, target) => {
  const queried = query.tokens.reduce((sum, token) => sum + token.length, 0);
  if (queried === 0 || target.name.length === 0) return 0;
  return BONUS.brevity * Math.min(1, queried / target.name.length);
};
var recencyBonus = (target, nowMs) => {
  if (target.mtime <= 0) return 0;
  const days = Math.max(0, (nowMs - target.mtime) / DAY_MS);
  return BONUS.recency / (1 + days / RECENCY_HALF_LIFE_DAYS);
};
var kindBonus = (query, target) => {
  if (query.kinds.length === 0 || target.kind !== "file") return 0;
  return query.kinds.some((kind) => matchesKind(target.ref, kind)) ? BONUS.kindMatch : 0;
};
var appBonus = (query, target) => {
  if (target.kind !== "app" || query.tokens.length !== 1) return 0;
  return target.name.toLowerCase() === query.tokens[0] ? BONUS.appExact : 0;
};
var contextualScore = (query, target, context, quality) => {
  const under = target.kind !== "url" && target.ref !== context.cwd && target.ref.startsWith(`${context.cwd}/`) ? BONUS.underCwd : 0;
  return quality + frecencyBonus(context.frecency.get(target.ref) ?? 0, BONUS.frecency) + under + brevityBonus(query, target) + recencyBonus(target, context.nowMs) + kindBonus(query, target) + appBonus(query, target);
};

// src/match/resolve.ts
var pathOf = (target) => target.ref;
var rankTargets = (query, targets, context) => {
  const ranked = rank(
    targets,
    (target) => {
      const quality = matchQuality(query, target);
      if (quality === SCORE.none) return null;
      return { quality, score: contextualScore(query, target, context, quality) };
    },
    (a, b) => a.ref.localeCompare(b.ref)
  );
  return collapseChains(ranked, pathOf);
};
var applyOrder = (query, ranked) => {
  const best = ranked[0];
  if (best === void 0) return { kind: "unsure", candidates: [] };
  if (best.quality < ORDERED_HIT) return { kind: "unsure", candidates: ranked.slice(0, LIMIT.aiTargets) };
  const pool = dropDescendants(
    ranked.filter((scored) => scored.quality >= best.quality - THRESHOLD.gap),
    pathOf
  );
  const newest = query.order === "latest";
  const chosen = [...pool].sort((a, b) => newest ? b.item.mtime - a.item.mtime : a.item.mtime - b.item.mtime)[0];
  return chosen === void 0 ? { kind: "unsure", candidates: ranked } : { kind: "hit", item: chosen.item, score: chosen.score };
};
var decideTargets = (query, ranked) => query.order === "none" ? decide(ranked, THRESHOLD) : applyOrder(query, ranked);

// src/identity.ts
import { isAbsolute as isAbsolute5 } from "node:path";
var MAX_URL = 2048;
var isIdentity = (value) => {
  if (!isProtocolSafePath(value)) return false;
  if (isAbsolute5(value)) return true;
  return value.length <= MAX_URL && /^[a-z][a-z0-9+.-]*:\/\//iu.test(value);
};

// src/pipeline.ts
var DB_FILE = "db.json";
var MILLIS_PER_SECOND = 1e3;
var scoreContext = (config) => {
  const db = loadVisits({ file: () => stateFile(DB_FILE), isIdentity });
  return {
    cwd: process.cwd(),
    frecency: frecencyByKey(db, Math.floor(Date.now() / MILLIS_PER_SECOND)),
    nowMs: Date.now(),
    roots: allRoots(config)
  };
};
var freshIndex = (config) => {
  const index2 = loadIndex();
  return matchesConfig(index2, config) ? index2 : refreshIndex(config);
};
var bestReading = (query, targets, context) => {
  let fallback = { ranked: [], query };
  for (const reading of readings(query)) {
    const ranked = rankTargets(reading, targets, context);
    if (ranked.length > 0) return { ranked, query: reading };
    if (fallback.ranked.length === 0) fallback = { ranked, query: reading };
  }
  return fallback;
};
var bestDirs = (ranked) => ranked.filter((scored) => scored.item.kind === "dir").slice(0, LIMIT.lazyParents).map((scored) => scored.item.ref);
var deterministicPool = (query, config, context) => {
  const targets = [...tier1(config, freshIndex(config)).targets];
  let attempt = bestReading(query, targets, context);
  const expanded = tier1b(config, bestDirs(attempt.ranked));
  if (expanded.length === 0) return { targets, attempt };
  targets.push(...expanded);
  attempt = bestReading(query, targets, context);
  return { targets, attempt };
};
var rescan = (query, pool, config, context) => {
  const rescanned = tier1(config, refreshIndex(config)).targets;
  const lazy = pool.targets.filter((target) => target.source === "lazy-child");
  const targets = [...rescanned, ...lazy];
  return { targets, attempt: bestReading(query, targets, context) };
};
var decideFrom = (attempt) => decideTargets(attempt.query, attempt.ranked);

// src/ai/sanitize.ts
var LYING = [
  [0, 31],
  [127, 159],
  // C0 and C1 controls
  [173, 173],
  // soft hyphen
  [8203, 8207],
  // zero width, and the LTR/RTL marks
  [8234, 8238],
  // bidi embeddings and overrides
  [8288, 8292],
  [8294, 8297],
  // word joiner, invisible operators, bidi isolates
  [65279, 65279],
  // byte order mark
  [65024, 65039],
  // variation selectors
  [57344, 63743],
  // private use area
  [917504, 917631],
  // the tag block: invisible instruction carrier
  [983040, 1114109]
  // supplementary private use areas
];
var lies = (codePoint) => LYING.some(([low, high]) => codePoint >= low && codePoint <= high);
var ELLIPSIS = "\u2026";
var sanitizeLabel = (text, max) => {
  const kept = [...text.normalize("NFC")].filter((char) => !lies(char.codePointAt(0) ?? 0)).join("");
  const flattened = kept.replace(/\s+/gu, " ").trim();
  const graphemes = [...flattened];
  return graphemes.length <= max ? flattened : `${graphemes.slice(0, max - 1).join("")}${ELLIPSIS}`;
};

// src/display.ts
var MAX_LABEL = 120;
var displayPath = (path) => sanitizeLabel(contractTilde(path), MAX_LABEL);
var displayTarget = (target) => target.kind === "url" ? sanitizeLabel(target.ref, MAX_LABEL) : displayPath(target.ref);

// src/act/argv.ts
var handlerArgs = (handler) => {
  if (handler.kind === "app") return ["-a", handler.appPath];
  if (handler.kind === "bundleId") return ["-b", handler.bundleId];
  return [];
};
var flags = (plan) => [
  ...plan.reveal ? ["-R"] : [],
  ...plan.newInstance ? ["-n"] : [],
  ...plan.background ? ["-g"] : [],
  ...plan.wait && !plan.background ? ["-W"] : []
];
var buildOpenArgv = (plan) => {
  const head = [...flags(plan), ...handlerArgs(plan.handler)];
  if (plan.target.kind === "url") return [...head, "-u", plan.target.url];
  return [...head, "--", plan.target.path];
};

// src/quote.ts
var shellQuote = (value) => `'${value.replaceAll("'", `'\\''`)}'`;
var quoteArgv = (command, argv) => [command, ...argv].map(shellQuote).join(" ");

// src/action.ts
var isPlan = (planned) => !("error" in planned);
var displayRef = (target) => target.kind === "url" ? target.ref : contractTilde(target.ref);
var labelOf = (action) => {
  const what = displayRef(action.target);
  if (action.reveal || action.handler.kind === "reveal") return `${what} revealed in Finder`;
  const who = handlerLabel(action.handler);
  return who === "" ? what : `${what} with ${who}`;
};
var openHandler = (handler) => {
  if (handler.kind !== "app") return { kind: "default" };
  if (handler.app.path !== "") return { kind: "app", appPath: handler.app.path };
  return handler.app.bundleId === null ? { kind: "default" } : { kind: "bundleId", bundleId: handler.app.bundleId };
};
var openPlan = (action) => ({
  target: action.target.kind === "url" ? { kind: "url", url: action.target.ref } : { kind: "path", path: action.target.ref },
  handler: openHandler(action.handler),
  reveal: action.reveal || action.handler.kind === "reveal",
  background: action.background,
  newInstance: action.newInstance,
  wait: action.wait
});
var plannedCommand = (action, command, argv) => ({
  action,
  command,
  argv,
  label: labelOf(action),
  printed: quoteArgv(command, argv)
});
var planAction = (action, openBin) => {
  if (action.handler.kind === "command") {
    const { template } = action.handler;
    if (!validTemplate(template)) {
      return { error: `handler "${template.label}" does not say where the target goes` };
    }
    if (action.target.kind === "url" && !template.command.includes("open")) {
      return { error: `handler "${template.label}" takes a file, not a link` };
    }
    const argv = template.args.map((arg) => arg.replaceAll(TARGET_PLACEHOLDER, action.target.ref));
    return plannedCommand(action, template.command, argv);
  }
  return plannedCommand(action, openBin, buildOpenArgv(openPlan(action)));
};

// src/risk/verify-word.ts
var verifyWord = (klass, scheme2) => {
  if (klass === "application") return "application";
  if (klass === "installer") return "installer";
  if (klass === "script") return "script";
  if (klass === "executable") return "executable";
  if (klass === "bundle") return "bundle";
  return scheme2 === "" ? "open" : scheme2;
};
var classDescription = (klass) => {
  const said = {
    application: "an APPLICATION BUNDLE (it contains Contents/MacOS/) - opening it runs its code as you",
    installer: "an INSTALLER or DISK IMAGE - opening it mounts or installs something",
    script: "a SCRIPT - opening it can run its contents",
    executable: "an EXECUTABLE - opening it runs it",
    bundle: "a PACKAGE that runs code when opened",
    locator: "a LOCATOR - it redirects somewhere else",
    code: "source code",
    document: "a document",
    directory: "a folder",
    unknown: "an unidentified file"
  };
  return said[klass];
};

// src/consent.ts
var line = (text) => note(`openit:   ${text}`);
var describe = (assessed, plan) => {
  note(`openit: ${displayTarget(plan.action.target)}`);
  if (assessed.facts !== null) line(classDescription(assessed.facts.klass));
  if (assessed.redirect !== null) line(`it points at ${assessed.redirect.url.href}`);
  if (assessed.quarantine !== null) {
    const when = assessed.quarantine.at === null ? "" : ` on ${new Date(assessed.quarantine.at * 1e3).toISOString().slice(0, 10)}`;
    line(`downloaded with ${assessed.quarantine.agent || "an unknown app"}${when}`);
  }
  if (assessed.facts?.escapesRoots === true && assessed.facts.isSymlink) {
    line(`it is a link to ${assessed.facts.realPath}`);
  }
  if (plan.action.handler.kind !== "default") line(`handler ${plan.label}`);
};
var granted = (assessed, plan) => {
  if (assessed.consent === "allow") return true;
  describe(assessed, plan);
  if (assessed.consent === "confirm") return confirm("openit: open it?");
  const word = verifyWord(
    assessed.facts?.klass ?? "unknown",
    assessed.url?.scheme ?? assessed.redirect?.scheme ?? ""
  );
  line("opening it runs code as you");
  return confirmTyped(`openit: type  ${word}  to open it, anything else aborts:`, word);
};

// src/risk/bundle.ts
import { spawnSync as spawnSync2 } from "node:child_process";
import { join as join7 } from "node:path";
var PLUTIL = "/usr/bin/plutil";
var TIMEOUT_MS = 3e3;
var MAX_BUFFER = 1024 * 1024;
var TERMINAL_IDS = /* @__PURE__ */ new Set([
  "com.apple.terminal",
  "com.googlecode.iterm2",
  "com.mitchellh.ghostty",
  "net.kovidgoyal.kitty",
  "io.alacritty",
  "co.zeit.hyper",
  "dev.warp.warp-stable",
  "com.github.wez.wezterm",
  "org.tabby",
  "com.apple.scripteditor2"
]);
var BROWSER_IDS = /* @__PURE__ */ new Set([
  "com.apple.safari",
  "com.google.chrome",
  "com.google.chrome.canary",
  "com.brave.browser",
  "org.mozilla.firefox",
  "com.microsoft.edgemac",
  "company.thebrowser.browser",
  "org.chromium.chromium"
]);
var INSTALLER_IDS = /* @__PURE__ */ new Set([
  "com.apple.installer",
  "com.apple.diskimagemounter",
  "com.apple.archiveutility"
]);
var EDITOR_IDS = /* @__PURE__ */ new Set([
  "com.microsoft.vscode",
  "com.sublimetext.4",
  "com.sublimetext.3",
  "com.apple.textedit",
  "dev.zed.zed",
  "com.jetbrains.intellij",
  "com.apple.dt.xcode",
  "com.panic.nova"
]);
var VIEWER_IDS = /* @__PURE__ */ new Set(["com.apple.preview", "com.apple.quicktimeplayerx", "org.videolan.vlc"]);
var EXECUTABLE_TYPES = ["public.unix-executable", "public.shell-script", "public.executable"];
var declaredTypes = (appPath) => {
  const plist = join7(appPath, "Contents", "Info.plist");
  const result = spawnSync2(PLUTIL, ["-convert", "json", "-o", "-", "--", plist], {
    encoding: "utf8",
    timeout: TIMEOUT_MS,
    maxBuffer: MAX_BUFFER
  });
  return result.status === 0 && typeof result.stdout === "string" ? result.stdout : "";
};
var known = (id) => {
  if (TERMINAL_IDS.has(id)) return "terminal";
  if (BROWSER_IDS.has(id)) return "browser";
  if (INSTALLER_IDS.has(id)) return "installer";
  if (EDITOR_IDS.has(id)) return "editor";
  return VIEWER_IDS.has(id) ? "viewer" : null;
};
var handlerKind = (appPath, bundleId) => {
  const id = (bundleId ?? "").toLowerCase();
  const listed = id === "" ? null : known(id);
  if (listed !== null) return listed;
  if (appPath === "") return "unknown";
  const types = declaredTypes(appPath);
  return EXECUTABLE_TYPES.some((type) => types.includes(type)) ? "terminal" : "unknown";
};

// src/risk/classify.ts
import { closeSync as closeSync2, lstatSync as lstatSync2, openSync as openSync2, readSync as readSync2, statSync as statSync9 } from "node:fs";
import { basename as basename5, extname as extname2, join as join8 } from "node:path";

// src/risk/classes.ts
var BUNDLE_EXTENSIONS = /* @__PURE__ */ new Set([
  "workflow",
  "action",
  "prefpane",
  "saver",
  "plugin",
  "appex",
  "kext",
  "qlgenerator",
  "framework",
  "terminal",
  "bundle",
  "mdimporter",
  "service",
  "wdgt",
  "xpc",
  "download"
]);
var INSTALLER_EXTENSIONS = /* @__PURE__ */ new Set([
  "pkg",
  "mpkg",
  "dmg",
  "iso",
  "sparsebundle",
  "sparseimage",
  "cdr"
]);
var LOCATOR_EXTENSIONS = /* @__PURE__ */ new Set(["webloc", "url", "inetloc", "shortcut", "fileloc"]);
var SCRIPT_EXTENSIONS = /* @__PURE__ */ new Set([
  "sh",
  "bash",
  "zsh",
  "fish",
  "csh",
  "ksh",
  "command",
  "scpt",
  "scptd",
  "applescript",
  "py",
  "rb",
  "pl",
  "php",
  "lua",
  "ps1",
  "bat",
  "cmd",
  "vbs",
  "jxa",
  "osascript"
]);
var EXECUTABLE_EXTENSIONS = /* @__PURE__ */ new Set(["jar", "exe", "tool", "out", "bin", "so", "dylib"]);
var CODE_EXTENSIONS = /* @__PURE__ */ new Set([
  "ts",
  "tsx",
  "js",
  "jsx",
  "mjs",
  "cjs",
  "json",
  "yml",
  "yaml",
  "toml",
  "ini",
  "conf",
  "c",
  "h",
  "cc",
  "cpp",
  "hpp",
  "m",
  "mm",
  "swift",
  "go",
  "rs",
  "java",
  "kt",
  "cs",
  "sql",
  "graphql",
  "tf",
  "dockerfile",
  "makefile",
  "gradle",
  "xml",
  "plist"
]);
var DOCUMENT_EXTENSIONS = /* @__PURE__ */ new Set([
  "pdf",
  "txt",
  "md",
  "markdown",
  "rtf",
  "rtfd",
  "doc",
  "docx",
  "odt",
  "pages",
  "xls",
  "xlsx",
  "csv",
  "tsv",
  "numbers",
  "ppt",
  "pptx",
  "key",
  "png",
  "jpg",
  "jpeg",
  "gif",
  "heic",
  "heif",
  "webp",
  "svg",
  "tiff",
  "tif",
  "bmp",
  "ico",
  "mp3",
  "m4a",
  "wav",
  "aiff",
  "flac",
  "aac",
  "ogg",
  "mp4",
  "mov",
  "m4v",
  "avi",
  "mkv",
  "webm",
  "mpg",
  "mpeg",
  "epub",
  "zip",
  "gz",
  "tar",
  "ics",
  "vcf",
  "log",
  "html",
  "htm"
]);
var MACHO_MAGIC = /* @__PURE__ */ new Set([
  4277009102,
  4277009103,
  3472551422,
  3489328638,
  3405691582,
  3199925962
]);

// src/risk/classify.ts
var BOOT_PREFIXES = ["/Volumes/"];
var MAGIC_BYTES = 4;
var SHEBANG = 8993;
var ZIP = 1347093252;
var extensionOf = (path) => extname2(basename5(path)).replace(/^\./u, "").toLowerCase();
var readMagic = (path) => {
  let fd;
  try {
    fd = openSync2(path, "r");
    const buffer = Buffer.alloc(MAGIC_BYTES);
    const bytes = readSync2(fd, buffer, 0, MAGIC_BYTES, 0);
    if (bytes >= 2 && buffer.readUInt16BE(0) === SHEBANG) return "shebang";
    if (bytes < MAGIC_BYTES) return "none";
    if (MACHO_MAGIC.has(buffer.readUInt32BE(0))) return "macho";
    return buffer.readUInt32BE(0) === ZIP ? "zip" : "none";
  } catch {
    return "none";
  } finally {
    if (fd !== void 0) closeSync2(fd);
  }
};
var directoryClass = (path) => {
  const extension = extensionOf(path);
  try {
    if (statSync9(join8(path, "Contents", "MacOS")).isDirectory()) return "application";
  } catch {
  }
  if (extension === "app") return "application";
  return BUNDLE_EXTENSIONS.has(extension) ? "bundle" : "directory";
};
var byExtension = (extension) => {
  if (INSTALLER_EXTENSIONS.has(extension)) return "installer";
  if (LOCATOR_EXTENSIONS.has(extension)) return "locator";
  if (SCRIPT_EXTENSIONS.has(extension)) return "script";
  if (EXECUTABLE_EXTENSIONS.has(extension)) return "executable";
  if (CODE_EXTENSIONS.has(extension)) return "code";
  return DOCUMENT_EXTENSIONS.has(extension) ? "document" : null;
};
var fileClass = (path, magic, executableBit) => {
  if (magic === "macho") return "executable";
  if (magic === "shebang") return "script";
  const extension = extensionOf(path);
  const claimed = byExtension(extension);
  if (claimed === "executable" && magic === "zip" && extension === "jar") return "executable";
  if (claimed !== null) return claimed;
  return executableBit ? "executable" : "unknown";
};
var volumeOf = (path) => BOOT_PREFIXES.some((prefix) => path.startsWith(prefix)) ? "external" : "boot";
var missing = (path) => ({
  path,
  realPath: path,
  klass: "unknown",
  exists: false,
  isSymlink: false,
  escapesRoots: true,
  volume: volumeOf(path),
  executableBit: false,
  magic: "none"
});
var classifyPath = (path, roots) => {
  let link;
  try {
    link = lstatSync2(path);
  } catch {
    return missing(path);
  }
  const realPath = realPathOr(path);
  let stats;
  try {
    stats = statSync9(path);
  } catch {
    return { ...missing(path), isSymlink: link.isSymbolicLink() };
  }
  const executableBit = (stats.mode & 73) !== 0;
  const magic = stats.isDirectory() ? "none" : readMagic(path);
  return {
    path,
    realPath,
    klass: stats.isDirectory() ? directoryClass(path) : fileClass(path, magic, executableBit),
    exists: true,
    isSymlink: link.isSymbolicLink(),
    escapesRoots: roots.length > 0 && !roots.some((root) => isUnderRoot(realPath, root)),
    volume: volumeOf(realPath),
    executableBit,
    magic
  };
};

// src/risk/locator.ts
import { spawnSync as spawnSync3 } from "node:child_process";
var PLUTIL2 = "/usr/bin/plutil";
var TIMEOUT_MS2 = 2e3;
var MAX_BUFFER2 = 64 * 1024;
var MAX_URL2 = 2048;
var locatorUrl = (path) => {
  const result = spawnSync3(PLUTIL2, ["-extract", "URL", "raw", "-o", "-", "--", path], {
    encoding: "utf8",
    timeout: TIMEOUT_MS2,
    maxBuffer: MAX_BUFFER2
  });
  if (result.status !== 0 || typeof result.stdout !== "string") return null;
  const url = result.stdout.trim();
  return url === "" || url.length > MAX_URL2 ? null : url;
};

// src/risk/policy.ts
var LADDER = ["allow", "confirm", "verify", "refuse"];
var index = (consent) => LADDER.indexOf(consent);
var bump = (consent) => LADDER[Math.min(index(consent) + 1, LADDER.length - 1)] ?? "refuse";
var atLeast = (a, b) => index(a) >= index(b) ? a : b;
var INERT = /* @__PURE__ */ new Set(["directory", "document", "unknown", "code"]);
var CLASS_BASE = {
  directory: "allow",
  document: "allow",
  unknown: "allow",
  code: "allow",
  locator: "confirm",
  script: "verify",
  executable: "verify",
  application: "verify",
  bundle: "verify",
  installer: "verify"
};
var SCHEME_BASE = {
  web: "allow",
  message: "confirm",
  apple: "confirm",
  custom: "verify",
  forbidden: "refuse",
  // openit never emits `-u file://...`; reaching here at all means something went wrong.
  file: "refuse"
};
var baseConsent = (assessment) => assessment.subject.kind === "path" ? CLASS_BASE[assessment.subject.klass] : SCHEME_BASE[assessment.subject.scheme];
var runsCode = (subject) => subject.kind === "path" && !INERT.has(subject.klass);
var contextual = (assessment, from) => {
  let level = from;
  if (assessment.subject.kind === "url" && assessment.origin !== "literal") level = bump(level);
  if (assessment.quarantined) {
    if (runsCode(assessment.subject)) return "refuse";
    level = bump(level);
  }
  if (assessment.escapesRoots) {
    if (assessment.origin !== "literal" && index(from) >= index("verify")) return "refuse";
    level = bump(level);
  }
  if (assessment.external) level = bump(level);
  return level;
};
var byHandler = (assessment, from) => {
  if (assessment.handlerFromAi && !["viewer", "editor", "browser", "default"].includes(assessment.handler)) return "refuse";
  if (assessment.handler === "terminal") {
    return assessment.origin === "literal" ? atLeast(from, "verify") : "refuse";
  }
  return assessment.handler === "installer" ? atLeast(from, "verify") : from;
};
var requiredConsent = (assessment) => {
  if (assessment.subject.kind === "url" && assessment.subject.hasUserInfo) return "refuse";
  const base = baseConsent(assessment);
  if (base === "refuse") return "refuse";
  if (assessment.reveal && assessment.subject.kind === "path") return "allow";
  const level = byHandler(assessment, contextual(assessment, base));
  if (assessment.origin !== "ai") return level;
  return index(level) >= index("verify") ? "refuse" : atLeast(level, "confirm");
};
var consentRank = index;

// src/risk/quarantine.ts
import { spawnSync as spawnSync4 } from "node:child_process";
var XATTR = "/usr/bin/xattr";
var ATTRIBUTE = "com.apple.quarantine";
var TIMEOUT_MS3 = 2e3;
var MAX_BUFFER3 = 8192;
var USER_APPROVED = 64;
var parseQuarantine = (raw) => {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const [flagField, timeField, agent] = trimmed.split(";");
  const flags3 = Number.parseInt(flagField ?? "", 16);
  if (!Number.isFinite(flags3)) return null;
  const at = Number.parseInt(timeField ?? "", 16);
  return {
    raw: trimmed,
    flags: flags3,
    agent: (agent ?? "").trim(),
    at: Number.isFinite(at) && at > 0 ? at : null,
    userApproved: (flags3 & USER_APPROVED) !== 0
  };
};
var readQuarantine = (path) => {
  const result = spawnSync4(XATTR, ["-p", ATTRIBUTE, "--", path], {
    encoding: "utf8",
    timeout: TIMEOUT_MS3,
    maxBuffer: MAX_BUFFER3
  });
  if (result.status !== 0 || typeof result.stdout !== "string") return null;
  return parseQuarantine(result.stdout);
};

// src/risk/scheme.ts
var FORBIDDEN = /* @__PURE__ */ new Set(["javascript", "data", "vbscript", "about", "blob", "view-source"]);
var WEB = /* @__PURE__ */ new Set(["http", "https"]);
var MESSAGE = /* @__PURE__ */ new Set(["mailto", "tel", "sms", "facetime", "facetime-audio", "imessage"]);
var APPLE = /* @__PURE__ */ new Set(["macappstore", "macappstores", "itms", "itmss", "itms-apps", "prefs"]);
var APPLE_PREFIX = "x-apple-";
var classifyScheme = (scheme2) => {
  const lower = scheme2.toLowerCase().replace(/:$/u, "");
  if (FORBIDDEN.has(lower)) return "forbidden";
  if (WEB.has(lower)) return "web";
  if (lower === "file") return "file";
  if (MESSAGE.has(lower)) return "message";
  if (APPLE.has(lower) || lower.startsWith(APPLE_PREFIX)) return "apple";
  return "custom";
};
var parseUrl = (text) => {
  if (/[\r\n]/u.test(text)) return null;
  let url;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  const scheme2 = url.protocol.replace(/:$/u, "").toLowerCase();
  return {
    url,
    scheme: scheme2,
    klass: classifyScheme(scheme2),
    hasUserInfo: url.username !== "" || url.password !== ""
  };
};

// src/risk/assess.ts
var kindOf = (handler) => {
  if (handler.kind === "command") return "terminal";
  if (handler.kind !== "app") return "default";
  return handlerKind(handler.app.path, handler.app.bundleId);
};
var urlSubject = (url) => ({ kind: "url", scheme: url.klass, hasUserInfo: url.hasUserInfo });
var forUrl = (input, url) => {
  const assessment = {
    subject: urlSubject(url),
    origin: input.origin,
    quarantined: false,
    escapesRoots: false,
    external: false,
    handler: kindOf(input.handler),
    handlerFromAi: input.handlerFromAi,
    reveal: false
  };
  return {
    consent: requiredConsent(assessment),
    assessment,
    facts: null,
    quarantine: null,
    url,
    redirect: null
  };
};
var higher = (a, b) => consentRank(a) >= consentRank(b) ? a : b;
var followLocator = (input, base) => {
  const target = locatorUrl(input.target.ref);
  const redirect = target === null ? null : parseUrl(target);
  if (redirect === null) return { ...base, consent: higher(base.consent, "verify") };
  const inner = requiredConsent({ ...base.assessment, subject: urlSubject(redirect) });
  return { ...base, consent: higher(base.consent, inner), redirect };
};
var assess = (input) => {
  const url = input.target.kind === "url" ? parseUrl(input.target.ref) : null;
  if (input.target.kind === "url") {
    return url === null ? forUrl(input, { url: new URL("about:blank"), scheme: "about", klass: "forbidden", hasUserInfo: false }) : forUrl(input, url);
  }
  const facts = classifyPath(input.target.ref, input.roots);
  const quarantine2 = facts.exists ? readQuarantine(input.target.ref) : null;
  const assessment = {
    subject: { kind: "path", klass: facts.klass },
    origin: input.origin,
    quarantined: quarantine2 !== null && !quarantine2.userApproved,
    escapesRoots: facts.escapesRoots,
    external: facts.volume === "external",
    handler: kindOf(input.handler),
    handlerFromAi: input.handlerFromAi,
    reveal: input.reveal
  };
  const base = {
    consent: requiredConsent(assessment),
    assessment,
    facts,
    quarantine: quarantine2,
    url: null,
    redirect: null
  };
  if (facts.klass !== "locator" || input.reveal) return base;
  return followLocator(input, base);
};

// src/act/open-bin.ts
var SYSTEM_OPEN = "/usr/bin/open";
var resolveOpenBin = () => {
  const override = productEnv("OPEN_BIN");
  if (override !== void 0) return resolveExecutable(override);
  return resolveExecutable(SYSTEM_OPEN);
};
var isOverridden = () => productEnv("OPEN_BIN") !== void 0;

// node_modules/@franzenzenhofer/intent-core/dist/ai/spawn.js
import { spawn } from "node:child_process";

// node_modules/@franzenzenhofer/intent-core/dist/ai/text.js
var CONTROL_MAX = 32;
var DELETE_CODE = 127;
var flattenText = (text, maxLength) => [...text].map((char) => {
  const code = char.codePointAt(0) ?? 0;
  return code < CONTROL_MAX || code === DELETE_CODE ? " " : char;
}).join("").replace(/\s+/gu, " ").trim().slice(0, maxLength);

// node_modules/@franzenzenhofer/intent-core/dist/ai/spawn.js
var KILL_GRACE_MS = 250;
var terminate = (child, signal) => {
  try {
    if (process.platform !== "win32" && child.pid !== void 0)
      process.kill(-child.pid, signal);
    else
      child.kill(signal);
  } catch {
  }
};
var append = (buffer, chunk, max, keep) => {
  buffer.bytes += Buffer.byteLength(chunk);
  if (keep && buffer.bytes <= max)
    buffer.text += chunk;
  return buffer.bytes <= max;
};
var launch = (command, args, limits) => spawn(command, [...args], {
  detached: process.platform !== "win32",
  env: limits.env ?? { ...process.env, NO_COLOR: "1" },
  stdio: ["ignore", "pipe", "pipe"]
});
var pipeOutput = (child, limits, session) => {
  child.stdout?.setEncoding("utf8");
  child.stdout?.on("data", (chunk) => {
    if (!append(session.out, chunk, limits.maxOutputBytes, limits.captureStdout)) {
      session.abort(new Error(`${limits.label} output exceeded ${String(limits.maxOutputBytes)} bytes`));
    }
  });
  child.stderr?.setEncoding("utf8");
  child.stderr?.on("data", (chunk) => {
    append(session.err, chunk, limits.maxStderrBytes, true);
  });
};
var killAfterGrace = (child) => {
  const escalation = setTimeout(() => terminate(child, "SIGKILL"), KILL_GRACE_MS);
  escalation.unref();
};
var createGuard = (child, limits, reject) => {
  let settled = false;
  const stop = () => {
    if (settled)
      return false;
    settled = true;
    clearTimeout(timer);
    return true;
  };
  const abort = (error) => {
    if (!stop())
      return;
    terminate(child, "SIGTERM");
    child.stdout?.destroy();
    child.stderr?.destroy();
    killAfterGrace(child);
    reject(error);
  };
  const timer = setTimeout(() => abort(new Error(`${limits.label} timed out after ${String(limits.timeoutMs)}ms`)), limits.timeoutMs);
  return { stop, abort };
};
var startRun = (run2) => {
  const startedAt = Date.now();
  const child = launch(run2.command, run2.args, run2.limits);
  const out = { text: "", bytes: 0 };
  const err = { text: "", bytes: 0 };
  const guard = createGuard(child, run2.limits, run2.reject);
  pipeOutput(child, run2.limits, { out, err, abort: guard.abort });
  child.on("error", (error) => {
    if (guard.stop())
      run2.reject(error);
  });
  child.on("close", (status) => {
    if (!guard.stop())
      return;
    run2.settle({ status, stdout: out.text, stderr: err.text, durationMs: Date.now() - startedAt });
  });
};
var runContained = (command, args, limits) => new Promise((settle, reject) => {
  startRun({ command, args, limits, settle, reject });
});

// src/act/errors.ts
var MAX_DETAIL = 120;
var OPEN_FRAGMENTS = [
  ["does not exist", "missing-target"],
  ["LSCopyApplicationURLsForBundleIdentifier", "unknown-bundle-id"],
  ["Unable to find application named", "unknown-app"],
  ["No application knows how to open", "no-scheme-handler"]
];
var classify = (stderr) => {
  const found = OPEN_FRAGMENTS.find(([fragment]) => stderr.includes(fragment));
  return found?.[1] ?? "unknown";
};
var scheme = (plan) => {
  if (plan.target.kind !== "url") return "";
  const colon = plan.target.url.indexOf(":");
  return colon === -1 ? plan.target.url : plan.target.url.slice(0, colon);
};
var wording = (failure, plan) => {
  if (failure === "missing-target") {
    return ["it disappeared between the match and the launch", "openit index --refresh"];
  }
  if (failure === "unknown-bundle-id") {
    return ["no installed app claims that bundle id", "name the app instead: openit --with <app> <words>"];
  }
  if (failure === "unknown-app") {
    return ["open was given an app name, which is a bug in openit", "please report this"];
  }
  if (failure === "no-scheme-handler") {
    return [`nothing on this Mac handles ${scheme(plan)}:`, "openit --with <app> <words>"];
  }
  if (failure === "timeout") {
    return ["open did not come back and was stopped", "try again, or check LaunchServices"];
  }
  return ["open refused the launch", "openit doctor"];
};
var translateOpenError = (stderr, plan) => {
  const failure = classify(stderr);
  const [message, hint] = wording(failure, plan);
  const detail = flattenText(stderr, MAX_DETAIL);
  return { failure, message: detail === "" ? message : `${message}: ${detail}`, hint };
};
var timeoutFailure = (plan) => {
  const [message, hint] = wording("timeout", plan);
  return { failure: "timeout", message, hint };
};

// src/act/run.ts
var TIMEOUT_MS4 = 1e4;
var MAX_OUTPUT_BYTES = 64 * 1024;
var MAX_STDERR_BYTES = 4096;
var openTimeoutMs = (plan) => plan.action.wait ? Number.POSITIVE_INFINITY : TIMEOUT_MS4;
var childEnv = (env = process.env) => {
  const prefix = `${product().envPrefix}_`;
  const clean = {};
  for (const [key, value] of Object.entries(env)) {
    if (!key.startsWith(prefix)) clean[key] = value;
  }
  return clean;
};
var runOpen = async (plan) => {
  const timeout = openTimeoutMs(plan);
  try {
    const result = await runContained(plan.command, plan.argv, {
      timeoutMs: Number.isFinite(timeout) ? timeout : 2147483647,
      maxOutputBytes: MAX_OUTPUT_BYTES,
      maxStderrBytes: MAX_STDERR_BYTES,
      label: "open",
      captureStdout: false,
      env: childEnv()
    });
    if (result.status === 0) return { kind: "ok" };
    return { kind: "failed", failure: translateOpenError(result.stderr, openPlanOf(plan)) };
  } catch {
    return { kind: "failed", failure: timeoutFailure(openPlanOf(plan)) };
  }
};
var openPlanOf = (plan) => ({
  target: plan.action.target.kind === "url" ? { kind: "url", url: plan.action.target.ref } : { kind: "path", path: plan.action.target.ref },
  handler: { kind: "default" },
  reveal: false,
  background: false,
  newInstance: false,
  wait: false
});

// src/preview.ts
var line2 = (label, value) => {
  note(`openit:   ${label.padEnd(10)} ${value}`);
};
var flags2 = (assessed) => {
  const found = [];
  if (assessed.quarantine !== null) {
    found.push(`quarantine: ${assessed.quarantine.agent || "unknown"}`);
  }
  if (assessed.facts?.escapesRoots === true) found.push("outside your roots");
  if (assessed.facts?.volume === "external") found.push("external volume");
  if (assessed.redirect !== null) found.push(`points at ${assessed.redirect.url.href}`);
  return found;
};
var preview = (input) => {
  const { plan, assessed } = input;
  const verb = assessed.consent === "refuse" ? "would refuse" : "would open";
  note(`openit: ${verb} ${displayTarget(plan.action.target)}`);
  if (assessed.facts !== null) line2("kind", classDescription(assessed.facts.klass));
  if (assessed.url !== null) line2("kind", `${assessed.url.scheme} link`);
  line2("handler", plan.label === "" ? "the system default" : plan.label);
  line2("origin", `${input.origin} match, score ${String(Math.round(input.score))}`);
  const found = flags2(assessed);
  if (found.length > 0) line2("flags", found.join(", "));
  line2("consent", assessed.consent);
  if (assessed.consent === "refuse") {
    line2("instead", `openit --reveal ${plan.action.target.name} shows it without launching it`);
    return;
  }
  emit(plan.printed);
};
var previewWhich = (input) => {
  if (input.assessed.consent === "refuse") {
    fail(`refused ${displayTarget(input.plan.action.target)}`, "openit --dry-run says why");
    return EXIT.refused;
  }
  emit(input.plan.action.target.ref);
  return EXIT.ok;
};
var previewJson = (input) => {
  const { plan, assessed } = input;
  emit(JSON.stringify({
    v: 1,
    target: {
      kind: plan.action.target.kind,
      ref: plan.action.target.ref,
      display: displayTarget(plan.action.target),
      source: plan.action.target.source
    },
    class: assessed.facts?.klass ?? null,
    scheme: assessed.url?.scheme ?? null,
    handler: { kind: plan.action.handler.kind, label: plan.label },
    origin: input.origin,
    score: Math.round(input.score),
    flags: flags2(assessed),
    consent: assessed.consent,
    command: plan.command,
    argv: plan.argv
  }));
};

// src/commands/act.ts
var DB_FILE2 = "db.json";
var MILLIS_PER_SECOND2 = 1e3;
var remember = (action) => {
  try {
    recordVisit(
      { file: () => stateFile(DB_FILE2), isIdentity },
      action.target.ref,
      Math.floor(Date.now() / MILLIS_PER_SECOND2)
    );
  } catch {
  }
};
var prepare = (input) => {
  const openBin = resolveOpenBin();
  if (openBin === null) return fail("no opener found", "expected /usr/bin/open"), { code: EXIT.error };
  const planned = planAction(input.action, openBin);
  if (!isPlan(planned)) return fail(planned.error), { code: EXIT.error };
  const assessed = assess({
    target: input.action.target,
    handler: input.action.handler,
    origin: input.origin,
    roots: input.roots,
    reveal: input.action.reveal || input.action.handler.kind === "reveal",
    handlerFromAi: input.handlerFromAi
  });
  return { plan: planned, assessed, origin: input.origin, score: input.score };
};
var show = (mode, shown) => {
  if (mode === "json") return previewJson(shown), EXIT.ok;
  if (mode === "which") return previewWhich(shown);
  preview(shown);
  return shown.assessed.consent === "refuse" ? EXIT.refused : EXIT.ok;
};
var launch2 = async (input, planned) => {
  const launched = await runOpen(planned);
  if (launched.kind === "failed") {
    fail(launched.failure.message, launched.failure.hint);
    return EXIT.launchFailed;
  }
  announce(planned.label);
  remember(input.action);
  return EXIT.ok;
};
var act = async (input) => {
  const prepared = prepare(input);
  if ("code" in prepared) return prepared.code;
  if (input.mode !== "run") return show(input.mode, prepared);
  if (prepared.assessed.consent === "refuse") return preview(prepared), EXIT.refused;
  if (!granted(prepared.assessed, prepared.plan)) return EXIT.declined;
  return launch2(input, prepared.plan);
};

// src/commands/query.ts
var buildAction = (query, target, handler, options) => ({
  target,
  handler,
  newInstance: query.newInstance || options.newInstance,
  background: query.background || options.background,
  reveal: query.reveal || options.reveal,
  wait: options.wait
});
var suggest = (query, guesses, config) => {
  fail(`no match for "${query.raw}"`);
  for (const guess of guesses.slice(0, LIMIT.suggestions)) {
    process.stderr.write(`        ${displayTarget(guess.item)}
`);
  }
  const roots = config.roots.length + config.docRoots.length;
  process.stderr.write(`        searched ${String(roots)} ${roots === 1 ? "root" : "roots"}, freshly scanned
`);
  process.stderr.write("        not there? `openit setup --root <path>`, or reach deeper with `--depth <n>`\n");
  return EXIT.noMatch;
};
var chooseTarget = (decision) => {
  if (decision.kind === "hit") return decision.item;
  if (decision.kind !== "choose") return null;
  const chosen = pick(toItems(decision.candidates.map((c) => c.item.ref)));
  if (chosen === null) return null;
  return decision.candidates.find((c) => c.item.ref === chosen)?.item ?? null;
};
var answered = (decision) => {
  const target = chooseTarget(decision);
  if (target === null) return { kind: "declined" };
  return {
    kind: "target",
    resolved: { target, score: decision.kind === "hit" ? decision.score : 0, origin: "deterministic" }
  };
};
var resolve4 = (query, config, context) => {
  let pool = deterministicPool(query, config, context);
  let decision = decideFrom(pool.attempt);
  if (decision.kind === "unsure") {
    pool = rescan(query, pool, config, context);
    decision = decideFrom(pool.attempt);
  }
  if (decision.kind !== "unsure") return answered(decision);
  return { kind: "none", guesses: pool.attempt.ranked };
};
var understand = (args, config, options) => {
  const parsed = tokenizeArgs(args);
  const apps = tier1(config, { version: 0, generatedAt: 0, configKey: "", truncated: null, entries: [] }).apps;
  const names = rootNames(config);
  const withWord = options.withWord ?? parsed.withWord;
  const query = resolveIn(
    { ...parsed, withWord, handlerWord: withWord, handlerExplicit: withWord !== null },
    (word) => names.has(word) || existsSync9(word),
    (word) => apps.apps.some((app) => app.name.toLowerCase().startsWith(word))
  );
  const handler = resolveHandler({ query, apps: apps.apps, rules: config.handlers });
  if (handler.kind === "handler") return { query, handler: handler.handler };
  const closest = handler.closest.length === 0 ? "nothing like it is installed" : `closest: ${handler.closest.join(", ")}`;
  return fail(`no application matches "${handler.word}"`, closest), EXIT.noMatch;
};
var runQuery = async (args, options) => {
  if (tokenizeArgs(args).tokens.length === 0) {
    return fail("nothing to open", "usage: openit <words describing what to open>"), EXIT.error;
  }
  const config = loadConfig();
  const understood = understand(args, config, options);
  if (typeof understood === "number") return understood;
  const { query, handler } = understood;
  const run2 = (target2, score2, origin2) => act({
    action: buildAction(query, target2, handler, options),
    origin: origin2,
    roots: allRoots(config),
    score: score2,
    handlerFromAi: false,
    mode: options.mode
  });
  const literal = literalTarget(args);
  if (literal !== null) return run2(literal, LITERAL_SCORE, "literal");
  if (config.roots.length === 0 && config.docRoots.length === 0) {
    return fail("no roots configured", "run `openit setup` once to pick what to learn"), EXIT.error;
  }
  const resolution = resolve4(query, config, scoreContext(config));
  if (resolution.kind === "declined") return EXIT.declined;
  if (resolution.kind === "none") return suggest(query, resolution.guesses, config);
  const { target, score, origin } = resolution.resolved;
  return run2(target, score, origin);
};

// node_modules/@franzenzenhofer/intent-core/dist/ai/backend.js
import { basename as basename6 } from "node:path";
var AUTO_COMMANDS = ["apfel", "claude", "gemini"];
var DEFAULT_MODEL = { claude: "sonnet" };
var backendKind = (command) => {
  const name = basename6(command).toLowerCase();
  if (name === "apfel")
    return "apfel";
  if (name === "claude")
    return "claude";
  if (name === "gemini")
    return "gemini";
  if (name === "ollama")
    return "ollama";
  return "custom";
};
var backend = (command, ai) => {
  const kind = backendKind(command);
  return {
    kind,
    command,
    model: ai.model.trim() || DEFAULT_MODEL[kind] || "",
    extraArgs: ai.args
  };
};
var resolveAuto = (ai, resolveCommand) => {
  for (const command of AUTO_COMMANDS) {
    const executable = resolveCommand(command);
    if (executable !== null)
      return backend(executable, ai);
  }
  if (ai.model.trim() !== "") {
    const ollama = resolveCommand("ollama");
    if (ollama !== null)
      return backend(ollama, ai);
  }
  return null;
};
var resolveAiBackend = (ai, resolveCommand = resolveExecutable) => {
  if (ai.command === "auto")
    return resolveAuto(ai, resolveCommand);
  const executable = resolveCommand(ai.command);
  if (executable === null)
    return null;
  const resolved = backend(executable, ai);
  return resolved.kind === "ollama" && resolved.model === "" ? null : resolved;
};
var backendLabel = (target) => target.model === "" ? target.kind : `${target.kind} ${target.model}`;

// src/commands/detect.ts
import { existsSync as existsSync10, statSync as statSync10 } from "node:fs";
import { homedir as homedir3 } from "node:os";
import { join as join9 } from "node:path";
var PROJECT_DIRS = ["dev", "code", "src", "projects", "work", "Developer", "repos", "git"];
var DOC_DIRS = [
  ["Downloads", 1],
  ["Desktop", 1],
  ["Documents", 2],
  [join9("Pictures", "Screenshots"), 1]
];
var CLOUD_HINTS = ["Dropbox", "Library/CloudStorage", "iCloud Drive"];
var isDir = (path) => {
  try {
    return existsSync10(path) && statSync10(path).isDirectory();
  } catch {
    return false;
  }
};
var detectRoots = () => {
  const home = homedir3();
  const found = PROJECT_DIRS.map((name) => join9(home, name)).filter(isDir);
  const cloud = CLOUD_HINTS.map((name) => join9(home, name)).filter(isDir);
  return [...found, ...cloud].map((path) => ({ path, depth: DEFAULT_DEPTH }));
};
var detectDocRoots = () => {
  const home = homedir3();
  return DOC_DIRS.map(([name, depth]) => ({ path: join9(home, name), depth })).filter((root) => isDir(root.path));
};

// src/commands/setup.ts
var EMPTY2 = {
  yes: false,
  ai: null,
  history: null,
  roots: [],
  depth: null,
  remove: [],
  error: null
};
var parseSetup = (args) => {
  let options = EMPTY2;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    const next = args[i + 1];
    if (arg === "--yes" || arg === "-y") options = { ...options, yes: true };
    else if (arg === "--ai") options = { ...options, ai: true };
    else if (arg === "--no-ai") options = { ...options, ai: false };
    else if (arg === "--history") options = { ...options, history: true };
    else if (arg === "--no-history") options = { ...options, history: false };
    else if (arg === "--root" && next !== void 0) {
      options = { ...options, roots: [...options.roots, absolutize(next)] };
      i += 1;
    } else if (arg === "--remove-root" && next !== void 0) {
      options = { ...options, remove: [...options.remove, absolutize(next)] };
      i += 1;
    } else if (arg === "--depth" && next !== void 0) {
      options = { ...options, depth: Number.parseInt(next, 10) };
      i += 1;
    } else options = { ...options, error: `unknown option ${String(arg)}` };
  }
  return options;
};
var merged = (current2, options) => {
  const depth = options.depth ?? DEFAULT_DEPTH;
  const detected = current2.roots.length === 0 ? detectRoots() : [...current2.roots];
  const added = options.roots.map((path) => ({ path, depth }));
  const roots = [...detected, ...added].filter((root) => !options.remove.includes(root.path)).filter((root, i, all) => all.findIndex((other) => other.path === root.path) === i);
  return {
    ...current2,
    roots,
    docRoots: current2.docRoots.length === 0 ? detectDocRoots() : current2.docRoots,
    ignore: current2.ignore.length === 0 ? DEFAULT_IGNORE : current2.ignore,
    history: options.history ?? current2.history,
    ai: { ...current2.ai, enabled: options.ai ?? current2.ai.enabled }
  };
};
var disclose = (config) => {
  if (!config.ai.enabled) {
    note("openit: AI tier off - deterministic matching only");
    return;
  }
  const backend2 = resolveAiBackend(config.ai);
  const label = backend2 === null ? "none found yet" : backendLabel(backend2);
  note(`openit: AI tier on (${label})`);
  note("        when nothing matches, your words and up to 40 candidate names may be sent to it");
  note("        file contents, full URLs and anything outside your roots are never sent");
};
var runSetup = (args) => {
  const options = parseSetup(args);
  if (options.error !== null) return fail(options.error), EXIT.error;
  const current2 = loadConfig();
  const next = merged(current2.roots.length === 0 ? emptyConfig() : current2, options);
  if (next.roots.length === 0 && next.docRoots.length === 0) {
    return fail("found nothing to learn", "openit setup --root <path>"), EXIT.error;
  }
  note("openit: roots");
  for (const root of next.roots) note(`          ${contractTilde(root.path)} (depth ${String(root.depth)})`);
  for (const root of next.docRoots) note(`          ${contractTilde(root.path)} (files, depth ${String(root.depth)})`);
  disclose(next);
  if (!options.yes && hasTty() && !confirm("openit: save this?")) return EXIT.declined;
  saveConfig(next);
  const index2 = refreshIndex(next);
  saveAppIndex(buildAppIndex());
  note(`openit: indexed ${String(index2.entries.length)} directories`);
  note("openit: try `openit doctor`, then `openit --dry-run latest screenshot`");
  return EXIT.ok;
};

// src/commands/doctor.ts
import { existsSync as existsSync11 } from "node:fs";
var say = (label, value) => note(`  ${label.padEnd(12)} ${value}`);
var opener = () => {
  const bin = resolveOpenBin();
  if (isOverridden()) {
    say("opener", `${bin ?? "not found"}  \u2190 OPENIT_OPEN_BIN is set, this is NOT the system opener`);
    return;
  }
  say("opener", bin ?? `${SYSTEM_OPEN} (missing)`);
};
var runDoctor = () => {
  const config = loadConfig();
  note("openit doctor");
  say("node", process.version);
  say("config", `${contractTilde(configFile())}${existsSync11(configFile()) ? "" : " (not written yet)"}`);
  say("data", contractTilde(dataDir()));
  say("private", hasPrivateMode(dataDir(), true) ? "yes (0700)" : "no - run any openit command to tighten");
  opener();
  for (const root of config.roots) say("root", `${contractTilde(root.path)} depth ${String(root.depth)}`);
  for (const root of config.docRoots) say("docs", `${contractTilde(root.path)} depth ${String(root.depth)}`);
  const index2 = loadIndex();
  say("index", `${String(index2.entries.length)} directories${index2.truncated === null ? "" : ` (truncated: ${index2.truncated})`}`);
  say("files", String(docTargets(config.docRoots, config.ignore).length));
  say("apps", String(loadAppIndex().apps.length));
  const db = loadVisits({ file: () => stateFile("db.json"), isIdentity });
  say("history", `${String(db.records.length)} remembered opens`);
  const backend2 = config.ai.enabled ? resolveAiBackend(config.ai) : null;
  say("ai", config.ai.enabled ? backend2 === null ? "enabled, no backend found" : backendLabel(backend2) : "off");
  say("fzf", resolveExecutable("fzf") ?? "not installed (numbered picker)");
  say("tty", hasTty() ? "yes" : "no - consent fails closed");
  return EXIT.ok;
};

// src/commands/index-cmd.ts
var runIndex = (args) => {
  const refresh = args.includes("--refresh");
  const unknown = args.find((arg) => arg !== "--refresh");
  if (unknown !== void 0) return fail(`unknown option ${unknown}`, "usage: openit index [--refresh]"), EXIT.error;
  const config = loadConfig();
  const index2 = refresh ? refreshIndex(config) : loadIndex();
  const apps = refresh ? buildAppIndex() : loadAppIndex();
  if (refresh) saveAppIndex(apps);
  const docs = docTargets(config.docRoots, config.ignore);
  note(`openit: ${String(index2.entries.length)} directories under ${String(config.roots.length)} roots`);
  if (index2.truncated !== null) note(`        crawl stopped early (${index2.truncated})`);
  note(`openit: ${String(docs.length)} files in ${String(config.docRoots.length)} document roots`);
  note(`openit: ${String(apps.apps.length)} applications`);
  for (const root of config.roots) note(`          ${contractTilde(root.path)}`);
  return EXIT.ok;
};

// src/cli.ts
setProduct({ name: "openit", envPrefix: "OPENIT" });
var VERSION2 = `openit ${package_default.version}`;
var USAGE = `openit - say what to open, it works out what and with what, then opens it

openit <words>                open the thing you mean
openit --with <app> <words>   name the handler yourself
openit --reveal <words>       show it in Finder, launch nothing
openit --new|--background|--wait
openit --dry-run <words>      print the plan, spawn nothing
openit plan -- <words>        one JSON object on stdout
openit which -- <words>       the resolved path or URL on stdout
openit setup [--yes] [--root <path>] [--depth <n>] [--ai|--no-ai]
openit index [--refresh]      show or rebuild what openit knows
openit doctor                 show what openit sees on this machine
openit --version

Exit codes: 0 opened, 1 error, 3 declined, 4 no match, 5 refused, 6 open failed.
stdout carries the plan and nothing else; every human-readable byte goes to stderr.`;
var queryArgs = (args) => {
  const rest = args.slice(1);
  return rest[0] === "--" ? rest.slice(1) : rest;
};
var run = async (args, mode) => {
  const parsed = parseArgs(args);
  if (parsed.error !== null) return fail(parsed.error, USAGE.split("\n")[2] ?? ""), EXIT.error;
  return runQuery(parsed.words, { ...parsed.options, mode: mode === "run" ? parsed.options.mode : mode });
};
var dispatch = async (args) => {
  const command = args[0];
  if (command === void 0 || command === "--help" || command === "-h") {
    note(USAGE);
    return command === void 0 ? EXIT.error : EXIT.ok;
  }
  if (command === "--version" || command === "-v") {
    note(VERSION2);
    return EXIT.ok;
  }
  if (command === "setup") return runSetup(args.slice(1));
  if (command === "doctor") return runDoctor();
  if (command === "index") return runIndex(args.slice(1));
  if (command === "plan") return run(queryArgs(args), "json");
  if (command === "which") return run(queryArgs(args), "which");
  return run(args, "run");
};
var main = async (argv) => {
  try {
    secureExistingState();
    return await dispatch(argv);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
    return EXIT.error;
  }
};
process.exitCode = await main(process.argv.slice(2));
export {
  main
};
