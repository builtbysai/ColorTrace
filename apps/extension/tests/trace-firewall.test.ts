import { describe, expect, it } from 'vitest';
import { buildQuickTrace, type QuickTraceSourceEvidence } from '../src/security/trace-firewall.js';

const identity = {
  now: () => new Date('2026-08-09T08:00:00.000Z'),
  randomUUID: () => '11111111-1111-4111-8111-111111111111',
};

const baseCapture = {
  property: 'color' as const,
  computedValue: 'rgb(20 30 40)',
  parsedAppearance: { space: 'srgb' as const, channels: [20 / 255, 30 / 255, 40 / 255], alpha: 1 },
  target: { tagName: 'button', id: null, classes: [], role: null, selectorHint: 'button' },
  state: {
    pseudoClasses: [],
    pseudoElement: 'none' as const,
    colorScheme: 'light' as const,
    forcedColors: 'none' as const,
    reducedMotion: 'no-preference' as const,
    reducedTransparency: 'no-preference' as const,
    contrastPreference: 'no-preference' as const,
  },
  environment: {
    browser: { family: 'chromium' as const, version: '140' },
    viewport: { widthCssPx: 1280, heightCssPx: 800, devicePixelRatio: 2 },
    pageOrigin: 'https://example.com/private/account?token=secret',
    documentUrlHash: null,
  },
  authority: {
    authority: 'unknown' as const,
    reason: 'unknown' as const,
    forcedColorAdjust: 'auto' as const,
    confidence: 'unknown' as const,
  },
};

const sourceEvidence = {
  inlineExpression: 'var(--brand-color)',
  customProperties: [
    {
      name: '--brand-color',
      resolvedExpression: 'oklch(0.62 0.18 260)',
      resolvedValue: { space: 'oklch' as const, channels: [0.62, 0.18, 260], alpha: 1 },
    },
  ],
};

