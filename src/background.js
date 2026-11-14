import { buildDecodeUrl } from './destination.js';

const MENU_ID = 'decode-vin';

// Chrome fills in %s with the selected text (shortened for a long selection), so the label
// shows the user the text the address is built from. What is actually sent is that text
// reduced to letters and digits; see normalizeSelection. The item only appears when
// something is selected.
const MENU_ITEM = { id: MENU_ID, title: 'Decode "%s" on DecodeThis', contexts: ['selection'] };

// THIS LISTENER MUST BE REGISTERED SYNCHRONOUSLY, AT THE TOP LEVEL OF THE FILE.
//
// Chrome stops an idle service worker after about half a minute. When the user then
// clicks the menu item, Chrome wakes a fresh worker, which re-runs this file from the
// top and dispatches the click to whatever listeners exist at the end of that first
// turn. A listener added later (inside a callback, after an await) is not there yet,
// and the click silently does nothing. Do not move this.
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== MENU_ID) return;
  // Always open a tab, even for an empty or odd selection: a click that visibly does
  // nothing reads as broken, and the destination decides what is decodable.
  const url = buildDecodeUrl(info.selectionText);
  // If Chrome refuses the tab for any reason, try again the plain way: a refusal here would otherwise be
  // exactly the silent no-op described above. Wrapping the call in a new promise turns a synchronous throw
  // into a refusal too, and tolerates a result that is not a promise. Nothing may be logged, and if the
  // retry is refused as well, nothing more can be done, so that is swallowed and no tab opens.
  new Promise((resolve) => resolve(chrome.tabs.create({ url, ...positionNextTo(tab) })))
    .catch(() => chrome.tabs.create({ url }))
    .catch(() => {});
});

// Where to open the tab: immediately to the right of the page the click came from. The position
// comes from the `tab` that Chrome passes the handler, which needs no permission. Observed in
// November 2026 with Chrome for Testing 157 on macOS, in a normal browser window: the tab opens
// right of that page. Chrome documents `tab` as optional (it is missing when the click did not
// happen in a tab), so the position is passed only when it is a usable number; otherwise no
// position is passed and Chrome decides where the tab goes. A missing or odd value must never
// stop the tab opening, so this never throws.
function positionNextTo(tab) {
  return Number.isInteger(tab?.index) && tab.index >= 0 ? { index: tab.index + 1 } : {};
}

// Menu items survive worker restarts, so they are created on install and update
// only. Clearing first keeps the id unique if the item is already there. The promise form of
// removeAll needs Chrome 123 or later, which is why the manifest says so.
//
// Observed in November 2026 with Chrome for Testing 157 on macOS:
// - the item survives the worker being stopped;
// - it comes back when the extension is disabled and enabled again, without this event
//   firing;
// - an update (reloading from disk with a higher version) fires this event with reason
//   "update" and leaves exactly one item.
// If the item vanishes after you reload an unpacked copy, check that Developer mode is on
// at chrome://extensions: with it off, Chrome disables the extension on reload and nothing
// here has run.
//
// Not observed: a browser restart of an installed extension (a command-line load fires this
// event again at every launch, so it cannot tell whether Chrome kept the item or this
// handler re-created it), and a Chrome browser update (reason "chrome_update"). The item
// should still be there in both, and clearing before creating is what keeps it at one. That
// is an inference from the disable/enable observation above, not something that was tested.
chrome.runtime.onInstalled.addListener(async () => {
  try {
    await chrome.contextMenus.removeAll();
  } catch {
    // Nothing useful can be done and nothing may be logged. Still try to create the item below:
    // a failed clear must not leave the user with no menu item at all.
  }
  chrome.contextMenus.create(MENU_ITEM, () => void chrome.runtime.lastError);
});
