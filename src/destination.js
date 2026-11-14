import { normalizeSelection } from './vin.js';

/**
 * The address a click opens. It is a stable entry address owned by the
 * destination, which decides where it leads. Keep the origin and path in this
 * one constant so nothing else in the extension can drift from it.
 *
 * It must target the decode entry, never a vehicle page path; a test pins the
 * exact value.
 */
export const ENTRY_URL = 'https://decodethis.com/x/decode';

/**
 * Build the address to open for a text selection.
 *
 * The `vin` parameter is always present, even when empty, so there is exactly
 * one code path and the destination always decides what to do with it. It is the
 * only parameter this extension sends. The value is normalized to A-Z and 0-9,
 * so a selection cannot add or override parameters.
 *
 * @param {unknown} selectionText
 * @returns {string}
 */
export function buildDecodeUrl(selectionText) {
  return `${ENTRY_URL}?vin=${encodeURIComponent(normalizeSelection(selectionText))}`;
}
