import { useEffect, useRef, useState } from "react";

/**
 * Mobile pull-to-refresh hook for a scrollable list.
 *
 * Returns:
 *  - bind: handlers to spread on the scrollable container
 *  - state: { pulling, distance, ready, refreshing }
 *
 * Triggers `onRefresh` when the user pulls past `threshold` px and releases.
 * Does NOT own the network state — pass `refreshing` from the caller's
 * existing query (e.g. react-query's `isFetching`) via `setRefreshing` if
 * you want the indicator to spin until the refetch resolves.
 *
 * Designed to compose with the existing `bookingsQuery` refetch — so we
 * never duplicate fetching logic.
 */
export function usePullToRefresh(opts: {
  onRefresh: () => Promise<unknown> | void;
  /** Min px pulled before the gesture commits on release. Default 70. */
  threshold?: number;
  /** Disable when not on mobile. */
  enabled?: boolean;
}) {
  const { onRefresh, threshold = 70, enabled = true } = opts;
  const startY = useRef<number | null>(null);
  const scrollOriginAtTop = useRef(false);
  const [distance, setDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const reset = () => {
    startY.current = null;
    scrollOriginAtTop.current = false;
    setDistance(0);
  };

  useEffect(() => {
    if (!enabled) reset();
  }, [enabled]);

  const onTouchStart = (e: React.TouchEvent) => {
    if (!enabled || refreshing) return;
    // Only arm the gesture when the page (document) is scrolled to the top —
    // otherwise we let the browser scroll normally.
    scrollOriginAtTop.current =
      typeof window !== "undefined" && window.scrollY <= 0;
    startY.current = e.touches[0]?.clientY ?? null;
    setDistance(0);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (!enabled || refreshing || startY.current == null) return;
    if (!scrollOriginAtTop.current) return;
    const dy = (e.touches[0]?.clientY ?? 0) - startY.current;
    if (dy <= 0) {
      setDistance(0);
      return;
    }
    // Damped pull — feels native.
    const damped = Math.min(120, dy * 0.5);
    setDistance(damped);
  };

  const onTouchEnd = async () => {
    if (!enabled || refreshing) return reset();
    const ready = distance >= threshold;
    if (ready) {
      setRefreshing(true);
      setDistance(40);
      try {
        await onRefresh();
      } finally {
        setRefreshing(false);
        reset();
      }
    } else {
      reset();
    }
  };

  return {
    bind: { onTouchStart, onTouchMove, onTouchEnd },
    state: { distance, ready: distance >= threshold, refreshing, pulling: distance > 0 },
  } as const;
}
