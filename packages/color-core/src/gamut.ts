import { convert } from './convert.js';
import { EPSILON } from './math.js';
import type { ColorValue, GamutName, GamutResult } from './types.js';
function bounded(channels: readonly number[]): boolean { return channels.every((value) => value >= -EPSILON && value <= 1 + EPSILON); }
export function inGamut(color: ColorValue, gamut: GamutName): boolean { return bounded(convert(color, gamut === 'srgb' ? 'srgb-linear' : 'display-p3-linear').channels); }
export function classifyGamut(color: ColorValue): GamutResult { const inSRGB = inGamut(color, 'srgb'); const inDisplayP3 = inGamut(color, 'display-p3'); return { inSRGB, inDisplayP3, smallestGamut: inSRGB ? 'srgb' : inDisplayP3 ? 'display-p3' : 'outside-display-p3' }; }
