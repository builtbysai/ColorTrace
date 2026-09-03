import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fakeTrace, quickTrace } = vi.hoisted(() => ({
  fakeTrace: {
    evidence: { nodes: [{ value: 'rgb(1 2 3)' }] },
    appearance: { value: { space: 'srgb' } },
  },
  quickTrace: vi.fn(),
}));
quickTrace.mockReturnValue(fakeTrace);
vi.mock('../src/trace/quick-trace.js', () => ({ quickTrace }));

class FakeElement {
  id = '';
  textContent = '';
  style: Record<string, string> = {};
  removed = false;
  attributes = new Map<string, string>();

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  getBoundingClientRect(): DOMRect {
    return { left: 10, top: 20, width: 120, height: 30 } as DOMRect;
  }

  remove(): void {
    this.removed = true;
  }
}

type Listener = (event: Record<string, unknown>) => void;

function makeKeyboardEvent(key: string) {
  return {
    key,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    stopImmediatePropagation: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  quickTrace.mockReturnValue(fakeTrace);
  const children: FakeElement[] = [];
  const listeners = new Map<string, Listener>();
  const documentElement = new FakeElement();
  (documentElement as FakeElement & { append: (...nodes: FakeElement[]) => void }).append = (...nodes) => {
    children.push(...nodes);
  };
  const target = new FakeElement();
  target.id = 'keyboard-target';

  vi.stubGlobal('Element', FakeElement);
  vi.stubGlobal('navigator', { userAgent: 'Chrome/140.0' });
  vi.stubGlobal('document', {
    documentElement,
    activeElement: target,
    createElement: () => new FakeElement(),
    getElementById: (id: string) => children.find((child) => child.id === id && !child.removed) ?? null,
    elementFromPoint: () => target,
  });
  vi.stubGlobal('window', {
    addEventListener: (type: string, listener: Listener) => listeners.set(type, listener),
    removeEventListener: (type: string) => listeners.delete(type),
    setTimeout: () => 0,
    __listeners: listeners,
    __target: target,
  });
});

describe('picker keyboard accessibility', () => {
  it('captures the focused page element when Enter is pressed', async () => {
    const { runPicker } = await import('../src/picker/controller.js');
    const result = runPicker('background-color');
    const listeners = (window as unknown as { __listeners: Map<string, Listener> }).__listeners;
    const event = makeKeyboardEvent('Enter');

    listeners.get('keydown')?.(event);

    await expect(result).resolves.toEqual({ ok: true, trace: fakeTrace });
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(event.stopImmediatePropagation).toHaveBeenCalledOnce();
    expect(quickTrace).toHaveBeenCalledWith(expect.objectContaining({
      element: (window as unknown as { __target: FakeElement }).__target,
      property: 'background-color',
      browser: { family: 'chromium', version: '140.0' },
    }));
  });

  it('updates the keyboard target from focus events and leaves Tab unconsumed', async () => {
    const { runPicker } = await import('../src/picker/controller.js');
    const result = runPicker('color');
    const listeners = (window as unknown as { __listeners: Map<string, Listener> }).__listeners;
    const focused = new FakeElement();
    focused.id = 'new-focused-target';
    listeners.get('focusin')?.({ target: focused });

    const tab = makeKeyboardEvent('Tab');
    listeners.get('keydown')?.(tab);
    expect(tab.preventDefault).not.toHaveBeenCalled();
    expect(tab.stopPropagation).not.toHaveBeenCalled();
    expect(tab.stopImmediatePropagation).not.toHaveBeenCalled();

    (document as unknown as { activeElement: FakeElement }).activeElement = focused;
    listeners.get('keydown')?.(makeKeyboardEvent('Enter'));
    await expect(result).resolves.toEqual({ ok: true, trace: fakeTrace });
    expect(quickTrace).toHaveBeenCalledWith(expect.objectContaining({ element: focused }));
  });
});
