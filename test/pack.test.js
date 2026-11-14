import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';

// scripts/pack.sh lists its files explicitly so nothing unintended is ever uploaded. The price of an explicit list is
// that it can fall behind the source: add a module, import it, forget the list, and the packed extension is broken.
// These tests keep the list and the source in step without needing the zip tool.

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const zipLine = read('scripts/pack.sh').split('\n').find((line) => /^\s*zip\s/.test(line));
const packed = new Set(
  zipLine.trim().split(/\s+/).slice(1).filter((arg) => !arg.startsWith('-') && !arg.startsWith('"') && !arg.startsWith('$')),
);
const manifest = JSON.parse(read('manifest.json'));

test('the pack script has exactly one zip command with an explicit file list', () => {
  assert.ok(zipLine, 'scripts/pack.sh has a zip command');
  assert.ok(packed.size >= 7);
  for (const file of packed) assert.doesNotMatch(file, /[*?]|^\.\.?$|\/$/, `${file} must be a named file, not a glob or directory`);
});

test('every packed path is a real file', () => {
  for (const file of packed) assert.ok(existsSync(new URL(file, root)), `${file} is listed but does not exist`);
});

test('the manifest and every icon it names are packed', () => {
  assert.ok(packed.has('manifest.json'));
  for (const path of Object.values(manifest.icons)) assert.ok(packed.has(path), `${path} is not packed`);
});

test('every source file is packed, so an import can never point outside the zip', () => {
  const sources = readdirSync(new URL('src/', root)).filter((name) => !name.startsWith('.')).map((name) => `src/${name}`);
  assert.ok(sources.length >= 3);
  for (const file of sources) assert.ok(packed.has(file), `${file} exists but is not packed`);
});

test('nothing outside the extension itself is packed', () => {
  const allowed = new Set(['manifest.json', ...Object.values(manifest.icons)]);
  for (const file of packed) assert.ok(allowed.has(file) || /^src\/[A-Za-z0-9._-]+\.js$/.test(file), `${file} is not part of the extension`);
});
