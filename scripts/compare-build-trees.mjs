import { readdir, readFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';

const [expectedArg, rebuiltArg] = process.argv.slice(2);
if (!expectedArg || !rebuiltArg) {
  throw new Error('usage: node scripts/compare-build-trees.mjs EXPECTED_DIR REBUILT_DIR');
}

const expectedRoot = resolve(expectedArg);
const rebuiltRoot = resolve(rebuiltArg);
const expectedFiles = await snapshot(expectedRoot);
const rebuiltFiles = await snapshot(rebuiltRoot);

const expectedNames = [...expectedFiles.keys()].sort();
const rebuiltNames = [...rebuiltFiles.keys()].sort();
const missing = expectedNames.filter((name) => !rebuiltFiles.has(name));
const extra = rebuiltNames.filter((name) => !expectedFiles.has(name));
const changed = [];

for (const name of expectedNames) {
  const expected = expectedFiles.get(name);
  const rebuilt = rebuiltFiles.get(name);
  if (rebuilt && !expected.equals(rebuilt)) changed.push(name);
}

if (missing.length || extra.length || changed.length) {
  const details = [
    missing.length ? `missing from rebuilt output: ${missing.join(', ')}` : null,
    extra.length ? `extra in rebuilt output: ${extra.join(', ')}` : null,
    changed.length ? `content differs: ${changed.join(', ')}` : null,
  ].filter(Boolean);
  throw new Error(`Firefox source rebuild differs from the normal production build\n${details.join('\n')}`);
}

console.log(`Firefox source rebuild matches ${expectedNames.length} production files byte-for-byte.`);

async function snapshot(root) {
  const files = new Map();
  await walk(root, root, files);
  if (files.size === 0) throw new Error(`${root}: build tree is empty`);
  return files;
}

async function walk(root, directory, files) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`${path}: symlinks are not valid build output`);
    if (entry.isDirectory()) {
      await walk(root, path, files);
      continue;
    }
    if (!entry.isFile()) throw new Error(`${path}: unsupported build output entry`);
    files.set(relative(root, path).replaceAll('\\', '/'), await readFile(path));
  }
}
