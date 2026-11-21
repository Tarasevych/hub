// Serveropslag voor het ecosysteem van modulaire agentvaardigheden (migratie 0279).
// Combineert:
//   • ingebouwde platform- en protocolvaardigheden (.agents/skills/* + scripts/vaardigheden/catalogus.json + MCP_VAARDIGHEDEN);
//   • eigen en geïmporteerde vaardigheden van de gebruiker per ruimte ('prive' | 'technisch') onder RLS (alsGebruiker);
//   • agentkoppelingen en aan/uit-schakelaars per agent (app.vaardigheden_agent_stand);
//   • volledige versiehistorie en herstel van revisies (app.vaardigheden_revisies).

import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { alsGebruiker } from './ai-toestemmingen';
import { MCP_VAARDIGHEDEN } from '../shared/mcp-protocol-2026-model';
import type { AgentSlug } from '../shared/connector-v2/agenten';
import { isAgentSlug } from '../shared/connector-v2/agenten';
import type { Lade } from '../shared/ruimte-scheiding';
import {
  effectieveVaardighedenVoorAgent,
  schoonAgentKoppelingen,
  schoonLijst,
  splitsTweetaligeSkillInhoud,
  valideerVaardigheidInvoer,
  VAARD_SLUG_RE,
  type VaardigheidAgentStand,
  type VaardigheidInvoer,
  type VaardigheidItem,
  type VaardigheidRevisie,
  type VaardigheidRuimte,
} from '../shared/vaardigheden-ecosysteem';

type CatalogusRegel = {
  id?: string;
  naam?: string;
  map?: string;
  pad?: string;
  versie?: string;
  afhankelijkheden?: string[];
  titel?: { uk?: string; nl?: string };
  samenvatting?: { uk?: string; nl?: string };
  termen?: { uk?: string[]; nl?: string[] };
  vereisteHulpmiddelen?: string[];
  vereiste_hulpmiddelen?: string[];
  ruimte?: string;
};

const SYSTEEM_TITEL_NL: Readonly<Record<string, string>> = Object.freeze({
  'project-verkennen': 'Projectopbouw van Mijn Ruimte verkennen',
  'site-ontwikkelen': 'Onderdelen van Mijn Ruimte ontwikkelen',
  'wijziging-controleren': 'Wijzigingen controleren vóór overdracht',
  'uitgave-voorbereiden': 'Uitgaven voorbereiden, installeren en terugdraaien',
  'ontwikkelgeheugen-bewaken': 'Ontwikkelgeheugen en besluithistorie bewaken',
  'koppelingen-echte-vorm-testen': 'Koppelingen in echte vorm testen',
  'uiterlijk-van-schermafdruk-herstellen': 'Uiterlijke fouten op basis van schermafdrukken herstellen',
  'prestatie-meten': 'Snelheid en prestaties van site en database meten',
  'mijn-ruimte': 'Mijn Ruimte — Google Antigravity-connector en tweerichtingsbrug',
});

let cacheTijd = 0;
let cacheMtime = 0;
let cacheItems: VaardigheidItem[] | null = null;

function leesCatalogusPad(): string {
  return resolve(process.cwd(), 'scripts/vaardigheden/catalogus.json');
}

