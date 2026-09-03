import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

const extensionDir = resolve(process.argv[2] ?? 'apps/extension/.output/chrome-mv3');
const chrome = process.env.CHROME_PATH ?? 'google-chrome';
const manifest = JSON.parse(await readFile(resolve(extensionDir, 'manifest.json'), 'utf8'));
const serviceWorkerPath = manifest.background?.service_worker;
if (typeof serviceWorkerPath !== 'string' || serviceWorkerPath.length === 0) {
  throw new Error('Built Chromium manifest does not declare a service worker.');
}
const expectedWorkerPath = `/${serviceWorkerPath.replace(/^\/+/, '')}`;
const profile = await mkdtemp(`${tmpdir()}/colortrace-chrome-`);
const downloadDir = resolve(profile, 'downloads');
let stderr = '';

const child = spawn(
  chrome,
  [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--no-first-run',
    '--disable-background-networking',
    '--enable-unsafe-extension-debugging',
    '--remote-debugging-pipe',
    `--user-data-dir=${profile}`,
    'about:blank',
  ],
  { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] },
);

child.stderr.setEncoding('utf8');
child.stderr.on('data', (chunk) => {
  stderr += chunk;
  if (stderr.length > 32_768) stderr = stderr.slice(-32_768);
});

const protocolInput = child.stdio[3];
const protocolOutput = child.stdio[4];
if (!protocolInput || !protocolOutput) throw new Error('Chrome debugging pipe was not created.');

let nextId = 1;
let protocolBuffer = '';
let protocolFailure;
const pending = new Map();
const events = [];

function rejectPending(error) {
  protocolFailure ??= error;
  for (const waiter of pending.values()) {
    clearTimeout(waiter.timer);
    waiter.reject(error);
  }
  pending.clear();
}

protocolInput.on('error', (error) => rejectPending(new Error(`Chrome debugging input failed: ${error.message}`)));
protocolOutput.on('error', (error) => rejectPending(new Error(`Chrome debugging output failed: ${error.message}`)));

protocolOutput.setEncoding('utf8');
protocolOutput.on('data', (chunk) => {
  protocolBuffer += chunk;
  while (true) {
    const end = protocolBuffer.indexOf('\0');
    if (end < 0) break;
    const raw = protocolBuffer.slice(0, end);
    protocolBuffer = protocolBuffer.slice(end + 1);
    if (!raw) continue;
    const message = JSON.parse(raw);
    if (message.id !== undefined) {
      const waiter = pending.get(message.id);
      if (!waiter) continue;
      pending.delete(message.id);
      clearTimeout(waiter.timer);
      if (message.error) waiter.reject(new Error(`CDP ${waiter.method} failed: ${message.error.message}`));
      else waiter.resolve(message.result ?? {});
    } else {
      events.push(message);
      if (events.length > 100) events.shift();
    }
  }
});

function command(method, params = {}, sessionId, timeoutMs = 15_000) {
  if (protocolFailure) return Promise.reject(protocolFailure);
  if (child.exitCode !== null) return Promise.reject(new Error(`Chrome exited with code ${child.exitCode}.`));
  const id = nextId++;
  return new Promise((resolvePromise, rejectPromise) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      rejectPromise(new Error(`Timed out waiting for CDP ${method}.`));
    }, timeoutMs);
    pending.set(id, { resolve: resolvePromise, reject: rejectPromise, timer, method });
    protocolInput.write(`${JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })}\0`);
  });
}

const sleep = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));

