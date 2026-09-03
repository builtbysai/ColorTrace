import type { PickerResult } from '../messaging/protocol.js';
import { saveTrace } from '../persistence/database.js';

async function openDashboard(): Promise<void> {
  await browser.tabs.create({ url: browser.runtime.getURL('/dashboard.html') });
}

async function activateOnTab(tabId: number): Promise<PickerResult> {
  const results = await browser.scripting.executeScript({
    target: { tabId },
    files: ['/inspector.js'],
  });
  const result = results[0]?.result as PickerResult | undefined;
  if (!result) return { ok: false, reason: 'unsupported-page' };
  if (result.ok) {
    await saveTrace(result.trace);
    await openDashboard();
  }
  return result;
}

async function activateCurrentTab(): Promise<void> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (typeof tab?.id !== 'number') return;
  try {
    await activateOnTab(tab.id);
  } catch {
    // Restricted pages fail closed rather than expanding permissions.
  }
}

export default defineBackground(() => {
  browser.action.onClicked.addListener((tab) => {
    if (typeof tab.id !== 'number') return;
    void activateOnTab(tab.id).catch(() => undefined);
  });
  browser.commands.onCommand.addListener((command) => {
    if (command === 'activate-picker') void activateCurrentTab();
    if (command === 'open-dashboard') void openDashboard();
  });
});
