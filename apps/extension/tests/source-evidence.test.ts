import { describe, expect, it } from 'vitest';
import { extractCustomPropertyReferences, snapshotMatchedAuthorRules } from '../src/trace/source-evidence.js';

function rule(selector: string, property: string, value: string, priority = ''): CSSRule {
  return {
    selectorText: selector,
    style: {
      getPropertyValue: (candidate: string) => candidate === property ? value : '',
      getPropertyPriority: (candidate: string) => candidate === property ? priority : '',
    },
  } as unknown as CSSRule;
}

function sheet(rules: readonly CSSRule[]): CSSStyleSheet {
  return { cssRules: rules as unknown as CSSRuleList } as CSSStyleSheet;
}

const target = {
  matches: (selector: string) => selector === '.target' || selector === 'button.target' || selector.includes('account-secret'),
} as unknown as Element;

describe('selective source evidence', () => {
  it('extracts direct custom-property references, deduplicated in source order', () => {
    expect(extractCustomPropertyReferences('color-mix(in oklab, var(--brand) 70%, var(--accent)); var(--brand)')).toEqual([
      '--brand',
      '--accent',
    ]);
  });

  it('ignores malformed names and var-shaped text inside strings or comments', () => {
    expect(extractCustomPropertyReferences(
      'var(theme-color) var(--bad name) url("var(--hidden)") /* var(--commented) */ var(--real)',
    )).toEqual(['--real']);
  });

  it('handles escapes inside quoted strings without leaking false references', () => {
    expect(extractCustomPropertyReferences('"escaped \\\" var(--hidden)" var(--visible)')).toEqual(['--visible']);
  });

  it('hard-bounds referenced custom properties to eight entries', () => {
    const expression = Array.from({ length: 12 }, (_, index) => `var(--c${index})`).join(' ');
    expect(extractCustomPropertyReferences(expression)).toEqual(
      Array.from({ length: 8 }, (_, index) => `--c${index}`),
    );
  });

  it('records only matching top-level declarations without retaining selector text', () => {
    const evidence = snapshotMatchedAuthorRules(target, 'color', [sheet([
      rule('.other', 'color', 'red'),
      rule('.target', 'background-color', 'blue'),
      rule('button.target', 'color', 'oklch(0.6 0.2 260)', 'important'),
    ])]);

    expect(evidence).toEqual({
      matchedAuthorRules: [{
        expression: 'oklch(0.6 0.2 260)',
        important: true,
      }],
      inaccessibleStyleSheets: 0,
      ruleSearchTruncated: false,
    });
  });

  it('uses sensitive selectors only transiently for matching', () => {
    const sensitiveSelector = '#account-secret[data-user="customer-42"]';
    const evidence = snapshotMatchedAuthorRules(target, 'color', [sheet([
      rule(sensitiveSelector, 'color', 'rebeccapurple'),
    ])]);

    expect(evidence.matchedAuthorRules).toEqual([{ expression: 'rebeccapurple', important: false }]);
    expect(JSON.stringify(evidence)).not.toContain('account-secret');
    expect(JSON.stringify(evidence)).not.toContain('customer-42');
  });

  it('treats inaccessible stylesheets as unknown provenance rather than as non-matches', () => {
    const inaccessible = {
      get cssRules(): CSSRuleList {
        throw new DOMException('Cross-origin stylesheet', 'SecurityError');
      },
    } as CSSStyleSheet;

    const evidence = snapshotMatchedAuthorRules(target, 'color', [inaccessible, sheet([
      rule('.target', 'color', 'green'),
    ])]);

    expect(evidence.inaccessibleStyleSheets).toBe(1);
    expect(evidence.matchedAuthorRules).toHaveLength(1);
  });

  it('hard-bounds matched author-rule evidence to eight declarations', () => {
    const evidence = snapshotMatchedAuthorRules(target, 'color', [sheet(
      Array.from({ length: 12 }, () => rule('.target', 'color', 'red')),
    )]);

    expect(evidence.matchedAuthorRules).toHaveLength(8);
    expect(evidence.ruleSearchTruncated).toBe(true);
  });
});
