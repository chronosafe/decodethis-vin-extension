# DecodeThis VIN Lookup

A Chrome extension: select a VIN on a web page, right-click, and decode it on
[DecodeThis](https://decodethis.com) in a new tab.

## Status

Implemented, with an automated test suite and manual verification in Chrome on
macOS; the automated test suite also runs on Linux in CI. Not yet submitted to the
Chrome Web Store, and not yet exercised in Chrome on Windows or Linux.

## What it does

1. Select text on a page.
2. Right-click. One menu item appears: `Decode "<your selection>" on DecodeThis`.
   Chrome fills in the selection, shows the item only when text is selected, and
   shortens the label for a long selection.
3. Click it. A new tab opens on decodethis.com with the selection in its address,
   immediately to the right of the page you were reading (observed in November 2026
   with Chrome for Testing 157 on macOS, in a normal browser window). The extension
   cannot read or change the content of the page you were reading, and it uses only
   the text you selected.

The extension never refuses to open the tab. It reduces the selection to ASCII
letters and digits, uppercases it, keeps at most the first 64 characters, and
leaves it to the site to decide whether the result is something it can decode. It
needs Chrome 123 or later.

### Selecting a VIN

Observed in November 2026 with Chrome for Testing 157 on macOS, on a local page
shaped like an auction listing (a table of label and value cells):

- Double-clicking a serial that is a single word selects exactly that serial.
- A hyphenated serial has to be drag-selected: double-clicking one selects only a
  single segment of it.
- Selecting a label together with its value (for example `VIN: ...`) sends the
  label's letters as well, so the address no longer holds only the serial.
- Triple-clicking a cell that contains a line break selects only the line you
  clicked.

The extension cannot widen a selection for you: that would need access to the
page, which is a permission this extension deliberately does not ask for.

## Permissions

The manifest declares one permission, `contextMenus`, which is what lets the
extension add its menu item. It declares no host permissions and no content
scripts, so the extension does not read pages: Chrome hands it the selected text
only when the menu item is clicked.

## Design principles

These are constraints, not aspirations. A change that breaks one is wrong even
if it works:

- **One permission.** The manifest's `permissions` must be exactly
  `contextMenus`, with no host permissions and no content script. The goal this
  serves is an install with no permission warning, and that outcome is computed,
  not assumed. Evidence so far:
  - In November 2026, Chrome for Testing 157 (Stable channel) was asked, with
    `chrome.management.getPermissionWarningsByManifest`, about this manifest as
    packaged by `npm run pack`; it returned no warnings. The same call returned
    warnings for a copy that added `<all_urls>` host access and for a copy that
    added the `tabs` permission, so the check is able to report warnings when
    they exist. This repository does not contain a repeatable check.
  - Chrome's
    [permissions reference](https://developer.chrome.com/docs/extensions/reference/permissions-list)
    lists no install warning for `contextMenus` (checked November 2026).
  - Neither of those is an observed install prompt: none has been seen yet, and
    the first is planned for when the package is installed from the Chrome Web
    Store.
- **The extension's own code must make no network requests** (for example
  `fetch`, XHR, WebSocket or beacons). Its only outward effect must be to open a
  new tab on decodethis.com. The selected text is therefore sent to that site in
  the tab's address, as with any link you open, and Chrome normally records that
  address in your browser history, subject to your history settings.
- **The extension must not store or log the selection.** It must read it once,
  use it to build the address of the tab, and discard it.

`test/constraints.test.js` is a tripwire for the last two, not a proof. It fails
if the source uses any of a list of known network, storage or logging calls,
reaches for a global that could hide one, uses `chrome` other than through a
short allowlist of named APIs, or imports anything that is not a local module.
It cannot stop someone determined to hide a call, so review still matters.

## Privacy

The extension has not been published, so none of this describes a listing. There
are two separate points, and the distinction matters:

- **The extension**'s own code contains no network, storage or logging calls;
  `test/constraints.test.js` is a tripwire that fails if the source adds a known
  one. It reads the selection once, builds the address of the tab and discards
  it, so it keeps no record of what you select. The tab
  it opens carries the selected text to decodethis.com in its address, and
  Chrome normally records that address in browser history, subject to your
  history settings.
- **The destination**, decodethis.com, is operated by this extension's
  maintainer but is not part of this repository. The tab opens there with the
  selected text in its address. As of November 2026 the site decodes the
  selected text and keeps a record of that decode. How the site handles the
  selected text and that record is described in that site's own
  [privacy policy](https://decodethis.com/web/privacy-policy), which can change
  independently of this code.

## Development

No dependencies.

```bash
npm test          # node --test
npm run pack      # run the tests, then build dist/decodethis-vin-lookup.zip from an explicit list of files
npm run icons     # regenerate the placeholder icons in icons/
```

The tests have been run on Node 22 and 24. The workflow in
`.github/workflows/test.yml` runs both for every pull request.

`npm run pack` needs the `zip` and `unzip` commands.

To try the extension, unzip `dist/decodethis-vin-lookup.zip`, open
`chrome://extensions`, turn on Developer mode and choose Load unpacked.

Reloading an unpacked extension needs Developer mode to stay on. Observed in
November 2026 with Chrome for Testing 157: with it off, Chrome disables the
extension when it is reloaded, and its menu item disappears.
