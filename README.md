# DecodeThis VIN Lookup

A planned Chrome extension: select a VIN on a web page, right-click, and decode
it on [DecodeThis](https://decodethis.com) in a new tab.

## Status

Not built yet. This repository is the home for the extension; implementation
starts from a design and plan held privately by the maintainer.

## Design principles

These are constraints, not aspirations. A change that breaks one is wrong even
if it works:

- **One permission.** The manifest's `permissions` must be exactly
  `contextMenus`, with no host permissions and no content script. The goal this
  serves is an install with no permission warning, and that outcome is to be
  checked, not assumed. Evidence so far:
  - In November 2026, Chrome for Testing 157 (Stable channel) was asked, with
    `chrome.management.getPermissionWarningsByManifest`, about a throwaway
    manifest whose `permissions` were exactly `contextMenus`; it returned no
    warnings. This repository does not yet contain that manifest or a repeatable
    check.
  - Chrome's
    [permissions reference](https://developer.chrome.com/docs/extensions/reference/permissions-list)
    lists no install warning for `contextMenus` (checked November 2026).
  - Neither of those is an observed install prompt: none has been seen yet, and
    the first is planned for when the package is installed from the Chrome Web
    Store.
- **The extension's own code must make no network requests** (for example
  `fetch`, XHR, WebSocket or beacons). Its only outward effect must be to open a
  new tab on decodethis.com. The selected text will therefore be sent to that
  site in the tab's address, as with any link you open, and Chrome normally
  records that address in your browser history, subject to your history
  settings.
- **The extension must not store or log the selection.** It must read it once,
  use it to build the address of the tab, and discard it.

## Privacy

Nothing is built yet, so none of this describes a shipped build. There are two
separate points, and the distinction matters:

- **The extension** must make no network calls of its own, store nothing, and
  keep no record of what you select. The tab it opens will carry the selected
  text to decodethis.com in its address, and Chrome normally records that
  address in browser history, subject to your history settings.
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
npm run pack      # build dist/decodethis-vin-lookup.zip from an explicit list of files
npm run icons     # regenerate the placeholder icons in icons/
```

The tests have been run on Node 22 and 24. The workflow in
`.github/workflows/test.yml` runs both for every pull request.

To try the extension, unzip `dist/decodethis-vin-lookup.zip`, open
`chrome://extensions`, turn on Developer mode and choose Load unpacked.

Reloading an unpacked extension needs Developer mode to stay on. Observed in
November 2026 with Chrome for Testing 157: with it off, Chrome disables the
extension when it is reloaded, and its menu item disappears.
