// Zuivere regels van de snelle mailbox-wisselaar (avatar rechtsboven in de lijst en de knop «Змінити акаунт»). Geen React, geen DOM.
//
// WAAROM (klacht van de eigenaar, 15.11.2026, telefoon, mail.…/postvak-in): «хоч ми підключили ще один акаунт іншого сервісу,
// в цьому списку чомусь лише відображається перший … і список не поновлюється».
// BEWEZEN OORZAAK (tests/eenheid/mail-wisselaar-20261115.test.ts, deel «ДО»):
//   • De wisselaar kreeg alleen de Google-snapshot (/google-suite/accounts) en /accounts/list (alleen Microsoft-rijen). IMAP-
//     koppelingen (Ukr.net, I.ua, iCloud, Yahoo, Proton …) staan in een DERDE bron (/imap/aanbieders) die de mailpagina nooit
//     vroeg — die hadden dus geen enkele kans om in het menu te verschijnen.
//   • De lijst werd één keer geladen. «Додати акаунт» opent /accounts met een volle navigatie; terug (Android Chrome) haalt de
//     pagina uit de bfcache met de OUDE lijst. Nu: verversen bij openen van het menu, bij terugkeer naar het tabblad en bij
//     een bericht van het koppelvenster/de accountpagina (BroadcastChannel + storage-gebeurtenis).
// Українською: перемикач тепер бачить усі три джерела (Google, Microsoft, IMAP) і оновлюється без перезавантаження сторінки.
import { mailAanbieder, type MailImapKoppelingPubliek } from '../../shared/mail-aanbieders';

export type Taal = 'uk' | 'nl';
const t = (taal: Taal, uk: string, nl: string) => (taal === 'nl' ? nl : uk);

export type WisselGoogle = { id: string; email: string; displayName?: string; picture?: string; accountRole?: 'primary' | 'additional' | string };
export type WisselConnector = { id: string; provider: string; email: string; status: string };
export type WisselRij = {
  sleutel: string;
  soort: 'google' | 'microsoft' | 'imap';
  id: string;
  email: string;
  titel: string;
  /** Naam van de dienst (Gmail, Outlook, Ukr.net …) */
  dienst: string;
  /** Sleutel in het merkregister (voor het logo) */
  merk: string;
  picture: string;
  hoofd: boolean;
  /** Kan de lijst van deze mailbox hier direct getoond worden? (Google en — sinds MAIL-IMAP-LEZEN-001 — IMAP; Microsoft opent het beheer) */
  kiesbaar: boolean;
  /** Korte stand onder het adres */
  stand: string;
  /** Vraagt deze koppeling een handeling (opnieuw aanmelden, fout)? */
  aandacht: boolean;
};

const UIT = new Set(['revoked', 'disconnected']);
const sleutelVan = (email: string) => String(email || '').trim().toLowerCase();

/**
 * Eén lijst voor het menu, in vaste volgorde: hoofd-Gmail, extra Gmail, dan Microsoft, dan IMAP (per dienst, op adres).
 * Hetzelfde adres komt NOOIT twee keer voor (bv. Gmail via Google én via IMAP): de rij die de mail hier kan tonen wint.
 */
export function wisselRijen(o: { taal: Taal; google: readonly WisselGoogle[]; connectors: readonly WisselConnector[]; imap: readonly MailImapKoppelingPubliek[] }): WisselRij[] {
  const { taal } = o;
  const gezien = new Set<string>();
  const uit: WisselRij[] = [];
  const gmail = mailAanbieder('gmail'), outlook = mailAanbieder('outlook');
  const google = [...o.google].sort((a, b) => Number(b.accountRole === 'primary') - Number(a.accountRole === 'primary'));
  for (const a of google) {
    const k = sleutelVan(a.email);
    if (!k || gezien.has(k)) continue;
    gezien.add(k);
    uit.push({
      sleutel: `google:${a.id}`, soort: 'google', id: a.id, email: a.email, titel: a.displayName || a.email, dienst: gmail?.naam || 'Gmail',
      merk: gmail?.merk || 'gmail', picture: a.picture || '', hoofd: a.accountRole === 'primary', kiesbaar: true,
      stand: a.accountRole === 'primary' ? t(taal, 'основний', 'primair') : 'Gmail', aandacht: false,
    });
  }
  for (const c of o.connectors) {
    const k = sleutelVan(c.email);
    if (!k || gezien.has(k) || UIT.has(c.status)) continue;
    // Google-rijen van /accounts/list zonder Google-snapshot horen niet in de wisselaar: die zijn niet (meer) leesbaar.
    if (c.provider !== 'microsoft') continue;
    gezien.add(k);
    const werkt = c.status === 'connected' || c.status === 'initial_sync';
    uit.push({
      sleutel: `microsoft:${c.id}`, soort: 'microsoft', id: c.id, email: c.email, titel: c.email, dienst: outlook?.naam || 'Outlook',
      merk: outlook?.merk || 'microsoftoutlook', picture: '', hoofd: false, kiesbaar: false,
      stand: werkt ? `${outlook?.naam || 'Outlook'} · ${t(taal, 'підключено', 'gekoppeld')}` : `${outlook?.naam || 'Outlook'} · ${t(taal, 'потрібна дія', 'actie nodig')}`,
      aandacht: !werkt,
    });
  }
  const imap = [...o.imap].filter((k) => k.actief !== false).sort((a, b) => (a.aanbieder + a.adres).localeCompare(b.aanbieder + b.adres));
  for (const m of imap) {
    const k = sleutelVan(m.adres);
    if (!k || gezien.has(k)) continue;
    gezien.add(k);
    const d = mailAanbieder(m.aanbieder);
    const naam = d?.naam || m.aanbieder || 'IMAP';
    uit.push({
      sleutel: `imap:${m.id}`, soort: 'imap', id: m.id, email: m.adres, titel: m.adres, dienst: naam, merk: d?.merk || m.aanbieder,
      picture: '', hoofd: false, kiesbaar: true,
      stand: m.fout ? `${naam} · ${t(taal, 'потрібна дія', 'actie nodig')}` : `${naam} · ${t(taal, 'підключено', 'gekoppeld')}`,
      aandacht: Boolean(m.fout),
    });
  }
  return uit;
}

