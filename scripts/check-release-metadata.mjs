import { readdir, readFile } from 'node:fs/promises';
import { inflateRawSync } from 'node:zlib';
import { auditReleaseMetadata, selectSingleReleaseArchive } from './release-metadata.mjs';

const extensionPackage = JSON.parse(await readFile('apps/extension/package.json', 'utf8'));
const expectedVersion = extensionPackage.version;
const outputDir = 'apps/extension/.output';

for (const [browser, path] of [
  ['chromium', `${outputDir}/chrome-mv3/manifest.json`],
  ['firefox', `${outputDir}/firefox-mv3/manifest.json`],
]) {
  const manifest = JSON.parse(await readFile(path, 'utf8'));
  auditReleaseMetadata(browser, manifest, expectedVersion);
}

const archiveNames = (await readdir(outputDir)).filter((name) => name.endsWith('.zip')).sort();
for (const [browser, suffix] of [
  ['chromium', '-chrome.zip'],
  ['firefox', '-firefox.zip'],
]) {
  const name = selectSingleReleaseArchive(browser, archiveNames, suffix);
  const manifest = JSON.parse((await readZipManifest(`${outputDir}/${name}`)).toString('utf8'));
  auditReleaseMetadata(browser, manifest, expectedVersion);
}

async function readZipManifest(path) {
  const bytes = await readFile(path);
  const eocd = findSignature(bytes, 0x06054b50, Math.max(0, bytes.length - 65_557));
  if (eocd < 0) throw new Error(`${path}: ZIP end-of-central-directory not found`);
  const entries = bytes.readUInt16LE(eocd + 10);
  let cursor = bytes.readUInt32LE(eocd + 16);

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

    if (name === 'manifest.json') {
      if (bytes.readUInt32LE(localOffset) !== 0x04034b50) throw new Error(`${path}: invalid ZIP local header`);
      const localNameLength = bytes.readUInt16LE(localOffset + 26);
      const localExtraLength = bytes.readUInt16LE(localOffset + 28);
      const start = localOffset + 30 + localNameLength + localExtraLength;
      const compressed = bytes.subarray(start, start + compressedSize);
      const data = method === 0 ? Buffer.from(compressed) : method === 8 ? inflateRawSync(compressed) : null;
      if (!data) throw new Error(`${path}: unsupported ZIP compression method ${method}`);
      if (data.length !== uncompressedSize) throw new Error(`${path}: corrupt manifest.json`);
      return data;
    }

    cursor += 46 + nameLength + extraLength + commentLength;
  }

  throw new Error(`${path}: release ZIP is missing manifest.json`);
}

function findSignature(bytes, signature, start) {
  for (let index = bytes.length - 4; index >= start; index -= 1) {
    if (bytes.readUInt32LE(index) === signature) return index;
  }
  return -1;
}
