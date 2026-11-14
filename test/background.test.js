import { test } from 'node:test';
import assert from 'node:assert/strict';

// A minimal stand-in for the parts of the `chrome` API the service worker touches.
function makeChrome() {
  const env = { listeners: {}, events: [], tabs: [], menus: [], lastErrorReads: 0, removeAll: () => Promise.resolve(), slowCreate: false, createTab: () => Promise.resolve({}) };
  env.chrome = {
    runtime: {
      onInstalled: { addListener: (fn) => { env.listeners.installed = fn; } },
      get lastError() { env.lastErrorReads += 1; return undefined; },
    },
    contextMenus: {
      onClicked: { addListener: (fn) => { env.listeners.clicked = fn; } },
      // Tests can swap in a slower or failing removeAll through env.removeAll.
      removeAll: () => { env.events.push('removeAll'); return env.removeAll(); },
      // A real Chrome calls the callback on a later turn; tests can ask for that with env.slowCreate.
      create: (props, callback) => { env.events.push('create'); env.menus.push(props); if (callback) { if (env.slowCreate) setTimeout(callback, 5); else callback(); } return props.id; },
    },
    // Tests can make Chrome refuse a tab, or answer oddly, through env.createTab. Every call is recorded first.
    tabs: { create: (props) => { env.tabs.push(props); return env.createTab(props); } },
  };
  return env;
}

let fresh = 0;
async function loadWorker({ removeAll, slowCreate } = {}) {
  const env = makeChrome();
  if (removeAll) env.removeAll = removeAll;
  if (slowCreate) env.slowCreate = true;
  globalThis.chrome = env.chrome;
  await import(`../src/background.js?fresh=${++fresh}`); // distinct URL = a new evaluation, like a woken worker
  return env;
}
const settle = () => new Promise((resolve) => setImmediate(resolve));

