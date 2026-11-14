// IDENTITEIT-015 (крок «profiel-blokken»): посилання «Відкрити в просторі» з центру налаштувань (id.*) веде в hub:
//   https://hub.tarasevych.com/?werkruimte=<id простору>&blok=<id блоку>
// Hub вибирає цей простір (лише якщо він є в списку людини — інакше нічого не робить), прокручує до блоку й коротко
// підсвічує його; параметри прибираються з адреси, щоб оновлення сторінки не повторювало перехід.
// «Openen in de werkruimte»: de hub kiest die ruimte (alleen als ze in de eigen lijst staat), scrollt naar het blok en
// markeert het kort; daarna verdwijnen de parameters uit de adresbalk.
import { useEffect, useRef } from 'react';

export type OpenDoel = { werkruimte: string; blok: string };
const ID = /^[A-Za-z0-9_-]{1,120}$/;

/** Чисте читання параметрів адреси; null — переходу немає або id некоректний. */
export function leesOpenDoel(search: string): OpenDoel | null {
  const q = new URLSearchParams(search || '');
  const werkruimte = q.get('werkruimte') || '', blok = q.get('blok') || '';
  if (!ID.test(werkruimte)) return null;
  return { werkruimte, blok: ID.test(blok) ? blok : '' };
}

/** Адреса без werkruimte/blok (решта параметрів і хеш лишаються). */
export function zonderOpenDoel(href: string): string {
  try {
    const u = new URL(href);
    u.searchParams.delete('werkruimte');
    u.searchParams.delete('blok');
    return `${u.pathname}${u.search}${u.hash}`;
  } catch { return ''; }
}

export function useOpenInRuimte(p: { spaces: ReadonlyArray<{ id: string }>; spaceId: string; setSpaceId: (id: string) => void; blocks: ReadonlyArray<{ id: string }> }) {
  const doel = useRef<OpenDoel | null>(typeof location === 'undefined' ? null : leesOpenDoel(location.search));
  useEffect(() => {
    const d = doel.current;
    if (!d || !p.spaces.length) return;
    const klaar = () => {
      doel.current = null;
      try { const schoon = zonderOpenDoel(location.href); if (schoon) history.replaceState(history.state, '', schoon); } catch { /* adresbalk niet aanpasbaar: niets aan de hand */ }
    };
    if (!p.spaces.some((s) => s.id === d.werkruimte)) { klaar(); return; }
    if (p.spaceId !== d.werkruimte) { p.setSpaceId(d.werkruimte); return; }
    if (!d.blok) { klaar(); return; }
    if (!p.blocks.some((b) => b.id === d.blok)) return; // blokken van deze ruimte nog niet geladen
    klaar();
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(`[data-blok-id="${d.blok}"]`);
      if (!el) return;
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      el.classList.add('is-gevonden');
      window.setTimeout(() => el.classList.remove('is-gevonden'), 2400);
    });
  }, [p.spaces, p.spaceId, p.blocks]);
}
