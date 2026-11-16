// Серверне ядро безперервного переходу задач між сесіями та 13 ШІ-агентами (migratie 0284):
//   - Повна ізоляція за user_id (RLS + app.huidige_gebruiker()) та простором ('prive' | 'technisch');
//   - Пов’язує наскрізну задачу (taakSleutel) із вузлами Стріму пам’яті, чергами Telegram-ботів та картками afstemming;
//   - Формує готовий структурований контекст переходу (overdrachtPromptUk / overdrachtPromptNl) без витоку секретів.
import { randomUUID } from 'node:crypto';
import { error, json, rateLimit } from '../server/platform';
import { auditToevoegen } from '../server/platform/audit';
import type { RouterMiddleware } from '../server/platform/router';
import { alsGebruiker } from './ai-toestemmingen';
import { ecosysteemLade } from './ai-ecosysteem';
import { GEEN_RECHT, heeftApiRecht, weigerCode } from './api-recht';
import { pgBotsOpslag, type BotsOpslag } from './geheugen-agent-bots';
import { pgStroomOpslag, type StroomOpslag } from './geheugen-stroom';
import { huidigeNamens } from './mcp-namens';
import { denyMutation, rejectForeignOwnerUserId } from './rbac';
import type { AiRuimte } from '../shared/ai-ruimte';
import type { Lade } from '../shared/ruimte-scheiding';
import { SLEUTEL_GESLOTEN_CODE } from '../shared/sleutelkluis';
import { jsonbTekst } from '../shared/tekst-veilig';
import {
  TAAK_FOUTEN,
  bevatGevoeligGeheim,
  bouwTaakOverdrachtPrompt,
  isGeldigUuid,
  normaliseerGeheugenSleutel,
  schoonAgentCode,
  schoonGeheugenSleutelsLijst,
  schoonTaakBestanden,
  schoonTaakPrioriteit,
  schoonTaakSleutel,
  schoonTaakStapSoort,
  schoonTaakStatus,
  type BestandsVerwijzing,
  type GeheugenKnoopVerwijzing,
  type GeheugenTaak,
  type GeheugenTaakPakket,
  type GeheugenTaakStap,
  type TaakBezorgingVerwijzing,
  type TaakOpslaanInvoer,
  type TaakOverdragenInvoer,
  type TaakPrioriteit,
  type TaakStapToevoegenInvoer,
  type TaakStatus,
} from '../shared/geheugen-stroom';

export const TABEL_TAKEN = 'app.geheugen_taken';
export const TABEL_TAAK_STAPPEN = 'app.geheugen_taak_stappen';
const DIENSTEN = ['ai', 'mcp', 'hub', 'api', 'mail', 'cloud', 'github', 'huis'] as const;

const TAAK_KOLOMMEN = `
  id, user_id, ruimte, taak_sleutel, titel, doel, status, prioriteit, huidige_agent,
  laatste_knoop_id, laatste_bezorging_id, afstemming_kaart_id, afstemming_extern_id,
  geheugen_sleutels, eigenaar_vereist,
  (extract(epoch FROM aangemaakt_op) * 1000)::bigint AS aangemaakt_op,
  (extract(epoch FROM bijgewerkt_op) * 1000)::bigint AS bijgewerkt_op
`;

const STAP_KOLOMMEN = `
  id, user_id, ruimte, taak_id, stap_soort, van_agent, naar_agent, samenvatting,
  knoop_id, bezorging_id, bestands_verwijzingen,
  (extract(epoch FROM aangemaakt_op) * 1000)::bigint AS aangemaakt_op
`;

function parseBestandsVerwijzingen(raw: unknown): BestandsVerwijzing[] {
  let bron: unknown = raw;
  if (typeof bron === 'string') {
    try { bron = JSON.parse(bron); } catch { bron = []; }
  }
  const r = schoonTaakBestanden(bron);
  return r.ok ? r.waarde : [];
}

function rijNaarTaak(r: Record<string, unknown>): GeheugenTaak {
  return {
    id: String(r.id),
    userId: String(r.user_id),
    ruimte: r.ruimte === 'technisch' ? 'technisch' : 'prive',
    taakSleutel: String(r.taak_sleutel),
    titel: String(r.titel ?? ''),
    doel: String(r.doel ?? ''),
    status: schoonTaakStatus(r.status),
    prioriteit: schoonTaakPrioriteit(r.prioriteit),
    huidigeAgent: String(r.huidige_agent ?? ''),
    laatsteKnoopId: r.laatste_knoop_id ? String(r.laatste_knoop_id) : null,
    laatsteBezorgingId: r.laatste_bezorging_id ? String(r.laatste_bezorging_id) : null,
    afstemmingKaartId: String(r.afstemming_kaart_id ?? ''),
    afstemmingExternId: String(r.afstemming_extern_id ?? ''),
    geheugenSleutels: Array.isArray(r.geheugen_sleutels) ? r.geheugen_sleutels.map(String) : [],
    eigenaarVereist: r.eigenaar_vereist === true,
    aangemaaktOp: Number(r.aangemaakt_op || 0),
    bijgewerktOp: Number(r.bijgewerkt_op || 0),
  };
}

function rijNaarStap(r: Record<string, unknown>): GeheugenTaakStap {
  return {
    id: String(r.id),
    userId: String(r.user_id),
    ruimte: r.ruimte === 'technisch' ? 'technisch' : 'prive',
    taakId: String(r.taak_id),
    stapSoort: schoonTaakStapSoort(r.stap_soort),
    vanAgent: String(r.van_agent ?? ''),
    naarAgent: String(r.naar_agent ?? ''),
    samenvatting: String(r.samenvatting ?? ''),
    knoopId: r.knoop_id ? String(r.knoop_id) : null,
    bezorgingId: r.bezorging_id ? String(r.bezorging_id) : null,
    bestandsVerwijzingen: parseBestandsVerwijzingen(r.bestands_verwijzingen),
    aangemaaktOp: Number(r.aangemaakt_op || 0),
  };
}

export interface TaakOverzichtFilter {
  status?: TaakStatus;
  agent?: string;
  vraag?: string;
  limiet?: number;
}

export type TaakFoutAntwoord = { ok: false; code: string; httpStatus?: number };

export interface TakenOpslag {
  overzicht(
    lade: Lade,
    filter?: TaakOverzichtFilter,
  ): Promise<{ taken: GeheugenTaak[]; laatsteStappen: GeheugenTaakStap[] }>;
  detail(
    lade: Lade,
    taakSleutel: string,
  ): Promise<{ ok: true; pakket: GeheugenTaakPakket } | TaakFoutAntwoord>;
  opslaan(
    lade: Lade,
    invoer: TaakOpslaanInvoer,
    bronAgent?: string,
  ): Promise<{ ok: true; pakket: GeheugenTaakPakket; nieuw: boolean } | TaakFoutAntwoord>;
  stapToevoegen(
    lade: Lade,
    invoer: TaakStapToevoegenInvoer,
    bronAgent?: string,
  ): Promise<{ ok: true; pakket: GeheugenTaakPakket; stap: GeheugenTaakStap } | TaakFoutAntwoord>;
  overdragen(
    lade: Lade,
    invoer: TaakOverdragenInvoer,
    bronAgent?: string,
  ): Promise<{
    ok: true;
    pakket: GeheugenTaakPakket;
    stap: GeheugenTaakStap;
    bezorgd: boolean;
    bezorgingFout?: string;
  } | TaakFoutAntwoord>;
}

