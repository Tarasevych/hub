// TELEGRAM-AANMELDEN v1 — HTTP-routes. Drie soorten, elk zichtbaar gemarkeerd (tests/eenheid/telegram-routes.test.ts):
//   OPENBAAR      — vóór de sessie (aanmeldscherm, widget, webhook); elk heeft zijn eigen sleutel (geheim, handtekening, kop).
//   ALLEEN_SESSIE — eigen gegevens lezen of iets starten dat zelf nog niets toekent.
//   BEWAAKT       — alles wat iets verandert: loopt door poort() (beleid-poort.ts) met de handeling uit de bevestigingstabel.
// Elke niet-openbare route vereist bovendien de vlag telegram-aanmelden-v1 voor deze gebruiker (anders 404, alsof er niets is).
import type { RouterContext, RouterMiddleware, RouterResponse } from '../../server/platform/router';
import { json } from '../../server/platform';
import { passkeyStapOpGeldig, stapOpSessieId } from '../stap-op';
import { ALLEEN_SESSIE, BEWAAKT, OPENBAAR, poort, verbruik, keuzesVan, beschikbaarVoor, type PoortAuth } from './beleid-poort';
import { actieSoorten, instellingen, koppelingenVanGebruiker, registreerVlagBeoordelaar, sql, vlagHoofdschakelaar, vlagVoor } from './opslag';
import { koppelAnnuleren, koppelBevestigen, koppelStart, koppelStatus, magTelegram, profielFotoData } from './koppelen';
import { getPool } from '../../server/platform/pg';
import { inlogCode, inlogGeluktMelden, inlogInwisselen, inlogSessieVastleggen, inlogStart, inlogStatus, inlogTerugAdres, inlogTransactieId, publiekeConfig, veiligEigenTerugAdres, widgetTerug, type InlogContextMeta } from './inloggen';
import { bevestigingAanvragen, bevestigingStatus, codeVoorActie } from './bevestigen';
import { codeHerstellen, codeInstellen, codeStand, codeVerwijderen } from './code';
import { ontkoppelen, koppelingAanpassen } from './ontkoppelen';
import { extraWerkendeMethoden, plaatsingLezen, plaatsingOpslaan, werkendeMethoden } from './plaatsing';
import { wijzigingBeantwoorden, wijzigingGetoond, registreerSessieIntrekker, type SessieIntrekker } from './wijzigingen';
import { kopKlopt, updateVerwerken, type Update } from './webhook';
import { publiekeStand } from './status';
import * as beheer from './beheer';
import { SITE_BASIS } from './berichten';
import { audit } from './meldingen';
import { KOPPEL_STANDEN, STROOK_KLEUREN } from '../../shared/telegram-aanmelden/model';
import { beoordeel, keuzeToegestaan, voorinstellingToepassen, werkelijkeEis, type KeuzeId, type Voorinstelling } from '../../shared/telegram-aanmelden/beleid';
import { apparaat as apparaatLabel } from '../../server/platform/audit';
import { apparaatCookieHash } from '../apparaat-cookie';

type Sessie = PoortAuth & { user: { id: string; email?: string; role?: string; status?: string }; service: string };
type SessieFout = { errorCode: string };
export type TelegramDeps = {
  requireSession: (event: Record<string, unknown>, body: unknown) => Promise<Sessie | SessieFout>;
  /** Maakt een aanmeldtransactie (zelfde tabel als Google) en geeft het transactie-id + bindingscookie terug. */
  aanmeldStart: (
    rc: RouterContext,
    o: { tab: string; locale: 'uk' | 'nl'; remember: boolean; intent?: 'login' | 'replace-tab'; service?: string; sourceOrigin?: string; returnTo?: string },
  ) => Promise<{ transactieId: string; setCookie: string; meta?: InlogContextMeta } | { fout: string }>;
  /** Verwijdert een net aangemaakte transactie als het starten van het Telegram-verzoek meteen erna faalt. */
  aanmeldAfbreken?: (transactieId: string) => Promise<void>;
  /** Geeft het gecontroleerde canonieke terugkeeradres van een lopende Telegram-transactie (voor het aanmeldvenster). */
  aanmeldTerugAdres?: (transactieId: string) => Promise<string | null>;
  /** Voltooit die transactie voor deze gebruiker (zelfde weg als Google, zonder extra bevestiging). */
  aanmeldVoltooien: (rc: RouterContext, o: { transactieId: string; userId: string }) => Promise<{ antwoord: RouterResponse; sessieId: string }>;
  sessiesIntrekken: SessieIntrekker;
  /** Vlag telegram-aanmelden-v1 voor één gebruiker (backend/index.ts → flagsBerekenen). */
  vlagAan: (userId: string) => Promise<boolean>;
  /**
   * SEC-002 / aanmelden-04: stuurt DEZE browser de bindingscookie van precies deze aanmeldtransactie mee (backend/aanmeld-binding.ts)?
   * Alleen de browser die de aanmelding startte, mag het aanmeldvenster van Telegram openen en de terugkeer ervan afronden.
   * Ontbreekt deze functie, dan weigeren beide routes (dicht falen).
   */
  aanmeldBindingKlopt?: (rc: RouterContext, transactieId: string) => Promise<boolean>;
};

