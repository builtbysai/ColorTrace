import {
  COLORTRACE_FORMAT,
  COLORTRACE_SCHEMA_VERSION,
  LOW_EXPOSURE_PRIVACY,
  persistedColorTraceSchema,
  type ColorTrace,
  type EvidenceGraph,
  type TokenEvidence,
} from '@vcd/trace-model';
import { assertTraceableColorProperty, type TraceableColorProperty } from './evidence-allowlist.js';

const CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
const MARKUP_SHAPES = /<\/?(?:script|style|iframe|html|body|form|input|textarea|select|option|svg|img)\b/i;
const SAFE_CUSTOM_PROPERTY = /^--[a-zA-Z0-9_-]{1,120}$/;
const MAX_SAFE_CSS_VALUE_LENGTH = 4096;
const MAX_SOURCE_CUSTOM_PROPERTIES = 8;
const MAX_MATCHED_AUTHOR_RULES = 8;

export interface QuickTraceSourceEvidence {
  readonly inlineExpression: string | null;
  readonly customProperties: readonly {
    readonly name: string;
    readonly resolvedExpression: string | null;
    readonly resolvedValue: ColorTrace['appearance']['value'] | null;
  }[];
  readonly matchedAuthorRules?: readonly {
    readonly expression: string;
    readonly important: boolean;
  }[];
  readonly inaccessibleStyleSheets?: number;
  readonly ruleSearchTruncated?: boolean;
}

export interface QuickTraceCapture {
  readonly property: TraceableColorProperty;
  readonly computedValue: string;
  readonly parsedAppearance: ColorTrace['appearance']['value'];
  readonly target: ColorTrace['target'];
  readonly state: ColorTrace['state'];
  readonly environment: ColorTrace['environment'];
  readonly authority: ColorTrace['authority'];
  readonly sourceEvidence?: QuickTraceSourceEvidence;
}

export interface TraceIdentityProvider {
  now(): Date;
  randomUUID(): string;
}

const defaultIdentityProvider: TraceIdentityProvider = {
  now: () => new Date(),
  randomUUID: () => crypto.randomUUID(),
};

function sanitizeCssValue(value: string): string {
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > MAX_SAFE_CSS_VALUE_LENGTH) {
    throw new Error('ColorTrace refused an empty or oversized CSS value');
  }
  if (CONTROL_CHARACTERS.test(normalized) || MARKUP_SHAPES.test(normalized)) {
    throw new Error('ColorTrace refused evidence that resembles page content or markup');
  }
  return normalized;
}

function sanitizeCustomPropertyName(name: string): string {
  const normalized = name.trim();
  if (!SAFE_CUSTOM_PROPERTY.test(normalized)) {
    throw new Error('ColorTrace refused an unsafe CSS custom-property name');
  }
  return normalized;
}

