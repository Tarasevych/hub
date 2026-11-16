// MAILBEELD-001 (16.11.2026) — «Завантажувати при отриманні (приватно)» in de browser: de keuze staat op de SERVER (de server doet
// het ophalen, ook als geen enkel tabblad open is), per mens en ruimte, en geldt dus op elk apparaat. Wijzigen kan op elk moment
// («Вигляд» → «Зовнішні зображення»). Elke wijziging en het wissen komen in het centrum van meldingen, met «Скасувати».
// Uk: вибір зберігається на сервері (діє на всіх пристроях), змінюється будь-коли; кожна зміна — у центрі сповіщень.
import { useEffect, useState } from 'react';
import { api } from '../platform/client';
import { emitCanonicalNotice } from '../canoniek-meldingen';

export type VoorraadStaat = { geladen: boolean; fout: boolean; bijOntvangst: boolean; aanSinds: number; aantal: number; bytes: number; wachtrij: number };
export const LEGE_VOORRAAD: VoorraadStaat = Object.freeze({ geladen: false, fout: false, bijOntvangst: false, aanSinds: 0, aantal: 0, bytes: 0, wachtrij: 0 });
const PAD = '/api/owner/mail/google-suite/reader/beelden-voorraad';

let staat: VoorraadStaat = LEGE_VOORRAAD;
let lopend: Promise<VoorraadStaat> | null = null;
let context: Record<string, string> = { service: 'mail' };
const luisteraars = new Set<(s: VoorraadStaat) => void>();
const zet = (s: VoorraadStaat) => { staat = s; for (const f of luisteraars) f(s); };
const uitAntwoord = (d: unknown): VoorraadStaat => {
  const o = (d && typeof d === 'object' ? d : {}) as Record<string, unknown>;
  const n = (v: unknown) => Math.max(0, Number(v) || 0);
  return { geladen: true, fout: false, bijOntvangst: o.bijOntvangst === true, aanSinds: n(o.aanSinds), aantal: n(o.aantal), bytes: n(o.bytes), wachtrij: n(o.wachtrij) };
};

/** Eén keer per pagina laden (het leesvenster en «Вигляд» delen het); `opnieuw` = verversen (na het openen van het paneel). */
export function laadVoorraad(ctx?: Record<string, string>, opnieuw = false): Promise<VoorraadStaat> {
  if (ctx) context = { ...ctx };
  if (lopend && !opnieuw) return lopend;
  lopend = api.post(PAD, { ...context }).then((r) => { const s = uitAntwoord(r.data); zet(s); return s; }, () => {
    const s = { ...staat, geladen: true, fout: true };
    zet(s);
    setTimeout(() => { lopend = null; }, 60_000); // een mislukte poging niet onthouden
    return s;
  });
  return lopend;
}

export function useVoorraad(ctx?: Record<string, string>): VoorraadStaat {
  const [s, setS] = useState<VoorraadStaat>(staat);
  useEffect(() => {
    luisteraars.add(setS);
    setS(staat);
    void laadVoorraad(ctx);
    return () => { luisteraars.delete(setS); };
  }, [ctx?.service, ctx?.tabContext, ctx?.sourceOrigin]);
  return s;
}

/** Mag het leesvenster in de voorraad kijken? Alleen als er iets kan staan: aan, of er staat nog iets van vroeger. */
export const voorraadBruikbaar = (s: VoorraadStaat): boolean => s.bijOntvangst || s.aantal > 0;

