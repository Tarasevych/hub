// Stand «ШІ in de brief» (pakket 3 «Adaptive Mail Canvas», 24.10.2026): het gesprek van stand-lezer.ts met een nagebootste privé-agent.
// Макет (власник): «ШІ-блок «Що від вас потрібно?»: пункти з чипом джерела «лист 3 · §3» і терміном; підвал «Кожен пункт знайдено
// дослівно в оригіналі (3 з 3)»»; «смуга перекладу: Оригінал / Переклад / Порівняти»; «Порівняти: таблиця абзаців з виділеним
// абзацом-джерелом»; аркуш «Звідки це?» («Показати абзац у листі», «Пункт хибний — прибрати»); «Контекст → завдання й події з
// джерелами»; «вкладення: група версій … Порівняти»; «рядок відповіді: … підказки ШІ (пунктир)»; «оригінал завжди доступний».
//
// Nagebootst (alleen in de browser van de stand, via page.route — de echte server ziet deze verzoeken niet):
//   - /ai-vertaling/state: één privé-agent «Claude» met mail.read;
//   - /ai-vertaling/run: «acties» geeft vier echte punten en één VERZONNEN («waarborg van 1700 euro … vóór 25 oktober» staat nergens in de
//     brieven) — de browser moet hem zelf wegfilteren; «translate» vertaalt de bekende alinea's (vaste Oekraïense tekst);
//   - /compose/ai/reply: een antwoordconcept; /google-suite/attachment: drie echte PDF's (pdf-lib) met v1/v2/v3 van het huurcontract.
// Gemeten per maat: zie lezerAiStap. Geen enkel verzoek van de browser naar een host buiten de site.
import { join } from 'node:path';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { ALINEAS, lezerNep, openRij, zetZwevend, type LezerCtx, type LezerVorm } from './stand-lezer';
import { wachtOpLijst } from './stand-mail-nep';

type Page = import('playwright-core').Page;
export type LezerAiCtx = LezerCtx & { axe: string };

