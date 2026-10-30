// De routes van de MCP-KLANT: /api/owner/externe-mcp/*. Hiermee beheert de gebruiker zijn vreemde MCP-servers
// op mcp.*/agents → «Зовнішні MCP» (src/agenten/TabExternMcp.tsx).
//
// Niets hier is cosmetisch:
//   • «Перевірити» verbindt ECHT (initialize + tools/list) en de stand komt uit dat resultaat;
//   • een adres dat niet mag (geen https, geheim in de URL, host niet op de witte lijst van de eigenaar) komt
//     de database niet in en krijgt zijn eigen code;
//   • een token gaat rechtstreeks naar de eigen kluis (owner_vault_v1) en komt NOOIT terug in een antwoord;
//   • OAuth 2.1 met dynamische clientregistratie is niet geïmplementeerd: de route weigert die keuze met de
//     lijst van wat er nog voor nodig is (MCP_OAUTH_ONTBREEKT). Er is geen knop die niets doet.
import { error, json } from '../server/platform';
import { denyMutation, rejectForeignOwnerUserId } from './rbac';
import { ownerVaultBewarenIntern, ownerVaultVerwijderenIntern } from './api-platform-kluis';
import {
  MCP_AUTH_WIJZEN, MCP_FOUT, MCP_GRENZEN, MCP_KLANT_VERSIES, MCP_KLANT_VOORKEUR, MCP_OAUTH_ONTBREEKT,
  externeToolNaam, type McpAuthWijze,
} from '../shared/mcp-klant-model';
import { ruimteOf } from '../shared/ai-ruimte';
import { aiVerbindingRuimte } from './ai-ruimte-poort';
import { externeMcpMogelijkheden, keurAdres, toegestaneHosts, verbindingTesten } from './mcp-klant';
import * as store from './mcp-klant-opslag';

type User = { id: string; status: string; email?: string; role?: string };
type AuthSuccess = { service: string; user: User };
type AuthFailure = { errorCode: string };
type Authorize = (event: Record<string, unknown>, body: unknown) => Promise<AuthSuccess | AuthFailure>;
type Context = { event: Record<string, unknown>; body: unknown; params: Record<string, string> };

/** De hub «Підключення ШІ» staat op mcp.*; de hub zelf mag er ook bij (dezelfde accountruimte). */
const TOEGESTANE_DIENSTEN = ['mcp', 'hub'];
const lichaam = (body: unknown) => (body && typeof body === 'object' ? (body as Record<string, unknown>) : {});
const kort = (waarde: unknown, max = 200) => String(waarde ?? '').replace(/\u0000/g, '').trim().slice(0, max);

const auth = async (authorize: Authorize, ctx: Context) => {
  const uitslag = await authorize(ctx.event, ctx.body);
  if ('errorCode' in uitslag) return null;
  if (!TOEGESTANE_DIENSTEN.includes(uitslag.service) || uitslag.user.status !== 'approved') return null;
  return uitslag;
};
/** Tweede hek voor elke wijzigende route: de rol van de gebruiker en geen vreemde `ownerUserId` in het lichaam. */
const mutatieGeweigerd = (gebruiker: AuthSuccess, body: unknown) =>
  rejectForeignOwnerUserId(gebruiker.user, body) || denyMutation(gebruiker.user, 'workspace.write');

/** De naam van de kluissleutel van één verbinding. Vast patroon, zodat opruimen altijd lukt. */
export const sleutelNaamVoor = (verbindingId: string) => `EXTERNE_MCP_${String(verbindingId).replace(/[^A-Za-z0-9]/g, '').slice(0, 12).toUpperCase()}_TOKEN`;

/** Wat de pagina van één verbinding mag zien. Nooit het token, nooit de naam van de sleutel als waarde. */
const publiek = (rij: store.VerbindingRij, tools: store.ToolRij[]) => ({
  id: rij.id, naam: rij.naam, adres: rij.adres, host: hostVan(rij.adres), ruimte: rij.ruimte,
  authWijze: rij.authWijze, sleutelIngesteld: Boolean(rij.sleutelNaam),
  vervoer: rij.vervoer, protocolVersie: rij.protocolVersie, serverNaam: rij.serverNaam, serverVersie: rij.serverVersie,
  mogelijkheden: rij.mogelijkheden, instructies: rij.instructies, actief: rij.actief, staat: rij.staat, fout: rij.fout,
  laatstOkOp: rij.laatstOkOp, laatstFoutOp: rij.laatstFoutOp, toolsBijgewerktOp: rij.toolsBijgewerktOp,
  aantalTools: rij.aantalTools,
  hulpmiddelen: tools.map((tool) => ({
    naam: tool.naam, titel: tool.titel, beschrijving: tool.beschrijving, alleenLezen: tool.alleenLezen,
    destructief: tool.destructief, aan: tool.aan, gezienOp: tool.gezienOp,
    // Zo heet dit hulpmiddel voor de AI; de eigenaar kan het in het journaal terugvinden.
    aiNaam: externeToolNaam(rij.id, tool.naam),
  })),
});
const hostVan = (adres: string) => { try { return new URL(adres).hostname; } catch { return ''; } };

