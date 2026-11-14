import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSelection, ACCEPTED_LENGTHS, MAX_NORMALIZED_LENGTH } from '../src/vin.js';

test('strips separators', () => {
  assert.equal(normalizeSelection('XQ5/RT/123456/Z'), 'XQ5RT123456Z');
});

test('trims surrounding whitespace and newlines', () => {
  assert.equal(normalizeSelection('\n  K7M2A004171 \t'), 'K7M2A004171');
});

test('removes whitespace inside the selection too', () => {
  assert.equal(normalizeSelection('K7M2A\n004 171'), 'K7M2A004171');
});

test('uppercases', () => {
  assert.equal(normalizeSelection('1a2bc34d5ef678901'), '1A2BC34D5EF678901');
});

test('canonicalizes a mixed-case selection', () => {
  assert.equal(normalizeSelection('1A2bC34d5Ef678901'), '1A2BC34D5EF678901');
});

test('drops non-ASCII characters', () => {
  assert.equal(normalizeSelection('\uff11\uff12\uff13ABC'), 'ABC');
});

test('drops accented letters and emoji rather than folding them', () => {
  assert.equal(normalizeSelection('CAF\u00c9123'), 'CAF123');
  assert.equal(normalizeSelection('\u{1f600}ABC\u{1f600}'), 'ABC');
});

test('does not let uppercasing or case-folding turn non-ASCII into ASCII', () => {
  // U+0131 dotless i uppercases to "I"; U+017F long s uppercases to "S";
  // U+212A Kelvin sign case-folds to "k"; U+FB01 uppercases to "FI".
  // Stripping must happen before uppercasing, with no case-insensitive match.
  assert.equal(normalizeSelection('\u0131\u017f\u212a\ufb01'), '');
  assert.equal(normalizeSelection('A\u0131B'), 'AB');
});

test('keeps I, O and Q', () => {
  assert.equal(normalizeSelection('IOQ123'), 'IOQ123');
});

test('returns empty string for a selection with nothing alphanumeric', () => {
  assert.equal(normalizeSelection('\u2014 \u2014 \u2014'), '');
  assert.equal(normalizeSelection('   \n\t '), '');
  assert.equal(normalizeSelection(''), '');
});

test('returns empty string when given something that is not a string', () => {
  assert.equal(normalizeSelection(undefined), '');
  assert.equal(normalizeSelection(null), '');
  assert.equal(normalizeSelection(12345), '');
});

test('caps the result at 64 characters', () => {
  assert.equal(normalizeSelection('A'.repeat(200)).length, 64);
});

test('the cap is exactly 64: 64 passes whole, 65 is cut', () => {
  assert.equal(normalizeSelection('B'.repeat(64)), 'B'.repeat(64));
  assert.equal(normalizeSelection('B'.repeat(65)), 'B'.repeat(64));
});

test('the cap applies to the normalized text, not the raw selection', () => {
  // 200 raw characters, only 100 of them alphanumeric: all 64 kept slots are filled
  // from the normalized text, so separators never eat into the budget.
  assert.equal(normalizeSelection('A-'.repeat(100)), 'A'.repeat(64));
});

test('a whole paragraph yields a short, URL-safe result', () => {
  const paragraph =
    'Chrome will hand over an entire paragraph if you select one, and an unbounded string is not ' +
    'something a VIN field ever holds, so this sentence exists to see how a long label is shown.';
  const out = normalizeSelection(paragraph);
  assert.equal(out.length, 64);
  assert.match(out, /^[A-Z0-9]+$/);
});

test('output only ever contains A-Z and 0-9', () => {
  const nasty = [
    'AB\u0000CD', 'AB\u200bCD', 'AB\u202eCD', 'AB\u00a0CD', 'a?b&c=d#e%f/g\\h',
    'K7M2A004171&foo=evil', '<script>alert(1)</script>', '"quoted" \'single\'',
  ];
  for (const input of nasty) {
    assert.match(normalizeSelection(input), /^[A-Z0-9]*$/, `unexpected characters from ${JSON.stringify(input)}`);
  }
});

test('truncation can never produce a length the destination accepts', () => {
  // The cap only ever cuts strings longer than MAX_NORMALIZED_LENGTH. It must sit above every
  // accepted length, or truncating a long selection could turn it into a plausible-looking VIN.
  assert.ok(MAX_NORMALIZED_LENGTH > ACCEPTED_LENGTHS.max);
  assert.ok(MAX_NORMALIZED_LENGTH > ACCEPTED_LENGTHS.exact);
});

test('documents the accepted length contract without enforcing it', () => {
  assert.deepEqual({ ...ACCEPTED_LENGTHS }, { min: 5, max: 14, exact: 17 });
  // Deliberately not a gate: short, long and odd-length selections all pass through unchanged.
  assert.equal(normalizeSelection('A'), 'A');
  assert.equal(normalizeSelection('ABCDEFGHIJKLMNOPQR'), 'ABCDEFGHIJKLMNOPQR');
});
