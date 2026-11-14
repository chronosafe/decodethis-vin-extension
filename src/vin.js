/**
 * The destination's documented length contract: 5-14 characters, or exactly 17.
 *
 * This is recorded here for reference and is deliberately NOT enforced by the
 * extension. The destination decides what is decodable, and a menu click that
 * silently does nothing reads as broken, so the extension never refuses to open
 * a tab on length grounds.
 */
export const ACCEPTED_LENGTHS = Object.freeze({ min: 5, max: 14, exact: 17 });

/**
 * Upper bound on the normalized text.
 *
 * Chrome shortens the menu label but hands the click handler the entire
 * selection, however long, so nothing else bounds the address we build. This
 * cap does. It sits well above every accepted length, so cutting a long
 * selection down to it can never produce a string of an accepted length.
 */
export const MAX_NORMALIZED_LENGTH = 64;

/**
 * Reduce a text selection to the characters a VIN or chassis number can hold.
 *
 * Every character outside ASCII A-Z, a-z and 0-9 is removed (separators,
 * whitespace, punctuation, and anything non-ASCII), the rest is uppercased, and
 * at most MAX_NORMALIZED_LENGTH characters are kept. Returns an empty string if
 * nothing survives or if the input is not a string.
 *
 * Order matters: stripping happens BEFORE uppercasing, and the pattern has no
 * case-insensitive flag. Case mapping and case folding can turn some non-ASCII
 * characters into ASCII ones (dotless i becomes "I", long s becomes "S", the
 * Kelvin sign matches "k"), and those must not slip through.
 *
 * @param {unknown} text
 * @returns {string}
 */
export function normalizeSelection(text) {
  if (typeof text !== 'string') return '';
  return text
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase()
    .slice(0, MAX_NORMALIZED_LENGTH);
}
