import { describe, expect, it } from 'vitest';
import { classifyGamut, convert, deltaEOK, parseCssColor, serializeCssColor, wcag2Contrast } from '../src/index.js';
function parsed(css:string){const result=parseCssColor(css);expect(result).not.toBeNull();return result!.value;}
describe('parseCssColor',()=>{
  it('parses hex with alpha',()=>{expect(parsed('#ff000080').channels).toEqual([1,0,0]);expect(parsed('#ff000080').alpha).toBeCloseTo(0.50196,4);});
  it('parses legacy rgba syntax',()=>{expect(parsed('rgba(255, 0, 0, 0.5)').alpha).toBe(0.5);});
  it('preserves display-p3 intent',()=>{const result=parsed('color(display-p3 1 0.15 0.42)');expect(result.space).toBe('display-p3');expect(result.channels).toEqual([1,0.15,0.42]);});
  it('rejects unsupported CSS recipes rather than guessing',()=>{expect(parseCssColor('var(--brand)')).toBeNull();expect(parseCssColor('color-mix(in oklch, red, blue)')).toBeNull();});
});
describe('conversion and analysis',()=>{
  it('round trips sRGB through OKLab',()=>{const source=parsed('#755fe8');const roundTrip=convert(convert(source,'oklab'),'srgb');source.channels.forEach((channel,index)=>expect(roundTrip.channels[index]).toBeCloseTo(channel,5));});
  it('classifies saturated display-p3 outside sRGB',()=>{const gamut=classifyGamut(parsed('color(display-p3 1 0 0)'));expect(gamut.inDisplayP3).toBe(true);expect(gamut.inSRGB).toBe(false);expect(gamut.smallestGamut).toBe('display-p3');});
  it('returns zero delta for equal colors in different syntaxes',()=>{expect(deltaEOK(parsed('#ff0000'),parsed('rgb(255 0 0)'))).toBeCloseTo(0,8);});
  it('refuses misleading contrast for uncomposited translucent colors',()=>{expect(()=>wcag2Contrast(parsed('rgba(0, 0, 0, 0.5)'),parsed('#fff'))).toThrow(/opaque/);});
  it('computes WCAG 2 black/white contrast',()=>{expect(wcag2Contrast(parsed('#000'),parsed('#fff'))).toBeCloseTo(21,6);});
  it('serializes without collapsing authored color space',()=>{expect(serializeCssColor(parsed('color(display-p3 1 0.15 0.42)'))).toBe('color(display-p3 1 0.15 0.42)');});
});
