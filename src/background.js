import { buildDecodeUrl } from './destination.js';

const MENU_ID = 'decode-vin';

// Chrome fills in %s with the selected text, so the label itself shows the user what
// will be sent. The item only appears when something is selected.
const MENU_ITEM = { id: MENU_ID, title: 'Decode "%s" on DecodeThis', contexts: ['selection'] };

// THIS LISTENER MUST BE REGISTERED SYNCHRONOUSLY, AT THE TOP LEVEL OF THE FILE.
//
// Chrome stops an idle service worker after about half a minute. When the user then
// clicks the menu item, Chrome wakes a fresh worker, which re-runs this file from the
// top and dispatches the click to whatever listeners exist at the end of that first
// turn. A listener added later (inside a callback, after an await) is not there yet,
// and the click silently does nothing. Do not move this.
chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId !== MENU_ID) return;
  // Always open a tab, even for an empty or odd selection: a click that visibly does
  // nothing reads as broken, and the destination decides what is decodable.
  chrome.tabs.create({ url: buildDecodeUrl(info.selectionText) });
});

// Menu items survive worker restarts, so they are created on install and update
// only. Clearing first keeps the id unique if the item is already there.
//
// Observed with Chrome for Testing 157: the item survives the worker being stopped, and an
// update (reloading from disk with a higher version) fires this event with reason "update"
// and leaves exactly one item. If the item vanishes after you reload an unpacked copy, check
// that Developer mode is on at chrome://extensions: with it off, Chrome disables the
// extension on reload and nothing here has run.
//
// Not observed: a Chrome browser update (reason "chrome_update"). The item should still be
// there then, and clearing before creating is what keeps it at one. That is an argument
// from this code, not something that was tested.
chrome.runtime.onInstalled.addListener(async () => {
  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create(MENU_ITEM, () => void chrome.runtime.lastError);
});
