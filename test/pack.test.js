import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';

// scripts/pack.sh lists its files explicitly so nothing unintended is ever uploaded. The price of an explicit list is
// that it can fall behind the source: add a module, import it, forget the list, and the packed extension is broken.
// These tests keep the list and the source in step without needing the zip tool, and keep the script from growing
// a second way to put files into the archive.

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const lines = read('scripts/pack.sh').split('\n');
const manifest = JSON.parse(read('manifest.json'));

// The file list is the one `set --` line, reused as "$@" by the zip command.
const listLines = lines.filter((line) => /^\s*set\s+--\s/.test(line));
const packed = new Set(listLines.length === 1 ? listLines[0].trim().split(/\s+/).slice(2) : []);
const IMPORT_FROM = /^\s*import\s+(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]/gm;

test('the pack script has exactly one file list and one zip command, which uses that list and nothing else', () => {
  assert.equal(listLines.length, 1, 'one `set -- ...` line holds the file list');
  assert.ok(packed.size >= 7);
  for (const file of packed) assert.match(file, /^[A-Za-z0-9][A-Za-z0-9._/-]*$/, `${file} must be a plain named path (no glob, variable or directory)`);

  // Judge only the code lines: no comments, blank lines or echoed messages. A tripwire for the common ways to add
  // a second command or change the list, not a proof: every line that mentions zip or set must be one of a few known lines.
  const code = lines.map((line) => line.trim()).filter((line) => line && !line.startsWith('#') && !line.startsWith('echo '));
  const zipLines = code.filter((line) => /\bzip\b/.test(line));
  const notCommands = ['for tool in zip unzip; do', 'out=dist/decodethis-vin-lookup.zip']; // a loop over tool names and the output file name
  assert.deepEqual(zipLines.filter((line) => !notCommands.includes(line)), ['zip -X -q "$tmp" "$@"'], 'the only zip command is the plain one over "$@"');
  const setLines = code.filter((line) => /\bset\b/.test(line));
  assert.deepEqual(setLines.filter((line) => line !== 'set -eu'), [listLines[0].trim()], 'the only other `set` is the file list');
  for (const line of code) assert.doesNotMatch(line, /\b(eval|xargs|source)\b/, `${line} is not allowed in the pack script`);
});

test('npm run pack runs the tests and then the script', () => {
  assert.equal(JSON.parse(read('package.json')).scripts.pack, 'npm test && sh scripts/pack.sh');
});

test('every packed path is a real file', () => {
  for (const file of packed) assert.ok(existsSync(new URL(file, root)), `${file} is listed but does not exist`);
});

test('the manifest and every icon it names are packed', () => {
  assert.ok(packed.has('manifest.json'));
  for (const path of Object.values(manifest.icons)) assert.ok(packed.has(path), `${path} is not packed`);
});

test('every source file is packed, so an import can never point outside the zip', () => {
  const sources = readdirSync(new URL('src/', root)).filter((name) => name !== '.DS_Store').map((name) => `src/${name}`);
  assert.ok(sources.length >= 3);
  for (const file of sources) assert.ok(packed.has(file), `${file} exists but is not packed`);
});

test('everything the service worker can import is in the zip', () => {
  // Start at the worker and follow its imports. A packed extension whose imports are missing fails to load,
  // and nothing else would notice.
  const closure = new Set();
  const visit = (file) => {
    if (closure.has(file)) return;
    closure.add(file);
    for (const m of read(file).matchAll(IMPORT_FROM)) visit(`src/${m[1].replace(/^\.\//, '')}`);
  };
  visit(manifest.background.service_worker);
  assert.ok(closure.size >= 3);
  for (const file of closure) assert.ok(packed.has(file), `${file} is imported by the worker but is not packed`);
});

test('nothing outside the extension itself is packed', () => {
  const allowed = new Set(['manifest.json', ...Object.values(manifest.icons)]);
  for (const file of packed) assert.ok(allowed.has(file) || /^src\/[A-Za-z0-9_-][A-Za-z0-9._-]*\.js$/.test(file), `${file} is not part of the extension`);
});
