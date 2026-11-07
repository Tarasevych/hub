// EXT090-001 (06.11.2026, verzoek van de eigenaar): «offscreen.html також має підтримуватися в нас на сайті та в наступному оновленні розширення».
// De ingebouwde AI van Chrome (LanguageModel, Summarizer, …) bestaat alleen in vensters, niet in de service worker. 0.9.1:
//  1. manifest 0.9.2: recht «offscreen»; offscreen.html laadt lokale-ai.js en offscreen.js (geen inline script, CSP script-src 'self').
//  2. offscreen.js (echte code, met de echte lokale-ai.js): antwoordt alleen de eigen service worker; de stand meet ALLEEN
//     availability(); een aanvraag van een pagina downloadt nooit een model, ook niet met «!» autoDownload (oude fout hersteld).
//  3. background.js (echte code, nep-chrome): meet alleen als de hoofdschakelaar aan staat, hoogstens eens per 5 minuten, filtert
//     het antwoord en zet de stand in de status (lokaleAi.stand); site-aanvragen (LOKALE_AI) alleen met «!» siteToegang.
//  0.9.2 neemt offscreen.html/offscreen.js en het site-contract over van de lokale 0.9.1 van de eigenaar (thread «розширення»).
//  4. site: kiesStand — de meting van de extensie gaat vóór die van de pagina; het blok toont «Chrome (у розширенні)».
// Geen netwerk, geen database.
import { cpSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createContext, runInContext } from 'node:vm';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { checker } from './hulp/nep-google';
import { LOKALE_AI_REDENEN, filterLokaleAiAntwoord, filterLokaleAiKeuze, kiesStand, laiRegel } from '../../shared/lokale-ai-model';
import { filterPubliek } from '../../src/extensie/extensie-live';
import LokaleAiPaneel from '../../src/extensie/LokaleAiPaneel';

const EXT = join(process.cwd(), 'extension');
const ID = 'abcdefghijklmnopabcdefghijklmnop';
const BASIS = `chrome-extension://${ID}/`;
type Luisteraar = (m: unknown, s: unknown, r: (x: unknown) => void) => unknown;
const rust = (ms = 30) => new Promise((r) => setTimeout(r, ms));
async function tot(f: () => boolean, ms = 3000) { const eind = Date.now() + ms; while (Date.now() < eind) { if (f()) return true; await rust(20); } return f(); }
const vraag = (f: Luisteraar, m: unknown, s: unknown) => new Promise<any>((klaar) => { const r = f(m, s, klaar); if (r !== true) setTimeout(() => klaar('GEEN_ANTWOORD'), 300); else setTimeout(() => klaar('GEEN_ANTWOORD'), 4000); });

