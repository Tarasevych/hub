// Meldingen: gedeelde types, de levensduur van de pop-up, en het samenvoegen van herhalingen. Zuiver waar mogelijk, zodat de regels
// zonder browser getest kunnen worden (tests/eenheid/mededeling-ontdubbelen.test.ts).

import type { MeldingType } from '../shared/melding-typen';

export type CanonicalNoticeKind = 'info' | 'success' | 'warning' | 'error';
export type CanonicalNoticeAction = { label: string; onAction: () => void | Promise<void> };
export type CanonicalNoticeDetailIcon = 'scope' | 'query' | 'server' | 'provider' | 'results' | 'durable' | 'request' | 'saved' | 'cursor' | 'duration' | 'accounts' | 'error';
export type CanonicalNoticeDetail = { icon: CanonicalNoticeDetailIcon; label: string; value: string };
export type CanonicalNoticeSection = { title: string; items: CanonicalNoticeDetail[] };

export type CanonicalNoticeInput = {
  text: string;
  kind?: CanonicalNoticeKind;
  source?: string;
  action?: CanonicalNoticeAction;
  retain?: boolean;
  transient?: boolean;
  link?: { href: string; label: string };
  dedupeSeconds?: number;
  actionExpiresAt?: number;
  details?: CanonicalNoticeSection[];
  /** Uitleg in gewone taal: wat de oorzaak is en wat de gebruiker nu kan doen. */
  explain?: string;
  /** Onderwerp van de actie (bv. dienst|soort|onderwerp). Een latere gelukte melding met hetzelfde onderwerp lost de eerdere mislukte op. */
  topic?: string;
  /** INTEG-001: over WIE of WAT het gaat (account, app, apparaat, bestand) — één korte regel boven de titel. Alleen wat de bron echt weet. */
  context?: string;
  /**
   * INTEG-001: bij een tijdelijke melding (activiteit, server) de id van dezelfde regel in het paneel («a:<id>», «s:<id>»): de pop-up
   * telt dan als gelezen voor die regel, en «Очистити» in de pop-up ruimt die regel op. Zonder dit verscheen de activiteit na de pop-up
   * nog eens als «нова» in het paneel.
   */
  meldingId?: string;
  /** Het type (voorkeuren per type) als de bron het al weet; anders volgt het uit `source` (shared/melding-soorten.ts typeVanBron). */
  type?: MeldingType;
  /** Voorbeeld uit «Типи сповіщень»: altijd tonen (geen samenvoegen), niet bewaren. */
  voorbeeld?: boolean;
};

/* `ruimte` (20.10.2026): de gegevenslade van de melding zoals de server haar vaststelde ('prive' ook voor oude rijen zonder veld); ontbreekt het veld, dan beslist shared/meldingen-ruimte.ts op soort en link. */
export type CanonicalServerNotification = {
  id: string;
  kind: string;
  title: string;
  message: string;
  createdAt: number;
  read?: boolean;
  link?: string;
  ruimte?: 'prive' | 'technisch';
  /** 22.10.2026: paneel (shared/meldingen-soorten.ts, 0107) — de server levert alleen de sfeer van dit tabblad. */
  sfeer?: 'prive' | 'technisch';
};

const canonicalNoticeActionRegistry = new Map<string, CanonicalNoticeAction>();
export const registerCanonicalNoticeAction = (id: string, action: CanonicalNoticeAction) => { if (id) canonicalNoticeActionRegistry.set(id, action); };
export const resolveCanonicalNoticeAction = (id: string) => canonicalNoticeActionRegistry.get(id);
export const releaseCanonicalNoticeAction = (id: string) => { if (id) canonicalNoticeActionRegistry.delete(id); };

export const CANONICAL_NOTICE_EVENT = 'tsv:canonical-notice';
/** INTEG-001: opent het meldingenpaneel aan de bel (bv. «Усі сповіщення» in het venster bij een stip in het menu). */
export const MELDINGEN_OPENEN_EVENT = 'tsv:meldingen-openen';
const RECENT_KEY = 'tsv:notice-recent-v1';
const TAB_KEY = 'tsv:notice-tab-v1';

/* ---------- Dubbele meldingen tussen tabbladen ---------- */

type RecentRij = { t: number; tab: string };

/** Eigen id van dit tabblad (sessionStorage is per tabblad). Zonder opslag: leeg, dan geldt alles als één tabblad. */
const eigenTab = (): string => {
  try {
    const bestaand = sessionStorage.getItem(TAB_KEY);
    if (bestaand) return bestaand;
    const nieuw = Math.random().toString(36).slice(2, 10);
    sessionStorage.setItem(TAB_KEY, nieuw);
    return nieuw;
  } catch {
    return '';
  }
};

