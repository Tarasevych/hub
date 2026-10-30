// DE RUIMTE-DIMENSIE VAN TWEE DIENSTEN: «bord» (taken, notities, bureaublad, werkruimtes en blokken van de hub) en «github»
// (OAuth-app, GitHub App, de PAT-weg, het MCP-adres en de stand). Migratie 0086; het model en de poort staan vast in
// shared/ruimte-scheiding.ts en backend/ruimte-scheiding.ts — hier wordt niets daarvan opnieuw bedacht, alleen AANGESLOTEN.
//
// WAT DIT BESTAND DOET, EN WAAROM HET ÉÉN BESTAND IS
//  1. ÉÉN POORT VOOR ELKE WEG. Het bord en GitHub zijn langs vier wegen te bereiken: de site (met een tabblad), een
//     AI-verbinding (zonder tabblad, maar met de ruimte van de verbinding in backend/mcp-namens.ts), een agenttoken van de
//     MCP-console, en de interne aanroep van een hulpmiddel (backend/site-aanroep.ts, die in hetzelfde proces de route van
//     de site belt). Zouden al die wegen elk hun eigen poortje krijgen, dan is de kans groot dat er één wordt vergeten. Dus:
//     `bordPoort` / `githubPoort` hier, en nergens anders een eigen berekening.
//  2. EEN EERLIJKE WEIGERING. `ruimteWeigering` geeft de uitleg van de kern mee in beide talen plus de stand, zodat de
//     schermen van taken, notities, bureaublad en GitHub kunnen zeggen WAAROM er niets staat in plaats van een lege lijst te
//     tonen (opdracht van de eigenaar). `ruimteKop` hangt dezelfde feiten aan een geslaagd antwoord.
//  3. ECHTE INTREKKING BIJ BEVRIEZEN. De kern trekt bij rechtenverlies de technische AI-verbindingen in
//     (technischeVerbindingenIntrekken); GitHub hoort daar niet bij, want die tokens liggen in github_koppeling_v1. Daarom
//     meldt dit bestand zich bij DEZELFDE haak (bijTechRechtenVerlies, backend/tech-profiel.ts) en trekt het de TECHNISCHE
//     GitHub-koppeling echt in — bij OAuth met DELETE /applications/{client_id}/token, dus de token werkt daarna ook bij
//     GitHub zelf niet meer. De PERSOONLIJKE koppeling van diezelfde mens blijft volledig heel.
//     Omdat de kern ook een PASSIEVE weg heeft (de poort bevriest zelf wat nog niet bevroren was, ook als een nieuwe weg om
//     rechten te verliezen ooit vergeten wordt), doen de poortfuncties hier hetzelfde: zien zij 'BEVROREN', dan dwingen zij de
//     intrekking alsnog af. Eén keer per verzoek, idempotent, en nooit blokkerend.
//  4. OVERDRAGEN EN WISSEN. Beide diensten melden een uitvoerder aan (registreerLadeUitvoerder), zodat het besluit van de
//     servereigenaar over een bevroren lade — teruggeven / overdragen / verwijderen — echt rijen verplaatst of wist in plaats
//     van alleen een vlag te zetten. Elke uitvoerder raakt UITSLUITEND de technische lade en is idempotent.
import { createHash } from 'node:crypto';
import { db, json } from '../server/platform';
import { getPool } from '../server/platform/pg';
import {
  DIENST_NAAM, STAND_NAAM, STAND_UITLEG, hoortBij, ladeVelden, sqlLadeWaar,
  type DeelbareDienst, type DienstStand, type Lade, type LadeBesluit,
} from '../shared/ruimte-scheiding';
import { gegevensLade, registreerLadeUitvoerder, standVan, type LadeRegel } from './ruimte-scheiding';
import { bijTechRechtenVerlies } from './tech-profiel';
import { huidigeRuimte } from './mcp-namens';
import type { AiRuimte } from '../shared/ai-ruimte';
import { koppelingBewaren, koppelingenVanLade, statesVanLadeWissen, KOPPELING_TABEL } from './github-koppeling-opslag';
import { oauthOntkoppelen } from './github-oauth';
import { appOntkoppelen } from './github-app';

const sys = () => getPool('systeem');

// ------------------------------------------------------------------------------------------------ de poort, één keer
/** Waar een verzoek vandaan komt. `tabContext` is de site; ontbreekt die, dan geldt de ruimte van de AI-verbinding. */
export type Herkomst = { userId: string; rol?: string | null; tabContext?: unknown; aiRuimte?: AiRuimte | null };

