import { describe, expect, it } from 'vitest';
import {
  snapshotRenderingState,
  type MatchableElement,
  type MediaMatcher,
} from '../src/trace/rendering-state.js';

function matcher(matches: readonly string[]): MediaMatcher {
  const active = new Set(matches);
  return (query) => ({ matches: active.has(query) });
}

function elementWith(states: readonly string[]): MatchableElement {
  const active = new Set(states);
  return {
    matches(selector: string): boolean {
      return active.has(selector);
    },
  };
}

describe('snapshotRenderingState', () => {
  it('records only pseudo-classes that are actually observable on the target', () => {
    const state = snapshotRenderingState(
      elementWith([':hover', ':focus-visible', ':disabled']),
      matcher(['(prefers-color-scheme: dark)', '(forced-colors: none)']),
    );

    expect(state.pseudoClasses).toEqual(['hover', 'focus-visible', 'disabled']);
  });

  it('uses unknown when a preference cannot be proven by any matching media query', () => {
    const state = snapshotRenderingState(elementWith([]), matcher([]));

    expect(state.colorScheme).toBe('unknown');
    expect(state.forcedColors).toBe('unknown');
    expect(state.reducedMotion).toBe('unknown');
    expect(state.reducedTransparency).toBe('unknown');
    expect(state.contrastPreference).toBe('unknown');
  });

  it('records explicit no-preference and inactive values only when the browser reports them', () => {
    const state = snapshotRenderingState(elementWith([]), matcher([
      '(prefers-color-scheme: light)',
      '(forced-colors: none)',
      '(prefers-reduced-motion: no-preference)',
      '(prefers-reduced-transparency: no-preference)',
      '(prefers-contrast: no-preference)',
    ]));

    expect(state.colorScheme).toBe('light');
    expect(state.forcedColors).toBe('none');
    expect(state.reducedMotion).toBe('no-preference');
    expect(state.reducedTransparency).toBe('no-preference');
    expect(state.contrastPreference).toBe('no-preference');
  });

  it('does not attempt to infer visited state', () => {
    const state = snapshotRenderingState(elementWith([':visited']), matcher([]));
    expect(state.pseudoClasses).not.toContain('visited');
  });
});