async function startFixtureServer() {
  const html = `<!doctype html>
<html>
<head><meta charset="utf-8"><title>ColorTrace smoke fixture</title></head>
<body>
  <button id="trace-target" style="color: rgb(17, 34, 51); background-color: rgb(20, 40, 60); border: 4px solid rgb(70, 80, 90);">Trace target</button>
  <svg width="40" height="40" aria-label="fixture vector"><rect width="30" height="30" fill="rgb(90, 100, 110)" stroke="rgb(120, 130, 140)"></rect></svg>
</body>
</html>`;
  const server = createServer((request, response) => {
    if (request.url !== '/') {
      response.writeHead(404, { 'content-type': 'text/plain' });
      response.end('not found');
      return;
    }
    response.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    });
    response.end(html);
  });
  await new Promise((resolvePromise, rejectPromise) => {
    server.once('error', rejectPromise);
    server.listen(0, '127.0.0.1', resolvePromise);
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    server.close();
    throw new Error('ColorTrace fixture server did not bind a TCP port.');
  }
  return { server, url: `http://127.0.0.1:${address.port}/`, origin: `http://127.0.0.1:${address.port}` };
}

async function closeServer(server) {
  if (!server) return;
  await new Promise((resolvePromise, rejectPromise) => {
    server.close((error) => (error ? rejectPromise(error) : resolvePromise()));
  });
}

async function waitForColorTraceWorker(extensionId) {
  const expectedUrl = `chrome-extension://${extensionId}${expectedWorkerPath}`;
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const { targetInfos = [] } = await command('Target.getTargets');
    if (targetInfos.some((target) => target.type === 'service_worker' && target.url === expectedUrl)) return;
    await sleep(100);
  }
  throw new Error(`ColorTrace service worker ${JSON.stringify(expectedWorkerPath)} did not start.`);
}

async function waitForDocument(sessionId, expectedTitle) {
  const deadline = Date.now() + 5_000;
  let observed = 'no document state';
  while (Date.now() < deadline) {
    const result = await command(
      'Runtime.evaluate',
      {
        expression: '({ title: document.title, readyState: document.readyState })',
        returnByValue: true,
      },
      sessionId,
    );
    const state = result.result?.value;
    observed = JSON.stringify(state);
    if (state?.title === expectedTitle && state.readyState === 'complete') return;
    await sleep(100);
  }
  throw new Error(`Document ${JSON.stringify(expectedTitle)} did not finish loading; observed ${observed}.`);
}

async function dispatchKey(sessionId, key, code, windowsVirtualKeyCode) {
  await command('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode }, sessionId);
  await command('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode }, sessionId);
}

async function waitForProtocolEvent(startIndex, method, sessionId, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const match = events.slice(startIndex).find((event) => event.method === method && event.sessionId === sessionId);
    if (match) return match.params ?? {};
    await sleep(50);
  }
  throw new Error(`Timed out waiting for CDP ${method} after dashboard reload.`);
}

async function waitForPageTarget(url) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const { targetInfos = [] } = await command('Target.getTargets');
    const page = targetInfos.find((target) => target.type === 'page' && target.url === url);
    if (page?.targetId) return page.targetId;
    await sleep(50);
  }
  throw new Error(`Chrome did not expose a page target for ${url}.`);
}

async function openFixture(url) {
  const { targetId: tabTargetId } = await command('Target.createTarget', { url, forTab: true });
  if (!tabTargetId) throw new Error('Chrome did not create the ColorTrace fixture tab target.');
  const pageTargetId = await waitForPageTarget(url);
  const { sessionId } = await command('Target.attachToTarget', { targetId: pageTargetId, flatten: true });
  if (!sessionId) throw new Error('Chrome did not attach to the ColorTrace fixture page target.');
  await waitForDocument(sessionId, 'ColorTrace smoke fixture');
  await command('Page.bringToFront', {}, sessionId);

  const computed = await command('Runtime.evaluate', {
    expression: `(() => {
      const target = document.querySelector('#trace-target');
      if (!(target instanceof HTMLElement)) return null;
      const style = getComputedStyle(target);
      return { color: style.color, background: style.backgroundColor, border: style.borderTopColor };
    })()`,
    returnByValue: true,
  }, sessionId);
  const expected = computed.result?.value;
  if (expected?.background !== 'rgb(20, 40, 60)' || expected.color === expected.background) {
    throw new Error(`Fixture color evidence is not deterministic: ${JSON.stringify(expected)}.`);
  }

  await dispatchKey(sessionId, 'Tab', 'Tab', 9);
  const focus = await command('Runtime.evaluate', {
    expression: 'document.activeElement?.id ?? ""',
    returnByValue: true,
  }, sessionId);
  if (focus.result?.value !== 'trace-target') {
    throw new Error(`Fixture keyboard focus did not reach trace-target; observed ${JSON.stringify(focus.result?.value)}.`);
  }

  return { targetId: tabTargetId, sessionId };
}

