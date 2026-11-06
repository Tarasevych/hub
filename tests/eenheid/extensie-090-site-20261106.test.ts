// EXT090-001 (06.11.2026): site-kant van extensie 0.9.0.
//  1. Na bijwerken/herladen van de extensie hangt soms nog een VERWEESDE brug van de oude versie op de pagina die «niet gekoppeld»
//     meldt; de site negeert berichten met een lagere versie dan ze op deze pagina al zag (sessie valt niet weg, geen F5).
//  2. De publieke status draagt 'lokaleAi' (keuzes voor de ingebouwde AI van Chrome): alleen {aan, apis} met bekende namen.
//  3. Blok «Вбудований ШІ Chrome»: per API wat Chrome op de pagina meldt (availability(), nooit create()) en wat de extensie mag.
//  4. Het gedeelde model op de site gebruikt dezelfde namen en vlaggen als extension/lokale-ai.js.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { checker } from './hulp/nep-google';
import { filterPubliek, lokaalBericht, maakExtensieLive } from '../../src/extensie/extensie-live';
import { LOKALE_AI_APIS, LOKALE_AI_INFO, filterLokaleAiKeuze, laiRegel, meetPagina } from '../../shared/lokale-ai-model';
import { vergelijkVersie } from '../../shared/extensie-update';
import LokaleAiPaneel from '../../src/extensie/LokaleAiPaneel';

const ORIGIN = 'https://mcp.tarasevych.com';
const rust = (ms = 5) => new Promise((r) => setTimeout(r, ms));
const ouder = (a: string, b: string) => vergelijkVersie(a, b) < 0;

