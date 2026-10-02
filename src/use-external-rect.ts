import { useEffect, useRef } from 'react';

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
  return () => ref.current();
}