async function waitForPicker(sessionId) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const result = await command('Runtime.evaluate', {
      expression: 'document.querySelector("#colortrace-picker-panel")?.textContent ?? ""',
      returnByValue: true,
    }, sessionId);
    if (String(result.result?.value ?? '').includes('ColorTrace:')) return;
    await sleep(50);
  }
  throw new Error('ColorTrace picker did not appear after triggering the extension action.');
}

async function captureBackgroundWithKeyboard(extensionId, fixture) {
  await command('Extensions.triggerAction', { id: extensionId, targetId: fixture.targetId });
  await waitForPicker(fixture.sessionId);
  await dispatchKey(fixture.sessionId, 'b', 'KeyB', 66);

  const selected = await command('Runtime.evaluate', {
    expression: 'document.querySelector("#colortrace-picker-panel")?.textContent ?? ""',
    returnByValue: true,
  }, fixture.sessionId);
  if (!String(selected.result?.value ?? '').includes('(background-color)')) {
    throw new Error(`Picker did not switch to background-color through keyboard input: ${JSON.stringify(selected.result?.value)}.`);
  }

  await dispatchKey(fixture.sessionId, 'Enter', 'Enter', 13);
}

async function waitForDashboardTarget(extensionId) {
  const dashboardUrl = `chrome-extension://${extensionId}/dashboard.html`;
  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline) {
    const { targetInfos = [] } = await command('Target.getTargets');
    const dashboard = targetInfos.find((target) => target.type === 'page' && target.url === dashboardUrl);
    if (dashboard?.targetId) return dashboard.targetId;
    await sleep(100);
  }
  throw new Error('Successful Quick Trace did not open the ColorTrace dashboard.');
}

async function dashboardState(sessionId) {
  const result = await command('Runtime.evaluate', {
    expression: `(() => ({
      status: document.querySelector('#status')?.textContent ?? '',
      cards: [...document.querySelectorAll('.trace-card')].map((card) => ({
        property: card.querySelector('.property')?.textContent ?? '',
        origin: card.querySelector('.origin')?.textContent ?? '',
        evidence: [...card.querySelectorAll('.evidence li')].map((node) => node.textContent ?? ''),
        compareLabel: card.querySelector('input[type="checkbox"]')?.getAttribute('aria-label') ?? '',
      })),
    }))()`,
    returnByValue: true,
  }, sessionId);
  return result.result?.value;
}

async function waitForCapturedTrace(sessionId, expectedOrigin, expectedTraceId) {
  const deadline = Date.now() + 5_000;
  let observed = 'no trace state';
  while (Date.now() < deadline) {
    const state = await dashboardState(sessionId);
    observed = JSON.stringify(state);
    const card = state?.cards?.[0];
    const identityMatches = !expectedTraceId || String(card?.compareLabel ?? '').includes(expectedTraceId);
    if (state?.cards?.length === 1 && card?.property === 'background-color' && card?.origin === expectedOrigin && identityMatches) {
      if (!card.evidence.some((entry) => entry.includes('rgb(20, 40, 60)'))) {
        throw new Error(`Persisted trace did not preserve the expected bounded background evidence: ${observed}.`);
      }
      return state;
    }
    await sleep(100);
  }
  throw new Error(`Captured trace was not schema-valid and reopenable in the dashboard; observed ${observed}.`);
}

async function clickDashboardButton(sessionId, label) {
  const result = await command('Runtime.evaluate', {
    expression: `(() => {
      const button = [...document.querySelectorAll('button')].find((node) => node.textContent?.trim() === ${JSON.stringify(label)});
      if (!(button instanceof HTMLButtonElement)) return false;
      button.click();
      return true;
    })()`,
    returnByValue: true,
  }, sessionId);
  if (result.result?.value !== true) throw new Error(`Dashboard button ${JSON.stringify(label)} was not available.`);
}

