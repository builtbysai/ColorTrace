import assert from 'node:assert/strict';
import test from 'node:test';
import { selectSingleReleaseArchive } from './release-metadata.mjs';

test('selects the only archive for a browser', () => {
  assert.equal(
    selectSingleReleaseArchive('chromium', ['colortrace-0.1.0-chrome.zip', 'colortrace-0.1.0-firefox.zip'], '-chrome.zip'),
    'colortrace-0.1.0-chrome.zip',
  );
});

test('rejects stale and current archives instead of auditing an arbitrary one', () => {
  assert.throws(
    () =>
      selectSingleReleaseArchive(
        'chromium',
        ['colortrace-0.0.9-chrome.zip', 'colortrace-0.1.0-chrome.zip'],
        '-chrome.zip',
      ),
    /expected exactly one release archive, found 2/,
  );
});

test('rejects a missing browser archive', () => {
  assert.throws(
    () => selectSingleReleaseArchive('firefox', ['colortrace-0.1.0-chrome.zip'], '-firefox.zip'),
    /release archive is missing/,
  );
});
