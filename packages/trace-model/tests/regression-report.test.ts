import { describe, expect, it } from 'vitest';
import {
  colorTraceSchema,
  createColorTraceRegressionReport,
  serializeColorTraceRegressionReport,
  type ColorTrace,
} from '../src/index';

function trace(traceId: string, channels: [number, number, number], colorScheme: 'light' | 'dark'): ColorTrace {
  return colorTraceSchema.parse({
    format: 'colortrace', schemaVersion: 1, traceId, capturedAt: '2026-08-12T00:00:00.000Z',
    intent: { authoredExpression: null, parsed: null, property: 'color', recipeKind: 'unknown', confidence: 'unknown' },
    appearance: { value: { space: 'srgb', channels, alpha: 1 }, interpretation: 'resolved-style', captureMethod: 'computed-style', outputColorSpace: 'srgb', gamut: 'srgb', dynamicRange: 'sdr', confidence: 'resolved' },
    authority: { authority: 'unknown', reason: 'unknown', forcedColorAdjust: 'auto', confidence: 'unknown' },
    target: { tagName: 'p', id: null, classes: [], role: null, selectorHint: 'p' },
    state: { pseudoClasses: [], pseudoElement: 'none', colorScheme, forcedColors: 'none', reducedMotion: 'no-preference', reducedTransparency: 'unknown', contrastPreference: 'no-preference' },
    environment: { browser: { family: 'chromium', version: '140' }, viewport: { widthCssPx: 1280, heightCssPx: 720, devicePixelRatio: 1 }, pageOrigin: 'https://example.test', documentUrlHash: null },
    evidence: { nodes: [{ id: 'computed', kind: 'computed-value', label: 'Resolved color', value: 'rgb(1 2 3)', confidence: 'resolved', source: null }], edges: [] },
    tokenEvidence: { selectedTokenId: null, status: 'none', candidates: [] },
    privacy: { exposure: 'low', included: { colorData: true, cssEvidence: true, tokenMetadata: true, elementFingerprint: true, screenshotCrop: false, elementText: false, formValues: false, pageSource: false, cookies: false } },
    annotations: [],
  });
}

describe('ColorTrace regression report', () => {
  it('preserves explicit baseline and candidate roles and comparison evidence', () => {
    const baseline = trace('01234567-89ab-4def-8123-456789abcdef', [0.1, 0.2, 0.3], 'light');
    const candidate = trace('11234567-89ab-4def-8123-456789abcdef', [0.1, 0.25, 0.3], 'dark');
    const report = createColorTraceRegressionReport(baseline, candidate);

    expect(report.baseline.traceId).toBe(baseline.traceId);
    expect(report.candidate.traceId).toBe(candidate.traceId);
    expect(report.comparison.appearance.maxChannelDelta).toBeCloseTo(0.05);
    expect(report.comparison.state.map((entry) => entry.field)).toContain('color-scheme');
    expect(report.interpretation.causalAttribution).toBe('not-established');
  });

  it('exports only comparison context and no broader persisted trace payload', () => {
    const baseline = trace('01234567-89ab-4def-8123-456789abcdef', [0.1, 0.2, 0.3], 'light');
    const candidate = trace('11234567-89ab-4def-8123-456789abcdef', [0.1, 0.2, 0.3], 'light');
    const serialized = serializeColorTraceRegressionReport(createColorTraceRegressionReport(baseline, candidate));

    expect(serialized).toContain('persisted-colortrace-evidence-only');
    expect(serialized).not.toContain('selectorHint');
    expect(serialized).not.toContain('documentUrlHash');
    expect(serialized).not.toContain('"evidence":');
    expect(serialized).not.toContain('"annotations":');
  });

  it('serializes deterministically', () => {
    const baseline = trace('01234567-89ab-4def-8123-456789abcdef', [0.1, 0.2, 0.3], 'light');
    const candidate = trace('11234567-89ab-4def-8123-456789abcdef', [0.1, 0.2, 0.35], 'light');
    const report = createColorTraceRegressionReport(baseline, candidate);

    expect(serializeColorTraceRegressionReport(report)).toBe(serializeColorTraceRegressionReport(report));
    expect(serializeColorTraceRegressionReport(report).endsWith('\n')).toBe(true);
  });
});
