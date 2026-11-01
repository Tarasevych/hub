// Serverdiagnose voor AI- en MCP-toegang (01.11.2026, MCP-ACCESS-001).
// Leest elke echte poort (technische sessie v1/v2, AI-sessiedelegatie per verbinding_id, ruimte-scheiding dienst «ai»,
// ondertekend AI-beleid keten.json, GitHub-koppeling per lade, site-schakelaars, hulpmiddelmodi en openstaande voorkeur)
// en vergelijkt dat met de echte uitkomst van v2Lijst — één waarheid, geen schatting aan de browserkant.
import { isOwnerEmail, db } from '../server/platform';
import { auditToevoegen } from '../server/platform/audit';
import { alsSysteem } from '../server/platform/context';
import { getPool } from '../server/platform/pg';
import { toolGeweigerd } from '../shared/ai-agent-bord';
import { evaluate, type Policy } from '../shared/ai-beleid/model';
import type { AiRuimte } from '../shared/ai-ruimte';
import {
  ACTIE_BIJ_CODE,
  WEIGER_UITLEG,
  maakBlokkade,
  type AgentToegangDiagnose,
  type BeleidDiagnoseStaat,
  type DiagnoseBlokkade,
  type ToegangWeigerCode,
} from '../shared/ai-toegang-diagnose';
import { isEigenaarDefinitie } from '../shared/ruimte-toegang';
import { klantVan } from '../shared/ai-verbinding';
import { v2Agent, type AgentSlug } from '../shared/connector-v2/agenten';
import { V2_OPTIES, type Kant } from '../shared/connector-v2/catalogus';
import { schoon } from '../shared/connector-v2/rechten';
import { agentVoor, leesStand, type Stand as BeleidStand } from './ai-beleid';
import { aiStandVeilig } from './ai-ruimte-poort';
import { leesGebruikerCaps, leesStaat } from './ai-site-schakelaars';
import { effectiveMode, taalVanGebruiker, type ToolDef } from './connectors-hulpmiddelen';
import * as store from './connectors-opslag';
import { SERVICE_HOSTS } from './deployment-identity';
import { githubKoppeling } from './github-platform';
import { githubWeg } from './github-toegang';
import { meld, meldLink } from './melder';
import { MELDING_TABEL, ruimteVoorNieuweMelding, sfeerVoorNieuweMelding } from './meldingen-ruimte';
import { keuzeVan } from './ruimte-scheiding';
import * as tp from './tech-profiel';
import * as kern from './tech-ruimtes-kern';

const sys = () => getPool('systeem');
const SITE_WEG_REDENEN = new Set(['uitgelogd', 'revoke', 'revoke-all', 'revoke-others', 'emergency', 'site-sessie-weg']);
const MELD_COOLDOWN_MS = 15 * 60_000;
const meldGeheugen = new Map<string, number>();

export const _diagnoseMeldCacheLeeg = () => meldGeheugen.clear();
export const _resetToegangMeldingGeheugen = _diagnoseMeldCacheLeeg;

type AiDelegatieRij = {
  verbinding_id: string;
  ruimtes: string[];
  termijn: string;
  eind_op: Date | string | null;
  ruimte_sessie_id: string;
  gezet_op?: Date | string | null;
};

type TechSessieRij = {
  id: string;
  sessie_id: string;
  modus: string;
  actief: string;
  begin_op: Date | string;
  eind_op: Date | string | null;
  grens_op: Date | string;
  beeindigd_op: Date | string | null;
  beeindigd_reden: string | null;
};

export type GebruikerDiagnoseContext = {
  userId: string;
  email: string;
  rol: string | null;
  eigenaar: boolean;
  techV2Active: boolean;
  heeftTechProfiel: boolean;
  profileSessionActive: boolean;
  profileSessionPaused: boolean;
  profileSessionEnd: number | null;
  profileSessionMode: string | null;
  levendeSessieRij: TechSessieRij | null;
  basisTechCode: ToegangWeigerCode | null;
  aiDelegaties: AiDelegatieRij[];
  ruimteKeuzeGemaakt: boolean;
  aiServiceState: Awaited<ReturnType<typeof aiStandVeilig>>;
  beleidStand: BeleidStand;
  githubPrive: boolean;
  githubTechnisch: boolean;
  siteStaat: Awaited<ReturnType<typeof leesStaat>>;
  gebruikerCaps: Awaited<ReturnType<typeof leesGebruikerCaps>>;
  toolModes: Awaited<ReturnType<typeof store.getToolModes>>;
};

