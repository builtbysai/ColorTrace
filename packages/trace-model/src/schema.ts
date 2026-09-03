import { z } from 'zod';

export const COLORTRACE_FORMAT = 'colortrace' as const;
export const COLORTRACE_SCHEMA_VERSION = 1 as const;

const idSchema = z.string().trim().min(1).max(200);
const labelSchema = z.string().trim().min(1).max(500);
const cssTextSchema = z.string().max(4096);
const finiteNumber = z.number().finite();
const unitInterval = finiteNumber.min(0).max(1);
const utcTimestampSchema = z.string().datetime({ offset: true });
const lowExposureSelectorHintSchema = z.string().trim().min(1).max(64).regex(/^[a-z][a-z0-9-]*$/i);

export const browserFamilySchema = z.enum([
  'chromium',
  'firefox',
  'safari',
  'unknown',
]);

export const evidenceConfidenceSchema = z.enum([
  'proven',
  'resolved',
  'partial',
  'inferred',
  'unknown',
]);

export const tokenMatchStatusSchema = z.enum([
  'proven',
  'candidate',
  'none',
  'conflict',
]);

export const appearanceAuthoritySchema = z.enum([
  'author',
  'derived',
  'user-agent',
  'user-preference',
  'system',
  'unknown',
]);

export const colorSpaceSchema = z.enum([
  'srgb',
  'srgb-linear',
  'display-p3',
  'display-p3-linear',
  'a98-rgb',
  'prophoto-rgb',
  'rec2020',
  'xyz-d50',
  'xyz-d65',
  'lab',
  'lch',
  'oklab',
  'oklch',
  'hsl',
  'hwb',
  'unknown',
]);

export const colorCoordinatesSchema = z.strictObject({
  space: colorSpaceSchema,
  channels: z.array(finiteNumber.nullable()).min(1).max(4),
  alpha: unitInterval.default(1),
});

export const colorIntentSchema = z.strictObject({
  authoredExpression: cssTextSchema.nullable(),
  parsed: colorCoordinatesSchema.nullable(),
  property: z.string().trim().min(1).max(128),
  recipeKind: z.enum([
    'literal',
    'custom-property',
    'relative-color',
    'color-mix',
    'light-dark',
    'current-color',
    'system-color',
    'other',
    'unknown',
  ]),
  confidence: evidenceConfidenceSchema,
});

export const appearanceSampleSchema = z.strictObject({
  value: colorCoordinatesSchema,
  interpretation: z.enum(['resolved-style', 'rendered-pixel']),
  captureMethod: z.enum([
    'computed-style',
    'css-typed-om',
    'canvas-sample',
    'screen-sample',
    'unknown',
  ]),
  outputColorSpace: colorSpaceSchema.nullable(),
  gamut: z.enum(['srgb', 'display-p3', 'wider-than-p3', 'unknown']),
  dynamicRange: z.enum(['sdr', 'hdr', 'unknown']),
  confidence: evidenceConfidenceSchema,
}).superRefine((sample, ctx) => {
  const styleMethods = new Set(['computed-style', 'css-typed-om']);
  const pixelMethods = new Set(['canvas-sample', 'screen-sample']);
  if (sample.interpretation === 'resolved-style' && pixelMethods.has(sample.captureMethod)) {
    ctx.addIssue({ code: 'custom', path: ['captureMethod'], message: 'Pixel sampling cannot be labeled resolved style' });
  }
  if (sample.interpretation === 'rendered-pixel' && styleMethods.has(sample.captureMethod)) {
    ctx.addIssue({ code: 'custom', path: ['captureMethod'], message: 'Computed style cannot be labeled rendered-pixel appearance' });
  }
});

export const elementFingerprintSchema = z.strictObject({
  tagName: z.string().trim().min(1).max(64),
  id: z.null(),
  classes: z.array(z.string()).max(0),
  role: z.string().max(128).nullable(),
  selectorHint: lowExposureSelectorHintSchema.nullable(),
});

export const renderingStateSchema = z.strictObject({
  pseudoClasses: z.array(z.enum([
    'hover',
    'active',
    'focus',
    'focus-visible',
    'focus-within',
    'visited',
    'checked',
    'disabled',
    'target',
  ])).max(16),
  pseudoElement: z.enum([
    'before',
    'after',
    'marker',
    'placeholder',
    'selection',
    'backdrop',
    'file-selector-button',
    'none',
    'unknown',
  ]),
  colorScheme: z.enum(['light', 'dark', 'normal', 'unknown']),
  forcedColors: z.enum(['active', 'none', 'unknown']),
  reducedMotion: z.enum(['reduce', 'no-preference', 'unknown']),
  reducedTransparency: z.enum(['reduce', 'no-preference', 'unknown']),
  contrastPreference: z.enum(['more', 'less', 'custom', 'no-preference', 'unknown']),
});

export const environmentSchema = z.strictObject({
  browser: z.strictObject({
    family: browserFamilySchema,
    version: z.string().trim().max(64),
  }),
  viewport: z.strictObject({
    widthCssPx: z.number().int().nonnegative(),
    heightCssPx: z.number().int().nonnegative(),
    devicePixelRatio: finiteNumber.positive(),
  }),
  pageOrigin: z.string().url().transform((value) => new URL(value).origin),
  documentUrlHash: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
});