async function waitForDownload(startIndex) {
  const deadline = Date.now() + 8_000;
  let download;
  while (Date.now() < deadline) {
    for (const event of events.slice(startIndex)) {
      if (event.method === 'Browser.downloadWillBegin' && event.params?.suggestedFilename?.endsWith('.colortrace')) {
        download ??= event.params;
      }
      if (download && event.method === 'Browser.downloadProgress' && event.params?.guid === download.guid) {
        if (event.params.state === 'canceled') throw new Error('ColorTrace export download was canceled by Chromium.');
        if (event.params.state === 'completed') {
          const path = event.params.filePath || resolve(downloadDir, download.suggestedFilename);
          const sourceDeadline = Date.now() + 2_000;
          while (Date.now() < sourceDeadline) {
            try {
              return { path, source: await readFile(path, 'utf8'), suggestedFilename: download.suggestedFilename };
            } catch {
              await sleep(50);
            }
          }
          throw new Error(`Chromium reported a completed ColorTrace download but ${JSON.stringify(path)} was not readable.`);
        }
      }
    }
    await sleep(50);
  }
  throw new Error('ColorTrace export did not produce a completed Chromium download.');
}

async function clearDashboardHistory(sessionId) {
  await clickDashboardButton(sessionId, 'Clear local history');
  const deadline = Date.now() + 5_000;
  let observed = 'no dashboard state';
  while (Date.now() < deadline) {
    const state = await dashboardState(sessionId);
    observed = JSON.stringify(state);
    if (state?.cards?.length === 0 && String(state?.status ?? '').startsWith('No saved traces yet.')) return;
    await sleep(100);
  }
  throw new Error(`Dashboard did not clear the captured trace through product UI; observed ${observed}.`);
}

async function importDownloadedTrace(sessionId, path) {
  const { root } = await command('DOM.getDocument', { depth: 1 }, sessionId);
  if (!root?.nodeId) throw new Error('Chrome did not expose the dashboard document for file import.');
  const { nodeId } = await command('DOM.querySelector', { nodeId: root.nodeId, selector: '#import-trace' }, sessionId);
  if (!nodeId) throw new Error('Dashboard file input was not found through the browser DOM protocol.');
  await command('DOM.setFileInputFiles', { files: [path], nodeId }, sessionId);
}

