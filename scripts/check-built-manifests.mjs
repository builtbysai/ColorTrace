import { readFile } from 'node:fs/promises';
import { auditManifest } from './manifest-policy.mjs';

const candidates = [
  ['chromium', 'apps/extension/.output/chrome-mv3/manifest.json'],
  ['firefox', 'apps/extension/.output/firefox-mv3/manifest.json'],
];

for (const [browser, path] of candidates) {
  const manifest = JSON.parse(await readFile(path, 'utf8'));
  auditManifest(browser, manifest);
}
