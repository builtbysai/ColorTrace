import { describe, expect, it } from 'vitest';
import {
  COLORTRACE_FORMAT,
  COLORTRACE_SCHEMA_VERSION,
  colorTraceSchema,
  evidenceGraphSchema,
} from '../src/index';

function validTrace() {
  return {
    format: COLORTRACE_FORMAT,
    schemaVersion: COLORTRACE_SCHEMA_VERSION,
    traceId: '01234567-89ab-4def-8123-456789abcdef',
    capturedAt: '2026-08-09T01:00:00.000Z',
    intent: {
      authoredExpression: 'var(--action-primary)',
      parsed: {
        space: 'srgb' as const,
        channels: [0.388, 0.357, 1],
        alpha: 1,
      },
      property: 'background-color',
      recipeKind: 'custom-property' as const,
      confidence: 'proven' as const,
    },
    appearance: {
      value: {
        space: 'srgb' as const,
        channels: [0.388, 0.357, 1],
        alpha: 1,
      },
      interpretation: 'resolved-style' as const,
      captureMethod: 'computed-style' as const,
      outputColorSpace: 'srgb' as const,
      gamut: 'srgb' as const,
      dynamicRange: 'sdr' as const,
      confidence: 'resolved' as const,
    },
    authority: {
      authority: 'author' as const,
      reason: 'authored-value-used' as const,
      forcedColorAdjust: 'auto' as const,
      confidence: 'proven' as const,
    },
    target: {
      tagName: 'button',
      id: null,
      classes: [],
      role: 'button',
      selectorHint: 'button',
    },
    state: {
      pseudoClasses: ['hover' as const],
      pseudoElement: 'none' as const,
      colorScheme: 'dark' as const,
      forcedColors: 'none' as const,
      reducedMotion: 'no-preference' as const,
      reducedTransparency: 'unknown' as const,
      contrastPreference: 'no-preference' as const,
    },
    environment: {
      browser: {
        family: 'chromium' as const,
        version: '140.0.0.0',
      },
      viewport: {
        widthCssPx: 1440,
        heightCssPx: 900,
        devicePixelRatio: 2,
      },
      pageOrigin: 'https://example.test/path?secret=1',
      documentUrlHash: 'a'.repeat(64),
    },
    evidence: {
      nodes: [
        {
          id: 'observed',
          kind: 'observed-color' as const,
          label: 'Observed background',
          value: '#635bff',
          confidence: 'resolved' as const,
          source: null,
        },
        {
          id: 'token',
          kind: 'project-token' as const,
          label: 'color.action.primary',
          value: '#635bff',
          confidence: 'proven' as const,
          source: {
            kind: 'project-token' as const,
            stylesheetUrlHash: null,
            selector: null,
            property: null,
            line: null,
            column: null,
          },
        },
      ],
      edges: [
        {
          from: 'observed',
          to: 'token',
          relation: 'matches-token' as const,
          confidence: 'proven' as const,
        },
      ],
    },
    tokenEvidence: {
      selectedTokenId: 'color.action.primary',
      status: 'proven' as const,
      candidates: [
        {
          tokenId: 'color.action.primary',
          displayName: 'color.action.primary',
          status: 'proven' as const,
          resolvedValue: {
            space: 'srgb' as const,
            channels: [0.388, 0.357, 1],
            alpha: 1,
          },
          reasons: ['source-reference' as const],
          deltaEOK: 0,
        },
      ],
    },
    privacy: {
      exposure: 'low' as const,
      included: {
        colorData: true,
        cssEvidence: true,
        tokenMetadata: true,
        elementFingerprint: true,
        screenshotCrop: false as const,
        elementText: false as const,
        formValues: false as const,
        pageSource: false as const,
        cookies: false as const,
      },
    },
    annotations: [],
  };
}

describe('colorTraceSchema', () => {
  it('accepts a minimal safe trace and strips URL path/query to origin', () => {
    const parsed = colorTraceSchema.parse(validTrace());
    expect(parsed.environment.pageOrigin).toBe('https://example.test');
  });

  it.each([
    ['textContent', 'Account balance $18,442'],
    ['cookie', 'session=secret'],
    ['html', '<body>private</body>'],
    ['screenshot', 'data:image/png;base64,secret'],
  ])('rejects non-allowlisted top-level field %s', (key, value) => {
    const trace = { ...validTrace(), [key]: value };
    expect(() => colorTraceSchema.parse(trace)).toThrow();
  });

  it('rejects page text embedded in the element fingerprint', () => {
    const trace = validTrace() as ReturnType<typeof validTrace> & {
      target: ReturnType<typeof validTrace>['target'] & { textContent?: string };
    };
    trace.target = {
      ...trace.target,
      textContent: 'Jane Doe checking •••• 8842',
    };

    expect(() => colorTraceSchema.parse(trace)).toThrow();
  });

  it('structurally rejects raw DOM ids and classes', () => {
    const withId = structuredClone(validTrace()) as unknown as { target: { id: string | null } };
    withId.target.id = 'account-8472';
    expect(() => colorTraceSchema.parse(withId)).toThrow();

    const withClass = structuredClone(validTrace()) as unknown as { target: { classes: string[] } };
    withClass.target.classes = ['customer-jane-doe'];
    expect(() => colorTraceSchema.parse(withClass)).toThrow();
  });

  it('rejects selector hints that can smuggle ids or classes', () => {
    const trace = structuredClone(validTrace()) as unknown as { target: { selectorHint: string | null } };
    trace.target.selectorHint = '#account-8472';
    expect(() => colorTraceSchema.parse(trace)).toThrow();
  });

  it('cannot label computed style as rendered-pixel appearance', () => {
    const trace = structuredClone(validTrace()) as ReturnType<typeof validTrace>;
    trace.appearance.interpretation = 'rendered-pixel' as never;
    expect(() => colorTraceSchema.parse(trace)).toThrow();
  });

  it('cannot label a pixel sample as resolved CSS style', () => {
    const trace = structuredClone(validTrace()) as ReturnType<typeof validTrace>;
    trace.appearance.captureMethod = 'screen-sample' as never;
    expect(() => colorTraceSchema.parse(trace)).toThrow();
  });

  it('cannot claim a screenshot was included in schema v1', () => {
    const trace = validTrace();
    const unsafe = structuredClone(trace) as unknown as {
      privacy: { included: { screenshotCrop: boolean } };
    };
    unsafe.privacy.included.screenshotCrop = true;

    expect(() => colorTraceSchema.parse(unsafe)).toThrow();
  });

  it('rejects evidence edges that reference missing nodes', () => {
    const trace = validTrace();
    trace.evidence.edges[0]!.to = 'missing';

    const result = colorTraceSchema.safeParse(trace);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) =>
        issue.message.includes('Unknown evidence node'),
      )).toBe(true);
    }
  });

  it('rejects duplicate evidence node ids', () => {
    const graph = validTrace().evidence;
    graph.nodes.push({ ...graph.nodes[0]! });

    expect(() => evidenceGraphSchema.parse(graph)).toThrow();
  });
});
