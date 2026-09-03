import { colorTraceSchema, tracePrivacySchema, type TracePrivacy } from './schema';

export const LOW_EXPOSURE_PRIVACY: TracePrivacy = Object.freeze(
  tracePrivacySchema.parse({
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
  }),
);

/** Persistence/import/export schema for ColorTrace's low-exposure local format. */
export const persistedColorTraceSchema = colorTraceSchema.superRefine((trace, ctx) => {
  if (trace.privacy.exposure !== 'low') return;
  for (const [index, node] of trace.evidence.nodes.entries()) {
    if (node.source?.selector !== null && node.source?.selector !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['evidence', 'nodes', index, 'source', 'selector'],
        message: 'Low-exposure ColorTrace evidence cannot persist raw selector text',
      });
    }
  }
});