export const formaatGrootte = (lang: 'uk' | 'nl', bytes: number): string => {
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb >= 10 ? Math.round(mb) : mb.toFixed(1).replace('.', ',')} ${lang === 'uk' ? 'МБ' : 'MB'}`;
  return `${Math.max(1, Math.round(bytes / 1024))} ${lang === 'uk' ? 'КБ' : 'kB'}`;
};

/**
 * Aan/uit. Meteen zichtbaar (optimistisch), dan bewaard; bij een fout terug en een foutmelding. Een melding met «Скасувати» in het
 * centrum van meldingen beschrijft wat er vanaf nu gebeurt.
 */
export async function zetBijOntvangst(lang: 'uk' | 'nl', aan: boolean, metMelding = true): Promise<boolean> {
  const t = (uk: string, nl: string) => (lang === 'uk' ? uk : nl);
  const vorige = staat;
  if (vorige.bijOntvangst === aan && vorige.geladen) return true;
  zet({ ...staat, bijOntvangst: aan });
  try {
    const r = await api.post(`${PAD}/instelling`, { ...context, bijOntvangst: aan });
    zet(uitAntwoord(r.data));
    lopend = Promise.resolve(staat);
  } catch {
    zet(vorige);
    emitCanonicalNotice({
      text: t('Не вдалося змінити режим зовнішніх зображень', 'Wijzigen van de stand voor externe afbeeldingen is niet gelukt'),
      kind: 'error', source: 'mail', topic: 'mail|beelden-voorraad|fout',
      explain: t('Сервер не зберіг вибір; лишився попередній режим. Спробуйте ще раз у «Вигляд» → «Зовнішні зображення».', 'De server heeft de keuze niet bewaard; de vorige stand blijft. Probeer het opnieuw in «Weergave» → «Externe afbeeldingen».'),
    });
    return false;
  }
  if (metMelding) {
    emitCanonicalNotice({
      text: aan
        ? t('Зображення нових листів завантажуються при отриманні', 'Afbeeldingen van nieuwe berichten worden bij ontvangst geladen')
        : t('Зображення нових листів більше не завантажуються при отриманні', 'Afbeeldingen van nieuwe berichten worden niet meer bij ontvangst geladen'),
      kind: aan ? 'success' : 'info',
      source: 'mail',
      topic: 'mail|beelden-voorraad|stand',
      explain: aan
        ? t('Ваш сервер одразу після надходження листа (крім Спаму) завантажує його зовнішні зображення й зберігає їх зашифрованими. Під час читання нічого не надсилається назовні: відправник не дізнається, чи й коли ви відкрили лист, і не бачить вашої IP-адреси. Він може побачити лише, що лист доставлено. Старі листи не змінюються.',
          'Uw server laadt direct na aankomst van een bericht (behalve Spam) de externe afbeeldingen en bewaart ze versleuteld. Bij het lezen gaat er niets naar buiten: de afzender ziet niet óf en wanneer u het bericht opende en ziet uw IP-adres niet. Hij kan alleen zien dat het bericht is afgeleverd. Oude berichten veranderen niet.')
        : t('Нові листи знову питатимуть перед показом зображень. Уже збережені зображення лишаються і показуються без запиту назовні; видалити їх можна в «Вигляд».',
          'Nieuwe berichten vragen weer voordat afbeeldingen getoond worden. Al bewaarde afbeeldingen blijven en worden zonder verzoek naar buiten getoond; wissen kan in «Weergave».'),
      action: { label: t('Скасувати', 'Ongedaan maken'), onAction: () => { void zetBijOntvangst(lang, !aan, false); } },
    });
  }
  return true;
}

/** «Видалити збережені зображення»: alles van deze lade weg. Niet ongedaan te maken (de beelden zijn weg); de keuze blijft. */
export async function wisVoorraad(lang: 'uk' | 'nl'): Promise<boolean> {
  const t = (uk: string, nl: string) => (lang === 'uk' ? uk : nl);
  const voor = staat;
  try {
    const r = await api.post(`${PAD}/wissen`, { ...context });
    zet(uitAntwoord(r.data));
    lopend = Promise.resolve(staat);
    emitCanonicalNotice({
      text: t(`Видалено збережені зображення листів (${voor.aantal}, ${formaatGrootte('uk', voor.bytes)})`, `Bewaarde afbeeldingen van berichten gewist (${voor.aantal}, ${formaatGrootte('nl', voor.bytes)})`),
      kind: 'info', source: 'mail', topic: 'mail|beelden-voorraad|wissen',
      explain: staat.bijOntvangst
        ? t('Зображення старих листів тепер знову питатимуть перед показом. Нові листи й далі завантажуються при отриманні.', 'Afbeeldingen van oude berichten vragen nu weer voordat ze getoond worden. Nieuwe berichten worden nog steeds bij ontvangst geladen.')
        : t('Зображення в листах знову питатимуть перед показом.', 'Afbeeldingen in berichten vragen weer voordat ze getoond worden.'),
    });
    return true;
  } catch {
    emitCanonicalNotice({ text: t('Не вдалося видалити збережені зображення', 'Wissen van bewaarde afbeeldingen is niet gelukt'), kind: 'error', source: 'mail', topic: 'mail|beelden-voorraad|fout', explain: t('Нічого не змінено. Спробуйте ще раз.', 'Er is niets veranderd. Probeer het opnieuw.') });
    return false;
  }
}

/** Alleen voor tests. */
export function vergeetVoorraad() { staat = LEGE_VOORRAAD; lopend = null; context = { service: 'mail' }; }
