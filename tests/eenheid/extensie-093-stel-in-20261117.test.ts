// LOKAI-001 (17.11.2026): перевірка налаштування вбудованого ШІ Chrome 157 (версія 0.9.3), захищеного протоколу
// LOKALE_AI_STEL_IN, рекомендацій під задачу, генератора flags.json, прямої підтримки uk/nl у Gemma 4, embedder, decisions та UI сайту.
import { cpSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createContext, runInContext } from 'node:vm';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { checker } from './hulp/nep-google';
import {
  LOKALE_AI_PRESETS,
  bouwAanbevolenFlagsJson,
  filterLokaleAiPatch,
  stelVoorNaarTaak,
} from '../../shared/lokale-ai-model';
import LokaleAiPaneel from '../../src/extensie/LokaleAiPaneel';

const EXT = join(process.cwd(), 'extension');
const ID = 'abcdefghijklmnopabcdefghijklmnop';
const BASIS = `chrome-extension://${ID}/`;
type Luisteraar = (m: unknown, s: unknown, r: (x: unknown) => void) => unknown;
const vraag = (f: Luisteraar, m: unknown, s: unknown) =>
  new Promise<any>((klaar) => {
    const r = f(m, s, klaar);
    if (r !== true) setTimeout(() => klaar('GEEN_ANTWOORD'), 300);
    else setTimeout(() => klaar('GEEN_ANTWOORD'), 4000);
  });

