# DecodeThis VIN Lookup

A Chrome extension: select a VIN on any web page, right-click, and decode it on
[DecodeThis](https://decodethis.com) in a new tab.

## Status

Not built yet. This repository is the home for the extension; implementation
starts from a design and plan held privately by the maintainer.

## Design principles

These are constraints, not aspirations. A change that breaks one is wrong even
if it works:

- **One permission.** The manifest declares `contextMenus` and nothing else — no
  host permissions, no content script. Installing shows no permission warning.
- **The extension makes no network requests.** It opens a tab; that is all.
- **Nothing is stored or logged.** The selected text is read once, used to build
  the address of the tab you asked for, and discarded.

## Privacy

Two separate claims, both true, and the distinction matters:

- **The extension** makes no network calls, stores nothing, and keeps no record
  of what you select.
- **The destination**, decodethis.com, decodes and saves the VIN exactly as if
  you had typed it into the site yourself, under its published privacy policy.

## Development

Requires Node 18+. No dependencies.

```bash
npm test          # node --test
```

Load unpacked from `chrome://extensions` with Developer mode on.
