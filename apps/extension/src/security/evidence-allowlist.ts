export const TRACEABLE_COLOR_PROPERTIES = [
  'color',
  'background-color',
  'border-top-color',
  'border-right-color',
  'border-bottom-color',
  'border-left-color',
  'outline-color',
  'text-decoration-color',
  'column-rule-color',
  'caret-color',
  'accent-color',
  'fill',
  'stroke',
] as const;

export type TraceableColorProperty = (typeof TRACEABLE_COLOR_PROPERTIES)[number];

const traceableColorPropertySet = new Set<string>(TRACEABLE_COLOR_PROPERTIES);

export function isTraceableColorProperty(value: string): value is TraceableColorProperty {
  return traceableColorPropertySet.has(value);
}

export function assertTraceableColorProperty(value: string): asserts value is TraceableColorProperty {
  if (!isTraceableColorProperty(value)) {
    throw new Error(`ColorTrace refuses non-color CSS property: ${value}`);
  }
}
