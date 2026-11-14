import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

// The extension's anti-goals, as a static tripwire over everything under src/.
//
// This is a tripwire against accidents, not a proof. It looks for a list of known network, storage and logging
// patterns, requires every use of `chrome` to be one of a short allowlist of named APIs, and bans the globals
// that could hide a call. Someone determined to hide a call can still do it, so review still matters.
// It is meant to catch an ordinary accidental change that adds a fetch, a storage call, a console.log or a new
// Chrome API, and the self-checks below keep the guard itself from going quietly blind.

const FORBIDDEN = [
  [/\bfetch\b/, 'fetch'], [/\bXMLHttpRequest\b/, 'XMLHttpRequest'], [/\bWebSocket\b/, 'WebSocket'],
  [/\bEventSource\b/, 'EventSource'], [/\bsendBeacon\b/, 'sendBeacon'], [/\bimportScripts\b/, 'importScripts'],
  [/\beval\b/, 'eval'], [/\bFunction\b/, 'Function'], [/\bimport\s*\(/, 'dynamic import'],
  [/\blocalStorage\b/, 'localStorage'], [/\bsessionStorage\b/, 'sessionStorage'], [/\bindexedDB\b/, 'indexedDB'],
  [/\bcaches\b/, 'caches'], [/\bconsole\b/, 'console'],
  // Globals that could be used to reach a banned API without naming it.
  [/\bglobalThis\b/, 'globalThis'], [/\bself\b/, 'self'], [/\bwindow\b/, 'window'], [/\bnavigator\b/, 'navigator'],
  [/\bdocument\b/, 'document'],
  // More ways to reach the network or another context, and a unicode escape, which could spell any banned name.
  [/\bWebTransport\b/, 'WebTransport'], [/\bBroadcastChannel\b/, 'BroadcastChannel'], [/\bcookieStore\b/, 'cookieStore'],
  [/\breportError\b/, 'reportError'], [/\bWorker\b/, 'Worker'], [/\bSharedWorker\b/, 'SharedWorker'],
  [/\bImage\b/, 'Image'], [/\bpostMessage\b/, 'postMessage'], [/\\u/, 'a unicode escape'],
  [/\bWebSocketStream\b/, 'WebSocketStream'], [/\bclients\b/, 'clients'], [/\bregistration\b/, 'registration'],
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

// A string such as "x //" or "/*" can fool the comment stripper into deleting real code after it, so no string
// literal may contain a comment marker. (URLs are fine: their "//" follows a colon, not whitespace.)
const STRING_LITERAL = /(['"`])(?:\\.|(?!\1)[^\\\n])*\1/g;
const hidesACommentMarker = (source) => [...source.matchAll(STRING_LITERAL)].some(([literal]) => /(^|\s)\/\/|\/\*|\*\//.test(literal.slice(1, -1)));

/** True for a module specifier that names a plain .js file in the same directory. */
const isLocalImport = (specifier) => /^\.\/[A-Za-z0-9_-][A-Za-z0-9._-]*\.js$/.test(specifier);

/** Everything wrong with a piece of source, as readable strings. An empty list means it passes. */
function violations(source) {
  const code = stripComments(source);
  const found = [];
  if (hidesACommentMarker(source)) found.push('has a string literal that contains a comment marker');
  for (const [pattern, name] of FORBIDDEN) if (pattern.test(code)) found.push(`uses ${name}`);
  // `chrome` must always be followed by a property, so `const { storage } = chrome` and `chrome["storage"]` fail.
  if (/\bchrome\b(?!\.[A-Za-z_])/.test(code)) found.push('uses chrome other than as chrome.<name>');
  for (const [api] of code.matchAll(/\bchrome(?:\.[A-Za-z_]+)+/g)) if (!ALLOWED_CHROME.has(api)) found.push(`uses ${api}`);
  return found;
}

const srcDir = new URL('../src/', import.meta.url);
const files = readdirSync(srcDir).filter((f) => f !== '.DS_Store'); // a hidden .js file would be scanned too
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
    'a unicode-escaped name': '\\u0066etch(url);',
    'a string that hides the rest of the line': 'const note = "x //"; fetch(url);',
    'strings that hide the code between them': 'const a = "/*"; fetch(url); const b = "*/";',
    'a web transport': 'new WebTransport(url);',
    'a web socket stream': 'new WebSocketStream(url);',
    'the service worker clients': 'self.clients.matchAll();',
    'a broadcast channel': 'new BroadcastChannel("c");',
    'the cookie store': 'cookieStore.set("k", text);',
    'reporting an error to the console': 'reportError(text);',
    'an image request': 'new Image().src = url;',
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

test('only plain .js files in the same directory count as local imports', () => {
  for (const ok of ['./vin.js', './destination.js', './a-b_c.1.js']) assert.ok(isLocalImport(ok), ok);
  for (const bad of ['./../scripts/net.js', '../scripts/net.js', './sub/dir.js', 'https://example.com/x.js', 'fs', './vin', '/abs.js', './.hidden.js']) {
    assert.ok(!isLocalImport(bad), `${bad} must not count as a local import`);
  }
});

test('imports only plain .js files in the same directory', () => {
  // Each pattern is confined to one statement (no ';' or quote before 'from'), so it cannot
  // run on into the next one and mistake an ordinary string for a module specifier.
  const importFrom = /^\s*import\s+(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]/gm;
  const exportFrom = /^\s*export\s+(?:\*|\{[^}]*\})\s+from\s+['"]([^'"]+)['"]/gm;
  let found = 0;
  for (const { name, source } of sources) {
    const code = stripComments(source);
    for (const m of [...code.matchAll(importFrom), ...code.matchAll(exportFrom)]) {
      found += 1;
      assert.ok(isLocalImport(m[1]), `${name} pulls in ${m[1]}`);
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
  assert.ok(firstAwait === -1 || installed < firstAwait, 'the install listener must come before any await');
  // And both registrations sit at the top level of the file, not inside another function.
  assert.match(code, /^chrome\.contextMenus\.onClicked\.addListener\(/m);
  assert.match(code, /^chrome\.runtime\.onInstalled\.addListener\(/m);
});