/**
 * Uit welke lade mag dit verzoek van het BORD lezen en schrijven? Taken, notities (etiket 'hub'), het bureaublad en de
 * werkruimtes/blokken van de hub horen bij dezelfde lade: het zijn verschillende tabellen van ÉÉN dienst, dus één stand.
 * De aliassen notities/notes/taken/tasks/board komen in de kern op 'bord' uit; hier wordt de naam nooit zelf verzonnen.
 */
export const bordPoort = (h: Herkomst): Promise<LadeBesluit> => poort(h, 'bord');
/** Idem voor GITHUB: OAuth, GitHub App, de PAT-weg, het MCP-adres en de stand van de koppelkaart. */
export const githubPoort = (h: Herkomst): Promise<LadeBesluit> => poort(h, 'github');

async function poort(h: Herkomst, dienst: DeelbareDienst): Promise<LadeBesluit> {
  const tab = typeof h.tabContext === 'string' ? h.tabContext : '';
  // Zonder tabblad geldt de ruimte van de AI-VERBINDING. Die staat in backend/mcp-namens.ts (AsyncLocalStorage), dus zij
  // overleeft de interne aanroep van site-aanroep.ts; een HTTP-verzoek kan haar niet meegeven. Zegt zij 'prive', dan is de
  // lade persoonlijk — ook als de mens zelf een technisch profiel open heeft staan.
  const aiRuimte = h.aiRuimte ?? (tab ? null : huidigeRuimte());
  const besluit = await gegevensLade({ userId: h.userId, rol: h.rol ?? null, tabContext: tab, aiRuimte, dienst });
  // Passieve veiligheid, net als in de kern: is deze lade bevroren, dan hoort de technische GitHub-koppeling weg te zijn.
  if (!besluit.ok && besluit.code === 'BEVROREN' && dienst === 'github') void bevriezingAfdwingen(h.userId, 'poort');
  return besluit;
}

// ------------------------------------------------------------------------------------------------ eerlijk antwoord
export type RuimteKop = {
  ruimte: AiRuimte; stand: DienstStand; gedeeld: boolean; dienst: DeelbareDienst;
  naam: { uk: string; nl: string }; uitleg: { uk: string; nl: string };
};
/** Bij een GESLAAGD antwoord: in welke ruimte kijkt deze mens, en wat betekent die stand. Het scherm kan het dan zeggen. */
export const ruimteKop = (besluit: LadeBesluit & { ok: true }): RuimteKop => ({
  ruimte: besluit.lade.ruimte, stand: besluit.stand, gedeeld: besluit.gedeeld, dienst: besluit.dienst,
  naam: DIENST_NAAM[besluit.dienst], uitleg: STAND_UITLEG[besluit.stand],
});
/**
 * Bij een WEIGERING: 403 met de code én de uitleg in beide talen, plus de naam van de dienst en de standnamen. Geen leeg
 * scherm en geen lege lijst: de reden gaat mee naar de browser. `error()` van het platform geeft alleen `{error}`, dus hier
 * wordt dezelfde vorm met de hand aangevuld — het veld `error` blijft op dezelfde plek staan voor alles wat erop let.
 */
export function ruimteWeigering(besluit: LadeBesluit & { ok: false }, dienst: DeelbareDienst): ReturnType<typeof json> {
  return json({
    error: besluit.code,
    ruimte: 'technisch' as AiRuimte,
    dienst, dienstNaam: DIENST_NAAM[dienst],
    uitleg: besluit.uitleg,
    standen: STAND_NAAM,
  }, 403);
}
/** Kort: of de poort open is, en zo niet welk antwoord eruit moet. Scheelt in elke route drie regels en een vergeten geval. */
export async function bordLade(h: Herkomst): Promise<{ ok: true; lade: Lade; kop: RuimteKop } | { ok: false; resp: ReturnType<typeof json> }> {
  const b = await bordPoort(h);
  return b.ok ? { ok: true, lade: b.lade, kop: ruimteKop(b) } : { ok: false, resp: ruimteWeigering(b, 'bord') };
}
export async function githubLade(h: Herkomst): Promise<{ ok: true; lade: Lade; kop: RuimteKop } | { ok: false; resp: ReturnType<typeof json> }> {
  const b = await githubPoort(h);
  return b.ok ? { ok: true, lade: b.lade, kop: ruimteKop(b) } : { ok: false, resp: ruimteWeigering(b, 'github') };
}
/** Voor hulpmiddelen van een AI: daar is geen HTTP-antwoord, dus een fout met de code die het model kan uitleggen. */
export class RuimteGeslotenFout extends Error {
  constructor(public code: string, public uitleg: { uk: string; nl: string }, public dienst: DeelbareDienst) {
    // De uitleg staat IN de melding: een hulpmiddel heeft geen scherm, dus dit is de enige plek waar het model de reden
    // te zien krijgt. Zonder dat zou een AI een leeg bord melden in plaats van «deze dienst staat uit in de technische ruimte».
    super(`RUIMTE_GESLOTEN:${code} — ${uitleg.uk} / ${uitleg.nl}`);
  }
}
export async function ladeVoorTool(h: Herkomst, dienst: 'bord' | 'github'): Promise<Lade> {
  const b = dienst === 'bord' ? await bordPoort(h) : await githubPoort(h);
  if (!b.ok) throw new RuimteGeslotenFout(b.code, b.uitleg, dienst);
  return b.lade;
}

