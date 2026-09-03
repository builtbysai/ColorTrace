import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const EXTENSION_DIR = path.resolve(ROOT, process.argv[2] ?? 'apps/extension/.output/firefox-mv3');
const MANIFEST_PATH = path.join(EXTENSION_DIR, 'manifest.json');
const STARTUP_TIMEOUT_MS = 20_000;
const REQUEST_TIMEOUT_MS = 60_000;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function reservePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Unable to reserve a local TCP port for geckodriver.'));
        return;
      }
      const { port } = address;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(options.headers ?? {}),
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const text = await response.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  if (!response.ok) {
    throw new Error(`WebDriver request failed (${response.status}): ${typeof body === 'string' ? body : JSON.stringify(body)}`);
  }
  return body;
}

async function waitForWebDriver(baseUrl, child, diagnostics) {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`geckodriver exited before becoming ready (exit ${child.exitCode}).\n${diagnostics.join('')}`);
    }
    try {
      const status = await requestJson(`${baseUrl}/status`);
      if (status?.value?.ready) return;
    } catch {
      // The driver may not have bound the port yet.
    }
    await delay(100);
  }
  throw new Error(`Timed out waiting for geckodriver.\n${diagnostics.join('')}`);
}

async function stopChild(child) {
  if (child.exitCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    delay(2_000).then(() => {
      if (child.exitCode === null) child.kill('SIGKILL');
    }),
  ]);
}

async function openWebSocket(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const timer = setTimeout(() => reject(new Error('Timed out connecting to Firefox WebDriver BiDi.')), REQUEST_TIMEOUT_MS);
    socket.addEventListener('open', () => {
      clearTimeout(timer);
      resolve(socket);
    }, { once: true });
    socket.addEventListener('error', () => {
      clearTimeout(timer);
      reject(new Error('Failed to connect to Firefox WebDriver BiDi.'));
    }, { once: true });
  });
}

async function bidiCommand(socket, id, method, params) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.removeEventListener('message', onMessage);
      reject(new Error(`Timed out waiting for WebDriver BiDi ${method}.`));
    }, REQUEST_TIMEOUT_MS);
    function onMessage(event) {
      const message = JSON.parse(String(event.data));
      if (message.id !== id) return;
      clearTimeout(timer);
      socket.removeEventListener('message', onMessage);
      if (message.type === 'error') {
        reject(new Error(`WebDriver BiDi ${method} failed: ${message.error}: ${message.message}`));
      } else {
        resolve(message.result ?? {});
      }
    }
    socket.addEventListener('message', onMessage);
    socket.send(JSON.stringify({ id, method, params }));
  });
}

const manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));
const expectedId = manifest?.browser_specific_settings?.gecko?.id;
if (typeof expectedId !== 'string' || !expectedId) {
  throw new Error('Built Firefox manifest is missing browser_specific_settings.gecko.id.');
}

const port = await reservePort();
const baseUrl = `http://127.0.0.1:${port}`;
const diagnostics = [];
const geckodriver = spawn('geckodriver', ['--port', String(port), '--log', 'info'], {
  stdio: ['ignore', 'pipe', 'pipe'],
});
geckodriver.stdout.setEncoding('utf8');
geckodriver.stderr.setEncoding('utf8');
geckodriver.stdout.on('data', (chunk) => diagnostics.push(chunk));
geckodriver.stderr.on('data', (chunk) => diagnostics.push(chunk));

let sessionId;
let socket;
try {
  await waitForWebDriver(baseUrl, geckodriver, diagnostics);
  const session = await requestJson(`${baseUrl}/session`, {
    method: 'POST',
    body: JSON.stringify({
      capabilities: {
        alwaysMatch: {
          browserName: 'firefox',
          webSocketUrl: true,
          'moz:firefoxOptions': { args: ['-headless'] },
        },
      },
    }),
  });
  sessionId = session?.value?.sessionId;
  const webSocketUrl = session?.value?.capabilities?.webSocketUrl;
  if (typeof sessionId !== 'string' || !sessionId || typeof webSocketUrl !== 'string' || !webSocketUrl) {
    throw new Error(`Firefox WebDriver session did not return BiDi session details: ${JSON.stringify(session)}`);
  }

  socket = await openWebSocket(webSocketUrl);
  const installed = await bidiCommand(socket, 1, 'webExtension.install', {
    extensionData: { type: 'path', path: EXTENSION_DIR },
  });
  const installedId = installed?.extension;
  if (installedId !== expectedId) {
    throw new Error(`Firefox installed unexpected extension id ${JSON.stringify(installedId)}; expected ${JSON.stringify(expectedId)}.`);
  }

  console.log(`Firefox smoke passed: installed ${installedId} from ${EXTENSION_DIR}`);
} catch (error) {
  const diagnosticText = diagnostics.join('').trim();
  if (diagnosticText) console.error(diagnosticText);
  throw error;
} finally {
  if (socket) socket.close();
  if (sessionId) {
    try {
      await requestJson(`${baseUrl}/session/${sessionId}`, { method: 'DELETE' });
    } catch {
      // Cleanup should not mask the validation result.
    }
  }
  await stopChild(geckodriver);
}
