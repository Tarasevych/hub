// «Створювати зображення» (21.10.2026) — de LOKALE generator van de eigenaar, BYOS: er gaat geen prompt en geen afbeelding naar
// een cloud. De eigenaar start zelf een generator op zijn eigen machine of in zijn lokale netwerk (bv. een geïsoleerde container
// met de HTTP-API van AUTOMATIC1111/Forge/SD.Next, of een OpenAI-compatibele lokale server zoals LocalAI of stable-diffusion.cpp)
// en zet het adres op de site (admin → Інтеграції → Майстер → «Локальний генератор зображень»). De site praat daarna alleen met
// DAT adres, op vaste paden, en alleen als dat adres loopback of een privénetwerk is.
//
// Waarom zo streng (SSRF): het adres is een instelling van de beheerder, maar de server zelf maakt de verbinding. Een adres dat
// naar de metadata-dienst van een cloud (169.254.169.254), naar het internet, of naar een beheerpoort op de server zelf
// (Docker-API, Caddy-admin, Postgres) wijst, mag NOOIT werken — ook niet via een DNS-naam die later anders antwoordt: de server
// zoekt de naam op, controleert ELK adres, en verbindt met precies het gecontroleerde adres (backend/media-generator.ts).
// Puur (geen Node, geen DOM): dezelfde regels voor de server, het instellingenscherm en de test.

export type GeneratorSoort = 'a1111' | 'openai';
export const GENERATOR_SOORTEN: readonly GeneratorSoort[] = Object.freeze(['a1111', 'openai']);
export const GENERATOR_SOORT_TEKST: Readonly<Record<GeneratorSoort, { uk: string; nl: string; pad: string }>> = Object.freeze({
  a1111: { uk: 'AUTOMATIC1111 / Forge / SD.Next (HTTP API)', nl: 'AUTOMATIC1111 / Forge / SD.Next (HTTP-API)', pad: '/sdapi/v1/txt2img' },
  openai: { uk: 'OpenAI-сумісний локальний сервер (LocalAI, stable-diffusion.cpp)', nl: 'OpenAI-compatibele lokale server (LocalAI, stable-diffusion.cpp)', pad: '/v1/images/generations' },
});

export type GeneratorInstelling = {
  aan: boolean;
  /** Basisadres, bv. http://127.0.0.1:7860 of http://192.168.1.20:8080 (zonder query, zonder gebruikersnaam). */
  url: string;
  soort: GeneratorSoort;
  /** Optionele modelnaam (A1111: checkpoint; OpenAI-compatibel: «model»). */
  model: string;
  /** Hoogstens zoveel seconden wachten op één afbeelding (de AI-aanroep zelf wacht korter en vraagt daarna het resultaat op). */
  timeoutS: number;
  /** Grootste zijde in pixels. */
  maxZijde: number;
  stappen: number;
};
export const STANDAARD_GENERATOR: GeneratorInstelling = Object.freeze({ aan: false, url: '', soort: 'a1111', model: '', timeoutS: 300, maxZijde: 1024, stappen: 25 }) as GeneratorInstelling;

/** Poorten die nooit een beeldgenerator zijn en waar een verzoek van de server schade kan doen (beheer-API's, databases, mail). */
export const VERBODEN_POORTEN: ReadonlySet<number> = new Set([0, 22, 23, 25, 53, 110, 111, 135, 139, 143, 389, 445, 465, 587, 636, 993, 995,
  2019, 2049, 2375, 2376, 2379, 2380, 3306, 4243, 5432, 5984, 6379, 6443, 9200, 9300, 10250, 10255, 11211, 27017, 27018]);

const ipv4Getal = (ip: string): number | null => {
  const d = ip.split('.');
  if (d.length !== 4 || d.some((x) => !/^\d{1,3}$/.test(x) || Number(x) > 255)) return null;
  return d.reduce((s, x) => s * 256 + Number(x), 0);
};
const inBereik = (g: number, basis: string, bits: number) => { const b = ipv4Getal(basis)!; const masker = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0; return ((g & masker) >>> 0) === ((b & masker) >>> 0); };

/**
 * Is dit IP-adres toegestaan als doel? JA: loopback (127.0.0.0/8, ::1) en privénetwerken (10/8, 172.16/12, 192.168/16, fc00::/7).
 * NEE: alles op het internet, link-local (169.254/16 = metadata van clouds, fe80::/10), 0.0.0.0/8, multicast, CGNAT, broadcast.
 * IPv4 in IPv6 (::ffff:a.b.c.d) wordt eerst uitgepakt.
 */
