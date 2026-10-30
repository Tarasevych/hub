// Hoofd3: tekst naar het klembord, met terugval voor niet-HTTPS / oudere browsers (execCommand via een verborgen textarea).
export type KopieerOmgeving = { clipboard?: { writeText(t: string): Promise<void> } | null; document?: Document | null; veilig?: boolean };

export async function kopieerNaarKlembord(tekst: string, omg: KopieerOmgeving = {
  clipboard: typeof navigator !== 'undefined' ? navigator.clipboard : null,
  document: typeof document !== 'undefined' ? document : null,
  veilig: typeof window !== 'undefined' ? window.isSecureContext : false,
}): Promise<boolean> {
  if (!tekst) return false;
  if (omg.clipboard && omg.veilig !== false) {
    try { await omg.clipboard.writeText(tekst); return true; } catch { /* terugval hieronder */ }
  }
  const d = omg.document;
  if (!d || !d.body) return false;
  const ta = d.createElement('textarea');
  ta.value = tekst; ta.setAttribute('readonly', ''); ta.setAttribute('aria-hidden', 'true');
  ta.style.position = 'fixed'; ta.style.top = '-1000px'; ta.style.opacity = '0';
  d.body.appendChild(ta); ta.select();
  let ok = false;
  try { ok = d.execCommand('copy'); } catch { ok = false; }
  d.body.removeChild(ta);
  return ok;
}

/** Zichtbare tekst van een blok, zonder knoppen en zonder lege regels; lijstpunten krijgen «• ». */
export function blokTekst(el: HTMLElement | null): string {
  if (!el) return '';
  const kloon = el.cloneNode(true) as HTMLElement;
  kloon.querySelectorAll('button, [data-kopieer-negeer]').forEach((n) => n.remove());
  kloon.querySelectorAll('li').forEach((li) => { li.insertBefore(kloon.ownerDocument.createTextNode('• '), li.firstChild); });
  kloon.querySelectorAll('p, li, h4, div, small, ul').forEach((n) => n.appendChild(kloon.ownerDocument.createTextNode('\n')));
  return (kloon.textContent || '').split('\n').map((r) => r.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');
}
