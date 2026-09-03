import { describe, expect, it } from 'vitest';
import { deserializeColorTrace, serializeColorTrace } from '../src/export/colortrace.js';
import { buildQuickTrace } from '../src/security/trace-firewall.js';

function trace() {
  return buildQuickTrace({
    property: 'background-color',
    computedValue: 'rgb(99 91 255)',
    parsedAppearance: { space: 'srgb', channels: [99 / 255, 91 / 255, 1], alpha: 1 },
    target: { tagName: 'button', id: null, classes: [], role: 'button', selectorHint: 'button' },
    state: {
      pseudoClasses: [],
      pseudoElement: 'none',
      colorScheme: 'light',
      forcedColors: 'none',
      reducedMotion: 'no-preference',
      reducedTransparency: 'no-preference',
      contrastPreference: 'no-preference',
    },
    environment: {
      browser: { family: 'chromium', version: '140.0.0.0' },
      viewport: { widthCssPx: 1280, heightCssPx: 720, devicePixelRatio: 1 },
      pageOrigin: 'https://example.test',
      documentUrlHash: null,
    },
    authority: {
      authority: 'unknown',
      reason: 'unknown',
      forcedColorAdjust: 'auto',
      confidence: 'unknown',
    },
  }, {
    now: () => new Date('2026-08-11T10:00:00.000Z'),
    randomUUID: () => '01234567-89ab-4def-8123-456789abcdef',
  });
}

describe('.colortrace import', () => {
  it('round-trips a schema-valid trace', () => {
    const original = trace();
    expect(deserializeColorTrace(serializeColorTrace(original))).toEqual(original);
  });

  it('rejects malformed JSON', () => {
    expect(() => deserializeColorTrace('{not-json')).toThrow('Invalid .colortrace JSON');
  });

  it('rejects payloads that violate the privacy schema', () => {
    const unsafe = JSON.parse(serializeColorTrace(trace())) as { target: { id: string | null } };
    unsafe.target.id = 'account-8472';
    expect(() => deserializeColorTrace(JSON.stringify(unsafe))).toThrow();
  });

  it('rejects low-exposure imports carrying raw selector identifiers', () => {
    const unsafe = JSON.parse(serializeColorTrace(trace())) as {
      evidence: { nodes: Array<{ source: null | { selector: string | null } }> };
    };
    const node = unsafe.evidence.nodes.find((candidate) => candidate.source !== null);
    if (!node?.source) throw new Error('fixture requires source evidence');
    node.source.selector = '#account-secret[data-user="customer-42"]';
    expect(() => deserializeColorTrace(JSON.stringify(unsafe))).toThrow(/cannot persist raw selector text/);
  });
});