async function verrijkPakket(
  lade: Lade,
  taak: GeheugenTaak,
  stappen: GeheugenTaakStap[],
  stroom: StroomOpslag,
  bots: BotsOpslag,
): Promise<GeheugenTaakPakket> {
  const knopen: GeheugenKnoopVerwijzing[] = [];
  const sleutelSet = new Set(taak.geheugenSleutels);
  if (sleutelSet.size > 0 || taak.laatsteKnoopId) {
    try {
      const overz = await stroom.leesAlles(lade);
      for (const k of overz.knopen) {
        if (sleutelSet.has(k.sleutel) || (taak.laatsteKnoopId && k.id === taak.laatsteKnoopId)) {
          knopen.push({
            id: k.id,
            sleutel: k.sleutel,
            soort: k.soort,
            titel: k.titel,
            samenvatting: k.samenvatting || k.inhoud.slice(0, 240),
            bronAgent: k.bronAgent,
            bijgewerktOp: k.bijgewerktOp,
          });
        }
      }
    } catch (err) {
      if ((err as Error).message !== SLEUTEL_GESLOTEN_CODE) throw err;
      // Якщо DEK заблокований, повертаємо прив’язані ключі без розшифрування вмісту, не зриваючи передачу.
    }
  }

  const botsOverzicht = await bots.overzicht(lade, { taakId: taak.taakSleutel, limiet: 20 });
  const bezorgingen: TaakBezorgingVerwijzing[] = botsOverzicht.bezorgingen.map((b) => ({
    id: b.id,
    agentSlug: b.agentSlug,
    soortBericht: b.soortBericht,
    status: b.status,
    titel: b.titel,
    telegramBerichtId: b.telegramBerichtId,
    aangemaaktOp: b.aangemaaktOp,
  }));

  const basis = { taak, stappen, geheugenKnopen: knopen };
  return {
    ...basis,
    bezorgingen,
    overdrachtPromptUk: bouwTaakOverdrachtPrompt(basis, 'uk'),
    overdrachtPromptNl: bouwTaakOverdrachtPrompt(basis, 'nl'),
  };
}

function normaliseerDoelEnTitel(titelRaw: unknown, doelRaw: unknown):
  | { ok: true; titel: string; doel: string }
  | TaakFoutAntwoord {
  const titel = String(titelRaw ?? '').trim().slice(0, 240);
  const doel = String(doelRaw ?? '').trim().slice(0, 4000);
  if (!titel) return { ok: false, code: TAAK_FOUTEN.titelVereist, httpStatus: 400 };
  if (bevatGevoeligGeheim(titel) || bevatGevoeligGeheim(doel)) {
    return { ok: false, code: TAAK_FOUTEN.geheimGeweigerd, httpStatus: 400 };
  }
  return { ok: true, titel, doel };
}

function kiesBezorgAgentSlug(doelAgent: string): string {
  const s = schoonAgentCode(doelAgent);
  return s === 'gpt' ? 'chatgpt' : s;
}

