type Point = { x: number; y: number };
export type ZoneKind = 'float' | 'flow';

export type FloatingZone = {
  id: string;
  priority: number;
  kind: ZoneKind;
  getRect: () => DOMRect | null;
  fallbacks: Point[];
  applyFallback?: (point: Point | null) => void;
  reserveFlow?: (padding: number) => void;
};

const zones = new Map<string, FloatingZone>();
const listeners = new Set<() => void>();

export function rectsOverlap(a: DOMRect, b: DOMRect, gap = 10) {
  return !(
    a.right + gap <= b.left ||
    a.left >= b.right + gap ||
    a.bottom + gap <= b.top ||
    a.top >= b.bottom + gap
  );
}

export function registerZone(zone: FloatingZone) {
  zones.set(zone.id, zone);
  queueRecompute();
  return () => {
    zones.delete(zone.id);
    queueRecompute();
  };
}

export function subscribeAvoidance(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

let timer = 0;
export function queueRecompute() {
  if (typeof window === 'undefined') return;
  window.clearTimeout(timer);
  timer = window.setTimeout(recompute, 16);
}

export function recompute() {
  const list = [...zones.values()].sort((a, b) => b.priority - a.priority);
  const settled: Array<{ zone: FloatingZone; rect: DOMRect }> = [];

  for (const zone of list) {
    const rect = zone.getRect();
    if (!rect) continue;

    if (zone.kind === 'flow') {
      const hit = settled.find((item) => item.zone.kind === 'float' && rectsOverlap(rect, item.rect, 12));
      zone.reserveFlow?.(hit ? Math.ceil(hit.rect.height + 16) : 0);
      settled.push({ zone, rect });
      continue;
    }

    if (zone.priority >= 100) {
      settled.push({ zone, rect });
      continue;
    }

    const colliding = settled.some((item) => rectsOverlap(rect, item.rect));
    if (!colliding) {
      // Nothing is blocking this zone (any more): let it report back to its
      // normal position instead of staying stuck in a corner forever.
      zone.applyFallback?.(null);
      settled.push({ zone, rect });
      continue;
    }

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let applied: DOMRect | null = null;
    for (const point of zone.fallbacks) {
      const next = new DOMRect(
        point.x * (vw - rect.width),
        point.y * (vh - rect.height),
        rect.width,
        rect.height,
      );
      const hits = settled.some((item) => rectsOverlap(next, item.rect));
      if (!hits) {
        zone.applyFallback?.(point);
        applied = next;
        break;
      }
    }
    settled.push({ zone, rect: applied ?? rect });
  }

  for (const fn of listeners) fn();
}

export function bindAvoidanceListeners() {
  if (typeof window === 'undefined') return () => undefined;
  const on = () => queueRecompute();
  window.addEventListener('resize', on);
  window.addEventListener('pointerup', on, true);
  window.visualViewport?.addEventListener('resize', on);
  queueRecompute();
  return () => {
    window.removeEventListener('resize', on);
    window.removeEventListener('pointerup', on, true);
    window.visualViewport?.removeEventListener('resize', on);
  };
}
