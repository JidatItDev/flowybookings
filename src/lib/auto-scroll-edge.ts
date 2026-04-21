/**
 * Auto-scroll-bij-rand helper voor touch-drag flows in tijdgrids.
 *
 * Native HTML5 drag scrollt automatisch wanneer de cursor de rand van de
 * scroll-container raakt — bij touch-drag (waarbij we zelf de drag-flow
 * implementeren) gebeurt dit niet, waardoor lange dagen op tablet/iPad
 * onbereikbaar zouden zijn buiten het zichtbare venster.
 *
 * Deze helper:
 *  - Vindt de dichtstbijzijnde verticaal-scrollende parent van een referentie-
 *    element (de booking-button die opgepakt is).
 *  - Start een `requestAnimationFrame` loop die scrollt zodra de meest recente
 *    touch-Y binnen `EDGE_PX` van de boven- of onderrand komt.
 *  - Schaalt de scroll-snelheid op basis van hoe diep de vinger in de
 *    edge-zone zit (max ~12px per frame ≈ 720px/s bij 60fps).
 *
 * Gebruik:
 *   const scroller = createEdgeAutoScroller(blockEl);
 *   // in touchmove:
 *   scroller.update(touch.clientY);
 *   // in touchend / touchcancel / cleanup:
 *   scroller.stop();
 */

const EDGE_PX = 60;
const MAX_SPEED_PX_PER_FRAME = 12;

/** Vind de dichtstbijzijnde scrollable ancestor (overflow auto/scroll, scrollHeight > clientHeight). */
function findScrollParent(el: HTMLElement | null): HTMLElement | Window {
  let node: HTMLElement | null = el?.parentElement ?? null;
  while (node) {
    const style = getComputedStyle(node);
    const oy = style.overflowY;
    if ((oy === "auto" || oy === "scroll" || oy === "overlay") && node.scrollHeight > node.clientHeight) {
      return node;
    }
    node = node.parentElement;
  }
  return window;
}

type EdgeAutoScroller = {
  /** Roep aan in elke touchmove met de huidige touch.clientY. */
  update: (clientY: number) => void;
  /** Stop de RAF-loop (touchend/touchcancel/cleanup). */
  stop: () => void;
};

export function createEdgeAutoScroller(refEl: HTMLElement | null): EdgeAutoScroller {
  const scrollEl = findScrollParent(refEl);
  let lastY = 0;
  let rafId: number | null = null;

  const getViewport = (): { top: number; bottom: number; canScrollUp: boolean; canScrollDown: boolean } => {
    if (scrollEl === window) {
      const top = 0;
      const bottom = window.innerHeight;
      const canScrollUp = window.scrollY > 0;
      const canScrollDown = window.scrollY + window.innerHeight < document.documentElement.scrollHeight;
      return { top, bottom, canScrollUp, canScrollDown };
    }
    const el = scrollEl as HTMLElement;
    const rect = el.getBoundingClientRect();
    return {
      top: rect.top,
      bottom: rect.bottom,
      canScrollUp: el.scrollTop > 0,
      canScrollDown: el.scrollTop + el.clientHeight < el.scrollHeight,
    };
  };

  const tick = () => {
    const vp = getViewport();
    const distFromTop = lastY - vp.top;
    const distFromBottom = vp.bottom - lastY;

    let delta = 0;
    if (distFromTop < EDGE_PX && vp.canScrollUp) {
      const intensity = Math.max(0, (EDGE_PX - distFromTop) / EDGE_PX);
      delta = -Math.ceil(intensity * MAX_SPEED_PX_PER_FRAME);
    } else if (distFromBottom < EDGE_PX && vp.canScrollDown) {
      const intensity = Math.max(0, (EDGE_PX - distFromBottom) / EDGE_PX);
      delta = Math.ceil(intensity * MAX_SPEED_PX_PER_FRAME);
    }

    if (delta !== 0) {
      if (scrollEl === window) {
        window.scrollBy(0, delta);
      } else {
        (scrollEl as HTMLElement).scrollTop += delta;
      }
    }

    rafId = requestAnimationFrame(tick);
  };

  return {
    update(clientY: number) {
      lastY = clientY;
      if (rafId === null) {
        rafId = requestAnimationFrame(tick);
      }
    },
    stop() {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    },
  };
}
