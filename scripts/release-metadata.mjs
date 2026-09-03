export const FIREFOX_RELEASE_ID = '{4594ab8c-5c7c-5eab-a1b8-fdee041cb882}';

export function auditReleaseMetadata(browser, manifest, expectedVersion) {
  if (typeof expectedVersion !== 'string' || expectedVersion.length === 0) {
    throw new Error('expected extension package version is missing');
  }
  if (manifest.version !== expectedVersion) {
    throw new Error(
      `${browser}: manifest version ${manifest.version ?? '<missing>'} does not match package version ${expectedVersion}`,
    );
  }
  if (browser === 'firefox' && manifest.browser_specific_settings?.gecko?.id !== FIREFOX_RELEASE_ID) {
    throw new Error(`firefox: manifest does not use stable release ID ${FIREFOX_RELEASE_ID}`);
  }
}

export function selectSingleReleaseArchive(browser, archiveNames, suffix) {
  const matches = archiveNames.filter((candidate) => candidate.endsWith(suffix));
  if (matches.length === 0) throw new Error(`${browser}: release archive is missing`);
  if (matches.length !== 1) {
    throw new Error(`${browser}: expected exactly one release archive, found ${matches.length}: ${matches.join(', ')}`);
  }
  return matches[0];
}
