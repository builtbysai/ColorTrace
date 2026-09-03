const forbiddenPermissions = new Set([
  '<all_urls>',
  'cookies',
  'clipboardRead',
  'nativeMessaging',
  'pageCapture',
  'tabs',
  'webRequest',
]);

const expectedPermissions = new Set(['activeTab', 'scripting']);
export const expectedIcons = Object.freeze({
  '16': 'icon-16.png',
  '32': 'icon-32.png',
  '48': 'icon-48.png',
  '128': 'icon-128.png',
});

export function auditManifest(browser, manifest) {
  const permissions = new Set(manifest.permissions ?? []);
  const hosts = [
    ...(manifest.host_permissions ?? []),
    ...(manifest.optional_host_permissions ?? []),
  ];

  for (const permission of expectedPermissions) {
    if (!permissions.has(permission)) {
      throw new Error(`${browser}: missing required permission ${permission}`);
    }
  }
  for (const permission of permissions) {
    if (forbiddenPermissions.has(permission)) {
      throw new Error(`${browser}: forbidden permission ${permission}`);
    }
  }
  if (hosts.length !== 0) {
    throw new Error(`${browser}: host permissions are not allowed: ${hosts.join(', ')}`);
  }
  if (manifest.content_scripts !== undefined) {
    throw new Error(`${browser}: runtime-only inspector must not be declared in content_scripts`);
  }

  const icons = manifest.icons ?? {};
  for (const [size, path] of Object.entries(expectedIcons)) {
    if (icons[size] !== path) {
      throw new Error(`${browser}: expected ${size}px extension icon ${path}`);
    }
  }

  if (browser === 'firefox') {
    const requiredData = manifest.browser_specific_settings?.gecko?.data_collection_permissions?.required;
    if (!Array.isArray(requiredData) || requiredData.length !== 1 || requiredData[0] !== 'none') {
      throw new Error('firefox: expected explicit no-data collection declaration');
    }
  }
}