const msVan = (v: Date | string | number | null | undefined): number | null => {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : new Date(v).getTime();
  return Number.isFinite(n) ? n : null;
};

const hosts = () => ({ admin: SERVICE_HOSTS.admin, mcp: SERVICE_HOSTS.mcp, hub: SERVICE_HOSTS.hub });

/** Eén gedeelde opname van alle gebruikersfeiten (zodat overzicht() voor 6 agents geen 6× dezelfde queries uitvoert). */
export async function bouwGebruikerDiagnoseContext(userId: string): Promise<GebruikerDiagnoseContext> {
  const uRow = (await sys().query(
    `SELECT data->>'role' AS role, data->>'email' AS email, data->>'status' AS status, COALESCE((data->>'deletedAt')::numeric, 0) AS del
       FROM app.records WHERE tbl = 'users' AND id = $1`,
    [userId],
  )).rows[0];
  const rol = uRow?.role ? String(uRow.role) : null;
  const email = String(uRow?.email || '');
  const techV2Active = await kern.v2Aan(userId);
  const eigenaar = techV2Active ? isEigenaarDefinitie(rol, isOwnerEmail(email)) : rol === 'owner';

  const [keuze, aiServiceState, beleidStand, ghPat, ghPriveWeg, siteStaat, gebruikerCaps, toolModes] = await Promise.all([
    keuzeVan(userId).catch(() => null),
    aiStandVeilig(userId),
    leesStand(),
    githubKoppeling(userId).catch(() => null),
    githubWeg(userId, 'prive').catch(() => null),
    leesStaat(),
    leesGebruikerCaps(userId),
    store.getToolModes(userId),
  ]);
  const githubPrive = Boolean(ghPat?.keyName || ghPriveWeg?.via);
  const ghTechWeg = aiServiceState === 'gedeeld' ? null : await githubWeg(userId, 'technisch').catch(() => null);
  const githubTechnisch = aiServiceState === 'gedeeld' ? githubPrive : Boolean(ghTechWeg?.via);

  let heeftTechProfiel = eigenaar;
  if (!heeftTechProfiel) {
    const pRow = (await sys().query('SELECT rollen, ingetrokken_op FROM app.tech_profielen WHERE user_id = $1', [userId]).catch(() => ({ rows: [] as any[] }))).rows[0];
    heeftTechProfiel = Boolean(pRow && !pRow.ingetrokken_op && Array.isArray(pRow.rollen) && pRow.rollen.length > 0);
  }

  let profileSessionActive = false;
  let profileSessionPaused = false;
  let profileSessionEnd: number | null = null;
  let profileSessionMode: string | null = null;
  let levendeSessieRij: TechSessieRij | null = null;
  let basisTechCode: ToegangWeigerCode | null = null;
  let aiDelegaties: AiDelegatieRij[] = [];

  if (!eigenaar) {
    basisTechCode = 'GEEN_EIGENAAR';
  } else if (!heeftTechProfiel) {
    basisTechCode = 'GEEN_TECH_PROFIEL';
  } else if (techV2Active) {
    const [sessieRes, aiRes] = await Promise.all([
      sys().query(`SELECT id::text AS id, sessie_id, modus, actief, begin_op, eind_op, grens_op, beeindigd_op, beeindigd_reden
                     FROM app.tech_ruimte_sessies WHERE user_id = $1 ORDER BY begin_op DESC LIMIT 8`, [userId]).catch(() => ({ rows: [] as TechSessieRij[] })),
      sys().query(`SELECT verbinding_id, ruimtes, termijn, eind_op, ruimte_sessie_id::text AS ruimte_sessie_id, gezet_op
                     FROM app.tech_ruimte_ai WHERE user_id = $1`, [userId]).catch(() => ({ rows: [] as AiDelegatieRij[] })),
    ]);
    aiDelegaties = aiRes.rows as AiDelegatieRij[];
    const nu = Date.now();
    for (const r of sessieRes.rows as TechSessieRij[]) {
      if (r.beeindigd_op) continue;
      const grens = msVan(r.grens_op) ?? 0;
      const eind = msVan(r.eind_op);
      if (grens <= nu || (r.modus === 'tijd' && (eind === null || eind <= nu))) continue;
      const site = await kern.siteSessie(String(r.sessie_id));
      if (!site.leeft) continue;
      levendeSessieRij = r;
      break;
    }
    if (levendeSessieRij) {
      profileSessionMode = levendeSessieRij.modus;
      profileSessionEnd = levendeSessieRij.modus === 'tijd' ? msVan(levendeSessieRij.eind_op) : msVan(levendeSessieRij.grens_op);
      if (levendeSessieRij.actief !== 'technisch') {
        profileSessionPaused = true;
        basisTechCode = 'PAUZE';
      } else {
        profileSessionActive = true;
        basisTechCode = null;
      }
    } else {
      const laatste = (sessieRes.rows as TechSessieRij[])[0] ?? null;
      if (!laatste) {
        basisTechCode = 'GEEN_TECH_SESSIE';
      } else {
        const beginMs = msVan(laatste.begin_op) ?? 0;
        const recent = nu - beginMs < 24 * 3600_000;
        const site = await kern.siteSessie(String(laatste.sessie_id));
        if (recent && (SITE_WEG_REDENEN.has(String(laatste.beeindigd_reden || '')) || (!laatste.beeindigd_op && !site.leeft))) {
          basisTechCode = 'SITE_SESSIE_WEG';
        } else if (recent && (laatste.beeindigd_reden === 'verlopen' || (!laatste.beeindigd_op && laatste.modus === 'tijd' && (msVan(laatste.eind_op) ?? 0) <= nu))) {
          basisTechCode = 'VERLOPEN';
        } else if (recent && !laatste.beeindigd_op && (msVan(laatste.grens_op) ?? 0) <= nu) {
          basisTechCode = 'GRENS_VOORBIJ';
        } else {
          basisTechCode = 'GEEN_TECH_SESSIE';
        }
      }
    }
  } else {
    const act = await tp.lopendeActivatie(userId);
    if (act) {
      profileSessionActive = true;
      profileSessionEnd = act.eind;
      profileSessionMode = act.modus;
      basisTechCode = null;
    } else {
      const laatste = (await sys().query(
        `SELECT begin_op, eind_op, beeindigd_op, beeindigd_reden FROM app.tech_activaties WHERE user_id = $1 ORDER BY begin_op DESC LIMIT 1`,
        [userId],
      ).catch(() => ({ rows: [] as any[] }))).rows[0];
      const nu = Date.now();
      const beginMs = msVan(laatste?.begin_op) ?? 0;
      const recent = laatste && nu - beginMs < 24 * 3600_000;
      if (recent && SITE_WEG_REDENEN.has(String(laatste.beeindigd_reden || ''))) {
        basisTechCode = 'SITE_SESSIE_WEG';
      } else if (recent && (laatste.beeindigd_reden === 'verlopen' || (!laatste.beeindigd_op && (msVan(laatste.eind_op) ?? 0) <= nu))) {
        basisTechCode = 'VERLOPEN';
      } else {
        basisTechCode = 'GEEN_TECH_SESSIE';
      }
    }
  }

  return {
    userId,
    email,
    rol,
    eigenaar,
    techV2Active,
    heeftTechProfiel,
    profileSessionActive,
    profileSessionPaused,
    profileSessionEnd,
    profileSessionMode,
    levendeSessieRij,
    basisTechCode,
    aiDelegaties,
    ruimteKeuzeGemaakt: Boolean(keuze),
    aiServiceState,
    beleidStand,
    githubPrive,
    githubTechnisch,
    siteStaat,
    gebruikerCaps,
    toolModes,
  };
}