// ------------------------------------------------------------------------------------------------ GitHub: echt intrekken
/** Eén keer per mens tegelijk; zo maakt de passieve controle bij een stortvloed verzoeken geen stortvloed aanroepen. */
const bezig = new Set<string>();
/**
 * De TECHNISCHE GitHub-koppeling echt intrekken, en de persoonlijke met rust laten. Dit is wat de eigenaar vroeg: «токен
 * технічного простору не має переживати втрату прав».
 *   OAuth → `oauthOntkoppelen(userId, 'technisch')`: DELETE /applications/{client_id}/token bij GitHub zelf, daarna de rij weg;
 *   App   → `appOntkoppelen(userId, 'technisch')`: het bewaarde installatietoken weg (een installatietoken is niet in te
 *           trekken en leeft minder dan een uur; de installatie zelf verwijdert de mens op GitHub);
 *   flows → elke lopende technische OAuth-flow weg, zodat een halfafgemaakte flow geen token meer kan opleveren.
 * De PAT blijft waar hij is: hij is persoonlijk (backend/github-toegang.ts) en de technische lade heeft hem nooit gebruikt.
 * Idempotent, en nooit blokkerend: een tweede aanroep vindt niets meer en faalt niet.
 */
export async function githubTechnischIntrekken(userId: string, reden = 'rol-weg'): Promise<{ oauth: boolean; app: boolean; flows: number }> {
  if (!userId) return { oauth: false, app: false, flows: 0 };
  let oauth = false, app = false, flows = 0;
  try { const u = await oauthOntkoppelen(userId, 'technisch'); oauth = u.ok ? u.data.ingetrokken : false; }
  catch (err) { console.error('[ruimte-bord-github] technische OAuth-koppeling intrekken mislukt:', (err as Error).message); }
  try { const u = await appOntkoppelen(userId, 'technisch'); app = u.ok ? u.data.verwijderd : false; }
  catch (err) { console.error('[ruimte-bord-github] technisch installatietoken wissen mislukt:', (err as Error).message); }
  try { flows = await statesVanLadeWissen(userId, 'technisch'); }
  catch (err) { console.error('[ruimte-bord-github] technische OAuth-flows wissen mislukt:', (err as Error).message); }
  if (oauth || app || flows) console.warn(`[ruimte-bord-github] technische GitHub-koppeling ingetrokken (${reden}) voor ${userId}`);
  return { oauth, app, flows };
}

/** Bevriezen afdwingen: alleen doen als GitHub in de technische lade ECHT bevroren staat, en hoogstens één keer tegelijk. */
export async function bevriezingAfdwingen(userId: string, reden = 'bevroren'): Promise<void> {
  if (!userId || bezig.has(userId)) return;
  bezig.add(userId);
  try {
    if ((await standVan(userId, 'github')) !== 'bevroren') return;
    const rijen = await koppelingenVanLade(userId, 'technisch');
    if (!rijen.length) return;
    await githubTechnischIntrekken(userId, reden);
  } catch (err) { console.error('[ruimte-bord-github] bevriezing afdwingen mislukt:', (err as Error).message); }
  finally { bezig.delete(userId); }
}

// Dezelfde haak als de kern gebruikt (backend/tech-profiel.ts → meldRechtenVerlies). De kern trekt de AI-verbindingen in,
// dit de GitHub-koppeling; de lijst met luisteraars draagt ze beide, dus er gaat niets verloren en er is geen tweede weg.
bijTechRechtenVerlies((userId, oorzaak) => { void githubTechnischIntrekken(userId, String(oorzaak)); });

