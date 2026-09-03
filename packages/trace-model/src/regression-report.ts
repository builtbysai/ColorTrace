import { compareColorTraces, type TraceComparison } from './comparison';
import type { ColorTrace } from './schema';

export type RegressionTraceRef = {
  traceId: string;
  capturedAt: string;
  property: string;
  pageOrigin: string;
};

export type ColorTraceRegressionReport = {
  format: 'colortrace-regression-report';
  schemaVersion: 1;
  baseline: RegressionTraceRef;
  candidate: RegressionTraceRef;
  comparison: TraceComparison;
  interpretation: {
    causalAttribution: 'not-established';
    sourceScope: 'persisted-colortrace-evidence-only';
  };
};

function traceRef(trace: ColorTrace): RegressionTraceRef {
  return {
    traceId: trace.traceId,
    capturedAt: trace.capturedAt,
    property: trace.intent.property,
    pageOrigin: trace.environment.pageOrigin,
  };
}

export function createColorTraceRegressionReport(
  baseline: ColorTrace,
  candidate: ColorTrace,
): ColorTraceRegressionReport {
  return {
    format: 'colortrace-regression-report',
    schemaVersion: 1,
    baseline: traceRef(baseline),
    candidate: traceRef(candidate),
    comparison: compareColorTraces(baseline, candidate),
    interpretation: {
      causalAttribution: 'not-established',
      sourceScope: 'persisted-colortrace-evidence-only',
    },
  };
}

export function serializeColorTraceRegressionReport(report: ColorTraceRegressionReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}