/** Leest de recent-lijst; oude waarden (zonder tabblad) tellen als verlopen of als eigen tabblad. */
const leesRecent = (): Record<string, RecentRij> => {
  const ruw = JSON.parse(localStorage.getItem(RECENT_KEY) || '{}') as Record<string, unknown>;
  const uit: Record<string, RecentRij> = {};
  for (const [sleutel, waarde] of Object.entries(ruw)) {
    if (waarde && typeof waarde === 'object' && Number.isFinite(Number((waarde as RecentRij).t))) {
      uit[sleutel] = { t: Number((waarde as RecentRij).t), tab: String((waarde as RecentRij).tab || '') };
    }
  }
  return uit;
};

/**
 * Dezelfde melding (bron + soort + tekst) die een ANDER tabblad al binnen het venster toonde, wordt hier onderdrukt: twee tabbladen geven
 * dan één pop-up. Herhalingen binnen hetzelfde tabblad komen wél door; het meldingencentrum voegt die samen tot één regel met een teller.
 * Meldingen met een knop (actie) worden nooit onderdrukt.
 */
const isAnderTabduplicaat = (notice: CanonicalNoticeInput): boolean => {
  if (notice.action) return false;
  try {
    const ttl = Math.max(5, notice.dedupeSeconds ?? 90) * 1000;
    const now = Date.now();
    const tab = eigenTab();
    const key = `${notice.source || ''}|${notice.kind || 'info'}|${notice.text}`;
    const map = leesRecent();
    for (const k of Object.keys(map)) if (now - map[k].t > 6 * 3600_000) delete map[k];
    const last = map[key];
    const dubbel = Boolean(last && now - last.t < ttl && last.tab !== tab);
    if (!dubbel) map[key] = { t: now, tab };
    const keys = Object.keys(map);
    if (keys.length > 200) for (const k of keys.slice(0, keys.length - 200)) delete map[k];
    localStorage.setItem(RECENT_KEY, JSON.stringify(map));
    return dubbel;
  } catch {
    return false;
  }
};

export const emitCanonicalNotice = (notice: CanonicalNoticeInput) => {
  if (isAnderTabduplicaat(notice)) return;
  window.dispatchEvent(new CustomEvent<CanonicalNoticeInput>(CANONICAL_NOTICE_EVENT, { detail: notice }));
};

/* ---------- Samenvoegen, oplossen en de levensduur van de pop-up ---------- */

/** Herhaling binnen dit venster wordt één regel met een teller (en geen nieuwe pop-up). */
export const SAMENVOEG_MS = 10 * 60_000;

/** Samenvoeg-sleutel: bron, soort en tekst zonder cijfers en leestekens, zodat «Bestand 3 mislukt» en «Bestand 4 mislukt» één regel worden. */
export const samenvoegSleutel = (source: string, kind: string, text: string): string =>
  `${source}|${kind}|${text.toLowerCase().replace(/[\d«»"'“”‘’.,:;!?()[\]{}]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 80)}`;

/** Zoekt een recente regel met dezelfde sleutel die nog niet opgelost is. Een opgeloste fout geeft bij een nieuwe fout een nieuwe regel. */
export function zoekSamenvoeging<T extends { id: string; groep?: string; createdAt: number; opgelost?: boolean }>(
  rijen: readonly T[], groep: string, nu: number, venster: number = SAMENVOEG_MS,
): T | undefined {
  return rijen.find((r) => r.groep === groep && !r.opgelost && nu - r.createdAt <= venster);
}

/**
 * INTEG-001 (klacht eigenaar «сповіщення повторюються, хоча їх уже бачили»): een melding die u al gelezen hebt en die zich binnen dit
 * venster herhaalt, gaat stil op in dezelfde regel (teller +1, nieuwste tijd) — geen nieuwe pop-up en ze wordt NIET weer «нова».
 */
export const GEZIEN_VENSTER_MS = 6 * 3600_000;

/**
 * Waarin een herhaling opgaat: de regel met dezelfde sleutel die nog niet opgelost is — ongelezen binnen het gewone venster, of al
 * gelezen binnen GEZIEN_VENSTER_MS. Een opgeloste fout geeft bij een nieuwe fout een nieuwe regel (echte nieuwe gebeurtenis).
 */
export function samenvoegDoel<T extends { id: string; groep?: string; createdAt: number; opgelost?: boolean; read: boolean }>(
  rijen: readonly T[], groep: string, nu: number, venster: number = SAMENVOEG_MS,
): T | undefined {
  return rijen.find((r) => r.groep === groep && !r.opgelost && nu - r.createdAt <= (r.read ? Math.max(venster, GEZIEN_VENSTER_MS) : venster));
}

/**
 * Herhaling samenvoegen: teller +1 en de nieuwste tijd. De gelezen-stand blijft zoals hij was. Vroeger zette dit `read: false`, zodat een
 * melding die u al gezien had bij elke herhaling weer als nieuw in de bel telde (oorzaak van «повторюються»).
 */
