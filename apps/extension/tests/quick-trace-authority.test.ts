import { afterEach, describe, expect, it, vi } from 'vitest';
import { authorityFor } from '../src/trace/quick-trace.js';

const element = {} as unknown as Element;

function computedStyleWith(forcedColorAdjust: string): CSSStyleDeclaration {
  return { forcedColorAdjust } as unknown as CSSStyleDeclaration;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('authorityFor', () => {
  it('passes through preserve-parent-color instead of collapsing it to auto, outside forced-colors', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query }));

    const authority = authorityFor(element, computedStyleWith('preserve-parent-color'));

    expect(authority.forcedColorAdjust).toBe('preserve-parent-color');
    expect(authority.authority).toBe('unknown');
  });

  it('passes through preserve-parent-color while active forced-colors mode is proven', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(forced-colors: active)', media: query }));

    const authority = authorityFor(element, computedStyleWith('preserve-parent-color'));

    expect(authority.forcedColorAdjust).toBe('preserve-parent-color');
    expect(authority.authority).toBe('user-preference');
    expect(authority.reason).toBe('forced-colors');
    expect(authority.confidence).toBe('resolved');
  });

  it('still normalizes unrecognized values to auto', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query }));

    const authority = authorityFor(element, computedStyleWith(''));

    expect(authority.forcedColorAdjust).toBe('auto');
  });

  it('still passes through none', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query }));

    const authority = authorityFor(element, computedStyleWith('none'));

    expect(authority.forcedColorAdjust).toBe('none');
  });
});
