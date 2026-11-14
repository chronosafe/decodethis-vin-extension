import { test } from 'node:test';
import assert from 'node:assert/strict';

// A minimal stand-in for the parts of the `chrome` API the service worker touches.
function makeChrome() {
  const env = { listeners: {}, events: [], tabs: [], menus: [], lastErrorReads: 0, removeAll: () => Promise.resolve() };
  env.chrome = {
    runtime: {
      onInstalled: { addListener: (fn) => { env.listeners.installed = fn; } },
      get lastError() { env.lastErrorReads += 1; return undefined; },
    },
    contextMenus: {
      onClicked: { addListener: (fn) => { env.listeners.clicked = fn; } },
      // Tests can swap in a slower or failing removeAll through env.removeAll.
      removeAll: () => { env.events.push('removeAll'); return env.removeAll(); },
      create: (props, callback) => { env.events.push('create'); env.menus.push(props); if (callback) callback(); return props.id; },
    },
    tabs: { create: (props) => { env.tabs.push(props); return Promise.resolve({}); } },
  };
  return env;
}

let fresh = 0;
async function loadWorker() {
  const env = makeChrome();
  globalThis.chrome = env.chrome;
  await import(`../src/background.js?fresh=${++fresh}`); // distinct URL = a new evaluation, like a woken worker
  return env;
}
const settle = () => new Promise((resolve) => setImmediate(resolve));

test('registers both listeners as soon as the module is evaluated', async () => {
  const env = await loadWorker();
  // Nothing has fired yet: a worker woken by a click re-runs the file and must already be listening.
  assert.equal(typeof env.listeners.clicked, 'function');
  assert.equal(typeof env.listeners.installed, 'function');
});

test('on install, creates one selection-only menu item', async () => {
  const env = await loadWorker();
  env.listeners.installed({ reason: 'install' });
  await settle();
  assert.deepEqual(env.menus, [{ id: 'decode-vin', title: 'Decode "%s" on DecodeThis', contexts: ['selection'] }]);
});

test('on every install or update, clears old items first so ids never duplicate', async () => {
  const env = await loadWorker();
  env.listeners.installed({ reason: 'install' });
  await settle();
  env.listeners.installed({ reason: 'update' });
  await settle();
  assert.deepEqual(env.events, ['removeAll', 'create', 'removeAll', 'create']);
});

test('waits for the clear to finish before creating the item', async () => {
  const env = await loadWorker();
  let finishClearing;
  env.removeAll = () => new Promise((resolve) => { finishClearing = resolve; });
  env.listeners.installed({ reason: 'update' });
  await settle();
  assert.deepEqual(env.events, ['removeAll'], 'create must not run while the clear is still pending');
  finishClearing();
  await settle();
  assert.deepEqual(env.events, ['removeAll', 'create']);
});

test('still creates the item when clearing fails, so the user is never left with no menu item', async () => {
  const env = await loadWorker();
  env.removeAll = () => Promise.reject(new Error('clear failed'));
  env.listeners.installed({ reason: 'install' });
  await settle();
  assert.deepEqual(env.events, ['removeAll', 'create']);
  assert.equal(env.menus.length, 1);
});

test('reads runtime.lastError when creating the item so a failure is not left unchecked', async () => {
  const env = await loadWorker();
  env.listeners.installed({ reason: 'install' });
  await settle();
  assert.ok(env.lastErrorReads > 0);
});

test('a click on the menu item opens exactly one tab at the decode URL', async () => {
  const env = await loadWorker();
  env.listeners.clicked({ menuItemId: 'decode-vin', selectionText: 'K7M2A004171' }, { id: 7 });
  assert.deepEqual(env.tabs, [{ url: 'https://decodethis.com/x/decode?vin=K7M2A004171' }]);
});

test('opens the tab with only a url, so the new tab is an ordinary foreground tab', async () => {
  const env = await loadWorker();
  env.listeners.clicked({ menuItemId: 'decode-vin', selectionText: 'K7M2A004171' }, { id: 7 });
  assert.deepEqual(Object.keys(env.tabs[0]), ['url']);
});

test('normalizes the selection before opening', async () => {
  const env = await loadWorker();
  env.listeners.clicked({ menuItemId: 'decode-vin', selectionText: ' xq5/rt/123456/z \n' }, undefined);
  assert.equal(env.tabs[0].url, 'https://decodethis.com/x/decode?vin=XQ5RT123456Z');
});

test('ignores clicks on any other menu item', async () => {
  const env = await loadWorker();
  env.listeners.clicked({ menuItemId: 'something-else', selectionText: 'K7M2A004171' }, { id: 7 });
  assert.deepEqual(env.tabs, []);
});

test('still opens a tab when nothing usable was selected: a click is never a silent no-op', async () => {
  const env = await loadWorker();
  env.listeners.clicked({ menuItemId: 'decode-vin' }, { id: 7 });
  env.listeners.clicked({ menuItemId: 'decode-vin', selectionText: '\u2014 \u2014 \u2014' }, { id: 7 });
  assert.deepEqual(env.tabs.map((t) => t.url), [
    'https://decodethis.com/x/decode?vin=',
    'https://decodethis.com/x/decode?vin=',
  ]);
});

test('a whole paragraph opens a bounded address', async () => {
  const env = await loadWorker();
  env.listeners.clicked({ menuItemId: 'decode-vin', selectionText: 'word and number 42 '.repeat(100) }, { id: 7 });
  assert.ok(env.tabs[0].url.length <= 'https://decodethis.com/x/decode?vin='.length + 64);
});
