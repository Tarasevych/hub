// Afstemming vNext (UI-014) — KERN: kaarten, revisies, append-only gebeurtenissen, criteria, import, geschiedenis/diff,
// legacy-migratie van de 25 claims (backend/waarheid-claims.ts) ZONDER hogere bewijslaag. Contract: shared/afstemming-model.ts;
// opslaglaag: backend/afstemming-opslag.ts (gedeeld met afstemming-koppel.ts).
//
// VASTE BESLISSINGEN
//   • optimistic concurrency: elke mutatie eist `versie`; afwijkend → 409 { error:'VERSIE_CONFLICT', huidig } — nooit stil
//     overschrijven, de client toont de verse kaart en de mens kiest;
//   • gebeurtenissen zijn append-only (alleen schrijfGebeurtenis); de geschiedenis is daardoor zelf het auditspoor;
//   • een AGENT (body.bron==='agent' bij voorstel/bewijs, body.alsAgent bij fase) mag voorstellen en bewijs aanhechten,
//     maar NOOIT keuren: fases uit FASE_MENS_VERPLICHT en production_verified → AGENT_MAG_NIET;
//   • production_verified alleen met een geslaagd production-bewijs (production_probe of e2e op production), anders
//     FASE_BEWIJS_ONTBREEKT; accepted alleen ná production_verified (FASE_ONGELDIG) — uitrol is nooit het bewijs;
//   • een criterium wordt pas «passed» met een bestaand, geslaagd bewijsstuk (BEWIJS_VEREIST);
//   • de parser van import verzint niets: onzekere velden staan in `onzeker`, en dezelfde invoer (hash) of een bezette
//     externId levert `bestaand` op — idempotent, geen duplicaat;
//   • eigen notities van de mens veranderen alleen via het aparte veld eigenNotitie (gebeurtenis 'notitie').
//
// Aanvullende foutcodes in de stijl van het contract (additief): TITEL_ONGELDIG, EXTERNID_ONGELDIG, STAND_ONGELDIG,
// BEWIJS_ONGELDIG, REVISIE_ONBEKEND, LIMIET_BEREIKT.
import { error, json } from '../server/platform';
import type { RouterMiddleware } from '../server/platform/router';
import {
  AFSTEMMING_LIMIETEN as LIMIET, FASE_MENS_VERPLICHT, LEVENSFASEN, afstemmingTekst, schoneExternId, schoneTitel,
  type Actor, type Criterium, type ImportVoorbeeld, type Kaart, type Levensfase,
} from '../shared/afstemming-model';
import {
  BESLUITEN, BEWIJS, GEBEURTENISSEN, IMPORTS, KOPPELINGEN, RELEASES, REVISIES,
  alleRecords, bewijsUit, eenKaartRecord, eenRevisieRecord, eigenKaarten, gebeurtenisUit, inhoudHashVan, kaartBijwerken, kaartUit,
  naarCriteria, naarTweetekst, naarVerificatie, nieuweKaartMetRevisie, nuIso, revisieUit, schrijfGebeurtenis, sha256Hex, str,
  volgendKrtNummer, zorgLegacySeed,
  type BewijsRecord, type GebeurtenisRecord, type ImportRecord, type KaartRecord, type MetId, type RevisieRecord, type Tweetekst,
} from './afstemming-opslag';
import { db } from '../server/platform';

type SessionOk = { user: { id: string; email?: string; role?: string; status?: string }; service: string };
type SessionFail = { errorCode: string };
type RequireSession = (event: Record<string, unknown>, body: unknown) => Promise<SessionOk | SessionFail>;
type Ctx = { event: Record<string, unknown>; body: unknown };
type Resp = ReturnType<typeof json>;
const DIENSTEN = ['api', 'hub', 'admin'] as const;
const fout = (code: string): never => { throw new Error(code); };

// ------------------------------------------------------------------------------------------------ hulpjes van de routes
const eigenaarActor = (auth: SessionOk): Actor => ({ soort: 'eigenaar', id: auth.user.id, ...(auth.user.email ? { naam: auth.user.email } : {}) });
const agentActor: Actor = { soort: 'agent', id: 'agent' };
const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : NaN);
const PRIORITEITEN = ['P0', 'P1', 'P2', 'P3'] as const;
const naarPrioriteit = (v: unknown): Kaart['prioriteit'] => (PRIORITEITEN.includes(str(v) as never) ? (str(v) as Kaart['prioriteit']) : 'P2');
const kleineTekst = (v: unknown, max: number): string => schoneTitel(v).slice(0, max);
const grootTekst = (v: unknown): string => String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]+/g, ' ').trim().slice(0, LIMIET.tekstMax);

