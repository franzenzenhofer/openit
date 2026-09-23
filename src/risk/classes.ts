/**
 * What a thing is, structurally. Not what it is called: a name is attacker-controlled text and
 * an extension is a hint, so these classes are decided by shape and bytes wherever possible and
 * only fall back to the extension when nothing else can tell.
 */
export type TargetClass =
  /** A plain folder. open(1) shows it in Finder. */
  | 'directory'
  /** Inert: text, image, pdf, audio, video, office. */
  | 'document'
  /** It exists and nothing identifies it. Treated as a document. */
  | 'unknown'
  /** Source text that a misconfigured handler could execute. */
  | 'code'
  /** A redirect to somewhere else: .webloc, .url, .inetloc. */
  | 'locator'
  /** A shebang, an executable bit, or a scripting extension. */
  | 'script'
  /** Mach-O, .command, .tool, .jar. */
  | 'executable'
  /** .pkg .mpkg .dmg .iso .sparsebundle. */
  | 'installer'
  /** A .app, or ANY directory containing Contents/MacOS/. */
  | 'application'
  /** Any other package directory: .workflow .prefPane .saver .plugin .kext .terminal. */
  | 'bundle';

/** Package directories that are not applications but still run code when opened. */
export const BUNDLE_EXTENSIONS = new Set([
  'workflow', 'action', 'prefpane', 'saver', 'plugin', 'appex', 'kext', 'qlgenerator',
  'framework', 'terminal', 'bundle', 'mdimporter', 'service', 'wdgt', 'xpc', 'download',
]);

export const INSTALLER_EXTENSIONS = new Set([
  'pkg', 'mpkg', 'dmg', 'iso', 'sparsebundle', 'sparseimage', 'cdr',
]);

export const LOCATOR_EXTENSIONS = new Set(['webloc', 'url', 'inetloc', 'shortcut', 'fileloc']);

export const SCRIPT_EXTENSIONS = new Set([
  'sh', 'bash', 'zsh', 'fish', 'csh', 'ksh', 'command', 'scpt', 'scptd', 'applescript',
  'py', 'rb', 'pl', 'php', 'lua', 'ps1', 'bat', 'cmd', 'vbs', 'jxa', 'osascript',
]);

export const EXECUTABLE_EXTENSIONS = new Set(['jar', 'exe', 'tool', 'out', 'bin', 'so', 'dylib']);

/** Source text: inert on a double-click, executable the moment a handler decides to run it. */
export const CODE_EXTENSIONS = new Set([
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'json', 'yml', 'yaml', 'toml', 'ini', 'conf',
  'c', 'h', 'cc', 'cpp', 'hpp', 'm', 'mm', 'swift', 'go', 'rs', 'java', 'kt', 'cs',
  'sql', 'graphql', 'tf', 'dockerfile', 'makefile', 'gradle', 'xml', 'plist',
]);

export const DOCUMENT_EXTENSIONS = new Set([
  'pdf', 'txt', 'md', 'markdown', 'rtf', 'rtfd', 'doc', 'docx', 'odt', 'pages',
  'xls', 'xlsx', 'csv', 'tsv', 'numbers', 'ppt', 'pptx', 'key',
  'png', 'jpg', 'jpeg', 'gif', 'heic', 'heif', 'webp', 'svg', 'tiff', 'tif', 'bmp', 'ico',
  'mp3', 'm4a', 'wav', 'aiff', 'flac', 'aac', 'ogg',
  'mp4', 'mov', 'm4v', 'avi', 'mkv', 'webm', 'mpg', 'mpeg',
  'epub', 'zip', 'gz', 'tar', 'ics', 'vcf', 'log', 'html', 'htm',
]);

/** Mach-O in every byte order and width, plus the fat-binary header. */
export const MACHO_MAGIC = new Set([
  0xfeedface, 0xfeedfacf, 0xcefaedfe, 0xcffaedfe, 0xcafebabe, 0xbebafeca,
]);
