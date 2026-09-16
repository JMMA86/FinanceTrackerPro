/**
 * SmoothAnchorScroll tests.
 *
 * The component is headless: it installs a capture-phase click listener and
 * animates the scroll on its own. To keep the tests deterministic, the
 * `requestAnimationFrame` / `cancelAnimationFrame` / `performance.now` /
 * `getBoundingClientRect` primitives are controlled manually so no real timer
 * is ever left pending.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import type { MockInstance } from 'vitest';
import { SmoothAnchorScroll } from '../SmoothAnchorScroll';

interface RafController {
  raf: MockInstance<(callback: FrameRequestCallback) => number>;
  cancel: MockInstance<(id: number) => void>;
  runFrame: (now: number) => boolean;
  pendingCount: () => number;
}

let scrollToMock: ReturnType<typeof vi.fn>;
let pushStateMock: MockInstance<typeof window.history.pushState>;

function installRaf(): RafController {
  let nextId = 0;
  const pending = new Map<number, FrameRequestCallback>();

  const raf = vi.fn((callback: FrameRequestCallback) => {
    const id = ++nextId;
    pending.set(id, callback);
    return id;
  });
  const cancel = vi.fn((id: number) => {
    pending.delete(id);
  });

  vi.stubGlobal('requestAnimationFrame', raf);
  vi.stubGlobal('cancelAnimationFrame', cancel);

  return {
    raf,
    cancel,
    runFrame: (now: number) => {
      const next = pending.entries().next();
      if (next.done) {
        return false;
      }
      const [id, callback] = next.value;
      pending.delete(id);
      callback(now);
      return true;
    },
    pendingCount: () => pending.size,
  };
}

function stubMatchMedia(matches: boolean): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(
      (query: string) =>
        ({
          matches,
          media: query,
          onchange: null,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          addListener: vi.fn(),
          removeListener: vi.fn(),
          dispatchEvent: vi.fn(() => true),
        }) as unknown as MediaQueryList
    )
  );
}

function makeRect(top: number): DOMRect {
  return {
    top,
    bottom: top,
    left: 0,
    right: 0,
    width: 0,
    height: 0,
    x: 0,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

function dispatchClick(element: EventTarget, init: MouseEventInit = {}): MouseEvent {
  const event = new MouseEvent('click', { bubbles: true, cancelable: true, ...init });
  element.dispatchEvent(event);
  return event;
}

function renderHarness() {
  return render(
    <div>
      <SmoothAnchorScroll />
      <a href="#features">Ir a features</a>
      <a href="#missing">Destino inexistente</a>
      <a href="#">Hash vacío</a>
      <button type="button">No es un enlace</button>
      <section id="features" data-testid="target">
        Destino
      </section>
    </div>
  );
}

/** Renders the harness, prepares mocks and clicks the valid anchor. */
function startAnimation() {
  const view = renderHarness();
  const link = screen.getByRole('link', { name: 'Ir a features' });
  const target = screen.getByTestId('target');

  vi.spyOn(performance, 'now').mockReturnValue(1000);
  vi.spyOn(target, 'getBoundingClientRect').mockReturnValue(makeRect(500));

  const raf = installRaf();
  const event = dispatchClick(link);

  return { ...view, link, target, raf, event };
}