function buildQuickEvidence(
  property: TraceableColorProperty,
  computedValue: string,
  sourceEvidence?: QuickTraceSourceEvidence,
): EvidenceGraph {
  const graph: EvidenceGraph = {
    nodes: [
      {
        id: 'resolved-style',
        kind: 'computed-value',
        label: `${property} resolved computed style`,
        value: computedValue,
        confidence: 'resolved',
        source: {
          kind: 'unknown',
          stylesheetUrlHash: null,
          selector: null,
          property,
          line: null,
          column: null,
        },
      },
    ],
    edges: [],
  };

  const inlineExpression = sourceEvidence?.inlineExpression
    ? sanitizeCssValue(sourceEvidence.inlineExpression)
    : null;
  if (inlineExpression) {
    graph.nodes.push({
      id: 'inline-authored-expression',
      kind: 'authored-expression',
      label: `Observed inline ${property} declaration; cascade contribution unproven`,
      value: inlineExpression,
      confidence: 'proven',
      source: {
        kind: 'inline-style',
        stylesheetUrlHash: null,
        selector: null,
        property,
        line: null,
        column: null,
      },
    });

    for (const [index, customProperty] of (sourceEvidence?.customProperties ?? []).slice(0, MAX_SOURCE_CUSTOM_PROPERTIES).entries()) {
      const name = sanitizeCustomPropertyName(customProperty.name);
      const value = customProperty.resolvedExpression
        ? sanitizeCssValue(customProperty.resolvedExpression)
        : null;
      const nodeId = `css-variable-${index + 1}`;
      graph.nodes.push({
        id: nodeId,
        kind: 'css-variable',
        label: `Referenced CSS custom property ${name}`,
        value,
        confidence: value ? 'resolved' : 'proven',
        source: {
          kind: 'custom-property',
          stylesheetUrlHash: null,
          selector: null,
          property: name,
          line: null,
          column: null,
        },
      });
      graph.edges.push({
        from: 'inline-authored-expression',
        to: nodeId,
        relation: 'references',
        confidence: 'proven',
      });
    }
  }

  for (const [index, rule] of (sourceEvidence?.matchedAuthorRules ?? []).slice(0, MAX_MATCHED_AUTHOR_RULES).entries()) {
    const expression = sanitizeCssValue(rule.expression);
    graph.nodes.push({
      id: `matched-author-rule-${index + 1}`,
      kind: 'css-rule',
      label: `Matched accessible author rule declaration${rule.important ? ' (!important)' : ''}; selector withheld for privacy; cascade contribution unproven`,
      value: expression,
      confidence: 'proven',
      source: {
        kind: 'style-rule',
        stylesheetUrlHash: null,
        selector: null,
        property,
        line: null,
        column: null,
      },
    });
  }

  const inaccessibleStyleSheets = Math.max(0, Math.trunc(sourceEvidence?.inaccessibleStyleSheets ?? 0));
  if (inaccessibleStyleSheets > 0 || sourceEvidence?.ruleSearchTruncated) {
    const reasons = [
      inaccessibleStyleSheets > 0 ? `${inaccessibleStyleSheets} stylesheet(s) inaccessible to page CSSOM` : null,
      sourceEvidence?.ruleSearchTruncated ? 'bounded rule search truncated' : null,
    ].filter((reason): reason is string => Boolean(reason));
    graph.nodes.push({
      id: 'author-rule-search-incomplete',
      kind: 'css-rule',
      label: `Author rule provenance incomplete: ${reasons.join('; ')}`,
      value: null,
      confidence: 'unknown',
      source: null,
    });
  }

  return graph;
}

function buildTokenEvidence(sourceEvidence?: QuickTraceSourceEvidence): TokenEvidence {
  const customProperties = sourceEvidence?.inlineExpression
    ? sourceEvidence.customProperties.slice(0, MAX_SOURCE_CUSTOM_PROPERTIES)
    : [];
  if (customProperties.length === 0) {
    return { selectedTokenId: null, status: 'none', candidates: [] };
  }

  return {
    selectedTokenId: null,
    status: 'candidate',
    candidates: customProperties.map((customProperty) => {
      const name = sanitizeCustomPropertyName(customProperty.name);
      return {
        tokenId: `css-variable:${name}`,
        displayName: name,
        status: 'candidate',
        resolvedValue: customProperty.resolvedValue,
        reasons: ['css-variable-name'],
        deltaEOK: null,
      };
    }),
  };
}

export function buildQuickTrace(
  capture: QuickTraceCapture,
  identity: TraceIdentityProvider = defaultIdentityProvider,
): ColorTrace {
  assertTraceableColorProperty(capture.property);
  const computedValue = sanitizeCssValue(capture.computedValue);

  const candidate: ColorTrace = {
    format: COLORTRACE_FORMAT,
    schemaVersion: COLORTRACE_SCHEMA_VERSION,
    traceId: identity.randomUUID(),
    capturedAt: identity.now().toISOString(),
    intent: {
      authoredExpression: null,
      parsed: null,
      property: capture.property,
      recipeKind: 'unknown',
      confidence: 'unknown',
    },
    appearance: {
      value: capture.parsedAppearance,
      interpretation: 'resolved-style',
      captureMethod: 'computed-style',
      outputColorSpace: capture.parsedAppearance.space,
      gamut: 'unknown',
      dynamicRange: 'unknown',
      confidence: 'resolved',
    },
    authority: capture.authority,
    target: capture.target,
    state: capture.state,
    environment: capture.environment,
    evidence: buildQuickEvidence(capture.property, computedValue, capture.sourceEvidence),
    tokenEvidence: buildTokenEvidence(capture.sourceEvidence),
    privacy: {
      exposure: LOW_EXPOSURE_PRIVACY.exposure,
      included: { ...LOW_EXPOSURE_PRIVACY.included },
    },
    annotations: [],
  };

  return persistedColorTraceSchema.parse(candidate);
}
