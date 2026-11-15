// Модель даних єдиної екосистеми сповіщень («застосунок у застосунку», GEMINI-002).
// Усі типи та нормалізатори сумісні як із сервером (Node.js), так і з оглядачем (React).

export const SUBDOMEINEN = ['hub', 'id', 'ai', 'mail', 'cloud', 'github', 'huis', 'mcp', 'api', 'admin', 'systeem'] as const;
export type MeldingSubdomein = (typeof SUBDOMEINEN)[number];

export const KANALEN = ['beveiliging', 'mail', 'cloud', 'ai', 'mcp', 'github', 'huis', 'pc_agent', 'extensie', 'systeem', 'app', 'pagina'] as const;
export type MeldingKanaal = (typeof KANALEN)[number];

export const PRIORITEITEN = ['kritiek', 'hoog', 'normaal', 'laag'] as const;
export type MeldingPrioriteit = (typeof PRIORITEITEN)[number];

export const GEBEURTENIS_STATUSSEN = ['nieuw', 'gelezen', 'uitgesteld', 'archief', 'opgelost'] as const;
export type MeldingGebeurtenisStatus = (typeof GEBEURTENIS_STATUSSEN)[number];

export const VENSTER_MODI = ['kompakt', 'normaal', 'breed', 'volledig'] as const;
export type VensterModus = (typeof VENSTER_MODI)[number];

export const VEEG_ACTIES = ['gelezen', 'archief', 'uitstellen', 'uitklappen', 'geen'] as const;
export type VeegActie = (typeof VEEG_ACTIES)[number];

export const AI_MODI = ['beide', 'intern', 'extern', 'uit'] as const;
export type AiModus = (typeof AI_MODI)[number];

export const AI_AANBIEDERS_KEUZE = ['gemini', 'claude', 'openai', 'grok', 'autoclaw'] as const;
export type AiAanbiederKeuze = (typeof AI_AANBIEDERS_KEUZE)[number];

export type RuimteType = 'prive' | 'technisch';

export type MeldingBijlage = {
  id: string;
  naam: string;
  mime: string;
  grootteBytes: number;
  url?: string;
  inhoudBase64?: string;
  tekstVoorbeeld?: string;
  bronDienst?: MeldingSubdomein;
  berichtId?: string;
  bijlageId?: string;
  accountId?: string;
  meta?: Record<string, string>;
};

export type MeldingActie = {
  id: string;
  labelUk: string;
  labelNl: string;
  soort: 'navigeer' | 'status' | 'api' | 'ai' | 'bijlage';
  statusDoel?: MeldingGebeurtenisStatus;
  href?: string;
  tab?: string;
  uitstelMinuten?: number;
  bevestigingNodig?: boolean;
};

export type MeldingAiSamenvatting = {
  bron: 'intern' | 'extern';
  aanbieder?: string;
  samenvatting: string;
  oorzaak: string;
  advies: string;
  aanbevolenActies: string[];
  risico: MeldingPrioriteit;
  opgesteldOp: number;
  geschoond: boolean;
};

export type MeldingEcosysteemGebeurtenis = {
  id: string;
  ruimte: RuimteType;
  externeSleutel: string;
  kanaal: MeldingKanaal;
  subdomein: MeldingSubdomein;
  bron: string;
  prioriteit: MeldingPrioriteit;
  status: MeldingGebeurtenisStatus;
  titel: string;
  bericht: string;
  uitleg: string;
  contextLabel: string;
  herhalingen: number;
  uitgesteldTot: number | null;
  bijlagen: MeldingBijlage[];
  acties: MeldingActie[];
  meta: Record<string, unknown>;
  aiSamenvatting: MeldingAiSamenvatting | null;
  aangemaaktOp: number;
  bijgewerktOp: number;
};

export type VensterGeometrie = {
  x: number;
  y: number;
  breedte: number;
  hoogte: number;
  modus: VensterModus;
  vastgepind: boolean;
  minimalePil: boolean;
};

export type VeegRegels = {
  actief: boolean;
  drempelPx: number;
  links: VeegActie;
  rechts: VeegActie;
  trilling: boolean;
};

export type KanaalVoorkeur = {
  actief: boolean;
  popUp: boolean;
  geluid: boolean;
  drempelPrioriteit: MeldingPrioriteit;
};

export type BijlageWeergaveVoorkeur = {
  inlineSpeler: boolean;
  autoMetadata: boolean;
  maxVoorbeeldMb: number;
  hexFallback: boolean;
};

export type AiInstelling = {
  modus: AiModus;
  aanbieder: AiAanbiederKeuze;
  autoSamenvatting: boolean;
  alleenLokaalVoorBeveiliging: boolean;
};

