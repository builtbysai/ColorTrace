import { clamp } from './math.js';
import type { ColorValue } from './types.js';
function number(value: number, precision: number): string { const rounded = Number(value.toFixed(precision)); return Object.is(rounded, -0) ? '0' : String(rounded); }
function alphaSuffix(alpha: number, precision: number): string { return alpha >= 1 ? '' : ` / ${number(clamp(alpha), precision)}`; }
export function serializeCssColor(color: ColorValue, precision = 5): string {
  const [a, b, c] = color.channels; const alpha = alphaSuffix(color.alpha, precision);
  switch (color.space) {
    case 'srgb': return `color(srgb ${number(a, precision)} ${number(b, precision)} ${number(c, precision)}${alpha})`;
    case 'display-p3': return `color(display-p3 ${number(a, precision)} ${number(b, precision)} ${number(c, precision)}${alpha})`;
    case 'oklab': return `oklab(${number(a, precision)} ${number(b, precision)} ${number(c, precision)}${alpha})`;
    case 'oklch': return `oklch(${number(a, precision)} ${number(b, precision)} ${number(c, precision)}${alpha})`;
    case 'hsl': return `hsl(${number(a, precision)} ${number(b * 100, precision)}% ${number(c * 100, precision)}%${alpha})`;
    case 'xyz-d65': return `color(xyz-d65 ${number(a, precision)} ${number(b, precision)} ${number(c, precision)}${alpha})`;
    case 'srgb-linear': return `color(srgb-linear ${number(a, precision)} ${number(b, precision)} ${number(c, precision)}${alpha})`;
    case 'display-p3-linear': throw new RangeError('display-p3-linear is an internal working space and has no standard CSS serialization.');
  }
}