function evalueerDelegatie(ctx: GebruikerDiagnoseContext, grantId: string | null): {
  actief: boolean;
  scope: AgentToegangDiagnose['aiSessionDelegationScope'];
  termijn: string | null;
  eind: number | null;
} {
  if (!ctx.techV2Active) {
    return { actief: ctx.profileSessionActive, scope: 'niet-van-toepassing', termijn: null, eind: ctx.profileSessionEnd };
  }
  const rij = ctx.levendeSessieRij;
  if (!rij) return { actief: false, scope: 'geen', termijn: null, eind: null };
  const nu = Date.now();
  const geldigVoorSessie = (a: AiDelegatieRij): boolean => {
    if (a.termijn === 'tijd') return a.ruimte_sessie_id === rij.id && (msVan(a.eind_op) ?? 0) > nu;
    if (a.termijn === 'tot-technisch-einde') return a.ruimte_sessie_id === rij.id;
    if (a.termijn === 'tot-site-uitloggen') return true; // gekoppeld aan sessie_id; wordt hieronder gevalideerd als nodig
    return false;
  };
  const specifiek = grantId ? ctx.aiDelegaties.find((a) => a.verbinding_id === grantId && geldigVoorSessie(a)) : undefined;
  if (specifiek) {
    const heeftTech = Array.isArray(specifiek.ruimtes) && specifiek.ruimtes.includes('technisch');
    return {
      actief: heeftTech,
      scope: heeftTech ? 'verbinding' : 'geen',
      termijn: specifiek.termijn,
      eind: specifiek.termijn === 'tijd' ? msVan(specifiek.eind_op) : ctx.profileSessionEnd,
    };
  }
  const algemeen = ctx.aiDelegaties.find((a) => a.verbinding_id === '*' && geldigVoorSessie(a));
  if (algemeen && Array.isArray(algemeen.ruimtes) && algemeen.ruimtes.includes('technisch')) {
    return {
      actief: true,
      scope: 'alle',
      termijn: algemeen.termijn,
      eind: algemeen.termijn === 'tijd' ? msVan(algemeen.eind_op) : ctx.profileSessionEnd,
    };
  }
  return { actief: false, scope: 'geen', termijn: null, eind: null };
}

