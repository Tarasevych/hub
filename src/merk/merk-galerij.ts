// Галерея «Логотипи сервісів» (REESTR-LOGO-001, 16.11.2026). Павло: «перконайся, що в цю галерею входять всі логотипи, згадані на
// сайті». Тому список збирається не з однієї таблиці, а з УСІХ каталогів, де сайт показує логотип сервісу: реєстр знаків, підключення,
// пошта, агенти ШІ, сховища, календар, нотатки, способи входу, браузери й системи. Тест-сторож merk-galerij-volledig-20261116
// перевіряє, що кожен згаданий ключ є в галереї; новий каталог із логотипами треба додати сюди (і в тест).
// De galerij bevat elk merk dat de site ergens toont: alle catalogi, niet één tabel. Puur (geen React, geen DOM).
import { merkSleutel, type MerkTabel } from './merk-register';

export type GalerijRij = { sleutel: string; naam: string };
/** Een catalogus die merken noemt: [sleutel in het register, naam zoals de site hem toont]. */
export type GalerijBron = { bron: string; merken: ReadonlyArray<readonly [string, string]> };

/** Namen voor merken die alleen een officieel bestand hebben (geen vorm in merk-tabel.ts en in geen catalogus met naam). */
export const OFFICIEEL_NAMEN: Readonly<Record<string, string>> = {
  telegram: 'Telegram', discord: 'Discord', whatsapp: 'WhatsApp', dropbox: 'Dropbox', googledrive: 'Google Drive', googlekeep: 'Google Keep',
  // PLAATS-TEKENS-001 (17.11.2026): виробники пристроїв і знак passkey у сповіщеннях про вхід.
  lenovo: 'Lenovo', dell: 'Dell', hp: 'HP', asus: 'ASUS', acer: 'Acer', xiaomi: 'Xiaomi', passkey: 'Passkey',
  // Емблема «Мережа» (17.11.2026): VPN, хостинги й датацентри.
  mullvad: 'Mullvad VPN', nordvpn: 'NordVPN', protonvpn: 'Proton VPN', expressvpn: 'ExpressVPN', surfshark: 'Surfshark',
  akamai: 'Akamai (Linode)', contabo: 'Contabo', gcore: 'G-Core Labs', scaleway: 'Scaleway', vultr: 'Vultr',
};

/** Browsers en besturingssystemen die «Сеанси» en «Пристрої» tonen (src/sessies/SessieIconen.tsx → browserMerk / osMerk). */
export const SESSIE_MERKEN = ['chrome', 'edge', 'firefox', 'opera', 'brave', 'vivaldi', 'samsung', 'duckduckgo', 'safari', 'windows', 'apple', 'android', 'ubuntu', 'linux'] as const;

/**
 * Zuiver: de galerij uit het register en de catalogi. Eén rij per merk (aliassen opgelost); de naam uit het register gaat vóór,
 * daarna de eerste catalogus die het merk noemt. Categorie-iconen (`lijn`: REST API, IMAP …) zijn geen merk en blijven weg.
 */
export function galerijUit(merken: MerkTabel, officieel: Iterable<string>, bronnen: readonly GalerijBron[]): GalerijRij[] {
  const uit = new Map<string, string>();
  const zet = (ruw: string, naam: string) => {
    const k = merkSleutel(ruw);
    if (!k || merken[k]?.lijn || uit.has(k)) return;
    uit.set(k, merken[k]?.naam || naam || OFFICIEEL_NAMEN[k] || k);
  };
  for (const [k, d] of Object.entries(merken)) zet(k, d.naam);
  for (const b of bronnen) for (const [k, naam] of b.merken) zet(k, naam);
  for (const k of officieel) zet(k, OFFICIEEL_NAMEN[k] || '');
  return [...uit].map(([sleutel, naam]) => ({ sleutel, naam })).sort((a, b) => a.naam.localeCompare(b.naam));
}

/** Alle catalogi met merken (lui: eigen bundelstukken, pas als de galerij opengaat). */
export async function galerijBronnen(): Promise<GalerijBron[]> {
  const [integ, mail, agenten, cloud, agenda, notities, vnext] = await Promise.all([
    import('../../shared/integraties-catalogus'), import('../../shared/mail-aanbieders'), import('../../shared/connector-v2/agenten'),
    import('../../shared/cloud-vnext-model'), import('../../shared/agenda-catalogus'), import('../../shared/notities-model'),
    import('../../shared/notities-vnext-model'),
  ]);
  const { PROVIDERS } = await import('../../shared/provider-teken');
  const paar = <T,>(lijst: readonly T[], k: (x: T) => string | undefined, n: (x: T) => string) =>
    lijst.flatMap((x) => { const s = k(x); return s ? [[s, n(x)] as const] : []; });
  return [
    { bron: 'пошта', merken: paar(mail.MAIL_AANBIEDERS, (x) => x.merk, (x) => x.naam) },
    { bron: 'підключення', merken: paar(integ.INTEGRATIES, (x) => x.logo, (x) => x.naam) },
    { bron: 'агенти ШІ', merken: paar(agenten.V2_AGENTEN, (x) => x.slug, (x) => x.naam) },
    { bron: 'сховища', merken: paar(cloud.CLOUD_VNEXT_AANBIEDERS, (x) => x.merk, (x) => x.naam) },
    { bron: 'календар', merken: paar(agenda.AGENDA_AANBIEDERS, (x) => x.logo, (x) => x.naam) },
    // «markdown» is een bestandsformaat, geen dienst: daar blijft de letter staan.
    { bron: 'нотатки', merken: paar(notities.NOTITIE_APPS, (x) => (x.logo === 'markdown' ? '' : x.logo), (x) => x.naam) },
    { bron: 'джерела нотаток', merken: paar(vnext.NOTITIE_BRONNEN, (x) => x.merk, (x) => x.naam) },
    { bron: 'способи входу', merken: [['github', 'GitHub'], ['apple', 'Apple'], ['microsoft', 'Microsoft'], ['google', 'Google'], ['telegram', 'Telegram'], ['discord', 'Discord']] },
    { bron: 'сеанси', merken: SESSIE_MERKEN.map((k) => [k, ''] as const) },
    // PLAATS-TEKENS-001: провайдери в сповіщеннях про вхід (shared/provider-teken.ts).
    { bron: 'провайдери', merken: PROVIDERS.filter((p) => !p.zonderLogo).map((p) => [p.sleutel, p.naam] as const) },
  ];
}

/** De galerij zoals «Логотипи сервісів» hem toont. */
export async function laadGalerij(): Promise<GalerijRij[]> {
  const [{ MERKEN }, { OFFICIEEL_SLEUTELS }, bronnen] = await Promise.all([import('./merk-tabel'), import('./officieel-sleutels'), galerijBronnen()]);
  return galerijUit(MERKEN, OFFICIEEL_SLEUTELS, bronnen);
}