export async function main(): Promise<number> {
  const { check, einde } = checker('extensie-offscreen-20261106');

  // ---------------------------------------------------------------- 1. manifest en offscreen.html
  {
    const m = JSON.parse(readFileSync(join(EXT, 'manifest.json'), 'utf8'));
    const html = readFileSync(join(EXT, 'offscreen.html'), 'utf8');
    check('manifest 0.9.2: recht «offscreen» (hasDocument sinds Chrome 116 = minimum_chrome_version), zonder debugger',
      m.version === '0.9.2' && m.permissions.includes('offscreen') && !m.permissions.includes('debugger') && m.minimum_chrome_version === '116');
    const scripts = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)];
    check('offscreen.html: lokale-ai.js vóór offscreen.js, geen inline code (CSP)', scripts.length === 2 && /src="lokale-ai\.js"/.test(scripts[0][1]) && /src="offscreen\.js"/.test(scripts[1][1]) && scripts.every((x) => x[2].trim() === ''));
  }

  // ---------------------------------------------------------------- 2. offscreen.js met de echte lokale-ai.js
  {
    const aangeroepen: string[] = [];
    const api = (naam: string, antwoord: unknown, gooi = false) => ({
      availability: async () => { aangeroepen.push(`${naam}.availability`); if (gooi) throw new Error('GEHEIME-FOUTTEKST'); return antwoord; },
      create: async () => { aangeroepen.push(`${naam}.create`); return { summarize: async () => 'x', destroy: () => undefined }; },
    });
    const luisteraars: Luisteraar[] = [];
    // «!» autoDownload staat AAN in de opslag: een aanvraag van een pagina mag toch nooit downloaden.
    const opslag = { lokaleAi: { aan: true, autoDownload: true, siteToegang: true } };
    const ctx = createContext({
      chrome: { runtime: { id: ID, onMessage: { addListener: (f: Luisteraar) => { luisteraars.push(f); } } }, storage: { local: { get: async () => opslag, set: async () => undefined }, onChanged: { addListener: () => undefined } } },
      LanguageModel: api('LanguageModel', 'available'), Summarizer: api('Summarizer', 'downloadable'), Rewriter: api('Rewriter', 'iets-raars'),
      Translator: api('Translator', 'readily'), LanguageDetector: api('LanguageDetector', null, true), Proofreader: api('Proofreader', 'downloading'),
      setTimeout, clearTimeout, console, AbortController, DOMException,
    });
    runInContext(readFileSync(join(EXT, 'lokale-ai.js'), 'utf8'), ctx);
    runInContext(readFileSync(join(EXT, 'offscreen.js'), 'utf8'), ctx);
    const f = luisteraars[0];
    check('offscreen.js registreert één berichtluisteraar', luisteraars.length === 1 && typeof f === 'function');
    const vreemd = await vraag(f, { doel: 'offscreen', op: 'lokale-ai-stand' }, { id: 'andere-extensie' });
    const vanTab = await vraag(f, { doel: 'offscreen', op: 'lokale-ai-stand' }, { id: ID, tab: { id: 3 } });
    check('alleen de eigen service worker: andere extensie of een tabblad krijgt geen antwoord, niets gemeten', vreemd === 'GEEN_ANTWOORD' && vanTab === 'GEEN_ANTWOORD' && aangeroepen.length === 0);
    check('berichten voor background.js (geen doel «offscreen») laat het document liggen', (await vraag(f, { op: 'status' }, { id: ID })) === 'GEEN_ANTWOORD');
    const r = await vraag(f, { doel: 'offscreen', op: 'lokale-ai-stand' }, { id: ID });
    check('lokale-ai-stand: stand per API (oude «readily» → available, onbekend → unavailable, gooit → fout, ontbreekt → ontbreekt)',
      r?.ok === true && r.aan === true && JSON.stringify(Object.keys(r.apis).sort()) === JSON.stringify(['detector', 'prompt', 'proofreader', 'rewriter', 'summarizer', 'translator', 'writer'])
      && r.apis.prompt === 'available' && r.apis.summarizer === 'downloadable' && r.apis.writer === 'ontbreekt' && r.apis.rewriter === 'unavailable' && r.apis.translator === 'available' && r.apis.detector === 'fout' && r.apis.proofreader === 'downloading', JSON.stringify(r));
    check('lokale-ai-stand: NOOIT create()', !aangeroepen.some((x) => x.endsWith('.create')), aangeroepen.join(' | '));
    const v = await vraag(f, { doel: 'offscreen', op: 'lokale-ai-voer', id: 'a1', modus: 'summarizer', tekst: 'Een korte tekst om samen te vatten.', limietMs: 5000 }, { id: ID });
    check('oude fout hersteld: site-aanvraag met «!» autoDownload aan start toch GEEN download (MODEL_NIET_GELADEN, geen create())',
      v?.ok === false && v.reason === 'MODEL_NIET_GELADEN' && !aangeroepen.includes('Summarizer.create'), JSON.stringify(v));
  }

  // ---------------------------------------------------------------- 3. background.js met nep-chrome en nep-offscreen
  {
    const opslag: Record<string, unknown> = { lokaleAi: { aan: true, apis: { prompt: true, summarizer: true, writer: false } } };
    const intern: Luisteraar[] = []; const extern: Luisteraar[] = []; const opslagLuister: Array<(w: unknown, g: string) => unknown> = [];
    const ev = <T,>(l?: T[]) => ({ addListener: (f: T) => { l?.push(f); } });
    const leeg = (): any => new Proxy(function () { /* nep */ }, { get: (_t, k) => (k === 'then' ? undefined : leeg()), apply: () => Promise.resolve({}) });
    const off = { open: false, gemaakt: [] as any[], gesloten: 0, gevraagd: [] as any[] };
    let offAntwoord: unknown = { ok: true, aan: true, apis: { prompt: 'available', summarizer: 'GEHEIME-FOUT', writer: 'uit', vreemd: 'available', translator: 'downloadable', detector: 'stil' } };
    const chrome = {
      runtime: {
        id: ID, getURL: (p: string) => `${BASIS}${p}`, getManifest: () => JSON.parse(readFileSync(join(EXT, 'manifest.json'), 'utf8')),
        onMessage: ev(intern), onMessageExternal: ev(extern), onInstalled: ev(), onStartup: ev(), openOptionsPage: async () => undefined,
        sendMessage: async (m: { doel?: string; op?: string }) => { if (m && m.doel === 'offscreen' && off.open) { off.gevraagd.push(m); return m.op === 'lokale-ai-stand' ? offAntwoord : { ok: true, tekst: 'LOKAAL-RESULTAAT', notities: [] }; } throw new Error('Could not establish connection. Receiving end does not exist.'); },
      },
      offscreen: {
        hasDocument: async () => off.open,
        createDocument: async (o: unknown) => { if (off.open) throw new Error('Only a single offscreen document may be created.'); off.gemaakt.push(o); off.open = true; },
        closeDocument: async () => { if (!off.open) throw new Error('No current offscreen document.'); off.open = false; off.gesloten++; },
      },
      storage: {
        local: { get: async (k: string | string[]) => { const ks = Array.isArray(k) ? k : [k]; return Object.fromEntries(ks.filter((x) => x in opslag).map((x) => [x, opslag[x]])); }, set: async (o: Record<string, unknown>) => { Object.assign(opslag, o); }, remove: async () => undefined },
        session: { get: async () => ({}), set: async () => undefined, remove: async () => undefined, setAccessLevel: async () => undefined }, onChanged: ev(opslagLuister),
      },
      alarms: { create: () => undefined, clear: async () => undefined, onAlarm: ev() },
      tabs: { query: async () => [], get: async () => null, sendMessage: async () => { throw new Error('Receiving end does not exist.'); }, create: async () => undefined, onRemoved: ev(), onUpdated: ev(), onActivated: ev() },
      scripting: { executeScript: async () => [] },
      permissions: { contains: async () => false, request: async () => false, remove: async () => true, onAdded: ev(), onRemoved: ev() },
      debugger: leeg(), sidePanel: leeg(), windows: leeg(), webRequest: leeg(), action: leeg(),
    };
    (globalThis as any).chrome = new Proxy(chrome as Record<string, unknown>, { get: (t, k) => (k in t ? t[k as string] : leeg()) });
    (globalThis as any).WebSocket = class { static OPEN = 1; readyState = 0; close() { /* nep */ } send() { /* nep */ } addEventListener() { /* nep */ } };
    const map = mkdtempSync(join(tmpdir(), 'mr-ext-offscreen-'));
    cpSync(EXT, map, { recursive: true });
    await import(pathToFileURL(join(map, 'background.js')).href);
    const f = intern[0]; const fx = extern[0];
    const opties = { id: ID, url: `${BASIS}options.html`, origin: BASIS.slice(0, -1), tab: { id: 7, url: `${BASIS}options.html` } };
    const site = { origin: 'https://mcp.tarasevych.com', url: 'https://mcp.tarasevych.com/agents', tab: { id: 9, url: 'https://mcp.tarasevych.com/agents' } };
    check('background.js geladen', typeof f === 'function' && typeof fx === 'function');

    await tot(() => off.gevraagd.length >= 1, 3000); await rust(60);
    const st = await vraag(f, { op: 'status' }, opties);
    check('offscreen.html geopend met de juiste url, reden WORKERS en een Nederlandse uitleg (geen Engelse tekst)',
      off.gemaakt.length === 1 && off.gemaakt[0].url === 'offscreen.html' && JSON.stringify(off.gemaakt[0].reasons) === '["WORKERS"]' && /Ingebouwde AI van Chrome/.test(off.gemaakt[0].justification), JSON.stringify(off.gemaakt));
    check('status: lokaleAi.stand = gefilterde meting (onbekende API, onbekende stand en «uit» weg; geen fouttekst); siteToegang standaard uit',
      JSON.stringify(st?.lokaleAi) === '{"aan":true,"apis":["prompt","summarizer","rewriter","translator","detector","proofreader"],"siteToegang":false,"stand":{"prompt":"available","translator":"downloadable","detector":"stil"}}' && !JSON.stringify(st).includes('GEHEIME'), JSON.stringify(st?.lokaleAi));
    await vraag(f, { op: 'status' }, opties); await rust(60);
    check('binnen 5 minuten geen nieuwe meting (geen offscreen-vraag per statusvraag)', off.gemaakt.length === 1 && off.gevraagd.length === 1);

    // Site (externally_connectable): standaard uit, dan PING meldt het; met «!» siteToegang aan gaat de aanvraag naar offscreen.
    const ping = await vraag(fx, { type: 'PING' }, site);
    check('PING: lokaleAi met het contract {ondersteund:true, siteToegang:false} én de publieke keuzes (niet overschreven)',
      ping?.lokaleAi?.ondersteund === true && ping.lokaleAi.siteToegang === false && ping.lokaleAi.aan === true && Array.isArray(ping.lokaleAi.apis), JSON.stringify(ping?.lokaleAi));
    const geweigerd = await vraag(fx, { type: 'LOKALE_AI', modus: 'summarizer', tekst: 'hallo' }, site);
    check('LOKALE_AI zonder «!» siteToegang → SITE_TOEGANG_UIT, niets naar offscreen', geweigerd?.ok === false && geweigerd.reason === 'SITE_TOEGANG_UIT' && off.gevraagd.length === 1);
    const vreemd = await vraag(fx, { type: 'LOKALE_AI_STAND' }, { origin: 'https://example.com', url: 'https://example.com/' });
    check('vreemde site → ORIGIN', vreemd?.ok === false && vreemd.reason === 'ORIGIN');
    opslag.lokaleAi = { aan: true, siteToegang: true, apis: {} };
    for (const l of opslagLuister) l({ lokaleAi: { newValue: opslag.lokaleAi } }, 'local');
    const ok = await vraag(fx, { type: 'LOKALE_AI', modus: 'summarizer', tekst: 'hallo' }, site);
    const vorm = off.gevraagd.find((m) => m.op === 'lokale-ai-voer');
    check('met «!» siteToegang: aanvraag via offscreen (doel = adres, talen apart), resultaat terug',
      ok?.ok === true && ok.tekst === 'LOKAAL-RESULTAAT' && vorm && vorm.doel === 'offscreen' && vorm.modus === 'summarizer' && vorm.tekst === 'hallo', JSON.stringify({ ok, vorm }));
    const lang = await vraag(fx, { type: 'LOKALE_AI', modus: 'summarizer', tekst: 'x'.repeat(20001) }, site);
    check('te lange tekst → TE_LANG', lang?.ok === false && lang.reason === 'TE_LANG');
    const st2 = await vraag(f, { op: 'status' }, opties);
    check('status meldt siteToegang aan (de site toont dan het proefformulier)', st2?.lokaleAi?.siteToegang === true);

    // Hoofdschakelaar uit → geen nieuwe meting en geen stand in de status.
    const voor = off.gevraagd.length;
    opslag.lokaleAi = { aan: false, apis: {} };
    for (const l of opslagLuister) l({ lokaleAi: { newValue: opslag.lokaleAi } }, 'local');
    const uit = await vraag(f, { op: 'status' }, opties); await rust(60);
    check('hoofdschakelaar uit: geen meting en geen stand in de status', off.gevraagd.length === voor && uit?.lokaleAi?.aan === false && !('stand' in (uit?.lokaleAi ?? {})), JSON.stringify(uit?.lokaleAi));

    // Weer aan na een wijziging → meteen opnieuw meten; geen bruikbaar antwoord → geen stand (de site meet dan zelf).
    offAntwoord = undefined;
    const standVoor = off.gevraagd.filter((m) => m.op === 'lokale-ai-stand').length;
    opslag.lokaleAi = { aan: true, apis: {} };
    for (const l of opslagLuister) l({ lokaleAi: { newValue: opslag.lokaleAi } }, 'local');
    await vraag(f, { op: 'status' }, opties);
    await tot(() => off.gevraagd.filter((m) => m.op === 'lokale-ai-stand').length > standVoor, 3000); await rust(60);
    const st3 = await vraag(f, { op: 'status' }, opties);
    check('na wijziging opnieuw gemeten; geen bruikbaar antwoord → geen stand', off.gevraagd.filter((m) => m.op === 'lokale-ai-stand').length === standVoor + 1 && !('stand' in (st3?.lokaleAi ?? {})), JSON.stringify(st3?.lokaleAi));
  }

  // ---------------------------------------------------------------- 4. site: de meting van de extensie gaat voor
  {
    const k = filterLokaleAiKeuze({ aan: true, apis: ['prompt', 'writer'], stand: { prompt: 'available', writer: 'stil', summarizer: 'rm -rf', vreemd: 'available' } });
    check('site-filter: stand alleen met bekende API\'s en standen', JSON.stringify(k) === '{"aan":true,"apis":["prompt","writer"],"stand":{"prompt":"available","writer":"stil"}}', JSON.stringify(k));
    check('filterPubliek neemt lokaleAi.stand over', JSON.stringify(filterPubliek({ versie: '0.9.1', lokaleAi: { aan: true, apis: [], stand: { detector: 'fout' } } })?.lokaleAi) === '{"aan":true,"apis":[],"stand":{"detector":"fout"}}');
    const pagina = { prompt: 'ontbreekt', summarizer: 'available', writer: 'ontbreekt', rewriter: 'ontbreekt', translator: 'ontbreekt', detector: 'ontbreekt', proofreader: 'ontbreekt' } as const;
    check('kiesStand: extensie gaat voor de pagina (Prompt API bestaat in Chrome soms alleen voor extensies); anders de pagina; anders null',
      JSON.stringify(kiesStand('prompt', pagina, k)) === '{"stand":"available","bron":"extensie"}' && JSON.stringify(kiesStand('summarizer', pagina, k)) === '{"stand":"available","bron":"pagina"}' && kiesStand('summarizer', null, k) === null);
    const rStil = laiRegel('writer', 'stil', k, '0.9.1', () => false, 'extensie');
    check('stand «stil» → let op, met verwijzing naar chrome://on-device-internals en «у розширенні»', rStil.stand === 'let-op' && rStil.uk.includes('chrome://on-device-internals') && rStil.uk.startsWith('Chrome (у розширенні)') && rStil.nl.startsWith('Chrome (in de extensie)'));
    const html = renderToStaticMarkup(createElement(LokaleAiPaneel, { tr: (uk: string) => uk, keuze: { aan: true, apis: ['prompt', 'summarizer', 'writer', 'rewriter', 'translator', 'detector', 'proofreader'], stand: { prompt: 'available', summarizer: 'available', writer: 'downloadable', rewriter: 'unavailable', translator: 'available', detector: 'available', proofreader: 'ontbreekt' } }, extVersie: '0.9.1' }));
    check('blok rendert meteen met de meting van de extensie (geen «Перевіряємо…»), bron per regel, telling 4 van 7',
      !html.includes('Перевіряємо') && (html.match(/data-lai-bron="extensie"/g) ?? []).length === 7 && html.includes('Готово до роботи: 4 з 7') && html.includes('Chrome (у розширенні): модель готова'), html.slice(0, 400));
  }

  // ---------------------------------------------------------------- 5. site: gebruik door pagina's van de site («!» siteToegang)
  {
    const ext = 'abcdefghijklmnopabcdefghijklmnop';
    const alles = ['prompt', 'summarizer', 'writer', 'rewriter', 'translator', 'detector', 'proofreader'] as const;
    const oud = renderToStaticMarkup(createElement(LokaleAiPaneel, { tr: (uk: string) => uk, keuze: { aan: true, apis: [...alles] }, extVersie: '0.9.1', extId: ext }));
    check('extensie zonder siteToegang-veld (ouder dan 0.9.2): geen sectie, geen knop', !oud.includes('data-lai-site') && !/<button/.test(oud));
    const uit = renderToStaticMarkup(createElement(LokaleAiPaneel, { tr: (uk: string) => uk, keuze: { aan: true, apis: [...alles], siteToegang: false }, extVersie: '0.9.2', extId: ext }));
    check('siteToegang uit: «!»-waarschuwing met gevolgen (GPU/RAM, 20/min, geen download) en knop naar de instellingen van de extensie met uitleg',
      uit.includes('data-lai-site="uit"') && uit.includes('! Використання сторінками сайту: вимкнено') && uit.includes('GPU/RAM') && uit.includes('data-lai-actie="opties"') && /title="[^"]*сайт сам його змінити не може/.test(uit) && !uit.includes('data-lai-veld'));
    const aan = renderToStaticMarkup(createElement(LokaleAiPaneel, { tr: (uk: string) => uk, keuze: { aan: true, apis: ['summarizer', 'translator'], siteToegang: true }, extVersie: '0.9.2', extId: ext }));
    check('siteToegang aan: formulier (functie met alleen ingeschakelde API\'s, tekst ≤ 20000, knop «Виконати на цьому пристрої» met uitleg) en een aria-live uitkomst',
      aan.includes('data-lai-site="aan"') && aan.includes('data-lai-veld="modus"') && (aan.match(/<option /g) ?? []).length === 2 && /maxLength="20000"|maxlength="20000"/.test(aan)
      && aan.includes('Виконати на цьому пристрої') && /data-lai-actie="uitvoeren"[^>]*disabled=""|disabled=""[^>]*data-lai-actie="uitvoeren"/.test(aan) && /role="status" aria-live="polite" data-lai-uitkomst/.test(aan), aan.slice(-1500));
    const goed = filterLokaleAiAntwoord({ ok: true, tekst: 'Samenvatting', notities: ['en → uk', 5], correcties: [], geheim: 'X' });
    check('antwoord ok: alleen tekst, notities (tekst) en correcties', JSON.stringify(goed) === '{"ok":true,"tekst":"Samenvatting","notities":["en → uk"],"correcties":[]}');
    const redenen = ['UIT', 'SITE_TOEGANG_UIT', 'MODUS', 'LEEG', 'TE_LANG', 'TE_VEEL', 'BEZIG', 'MODEL_NIET_GELADEN', 'NIET_BESCHIKBAAR', 'AbortError', 'OFFSCREEN_ONTBREEKT'];
    check('alle redenen uit het contract van de extensie hebben uitleg in uk en nl', redenen.every((r) => filterLokaleAiAntwoord({ ok: false, reason: r }).ok === false && (filterLokaleAiAntwoord({ ok: false, reason: r }) as { reden: string }).reden === r && LOKALE_AI_REDENEN[r][0].length > 5 && LOKALE_AI_REDENEN[r][1].length > 5));
    check('onbekende reden/detail → FOUT (geen ruwe fouttekst naar de pagina); geen antwoord → GEEN_ANTWOORD',
      JSON.stringify(filterLokaleAiAntwoord({ ok: false, reason: '<script>', detail: 'pad C:\\geheim' })) === '{"ok":false,"reden":"FOUT"}' && JSON.stringify(filterLokaleAiAntwoord(null)) === '{"ok":false,"reden":"GEEN_ANTWOORD"}');
  }
  return einde();
}
