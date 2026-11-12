// TELEGRAM-AANMELDEN v1 — wijzigingsdetectie en conflictregels (puur, getest in tests/eenheid/telegram-wijziging.test.ts).
//
// Regels van de eigenaar (punt C):
//  1. telegramId anders            → VERVALSING: weigeren, loggen, beheer alarmeren (de koppeling zelf blijft ongemoeid).
//  2. telefoon anders              → GEBLOKKEERD tot volledig opnieuw koppelen (nieuw eigen contact + toegangssleutel).
//  3. gebruikersnaam/naam/foto     → GEPAUZEERD tot bevestiging met toegangssleutel op de site.
//  4. nieuw apparaat               → bevestiging (zelfde weg als 3).
//  5. «Ні, не я» waar dan ook wint van elk «Так» (het veiligere antwoord wint): koppeling uit, sessies eruit, apparaat
//     geblokkeerd, conflictuitleg tonen, rood alarm naar beheer.
//  6. Een «Так» in Telegram markeert alleen «gezien»; ALLEEN een toegangssleutel op de site bevestigt.
//  7. Geen antwoord binnen de termijn → koppeling uit; alleen opnieuw koppelen vanaf nul.
import type { KoppelStand, Vingerafdruk, VingerafdrukVeld } from './model';
import { VINGERAFDRUK_VELDEN } from './model';

export type WijzigingErnst = 'vervalsing' | 'ernstig' | 'gewoon';
export type VeldVerschil = { veld: VingerafdrukVeld; oud: string; nieuw: string };

export const normaliseerTelefoon = (v: unknown): string => {
  const s = String(v ?? '').replace(/[^\d+]/g, '');
  if (!s) return '';
  return s.startsWith('+') ? `+${s.slice(1).replace(/\+/g, '')}` : `+${s.replace(/\+/g, '')}`;
};

export function verschillen(oud: Vingerafdruk, nieuw: Partial<Vingerafdruk>): VeldVerschil[] {
  const uit: VeldVerschil[] = [];
  for (const veld of VINGERAFDRUK_VELDEN) {
    if (!(veld in nieuw) || nieuw[veld] === undefined) continue; // niet meegeleverd = niet vergelijkbaar, geen wijziging
    const a = veld === 'telefoon' ? normaliseerTelefoon(oud[veld]) : String(oud[veld] ?? '');
    const b = veld === 'telefoon' ? normaliseerTelefoon(nieuw[veld]) : String(nieuw[veld] ?? '');
    if (veld === 'gebruikersnaam' ? a.toLowerCase() !== b.toLowerCase() : a !== b) uit.push({ veld, oud: a, nieuw: b });
  }
  return uit;
}

export function ernstVan(v: VeldVerschil[]): WijzigingErnst | null {
  if (!v.length) return null;
  if (v.some((x) => x.veld === 'telegramId')) return 'vervalsing';
  if (v.some((x) => x.veld === 'telefoon')) return 'ernstig';
  return 'gewoon';
}

/** Welke stand de koppeling krijgt na een gedetecteerde wijziging (vervalsing raakt de koppeling niet: het verzoek wordt geweigerd). */
export function standNaWijziging(huidig: KoppelStand, ernst: WijzigingErnst | null): KoppelStand {
  if (huidig === 'uitgeschakeld') return 'uitgeschakeld';
  if (!ernst || ernst === 'vervalsing') return huidig;
  if (ernst === 'ernstig') return 'geblokkeerd';
  return huidig === 'geblokkeerd' ? 'geblokkeerd' : 'gepauzeerd';
}

export type Antwoord = 'ja' | 'nee';
export type AntwoordBron = 'telegram' | 'site';
export type WijzigingStatus = 'open' | 'gezien' | 'bevestigd' | 'geweigerd' | 'verlopen';
export type WijzigingToestand = {
  status: WijzigingStatus;
  ernst: WijzigingErnst;
  telegramAntwoord: Antwoord | null;
  siteAntwoord: Antwoord | null;
  /** waar: een «Так» en een «Ні» kwamen uit verschillende bronnen → conflictuitleg tonen (Telegram mogelijk gekaapt). */
  conflict: boolean;
};

export type AntwoordGevolg = {
  toestand: WijzigingToestand;
  koppelStand: KoppelStand;
  /** wat de server nu moet doen */
  acties: Array<'sessies-beeindigen' | 'apparaat-blokkeren' | 'alarm-beheer' | 'melden-eigenaar' | 'vingerafdruk-opslaan' | 'opnieuw-koppelen-vereist'>;
};