const json = (body: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
const lichaam = (r: { request: () => { postData: () => string | null } }) => { try { return JSON.parse(r.request().postData() || '{}') as Record<string, unknown>; } catch { return {}; } };
const kaal = (s: string) => String(s || '').replace(/<br>/g, ' ').replace(/\s+/g, ' ').trim();

/** Vaste vertalingen (uk) van de alinea's en het onderwerp van de stand — zodat de knipsels echte tekst tonen. */
const VERTALING: Record<string, string> = {
  [kaal(ALINEAS[0])]: 'Доброго ранку, Павле,',
  [kaal(ALINEAS[1])]: 'Дякую, що так швидко підписали. У вкладенні — остаточна версія договору оренди, підписана обома сторонами, і план квартири.',
  [kaal(ALINEAS[2])]: 'Пропоную провести опис стану квартири в середу, 28 жовтня, о 10:00 на місці. Чи можете підтвердити цей час до понеділка, 26 жовтня, і взяти з собою посвідчення особи?',
  [kaal(ALINEAS[3])]: 'Ключі передамо одразу після опису стану.',
  [kaal(ALINEAS[4])]: 'З найкращими побажаннями, Лотте Вермейлен, Immo Voorbeeld · Voorbeeldstraat 12, 9000 Gent',
  'Met vriendelijke groeten,': 'З найкращими побажаннями,',
  'Lotte Vermeulen': 'Лотте Вермейлен',
  'Immo Voorbeeld · Voorbeeldstraat 12, 9000 Gent': 'Immo Voorbeeld · Voorbeeldstraat 12, 9000 Gent',
  'Huurcontract Voorbeeldstraat 12 — ondertekende versie': 'Договір оренди Voorbeeldstraat 12 — підписана версія',
};
const vertaal = (t: string) => VERTALING[kaal(t)] || '';

/** «Що від вас потрібно?» van het model: vier punten die letterlijk in brief 3 staan, en één verzonnen. */
export const AI_ACTIES = {
  punten: [
    { id: 'p1', tekst: 'Підтвердити час опису стану (середа, 28 жовтня, 10:00)', citaat: 'Kunt u dit tijdstip bevestigen vóór maandag 26 oktober', brief: 3, alinea: 3, termijn: 'vóór maandag 26 oktober', soort: 'vraag' },
    { id: 'p2', tekst: 'Взяти посвідчення особи на опис стану', citaat: 'uw identiteitskaart meebrengen', brief: 3, alinea: 3, soort: 'verzoek' },
    { id: 'p3', tekst: 'Сплатити гарантійний внесок 1700 євро', citaat: 'de waarborg van 1700 euro storten vóór 25 oktober', brief: 3, alinea: 2, termijn: 'vóór 25 oktober', soort: 'verzoek' },
  ],
  kort: [
    { id: 'k1', tekst: 'Опис стану: середа, 28 жовтня, 10:00, на місці', citaat: 'de plaatsbeschrijving te doen op woensdag 28 oktober om 10:00 ter plaatse', brief: 3, alinea: 3, soort: 'feit' },
    { id: 'k2', tekst: 'Ключі — одразу після опису стану', citaat: 'De sleutels overhandigen we meteen na de plaatsbeschrijving', brief: 3, alinea: 4, soort: 'feit' },
  ],
  antwoordHints: ['Ja, woensdag 28 oktober om 10:00 past. Ik breng mijn identiteitskaart mee.', 'Kan de plaatsbeschrijving een uur later?'],
  antwoordNodig: true,
  opbouw: 'model',
};
export const VERZONNEN = 'Сплатити гарантійний внесок 1700 євро';

const PDF_TEKST: Record<string, string[][]> = {
  'Huurcontract-concept.pdf': [
    ['Huurovereenkomst Voorbeeldstraat 12'],
    ['Artikel 1 - Voorwerp', 'De verhuurder verhuurt aan de huurder de woning gelegen te Voorbeeldstraat 12, 9000 Gent.'],
    ['Artikel 2 - Huurprijs', 'De huurder betaalt elke maand een huur van 850 euro,', 'uiterlijk op de vijfde dag van de maand.'],
    ['Artikel 3 - Waarborg', 'De waarborg bedraagt twee maanden huur.'],
  ],
  'Huurcontract-getekend.pdf': [
    ['Huurovereenkomst Voorbeeldstraat 12'],
    ['Artikel 1 - Voorwerp', 'De verhuurder verhuurt aan de huurder de woning gelegen te Voorbeeldstraat 12, 9000 Gent.'],
    ['Artikel 2 - Huurprijs', 'De huurder betaalt elke maand een huur van 850 euro,', 'uiterlijk op de vijfde dag van de maand.'],
    ['Artikel 3 - Waarborg', 'De waarborg bedraagt twee maanden huur.'],
    ['Getekend door de huurder op 23 oktober 2026.'],
  ],
  'Huurcontract-ondertekend.pdf': [
    ['Huurovereenkomst Voorbeeldstraat 12'],
    ['Artikel 1 - Voorwerp', 'De verhuurder verhuurt aan de huurder de woning gelegen te Voorbeeldstraat 12, 9000 Gent.'],
    ['Artikel 2 - Huurprijs', 'De huurder betaalt elke maand een huur van 875 euro,', 'uiterlijk op de vijfde dag van de maand.'],
    ['Artikel 3 - Waarborg', 'De waarborg bedraagt twee maanden huur en wordt op een geblokkeerde rekening gezet.'],
    ['Ondertekend door beide partijen op 24 oktober 2026.'],
  ],
};
const pdfCache = new Map<string, Buffer>();
async function pdfVan(naam: string): Promise<Buffer | null> {
  const blokken = PDF_TEKST[naam];
  if (!blokken) return null;
  if (pdfCache.has(naam)) return pdfCache.get(naam)!;
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const blad = doc.addPage([595, 842]);
  let y = 780;
  for (const regels of blokken) { for (const r of regels) { blad.drawText(r, { x: 56, y, size: 11, font }); y -= 16; } y -= 14; }
  const b = Buffer.from(await doc.save());
  pdfCache.set(naam, b);
  return b;
}

/** Wat de nagebootste agent ontving (voor de metingen van de stap). */
export const aiLog: Array<{ mode: string; segmenten: number; brieven: number[]; doel: string }> = [];

export async function lezerAiNep(page: Page, vorm: LezerVorm) {
  await lezerNep(page, vorm);
  aiLog.length = 0;
  const agent = { id: 'ag-prive-claude', name: 'Claude', platform: 'anthropic', source: 'oauth', ruimte: 'prive', scopes: ['mail.read'], allowedMailRead: true, allowedFilesRead: false, statusUk: 'активний' };
  await page.route('**/api/owner/mail/ai-vertaling/state', (r) => r.fulfill(json({ ok: true, agents: [agent], settings: { defaultLang: 'uk', defaultAgentId: agent.id, summaryDepth: 'kort', crossMailboxContext: false, includeAttachments: false, recentLangs: ['uk'] } })));
  await page.route('**/api/owner/mail/ai-vertaling/run', (r) => {
    const b = lichaam(r), mode = String(b.mode || '');
    const segs = Array.isArray(b.segments) ? (b.segments as Array<{ id: string; text: string }>) : [];
    aiLog.push({ mode, segmenten: segs.length, brieven: Array.isArray(b.bronBerichten) ? (b.bronBerichten as Array<{ brief: number }>).map((x) => x.brief) : [], doel: String(b.targetLang || '') });
    const basis = { ok: true, mode, targetLang: String(b.targetLang || 'uk'), targetLangLabelUk: 'українська', detectedSourceLang: 'nl', agentId: agent.id, agentName: agent.name, cached: false, privacy: { strippedTrackingPixels: 0, strippedTrackingParams: 0, redactedSecrets: 0, scopeVerified: ['mail.read'], ruimte: 'prive' } };
    if (mode === 'acties') return r.fulfill(json({ ...basis, acties: AI_ACTIES }));
    if (mode === 'translate') {
      const tr: Record<string, string> = {};
      let onvertaald = 0;
      for (const s of segs) { const v = vertaal(s.text); if (v) tr[s.id] = v; else if (kaal(s.text)) onvertaald += 1; }
      return r.fulfill(json({ ...basis, translations: tr, motorId: 'prive-agent', motorNaam: 'Claude', onvertaald }));
    }
    return r.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'VERTAALMOTOR_GEEN_ANTWOORD', messageUk: 'Рушій не дав відповіді (стенд).', messageNl: 'De motor gaf geen antwoord (stand).' }) });
  });
  await page.route('**/api/owner/mail/compose/ai/reply', (r) => r.fulfill(json({ text: 'Beste Lotte, woensdag 28 oktober om 10:00 past mij. Ik breng mijn identiteitskaart mee. Met vriendelijke groeten, Pavlo', html: '<p>Beste Lotte,</p><p>woensdag 28 oktober om 10:00 past mij. Ik breng mijn identiteitskaart mee.</p><p>Met vriendelijke groeten,<br>Pavlo</p>' })));
  await page.route('**/api/owner/mail/google-suite/attachment', async (r) => {
    const b = lichaam(r);
    const data = await pdfVan(String(b.filename || ''));
    if (!data) return r.fallback();
    return r.fulfill(json({ source: 'live_on_demand_chunk', persisted: false, accountId: b.accountId || '', messageId: b.messageId, attachmentId: b.attachmentId, filename: b.filename, contentType: 'application/pdf', sizeBytes: data.length, totalBytes: data.length, offset: 0, nextOffset: data.length, done: true, data: data.toString('base64url') }));
  });
}

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
async function axeOp(p: Page, bron: string, sels: string[]) {
  if (!bron) return { v: [] as Array<{ id: string; impact: string; nodes: number; doel: string[] }>, doelen: [] as string[] };
  if (!(await p.evaluate(() => typeof (window as unknown as { axe?: unknown }).axe !== 'undefined'))) await p.evaluate(bron).catch(() => undefined);
  return p.evaluate(async ({ sels, tags }) => {
    const doelen = sels.filter((s) => document.querySelector(s));
    if (!doelen.length) return { v: [], doelen };
    const w = window as unknown as { axe: { run: (c: unknown, o: unknown) => Promise<{ violations: Array<{ id: string; impact: string; nodes: Array<{ target: string[] }> }> }> } };
    const r = await w.axe.run({ include: doelen.map((s) => [s]) }, { runOnly: { type: 'tag', values: tags }, resultTypes: ['violations'] });
    return { v: r.violations.map((x) => ({ id: x.id, impact: x.impact, nodes: x.nodes.length, doel: x.nodes.slice(0, 3).map((n) => n.target.join(' ').slice(0, 140)) })), doelen };
  }, { sels, tags: AXE_TAGS });
}

/**
 * Eén stap per vorm en maat (mail-lezer-ai-<vorm>):
 *   1. eenvoudig ontleden zonder model: blok «Авто» (op smal ingeklapt), de vraag met bron «лист 3 · §3» en termijn, chip «Потребує
 *      відповіді» bij het onderwerp, het ШІ-panel ingeklapt, de brief begint binnen het scherm;
 *   2. «Уточнити з ШІ»: de agent krijgt de drie brieven (1..3); vier punten getoond, het verzonnen NIET (voet «4 з 5; решту не показано»),
 *      apart te bekijken als «не знайдено»; hints in de antwoordregel (stippel);
 *   3. «Звідки це?»: blad binnen het scherm en niet bedekt, de originele alinea met het citaat gemarkeerd, de controle, «Перекласти абзац»,
 *      Escape sluit eerst het blad (focus terug op de chip), «Назад» ook (telefoon); axe;
 *   4. «Показати абзац у листі»: de alinea in het iframe oplicht (en in beeld); 5. «Пункт хибний — прибрати» en «Повернути»;
 *   6. vertaalstrook: «Переклад» (onderwerp «Оригінал: …»), «Порівняти» (tabel per alinea, bronrijen, de brief verborgen; op smal onder
 *      elkaar; axe), «Оригінал» (brief weer zichtbaar);
 *   7. contextpaneel: de punten met bron en «До завдань» (N10 met de titel van het punt); «Порівняти» bij de versies (echte PDF's: 850 → 875
 *      euro; axe; Escape sluit alleen het venster); «Звідки це?» vanuit het paneel en «Показати абзац» sluit het blad;
 *   8. «Чернетка відповіді» met ШІ en een hint (dubbelklik) → het antwoordveld, de hint er precies één keer in; 9. «Вигляд → Мова листа: Перекладати» → een anderstalige brief
 *      wordt bij het (opnieuw) openen meteen vertaald, een brief in de taal van de site niet; 10. geen enkel verzoek naar buiten.
 * Eindstand voor het knipsel: model-punten, «Порівняти» open (макет: «лист у режимі «Порівняти» з виділеним джерелом пункту ШІ»).
 */