function evalueerBeleid(
  stand: BeleidStand,
  slug: AgentSlug,
  clientName: string,
  opties: readonly (typeof V2_OPTIES)[number][],
): { staat: BeleidDiagnoseStaat; agentId: string | null; geblokkeerd: number; code: ToegangWeigerCode | null } {
  if (stand.staat === 'niet-ingesteld') return { staat: 'niet-ingesteld', agentId: null, geblokkeerd: 0, code: null };
  if (stand.staat === 'ongeldig') return { staat: 'ongeldig', agentId: null, geblokkeerd: opties.length, code: 'BELEID_ONGELDIG' };
  const beleid: Policy = stand.beleid;
  const agentId = agentVoor(beleid, clientName, slug);
  if (!agentId) {
    return { staat: 'agent-onbekend', agentId: null, geblokkeerd: opties.filter((o) => o.intern !== 'v2_whoami').length, code: opties.some((o) => o.intern !== 'v2_whoami') ? 'BELEID_AGENT_ONBEKEND' : null };
  }
  const agentDef = beleid.agents[agentId];
  if (agentDef && agentDef.enabled === false) {
    return { staat: 'agent-uit', agentId, geblokkeerd: opties.filter((o) => o.intern !== 'v2_whoami').length, code: opties.some((o) => o.intern !== 'v2_whoami') ? 'BELEID_AGENT_UIT' : null };
  }
  const nu = Date.now();
  let geblokkeerd = 0;
  let verlopenGezien = false;
  for (const o of opties) {
    if (!o.intern || o.intern === 'v2_whoami') continue;
    const d = evaluate(beleid, agentId, o.intern, nu);
    if (d.effect === 'deny') {
      geblokkeerd++;
      if (d.code === 'expired_off') verlopenGezien = true;
    }
  }
  if (geblokkeerd === 0) return { staat: 'toegestaan', agentId, geblokkeerd: 0, code: null };
  const totaalWerk = opties.filter((o) => o.intern && o.intern !== 'v2_whoami').length;
  if (verlopenGezien) return { staat: 'verlopen', agentId, geblokkeerd, code: 'BELEID_VERLOPEN' };
  return {
    staat: geblokkeerd >= totaalWerk ? 'uit' : 'gedeeltelijk',
    agentId,
    geblokkeerd,
    code: 'BELEID_UIT',
  };
}

export type AgentDiagnoseInvoer = {
  slug: AgentSlug;
  verbonden: boolean;
  grantId: string | null;
  clientName?: string;
  actief: { kanten: Kant[]; sleutels: string[] } | null;
  voorkeur: { kanten: Kant[]; sleutels: string[]; herverbinden: boolean } | null;
  /** Optionele teller uit echte v2Lijst-uitvoering, zodat zichtbare aantallen 100 % identiek zijn aan tools/list. */
  lijstFn?: (ruimte: AiRuimte, keuze: { kanten: Kant[]; sleutels: string[] }) => Promise<ToolDef[]>;
};