// ------------------------------------------------------------------------------------------------ uitvoerders: bord
/** Dezelfde tabelnamen als backend/hub-bureau.ts en backend/hub-indeling-voorkeuren.ts (één rij per mens, per lade). */
const bureauTabel = (owner: string) => `hub_bureau_v1:${createHash('sha256').update(owner).digest('hex').slice(0, 32)}`;
const indelingTabel = (owner: string) => `hub_layout_preferences_v1:${createHash('sha256').update(owner).digest('hex').slice(0, 32)}`;

type RecordRij = { id: string; ownerUserId?: unknown; userId?: unknown; ruimte?: unknown };
/** Alle rijen van ÉÉN lade uit een records-tabel. 'prive' telt een ontbrekend veld mee (hoortBij), 'technisch' nooit. */
async function rijenVanLade(tabel: string, lade: Lade, filter: Record<string, unknown>): Promise<RecordRij[]> {
  const uit = await db.list<RecordRij>(tabel, { filter, limit: 500 });
  return (uit.items as RecordRij[]).filter((r) => hoortBij(r, lade));
}

/**
 * Het bord: taken en notities staan in de echte tabel app.mcp_console_items (kolom `ruimte`, migratie 0086); het bureaublad,
 * de blokvoorkeuren, de werkruimtes en de blokken liggen als JSON in app.records (veld `ruimte`).
 *
 * «Overdragen» betekent: naar de lade van de SERVEREIGENAAR, en wel naar zijn TECHNISCHE lade — niet naar zijn persoonlijke.
 * Anders zou een besluit over andermans technische gegevens stil in de eigen notities en taken van de eigenaar belanden. De
 * rijen blijven dus gescheiden, nu onder zijn beheer. Bestaat daar al een rij die er maar één mag zijn (bureaublad,
 * blokvoorkeuren), dan blijft die van de eigenaar staan en wordt alleen de bevroren rij opgeruimd — met een opmerking in het
 * verslag, zodat niemand denkt dat er iets is overgenomen wat er niet is.
 */
registreerLadeUitvoerder({
  dienst: 'bord', naam: 'bord-mcp-console-hub',
  async overdragen({ vanUserId, naarUserId, lade }) {
    const regels: LadeRegel[] = [];
    const items = (await sys().query(
      `UPDATE app.mcp_console_items SET user_id = $2, ruimte = 'technisch', updated_at = now()
        WHERE ${sqlLadeWaar('ruimte', lade, 1)} RETURNING id`, [vanUserId, naarUserId])).rowCount ?? 0;
    regels.push({ tabel: 'app.mcp_console_items', rijen: items, opmerking: 'taken en notities, naar de technische lade van de eigenaar' });
    for (const [soort, tabelVan, tabelNaar] of [
      ['bureaublad', bureauTabel(vanUserId), bureauTabel(naarUserId)],
      ['blokvoorkeuren', indelingTabel(vanUserId), indelingTabel(naarUserId)],
    ] as const) {
      const bron = await rijenVanLade(tabelVan, lade, { ownerUserId: vanUserId });
      const doelLade: Lade = { userId: naarUserId, ruimte: 'technisch' };
      const alAanwezig = (await rijenVanLade(tabelNaar, doelLade, { ownerUserId: naarUserId })).length > 0;
      if (!bron.length) { regels.push({ tabel: soort, rijen: 0 }); continue; }
      if (alAanwezig) {
        await db.delete(tabelVan, bron.map((r) => r.id));
        regels.push({ tabel: soort, rijen: 0, opmerking: 'de eigenaar had er al een; de bevroren rij is opgeruimd, niets overschreven' });
        continue;
      }
      for (const r of bron) {
        const { id, ...rest } = r as RecordRij & Record<string, unknown>;
        await db.add(tabelNaar, [{ ...rest, ...ladeVelden(doelLade), overgenomenVan: vanUserId, overgenomenOp: Date.now() }]);
      }
      await db.delete(tabelVan, bron.map((r) => r.id));
      regels.push({ tabel: soort, rijen: bron.length });
    }
    for (const tabel of ['workspaces', 'workspace_blocks'] as const) {
      const bron = await rijenVanLade(tabel, lade, { ownerUserId: vanUserId });
      for (const r of bron) {
        const { id, ...rest } = r as RecordRij & Record<string, unknown>;
        await db.update(tabel, [{ id, record: { ...rest, ...ladeVelden({ userId: naarUserId, ruimte: 'technisch' }), updatedAt: Date.now() } }]);
      }
      regels.push({ tabel, rijen: bron.length });
    }
    return regels;
  },
  async verwijderen({ userId, lade }) {
    const regels: LadeRegel[] = [];
    const items = (await sys().query(`DELETE FROM app.mcp_console_items WHERE ${sqlLadeWaar('ruimte', lade, 1)}`, [userId])).rowCount ?? 0;
    regels.push({ tabel: 'app.mcp_console_items', rijen: items });
    // Blokken eerst, dan de werkruimtes: anders blijven er blokken zonder werkruimte staan als de tweede stap misgaat.
    for (const [tabel, filter] of [
      [bureauTabel(userId), { ownerUserId: userId }],
      [indelingTabel(userId), { ownerUserId: userId }],
      ['workspace_blocks', { ownerUserId: userId }],
      ['workspaces', { ownerUserId: userId }],
    ] as const) {
      const rijen = await rijenVanLade(tabel, lade, filter as Record<string, unknown>);
      if (rijen.length) await db.delete(tabel, rijen.map((r) => r.id));
      regels.push({ tabel, rijen: rijen.length });
    }
    return regels;
  },
});

