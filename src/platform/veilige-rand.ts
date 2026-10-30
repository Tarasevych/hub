// Veilige randen van het scherm (notch, home-indicator) in px, voor JS-plaatsing van zwevende knoppen (bel, FAB «Новий лист»).
// CSS kent env(safe-area-inset-*) (tokens.css: --veilig-*), JS niet: één verborgen meetelement met die waarden als padding.
// Via CSSOM (style.paddingTop = …), niet via een style-attribuut — dat valt niet onder de CSP-regel voor inline stijl.
import type { Randen } from '../mail-opstel-plaats';

let meter: HTMLElement | null = null;

export function veiligeRand(): Randen {
  if (typeof document === 'undefined' || !document.body) return { boven: 0, onder: 0, links: 0, rechts: 0 };
  try {
    if (!meter || !meter.isConnected) {
      meter = document.createElement('div');
      meter.setAttribute('aria-hidden', 'true');
      meter.dataset.veiligeRand = '1';
      const s = meter.style;
      s.position = 'fixed'; s.left = '0'; s.top = '0'; s.width = '0'; s.height = '0'; s.visibility = 'hidden'; s.pointerEvents = 'none'; s.overflow = 'hidden';
      s.paddingTop = 'env(safe-area-inset-top, 0px)'; s.paddingRight = 'env(safe-area-inset-right, 0px)';
      s.paddingBottom = 'env(safe-area-inset-bottom, 0px)'; s.paddingLeft = 'env(safe-area-inset-left, 0px)';
      document.body.appendChild(meter);
    }
    const cs = getComputedStyle(meter);
    const px = (v: string) => { const n = parseFloat(v); return Number.isFinite(n) && n > 0 ? n : 0; };
    return { boven: px(cs.paddingTop), onder: px(cs.paddingBottom), links: px(cs.paddingLeft), rechts: px(cs.paddingRight) };
  } catch {
    return { boven: 0, onder: 0, links: 0, rechts: 0 };
  }
}