function leesIngebouwdeUitSchijf(): VaardigheidItem[] {
  const catalogusPad = leesCatalogusPad();
  const protocolItems: VaardigheidItem[] = MCP_VAARDIGHEDEN.map((v) => ({
    id: v.id,
    uri: v.uri,
    bron: 'protocol',
    ruimte: 'beide',
    versie: 1,
    actief: true,
    agentKoppelingen: [],
    titel: { uk: v.titel.uk, nl: v.titel.nl },
    samenvatting: { uk: v.beschrijving.uk, nl: v.beschrijving.nl },
    inhoud: { uk: v.inhoud.uk, nl: v.inhoud.nl },
    termen: {
      uk: v.id.split('-'),
      nl: v.id.split('-'),
    },
    vereisteHulpmiddelen: [],
    heeftVoorbeeld: false,
    bijgewerktOp: 0,
  }));

  if (!existsSync(catalogusPad)) return protocolItems;

  try {
    const nu = Date.now();
    const st = statSync(catalogusPad);
    if (cacheItems && nu - cacheTijd < 15_000 && st.mtimeMs === cacheMtime) {
      return cacheItems;
    }

    const ruw = JSON.parse(readFileSync(catalogusPad, 'utf8')) as { vaardigheden?: CatalogusRegel[] };
    const regels = Array.isArray(ruw.vaardigheden) ? ruw.vaardigheden : [];
    const systeemItems: VaardigheidItem[] = [];
    const gezieneIds = new Set<string>();
    const basisSkillsDir = resolve(process.cwd(), '.agents/skills');

    for (const r of regels) {
      const skillId = String(r?.naam ?? r?.id ?? '').trim().toLowerCase();
      if (!skillId || !VAARD_SLUG_RE.test(skillId) || gezieneIds.has(skillId)) continue;

      const relPad = typeof r.pad === 'string' && r.pad.trim()
        ? r.pad.trim()
        : typeof r.map === 'string' && r.map.trim()
          ? `${r.map.trim()}/SKILL.md`
          : `.agents/skills/${skillId}/SKILL.md`;
      const skillPad = resolve(process.cwd(), relPad);
      if (!skillPad.startsWith(basisSkillsDir) || !existsSync(skillPad)) continue;

      const ruweSkill = readFileSync(skillPad, 'utf8');
      const mdHeading = /^#\s+(.+)$/m.exec(ruweSkill.replace(/^---[\s\S]*?---\s*/, ''))?.[1]?.trim();
      const samenvattingUk = String(r.samenvatting?.uk ?? '').trim();
      const samenvattingNl = String(r.samenvatting?.nl ?? '').trim();
      const titelUk = String(r.titel?.uk ?? mdHeading ?? skillId).trim();
      const titelNl = String(r.titel?.nl ?? SYSTEEM_TITEL_NL[skillId] ?? (samenvattingNl || skillId)).trim();
      const skillMap = resolve(skillPad, '..');
      // KLIMOP-018: якщо SKILL.md одномовний, а поруч є парний VAARDIGHEID.nl.md, нідерландський вміст береться з нього,
      // а не з українського тексту з приміткою. · Eentalige SKILL.md + VAARDIGHEID.nl.md: nl-inhoud uit het paarbestand.
      const nlPaarPad = resolve(skillMap, 'VAARDIGHEID.nl.md');
      const gesplitstRuw = splitsTweetaligeSkillInhoud(ruweSkill, { uk: titelUk, nl: titelNl });
      const heeftTaalMarkering = /<!--\s*lang:nl\s*-->|\n##\s+Nederlands/i.test(ruweSkill);
      const gesplitst = !heeftTaalMarkering && existsSync(nlPaarPad)
        ? { uk: gesplitstRuw.uk, nl: readFileSync(nlPaarPad, 'utf8').replace(/^---[\s\S]*?---\s*/, '').trim() || gesplitstRuw.nl }
        : gesplitstRuw;
      const voorbeeldPad = resolve(skillMap, 'VOORBEELD.uk.md');
      const ruimteBereik = skillId === 'uitgave-voorbereiden' || r.ruimte === 'technisch' ? 'technisch' : 'beide';
      const reqTools = Array.isArray(r.vereisteHulpmiddelen)
        ? r.vereisteHulpmiddelen
        : Array.isArray(r.vereiste_hulpmiddelen)
          ? r.vereiste_hulpmiddelen
          : [];
      const versieSemver = typeof r.versie === 'string' && r.versie.trim() ? r.versie.trim() : '1.0.0';
      const afhankelijkheden = Array.isArray(r.afhankelijkheden)
        ? r.afhankelijkheden.map((x) => String(x).trim()).filter(Boolean)
        : [];

      gezieneIds.add(skillId);
      systeemItems.push({
        id: skillId,
        uri: `mr://skills/${skillId}`,
        bron: 'systeem',
        ruimte: ruimteBereik,
        versie: 1,
        versieSemver,
        afhankelijkheden,
        actief: true,
        agentKoppelingen: [],
        titel: { uk: titelUk, nl: titelNl },
        samenvatting: { uk: samenvattingUk, nl: samenvattingNl },
        inhoud: { uk: gesplitst.uk, nl: gesplitst.nl },
        termen: {
          uk: Array.isArray(r.termen?.uk) ? r.termen.uk : [],
          nl: Array.isArray(r.termen?.nl) ? r.termen.nl : [],
        },
        vereisteHulpmiddelen: reqTools,
        heeftVoorbeeld: existsSync(voorbeeldPad),
        bijgewerktOp: Math.trunc(statSync(skillPad).mtimeMs),
      });
    }

    for (const pItem of protocolItems) {
      if (!gezieneIds.has(pItem.id)) {
        gezieneIds.add(pItem.id);
        systeemItems.push(pItem);
      }
    }

    cacheItems = systeemItems;
    cacheMtime = st.mtimeMs;
    cacheTijd = nu;
    return systeemItems;
  } catch {
    return protocolItems;
  }
}

export function leesIngebouwdeVaardigheden(): VaardigheidItem[] {
  return leesIngebouwdeUitSchijf();
}

export function resetVaardighedenCacheVoorTest(): void {
  cacheItems = null;
  cacheTijd = 0;
  cacheMtime = 0;
}