export function maakTakenInGeheugenOpslag(opties: {
  stroom?: StroomOpslag;
  bots?: BotsOpslag;
} = {}): TakenOpslag {
  const taken: GeheugenTaak[] = [];
  const stappen: GeheugenTaakStap[] = [];
  const stroom = opties.stroom;
  const bots = opties.bots;

  const legeStroom: StroomOpslag = {
    leesAlles: async () => ({ sleutelStand: 'open', knopen: [], relaties: [], gebeurtenissen: [] }),
    bewaarKnoop: async () => ({ ok: false, code: 'NIET_GECONFIGUREERD' }),
    zetRelatie: async () => ({ ok: false, code: 'NIET_GECONFIGUREERD' }),
    zetStatus: async () => ({ ok: false, code: 'NIET_GECONFIGUREERD' }),
    registreerRaadpleging: async () => undefined,
  };
  const legeBots: BotsOpslag = {
    overzicht: async () => ({ ruimte: 'prive', bots: [], bezorgingen: [], catalogus: [] }),
    bewaarBot: async () => ({ ok: false, code: 'NIET_GECONFIGUREERD' }),
    testenBot: async () => ({ ok: false, code: 'NIET_GECONFIGUREERD' }),
    zetBotStatus: async () => ({ ok: false, code: 'NIET_GECONFIGUREERD' }),
    verwijderBot: async () => ({ ok: false, code: 'NIET_GECONFIGUREERD' }),
    bezorgBericht: async () => ({ ok: false, code: 'BOT_NIET_GEVONDEN' }),
    opnieuwBezorgen: async () => ({ ok: false, code: 'BEZORGING_NIET_GEVONDEN' }),
    gesprekInvoeren: async () => ({ ok: false, code: 'NIET_GECONFIGUREERD' }),
  };

  const vind = (lade: Lade, sleutel: string) =>
    taken.find((t) => t.userId === lade.userId && t.ruimte === lade.ruimte && t.taakSleutel === sleutel);

  const stappenVoor = (lade: Lade, taakId: string) =>
    stappen
      .filter((s) => s.userId === lade.userId && s.ruimte === lade.ruimte && s.taakId === taakId)
      .sort((a, b) => b.aangemaaktOp - a.aangemaaktOp);

  return {
    async overzicht(lade, filter = {}) {
      const vraag = String(filter.vraag ?? '').trim().toLowerCase();
      const agent = filter.agent ? schoonAgentCode(filter.agent) : '';
      const limiet = Math.max(1, Math.min(100, Number(filter.limiet) || 40));

      const filtered = taken
        .filter((t) => {
          if (t.userId !== lade.userId || t.ruimte !== lade.ruimte) return false;
          if (filter.status && t.status !== filter.status) return false;
          if (agent && t.huidigeAgent !== agent) return false;
          if (vraag) {
            const hooi = `${t.taakSleutel} ${t.titel} ${t.doel} ${t.huidigeAgent} ${t.afstemmingExternId}`.toLowerCase();
            if (!hooi.includes(vraag)) return false;
          }
          return true;
        })
        .sort((a, b) => b.bijgewerktOp - a.bijgewerktOp)
        .slice(0, limiet);

      const idSet = new Set(filtered.map((t) => t.id));
      const laatste = stappen
        .filter((s) => s.userId === lade.userId && s.ruimte === lade.ruimte && idSet.has(s.taakId))
        .sort((a, b) => b.aangemaaktOp - a.aangemaaktOp)
        .slice(0, 60);

      return { taken: filtered, laatsteStappen: laatste };
    },

    async detail(lade, rawSleutel) {
      const sleutel = schoonTaakSleutel(rawSleutel);
      if (!sleutel) return { ok: false, code: TAAK_FOUTEN.taakSleutelOngeldig, httpStatus: 400 };
      const t = vind(lade, sleutel);
      if (!t) return { ok: false, code: TAAK_FOUTEN.taakNietGevonden, httpStatus: 404 };
      const pakket = await verrijkPakket(lade, t, stappenVoor(lade, t.id), stroom ?? legeStroom, bots ?? legeBots);
      return { ok: true, pakket };
    },

    async opslaan(lade, invoer, bronAgent = '') {
      const sleutel = schoonTaakSleutel(invoer.taakSleutel);
      if (!sleutel) return { ok: false, code: TAAK_FOUTEN.taakSleutelOngeldig, httpStatus: 400 };
      const teksten = normaliseerDoelEnTitel(invoer.titel, invoer.doel);
      if (!teksten.ok) return teksten;
      if (invoer.eersteSamenvatting && bevatGevoeligGeheim(invoer.eersteSamenvatting)) {
        return { ok: false, code: TAAK_FOUTEN.geheimGeweigerd, httpStatus: 400 };
      }

      const nu = Date.now();
      const huidig = vind(lade, sleutel);
      const nieuweSleutels = schoonGeheugenSleutelsLijst(invoer.geheugenSleutels);

      if (!huidig) {
        const nieuw: GeheugenTaak = {
          id: randomUUID(),
          userId: lade.userId,
          ruimte: lade.ruimte,
          taakSleutel: sleutel,
          titel: teksten.titel,
          doel: teksten.doel,
          status: schoonTaakStatus(invoer.status, 'open'),
          prioriteit: schoonTaakPrioriteit(invoer.prioriteit, 'normaal'),
          huidigeAgent: schoonAgentCode(invoer.huidigeAgent || bronAgent),
          laatsteKnoopId: invoer.laatsteKnoopId && isGeldigUuid(invoer.laatsteKnoopId) ? invoer.laatsteKnoopId : null,
          laatsteBezorgingId: null,
          afstemmingKaartId: String(invoer.afstemmingKaartId ?? '').trim().slice(0, 120),
          afstemmingExternId: String(invoer.afstemmingExternId ?? '').trim().slice(0, 80),
          geheugenSleutels: nieuweSleutels,
          eigenaarVereist: invoer.eigenaarVereist === true,
          aangemaaktOp: nu,
          bijgewerktOp: nu,
        };
        taken.push(nieuw);
        stappen.push({
          id: randomUUID(),
          userId: lade.userId,
          ruimte: lade.ruimte,
          taakId: nieuw.id,
          stapSoort: 'aangemaakt',
          vanAgent: schoonAgentCode(bronAgent),
          naarAgent: nieuw.huidigeAgent,
          samenvatting: String(invoer.eersteSamenvatting || teksten.titel).trim().slice(0, 4000),
          knoopId: nieuw.laatsteKnoopId,
          bezorgingId: null,
          bestandsVerwijzingen: [],
          aangemaaktOp: nu,
        });
        const pakket = await verrijkPakket(lade, nieuw, stappenVoor(lade, nieuw.id), stroom ?? legeStroom, bots ?? legeBots);
        return { ok: true, pakket, nieuw: true };
      }

      huidig.titel = teksten.titel;
      if (invoer.doel !== undefined) huidig.doel = teksten.doel;
      if (invoer.status) huidig.status = schoonTaakStatus(invoer.status, huidig.status);
      if (invoer.prioriteit) huidig.prioriteit = schoonTaakPrioriteit(invoer.prioriteit, huidig.prioriteit);
      if (invoer.huidigeAgent !== undefined) huidig.huidigeAgent = schoonAgentCode(invoer.huidigeAgent);
      if (invoer.afstemmingKaartId !== undefined) huidig.afstemmingKaartId = String(invoer.afstemmingKaartId).trim().slice(0, 120);
      if (invoer.afstemmingExternId !== undefined) huidig.afstemmingExternId = String(invoer.afstemmingExternId).trim().slice(0, 80);
      if (invoer.eigenaarVereist !== undefined) huidig.eigenaarVereist = Boolean(invoer.eigenaarVereist);
      if (invoer.laatsteKnoopId && isGeldigUuid(invoer.laatsteKnoopId)) huidig.laatsteKnoopId = invoer.laatsteKnoopId;
      if (nieuweSleutels.length > 0) {
        huidig.geheugenSleutels = [...new Set([...huidig.geheugenSleutels, ...nieuweSleutels])].slice(0, 64);
      }
      huidig.bijgewerktOp = nu;
      const pakket = await verrijkPakket(lade, huidig, stappenVoor(lade, huidig.id), stroom ?? legeStroom, bots ?? legeBots);
      return { ok: true, pakket, nieuw: false };
    },

    async stapToevoegen(lade, invoer, bronAgent = '') {
      const sleutel = schoonTaakSleutel(invoer.taakSleutel);
      if (!sleutel) return { ok: false, code: TAAK_FOUTEN.taakSleutelOngeldig, httpStatus: 400 };
      const t = vind(lade, sleutel);
      if (!t) return { ok: false, code: TAAK_FOUTEN.taakNietGevonden, httpStatus: 404 };

      const samenvatting = String(invoer.samenvatting ?? '').trim().slice(0, 4000);
      if (!samenvatting) return { ok: false, code: TAAK_FOUTEN.samenvattingVereist, httpStatus: 400 };
      if (bevatGevoeligGeheim(samenvatting)) return { ok: false, code: TAAK_FOUTEN.geheimGeweigerd, httpStatus: 400 };
      const bestanden = schoonTaakBestanden(invoer.bestandsVerwijzingen);
      if (!bestanden.ok) return { ok: false, code: bestanden.code, httpStatus: 400 };

      const nu = Date.now();
      const stap: GeheugenTaakStap = {
        id: randomUUID(),
        userId: lade.userId,
        ruimte: lade.ruimte,
        taakId: t.id,
        stapSoort: schoonTaakStapSoort(invoer.stapSoort, 'voortgang'),
        vanAgent: schoonAgentCode(invoer.vanAgent || bronAgent || t.huidigeAgent),
        naarAgent: schoonAgentCode(invoer.naarAgent),
        samenvatting,
        knoopId: invoer.knoopId && isGeldigUuid(invoer.knoopId) ? invoer.knoopId : null,
        bezorgingId: invoer.bezorgingId && isGeldigUuid(invoer.bezorgingId) ? invoer.bezorgingId : null,
        bestandsVerwijzingen: bestanden.waarde,
        aangemaaktOp: nu,
      };
      stappen.push(stap);
      if (invoer.status) t.status = schoonTaakStatus(invoer.status, t.status);
      if (stap.naarAgent) t.huidigeAgent = stap.naarAgent;
      if (stap.knoopId) t.laatsteKnoopId = stap.knoopId;
      if (stap.bezorgingId) t.laatsteBezorgingId = stap.bezorgingId;
      t.bijgewerktOp = nu;

      const pakket = await verrijkPakket(lade, t, stappenVoor(lade, t.id), stroom ?? legeStroom, bots ?? legeBots);
      return { ok: true, pakket, stap };
    },

    async overdragen(lade, invoer, bronAgent = '') {
      const sleutel = schoonTaakSleutel(invoer.taakSleutel);
      if (!sleutel) return { ok: false, code: TAAK_FOUTEN.taakSleutelOngeldig, httpStatus: 400 };
      const naarAgent = schoonAgentCode(invoer.naarAgent);
      if (!naarAgent) return { ok: false, code: TAAK_FOUTEN.doelAgentVereist, httpStatus: 400 };
      const samenvatting = String(invoer.samenvatting ?? '').trim().slice(0, 4000);
      if (!samenvatting) return { ok: false, code: TAAK_FOUTEN.samenvattingVereist, httpStatus: 400 };
      if (bevatGevoeligGeheim(samenvatting) || bevatGevoeligGeheim(invoer.titel ?? '') || bevatGevoeligGeheim(invoer.doel ?? '')) {
        return { ok: false, code: TAAK_FOUTEN.geheimGeweigerd, httpStatus: 400 };
      }
      const bestanden = schoonTaakBestanden(invoer.bestandsVerwijzingen);
      if (!bestanden.ok) return { ok: false, code: bestanden.code, httpStatus: 400 };

      let t = vind(lade, sleutel);
      const vanAgent = schoonAgentCode(invoer.vanAgent || bronAgent || t?.huidigeAgent || '');
      if (!t) {
        if (!invoer.titel || !String(invoer.titel).trim()) {
          return { ok: false, code: TAAK_FOUTEN.taakNietGevonden, httpStatus: 404 };
        }
        const opgeslagen = await this.opslaan(
          lade,
          {
            taakSleutel: sleutel,
            titel: invoer.titel,
            doel: invoer.doel,
            status: invoer.status ?? 'bezig',
            prioriteit: invoer.prioriteit ?? 'normaal',
            huidigeAgent: vanAgent,
            geheugenSleutels: invoer.geheugenSleutels,
            afstemmingKaartId: invoer.afstemmingKaartId,
            afstemmingExternId: invoer.afstemmingExternId,
          },
          vanAgent,
        );
        if (!opgeslagen.ok) return opgeslagen;
        t = vind(lade, sleutel)!;
      }

      let knoopId: string | null = invoer.knoopId && isGeldigUuid(invoer.knoopId) ? invoer.knoopId : null;
      const nieuweSleutels = schoonGeheugenSleutelsLijst(invoer.geheugenSleutels);
      if (invoer.bewaarInStroom && stroom) {
        try {
          const knoopSleutel = normaliseerGeheugenSleutel(`taak-${sleutel}`);
          if (knoopSleutel) {
            const bewaard = await stroom.bewaarKnoop(
              lade,
              {
                sleutel: knoopSleutel,
                soort: 'context',
                titel: `Естафета ${sleutel}: ${vanAgent || 'поточна сесія'} → ${naarAgent}`,
                inhoud: samenvatting,
                samenvatting: samenvatting.slice(0, 560),
                labels: ['overdracht', naarAgent, ...(vanAgent ? [vanAgent] : [])],
                vastgepind: true,
              },
              vanAgent || naarAgent,
            );
            if (bewaard.ok) {
              knoopId = bewaard.knoop.id;
              if (!nieuweSleutels.includes(bewaard.knoop.sleutel)) nieuweSleutels.push(bewaard.knoop.sleutel);
            }
          }
        } catch (err) {
          if ((err as Error).message !== SLEUTEL_GESLOTEN_CODE) throw err;
        }
      }

      let bezorgingId: string | null = null;
      let bezorgd = false;
      let bezorgingFout: string | undefined;
      if (invoer.ookBezorgen && bots) {
        const doelBotSlug = kiesBezorgAgentSlug(naarAgent);
        const res = await bots.bezorgBericht(lade, {
          agentSlug: doelBotSlug,
          taakId: sleutel,
          sessieId: invoer.sessieId,
          knoopId: knoopId ?? t.laatsteKnoopId ?? undefined,
          vorigeBezorgingId: t.laatsteBezorgingId ?? undefined,
          soortBericht: 'overdracht',
          titel: `${t.titel} (${vanAgent || 'сесія'} → ${naarAgent})`.slice(0, 240),
          samenvatting,
          bestandsVerwijzingen: bestanden.waarde,
          directVerzenden: true,
        });
        if (res.ok) {
          bezorgingId = res.bezorging.id;
          bezorgd = res.verzonden;
          if (!res.verzonden && res.bezorging.laatsteFout) bezorgingFout = res.bezorging.laatsteFout;
        } else {
          bezorgingFout = res.code;
        }
      }

      const nu = Date.now() + 1;
      const stap: GeheugenTaakStap = {
        id: randomUUID(),
        userId: lade.userId,
        ruimte: lade.ruimte,
        taakId: t.id,
        stapSoort: 'overdracht',
        vanAgent,
        naarAgent,
        samenvatting,
        knoopId,
        bezorgingId,
        bestandsVerwijzingen: bestanden.waarde,
        aangemaaktOp: nu,
      };
      stappen.push(stap);

      t.huidigeAgent = naarAgent;
      if (invoer.status) t.status = schoonTaakStatus(invoer.status, t.status);
      else if (t.status === 'open') t.status = 'bezig';
      if (knoopId) t.laatsteKnoopId = knoopId;
      if (bezorgingId) t.laatsteBezorgingId = bezorgingId;
      if (nieuweSleutels.length > 0) {
        t.geheugenSleutels = [...new Set([...t.geheugenSleutels, ...nieuweSleutels])].slice(0, 64);
      }
      t.bijgewerktOp = nu;

      const pakket = await verrijkPakket(lade, t, stappenVoor(lade, t.id), stroom ?? legeStroom, bots ?? legeBots);
      return { ok: true, pakket, stap, bezorgd, ...(bezorgingFout ? { bezorgingFout } : {}) };
    },
  };
}

