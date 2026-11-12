// APPARAAT-001 — HTTP-routes. Twee soorten, zichtbaar gemarkeerd (tests/eenheid/apparaat-bevestiging-20261109.test.ts):
//   ALLEEN_SESSIE — eigen gegevens lezen, een verzoek starten/volgen/intrekken, «Ні» zeggen;
//   MET_SLEUTEL   — alles wat de beveiliging zelf verandert (voorkeuren, herstel na «uit», beheerinstellingen): eist een VERSE
//                   toegangssleutel op deze sessie (passkeyStapOpGeldig), anders 403 STEP_UP_PASSKEY_REQUIRED (het venster
//                   «Підтвердіть доступ» met alleen de toegangssleutel opent dan vanzelf, zoals bij TELEGRAM-001).
// Elke route vereist bovendien de vlag apparaat-bevestiging-v1 voor deze gebruiker (anders 404, alsof er niets is) — behalve
// de noodschakelaar UIT van de beheerder, die altijd kan.
//
// Daarnaast de poort voor de klassieke step-up: POST /api/owner/access/stap-op/poort beoordeelt de handeling «stap-op» met
// dezelfde beleidsfunctie als TELEGRAM-001 (Telegram, ander apparaat, geheime code, toegangssleutel) en legt bij «toegestaan»
// de step-up voor deze sessie vast. Zo is er geen tweede waarheid over wat genoeg is.
import type { RouterContext, RouterMiddleware, RouterResponse } from '../../server/platform/router';
import { json } from '../../server/platform';
import { passkeyStapOpGeldig, stapOpSessieId } from '../stap-op';
import { poort, verbruik as telegramVerbruik, voldaanVoor, type PoortAuth } from '../telegram-aanmelden/beleid-poort';
import { aanvragen, bekrachtigen, beheerOverzicht, herstelNaSleutel, intrekken, open, overzicht, stand, stapOpNaPoort, verbruik, voorkeurenZetten, weigeren, type Auth } from './kern';
import { instellingen, instellingenOpslaan, instellingenOngedaan, registreerVlagBeoordelaar, vlagVoor } from './opslag';
import { registreerStroomAuth, type StroomAuth } from './stroom';

type Sessie = Auth & PoortAuth & { user: { id: string; email?: string; role?: string; status?: string }; service: string };
type SessieFout = { errorCode: string };
export type ApparaatDeps = {
  requireSession: (event: Record<string, unknown>, body: unknown) => Promise<Sessie | SessieFout>;
  /** Vlag apparaat-bevestiging-v1 voor één gebruiker (backend/index.ts → flagsBerekenen). */
  vlagAan: (userId: string) => Promise<boolean>;
};

export const ALLEEN_SESSIE = Symbol.for('apparaat-bevestiging.alleen-sessie');
export const MET_SLEUTEL = Symbol.for('apparaat-bevestiging.met-sleutel');

const fout = (code: string, status = 400, extra: Record<string, unknown> = {}): RouterResponse => json({ error: code, reasonCode: code, ...extra }, status);
const STATUS: Record<string, number> = {
  VLAG_UIT: 404, VERZOEK_ONBEKEND: 404, ONBEKENDE_ACTIE: 400, RATE_LIMITED: 429, NIET_TOEGESTAAN: 403, UITGESCHAKELD: 409, METHODE_UIT: 409, METHODE_PAUZE: 429,
  GEEN_ANDER_APPARAAT: 409, VERLOPEN: 410, AL_AFGEROND: 409, ZELFDE_APPARAAT: 409, TE_SNEL: 425, KEUZE_ONGELDIG: 400, STEP_UP_PASSKEY_REQUIRED: 403, BEHEERDER_NODIG: 403, SESSIE_ONBEKEND: 401,
};
const lichaam = (rc: RouterContext): Record<string, unknown> => (rc.body && typeof rc.body === 'object' ? rc.body as Record<string, unknown> : {});
const str = (v: unknown, max = 200): string => (typeof v === 'string' ? v.slice(0, max) : '');
const isBeheerder = (u: { role?: string }): boolean => u.role === 'owner' || u.role === 'admin';
const markeer = (m: RouterMiddleware[], soort: symbol): RouterMiddleware[] => Object.assign(m, { [soort]: true });
const ua = (rc: RouterContext): string => String((rc.event as { requestContext?: { http?: { userAgent?: string } } })?.requestContext?.http?.userAgent || (rc.event as { headers?: Record<string, string> })?.headers?.['user-agent'] || '');
const koppen = (rc: RouterContext): Record<string, string | undefined> => ((rc.event as { headers?: Record<string, string> })?.headers || {});

