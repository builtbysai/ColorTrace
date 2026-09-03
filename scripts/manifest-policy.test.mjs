import assert from 'node:assert/strict';
import test from 'node:test';
import { auditManifest, expectedIcons } from './manifest-policy.mjs';

function validManifest(browser = 'chromium') {
  return {
    manifest_version: 3,
    permissions: ['activeTab', 'scripting'],
    icons: { ...expectedIcons },
    ...(browser === 'firefox'
      ? {
          browser_specific_settings: {
            gecko: {
              data_collection_permissions: { required: ['none'] },
            },
          },
        }
      : {}),
  };
}

test('accepts the complete local extension icon map', () => {
  assert.doesNotThrow(() => auditManifest('chromium', validManifest()));
  assert.doesNotThrow(() => auditManifest('firefox', validManifest('firefox')));
});

test('rejects a missing required extension icon', () => {
  const manifest = validManifest();
  delete manifest.icons['128'];
  assert.throws(() => auditManifest('chromium', manifest), /expected 128px extension icon icon-128\.png/);
});

test('rejects a mismatched extension icon path', () => {
  const manifest = validManifest();
  manifest.icons['48'] = 'other-48.png';
  assert.throws(() => auditManifest('chromium', manifest), /expected 48px extension icon icon-48\.png/);
});