export async function main(): Promise<number> {
  const { check, einde } = checker('extensie-090-site-20261106');

  // ---------------------------------------------------------------- 1. verweesde brug van de oude versie
  {
    const berichten: Array<(e: { source: unknown; origin: string; data: unknown }) => void> = [];
    const venster = { addEventListener: (_t: string, f: (typeof berichten)[number]) => { berichten.push(f); }, removeEventListener: () => undefined, postMessage: () => undefined };
    const doc = { hidden: false, addEventListener: () => undefined, removeEventListener: () => undefined };
    let klok = 1_000;
    const s = maakExtensieLive({ haal: async () => ({ agenten: [], nu: klok }), venster, document: doc, origin: ORIGIN, nu: () => klok, pollen: false, setTimeout: () => 0, clearTimeout: () => undefined });
    const uit = s.subscribe(() => undefined);
    await rust();
    const stuur = (data: Record<string, unknown>) => { klok += 10; for (const f of [...berichten]) f({ source: venster, origin: ORIGIN, data: { mrExt: true, ...data } }); };
    const slotJa = { gekoppeld: true, verbonden: true, staat: 'vergrendeld' };
    stuur({ type: 'hello', version: '0.9.0', versie: '0.9.0', prive: slotJa, gekoppeld: true, verbonden: true, staat: 'vergrendeld' });
    check('nieuwe brug 0.9.0: gekoppeld', s.get().lokaal?.versie === '0.9.0' && s.get().lokaal?.prive?.gekoppeld === true, JSON.stringify(s.get().lokaal));
    stuur({ type: 'hello', version: '0.8.1', versie: '0.8.1', prive: { gekoppeld: false, verbonden: false, staat: 'niet-gekoppeld' }, gekoppeld: false, verbonden: false, staat: 'niet-gekoppeld' });
    check('verweesde brug 0.8.1 meldt «niet gekoppeld»: genegeerd — de site houdt 0.9.0 en de koppeling (geen F5, sessie blijft)',
      s.get().lokaal?.versie === '0.9.0' && s.get().lokaal?.prive?.gekoppeld === true && s.get().lokaal?.gekoppeld === true, JSON.stringify(s.get().lokaal));
    stuur({ type: 'status', versie: '0.9.0', prive: { ...slotJa, staat: 'ontgrendeld' }, staat: 'ontgrendeld' });
    check('zelfde versie blijft gewoon bijwerken', s.get().lokaal?.prive?.staat === 'ontgrendeld');
    stuur({ type: 'status', versie: '0.9.1', prive: slotJa, staat: 'vergrendeld' });
    check('hogere versie (volgende update) neemt het over', s.get().lokaal?.versie === '0.9.1' && s.get().lokaal?.staat === 'vergrendeld');
    uit();
  }

  // ---------------------------------------------------------------- 2. lokaleAi in de publieke status
  {
    const p = filterPubliek({ versie: '0.9.0', lokaleAi: { aan: true, apis: ['prompt', 'translator', 'rm -rf', 'prompt', 7], tekst: 'GEHEIM', uitvoer: 'GEHEIM' } });
    check('lokaleAi: alleen {aan, apis} met bekende API-namen, ontdubbeld; geen tekst of uitvoer', JSON.stringify(p?.lokaleAi) === '{"aan":true,"apis":["prompt","translator"]}' && !JSON.stringify(p).includes('GEHEIM'), JSON.stringify(p));
    check('lokaleAi: verkeerd type → null; ontbreekt (oude extensie) → veld afwezig',
      filterPubliek({ lokaleAi: 'aan' })?.lokaleAi === null && !('lokaleAi' in (filterPubliek({ versie: '0.8.1' }) ?? {})) && filterLokaleAiKeuze({ aan: 'ja' })?.aan === false);
    const b = lokaalBericht({ source: 1, origin: ORIGIN, data: { mrExt: true, type: 'status', lokaleAi: { aan: false, apis: [] } } }, 1, ORIGIN);
    check('lokaalBericht neemt lokaleAi over', JSON.stringify(b?.publiek.lokaleAi) === '{"aan":false,"apis":[]}');
  }

  // ---------------------------------------------------------------- 3. regels per API (zuiver)
  {
    const alles = { aan: true, apis: [...LOKALE_AI_APIS] };
    const r1 = laiRegel('summarizer', 'available', alles, '0.9.0', ouder);
    check('available + aan in de extensie → groen', r1.stand === 'ja' && /готова/.test(r1.uk) && /ввімкнено/.test(r1.uk));
    check('nooit groen als Chrome «downloadable» zegt (download alleen na klik in de extensie)', laiRegel('summarizer', 'downloadable', alles, '0.9.0', ouder).stand === 'let-op');
    check('nooit groen als de extensie de functie uitzette', laiRegel('writer', 'available', { aan: true, apis: ['prompt'] }, '0.9.0', ouder).stand === 'nee');
    check('hoofdschakelaar uit → rood met die reden', /головний перемикач/.test(laiRegel('prompt', 'available', { aan: false, apis: [...LOKALE_AI_APIS] }, '0.9.0', ouder).uk));
    const oud = laiRegel('prompt', 'available', null, '0.8.1', ouder);
    check('extensie 0.8.1 → «оновіть до 0.9.0» (niet groen)', oud.stand === 'let-op' && /0\.9\.0/.test(oud.uk) && /0\.9\.0/.test(oud.nl));
    const geen = laiRegel('translator', 'ontbreekt', alles, '', ouder);
    check('API ontbreekt in Chrome → rood met de juiste chrome://flags-vlag', geen.stand === 'nee' && geen.uk.includes('chrome://flags/#translation-api') && geen.nl.includes('chrome://flags/#translation-api'));
  }

  // ---------------------------------------------------------------- 4. meten op de pagina: alleen availability(), nooit create()
  {
    const aangeroepen: string[] = [];
    const nep = (naam: string, antwoord: unknown, gooi = false) => ({
      availability: async (o?: unknown) => { aangeroepen.push(`${naam}.availability(${JSON.stringify(o ?? null)})`); if (gooi) throw new Error('x'); return antwoord; },
      create: async () => { aangeroepen.push(`${naam}.create`); return {}; },
    });
    const g = { LanguageModel: nep('LanguageModel', 'available'), Summarizer: nep('Summarizer', 'downloadable'), Translator: nep('Translator', 'available'), LanguageDetector: nep('LanguageDetector', 'iets-raars'), Proofreader: nep('Proofreader', null, true) };
    const m = await meetPagina(g as unknown as Record<string, unknown>, 200);
    check('meetPagina: standen per API (ontbreekt/onbekend/fout veilig ingedeeld)',
      m.prompt === 'available' && m.summarizer === 'downloadable' && m.writer === 'ontbreekt' && m.rewriter === 'ontbreekt' && m.translator === 'available' && m.detector === 'fout' && m.proofreader === 'fout', JSON.stringify(m));
    check('meetPagina: NOOIT create() (geen download van gigabytes zonder klik); Translator met talenpaar en→uk',
      !aangeroepen.some((x) => x.endsWith('.create')) && aangeroepen.includes('Translator.availability({"sourceLanguage":"en","targetLanguage":"uk"})'), aangeroepen.join(' | '));
    const traag = { LanguageModel: { availability: () => new Promise(() => undefined) } };
    const t0 = Date.now(); const mt = await meetPagina(traag as unknown as Record<string, unknown>, 50);
    check('meetPagina: een API die nooit antwoordt houdt het blok niet vast (tijdslimiet → fout)', mt.prompt === 'fout' && Date.now() - t0 < 1000);
  }

  // ---------------------------------------------------------------- 5. blok in «Розширення браузера» (render)
  {
    const tr = (uk: string) => uk;
    const html = renderToStaticMarkup(createElement(LokaleAiPaneel, { tr, keuze: { aan: true, apis: ['prompt'] }, extVersie: '0.9.0' }));
    check('blok: titel, uitleg «текст не залишає пристрій», status-regel met aria-live, details met alle 7 API\'s',
      html.includes('Вбудований ШІ Chrome') && html.includes('Текст не залишає пристрій') && /role="status"[^>]*aria-live="polite"/.test(html)
      && LOKALE_AI_APIS.every((a) => html.includes(`data-lai-api="${a}"`)) && html.includes('<details'), html.slice(0, 300));
    check('blok: geen knop die iets downloadt of start (alleen informatie)', !/<button/.test(html));
    const tab = readFileSync(join(process.cwd(), 'src', 'agenten', 'TabExtensie.tsx'), 'utf8');
    check('TabExtensie toont het blok met de keuzes, versie en extensie-id uit de live status', /<LokaleAiPaneel tr=\{tr\} keuze=\{live\.extensie\?\.lokaleAi \?\? null\} extVersie=\{live\.extensie\?\.versie \?\? ''\} extId=\{live\.extensie\?\.extensieId \?\? ''\} \/>/.test(tab));
  }

  // ---------------------------------------------------------------- 6. spiegel met extension/lokale-ai.js
  {
    const g: Record<string, unknown> = {};
    runInNewContext(readFileSync(join(process.cwd(), 'extension', 'lokale-ai.js'), 'utf8'), { globalThis: g, chrome: {}, Object, Array, String, Number, JSON, Math, Promise, Error, Set, Map, setTimeout, clearTimeout });
    const L = g.MR_LOKALE_AI as { API: Record<string, { glob: string; vlag: string; proef: boolean }>; API_IDS: string[] } | undefined;
    check('extension/lokale-ai.js laadt (classic script) en exporteert MR_LOKALE_AI', !!L && Array.isArray(L.API_IDS));
    check('zelfde API-lijst, globale namen, chrome://flags-vlaggen en proef-markering als de site',
      !!L && JSON.stringify(L.API_IDS) === JSON.stringify(LOKALE_AI_APIS) && LOKALE_AI_APIS.every((a) => L.API[a].glob === LOKALE_AI_INFO[a].glob && L.API[a].vlag === LOKALE_AI_INFO[a].vlag && L.API[a].proef === LOKALE_AI_INFO[a].proef));
  }
  return einde();
}
