/** POSIX single-quoting, so a printed plan can be pasted into a shell unchanged. */
export const shellQuote = (value: string): string => `'${value.replaceAll("'", `'\\''`)}'`;

export const quoteArgv = (command: string, argv: readonly string[]): string =>
  [command, ...argv].map(shellQuote).join(' ');
