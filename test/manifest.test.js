import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root));
const manifest = JSON.parse(read('manifest.json').toString('utf8'));

test('is a Manifest V3 extension with the expected name and version', () => {
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.name, 'DecodeThis VIN Lookup');
  assert.equal(manifest.version, '1.0.0');
});

test('declares exactly one permission: contextMenus', () => {
  assert.deepEqual(manifest.permissions, ['contextMenus']);
});

test('declares nothing that can reach into pages or raise an install warning', () => {
  // Any new top-level key must be a deliberate decision: add it here with a reason.
  const allowed = ['manifest_version', 'name', 'version', 'description', 'icons', 'permissions', 'background'];
  assert.deepEqual(Object.keys(manifest).filter((k) => !allowed.includes(k)), []);
  for (const forbidden of [
    'host_permissions', 'optional_permissions', 'optional_host_permissions', 'content_scripts',
    'externally_connectable', 'web_accessible_resources', 'commands', 'declarative_net_request',
    'devtools_page', 'omnibox', 'side_panel', 'chrome_url_overrides', 'action', 'options_page',
  ]) {
    assert.ok(!(forbidden in manifest), `${forbidden} must not be declared`);
  }
});

test('runs a module service worker from src/background.js', () => {
  assert.deepEqual(manifest.background, { service_worker: 'src/background.js', type: 'module' });
  assert.ok(existsSync(new URL(manifest.background.service_worker, root)));
});

test('has a description that fits the store limit', () => {
  assert.equal(typeof manifest.description, 'string');
  assert.ok(manifest.description.length > 0 && manifest.description.length <= 132);
});

test('ships 16, 48 and 128 pixel PNG icons of the right size', () => {
  assert.deepEqual(Object.keys(manifest.icons).sort(), ['128', '16', '48']);
  for (const [size, path] of Object.entries(manifest.icons)) {
    const png = read(path);
    assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], `${path} is not a PNG`);
    assert.equal(png.readUInt32BE(16), Number(size), `${path} width`);
    assert.equal(png.readUInt32BE(20), Number(size), `${path} height`);
  }
});

test('every module the service worker imports is a relative file that exists', () => {
  const seen = new Set();
  const visit = (rel) => {
    if (seen.has(rel)) return;
    seen.add(rel);
    const src = read(rel).toString('utf8');
    for (const m of src.matchAll(/^\s*import\s+(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]/gm)) {
      assert.match(m[1], /^\.\.?\//, `${rel} imports a non-relative module: ${m[1]}`);
      const target = new URL(m[1], new URL(rel, root));
      const relTarget = fileURLToPath(target).slice(fileURLToPath(root).length);
      assert.ok(existsSync(target), `${rel} imports ${m[1]} which does not exist`);
      visit(relTarget);
    }
  };
  visit(manifest.background.service_worker);
  assert.ok(seen.has('src/destination.js') && seen.has('src/vin.js'));
});
