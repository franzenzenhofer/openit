/**
 * One line of plain, visually honest text.
 *
 * Removes exactly the code points that let a string lie about what it is: C0/C1 controls, bidi
 * overrides and isolates, zero-width characters and joiners, the soft hyphen, variation
 * selectors, the Unicode tag block (the "invisible instruction" carrier) and the private use
 * areas. NFC first, so a decomposed lookalike cannot slip past the filter and recompose after.
 *
 * This runs over everything openit puts in a prompt AND everything it prints: candidate names
 * come from downloaded files and visited pages, so a filename must not be able to reshape the
 * line that asks whether to open it.
 */

/**
 * Code point ranges, not a regular expression character class. Written this way so each range
 * can be read and justified on its own line, and so that filtering is done one whole code point
 * at a time - a character class spanning the astral planes is exactly the kind of regex whose
 * surrogate handling a reader has to take on trust.
 */
const LYING: readonly (readonly [number, number])[] = [
  [0x0000, 0x001f], [0x007f, 0x009f], // C0 and C1 controls
  [0x00ad, 0x00ad],                   // soft hyphen
  [0x200b, 0x200f],                   // zero width, and the LTR/RTL marks
  [0x202a, 0x202e],                   // bidi embeddings and overrides
  [0x2060, 0x2064], [0x2066, 0x2069], // word joiner, invisible operators, bidi isolates
  [0xfeff, 0xfeff],                   // byte order mark
  [0xfe00, 0xfe0f],                   // variation selectors
  [0xe000, 0xf8ff],                   // private use area
  [0xe0000, 0xe007f],                 // the tag block: invisible instruction carrier
  [0xf0000, 0x10fffd],                // supplementary private use areas
];

const lies = (codePoint: number): boolean =>
  LYING.some(([low, high]) => codePoint >= low && codePoint <= high);

const ELLIPSIS = '…';

/** True when the text carries at least one code point that would misrepresent it. */
export const isHonest = (text: string): boolean =>
  ![...text].some((char) => lies(char.codePointAt(0) ?? 0));

export const sanitizeLabel = (text: string, max: number): string => {
  const kept = [...text.normalize('NFC')]
    .filter((char) => !lies(char.codePointAt(0) ?? 0))
    .join('');
  const flattened = kept.replace(/\s+/gu, ' ').trim();
  const graphemes = [...flattened];
  return graphemes.length <= max ? flattened : `${graphemes.slice(0, max - 1).join('')}${ELLIPSIS}`;
};