export async function main(): Promise<number> {
  const { check, einde } = checker('extensie-093-stel-in-20261117');

  // ---------------------------------------------------------------- 1. фільтр патчу (filterLokaleAiPatch)
  {
    const f1 = filterLokaleAiPatch(
      {
        aan: true,
        apis: { prompt: true, summarizer: true, onbekendApi: true },
        prompt: { samplingMode: 'most-predictable', toolUse: true, taal: 'uk' },
        summarizer: { preference: 'speed', type: 'tldr' },
        decisions: { schema: '{"type":"object"}' },
        siteToegang: true,
        tabTekst: true,
        multimodaal: true,
        autoDownload: true,
      },
      { bevestigGevaar: false },
    );
    check(
      'filterLokaleAiPatch без bevestigGevaar: безпечні поля проходять, усі «!»-поля відхиляються',
      f1.patch.aan === true
        && f1.patch.prompt?.samplingMode === 'most-predictable'
        && f1.patch.prompt?.toolUse === true
        && f1.patch.prompt?.taal === 'uk'
        && f1.patch.summarizer?.preference === 'speed'
        && f1.patch.decisions?.schema === '{"type":"object"}'
        && !('siteToegang' in f1.patch)
        && !('tabTekst' in f1.patch)
        && !('multimodaal' in f1.patch)
        && !('autoDownload' in f1.patch)
        && JSON.stringify(f1.geweigerdeGevaarVelden) === '["siteToegang","tabTekst","multimodaal","autoDownload"]',
      JSON.stringify(f1),
    );

    const f2 = filterLokaleAiPatch(
      {
        siteToegang: true,
        multimodaal: true,
        prompt: { samplingMode: 'nevidomyi', taal: 'xx' },
        summarizer: { preference: 'ultra' },
      },
      { bevestigGevaar: true },
    );
    check(
      'filterLokaleAiPatch із bevestigGevaar: «!»-поля проходять, недійсні переліки відкидаються',
      f2.patch.siteToegang === true
        && f2.patch.multimodaal === true
        && !f2.patch.prompt
        && !f2.patch.summarizer
        && f2.geweigerdeGevaarVelden.length === 0,
      JSON.stringify(f2),
    );
  }

  // ---------------------------------------------------------------- 2. рекомендації під задачу та flags.json
  {
    const a1 = stelVoorNaarTaak('швидкий стислий виклад і значеннєвий пошук з класифікацією рішень', 'uk');
    check(
      'stelVoorNaarTaak: розпізнає стислий виклад, embedder і decisions із CPU-попередженням',
      a1.veilig.apis && !Array.isArray(a1.veilig.apis)
        && a1.veilig.apis.summarizer === true
        && a1.veilig.apis.embedder === true
        && a1.veilig.apis.decisions === true
        && a1.veilig.summarizer?.preference === 'speed'
        && a1.vlaggen.includes('semantic-embedder-api')
        && a1.vlaggen.includes('decisions-api')
        && a1.waarschuwingen.length >= 1,
      JSON.stringify(a1),
    );

    const a2 = stelVoorNaarTaak('голосовий ввід, аудіо, зображення, інструменти webmcp і читання активної вкладки', 'uk');
    check(
      'stelVoorNaarTaak: для голосу/зображень/вкладки пропонує multimodaal, siteToegang, tabTekst у gevaar і toolUse у veilig',
      a2.veilig.prompt?.toolUse === true
        && a2.gevaar.multimodaal === true
        && a2.gevaar.siteToegang === true
        && a2.gevaar.tabTekst === true
        && a2.vlaggen.includes('prompt-api-multimodal-input')
        && a2.vlaggen.includes('web-speech-on-device-small-expert-model')
        && a2.vlaggen.includes('enable-webmcp-testing'),
      JSON.stringify(a2),
    );

    const flagsZonder = JSON.parse(bouwAanbevolenFlagsJson());
    const flagsMet = JSON.parse(bouwAanbevolenFlagsJson({ metDecisions: true }));
    check(
      'bouwAanbevolenFlagsJson: без data-sharing, містить Gemma 4, а decisions-api@1 лише за явного прапорця',
      Array.isArray(flagsZonder.enabled_flags)
        && flagsZonder.enabled_flags.includes('gemma4-for-built-in-ai@1')
        && flagsZonder.enabled_flags.includes('semantic-embedder-api@1')
        && flagsZonder.enabled_flags.includes('enable-webmcp-testing@1')
        && !flagsZonder.enabled_flags.some((x: string) => x.includes('data-sharing'))
        && !flagsZonder.enabled_flags.includes('decisions-api@1')
        && flagsMet.enabled_flags.includes('decisions-api@1'),
      JSON.stringify({ flagsZonder, flagsMet }),
    );
  }

  // ---------------------------------------------------------------- 3. background.js (LOKALE_AI_STEL_IN)
  {
    const opslag: Record<string, unknown> = {
      lokaleAi: { aan: true, siteToegang: false, multimodaal: false, apis: { prompt: true } },
    };
    const intern: Luisteraar[] = [];
    const extern: Luisteraar[] = [];
    const ev = <T,>(l?: T[]) => ({ addListener: (f: T) => { l?.push(f); } });
    const leeg = (): any => new Proxy(function () { /* заглушка */ }, { get: (_t, k) => (k === 'then' ? undefined : leeg()), apply: () => Promise.resolve({}) });
    const chrome = {
      runtime: {
        id: ID,
        getURL: (p: string) => `${BASIS}${p}`,
        getManifest: () => JSON.parse(readFileSync(join(EXT, 'manifest.json'), 'utf8')),
        onMessage: ev(intern),
        onMessageExternal: ev(extern),
        onInstalled: ev(),
        onStartup: ev(),
        openOptionsPage: async () => undefined,
        sendMessage: async () => { throw new Error('Receiving end does not exist.'); },
      },
      offscreen: { hasDocument: async () => false, createDocument: async () => undefined, closeDocument: async () => undefined },
      storage: {
        local: {
          get: async (k: string | string[]) => {
            const ks = Array.isArray(k) ? k : [k];
            return Object.fromEntries(ks.filter((x) => x in opslag).map((x) => [x, opslag[x]]));
          },
          set: async (o: Record<string, unknown>) => { Object.assign(opslag, o); },
          remove: async () => undefined,
        },
        session: { get: async () => ({}), set: async () => undefined, remove: async () => undefined, setAccessLevel: async () => undefined },
        onChanged: ev(),
      },
      alarms: { create: () => undefined, clear: async () => undefined, onAlarm: ev() },
      tabs: { query: async () => [], get: async () => null, sendMessage: async () => undefined, create: async () => undefined, onRemoved: ev(), onUpdated: ev(), onActivated: ev() },
      scripting: { executeScript: async () => [] },
      permissions: { contains: async () => false, request: async () => false, remove: async () => true, onAdded: ev(), onRemoved: ev() },
      debugger: leeg(), sidePanel: leeg(), windows: leeg(), webRequest: leeg(), action: leeg(),
    };
    (globalThis as any).chrome = new Proxy(chrome as Record<string, unknown>, { get: (t, k) => (k in t ? t[k as string] : leeg()) });
    (globalThis as any).WebSocket = class { static OPEN = 1; readyState = 0; close() {} send() {} addEventListener() {} };
    const map = mkdtempSync(join(tmpdir(), 'mr-ext-093-'));
    cpSync(EXT, map, { recursive: true });
    await import(`${pathToFileURL(join(map, 'background.js')).href}?v=${Date.now()}`);
    const fx = extern[0];
    const site = { origin: 'https://mcp.tarasevych.com', url: 'https://mcp.tarasevych.com/agents', tab: { id: 9, url: 'https://mcp.tarasevych.com/agents' } };

    const rOrigin = await vraag(fx, { type: 'LOKALE_AI_STEL_IN', patch: { aan: true } }, { origin: 'https://example.com', url: 'https://example.com/' });
    check('LOKALE_AI_STEL_IN: стороння адреса відхилена (ORIGIN)', rOrigin?.ok === false && rOrigin.reason === 'ORIGIN', JSON.stringify(rOrigin));

    const rGevaarAlleen = await vraag(fx, { type: 'LOKALE_AI_STEL_IN', patch: { siteToegang: true, autoDownload: true } }, site);
    check(
      'LOKALE_AI_STEL_IN: спроба ввімкнути «!» без bevestigGevaar → BEVESTIGING_NODIG, стан не змінено',
      rGevaarAlleen?.ok === false
        && rGevaarAlleen.reason === 'BEVESTIGING_NODIG'
        && JSON.stringify(rGevaarAlleen.geweigerdeGevaarVelden) === '["siteToegang","autoDownload"]'
        && (opslag.lokaleAi as any).siteToegang === false,
      JSON.stringify(rGevaarAlleen),
    );

    const rGemengd = await vraag(
      fx,
      {
        type: 'LOKALE_AI_STEL_IN',
        patch: {
          apis: { summarizer: true, embedder: true },
          summarizer: { preference: 'capability' },
          prompt: { samplingMode: 'most-creative', toolUse: true },
          siteToegang: true,
        },
        bevestigGevaar: false,
      },
      site,
    );
    check(
      'LOKALE_AI_STEL_IN: безпечний патч застосовується частково, «!» лишається заблокованим',
      rGemengd?.ok === true
        && rGemengd.lokaleAi?.apis?.includes('embedder')
        && rGemengd.lokaleAi?.instellingen?.summarizerPreference === 'capability'
        && rGemengd.lokaleAi?.instellingen?.promptSamplingMode === 'most-creative'
        && rGemengd.lokaleAi?.instellingen?.promptToolUse === true
        && (opslag.lokaleAi as any).siteToegang === false
        && JSON.stringify(rGemengd.geweigerdeGevaarVelden) === '["siteToegang"]',
      JSON.stringify(rGemengd),
    );

    const rBevestigd = await vraag(
      fx,
      { type: 'LOKALE_AI_STEL_IN', patch: { siteToegang: true, multimodaal: true }, bevestigGevaar: true },
      site,
    );
    check(
      'LOKALE_AI_STEL_IN: із bevestigGevaar: true вмикає «!»-дозволи та оновлює lokaleAi',
      rBevestigd?.ok === true
        && (opslag.lokaleAi as any).siteToegang === true
        && (opslag.lokaleAi as any).multimodaal === true
        && rBevestigd.lokaleAi?.siteToegang === true
        && rBevestigd.lokaleAi?.gevaar?.multimodaal === true,
      JSON.stringify(rBevestigd),
    );
  }

  // ---------------------------------------------------------------- 4. lokale-ai.js (Gemma 4 uk/nl напряму, embedder, decisions, pasPatchToe)
  {
    let translatorAangeroepen = 0;
    const sumOpts: any[] = [];
    const ctx = createContext({
      chrome: {},
      LanguageDetector: {
        availability: async () => 'available',
        create: async () => ({ detect: async () => [{ detectedLanguage: 'uk', confidence: 0.99 }] }),
      },
      Translator: {
        availability: async () => { translatorAangeroepen++; return 'available'; },
        create: async () => { translatorAangeroepen++; return { translate: async (s: string) => s }; },
      },
      Summarizer: {
        availability: async () => 'available',
        create: async (opts: any) => {
          sumOpts.push(opts);
          return { summarize: async (t: string) => `ПІДСУМОК:${t}`, destroy: () => undefined };
        },
      },
      SemanticEmbedder: {
        availability: async () => 'available',
        create: async () => ({
          embed: async (s: string) => (s.includes('А') ? [1, 0, 0] : [0, 1, 0]),
        }),
      },
      DecisionModel: {
        availability: async () => 'available',
        create: async () => ({
          decide: async () => ({ categorie: 'support', zekerheid: 0.92 }),
        }),
      },
      Object, Array, String, Number, JSON, Math, Promise, Error, Set, Map, Intl, DOMException, setTimeout, clearTimeout,
    });
    runInContext(readFileSync(join(EXT, 'lokale-ai.js'), 'utf8'), ctx);
    const L = ctx.MR_LOKALE_AI;

    const p1 = L.pasPatchToe(L.STANDAARD, { apis: { embedder: true }, siteToegang: true }, { bevestigGevaar: false });
    check(
      'pasPatchToe: «!»-поле не змінюється без bevestigGevaar',
      p1.nieuwCfg.siteToegang === false && JSON.stringify(p1.geweigerdeGevaarVelden) === '["siteToegang"]',
      JSON.stringify(p1),
    );

    const cfg = L.opschonen({
      aan: true,
      apis: { summarizer: true, detector: true, translator: true, embedder: true, decisions: true },
      summarizer: { preference: 'speed', taal: 'en' },
      vertaalInvoer: true,
      vertaalUitvoer: true,
    });

    const resSum = await L.voer('summarizer', 'Текст українською мовою для прямої обробки в Gemma 4.', cfg);
    check(
      'Gemma 4: українська мова підтримується напряму без Translator і передає preference',
      translatorAangeroepen === 0
        && resSum.tekst.startsWith('ПІДСУМОК:')
        && sumOpts[0]?.outputLanguage === 'uk'
        && sumOpts[0]?.preference === 'speed'
        && resSum.notities.some((n: string) => /пряма мова моделі: uk/.test(n)),
      JSON.stringify({ translatorAangeroepen, resSum, sumOpts }),
    );

    const resEmbSingle = await L.voer('embedder', 'Один фрагмент А', cfg);
    const resEmbPair = await L.voer('embedder', 'Фрагмент А\n---\nФрагмент Б', cfg);
    check(
      'SemanticEmbedder: рахує вектор одного фрагмента і косинусну подібність для пари через ---',
      resEmbSingle.tekst.includes('3 вимірів') && resEmbPair.tekst.includes('0.0%') && resEmbPair.tekst.includes('cos = 0.0000'),
      JSON.stringify({ resEmbSingle, resEmbPair }),
    );

    const resDec = await L.voer('decisions', 'Запит щодо налаштування', cfg);
    check(
      'DecisionModel: повертає JSON-рішення та примітку про режим CPU',
      resDec.tekst.includes('"categorie": "support"') && resDec.notities.some((n: string) => /CPU/.test(n)),
      JSON.stringify(resDec),
    );
  }

  // ---------------------------------------------------------------- 5. LokaleAiPaneel.tsx (версія 0.9.3 vs 0.9.2)
  {
    const tr = (uk: string) => uk;
    const html093 = renderToStaticMarkup(
      createElement(LokaleAiPaneel, {
        tr,
        keuze: { aan: true, apis: ['prompt', 'summarizer', 'embedder'], siteToegang: false, gevaar: { siteToegang: false } },
        extVersie: '0.9.3',
        extId: ID,
      }),
    );
    check(
      'LokaleAiPaneel 0.9.3: показує помічника, усі 6 пресетів, безпечну кнопку, окреме «!»-підтвердження та генератор flags.json',
      html093.includes('data-lai-assistent="1"')
        && LOKALE_AI_PRESETS.every((p) => html093.includes(`data-lai-preset="${p.id}"`))
        && html093.includes('data-lai-actie="stel-veilig"')
        && html093.includes('data-lai-gevaar-bevestig="1"')
        && html093.includes('data-lai-actie="bevestig-gevaar"')
        && html093.includes('data-lai-vlaggen="1"')
        && html093.includes('data-lai-actie="kopieer-flags"')
        && html093.includes('data-lai-actie="download-flags"'),
    );

    const html093SiteAan = renderToStaticMarkup(
      createElement(LokaleAiPaneel, {
        tr,
        keuze: { aan: true, apis: ['prompt', 'summarizer'], siteToegang: true, gevaar: { siteToegang: true } },
        extVersie: '0.9.3',
        extId: ID,
      }),
    );
    check(
      'LokaleAiPaneel 0.9.3 зі вже ввімкненим siteToegang: зайвої кнопки підтвердження для цієї задачі немає',
      html093SiteAan.includes('data-lai-assistent="1"') && !html093SiteAan.includes('data-lai-gevaar-bevestig="1"'),
    );

    const html092 = renderToStaticMarkup(
      createElement(LokaleAiPaneel, {
        tr,
        keuze: { aan: true, apis: ['prompt'], siteToegang: false },
        extVersie: '0.9.2',
        extId: ID,
      }),
    );
    check(
      'LokaleAiPaneel 0.9.2: блок помічника 0.9.3 не показується старому розширенню',
      !html092.includes('data-lai-assistent="1"'),
    );
  }

  return einde();
}