export const createExterneMcpRoutes = (authorize: Authorize) => ({
  /** Alles wat de pagina nodig heeft in één verzoek: de verbindingen, de witte lijst en wat de klant echt kan. */
  'POST /api/owner/externe-mcp/overzicht': [async (ctx: Context) => {
    const gebruiker = await auth(authorize, ctx);
    if (!gebruiker) return error('OWNER_EXTERNE_MCP_SESSIE_VEREIST', 403);
    const rijen = await store.lijst(gebruiker.user.id);
    const verbindingen = [];
    for (const rij of rijen) verbindingen.push(publiek(rij, await store.toolsLijst(gebruiker.user.id, rij.id)));
    const hosts = toegestaneHosts();
    return json({
      observedAt: Date.now(),
      verbindingen,
      // De witte lijst houdt de EIGENAAR bij in een bestand op de server; de site kan haar niet wijzigen.
      witteLijst: { hosts, bron: externeMcpMogelijkheden.witteLijstBron, leeg: hosts.length === 0 },
      mogelijkheden: externeMcpMogelijkheden,
      protocol: { versies: MCP_KLANT_VERSIES, voorkeur: MCP_KLANT_VOORKEUR },
      grenzen: MCP_GRENZEN,
      authWijzen: MCP_AUTH_WIJZEN,
      oauth: { geimplementeerd: false, code: MCP_FOUT.oauthNietKlaar, ontbreekt: MCP_OAUTH_ONTBREEKT },
      ruimte: 'prive',
    });
  }],

  /** Toevoegen. Het adres wordt eerst gekeurd (https, geen geheim, witte lijst van de eigenaar). */
  'POST /api/owner/externe-mcp/toevoegen': [async (ctx: Context) => {
    const gebruiker = await auth(authorize, ctx);
    if (!gebruiker) return error('OWNER_EXTERNE_MCP_SESSIE_VEREIST', 403);
    const geweigerd = mutatieGeweigerd(gebruiker, ctx.body);
    if (geweigerd) return geweigerd;
    const body = lichaam(ctx.body);
    const authWijze = (MCP_AUTH_WIJZEN as readonly string[]).includes(String(body.authWijze)) ? String(body.authWijze) as McpAuthWijze : 'geen';
    // Eerlijk, geen knop-pustyshka: OAuth is niet geïmplementeerd en wordt dus geweigerd met de reden erbij.
    if (authWijze === 'oauth') return json({ ok: false, fout: MCP_FOUT.oauthNietKlaar, ontbreekt: MCP_OAUTH_ONTBREEKT }, 400);
    const { adres, fout } = keurAdres(body.adres);
    if (fout) return json({ ok: false, fout, witteLijst: fout === MCP_FOUT.hostNietToegestaan ? toegestaneHosts() : undefined }, 400);
    const token = typeof body.token === 'string' ? body.token.trim() : '';
    if (authWijze === 'bearer' && (!token || token.length > 4096)) return json({ ok: false, fout: MCP_FOUT.geenToegang }, 400);
    // DE RUIMTE WORDT HIER GEKOZEN, dus hier hoort ook de poort. Tot 20.10.2026 nam deze route `body.ruimte` zonder enige
    // controle over: iedereen met een sessie kon een vreemde MCP-server in de TECHNISCHE ruimte registreren. Nu beslist
    // dezelfde keten als bij elk ander AI-apparaat: eigenaar + actief technisch profiel + de stand van de dienst «ai» in de
    // technische gegevensruimte ('eigen'). Op 'gedeeld' gebruikt de technische ruimte de PERSOONLIJKE servers, dus hoort een
    // nieuwe technische rij daar niet; op 'uit' of 'bevroren' bestaat die ruimte helemaal niet.
    const poort = await aiVerbindingRuimte(gebruiker.user, { ...body, ruimte: ruimteOf(body.ruimte) });
    if ('fout' in poort) return json({ ok: false, fout: poort.fout, ...(poort.uitleg ? { uitleg: poort.uitleg } : {}) }, poort.status);
    const uitslag = await store.toevoegen(gebruiker.user.id, {
      adres, naam: kort(body.naam, 200), ruimte: poort.ruimte, authWijze, sleutelNaam: '',
    });
    if (!uitslag.ok) return json({ ok: false, fout: uitslag.fout }, 400);
    // Het token gaat naar de eigen kluis; alleen de NAAM komt bij de verbinding te staan.
    if (authWijze === 'bearer') {
      const sleutelNaam = sleutelNaamVoor(uitslag.verbinding.id);
      try { await ownerVaultBewarenIntern(gebruiker.user.id, sleutelNaam, 'other', 'externe-mcp', token); }
      catch (err) {
        await store.verwijderen(gebruiker.user.id, uitslag.verbinding.id);
        return json({ ok: false, fout: (err as Error).message.slice(0, 60) }, 400);
      }
      await store.sleutelZetten(gebruiker.user.id, uitslag.verbinding.id, sleutelNaam);
    }
    const rij = await store.een(gebruiker.user.id, uitslag.verbinding.id);
    return json({ ok: true, verbinding: rij ? publiek(rij, []) : null, plaintextReturned: false });
  }],

  /** Echt verbinden en de lijst met hulpmiddelen vernieuwen. */
  'POST /api/owner/externe-mcp/testen': [async (ctx: Context) => {
    const gebruiker = await auth(authorize, ctx);
    if (!gebruiker) return error('OWNER_EXTERNE_MCP_SESSIE_VEREIST', 403);
    const geweigerd = mutatieGeweigerd(gebruiker, ctx.body);
    if (geweigerd) return geweigerd;
    const id = kort(lichaam(ctx.body).id, 120);
    const rij = await store.een(gebruiker.user.id, id);
    if (!rij) return json({ ok: false, fout: MCP_FOUT.onbekendeVerbinding }, 404);
    const uitslag = await verbindingTesten(gebruiker.user.id, id);
    const na = await store.een(gebruiker.user.id, id);
    return json({
      ok: uitslag.ok, fout: uitslag.fout,
      vervoer: uitslag.vervoer, protocol: uitslag.protocol, server: uitslag.server, afgekapt: uitslag.afgekapt,
      resources: uitslag.resources, prompts: uitslag.prompts, lijstGewijzigd: uitslag.lijstGewijzigd, sessie: uitslag.sessieId,
      verbinding: na ? publiek(na, await store.toolsLijst(gebruiker.user.id, id)) : null,
    });
  }],

  /** De hele verbinding aan of uit. Uit = de AI ziet er niets meer van. */
  'POST /api/owner/externe-mcp/schakelen': [async (ctx: Context) => {
    const gebruiker = await auth(authorize, ctx);
    if (!gebruiker) return error('OWNER_EXTERNE_MCP_SESSIE_VEREIST', 403);
    const geweigerd = mutatieGeweigerd(gebruiker, ctx.body);
    if (geweigerd) return geweigerd;
    const body = lichaam(ctx.body);
    const ok = await store.schakelen(gebruiker.user.id, kort(body.id, 120), body.actief === true);
    return json({ ok, fout: ok ? '' : MCP_FOUT.onbekendeVerbinding }, ok ? 200 : 404);
  }],

  /** Eén hulpmiddel aan of uit: dit is de keuze van de gebruiker, niet van de vreemde server. */
  'POST /api/owner/externe-mcp/hulpmiddel': [async (ctx: Context) => {
    const gebruiker = await auth(authorize, ctx);
    if (!gebruiker) return error('OWNER_EXTERNE_MCP_SESSIE_VEREIST', 403);
    const geweigerd = mutatieGeweigerd(gebruiker, ctx.body);
    if (geweigerd) return geweigerd;
    const body = lichaam(ctx.body);
    const ok = await store.toolSchakelen(gebruiker.user.id, kort(body.id, 120), kort(body.naam, 120), body.aan === true);
    return json({ ok, fout: ok ? '' : MCP_FOUT.geenTools }, ok ? 200 : 404);
  }],

  /** Loskoppelen: de verbinding weg, het geheugen van hulpmiddelen weg, en de sleutel uit de kluis weg. */
  'POST /api/owner/externe-mcp/verwijderen': [async (ctx: Context) => {
    const gebruiker = await auth(authorize, ctx);
    if (!gebruiker) return error('OWNER_EXTERNE_MCP_SESSIE_VEREIST', 403);
    const geweigerd = mutatieGeweigerd(gebruiker, ctx.body);
    if (geweigerd) return geweigerd;
    const id = kort(lichaam(ctx.body).id, 120);
    const rij = await store.een(gebruiker.user.id, id);
    if (!rij) return json({ ok: false, fout: MCP_FOUT.onbekendeVerbinding }, 404);
    const weg = await store.verwijderen(gebruiker.user.id, id);
    if (rij.sleutelNaam) await ownerVaultVerwijderenIntern(gebruiker.user.id, rij.sleutelNaam).catch(() => false);
    return json({ ok: weg, hulpmiddelen: (await store.toolsLijst(gebruiker.user.id, id)).length });
  }],
});