export const lezerAiStap = (c: LezerAiCtx, vorm: LezerVorm) => async (page: Page) => {
  const w = page.viewportSize()?.width || 0, h = page.viewportSize()?.height || 0, slecht: string[] = [], info: Record<string, unknown> = {};
  const extern: string[] = [];
  const opVerzoek = (r: { url: () => string }) => { try { const u = new URL(r.url()); if (/^https?:$/.test(u.protocol) && !/(^|\.)tarasevych\.com$/.test(u.hostname)) extern.push(u.href.slice(0, 120)); } catch { /* data:, blob: */ } };
  page.on('request', opVerzoek);
  const naam = `mail-lezer-ai-${vorm}`;
  // één deelstap; mislukt hij, dan noteren en een laag die open bleef sluiten (anders blokkeert hij de volgende deelstappen)
  const stap = async (wat: string, f: () => Promise<void>) => {
    try { await f(); } catch (e) {
      slecht.push(`${wat}: ${String((e as Error).message || e).split('\n')[0].slice(0, 160)}`);
      for (let i = 0; i < 3 && (await page.locator('[data-versie-vergelijk], [data-bron-blad], .mail-reader-n10-backdrop').count().catch(() => 0)); i++) { await page.keyboard.press('Escape').catch(() => undefined); await page.waitForTimeout(300); }
    }
  };
  try {
    await wachtOpLijst(page);
    await zetZwevend(page, vorm === 'zwevend');
    await page.evaluate(() => { try { for (const k of ['mail-lezer-weergave-v1', 'mail-lezer-context-v1', 'mail-ai-weg-v1', 'mail-ai-blok-open-v1', 'mr-ai-balk-open-v1', 'mail-beelden-afzenders-v1']) localStorage.removeItem(k); } catch { /* */ } });
    // bijlagen uit de cache van eerdere stappen (andere nagebootste inhoud voor dezelfde bijlage-id's) zouden «Порівняти версії» voeden
    await page.evaluate(async () => { try { await caches.delete('tsv-mail-private-v2'); } catch { /* */ } });
    // schone begintoestand: de vorige maat liet de brief (en het opengeklapte blok) soms open staan
    await page.reload({ waitUntil: 'load' }); await wachtOpLijst(page);
    await page.mouse.move(Math.round(w * 0.62), Math.round(h * 0.55));
    await openRij(page, 'agc-m0');
    await page.waitForTimeout(700);
    const taal = await page.evaluate(() => document.documentElement.lang || 'uk');
    const nl = /^nl/.test(taal);
    const T = (uk: string, n: string) => (nl ? n : uk);
    const kader = () => page.evaluate(() => { const a = document.querySelector<HTMLElement>('.google-mail-reader'); return { modus: a?.dataset.leesModus || '', breedte: a?.dataset.leesBreedte || '', context: a?.dataset.context || '' }; });
    const k0 = await kader();
    info.kader = k0;
    const smal = k0.breedte === 'smal';
    const blok = () => page.evaluate(() => {
      const b = document.querySelector<HTMLElement>('.google-mail-reader [data-ai-blok]');
      const lijst = (sel: string) => [...(b?.querySelectorAll<HTMLElement>(sel) || [])].map((li) => ({ id: li.dataset.aiPunt || '', status: li.dataset.status || '', soort: li.dataset.soort || '', tekst: (li.querySelector('.ai-blok-tekst')?.textContent || '').trim(), chip: (li.querySelector('.ai-bron-chip')?.textContent || '').trim(), termijn: (li.querySelector('.ai-termijn-chip')?.textContent || '').trim() }));
      return {
        er: !!b, opbouw: b?.dataset.opbouw || '', open: b?.dataset.open || '', samenvatting: b?.querySelector('.ai-blok-samenvatting')?.textContent || '', herkomst: b?.querySelector('.ai-blok-herkomst')?.textContent || '',
        punten: lijst('.ai-blok-punten > li'), kort: lijst('.ai-blok-kort li'), niet: lijst('.ai-blok-niet li'), voet: (b?.querySelector('.ai-blok-voet') as HTMLElement | null)?.innerText.replace(/\s+/g, ' ') || '',
        modelKnop: !!b?.querySelector('[data-actie="model"]'), r: (() => { const x = b?.getBoundingClientRect(); return x ? { y: Math.round(x.top), h: Math.round(x.height) } : null; })(),
      };
    });

    // ---- 1. eenvoudig ontleden (zonder model)
    let b0 = await blok();
    info.eenvoudig = b0;
    info.regels = await page.evaluate(() => {
      const uit: Record<string, string[]> = {};
      for (const [naam, sel] of [['chip', '.google-mail-reader [data-ai-blok] .ai-bron-chip'], ['knop', '.google-mail-reader [data-ai-blok] .ai-blok-knop'], ['voet', '.google-mail-reader [data-ai-blok] .ai-blok-voet']] as const) {
        const e = document.querySelector(sel); if (!e) continue;
        const lijst: string[] = [];
        const loop = (rules: CSSRuleList) => { for (const r of [...rules]) { if (r instanceof CSSStyleRule) { try { if (e.matches(r.selectorText) && /font|margin|padding|border-top|width|position/.test(r.style.cssText)) lijst.push(`${r.selectorText.slice(0, 140)} { ${r.style.cssText.slice(0, 160)} }`); } catch { /* */ } } else if ('cssRules' in r && (r as CSSGroupingRule).cssRules) { try { loop((r as CSSGroupingRule).cssRules); } catch { /* */ } } } };
        for (const sh of [...document.styleSheets]) { try { loop(sh.cssRules); } catch { /* */ } }
        uit[naam] = lijst.slice(-12);
      }
      return uit;
    });
    // berekende stijl van de onderdelen (de site-CSS mag de tokens van het blok niet overschrijven: lettergrootte, hoogte, ruimte)
    info.stijl = await page.evaluate(() => {
      const st = (sel: string) => { const e = document.querySelector<HTMLElement>(sel); if (!e) return null; const c = getComputedStyle(e), r = e.getBoundingClientRect(); return { fs: c.fontSize, lh: c.lineHeight, h: Math.round(r.height), w: Math.round(r.width), pad: c.padding, mar: c.margin, bt: `${c.borderTopWidth} ${c.borderTopStyle}`, minH: c.minHeight, disp: c.display }; };
      return { blok: st('.google-mail-reader [data-ai-blok]'), kop: st('.google-mail-reader [data-ai-blok] .ai-blok-kop'), punt: st('.google-mail-reader [data-ai-blok] .ai-blok-punten > li'), chip: st('.google-mail-reader [data-ai-blok] .ai-bron-chip'), termijn: st('.google-mail-reader [data-ai-blok] .ai-termijn-chip'), knop: st('.google-mail-reader [data-ai-blok] .ai-blok-knop'), acties: st('.google-mail-reader [data-ai-blok] .ai-blok-acties'), voet: st('.google-mail-reader [data-ai-blok] .ai-blok-voet'), kort: st('.google-mail-reader [data-ai-blok] .ai-blok-kort'), h4: st('.google-mail-reader [data-ai-blok] .ai-blok-kort h4'), inhoud: st('.google-mail-reader [data-ai-blok] .ai-blok-inhoud') };
    });
    if (!b0.er) throw new Error('blok «Що від вас потрібно?» ontbreekt');
    if (b0.opbouw !== 'eenvoudig') slecht.push(`blok begint niet als «простий розбір» (${b0.opbouw})`);
    // ingeklapt op smal en in een laag venster (< 860 px), anders open
    const verwachtOpen = !smal && h >= 860;
    if (verwachtOpen && b0.open !== 'ja') slecht.push(`hoog venster: blok niet open (${b0.open})`);
    if (!verwachtOpen && b0.open !== 'nee') slecht.push(`${smal ? 'smal' : `laag venster (${h} px)`}: blok staat open (moet ingeklapt beginnen)`);
    if (b0.open !== 'ja') { await page.locator('.google-mail-reader [data-ai-blok] .ai-blok-wissel').first().click({ timeout: 4000 }); await page.waitForTimeout(300); b0 = await blok(); }
    const vraag = b0.punten.find((x) => x.soort === 'vraag');
    if (!vraag || vraag.chip !== T('лист 3 · §3', 'bericht 3 · §3') || !/26/.test(vraag.termijn)) slecht.push(`eenvoudig: de vraag met bron «лист 3 · §3» en termijn ontbreekt (${JSON.stringify(b0.punten).slice(0, 300)})`);
    if (b0.punten.some((x) => x.status !== 'letterlijk')) slecht.push('eenvoudig: een punt dat niet letterlijk in de brief staat');
    if (!/без моделі|zonder model/.test(b0.herkomst)) slecht.push(`herkomst zegt niet «без моделі» (${b0.herkomst})`);
    const kop = await page.evaluate(() => {
      const art = document.querySelector('.google-mail-reader'), chip = art?.querySelector<HTMLElement>('.mail-thread-ai-chip');
      const balk = art?.querySelector<HTMLElement>('[data-ai-vertaling-balk]'), lat = art?.querySelector<HTMLElement>('.mail-thread-message.latest .mail-thread-message-body');
      return { chip: chip?.textContent?.trim() || '', chipOpbouw: chip?.dataset.opbouw || '', balk: balk?.dataset.ingeklapt || 'geen', briefBoven: lat ? Math.round(lat.getBoundingClientRect().top) : -1, strook: !!art?.querySelector('[data-vertaal-strook]') };
    });
    info.kop = kop;
    if (!/Потребує відповіді|Wacht op uw antwoord/.test(kop.chip)) slecht.push(`chip «Потребує відповіді» bij het onderwerp ontbreekt (${kop.chip || '-'})`);
    if (kop.balk !== 'ja') slecht.push(`ШІ-panel boven de brief niet ingeklapt (${kop.balk})`);
    if (!nl && !kop.strook) slecht.push('vertaalstrook ontbreekt bij een Nederlandse brief (site in het Oekraïens)');
    if (nl && kop.strook) slecht.push('vertaalstrook bij een brief in de taal van de site');
    await page.screenshot({ path: join(c.uit, `${naam}-eenvoudig-${w}.png`) }).catch(() => undefined);

    // ---- 2. «Уточнити з ШІ»
    await stap('Уточнити з ШІ', async () => {
      await page.locator('.google-mail-reader [data-ai-blok] [data-actie="model"]').first().click({ timeout: 5000 });
      await page.waitForSelector('.google-mail-reader [data-ai-blok][data-opbouw="model"]', { timeout: 8000 });
      await page.waitForTimeout(300);
      const b1 = await blok();
      info.model = b1;
      const acties = aiLog.filter((x) => x.mode === 'acties');
      info.aiLog = [...aiLog];
      if (acties.length !== 1 || acties[0].brieven.join() !== '1,2,3') slecht.push(`agent kreeg niet de drie brieven (1,2,3): ${JSON.stringify(acties)}`);
      if (b1.punten.length !== 2 || b1.kort.length !== 2) slecht.push(`model: ${b1.punten.length} punten / ${b1.kort.length} feiten getoond (verwacht 2/2)`);
      if ([...b1.punten, ...b1.kort].some((x) => x.tekst === VERZONNEN)) slecht.push('het VERZONNEN punt wordt getoond');
      if (!/4 з 5|4 van 5/.test(b1.voet)) slecht.push(`voet zonder «4 з 5» (${b1.voet})`);
      if (!/Claude/.test(b1.herkomst)) slecht.push(`herkomst noemt de agent niet (${b1.herkomst})`);
      if (b1.punten[0]?.chip !== T('лист 3 · §3', 'bericht 3 · §3')) slecht.push(`bron van het eerste punt: ${b1.punten[0]?.chip}`);
      await page.locator(`.google-mail-reader [data-ai-blok] .ai-blok-voet button:has-text("${T('Показати не знайдене', 'Niet-gevonden tonen')}")`).first().click({ timeout: 4000 });
      await page.waitForTimeout(250);
      const b2 = await blok();
      if (b2.niet.length !== 1 || b2.niet[0].tekst !== VERZONNEN || !/не знайдено|niet in het bericht/.test(b2.niet[0].chip)) slecht.push(`«Показати не знайдене»: ${JSON.stringify(b2.niet)}`);
      await page.locator(`.google-mail-reader [data-ai-blok] .ai-blok-voet button:has-text("${T('Сховати не знайдене', 'Niet-gevonden verbergen')}")`).first().click({ timeout: 4000 }).catch(() => undefined);
      const hints = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.google-mail-reader .mail-reply-hint')].map((x) => ({ opbouw: x.dataset.opbouw || '', tekst: (x.textContent || '').trim(), stippel: getComputedStyle(x).borderTopStyle })));
      info.hints = hints;
      if (hints.length !== 2 || hints.some((x) => x.opbouw !== 'model' || x.stippel !== 'dashed')) slecht.push(`hints van ШІ in de antwoordregel: ${JSON.stringify(hints)}`);
      const r = await axeOp(page, c.axe, ['.google-mail-reader [data-ai-blok]', '.google-mail-reader .mail-reply-extra']);
      info.axeBlok = r;
      if (r.v.length) slecht.push(`axe blok: ${r.v.map((x) => `${x.id}(${x.impact},${x.nodes})`).join(', ')}`);
      await page.screenshot({ path: join(c.uit, `${naam}-model-${w}.png`) }).catch(() => undefined);
    });

    // ---- 3. «Звідки це?»
    const bladMeting = () => page.evaluate(() => {
      const bl = document.querySelector<HTMLElement>('.google-mail-reader [data-bron-blad]');
      if (!bl) return null;
      const r = bl.getBoundingClientRect(), sluit = bl.querySelector<HTMLElement>('.bron-blad-sluit')?.getBoundingClientRect(), art = document.querySelector('.google-mail-reader')?.getBoundingClientRect();
      const t = sluit ? document.elementFromPoint(sluit.left + sluit.width / 2, sluit.top + sluit.height / 2) : null;
      const a = document.activeElement;
      const bel = document.querySelector<HTMLElement>("[data-qa-id='canonical-notification-bell']");
      const belR = bel?.getBoundingClientRect();
      // de meldingsbel mag niet over het blad liggen (zoals bij «Контекст» en «Ще» op de telefoon)
      const belOver = !!(bel && belR && belR.width && getComputedStyle(bel).visibility !== 'hidden' && belR.left < r.right && belR.right > r.left && belR.top < r.bottom && belR.bottom > r.top);
      return { belOver, r: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }, art: art ? { x: Math.round(art.left), w: Math.round(art.width), onder: Math.round(art.bottom) } : null, bedekt: !(t && bl.contains(t)), mark: bl.querySelector('mark')?.textContent || '', controle: (bl.querySelector('.bron-blad-controle') as HTMLElement | null)?.innerText || '', focusBinnen: !!(a && bl.contains(a)), status: bl.dataset.status || '', kop: bl.querySelector('h3')?.textContent || '' };
    });
    await stap('Звідки це?', async () => {
      await page.locator('.google-mail-reader [data-ai-blok] .ai-blok-punten [data-bron-chip]').first().click({ timeout: 4000 });
      await page.waitForSelector('.google-mail-reader [data-bron-blad]', { timeout: 4000 });
      await page.waitForTimeout(250);
      const m = await bladMeting();
      info.bron = m;
      if (!m) throw new Error('blad niet open');
      if (m.r.x < -1 || m.r.y < -1 || m.r.x + m.r.w > w + 1 || m.r.y + m.r.h > h + 1) slecht.push(`«Звідки це?» buiten het scherm (${JSON.stringify(m.r)})`);
      if (m.bedekt) slecht.push('«Звідки це?»: de sluitknop is bedekt');
      if (m.belOver) slecht.push('«Звідки це?»: de meldingsbel ligt over het blad');
      if (!m.focusBinnen) slecht.push('«Звідки це?»: focus niet in het blad');
      if (!/^Kunt u dit tijdstip bevestigen vóór maandag 26 oktober$/.test(m.mark)) slecht.push(`gemarkeerd citaat: «${m.mark}»`);
      if (!/Знайдено дослівно в оригіналі|Letterlijk gevonden in het origineel/.test(m.controle) || !/не з перекладом|niet in een vertaling/.test(m.controle)) slecht.push(`controle: ${m.controle}`);
      // smal: van onderen over de volle breedte van het LEESVENSTER (in «rechts» is dat niet het hele scherm)
      if (smal && m.art && (Math.abs(m.r.x - m.art.x) > 1 || Math.abs(m.r.w - m.art.w) > 2)) slecht.push(`smal: blad niet over de volle breedte van het leesvenster (${JSON.stringify({ blad: m.r, venster: m.art })})`);
      const r = await axeOp(page, c.axe, ['.google-mail-reader [data-bron-blad]']);
      info.axeBron = r;
      if (r.v.length) slecht.push(`axe «Звідки це?»: ${r.v.map((x) => `${x.id}(${x.impact},${x.nodes})`).join(', ')}`);
      if (!nl) {
        await page.locator('.google-mail-reader [data-bron-blad] .bron-blad-vertaling button').first().click({ timeout: 4000 });
        await page.waitForSelector('.google-mail-reader [data-bron-blad] [data-bron-vertaling]', { timeout: 5000 });
        const v = await page.locator('.google-mail-reader [data-bron-blad] [data-bron-vertaling]').first().textContent();
        if (!/Пропоную провести опис стану/.test(v || '')) slecht.push(`vertaling van de alinea: ${v}`);
      }
      await page.screenshot({ path: join(c.uit, `${naam}-bron-${w}.png`) }).catch(() => undefined);
      await page.keyboard.press('Escape'); await page.waitForTimeout(350);
      const na = await page.evaluate(() => ({ blad: !!document.querySelector('[data-bron-blad]'), brief: !!document.querySelector('.google-mail-reader'), chip: !!document.activeElement?.hasAttribute('data-bron-chip') }));
      info.bronEsc = na;
      if (na.blad || !na.brief || !na.chip) slecht.push(`Escape bij «Звідки це?»: ${JSON.stringify(na)} (verwacht: blad dicht, brief open, focus op de chip)`);
      if ((await kader()).modus === 'telefoon') {
        await page.locator('.google-mail-reader [data-ai-blok] .ai-blok-punten [data-bron-chip]').first().click({ timeout: 4000 });
        await page.waitForSelector('.google-mail-reader [data-bron-blad]', { timeout: 4000 });
        await page.goBack({ timeout: 5000 }).catch(() => undefined); await page.waitForTimeout(600);
        const t = await page.evaluate(() => ({ blad: !!document.querySelector('[data-bron-blad]'), brief: !!document.querySelector('.google-mail-reader') }));
        info.bronTerug = t;
        if (t.blad || !t.brief) slecht.push(`«Назад» bij «Звідки це?»: ${JSON.stringify(t)} (verwacht: blad dicht, brief open)`);
      }
    });

    // ---- 4. «Показати абзац у листі»
    await stap('Показати абзац у листі', async () => {
      await page.locator('.google-mail-reader [data-ai-blok] .ai-blok-punten [data-bron-chip]').first().click({ timeout: 4000 });
      await page.waitForSelector('.google-mail-reader [data-bron-blad]', { timeout: 4000 });
      await page.locator('.google-mail-reader [data-bron-blad] [data-bron-toon]').first().click({ timeout: 4000 });
      await page.waitForTimeout(1700);
      const l = await page.evaluate(() => {
        const f = document.querySelector<HTMLIFrameElement>('.google-mail-reader .mail-thread-message.latest iframe'), d = f?.contentDocument;
        const el = d?.querySelector<HTMLElement>('[data-mail-bron-licht]'), fr = f?.getBoundingClientRect(), er = el?.getBoundingClientRect();
        const hl = (f?.contentWindow as unknown as { CSS?: { highlights?: Map<string, unknown> } } | null)?.CSS?.highlights;
        const y = fr && er ? Math.round(fr.top + er.top) : -1;
        const kleur = !!(d as (Document & { adoptedStyleSheets?: CSSStyleSheet[] }) | null | undefined)?.adoptedStyleSheets?.some((s) => [...s.cssRules].some((r) => r.cssText.includes('highlight(mail-bron)')));
        return { blad: !!document.querySelector('[data-bron-blad]'), licht: el?.textContent?.slice(0, 80) || '', omlijning: el?.style.outlineStyle || '', highlight: !!hl?.has('mail-bron'), kleur, y, inBeeld: y > 0 && y < innerHeight };
      });
      info.toon = l;
      if (l.blad) slecht.push('«Показати абзац у листі»: blad blijft open');
      if (!/Ik stel voor om de plaatsbeschrijving/.test(l.licht) || l.omlijning !== 'solid') slecht.push(`«Показати абзац у листі»: de alinea licht niet op (${JSON.stringify(l)})`);
      if (!l.inBeeld) slecht.push(`«Показати абзац у листі»: de alinea staat niet in beeld (y ${l.y})`);
      if (!l.highlight) slecht.push('«Показати абзац у листі»: geen CSS Custom Highlight van het citaat');
      if (l.highlight && !l.kleur) slecht.push('«Показати абзац у листі»: de markering heeft geen stijl in het iframe (onzichtbaar)');
      await page.screenshot({ path: join(c.uit, `${naam}-toon-${w}.png`) }).catch(() => undefined);
    });

    // ---- 5. «Пункт хибний — прибрати» en «Повернути»
    await stap('Пункт хибний', async () => {
      const voor = (await blok()).punten.length;
      await page.locator('.google-mail-reader [data-ai-blok] .ai-blok-punten [data-bron-chip]').nth(1).click({ timeout: 4000 });
      await page.waitForSelector('.google-mail-reader [data-bron-blad]', { timeout: 4000 });
      await page.locator('.google-mail-reader [data-bron-blad] [data-bron-weg]').first().click({ timeout: 4000 });
      await page.waitForTimeout(400);
      const na = await blok(), bewaard = await page.evaluate(() => { try { return localStorage.getItem('mail-ai-weg-v1') || ''; } catch { return ''; } });
      info.weg = { voor, na: na.punten.length, bewaard: bewaard.slice(0, 160) };
      if (na.punten.length !== voor - 1 || !/agc-t0/.test(bewaard)) slecht.push(`«Пункт хибний — прибрати»: ${voor} → ${na.punten.length}, bewaard «${bewaard.slice(0, 60)}»`);
      await page.locator(`.google-mail-reader [data-ai-blok] .ai-blok-voet button:has-text("${T('Повернути прибрані', 'Weggehaalde terugzetten')}")`).first().click({ timeout: 4000 });
      await page.waitForTimeout(300);
      if ((await blok()).punten.length !== voor) slecht.push('«Повернути прибрані» zette het punt niet terug');
    });

    // ---- 6. vertaalstrook: Переклад · Порівняти · Оригінал (niet als de site Nederlands is: dan is de brief al in de taal van de site)
    if (!nl) await stap('vertaalstrook', async () => {
      await page.locator('.google-mail-reader [data-vertaal-strook] label[data-modus="vertaling"]').first().click({ timeout: 4000 });
      await page.waitForFunction(() => /Пропоную провести опис стану/.test(document.querySelector<HTMLIFrameElement>('.google-mail-reader .mail-thread-message.latest iframe')?.contentDocument?.body?.innerText || ''), undefined, { timeout: 8000 });
      const v = await page.evaluate(() => ({ onderwerp: document.querySelector('.google-mail-reader .mail-thread-onderwerp-origineel')?.textContent || '', kop: document.querySelector('.google-mail-reader .mail-thread-toolbar h2, .google-mail-reader .mail-thread-toolbar h1')?.textContent || '' }));
      info.vertaling = v;
      if (!/Huurcontract Voorbeeldstraat 12/.test(v.onderwerp)) slecht.push(`onderwerp: «Оригінал: …» ontbreekt na «Переклад» (${JSON.stringify(v)})`);
      await page.screenshot({ path: join(c.uit, `${naam}-vertaling-${w}.png`) }).catch(() => undefined);
      await page.locator('.google-mail-reader [data-vertaal-strook] label[data-modus="vergelijk"]').first().click({ timeout: 4000 });
      await page.waitForSelector('.google-mail-reader [data-vergelijk-tabel]', { timeout: 5000 });
      await page.waitForFunction(() => !document.querySelector('.google-mail-reader [data-vergelijk-tabel] .vergelijk-wacht'), undefined, { timeout: 8000 });
      const t = await page.evaluate(() => {
        const tb = document.querySelector<HTMLElement>('.google-mail-reader [data-vergelijk-tabel]');
        const rijen = [...(tb?.querySelectorAll<HTMLElement>('tbody tr') || [])];
        const f = document.querySelector<HTMLIFrameElement>('.google-mail-reader .mail-thread-message.latest iframe');
        const td = tb?.querySelector('tbody td'), cap = tb?.querySelector('.vergelijk-kop')?.getBoundingClientRect(), tab = tb?.querySelector('table')?.getBoundingClientRect();
        return { rijen: rijen.length, bron: rijen.filter((r) => r.dataset.bron === 'ja').map((r) => `${r.dataset.alinea}:${(r.querySelector('.vergelijk-bron')?.textContent || '').trim()}`), leeg: (tb?.innerText.match(/не перекладено/g) || []).length, briefVerborgen: !f || f.getBoundingClientRect().height === 0 || !f.closest('.mail-message-html-body') || getComputedStyle(f.closest('.mail-message-html-body') as Element).display === 'none', tdDisplay: td ? getComputedStyle(td).display : '', overloop: tb ? tb.scrollWidth - tb.clientWidth : -1, kopBreedte: cap && tab && tab.width ? Math.round((cap.width / tab.width) * 100) : -1 };
      });
      info.vergelijk = t;
      if (t.rijen !== 5) slecht.push(`tabel: ${t.rijen} alinea's (verwacht 5)`);
      if (t.bron.join('|') !== '3:Джерело для 3 пунктів · знайдено дослівно|4:Джерело для 1 пункту · знайдено дослівно') slecht.push(`tabel: bronrijen ${t.bron.join(' | ')}`);
      if (t.leeg) slecht.push(`tabel: ${t.leeg} alinea's «не перекладено»`);
      if (!t.briefVerborgen) slecht.push('tabel: de brief staat er nog onder (dubbel)');
      if (smal && t.tdDisplay !== 'block') slecht.push(`smal: tabel niet onder elkaar (td ${t.tdDisplay})`);
      if (t.overloop > 1) slecht.push(`tabel schuift horizontaal (${t.overloop} px)`);
      if (t.kopBreedte < 80) slecht.push(`kop van de tabel is een smalle kolom (${t.kopBreedte} % van de tabel)`);
      const r = await axeOp(page, c.axe, ['.google-mail-reader [data-vergelijk-tabel]', '.google-mail-reader [data-vertaal-strook]']);
      info.axeVergelijk = r;
      if (r.v.length) slecht.push(`axe «Порівняти»: ${r.v.map((x) => `${x.id}(${x.impact},${x.nodes})`).join(', ')}`);
      await page.screenshot({ path: join(c.uit, `${naam}-vergelijk-${w}.png`) }).catch(() => undefined);
      await page.locator('.google-mail-reader [data-vertaal-strook] label[data-modus="origineel"]').first().click({ timeout: 4000 });
      await page.waitForTimeout(700);
      const o = await page.evaluate(() => { const f = document.querySelector<HTMLIFrameElement>('.google-mail-reader .mail-thread-message.latest iframe'); return { tabel: !!document.querySelector('[data-vergelijk-tabel]'), hoogte: f ? Math.round(f.getBoundingClientRect().height) : 0, tekst: (f?.contentDocument?.body?.innerText || '').slice(0, 60) }; });
      info.origineel = o;
      if (o.tabel || o.hoogte < 60 || !/Goedemorgen Pavlo/.test(o.tekst)) slecht.push(`«Оригінал»: ${JSON.stringify(o)} (verwacht: tabel weg, brief zichtbaar in het Nederlands)`);
    });

    // ---- 7. contextpaneel
    await stap('contextpaneel', async () => {
      let k = await kader();
      if (k.context === 'uit') { await page.locator('.google-mail-reader .mail-reader-context-knop').first().click({ timeout: 4000 }); await page.waitForTimeout(500); k = await kader(); }
      info.contextVorm = k.context;
      const tab = async (t: string) => { if ((await kader()).context !== 'blad') return; await page.locator(`.google-mail-reader .ctx-tabs [role="tab"]:has-text("${t}")`).first().click({ timeout: 4000 }); await page.waitForTimeout(300); };
      await tab(T('Завдання', 'Taken'));
      const ai = await page.evaluate(() => { const x = document.querySelector<HTMLElement>('.google-mail-reader [data-ctx-ai]'); return { er: !!x, opbouw: x?.dataset.opbouw || '', punten: [...(x?.querySelectorAll<HTMLElement>('li[data-ai-punt]') || [])].map((li) => (li.innerText || '').replace(/\s+/g, ' ').slice(0, 120)), kop: document.querySelector('.google-mail-reader .ctx-kop small')?.textContent || '' }; });
      info.ctxAi = ai;
      // knoppen van het paneel: 13 px (vroeger 16 px — «.mail-functional button{font:inherit}» won van «.ctx-knop»)
      // een gewone knop (niet «Порівняти» en niet de kleine knop van «Безпека»: die zijn bewust 12 px)
      const ctxKnop = await page.evaluate(() => { const k = document.querySelector<HTMLElement>('.google-mail-reader [data-context-paneel] .ctx-knop:not(.ctx-vergelijk):not(.ctx-knop-klein)'); return k ? getComputedStyle(k).fontSize : ''; });
      info.ctxKnop = ctxKnop;
      if (ctxKnop && ctxKnop !== '13px') slecht.push(`context: knoppen ${ctxKnop} (verwacht 13px)`);
      if (!ai.er || ai.opbouw !== 'model' || ai.punten.length !== 2) slecht.push(`context: punten van «Що від вас потрібно?» (${JSON.stringify(ai).slice(0, 240)})`);
      if (!/ШІ|AI/.test(ai.kop) || /без ШІ|zonder AI/.test(ai.kop)) slecht.push(`context: kop nog «без ШІ» terwijl er punten van een model staan (${ai.kop})`);
      await page.locator('.google-mail-reader [data-ctx-ai] [data-ai-taak]').first().click({ timeout: 4000 });
      await page.waitForSelector('.mail-reader-n10-backdrop', { timeout: 5000 });
      await page.waitForTimeout(700);
      const n10 = await page.evaluate(() => { const d = document.querySelector('.mail-reader-n10-backdrop'); return { titel: d?.querySelector<HTMLInputElement>('.mail-reader-n10-body input')?.value || '', notitie: d?.querySelector<HTMLTextAreaElement>('.mail-reader-n10-body textarea')?.value.slice(0, 200) || '' }; });
      info.n10 = n10;
      if (!/Підтвердити час опису стану/.test(n10.titel) || !/лист 3 · §3|bericht 3 · §3/.test(n10.notitie)) slecht.push(`«До завдань» uit het paneel: N10 niet ingevuld (${JSON.stringify(n10)})`);
      await page.keyboard.press('Escape'); await page.waitForTimeout(400);
      if (await page.locator('.mail-reader-n10-backdrop').count()) { await page.keyboard.press('Escape'); await page.waitForTimeout(300); }
      // «Порівняти» bij de versies
      if ((await kader()).context === 'uit') { await page.locator('.google-mail-reader .mail-reader-context-knop').first().click({ timeout: 4000 }); await page.waitForTimeout(400); }
      await tab(T('Вкладення', 'Bijlagen'));
      await page.locator('.google-mail-reader [data-versies-vergelijken]').first().click({ timeout: 4000 });
      await page.waitForSelector('[data-versie-vergelijk]', { timeout: 5000 });
      await page.waitForFunction(() => { const v = document.querySelector('[data-versie-vergelijk]'); return !!v && !!v.querySelector('ins, del'); }, undefined, { timeout: 15000 });
      const vv = await page.evaluate(() => { const v = document.querySelector<HTMLElement>('[data-versie-vergelijk]'); const venster = v?.querySelector<HTMLElement>('[role="dialog"]') || v; const r = venster?.getBoundingClientRect(); return { ins: [...(v?.querySelectorAll('ins') || [])].map((x) => x.textContent || '').join('|').slice(0, 200), del: [...(v?.querySelectorAll('del') || [])].map((x) => x.textContent || '').join('|').slice(0, 200), r: r ? { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) } : null, overloop: venster ? venster.scrollWidth - venster.clientWidth : -1 }; });
      info.versies = vv;
      if (!/875/.test(vv.ins) || !/850/.test(vv.del)) slecht.push(`«Порівняти версії»: verschil 850 → 875 niet getoond (${JSON.stringify(vv).slice(0, 240)})`);
      if (vv.r && (vv.r.x < -1 || vv.r.x + vv.r.w > w + 1)) slecht.push(`«Порівняти версії» buiten het scherm (${JSON.stringify(vv.r)})`);
      const r = await axeOp(page, c.axe, ['[data-versie-vergelijk]']);
      info.axeVersies = r;
      if (r.v.length) slecht.push(`axe «Порівняти версії»: ${r.v.map((x) => `${x.id}(${x.impact},${x.nodes})`).join(', ')}`);
      await page.screenshot({ path: join(c.uit, `${naam}-versies-${w}.png`) }).catch(() => undefined);
      const vorm0 = (await kader()).context;
      await page.keyboard.press('Escape'); await page.waitForTimeout(400);
      const na = await page.evaluate(() => ({ venster: !!document.querySelector('[data-versie-vergelijk]'), brief: !!document.querySelector('.google-mail-reader'), context: document.querySelector<HTMLElement>('.google-mail-reader')?.dataset.context || '', focus: !!document.activeElement?.hasAttribute('data-versies-vergelijken') }));
      info.versiesEsc = { ...na, vorm0 };
      if (na.venster || !na.brief || na.context !== vorm0 || !na.focus) slecht.push(`Escape bij «Порівняти версії»: ${JSON.stringify(na)} (verwacht: alleen het venster dicht, focus terug)`);
      // «Звідки це?» vanuit het paneel, dan «Показати абзац»: het contextblad gaat dicht
      await tab(T('Завдання', 'Taken'));
      await page.locator('.google-mail-reader [data-ctx-ai] [data-bron-chip]').first().click({ timeout: 4000 });
      await page.waitForSelector('.google-mail-reader [data-bron-blad]', { timeout: 4000 });
      const m = await bladMeting();
      info.bronUitPaneel = m;
      if (!m || m.bedekt) slecht.push('«Звідки це?» vanuit het paneel: niet open of bedekt (door het contextblad?)');
      await page.locator('.google-mail-reader [data-bron-blad] [data-bron-toon]').first().click({ timeout: 4000 });
      await page.waitForTimeout(1600);
      const k2 = await kader();
      info.naToonUitPaneel = k2;
      if (vorm0 === 'blad' && k2.context !== 'uit') slecht.push(`«Показати абзац» vanuit het contextblad: blad blijft open (${k2.context})`);
      if (vorm0 === 'kolom' && k2.context !== 'kolom') slecht.push(`«Показати абзац» vanuit de kolom: kolom ging dicht (${k2.context})`);
      if (!(await page.locator('.google-mail-reader').count())) slecht.push('«Показати абзац» vanuit het paneel sloot de BRIEF');
    });

    // ---- 8. «Чернетка відповіді» met ШІ en een hint
    await stap('antwoord', async () => {
      await page.locator('.google-mail-reader [data-ai-blok] [data-actie="concept"]').first().click({ timeout: 4000 });
      await page.waitForTimeout(1500);
      const concept = await page.evaluate(() => (document.querySelector<HTMLElement>('.google-mail-reader .mra-antwoord') as HTMLElement | null)?.innerText.replace(/\s+/g, ' ').slice(0, 300) || '');
      info.concept = concept;
      if (!/woensdag 28 oktober om 10:00 past mij/.test(concept)) slecht.push(`«Чернетка відповіді» (ШІ): geen concept in de antwoordregel (${concept.slice(0, 120)})`);
      // dubbelklik: de hint mag er maar één keer in staan — ook op de volgende maten, waar het bewaarde concept van de vorige maat terugkomt
      await page.locator('.google-mail-reader .mail-reply-hint').first().dblclick({ timeout: 4000 });
      await page.waitForTimeout(600);
      const veld = await page.evaluate(() => (document.querySelector<HTMLElement>('.google-mail-reader .mail-compose-editor [contenteditable="true"]') || document.querySelector<HTMLElement>('.google-mail-reader .mail-compose-editor'))?.innerText.slice(0, 600) || '');
      info.antwoordVeld = veld;
      const keer = (veld.match(/Ik breng mijn identiteitskaart mee/g) || []).length;
      info.hintKeer = keer;
      if (!keer) slecht.push(`hint niet in het antwoordveld (${veld.slice(0, 120)})`);
      else if (keer > 1) slecht.push(`hint ${keer} keer in het antwoordveld (dubbelklik of bewaard concept)`);
    });

    // ---- 9. «Вигляд → Мова листа: Перекладати»: de brief opnieuw openen → meteen vertaald (Oekraïens) of niets (site in het Nederlands)
    await stap('Мова листа', async () => {
      const wKnop = page.locator('.google-mail-reader .mail-reader-weergave > summary').first(), mKnop = page.locator('.google-mail-reader details.google-mail-reader-more > summary').first();
      if (await wKnop.isVisible().catch(() => false)) await wKnop.click({ timeout: 4000 });
      else if (await mKnop.isVisible().catch(() => false)) await mKnop.click({ timeout: 4000 });
      else await page.locator('.google-mail-reader .mail-reader-onderbalk [data-onderbalk-meer]').first().click({ timeout: 4000 });
      await page.waitForTimeout(300);
      await page.locator(`.google-mail-reader [data-weergave-taal] label:has-text("${T('Перекладати', 'Vertalen')}"):visible`).first().click({ timeout: 4000 });
      await page.waitForTimeout(300);
      const noot = await page.evaluate(() => ([...document.querySelectorAll<HTMLElement>('.google-mail-reader [data-weergave-taal] .lz-weergave-noot')].find((x) => x.offsetParent)?.innerText || ''));
      info.taalNoot = noot;
      if (!/ШІ-агенту «Claude»|AI-agent «Claude»/.test(noot)) slecht.push(`«Мова листа»: de noot zegt niet naar welke agent de tekst gaat (${noot.slice(0, 120)})`);
      await page.keyboard.press('Escape'); await page.waitForTimeout(300);
      const voor = aiLog.filter((x) => x.mode === 'translate').length;
      await page.evaluate(() => { const a = document.querySelector<HTMLElement>('.google-mail-reader'); if (a && !a.contains(document.activeElement)) a.focus(); });
      if (await page.locator('.google-mail-reader').count()) { await page.keyboard.press('Escape'); await page.waitForTimeout(600); }
      if (await page.locator('.google-mail-reader').count()) { await page.keyboard.press('Escape'); await page.waitForTimeout(600); }
      await openRij(page, 'agc-m0');
      await page.waitForTimeout(2200);
      // de uitkomst van de agent blijft voor deze sessie bij het gesprek: opnieuw geopend → meteen «ШІ», zonder nieuw verzoek
      const terug = await blok();
      info.modelNaHeropenen = { opbouw: terug.opbouw, acties: aiLog.filter((x) => x.mode === 'acties').length };
      if (terug.opbouw !== 'model' || aiLog.filter((x) => x.mode === 'acties').length !== 1) slecht.push(`opnieuw geopend: ${JSON.stringify(info.modelNaHeropenen)} (verwacht: «ШІ» uit het geheugen, geen tweede verzoek)`);
      const na = aiLog.filter((x) => x.mode === 'translate').length;
      const tekst = await page.evaluate(() => (document.querySelector<HTMLIFrameElement>('.google-mail-reader .mail-thread-message.latest iframe')?.contentDocument?.body?.innerText || '').slice(0, 200));
      const bewaard = await page.evaluate(() => { try { return localStorage.getItem('mail-lezer-weergave-v1') || ''; } catch { return ''; } });
      info.taalAuto = { voor, na, tekst: tekst.slice(0, 80), bewaard };
      if (!/"taal":"vertaling"/.test(bewaard)) slecht.push(`«Мова листа» niet bewaard (${bewaard})`);
      if (!nl && (na <= voor || !/Доброго ранку, Павле/.test(tekst))) slecht.push(`«Мова листа: Перекладати»: de anderstalige brief niet meteen vertaald (${JSON.stringify(info.taalAuto)})`);
      if (nl && na !== voor) slecht.push('«Мова листа: Перекладати»: een brief in de taal van de site werd toch naar de agent gestuurd');
      // terug naar het origineel (de keuze geldt per apparaat)
      await page.evaluate(() => { try { localStorage.removeItem('mail-lezer-weergave-v1'); } catch { /* */ } });
      if (!nl) { await page.locator('.google-mail-reader [data-vertaal-strook] label[data-modus="origineel"]').first().click({ timeout: 4000 }).catch(() => undefined); await page.waitForTimeout(500); }
    });

    // ---- 10. eindstand voor het knipsel: «Порівняти» open met de bronrijen (alleen in het Oekraïens: dan is de brief anderstalig)
    if (!nl) {
      await page.evaluate(() => document.querySelector('.google-mail-reader [data-vertaal-strook]')?.scrollIntoView({ block: 'start' }));
      await page.locator('.google-mail-reader [data-vertaal-strook] label[data-modus="vergelijk"]').first().click({ timeout: 4000 }).catch(() => undefined);
      await page.waitForTimeout(900);
    }
    await page.waitForTimeout(400);
    info.extern = [...new Set(extern)];
    if (extern.length) slecht.push(`de browser haalde zelf externe bronnen op: ${[...new Set(extern)].join(', ')}`);
    info.aiLogEind = [...aiLog];
    c.meting(naam, page, slecht.join(' · '), JSON.stringify({ vorm, w, h, ...info }));
  } finally {
    page.off('request', opVerzoek);
  }
};