export type StilleUrenEcosysteem = {
  actief: boolean;
  van: string;
  tot: string;
  kritiekStilOmzeilen: boolean;
};

export type MeldingEcosysteemProfiel = {
  versie: number;
  ruimte: RuimteType;
  geometrie: VensterGeometrie;
  veeg: VeegRegels;
  contextAdaptatie: boolean;
  toonBannersInCentrum: boolean;
  geluidGlobaal: boolean;
  toastSeconden: number;
  bewaarDagen: number;
  stilleUren: StilleUrenEcosysteem;
  bijlageWeergave: BijlageWeergaveVoorkeur;
  ai: AiInstelling;
  kanalen: Record<MeldingKanaal, KanaalVoorkeur>;
  bijgewerktOp: number;
};

export type SubdomeinContext = {
  subdomein: MeldingSubdomein;
  accent: string;
  tintAchtergrond: string;
  naamUk: string;
  naamNl: string;
  snelFilters: MeldingKanaal[];
};

const isRecord = (v: unknown): v is Record<string, unknown> => Boolean(v && typeof v === 'object' && !Array.isArray(v));

const kiesEnum = <T extends string>(v: unknown, lijst: readonly T[], fallback: T): T =>
  (typeof v === 'string' && (lijst as readonly string[]).includes(v) ? (v as T) : fallback);

const begrensGetal = (v: unknown, min: number, max: number, fallback: number): number => {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
};

const HH_MM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function standaardKanaalVoorkeuren(): Record<MeldingKanaal, KanaalVoorkeur> {
  const base = (drempelPrioriteit: MeldingPrioriteit = 'laag', popUp = true, geluid = true): KanaalVoorkeur => ({
    actief: true,
    popUp,
    geluid,
    drempelPrioriteit,
  });
  return {
    beveiliging: base('laag', true, true),
    mail: base('normaal', true, true),
    cloud: base('normaal', true, false),
    ai: base('normaal', true, true),
    mcp: base('normaal', true, false),
    github: base('normaal', true, false),
    huis: base('normaal', true, true),
    pc_agent: base('normaal', true, true),
    extensie: base('normaal', true, false),
    systeem: base('normaal', true, false),
    app: base('normaal', true, false),
    pagina: base('hoog', false, false),
  };
}

export function standaardProfiel(ruimte: RuimteType = 'prive'): MeldingEcosysteemProfiel {
  return {
    versie: 1,
    ruimte,
    geometrie: {
      x: 24,
      y: 72,
      breedte: 460,
      hoogte: 600,
      modus: 'normaal',
      vastgepind: false,
      minimalePil: false,
    },
    veeg: {
      actief: true,
      drempelPx: 76,
      links: 'archief',
      rechts: 'gelezen',
      trilling: true,
    },
    contextAdaptatie: true,
    toonBannersInCentrum: true,
    geluidGlobaal: true,
    toastSeconden: 4,
    bewaarDagen: 30,
    stilleUren: {
      actief: false,
      van: '23:00',
      tot: '07:30',
      kritiekStilOmzeilen: true,
    },
    bijlageWeergave: {
      inlineSpeler: true,
      autoMetadata: true,
      maxVoorbeeldMb: 25,
      hexFallback: true,
    },
    ai: {
      modus: 'beide',
      aanbieder: 'gemini',
      autoSamenvatting: false,
      alleenLokaalVoorBeveiliging: true,
    },
    kanalen: standaardKanaalVoorkeuren(),
    bijgewerktOp: 0,
  };
}