/** Woorden ≥4 tekens, kleine letters — de lexicale basis van «vergelijkbaar» (semantisch zoeken is gepland, geen belofte). */
const woordenVan = (tekst: string): Set<string> => new Set(tekst.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 4));
function vergelijkbaarMet(titel: Tweetekst, kaarten: ReadonlyArray<MetId<KaartRecord>>): ImportVoorbeeld['vergelijkbaar'] {
  const basis = woordenVan(`${titel[0]} ${titel[1]}`);
  const uit: ImportVoorbeeld['vergelijkbaar'] = [];
  for (const k of kaarten) {
    const samen = [...woordenVan(`${afstemmingTekst(k.titel, 'uk')} ${afstemmingTekst(k.titel, 'nl')}`)].filter((w) => basis.has(w));
    if (samen.length >= 2) uit.push({ kaartId: k.id, externId: k.externId, titel: k.titel, reden: `спільні слова: ${samen.slice(0, 4).join(', ')}` });
    if (uit.length >= 5) break;
  }
  return uit;
}

// ------------------------------------------------------------------------------------------------ importparsers (puur, verzinnen niets)
type Geparst = { kaart: ImportVoorbeeld['kaart']; onzeker: string[]; waarschuwingen: string[] };
function parsJson(inhoud: string): Geparst {
  let d: Record<string, unknown>;
  try { d = JSON.parse(inhoud) as Record<string, unknown>; } catch { return fout('IMPORT_ONGELDIG') as never; }
  if (!d || typeof d !== 'object' || Array.isArray(d)) fout('IMPORT_ONGELDIG');
  const onzeker: string[] = [];
  const waarschuwingen: string[] = [];
  const titel = naarTweetekst(d.title ?? d.titel, LIMIET.titelMax);
  if (!titel[0]) fout('IMPORT_ONGELDIG');
  const samenvatting = naarTweetekst(d.summary ?? d.samenvatting, LIMIET.samenvattingMax);
  if (!samenvatting[0]) onzeker.push('samenvatting');
  const dienst = kleineTekst(d.service ?? d.dienst, 40) || (onzeker.push('dienst'), '');
  const categorie = kleineTekst(d.category ?? d.categorie, 60) || (onzeker.push('categorie'), '');
  const prioriteitRuw = str(d.priority ?? d.prioriteit);
  if (!PRIORITEITEN.includes(prioriteitRuw as never)) onzeker.push('prioriteit');
  const ruweCriteria = Array.isArray(d.acceptance_criteria) ? d.acceptance_criteria : Array.isArray(d.criteria) ? d.criteria : [];
  if (!ruweCriteria.length) onzeker.push('criteria');
  for (const c of ruweCriteria) {
    const v = (c as Record<string, unknown>)?.verification ?? (c as Record<string, unknown>)?.verificatie;
    if (v && naarVerificatie(v) === 'owner' && !str(v).toLowerCase().includes('owner')) waarschuwingen.push(`верифікацію «${str(v).slice(0, 40)}» зведено до «owner»`);
  }
  const criteria = naarCriteria(ruweCriteria).map((c) => ({ id: c.id, tekst: afstemmingTekst(c.tekst, 'uk'), verificatie: c.verificatie }));
  const externId = schoneExternId(d.external_id ?? d.externId);
  return {
    kaart: { ...(externId ? { externId } : {}), titel, samenvatting, dienst, categorie, prioriteit: naarPrioriteit(prioriteitRuw), bedoeling: grootTekst(d.user_intent ?? d.bedoeling), criteria },
    onzeker, waarschuwingen,
  };
}
function parsMd(inhoud: string): Geparst {
  const regels = inhoud.split('\n');
  const onzeker: string[] = [];
  const kop = regels.find((r) => /^#\s+\S/.test(r));
  const titelTekst = kop ? kop.replace(/^#\s+/, '') : (regels.find((r) => r.trim()) || '');
  if (!titelTekst.trim()) fout('IMPORT_ONGELDIG');
  // Eerste gewone alinea (geen kop, geen lijst) = samenvatting; criteria onder «## Критерії» of «## Criteria» als «- »-regels.
  let samenvatting = '';
  for (const r of regels) { const t = r.trim(); if (!t || /^#/.test(t) || /^[-*]\s/.test(t) || t === titelTekst.trim()) continue; samenvatting = t; break; }
  if (!samenvatting) onzeker.push('samenvatting');
  const criteria: Array<{ id: string; tekst: string; verificatie: Criterium['verificatie'] }> = [];
  let inCriteria = false;
  for (const r of regels) {
    const t = r.trim();
    if (/^##\s+/.test(t)) { inCriteria = /критері|criteria/i.test(t); continue; }
    if (inCriteria && /^[-*]\s+\S/.test(t)) criteria.push({ id: `C-${criteria.length + 1}`, tekst: t.replace(/^[-*]\s+/, '').slice(0, LIMIET.criteriumMax), verificatie: 'owner' });
  }
  if (!criteria.length) onzeker.push('criteria');
  onzeker.push('dienst', 'categorie', 'prioriteit');
  return { kaart: { titel: naarTweetekst(titelTekst, LIMIET.titelMax), samenvatting: naarTweetekst(samenvatting, LIMIET.samenvattingMax), dienst: '', categorie: '', prioriteit: 'P2', bedoeling: grootTekst(inhoud), criteria: criteria.slice(0, LIMIET.criteriaMax) }, onzeker, waarschuwingen: [] };
}
function parsTxt(inhoud: string): Geparst {
  const regels = inhoud.split('\n').map((r) => r.trim());
  const titel = regels.find((r) => r.length > 0) || '';
  if (!titel) fout('IMPORT_ONGELDIG');
  const rest = inhoud.slice(inhoud.indexOf(titel) + titel.length).trim();
  return { kaart: { titel: naarTweetekst(titel, LIMIET.titelMax), samenvatting: naarTweetekst(rest.split('\n')[0] || '', LIMIET.samenvattingMax), dienst: '', categorie: '', prioriteit: 'P2', bedoeling: grootTekst(rest), criteria: [] }, onzeker: ['samenvatting', 'dienst', 'categorie', 'prioriteit', 'criteria'], waarschuwingen: [] };
}

// ------------------------------------------------------------------------------------------------ routes
export function afstemmingKernRoutes(requireSession: RequireSession): Record<string, RouterMiddleware[]> {
  const route = (run: (ctx: Ctx, auth: SessionOk, d: Record<string, unknown>) => Promise<Resp>): RouterMiddleware[] => [(async (raw: unknown) => {
    const ctx = raw as unknown as Ctx;
    const auth = await requireSession(ctx.event, ctx.body);
    if ('errorCode' in auth) return error(auth.errorCode, auth.errorCode.includes('FORBIDDEN') ? 403 : 401);
    if (!(DIENSTEN as readonly string[]).includes(auth.service)) return error('OWNER_CLOUD_SESSION_REQUIRED', 403);
    if (auth.user.role !== 'owner') return error('ACCOUNT_NOT_APPROVED', 403);
    try { return await run(ctx, auth, (ctx.body && typeof ctx.body === 'object' ? ctx.body : {}) as Record<string, unknown>); }
    catch (err) {
      const code = String((err as Error)?.message || 'AFSTEMMING_FOUT').slice(0, 80);
      const status = code === 'KAART_ONBEKEND' || code === 'REVISIE_ONBEKEND' || code === 'CRITERIUM_ONBEKEND' ? 404 : code === 'AFSTEMMING_FOUT' || code === 'AFSTEMMING_OPSLAAN_MISLUKT' ? 500 : 400;
      return error(code, status);
    }
  }) as unknown as RouterMiddleware];

  /** Kaart laden of KAART_ONBEKEND; met versie-eis → 409 mét de verse kaart (de enige niet-{error}-vorm in dit contract). */
  const laadKaart = async (userId: string, id: unknown): Promise<MetId<KaartRecord>> => (await eenKaartRecord(userId, id)) ?? fout('KAART_ONBEKEND') as never;
  const versieOk = (kaart: MetId<KaartRecord>, versie: unknown): Resp | null =>
    num(versie) === Number(kaart.versie) ? null : json({ error: 'VERSIE_CONFLICT', huidig: kaartUit(kaart) }, 409);

  return {
    // -------------------------------------------------------------- overzicht
    'POST /api/owner/afstemming/overzicht': route(async (_c, auth) => {
      await zorgLegacySeed(auth.user.id);
      const kaarten = (await eigenKaarten(auth.user.id)).filter((k) => !k.gearchiveerd);
      const koppelingen = await alleRecords<{ stand?: string; soort?: string }>(KOPPELINGEN, { ownerUserId: auth.user.id, stand: 'voorgesteld' });
      const aandachtLijst = kaarten
        .filter((k) => k.levensfase === 'needs_review' || Number(k.openConflicten) > 0 || k.gezondheid === 'regressed')
        .sort((a, b) => String(b.bijgewerktOp).localeCompare(String(a.bijgewerktOp)));
      const recent = await db.list<GebeurtenisRecord>(GEBEURTENISSEN, { filter: { ownerUserId: auth.user.id }, limit: 8, nieuwsteEerst: true });
      return json({
        tellers: {
          kaarten: kaarten.length,
          aandacht: aandachtLijst.length,
          conflicten: koppelingen.filter((k) => k.soort === 'conflicts_with').length,
          zonderBewijs: kaarten.filter((k) => Number(k.criteriaTotaal) > 0 && Number(k.bewijs) === 0).length,
          kandidaten: koppelingen.length,
        },
        aandacht: aandachtLijst.slice(0, 6).map(kaartUit),
        recent: (recent.items as unknown as Array<MetId<GebeurtenisRecord>>).map(gebeurtenisUit),
        kandidaten: koppelingen.slice(0, 6),
      });
    }),

    // -------------------------------------------------------------- kartotheek (filters, zoeken, sorteren, pagina's)
    'POST /api/owner/afstemming/kaarten': route(async (_c, auth, d) => {
      await zorgLegacySeed(auth.user.id);
      const alles = (await eigenKaarten(auth.user.id)).filter((k) => !k.gearchiveerd);
      const zoek = kleineTekst(d.zoek, LIMIET.zoekMax).toLowerCase();
      const dienst = kleineTekst(d.dienst, 40);
      const categorie = kleineTekst(d.categorie, 60);
      const fase = str(d.fase);
      const gezondheid = str(d.gezondheid);
      let lijst = alles;
      if (zoek.length >= LIMIET.zoekMin) lijst = lijst.filter((k) => `${afstemmingTekst(k.titel, 'uk')} ${afstemmingTekst(k.titel, 'nl')} ${afstemmingTekst(k.samenvatting, 'uk')} ${afstemmingTekst(k.samenvatting, 'nl')} ${k.externId}`.toLowerCase().includes(zoek));
      if (dienst) lijst = lijst.filter((k) => k.dienst === dienst);
      if (categorie) lijst = lijst.filter((k) => k.categorie === categorie);
      if (fase) lijst = lijst.filter((k) => k.levensfase === fase);
      if (gezondheid) lijst = lijst.filter((k) => k.gezondheid === gezondheid);
      if (d.conflict === true) lijst = lijst.filter((k) => Number(k.openConflicten) > 0);
      const sorteer = str(d.sorteer) || 'bijgewerkt';
      // Natuurlijke oplopende volgorde per sleutel; zonder expliciete keuze: datums nieuwste eerst, titel A→Z, prioriteit P0 eerst.
      const kleiner: Record<string, (a: MetId<KaartRecord>, b: MetId<KaartRecord>) => number> = {
        bijgewerkt: (a, b) => String(a.bijgewerktOp).localeCompare(String(b.bijgewerktOp)),
        aangemaakt: (a, b) => String(a.aangemaaktOp).localeCompare(String(b.aangemaaktOp)),
        titel: (a, b) => afstemmingTekst(a.titel, 'uk').localeCompare(afstemmingTekst(b.titel, 'uk'), 'uk'),
        prioriteit: (a, b) => PRIORITEITEN.indexOf(a.prioriteit).valueOf() - PRIORITEITEN.indexOf(b.prioriteit),
      };
      const basis = kleiner[sorteer] ?? kleiner.bijgewerkt;
      const standaardOplopend = sorteer === 'titel' || sorteer === 'prioriteit';
      const oplopend = typeof d.oplopend === 'boolean' ? d.oplopend : standaardOplopend;
      lijst = [...lijst].sort((a, b) => (oplopend ? basis(a, b) : -basis(a, b)));
      const vanaf = Math.max(0, Math.floor(num(d.token)) || 0);
      const blad = lijst.slice(vanaf, vanaf + LIMIET.lijstPagina);
      return json({
        kaarten: blad.map(kaartUit),
        volgende: vanaf + blad.length < lijst.length ? String(vanaf + blad.length) : null,
        totaal: lijst.length,
        diensten: [...new Set(alles.map((k) => k.dienst).filter(Boolean))].sort(),
        categorieen: [...new Set(alles.map((k) => k.categorie).filter(Boolean))].sort(),
      });
    }),

    // -------------------------------------------------------------- één kaart, volledig dossier
    'POST /api/owner/afstemming/kaart': route(async (_c, auth, d) => {
      const kaart = await laadKaart(auth.user.id, d.id);
      const [revisie, koppelingen, bewijs, releases, besluiten] = await Promise.all([
        eenRevisieRecord(auth.user.id, kaart.revisieId),
        alleRecords<Record<string, unknown>>(KOPPELINGEN, { ownerUserId: auth.user.id }),
        alleRecords<BewijsRecord>(BEWIJS, { ownerUserId: auth.user.id, kaartId: kaart.id }),
        alleRecords<Record<string, unknown>>(RELEASES, { ownerUserId: auth.user.id, kaartId: kaart.id }),
        alleRecords<Record<string, unknown>>(BESLUITEN, { ownerUserId: auth.user.id, kaartId: kaart.id }),
      ]);
      if (!revisie) fout('REVISIE_ONBEKEND');
      const strip = (r: MetId<Record<string, unknown>>) => { const { ownerUserId: _o, ...rest } = r; return rest; };
      return json({
        kaart: kaartUit(kaart), revisie: revisieUit(revisie as MetId<RevisieRecord>),
        koppelingen: koppelingen.filter((k) => k.van === kaart.id || k.naar === kaart.id).map(strip),
        bewijs: bewijs.map(bewijsUit), releases: releases.map(strip), besluiten: besluiten.map(strip),
      });
    }),

    // -------------------------------------------------------------- voorstel (mens of agent; idempotent)
    'POST /api/owner/afstemming/voorstel': route(async (_c, auth, d) => {
      const titel = naarTweetekst(d.titel, LIMIET.titelMax);
      if (!titel[0]) fout('TITEL_ONGELDIG');
      if (String(d.bedoeling ?? '').length > LIMIET.tekstMax || String(d.verwachtGedrag ?? '').length > LIMIET.tekstMax) fout('TEKST_TE_LANG');
      const idempotentie = kleineTekst(d.idempotentie, 120);
      const bestaande = await eigenKaarten(auth.user.id);
      if (idempotentie) {
        const zelfde = bestaande.find((k) => k.idempotentie === idempotentie);
        if (zelfde) return json({ kaart: kaartUit(zelfde) });
      }
      let externId = '';
      if (d.externId !== undefined && d.externId !== '') {
        externId = schoneExternId(d.externId);
        if (!externId) fout('EXTERNID_ONGELDIG');
        if (bestaande.some((k) => k.externId === externId)) fout('IDEMPOTENTIE_BOTSING');
      } else {
        externId = volgendKrtNummer(bestaande);
        while (bestaande.some((k) => k.externId === externId)) externId = `${externId}-2`;
      }
      const alsAgent = str(d.bron) === 'agent';
      const { kaart } = await nieuweKaartMetRevisie(auth.user.id, {
        externId, titel,
        samenvatting: naarTweetekst(d.samenvatting, LIMIET.samenvattingMax),
        bedoeling: grootTekst(d.bedoeling), verwachtGedrag: grootTekst(d.verwachtGedrag),
        criteria: naarCriteria(d.criteria), dienst: kleineTekst(d.dienst, 40), categorie: kleineTekst(d.categorie, 60),
        prioriteit: naarPrioriteit(d.prioriteit),
        bronSoort: alsAgent ? 'agent' : 'gesprek', provenance: alsAgent ? 'agent-voorstel' : 'gesprek-eigenaar',
        actor: alsAgent ? agentActor : eigenaarActor(auth),
        levensfase: 'draft', // ook een agentvoorstel begint ALTIJD als concept — keuren doet de mens
        ...(idempotentie ? { idempotentie } : {}),
      });
      return json({ kaart: kaartUit(kaart) });
    }),

    // -------------------------------------------------------------- wijzig (nieuwe revisie; eigenNotitie apart)
    'POST /api/owner/afstemming/wijzig': route(async (_c, auth, d) => {
      const kaart = await laadKaart(auth.user.id, d.id);
      const conflict = versieOk(kaart, d.versie);
      if (conflict) return conflict;
      const velden = (d.velden && typeof d.velden === 'object' ? d.velden : {}) as Record<string, unknown>;
      const huidig = await eenRevisieRecord(auth.user.id, kaart.revisieId);
      if (!huidig) fout('REVISIE_ONBEKEND');
      let bijgewerkt = kaart;
      // 1) de notitie van de mens — nooit via een revisie, altijd als eigen gebeurtenis
      if (velden.eigenNotitie !== undefined) {
        const notitie = grootTekst(velden.eigenNotitie);
        bijgewerkt = await kaartBijwerken(auth.user.id, bijgewerkt, { eigenNotitie: notitie });
        await schrijfGebeurtenis(auth.user.id, kaart.id, 'notitie', eigenaarActor(auth), 'eigenaar', { lengte: notitie.length });
      }
      // 2) inhoudelijke velden → nieuwe revisie
      const inhoudelijk = ['titel', 'samenvatting', 'bedoeling', 'verwachtGedrag', 'criteria', 'dienst', 'categorie', 'prioriteit'].filter((v) => velden[v] !== undefined);
      if (!inhoudelijk.length) {
        if (velden.eigenNotitie === undefined) fout('TITEL_ONGELDIG'); // lege wijziging — niets om te bewaren
        return json({ kaart: kaartUit(bijgewerkt), revisie: revisieUit(huidig!) });
      }
      if (String(velden.bedoeling ?? '').length > LIMIET.tekstMax || String(velden.verwachtGedrag ?? '').length > LIMIET.tekstMax) fout('TEKST_TE_LANG');
      const titel = velden.titel !== undefined ? naarTweetekst(velden.titel, LIMIET.titelMax) : (huidig!.titel as Tweetekst);
      if (!titel[0]) fout('TITEL_ONGELDIG');
      // Criteria: stand van bestaande (zelfde id) blijft behouden — een tekstwijziging wist geen testuitslag van een ANDER criterium.
      let criteria = huidig!.criteria;
      if (velden.criteria !== undefined) {
        const oud = new Map(huidig!.criteria.map((c) => [c.id, c.stand]));
        criteria = naarCriteria(velden.criteria).map((c) => ({ ...c, stand: oud.get(c.id) ?? 'not_tested' }));
      }
      const basis = {
        titel, samenvatting: velden.samenvatting !== undefined ? naarTweetekst(velden.samenvatting, LIMIET.samenvattingMax) : (huidig!.samenvatting as Tweetekst),
        bedoeling: velden.bedoeling !== undefined ? grootTekst(velden.bedoeling) : huidig!.bedoeling,
        verwachtGedrag: velden.verwachtGedrag !== undefined ? grootTekst(velden.verwachtGedrag) : huidig!.verwachtGedrag,
        criteria, dienst: velden.dienst !== undefined ? kleineTekst(velden.dienst, 40) : huidig!.dienst,
        categorie: velden.categorie !== undefined ? kleineTekst(velden.categorie, 60) : huidig!.categorie,
        prioriteit: velden.prioriteit !== undefined ? naarPrioriteit(velden.prioriteit) : huidig!.prioriteit,
      };
      const revisie: RevisieRecord = {
        ownerUserId: auth.user.id, kaartId: kaart.id, ouderId: kaart.revisieId, nummer: Number(kaart.revisieNummer) + 1,
        ...basis, gemaaktDoor: eigenaarActor(auth), gemaaktOp: nuIso(), inhoudHash: inhoudHashVan(basis),
      };
      const [revisieId] = await db.add(REVISIES, [revisie as unknown as Record<string, unknown>]);
      if (!revisieId) fout('AFSTEMMING_OPSLAAN_MISLUKT');
      bijgewerkt = await kaartBijwerken(auth.user.id, bijgewerkt, {
        revisieId: String(revisieId), revisieNummer: revisie.nummer,
        titel: basis.titel, samenvatting: basis.samenvatting, dienst: basis.dienst, categorie: basis.categorie, prioriteit: basis.prioriteit,
        criteriaTotaal: basis.criteria.length, criteriaGeslaagd: basis.criteria.filter((c) => c.stand === 'passed').length,
      });
      await schrijfGebeurtenis(auth.user.id, kaart.id, 'revisie', eigenaarActor(auth), 'eigenaar', { van: kaart.revisieNummer, naar: revisie.nummer, velden: inhoudelijk, revisieId: String(revisieId), ouderRevisieId: kaart.revisieId, ouderNummer: kaart.revisieNummer }); /* de ids maken de revisie-diff in de UI mogelijk */
      return json({ kaart: kaartUit(bijgewerkt), revisie: { ...revisieUit({ ...revisie, id: String(revisieId) } as MetId<RevisieRecord>) } });
    }),

    // -------------------------------------------------------------- fase (de twee assen blijven gescheiden)
    'POST /api/owner/afstemming/fase': route(async (_c, auth, d) => {
      const kaart = await laadKaart(auth.user.id, d.id);
      const conflict = versieOk(kaart, d.versie);
      if (conflict) return conflict;
      const fase = str(d.fase) as Levensfase;
      if (!LEVENSFASEN.includes(fase)) fout('FASE_ONGELDIG');
      // Een agent (of een MCP-wrapper die zich zo aandient) mag NOOIT keuren of production-succes verklaren.
      if (d.alsAgent === true && (FASE_MENS_VERPLICHT.includes(fase) || fase === 'production_verified')) fout('AGENT_MAG_NIET');
      if (fase === 'production_verified') {
        const stukken = await alleRecords<BewijsRecord>(BEWIJS, { ownerUserId: auth.user.id, kaartId: kaart.id });
        const bewijs = stukken.some((s) => (s.soort === 'production_probe' || s.soort === 'e2e') && s.omgeving === 'production' && s.resultaat === 'geslaagd');
        if (!bewijs) fout('FASE_BEWIJS_ONTBREEKT');
      }
      if (fase === 'accepted' && kaart.levensfase !== 'production_verified') fout('FASE_ONGELDIG');
      const bijgewerkt = await kaartBijwerken(auth.user.id, kaart, { levensfase: fase });
      await schrijfGebeurtenis(auth.user.id, kaart.id, 'fase', eigenaarActor(auth), 'eigenaar', { van: kaart.levensfase, naar: fase, ...(str(d.reden) ? { reden: kleineTekst(d.reden, 400) } : {}) });
      return json({ kaart: kaartUit(bijgewerkt) });
    }),

    // -------------------------------------------------------------- criterium (passed alleen mét bewijs)
    'POST /api/owner/afstemming/criterium': route(async (_c, auth, d) => {
      const kaart = await laadKaart(auth.user.id, d.id);
      const conflict = versieOk(kaart, d.versie);
      if (conflict) return conflict;
      const revisie = await eenRevisieRecord(auth.user.id, kaart.revisieId);
      if (!revisie) fout('REVISIE_ONBEKEND');
      const criteriumId = str(d.criteriumId);
      const stand = str(d.stand) as Criterium['stand'];
      if (!['not_tested', 'passed', 'failed', 'stale'].includes(stand)) fout('STAND_ONGELDIG');
      const idx = revisie!.criteria.findIndex((c) => c.id === criteriumId);
      if (idx < 0) fout('CRITERIUM_ONBEKEND');
      let bewijsId = '';
      if (stand === 'passed') {
        bewijsId = str(d.bewijsId);
        if (!bewijsId) fout('BEWIJS_VEREIST');
        const [stuk] = await db.get<BewijsRecord>(BEWIJS, [bewijsId]);
        if (!stuk || stuk.ownerUserId !== auth.user.id || stuk.kaartId !== kaart.id || stuk.resultaat !== 'geslaagd') fout('BEWIJS_VEREIST');
      }
      const criteria = revisie!.criteria.map((c, i) => (i === idx ? { ...c, stand } : c));
      const { id: revId, ownerUserId: _o, ...revRest } = revisie!;
      const [ok] = await db.update(REVISIES, [{ id: revId, record: { ...revRest, ownerUserId: auth.user.id, criteria } as unknown as Record<string, unknown> }]);
      if (!ok) fout('AFSTEMMING_OPSLAAN_MISLUKT');
      const bijgewerkt = await kaartBijwerken(auth.user.id, kaart, { criteriaGeslaagd: criteria.filter((c) => c.stand === 'passed').length, criteriaTotaal: criteria.length });
      await schrijfGebeurtenis(auth.user.id, kaart.id, 'bewijs', eigenaarActor(auth), 'eigenaar', { criteriumId, stand, ...(bewijsId ? { bewijsId } : {}) });
      return json({ kaart: kaartUit(bijgewerkt) });
    }),

    // -------------------------------------------------------------- bewijs aanhechten (agent mag; keuren blijft menselijk)
    'POST /api/owner/afstemming/bewijs': route(async (_c, auth, d) => {
      const kaart = await laadKaart(auth.user.id, d.kaartId);
      const soort = str(d.soort) as (typeof SOORTEN)[number];
      const omgeving = str(d.omgeving) as (typeof OMGEVINGEN)[number];
      const resultaat = str(d.resultaat) as (typeof RESULTATEN)[number];
      if (!SOORTEN.includes(soort) || !OMGEVINGEN.includes(omgeving) || !RESULTATEN.includes(resultaat)) fout('BEWIJS_ONGELDIG');
      const verwijzing = kleineTekst(d.verwijzing, 500);
      if (!verwijzing) fout('BEWIJS_ONGELDIG');
      if (Number(kaart.bewijs) >= LIMIET.bewijsMax) fout('LIMIET_BEREIKT');
      let criteriumId = '';
      if (d.criteriumId !== undefined && d.criteriumId !== '') {
        criteriumId = str(d.criteriumId);
        const revisie = await eenRevisieRecord(auth.user.id, kaart.revisieId);
        if (!revisie || !revisie.criteria.some((c) => c.id === criteriumId)) fout('CRITERIUM_ONBEKEND');
      }
      const alsAgent = str(d.bron) === 'agent';
      const sha = /^[0-9a-f]{64}$/.test(str(d.sha256).toLowerCase()) ? str(d.sha256).toLowerCase() : '';
      const stuk: BewijsRecord = {
        ownerUserId: auth.user.id, kaartId: kaart.id, ...(criteriumId ? { criteriumId } : {}),
        soort, omgeving, verwijzing, ...(sha ? { sha256: sha } : {}), resultaat,
        waargenomenOp: nuIso(), door: alsAgent ? agentActor : eigenaarActor(auth),
      };
      const [id] = await db.add(BEWIJS, [stuk as unknown as Record<string, unknown>]);
      if (!id) fout('AFSTEMMING_OPSLAAN_MISLUKT');
      await kaartBijwerken(auth.user.id, kaart, { bewijs: Number(kaart.bewijs) + 1 });
      await schrijfGebeurtenis(auth.user.id, kaart.id, 'bewijs', alsAgent ? agentActor : eigenaarActor(auth), alsAgent ? 'agent' : 'eigenaar', { soort, omgeving, resultaat, verwijzing });
      return json({ stuk: bewijsUit({ ...stuk, id: String(id) }) });
    }),

    // -------------------------------------------------------------- import: voorbeeld (niets bewaren) en vastleggen
    'POST /api/owner/afstemming/import': route(async (_c, auth, d) => {
      const actie = str(d.actie);
      if (actie === 'voorbeeld') {
        const inhoud = String(d.inhoud ?? '');
        if (Buffer.byteLength(inhoud, 'utf8') > LIMIET.importBytesMax) fout('IMPORT_TE_GROOT');
        const naam = kleineTekst(d.naam, 200).toLowerCase();
        const formaat = (str(d.formaat) || (naam.endsWith('.json') ? 'json' : naam.endsWith('.md') ? 'md' : naam.endsWith('.txt') ? 'txt' : '')) as ImportVoorbeeld['formaat'];
        if (!['json', 'md', 'txt'].includes(formaat)) fout('FORMAAT_ONBEKEND');
        const geparst = formaat === 'json' ? parsJson(inhoud) : formaat === 'md' ? parsMd(inhoud) : parsTxt(inhoud);
        const invoerHash = sha256Hex(inhoud);
        await zorgLegacySeed(auth.user.id);
        const kaarten = (await eigenKaarten(auth.user.id)).filter((k) => !k.gearchiveerd);
        const eerder = await alleRecords<ImportRecord>(IMPORTS, { ownerUserId: auth.user.id, invoerHash });
        let bestaand: ImportVoorbeeld['bestaand'] = null;
        const eerderKaart = eerder.length ? kaarten.find((k) => k.id === eerder[0].kaartId) : undefined;
        if (eerderKaart) bestaand = { kaartId: eerderKaart.id, externId: eerderKaart.externId };
        else if (geparst.kaart.externId) {
          const zelfde = kaarten.find((k) => k.externId === geparst.kaart.externId);
          if (zelfde) bestaand = { kaartId: zelfde.id, externId: zelfde.externId };
        }
        const uit: ImportVoorbeeld = { invoerHash, formaat, kaart: geparst.kaart, onzeker: geparst.onzeker, bestaand, vergelijkbaar: vergelijkbaarMet(geparst.kaart.titel as Tweetekst, kaarten.filter((k) => k.externId !== geparst.kaart.externId)), waarschuwingen: geparst.waarschuwingen };
        return json(uit);
      }
      if (actie === 'vastleggen') {
        const invoerHash = str(d.invoerHash).toLowerCase();
        if (!/^[0-9a-f]{64}$/.test(invoerHash)) fout('IMPORT_ONGELDIG');
        const eerder = await alleRecords<ImportRecord>(IMPORTS, { ownerUserId: auth.user.id, invoerHash });
        if (eerder.length && eerder[0].kaartId) {
          const al = await eenKaartRecord(auth.user.id, eerder[0].kaartId);
          if (al) return json({ kaart: kaartUit(al), hergebruikt: true });
        }
        const k = (d.kaart && typeof d.kaart === 'object' ? d.kaart : {}) as Record<string, unknown>;
        const titel = naarTweetekst(k.titel, LIMIET.titelMax);
        if (!titel[0]) fout('TITEL_ONGELDIG');
        const bestaande = await eigenKaarten(auth.user.id);
        let externId = '';
        if (k.externId !== undefined && k.externId !== '') {
          externId = schoneExternId(k.externId);
          if (!externId) fout('EXTERNID_ONGELDIG');
          if (bestaande.some((x) => x.externId === externId)) fout('IDEMPOTENTIE_BOTSING');
        } else {
          externId = volgendKrtNummer(bestaande);
        }
        const { kaart } = await nieuweKaartMetRevisie(auth.user.id, {
          externId, titel, samenvatting: naarTweetekst(k.samenvatting, LIMIET.samenvattingMax),
          bedoeling: grootTekst(k.bedoeling), verwachtGedrag: '',
          criteria: naarCriteria(k.criteria), dienst: kleineTekst(k.dienst, 40), categorie: kleineTekst(k.categorie, 60),
          prioriteit: naarPrioriteit(k.prioriteit), bronSoort: 'import', provenance: `import:${invoerHash.slice(0, 12)}`,
          actor: eigenaarActor(auth),
        }, 'import');
        await db.add(IMPORTS, [{ ownerUserId: auth.user.id, invoerHash, kaartId: kaart.id, op: nuIso() } as unknown as Record<string, unknown>]);
        return json({ kaart: kaartUit(kaart), hergebruikt: false });
      }
      return error('ACTIE_ONGELDIG', 400);
    }),

    // -------------------------------------------------------------- geschiedenis (append-only journaal) en diff
    'POST /api/owner/afstemming/geschiedenis': route(async (_c, auth, d) => {
      const kaart = await laadKaart(auth.user.id, d.id);
      const blad = await db.list<GebeurtenisRecord>(GEBEURTENISSEN, { filter: { ownerUserId: auth.user.id, kaartId: kaart.id }, limit: LIMIET.gebeurtenissenPagina, nieuwsteEerst: true, ...(str(d.token) ? { nextToken: str(d.token) } : {}) });
      return json({ gebeurtenissen: (blad.items as unknown as Array<MetId<GebeurtenisRecord>>).map(gebeurtenisUit), volgende: blad.nextToken ?? null });
    }),
    'POST /api/owner/afstemming/verschil': route(async (_c, auth, d) => {
      const kaart = await laadKaart(auth.user.id, d.id);
      const a = await eenRevisieRecord(auth.user.id, d.revisieA);
      const b = await eenRevisieRecord(auth.user.id, d.revisieB);
      if (!a || !b || a.kaartId !== kaart.id || b.kaartId !== kaart.id) fout('REVISIE_ONBEKEND');
      const plat = (r: MetId<RevisieRecord>): Record<string, string> => ({
        titel: `${afstemmingTekst(r.titel, 'uk')} / ${afstemmingTekst(r.titel, 'nl')}`,
        samenvatting: `${afstemmingTekst(r.samenvatting, 'uk')} / ${afstemmingTekst(r.samenvatting, 'nl')}`,
        bedoeling: r.bedoeling, verwachtGedrag: r.verwachtGedrag,
        criteria: r.criteria.map((c) => `${c.id}: ${afstemmingTekst(c.tekst, 'uk')} [${c.verificatie}]`).join('\n'),
        dienst: r.dienst, categorie: r.categorie, prioriteit: r.prioriteit,
      });
      const va = plat(a!), vb = plat(b!);
      const velden = Object.keys(va).filter((k) => va[k] !== vb[k]).map((veld) => ({ veld, a: va[veld], b: vb[veld] }));
      return json({ velden });
    }),
  };
}

const SOORTEN = ['unit', 'integration', 'e2e', 'screenshot', 'owner_review', 'production_probe', 'ci', 'bron'] as const;
const OMGEVINGEN = ['lokaal', 'ci', 'staging', 'production', 'onbekend'] as const;
const RESULTATEN = ['geslaagd', 'mislukt', 'onbekend'] as const;