const fout = (code: string, status = 400, extra: Record<string, unknown> = {}): RouterResponse => {
  const ruwSec = Number(extra.retryAfter);
  const sec = status === 429 && Number.isFinite(ruwSec) && ruwSec > 0 ? Math.max(1, Math.ceil(ruwSec)) : 0;
  const antw = json({ error: code, reasonCode: code, ...extra, ...(sec ? { retryAfter: sec } : {}) }, status);
  if (sec) antw.headers['Retry-After'] = String(sec);
  return antw;
};
const STATUS: Record<string, number> = { VLAG_UIT: 404, NIET_GEVONDEN: 404, VERZOEK_ONBEKEND: 404, KOPPELING_ONBEKEND: 404, ONBEKENDE_ACTIE: 400, RATE_LIMITED: 429, NIET_TOEGESTAAN: 403, UITGESCHAKELD: 409, LIMIET_BEREIKT: 409, GEEN_WERKENDE_METHODE: 409 };
const lichaam = (rc: RouterContext): Record<string, unknown> => (rc.body && typeof rc.body === 'object' ? rc.body as Record<string, unknown> : {});
const str = (v: unknown, max = 200): string => (typeof v === 'string' ? v.slice(0, max) : '');
const isBeheerder = (u: { role?: string }): boolean => u.role === 'owner' || u.role === 'admin';
const markeer = (m: RouterMiddleware[], soort: symbol, actie = ''): RouterMiddleware[] => Object.assign(m, { [soort]: actie || true });

const HOST_DIENST: Readonly<Record<string, string>> = {
  'hub.tarasevych.com': 'hub',
  'id.tarasevych.com': 'identity',
  'mail.tarasevych.com': 'mail',
  'cloud.tarasevych.com': 'cloud',
  'ai.tarasevych.com': 'ai',
  'github.tarasevych.com': 'github',
  'huis.tarasevych.com': 'huis',
  'admin.tarasevych.com': 'admin',
  'api.tarasevych.com': 'api',
  'mcp.tarasevych.com': 'mcp',
};

function ontleedUserAgent(ua: string): { browser: string; os: string; apparaatType: string } {
  const s = String(ua || '');
  const browser = /Edg\//i.test(s) ? 'Edge'
    : /OPR\/|Opera/i.test(s) ? 'Opera'
    : /Firefox\//i.test(s) ? 'Firefox'
    : /Chrome\/|CriOS\//i.test(s) ? 'Chrome'
    : /Safari\//i.test(s) ? 'Safari'
    : /Telegram/i.test(s) ? 'Telegram' : '';
  const os = /iPhone|iPad|iPod/i.test(s) ? 'iOS'
    : /Android/i.test(s) ? 'Android'
    : /Windows NT/i.test(s) ? 'Windows'
    : /Mac OS X|Macintosh/i.test(s) ? 'macOS'
    : /Linux/i.test(s) ? 'Linux' : '';
  const apparaatType = /iPad|Tablet/i.test(s) ? 'tablet' : /Mobile|iPhone|Android/i.test(s) ? 'mobiel' : os ? 'computer' : '';
  return { browser, os, apparaatType };
}

function contextMetaVan(rc: RouterContext): Required<Pick<InlogContextMeta, 'ua' | 'ip' | 'locatie' | 'browser' | 'os' | 'apparaatType' | 'apparaatLabel' | 'dienst'>> {
  const ev = rc.event as unknown as { requestContext?: { http?: { userAgent?: string; sourceIp?: string } }; headers?: Record<string, string> };
  const h: Record<string, string> = {};
  for (const [k, v] of Object.entries(ev?.headers || {})) if (typeof v === 'string') h[k.toLowerCase()] = v;
  const ua = String(ev?.requestContext?.http?.userAgent || h['user-agent'] || '');
  const ipRuw = h['cf-connecting-ip'] || h['x-real-ip'] || (h['x-forwarded-for'] ? h['x-forwarded-for'].split(',')[0] : '') || ev?.requestContext?.http?.sourceIp || '';
  const ip = String(ipRuw || '').trim().slice(0, 64);
  const land = (h['cf-ipcountry'] || h['x-country-code'] || '').trim().toUpperCase();
  const stad = (h['cf-ipcity'] || '').trim();
  const regio = (h['cf-region'] || '').trim();
  const locatie = [land && land !== 'XX' && land !== 'T1' ? land : '', regio, stad].filter(Boolean).join(', ').slice(0, 160);
  const host = (h.host || '').split(':')[0].trim().toLowerCase();
  const dienst = HOST_DIENST[host] || '';
  const { browser, os, apparaatType } = ontleedUserAgent(ua);
  const label = apparaatLabel(ua) || ([browser, os].filter(Boolean).join('/') || 'onbekend/onbekend');
  return { ua, ip, locatie, browser, os, apparaatType, apparaatLabel: label.slice(0, 80), dienst };
}

function vangen(run: () => Promise<RouterResponse>): Promise<RouterResponse> {
  return run().catch((e) => {
    const code = String((e as Error)?.message || 'TELEGRAM_FOUT').replace(/[^A-Z0-9_:@a-z]/g, '').slice(0, 60) || 'TELEGRAM_FOUT';
    const bekend = /^[A-Z][A-Z0-9_]+$/.test(code);
    if (!bekend) console.error('[telegram-aanmelden] route mislukt:', (e as Error)?.message);
    const st = STATUS[code] ?? (bekend ? 400 : 500);
    const retryAfter = Number((e as { retryAfter?: unknown })?.retryAfter);
    return fout(bekend ? code : 'TELEGRAM_FOUT', st, st === 429 && retryAfter > 0 ? { retryAfter } : {});
  });
}