async function verifyExportImportRoundTrip(sessionId, expectedOrigin) {
  await mkdir(downloadDir, { recursive: true });
  await command('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadDir, eventsEnabled: true });
  const startIndex = events.length;
  await clickDashboardButton(sessionId, 'Export .colortrace');
  const exported = await waitForDownload(startIndex);

  let trace;
  try {
    trace = JSON.parse(exported.source);
  } catch {
    throw new Error('Browser-produced .colortrace export was not valid JSON.');
  }
  const traceId = trace?.traceId;
  if (typeof traceId !== 'string' || !traceId.length || exported.suggestedFilename !== `${traceId}.colortrace`) {
    throw new Error(`Exported filename did not match the persisted trace identity: ${JSON.stringify(exported.suggestedFilename)}.`);
  }
  if (trace?.intent?.property !== 'background-color' || trace?.environment?.pageOrigin !== expectedOrigin) {
    throw new Error('Browser-produced .colortrace export did not preserve the captured property and page origin.');
  }
  if (!exported.source.includes('rgb(20, 40, 60)')) {
    throw new Error('Browser-produced .colortrace export did not preserve expected bounded color evidence.');
  }
  const rawSelectorPersisted = Array.isArray(trace?.evidence?.nodes)
    && trace.evidence.nodes.some((node) => node?.source?.selector !== null && node?.source?.selector !== undefined);
  if (exported.source.includes('trace-target') || rawSelectorPersisted) {
    throw new Error('Low-exposure .colortrace export leaked a raw page identifier or selector value.');
  }

  await clearDashboardHistory(sessionId);
  await importDownloadedTrace(sessionId, exported.path);
  const imported = await waitForCapturedTrace(sessionId, expectedOrigin, traceId);
  if (!String(imported?.status ?? '').startsWith(`Imported ${traceId}.`)) {
    throw new Error(`Dashboard did not report import of the browser-produced trace; observed ${JSON.stringify(imported)}.`);
  }

  await command('Page.enable', {}, sessionId);
  const reloadEventStart = events.length;
  await command('Page.reload', { ignoreCache: true }, sessionId);
  await waitForProtocolEvent(reloadEventStart, 'Page.loadEventFired', sessionId);
  await waitForDocument(sessionId, 'ColorTrace');
  await waitForCapturedTrace(sessionId, expectedOrigin, traceId);
}

async function verifyCapturedDashboard(extensionId, expectedOrigin) {
  const targetId = await waitForDashboardTarget(extensionId);
  const { sessionId } = await command('Target.attachToTarget', { targetId, flatten: true });
  if (!sessionId) throw new Error('Chrome did not attach to the captured-trace dashboard target.');
  await waitForDocument(sessionId, 'ColorTrace');
  await waitForCapturedTrace(sessionId, expectedOrigin);

  await dispatchKey(sessionId, 'Tab', 'Tab', 9);
  const focusResult = await command('Runtime.evaluate', {
    expression: 'document.activeElement?.id ?? ""',
    returnByValue: true,
  }, sessionId);
  if (focusResult.result?.value !== 'import-trace') {
    throw new Error(`Dashboard keyboard focus did not reach the import control first; observed ${JSON.stringify(focusResult.result?.value)}.`);
  }

  const activationResult = await command('Runtime.evaluate', {
    expression: `(() => {
      const input = document.querySelector('#import-trace');
      const label = document.querySelector('label[for="import-trace"]');
      if (!(input instanceof HTMLInputElement) || !(label instanceof HTMLLabelElement)) return false;
      let activated = false;
      input.addEventListener('click', () => { activated = true; }, { once: true });
      label.click();
      return activated;
    })()`,
    returnByValue: true,
  }, sessionId);
  if (activationResult.result?.value !== true) {
    throw new Error('Dashboard import label did not activate its native file input.');
  }

  await verifyExportImportRoundTrip(sessionId, expectedOrigin);
}

async function waitForExit(timeoutMs) {
  if (child.exitCode !== null) return true;
  return Promise.race([
    new Promise((resolvePromise) => child.once('exit', () => resolvePromise(true))),
    sleep(timeoutMs).then(() => false),
  ]);
}

async function stopChrome() {
  if (child.exitCode !== null) return;
  child.kill('SIGTERM');
  if (await waitForExit(2_000)) return;
  child.kill('SIGKILL');
  await waitForExit(2_000);
}

let fixtureServer;
try {
  const { id: extensionId } = await command('Extensions.loadUnpacked', { path: extensionDir }, undefined, 30_000);
  if (typeof extensionId !== 'string' || extensionId.length === 0) {
    throw new Error('Chrome did not return a ColorTrace extension ID.');
  }
  await waitForColorTraceWorker(extensionId);
  const fixture = await startFixtureServer();
  fixtureServer = fixture.server;
  const fixtureTarget = await openFixture(fixture.url);
  await captureBackgroundWithKeyboard(extensionId, fixtureTarget);
  await verifyCapturedDashboard(extensionId, fixture.origin);
  console.log('ColorTrace Chromium startup, activeTab Quick Trace capture, persistence, export/import round trip, and dashboard smoke test passed.');
} catch (error) {
  if (stderr.trim()) console.error(stderr.trim());
  if (events.length) console.error(`Recent CDP events: ${JSON.stringify(events.slice(-10))}`);
  throw error;
} finally {
  rejectPending(new Error('Chrome stopped before the CDP command completed.'));
  await stopChrome();
  await closeServer(fixtureServer);
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
