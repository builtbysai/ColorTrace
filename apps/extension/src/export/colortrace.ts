import { persistedColorTraceSchema, type ColorTrace } from '@vcd/trace-model';

export function serializeColorTrace(trace: ColorTrace): string {
  return `${JSON.stringify(persistedColorTraceSchema.parse(trace), null, 2)}\n`;
}

export function deserializeColorTrace(source: string): ColorTrace {
  let decoded: unknown;
  try {
    decoded = JSON.parse(source) as unknown;
  } catch {
    throw new Error('Invalid .colortrace JSON');
  }
  return persistedColorTraceSchema.parse(decoded);
}

export function downloadColorTrace(trace: ColorTrace): void {
  const blob = new Blob([serializeColorTrace(trace)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${trace.traceId}.colortrace`;
  anchor.rel = 'noopener';
  anchor.click();
  queueMicrotask(() => URL.revokeObjectURL(url));
}
