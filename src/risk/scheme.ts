export type SchemeClass = 'web' | 'file' | 'message' | 'apple' | 'custom' | 'forbidden';

/** Never opened, from any source, at any consent level. */
const FORBIDDEN = new Set(['javascript', 'data', 'vbscript', 'about', 'blob', 'view-source']);
const WEB = new Set(['http', 'https']);
const MESSAGE = new Set(['mailto', 'tel', 'sms', 'facetime', 'facetime-audio', 'imessage']);
const APPLE = new Set(['macappstore', 'macappstores', 'itms', 'itmss', 'itms-apps', 'prefs']);
const APPLE_PREFIX = 'x-apple-';

export interface ParsedUrl {
  readonly url: URL;
  readonly scheme: string;
  readonly klass: SchemeClass;
  /** user:pass@ in a URL is never something openit should carry into a browser. */
  readonly hasUserInfo: boolean;
}

export const classifyScheme = (scheme: string): SchemeClass => {
  const lower = scheme.toLowerCase().replace(/:$/u, '');
  if (FORBIDDEN.has(lower)) return 'forbidden';
  if (WEB.has(lower)) return 'web';
  if (lower === 'file') return 'file';
  if (MESSAGE.has(lower)) return 'message';
  if (APPLE.has(lower) || lower.startsWith(APPLE_PREFIX)) return 'apple';
  return 'custom';
};

/** Null when the text is not a URL at all. A URL that parses is re-serialized, never echoed. */
export const parseUrl = (text: string): ParsedUrl | null => {
  if (/[\r\n]/u.test(text)) return null;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  const scheme = url.protocol.replace(/:$/u, '').toLowerCase();
  return {
    url,
    scheme,
    klass: classifyScheme(scheme),
    hasUserInfo: url.username !== '' || url.password !== '',
  };
};

/** The host plus the first path segment, which is all a model is ever told about a link. */
export const urlShape = (url: URL): { site: string; route: string } => {
  const first = url.pathname.split('/').filter((part) => part !== '')[0] ?? '';
  return { site: url.hostname, route: first === '' ? '/' : `/${first}` };
};
