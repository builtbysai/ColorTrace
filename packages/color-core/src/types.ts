export type SupportedColorSpace = 'srgb' | 'srgb-linear' | 'display-p3' | 'display-p3-linear' | 'xyz-d65' | 'oklab' | 'oklch' | 'hsl';
export interface ColorValue { readonly space: SupportedColorSpace; readonly channels: readonly [number, number, number]; readonly alpha: number; }
export interface ParsedColor { readonly authored: string; readonly value: ColorValue; }
export type GamutName = 'srgb' | 'display-p3';
export interface GamutResult { readonly inSRGB: boolean; readonly inDisplayP3: boolean; readonly smallestGamut: 'srgb' | 'display-p3' | 'outside-display-p3'; }
