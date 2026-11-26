// Клієнтське сховище, синхронізація та об’єднаний реактивний потік єдиної екосистеми сповіщень (GEMINI-002).
// Об’єднує 5 джерел (БД екосистеми, сигнали сторінок PaginaSignaal, серверні сповіщення, локальний журнал, активність),
// ізольовано зберігає профілі для просторів `prive` та `technisch` і гарантує миттєву роботу без втрати даних.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../platform/client';
import { meldingLichaam } from '../sessie-context';
import { abonneerZijbalk, zetZijbalk, zijbalkVoorkeuren } from '../../zijbalk-voorkeuren';
import type { PaginaSignaal } from '../../canoniek-meldingen';
import type { CanonicalServerNotification } from '../../canoniek-meldingen';
import type { ActivityEvent } from '../../connector-activiteit';
import type { BewaardeRij } from '../lokale-rijen';
import { vanTellers, type MenuMelding, type Tellers } from '../../../shared/menu-meldingen';
import {
  abonneerVerbindingIncidenten,
  incidentNaarEcosysteemGebeurtenis,
  leesVerbindingIncidenten,
  synchroniseerVerbindingBewijzenNaarServer,
  type VerbindingIncidentBewijs,
} from '../../platform/verbinding-bewijs-opslag';
import {
  interneAiAnalyse,
  interpreteerGebeurtenis,
  normaliseerGebeurtenis,
  normaliseerProfiel,
  standaardProfiel,
  type MeldingAiSamenvatting,
  type MeldingEcosysteemGebeurtenis,
  type MeldingEcosysteemProfiel,
  type MeldingGebeurtenisStatus,
  type MeldingSubdomein,
  type RuimteType,
  type VensterGeometrie,
} from '../../../shared/meldingen-ecosysteem';

const PROFIEL_SLEUTEL = (scope: string, ruimte: RuimteType) =>
  `tsv:melding-ecosysteem:profiel:v1:${scope || 'anon'}:${ruimte}`;
const STATUS_OVERRIDES_SLEUTEL = (scope: string, ruimte: RuimteType) =>
  `tsv:melding-ecosysteem:status:v1:${scope || 'anon'}:${ruimte}`;
const ONTVANGST_SLEUTEL = (scope: string, ruimte: RuimteType) =>
  `tsv:melding-ecosysteem:ontvangst:v1:${scope || 'anon'}:${ruimte}`;
const STAND_SLEUTEL = 'tsv:melding-ecosysteem:stand:v1';

const profielLuisteraars = new Set<(info: { scope: string; ruimte: RuimteType; profiel: MeldingEcosysteemProfiel }) => void>();
const standLuisteraars = new Set<(actief: boolean) => void>();

const verwittigStand = (actief: boolean) => {
  for (const fn of standLuisteraars) {
    try {
      fn(actief);
    } catch {
      /* слухач не ламає потік */
    }
  }
};

const kanaal: BroadcastChannel | null = (() => {
  try {
    return typeof BroadcastChannel === 'function' ? new BroadcastChannel('mr-melding-ecosysteem') : null;
  } catch {
    return null;
  }
})();

kanaal?.addEventListener('message', (ev) => {
  const d = ev.data as { soort?: string; scope?: string; ruimte?: RuimteType; profiel?: unknown; actief?: unknown } | null;
  if (d?.soort === 'profiel' && d.scope && d.ruimte && d.profiel) {
    const genorm = normaliseerProfiel(d.profiel, d.ruimte);
    schrijfLokaalProfiel(d.scope, d.ruimte, genorm, false);
  } else if (d?.soort === 'stand' && typeof d.actief === 'boolean') {
    try {
      localStorage.setItem(STAND_SLEUTEL, d.actief ? 'ecosysteem' : 'klassiek');
    } catch {
      /* безпечний ігнор */
    }
    verwittigStand(d.actief);
  }
});

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === STAND_SLEUTEL) {
      verwittigStand(leesEcosysteemModusActief());
    }
  });
}

export function leesLokaalProfiel(scope: string, ruimte: RuimteType): MeldingEcosysteemProfiel {
  try {
    const raw = localStorage.getItem(PROFIEL_SLEUTEL(scope, ruimte));
    if (!raw) return standaardProfiel(ruimte);
    return normaliseerProfiel(JSON.parse(raw), ruimte);
  } catch {
    return standaardProfiel(ruimte);
  }
}

function schrijfLokaalProfiel(scope: string, ruimte: RuimteType, profiel: MeldingEcosysteemProfiel, uitzenden = true) {
  try {
    localStorage.setItem(PROFIEL_SLEUTEL(scope, ruimte), JSON.stringify(profiel));
  } catch {
    /* приватне вікно або середовище без localStorage */
  }
  for (const fn of profielLuisteraars) {
    try {
      fn({ scope, ruimte, profiel });
    } catch {
      /* слухач не ламає потік */
    }
  }
  if (uitzenden) {
    try {
      kanaal?.postMessage({ soort: 'profiel', scope, ruimte, profiel });
    } catch {
      /* канал недоступний */
    }
  }
}

// MELDINGEN-UX-001: de keuze «компактна панель / рухоме вікно» staat in de accountvoorkeuren (zijbalk `meldingen.paneel`,
// server, alle subdomeinen en apparaten). localStorage per subdomein is alleen de terugval voor wie nog niets koos — vroeger was
// het ALLEEN localStorage, waardoor op een ander subdomein (mcp., cloud.) ineens het andere paneel opensprong.
export function leesEcosysteemModusActief(): boolean {
  try {
    const keuze = zijbalkVoorkeuren().meldingen.paneel;
    if (keuze) return keuze === 'venster';
  } catch {
    /* voorkeuren nog niet geladen */
  }
  try {
    const v = localStorage.getItem(STAND_SLEUTEL);
    if (v === 'klassiek') return false;
    return true;
  } catch {
    return true;
  }
}

export function zetEcosysteemModusActief(actief: boolean): void {
  try {
    localStorage.setItem(STAND_SLEUTEL, actief ? 'ecosysteem' : 'klassiek');
  } catch {
    /* безпечний ігнор */
  }
  try {
    zetZijbalk((cur) => ({ ...cur, meldingen: { ...cur.meldingen, paneel: actief ? 'venster' : 'compact' } }));
  } catch {
    /* voorkeuren niet beschikbaar: alleen lokaal */
  }
  verwittigStand(actief);
  try {
    kanaal?.postMessage({ soort: 'stand', actief });
  } catch {
    /* канал недоступний */
  }
}