export function normaliseerProfiel(raw: unknown, ruimte: RuimteType = 'prive'): MeldingEcosysteemProfiel {
  const def = standaardProfiel(ruimte);
  if (!isRecord(raw)) return def;

  const gRaw = isRecord(raw.geometrie) ? raw.geometrie : {};
  const vRaw = isRecord(raw.veeg) ? raw.veeg : {};
  const sRaw = isRecord(raw.stilleUren) ? raw.stilleUren : {};
  const bRaw = isRecord(raw.bijlageWeergave) ? raw.bijlageWeergave : {};
  const aRaw = isRecord(raw.ai) ? raw.ai : {};
  const kRaw = isRecord(raw.kanalen) ? raw.kanalen : {};

  const kanalen = { ...def.kanalen };
  for (const k of KANALEN) {
    const item = isRecord(kRaw[k]) ? kRaw[k] : null;
    if (item) {
      kanalen[k] = {
        actief: item.actief !== false,
        popUp: item.popUp !== false,
        geluid: Boolean(item.geluid),
        drempelPrioriteit: kiesEnum(item.drempelPrioriteit, PRIORITEITEN, def.kanalen[k].drempelPrioriteit),
      };
    }
  }
  // Безпека завжди активна у списку: критичні події безпеки неможливо повністю приховати.
  kanalen.beveiliging.actief = true;

  return {
    versie: 1,
    ruimte: raw.ruimte === 'technisch' || ruimte === 'technisch' ? (ruimte === 'technisch' ? 'technisch' : 'prive') : 'prive',
    geometrie: {
      x: begrensGetal(gRaw.x, 0, 4000, def.geometrie.x),
      y: begrensGetal(gRaw.y, 0, 4000, def.geometrie.y),
      breedte: begrensGetal(gRaw.breedte, 310, 1600, def.geometrie.breedte),
      hoogte: begrensGetal(gRaw.hoogte, 300, 1400, def.geometrie.hoogte),
      modus: kiesEnum(gRaw.modus, VENSTER_MODI, def.geometrie.modus),
      vastgepind: Boolean(gRaw.vastgepind),
      minimalePil: Boolean(gRaw.minimalePil),
    },
    veeg: {
      actief: vRaw.actief !== false,
      drempelPx: begrensGetal(vRaw.drempelPx, 48, 180, def.veeg.drempelPx),
      links: kiesEnum(vRaw.links, VEEG_ACTIES, def.veeg.links),
      rechts: kiesEnum(vRaw.rechts, VEEG_ACTIES, def.veeg.rechts),
      trilling: vRaw.trilling !== false,
    },
    contextAdaptatie: raw.contextAdaptatie !== false,
    toonBannersInCentrum: raw.toonBannersInCentrum !== false,
    geluidGlobaal: raw.geluidGlobaal !== false,
    toastSeconden: begrensGetal(raw.toastSeconden, 2, 30, def.toastSeconden),
    bewaarDagen: begrensGetal(raw.bewaarDagen, 1, 365, def.bewaarDagen),
    stilleUren: {
      actief: Boolean(sRaw.actief),
      van: typeof sRaw.van === 'string' && HH_MM_RE.test(sRaw.van) ? sRaw.van : def.stilleUren.van,
      tot: typeof sRaw.tot === 'string' && HH_MM_RE.test(sRaw.tot) ? sRaw.tot : def.stilleUren.tot,
      kritiekStilOmzeilen: sRaw.kritiekStilOmzeilen !== false,
    },
    bijlageWeergave: {
      inlineSpeler: bRaw.inlineSpeler !== false,
      autoMetadata: bRaw.autoMetadata !== false,
      maxVoorbeeldMb: begrensGetal(bRaw.maxVoorbeeldMb, 1, 100, def.bijlageWeergave.maxVoorbeeldMb),
      hexFallback: bRaw.hexFallback !== false,
    },
    ai: {
      modus: kiesEnum(aRaw.modus, AI_MODI, def.ai.modus),
      aanbieder: kiesEnum(aRaw.aanbieder, AI_AANBIEDERS_KEUZE, def.ai.aanbieder),
      autoSamenvatting: Boolean(aRaw.autoSamenvatting),
      alleenLokaalVoorBeveiliging: aRaw.alleenLokaalVoorBeveiliging !== false,
    },
    kanalen,
    bijgewerktOp: begrensGetal(raw.bijgewerktOp, 0, Number.MAX_SAFE_INTEGER, 0),
  };
}

export function normaliseerBijlagen(raw: unknown): MeldingBijlage[] {
  if (!Array.isArray(raw)) return [];
  const uit: MeldingBijlage[] = [];
  for (const item of raw.slice(0, 20)) {
    if (!isRecord(item)) continue;
    const naam = String(item.naam || '').trim().slice(0, 240);
    if (!naam) continue;
    uit.push({
      id: String(item.id || `bijlage-${uit.length + 1}`).slice(0, 80),
      naam,
      mime: String(item.mime || 'application/octet-stream').trim().slice(0, 120),
      grootteBytes: begrensGetal(item.grootteBytes, 0, 500_000_000, 0),
      ...(typeof item.url === 'string' && item.url.trim() ? { url: item.url.trim().slice(0, 800) } : {}),
      ...(typeof item.inhoudBase64 === 'string' && item.inhoudBase64.length <= 2_500_000 ? { inhoudBase64: item.inhoudBase64 } : {}),
      ...(typeof item.tekstVoorbeeld === 'string' ? { tekstVoorbeeld: item.tekstVoorbeeld.slice(0, 64_000) } : {}),
      ...(typeof item.bronDienst === 'string' ? { bronDienst: kiesEnum(item.bronDienst, SUBDOMEINEN, 'hub') } : {}),
      ...(typeof item.berichtId === 'string' ? { berichtId: item.berichtId.slice(0, 160) } : {}),
      ...(typeof item.bijlageId === 'string' ? { bijlageId: item.bijlageId.slice(0, 160) } : {}),
      ...(typeof item.accountId === 'string' ? { accountId: item.accountId.slice(0, 160) } : {}),
    });
  }
  return uit;
}