function rijNaarEigenVaardigheid(r: Record<string, unknown>): VaardigheidItem {
  const slug = String(r.slug ?? '');
  return {
    id: slug,
    uri: `mr://skills/${slug}`,
    bron: r.bron === 'geimporteerd' ? 'geimporteerd' : 'eigen',
    ruimte: r.ruimte === 'technisch' ? 'technisch' : 'prive',
    versie: Number(r.versie) || 1,
    actief: r.actief !== false,
    agentKoppelingen: schoonAgentKoppelingen(r.agent_koppelingen),
    titel: { uk: String(r.titel_uk ?? ''), nl: String(r.titel_nl ?? '') },
    samenvatting: { uk: String(r.samenvatting_uk ?? ''), nl: String(r.samenvatting_nl ?? '') },
    inhoud: { uk: String(r.inhoud_uk ?? ''), nl: String(r.inhoud_nl ?? '') },
    termen: {
      uk: schoonLijst(r.termen_uk, 40, 80),
      nl: schoonLijst(r.termen_nl, 40, 80),
    },
    vereisteHulpmiddelen: schoonLijst(r.vereiste_hulpmiddelen, 24, 80),
    heeftVoorbeeld: false,
    bijgewerktOp: Number(r.bijgewerkt) || Date.now(),
  };
}

function rijNaarAgentStand(r: Record<string, unknown>): VaardigheidAgentStand {
  const rawSlug = String(r.agent_slug ?? '*');
  const agentSlug: AgentSlug | '*' = rawSlug === '*' ? '*' : (isAgentSlug(rawSlug) ? rawSlug : '*');
  return {
    agentSlug,
    vaardigheidId: String(r.vaardigheid_id ?? ''),
    actief: r.actief !== false,
    prioriteit: Number(r.prioriteit) || 100,
    notitie: String(r.notitie ?? ''),
    bijgewerktOp: Number(r.bijgewerkt) || Date.now(),
  };
}

function rijNaarRevisie(r: Record<string, unknown>): VaardigheidRevisie {
  const actie = String(r.actie ?? 'bijgewerkt');
  const geldigeActie = (
    ['aangemaakt', 'bijgewerkt', 'geimporteerd', 'hersteld', 'verwijderd', 'koppeling_gewijzigd'] as const
  ).includes(actie as never)
    ? (actie as VaardigheidRevisie['actie'])
    : 'bijgewerkt';
  return {
    id: String(r.id ?? ''),
    vaardigheidSlug: String(r.vaardigheid_slug ?? ''),
    versie: Number(r.versie) || 1,
    actie: geldigeActie,
    doorAgent: String(r.door_agent ?? ''),
    momentopname: (r.momentopname && typeof r.momentopname === 'object' ? r.momentopname : {}) as Record<string, unknown>,
    aangemaaktOp: Number(r.aangemaakt) || Date.now(),
  };
}

export interface VaardighedenOpslag {
  overzicht(lade: Lade): Promise<{
    ingebouwd: VaardigheidItem[];
    eigen: VaardigheidItem[];
    standen: VaardigheidAgentStand[];
    revisies: VaardigheidRevisie[];
  }>;
  alleActieveVoorContext(lade: Lade, agentSlug?: AgentSlug): Promise<VaardigheidItem[]>;
  opslaan(
    lade: Lade,
    invoer: VaardigheidInvoer,
    doorAgent?: string,
  ): Promise<{ ok: true; item: VaardigheidItem; aangemaakt: boolean } | { ok: false; code: string }>;
  verwijderen(
    lade: Lade,
    slug: string,
    doorAgent?: string,
  ): Promise<{ ok: true } | { ok: false; code: string }>;
  zetAgentStand(
    lade: Lade,
    invoer: { agentSlug: AgentSlug | '*'; vaardigheidId: string; actief: boolean; prioriteit?: number; notitie?: string },
    doorAgent?: string,
  ): Promise<{ ok: true; stand: VaardigheidAgentStand } | { ok: false; code: string }>;
  herstelRevisie(
    lade: Lade,
    revisieId: string,
    doorAgent?: string,
  ): Promise<{ ok: true; item: VaardigheidItem } | { ok: false; code: string }>;
}

const EIGEN_KOL = `slug, ruimte, versie, titel_uk, titel_nl, samenvatting_uk, samenvatting_nl, inhoud_uk, inhoud_nl, termen_uk, termen_nl, vereiste_hulpmiddelen, agent_koppelingen, bron, actief, (extract(epoch FROM bijgewerkt_op) * 1000)::bigint AS bijgewerkt`;
const STAND_KOL = `agent_slug, vaardigheid_id, actief, prioriteit, notitie, (extract(epoch FROM bijgewerkt_op) * 1000)::bigint AS bijgewerkt`;
const REV_KOL = `id, vaardigheid_slug, versie, actie, momentopname, door_agent, (extract(epoch FROM aangemaakt_op) * 1000)::bigint AS aangemaakt`;