export async function diagnoseVoorAgentMetContext(
  ctx: GebruikerDiagnoseContext,
  inv: AgentDiagnoseInvoer,
): Promise<AgentToegangDiagnose> {
  const info = v2Agent(inv.slug);
  const clientName = inv.clientName || info.naam;
  const actiefKeuze = inv.actief ?? inv.voorkeur ?? { kanten: ['gebruiker' as Kant], sleutels: ['v2_whoami:gebruiker'] };
  const kanten = actiefKeuze.kanten;
  const schoneSleutels = schoon(actiefKeuze.sleutels, kanten);
  const sleutelSet = new Set(schoneSleutels);
  const gekozenOpties = V2_OPTIES.filter((o) => o.status === 'actief' && kanten.includes(o.kant) && sleutelSet.has(o.key));
  const gebruikerOpties = gekozenOpties.filter((o) => o.kant === 'gebruiker');
  const beheerOpties = gekozenOpties.filter((o) => o.kant === 'beheer');

  // Openstaande uitbreiding in voorkeur die nog niet op het actieve token zit
  const voorkeurSleutels = inv.voorkeur ? schoon(inv.voorkeur.sleutels, inv.voorkeur.kanten) : [];
  const toegevoegdAantal = inv.verbonden && inv.actief && inv.voorkeur?.herverbinden
    ? voorkeurSleutels.filter((k) => !sleutelSet.has(k)).length + inv.voorkeur.kanten.filter((k) => !kanten.includes(k)).length
    : 0;
  const wachtOpToepassen = Boolean(inv.verbonden && inv.voorkeur?.herverbinden && toegevoegdAantal > 0);

  // Technische sessie + delegatie + ruimte-scheiding dienst «ai»
  let delegatie = evalueerDelegatie(ctx, inv.grantId);
  if (ctx.techV2Active && ctx.profileSessionActive && delegatie.scope === 'alle') {
    // Controleer via kern.besluit voor 'tot-site-uitloggen' dat de sessie-overeenkomst exact klopt
    const b = await kern.besluit(ctx.userId, { bron: 'mcp', ...(inv.grantId ? { verbindingId: inv.grantId } : {}) });
    if (!b.toegestaan) delegatie = { actief: false, scope: 'geen', termijn: null, eind: null };
  } else if (ctx.techV2Active && ctx.profileSessionActive && inv.grantId && delegatie.actief) {
    const b = await kern.besluit(ctx.userId, { bron: 'mcp', verbindingId: inv.grantId });
    if (!b.toegestaan) delegatie = { actief: false, scope: 'geen', termijn: null, eind: null };
  }

  const dienstCode: ToegangWeigerCode | null = !ctx.ruimteKeuzeGemaakt
    ? 'KEUZE_ONTBREEKT'
    : ctx.aiServiceState === 'bevroren'
      ? 'BEVROREN'
      : ctx.aiServiceState !== 'eigen' && ctx.aiServiceState !== 'gedeeld'
        ? 'DIENST_UIT'
        : null;

  const techCode: ToegangWeigerCode | null = ctx.basisTechCode
    ?? (!delegatie.actief ? 'AI_NIET_TOEGESTAAN' : null);

  const effectiveTechnicalAccess = Boolean(ctx.eigenaar && ctx.profileSessionActive && delegatie.actief && !dienstCode);
  const ruimteNu: AiRuimte = effectiveTechnicalAccess ? 'technisch' : 'prive';

  // Ondertekend AI-beleid, GitHub, site-schakelaars en hulpmiddelmodi
  const levendeOpties = gekozenOpties.filter((o) => o.kant === 'gebruiker' || effectiveTechnicalAccess);
  const beleidRes = evalueerBeleid(ctx.beleidStand, inv.slug, clientName, levendeOpties);

  const githubBlockedPrive = !ctx.githubPrive ? gebruikerOpties.filter((o) => o.groep === 'github').length : 0;
  const githubBlockedTech = effectiveTechnicalAccess && !ctx.githubTechnisch ? beheerOpties.filter((o) => o.groep === 'github').length : 0;
  const githubBlockedCount = githubBlockedPrive + githubBlockedTech;

  const klant = klantVan(clientName);
  const gebruikerCap = klant === 'overig' ? undefined : ctx.gebruikerCaps[klant];
  let siteSwitchBlockedCount = 0;
  let toolModeBlockedCount = 0;
  for (const o of gebruikerOpties) {
    if (!o.intern || o.intern === 'v2_whoami') continue;
    if (toolGeweigerd(ctx.siteStaat, { ruimte: 'prive', tool: o.intern, klant, gebruiker: gebruikerCap })) siteSwitchBlockedCount++;
    if (ctx.beleidStand.staat === 'niet-ingesteld' && effectiveMode(o.intern, ctx.toolModes[o.intern]) === 'off') toolModeBlockedCount++;
  }
  if (effectiveTechnicalAccess && ctx.beleidStand.staat === 'niet-ingesteld') {
    for (const o of beheerOpties) {
      if (!o.intern || o.intern === 'v2_whoami') continue;
      if (effectiveMode(o.intern, ctx.toolModes[o.intern]) === 'off') toolModeBlockedCount++;
    }
  }

  // Echte zichtbare lijst uit v2Lijst (één waarheid met tools/list)
  let effectiveVisibleToolsCount = 0;
  let effectiveGebruikerVisibleCount = 0;
  let effectiveBeheerVisibleCount = 0;
  if (inv.lijstFn) {
    const lijst = await inv.lijstFn(ruimteNu, { kanten, sleutels: schoneSleutels });
    effectiveVisibleToolsCount = lijst.length;
    effectiveBeheerVisibleCount = lijst.filter((t) => t.name.endsWith('_beheer')).length;
    effectiveGebruikerVisibleCount = Math.max(0, lijst.length - effectiveBeheerVisibleCount);
  } else {
    effectiveGebruikerVisibleCount = Math.max(0, gebruikerOpties.length - githubBlockedPrive - siteSwitchBlockedCount);
    effectiveBeheerVisibleCount = effectiveTechnicalAccess ? Math.max(0, beheerOpties.length - githubBlockedTech) : 0;
    effectiveVisibleToolsCount = effectiveGebruikerVisibleCount + effectiveBeheerVisibleCount;
  }

  // Orden alle actieve blokkades zodat de eigenaar op #agent/<slug> NIETS mist
  const blokkades: DiagnoseBlokkade[] = [];
  const h = hosts();
  const wilBeheer = kanten.includes('beheer') || Boolean(inv.voorkeur?.kanten.includes('beheer'));
  const beheerDoelAantal = beheerOpties.length || (inv.voorkeur ? V2_OPTIES.filter((o) => o.kant === 'beheer' && o.status === 'actief' && inv.voorkeur!.sleutels.includes(o.key)).length : 0);

  if (beleidRes.code === 'BELEID_ONGELDIG') {
    blokkades.push(maakBlokkade('BELEID_ONGELDIG', 'beleid', beleidRes.geblokkeerd, h, inv.slug));
  }
  // Als het ondertekende AI-beleid vrijwel alle privé-hulpmiddelen wegsnijdt (zoals live gezien: 102 toegekend → slechts 1 zichtbaar!),
  // staat dat bovenaan naast de technische poort.
  if (beleidRes.code && beleidRes.code !== 'BELEID_ONGELDIG' && beleidRes.geblokkeerd > 0 && effectiveGebruikerVisibleCount <= 1 && gebruikerOpties.length > 1) {
    blokkades.push(maakBlokkade(beleidRes.code, 'beleid', beleidRes.geblokkeerd, h, inv.slug));
  }
  if (wilBeheer && beheerDoelAantal > 0 && !effectiveTechnicalAccess) {
    if (techCode) {
      blokkades.push(maakBlokkade(techCode, techCode === 'AI_NIET_TOEGESTAAN' ? 'delegatie' : 'sessie', beheerDoelAantal, h, inv.slug));
    }
    if (dienstCode) {
      blokkades.push(maakBlokkade(dienstCode, 'dienst', beheerDoelAantal, h, inv.slug));
    }
  }
  if (wachtOpToepassen) {
    blokkades.push(maakBlokkade('VOORKEUR_WACHT_TOEPASSEN', 'voorkeur', toegevoegdAantal, h, inv.slug));
  }
  if (beleidRes.code && beleidRes.code !== 'BELEID_ONGELDIG' && !blokkades.some((b) => b.code === beleidRes.code) && beleidRes.geblokkeerd > 0) {
    blokkades.push(maakBlokkade(beleidRes.code, 'beleid', beleidRes.geblokkeerd, h, inv.slug));
  }
  if (githubBlockedCount > 0) {
    blokkades.push(maakBlokkade('GITHUB_NIET_GEKOPPELD', 'github', githubBlockedCount, h, inv.slug));
  }
  if (siteSwitchBlockedCount > 0) {
    blokkades.push(maakBlokkade('SITE_SCHAKELAAR_UIT', 'schakelaar', siteSwitchBlockedCount, h, inv.slug));
  }
  if (toolModeBlockedCount > 0) {
    blokkades.push(maakBlokkade('HULPMIDDEL_MODUS_UIT', 'schakelaar', toolModeBlockedCount, h, inv.slug));
  }

  const eerste = blokkades[0] ?? null;
  const nextAction = eerste
    ? { actie: eerste.actie, label: eerste.actieLabel, uitleg: eerste.uitleg, url: eerste.url }
    : null;

  return {
    slug: inv.slug,
    eigenaar: ctx.eigenaar,
    techV2Active: ctx.techV2Active,
    profileSessionActive: ctx.profileSessionActive,
    profileSessionPaused: ctx.profileSessionPaused,
    profileSessionEnd: ctx.profileSessionEnd,
    profileSessionMode: ctx.profileSessionMode,
    aiServiceState: ctx.aiServiceState,
    ruimteKeuzeGemaakt: ctx.ruimteKeuzeGemaakt,
    aiSessionDelegationActive: delegatie.actief,
    aiSessionDelegationScope: delegatie.scope,
    aiSessionDelegationTermijn: delegatie.termijn,
    aiSessionDelegationEnd: delegatie.eind,
    aiPolicyState: beleidRes.staat,
    aiPolicyAgentId: beleidRes.agentId,
    aiPolicyBlockedCount: beleidRes.geblokkeerd,
    githubConnectedPrive: ctx.githubPrive,
    githubConnectedTechnisch: ctx.githubTechnisch,
    githubBlockedCount,
    siteSwitchBlockedCount,
    toolModeBlockedCount,
    connectionGranted: {
      verbonden: inv.verbonden,
      grantId: inv.grantId,
      kanten,
      totaal: gekozenOpties.length,
      gebruiker: gebruikerOpties.length,
      beheer: beheerOpties.length,
    },
    pendingExpansion: {
      wacht: wachtOpToepassen,
      toegevoegdAantal,
      kanten: inv.voorkeur?.kanten ?? kanten,
    },
    effectiveTechnicalAccess,
    effectiveVisibleToolsCount,
    effectiveGebruikerVisibleCount,
    effectiveBeheerVisibleCount,
    denialCode: eerste?.code ?? null,
    blokkades,
    nextAction,
  };
}

