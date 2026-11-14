// IDENTITEIT-015 (sleutels-gasten): переходи з карток «Що робити, якщо…» до ТОЧНОГО місця (а не на початок розділу).
// Na de wissel van onderdeel (onKies) staat het doel er soms pas na het laden; daarom een paar pogingen, met focus voor toetsenbord
// en schermlezer. «Додати новий passkey» opent bovendien het formulier in PasskeysSection (alleen de naamregel; niets wordt verstuurd).

const EVENT = 'mr-passkey-formulier-openen';
let passkeyVraag = false;

/** Прокрутити до елемента з id і дати йому фокус; кілька спроб, бо після переходу розділ може ще завантажуватися. */
export function gaNaarAnker(id: string, pogingen: readonly number[] = [120, 520, 1100]): void {
  if (typeof window === 'undefined' || !id) return;
  const een = () => {
    const el = document.getElementById(id);
    if (!el) return;
    if (el.tagName === 'DETAILS') (el as HTMLDetailsElement).open = true;
    try { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch { /* geen scroll */ }
    try { (el as HTMLElement).focus?.({ preventScroll: true }); } catch { /* geen focus */ }
  };
  for (const ms of pogingen) window.setTimeout(een, ms);
}

/** Попросити розділ ключів відкрити форму «Додати passkey» (якщо його ще немає — він забере прохання під час появи). */
export function vraagPasskeyFormulier(): void {
  passkeyVraag = true;
  if (typeof window !== 'undefined') { try { window.dispatchEvent(new Event(EVENT)); } catch { /* geen venster */ } }
}
/** Забрати прохання (одноразово). */
export function neemPasskeyFormulierVraag(): boolean { const v = passkeyVraag; passkeyVraag = false; return v; }
export function abonneerPasskeyFormulier(fn: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  window.addEventListener(EVENT, fn);
  return () => window.removeEventListener(EVENT, fn);
}
