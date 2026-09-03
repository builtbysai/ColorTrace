import { convert } from './convert.js';
import type { ColorValue } from './types.js';
export function relativeLuminance(color: ColorValue): number {
  if (color.alpha < 1) throw new RangeError('Relative luminance requires an opaque color; composite translucent colors first.');
  const [r, g, b] = convert(color, 'srgb-linear').channels;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function wcag2Contrast(foreground: ColorValue, background: ColorValue): number {
  const fg = relativeLuminance(foreground); const bg = relativeLuminance(background); const lighter = Math.max(fg, bg); const darker = Math.min(fg, bg); return (lighter + 0.05) / (darker + 0.05);
}