export function voegHerhalingToe<T extends { id: string; createdAt: number; count?: number }>(rijen: readonly T[], id: string, nu: number): T[] {
  return rijen.map((r) => (r.id === id ? { ...r, count: (r.count ?? 1) + 1, createdAt: nu } : r));
}

/**
 * Eén gebeurtenis, twee bronnen: de dienst meldt zelf «не вдалося …» en een halve minuut later brengt de activiteit van de server
 * (poll elke 10–30 s) dezelfde mislukking. Dat gaf twee pop-ups voor één fout. Binnen BRON_DUBBEL_MS: dezelfde sectie, dezelfde soort
 * (fout of waarschuwing), de ene uit de dienst (blijvend) en de andere uit de server (tijdelijk) → geen tweede pop-up; de regel
 * blijft wel in het paneel.
 */
export type RecentePopup = { sectie: string; kind: CanonicalNoticeKind; transient: boolean; t: number };
export const BRON_DUBBEL_MS = 45_000;
export function isBronDuplicaat(recent: readonly RecentePopup[], nieuw: Omit<RecentePopup, 't'>, nu: number): boolean {
  if (nieuw.kind !== 'error' && nieuw.kind !== 'warning') return false;
  return recent.some((r) => r.sectie === nieuw.sectie && r.kind === nieuw.kind && r.transient !== nieuw.transient && nu - r.t >= 0 && nu - r.t <= BRON_DUBBEL_MS);
}

/** Dezelfde servermelding kan zowel in de gewone als in de technische lijst zitten: per id één keer (eerste wint). */
export function uniekOpId<T extends { id: string }>(lijst: readonly T[]): T[] {
  const gezien = new Set<string>();
  return lijst.filter((x) => (gezien.has(x.id) ? false : (gezien.add(x.id), true)));
}

/** Een gelukte stap lost de eerdere, nog openstaande fouten met hetzelfde onderwerp op: er komt geen melding meer over oud nieuws. */
export function losOpEerdere<T extends { onderwerp?: string; kind: CanonicalNoticeKind; opgelost?: boolean }>(rijen: readonly T[], onderwerp: string): T[] {
  return rijen.map((r) => (r.onderwerp === onderwerp && (r.kind === 'error' || r.kind === 'warning') && !r.opgelost ? { ...r, opgelost: true } : r));
}

/**
 * Hoe lang een pop-up blijft staan: de tijd van het type (null = blijft staan tot u sluit), plus extra tijd voor een lange tekst en een uitleg.
 * INTEG-001: seconden 0 = AUTOMATISCH volgens de soort — «готово» kort, een fout het langst (die moet u kunnen lezen) — en de inhoud.
 */
export type PopupVoorkeur = { vast: boolean; seconden: number };
export const AUTO_SECONDEN: Record<CanonicalNoticeKind, number> = { success: 5, info: 6, warning: 9, error: 12 };
export function popupLevensduurMs(voorkeur: PopupVoorkeur, text: string, explain?: string, kind: CanonicalNoticeKind = 'info'): number | null {
  if (voorkeur.vast) return null;
  const lengte = Math.min(4000, Math.floor(text.length / 60) * 1000);
  const uitleg = explain ? Math.min(6000, 2000 + Math.floor(explain.length / 120) * 1000) : 0;
  const basis = voorkeur.seconden > 0 ? Math.max(3, voorkeur.seconden) : AUTO_SECONDEN[kind] ?? AUTO_SECONDEN.info;
  return basis * 1000 + lengte + uitleg;
}

/** HUB-06: servermeldingen zijn tweetalig opgeslagen («Українська / Nederlands»); toon alleen de taal van de site. Alleen gesplitst als
 * het linkerdeel Cyrillisch bevat en het rechterdeel niet (anders blijft de tekst heel, bv. een pad met « / »). */
export const taalDeel = (tekst: string, lang: 'uk' | 'nl'): string => {
  const t = String(tekst || '');
  const i = t.indexOf(' / ');
  if (i < 0) return t;
  const links = t.slice(0, i).trim(), rechts = t.slice(i + 3).trim();
  /* UI-014: het Nederlandse deel mag Oekraïense NAMEN tussen «» bevatten (bv. het recht «Власник — з пристрою» of een reden); die tellen niet als Cyrillische tekst. Vroeger bleef zo de hele tweetalige tekst staan. */
  const rechtsZonderNamen = rechts.replace(/«[^»]*»/g, '');
  if (!links || !rechts || !/[Ѐ-ӿ]/.test(links) || /[Ѐ-ӿ]/.test(rechtsZonderNamen)) return t;
  return lang === 'uk' ? links : rechts;
};
export const meldingInTaal = <T extends { title: string; message: string }>(m: T, lang: 'uk' | 'nl'): T => ({ ...m, title: taalDeel(m.title, lang), message: taalDeel(m.message, lang) });