export function adresToegestaan(ipIn: string): boolean {
  let ip = String(ipIn || '').trim().toLowerCase().replace(/^\[|\]$/g, '');
  const gemapt = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(ip);
  if (gemapt) ip = gemapt[1];
  const g = ipv4Getal(ip);
  if (g !== null) {
    if (inBereik(g, '169.254.0.0', 16) || inBereik(g, '0.0.0.0', 8) || inBereik(g, '224.0.0.0', 4) || inBereik(g, '240.0.0.0', 4)) return false;
    return inBereik(g, '127.0.0.0', 8) || inBereik(g, '10.0.0.0', 8) || inBereik(g, '172.16.0.0', 12) || inBereik(g, '192.168.0.0', 16);
  }
  if (!ip.includes(':')) return false;
  if (ip === '::1' || ip === '0:0:0:0:0:0:0:1') return true;
  const eerste = parseInt(ip.split(':')[0] || '0', 16);
  if (!Number.isFinite(eerste)) return false;
  // fc00::/7 (unique local) wel; fe80::/10 (link-local), ff00::/8 (multicast), :: en de rest niet.
  return (eerste & 0xfe00) === 0xfc00;
}

export type AdresOordeel = { ok: true; protocol: 'http:' | 'https:'; host: string; poort: number; pad: string; isIp: boolean } | { ok: false; code: string };
/** Controle van het basisadres zelf (vóór de DNS): schema, geen inloggegevens, geen query, een toegestane poort. */
export function leesGeneratorUrl(raw: unknown): AdresOordeel {
  const s = String(raw ?? '').trim();
  if (!s || s.length > 300) return { ok: false, code: 'MEDIA_GENERATOR_URL_ONGELDIG' };
  let u: URL;
  try { u = new URL(s); } catch { return { ok: false, code: 'MEDIA_GENERATOR_URL_ONGELDIG' }; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return { ok: false, code: 'MEDIA_GENERATOR_URL_ONGELDIG' };
  if (u.username || u.password || u.search || u.hash) return { ok: false, code: 'MEDIA_GENERATOR_URL_ONGELDIG' };
  const poort = u.port ? Number(u.port) : u.protocol === 'https:' ? 443 : 80;
  if (!Number.isInteger(poort) || poort < 1 || poort > 65535 || VERBODEN_POORTEN.has(poort)) return { ok: false, code: 'MEDIA_GENERATOR_POORT_VERBODEN' };
  const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  const isIp = ipv4Getal(host) !== null || host.includes(':');
  if (isIp && !adresToegestaan(host)) return { ok: false, code: 'MEDIA_GENERATOR_ADRES_VERBODEN' };
  if (!isIp && !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/.test(host)) return { ok: false, code: 'MEDIA_GENERATOR_URL_ONGELDIG' };
  const pad = u.pathname.replace(/\/+$/, '');
  if (pad.includes('..')) return { ok: false, code: 'MEDIA_GENERATOR_URL_ONGELDIG' };
  return { ok: true, protocol: u.protocol as 'http:' | 'https:', host, poort, pad, isIp };
}

/** Wat de beheerder in het formulier zet → een geldige instelling, of een foutcode. */
export function normaliseerGenerator(raw: unknown): { ok: true; instelling: GeneratorInstelling } | { ok: false; code: string } {
  const r = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const aan = r.aan === true;
  const url = String(r.url ?? '').trim();
  if (aan || url) { const o = leesGeneratorUrl(url); if (!o.ok) return { ok: false, code: o.code }; }
  const soort = (GENERATOR_SOORTEN as readonly string[]).includes(String(r.soort)) ? r.soort as GeneratorSoort : 'a1111';
  const model = String(r.model ?? '').trim();
  if (model.length > 200 || /[\u0000-\u001f]/.test(model)) return { ok: false, code: 'MEDIA_GENERATOR_MODEL_ONGELDIG' };
  const getal = (v: unknown, min: number, max: number, std: number) => { const n = Math.floor(Number(v)); return Number.isFinite(n) && n >= min && n <= max ? n : std; };
  return { ok: true, instelling: { aan, url, soort, model, timeoutS: getal(r.timeoutS, 10, 900, STANDAARD_GENERATOR.timeoutS), maxZijde: getal(r.maxZijde, 256, 2048, STANDAARD_GENERATOR.maxZijde), stappen: getal(r.stappen, 1, 150, STANDAARD_GENERATOR.stappen) } };
}

/** Herkent het beeldformaat aan de eerste bytes (nooit aan wat de generator BEWEERT). */
export function beeldSoort(b: Uint8Array): 'image/png' | 'image/jpeg' | 'image/webp' | null {
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length > 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  return null;
}

/** Foutcodes van de generator → eerlijke tekst (uk + nl) voor het scherm én voor de AI (die geeft hem door aan de mens). */
export const GENERATOR_CODES: Readonly<Record<string, readonly [string, string]>> = Object.freeze({
  MEDIA_GENERATOR_NIET_INGESTELD: ['Локальний генератор зображень ще не налаштовано. Запустіть його на своєму сервері або в локальній мережі (наприклад, ізольований контейнер з HTTP API AUTOMATIC1111 чи OpenAI-сумісним API) і вкажіть адресу: admin → Інтеграції → Майстер підключень → «Локальний генератор зображень». Жодна хмара не використовується.', 'De lokale afbeeldingsgenerator is nog niet ingesteld. Start hem op uw eigen server of in uw lokale netwerk (bv. een geïsoleerde container met de HTTP-API van AUTOMATIC1111 of een OpenAI-compatibele API) en vul het adres in: admin → Integraties → Koppelwizard → «Lokale afbeeldingsgenerator». Er wordt geen cloud gebruikt.'],
  MEDIA_GENERATOR_UIT: ['Локальний генератор зображень вимкнено адміністратором.', 'De lokale afbeeldingsgenerator is door de beheerder uitgezet.'],
  MEDIA_GENERATOR_URL_ONGELDIG: ['Адреса генератора неправильна: потрібна http(s)-адреса без логіна, параметрів і фрагмента.', 'Het adres van de generator is ongeldig: een http(s)-adres zonder login, parameters of fragment.'],
  MEDIA_GENERATOR_POORT_VERBODEN: ['Цей порт заборонено: на ньому зазвичай працюють служби керування чи бази даних, а не генератор.', 'Deze poort is verboden: daar draaien meestal beheerdiensten of databases, geen generator.'],
  MEDIA_GENERATOR_ADRES_VERBODEN: ['Адреса поза дозволеними: лише loopback (127.0.0.1, ::1) або приватна мережа (10.x, 172.16–31.x, 192.168.x, fc00::/7). Інтернет і службові адреси хмар заборонено.', 'Adres buiten het toegestane: alleen loopback (127.0.0.1, ::1) of een privénetwerk (10.x, 172.16–31.x, 192.168.x, fc00::/7). Internet en dienstadressen van clouds zijn verboden.'],
  MEDIA_GENERATOR_DNS: ['Назву хоста генератора не вдалося знайти в DNS.', 'De hostnaam van de generator werd niet gevonden in DNS.'],
  MEDIA_GENERATOR_ONBEREIKBAAR: ['Генератор не відповідає за цією адресою. Перевірте, що контейнер запущено і порт відкрито для сервера.', 'De generator antwoordt niet op dit adres. Controleer of de container draait en de poort voor de server open staat.'],
  MEDIA_GENERATOR_TIJD: ['Генератор не встиг за відведений час. Спробуйте менший розмір або менше кроків.', 'De generator was niet op tijd klaar. Probeer een kleiner formaat of minder stappen.'],
  MEDIA_GENERATOR_ANTWOORD: ['Генератор відповів, але без зображення у відомому форматі (PNG, JPEG, WebP).', 'De generator antwoordde, maar zonder afbeelding in een bekend formaat (PNG, JPEG, WebP).'],
  MEDIA_GENERATOR_FOUT: ['Генератор повернув помилку; код у деталях.', 'De generator gaf een fout; de code staat in de details.'],
  MEDIA_GENERATOR_TE_GROOT: ['Зображення завелике для хмари (понад 6 МБ). Зменште розмір.', 'De afbeelding is te groot voor de cloud (meer dan 6 MB). Kies een kleiner formaat.'],
  MEDIA_GENERATOR_OMLEIDING: ['Генератор намагався перенаправити запит на іншу адресу; сервер таке не виконує.', 'De generator probeerde het verzoek naar een ander adres om te leiden; de server doet dat niet.'],
  MEDIA_GENERATOR_OK: ['Генератор відповідає за цією адресою.', 'De generator antwoordt op dit adres.'],
});
export const generatorTekst = (code: string, taal: 'uk' | 'nl'): string => { const t = GENERATOR_CODES[code]; return t ? t[taal === 'uk' ? 0 : 1] : code; };