export function maakPgTakenOpslag(opties: {
  stroom?: StroomOpslag;
  bots?: BotsOpslag;
} = {}): TakenOpslag {
  const stroom = opties.stroom ?? pgStroomOpslag;
  const bots = opties.bots ?? pgBotsOpslag;

  const laadStappen = async (lade: Lade, taakId: string): Promise<GeheugenTaakStap[]> => {
    const r = await alsGebruiker(lade.userId, (q) =>
      q(
        `SELECT ${STAP_KOLOMMEN}
         FROM ${TABEL_TAAK_STAPPEN}
         WHERE user_id = $1 AND ruimte = $2 AND taak_id = $3
         ORDER BY aangemaakt_op DESC
         LIMIT 50`,
        [lade.userId, lade.ruimte, taakId],
      ),
    );
    return r.rows.map((x: unknown) => rijNaarStap(x as Record<string, unknown>));
  };

  const laadTaak = async (lade: Lade, sleutel: string): Promise<GeheugenTaak | null> => {
    const r = await alsGebruiker(lade.userId, (q) =>
      q(
        `SELECT ${TAAK_KOLOMMEN}
         FROM ${TABEL_TAKEN}
         WHERE user_id = $1 AND ruimte = $2 AND taak_sleutel = $3`,
        [lade.userId, lade.ruimte, sleutel],
      ),
    );
    return r.rows[0] ? rijNaarTaak(r.rows[0] as Record<string, unknown>) : null;
  };

  const zoekAfstemming = async (
    lade: Lade,
    kaartIdRaw?: string,
    externIdRaw?: string,
  ): Promise<{ kaartId: string; externId: string }> => {
    const kaartId = String(kaartIdRaw ?? '').trim().slice(0, 120);
    const externId = String(externIdRaw ?? '').trim().slice(0, 80);
    if (!kaartId && !externId) return { kaartId: '', externId: '' };
    try {
      const r = await alsGebruiker(lade.userId, (q) =>
        q(
          `SELECT id, data->>'externId' AS extern_id
           FROM app.records
           WHERE tbl = 'afstemming_kaarten_v1'
             AND user_id = $1
             AND ($2 <> '' AND id = $2 OR $3 <> '' AND upper(coalesce(data->>'externId', '')) = upper($3))
           LIMIT 1`,
          [lade.userId, kaartId, externId],
        ),
      );
      if (r.rows[0]) {
        const rij = r.rows[0] as { id?: string; extern_id?: string };
        return {
          kaartId: String(rij.id || kaartId),
          externId: String(rij.extern_id || externId),
        };
      }
    } catch {
      // Якщо у тестовій БД не існує таблиці або картки, зберігаємо лише передані ідентифікатори без падіння.
    }
    return { kaartId, externId };
  };

  return {
    async overzicht(lade, filter = {}) {
      const limiet = Math.max(1, Math.min(100, Number(filter.limiet) || 40));
      const conds = ['user_id = $1', 'ruimte = $2'];
      const vals: unknown[] = [lade.userId, lade.ruimte];
      if (filter.status) {
        vals.push(schoonTaakStatus(filter.status));
        conds.push(`status = $${vals.length}`);
      }
      if (filter.agent) {
        const ag = schoonAgentCode(filter.agent);
        if (ag) {
          vals.push(ag);
          conds.push(`huidige_agent = $${vals.length}`);
        }
      }
      const vraag = String(filter.vraag ?? '').trim();
      if (vraag) {
        vals.push(`%${vraag}%`);
        conds.push(`(taak_sleutel ILIKE $${vals.length} OR titel ILIKE $${vals.length} OR doel ILIKE $${vals.length} OR afstemming_extern_id ILIKE $${vals.length})`);
      }
      vals.push(limiet);

      const takenRij = await alsGebruiker(lade.userId, (q) =>
        q(
          `SELECT ${TAAK_KOLOMMEN}
           FROM ${TABEL_TAKEN}
           WHERE ${conds.join(' AND ')}
           ORDER BY bijgewerkt_op DESC
           LIMIT $${vals.length}`,
          vals,
        ),
      );
      const taken = takenRij.rows.map((x: unknown) => rijNaarTaak(x as Record<string, unknown>));
      if (!taken.length) return { taken: [], laatsteStappen: [] };

      const idLijst = taken.map((t: GeheugenTaak) => t.id);
      const stappenRij = await alsGebruiker(lade.userId, (q) =>
        q(
          `SELECT ${STAP_KOLOMMEN}
           FROM ${TABEL_TAAK_STAPPEN}
           WHERE user_id = $1 AND ruimte = $2 AND taak_id = ANY($3::uuid[])
           ORDER BY aangemaakt_op DESC
           LIMIT 80`,
          [lade.userId, lade.ruimte, idLijst],
        ),
      );
      return {
        taken,
        laatsteStappen: stappenRij.rows.map((x: unknown) => rijNaarStap(x as Record<string, unknown>)),
      };
    },

    async detail(lade, rawSleutel) {
      const sleutel = schoonTaakSleutel(rawSleutel);
      if (!sleutel) return { ok: false, code: TAAK_FOUTEN.taakSleutelOngeldig, httpStatus: 400 };
      const t = await laadTaak(lade, sleutel);
      if (!t) return { ok: false, code: TAAK_FOUTEN.taakNietGevonden, httpStatus: 404 };
      const st = await laadStappen(lade, t.id);
      const pakket = await verrijkPakket(lade, t, st, stroom, bots);
      return { ok: true, pakket };
    },

    async opslaan(lade, invoer, bronAgent = '') {
      const sleutel = schoonTaakSleutel(invoer.taakSleutel);
      if (!sleutel) return { ok: false, code: TAAK_FOUTEN.taakSleutelOngeldig, httpStatus: 400 };
      const teksten = normaliseerDoelEnTitel(invoer.titel, invoer.doel);
      if (!teksten.ok) return teksten;
      if (invoer.eersteSamenvatting && bevatGevoeligGeheim(invoer.eersteSamenvatting)) {
        return { ok: false, code: TAAK_FOUTEN.geheimGeweigerd, httpStatus: 400 };
      }

      const bestaand = await laadTaak(lade, sleutel);
      const afstemming = await zoekAfstemming(lade, invoer.afstemmingKaartId, invoer.afstemmingExternId);
      const nieuweSleutels = schoonGeheugenSleutelsLijst(invoer.geheugenSleutels);
      const samengevoegdeSleutels = bestaand
        ? [...new Set([...bestaand.geheugenSleutels, ...nieuweSleutels])].slice(0, 64)
        : nieuweSleutels;
      const knoopId = invoer.laatsteKnoopId && isGeldigUuid(invoer.laatsteKnoopId) ? invoer.laatsteKnoopId : null;
      const agent = invoer.huidigeAgent !== undefined
        ? schoonAgentCode(invoer.huidigeAgent)
        : bestaand
          ? bestaand.huidigeAgent
          : schoonAgentCode(bronAgent);
      const status = invoer.status ? schoonTaakStatus(invoer.status) : bestaand?.status ?? 'open';
      const prioriteit = invoer.prioriteit ? schoonTaakPrioriteit(invoer.prioriteit) : bestaand?.prioriteit ?? 'normaal';
      const eigenaarVereist = invoer.eigenaarVereist !== undefined ? Boolean(invoer.eigenaarVereist) : bestaand?.eigenaarVereist ?? false;
      const kaartId = invoer.afstemmingKaartId !== undefined || invoer.afstemmingExternId !== undefined
        ? afstemming.kaartId
        : bestaand?.afstemmingKaartId ?? '';
      const externId = invoer.afstemmingExternId !== undefined || invoer.afstemmingKaartId !== undefined
        ? afstemming.externId
        : bestaand?.afstemmingExternId ?? '';
      const doel = invoer.doel !== undefined ? teksten.doel : bestaand?.doel ?? '';

      const res = await alsGebruiker(lade.userId, async (q) => {
        const upsert = await q(
          `INSERT INTO ${TABEL_TAKEN} (
             user_id, ruimte, taak_sleutel, titel, doel, status, prioriteit, huidige_agent,
             laatste_knoop_id, afstemming_kaart_id, afstemming_extern_id, geheugen_sleutels, eigenaar_vereist
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::text[], $13)
           ON CONFLICT (user_id, ruimte, taak_sleutel) DO UPDATE SET
             titel = EXCLUDED.titel,
             doel = EXCLUDED.doel,
             status = EXCLUDED.status,
             prioriteit = EXCLUDED.prioriteit,
             huidige_agent = EXCLUDED.huidige_agent,
             laatste_knoop_id = COALESCE(EXCLUDED.laatste_knoop_id, ${TABEL_TAKEN}.laatste_knoop_id),
             afstemming_kaart_id = EXCLUDED.afstemming_kaart_id,
             afstemming_extern_id = EXCLUDED.afstemming_extern_id,
             geheugen_sleutels = EXCLUDED.geheugen_sleutels,
             eigenaar_vereist = EXCLUDED.eigenaar_vereist,
             bijgewerkt_op = now()
           RETURNING ${TAAK_KOLOMMEN}`,
          [
            lade.userId, lade.ruimte, sleutel, teksten.titel, doel, status, prioriteit, agent,
            knoopId, kaartId, externId, samengevoegdeSleutels, eigenaarVereist,
          ],
        );
        const taak = rijNaarTaak(upsert.rows[0] as Record<string, unknown>);
        if (!bestaand) {
          await q(
            `INSERT INTO ${TABEL_TAAK_STAPPEN} (
               user_id, ruimte, taak_id, stap_soort, van_agent, naar_agent, samenvatting, knoop_id
             ) VALUES ($1, $2, $3, 'aangemaakt', $4, $5, $6, $7)`,
            [
              lade.userId, lade.ruimte, taak.id,
              schoonAgentCode(bronAgent), agent,
              String(invoer.eersteSamenvatting || teksten.titel).trim().slice(0, 4000),
              knoopId,
            ],
          );
        }
        return taak;
      });

      const st = await laadStappen(lade, res.id);
      const pakket = await verrijkPakket(lade, res, st, stroom, bots);
      return { ok: true, pakket, nieuw: !bestaand };
    },

    async stapToevoegen(lade, invoer, bronAgent = '') {
      const sleutel = schoonTaakSleutel(invoer.taakSleutel);
      if (!sleutel) return { ok: false, code: TAAK_FOUTEN.taakSleutelOngeldig, httpStatus: 400 };
      const t = await laadTaak(lade, sleutel);
      if (!t) return { ok: false, code: TAAK_FOUTEN.taakNietGevonden, httpStatus: 404 };

      const samenvatting = String(invoer.samenvatting ?? '').trim().slice(0, 4000);
      if (!samenvatting) return { ok: false, code: TAAK_FOUTEN.samenvattingVereist, httpStatus: 400 };
      if (bevatGevoeligGeheim(samenvatting)) return { ok: false, code: TAAK_FOUTEN.geheimGeweigerd, httpStatus: 400 };
      const bestanden = schoonTaakBestanden(invoer.bestandsVerwijzingen);
      if (!bestanden.ok) return { ok: false, code: bestanden.code, httpStatus: 400 };

      const soort = schoonTaakStapSoort(invoer.stapSoort, 'voortgang');
      const vanAgent = schoonAgentCode(invoer.vanAgent || bronAgent || t.huidigeAgent);
      const naarAgent = schoonAgentCode(invoer.naarAgent);
      const knoopId = invoer.knoopId && isGeldigUuid(invoer.knoopId) ? invoer.knoopId : null;
      const bezorgingId = invoer.bezorgingId && isGeldigUuid(invoer.bezorgingId) ? invoer.bezorgingId : null;
      const nieuwStatus = invoer.status ? schoonTaakStatus(invoer.status, t.status) : t.status;
      const nieuwAgent = naarAgent || t.huidigeAgent;

      const { bijgewerkt, stap } = await alsGebruiker(lade.userId, async (q) => {
        const stapRij = await q(
          `INSERT INTO ${TABEL_TAAK_STAPPEN} (
             user_id, ruimte, taak_id, stap_soort, van_agent, naar_agent,
             samenvatting, knoop_id, bezorging_id, bestands_verwijzingen
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
           RETURNING ${STAP_KOLOMMEN}`,
          [
            lade.userId, lade.ruimte, t.id, soort, vanAgent, naarAgent,
            samenvatting, knoopId, bezorgingId, jsonbTekst(bestanden.waarde),
          ],
        );
        const taakRij = await q(
          `UPDATE ${TABEL_TAKEN}
           SET status = $1,
               huidige_agent = $2,
               laatste_knoop_id = COALESCE($3, laatste_knoop_id),
               laatste_bezorging_id = COALESCE($4, laatste_bezorging_id),
               bijgewerkt_op = now()
           WHERE user_id = $5 AND ruimte = $6 AND id = $7
           RETURNING ${TAAK_KOLOMMEN}`,
          [nieuwStatus, nieuwAgent, knoopId, bezorgingId, lade.userId, lade.ruimte, t.id],
        );
        return {
          stap: rijNaarStap(stapRij.rows[0] as Record<string, unknown>),
          bijgewerkt: rijNaarTaak(taakRij.rows[0] as Record<string, unknown>),
        };
      });

      const st = await laadStappen(lade, bijgewerkt.id);
      const pakket = await verrijkPakket(lade, bijgewerkt, st, stroom, bots);
      return { ok: true, pakket, stap };
    },

    async overdragen(lade, invoer, bronAgent = '') {
      const sleutel = schoonTaakSleutel(invoer.taakSleutel);
      if (!sleutel) return { ok: false, code: TAAK_FOUTEN.taakSleutelOngeldig, httpStatus: 400 };
      const naarAgent = schoonAgentCode(invoer.naarAgent);
      if (!naarAgent) return { ok: false, code: TAAK_FOUTEN.doelAgentVereist, httpStatus: 400 };
      const samenvatting = String(invoer.samenvatting ?? '').trim().slice(0, 4000);
      if (!samenvatting) return { ok: false, code: TAAK_FOUTEN.samenvattingVereist, httpStatus: 400 };
      if (bevatGevoeligGeheim(samenvatting) || bevatGevoeligGeheim(invoer.titel ?? '') || bevatGevoeligGeheim(invoer.doel ?? '')) {
        return { ok: false, code: TAAK_FOUTEN.geheimGeweigerd, httpStatus: 400 };
      }
      const bestanden = schoonTaakBestanden(invoer.bestandsVerwijzingen);
      if (!bestanden.ok) return { ok: false, code: bestanden.code, httpStatus: 400 };

      let t = await laadTaak(lade, sleutel);
      const vanAgent = schoonAgentCode(invoer.vanAgent || bronAgent || t?.huidigeAgent || '');
      if (!t) {
        if (!invoer.titel || !String(invoer.titel).trim()) {
          return { ok: false, code: TAAK_FOUTEN.taakNietGevonden, httpStatus: 404 };
        }
        const nieuw = await this.opslaan(
          lade,
          {
            taakSleutel: sleutel,
            titel: invoer.titel,
            doel: invoer.doel,
            status: invoer.status ?? 'bezig',
            prioriteit: invoer.prioriteit ?? 'normaal',
            huidigeAgent: vanAgent,
            geheugenSleutels: invoer.geheugenSleutels,
            afstemmingKaartId: invoer.afstemmingKaartId,
            afstemmingExternId: invoer.afstemmingExternId,
          },
          vanAgent,
        );
        if (!nieuw.ok) return nieuw;
        t = nieuw.pakket.taak;
      }

      let knoopId: string | null = invoer.knoopId && isGeldigUuid(invoer.knoopId) ? invoer.knoopId : null;
      const extraSleutels = schoonGeheugenSleutelsLijst(invoer.geheugenSleutels);
      if (invoer.bewaarInStroom) {
        try {
          const knoopSleutel = normaliseerGeheugenSleutel(`taak-${sleutel}`);
          if (knoopSleutel) {
            const bewaard = await stroom.bewaarKnoop(
              lade,
              {
                sleutel: knoopSleutel,
                soort: 'context',
                titel: `Естафета ${sleutel}: ${vanAgent || 'поточна сесія'} → ${naarAgent}`,
                inhoud: samenvatting,
                samenvatting: samenvatting.slice(0, 560),
                labels: ['overdracht', naarAgent, ...(vanAgent ? [vanAgent] : [])],
                vastgepind: true,
              },
              vanAgent || naarAgent,
            );
            if (bewaard.ok) {
              knoopId = bewaard.knoop.id;
              if (!extraSleutels.includes(bewaard.knoop.sleutel)) extraSleutels.push(bewaard.knoop.sleutel);
            }
          }
        } catch (err) {
          if ((err as Error).message !== SLEUTEL_GESLOTEN_CODE) throw err;
        }
      }

      let bezorgingId: string | null = null;
      let bezorgd = false;
      let bezorgingFout: string | undefined;
      if (invoer.ookBezorgen) {
        const doelBotSlug = kiesBezorgAgentSlug(naarAgent);
        const res = await bots.bezorgBericht(lade, {
          agentSlug: doelBotSlug,
          taakId: sleutel,
          sessieId: invoer.sessieId,
          knoopId: knoopId ?? t.laatsteKnoopId ?? undefined,
          vorigeBezorgingId: t.laatsteBezorgingId ?? undefined,
          soortBericht: 'overdracht',
          titel: `${t.titel} (${vanAgent || 'сесія'} → ${naarAgent})`.slice(0, 240),
          samenvatting,
          bestandsVerwijzingen: bestanden.waarde,
          directVerzenden: true,
        });
        if (res.ok) {
          bezorgingId = res.bezorging.id;
          bezorgd = res.verzonden;
          if (!res.verzonden && res.bezorging.laatsteFout) bezorgingFout = res.bezorging.laatsteFout;
        } else {
          bezorgingFout = res.code;
        }
      }

      const samengevoegdeSleutels = [...new Set([...t.geheugenSleutels, ...extraSleutels])].slice(0, 64);
      const nieuwStatus = invoer.status ? schoonTaakStatus(invoer.status, t.status) : t.status === 'open' ? 'bezig' : t.status;

      const { bijgewerkt, stap } = await alsGebruiker(lade.userId, async (q) => {
        const stapRij = await q(
          `INSERT INTO ${TABEL_TAAK_STAPPEN} (
             user_id, ruimte, taak_id, stap_soort, van_agent, naar_agent,
             samenvatting, knoop_id, bezorging_id, bestands_verwijzingen
           ) VALUES ($1, $2, $3, 'overdracht', $4, $5, $6, $7, $8, $9::jsonb)
           RETURNING ${STAP_KOLOMMEN}`,
          [
            lade.userId, lade.ruimte, t.id, vanAgent, naarAgent,
            samenvatting, knoopId, bezorgingId, jsonbTekst(bestanden.waarde),
          ],
        );
        const taakRij = await q(
          `UPDATE ${TABEL_TAKEN}
           SET status = $1,
               huidige_agent = $2,
               laatste_knoop_id = COALESCE($3, laatste_knoop_id),
               laatste_bezorging_id = COALESCE($4, laatste_bezorging_id),
               geheugen_sleutels = $5::text[],
               bijgewerkt_op = now()
           WHERE user_id = $6 AND ruimte = $7 AND id = $8
           RETURNING ${TAAK_KOLOMMEN}`,
          [nieuwStatus, naarAgent, knoopId, bezorgingId, samengevoegdeSleutels, lade.userId, lade.ruimte, t.id],
        );
        return {
          stap: rijNaarStap(stapRij.rows[0] as Record<string, unknown>),
          bijgewerkt: rijNaarTaak(taakRij.rows[0] as Record<string, unknown>),
        };
      });

      const st = await laadStappen(lade, bijgewerkt.id);
      const pakket = await verrijkPakket(lade, bijgewerkt, st, stroom, bots);
      return { ok: true, pakket, stap, bezorgd, ...(bezorgingFout ? { bezorgingFout } : {}) };
    },
  };
}