export const sourceLocationSchema = z.strictObject({
  kind: z.enum(['inline-style', 'style-rule', 'custom-property', 'project-token', 'unknown']),
  stylesheetUrlHash: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  selector: z.string().max(2048).nullable(),
  property: z.string().max(128).nullable(),
  line: z.number().int().positive().nullable(),
  column: z.number().int().nonnegative().nullable(),
});

export const evidenceNodeSchema = z.strictObject({
  id: idSchema,
  kind: z.enum([
    'observed-color',
    'computed-value',
    'authored-expression',
    'css-variable',
    'css-rule',
    'project-token',
    'browser-adjustment',
    'user-preference',
    'derived-recipe',
  ]),
  label: labelSchema,
  value: z.string().max(4096).nullable(),
  confidence: evidenceConfidenceSchema,
  source: sourceLocationSchema.nullable(),
});

export const evidenceEdgeSchema = z.strictObject({
  from: idSchema,
  to: idSchema,
  relation: z.enum([
    'resolves-to',
    'declared-by',
    'references',
    'derived-from',
    'overridden-by',
    'matches-token',
    'candidate-token',
  ]),
  confidence: evidenceConfidenceSchema,
});

export const evidenceGraphSchema = z.strictObject({
  nodes: z.array(evidenceNodeSchema).max(256),
  edges: z.array(evidenceEdgeSchema).max(512),
}).superRefine((graph, ctx) => {
  const ids = new Set<string>();

  for (const [index, node] of graph.nodes.entries()) {
    if (ids.has(node.id)) {
      ctx.addIssue({
        code: 'custom',
        path: ['nodes', index, 'id'],
        message: `Duplicate evidence node id: ${node.id}`,
      });
    }
    ids.add(node.id);
  }

  for (const [index, edge] of graph.edges.entries()) {
    if (!ids.has(edge.from)) {
      ctx.addIssue({
        code: 'custom',
        path: ['edges', index, 'from'],
        message: `Unknown evidence node: ${edge.from}`,
      });
    }
    if (!ids.has(edge.to)) {
      ctx.addIssue({
        code: 'custom',
        path: ['edges', index, 'to'],
        message: `Unknown evidence node: ${edge.to}`,
      });
    }
  }
});

export const tokenCandidateSchema = z.strictObject({
  tokenId: idSchema,
  displayName: labelSchema,
  status: tokenMatchStatusSchema,
  resolvedValue: colorCoordinatesSchema.nullable(),
  reasons: z.array(z.enum([
    'source-reference',
    'css-variable-name',
    'exact-value',
    'perceptual-similarity',
    'semantic-name',
    'project-mapping',
  ])).max(8),
  deltaEOK: finiteNumber.nonnegative().nullable(),
});

export const tokenEvidenceSchema = z.strictObject({
  selectedTokenId: idSchema.nullable(),
  status: tokenMatchStatusSchema,
  candidates: z.array(tokenCandidateSchema).max(32),
});

export const authorityEvidenceSchema = z.strictObject({
  authority: appearanceAuthoritySchema,
  reason: z.enum([
    'authored-value-used',
    'derived-css-recipe',
    'forced-colors',
    'browser-adjustment',
    'system-color',
    'unknown',
  ]),
  forcedColorAdjust: z.enum(['auto', 'none', 'preserve-parent-color', 'unknown']),
  confidence: evidenceConfidenceSchema,
});

export const tracePrivacySchema = z.strictObject({
  exposure: z.enum(['low', 'medium', 'high']),
  included: z.strictObject({
    colorData: z.boolean(),
    cssEvidence: z.boolean(),
    tokenMetadata: z.boolean(),
    elementFingerprint: z.boolean(),
    screenshotCrop: z.literal(false),
    elementText: z.literal(false),
    formValues: z.literal(false),
    pageSource: z.literal(false),
    cookies: z.literal(false),
  }),
});

export const traceAnnotationSchema = z.strictObject({
  label: z.string().trim().min(1).max(80),
  note: z.string().max(2000),
});

export const colorTraceSchema = z.strictObject({
  format: z.literal(COLORTRACE_FORMAT),
  schemaVersion: z.literal(COLORTRACE_SCHEMA_VERSION),
  traceId: z.string().uuid(),
  capturedAt: utcTimestampSchema,
  intent: colorIntentSchema,
  appearance: appearanceSampleSchema,
  authority: authorityEvidenceSchema,
  target: elementFingerprintSchema,
  state: renderingStateSchema,
  environment: environmentSchema,
  evidence: evidenceGraphSchema,
  tokenEvidence: tokenEvidenceSchema,
  privacy: tracePrivacySchema,
  annotations: z.array(traceAnnotationSchema).max(32),
});

export type ColorTrace = z.infer<typeof colorTraceSchema>;
export type ColorIntent = z.infer<typeof colorIntentSchema>;
export type AppearanceSample = z.infer<typeof appearanceSampleSchema>;
export type EvidenceGraph = z.infer<typeof evidenceGraphSchema>;
export type EvidenceNode = z.infer<typeof evidenceNodeSchema>;
export type TokenEvidence = z.infer<typeof tokenEvidenceSchema>;
export type RenderingState = z.infer<typeof renderingStateSchema>;
export type TracePrivacy = z.infer<typeof tracePrivacySchema>;
