import {
  createColorTraceRegressionReport,
  serializeColorTraceRegressionReport,
  type ColorTrace,
} from '@vcd/trace-model';

export function downloadColorTraceRegressionReport(baseline: ColorTrace, candidate: ColorTrace): void {
  const report = createColorTraceRegressionReport(baseline, candidate);
  const blob = new Blob([serializeColorTraceRegressionReport(report)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${baseline.traceId}--${candidate.traceId}.colortrace-report.json`;
  anchor.rel = 'noopener';
  anchor.click();
  queueMicrotask(() => URL.revokeObjectURL(url));
}