/** Реактивна підписка на поточний режим панелі сповіщень (рухоме вікно чи компактна панель) між вкладками, піддоменами й компонентами. */
export function useEcosysteemModusActief(): boolean {
  const [actief, setActief] = useState<boolean>(() => leesEcosysteemModusActief());
  useEffect(() => {
    setActief(leesEcosysteemModusActief());
    const luister = (waarde: boolean) => setActief(waarde);
    standLuisteraars.add(luister);
    const weg = abonneerZijbalk(() => setActief(leesEcosysteemModusActief()));
    return () => {
      standLuisteraars.delete(luister);
      weg();
    };
  }, []);
  return actief;
}

export function leesLokaleStatusOverrides(scope: string, ruimte: RuimteType): Record<string, { status: MeldingGebeurtenisStatus; op: number; uitgesteldTot?: number | null }> {
  try {
    const raw = JSON.parse(localStorage.getItem(STATUS_OVERRIDES_SLEUTEL(scope, ruimte)) || '{}');
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
}

function schrijfLokaleStatusOverride(
  scope: string,
  ruimte: RuimteType,
  sleutels: string[],
  status: MeldingGebeurtenisStatus,
  uitgesteldTot: number | null = null,
) {
  try {
    const cur = leesLokaleStatusOverrides(scope, ruimte);
    const nu = Date.now();
    for (const k of sleutels) {
      if (!k) continue;
      cur[k] = { status, op: nu, ...(uitgesteldTot ? { uitgesteldTot } : {}) };
    }
    const entries = Object.entries(cur).sort((a, b) => b[1].op - a[1].op).slice(0, 400);
    localStorage.setItem(STATUS_OVERRIDES_SLEUTEL(scope, ruimte), JSON.stringify(Object.fromEntries(entries)));
  } catch {
    /* безпечний ігнор */
  }
}

export type OntvangstOverrideWaarde = {
  afgeleverdOp?: number | null;
  gelezenOp?: number | null;
  op: number;
};

export function leesLokaleOntvangstOverrides(scope: string, ruimte: RuimteType): Record<string, OntvangstOverrideWaarde> {
  try {
    const raw = JSON.parse(localStorage.getItem(ONTVANGST_SLEUTEL(scope, ruimte)) || '{}');
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
}

function schrijfLokaleOntvangstOverrides(
  scope: string,
  ruimte: RuimteType,
  opties: { afgeleverd?: string[]; gelezen?: string[]; wisGelezen?: string[] },
) {
  try {
    const cur = leesLokaleOntvangstOverrides(scope, ruimte);
    const nu = Date.now();
    for (const k of opties.afgeleverd || []) {
      if (!k) continue;
      const best = cur[k];
      cur[k] = {
        ...best,
        afgeleverdOp: best?.afgeleverdOp || nu,
        op: nu,
      };
    }
    for (const k of opties.gelezen || []) {
      if (!k) continue;
      const best = cur[k];
      cur[k] = {
        afgeleverdOp: best?.afgeleverdOp || nu,
        gelezenOp: best?.gelezenOp || nu,
        op: nu,
      };
    }
    for (const k of opties.wisGelezen || []) {
      if (!k) continue;
      const best = cur[k];
      cur[k] = {
        afgeleverdOp: best?.afgeleverdOp || nu,
        gelezenOp: null,
        op: nu,
      };
    }
    const entries = Object.entries(cur).sort((a, b) => b[1].op - a[1].op).slice(0, 500);
    localStorage.setItem(ONTVANGST_SLEUTEL(scope, ruimte), JSON.stringify(Object.fromEntries(entries)));
  } catch {
    /* безпечний ігнор */
  }
}

export type AfleveringOverzichtData = {
  samenvatting: {
    totaal: number;
    wachtOpAflevering: number;
    afgeleverdOngelezen: number;
    gelezen: number;
    autoGearchiveerdOngelezen: number;
  };
  perGebruiker: Array<{
    userId: string;
    label: string;
    totaal: number;
    wachtOpAflevering: number;
    afgeleverdOngelezen: number;
    gelezen: number;
    autoGearchiveerdOngelezen: number;
    laatsteAfleveringOp: number | null;
  }>;
  items: Array<{
    id: string;
    userId: string;
    gebruikerLabel: string;
    ruimte: RuimteType;
    kanaal: string;
    subdomein: string;
    status: MeldingGebeurtenisStatus;
    ontvangstStaat: 'wacht' | 'afgeleverd' | 'gelezen';
    autoGearchiveerd: boolean;
    titel: string;
    aangemaaktOp: number;
    afgeleverdOp: number | null;
    gelezenOp: number | null;
  }>;
};

export async function haalAfleveringOverzichtVanServer(opties: {
  ruimte?: RuimteType | 'alle';
  alleenOngelezen?: boolean;
}): Promise<AfleveringOverzichtData | null> {
  try {
    const r = await api.post(
      '/api/owner/meldingen/ecosysteem/aflevering-overzicht',
      meldingLichaam({
        ...(opties.ruimte && opties.ruimte !== 'alle' ? { ruimte: opties.ruimte } : {}),
        alleenOngelezen: Boolean(opties.alleenOngelezen),
        limiet: 40,
      }),
    );
    if (r.data?.ok && r.data.samenvatting) {
      return {
        samenvatting: r.data.samenvatting,
        perGebruiker: Array.isArray(r.data.perGebruiker) ? r.data.perGebruiker : [],
        items: Array.isArray(r.data.items) ? r.data.items : [],
      };
    }
  } catch {
    /* доступно лише адміністраторам технічного простору */
  }
  return null;
}

export async function haalProfielVanServer(scope: string, ruimte: RuimteType): Promise<MeldingEcosysteemProfiel> {
  if (!scope || scope === 'anon') return leesLokaalProfiel(scope, ruimte);
  try {
    const r = await api.post('/api/owner/meldingen/ecosysteem/profiel', meldingLichaam({ ruimte }));
    if (r.data?.profiel && (!r.data?.ruimte || r.data.ruimte === ruimte)) {
      const p = normaliseerProfiel(r.data.profiel, ruimte);
      schrijfLokaalProfiel(scope, ruimte, p);
      return p;
    }
  } catch {
    /* повертаємо локальне сховище без падіння */
  }
  return leesLokaalProfiel(scope, ruimte);
}

export async function bewaarProfielOpServer(
  scope: string,
  ruimte: RuimteType,
  profiel: MeldingEcosysteemProfiel,
): Promise<MeldingEcosysteemProfiel> {
  const genorm = normaliseerProfiel({ ...profiel, bijgewerktOp: Date.now() }, ruimte);
  schrijfLokaalProfiel(scope, ruimte, genorm);
  if (!scope || scope === 'anon') return genorm;
  try {
    const r = await api.post('/api/owner/meldingen/ecosysteem/profiel/opslaan', meldingLichaam({ ruimte, profiel: genorm }));
    if (r.data?.profiel && (!r.data?.ruimte || r.data.ruimte === ruimte)) {
      const vanServer = normaliseerProfiel(r.data.profiel, ruimte);
      schrijfLokaalProfiel(scope, ruimte, vanServer);
      return vanServer;
    }
  } catch {
    /* зміни вже збережено локально */
  }
  return genorm;
}

export async function publiceerGebeurtenisNaarServer(
  scope: string,
  ruimte: RuimteType,
  invoer: Record<string, unknown>,
): Promise<MeldingEcosysteemGebeurtenis | null> {
  if (!scope || scope === 'anon') return null;
  try {
    const r = await api.post('/api/owner/meldingen/ecosysteem/gebeurtenis', meldingLichaam({ ruimte, ...invoer }));
    if (r.data?.gebeurtenis) return normaliseerGebeurtenis(r.data.gebeurtenis as Record<string, unknown>);
  } catch {
    /* у гостьовому або автономному режимі лишається локально */
  }
  return null;
}

export async function voerEcosysteemActieUit(invoer: {
  scope: string;
  ruimte: RuimteType;
  id: string;
  externeSleutel?: string;
  actie: string;
  status?: MeldingGebeurtenisStatus;
  kanaal?: string;
  uitstelMinuten?: number;
}): Promise<boolean> {
  const sleutels = [invoer.id, invoer.externeSleutel || ''].filter(Boolean);
  const uitgesteldTot = invoer.status === 'uitgesteld' ? Date.now() + (invoer.uitstelMinuten || 30) * 60_000 : null;
  if (invoer.status && sleutels.length) {
    schrijfLokaleStatusOverride(invoer.scope, invoer.ruimte, sleutels, invoer.status, uitgesteldTot);
  }
  if (!invoer.scope || invoer.scope === 'anon') return true;
  try {
    await api.post(
      '/api/owner/meldingen/ecosysteem/actie',
      meldingLichaam({
        ruimte: invoer.ruimte,
        id: invoer.externeSleutel || invoer.id,
        actie: invoer.actie,
        ...(invoer.status ? { status: invoer.status } : {}),
        ...(invoer.kanaal ? { kanaal: invoer.kanaal } : {}),
        ...(invoer.uitstelMinuten ? { uitstelMinuten: invoer.uitstelMinuten } : {}),
      }),
    );
    return true;
  } catch {
    return false;
  }
}

export async function vraagAiOntledingAan(invoer: {
  scope: string;
  ruimte: RuimteType;
  gebeurtenis: MeldingEcosysteemGebeurtenis;
  lang: 'uk' | 'nl';
  modus: 'intern' | 'extern';
  aanbieder?: string;
}): Promise<MeldingAiSamenvatting> {
  if (invoer.modus === 'intern' || !invoer.scope || invoer.scope === 'anon') {
    return interneAiAnalyse(invoer.gebeurtenis, invoer.lang);
  }
  try {
    const r = await api.post(
      '/api/owner/meldingen/ecosysteem/ai-ontleden',
      meldingLichaam({
        ruimte: invoer.ruimte,
        id: invoer.gebeurtenis.id,
        titel: invoer.gebeurtenis.titel,
        bericht: invoer.gebeurtenis.bericht,
        uitleg: invoer.gebeurtenis.uitleg,
        bron: invoer.gebeurtenis.bron,
        kanaal: invoer.gebeurtenis.kanaal,
        subdomein: invoer.gebeurtenis.subdomein,
        bijlagen: invoer.gebeurtenis.bijlagen,
        lang: invoer.lang,
        modus: invoer.modus,
        ...(invoer.aanbieder ? { aanbieder: invoer.aanbieder } : {}),
      }),
    );
    if (r.data?.samenvatting) {
      return r.data.samenvatting as MeldingAiSamenvatting;
    }
  } catch {
    /* резерв: безпечний локальний розбір */
  }
  return interneAiAnalyse(invoer.gebeurtenis, invoer.lang);
}

export type UniformeStroomInvoer = {
  lang: 'uk' | 'nl';
  ruimte: RuimteType;
  subdomeinNu: MeldingSubdomein;
  profiel?: MeldingEcosysteemProfiel;
  serverGebeurtenissen: MeldingEcosysteemGebeurtenis[];
  paginaSignalen: PaginaSignaal[];
  verbindingIncidenten?: VerbindingIncidentBewijs[];
  serverItems: CanonicalServerNotification[];
  techItems: CanonicalServerNotification[];
  localRows: BewaardeRij[];
  activityEvents: ActivityEvent[];
  activityRead: Set<string>;
  overrides?: Record<string, { status: MeldingGebeurtenisStatus; op: number; uitgesteldTot?: number | null }>;
  ontvangstOverrides?: Record<string, OntvangstOverrideWaarde>;
  aiCache?: Record<string, MeldingAiSamenvatting>;
  tellers?: Tellers;
  weg?: Record<string, number>;
  tellerStaat?: { tellers?: Tellers; weg?: Record<string, number>; scope?: string };
  menuTellers?: MenuMelding[];
  tekstVanServer?: (s: CanonicalServerNotification) => { title: string; message: string };
  titelVanActiviteit?: (ev: ActivityEvent) => string;
  contextVanActiviteit?: (ev: ActivityEvent) => string;
};

const APPARAAT_LINK_UUID_RE = /[?&]apparaat=([0-9a-f-]{36})/i;
const ZUIVER_UUID_RE = /^[0-9a-f-]{36}$/i;

const PRIO_RANG: Record<MeldingEcosysteemGebeurtenis['prioriteit'], number> = {
  kritiek: 0,
  hoog: 1,
  normaal: 2,
  laag: 3,
};

const STATUS_RANG: Record<MeldingGebeurtenisStatus, number> = {
  nieuw: 0,
  uitgesteld: 1,
  gelezen: 2,
  opgelost: 3,
  archief: 4,
};

/** Об’єднує всі джерела подій сайту, сторінок, доказів зв’язку, сервера та агентів в єдиний дедуплікований потік без дублів. */
export function bouwUniformeStroom(invoer: UniformeStroomInvoer): MeldingEcosysteemGebeurtenis[] {
  const nl = invoer.lang === 'nl';
  const result = new Map<string, MeldingEcosysteemGebeurtenis>();

  const voegToe = (g: MeldingEcosysteemGebeurtenis) => {
    const sleutel = g.externeSleutel || g.id;
    const bestaand = result.get(sleutel);
    const ruwOv = invoer.overrides?.[g.id] || (g.externeSleutel ? invoer.overrides?.[g.externeSleutel] : undefined);
    const ov = ruwOv && g.bijgewerktOp <= ruwOv.op + 1500 ? ruwOv : undefined;
    const ontOv = invoer.ontvangstOverrides?.[g.id] || (g.externeSleutel ? invoer.ontvangstOverrides?.[g.externeSleutel] : undefined);
    const ai = g.aiSamenvatting || invoer.aiCache?.[g.id] || (g.externeSleutel ? invoer.aiCache?.[g.externeSleutel] : undefined) || null;
    const kanaalGefilterd = Boolean(
      invoer.profiel &&
        g.kanaal !== 'beveiliging' &&
        g.prioriteit !== 'kritiek' &&
        invoer.profiel.kanalen[g.kanaal]?.actief === false,
    );
    const autoGearchiveerd = Boolean(g.autoGearchiveerd || kanaalGefilterd);
    let status = ov?.status ?? (autoGearchiveerd && g.status === 'nieuw' ? 'archief' : g.status);
    let uitgesteldTot = ov ? (ov.uitgesteldTot ?? null) : g.uitgesteldTot;
    if (status === 'uitgesteld' && uitgesteldTot && uitgesteldTot <= Date.now()) {
      status = 'nieuw';
      uitgesteldTot = null;
    }
    const afgeleverdOp = ontOv?.afgeleverdOp ?? g.afgeleverdOp ?? (status === 'gelezen' ? g.aangemaaktOp : null);
    const gelezenOp =
      status === 'nieuw' && ov?.status === 'nieuw'
        ? null
        : ontOv?.gelezenOp !== undefined
          ? ontOv.gelezenOp
          : (g.gelezenOp ?? (status === 'gelezen' ? g.bijgewerktOp : null));
    const verrijkt: MeldingEcosysteemGebeurtenis = {
      ...g,
      status,
      uitgesteldTot,
      afgeleverdOp,
      gelezenOp,
      autoGearchiveerd,
      aiSamenvatting: ai,
    };
    if (!bestaand || verrijkt.bijgewerktOp >= bestaand.bijgewerktOp) {
      result.set(sleutel, verrijkt);
    }
  };

  // 1. Події з серверної таблиці екосистеми (ПК-агент, розширення, ШІ, пошта, сховище, синхронізовані докази зв’язку)
  for (const g of invoer.serverGebeurtenissen) {
    if (g.ruimte !== invoer.ruimte) continue;
    voegToe(g);
  }

  // 1б. Тривалий реєстр доказів і хронології перерв зв’язку з сервером (залишається в історії після відновлення)
  const incidentenLijst = invoer.verbindingIncidenten ?? leesVerbindingIncidenten();
  const bandVerbindingSig = invoer.paginaSignalen.find((s) => s.actief && s.id === 'band:verbinding');
  let heeftVerbindingBewijsInStroom = false;
  for (const inc of incidentenLijst) {
    const geb = incidentNaarEcosysteemGebeurtenis(inc, invoer.lang);
    if (inc.ruimte !== invoer.ruimte && geb.subdomein !== invoer.subdomeinNu) continue;
    heeftVerbindingBewijsInStroom = true;
    const liveActies =
      inc.hersteldOp === null && bandVerbindingSig?.acties?.length
        ? [
            ...bandVerbindingSig.acties.map((a) => ({
              id: `ps:${bandVerbindingSig.id}:${a.id}`,
              labelUk: a.labelUk,
              labelNl: a.labelNl,
              soort: (a.href ? 'navigeer' : 'api') as 'navigeer' | 'api',
              ...(a.href ? { href: a.href } : {}),
            })),
            ...geb.acties.filter((a) => a.soort === 'bijlage' || a.soort === 'ai'),
          ]
        : geb.acties;
    voegToe({
      ...geb,
      ruimte: invoer.ruimte,
      afgeleverdOp: geb.afgeleverdOp ?? inc.laatsteTijd,
      acties: liveActies,
    });
  }

  // 2. Живі сигнали поточних сторінок та інформаційних смуг (мережа, оновлення сайту/розширення, ключ-сейф, простори)
  for (const sig of invoer.paginaSignalen) {
    if (!sig.actief) continue;
    if (sig.id === 'band:verbinding' && heeftVerbindingBewijsInStroom) continue;
    const geb = interpreteerGebeurtenis(
      {
        id: sig.id,
        externeSleutel: sig.id,
        ruimte: invoer.ruimte,
        bron: sig.bron,
        kanaal: sig.kanaal || 'pagina',
        subdomein: sig.subdomein || invoer.subdomeinNu,
        soort: sig.soort,
        ernst: sig.ernst === 'kritiek' ? 'kritiek' : sig.ernst === 'hoog' ? 'waarschuwing' : sig.ernst === 'succes' ? 'succes' : 'info',
        titel: nl ? sig.titelNl : sig.titelUk,
        bericht: nl ? (sig.berichtNl || sig.berichtUk || '') : (sig.berichtUk || sig.berichtNl || ''),
        uitleg: nl ? (sig.uitlegNl || sig.uitlegUk || '') : (sig.uitlegUk || sig.uitlegNl || ''),
        contextLabel: sig.contextLabel || invoer.subdomeinNu,
        link: sig.link,
        bijlagen: sig.bijlagen,
        acties: (sig.acties || []).map((a) => ({
          id: `ps:${sig.id}:${a.id}`,
          labelUk: a.labelUk,
          labelNl: a.labelNl,
          soort: a.href ? 'navigeer' : 'api',
          ...(a.href ? { href: a.href } : {}),
        })),
        aangemaaktOp: sig.bijgewerktOp,
        meta: { paginaSignaalId: sig.id },
      },
      invoer.ruimte,
    );
    voegToe({ ...geb, afgeleverdOp: geb.afgeleverdOp ?? sig.bijgewerktOp });
  }

  // 3. Серверні сповіщення (site_notifications + techItems)
  const serverSamengesteld = invoer.ruimte === 'technisch'
    ? [...invoer.techItems, ...invoer.serverItems.filter((s) => s.ruimte === 'technisch')]
    : invoer.serverItems.filter((s) => (s.ruimte ?? 'prive') === 'prive');

  const serverNieuwApparaatLijst: Array<{
    sleutel: string;
    apparaatId: string;
    aangemaaktOp: number;
    tekstLaag: string;
  }> = [];

  for (const s of serverSamengesteld) {
    const sl = `site_notif:${s.id}`;
    const tekst = invoer.tekstVanServer ? invoer.tekstVanServer(s) : { title: s.title, message: s.message };
    const uitLinkUuid = APPARAAT_LINK_UUID_RE.exec(String(s.link || ''))?.[1] || '';
    const isNieuwApparaatMelding =
      Boolean(uitLinkUuid) ||
      (s.kind === 'security_warning' &&
        ZUIVER_UUID_RE.test(s.id) &&
        /(новий вхід|nieuwe aanmelding)/i.test(`${tekst.title} ${tekst.message}`));
    const apparaatUuid = uitLinkUuid || (isNieuwApparaatMelding && ZUIVER_UUID_RE.test(s.id) ? s.id : '');

    const geb = interpreteerGebeurtenis(
      {
        id: `s:${s.id}`,
        externeSleutel: sl,
        ruimte: invoer.ruimte,
        bron: s.kind || 'systeem',
        soort: s.kind,
        titel: tekst.title,
        bericht: tekst.message,
        link: s.link,
        aangemaaktOp: s.createdAt,
        gelezen: Boolean(s.read),
        meta: {
          serverId: s.id,
          ...(apparaatUuid ? { apparaatId: apparaatUuid } : {}),
        },
      },
      invoer.ruimte,
    );
    voegToe({ ...geb, afgeleverdOp: geb.afgeleverdOp ?? s.createdAt });

    if (isNieuwApparaatMelding) {
      serverNieuwApparaatLijst.push({
        sleutel: sl,
        apparaatId: apparaatUuid,
        aangemaaktOp: Number(s.createdAt) || 0,
        tekstLaag: `${tekst.title} ${tekst.message}`.toLowerCase(),
      });
    }
  }

  // 4. Активності підключень, агентів і ШІ (activity.events)
  for (const ev of invoer.activityEvents) {
    if (/^owner\.meldingen\.ecosysteem\.(actie|profiel|ontvangst|aflevering_overzicht)$/.test(String(ev.type || ''))) continue;
    const ts = ev.finishedAt || ev.createdAt;

    // MELD-6: якщо вхід із нового пристрою вже представлений розгорнутою карткою site_notifications, об’єднуємо їх без дублювання
    if (ev.type === 'owner.apparaat.nieuw' && serverNieuwApparaatLijst.length > 0) {
      const evSub = String(ev.subject || '').trim().toLowerCase();
      const gekoppeldSrv = serverNieuwApparaatLijst.find((srv) => {
        if (ev.apparaatId && srv.apparaatId && ev.apparaatId.toLowerCase() === srv.apparaatId.toLowerCase()) {
          return true;
        }
        const binnenVenster = Math.abs(ts - srv.aangemaaktOp) <= 120_000;
        const toestelPast = !evSub || srv.tekstLaag.includes(evSub);
        return binnenVenster && toestelPast;
      });
      if (gekoppeldSrv) {
        const bestaandSrv = result.get(gekoppeldSrv.sleutel);
        if (bestaandSrv) {
          result.set(gekoppeldSrv.sleutel, {
            ...bestaandSrv,
            meta: {
              ...bestaandSrv.meta,
              activiteitId: ev.id,
              actieCode: ev.type,
              ...(ev.apparaatId && !bestaandSrv.meta?.apparaatId ? { apparaatId: ev.apparaatId } : {}),
            },
          });
          continue;
        }
      }
    }

    const titel = invoer.titelVanActiviteit ? invoer.titelVanActiviteit(ev) : (ev.tool || ev.doel || ev.subject || ev.type || ev.kind);
    const ctx = invoer.contextVanActiviteit ? invoer.contextVanActiviteit(ev) : (ev.subject || '');
    const sl = `act:${ev.id}`;
    const details = [ev.reden, ev.eind, ev.code].filter(Boolean).join(' · ') || ev.doel || ev.subject || '';
    const autoLink =
      ev.type === 'owner.apparaat.nieuw'
        ? ev.apparaatId
          ? `https://id.tarasevych.com/sessions?apparaat=${ev.apparaatId}`
          : 'https://id.tarasevych.com/sessions'
        : undefined;
    const geb = interpreteerGebeurtenis(
      {
        id: `a:${ev.id}`,
        externeSleutel: sl,
        ruimte: invoer.ruimte,
        bron: `${ev.source || 'agent'} ${ev.kind} ${ev.type}`.trim(),
        soort: ev.type === 'owner.apparaat.nieuw' ? ev.type : ev.status === 'failed' ? 'error' : ev.status,
        ernst: ev.status === 'failed' ? 'fout' : 'info',
        titel,
        bericht: details,
        contextLabel: ctx,
        link: autoLink,
        aangemaaktOp: ts,
        gelezen: invoer.activityRead.has(ev.id),
        meta: {
          activiteitId: ev.id,
          actieCode: ev.type,
          ...(ev.code ? { foutCode: ev.code } : {}),
          ...(ev.apparaatId ? { apparaatId: ev.apparaatId } : {}),
          ...(ev.client ? { client: ev.client } : {}),
          ...(ev.platform ? { platform: ev.platform } : {}),
        },
      },
      invoer.ruimte,
    );
    voegToe({ ...geb, afgeleverdOp: geb.afgeleverdOp ?? ts });
  }

  // 5. Локальний журнал подій цієї служби (localRows)
  for (const row of invoer.localRows) {
    const sl = `l:${row.id}`;
    const vkl = row.kind === 'error' ? 'fout' : row.kind === 'warning' ? 'waarschuwing' : row.kind === 'success' ? 'succes' : 'info';
    const geb = interpreteerGebeurtenis(
      {
        id: `l:${row.id}`,
        externeSleutel: sl,
        ruimte: invoer.ruimte,
        bron: row.source || 'systeem',
        subdomein: invoer.subdomeinNu,
        soort: row.kind,
        ernst: vkl,
        titel: row.text,
        bericht: row.explain || '',
        contextLabel: row.context || row.source || '',
        link: row.link?.href,
        aangemaaktOp: row.createdAt,
        gelezen: row.read,
        meta: { lokaalId: row.id, ...(row.details?.length ? { details: row.details } : {}) },
      },
      invoer.ruimte,
    );
    if (row.opgelost) geb.status = 'opgelost';
    if (row.count && row.count > 1) geb.herhalingen = row.count;
    voegToe({ ...geb, afgeleverdOp: geb.afgeleverdOp ?? row.createdAt });
  }

  // 6. Зведений сигнал непрочитаної пошти (teller:mail) для особистого простору (MELD-3)
  if (invoer.ruimte === 'prive') {
    const tellerRijen: MenuMelding[] = invoer.menuTellers?.length
      ? invoer.menuTellers
      : invoer.tellers || invoer.tellerStaat?.tellers
        ? vanTellers(
            (invoer.tellers ?? invoer.tellerStaat?.tellers) || {},
            (invoer.weg ?? invoer.tellerStaat?.weg) || {},
            invoer.lang,
          )
        : [];
    for (const tm of tellerRijen) {
      if (tm.id !== 'teller:mail' || result.has('teller:mail')) continue;
      const aantal = Math.max(1, Math.floor(Number(tm.aantal || 1)));
      const opTs = Number(tm.op) || Date.now();
      const gebTeller = interpreteerGebeurtenis(
        {
          id: 'teller:mail',
          externeSleutel: 'teller:mail',
          ruimte: 'prive',
          bron: 'mail:teller',
          kanaal: 'mail',
          subdomein: 'mail',
          soort: 'mail_ongelezen_teller',
          ernst: 'info',
          titel: tm.titel,
          bericht: tm.tekst,
          contextLabel: nl ? 'Postvak In' : 'Вхідні',
          link: tm.link || 'https://mail.tarasevych.com/',
          aangemaaktOp: opTs,
          gelezen: false,
          meta: { tellerId: 'mail', tellerAantal: aantal, bron: 'teller' },
        },
        'prive',
      );
      voegToe({
        ...gebTeller,
        herhalingen: aantal,
        afgeleverdOp: gebTeller.afgeleverdOp ?? opTs,
      });
    }
  }

  return Array.from(result.values()).sort((a, b) => {
    const sDiff = STATUS_RANG[a.status] - STATUS_RANG[b.status];
    if (sDiff !== 0) return sDiff;
    if (a.status === 'nieuw' || a.status === 'uitgesteld') {
      const pDiff = PRIO_RANG[a.prioriteit] - PRIO_RANG[b.prioriteit];
      if (pDiff !== 0) return pDiff;
    }
    return b.bijgewerktOp - a.bijgewerktOp;
  });
}

export function useMeldingEcosysteem(opties: {
  lang: 'uk' | 'nl';
  scope: string;
  ruimte: RuimteType;
  subdomeinNu: MeldingSubdomein;
  actief: boolean;
  /** MELDINGEN-UX-001 (16.11.2026): het venster is de gekozen vorm → de stroom één keer vooraf laden, zodat de bel al vóór het openen klopt. */
  telVooraf?: boolean;
  paginaSignalen: PaginaSignaal[];
  serverItems: CanonicalServerNotification[];
  techItems: CanonicalServerNotification[];
  localRows: BewaardeRij[];
  activityEvents: ActivityEvent[];
  activityRead: Set<string>;
  tellers?: Tellers;
  weg?: Record<string, number>;
  tekstVanServer?: (s: CanonicalServerNotification) => { title: string; message: string };
  titelVanActiviteit?: (ev: ActivityEvent) => string;
  contextVanActiviteit?: (ev: ActivityEvent) => string;
}) {
  const [profiel, setProfiel] = useState<MeldingEcosysteemProfiel>(() => leesLokaalProfiel(opties.scope, opties.ruimte));
  const [serverGebeurtenissen, setServerGebeurtenissen] = useState<MeldingEcosysteemGebeurtenis[]>([]);
  const [verbindingIncidenten, setVerbindingIncidenten] = useState<VerbindingIncidentBewijs[]>(() => leesVerbindingIncidenten());
  const [overrides, setOverrides] = useState(() => leesLokaleStatusOverrides(opties.scope, opties.ruimte));
  const [ontvangstOverrides, setOntvangstOverrides] = useState(() => leesLokaleOntvangstOverrides(opties.scope, opties.ruimte));
  const [aiCache, setAiCache] = useState<Record<string, MeldingAiSamenvatting>>({});
  const [laden, setLaden] = useState(false);
  const geoTimerRef = useRef<number | undefined>(undefined);
  const ontvangstTimerRef = useRef<number | undefined>(undefined);
  const wachtAfgeleverdRef = useRef<Set<string>>(new Set());
  const wachtGelezenRef = useRef<Set<string>>(new Set());

  const spoelOntvangstNaarServer = useCallback(async () => {
    if (!opties.scope || opties.scope === 'anon') {
      wachtAfgeleverdRef.current.clear();
      wachtGelezenRef.current.clear();
      return;
    }
    const afgeleverdIds = Array.from(wachtAfgeleverdRef.current).slice(0, 120);
    const gelezenIds = Array.from(wachtGelezenRef.current).slice(0, 120);
    wachtAfgeleverdRef.current.clear();
    wachtGelezenRef.current.clear();
    if (!afgeleverdIds.length && !gelezenIds.length) return;
    try {
      await api.post(
        '/api/owner/meldingen/ecosysteem/ontvangst',
        meldingLichaam({
          ruimte: opties.ruimte,
          afgeleverdIds,
          gelezenIds,
        }),
      );
    } catch {
      /* локальний стан квитанцій уже збережено, повторно узгодиться під час наступного циклу */
    }
  }, [opties.scope, opties.ruimte]);

  const planOntvangstSpoeling = useCallback(() => {
    if (typeof window === 'undefined') return;
    if (ontvangstTimerRef.current !== undefined) window.clearTimeout(ontvangstTimerRef.current);
    ontvangstTimerRef.current = window.setTimeout(() => {
      ontvangstTimerRef.current = undefined;
      void spoelOntvangstNaarServer();
    }, 350);
  }, [spoelOntvangstNaarServer]);

  const registreerAfgeleverd = useCallback(
    (gebeurtenissen: ReadonlyArray<Pick<MeldingEcosysteemGebeurtenis, 'id' | 'externeSleutel' | 'afgeleverdOp'>>) => {
      const nieuwAfgeleverd: string[] = [];
      for (const g of gebeurtenissen) {
        if (g.afgeleverdOp && g.afgeleverdOp > 0) continue;
        if (g.id) nieuwAfgeleverd.push(g.id);
        if (g.externeSleutel) nieuwAfgeleverd.push(g.externeSleutel);
      }
      if (!nieuwAfgeleverd.length) return;
      const nu = Date.now();
      schrijfLokaleOntvangstOverrides(opties.scope, opties.ruimte, { afgeleverd: nieuwAfgeleverd });
      setOntvangstOverrides(leesLokaleOntvangstOverrides(opties.scope, opties.ruimte));
      setServerGebeurtenissen((lijst) =>
        lijst.map((item) =>
          !item.afgeleverdOp && (nieuwAfgeleverd.includes(item.id) || (item.externeSleutel && nieuwAfgeleverd.includes(item.externeSleutel)))
            ? { ...item, afgeleverdOp: nu }
            : item,
        ),
      );
      for (const sl of nieuwAfgeleverd) wachtAfgeleverdRef.current.add(sl);
      planOntvangstSpoeling();
    },
    [opties.scope, opties.ruimte, planOntvangstSpoeling],
  );

  const registreerGelezenBijZicht = useCallback(
    (g: MeldingEcosysteemGebeurtenis) => {
      const sleutels = [g.id, g.externeSleutel].filter(Boolean);
      if (!sleutels.length) return;
      const alGelezen = Boolean(g.gelezenOp && g.gelezenOp > 0) && g.status !== 'nieuw';
      if (alGelezen) return;
      const nu = Date.now();
      schrijfLokaleOntvangstOverrides(opties.scope, opties.ruimte, { gelezen: sleutels });
      setOntvangstOverrides(leesLokaleOntvangstOverrides(opties.scope, opties.ruimte));
      if (g.status === 'nieuw') {
        schrijfLokaleStatusOverride(opties.scope, opties.ruimte, sleutels, 'gelezen', null);
        setOverrides(leesLokaleStatusOverrides(opties.scope, opties.ruimte));
      }
      setServerGebeurtenissen((lijst) =>
        lijst.map((item) =>
          item.id === g.id || (g.externeSleutel && item.externeSleutel === g.externeSleutel)
            ? {
                ...item,
                status: item.status === 'nieuw' ? 'gelezen' : item.status,
                afgeleverdOp: item.afgeleverdOp || nu,
                gelezenOp: item.gelezenOp || nu,
                bijgewerktOp: nu,
              }
            : item,
        ),
      );
      for (const sl of sleutels) wachtGelezenRef.current.add(sl);
      planOntvangstSpoeling();
    },
    [opties.scope, opties.ruimte, planOntvangstSpoeling],
  );

  useEffect(() => {
    setProfiel(leesLokaalProfiel(opties.scope, opties.ruimte));
    setOverrides(leesLokaleStatusOverrides(opties.scope, opties.ruimte));
    setOntvangstOverrides(leesLokaleOntvangstOverrides(opties.scope, opties.ruimte));
    const luister = (info: { scope: string; ruimte: RuimteType; profiel: MeldingEcosysteemProfiel }) => {
      if (info.scope === opties.scope && info.ruimte === opties.ruimte) {
        setProfiel(info.profiel);
      }
    };
    profielLuisteraars.add(luister);
    return () => {
      profielLuisteraars.delete(luister);
    };
  }, [opties.scope, opties.ruimte]);

  const ruimteRef = useRef<RuimteType>(opties.ruimte);
  ruimteRef.current = opties.ruimte;

  const verversStroom = useCallback(async () => {
    if (!opties.scope || opties.scope === 'anon') return;
    const doelRuimte = opties.ruimte;
    setLaden(true);
    try {
      const r = await api.post('/api/owner/meldingen/ecosysteem/stroom', meldingLichaam({ ruimte: doelRuimte, limiet: 80 }));
      if (ruimteRef.current !== doelRuimte) return;
      if (r.data?.ruimte && r.data.ruimte !== doelRuimte) return;
      if (Array.isArray(r.data?.gebeurtenissen)) {
        const lijst = r.data.gebeurtenissen.map((x: Record<string, unknown>) => normaliseerGebeurtenis(x));
        setServerGebeurtenissen(lijst);
        // Події реально доставлені по мережі у клієнтську шину сповіщень цього користувача (✓):
        const ongeregistreerd = lijst.filter((g: MeldingEcosysteemGebeurtenis) => !g.afgeleverdOp);
        if (ongeregistreerd.length > 0) {
          registreerAfgeleverd(ongeregistreerd);
        }
      }
    } catch {
      /* працюємо з локальним сховищем та іншими джерелами */
    } finally {
      setLaden(false);
    }
  }, [opties.scope, opties.ruimte, registreerAfgeleverd]);

  const syncVerbindingBewijzen = useCallback(async () => {
    if (!opties.scope || opties.scope === 'anon') return;
    const aantal = await synchroniseerVerbindingBewijzenNaarServer(
      opties.scope,
      (url, data) => api.post(url, data),
      opties.lang,
    );
    if (aantal > 0) {
      void verversStroom();
    }
  }, [opties.scope, opties.lang, verversStroom]);

  useEffect(() => {
    const wegIncidenten = abonneerVerbindingIncidenten((lijst) => {
      setVerbindingIncidenten(lijst);
      if (lijst.some((x) => x.hersteldOp !== null && x.gesynchroniseerdOp === null)) {
        void syncVerbindingBewijzen();
      }
    });
    const bijOnline = () => {
      void syncVerbindingBewijzen();
      void verversStroom();
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('online', bijOnline);
    }
    void syncVerbindingBewijzen();
    return () => {
      wegIncidenten();
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', bijOnline);
      }
    };
  }, [syncVerbindingBewijzen, verversStroom]);

  useEffect(() => {
    let levend = true;
    void haalProfielVanServer(opties.scope, opties.ruimte).then((p) => {
      if (levend) setProfiel(p);
    });
    return () => {
      levend = false;
    };
  }, [opties.scope, opties.ruimte]);

  useEffect(() => {
    if (!opties.actief && !profiel.geometrie.minimalePil) return;
    void verversStroom();
    const t = window.setInterval(() => {
      if (!document.hidden) void verversStroom();
    }, 35_000);
    return () => window.clearInterval(t);
  }, [opties.actief, profiel.geometrie.minimalePil, verversStroom]);

  useEffect(() => {
    if (opties.telVooraf) void verversStroom();
  }, [opties.telVooraf, verversStroom]);

  const werkProfielBij = useCallback(
    (updater: (oud: MeldingEcosysteemProfiel) => MeldingEcosysteemProfiel, directOpslaan = true) => {
      setProfiel((huidig) => {
        const volgende = normaliseerProfiel(updater(huidig), opties.ruimte);
        schrijfLokaalProfiel(opties.scope, opties.ruimte, volgende);
        if (directOpslaan) {
          void bewaarProfielOpServer(opties.scope, opties.ruimte, volgende);
        }
        return volgende;
      });
    },
    [opties.scope, opties.ruimte],
  );

  const slaGeometrieOp = useCallback(
    (geometrie: VensterGeometrie, direct = false) => {
      werkProfielBij((oud) => ({ ...oud, geometrie }), false);
      if (geoTimerRef.current !== undefined) window.clearTimeout(geoTimerRef.current);
      if (direct) {
        const huidig = leesLokaalProfiel(opties.scope, opties.ruimte);
        void bewaarProfielOpServer(opties.scope, opties.ruimte, { ...huidig, geometrie });
        return;
      }
      geoTimerRef.current = window.setTimeout(() => {
        const huidig = leesLokaalProfiel(opties.scope, opties.ruimte);
        void bewaarProfielOpServer(opties.scope, opties.ruimte, { ...huidig, geometrie });
      }, 360);
    },
    [opties.scope, opties.ruimte, werkProfielBij],
  );

  useEffect(() => () => {
    if (geoTimerRef.current !== undefined) window.clearTimeout(geoTimerRef.current);
    if (ontvangstTimerRef.current !== undefined) window.clearTimeout(ontvangstTimerRef.current);
  }, []);

  const wijzigGebeurtenisStatus = useCallback(
    async (g: MeldingEcosysteemGebeurtenis, status: MeldingGebeurtenisStatus, uitstelMinuten?: number) => {
      const nu = Date.now();
      const uitgesteldTot = status === 'uitgesteld' ? nu + (uitstelMinuten || 30) * 60_000 : null;
      const sleutels = [g.id, g.externeSleutel].filter(Boolean);
      schrijfLokaleStatusOverride(opties.scope, opties.ruimte, sleutels, status, uitgesteldTot);
      setOverrides(leesLokaleStatusOverrides(opties.scope, opties.ruimte));
      if (status === 'gelezen' || status === 'opgelost') {
        schrijfLokaleOntvangstOverrides(opties.scope, opties.ruimte, { gelezen: sleutels });
      } else if (status === 'nieuw') {
        schrijfLokaleOntvangstOverrides(opties.scope, opties.ruimte, { wisGelezen: sleutels });
      } else {
        schrijfLokaleOntvangstOverrides(opties.scope, opties.ruimte, { afgeleverd: sleutels });
      }
      setOntvangstOverrides(leesLokaleOntvangstOverrides(opties.scope, opties.ruimte));
      setServerGebeurtenissen((lijst) =>
        lijst.map((item) => (item.id === g.id || (g.externeSleutel && item.externeSleutel === g.externeSleutel)
          ? {
              ...item,
              status,
              uitgesteldTot,
              afgeleverdOp: item.afgeleverdOp || nu,
              gelezenOp:
                status === 'gelezen' || status === 'opgelost'
                  ? item.gelezenOp || nu
                  : status === 'nieuw'
                    ? null
                    : item.gelezenOp,
              bijgewerktOp: nu,
            }
          : item)),
      );
      await voerEcosysteemActieUit({
        scope: opties.scope,
        ruimte: opties.ruimte,
        id: g.id,
        externeSleutel: g.externeSleutel,
        actie: `status:${status}`,
        status,
        kanaal: g.kanaal,
        uitstelMinuten,
      });
    },
    [opties.scope, opties.ruimte],
  );

  const ontledenMetAi = useCallback(
    async (g: MeldingEcosysteemGebeurtenis, modus: 'intern' | 'extern', aanbieder?: string) => {
      const samenvatting = await vraagAiOntledingAan({
        scope: opties.scope,
        ruimte: opties.ruimte,
        gebeurtenis: g,
        lang: opties.lang,
        modus,
        aanbieder,
      });
      setAiCache((oud) => ({ ...oud, [g.id]: samenvatting, ...(g.externeSleutel ? { [g.externeSleutel]: samenvatting } : {}) }));
      return samenvatting;
    },
    [opties.scope, opties.ruimte, opties.lang],
  );

  const stroom = useMemo(
    () =>
      bouwUniformeStroom({
        lang: opties.lang,
        ruimte: opties.ruimte,
        subdomeinNu: opties.subdomeinNu,
        profiel,
        serverGebeurtenissen,
        paginaSignalen: opties.paginaSignalen,
        verbindingIncidenten,
        serverItems: opties.serverItems,
        techItems: opties.techItems,
        localRows: opties.localRows,
        activityEvents: opties.activityEvents,
        activityRead: opties.activityRead,
        overrides,
        ontvangstOverrides,
        aiCache,
        tellers: opties.tellers,
        weg: opties.weg,
        tekstVanServer: opties.tekstVanServer,
        titelVanActiviteit: opties.titelVanActiviteit,
        contextVanActiviteit: opties.contextVanActiviteit,
      }),
    [
      opties.lang,
      opties.ruimte,
      opties.subdomeinNu,
      profiel,
      serverGebeurtenissen,
      opties.paginaSignalen,
      verbindingIncidenten,
      opties.serverItems,
      opties.techItems,
      opties.localRows,
      opties.activityEvents,
      opties.activityRead,
      overrides,
      ontvangstOverrides,
      aiCache,
      opties.tellers,
      opties.weg,
      opties.tekstVanServer,
      opties.titelVanActiviteit,
      opties.contextVanActiviteit,
    ],
  );

  const allesGelezenEcosysteem = useCallback(async () => {
    const sleutels: string[] = [];
    const nu = Date.now();
    for (const item of stroom) {
      if (item.status === 'nieuw') {
        if (item.id) sleutels.push(item.id);
        if (item.externeSleutel) sleutels.push(item.externeSleutel);
      }
    }
    if (sleutels.length) {
      schrijfLokaleStatusOverride(opties.scope, opties.ruimte, sleutels, 'gelezen', null);
      schrijfLokaleOntvangstOverrides(opties.scope, opties.ruimte, { gelezen: sleutels });
      setOverrides(leesLokaleStatusOverrides(opties.scope, opties.ruimte));
      setOntvangstOverrides(leesLokaleOntvangstOverrides(opties.scope, opties.ruimte));
    }
    setServerGebeurtenissen((lijst) =>
      lijst.map((item) =>
        item.status === 'nieuw'
          ? { ...item, status: 'gelezen', afgeleverdOp: item.afgeleverdOp || nu, gelezenOp: item.gelezenOp || nu, bijgewerktOp: nu }
          : item,
      ),
    );
    if (!opties.scope || opties.scope === 'anon') return;
    try {
      await api.post('/api/owner/meldingen/ecosysteem/actie', meldingLichaam({ ruimte: opties.ruimte, actie: 'allesGelezen' }));
    } catch {
      /* локальний стан уже оновлено */
    }
  }, [opties.scope, opties.ruimte, stroom]);

  return {
    profiel,
    stroom,
    laden,
    verversStroom,
    werkProfielBij,
    slaGeometrieOp,
    wijzigGebeurtenisStatus,
    registreerAfgeleverd,
    registreerGelezenBijZicht,
    allesGelezenEcosysteem,
    ontledenMetAi,
  };
}
