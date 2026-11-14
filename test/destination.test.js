import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDecodeUrl, ENTRY_URL } from '../src/destination.js';
import { MAX_NORMALIZED_LENGTH } from '../src/vin.js';

test('points at the entry path, never a vehicle page', () => {
  const url = buildDecodeUrl('K7M2A004171');
  assert.equal(url, 'https://decodethis.com/x/decode?vin=K7M2A004171');
  assert.ok(!url.includes('/web/vin/'));
});

test('the entry URL is pinned to one exported constant', () => {
  assert.equal(ENTRY_URL, 'https://decodethis.com/x/decode');
  assert.ok(buildDecodeUrl('ABC12').startsWith(`${ENTRY_URL}?vin=`));
});

test('is an https URL on the decodethis.com origin', () => {
  const url = new URL(buildDecodeUrl('K7M2A004171'));
  assert.equal(url.protocol, 'https:');
  assert.equal(url.host, 'decodethis.com');
  assert.equal(url.pathname, '/x/decode');
  assert.equal(url.hash, '');
});

test('normalizes before building', () => {
  assert.equal(buildDecodeUrl(' xq5/rt/123456/z '), 'https://decodethis.com/x/decode?vin=XQ5RT123456Z');
});

test('emits an empty vin param rather than no param when nothing survives', () => {
  assert.equal(buildDecodeUrl('\u2014 \u2014 \u2014'), 'https://decodethis.com/x/decode?vin=');
  assert.equal(buildDecodeUrl(''), 'https://decodethis.com/x/decode?vin=');
  assert.equal(buildDecodeUrl(undefined), 'https://decodethis.com/x/decode?vin=');
});

test('sends only the vin parameter', () => {
  const url = new URL(buildDecodeUrl('K7M2A004171'));
  assert.deepEqual([...url.searchParams.keys()], ['vin']);
});

test('a selection cannot add or override parameters', () => {
  // "&" and "=" are stripped, so they cannot introduce a second parameter or a second vin.
  const url = new URL(buildDecodeUrl('X&foo=evil&vin=Y#frag'));
  assert.deepEqual([...url.searchParams.keys()], ['vin']);
  assert.equal(url.searchParams.get('vin'), 'XFOOEVILVINYFRAG');
  assert.equal(url.hash, '');
});

test('a whole paragraph still produces a bounded URL', () => {
  const url = buildDecodeUrl('A long paragraph with many words and numbers 1 2 3 '.repeat(40));
  assert.ok(url.length <= `${ENTRY_URL}?vin=`.length + MAX_NORMALIZED_LENGTH);
});

test('non-ASCII characters never survive into the URL', () => {
  const url = buildDecodeUrl('\uff11\uff12\uff13\u00c0BC\u2014\u{1f600}');
  assert.equal(url, 'https://decodethis.com/x/decode?vin=BC');
  assert.match(url, /^[\x20-\x7e]+$/);
});
