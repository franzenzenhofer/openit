import type { TargetClass } from './classes.js';

/**
 * The word a `verify` prompt demands. Derived from the structural class, NEVER from the name:
 * a filename can carry a right-to-left override and render as something else entirely, so
 * asking someone to retype what they see would be asking them to confirm the lie.
 */
export const verifyWord = (klass: TargetClass, scheme: string, runsIt = false): string => {
  // A taught command or a terminal runs the thing whatever the thing is, so that is the word.
  if (runsIt) return 'run';
  if (klass === 'application') return 'application';
  if (klass === 'installer') return 'installer';
  if (klass === 'script') return 'script';
  if (klass === 'executable') return 'executable';
  if (klass === 'bundle') return 'bundle';
  return scheme === '' ? 'open' : scheme;
};

/** What the prompt says this thing is, in words, above the question. */
export const classDescription = (klass: TargetClass): string => {
  const said: Record<TargetClass, string> = {
    application: 'an APPLICATION BUNDLE (it contains Contents/MacOS/) - opening it runs its code as you',
    installer: 'an INSTALLER or DISK IMAGE - opening it mounts or installs something',
    script: 'a SCRIPT - opening it can run its contents',
    executable: 'an EXECUTABLE - opening it runs it',
    bundle: 'a PACKAGE that runs code when opened',
    locator: 'a LOCATOR - it redirects somewhere else',
    code: 'source code',
    document: 'a document',
    directory: 'a folder',
    unknown: 'an unidentified file',
  };
  return said[klass];
};