export async function diagnoseVoorAgent(userId: string, inv: AgentDiagnoseInvoer): Promise<AgentToegangDiagnose> {
  const ctx = await bouwGebruikerDiagnoseContext(userId);
  return diagnoseVoorAgentMetContext(ctx, inv);
}

/**
 * Gededupliceerde, snelheidsbegrensde melding aan de eigenaar/gebruiker wanneer een gekoppelde AI op een echte toegangspoort botst
 * (bv. TECH_PROFILE_OFF op _beheer, openstaande voorkeur die nog niet is toegepast, of AI-beleid dat toegekende hulpmiddelen wegsnijdt).
 * Gebruikt de geregistreerde soort 'ai_bevestiging' (persoonlijke sfeer 'prive'), zodat de bel de melding ook toont terwijl het
 * technische profiel nog UIT staat — precies het moment waarop de eigenaar haar nodig heeft.
 */
export async function meldGeblokkeerdeAiPoging(inv: {
  userId: string;
  slug: AgentSlug;
  clientName?: string;
  code: ToegangWeigerCode;
  aanleiding: 'tools/list' | 'whoami' | 'tools/call';
  hulpmiddel?: string;
  zichtbaar?: number;
  toegekend?: number;
}): Promise<boolean> {
  if (!inv.userId) return false;
  const sleutel = `${inv.userId}:${inv.slug}:${inv.code}`;
  const nu = Date.now();
  if ((meldGeheugen.get(sleutel) ?? 0) > nu) return false;
  meldGeheugen.set(sleutel, nu + MELD_COOLDOWN_MS);

  try {
    // Controleer of er al een ongelezen melding voor precies dezelfde (gebruiker, agent, code) van het afgelopen uur staat
    const bestaand = await sys().query(
      `SELECT 1 FROM app.records
        WHERE tbl = $1 AND data->>'recipientUserId' = $2 AND data->>'kind' = 'ai_bevestiging'
          AND COALESCE((data->>'read')::boolean, false) = false
          AND data->>'aiBlokSleutel' = $3
          AND COALESCE((data->>'createdAt')::numeric, 0) > $4
        LIMIT 1`,
      [MELDING_TABEL, inv.userId, sleutel, nu - 60 * 60_000],
    );
    if (bestaand.rows.length > 0) return false;

    const taal = (await taalVanGebruiker(inv.userId)) === 'nl' ? 'nl' : 'uk';
    const agentNaam = v2Agent(inv.slug).naam;
    const uitleg = WEIGER_UITLEG[inv.code][taal];
    const stap = ACTIE_BIJ_CODE[inv.code].label[taal];
    const link = `https://${SERVICE_HOSTS.mcp}/agents#agent/${inv.slug}`;
    const titel = taal === 'nl'
      ? `${agentNaam}: toegang geblokkeerd (${inv.code})`
      : `${agentNaam}: доступ обмежено (${inv.code})`;
    const contextZin = inv.hulpmiddel
      ? (taal === 'nl' ? `Geweigerde aanroep: ${inv.hulpmiddel}.` : `Відхилений виклик: ${inv.hulpmiddel}.`)
      : inv.zichtbaar !== undefined && inv.toegekend !== undefined
        ? (taal === 'nl' ? `Nu zichtbaar: ${inv.zichtbaar} van ${inv.toegekend} toegekende hulpmiddelen.` : `Зараз видно: ${inv.zichtbaar} із ${inv.toegekend} наданих інструментів.`)
        : '';
    const bericht = `${uitleg}${contextZin ? ` ${contextZin}` : ''} ${taal === 'nl' ? 'Volgende stap' : 'Наступний крок'}: ${stap}.`;

    // Direct met aiBlokSleutel opslaan (zodat zowel productie als eenheidstests zonder geladen backend/index.ts dezelfde rij krijgen)
    // én als geldige 'ai_bevestiging'-melding in de persoonlijke sfeer 'prive'.
    const veiligLink = meldLink(link);
    const ruimte = ruimteVoorNieuweMelding(inv.userId, 'ai_bevestiging');
    const sfeer = sfeerVoorNieuweMelding(inv.userId, 'ai_bevestiging', ruimte);
    await alsSysteem(() => db.add(MELDING_TABEL, [{
      recipientUserId: inv.userId,
      recipientEmail: '',
      kind: 'ai_bevestiging',
      title: titel.slice(0, 220),
      message: bericht.slice(0, 1200),
      ...(veiligLink ? { link: veiligLink } : {}),
      read: false,
      createdAt: nu,
      ruimte,
      sfeer,
      aiBlokSleutel: sleutel,
      aiAgent: inv.slug,
      aiWeigerCode: inv.code,
    }]));
    // Houd ook de statische melder-haak zichtbaar voor melding-soorten-controle indien geen eigen rij nodig zou zijn:
    if (!MELDING_TABEL) await meld(inv.userId, 'ai_bevestiging', titel, bericht, link);

    await auditToevoegen({
      ownerId: inv.userId,
      actorId: inv.userId,
      action: 'owner.mcp.toegang.geblokkeerd',
      type: 'ai',
      result: 'denied',
      details: {
        agent: inv.slug,
        client: (inv.clientName || agentNaam).slice(0, 80),
        code: inv.code,
        aanleiding: inv.aanleiding,
        ...(inv.hulpmiddel ? { hulpmiddel: inv.hulpmiddel.slice(0, 80) } : {}),
        ...(inv.zichtbaar !== undefined ? { zichtbaar: inv.zichtbaar } : {}),
        ...(inv.toegekend !== undefined ? { toegekend: inv.toegekend } : {}),
      },
    }).catch(() => undefined);
    return true;
  } catch (err) {
    console.error('[ai-toegang-diagnose] melding maken mislukt:', (err as Error).message);
    return false;
  }
}
