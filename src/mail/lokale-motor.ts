// MAILAI-002 (16.11.2026): локальний ШІ Chrome як безкоштовний рушій пошти. Сайт питає розширення Mijn Ruimte (PING) і, якщо людина
// ввімкнула в ньому «!» «Використання сторінками сайту», перекладає й стисло викладає лист моделлю на цьому комп’ютері.
// Lokale AI van Chrome als gratis motor voor de post: alleen via de extensie, alleen met de «!»-schakelaar die de gebruiker zelf
// aanzette; tekst blijft op dit apparaat (ook de server ziet hem niet). Nooit een modeldownload zonder klik (dat bewaakt de extensie).
import { useEffect, useState } from 'react';
import { sendToExtension } from '../extensie-toestand';
import { VAST_EXTENSIE_ID } from '../extensie/extensie-live';
import { filterLokaleAiAntwoord, LOKALE_AI_REDENEN, type LokaleAiAntwoord } from '../../shared/lokale-ai-model';
import { blokTerug, LOKAAL_LIMIET, lokaalStandVan, samenvattingVanTekst, vertaalBlokken, type LokaalStand } from '../../shared/mail-ai-motor';
import type { AiVertalingRunResponse, AiVertalingSegment } from '../../shared/ai-vertaling';

export function isMobielApparaat(): boolean {
  try {
    const nav = navigator as Navigator & { userAgentData?: { mobile?: boolean } };
    if (typeof nav.userAgentData?.mobile === 'boolean') return nav.userAgentData.mobile;
    return /Android|iPhone|iPad|iPod|Mobile/i.test(nav.userAgent || '');
  } catch { return false; }
}

let laatst: { stand: LokaalStand; op: number } | null = null;
let bezigPing: Promise<LokaalStand> | null = null;
const luisteraars = new Set<(s: LokaalStand) => void>();

/** Стан на цьому пристрої (кеш 15 с; `opnieuw` — наприклад після повернення з налаштувань розширення). */
export function peilLokaal(opnieuw = false): Promise<LokaalStand> {
  if (!opnieuw && laatst && Date.now() - laatst.op < 15_000) return Promise.resolve(laatst.stand);
  if (bezigPing) return bezigPing;
  bezigPing = (async () => {
    let stand: LokaalStand;
    if (isMobielApparaat()) stand = 'telefoon';
    else stand = lokaalStandVan(await sendToExtension(VAST_EXTENSIE_ID, { type: 'PING' }, 2500));
    laatst = { stand, op: Date.now() };
    for (const f of luisteraars) f(stand);
    return stand;
  })().finally(() => { bezigPing = null; });
  return bezigPing;
}

/** Хук: стан локального ШІ; оновлюється, коли вкладка знову у фокусі (людина могла щойно ввімкнути «!» у розширенні). */
export function useLokaleStand(): LokaalStand {
  const [stand, setStand] = useState<LokaalStand>(laatst?.stand || 'onbekend');
  useEffect(() => {
    luisteraars.add(setStand);
    void peilLokaal();
    const opFocus = () => { if (document.visibilityState !== 'hidden') void peilLokaal(true); };
    window.addEventListener('focus', opFocus);
    document.addEventListener('visibilitychange', opFocus);
    return () => { luisteraars.delete(setStand); window.removeEventListener('focus', opFocus); document.removeEventListener('visibilitychange', opFocus); };
  }, []);
  return stand;
}

/** Відкрити налаштування розширення (там людина сама вмикає «!»; сайт змінити цього не може). */
export function openExtensieOpties(): void { void sendToExtension(VAST_EXTENSIE_ID, { type: 'OPEN_OPTIONS' }); }

// Скільки запитів за останню хвилину пішло локальній моделі з цієї вкладки (розширення рахує так само, ліміт 20).
const verzoeken: number[] = [];
export function lokaalGebruik(): { minuut: number; max: number } {
  const nu = Date.now();
  while (verzoeken.length && nu - verzoeken[0] > 60_000) verzoeken.shift();
  return { minuut: verzoeken.length, max: LOKAAL_LIMIET.perMinuut };
}

export class LokaleFout extends Error {
  constructor(public reden: string) { super(reden); }
  tekst(nl: boolean): string { const r = LOKALE_AI_REDENEN[this.reden] ?? LOKALE_AI_REDENEN.FOUT; return nl ? r[1] : r[0]; }
}

async function vraag(modus: 'translator' | 'summarizer', tekst: string, doel?: string): Promise<Extract<LokaleAiAntwoord, { ok: true }>> {
  verzoeken.push(Date.now());
  const r = filterLokaleAiAntwoord(await sendToExtension(VAST_EXTENSIE_ID, { type: 'LOKALE_AI', modus, tekst: tekst.slice(0, LOKAAL_LIMIET.tekens), ...(doel ? { doel } : {}) }, 125_000));
  if (!r.ok) { if (r.reden === 'SITE_TOEGANG_UIT' || r.reden === 'UIT') void peilLokaal(true); throw new LokaleFout(r.reden); }
  return r;
}

/** Переклад фрагментів листа на цьому пристрої: блоками; якщо модель змішала рядки — по фрагменту (не більше 12). */
export async function vertaalLokaal(segmenten: readonly AiVertalingSegment[], doel: string): Promise<{ translations: Record<string, string>; onvertaald: number }> {
  const translations: Record<string, string> = {};
  for (const blok of vertaalBlokken(segmenten)) {
    const r = await vraag('translator', blok.tekst, doel);
    const terug = blokTerug(blok.ids, r.tekst);
    if (terug) { Object.assign(translations, terug); continue; }
    if (blok.ids.length === 1) { translations[blok.ids[0]] = r.tekst.trim(); continue; }
    for (const id of blok.ids.slice(0, 12)) {
      const seg = segmenten.find((s) => s.id === id);
      if (!seg?.text.trim()) continue;
      const een = await vraag('translator', seg.text, doel);
      if (een.tekst.trim()) translations[id] = een.tekst.trim();
    }
  }
  const onvertaald = segmenten.filter((s) => s.text.trim() && !translations[s.id]).length;
  if (!Object.keys(translations).length) throw new LokaleFout('FOUT');
  return { translations, onvertaald };
}

/** Стислий виклад листа на цьому пристрої. */
export async function vatSamenLokaal(tekst: string): Promise<NonNullable<AiVertalingRunResponse['summary']>> {
  const r = await vraag('summarizer', tekst);
  return samenvattingVanTekst(r.tekst);
}