describe('SmoothAnchorScroll', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/');
    scrollToMock = vi.fn();
    Object.defineProperty(window, 'scrollTo', {
      value: scrollToMock,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window, 'scrollY', { value: 0, writable: true, configurable: true });
    stubMatchMedia(false);
    pushStateMock = vi.spyOn(window.history, 'pushState');
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('intercepta el clic, fija el hash y arranca la animación', () => {
    const { event, target, raf } = startAnimation();

    expect(event.defaultPrevented).toBe(true);
    expect(pushStateMock).toHaveBeenCalledWith(null, '', '#features');
    expect(raf.raf).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(target);
    expect(target).toHaveAttribute('tabindex', '-1');
  });

  it('anima el scroll hacia el destino a lo largo de los frames', () => {
    const { raf } = startAnimation();

    raf.runFrame(1000);
    expect(scrollToMock).toHaveBeenCalledWith(0, 0);

    raf.runFrame(1500);
    expect(scrollToMock).toHaveBeenLastCalledWith(0, 500);
    expect(raf.pendingCount()).toBe(0);
  });

  it('hace foco y salto inmediato cuando el destino ya está en la posición actual', () => {
    renderHarness();
    const link = screen.getByRole('link', { name: 'Ir a features' });
    const target = screen.getByTestId('target');

    vi.spyOn(performance, 'now').mockReturnValue(1000);
    vi.spyOn(target, 'getBoundingClientRect').mockReturnValue(makeRect(0));
    const raf = installRaf();

    const event = dispatchClick(link);

    expect(event.defaultPrevented).toBe(true);
    expect(scrollToMock).toHaveBeenCalledWith(0, 0);
    expect(raf.raf).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(target);
  });

  it.each(['ctrlKey', 'metaKey', 'shiftKey', 'altKey'] as const)(
    'ignora clics con el modificador %s',
    (modifier) => {
      renderHarness();
      const link = screen.getByRole('link', { name: 'Ir a features' });
      const raf = installRaf();
      const init: MouseEventInit = { bubbles: true, cancelable: true };
      init[modifier] = true;

      const event = dispatchClick(link, init);

      expect(event.defaultPrevented).toBe(false);
      expect(pushStateMock).not.toHaveBeenCalled();
      expect(raf.raf).not.toHaveBeenCalled();
    }
  );

  it('ignora clics con un botón distinto del izquierdo', () => {
    renderHarness();
    const link = screen.getByRole('link', { name: 'Ir a features' });
    const raf = installRaf();

    const event = dispatchClick(link, { button: 2 });

    expect(event.defaultPrevented).toBe(false);
    expect(pushStateMock).not.toHaveBeenCalled();
    expect(raf.raf).not.toHaveBeenCalled();
  });

  it('ignora enlaces con href="#"', () => {
    renderHarness();
    const link = screen.getByRole('link', { name: 'Hash vacío' });
    const raf = installRaf();

    const event = dispatchClick(link);

    expect(event.defaultPrevented).toBe(false);
    expect(pushStateMock).not.toHaveBeenCalled();
    expect(raf.raf).not.toHaveBeenCalled();
  });

  it('ignora anclas cuyo destino no existe en el DOM', () => {
    renderHarness();
    const link = screen.getByRole('link', { name: 'Destino inexistente' });
    const raf = installRaf();

    const event = dispatchClick(link);

    expect(event.defaultPrevented).toBe(false);
    expect(pushStateMock).not.toHaveBeenCalled();
    expect(raf.raf).not.toHaveBeenCalled();
  });

  it('ignora el clic cuando ya fue prevenido por otro handler', () => {
    renderHarness();
    const link = screen.getByRole('link', { name: 'Ir a features' });
    const raf = installRaf();
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    event.preventDefault();

    link.dispatchEvent(event);

    expect(pushStateMock).not.toHaveBeenCalled();
    expect(raf.raf).not.toHaveBeenCalled();
  });

  it('ignora eventos cuyo target no es un Element', () => {
    renderHarness();
    const raf = installRaf();

    const event = dispatchClick(document);

    expect(event.defaultPrevented).toBe(false);
    expect(pushStateMock).not.toHaveBeenCalled();
    expect(raf.raf).not.toHaveBeenCalled();
  });

  it('ignora clics sobre elementos que no son enlaces', () => {
    renderHarness();
    const button = screen.getByRole('button', { name: 'No es un enlace' });
    const raf = installRaf();

    const event = dispatchClick(button);

    expect(event.defaultPrevented).toBe(false);
    expect(pushStateMock).not.toHaveBeenCalled();
    expect(raf.raf).not.toHaveBeenCalled();
  });

  it('respeta prefers-reduced-motion y deja actuar al navegador', () => {
    stubMatchMedia(true);
    renderHarness();
    const link = screen.getByRole('link', { name: 'Ir a features' });
    const target = screen.getByTestId('target');
    vi.spyOn(target, 'getBoundingClientRect').mockReturnValue(makeRect(500));
    const raf = installRaf();

    const event = dispatchClick(link);

    expect(event.defaultPrevented).toBe(false);
    expect(pushStateMock).not.toHaveBeenCalled();
    expect(raf.raf).not.toHaveBeenCalled();
  });

  it.each(['wheel', 'touchstart'] as const)('cancela la animación al recibir %s', (type) => {
    const { raf } = startAnimation();

    window.dispatchEvent(new Event(type));

    expect(raf.cancel).toHaveBeenCalledTimes(1);
    expect(raf.pendingCount()).toBe(0);
  });

  it.each(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '])(
    'cancela la animación con la tecla de navegación %s',
    (key) => {
      const { raf } = startAnimation();

      window.dispatchEvent(new KeyboardEvent('keydown', { key }));

      expect(raf.cancel).toHaveBeenCalledTimes(1);
      expect(raf.pendingCount()).toBe(0);
    }
  );

  it('no cancela la animación con una tecla que no es de navegación', () => {
    const { raf } = startAnimation();

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));

    expect(raf.cancel).not.toHaveBeenCalled();
    expect(raf.pendingCount()).toBe(1);
  });

  it('respeta un tabindex existente en el destino y no lo sobrescribe', () => {
    render(
      <div>
        <SmoothAnchorScroll />
        <a href="#prefocused">Ir al destino enfocado</a>
        <section id="prefocused" data-testid="prefocused" tabIndex={-1}>
          Destino
        </section>
      </div>
    );
    const link = screen.getByRole('link', { name: 'Ir al destino enfocado' });
    const target = screen.getByTestId('prefocused');
    const raf = installRaf();

    dispatchClick(link);

    expect(target).toHaveAttribute('tabindex', '-1');
    expect(document.activeElement).toBe(target);
    expect(raf.raf).not.toHaveBeenCalled();
  });

  it('elimina el listener y cancela el frame al desmontar', () => {
    const { raf, unmount } = startAnimation();
    const removeSpy = vi.spyOn(document, 'removeEventListener');

    unmount();

    expect(removeSpy).toHaveBeenCalledWith('click', expect.any(Function), true);
    expect(raf.cancel).toHaveBeenCalled();
    expect(raf.pendingCount()).toBe(0);
  });

  it('desplaza al elemento indicado por el hash al montar', () => {
    window.history.replaceState(null, '', '/#features');
    const raf = installRaf();
    renderHarness();
    const target = screen.getByTestId('target');

    vi.spyOn(target, 'getBoundingClientRect').mockReturnValue(makeRect(500));
    vi.spyOn(performance, 'now').mockReturnValue(1000);

    expect(raf.raf).toHaveBeenCalledTimes(1);

    raf.runFrame(0);
    expect(raf.raf).toHaveBeenCalledTimes(2);
    expect(pushStateMock).not.toHaveBeenCalled();
  });

  it('no anima al montar cuando el hash no coincide con ningún elemento', () => {
    window.history.replaceState(null, '', '/#missing');
    const raf = installRaf();

    renderHarness();

    expect(raf.raf).not.toHaveBeenCalled();
  });
});
