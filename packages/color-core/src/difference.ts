import { convert } from './convert.js';
import type { ColorValue } from './types.js';
export function deltaEOK(a: ColorValue, b: ColorValue): number { const ac = convert(a, 'oklab').channels; const bc = convert(b, 'oklab').channels; return Math.hypot(ac[0] - bc[0], ac[1] - bc[1], ac[2] - bc[2]); }
