import type { ColorTrace } from '@vcd/trace-model';
import type { PickerResult } from '../messaging/protocol.js';
import type { TraceableColorProperty } from '../security/evidence-allowlist.js';
import { quickTrace } from '../trace/quick-trace.js';
import {
  PICKER_PROPERTY_OPTIONS,
  labelForProperty,
  propertyForShortcut,
} from './property-selection.js';

const OVERLAY_ID = 'colortrace-picker-overlay';
const TOAST_ID = 'colortrace-picker-toast';
const PANEL_ID = 'colortrace-picker-panel';

function detectBrowser(): ColorTrace['environment']['browser'] {
  const ua = navigator.userAgent;
  const firefox = /Firefox\/(\d+(?:\.\d+)?)/.exec(ua);
  if (firefox) return { family: 'firefox', version: firefox[1] ?? '' };
  const chromium = /(?:Chrome|Chromium)\/(\d+(?:\.\d+)?)/.exec(ua);
  if (chromium) return { family: 'chromium', version: chromium[1] ?? '' };
  return { family: 'unknown', version: '' };
}

function makeOverlay(): HTMLDivElement {
  document.getElementById(OVERLAY_ID)?.remove();
  const overlay = document.createElement('div');
  overlay.id = OVERLAY_ID;
  overlay.setAttribute('aria-hidden', 'true');
  Object.assign(overlay.style, {
    position: 'fixed',
    zIndex: '2147483647',
    pointerEvents: 'none',
    border: '2px solid currentColor',
    outline: '1px solid rgba(255,255,255,.9)',
    background: 'rgba(127,127,127,.12)',
    boxSizing: 'border-box',
    display: 'none',
  });
  document.documentElement.append(overlay);
  return overlay;
}

function makePanel(property: TraceableColorProperty): HTMLDivElement {
  document.getElementById(PANEL_ID)?.remove();
  const panel = document.createElement('div');
  panel.id = PANEL_ID;
  panel.setAttribute('role', 'status');
  panel.setAttribute('aria-live', 'polite');
  Object.assign(panel.style, {
    position: 'fixed',
    zIndex: '2147483647',
    left: '16px',
    bottom: '16px',
    maxWidth: '560px',
    padding: '10px 12px',
    borderRadius: '8px',
    background: 'Canvas',
    color: 'CanvasText',
    border: '1px solid GrayText',
    font: '13px/1.45 system-ui, sans-serif',
    boxShadow: '0 4px 18px rgba(0,0,0,.2)',
    pointerEvents: 'none',
  });
  updatePanel(panel, property);
  document.documentElement.append(panel);
  return panel;
}

function updatePanel(panel: HTMLElement, property: TraceableColorProperty): void {
  const shortcuts = PICKER_PROPERTY_OPTIONS
    .map((option) => `${option.shortcut.toUpperCase()} ${option.label}`)
    .join(' · ');
  panel.textContent = `ColorTrace: ${labelForProperty(property)} (${property}). ${shortcuts} · Tab move focus · Enter capture focused element · Click capture · Esc cancel`;
}

function showToast(message: string): void {
  document.getElementById(TOAST_ID)?.remove();
  const toast = document.createElement('div');
  toast.id = TOAST_ID;
  toast.textContent = message;
  toast.setAttribute('role', 'status');
  Object.assign(toast.style, {
    position: 'fixed',
    zIndex: '2147483647',
    right: '16px',
    bottom: '16px',
    maxWidth: '360px',
    padding: '10px 12px',
    borderRadius: '8px',
    background: 'Canvas',
    color: 'CanvasText',
    border: '1px solid GrayText',
    font: '13px/1.4 system-ui, sans-serif',
    boxShadow: '0 4px 18px rgba(0,0,0,.2)',
  });
  document.documentElement.append(toast);
  window.setTimeout(() => toast.remove(), 1800);
}

function isPickerUiElement(candidate: Element): boolean {
  return [OVERLAY_ID, TOAST_ID, PANEL_ID].includes(candidate.id);
}

function targetAt(clientX: number, clientY: number): Element | null {
  const candidate = document.elementFromPoint(clientX, clientY);
  if (!candidate || isPickerUiElement(candidate)) return null;
  return candidate;
}

function focusedTarget(): Element | null {
  const candidate = document.activeElement;
  if (!(candidate instanceof Element) || isPickerUiElement(candidate)) return null;
  return candidate;
}

function positionOverlay(overlay: HTMLElement, target: Element | null): void {
  if (!target) {
    overlay.style.display = 'none';
    return;
  }
  const rect = target.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    overlay.style.display = 'none';
    return;
  }
  Object.assign(overlay.style, {
    display: 'block',
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
  });
}

export function runPicker(initialProperty: TraceableColorProperty = 'color'): Promise<PickerResult> {
  if (!document.documentElement) {
    return Promise.resolve({ ok: false, reason: 'unsupported-page' });
  }

  const overlay = makeOverlay();
  const panel = makePanel(initialProperty);
  let currentTarget: Element | null = focusedTarget();
  let property = initialProperty;
  positionOverlay(overlay, currentTarget);

  return new Promise((resolve) => {
    const finish = (result: PickerResult): void => {
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('focusin', onFocusIn, true);
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('scroll', onViewportChange, true);
      window.removeEventListener('resize', onViewportChange, true);
      overlay.remove();
      panel.remove();
      resolve(result);
    };

    const capture = (target: Element): void => {
      try {
        const trace = quickTrace({
          element: target,
          property,
          browser: detectBrowser(),
        });
        const observed = trace.evidence.nodes[0]?.value ?? trace.appearance.value.space;
        showToast(`${labelForProperty(property)}: ${observed}`);
        finish({ ok: true, trace });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown capture failure';
        showToast(`ColorTrace could not capture ${labelForProperty(property)}`);
        finish({ ok: false, reason: 'capture-failed', message });
      }
    };

    const onMove = (event: PointerEvent): void => {
      currentTarget = targetAt(event.clientX, event.clientY);
      positionOverlay(overlay, currentTarget);
    };

    const onFocusIn = (event: FocusEvent): void => {
      const target = event.target;
      if (!(target instanceof Element) || isPickerUiElement(target)) return;
      currentTarget = target;
      positionOverlay(overlay, currentTarget);
    };

    const onViewportChange = (): void => positionOverlay(overlay, currentTarget);

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        finish({ ok: false, reason: 'cancelled' });
        return;
      }

      if (event.key === 'Enter') {
        const target = focusedTarget() ?? currentTarget;
        if (!target) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        capture(target);
        return;
      }

      const selected = propertyForShortcut(event.key);
      if (!selected) return;
      event.preventDefault();
      event.stopPropagation();
      property = selected;
      updatePanel(panel, property);
    };

    const onDown = (event: PointerEvent): void => {
      if (event.button !== 0) return;
      const target = targetAt(event.clientX, event.clientY) ?? currentTarget;
      if (!target) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      capture(target);
    };

    window.addEventListener('pointermove', onMove, true);
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('focusin', onFocusIn, true);
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('scroll', onViewportChange, true);
    window.addEventListener('resize', onViewportChange, true);
  });
}