export const pgTakenOpslag = maakPgTakenOpslag();

type SessieUitkomst =
  | { errorCode: string }
  | { user: { id: string; email: string; role: string; status: string; entitlements?: unknown }; service: string };

export interface GeheugenTakenDeps {
  requireSession: (event: Record<string, unknown>, body: unknown) => Promise<SessieUitkomst>;
  opslag?: TakenOpslag;
  ladeVan?: (userId: string, body: unknown) => Promise<Lade>;
  limiet?: (userId: string) => Promise<boolean>;
}

function lichaam(b: unknown): Record<string, unknown> {
  return b && typeof b === 'object' && !Array.isArray(b) ? (b as Record<string, unknown>) : {};
}

export function geheugenTakenRoutes(deps: GeheugenTakenDeps) {
  const opslag = deps.opslag ?? pgTakenOpslag;
  const ladeVan = deps.ladeVan ?? ecosysteemLade;
  const limiet = deps.limiet ?? (async (userId: string) => (await rateLimit(`geheugen-taken:${userId}`, 120, 60)).ok);

  async function poort(ctx: { event: Record<string, unknown>; body: unknown }, write: boolean) {
    const auth = await deps.requireSession(ctx.event, ctx.body);
    if ('errorCode' in auth || !(DIENSTEN as readonly string[]).includes(auth.service) || auth.user.status !== 'approved') {
      return { fout: error(weigerCode(undefined), 403) };
    }
    if (!heeftApiRecht(auth.user as never)) return { fout: error(weigerCode(GEEN_RECHT), 403) };
    const vreemde = rejectForeignOwnerUserId(auth.user, ctx.body);
    if (vreemde) return { fout: vreemde };
    if (write) {
      const m = denyMutation(auth.user as never, 'workspace.write');
      if (m) return { fout: m };
    }
    if (!(await limiet(auth.user.id))) {
      return { fout: error('GEHEUGEN_TE_VEEL_VERZOEKEN', 429) };
    }
    const lade = await ladeVan(auth.user.id, ctx.body);
    return { user: auth.user, lade };
  }

  return {
    'POST /api/owner/ai/geheugen/taken/overzicht': [(async (raw) => {
      const ctx = raw as unknown as { event: Record<string, unknown>; body: unknown };
      const p = await poort(ctx, false);
      if ('fout' in p) return p.fout;
      const b = lichaam(ctx.body);
      const data = await opslag.overzicht(p.lade, {
        status: typeof b.status === 'string' && b.status ? schoonTaakStatus(b.status) : undefined,
        agent: typeof b.agent === 'string' ? b.agent : undefined,
        vraag: typeof b.vraag === 'string' ? b.vraag : undefined,
        limiet: b.limiet != null ? Number(b.limiet) : undefined,
      });
      return json({ ...data, ruimte: p.lade.ruimte });
    }) as RouterMiddleware],

    'POST /api/owner/ai/geheugen/taken/detail': [(async (raw) => {
      const ctx = raw as unknown as { event: Record<string, unknown>; body: unknown };
      const p = await poort(ctx, false);
      if ('fout' in p) return p.fout;
      const b = lichaam(ctx.body);
      const res = await opslag.detail(p.lade, String(b.taakSleutel ?? b.taak_sleutel ?? ''));
      if (!res.ok) return error(res.code, res.httpStatus ?? 400);
      return json({ ...res.pakket, ruimte: p.lade.ruimte });
    }) as RouterMiddleware],

    'POST /api/owner/ai/geheugen/taken/opslaan': [(async (raw) => {
      const ctx = raw as unknown as { event: Record<string, unknown>; body: unknown };
      const p = await poort(ctx, true);
      if ('fout' in p) return p.fout;
      const b = lichaam(ctx.body);
      const wie = huidigeNamens();
      const res = await opslag.opslaan(
        p.lade,
        {
          taakSleutel: String(b.taakSleutel ?? b.taak_sleutel ?? ''),
          titel: String(b.titel ?? ''),
          doel: typeof b.doel === 'string' ? b.doel : undefined,
          status: typeof b.status === 'string' ? (b.status as TaakStatus) : undefined,
          prioriteit: typeof b.prioriteit === 'string' ? (b.prioriteit as TaakPrioriteit) : undefined,
          huidigeAgent: typeof b.huidigeAgent === 'string'
            ? b.huidigeAgent
            : typeof b.huidige_agent === 'string'
              ? b.huidige_agent
              : undefined,
          afstemmingKaartId: typeof b.afstemmingKaartId === 'string' ? b.afstemmingKaartId : undefined,
          afstemmingExternId: typeof b.afstemmingExternId === 'string' ? b.afstemmingExternId : undefined,
          geheugenSleutels: Array.isArray(b.geheugenSleutels) ? b.geheugenSleutels.map(String) : undefined,
          eigenaarVereist: b.eigenaarVereist === undefined ? undefined : Boolean(b.eigenaarVereist),
          eersteSamenvatting: typeof b.eersteSamenvatting === 'string' ? b.eersteSamenvatting : undefined,
        },
        wie?.agent || (wie?.client && wie.client !== '?' ? wie.client : ''),
      );
      if (!res.ok) return error(res.code, res.httpStatus ?? 400);
      await auditToevoegen({
        ownerId: p.user.id,
        action: 'owner.ai.geheugen.taken.opslaan',
        result: 'success',
        details: {
          ruimte: p.lade.ruimte,
          taakSleutel: res.pakket.taak.taakSleutel,
          status: res.pakket.taak.status,
          nieuw: res.nieuw,
        },
      }).catch(() => undefined);
      return json({ ...res, ruimte: p.lade.ruimte });
    }) as RouterMiddleware],

    'POST /api/owner/ai/geheugen/taken/stap': [(async (raw) => {
      const ctx = raw as unknown as { event: Record<string, unknown>; body: unknown };
      const p = await poort(ctx, true);
      if ('fout' in p) return p.fout;
      const b = lichaam(ctx.body);
      const wie = huidigeNamens();
      const res = await opslag.stapToevoegen(
        p.lade,
        {
          taakSleutel: String(b.taakSleutel ?? b.taak_sleutel ?? ''),
          stapSoort: typeof b.stapSoort === 'string' ? schoonTaakStapSoort(b.stapSoort) : undefined,
          vanAgent: typeof b.vanAgent === 'string' ? b.vanAgent : undefined,
          naarAgent: typeof b.naarAgent === 'string' ? b.naarAgent : undefined,
          samenvatting: String(b.samenvatting ?? ''),
          status: typeof b.status === 'string' && b.status ? schoonTaakStatus(b.status) : undefined,
          knoopId: typeof b.knoopId === 'string' ? b.knoopId : undefined,
          bezorgingId: typeof b.bezorgingId === 'string' ? b.bezorgingId : undefined,
          bestandsVerwijzingen: Array.isArray(b.bestandsVerwijzingen)
            ? (b.bestandsVerwijzingen as BestandsVerwijzing[])
            : undefined,
        },
        wie?.agent || (wie?.client && wie.client !== '?' ? wie.client : ''),
      );
      if (!res.ok) return error(res.code, res.httpStatus ?? 400);
      await auditToevoegen({
        ownerId: p.user.id,
        action: 'owner.ai.geheugen.taken.stap',
        result: 'success',
        details: {
          ruimte: p.lade.ruimte,
          taakSleutel: res.pakket.taak.taakSleutel,
          stapSoort: res.stap.stapSoort,
        },
      }).catch(() => undefined);
      return json({ ...res, ruimte: p.lade.ruimte });
    }) as RouterMiddleware],

    'POST /api/owner/ai/geheugen/taken/overdragen': [(async (raw) => {
      const ctx = raw as unknown as { event: Record<string, unknown>; body: unknown };
      const p = await poort(ctx, true);
      if ('fout' in p) return p.fout;
      const b = lichaam(ctx.body);
      const wie = huidigeNamens();
      const res = await opslag.overdragen(
        p.lade,
        {
          taakSleutel: String(b.taakSleutel ?? b.taak_sleutel ?? ''),
          titel: typeof b.titel === 'string' ? b.titel : undefined,
          doel: typeof b.doel === 'string' ? b.doel : undefined,
          vanAgent: typeof b.vanAgent === 'string' ? b.vanAgent : undefined,
          naarAgent: String(b.naarAgent ?? b.naar_agent ?? ''),
          samenvatting: String(b.samenvatting ?? ''),
          status: typeof b.status === 'string' && b.status ? schoonTaakStatus(b.status) : undefined,
          prioriteit: typeof b.prioriteit === 'string' && b.prioriteit ? schoonTaakPrioriteit(b.prioriteit) : undefined,
          knoopId: typeof b.knoopId === 'string' ? b.knoopId : undefined,
          bewaarInStroom: b.bewaarInStroom === undefined ? true : Boolean(b.bewaarInStroom),
          ookBezorgen: b.ookBezorgen === true,
          geheugenSleutels: Array.isArray(b.geheugenSleutels) ? b.geheugenSleutels.map(String) : undefined,
          afstemmingKaartId: typeof b.afstemmingKaartId === 'string' ? b.afstemmingKaartId : undefined,
          afstemmingExternId: typeof b.afstemmingExternId === 'string' ? b.afstemmingExternId : undefined,
          bestandsVerwijzingen: Array.isArray(b.bestandsVerwijzingen)
            ? (b.bestandsVerwijzingen as BestandsVerwijzing[])
            : undefined,
          sessieId: typeof b.sessieId === 'string' ? b.sessieId : undefined,
        },
        wie?.agent || (wie?.client && wie.client !== '?' ? wie.client : ''),
      );
      if (!res.ok) return error(res.code, res.httpStatus ?? 400);
      await auditToevoegen({
        ownerId: p.user.id,
        action: 'owner.ai.geheugen.taken.overdragen',
        result: 'success',
        details: {
          ruimte: p.lade.ruimte,
          taakSleutel: res.pakket.taak.taakSleutel,
          vanAgent: res.stap.vanAgent,
          naarAgent: res.stap.naarAgent,
          bezorgd: res.bezorgd,
        },
      }).catch(() => undefined);
      return json({ ...res, ruimte: p.lade.ruimte });
    }) as RouterMiddleware],
  };
}