// ------------------------------------------------------------------------------------------------ uitvoerders: github
/**
 * GitHub is het bijzondere geval, en met opzet:
 *  • bij ELK besluit over een bevroren GitHub-lade wordt de technische token eerst ECHT ingetrokken. Een bevroren token die
 *    nog bij GitHub werkt, is geen bevroren token;
 *  • «overdragen» geeft de servereigenaar alleen de FEITEN van de koppeling (welk account, welke scopes, welke installatie,
 *    welke repositories) in zijn eigen TECHNISCHE lade — nooit de token zelf. Dat kan ook niet: het zegel is gebonden aan
 *    (mens, weg, ruimte) (backend/github-koppeling-opslag.ts → aad), dus de eigenaar kan de token van iemand anders niet
 *    openen, hoe hij de rij ook verplaatst. Dat is geen beperking om te omzeilen maar precies de bedoeling: wie de koppeling
 *    overneemt, koppelt zelf opnieuw. Het verslag zegt dat ook;
 *  • «verwijderen» laat na de intrekking niets achter;
 *  • de PERSOONLIJKE koppeling van dezelfde mens wordt in geen van beide gevallen aangeraakt (de uitvoerder leest alleen
 *    `koppelingenVanLade(userId, 'technisch')`).
 */
registreerLadeUitvoerder({
  dienst: 'github', naam: 'github-koppeling',
  async overdragen({ vanUserId, naarUserId, lade }) {
    const rijen = await koppelingenVanLade(vanUserId, lade.ruimte);
    const ingetrokken = await githubTechnischIntrekken(vanUserId, 'overdragen');
    const regels: LadeRegel[] = [];
    for (const r of rijen) {
      // De token is hierboven ingetrokken en de rij is weg; wat overgaat zijn de feiten, zonder enig zegel.
      await koppelingBewaren(naarUserId, r.pad, {
        login: r.login, scopes: r.scopes, installatie: r.installatie, repos: r.repos,
        tokenZegel: '', verversZegel: '', verlooptOp: 0, verversVerlooptOp: 0,
      }, 'technisch');
    }
    regels.push({
      tabel: KOPPELING_TABEL, rijen: rijen.length,
      opmerking: rijen.length
        ? `token ingetrokken (oauth=${ingetrokken.oauth}, app=${ingetrokken.app}); alleen de feiten zijn overgedragen — de nieuwe beheerder koppelt zelf opnieuw`
        : 'geen technische koppeling om over te dragen',
    });
    regels.push({ tabel: 'github_oauth_state_v1', rijen: ingetrokken.flows, opmerking: 'lopende technische OAuth-flows' });
    return regels;
  },
  async verwijderen({ userId, lade }) {
    const rijen = await koppelingenVanLade(userId, lade.ruimte);
    const ingetrokken = await githubTechnischIntrekken(userId, 'verwijderen');
    // githubTechnischIntrekken wist de rijen van de bekende wegen; wat er door een oudere versie nog staat, gaat hier weg.
    const rest = await koppelingenVanLade(userId, lade.ruimte);
    if (rest.length) await db.delete(KOPPELING_TABEL, rest.map((r) => r.id));
    return [
      { tabel: KOPPELING_TABEL, rijen: rijen.length, opmerking: `echt ingetrokken bij GitHub: oauth=${ingetrokken.oauth}, app=${ingetrokken.app}` },
      { tabel: 'github_oauth_state_v1', rijen: ingetrokken.flows },
    ];
  },
});
