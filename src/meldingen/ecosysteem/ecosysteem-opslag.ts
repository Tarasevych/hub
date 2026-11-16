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

// MELDINGEN-UX-001: de keuze «компактна панель / плаваюче вікно» staat in de accountvoorkeuren (zijbalk `meldingen.paneel`,
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

/** Реактивна підписка на поточний режим панелі сповіщень (плаваюче вікно чи компактна панель) між вкладками, піддоменами й компонентами. */
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

export async function haalProfielVanServer(scope: string, ruimte: RuimteType): Promise<MeldingEcosysteemProfiel> {
  if (!scope || scope === 'anon') return leesLokaalProfiel(scope, ruimte);
  try {
    const r = await api.post('/api/owner/meldingen/ecosysteem/profiel', meldingLichaam({ ruimte }));
    if (r.data?.profiel) {
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
    if (r.data?.profiel) {
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
  serverGebeurtenissen: MeldingEcosysteemGebeurtenis[];
  paginaSignalen: PaginaSignaal[];
  serverItems: CanonicalServerNotification[];
  techItems: CanonicalServerNotification[];
  localRows: BewaardeRij[];
  activityEvents: ActivityEvent[];
  activityRead: Set<string>;
  overrides?: Record<string, { status: MeldingGebeurtenisStatus; op: number; uitgesteldTot?: number | null }>;
  aiCache?: Record<string, MeldingAiSamenvatting>;
  tekstVanServer?: (s: CanonicalServerNotification) => { title: string; message: string };
  titelVanActiviteit?: (ev: ActivityEvent) => string;
  contextVanActiviteit?: (ev: ActivityEvent) => string;
};

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

/** Об’єднує всі 5 джерел подій сайту, сторінок, сервера та агентів в єдиний дедуплікований потік без дублів. */
export function bouwUniformeStroom(invoer: UniformeStroomInvoer): MeldingEcosysteemGebeurtenis[] {
  const nl = invoer.lang === 'nl';
  const result = new Map<string, MeldingEcosysteemGebeurtenis>();

  const voegToe = (g: MeldingEcosysteemGebeurtenis) => {
    const sleutel = g.externeSleutel || g.id;
    const bestaand = result.get(sleutel);
    const ov = invoer.overrides?.[g.id] || (g.externeSleutel ? invoer.overrides?.[g.externeSleutel] : undefined);
    const ai = g.aiSamenvatting || invoer.aiCache?.[g.id] || (g.externeSleutel ? invoer.aiCache?.[g.externeSleutel] : undefined) || null;
    let status = ov?.status ?? g.status;
    let uitgesteldTot = ov?.uitgesteldTot ?? g.uitgesteldTot;
    if (status === 'uitgesteld' && uitgesteldTot && uitgesteldTot <= Date.now()) {
      status = 'nieuw';
      uitgesteldTot = null;
    }
    const verrijkt: MeldingEcosysteemGebeurtenis = {
      ...g,
      status,
      uitgesteldTot,
      aiSamenvatting: ai,
    };
    if (!bestaand || verrijkt.bijgewerktOp >= bestaand.bijgewerktOp) {
      result.set(sleutel, verrijkt);
    }
  };

  // 1. Події з серверної таблиці екосистеми (ПК-агент, розширення, ШІ, пошта, сховище, веб)
  for (const g of invoer.serverGebeurtenissen) {
    if (g.ruimte !== invoer.ruimte) continue;
    voegToe(g);
  }

  // 2. Живі сигнали поточних сторінок та інформаційних смуг (мережа, оновлення сайту/розширення, ключ-сейф, простори)
  for (const sig of invoer.paginaSignalen) {
    if (!sig.actief) continue;
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
    voegToe(geb);
  }

  // 3. Серверні сповіщення (site_notifications + techItems)
  const serverSamengesteld = invoer.ruimte === 'technisch'
    ? [...invoer.techItems, ...invoer.serverItems.filter((s) => s.ruimte === 'technisch')]
    : invoer.serverItems.filter((s) => (s.ruimte ?? 'prive') === 'prive');

  for (const s of serverSamengesteld) {
    const sl = `site_notif:${s.id}`;
    const tekst = invoer.tekstVanServer ? invoer.tekstVanServer(s) : { title: s.title, message: s.message };
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
        meta: { serverId: s.id },
      },
      invoer.ruimte,
    );
    voegToe(geb);
  }

  // 4. Активності підключень, агентів і ШІ (activity.events)
  for (const ev of invoer.activityEvents) {
    const titel = invoer.titelVanActiviteit ? invoer.titelVanActiviteit(ev) : (ev.tool || ev.doel || ev.subject || ev.type || ev.kind);
    const ctx = invoer.contextVanActiviteit ? invoer.contextVanActiviteit(ev) : (ev.subject || '');
    const sl = `act:${ev.id}`;
    const details = [ev.reden, ev.eind, ev.code].filter(Boolean).join(' · ') || ev.doel || ev.subject || '';
    const geb = interpreteerGebeurtenis(
      {
        id: `a:${ev.id}`,
        externeSleutel: sl,
        ruimte: invoer.ruimte,
        bron: `${ev.source || 'agent'} ${ev.kind} ${ev.type}`.trim(),
        soort: ev.status === 'failed' ? 'error' : ev.status,
        ernst: ev.status === 'failed' ? 'fout' : 'info',
        titel,
        bericht: details,
        contextLabel: ctx,
        aangemaaktOp: ev.finishedAt || ev.createdAt,
        gelezen: invoer.activityRead.has(ev.id),
        meta: {
          activiteitId: ev.id,
          ...(ev.client ? { client: ev.client } : {}),
          ...(ev.platform ? { platform: ev.platform } : {}),
        },
      },
      invoer.ruimte,
    );
    voegToe(geb);
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
    voegToe(geb);
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
  paginaSignalen: PaginaSignaal[];
  serverItems: CanonicalServerNotification[];
  techItems: CanonicalServerNotification[];
  localRows: BewaardeRij[];
  activityEvents: ActivityEvent[];
  activityRead: Set<string>;
  tekstVanServer?: (s: CanonicalServerNotification) => { title: string; message: string };
  titelVanActiviteit?: (ev: ActivityEvent) => string;
  contextVanActiviteit?: (ev: ActivityEvent) => string;
}) {
  const [profiel, setProfiel] = useState<MeldingEcosysteemProfiel>(() => leesLokaalProfiel(opties.scope, opties.ruimte));
  const [serverGebeurtenissen, setServerGebeurtenissen] = useState<MeldingEcosysteemGebeurtenis[]>([]);
  const [overrides, setOverrides] = useState(() => leesLokaleStatusOverrides(opties.scope, opties.ruimte));
  const [aiCache, setAiCache] = useState<Record<string, MeldingAiSamenvatting>>({});
  const [laden, setLaden] = useState(false);
  const geoTimerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    setProfiel(leesLokaalProfiel(opties.scope, opties.ruimte));
    setOverrides(leesLokaleStatusOverrides(opties.scope, opties.ruimte));
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

  const verversStroom = useCallback(async () => {
    if (!opties.scope || opties.scope === 'anon') return;
    setLaden(true);
    try {
      const r = await api.post('/api/owner/meldingen/ecosysteem/stroom', meldingLichaam({ ruimte: opties.ruimte, limiet: 80 }));
      if (Array.isArray(r.data?.gebeurtenissen)) {
        setServerGebeurtenissen(r.data.gebeurtenissen.map((x: Record<string, unknown>) => normaliseerGebeurtenis(x)));
      }
    } catch {
      /* працюємо з локальним сховищем та іншими джерелами */
    } finally {
      setLaden(false);
    }
  }, [opties.scope, opties.ruimte]);

  useEffect(() => {
    void haalProfielVanServer(opties.scope, opties.ruimte).then(setProfiel);
  }, [opties.scope, opties.ruimte]);

  useEffect(() => {
    if (!opties.actief && !profiel.geometrie.minimalePil) return;
    void verversStroom();
    const t = window.setInterval(() => {
      if (!document.hidden) void verversStroom();
    }, 35_000);
    return () => window.clearInterval(t);
  }, [opties.actief, profiel.geometrie.minimalePil, verversStroom]);

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
  }, []);

  const wijzigGebeurtenisStatus = useCallback(
    async (g: MeldingEcosysteemGebeurtenis, status: MeldingGebeurtenisStatus, uitstelMinuten?: number) => {
      const uitgesteldTot = status === 'uitgesteld' ? Date.now() + (uitstelMinuten || 30) * 60_000 : null;
      const sleutels = [g.id, g.externeSleutel].filter(Boolean);
      schrijfLokaleStatusOverride(opties.scope, opties.ruimte, sleutels, status, uitgesteldTot);
      setOverrides(leesLokaleStatusOverrides(opties.scope, opties.ruimte));
      setServerGebeurtenissen((lijst) =>
        lijst.map((item) => (item.id === g.id || (g.externeSleutel && item.externeSleutel === g.externeSleutel)
          ? { ...item, status, uitgesteldTot, bijgewerktOp: Date.now() }
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
        serverGebeurtenissen,
        paginaSignalen: opties.paginaSignalen,
        serverItems: opties.serverItems,
        techItems: opties.techItems,
        localRows: opties.localRows,
        activityEvents: opties.activityEvents,
        activityRead: opties.activityRead,
        overrides,
        aiCache,
        tekstVanServer: opties.tekstVanServer,
        titelVanActiviteit: opties.titelVanActiviteit,
        contextVanActiviteit: opties.contextVanActiviteit,
      }),
    [
      opties.lang,
      opties.ruimte,
      opties.subdomeinNu,
      serverGebeurtenissen,
      opties.paginaSignalen,
      opties.serverItems,
      opties.techItems,
      opties.localRows,
      opties.activityEvents,
      opties.activityRead,
      overrides,
      aiCache,
      opties.tekstVanServer,
      opties.titelVanActiviteit,
      opties.contextVanActiviteit,
    ],
  );

  return {
    profiel,
    stroom,
    laden,
    verversStroom,
    werkProfielBij,
    slaGeometrieOp,
    wijzigGebeurtenisStatus,
    ontledenMetAi,
  };
}
