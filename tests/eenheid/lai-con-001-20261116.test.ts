// LAI-CON-001 (16.11.2026, рішення власника): «Він повинен бути доступний всім користувачам, але адміністратор сайту може його вимикати …
// адміністратор має вказати причину … з посиланням, який адміністратор вимкнув … ці опції мають бути доступні користувачу, але прозоро
// повідомляти про їхній стан і що їм необхідно зробити».
// Beleid «Lokale AI» (migratie 0287): standaard aan; uit alleen met een reden (≥ 10 tekens); de gebruiker ziet reden, wie en wat te doen.
//  1. server (zuiver): valideerBeleidInvoer, lokaleAiNa (reden verplicht, wie/wanneer blijft bij andere wijzigingen), beleidUitRij, lokaleAiBeleidVan
//  2. beheer-UI-model: lokaleAiRedenOk, beleidVelden (reden alleen als uit), normBeleid
//  3. site: filterBeleid, beheerderLink (alleen mailto voor een e-mailadres), filterLokaleAiAntwoord(BELEID_UIT), filterLokaleAiKeuze, paneel
//  4. extensie (echte background.js, nep-chrome): settings met lokaleAi uit → PING reden beleid-uit, LOKALE_AI → BELEID_UIT met reden en wie
// Geen netwerk, geen database.
import { cpSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { checker } from './hulp/nep-google';
import { BeleidFout, beleidUitRij, lokaleAiNa, valideerBeleidInvoer } from '../../backend/extensie-beleid';
import { STANDAARD_BELEID, lokaleAiBeleidVan, type ExtensieBeleid } from '../../shared/extensie-ontgrendeling';
import { beleidVelden, lokaleAiRedenOk, normBeleid, STANDAARD_BELEID as UI_STANDAARD } from '../../src/agenten/toegang/model';
import { LOKALE_AI_REDENEN, beheerderLink, beleidTekst, filterBeleid, filterLokaleAiAntwoord, filterLokaleAiKeuze } from '../../shared/lokale-ai-model';
import LokaleAiPaneel from '../../src/extensie/LokaleAiPaneel';

const EXT = join(process.cwd(), 'extension');
const ID = 'abcdefghijklmnopabcdefghijklmnop';
const BASIS = `chrome-extension://${ID}/`;
type Luisteraar = (m: unknown, s: unknown, r: (x: unknown) => void) => unknown;
const rust = (ms = 30) => new Promise((r) => setTimeout(r, ms));
const vraag = (f: Luisteraar, m: unknown, s: unknown) => new Promise<any>((klaar) => { const r = f(m, s, klaar); setTimeout(() => klaar('GEEN_ANTWOORD'), r === true ? 4000 : 300); });
const gooit = (f: () => unknown, veld: string) => { try { f(); return false; } catch (e) { return e instanceof BeleidFout && e.veld === veld; } };

export async function main(): Promise<number> {
  const { check, einde } = checker('lai-con-001-20261116');
  const REDEN = 'Pilot loopt nog; vraag eerst toegang aan bij de IT-afdeling';

  // ---------------------------------------------------------------- 1. server (zuiver)
  {
    check('standaard: lokale AI aan voor iedereen, zonder reden', STANDAARD_BELEID.lokaleAiAan === true && STANDAARD_BELEID.lokaleAiReden === '' && beleidUitRij(undefined).lokaleAiAan === true);
    check('oude rij (vóór 0287, zonder kolommen) → aan', beleidUitRij({ prive_aan: true }).lokaleAiAan === true && beleidUitRij({ prive_aan: true }).lokaleAiDoor === null);
    check('rij met lokale_ai_aan = false → uit met reden, wie en wanneer', (() => { const b = beleidUitRij({ lokale_ai_aan: false, lokale_ai_reden: REDEN, lokale_ai_door: 'admin@x.test', lokale_ai_op: '2026-11-16T09:00:00Z' }); return !b.lokaleAiAan && b.lokaleAiReden === REDEN && b.lokaleAiDoor === 'admin@x.test' && b.lokaleAiOp === Date.parse('2026-11-16T09:00:00Z'); })());
    const v = valideerBeleidInvoer({ lokaleAiAan: false, lokaleAiReden: `  ${REDEN}  `, userId: 'x' });
    check('invoer: lokaleAiAan + lokaleAiReden (getrimd) aanvaard, sessievelden genegeerd', v.lokaleAiAan === false && v.lokaleAiReden === REDEN && !('userId' in v));
    check('invoer: lokaleAiAan geen boolean → BeleidFout', gooit(() => valideerBeleidInvoer({ lokaleAiAan: 'nee' }), 'lokaleAiAan'));
    check('invoer: reden met stuurtekens of > 300 tekens → BeleidFout', gooit(() => valideerBeleidInvoer({ lokaleAiReden: 'a\u0000b' }), 'lokaleAiReden') && gooit(() => valideerBeleidInvoer({ lokaleAiReden: 'x'.repeat(301) }), 'lokaleAiReden'));
    check('invoer: tikfout «lokaleAiRedenen» wordt geweigerd, niet stil genegeerd', gooit(() => valideerBeleidInvoer({ lokaleAiRedenen: 'x' }), 'lokaleAiRedenen'));
    const aan: ExtensieBeleid = { ...STANDAARD_BELEID };
    check('uitzetten ZONDER reden → BeleidFout (de gebruiker moet weten waarom)', gooit(() => lokaleAiNa(aan, { ...aan, lokaleAiAan: false }, 'admin@x.test'), 'lokaleAiReden'));
    check('uitzetten met te korte reden (< 10 tekens, ook na trimmen) → BeleidFout', gooit(() => lokaleAiNa(aan, { ...aan, lokaleAiAan: false, lokaleAiReden: '  kort  ' }, 'a'), 'lokaleAiReden'));
    const uit = lokaleAiNa(aan, { ...aan, lokaleAiAan: false, lokaleAiReden: REDEN }, 'admin@x.test', 1000);
    check('uitzetten met reden: wie = deze beheerder, wanneer = nu', !uit.aan && uit.reden === REDEN && uit.door === 'admin@x.test' && uit.op === 1000);
    const voorUit: ExtensieBeleid = { ...aan, lokaleAiAan: false, lokaleAiReden: REDEN, lokaleAiDoor: 'eerste@x.test', lokaleAiOp: 1000 };
    const ander = lokaleAiNa(voorUit, { ...voorUit, priveMaxDagen: 5 }, 'tweede@x.test', 2000);
    check('andere wijziging van het beleid laat wie/wanneer van «uit» staan (naam bij de reden klopt)', ander.door === 'eerste@x.test' && ander.op === 1000);
    const nieuweReden = lokaleAiNa(voorUit, { ...voorUit, lokaleAiReden: `${REDEN} (tot 1 december)` }, 'tweede@x.test', 3000);
    check('reden gewijzigd → wie/wanneer = degene die hem wijzigde', nieuweReden.door === 'tweede@x.test' && nieuweReden.op === 3000);
    const weerAan = lokaleAiNa(voorUit, { ...voorUit, lokaleAiAan: true }, 'tweede@x.test');
    check('weer aan → reden, wie en wanneer leeg', weerAan.aan && weerAan.reden === '' && weerAan.door === null && weerAan.op === null);
    check('naar de extensie: aan = alleen {aan:true}; uit = reden + wie + wanneer (niets meer)',
      JSON.stringify(lokaleAiBeleidVan(aan)) === '{"aan":true,"reden":"","door":null,"op":null}'
      && JSON.stringify(lokaleAiBeleidVan(voorUit)) === JSON.stringify({ aan: false, reden: REDEN, door: 'eerste@x.test', op: 1000 }));
  }

  // ---------------------------------------------------------------- 2. beheer-UI-model
  {
    check('UI: standaard aan; uit zonder reden of met < 10 tekens → niet opslaan; met reden → wel',
      UI_STANDAARD.lokaleAiAan && lokaleAiRedenOk(UI_STANDAARD) && !lokaleAiRedenOk({ lokaleAiAan: false, lokaleAiReden: '' }) && !lokaleAiRedenOk({ lokaleAiAan: false, lokaleAiReden: '   123456789 ' }) && lokaleAiRedenOk({ lokaleAiAan: false, lokaleAiReden: REDEN }));
    const velden = beleidVelden({ ...UI_STANDAARD, lokaleAiAan: false, lokaleAiReden: ` ${REDEN} ` });
    check('UI → server: reden getrimd en alleen meegestuurd als uit', velden.lokaleAiAan === false && (velden as { lokaleAiReden?: string }).lokaleAiReden === REDEN && !('lokaleAiReden' in beleidVelden({ ...UI_STANDAARD, lokaleAiReden: 'oud' })));
    const n = normBeleid({ lokale_ai_aan: false, lokale_ai_reden: REDEN, lokale_ai_door: 'admin@x.test', lokale_ai_op: 5 });
    check('UI leest snake_case én camelCase van de server', !n.lokaleAiAan && n.lokaleAiReden === REDEN && n.lokaleAiDoor === 'admin@x.test' && n.lokaleAiOp === 5 && normBeleid({}).lokaleAiAan === true);
  }

  // ---------------------------------------------------------------- 3. site
  {
    check('filterBeleid: aan of zonder reden → null; uit → reden, wie, wanneer (begrensd)',
      filterBeleid({ aan: true, reden: 'x' }) === null && filterBeleid({ aan: false }) === null && JSON.stringify(filterBeleid({ aan: false, reden: 'r'.repeat(400), door: 'a@b.c', op: 7, extra: 1 })) === JSON.stringify({ reden: 'r'.repeat(300), door: 'a@b.c', op: 7 }));
    check('beheerderLink: alleen mailto voor een e-mailadres; nooit een vrije URL of javascript:',
      beheerderLink('admin@x.test') === 'mailto:admin@x.test' && beheerderLink('javascript:alert(1)') === null && beheerderLink('https://evil.test/') === null && beheerderLink(null) === null && beheerderLink('a b@c.d') === null);
    const [uk, nl] = beleidTekst({ reden: REDEN, door: 'admin@x.test', op: null });
    check('uitleg noemt wie, waarom en wat te doen (uk en nl) en dat het zijpaneel blijft werken',
      uk.includes('admin@x.test') && uk.includes(REDEN) && uk.includes('зверніться') && uk.includes('бічній панелі') && nl.includes('neem contact op') && nl.includes('zijpaneel'));
    const a = filterLokaleAiAntwoord({ ok: false, reason: 'BELEID_UIT', detail: REDEN, door: 'admin@x.test', op: 9, geheim: 'X' });
    check('antwoord BELEID_UIT → reden + beleid (reden, wie, wanneer), niets anders', JSON.stringify(a) === JSON.stringify({ ok: false, reden: 'BELEID_UIT', beleid: { reden: REDEN, door: 'admin@x.test', op: 9 } }) && LOKALE_AI_REDENEN.BELEID_UIT[0].length > 10);
    const k = filterLokaleAiKeuze({ aan: true, apis: ['summarizer'], siteToegang: true, beleid: { aan: false, reden: REDEN, door: 'admin@x.test', op: 9 } });
    check('status-keuze neemt beleid over (alleen als uit)', k?.beleid?.reden === REDEN && filterLokaleAiKeuze({ aan: true, apis: [], beleid: { aan: true } })?.beleid === undefined);
    const html = renderToStaticMarkup(createElement(LokaleAiPaneel, { tr: (u: string) => u, keuze: k, extVersie: '0.9.6', extId: ID }));
    check('paneel: blok «вимкнув адміністратор» met reden en mailto-link, géén formulier en géén «!»-schakelaar meer',
      html.includes('data-lai-site="beleid-uit"') && html.includes(REDEN) && html.includes('href="mailto:admin@x.test"') && !html.includes('data-lai-veld="modus"') && !html.includes('data-lai-actie="opties"'), html.slice(-1200));
    const zonder = renderToStaticMarkup(createElement(LokaleAiPaneel, { tr: (u: string) => u, keuze: { aan: true, apis: ['summarizer'], siteToegang: false }, extVersie: '0.9.6', extId: ID }));
    check('paneel zonder beleid: ongewijzigd («!»-schakelaar uitleg)', zonder.includes('data-lai-site="uit"') && !zonder.includes('beleid-uit'));
  }

  // ---------------------------------------------------------------- 3b. etap 2: browser_local_ai (connector) — zuivere delen
  {
    const { maakTicket, haalTicket } = await import('../../backend/apps-overdracht');
    const { LOKALE_AI_MODI, TOOL_TO_COMMAND } = await import('../../backend/connectors-hulpmiddelen');
    const ext = await import(pathToFileURL(join(EXT, 'shared.js')).href);
    const t1 = maakTicket('agent-browser', 'u1', 'lokale-ai', { tekst: 'GEHEIM' });
    check('ticket lokale-ai: de browser haalt het één keer op, daarna is het weg', JSON.stringify(haalTicket('agent-browser', t1, ['lokale-ai'])) === JSON.stringify({ soort: 'lokale-ai', payload: { tekst: 'GEHEIM' } }) && haalTicket('agent-browser', t1, ['lokale-ai']) === null);
    const t2 = maakTicket('agent-pc', 'u1', 'lokale-ai', { tekst: 'x' });
    check('een pc-agent krijgt nooit een lokale-ai-ticket (route geeft alleen bundel/geheim)', haalTicket('agent-pc', t2, ['bundel', 'geheim']) === null);
    const t3 = maakTicket('agent-browser', 'u1', 'geheim', { waarde: 'WACHTWOORD' });
    check('de browser krijgt nooit een geheim of bundel (route geeft alleen lokale-ai)', haalTicket('agent-browser', t3, ['lokale-ai']) === null);
    const t4 = maakTicket('agent-browser', 'u1', 'lokale-ai', { tekst: 'x' });
    check('ticket van een andere agent → null', haalTicket('agent-ander', t4, ['lokale-ai']) === null);
    // Review PR #137 (a): het resultaat blijft alleen in het geheugen, één keer op te halen, alleen van de verwachte agent.
    const { verwachtVluchtig, bewaarVluchtig, haalVluchtig } = await import('../../backend/apps-overdracht');
    const tv = 'v'.repeat(43);
    check('resultaat zonder verwachting → NIET vluchtig (gewoon pad, niets verborgen)', bewaarVluchtig(tv, 'agent-browser', { tekst: 'x' }) === false);
    verwachtVluchtig(tv, 'agent-browser');
    check('resultaat van een andere agent → niet bewaard', bewaarVluchtig(tv, 'agent-ander', { tekst: 'VALS' }) === false);
    check('resultaat van de verwachte agent → in het geheugen, één keer; tweede keer vullen geweigerd',
      bewaarVluchtig(tv, 'agent-browser', { tekst: 'VERTALING' }) === true && bewaarVluchtig(tv, 'agent-browser', { tekst: 'OVERSCHRIJVEN' }) === false
      && JSON.stringify(haalVluchtig(tv)) === '{"tekst":"VERTALING"}' && haalVluchtig(tv) === undefined);
    const { vergeetVluchtig } = await import('../../backend/apps-overdracht');
    const tw = 'w'.repeat(43);
    verwachtVluchtig(tw, 'agent-browser'); vergeetVluchtig(tw);
    check('opdracht mislukt → verwachting weg; een laat resultaat wordt niet meer bewaard', bewaarVluchtig(tw, 'agent-browser', { tekst: 'LAAT' }) === false && haalVluchtig(tw) === undefined);
    // Review PR #137 (b): «доступний всім» — ook in een eerder opgeslagen keuze van de browser staat browser.lokale_ai aan.
    const { enabledTypes, BROWSER_DEFAULT_ENABLED, BROWSER_DEFAULT_AUTO } = await import('../../backend/browser-mogelijkheden');
    check('standaardbeleid van de browser: browser.lokale_ai aan en zonder klik; oude opgeslagen keuze krijgt het er ook bij',
      BROWSER_DEFAULT_ENABLED.includes('browser.lokale_ai') && BROWSER_DEFAULT_AUTO.includes('browser.lokale_ai')
      && enabledTypes({ enabled: ['browser.snapshot'] }).includes('browser.lokale_ai') && enabledTypes(null).includes('browser.lokale_ai'));
    check('wie het type al kende (policy.kent) en wegliet, houdt het uit', !enabledTypes({ enabled: ['browser.snapshot'], kent: ['browser.snapshot', 'browser.lokale_ai'] }).includes('browser.lokale_ai'));
    check('hulpmiddel browser_local_ai → opdracht browser.lokale_ai; functies gelijk op server en in de extensie',
      TOOL_TO_COMMAND.browser_local_ai === 'browser.lokale_ai' && JSON.stringify([...LOKALE_AI_MODI]) === JSON.stringify([...ext.LOKALE_AI_MODI]) && ext.ALLOWED_COMMANDS.includes('browser.lokale_ai') && ext.TYPE_CAPABILITY['browser.lokale_ai'] === 'browser.read');
    check('extensie valideert: nooit de tekst in params, wel functie + ticket + talen',
      ext.valideerOpdracht('browser.lokale_ai', { modus: 'translator', ticket: 'a'.repeat(43), doel: 'nl', bron: 'uk', tekens: 5 }).ok === true
      && ext.valideerOpdracht('browser.lokale_ai', { modus: 'translator', ticket: 'a'.repeat(43), tekst: 'x' }).ok === false
      && ext.valideerOpdracht('browser.lokale_ai', { modus: 'translator', ticket: 'kort' }).ok === false
      && ext.valideerOpdracht('browser.lokale_ai', { modus: 'translator', ticket: 'a'.repeat(43), doel: '../x' }).ok === false);
  }

  // ---------------------------------------------------------------- 4. extensie (echte background.js)
  {
    const opslag: Record<string, unknown> = { lokaleAi: { aan: true, siteToegang: true, apis: {} } };
    const sessie: Record<string, unknown> = { settings_prive: { epoch: 3, caps: [], blocked: false, lokaleAi: { aan: false, reden: REDEN, door: 'admin@x.test', op: 9 } } };
    const intern: Luisteraar[] = []; const extern: Luisteraar[] = [];
    const ev = <T,>(l?: T[]) => ({ addListener: (f: T) => { l?.push(f); } });
    const leeg = (): any => new Proxy(function () { /* nep */ }, { get: (_t, k) => (k === 'then' ? undefined : leeg()), apply: () => Promise.resolve({}) });
    const offVragen: any[] = [];
    let open = false;
    const chrome = {
      runtime: {
        id: ID, getURL: (p: string) => `${BASIS}${p}`, getManifest: () => JSON.parse(readFileSync(join(EXT, 'manifest.json'), 'utf8')),
        onMessage: ev(intern), onMessageExternal: ev(extern), onInstalled: ev(), onStartup: ev(), openOptionsPage: async () => undefined,
        sendMessage: async (m: { doel?: string; op?: string }) => { if (m && m.doel === 'offscreen' && open) { offVragen.push(m); return m.op === 'lokale-ai-stand' ? { ok: true, aan: true, apis: { summarizer: 'available' } } : { ok: true, tekst: 'MAG-NIET', notities: [] }; } throw new Error('Receiving end does not exist.'); },
      },
      offscreen: { hasDocument: async () => open, createDocument: async () => { open = true; }, closeDocument: async () => { open = false; } },
      storage: {
        local: { get: async (k: string | string[]) => { const ks = Array.isArray(k) ? k : [k]; return Object.fromEntries(ks.filter((x) => x in opslag).map((x) => [x, opslag[x]])); }, set: async (o: Record<string, unknown>) => { Object.assign(opslag, o); }, remove: async () => undefined },
        session: { get: async (k: string | string[]) => { const ks = Array.isArray(k) ? k : [k]; return Object.fromEntries(ks.filter((x) => x in sessie).map((x) => [x, sessie[x]])); }, set: async (o: Record<string, unknown>) => { Object.assign(sessie, o); }, remove: async () => undefined, setAccessLevel: async () => undefined },
        onChanged: ev(),
      },
      alarms: { create: () => undefined, clear: async () => undefined, onAlarm: ev() },
      tabs: { query: async () => [], get: async () => null, sendMessage: async () => { throw new Error('Receiving end does not exist.'); }, create: async () => undefined, onRemoved: ev(), onUpdated: ev(), onActivated: ev() },
      scripting: { executeScript: async () => [] },
      permissions: { contains: async () => false, request: async () => false, remove: async () => true, onAdded: ev(), onRemoved: ev() },
      debugger: leeg(), sidePanel: leeg(), windows: leeg(), webRequest: leeg(), action: leeg(),
    };
    (globalThis as any).chrome = new Proxy(chrome as Record<string, unknown>, { get: (t, k) => (k in t ? t[k as string] : leeg()) });
    (globalThis as any).WebSocket = class { static OPEN = 1; readyState = 0; close() { /* nep */ } send() { /* nep */ } addEventListener() { /* nep */ } };
    const map = mkdtempSync(join(tmpdir(), 'mr-ext-laicon-'));
    cpSync(EXT, map, { recursive: true });
    await import(pathToFileURL(join(map, 'background.js')).href);
    const f = intern[0]; const fx = extern[0];
    const site = { origin: 'https://mail.tarasevych.com', url: 'https://mail.tarasevych.com/', tab: { id: 9, url: 'https://mail.tarasevych.com/' } };
    const opties = { id: ID, url: `${BASIS}options.html`, origin: BASIS.slice(0, -1), tab: { id: 7, url: `${BASIS}options.html` } };
    check('background.js geladen', typeof f === 'function' && typeof fx === 'function');
    await rust(150);
    const ping = await vraag(fx, { type: 'PING' }, site);
    check('PING: reden = beleid-uit met reden, wie en wanneer (gaat vóór siteToegang en de stand)',
      ping?.lokaleAi?.reden === 'beleid-uit' && JSON.stringify(ping.lokaleAi.beleid) === JSON.stringify({ reden: REDEN, door: 'admin@x.test', op: 9 }) && !('redenen' in ping.lokaleAi), JSON.stringify(ping?.lokaleAi));
    const r = await vraag(fx, { type: 'LOKALE_AI', modus: 'summarizer', tekst: 'hallo' }, site);
    check('LOKALE_AI van de site → BELEID_UIT met reden en wie; niets naar offscreen', r?.ok === false && r.reason === 'BELEID_UIT' && r.detail === REDEN && r.door === 'admin@x.test' && !offVragen.some((m) => m.op === 'lokale-ai-voer'), JSON.stringify(r));
    const st = await vraag(f, { op: 'status' }, opties);
    check('status (eigen pagina\'s): lokaleAi.beleid = uit met reden (het zijpaneel kan het tonen)', st?.lokaleAi?.beleid?.aan === false && st.lokaleAi.beleid.reden === REDEN, JSON.stringify(st?.lokaleAi));
    check('manifest 0.9.7', JSON.parse(readFileSync(join(EXT, 'manifest.json'), 'utf8')).version === '0.9.7');
  }
  return einde();
}