/**
 * Verwerkt één antwoord. `metPasskey` mag ALLEEN waar zijn als de server net een verse bevestiging met toegangssleutel op deze sessie zag.
 * Een eindtoestand (bevestigd, geweigerd, verlopen) verandert alleen nog door een «nee» (veiliger) — nooit terug naar «ja».
 */
export function antwoordVerwerken(t: WijzigingToestand, huidigeStand: KoppelStand, bron: AntwoordBron, antwoord: Antwoord, metPasskey: boolean): AntwoordGevolg {
  const volgende: WijzigingToestand = { ...t, telegramAntwoord: bron === 'telegram' ? (t.telegramAntwoord === 'nee' ? 'nee' : antwoord) : t.telegramAntwoord, siteAntwoord: bron === 'site' ? (t.siteAntwoord === 'nee' ? 'nee' : antwoord) : t.siteAntwoord };
  volgende.conflict = (volgende.telegramAntwoord === 'ja' && volgende.siteAntwoord === 'nee') || (volgende.telegramAntwoord === 'nee' && volgende.siteAntwoord === 'ja') || t.conflict;

  if (antwoord === 'nee') {
    // Het veiligere antwoord wint ALTIJD, ook na een eerdere bevestiging.
    volgende.status = 'geweigerd';
    return { toestand: volgende, koppelStand: 'uitgeschakeld', acties: ['sessies-beeindigen', 'apparaat-blokkeren', 'alarm-beheer', 'melden-eigenaar', 'opnieuw-koppelen-vereist'] };
  }
  if (t.status === 'geweigerd' || t.status === 'verlopen') return { toestand: { ...volgende, status: t.status }, koppelStand: 'uitgeschakeld', acties: [] };
  if (t.status === 'bevestigd') return { toestand: volgende, koppelStand: huidigeStand, acties: [] };
  if (bron === 'telegram') {
    // Telegram kan gekaapt zijn: alleen «gezien».
    volgende.status = 'gezien';
    return { toestand: volgende, koppelStand: huidigeStand, acties: [] };
  }
  // Site, «ja»:
  if (!metPasskey) return { toestand: { ...volgende, siteAntwoord: t.siteAntwoord }, koppelStand: huidigeStand, acties: [] };
  if (t.ernst === 'ernstig') {
    // Telefoon gewijzigd: een toegangssleutel alleen is niet genoeg — opnieuw koppelen met een nieuw gedeeld contact.
    volgende.status = 'bevestigd';
    return { toestand: volgende, koppelStand: 'geblokkeerd', acties: ['opnieuw-koppelen-vereist'] };
  }
  if (t.ernst === 'vervalsing') return { toestand: { ...volgende, status: 'geweigerd' }, koppelStand: huidigeStand, acties: ['alarm-beheer'] };
  volgende.status = 'bevestigd';
  return { toestand: volgende, koppelStand: huidigeStand === 'gepauzeerd' ? 'actief' : huidigeStand, acties: ['vingerafdruk-opslaan'] };
}

/** Termijn verstreken zonder bevestiging → koppeling uit. */
export function verlopenVerwerken(t: WijzigingToestand, nuMs: number, aangemaaktMs: number, termijnUren: number): AntwoordGevolg | null {
  if (t.status !== 'open' && t.status !== 'gezien') return null;
  if (nuMs - aangemaaktMs < termijnUren * 3600_000) return null;
  return { toestand: { ...t, status: 'verlopen' }, koppelStand: 'uitgeschakeld', acties: ['melden-eigenaar', 'opnieuw-koppelen-vereist'] };
}

/** Markeert per teken wat verschilt tussen oud en nieuw (voor de rode markering «+31 6 1234 5678 → +31 6 1234 5679»). */
export function tekenVerschil(oud: string, nieuw: string): Array<{ teken: string; anders: boolean }> {
  const a = [...oud], b = [...nieuw];
  return b.map((teken, i) => ({ teken, anders: a[i] !== teken }));
}

/** De aftelduur die de server afdwingt (seconden) voor een bevestiging van deze ernst. */
export function aftelVoor(ernst: WijzigingErnst, gewoon: number, ernstig: number): number {
  return ernst === 'gewoon' ? gewoon : ernstig;
}
/** Server-side: een bevestiging die sneller kwam dan het aftellen sinds het tonen, telt niet (automatisch klikken). */
export function snelGenoegGeweigerd(getoondOpMs: number, nuMs: number, seconden: number): boolean {
  return !getoondOpMs || nuMs - getoondOpMs < seconden * 1000 - 250;
}