function vangen(run: () => Promise<RouterResponse>): Promise<RouterResponse> {
  return run().catch((e) => {
    const code = String((e as Error)?.message || 'APPARAAT_FOUT').replace(/[^A-Z0-9_]/g, '').slice(0, 60) || 'APPARAAT_FOUT';
    const bekend = /^[A-Z][A-Z0-9_]+$/.test(code) && code !== 'APPARAAT_FOUT';
    if (!bekend) console.error('[apparaat-bevestiging] route mislukt:', (e as Error)?.message);
    return fout(bekend ? code : 'APPARAAT_FOUT', STATUS[code] ?? (bekend ? 400 : 500));
  });
}

export function apparaatRoutes(deps: ApparaatDeps): Record<string, RouterMiddleware[]> {
  registreerVlagBeoordelaar(deps.vlagAan);
  const stroomAuth: StroomAuth = async (event, body) => {
    const a = await deps.requireSession(event, body);
    if ('errorCode' in a) return { fout: a.errorCode };
    if (!(await vlagVoor(a.user.id))) return { fout: 'NIET_GEVONDEN' };
    return { userId: a.user.id, anker: String(a.session?.id || '') };
  };
  registreerStroomAuth(stroomAuth);

  const metSessie = (run: (rc: RouterContext, a: Sessie, d: Record<string, unknown>) => Promise<RouterResponse>, o: { beheer?: boolean; vlag?: boolean; sleutel?: boolean } = {}): RouterMiddleware =>
    (async (rc: RouterContext) => {
      const a = await deps.requireSession(rc.event as unknown as Record<string, unknown>, rc.body);
      if ('errorCode' in a) return fout(a.errorCode, a.errorCode.includes('FORBIDDEN') ? 403 : 401);
      if (o.vlag !== false && !(await vlagVoor(a.user.id))) return fout('NIET_GEVONDEN', 404);
      if (o.beheer && !isBeheerder(a.user)) return fout('BEHEERDER_NODIG', 403);
      if (o.sleutel && !(await passkeyStapOpGeldig(a))) return fout('STEP_UP_PASSKEY_REQUIRED', 403);
      return vangen(() => run(rc, a, lichaam(rc)));
    }) as RouterMiddleware;
  const alleenSessie = (run: Parameters<typeof metSessie>[0], o: { beheer?: boolean; vlag?: boolean } = {}) => markeer([metSessie(run, o)], ALLEEN_SESSIE);
  const metSleutel = (run: Parameters<typeof metSessie>[0], o: { beheer?: boolean } = {}) => markeer([metSessie(run, { ...o, sleutel: true })], MET_SLEUTEL);

  return {
    // ---------------------------------------------------------------- A: het vragende apparaat
    'POST /api/owner/bevestiging/apparaat/aanvragen': alleenSessie(async (rc, a, d) => json(await aanvragen(a, { actie: str(d.actie, 41) || 'stap-op', label: str(d.label, 41), dienst: str(d.service || a.service, 20), gevoelig: d.gevoelig === true, ua: ua(rc), headers: koppen(rc) }))),
    'POST /api/owner/bevestiging/apparaat/stand': alleenSessie(async (_rc, a, d) => json(await stand(a, str(d.id, 12)))),
    'POST /api/owner/bevestiging/apparaat/intrekken': alleenSessie(async (_rc, a, d) => { await intrekken(a, str(d.id, 12)); return json({ ok: true }); }),
    // ---------------------------------------------------------------- B: het bevestigende apparaat
    'POST /api/owner/bevestiging/apparaat/open': alleenSessie(async (_rc, a) => json(await open(a))),
    'POST /api/owner/bevestiging/apparaat/bekrachtigen': alleenSessie(async (rc, a, d) => json(await bekrachtigen(a, str(d.id, 12), typeof d.keuze === 'number' ? d.keuze : Number.NaN, ua(rc)))),
    'POST /api/owner/bevestiging/apparaat/weigeren': alleenSessie(async (rc, a, d) => { await weigeren(a, str(d.id, 12), ua(rc)); return json({ ok: true }); }),
    // ---------------------------------------------------------------- gebruiker: overzicht, voorkeuren, herstel
    'POST /api/owner/bevestiging/apparaat/overzicht': alleenSessie(async (_rc, a) => json(await overzicht(a))),
    'POST /api/owner/bevestiging/apparaat/voorkeuren': metSleutel(async (_rc, a, d) => json({ voorkeuren: await voorkeurenZetten(a, d.voorkeuren) })),
    'POST /api/owner/bevestiging/apparaat/herstellen': metSleutel(async (_rc, a) => { await herstelNaSleutel(a); return json({ ok: true }); }),
    // ---------------------------------------------------------------- beheer (Адміністрування → «Єдиний вхід»)
    'POST /api/owner/bevestiging/apparaat/beheer/overzicht': alleenSessie(async () => json(await beheerOverzicht()), { beheer: true }),
    'POST /api/owner/bevestiging/apparaat/beheer/instellingen': metSleutel(async (_rc, a, d) => json({ instellingen: await instellingenOpslaan(a.user.id, d.instellingen) }), { beheer: true }),
    'POST /api/owner/bevestiging/apparaat/beheer/ongedaan': metSleutel(async (_rc, a) => json({ instellingen: await instellingenOngedaan(a.user.id) }), { beheer: true }),
    /** Noodschakelaar UIT: altijd meteen, zonder toegangssleutel (uitzetten mag nooit moeilijk zijn). Aanzetten gaat via «instellingen» mét sleutel. */
    'POST /api/owner/bevestiging/apparaat/beheer/nood-uit': alleenSessie(async (_rc, a) => json({ instellingen: await instellingenOpslaan(a.user.id, { ...(await instellingen()), aan: false }) }), { beheer: true, vlag: false }),
    // ---------------------------------------------------------------- klassieke step-up via de poort van de bevestigingstabel
    /**
     * Beoordeelt «stap-op» voor deze sessie: wat is al voldaan (Telegram-tik, ander apparaat, geheime code, toegangssleutel) en wat
     * ontbreekt nog. Toegestaan → step-up vastgelegd voor deze sessie + de bevestigingen verbruikt; anders 403 met de eis, zodat het
     * venster «Підтвердіть доступ» precies die stap kan tonen. Vlag uit → 404 (de tabbladen bestaan dan niet).
     */
    'POST /api/owner/access/stap-op/poort': alleenSessie(async (_rc, a) => {
      const p = await poort(a, 'stap-op');
      if (!p.ok) return fout(p.fout, p.status, { actie: 'stap-op', ontbreekt: p.beoordeling?.ontbreekt ?? [], onbeschikbaar: p.beoordeling?.onbeschikbaar ?? [], eis: p.beoordeling?.eis ?? [] });
      const voldaan = await voldaanVoor(a, 'stap-op');
      const methode = await stapOpNaPoort(a, voldaan);
      if (!methode) return fout('STEP_UP_PASSKEY_REQUIRED', 403, { actie: 'stap-op', ontbreekt: ['telegram'], onbeschikbaar: [], eis: p.beoordeling.eis });
      await telegramVerbruik(a, 'stap-op');
      await verbruik(a.user.id, stapOpSessieId(a), 'stap-op');
      return json({ ok: true, stepUp: methode, maxAgeSeconds: 300 });
    }),
  };
}
