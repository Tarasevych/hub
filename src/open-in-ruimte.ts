// IDENTITEIT-015 (крок «profiel-blokken»): посилання «Відкрити в просторі» з центру налаштувань (id.*) веде в hub:
//   https://hub.tarasevych.com/?werkruimte=<id простору>&blok=<id блоку>
// Hub вибирає цей простір (лише якщо він є в списку людини — інакше нічого не робить), прокручує до блоку й коротко
// підсвічує його; параметри прибираються з адреси, щоб оновлення сторінки не повторювало перехід.
// «Openen in de werkruimte»: de hub kiest die ruimte (alleen als ze in de eigen lijst staat), scrollt naar het blok en
// markeert het kort; daarna verdwijnen de parameters uit de adresbalk.
import { useEffect, useRef } from 'react';

export type OpenDoel = { werkruimte: string; blok: string };
const ID = /^[A-Za-z0-9_-]{1,120}$/;

/** Вкладки hub (src/App.tsx HubTab). */
export type HubBlokTab = 'overview' | 'recent' | 'tasks' | 'calendar' | 'notes' | 'zoek' | 'photos';
/** Блоки якого виду hub показує окремими картками на вкладці (src/App.tsx filteredVisible; на «Огляді» — робочий стіл, без окремих блоків).
 *  Op welk tabblad toont de hub een blok van deze soort als losse kaart (op «Overzicht» staat het werkblad). */
const BLOK_TAB: Readonly<Record<string, HubBlokTab>> = { focus: 'tasks', projects: 'tasks', automation: 'tasks', calendar: 'calendar', custom: 'notes' };
export const blokOpTab = (kind: string, tab: string): boolean => BLOK_TAB[kind] === tab;
/** IDENTITEIT-015 (приймання blokken-profiel): вкладка, де блок справді видно; null — окремої картки немає ніде.
 *  Раніше «Відкрити в просторі» лишало людину на «Огляді» (робочий стіл), де щойно доданого блоку немає, — посилання вело в нікуди. */
export const tabVoorBlok = (kind: string): HubBlokTab | null => BLOK_TAB[kind] ?? null;

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

export function useOpenInRuimte(p: { spaces: ReadonlyArray<{ id: string }>; spaceId: string; setSpaceId: (id: string) => void; blocks: ReadonlyArray<{ id: string; kind?: string }>; hubTab?: string; setHubTab?: (tab: HubBlokTab) => void }) {
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
    const blok = p.blocks.find((b) => b.id === d.blok);
    if (!blok) return; // blokken van deze ruimte nog niet geladen
    // спершу вкладка, де цей блок показано окремою карткою (на «Огляді» його немає) / eerst het tabblad waar het blok staat
    const tab = tabVoorBlok(String(blok.kind || ''));
    if (tab && p.setHubTab && p.hubTab !== tab) { p.setHubTab(tab); return; }
    klaar();
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(`[data-blok-id="${d.blok}"]`);
      if (!el) return;
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      el.classList.add('is-gevonden');
      window.setTimeout(() => el.classList.remove('is-gevonden'), 2400);
    });
  }, [p.spaces, p.spaceId, p.blocks, p.hubTab]); // eslint-disable-line react-hooks/exhaustive-deps
}
