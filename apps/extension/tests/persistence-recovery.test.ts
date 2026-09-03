import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildQuickTrace } from '../src/security/trace-firewall.js';
import {
  openDatabase,
  parsePersistedTraceHistory,
  requestResult,
  transactionComplete,
} from '../src/persistence/database.js';

function trace(traceId: string, capturedAt: string) {
  return buildQuickTrace({
    property: 'background-color',
    computedValue: 'rgb(99 91 255)',
    parsedAppearance: { space: 'srgb', channels: [99 / 255, 91 / 255, 1], alpha: 1 },
    target: { tagName: 'button', id: null, classes: [], role: 'button', selectorHint: 'button' },
    state: {
      pseudoClasses: [], pseudoElement: 'none', colorScheme: 'light', forcedColors: 'none',
      reducedMotion: 'no-preference', reducedTransparency: 'no-preference', contrastPreference: 'no-preference',
    },
    environment: {
      browser: { family: 'chromium', version: '140.0.0.0' },
      viewport: { widthCssPx: 1280, heightCssPx: 720, devicePixelRatio: 1 },
      pageOrigin: 'https://example.test', documentUrlHash: null,
    },
    authority: { authority: 'unknown', reason: 'unknown', forcedColorAdjust: 'auto', confidence: 'unknown' },
  }, {
    now: () => new Date(capturedAt),
    randomUUID: () => traceId,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('persisted trace recovery', () => {
  it('keeps valid traces available when one stored row is malformed', () => {
    const older = trace('01234567-89ab-4def-8123-456789abcdef', '2026-08-10T10:00:00.000Z');
    const newer = trace('11234567-89ab-4def-8123-456789abcdef', '2026-08-11T10:00:00.000Z');
    const malformed = { traceId: 'legacy-row', capturedAt: 'not-a-date', target: { id: 'sensitive-id' } };

    const history = parsePersistedTraceHistory([older, malformed, newer]);

    expect(history.invalidCount).toBe(1);
    expect(history.traces.map((entry) => entry.traceId)).toEqual([newer.traceId, older.traceId]);
    expect(JSON.stringify(history.traces)).not.toContain('sensitive-id');
  });

  it('does not reinterpret malformed rows as partial traces', () => {
    const history = parsePersistedTraceHistory([{ traceId: 'broken' }, null, 'legacy']);
    expect(history).toEqual({ traces: [], invalidCount: 3 });
  });

  it('rejects promptly when opening IndexedDB fails', async () => {
    const request = {
      error: null,
      onerror: null,
      onupgradeneeded: null,
      onsuccess: null,
    } as unknown as IDBOpenDBRequest;
    vi.stubGlobal('indexedDB', { open: () => request });

    const pending = openDatabase();
    const assertion = expect(pending).rejects.toThrow('Failed to open ColorTrace database');
    request.onerror?.call(request, {} as Event);
    await assertion;
  });

  it('rejects promptly when an IndexedDB read request fails', async () => {
    const request = {
      error: null,
      onerror: null,
      onsuccess: null,
    } as unknown as IDBRequest<unknown[]>;

    const pending = requestResult(request);
    const assertion = expect(pending).rejects.toThrow('IndexedDB request failed');
    request.onerror?.call(request, {} as Event);
    await assertion;
  });

  it('rejects promptly when a trace-history transaction aborts', async () => {
    const tx = {
      error: null,
      onabort: null,
      oncomplete: null,
      onerror: null,
    } as unknown as IDBTransaction;

    const pending = transactionComplete(tx, 'Trace history read failed');
    const assertion = expect(pending).rejects.toThrow('Trace history read failed aborted');
    tx.onabort?.call(tx, {} as Event);
    await assertion;
  });
});
