import { parseCssColor } from '@vcd/color-core';
import type { ColorTrace } from '@vcd/trace-model';
import { isTraceableColorProperty, type TraceableColorProperty } from '../security/evidence-allowlist.js';
import { buildQuickTrace, type TraceIdentityProvider } from '../security/trace-firewall.js';
import { snapshotRenderingState } from './rendering-state.js';
import { snapshotSelectiveSourceEvidence } from './source-evidence.js';

export interface QuickTraceRequest {
  readonly element: Element;
  readonly property: string;
  readonly browser: ColorTrace['environment']['browser'];
  readonly documentUrlHash?: string | null;
}

function media(query: string): boolean {
  return typeof matchMedia === 'function' && matchMedia(query).matches;
}

const SAFE_ARIA_ROLES = new Set([
  'button', 'checkbox', 'dialog', 'grid', 'gridcell', 'heading', 'img', 'link',
  'list', 'listbox', 'listitem', 'menu', 'menuitem', 'navigation', 'option',
  'progressbar', 'radio', 'region', 'row', 'search', 'slider', 'spinbutton',
  'status', 'switch', 'tab', 'table', 'tabpanel', 'textbox', 'timer', 'toolbar',
  'tooltip', 'tree', 'treeitem',
]);

function fingerprint(element: Element): ColorTrace['target'] {
  const rawRole = element.getAttribute('role')?.trim().toLowerCase() ?? null;
  const role = rawRole && SAFE_ARIA_ROLES.has(rawRole) ? rawRole : null;
  const tagName = element.tagName.toLowerCase();
  return {
    tagName,
    id: null,
    classes: [],
    role,
    selectorHint: tagName,
  };
}

function authorityFor(element: Element, computedStyle: CSSStyleDeclaration): ColorTrace['authority'] {
  const forcedColors = media('(forced-colors: active)');
  const forcedColorAdjust = computedStyle.forcedColorAdjust;
  if (forcedColors && forcedColorAdjust !== 'none') {
    return {
      authority: 'user-preference',
      reason: 'forced-colors',
      forcedColorAdjust: forcedColorAdjust === 'none' ? 'none' : 'auto',
      confidence: 'resolved',
    };
  }
  return {
    authority: 'unknown',
    reason: 'unknown',
    forcedColorAdjust: forcedColorAdjust === 'none' ? 'none' : 'auto',
    confidence: 'unknown',
  };
}

export function quickTrace(
  request: QuickTraceRequest,
  identity?: TraceIdentityProvider,
): ColorTrace {
  if (!isTraceableColorProperty(request.property)) {
    throw new Error(`Unsupported Quick Trace property: ${request.property}`);
  }

  const property: TraceableColorProperty = request.property;
  const computedStyle = getComputedStyle(request.element);
  const computedValue = computedStyle.getPropertyValue(property).trim();
  const parsed = parseCssColor(computedValue);
  if (!parsed) {
    throw new Error(`Computed ${property} is not a supported concrete color`);
  }

  return buildQuickTrace({
    property,
    computedValue,
    parsedAppearance: {
      space: parsed.value.space,
      channels: [...parsed.value.channels],
      alpha: parsed.value.alpha,
    },
    target: fingerprint(request.element),
    state: snapshotRenderingState(request.element, (query) => matchMedia(query)),
    environment: {
      browser: request.browser,
      viewport: {
        widthCssPx: Math.max(0, Math.round(window.innerWidth)),
        heightCssPx: Math.max(0, Math.round(window.innerHeight)),
        devicePixelRatio: Math.max(Number.EPSILON, window.devicePixelRatio || 1),
      },
      pageOrigin: window.location.origin,
      documentUrlHash: request.documentUrlHash ?? null,
    },
    authority: authorityFor(request.element, computedStyle),
    sourceEvidence: snapshotSelectiveSourceEvidence(request.element, property, computedStyle),
  }, identity);
}