export function telegramRoutes(deps: TelegramDeps): Record<string, RouterMiddleware[]> {
  registreerSessieIntrekker(deps.sessiesIntrekken);
  registreerVlagBeoordelaar(deps.vlagAan);

  const metSessie = (run: (rc: RouterContext, a: Sessie, d: Record<string, unknown>) => Promise<RouterResponse>, opties: { beheer?: boolean } = {}): RouterMiddleware =>
    (async (rc: RouterContext) => {
      const a = await deps.requireSession(rc.event as unknown as Record<string, unknown>, rc.body);
      if ('errorCode' in a) return fout(a.errorCode, a.errorCode.includes('FORBIDDEN') ? 403 : 401);
      if (!(await vlagVoor(a.user.id))) return fout('NIET_GEVONDEN', 404);
      if (opties.beheer && !isBeheerder(a.user)) return fout('BEHEERDER_NODIG', 403);
      return vangen(() => run(rc, a, lichaam(rc)));
    }) as RouterMiddleware;

  const alleenSessie = (run: Parameters<typeof metSessie>[0], opties: { beheer?: boolean } = {}) => markeer([metSessie(run, opties)], ALLEEN_SESSIE);
  const bewaakt = (actie: string, run: Parameters<typeof metSessie>[0], opties: { beheer?: boolean } = {}) => markeer([metSessie(async (rc, a, d) => {
    const p = await poort(a, actie);
    if (!p.ok) {
      await audit(a.user.id, `poort.${actie}`, 'denied', { fout: p.fout, ontbreekt: p.beoordeling?.ontbreekt ?? [] });
      return fout(p.fout, p.status, { actie, ontbreekt: p.beoordeling?.ontbreekt ?? [], onbeschikbaar: p.beoordeling?.onbeschikbaar ?? [], eis: p.beoordeling?.eis ?? [] });
    }
    const uit = await run(rc, a, d);
    if (uit.statusCode < 300) await verbruik(a, actie);
    return uit;
  }, opties)], BEWAAKT, actie);
  const openbaar = (run: (rc: RouterContext) => Promise<RouterResponse>) => markeer([(async (rc: RouterContext) => vangen(() => run(rc))) as RouterMiddleware], OPENBAAR);

  /** Openbare kop: één JSON voor de gebruikerspagina (alles wat de gebruiker over zichzelf mag zien, niets van een ander). */
  const mijnOverzicht = async (a: Sessie) => {
    const inst = await instellingen();
    const koppelingen = await koppelingenVanGebruiker(a.user.id);
    const open = await sql("SELECT id, koppeling_id, ernst, verschillen, status, getoond_op, aangemaakt_op FROM app.tg_wijzigingen WHERE user_id = $1 AND status IN ('open','gezien') ORDER BY aangemaakt_op DESC", [a.user.id]);
    const keuzes = await keuzesVan(a.user.id);
    const beschikbaar = await beschikbaarVoor(a.user.id);
    const soorten = await actieSoorten();
    const pool = getPool('systeem');
    const uRec = await pool.query("SELECT data FROM app.records WHERE tbl = 'users' AND id = $1", [a.user.id]).catch(() => ({ rows: [] as Array<{ data: Record<string, unknown> }> }));
    const uData = (uRec.rows[0]?.data ?? {}) as Record<string, unknown>;
    const telRec = await pool.query("SELECT data->>'telefoon' AS telefoon FROM app.records WHERE tbl = 'identity_phones_v1' AND data->>'userId' = $1 LIMIT 1", [a.user.id]).catch(() => ({ rows: [] as Array<{ telefoon?: string }> }));
    const aanmeldingen = await sql<{
      id: string; apparaat: string; ip?: string; locatie?: string; browser?: string; os?: string; apparaat_type?: string;
      dienst?: string; onthouden?: boolean; methode: string; stand: string; reden: string; sessie_id: string | null;
      sessie_ingetrokken_op?: Date | null; aangemaakt_op: Date; afgehandeld_op: Date | null;
    }>('SELECT * FROM app.tg_inlog_verzoeken WHERE user_id = $1 ORDER BY aangemaakt_op DESC LIMIT 15', [a.user.id]).catch(() => []);
    return {
      mag: (await magTelegram(a.user)) || '',
      bot: inst.botGebruikersnaam,
      limiet: inst.koppelLimiet, aftel: { gewoon: inst.aftelSeconden, ernstig: inst.aftelSecondenErnstig }, onbeantwoordUren: inst.onbeantwoordUren,
      siteProfiel: {
        naam: String(uData.displayName || uData.name || a.user.email || ''),
        email: String(uData.email || a.user.email || ''),
        telefoon: String(telRec.rows[0]?.telefoon || uData.phone || ''),
        heeftEigenFoto: Boolean(uData.customAvatar || uData.picture || uData.avatarUrl),
      },
      code: { ...(await codeStand(a.user.id)), minLengte: inst.code.minLengte, maxLengte: inst.code.maxLengte },
      koppelingen: koppelingen.map((k) => {
        const extra = k as unknown as Record<string, unknown>;
        return {
          id: k.id, naam: k.naam, rechten: k.rechten, stand: k.stand, reden: k.reden,
          kleur: STROOK_KLEUREN[k.kleur] ?? STROOK_KLEUREN[0], kleurIndex: k.kleur,
          telegramId: k.telegram_id, chatId: k.chat_id, telefoon: k.telefoon,
          gebruikersnaam: k.gebruikersnaam, voornaam: k.voornaam, achternaam: k.achternaam, heeftFoto: !!k.foto_id,
          gekoppeldIp: String(extra.gekoppeld_ip || ''), gekoppeldLocatie: String(extra.gekoppeld_locatie || ''), gekoppeldApparaat: String(extra.gekoppeld_apparaat || ''),
          laatstIp: String(extra.laatst_ip || ''), laatstLocatie: String(extra.laatst_locatie || ''), laatstApparaat: String(extra.laatst_apparaat || ''),
          vingerafdruk: { telegramId: k.telegram_id, telefoon: k.telefoon, gebruikersnaam: k.gebruikersnaam, voornaam: k.voornaam, achternaam: k.achternaam, fotoId: k.foto_id },
          aangemaaktOp: new Date(k.aangemaakt_op).toISOString(),
          laatstGebruiktOp: k.laatst_gebruikt_op ? new Date(k.laatst_gebruikt_op).toISOString() : null,
        };
      }),
      aanmeldingen: aanmeldingen.map((x) => ({
        id: x.id, apparaat: x.apparaat, ip: String(x.ip || ''), locatie: String(x.locatie || ''),
        browser: String(x.browser || ''), os: String(x.os || ''), apparaatType: String(x.apparaat_type || ''),
        dienst: String(x.dienst || ''), onthouden: x.onthouden !== false, methode: x.methode, stand: x.stand, reden: x.reden,
        sessieIngelogd: !!x.sessie_id && !x.sessie_ingetrokken_op,
        aangemaaktOp: new Date(x.aangemaakt_op).toISOString(),
        afgehandeldOp: x.afgehandeld_op ? new Date(x.afgehandeld_op).toISOString() : null,
      })),
      wijzigingen: open.map((w) => ({ id: w.id, koppelingId: w.koppeling_id, ernst: w.ernst, verschillen: w.verschillen, status: w.status, aangemaaktOp: new Date(w.aangemaakt_op).toISOString() })),
      matrix: soorten.map((s) => ({ sleutel: s.sleutel, naam: s.naam, minimum: s.minimum, standaard: s.standaard, gevoelig: s.gevoelig, keuze: keuzes[s.sleutel] ?? s.standaard,
        eis: werkelijkeEis(s, keuzes[s.sleutel], { codeVerplicht: inst.code.verplichtVoor.includes(s.sleutel) }) })),
      beschikbaar: [...beschikbaar],
      geblokkeerd: (await sql<{ sleutel: string; op: Date }>('SELECT sleutel, op FROM app.tg_geblokkeerd WHERE user_id = $1 ORDER BY op DESC LIMIT 50', [a.user.id])).map((g) => ({ apparaat: g.sleutel, op: new Date(g.op).toISOString() })),
      status: await publiekeStand(),
      standen: KOPPEL_STANDEN,
    };
  };

  return {
    // ================================================================================ OPENBAAR
    // plaatsing: alleen met de vlag aan; anders null → het aanmeldscherm blijft exact zoals vóór deze functie.
    // IDENTITEIT-015 (aanmelden): methoden = нові способи, що ЗАРАЗ видають сеанс (ключ доступу, пароль, Microsoft/Discord/Apple).
    'GET /api/aanmelden/telegram/config': openbaar(async () => json({ ...(await publiekeConfig()), status: await publiekeStand(),
      plaatsing: (await vlagHoofdschakelaar()) ? await plaatsingLezen() : null, methoden: await extraWerkendeMethoden() })),
    'POST /api/aanmelden/telegram/start': openbaar(async (rc) => {
      const d = lichaam(rc);
      const taal = d.locale === 'nl' ? 'nl' : 'uk';
      const remember = d.remember !== false;
      const ctxMeta = contextMetaVan(rc);
      const tx = await deps.aanmeldStart(rc, {
        tab: str(d.tab || d.tabContext, 200),
        locale: taal,
        remember,
        intent: d.intent === 'replace-tab' ? 'replace-tab' : 'login',
        service: str(d.service, 32) || undefined,
        sourceOrigin: str(d.sourceOrigin, 200) || undefined,
        returnTo: str(d.returnTo, 500) || undefined,
      });
      if ('fout' in tx) return fout(tx.fout, 400);
      const txTerug = await deps.aanmeldTerugAdres?.(tx.transactieId).catch(() => null);
      const meta: InlogContextMeta = {
        ...ctxMeta,
        ...(tx.meta || {}),
        onthouden: tx.meta?.onthouden !== undefined ? tx.meta.onthouden : remember,
        terugAdres: tx.meta?.terugAdres || txTerug || undefined,
        // SEC-002 (integraties-04 / aanmelden-05): «bekend apparaat» = de eigen apparaatcookie van DEZE browser, niet de User-Agent.
        apparaatCookie: apparaatCookieHash(rc.event as unknown as Record<string, unknown>),
      };
      let r: Awaited<ReturnType<typeof inlogStart>>;
      try {
        r = await inlogStart(tx.transactieId, ctxMeta.ua, meta);
      } catch (e) {
        await deps.aanmeldAfbreken?.(tx.transactieId).catch(() => undefined);
        throw e;
      }
      const antwoord = json({ ...r, widgetUrl: `${SITE_BASIS()}/api/aanmelden/telegram/widget?i=${encodeURIComponent(r.id)}&verzoek=${encodeURIComponent(r.id)}&taal=${taal}` });
      if (tx.setCookie) antwoord.headers['Set-Cookie'] = tx.setCookie;
      return antwoord;
    }),
    'POST /api/aanmelden/telegram/status': openbaar(async (rc) => { const d = lichaam(rc); return json(await inlogStatus(str(d.id, 12), str(d.geheim, 64))); }),
    'POST /api/aanmelden/telegram/code': openbaar(async (rc) => { const d = lichaam(rc); return json(await inlogCode(str(d.id, 12), str(d.geheim, 64), str(d.code, 64))); }),
    'POST /api/aanmelden/telegram/voltooien': openbaar(async (rc) => {
      const d = lichaam(rc);
      const id = str(d.id, 12);
      const r = await inlogInwisselen(id, str(d.geheim, 64));
      const { antwoord, sessieId } = await deps.aanmeldVoltooien(rc, { transactieId: r.transactieId, userId: r.userId });
      if (sessieId) {
        await inlogSessieVastleggen(id, sessieId);
        void inlogGeluktMelden(r.koppelingId).catch(() => undefined);
      }
      return antwoord;
    }),
    // Officieel aanmeldvenster op een eigen mini-pagina met een eigen, smalle CSP (alleen telegram.org); de rest van de site houdt
    // script-src 'self'. Omleidingsmodus (data-auth-url): geen ingebed script van onszelf, geen terugroepfunctie in onze pagina.
    'GET /api/aanmelden/telegram/widget': openbaar(async (rc): Promise<RouterResponse> => {
      const ruwId = String(rc.query.verzoek || rc.query.i || rc.query.id || '');
      const id = /^[A-Za-z0-9_-]{12}$/.test(ruwId) ? ruwId : '';
      const taal = rc.query.taal === 'nl' ? 'nl' : 'uk';
      const cfg = await publiekeConfig();
      if (!id || !cfg.zichtbaar) return { statusCode: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' }, body: 'Not found' };
      const txId = await inlogTransactieId(id);
      // SEC-002 / aanmelden-04: het venster alleen voor de browser die DEZE aanmelding startte (bindingscookie van de transactie).
      // Anders kon een aanvaller zijn eigen verzoek-id in een link naar de echte site stoppen: het slachtoffer meldde zich in het
      // officiële venster aan en bevestigde in de bot — en de sessie ging naar de browser van de aanvaller.
      if (!txId || !deps.aanmeldBindingKlopt || !(await deps.aanmeldBindingKlopt(rc, txId).catch(() => false))) {
        await audit(null, 'widget.andere-browser', 'denied', { route: 'widget' }).catch(() => undefined);
        return { statusCode: 403, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }, body: ANDERE_BROWSER_TEKST };
      }
      const kandidaatTerug = (txId && (await deps.aanmeldTerugAdres?.(txId).catch(() => null))) || (await inlogTerugAdres(id));
      const terugNaar = veiligEigenTerugAdres(kandidaatTerug, `${SITE_BASIS()}/`);
      return { statusCode: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': WIDGET_CSP }, body: widgetPagina(cfg.bot, id, taal, terugNaar) };
    }),
    'GET /api/aanmelden/telegram/widget-terug': openbaar(async (rc) => {
      // SEC-002 / aanmelden-04: de terugkeer rondt alleen af in de browser die de aanmelding startte. Zonder de bindingscookie van
      // de transactie blijft het verzoek onaangeroerd (geen Telegram-id, geen vraag in de bot) — ook als iemand het venster van
      // Telegram rechtstreeks met ons terugkeeradres opende.
      const ruwId = String(rc.query.verzoek || rc.query.i || '');
      const txVanVerzoek = /^[A-Za-z0-9_-]{12}$/.test(ruwId) ? await inlogTransactieId(ruwId) : '';
      if (txVanVerzoek && (!deps.aanmeldBindingKlopt || !(await deps.aanmeldBindingKlopt(rc, txVanVerzoek).catch(() => false)))) {
        await audit(null, 'widget.andere-browser', 'denied', { route: 'widget-terug' }).catch(() => undefined);
        const weg = new URL(veiligEigenTerugAdres(`${SITE_BASIS()}/`, `${SITE_BASIS()}/`));
        weg.searchParams.set('tg_fout', 'ANDERE_BROWSER');
        return { statusCode: 302, headers: { Location: weg.toString(), 'Cache-Control': 'no-store' }, body: '' };
      }
      const r = await widgetTerug(rc.query as Record<string, string>);
      const kandidaat = (r.transactieId && (await deps.aanmeldTerugAdres?.(r.transactieId).catch(() => null))) || r.terugAdres || `${SITE_BASIS()}/`;
      const doel = new URL(veiligEigenTerugAdres(kandidaat, `${SITE_BASIS()}/`));
      if (r.id) doel.searchParams.set('tg_inlog', r.id);
      if (r.fout) doel.searchParams.set('tg_fout', r.fout);
      return { statusCode: 302, headers: { Location: doel.toString(), 'Cache-Control': 'no-store' }, body: '' };
    }),
    'POST /api/telegram/webhook': openbaar(async (rc) => {
      const kop = String(Object.entries(rc.event.headers || {}).find(([k]) => k.toLowerCase() === 'x-telegram-bot-api-secret-token')?.[1] || '');
      if (!(await kopKlopt(kop))) return fout('NIET_TOEGESTAAN', 401);
      await updateVerwerken(rc.body as Update);
      return json({ ok: true });
    }),

    // ================================================================================ GEBRUIKER
    'POST /api/owner/telegram/mijn': alleenSessie(async (_rc, a) => json(await mijnOverzicht(a))),
    'POST /api/owner/telegram/koppelen/start': alleenSessie(async (rc, a, d) => {
      const m = contextMetaVan(rc);
      return json(await koppelStart(a.user, stapOpSessieId(a), { naam: d.naam, metCode: d.metCode, siteTaal: d.locale, ip: m.ip, locatie: m.locatie, apparaat: m.apparaatLabel }));
    }),
    'POST /api/owner/telegram/koppelen/status': alleenSessie(async (_rc, a, d) => json(await koppelStatus(a.user.id, stapOpSessieId(a), str(d.id, 12)))),
    'POST /api/owner/telegram/koppelen/bevestigen': bewaakt('koppelen', async (_rc, a, d) => json(await koppelBevestigen(a.user.id, stapOpSessieId(a), str(d.id, 12), { rechten: d.rechten }))),
    'POST /api/owner/telegram/koppelen/annuleren': alleenSessie(async (_rc, a, d) => { await koppelAnnuleren(a.user.id, stapOpSessieId(a), str(d.id, 12)); return json({ ok: true }); }),
    'POST /api/owner/telegram/foto': alleenSessie(async (_rc, a, d) => {
      const k = (await koppelingenVanGebruiker(a.user.id)).find((x) => x.id === str(d.koppelingId, 40));
      if (!k) return fout('KOPPELING_ONBEKEND', 404);
      return json({ foto: await profielFotoData(k.telegram_id) });
    }),
    'POST /api/owner/telegram/ontkoppelen': bewaakt('ontkoppelen', async (_rc, a, d) => {
      const r = await ontkoppelen(str(d.koppelingId, 40), { userId: a.user.id }, 'site');
      return r === 'ok' ? json({ ok: true }) : fout(r === 'laatste' ? 'LAATSTE_METHODE' : 'KOPPELING_ONBEKEND', r === 'laatste' ? 409 : 404);
    }),
    'POST /api/owner/telegram/koppeling': bewaakt('koppeling-wijzigen', async (_rc, a, d) => { await koppelingAanpassen(a.user.id, str(d.koppelingId, 40), { naam: d.naam, rechten: d.rechten }); return json({ ok: true }); }),
    // Een geblokkeerd apparaat weer toelaten: zelfde poort als naam/rechten van een koppeling (verse toegangssleutel).
    'POST /api/owner/telegram/deblokkeren': bewaakt('koppeling-wijzigen', async (_rc, a, d) => {
      const r = await sql('DELETE FROM app.tg_geblokkeerd WHERE user_id = $1 AND sleutel = $2 RETURNING sleutel', [a.user.id, str(d.apparaat, 80)]);
      if (!r.length) return fout('NIET_GEVONDEN', 404);
      await audit(a.user.id, 'apparaat.gedeblokkeerd', 'success', { apparaat: str(d.apparaat, 80) });
      return json({ ok: true });
    }),
    'POST /api/owner/telegram/wijziging/getoond': alleenSessie(async (_rc, a, d) => { const r = await wijzigingGetoond(a.user.id, str(d.id, 40)); return r ? json(r) : fout('VERZOEK_ONBEKEND', 404); }),
    // «Ні, не я» kan altijd (het veiligere antwoord); «Так, це я» alleen met een verse toegangssleutel, na de op de server aftelling.
    'POST /api/owner/telegram/wijziging/antwoord': alleenSessie(async (_rc, a, d) => {
      const antwoord = d.antwoord === 'ja' ? 'ja' : 'nee';
      const metPasskey = antwoord === 'ja' ? await passkeyStapOpGeldig(a) : false;
      const huidige = [a.session?.id, a.tabSession?.id].filter((x): x is string => !!x);
      const r = await wijzigingBeantwoorden(str(d.id, 40), antwoord, { userId: a.user.id, bron: 'site', metPasskey, huidigeSessieIds: huidige, begrepen: d.begrepen === true });
      if (!r.ok) return r.fout === 'PASSKEY_NODIG' ? fout('STEP_UP_PASSKEY_REQUIRED', 403, { actie: 'wijziging-bevestigen', ontbreekt: ['passkey'] }) : fout(r.fout, r.fout === 'ONBEKEND' ? 404 : 409);
      return json({ status: r.gevolg.toestand.status, conflict: r.gevolg.toestand.conflict, koppelStand: r.gevolg.koppelStand, opnieuwKoppelen: r.gevolg.acties.includes('opnieuw-koppelen-vereist') });
    }),
    'POST /api/owner/telegram/code/instellen': bewaakt('geheime-code', async (_rc, a, d) => {
      const tel = (await koppelingenVanGebruiker(a.user.id)).map((k) => k.telefoon).join(' ');
      const r = await codeInstellen(a.user.id, str(d.code, 64), d.alarmCode ? str(d.alarmCode, 64) : null, tel);
      return r.ok ? json({ ok: true }) : fout('CODE_ZWAK', 400, { reden: r.reden });
    }),
    'POST /api/owner/telegram/code/verwijderen': bewaakt('geheime-code', async (_rc, a) => { await codeVerwijderen(a.user.id); return json({ ok: true }); }),
    'POST /api/owner/telegram/code/herstellen': bewaakt('geheime-code', async (_rc, a) => { await codeHerstellen(a.user.id); return json({ ok: true }); }),
    'POST /api/owner/telegram/matrix': bewaakt('matrix-wijzigen', async (_rc, a, d) => {
      const soorten = await actieSoorten();
      const inst = await instellingen();
      let keuzes: Record<string, KeuzeId> = { ...(await keuzesVan(a.user.id)) };
      if (typeof d.voorinstelling === 'string') keuzes = voorinstellingToepassen(d.voorinstelling as Voorinstelling, soorten);
      else if (d.keuzes && typeof d.keuzes === 'object') for (const [k, v] of Object.entries(d.keuzes as Record<string, unknown>)) {
        const s = soorten.find((x) => x.sleutel === k);
        if (!s || !keuzeToegestaan(s, v)) return fout('KEUZE_TE_ZWAK', 400, { actie: k });
        keuzes[k] = v;
      }
      // Nooit buitensluiten: elke handeling moet met de methoden die u NU heeft haalbaar blijven.
      const beschikbaar = await beschikbaarVoor(a.user.id);
      for (const s of soorten) {
        const b = beoordeel(werkelijkeEis(s, keuzes[s.sleutel], { codeVerplicht: inst.code.verplichtVoor.includes(s.sleutel) }), new Set(), beschikbaar);
        if (b.geblokkeerd && keuzes[s.sleutel] && keuzes[s.sleutel] !== s.standaard) return fout('METHODE_NIET_INGESTELD', 409, { actie: s.sleutel, onbeschikbaar: b.onbeschikbaar });
      }
      await sql('INSERT INTO app.tg_matrix (user_id, keuzes) VALUES ($1,$2::jsonb) ON CONFLICT (user_id) DO UPDATE SET keuzes = EXCLUDED.keuzes, gewijzigd_op = now()', [a.user.id, JSON.stringify(keuzes)]);
      await audit(a.user.id, 'matrix.gewijzigd', 'success', { keuzes });
      return json({ ok: true, keuzes });
    }),
    'POST /api/owner/telegram/bevestiging/aanvragen': alleenSessie(async (rc, a, d) => {
      const m = contextMetaVan(rc);
      return json(await bevestigingAanvragen(a.user.id, stapOpSessieId(a), str(d.actie, 41), { apparaat: m.apparaatLabel, ip: m.ip, locatie: m.locatie }));
    }),
    'POST /api/owner/telegram/bevestiging/status': alleenSessie(async (_rc, a, d) => json(await bevestigingStatus(a.user.id, stapOpSessieId(a), str(d.id, 12)))),
    'POST /api/owner/telegram/bevestiging/code': alleenSessie(async (_rc, a, d) => json(await codeVoorActie(a.user.id, stapOpSessieId(a), str(d.actie, 41), str(d.code, 64)))),

    // ================================================================================ BEHEER
    'POST /api/owner/telegram/beheer/overzicht': alleenSessie(async () => json(await beheer.overzicht()), { beheer: true }),
    'POST /api/owner/telegram/beheer/webhook': alleenSessie(async () => json(await beheer.webhookStand()), { beheer: true }),
    'POST /api/owner/telegram/beheer/controle': alleenSessie(async () => { const { controleNu } = await import('./status'); return json(await controleNu()); }, { beheer: true }),
    'POST /api/owner/telegram/beheer/journaal': alleenSessie(async (_rc, _a, d) => json({ items: await beheer.journaal(Number(d.limiet) || 100) }), { beheer: true }),
    'POST /api/owner/telegram/beheer/koppelingen': alleenSessie(async (_rc, _a, d) => json({ items: await beheer.koppelingenLijst(str(d.zoek, 80)) }), { beheer: true }),
    'POST /api/owner/telegram/beheer/proef': alleenSessie(async (_rc, a) => json({ verstuurd: await beheer.proefbericht(a.user.id) }), { beheer: true }),
    'POST /api/owner/telegram/beheer/bot': bewaakt('beheer-bot-sleutel', async (_rc, a, d) => json(await beheer.botInstellen(a.user.id, { sleutel: d.sleutel, toch: d.toch })), { beheer: true }),
    'POST /api/owner/telegram/beheer/sleutel-annuleren': bewaakt('beheer-bot-sleutel', async (_rc, a) => { await beheer.nieuweSleutelAnnuleren(a.user.id); return json({ ok: true }); }, { beheer: true }),
    'POST /api/owner/telegram/beheer/instellingen': bewaakt('beheer-instellingen', async (_rc, a, d) => json({ instellingen: await beheer.instellingenOpslaan(a.user.id, d.instellingen) }), { beheer: true }),
    'POST /api/owner/telegram/beheer/plaatsing-lezen': alleenSessie(async () => json({ plaatsing: await plaatsingLezen(), werkend: await werkendeMethoden() }), { beheer: true }),
    'POST /api/owner/telegram/beheer/plaatsing': bewaakt('beheer-instellingen', async (_rc, a, d) => json(await plaatsingOpslaan(a.user.id, d.plaatsing)), { beheer: true }),
    'POST /api/owner/telegram/beheer/ongedaan': bewaakt('beheer-instellingen', async (_rc, a) => json({ instellingen: await beheer.instellingenOngedaan(a.user.id) }), { beheer: true }),
    // Noodschakelaar UIT moet altijd kunnen (zoals «Захист»): alleen sessie + beheerder. AAN vraagt de gewone poort.
    'POST /api/owner/telegram/beheer/nood-uit': alleenSessie(async (_rc, a) => { await beheer.noodschakelaar(a.user.id, false); return json({ ok: true }); }, { beheer: true }),
    'POST /api/owner/telegram/beheer/nood-aan': bewaakt('beheer-instellingen', async (_rc, a) => { await beheer.noodschakelaar(a.user.id, true); return json({ ok: true }); }, { beheer: true }),
    'POST /api/owner/telegram/beheer/actie': bewaakt('beheer-instellingen', async (_rc, a, d) => {
      if (d.verwijderen === true) await beheer.actieVerwijderen(a.user.id, str(d.sleutel, 41)); else await beheer.actieToevoegen(a.user.id, d);
      return json({ ok: true });
    }, { beheer: true }),
    'POST /api/owner/telegram/beheer/koppeling-uit': bewaakt('beheer-instellingen', async (_rc, a, d) => json({ uitkomst: await beheer.koppelingUitschakelen(a.user.id, str(d.koppelingId, 40)) }), { beheer: true }),
  };
}

/** De openbare routes (voor PUBLIEKE_ROUTES in server/platform/auth-poort.ts, met reden). */
export const TELEGRAM_PUBLIEKE_ROUTES: Readonly<Record<string, string>> = Object.freeze({
  'GET /api/aanmelden/telegram/config': 'Telegram-knop op het aanmeldscherm: zichtbaar ja/nee, botnaam, stand (geen geheimen)',
  'POST /api/aanmelden/telegram/start': 'Telegram-aanmelding starten (vóór de sessie; transactie + bindingscookie)',
  'POST /api/aanmelden/telegram/status': 'Telegram-aanmelding volgen (id + geheim van deze browser)',
  'POST /api/aanmelden/telegram/code': 'geheime code bij Telegram-aanmelding (id + geheim; tellers en pauzes)',
  'POST /api/aanmelden/telegram/voltooien': 'Telegram-aanmelding inwisselen (id + geheim + bindingscookie, eenmalig)',
  'GET /api/aanmelden/telegram/widget': 'mini-pagina met het officiële aanmeldvenster van Telegram (eigen smalle CSP)',
  'GET /api/aanmelden/telegram/widget-terug': 'terugkeer uit het aanmeldvenster van Telegram (HMAC-handtekening, 5 min, eenmalig)',
  'POST /api/telegram/webhook': 'terugroepadres voor Telegram (geheime kop X-Telegram-Bot-Api-Secret-Token)',
});

/** SEC-002 / aanmelden-04: wat een andere browser ziet als hij het aanmeldvenster van een vreemde aanmelding opent. */
export const ANDERE_BROWSER_TEKST = 'Це посилання на вхід через Telegram почали в іншому оглядачі. Ніколи не підтверджуйте вхід, який почали не ви: почніть вхід самі на сторінці «Мій простір».\n\n'
  + 'Deze aanmelding met Telegram is in een andere browser gestart. Bevestig nooit een aanmelding die u niet zelf begon: begin zelf met aanmelden op de pagina van «Mijn Ruimte».';

export const WIDGET_CSP = ["default-src 'none'", "script-src https://telegram.org", "frame-src https://oauth.telegram.org", "img-src https://telegram.org https://t.me data:",
  "style-src 'unsafe-inline'", "base-uri 'none'", "form-action 'none'", "frame-ancestors 'none'"].join('; ');

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
export function widgetPagina(bot: string, id: string, taal: 'uk' | 'nl', terugNaar = `${SITE_BASIS()}/`): string {
  const terug = `${SITE_BASIS()}/api/aanmelden/telegram/widget-terug?verzoek=${encodeURIComponent(id)}&i=${encodeURIComponent(id)}`;
  const veiligTerug = veiligEigenTerugAdres(terugNaar, `${SITE_BASIS()}/`);
  const tekst = taal === 'nl'
    ? { titel: 'Aanmelden met Telegram — Mijn Ruimte', kop: 'Aanmelden met Telegram', uitleg: 'Tik op de knop hieronder. Telegram vraagt u te bevestigen; daarna stuurt de bot @' + bot + ' u een bevestigingsknop.', terug: '← Terug naar Mijn Ruimte' }
    : { titel: 'Увійти через Telegram — Мій простір', kop: 'Увійти через Telegram', uitleg: 'Натисніть кнопку нижче. Telegram попросить підтвердити, після цього бот @' + bot + ' надішле вам кнопку підтвердження.', terug: '← Повернутися до «Мій простір»' };
  return `<!doctype html><html lang="${taal}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>${esc(tekst.titel)}</title></head>
<body style="margin:0;font:16px/1.5 system-ui,sans-serif;background:#f4f7fb;color:#17212b;display:flex;min-height:100vh;align-items:center;justify-content:center">
<main style="background:#fff;border-radius:16px;box-shadow:0 8px 30px rgba(0,0,0,.08);padding:32px;max-width:420px;text-align:center">
<div style="width:56px;height:56px;border-radius:50%;background:#2AABEE;margin:0 auto 12px;display:flex;align-items:center;justify-content:center"><svg width="30" height="30" viewBox="0 0 24 24" aria-hidden="true"><path fill="#fff" d="M9.8 15.2 9.6 19c.4 0 .6-.2.8-.4l2-1.9 4.1 3c.8.4 1.3.2 1.5-.7l2.7-12.7c.3-1.1-.4-1.6-1.1-1.3L3.7 10.8c-1.1.4-1 1-.2 1.3l4 1.2 9.3-5.9c.4-.3.8-.1.5.2"/></svg></div>
<h1 style="font-size:20px;margin:0 0 8px">${esc(tekst.kop)}</h1><p style="margin:0 0 20px;color:#4b5966">${esc(tekst.uitleg)}</p>
<script async src="https://telegram.org/js/telegram-widget.js?22" data-telegram-login="${esc(bot)}" data-size="large" data-radius="10" data-lang="${taal}" data-request-access="write" data-auth-url="${esc(terug)}"></script>
<p style="margin:20px 0 0"><a href="${esc(veiligTerug)}" style="color:#229ED9">${esc(tekst.terug)}</a></p></main></body></html>`;
}
