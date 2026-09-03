import { describe, expect, it } from 'vitest';
import { colorTraceSchema, compareColorTraces, type ColorTrace } from '../src/index';

function trace(overrides: Partial<ColorTrace> = {}): ColorTrace {
  const base = colorTraceSchema.parse({
    format: 'colortrace', schemaVersion: 1, traceId: '01234567-89ab-4def-8123-456789abcdef', capturedAt: '2026-08-09T01:00:00.000Z',
    intent: { authoredExpression: 'var(--accent)', parsed: null, property: 'background-color', recipeKind: 'custom-property', confidence: 'partial' },
    appearance: { value: { space: 'srgb', channels: [0.2, 0.3, 0.4], alpha: 1 }, interpretation: 'resolved-style', captureMethod: 'computed-style', outputColorSpace: 'srgb', gamut: 'srgb', dynamicRange: 'sdr', confidence: 'resolved' },
    authority: { authority: 'unknown', reason: 'unknown', forcedColorAdjust: 'auto', confidence: 'unknown' },
    target: { tagName: 'button', id: null, classes: [], role: 'button', selectorHint: 'button' },
    state: { pseudoClasses: [], pseudoElement: 'none', colorScheme: 'light', forcedColors: 'none', reducedMotion: 'no-preference', reducedTransparency: 'unknown', contrastPreference: 'no-preference' },
    environment: { browser: { family: 'chromium', version: '140' }, viewport: { widthCssPx: 1280, heightCssPx: 720, devicePixelRatio: 1 }, pageOrigin: 'https://example.test', documentUrlHash: null },
    evidence: { nodes: [{ id: 'computed', kind: 'computed-value', label: 'Resolved background', value: 'rgb(51 77 102)', confidence: 'resolved', source: null }], edges: [] },
    tokenEvidence: { selectedTokenId: null, status: 'none', candidates: [] },
    privacy: { exposure: 'low', included: { colorData: true, cssEvidence: true, tokenMetadata: true, elementFingerprint: true, screenshotCrop: false, elementText: false, formValues: false, pageSource: false, cookies: false } },
    annotations: [],
  });
  return { ...base, ...overrides };
}

describe('compareColorTraces', () => {
  it('reports a comparable numeric appearance change without inventing causality', () => {
    const before = trace();
    const after = trace({ appearance: { ...before.appearance, value: { ...before.appearance.value, channels: [0.2, 0.35, 0.4] } } });
    const comparison = compareColorTraces(before, after);
    expect(comparison.appearance.changed).toBe(true);
    expect(comparison.appearance.comparableCoordinates).toBe(true);
    expect(comparison.appearance.maxChannelDelta).toBeCloseTo(0.05);
    expect(comparison.reproductionNotes).toEqual([]);
  });

  it('refuses a numeric channel delta across color spaces and flags reproduction conditions', () => {
    const before = trace();
    const after = trace({
      appearance: { ...before.appearance, value: { space: 'display-p3', channels: [0.2, 0.3, 0.4], alpha: 1 }, outputColorSpace: 'display-p3' },
      state: { ...before.state, colorScheme: 'dark' },
      environment: { ...before.environment, viewport: { ...before.environment.viewport, devicePixelRatio: 2 } },
    });
    const comparison = compareColorTraces(before, after);
    expect(comparison.appearance.maxChannelDelta).toBeNull();
    expect(comparison.appearance.changed).toBe(true);
    expect(comparison.state.map((entry) => entry.field)).toContain('color-scheme');
    expect(comparison.environment.map((entry) => entry.field)).toContain('device-pixel-ratio');
    expect(comparison.reproductionNotes.length).toBeGreaterThanOrEqual(3);
  });

  it('does not call identical non-numeric coordinates changed', () => {
    const before = trace({ appearance: { ...trace().appearance, value: { space: 'srgb', channels: [null, 0.3, 0.4], alpha: 1 } } });
    const comparison = compareColorTraces(before, before);
    expect(comparison.appearance.comparableCoordinates).toBe(false);
    expect(comparison.appearance.changed).toBe(false);
  });

  it('treats pseudo-class ordering as set-like state evidence', () => {
    const before = trace({ state: { ...trace().state, pseudoClasses: ['hover', 'focus'] } });
    const after = trace({ state: { ...before.state, pseudoClasses: ['focus', 'hover'] } });
    expect(compareColorTraces(before, after).state).toEqual([]);
  });

  it('reports source and token-candidate changes as evidence changes only', () => {
    const before = trace();
    const after = trace({
      intent: { ...before.intent, authoredExpression: 'var(--accent-new)' },
      evidence: { nodes: [...before.evidence.nodes, { id: 'source', kind: 'authored-expression', label: 'Inline declaration', value: 'var(--accent-new)', confidence: 'partial', source: { kind: 'inline-style', stylesheetUrlHash: null, selector: null, property: 'background-color', line: null, column: null } }], edges: [] },
      tokenEvidence: { selectedTokenId: null, status: 'candidate', candidates: [{ tokenId: '--accent-new', displayName: '--accent-new', status: 'candidate', resolvedValue: null, reasons: ['css-variable-name'], deltaEOK: null }] },
    });
    const comparison = compareColorTraces(before, after);
    expect(comparison.provenance.authoredExpressionChanged).toBe(true);
    expect(comparison.provenance.sourceEvidenceChanged).toBe(true);
    expect(comparison.provenance.tokenCandidatesAdded).toEqual(['--accent-new']);
  });
});