/** Uitleg (tooltip) bij een rij die hier nog niet geopend kan worden: wat er gebeurt bij een klik. */
export function wisselUitleg(r: WisselRij, taal: Taal): string {
  if (r.kiesbaar && r.aandacht) return t(taal, `Показати листи ${r.email}. Підключення потребує дії: якщо сервіс відмовить, кнопка «Керувати підключенням» відкриє сторінку акаунтів`, `De berichten van ${r.email} tonen. De koppeling vraagt een handeling: weigert de dienst, dan opent de knop «Koppeling beheren» de accountpagina`);
  if (r.kiesbaar) return t(taal, `Показати листи ${r.email} у цьому списку`, `De berichten van ${r.email} in deze lijst tonen`);
  if (r.aandacht) return t(taal, `${r.dienst}: підключення потребує дії — відкриється сторінка акаунтів`, `${r.dienst}: de koppeling vraagt een handeling — de accountpagina opent`);
  return t(taal, `${r.dienst}: листи цієї скриньки поки не показуються в цьому списку — відкриється сторінка акаунтів`, `${r.dienst}: berichten van deze mailbox worden nog niet in deze lijst getoond — de accountpagina opent`);
}

// ------------------------------------------------------------------------------------------------ verversen zonder herladen
/** Naam van het kanaal waarmee het koppelvenster en de accountpagina «er is iets veranderd» melden. */
export const MAIL_ACCOUNTS_KANAAL = 'mijn-ruimte-mail-accounts';
const OPSLAG_SLEUTEL = 'mijn-ruimte:mail-accounts-gewijzigd';

/** Melden dat er een mailbox is bij- of afgekoppeld. BroadcastChannel bereikt elke andere instantie (ook in hetzelfde tabblad);
 *  localStorage is de terugval voor oudere browsers (alleen andere tabbladen). Nooit adressen of geheimen. */
export function meldMailAccountsGewijzigd(): void {
  const stempel = String(Date.now());
  try { const k = new BroadcastChannel(MAIL_ACCOUNTS_KANAAL); k.postMessage({ soort: 'gewijzigd', op: stempel }); k.close(); } catch { /* geen BroadcastChannel */ }
  try { localStorage.setItem(OPSLAG_SLEUTEL, stempel); } catch { /* privé-venster */ }
}

/** Luisteren naar elke reden om de lijst te verversen. Geeft een opruimfunctie terug. */
export function luisterMailAccounts(ververs: () => void): () => void {
  let kanaal: BroadcastChannel | null = null;
  try { kanaal = new BroadcastChannel(MAIL_ACCOUNTS_KANAAL); kanaal.onmessage = () => ververs(); } catch { kanaal = null; }
  const opslag = (e: StorageEvent) => { if (e.key === OPSLAG_SLEUTEL) ververs(); };
  // Terug uit de bfcache (Android Chrome «terug» na /accounts) of terug naar het tabblad.
  const toon = (e: PageTransitionEvent) => { if (e.persisted) ververs(); };
  const zicht = () => { if (document.visibilityState === 'visible') ververs(); };
  window.addEventListener('storage', opslag);
  window.addEventListener('pageshow', toon);
  document.addEventListener('visibilitychange', zicht);
  return () => {
    try { kanaal?.close(); } catch { /* al dicht */ }
    window.removeEventListener('storage', opslag);
    window.removeEventListener('pageshow', toon);
    document.removeEventListener('visibilitychange', zicht);
  };
}
