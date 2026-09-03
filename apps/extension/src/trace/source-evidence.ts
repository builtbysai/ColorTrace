import { parseCssColor } from '@vcd/color-core';
import type { ColorTrace } from '@vcd/trace-model';
import type { TraceableColorProperty } from '../security/evidence-allowlist.js';

const SAFE_CUSTOM_PROPERTY = /^--[a-zA-Z0-9_-]{1,120}$/;
const MAX_REFERENCED_CUSTOM_PROPERTIES = 8;
const MAX_STYLESHEETS = 32;
const MAX_TOP_LEVEL_RULES = 512;
const MAX_MATCHED_RULES = 8;

export interface SelectiveCustomPropertyEvidence {
  readonly name: string;
  readonly resolvedExpression: string | null;
  readonly resolvedValue: ColorTrace['appearance']['value'] | null;
}

export interface MatchedAuthorRuleEvidence {
  readonly expression: string;
  readonly important: boolean;
}

export interface SelectiveSourceEvidence {
  readonly inlineExpression: string | null;
  readonly customProperties: readonly SelectiveCustomPropertyEvidence[];
  readonly matchedAuthorRules: readonly MatchedAuthorRuleEvidence[];
  readonly inaccessibleStyleSheets: number;
  readonly ruleSearchTruncated: boolean;
}

function maskNonCodeCss(expression: string): string {
  const output = [...expression];
  let quote: '"' | "'" | null = null;
  let comment = false;

  for (let index = 0; index < output.length; index += 1) {
    const current = expression[index];
    const next = expression[index + 1];

    if (comment) {
      output[index] = ' ';
      if (current === '*' && next === '/') {
        output[index + 1] = ' ';
        index += 1;
        comment = false;
      }
      continue;
    }

    if (quote) {
      output[index] = ' ';
      if (current === '\\') {
        if (index + 1 < output.length) {
          output[index + 1] = ' ';
          index += 1;
        }
      } else if (current === quote) {
        quote = null;
      }
      continue;
    }

    if (current === '/' && next === '*') {
      output[index] = ' ';
      output[index + 1] = ' ';
      index += 1;
      comment = true;
      continue;
    }

    if (current === '"' || current === "'") {
      output[index] = ' ';
      quote = current;
    }
  }

  return output.join('');
}

export function extractCustomPropertyReferences(expression: string): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  const pattern = /var\(\s*(--[a-zA-Z0-9_-]{1,120})(?=\s*[,\)])/g;
  for (const match of maskNonCodeCss(expression).matchAll(pattern)) {
    const name = match[1];
    if (!name || !SAFE_CUSTOM_PROPERTY.test(name) || seen.has(name)) continue;
    seen.add(name);
    names.push(name);
    if (names.length >= MAX_REFERENCED_CUSTOM_PROPERTIES) break;
  }
  return names;
}

function inlineStyle(element: Element): CSSStyleDeclaration | null {
  const candidate = element as Element & { style?: CSSStyleDeclaration };
  return candidate.style ?? null;
}

function styleRule(rule: CSSRule): CSSStyleRule | null {
  const candidate = rule as CSSRule & Partial<CSSStyleRule>;
  if (typeof candidate.selectorText !== 'string') return null;
  if (!candidate.style || typeof candidate.style.getPropertyValue !== 'function') return null;
  return candidate as CSSStyleRule;
}

export function snapshotMatchedAuthorRules(
  element: Element,
  property: TraceableColorProperty,
  styleSheets: readonly CSSStyleSheet[] = Array.from(document.styleSheets),
): Pick<SelectiveSourceEvidence, 'matchedAuthorRules' | 'inaccessibleStyleSheets' | 'ruleSearchTruncated'> {
  const matchedAuthorRules: MatchedAuthorRuleEvidence[] = [];
  const sheetLimit = Math.min(styleSheets.length, MAX_STYLESHEETS);
  let inaccessibleStyleSheets = 0;
  let rulesVisited = 0;
  let ruleSearchTruncated = styleSheets.length > MAX_STYLESHEETS;

  for (let sheetIndex = 0; sheetIndex < sheetLimit; sheetIndex += 1) {
    const sheet = styleSheets[sheetIndex];
    if (!sheet) continue;

    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      inaccessibleStyleSheets += 1;
      continue;
    }

    for (let ruleIndex = 0; ruleIndex < rules.length; ruleIndex += 1) {
      if (rulesVisited >= MAX_TOP_LEVEL_RULES || matchedAuthorRules.length >= MAX_MATCHED_RULES) {
        ruleSearchTruncated = true;
        break;
      }
      rulesVisited += 1;

      const rule = rules[ruleIndex];
      if (!rule) continue;
      const candidate = styleRule(rule);
      if (!candidate) continue;

      const expression = candidate.style.getPropertyValue(property).trim();
      if (!expression) continue;

      let matches = false;
      try {
        matches = element.matches(candidate.selectorText);
      } catch {
        continue;
      }
      if (!matches) continue;

      matchedAuthorRules.push({
        expression,
        important: candidate.style.getPropertyPriority(property) === 'important',
      });
    }

    if (ruleSearchTruncated) break;
  }

  return { matchedAuthorRules, inaccessibleStyleSheets, ruleSearchTruncated };
}

function resolveCustomProperty(
  name: string,
  computedStyle: CSSStyleDeclaration,
): SelectiveCustomPropertyEvidence {
  const resolvedExpression = computedStyle.getPropertyValue(name).trim() || null;
  const parsed = resolvedExpression ? parseCssColor(resolvedExpression) : null;
  return {
    name,
    resolvedExpression: parsed ? resolvedExpression : null,
    resolvedValue: parsed
      ? {
          space: parsed.value.space,
          channels: [...parsed.value.channels],
          alpha: parsed.value.alpha,
        }
      : null,
  };
}

function collectCustomProperties(
  expressions: readonly string[],
  computedStyle: CSSStyleDeclaration,
): SelectiveCustomPropertyEvidence[] {
  const seen = new Set<string>();
  const result: SelectiveCustomPropertyEvidence[] = [];

  for (const expression of expressions) {
    for (const name of extractCustomPropertyReferences(expression)) {
      if (seen.has(name)) continue;
      seen.add(name);
      result.push(resolveCustomProperty(name, computedStyle));
      if (result.length >= MAX_REFERENCED_CUSTOM_PROPERTIES) return result;
    }
  }

  return result;
}

export function snapshotSelectiveSourceEvidence(
  element: Element,
  property: TraceableColorProperty,
  computedStyle: CSSStyleDeclaration,
): SelectiveSourceEvidence {
  const authored = inlineStyle(element)?.getPropertyValue(property).trim() || null;
  const ruleEvidence = snapshotMatchedAuthorRules(element, property);
  const expressions = [authored, ...ruleEvidence.matchedAuthorRules.map((rule) => rule.expression)].filter(
    (expression): expression is string => Boolean(expression),
  );
  const customProperties = collectCustomProperties(expressions, computedStyle);

  return {
    inlineExpression: authored,
    customProperties,
    ...ruleEvidence,
  };
}
