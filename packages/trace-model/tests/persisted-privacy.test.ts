import { describe, expect, it } from 'vitest';
import { colorTraceSchema, persistedColorTraceSchema } from '../src/index';

function traceWithSelector(selector: string | null) {
  return {
    format: 'colortrace',
    schemaVersion: 1,
    traceId: '01234567-89ab-4def-8123-456789abcdef',
    capturedAt: '2026-08-12T12:00:00.000Z',
    intent: {
      authoredExpression: null,
      parsed: null,
      property: 'color',
      recipeKind: 'unknown',
      confidence: 'unknown',
    },
    appearance: {
      value: { space: 'srgb', channels: [1, 0, 0], alpha: 1 },
      interpretation: 'resolved-style',
      captureMethod: 'computed-style',
      outputColorSpace: 'srgb',
      gamut: 'unknown',
      dynamicRange: 'unknown',
      confidence: 'resolved',
    },
    authority: {
      authority: 'unknown',
      reason: 'unknown',
      forcedColorAdjust: 'auto',
      confidence: 'unknown',
    },
    target: { tagName: 'button', id: null, classes: [], role: null, selectorHint: 'button' },
    state: {
      pseudoClasses: [],
      pseudoElement: 'none',
      colorScheme: 'unknown',
      forcedColors: 'unknown',
      reducedMotion: 'unknown',
      reducedTransparency: 'unknown',
      contrastPreference: 'unknown',
    },
    environment: {
      browser: { family: 'chromium', version: '140' },
      viewport: { widthCssPx: 1280, heightCssPx: 720, devicePixelRatio: 1 },
      pageOrigin: 'https://example.test',
      documentUrlHash: null,
    },
    evidence: {
      nodes: [{
        id: 'rule',
        kind: 'css-rule',
        label: 'Matched author declaration',
        value: 'red',
        confidence: 'proven',
        source: {
          kind: 'style-rule',
          stylesheetUrlHash: null,
          selector,
          property: 'color',
          line: null,
          column: null,
        },
      }],
      edges: [],
    },
    tokenEvidence: { selectedTokenId: null, status: 'none', candidates: [] },
    privacy: {
      exposure: 'low',
      included: {
        colorData: true,
        cssEvidence: true,
        tokenMetadata: true,
        elementFingerprint: true,
        screenshotCrop: false,
        elementText: false,
        formValues: false,
        pageSource: false,
        cookies: false,
      },
    },
    annotations: [],
  };
}

describe('persisted ColorTrace privacy schema', () => {
  it('accepts low-exposure evidence when selector text is absent', () => {
    expect(() => persistedColorTraceSchema.parse(traceWithSelector(null))).not.toThrow();
  });

  it('rejects raw selectors even when the general evidence schema can represent them', () => {
    const unsafe = traceWithSelector('#account-secret[data-user="customer-42"]');
    expect(() => colorTraceSchema.parse(unsafe)).not.toThrow();
    expect(() => persistedColorTraceSchema.parse(unsafe)).toThrow(/cannot persist raw selector text/);
  });
});
