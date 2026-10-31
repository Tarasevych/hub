// Читання адреси хаба «Підключення ШІ». Окремо від AgentenPagina.tsx: той файл тягне CSS, а тести — ні.
// ORCH-001 етап 3 (31.10.2026): 'orch' = «Координація» — правила, задачі, черга й передачі всіх ШІ-агентів (src/agenten/TabOrch.tsx).
export type TabId = 'overzicht' | 'connectors' | 'agent' | 'ai' | 'extern' | 'orch' | 'extensie' | 'browser' | 'apparaten' | 'tokens' | 'toegang' | 'technisch' | 'journaal';
export const TABS: TabId[] = ['overzicht', 'connectors', 'ai', 'extern', 'orch', 'extensie', 'browser', 'apparaten', 'tokens', 'toegang', 'technisch', 'journaal'];
export const PLEKKEN: TabId[] = [...TABS, 'agent'];
export const ALLEEN_TECHNISCH: readonly TabId[] = ['technisch'];
export const zichtbareTabs = (technisch: boolean): TabId[] => TABS.filter((t) => technisch || !ALLEEN_TECHNISCH.includes(t));
export const isBeleidHash = (hash: string) => /^#beleid(\/|$)/.test(hash);
/** Oude hashes → nieuw tabblad[/item]. extension-lokaal і ruimte — адреси розширення 0.7, які раніше ставали «Огляд». */
export const OUDE_HASH: Record<string, string> = {
  overview: 'overzicht', claude: 'ai', tools: 'ai/hulpmiddelen', pending: 'overzicht', extension: 'extensie', doors: 'tokens', pair: 'apparaten/koppelen',
  'apparaten/extensie': 'extensie', verbindingen: 'technisch', tech: 'technisch', bord: 'ai', dostupy: 'toegang', toegangen: 'toegang',
  'extension-lokaal': 'extensie', ruimte: 'technisch',
};
export type HashPlek = { tab: TabId; item: string; oud: boolean; vraag: URLSearchParams; anker: string };
export function leesHash(hash: string): HashPlek {
  let h = ''; try { h = decodeURIComponent(hash.replace(/^#/, '')); } catch { h = ''; }
  const q = h.indexOf('?');
  const vraag = new URLSearchParams(q >= 0 ? h.slice(q + 1) : '');
  if (q >= 0) h = h.slice(0, q);
  if (h.startsWith('dev:')) return { tab: 'apparaten', item: h, oud: true, vraag, anker: '' };
  if (OUDE_HASH[h]) { const [t, i = ''] = OUDE_HASH[h].split('/'); return { tab: t as TabId, item: i, oud: true, vraag, anker: h }; }
  if (h.startsWith('extension/')) return { tab: 'extensie', item: h.slice('extension/'.length), oud: true, vraag, anker: '' };
  const [t, ...rest] = h.split('/');
  return PLEKKEN.includes(t as TabId) ? { tab: t as TabId, item: rest.join('/'), oud: false, vraag, anker: '' } : { tab: 'overzicht', item: '', oud: !!h, vraag, anker: '' };
}
export function koppelVraag(search: string, vraag: URLSearchParams): '' | 'prive' | 'technisch' {
  let k = vraag.get('koppel') || '';
  try { if (!k) k = new URLSearchParams(search).get('koppel') || ''; } catch { /* geen URL */ }
  return k === 'prive' || k === 'technisch' ? k : '';
}
/** ?ontgrendelen=prive|technisch (ui.js 0.7) of =1 (0.5). */
export function ontgrendelDoel(search: string, vraag: URLSearchParams): '' | 'prive' | 'technisch' | '1' {
  let k = vraag.get('ontgrendelen') || '';
  try { if (!k) k = new URLSearchParams(search).get('ontgrendelen') || ''; } catch { /* geen URL */ }
  return k === 'prive' || k === 'technisch' || k === '1' ? k : '';
}