describe('trace firewall', () => {
  it('persists computed style without claiming rendered-pixel appearance or authored provenance', () => {
    const trace = buildQuickTrace(baseCapture, identity);
    expect(trace.intent.authoredExpression).toBeNull();
    expect(trace.intent.confidence).toBe('unknown');
    expect(trace.appearance.interpretation).toBe('resolved-style');
    expect(trace.appearance.captureMethod).toBe('computed-style');
    expect(trace.evidence.nodes[0]?.kind).toBe('computed-value');
    expect(trace.environment.pageOrigin).toBe('https://example.com');
  });

  it('records observed inline evidence without claiming that it won the cascade', () => {
    const trace = buildQuickTrace({ ...baseCapture, sourceEvidence }, identity);
    expect(trace.intent.authoredExpression).toBeNull();
    expect(trace.intent.confidence).toBe('unknown');

    const authored = trace.evidence.nodes.find((node) => node.kind === 'authored-expression');
    expect(authored?.value).toBe('var(--brand-color)');
    expect(authored?.confidence).toBe('proven');
    expect(authored?.source?.kind).toBe('inline-style');
    expect(authored?.label).toContain('cascade contribution unproven');
    expect(trace.evidence.edges.some((edge) => (
      edge.from === authored?.id && edge.to === 'resolved-style'
    ))).toBe(false);
  });

  it('keeps CSS variable identity explicitly candidate-only', () => {
    const trace = buildQuickTrace({ ...baseCapture, sourceEvidence }, identity);
    expect(trace.tokenEvidence.status).toBe('candidate');
    expect(trace.tokenEvidence.selectedTokenId).toBeNull();
    expect(trace.tokenEvidence.candidates).toHaveLength(1);
    expect(trace.tokenEvidence.candidates[0]).toMatchObject({
      tokenId: 'css-variable:--brand-color',
      displayName: '--brand-color',
      status: 'candidate',
      reasons: ['css-variable-name'],
      resolvedValue: { space: 'oklch', channels: [0.62, 0.18, 260], alpha: 1 },
      deltaEOK: null,
    });
    expect(trace.evidence.edges).toContainEqual({
      from: 'inline-authored-expression',
      to: 'css-variable-1',
      relation: 'references',
      confidence: 'proven',
    });
  });

  it('surfaces a token candidate for a var() reference found only in a matched author rule, with no inline style', () => {
    const sourceFromExternalStylesheetOnly: QuickTraceSourceEvidence = {
      inlineExpression: null,
      customProperties: [
        {
          name: '--brand-color',
          resolvedExpression: 'oklch(0.62 0.18 260)',
          resolvedValue: { space: 'oklch', channels: [0.62, 0.18, 260], alpha: 1 },
        },
      ],
      matchedAuthorRules: [{ expression: 'var(--brand-color)', important: false }],
      inaccessibleStyleSheets: 0,
      ruleSearchTruncated: false,
    };

    const trace = buildQuickTrace({ ...baseCapture, sourceEvidence: sourceFromExternalStylesheetOnly }, identity);

    expect(trace.tokenEvidence.status).toBe('candidate');
    expect(trace.tokenEvidence.candidates).toHaveLength(1);
    expect(trace.tokenEvidence.candidates[0]).toMatchObject({
      tokenId: 'css-variable:--brand-color',
      displayName: '--brand-color',
      resolvedValue: { space: 'oklch', channels: [0.62, 0.18, 260], alpha: 1 },
    });
  });

  it('persists matched author declarations without selector identifiers or winning provenance', () => {
    const sourceWithUntrustedSelector = {
      inlineExpression: null,
      customProperties: [],
      matchedAuthorRules: [{
        expression: 'var(--brand)',
        important: true,
        selector: '#account-secret[data-user="customer-42"]',
      }],
      inaccessibleStyleSheets: 1,
      ruleSearchTruncated: false,
    } as unknown as QuickTraceSourceEvidence;
    const trace = buildQuickTrace({ ...baseCapture, sourceEvidence: sourceWithUntrustedSelector }, identity);

    const rule = trace.evidence.nodes.find((node) => node.id === 'matched-author-rule-1');
    expect(rule).toMatchObject({
      kind: 'css-rule',
      value: 'var(--brand)',
      confidence: 'proven',
      source: {
        kind: 'style-rule',
        selector: null,
        property: 'color',
      },
    });
    expect(rule?.label).toContain('selector withheld for privacy');
    expect(rule?.label).toContain('cascade contribution unproven');
    expect(rule?.label).toContain('!important');
    expect(trace.intent.authoredExpression).toBeNull();
    expect(trace.evidence.edges.some((edge) => edge.to === 'resolved-style' && edge.from === rule?.id)).toBe(false);
    expect(JSON.stringify(trace)).not.toContain('account-secret');
    expect(JSON.stringify(trace)).not.toContain('customer-42');

    const incomplete = trace.evidence.nodes.find((node) => node.id === 'author-rule-search-incomplete');
    expect(incomplete?.confidence).toBe('unknown');
    expect(incomplete?.label).toContain('inaccessible to page CSSOM');
  });

  it('keeps privacy-sensitive capture classes structurally disabled', () => {
    const trace = buildQuickTrace(baseCapture, identity);
    expect(trace.target.id).toBeNull();
    expect(trace.target.classes).toEqual([]);
    expect(trace.privacy.included.screenshotCrop).toBe(false);
    expect(trace.privacy.included.elementText).toBe(false);
    expect(trace.privacy.included.formValues).toBe(false);
    expect(trace.privacy.included.pageSource).toBe(false);
    expect(trace.privacy.included.cookies).toBe(false);
  });

  it('rejects markup-shaped computed and authored evidence', () => {
    expect(() => buildQuickTrace({ ...baseCapture, computedValue: '<input value="secret">' }, identity)).toThrow();
    expect(() => buildQuickTrace({
      ...baseCapture,
      sourceEvidence: { inlineExpression: '<style>secret</style>', customProperties: [] },
    }, identity)).toThrow();
  });

  it('rejects unsafe custom-property names at the persistence boundary', () => {
    expect(() => buildQuickTrace({
      ...baseCapture,
      sourceEvidence: {
        inlineExpression: 'var(--safe)',
        customProperties: [{ name: '--bad name', resolvedExpression: null, resolvedValue: null }],
      },
    }, identity)).toThrow();
  });
});