export function normaliseerActies(raw: unknown): MeldingActie[] {
  if (!Array.isArray(raw)) return [];
  const soorten = ['navigeer', 'status', 'api', 'ai', 'bijlage'] as const;
  const uit: MeldingActie[] = [];
  for (const item of raw.slice(0, 10)) {
    if (!isRecord(item)) continue;
    const id = String(item.id || '').trim().slice(0, 64);
    const labelUk = String(item.labelUk || item.label || '').trim().slice(0, 120);
    const labelNl = String(item.labelNl || item.label || labelUk).trim().slice(0, 120);
    if (!id || (!labelUk && !labelNl)) continue;
    uit.push({
      id,
      labelUk: labelUk || labelNl,
      labelNl: labelNl || labelUk,
      soort: kiesEnum(item.soort, soorten, 'status'),
      ...(item.statusDoel ? { statusDoel: kiesEnum(item.statusDoel, GEBEURTENIS_STATUSSEN, 'gelezen') } : {}),
      ...(typeof item.href === 'string' && item.href.trim() ? { href: item.href.trim().slice(0, 500) } : {}),
      ...(typeof item.tab === 'string' && item.tab.trim() ? { tab: item.tab.trim().slice(0, 64) } : {}),
      ...(Number.isFinite(Number(item.uitstelMinuten)) ? { uitstelMinuten: begrensGetal(item.uitstelMinuten, 1, 43_200, 30) } : {}),
      ...(item.bevestigingNodig ? { bevestigingNodig: true } : {}),
    });
  }
  return uit;
}

export function normaliseerGebeurtenis(raw: Record<string, unknown>): MeldingEcosysteemGebeurtenis {
  const ai = isRecord(raw.ai_samenvatting ?? raw.aiSamenvatting)
    ? (raw.ai_samenvatting ?? raw.aiSamenvatting) as Record<string, unknown>
    : null;
  const nu = Date.now();
  const ts = (v: unknown, fb = nu) => {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v) {
      const p = Date.parse(v);
      if (Number.isFinite(p)) return p;
    }
    return fb;
  };
  return {
    id: String(raw.id || ''),
    ruimte: raw.ruimte === 'technisch' ? 'technisch' : 'prive',
    externeSleutel: String(raw.externe_sleutel ?? raw.externeSleutel ?? '').slice(0, 180),
    kanaal: kiesEnum(raw.kanaal, KANALEN, 'systeem'),
    subdomein: kiesEnum(raw.subdomein, SUBDOMEINEN, 'hub'),
    bron: String(raw.bron || '').slice(0, 120),
    prioriteit: kiesEnum(raw.prioriteit, PRIORITEITEN, 'normaal'),
    status: kiesEnum(raw.status, GEBEURTENIS_STATUSSEN, 'nieuw'),
    titel: String(raw.titel || '').slice(0, 400),
    bericht: String(raw.bericht || '').slice(0, 4000),
    uitleg: String(raw.uitleg || '').slice(0, 2000),
    contextLabel: String(raw.context_label ?? raw.contextLabel ?? '').slice(0, 240),
    herhalingen: begrensGetal(raw.herhalingen, 1, 99_999, 1),
    uitgesteldTot: raw.uitgesteld_tot || raw.uitgesteldTot ? ts(raw.uitgesteld_tot ?? raw.uitgesteldTot, 0) || null : null,
    bijlagen: normaliseerBijlagen(raw.bijlagen),
    acties: normaliseerActies(raw.acties),
    meta: isRecord(raw.meta) ? raw.meta : {},
    aiSamenvatting: ai
      ? {
          bron: ai.bron === 'extern' ? 'extern' : 'intern',
          ...(typeof ai.aanbieder === 'string' ? { aanbieder: ai.aanbieder } : {}),
          samenvatting: String(ai.samenvatting || '').slice(0, 1500),
          oorzaak: String(ai.oorzaak || '').slice(0, 1000),
          advies: String(ai.advies || '').slice(0, 1500),
          aanbevolenActies: Array.isArray(ai.aanbevolenActies) ? ai.aanbevolenActies.map((x) => String(x).slice(0, 200)).slice(0, 8) : [],
          risico: kiesEnum(ai.risico, PRIORITEITEN, 'normaal'),
          opgesteldOp: ts(ai.opgesteldOp, nu),
          geschoond: ai.geschoond !== false,
        }
      : null,
    aangemaaktOp: ts(raw.aangemaakt_op ?? raw.aangemaaktOp, nu),
    bijgewerktOp: ts(raw.bijgewerkt_op ?? raw.bijgewerktOp, nu),
  };
}
