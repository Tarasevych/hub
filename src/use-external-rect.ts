import { useCallback, useEffect, useRef } from 'react';

/**
 * Reads the live bounding rect of a DOM element matched by a CSS selector,
 * without importing or modifying that element's own component. Used to let
 * the floating-avoidance registry react to elements we intentionally do not
 * touch (e.g. the notification bell), by measuring them from the outside.
 */
export function useExternalRectGetter(selector: string) {
  const ref = useRef<() => DOMRect | null>(() => null);
  useEffect(() => {
    ref.current = () => {
      const el = document.querySelector(selector);
      return el ? el.getBoundingClientRect() : null;
    };
  }, [selector]);
  // A stable function identity matters: callers use this as a useEffect
  // dependency, and returning a fresh closure every render made those
  // effects tear down and re-run on every unrelated re-render.
  return useCallback(() => ref.current(), []);
}
