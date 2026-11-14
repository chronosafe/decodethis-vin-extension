import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

// The extension's anti-goals, enforced as a static guard over everything under src/.
// These are not behaviour tests: they fail if anyone adds a network call, storage, logging,
// or any Chrome API beyond the small allowlist below, however innocently.

const srcDir = new URL('../src/', import.meta.url);
const files = readdirSync(srcDir).filter((f) => !f.startsWith('.'));

// Strip comments so prose in them never trips (or hides from) the checks.
const stripComments = (code) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
const sources = files.map((name) => ({ name, code: stripComments(readFileSync(new URL(name, srcDir), 'utf8')) }));

test('src/ contains only JavaScript modules', () => {
  assert.ok(files.length >= 3);
  for (const f of files) assert.match(f, /\.js$/, `${f} is not a .js file`);
});

test('makes no network requests and keeps no storage', () => {
  const forbidden = [
    /\bfetch\s*\(/, /\bXMLHttpRequest\b/, /\bWebSocket\b/, /\bEventSource\b/, /\bsendBeacon\b/,
    /\bimportScripts\b/, /\beval\s*\(/, /\bnew\s+Function\b/, /\bimport\s*\(/,
    /\blocalStorage\b/, /\bsessionStorage\b/, /\bindexedDB\b/, /\bcaches\b/, /\bchrome\.storage\b/,
  ];
  for (const { name, code } of sources) {
    for (const re of forbidden) assert.doesNotMatch(code, re, `${name} matches ${re}`);
  }
});

test('never logs anything', () => {
  for (const { name, code } of sources) assert.doesNotMatch(code, /\bconsole\s*\./, `${name} uses console`);
});

test('imports only relative local modules', () => {
  // Each pattern is confined to one statement (no ';' or quote before 'from'), so it cannot
  // run on into the next one and mistake an ordinary string for a module specifier.
  const importFrom = /^\s*import\s+(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]/gm;
  const exportFrom = /^\s*export\s+(?:\*|\{[^}]*\})\s+from\s+['"]([^'"]+)['"]/gm;
  let found = 0;
  for (const { name, code } of sources) {
    for (const m of [...code.matchAll(importFrom), ...code.matchAll(exportFrom)]) {
      found += 1;
      assert.match(m[1], /^\.\//, `${name} pulls in ${m[1]}`);
    }
  }
  assert.ok(found >= 2, 'the scan found the known imports, so it is actually looking');
});

test('uses no Chrome API beyond the small allowlist', () => {
  const allowed = new Set([
    'chrome.contextMenus.onClicked.addListener',
    'chrome.contextMenus.create',
    'chrome.contextMenus.removeAll',
    'chrome.runtime.onInstalled.addListener',
    'chrome.runtime.lastError',
    'chrome.tabs.create',
  ]);
  const used = new Set();
  for (const { code } of sources) for (const m of code.matchAll(/\bchrome(?:\.[A-Za-z_]+)+/g)) used.add(m[0]);
  assert.deepEqual([...used].filter((api) => !allowed.has(api)), []);
  assert.ok(used.has('chrome.tabs.create'));
});

test('registers listeners at the top level, never behind an await', () => {
  const worker = sources.find((s) => s.name === 'background.js');
  assert.ok(worker, 'src/background.js exists');
  // A top-level await would delay listener registration until after the worker's first turn.
  assert.doesNotMatch(worker.code, /^await\b/m);
  assert.match(worker.code, /^chrome\.contextMenus\.onClicked\.addListener\(/m);
  assert.match(worker.code, /^chrome\.runtime\.onInstalled\.addListener\(/m);
});
