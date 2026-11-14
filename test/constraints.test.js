import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

// The extension's anti-goals, as a static tripwire over everything under src/.
//
// This is a guard against accidents, not a proof. It looks for a list of known network, storage and logging
// patterns, requires every use of `chrome` to be one of a short allowlist of named APIs, and bans the globals
// that could hide a call. Someone determined to hide a call can still do it, so review still matters.
// What it does guarantee is that an ordinary change that adds a fetch, a storage call, a console.log or a new
// Chrome API fails here, and the self-checks below keep the guard itself from going quietly blind.

const FORBIDDEN = [
  [/\bfetch\b/, 'fetch'], [/\bXMLHttpRequest\b/, 'XMLHttpRequest'], [/\bWebSocket\b/, 'WebSocket'],
  [/\bEventSource\b/, 'EventSource'], [/\bsendBeacon\b/, 'sendBeacon'], [/\bimportScripts\b/, 'importScripts'],
  [/\beval\b/, 'eval'], [/\bFunction\b/, 'Function'], [/\bimport\s*\(/, 'dynamic import'],
  [/\blocalStorage\b/, 'localStorage'], [/\bsessionStorage\b/, 'sessionStorage'], [/\bindexedDB\b/, 'indexedDB'],
  [/\bcaches\b/, 'caches'], [/\bconsole\b/, 'console'],
  // Globals that could be used to reach a banned API without naming it.
  [/\bglobalThis\b/, 'globalThis'], [/\bself\b/, 'self'], [/\bwindow\b/, 'window'], [/\bnavigator\b/, 'navigator'],
  [/\bdocument\b/, 'document'],
];
const ALLOWED_CHROME = new Set([
  'chrome.contextMenus.onClicked.addListener',
  'chrome.contextMenus.create',
  'chrome.contextMenus.removeAll',
  'chrome.runtime.onInstalled.addListener',
  'chrome.runtime.lastError',
  'chrome.tabs.create',
]);

// Strip comments so prose in them never trips (or hides from) the checks.
const stripComments = (code) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');

/** Everything wrong with a piece of source, as readable strings. An empty list means it passes. */
function violations(source) {
  const code = stripComments(source);
  const found = [];
  for (const [pattern, name] of FORBIDDEN) if (pattern.test(code)) found.push(`uses ${name}`);
  // `chrome` must always be followed by a property, so `const { storage } = chrome` and `chrome["storage"]` fail.
  if (/\bchrome\b(?!\.[A-Za-z_])/.test(code)) found.push('uses chrome other than as chrome.<name>');
  for (const [api] of code.matchAll(/\bchrome(?:\.[A-Za-z_]+)+/g)) if (!ALLOWED_CHROME.has(api)) found.push(`uses ${api}`);
  return found;
}

const srcDir = new URL('../src/', import.meta.url);
const files = readdirSync(srcDir).filter((f) => !f.startsWith('.'));
const sources = files.map((name) => ({ name, source: readFileSync(new URL(name, srcDir), 'utf8') }));

test('src/ contains only JavaScript modules', () => {
  assert.ok(files.length >= 3);
  for (const f of files) assert.match(f, /\.js$/, `${f} is not a .js file`);
});

test('the source passes the guard', () => {
  for (const { name, source } of sources) assert.deepEqual(violations(source), [], name);
});

test('the guard flags every way of adding a call that the first version of it missed', () => {
  const bad = {
    'a plain fetch': 'fetch(url);',
    'fetch through globalThis': 'const f = globalThis.fetch; f(url);',
    'fetch through self': 'self.fetch(url);',
    'fetch assigned to a variable': 'const send = fetch;',
    'storage by destructuring': 'const { storage } = chrome; storage.local.set({ a: 1 });',
    'storage by bracket access': 'chrome["storage"].local.set({ a: 1 });',
    'storage by name': 'chrome.storage.local.set({ a: 1 });',
    'logging by optional call': 'console?.log(text);',
    'logging by bracket access': 'console["log"](text);',
    'logging plainly': 'console.log(text);',
    'a web socket': 'new WebSocket(url);',
    'a beacon': 'navigator.sendBeacon(url, text);',
    'a message to another context': 'chrome.runtime.sendMessage(text);',
    'reading the open tabs': 'chrome.tabs.query({});',
    'a dynamic import': "import('./other.js');",
    'eval': 'eval(code);',
    'localStorage': 'localStorage.setItem("k", text);',
  };
  for (const [label, snippet] of Object.entries(bad)) assert.notDeepEqual(violations(snippet), [], `should flag ${label}`);
});

test('the guard accepts the Chrome APIs the extension actually uses', () => {
  const good = [
    'chrome.tabs.create({ url });',
    'chrome.contextMenus.onClicked.addListener(() => {});',
    'chrome.runtime.onInstalled.addListener(async () => { await chrome.contextMenus.removeAll(); });',
    'chrome.contextMenus.create(item, () => void chrome.runtime.lastError);',
    '// fetch( and console.log( in a comment are only words\nconst x = 1;',
  ];
  for (const snippet of good) assert.deepEqual(violations(snippet), [], snippet);
});

test('imports only relative local modules', () => {
  // Each pattern is confined to one statement (no ';' or quote before 'from'), so it cannot
  // run on into the next one and mistake an ordinary string for a module specifier.
  const importFrom = /^\s*import\s+(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]/gm;
  const exportFrom = /^\s*export\s+(?:\*|\{[^}]*\})\s+from\s+['"]([^'"]+)['"]/gm;
  let found = 0;
  for (const { name, source } of sources) {
    const code = stripComments(source);
    for (const m of [...code.matchAll(importFrom), ...code.matchAll(exportFrom)]) {
      found += 1;
      assert.match(m[1], /^\.\//, `${name} pulls in ${m[1]}`);
    }
  }
  assert.ok(found >= 2, 'the scan found the known imports, so it is actually looking');
});

test('registers the click listener before anything can await', () => {
  const worker = sources.find((s) => s.name === 'background.js');
  assert.ok(worker, 'src/background.js exists');
  const code = stripComments(worker.source);
  const listener = code.indexOf('chrome.contextMenus.onClicked.addListener(');
  const installed = code.indexOf('chrome.runtime.onInstalled.addListener(');
  assert.ok(listener >= 0 && installed >= 0, 'both listeners are registered');
  // A top-level await anywhere before the listener would delay its registration past the worker's first turn.
  const firstAwait = code.search(/\bawait\b/);
  assert.ok(firstAwait === -1 || listener < firstAwait, 'the click listener must come before any await');
  // And both registrations sit at the top level of the file, not inside another function.
  assert.match(code, /^chrome\.contextMenus\.onClicked\.addListener\(/m);
  assert.match(code, /^chrome\.runtime\.onInstalled\.addListener\(/m);
});
