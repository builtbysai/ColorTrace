import { readdir, readFile } from 'node:fs/promises';
import { inflateRawSync } from 'node:zlib';
import { auditManifest, expectedIcons } from './manifest-policy.mjs';

const outputDir = 'apps/extension/.output';
const archiveNames = (await readdir(outputDir)).filter((name) => name.endsWith('.zip')).sort();
const chromeName = archiveNames.find((name) => name.endsWith('-chrome.zip'));
const firefoxName = archiveNames.find((name) => name.endsWith('-firefox.zip'));
const sourcesName = archiveNames.find((name) => name.endsWith('-sources.zip'));

if (!chromeName || !firefoxName || !sourcesName) {
  throw new Error(`expected chrome, firefox, and sources release ZIPs; found: ${archiveNames.join(', ')}`);
}

for (const [browser, name] of [
  ['chromium', chromeName],
  ['firefox', firefoxName],
]) {
  const archive = await readZip(`${outputDir}/${name}`);
  const manifestBytes = archive.get('manifest.json');
  if (!manifestBytes) throw new Error(`${browser}: release ZIP is missing manifest.json`);
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  auditManifest(browser, manifest);
  for (const path of Object.values(expectedIcons)) {
    if (!archive.has(path)) throw new Error(`${browser}: release ZIP is missing extension icon ${path}`);
  }
}

const sources = await readZip(`${outputDir}/${sourcesName}`);
for (const required of [
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'SOURCE_CODE_REVIEW.md',
  'apps/extension/package.json',
  'apps/extension/wxt.config.ts',
  'apps/extension/public/icon-16.png',
  'apps/extension/public/icon-32.png',
  'apps/extension/public/icon-48.png',
  'apps/extension/public/icon-128.png',
  'packages/color-core/package.json',
  'packages/trace-model/package.json',
]) {
  if (!sources.has(required)) {
    throw new Error(`firefox sources ZIP is not workspace-reproducible: missing ${required}`);
  }
}

for (const name of sources.keys()) {
  const normalized = `/${name}`;
  if (
    normalized.includes('/node_modules/') ||
    normalized.includes('/.output/') ||
    normalized.includes('/.wxt/')
  ) {
    throw new Error(`firefox sources ZIP contains generated/dependency artifact: ${name}`);
  }
}

async function readZip(path) {
  const bytes = await readFile(path);
  const eocd = findSignature(bytes, 0x06054b50, Math.max(0, bytes.length - 65_557));
  if (eocd < 0) throw new Error(`${path}: ZIP end-of-central-directory not found`);
  const entries = bytes.readUInt16LE(eocd + 10);
  let cursor = bytes.readUInt32LE(eocd + 16);
  const files = new Map();

  for (let index = 0; index < entries; index += 1) {
    if (bytes.readUInt32LE(cursor) !== 0x02014b50) throw new Error(`${path}: invalid ZIP central directory`);
    const method = bytes.readUInt16LE(cursor + 10);
    const compressedSize = bytes.readUInt32LE(cursor + 20);
    const uncompressedSize = bytes.readUInt32LE(cursor + 24);
    const nameLength = bytes.readUInt16LE(cursor + 28);
    const extraLength = bytes.readUInt16LE(cursor + 30);
    const commentLength = bytes.readUInt16LE(cursor + 32);
    const localOffset = bytes.readUInt32LE(cursor + 42);
    const name = bytes.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8').replaceAll('\\', '/');

    if (!name.endsWith('/')) {
      if (bytes.readUInt32LE(localOffset) !== 0x04034b50) throw new Error(`${path}: invalid ZIP local header`);
      const localNameLength = bytes.readUInt16LE(localOffset + 26);
      const localExtraLength = bytes.readUInt16LE(localOffset + 28);
      const start = localOffset + 30 + localNameLength + localExtraLength;
      const compressed = bytes.subarray(start, start + compressedSize);
      const data = method === 0 ? Buffer.from(compressed) : method === 8 ? inflateRawSync(compressed) : null;
      if (!data) throw new Error(`${path}: unsupported ZIP compression method ${method}`);
      if (data.length !== uncompressedSize) throw new Error(`${path}: corrupt ZIP entry ${name}`);
      files.set(name, data);
    }

    cursor += 46 + nameLength + extraLength + commentLength;
  }

  return files;
}

function findSignature(bytes, signature, start) {
  for (let index = bytes.length - 4; index >= start; index -= 1) {
    if (bytes.readUInt32LE(index) === signature) return index;
  }
  return -1;
}