test('registers both listeners as soon as the module is evaluated, even if Chrome is slow to answer', async () => {
  // A real Chrome answers over IPC, so a listener registered after waiting on it would not exist yet when the click arrives.
  const env = await loadWorker({ removeAll: () => new Promise((resolve) => setTimeout(resolve, 5)), slowCreate: true });
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

const SERIAL_URL = 'https://decodethis.com/x/decode?vin=K7M2A004171';
const click = (env, tab, selectionText = 'K7M2A004171') => env.listeners.clicked({ menuItemId: 'decode-vin', selectionText }, tab);

test('a click opens exactly one tab, immediately to the right of the page it came from', async () => {
  const env = await loadWorker();
  click(env, { id: 7, index: 3 });
  assert.deepEqual(env.tabs, [{ url: SERIAL_URL, index: 4 }]);
});

test('the new tab goes exactly one place to the right of the page it came from', async () => {
  for (const index of [0, 1, 5, 41]) {
    const env = await loadWorker();
    click(env, { id: 9, index });
    assert.equal(env.tabs[0].index, index + 1, `from index ${index}`);
  }
});

test('passes nothing but the address and the position to Chrome', async () => {
  // Adding any other option must be a deliberate, separately verified change, so it has to be made here too.
  for (const tab of [undefined, { id: 7 }, { id: 7, index: 3 }, { index: 3, windowId: 2, openerTabId: 5, active: true }]) {
    const env = await loadWorker();
    click(env, tab);
    assert.deepEqual(Object.keys(env.tabs[0]).filter((key) => !['url', 'index'].includes(key)), [], `tab ${JSON.stringify(tab)}`);
  }
});

test('a missing tab still opens the tab at the right address, and throws nothing', async () => {
  for (const tab of [undefined, null]) {
    const env = await loadWorker();
    click(env, tab);
    assert.deepEqual(env.tabs, [{ url: SERIAL_URL }]);
  }
});

test('passes no position when the tab has no usable index', async () => {
  for (const tab of [{}, { id: 7 }, { index: -1 }, { index: 1.5 }, { index: '3' }, { index: NaN }, { index: Infinity }, { index: null }]) {
    const env = await loadWorker();
    click(env, tab);
    assert.deepEqual(env.tabs, [{ url: SERIAL_URL }], `tab ${JSON.stringify(tab)}`);
  }
});

test('does not pass the id of the page it came from', async () => {
  const env = await loadWorker();
  click(env, { id: 7, index: 3 });
  assert.ok(!('openerTabId' in env.tabs[0]));
});

test('odd tab values never throw and never change the address', async () => {
  const odd = [{}, { id: '7' }, { id: NaN }, { index: -4 }, { index: 1.5 }, { id: null, index: null }, 'tab', 42, [], () => {}, true];
  for (const tab of odd) {
    const env = await loadWorker();
    assert.doesNotThrow(() => click(env, tab), `tab ${String(tab)}`);
    assert.equal(env.tabs.length, 1);
    assert.equal(env.tabs[0].url, SERIAL_URL);
  }
});

test('the address is the same whatever the tab is', async () => {
  const urls = new Set();
  for (const tab of [undefined, {}, { id: 3 }, { index: 3 }, { id: 3, index: 3 }, { id: -1 }, { index: 900 }]) {
    const env = await loadWorker();
    click(env, tab);
    urls.add(env.tabs[0].url);
  }
  assert.deepEqual([...urls], [SERIAL_URL]);
});

test('nothing but the selection reaches the address, whatever else Chrome puts in the click', async () => {
  const env = await loadWorker();
  const info = {
    menuItemId: 'decode-vin', selectionText: 'K7M2A004171', editable: false, frameId: 0, wasChecked: false,
    pageUrl: 'https://listing.example/lot/123?utm=a', frameUrl: 'https://listing.example/frame', linkUrl: 'https://other.example/x', srcUrl: 'https://img.example/a.png',
  };
  const tab = { id: 7, index: 3, windowId: 2, url: 'https://listing.example/lot/123', title: 'Lot 123', incognito: false };
  env.listeners.clicked(info, tab);
  assert.deepEqual(env.tabs, [{ url: SERIAL_URL, index: 4 }]);
});

test('with no selection the page address is not used as a stand-in', async () => {
  const env = await loadWorker();
  env.listeners.clicked({ menuItemId: 'decode-vin', pageUrl: 'https://listing.example/lot/123', frameUrl: 'https://listing.example/frame', linkUrl: 'https://other.example/x' }, { id: 7, index: 3 });
  assert.deepEqual(env.tabs, [{ url: 'https://decodethis.com/x/decode?vin=', index: 4 }]);
});

test('opens the plain tab instead when Chrome refuses the placed one, so a click is never lost', async () => {
  const env = await loadWorker();
  env.createTab = (props) => (props.index === undefined ? Promise.resolve({}) : Promise.reject(new Error('refused')));
  click(env, { id: 7, index: 3 });
  await settle();
  assert.deepEqual(env.tabs, [{ url: SERIAL_URL, index: 4 }, { url: SERIAL_URL }]);
});

test('retries the plain tab even when the first attempt had no position', async () => {
  const env = await loadWorker();
  let first = true;
  env.createTab = () => { if (first) { first = false; return Promise.reject(new Error('refused')); } return Promise.resolve({}); };
  click(env, undefined);
  await settle();
  assert.deepEqual(env.tabs, [{ url: SERIAL_URL }, { url: SERIAL_URL }]);
});

test('if the retry is refused as well, nothing is thrown or left unhandled', async () => {
  const env = await loadWorker();
  env.createTab = () => Promise.reject(new Error('refused'));
  assert.doesNotThrow(() => click(env, { id: 7, index: 3 }));
  await settle();
  await settle();
  assert.equal(env.tabs.length, 2); // the attempt and one retry, and no more
});

test('tolerates tabs.create returning something that is not a promise', async () => {
  const env = await loadWorker();
  env.createTab = () => undefined;
  assert.doesNotThrow(() => click(env, { id: 7, index: 3 }));
  await settle();
  assert.deepEqual(env.tabs, [{ url: SERIAL_URL, index: 4 }]);
});

test('opens only one tab per click', async () => {
  const env = await loadWorker();
  click(env, { id: 7, index: 3 });
  await settle();
  assert.equal(env.tabs.length, 1);
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