export const pgVaardighedenOpslag: VaardighedenOpslag = {
  async overzicht(lade) {
    const ingebouwd = leesIngebouwdeUitSchijf().filter((v) =>
      lade.ruimte === 'technisch' ? true : v.ruimte !== 'technisch',
    );
    return alsGebruiker(lade.userId, async (q) => {
      const [eigenRes, standRes, revRes] = await Promise.all([
        q(`SELECT ${EIGEN_KOL} FROM app.vaardigheden_eigen WHERE user_id = $1 AND ruimte = $2 ORDER BY bijgewerkt_op DESC LIMIT 100`, [lade.userId, lade.ruimte]),
        q(`SELECT ${STAND_KOL} FROM app.vaardigheden_agent_stand WHERE user_id = $1 AND ruimte = $2 ORDER BY bijgewerkt_op DESC LIMIT 400`, [lade.userId, lade.ruimte]),
        q(`SELECT ${REV_KOL} FROM app.vaardigheden_revisies WHERE user_id = $1 AND ruimte = $2 ORDER BY aangemaakt_op DESC LIMIT 120`, [lade.userId, lade.ruimte]),
      ]);
      return {
        ingebouwd,
        eigen: eigenRes.rows.map(rijNaarEigenVaardigheid),
        standen: standRes.rows.map(rijNaarAgentStand),
        revisies: revRes.rows.map(rijNaarRevisie),
      };
    });
  },

  async alleActieveVoorContext(lade, agentSlug) {
    const { ingebouwd, eigen, standen } = await this.overzicht(lade);
    const eigenSlugs = new Set(eigen.map((e) => e.id));
    const gecombineerd = [...eigen, ...ingebouwd.filter((v) => !eigenSlugs.has(v.id))];
    return effectieveVaardighedenVoorAgent(gecombineerd, standen, {
      agentSlug,
      ruimte: lade.ruimte as VaardigheidRuimte,
    });
  },

  async opslaan(lade, invoer, doorAgent = '') {
    const ingebouwdIds = new Set(leesIngebouwdeUitSchijf().map((v) => v.id));
    if (ingebouwdIds.has(invoer.slug)) {
      return { ok: false, code: 'VAARD_SLUG_ONGELDIG' };
    }
    const schoonAgent = String(doorAgent).trim().slice(0, 48);
    return alsGebruiker(lade.userId, async (q) => {
      const bestaand = (
        await q(
          'SELECT versie FROM app.vaardigheden_eigen WHERE user_id = $1 AND ruimte = $2 AND slug = $3',
          [lade.userId, lade.ruimte, invoer.slug],
        )
      ).rows[0];
      const aangemaakt = !bestaand;
      const nieuweVersie = bestaand ? Number(bestaand.versie) + 1 : 1;

      const r = (
        await q(
          `INSERT INTO app.vaardigheden_eigen
             (user_id, ruimte, slug, versie, titel_uk, titel_nl, samenvatting_uk, samenvatting_nl, inhoud_uk, inhoud_nl,
              termen_uk, termen_nl, vereiste_hulpmiddelen, agent_koppelingen, bron, actief, bijgewerkt_op)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, now())
           ON CONFLICT (user_id, ruimte, slug) DO UPDATE SET
             versie = EXCLUDED.versie,
             titel_uk = EXCLUDED.titel_uk,
             titel_nl = EXCLUDED.titel_nl,
             samenvatting_uk = EXCLUDED.samenvatting_uk,
             samenvatting_nl = EXCLUDED.samenvatting_nl,
             inhoud_uk = EXCLUDED.inhoud_uk,
             inhoud_nl = EXCLUDED.inhoud_nl,
             termen_uk = EXCLUDED.termen_uk,
             termen_nl = EXCLUDED.termen_nl,
             vereiste_hulpmiddelen = EXCLUDED.vereiste_hulpmiddelen,
             agent_koppelingen = EXCLUDED.agent_koppelingen,
             bron = EXCLUDED.bron,
             actief = EXCLUDED.actief,
             bijgewerkt_op = now()
           RETURNING ${EIGEN_KOL}`,
          [
            lade.userId,
            lade.ruimte,
            invoer.slug,
            nieuweVersie,
            invoer.titelUk,
            invoer.titelNl,
            invoer.samenvattingUk,
            invoer.samenvattingNl,
            invoer.inhoudUk,
            invoer.inhoudNl,
            invoer.termenUk,
            invoer.termenNl,
            invoer.vereisteHulpmiddelen,
            invoer.agentKoppelingen,
            invoer.bron,
            invoer.actief,
          ],
        )
      ).rows[0];

      const item = rijNaarEigenVaardigheid(r);
      const actie: VaardigheidRevisie['actie'] =
        invoer.bron === 'geimporteerd' && aangemaakt ? 'geimporteerd' : aangemaakt ? 'aangemaakt' : 'bijgewerkt';

      await q(
        `INSERT INTO app.vaardigheden_revisies
           (user_id, ruimte, vaardigheid_slug, versie, actie, momentopname, door_agent)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
        [
          lade.userId,
          lade.ruimte,
          invoer.slug,
          item.versie,
          actie,
          JSON.stringify({
            slug: item.id,
            versie: item.versie,
            titelUk: item.titel.uk,
            titelNl: item.titel.nl,
            samenvattingUk: item.samenvatting.uk,
            samenvattingNl: item.samenvatting.nl,
            inhoudUk: item.inhoud.uk,
            inhoudNl: item.inhoud.nl,
            termenUk: item.termen.uk,
            termenNl: item.termen.nl,
            vereisteHulpmiddelen: item.vereisteHulpmiddelen,
            agentKoppelingen: item.agentKoppelingen,
            actief: item.actief,
          }),
          schoonAgent,
        ],
      );

      return { ok: true, item, aangemaakt };
    });
  },

  async verwijderen(lade, slug, doorAgent = '') {
    const schoonSlug = String(slug ?? '').trim().toLowerCase();
    if (!VAARD_SLUG_RE.test(schoonSlug)) return { ok: false, code: 'VAARD_SLUG_ONGELDIG' };
    if (leesIngebouwdeUitSchijf().some((v) => v.id === schoonSlug)) {
      return { ok: false, code: 'VAARD_SYSTEEM_ALLEEN_SCHAKELEN' };
    }
    const schoonAgent = String(doorAgent).trim().slice(0, 48);

    return alsGebruiker(lade.userId, async (q) => {
      const bestaand = (
        await q(
          `DELETE FROM app.vaardigheden_eigen WHERE user_id = $1 AND ruimte = $2 AND slug = $3 RETURNING ${EIGEN_KOL}`,
          [lade.userId, lade.ruimte, schoonSlug],
        )
      ).rows[0];
      if (!bestaand) return { ok: false, code: 'VAARD_NIET_GEVONDEN' };

      const item = rijNaarEigenVaardigheid(bestaand);
      await q(
        'DELETE FROM app.vaardigheden_agent_stand WHERE user_id = $1 AND ruimte = $2 AND vaardigheid_id = $3',
        [lade.userId, lade.ruimte, schoonSlug],
      );
      await q(
        `INSERT INTO app.vaardigheden_revisies
           (user_id, ruimte, vaardigheid_slug, versie, actie, momentopname, door_agent)
         VALUES ($1, $2, $3, $4, 'verwijderd', $5::jsonb, $6)`,
        [
          lade.userId,
          lade.ruimte,
          schoonSlug,
          item.versie,
          JSON.stringify({ slug: schoonSlug, versie: item.versie, titelUk: item.titel.uk, titelNl: item.titel.nl }),
          schoonAgent,
        ],
      );
      return { ok: true };
    });
  },

  async zetAgentStand(lade, invoer, doorAgent = '') {
    const vaardId = String(invoer.vaardigheidId ?? '').trim().toLowerCase();
    if (!VAARD_SLUG_RE.test(vaardId)) return { ok: false, code: 'VAARD_SLUG_ONGELDIG' };
    const agentSlug: AgentSlug | '*' =
      invoer.agentSlug === '*' ? '*' : isAgentSlug(invoer.agentSlug) ? invoer.agentSlug : '*';
    const prioriteit = Math.max(0, Math.min(1000, Math.trunc(Number(invoer.prioriteit) || 100)));
    const notitie = String(invoer.notitie ?? '').trim().slice(0, 400);
    const schoonAgent = String(doorAgent).trim().slice(0, 48);

    const ingebouwd = leesIngebouwdeUitSchijf().find((v) => v.id === vaardId);
    if (ingebouwd && ingebouwd.ruimte === 'technisch' && lade.ruimte !== 'technisch') {
      return { ok: false, code: 'VAARD_TECH_PROFIEL_VEREIST' };
    }

    return alsGebruiker(lade.userId, async (q) => {
      if (!ingebouwd) {
        const eigenAanwezig = (
          await q(
            'SELECT 1 FROM app.vaardigheden_eigen WHERE user_id = $1 AND ruimte = $2 AND slug = $3',
            [lade.userId, lade.ruimte, vaardId],
          )
        ).rows[0];
        if (!eigenAanwezig) return { ok: false, code: 'VAARD_NIET_GEVONDEN' };
      }

      const r = (
        await q(
          `INSERT INTO app.vaardigheden_agent_stand
             (user_id, ruimte, agent_slug, vaardigheid_id, actief, prioriteit, notitie, bijgewerkt_op)
           VALUES ($1, $2, $3, $4, $5, $6, $7, now())
           ON CONFLICT (user_id, ruimte, agent_slug, vaardigheid_id) DO UPDATE SET
             actief = EXCLUDED.actief,
             prioriteit = EXCLUDED.prioriteit,
             notitie = EXCLUDED.notitie,
             bijgewerkt_op = now()
           RETURNING ${STAND_KOL}`,
          [lade.userId, lade.ruimte, agentSlug, vaardId, invoer.actief !== false, prioriteit, notitie],
        )
      ).rows[0];

      await q(
        `INSERT INTO app.vaardigheden_revisies
           (user_id, ruimte, vaardigheid_slug, versie, actie, momentopname, door_agent)
         VALUES ($1, $2, $3, 1, 'koppeling_gewijzigd', $4::jsonb, $5)`,
        [
          lade.userId,
          lade.ruimte,
          vaardId,
          JSON.stringify({ agentSlug, actief: invoer.actief !== false, prioriteit, notitie }),
          schoonAgent,
        ],
      );

      return { ok: true, stand: rijNaarAgentStand(r) };
    });
  },

  async herstelRevisie(lade, revisieId, doorAgent = '') {
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRe.test(String(revisieId ?? ''))) return { ok: false, code: 'VAARD_NIET_GEVONDEN' };
    const schoonAgent = String(doorAgent).trim().slice(0, 48);

    return alsGebruiker(lade.userId, async (q) => {
      const rev = (
        await q(
          `SELECT ${REV_KOL} FROM app.vaardigheden_revisies WHERE user_id = $1 AND ruimte = $2 AND id = $3::uuid`,
          [lade.userId, lade.ruimte, revisieId],
        )
      ).rows[0];
      if (!rev) return { ok: false, code: 'VAARD_NIET_GEVONDEN' };

      const snap = (rev.momentopname && typeof rev.momentopname === 'object' ? rev.momentopname : {}) as Record<string, unknown>;
      const valid = valideerVaardigheidInvoer({
        slug: snap.slug ?? rev.vaardigheid_slug,
        titelUk: snap.titelUk,
        titelNl: snap.titelNl,
        samenvattingUk: snap.samenvattingUk,
        samenvattingNl: snap.samenvattingNl,
        inhoudUk: snap.inhoudUk,
        inhoudNl: snap.inhoudNl,
        termenUk: snap.termenUk,
        termenNl: snap.termenNl,
        vereisteHulpmiddelen: snap.vereisteHulpmiddelen,
        agentKoppelingen: snap.agentKoppelingen,
        bron: 'eigen',
        actief: snap.actief !== false,
      });
      if (!valid.ok) return { ok: false, code: valid.code };

      const bestaand = (
        await q(
          'SELECT versie FROM app.vaardigheden_eigen WHERE user_id = $1 AND ruimte = $2 AND slug = $3',
          [lade.userId, lade.ruimte, valid.waarde.slug],
        )
      ).rows[0];
      const nieuweVersie = bestaand ? Number(bestaand.versie) + 1 : 1;

      const r = (
        await q(
          `INSERT INTO app.vaardigheden_eigen
             (user_id, ruimte, slug, versie, titel_uk, titel_nl, samenvatting_uk, samenvatting_nl, inhoud_uk, inhoud_nl,
              termen_uk, termen_nl, vereiste_hulpmiddelen, agent_koppelingen, bron, actief, bijgewerkt_op)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'eigen', $15, now())
           ON CONFLICT (user_id, ruimte, slug) DO UPDATE SET
             versie = EXCLUDED.versie,
             titel_uk = EXCLUDED.titel_uk,
             titel_nl = EXCLUDED.titel_nl,
             samenvatting_uk = EXCLUDED.samenvatting_uk,
             samenvatting_nl = EXCLUDED.samenvatting_nl,
             inhoud_uk = EXCLUDED.inhoud_uk,
             inhoud_nl = EXCLUDED.inhoud_nl,
             termen_uk = EXCLUDED.termen_uk,
             termen_nl = EXCLUDED.termen_nl,
             vereiste_hulpmiddelen = EXCLUDED.vereiste_hulpmiddelen,
             agent_koppelingen = EXCLUDED.agent_koppelingen,
             actief = EXCLUDED.actief,
             bijgewerkt_op = now()
           RETURNING ${EIGEN_KOL}`,
          [
            lade.userId,
            lade.ruimte,
            valid.waarde.slug,
            nieuweVersie,
            valid.waarde.titelUk,
            valid.waarde.titelNl,
            valid.waarde.samenvattingUk,
            valid.waarde.samenvattingNl,
            valid.waarde.inhoudUk,
            valid.waarde.inhoudNl,
            valid.waarde.termenUk,
            valid.waarde.termenNl,
            valid.waarde.vereisteHulpmiddelen,
            valid.waarde.agentKoppelingen,
            valid.waarde.actief,
          ],
        )
      ).rows[0];

      const item = rijNaarEigenVaardigheid(r);
      await q(
        `INSERT INTO app.vaardigheden_revisies
           (user_id, ruimte, vaardigheid_slug, versie, actie, momentopname, door_agent)
         VALUES ($1, $2, $3, $4, 'hersteld', $5::jsonb, $6)`,
        [lade.userId, lade.ruimte, item.id, item.versie, JSON.stringify({ ...snap, versie: item.versie }), schoonAgent],
      );
      return { ok: true, item };
    });
  },
};

/** Voor eenheidstests zonder database: volledige in-memory opslag met strikte scheiding per userId en ruimte. */
export function maakGeheugenVaardighedenOpslag(): VaardighedenOpslag {
  const eigenKaart = new Map<string, VaardigheidItem[]>();
  const standKaart = new Map<string, VaardigheidAgentStand[]>();
  const revKaart = new Map<string, VaardigheidRevisie[]>();
  const ladeSleutel = (lade: Lade) => `${lade.userId}|${lade.ruimte}`;

  return {
    async overzicht(lade) {
      const ingebouwd = leesIngebouwdeUitSchijf().filter((v) =>
        lade.ruimte === 'technisch' ? true : v.ruimte !== 'technisch',
      );
      const sleutel = ladeSleutel(lade);
      return {
        ingebouwd,
        eigen: [...(eigenKaart.get(sleutel) ?? [])],
        standen: [...(standKaart.get(sleutel) ?? [])],
        revisies: [...(revKaart.get(sleutel) ?? [])],
      };
    },

    async alleActieveVoorContext(lade, agentSlug) {
      const { ingebouwd, eigen, standen } = await this.overzicht(lade);
      const eigenSlugs = new Set(eigen.map((e) => e.id));
      const gecombineerd = [...eigen, ...ingebouwd.filter((v) => !eigenSlugs.has(v.id))];
      return effectieveVaardighedenVoorAgent(gecombineerd, standen, {
        agentSlug,
        ruimte: lade.ruimte as VaardigheidRuimte,
      });
    },

    async opslaan(lade, invoer, doorAgent = '') {
      if (leesIngebouwdeUitSchijf().some((v) => v.id === invoer.slug)) {
        return { ok: false, code: 'VAARD_SLUG_ONGELDIG' };
      }
      const sleutel = ladeSleutel(lade);
      const lijst = eigenKaart.get(sleutel) ?? [];
      const idx = lijst.findIndex((x) => x.id === invoer.slug);
      const aangemaakt = idx < 0;
      const versie = idx >= 0 ? lijst[idx].versie + 1 : 1;
      const nu = Date.now();
      const item: VaardigheidItem = {
        id: invoer.slug,
        uri: `mr://skills/${invoer.slug}`,
        bron: invoer.bron,
        ruimte: lade.ruimte as VaardigheidRuimte,
        versie,
        actief: invoer.actief,
        agentKoppelingen: invoer.agentKoppelingen,
        titel: { uk: invoer.titelUk, nl: invoer.titelNl },
        samenvatting: { uk: invoer.samenvattingUk, nl: invoer.samenvattingNl },
        inhoud: { uk: invoer.inhoudUk, nl: invoer.inhoudNl },
        termen: { uk: invoer.termenUk, nl: invoer.termenNl },
        vereisteHulpmiddelen: invoer.vereisteHulpmiddelen,
        heeftVoorbeeld: false,
        bijgewerktOp: nu,
      };
      if (idx >= 0) lijst[idx] = item;
      else lijst.unshift(item);
      eigenKaart.set(sleutel, lijst);

      const revs = revKaart.get(sleutel) ?? [];
      revs.unshift({
        id: randomUUID(),
        vaardigheidSlug: item.id,
        versie: item.versie,
        actie: invoer.bron === 'geimporteerd' && aangemaakt ? 'geimporteerd' : aangemaakt ? 'aangemaakt' : 'bijgewerkt',
        doorAgent: doorAgent.slice(0, 48),
        momentopname: {
          slug: item.id,
          versie: item.versie,
          titelUk: item.titel.uk,
          titelNl: item.titel.nl,
          samenvattingUk: item.samenvatting.uk,
          samenvattingNl: item.samenvatting.nl,
          inhoudUk: item.inhoud.uk,
          inhoudNl: item.inhoud.nl,
          termenUk: item.termen.uk,
          termenNl: item.termen.nl,
          vereisteHulpmiddelen: item.vereisteHulpmiddelen,
          agentKoppelingen: item.agentKoppelingen,
          actief: item.actief,
        },
        aangemaaktOp: nu,
      });
      revKaart.set(sleutel, revs);
      return { ok: true, item, aangemaakt };
    },

    async verwijderen(lade, slug, doorAgent = '') {
      const schoonSlug = String(slug ?? '').trim().toLowerCase();
      if (!VAARD_SLUG_RE.test(schoonSlug)) return { ok: false, code: 'VAARD_SLUG_ONGELDIG' };
      if (leesIngebouwdeUitSchijf().some((v) => v.id === schoonSlug)) {
        return { ok: false, code: 'VAARD_SYSTEEM_ALLEEN_SCHAKELEN' };
      }
      const sleutel = ladeSleutel(lade);
      const lijst = eigenKaart.get(sleutel) ?? [];
      const idx = lijst.findIndex((x) => x.id === schoonSlug);
      if (idx < 0) return { ok: false, code: 'VAARD_NIET_GEVONDEN' };
      const [weg] = lijst.splice(idx, 1);
      eigenKaart.set(sleutel, lijst);
      standKaart.set(sleutel, (standKaart.get(sleutel) ?? []).filter((s) => s.vaardigheidId !== schoonSlug));
      const revs = revKaart.get(sleutel) ?? [];
      revs.unshift({
        id: randomUUID(),
        vaardigheidSlug: schoonSlug,
        versie: weg.versie,
        actie: 'verwijderd',
        doorAgent: doorAgent.slice(0, 48),
        momentopname: { slug: schoonSlug, versie: weg.versie, titelUk: weg.titel.uk, titelNl: weg.titel.nl },
        aangemaaktOp: Date.now(),
      });
      revKaart.set(sleutel, revs);
      return { ok: true };
    },

    async zetAgentStand(lade, invoer, doorAgent = '') {
      const vaardId = String(invoer.vaardigheidId ?? '').trim().toLowerCase();
      if (!VAARD_SLUG_RE.test(vaardId)) return { ok: false, code: 'VAARD_SLUG_ONGELDIG' };
      const ingebouwd = leesIngebouwdeUitSchijf().find((v) => v.id === vaardId);
      if (ingebouwd && ingebouwd.ruimte === 'technisch' && lade.ruimte !== 'technisch') {
        return { ok: false, code: 'VAARD_TECH_PROFIEL_VEREIST' };
      }
      const sleutel = ladeSleutel(lade);
      if (!ingebouwd && !(eigenKaart.get(sleutel) ?? []).some((e) => e.id === vaardId)) {
        return { ok: false, code: 'VAARD_NIET_GEVONDEN' };
      }
      const standen = standKaart.get(sleutel) ?? [];
      const stand: VaardigheidAgentStand = {
        agentSlug: invoer.agentSlug,
        vaardigheidId: vaardId,
        actief: invoer.actief !== false,
        prioriteit: Math.max(0, Math.min(1000, Math.trunc(Number(invoer.prioriteit) || 100))),
        notitie: String(invoer.notitie ?? '').trim().slice(0, 400),
        bijgewerktOp: Date.now(),
      };
      const idx = standen.findIndex((s) => s.agentSlug === stand.agentSlug && s.vaardigheidId === stand.vaardigheidId);
      if (idx >= 0) standen[idx] = stand;
      else standen.unshift(stand);
      standKaart.set(sleutel, standen);

      const revs = revKaart.get(sleutel) ?? [];
      revs.unshift({
        id: randomUUID(),
        vaardigheidSlug: vaardId,
        versie: 1,
        actie: 'koppeling_gewijzigd',
        doorAgent: doorAgent.slice(0, 48),
        momentopname: { agentSlug: stand.agentSlug, actief: stand.actief, prioriteit: stand.prioriteit, notitie: stand.notitie },
        aangemaaktOp: Date.now(),
      });
      revKaart.set(sleutel, revs);
      return { ok: true, stand };
    },

    async herstelRevisie(lade, revisieId, doorAgent = '') {
      const sleutel = ladeSleutel(lade);
      const rev = (revKaart.get(sleutel) ?? []).find((r) => r.id === revisieId);
      if (!rev) return { ok: false, code: 'VAARD_NIET_GEVONDEN' };
      const snap = rev.momentopname;
      const valid = valideerVaardigheidInvoer({
        slug: snap.slug ?? rev.vaardigheidSlug,
        titelUk: snap.titelUk,
        titelNl: snap.titelNl,
        samenvattingUk: snap.samenvattingUk,
        samenvattingNl: snap.samenvattingNl,
        inhoudUk: snap.inhoudUk,
        inhoudNl: snap.inhoudNl,
        termenUk: snap.termenUk,
        termenNl: snap.termenNl,
        vereisteHulpmiddelen: snap.vereisteHulpmiddelen,
        agentKoppelingen: snap.agentKoppelingen,
        bron: 'eigen',
        actief: snap.actief !== false,
      });
      if (!valid.ok) return { ok: false, code: valid.code };
      const opgeslagen = await this.opslaan(lade, valid.waarde, doorAgent);
      if (!opgeslagen.ok) return opgeslagen;
      const revs = revKaart.get(sleutel) ?? [];
      if (revs[0]) revs[0].actie = 'hersteld';
      return { ok: true, item: opgeslagen.item };
    },
  };
}

/** Voor MCP-protocol 2026-07-28: laadt actieve vaardigheden van deze gebruiker/ruimte (met veilige fallback als er geen DB is). */
export async function leesVaardighedenVoorMcp(
  userId: string,
  ruimte: VaardigheidRuimte,
  agentSlug?: AgentSlug,
  opslag: VaardighedenOpslag = pgVaardighedenOpslag,
): Promise<VaardigheidItem[]> {
  try {
    return await opslag.alleActieveVoorContext({ userId, ruimte }, agentSlug);
  } catch {
    const ingebouwd = leesIngebouwdeUitSchijf().filter((v) =>
      ruimte === 'technisch' ? true : v.ruimte !== 'technisch',
    );
    return effectieveVaardighedenVoorAgent(ingebouwd, [], { agentSlug, ruimte });
  }
}
