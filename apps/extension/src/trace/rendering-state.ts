import type { ColorTrace } from '@vcd/trace-model';

type MediaResult = { readonly matches: boolean };
export type MediaMatcher = (query: string) => MediaResult;

export interface MatchableElement {
  matches(selector: string): boolean;
}

function mediaChoice<T extends string>(
  matchMedia: MediaMatcher,
  choices: readonly (readonly [query: string, value: T])[],
  fallback: T,
): T {
  for (const [query, value] of choices) {
    if (matchMedia(query).matches) return value;
  }
  return fallback;
}

function elementMatches(element: MatchableElement, selector: string): boolean {
  try {
    return element.matches(selector);
  } catch {
    return false;
  }
}

export function snapshotRenderingState(
  element: MatchableElement,
  matchMedia: MediaMatcher,
): ColorTrace['state'] {
  const pseudoClasses: ColorTrace['state']['pseudoClasses'] = [];
  const observablePseudoClasses = [
    'hover',
    'active',
    'focus',
    'focus-visible',
    'focus-within',
    'checked',
    'disabled',
    'target',
  ] as const;

  for (const pseudoClass of observablePseudoClasses) {
    if (elementMatches(element, `:${pseudoClass}`)) pseudoClasses.push(pseudoClass);
  }

  return {
    pseudoClasses,
    pseudoElement: 'none',
    colorScheme: mediaChoice(matchMedia, [
      ['(prefers-color-scheme: dark)', 'dark'],
      ['(prefers-color-scheme: light)', 'light'],
    ], 'unknown'),
    forcedColors: mediaChoice(matchMedia, [
      ['(forced-colors: active)', 'active'],
      ['(forced-colors: none)', 'none'],
    ], 'unknown'),
    reducedMotion: mediaChoice(matchMedia, [
      ['(prefers-reduced-motion: reduce)', 'reduce'],
      ['(prefers-reduced-motion: no-preference)', 'no-preference'],
    ], 'unknown'),
    reducedTransparency: mediaChoice(matchMedia, [
      ['(prefers-reduced-transparency: reduce)', 'reduce'],
      ['(prefers-reduced-transparency: no-preference)', 'no-preference'],
    ], 'unknown'),
    contrastPreference: mediaChoice(matchMedia, [
      ['(prefers-contrast: more)', 'more'],
      ['(prefers-contrast: less)', 'less'],
      ['(prefers-contrast: custom)', 'custom'],
      ['(prefers-contrast: no-preference)', 'no-preference'],
    ], 'unknown'),
  };
}
