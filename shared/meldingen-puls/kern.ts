// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// РОЗУМНЕ ЯДРО «ПУЛЬТА УВАГИ, СПОКОЮ ТА ДІЇ» · SLIMME KERN VAN DE AANDACHTS-, RUST- EN ACTIEPULS (MELDPANEEL-002)
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// Чистий клієнтобезпечний модуль без вбудованих залежностей Node.js (сумісний із переглядачем, сервером і тестами).
// Поєднує єдиний реєстр подій (shared/meldingen-catalogus.ts), візуальні якорі логотипів (src/merk/), склеювання
// причинно-наслідкових ланцюжків, розумне умовне відкладення, 15-секундне спокійне зведення, радіус дії мандата ШІ,
// непідробну печатку походження ядра «Плющ», живу капсулу перебігу, повагу спливних вікон до потоку набору та навчання тиші.

import {
  KNOPPEN_PER_NIVEAU,
  MELDINGEN,
  MELDING_SCHEMAS,
  type MeldingNiveau,
  type MeldingSchemaId,
} from '../meldingen-catalogus';
import type {
  MeldingBijlage,
  MeldingEcosysteemGebeurtenis,
  MeldingKanaal,
  MeldingSubdomein,
} from '../meldingen-ecosysteem/model';

export type Taal = 'uk' | 'nl';

export type PulsKleurToon =
  | 'gevaar'
  | 'besluit'
  | 'oorzaak'
  | 'post'
  | 'wolk'
  | 'agenda'
  | 'ai'
  | 'beveiliging'
  | 'huis'
  | 'code'
  | 'systeem';

export type PulsIcoonSoort =
  | 'schild-alarm'
  | 'schild-ok'
  | 'sleutel'
  | 'post'
  | 'wolk'
  | 'agenda'
  | 'ai'
  | 'keten'
  | 'huis'
  | 'code'
  | 'laptop'
  | 'puzzel'
  | 'systeem'
  | 'bel';

export type PulsVisueelAnker = {
  /** Ключ офіційного логотипа в єдиному реєстрі src/merk/ (лише коли бренд достовірно відомий, без здогадок). */
  merkSleutel: string | null;
  /** Семантична векторна піктограма (для внутрішніх служб або резервного чипа поруч із логотипом). */
  icoon: PulsIcoonSoort;
  /** Стриманий семантичний колірний тон для швидкого периферійного сприйняття. */
  toon: PulsKleurToon;
  /** Короткий зрозумілий підпис джерела людською мовою (без сирих технічних кодів). */
  label: string;
};

export type PulsBestandAnker = {
  icoon: 'tabel' | 'pdf' | 'beeld' | 'geluid' | 'video' | 'verschil' | 'agenda' | 'kaart' | 'code' | 'archief' | 'bestand';
  toon: 'smaragd' | 'koraal' | 'hemel' | 'paars' | 'amber' | 'indigo' | 'teal' | 'leisteen';
  kortLabel: string;
};

export type PulsEmbleemPaar = {
  vraag: string;
  waarde: string;
};

export type PulsMandaatStraal = {
  agentNaam: string;
  merkSleutel: string | null;
  welToegestaan: string;
  verbodenDoorMandaat: string;
  duurOpties: ReadonlyArray<{ id: 'eenmalig' | '15m'; label: string }>;
};

export type PulsKaartVerrijking = {
  niveau: MeldingNiveau;
  schemaId: MeldingSchemaId;
  schemaNaam: string;
  anker: PulsVisueelAnker;
  klimopKernZegel: boolean;
  emblemen: PulsEmbleemPaar[];
  gevolgHint: string;
  knoppenPaar: readonly [string, string] | null;
  mandaat: PulsMandaatStraal | null;
  eersteVerschijningTekst: string | null;
  laatsteVerschijningTekst: string | null;
  duurTekst: string | null;
};

export type OorzaakGevolgDienst = {
  id: string;
  gebeurtenisId: string;
  label: string;
  merkSleutel: string | null;
  icoon: PulsIcoonSoort;
  toon: PulsKleurToon;
  herstelTekst: string;
  aantal?: number;
};

export type PulsOorzaakKeten = {
  sleutel: string;
  wortel: MeldingEcosysteemGebeurtenis;
  wortelTitel: string;
  samenvatting: string;
  gevolgen: OorzaakGevolgDienst[];
  alleIds: string[];
};

export type PulsStroomEenheid =
  | { soort: 'los'; gebeurtenis: MeldingEcosysteemGebeurtenis }
  | { soort: 'keten'; keten: PulsOorzaakKeten };

export type PulsRustigOverzicht = {
  toon: boolean;
  aandachtIds: string[];
  geschatteSeconden: number;
  mensenIds: string[];
  achtergrondKlaarIds: string[];
  titel: string;
  subtitel: string;
  actieLabel: string;
};

export type VoorwaardelijkUitstelSoort =
  | 'op_computer'
  | 'bij_onderdeel'
  | 'na_taak'
  | 'morgen_09'
  | '30m'
  | '60m';

export type VoorwaardelijkUitstelRegel = {
  gebeurtenisId: string;
  soort: VoorwaardelijkUitstelSoort;
  aangemaaktOp: number;
  doelSubdomein?: MeldingSubdomein;
  verlooptOp?: number;
};

export type VoorwaardeContext = {
  nu: number;
  schermBreedte: number;
  isAanraakScherm: boolean;
  subdomeinNu: MeldingSubdomein;
  heeftRecentSuccesSignaal: boolean;
};

export type LiveVoortgangPilInfo = {
  id: string;
  label: string;
  procent: number | null;
  tijdTekst: string;
  merkSleutel: string | null;
  icoon: PulsIcoonSoort;
};

export type SlimmeStilteSuggestie = {
  bronSleutel: string;
  bronLabel: string;
  merkSleutel: string | null;
  icoon: PulsIcoonSoort;
  aantalKeer: number;
  vraagTekst: string;
};

const BEKENDE_MERKEN: ReadonlyArray<{ re: RegExp; merk: string; naam: string; toon: PulsKleurToon; icoon: PulsIcoonSoort }> = [
  { re: /\bclaude(?:\s+code|\s+opus|\s+sonnet|\s+haiku)?\b/i, merk: 'claude', naam: 'Claude', toon: 'ai', icoon: 'ai' },
  { re: /\b(?:chatgpt|openai|gpt-6)\b/i, merk: 'openai', naam: 'ChatGPT', toon: 'ai', icoon: 'ai' },
  { re: /\bcodex\b/i, merk: 'codex', naam: 'Codex', toon: 'ai', icoon: 'ai' },
  { re: /\bgemini\b/i, merk: 'gemini', naam: 'Gemini', toon: 'ai', icoon: 'ai' },
  { re: /\bgrok\b/i, merk: 'grok', naam: 'Grok', toon: 'ai', icoon: 'ai' },
  { re: /\bantigravity\b/i, merk: 'antigravity', naam: 'Antigravity', toon: 'ai', icoon: 'ai' },
  { re: /\bautoclaw\b/i, merk: 'autoclaw', naam: 'AutoClaw', toon: 'ai', icoon: 'ai' },
  { re: /\b(?:microsoft\s*365\s*copilot|mscopilot|copilot\s*studio)\b/i, merk: 'mscopilot', naam: 'Microsoft Copilot', toon: 'ai', icoon: 'ai' },
  { re: /\b(?:github\s*)?copilot\b/i, merk: 'copilot', naam: 'GitHub Copilot', toon: 'ai', icoon: 'ai' },
  { re: /\bcursor\b/i, merk: 'cursor', naam: 'Cursor', toon: 'ai', icoon: 'ai' },
  { re: /\bwindsurf\b/i, merk: 'windsurf', naam: 'Windsurf', toon: 'ai', icoon: 'ai' },
  { re: /\bcline\b/i, merk: 'cline', naam: 'Cline', toon: 'ai', icoon: 'ai' },
  { re: /\bdevin\b/i, merk: 'devin', naam: 'Devin', toon: 'ai', icoon: 'ai' },
  { re: /\bopencode\b/i, merk: 'opencode', naam: 'OpenCode', toon: 'ai', icoon: 'ai' },
  { re: /\btelegram\b/i, merk: 'telegram', naam: 'Telegram', toon: 'beveiliging', icoon: 'schild-ok' },
  { re: /\b(?:onedrive|microsoftonedrive)\b/i, merk: 'microsoftonedrive', naam: 'OneDrive', toon: 'wolk', icoon: 'wolk' },
  { re: /\bhome\s*assistant\b/i, merk: 'homeassistant', naam: 'Home Assistant', toon: 'huis', icoon: 'huis' },
  { re: /\bgithub\b/i, merk: 'github', naam: 'GitHub', toon: 'code', icoon: 'code' },
  { re: /\bgmail\b/i, merk: 'gmail', naam: 'Gmail', toon: 'post', icoon: 'post' },
  { re: /\b(?:google\s*drive|googledrive)\b/i, merk: 'googledrive', naam: 'Google Диск', toon: 'wolk', icoon: 'wolk' },
  { re: /\bgoogle\b/i, merk: 'google', naam: 'Google', toon: 'post', icoon: 'post' },
  { re: /\bmicrosoft\b/i, merk: 'microsoft', naam: 'Microsoft', toon: 'wolk', icoon: 'wolk' },
  { re: /\bnextcloud\b/i, merk: 'nextcloud', naam: 'Nextcloud', toon: 'wolk', icoon: 'wolk' },
  { re: /\bdropbox\b/i, merk: 'dropbox', naam: 'Dropbox', toon: 'wolk', icoon: 'wolk' },
  { re: /\bdocker\b/i, merk: 'docker', naam: 'Docker', toon: 'systeem', icoon: 'systeem' },
  { re: /\bcloudflare\b/i, merk: 'cloudflare', naam: 'Cloudflare', toon: 'systeem', icoon: 'systeem' },
];

const KANAAL_ANKERS: Record<MeldingKanaal, { uk: string; nl: string; icoon: PulsIcoonSoort; toon: PulsKleurToon }> = {
  beveiliging: { uk: 'Безпека входу', nl: 'Aanmeldbeveiliging', icoon: 'schild-alarm', toon: 'gevaar' },
  mail: { uk: 'Пошта', nl: 'Post', icoon: 'post', toon: 'post' },
  cloud: { uk: 'Хмара й файли', nl: 'Cloud en bestanden', icoon: 'wolk', toon: 'wolk' },
  ai: { uk: 'Штучний інтелект', nl: 'Kunstmatige intelligentie', icoon: 'ai', toon: 'ai' },
  mcp: { uk: 'З’єднувач ШІ', nl: 'AI-verbinder', icoon: 'sleutel', toon: 'besluit' },
  github: { uk: 'Сховище коду', nl: 'Code-opslagplaats', icoon: 'code', toon: 'code' },
  huis: { uk: 'Розумна оселя', nl: 'Slimme woning', icoon: 'huis', toon: 'huis' },
  pc_agent: { uk: 'Локальний вузол ПК', nl: 'Lokale pc-knoop', icoon: 'laptop', toon: 'systeem' },
  extensie: { uk: 'Розширення переглядача', nl: 'Browserextensie', icoon: 'puzzel', toon: 'systeem' },
  systeem: { uk: 'Система та оновлення', nl: 'Systeem en uitrol', icoon: 'systeem', toon: 'systeem' },
  app: { uk: 'Мій простір', nl: 'Mijn Ruimte', icoon: 'bel', toon: 'systeem' },
  pagina: { uk: 'Стан сторінки', nl: 'Paginastatus', icoon: 'bel', toon: 'systeem' },
};

const SUBDOMEIN_LABELS: Record<MeldingSubdomein, [uk: string, nl: string]> = {
  hub: ['Загальний простір', 'Algemene ruimte'],
  id: ['Обліковий запис і ключі', 'Account en sleutels'],
  ai: ['Простір ШІ', 'AI-ruimte'],
  mail: ['Пошта', 'Post'],
  cloud: ['Хмара й файли', 'Cloud en bestanden'],
  github: ['Сховища GitHub', 'GitHub-opslagplaatsen'],
  huis: ['Розумна оселя', 'Slimme woning'],
  mcp: ['Координація агентів', 'Agentcoördinatie'],
  api: ['Шлюз даних', 'Gegevenspoort'],
  admin: ['Адміністрування', 'Beheer'],
  systeem: ['Система', 'Systeem'],
};

export function subdomeinMenselijkLabel(sub: MeldingSubdomein, lang: Taal): string {
  const paar = SUBDOMEIN_LABELS[sub] || SUBDOMEIN_LABELS.hub;
  return lang === 'nl' ? paar[1] : paar[0];
}

export function kanaalVisueelAnker(kanaal: MeldingKanaal, lang: Taal): PulsVisueelAnker {
  const basis = KANAAL_ANKERS[kanaal] || KANAAL_ANKERS.app;
  const merkSleutel = kanaal === 'github' ? 'github' : null;
  return {
    merkSleutel,
    icoon: basis.icoon,
    toon: basis.toon,
    label: lang === 'nl' ? basis.nl : basis.uk,
  };
}

/**
 * Розпізнає точний візуальний якір (офіційний логотип з src/merk/ + семантичну піктограму + колірний тон).
 * Логотип бренду повертається лише тоді, коли бренд явно згадано у джерелі, метаданих або заголовку.
 */
const EMAIL_ADRES_PATROON = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}/gu;

function zonderEmailAdressen(tekst: string): string {
  return tekst.replace(EMAIL_ADRES_PATROON, ' ');
}

export function herkenMerkEnAnker(
  geb: Pick<MeldingEcosysteemGebeurtenis, 'bron' | 'kanaal' | 'subdomein' | 'titel' | 'contextLabel' | 'prioriteit' | 'meta'> & {
    bericht?: string;
  },
  lang: Taal,
): PulsVisueelAnker {
  const metaProvider = typeof geb.meta?.provider === 'string' ? geb.meta.provider : '';
  const inlogBericht =
    geb.kanaal === 'beveiliging' && /(новий вхід|nieuwe aanmelding|незнайомого пристрою|onbekend apparaat)/i.test(geb.titel)
      ? String(geb.bericht || '')
      : '';
  const zoekTekst = zonderEmailAdressen(`${metaProvider} ${geb.bron} ${geb.titel} ${geb.contextLabel} ${inlogBericht}`);
  const basis = KANAAL_ANKERS[geb.kanaal] || KANAAL_ANKERS.app;

  for (const kandidaat of BEKENDE_MERKEN) {
    if (kandidaat.re.test(zoekTekst)) {
      let merk = kandidaat.merk;
      if (merk === 'google' && geb.kanaal === 'mail') merk = 'gmail';
      else if (merk === 'google' && geb.kanaal === 'cloud') merk = 'googledrive';
      else if (merk === 'gmail' && (geb.kanaal === 'beveiliging' || geb.subdomein === 'id')) merk = 'google';
      const toon: PulsKleurToon =
        geb.prioriteit === 'kritiek' ? 'gevaar' : geb.kanaal === 'beveiliging' ? 'beveiliging' : kandidaat.toon;
      const merkNaam =
        merk === 'googledrive'
          ? lang === 'nl'
            ? 'Google Drive'
            : 'Google Диск'
          : merk === 'google'
            ? 'Google'
            : kandidaat.naam;
      return {
        merkSleutel: merk,
        icoon: kandidaat.icoon,
        toon,
        label: `${merkNaam} · ${lang === 'nl' ? basis.nl : basis.uk}`,
      };
    }
  }

  if (geb.kanaal === 'github' || geb.subdomein === 'github') {
    return {
      merkSleutel: 'github',
      icoon: 'code',
      toon: geb.prioriteit === 'kritiek' ? 'gevaar' : 'code',
      label: lang === 'nl' ? 'GitHub · Code' : 'GitHub · Сховища',
    };
  }

  return {
    merkSleutel: null,
    icoon: basis.icoon,
    toon: geb.prioriteit === 'kritiek' ? 'gevaar' : basis.toon,
    label: lang === 'nl' ? basis.nl : basis.uk,
  };
}

/**
 * Повертає миттєво впізнаваний колірний та піктограмний якір для будь-якого вкладеного файла.
 */
export function bestandVisueelAnker(bijlage: Pick<MeldingBijlage, 'naam' | 'mime'>, lang: Taal = 'uk'): PulsBestandAnker {
  const n = `${bijlage.naam} ${bijlage.mime}`.toLowerCase();
  if (/\.(xlsx|xls|csv|ods)\b|spreadsheet|csv|excel/.test(n)) {
    return { icoon: 'tabel', toon: 'smaragd', kortLabel: /\.csv\b/.test(n) ? 'CSV' : 'XLSX' };
  }
  if (/\.pdf\b|application\/pdf/.test(n)) {
    return { icoon: 'pdf', toon: 'koraal', kortLabel: 'PDF' };
  }
  if (/\.(png|jpg|jpeg|webp|gif|svg|avif)\b|image\//.test(n)) {
    return { icoon: 'beeld', toon: 'hemel', kortLabel: /\.svg\b/.test(n) ? 'SVG' : 'IMG' };
  }
  if (/\.(wav|mp3|ogg|flac|m4a)\b|audio\//.test(n)) {
    return { icoon: 'geluid', toon: 'paars', kortLabel: 'AUD' };
  }
  if (/\.(mp4|webm|mov)\b|video\//.test(n)) {
    return { icoon: 'video', toon: 'indigo', kortLabel: 'VID' };
  }
  if (/\.(diff|patch)\b|x-diff/.test(n)) {
    return { icoon: 'verschil', toon: 'amber', kortLabel: 'DIFF' };
  }
  if (/\.ics\b|calendar/.test(n)) {
    return { icoon: 'agenda', toon: 'amber', kortLabel: 'ICS' };
  }
  if (/\.vcf\b|vcard/.test(n)) {
    return { icoon: 'kaart', toon: 'teal', kortLabel: 'VCF' };
  }
  if (/\.(json|ts|js|sql|yml|yaml|md)\b|application\/json/.test(n)) {
    return { icoon: 'code', toon: 'teal', kortLabel: /\.json\b/.test(n) ? 'JSON' : lang === 'nl' ? 'CODE' : 'КОД' };
  }
  if (/\.(zip|tar|gz|age|7z)\b/.test(n)) {
    return { icoon: 'archief', toon: 'indigo', kortLabel: lang === 'nl' ? 'ARCHIEF' : 'АРХІВ' };
  }
  return { icoon: 'bestand', toon: 'leisteen', kortLabel: lang === 'nl' ? 'BESTAND' : 'ФАЙЛ' };
}

/**
 * Перевіряє, чи подія має достовірне внутрішнє серверне/ядерне походження екосистеми «Плющ»
 * (ніколи не надається зовнішнім листам або неперевіреним вхідним повідомленням).
 */
export function heeftKlimopKernZegel(geb: Pick<MeldingEcosysteemGebeurtenis, 'id' | 'externeSleutel' | 'kanaal' | 'bron' | 'subdomein'>): boolean {
  if (geb.kanaal === 'mail') return false;
  const internId =
    geb.id.startsWith('s:') ||
    geb.id.startsWith('band:sleutelkluis') ||
    geb.id.startsWith('band:nieuwe-versie') ||
    geb.externeSleutel.startsWith('site_notif:');
  if (internId && (geb.kanaal === 'beveiliging' || geb.kanaal === 'systeem' || geb.kanaal === 'mcp' || geb.subdomein === 'id' || geb.subdomein === 'admin')) {
    return true;
  }
  return geb.kanaal === 'beveiliging' && /(sleutelkluis|passkey|apparaat|beveiliging|security|uitrol|klimop)/i.test(`${geb.bron} ${geb.externeSleutel}`);
}

function kiesSchemaEnNiveau(geb: MeldingEcosysteemGebeurtenis): { schemaId: MeldingSchemaId; niveau: MeldingNiveau } {
  const bronSoort = `${geb.bron} ${geb.titel} ${geb.externeSleutel}`.toLowerCase();
  const treffer = MELDINGEN.find(
    (m) =>
      bronSoort.includes(m.id.toLowerCase()) ||
      (m.soort !== '(variabel)' && /[_-]/.test(m.soort) && m.soort.length >= 10 && bronSoort.includes(m.soort.toLowerCase())),
  );
  if (treffer) {
    if (geb.prioriteit === 'kritiek' && treffer.niveau === 'gewoon') {
      return { schemaId: treffer.schema, niveau: 'gevaar' };
    }
    return { schemaId: treffer.schema, niveau: treffer.niveau };
  }

  if (geb.kanaal === 'beveiliging') {
    const volTekst = `${geb.titel} ${geb.bericht}`;
    if (/(зв’язок відновлено|знову працює|verbinding hersteld|werkt weer)/i.test(volTekst) && !/(не працює|werkt niet)/i.test(volTekst)) {
      return { schemaId: 'S15', niveau: 'gewoon' };
    }
    const alAfgerondGoed =
      geb.prioriteit !== 'kritiek' &&
      /(?:\.|_)(?:bevestigd|goedgekeurd|hersteld|gedeblokkeerd|klaar|ingesteld|vertrouwd)(?:\s|$)/i.test(
        `${geb.bron} ${String(geb.meta?.actieCode || '')}`,
      ) &&
      !/(очікує|просить|потрібн|виявлено|заблоковано|відхилено|тривога|помилка|verzoek|wacht|vereist|geweigerd|alarm|mislukt)/i.test(volTekst);
    if (alAfgerondGoed) {
      return { schemaId: 'S1', niveau: 'gewoon' };
    }
    const isBesluit = /(підтверд|запит|дозвол|bevestig|toestemm|verzoek)/i.test(bronSoort) && geb.prioriteit !== 'kritiek';
    return { schemaId: 'S1', niveau: isBesluit ? 'besluit' : 'gevaar' };
  }
  if (geb.kanaal === 'ai' || geb.kanaal === 'mcp') {
    const vraagtBesluit = /(дозвол|запит|просить|ключ|секрет|мандат|toestemm|vraagt|verzoek|wacht)/i.test(bronSoort);
    return { schemaId: vraagtBesluit ? 'S11' : 'S12', niveau: vraagtBesluit ? 'besluit' : 'gewoon' };
  }
  if (/оновлення|випуск|пакунок|uitrol|release|versie/i.test(bronSoort)) {
    return { schemaId: 'S14', niveau: geb.prioriteit === 'kritiek' ? 'gevaar' : 'gewoon' };
  }
  if (/спільн|поділил|доступ до теки|deelde|toegangsverzoek/i.test(bronSoort)) {
    const vraagt = /запит|просить|verzoek|vraagt/i.test(bronSoort);
    return { schemaId: vraagt ? 'S5' : 'S6', niveau: vraagt ? 'besluit' : 'gewoon' };
  }
  if (geb.kanaal === 'cloud') return { schemaId: 'S10', niveau: 'gewoon' };
  if (geb.kanaal === 'mail') return { schemaId: 'S8', niveau: 'gewoon' };
  if (/календар|зустріч|дзвінок|agenda|afspraak/i.test(bronSoort)) return { schemaId: 'S9', niveau: 'gewoon' };
  if (/перевірк|імпорт|синхронізац|пошук|controle|import|synchronisatie/i.test(bronSoort)) return { schemaId: 'S20', niveau: 'gewoon' };
  return {
    schemaId: geb.prioriteit === 'hoog' || geb.prioriteit === 'kritiek' ? 'S19' : 'S13',
    niveau: geb.prioriteit === 'kritiek' ? 'gevaar' : 'gewoon',
  };
}

function korteTijd(ts: number, lang: Taal): string {
  try {
    return new Date(ts).toLocaleTimeString(lang === 'nl' ? 'nl-BE' : 'uk-UA', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function formatDuurKort(ms: number, lang: Taal): string {
  const sec = Math.max(1, Math.round(ms / 1000));
  if (sec < 60) return lang === 'nl' ? `${sec} s` : `${sec} с`;
  const min = Math.floor(sec / 60);
  if (min < 60) return lang === 'nl' ? `${min} min` : `${min} хв`;
  const u = Math.floor(min / 60);
  const restM = min % 60;
  return lang === 'nl'
    ? `${u} u${restM ? ` ${restM} min` : ''}`
    : `${u} год${restM ? ` ${restM} хв` : ''}`;
}

export function berekenMandaatStraal(geb: MeldingEcosysteemGebeurtenis, lang: Taal): PulsMandaatStraal | null {
  const tekst = `${geb.bron} ${geb.titel} ${geb.bericht} ${geb.contextLabel}`;
  const isAiOfMcp =
    geb.kanaal === 'ai' ||
    geb.kanaal === 'mcp' ||
    /\b(claude|gemini|chatgpt|openai|codex|grok|copilot|antigravity|autoclaw|mcp)\b/i.test(tekst);
  const vraagtToestemming = /(дозвол|запит|просить|читання|доступ|мандат|підтверд|toestemm|vraagt|verzoek|lezen|toegang)/i.test(tekst);
  if (!isAiOfMcp || !vraagtToestemming) return null;

  const anker = herkenMerkEnAnker(geb, lang);
  const agentNaam = anker.merkSleutel ? anker.label.split(' · ')[0] : lang === 'nl' ? 'AI-agent' : 'ШІ-агент';

  const welToegestaan =
    lang === 'nl'
      ? `Alleen de gevraagde handeling: ${geb.titel.slice(0, 90)}`
      : `Лише запитана дія в межах завдання: ${geb.titel.slice(0, 90)}`;
  const verbodenDoorMandaat =
    lang === 'nl'
      ? 'Schrijven of wissen buiten dit doel, Sleutelkluis, privéberichten en externe netwerken'
      : 'Запис чи видалення поза цією дією, Сховище ключів, приватні листи й стороння мережа';

  return {
    agentNaam,
    merkSleutel: anker.merkSleutel,
    welToegestaan,
    verbodenDoorMandaat,
    duurOpties: [
      { id: 'eenmalig', label: lang === 'nl' ? 'Slechts 1 keer' : 'Лише 1 раз' },
      { id: '15m', label: lang === 'nl' ? '15 min' : 'На 15 хв' },
    ],
  };
}

/**
 * Збагачує подію всіма даними для швидкого сприйняття: логотип, іконка, тон, печатка «Плюща»,
 * прогресивні значки-питання X4, підпис наслідку дії та радіус дії мандата ШІ.
 */
export function verrijkGebeurtenisVoorPuls(geb: MeldingEcosysteemGebeurtenis, lang: Taal): PulsKaartVerrijking {
  const { schemaId, niveau } = kiesSchemaEnNiveau(geb);
  const schema = MELDING_SCHEMAS[schemaId];
  const anker = herkenMerkEnAnker(geb, lang);
  const klimopKernZegel = heeftKlimopKernZegel(geb);
  const mandaat = berekenMandaatStraal(geb, lang);
  const idx = lang === 'nl' ? 1 : 0;

  const ruweWaarden: string[] = [
    anker.label.split(' · ')[0] || subdomeinMenselijkLabel(geb.subdomein, lang),
    subdomeinMenselijkLabel(geb.subdomein, lang),
    geb.contextLabel || (geb.ruimte === 'technisch' ? (lang === 'nl' ? 'Technische ruimte' : 'Технічний простір') : (lang === 'nl' ? 'Persoonlijke ruimte' : 'Особистий простір')),
    korteTijd(geb.bijgewerktOp, lang) || '—',
    geb.bijlagen.length > 0
      ? `${geb.bijlagen.length} (${bestandVisueelAnker(geb.bijlagen[0], lang).kortLabel})`
      : geb.herhalingen > 1
        ? `×${geb.herhalingen}`
        : (lang === 'nl' ? 'Gecontroleerd' : 'Перевірено'),
    klimopKernZegel
      ? (lang === 'nl' ? 'Klimop-kernzegel' : 'Підпис ядра «Плющ»')
      : geb.status === 'nieuw'
        ? (lang === 'nl' ? 'Nieuw' : 'Нове')
        : (lang === 'nl' ? 'Bijgewerkt' : 'Оновлено'),
  ];

  const emblemen: PulsEmbleemPaar[] = schema.emblemen.map((vraagTekst, i) => ({
    vraag: vraagTekst[idx],
    waarde: ruweWaarden[i] || '—',
  }));

  let gevolgHint: string;
  if (niveau === 'gevaar') {
    gevolgHint =
      lang === 'nl'
        ? '«Dit was ik niet» verbreekt direct de sessie en beschermt uw toegang'
        : '«Це не я» миттєво розірве сеанс і захистить обліковий запис';
  } else if (mandaat) {
    gevolgHint =
      lang === 'nl'
        ? 'Beperkt mandaat zonder paginawissel · direct herroepbaar'
        : 'Обмежений мандат без переходу зі сторінки · можна відкликати в 1 дотик';
  } else if (niveau === 'besluit') {
    gevolgHint =
      lang === 'nl'
        ? 'Wacht op uw keuze · veilig ongedaan te maken met Ctrl+Z'
        : 'Чекає вашого слова · дію можна скасувати за 5 с (Ctrl+Z)';
  } else if (geb.bijlagen.length > 0) {
    gevolgHint =
      lang === 'nl'
        ? 'Geïsoleerde voorvertoning direct in dit paneel zonder pagina te verlaten'
        : 'Ізольований перегляд вкладення прямо тут без покидання сторінки';
  } else {
    gevolgHint = '';
  }

  const knoppenPaar: readonly [string, string] | null =
    niveau === 'gevaar'
      ? [KNOPPEN_PER_NIVEAU.gevaar[0][idx], KNOPPEN_PER_NIVEAU.gevaar[1][idx]]
      : niveau === 'besluit'
        ? [KNOPPEN_PER_NIVEAU.besluit[0][idx], KNOPPEN_PER_NIVEAU.besluit[1][idx]]
        : [schema.knoppen[0][idx], schema.knoppen[1][idx]];

  const heeftGroepDuur = geb.herhalingen > 1 && geb.bijgewerktOp > geb.aangemaaktOp;
  return {
    niveau,
    schemaId,
    schemaNaam: schema.naam[idx],
    anker,
    klimopKernZegel,
    emblemen,
    gevolgHint,
    knoppenPaar,
    mandaat,
    eersteVerschijningTekst: heeftGroepDuur || geb.herhalingen > 1 ? korteTijd(geb.aangemaaktOp, lang) : null,
    laatsteVerschijningTekst: heeftGroepDuur || geb.herhalingen > 1 ? korteTijd(geb.bijgewerktOp, lang) : null,
    duurTekst: heeftGroepDuur ? formatDuurKort(geb.bijgewerktOp - geb.aangemaaktOp, lang) : null,
  };
}

function bepaalOorzaakSleutel(geb: MeldingEcosysteemGebeurtenis, lang: Taal): { sleutel: string; aanbiederLabel: string } | null {
  if (geb.status === 'archief' || geb.status === 'opgelost') return null;
  const volBericht = `${geb.titel} ${geb.bericht}`;
  if (/(зв’язок відновлено|знову працює|verbinding hersteld|werkt weer)/i.test(volBericht) && !/(не працює|werkt niet)/i.test(volBericht)) {
    return null;
  }
  const tekst = zonderEmailAdressen(
    `${geb.bron} ${geb.titel} ${geb.bericht} ${geb.contextLabel} ${String(geb.meta?.provider || '')}`,
  ).toLowerCase();
  const isStoringOfWacht =
    geb.prioriteit === 'hoog' ||
    geb.prioriteit === 'kritiek' ||
    /(не синхроніз|відкликав|увійдіть|помилка|не вдалася|зупинен|немає з’єднання|ключ|mislukt|verlopen|ingetrokken|geen verbinding|fout|storing|geblokkeerd)/i.test(tekst);
  if (!isStoringOfWacht) return null;

  if (/\b(google|gmail|googledrive|google-drive)\b/.test(tekst)) return { sleutel: 'aanbieder:google', aanbiederLabel: 'Google' };
  if (/\b(microsoft|microsoftonedrive|onedrive|outlook)\b/.test(tekst)) return { sleutel: 'aanbieder:microsoft', aanbiederLabel: 'Microsoft' };
  if (/\bgithub\b/.test(tekst)) return { sleutel: 'aanbieder:github', aanbiederLabel: 'GitHub' };
  if (/\btelegram\b/.test(tekst)) return { sleutel: 'aanbieder:telegram', aanbiederLabel: 'Telegram' };
  if (/(мереж|з’єднан|тунел|netwerk|verbinding|offline)/i.test(tekst)) {
    return { sleutel: 'systeem:netwerk', aanbiederLabel: lang === 'nl' ? 'Netwerk' : 'Мережа' };
  }
  return null;
}

/**
 * Групує повторювані дочірні наслідки однієї й тієї самої служби (підрозділ + текст відновлення)
 * в один компактний чип із лічильником «×N», щоб ніколи не виводити десятки однакових рядків поспіль.
 */
export function groepeerOorzaakGevolgen(gevolgen: readonly OorzaakGevolgDienst[]): OorzaakGevolgDienst[] {
  const perDienst = new Map<string, { basisLabel: string; item: OorzaakGevolgDienst; aantal: number }>();
  for (const g of gevolgen) {
    const schoonLabel = g.label.replace(/\s*·\s*×\d+\s*$/, '').trim();
    const sleutel = `${schoonLabel}|${g.herstelTekst}|${g.merkSleutel ?? ''}`;
    const erbij = Math.max(1, Math.trunc(g.aantal ?? 1));
    const bestaand = perDienst.get(sleutel);
    if (bestaand) {
      bestaand.aantal += erbij;
      if (!bestaand.item.merkSleutel && g.merkSleutel) {
        bestaand.item = { ...bestaand.item, merkSleutel: g.merkSleutel };
      }
    } else {
      perDienst.set(sleutel, { basisLabel: schoonLabel, item: g, aantal: erbij });
    }
  }
  const uit: OorzaakGevolgDienst[] = [];
  for (const { basisLabel, item, aantal } of perDienst.values()) {
    uit.push({
      ...item,
      label: aantal > 1 ? `${basisLabel} · ×${aantal}` : basisLabel,
      aantal,
    });
  }
  return uit;
}

function ukVerbondenDienstenVorm(n: number): string {
  const m100 = n % 100;
  const m10 = n % 10;
  if (m100 >= 11 && m100 <= 14) return `${n} пов’язаних служб`;
  if (m10 === 1) return `${n} пов’язану службу`;
  if (m10 >= 2 && m10 <= 4) return `${n} пов’язані служби`;
  return `${n} пов’язаних служб`;
}

/**
 * Об’єднує пов’язані збої одного кореня (наприклад, прострочений вхід Google, через який одночасно
 * зупинилися Пошта, Хмара та задача агента) в один наочний вузол «Першопричина» з логотипами всіх служб.
 */
export function bundelOorzaakKetens(
  stroom: readonly MeldingEcosysteemGebeurtenis[],
  lang: Taal,
): PulsStroomEenheid[] {
  const groepen = new Map<string, { label: string; items: MeldingEcosysteemGebeurtenis[] }>();
  for (const geb of stroom) {
    const k = bepaalOorzaakSleutel(geb, lang);
    if (!k) continue;
    const g = groepen.get(k.sleutel) ?? { label: k.aanbiederLabel, items: [] };
    g.items.push(geb);
    groepen.set(k.sleutel, g);
  }

  const ketenLeden = new Set<string>();
  const ketensOpWortel = new Map<string, PulsOorzaakKeten>();

  for (const [sleutel, groep] of groepen.entries()) {
    const uniekeKanalen = new Set(groep.items.map((x) => `${x.kanaal}:${x.subdomein}`));
    if (groep.items.length < 2 || uniekeKanalen.size < 2) continue;

    const gesorteerd = [...groep.items].sort((a, b) => {
      const aIdBev = a.kanaal === 'beveiliging' || a.subdomein === 'id' ? 0 : 1;
      const bIdBev = b.kanaal === 'beveiliging' || b.subdomein === 'id' ? 0 : 1;
      if (aIdBev !== bIdBev) return aIdBev - bIdBev;
      const aAuth = /(вхід|ключ|відкликав|доступ|aanmeld|toegang|sleutel)/i.test(`${a.titel} ${a.bericht}`) ? 0 : 1;
      const bAuth = /(вхід|ключ|відкликав|доступ|aanmeld|toegang|sleutel)/i.test(`${b.titel} ${b.bericht}`) ? 0 : 1;
      if (aAuth !== bAuth) return aAuth - bAuth;
      return a.aangemaaktOp - b.aangemaaktOp;
    });

    const wortel = gesorteerd[0];
    const ruweGevolgen: OorzaakGevolgDienst[] = gesorteerd.map((item) => {
      const anker = herkenMerkEnAnker(item, lang);
      const kortOnderdeel = subdomeinMenselijkLabel(item.subdomein, lang);
      const herstelTekst =
        item.kanaal === 'ai' || item.kanaal === 'mcp'
          ? (lang === 'nl' ? 'Hervat taak automatisch' : 'Продовжить завдання сама')
          : item.kanaal === 'cloud'
            ? (lang === 'nl' ? 'Synchroniseert op achtergrond' : 'Досинхронізує файли фоново')
            : (lang === 'nl' ? 'Herstelt direct na bevestiging' : 'Відновиться одразу після дії');
      return {
        id: `${sleutel}:${item.id}`,
        gebeurtenisId: item.id,
        label: kortOnderdeel,
        merkSleutel: anker.merkSleutel,
        icoon: anker.icoon,
        toon: anker.toon,
        herstelTekst,
        aantal: 1,
      };
    });
    const gevolgen = groepeerOorzaakGevolgen(ruweGevolgen);

    for (const item of gesorteerd) ketenLeden.add(item.id);
    const nDiensten = gevolgen.length;
    ketensOpWortel.set(wortel.id, {
      sleutel,
      wortel,
      wortelTitel: wortel.titel,
      samenvatting:
        lang === 'nl'
          ? nDiensten === 1
            ? `Oorzaak · 1 handeling herstelt 1 verbonden onderdeel (${groep.label})`
            : `Oorzaak · 1 handeling herstelt ${nDiensten} verbonden onderdelen (${groep.label})`
          : `Першопричина · 1 дія автоматично відновить ${ukVerbondenDienstenVorm(nDiensten)} (${groep.label})`,
      gevolgen,
      alleIds: gesorteerd.map((x) => x.id),
    });
  }

  const resultaat: PulsStroomEenheid[] = [];
  for (const geb of stroom) {
    const keten = ketensOpWortel.get(geb.id);
    if (keten) {
      resultaat.push({ soort: 'keten', keten });
    } else if (!ketenLeden.has(geb.id)) {
      resultaat.push({ soort: 'los', gebeurtenis: geb });
    }
  }
  return resultaat;
}

/**
 * Формує 15-секундне «Спокійне зведення», коли накопичилося декілька подій, відділяючи
 * питання, що потребують рішення людини, від штатних виконаних фонових звітів.
 */
export function bouwRustigOverzicht(
  stroom: readonly MeldingEcosysteemGebeurtenis[],
  lang: Taal,
): PulsRustigOverzicht {
  const actief = stroom.filter((g) => g.status !== 'archief' && g.status !== 'opgelost');
  const aandachtIds: string[] = [];
  const mensenIds: string[] = [];
  const achtergrondKlaarIds: string[] = [];

  for (const g of actief) {
    const v = verrijkGebeurtenisVoorPuls(g, lang);
    const isAchtergrond =
      v.niveau === 'gewoon' &&
      g.prioriteit !== 'kritiek' &&
      g.prioriteit !== 'hoog' &&
      (/(перевірку|завершено|синхронізовано|імпорт|резерв|klaar|gesynchroniseerd|voltooid|stille-uren)/i.test(`${g.titel} ${g.bron}`) ||
        g.kanaal === 'systeem' ||
        g.kanaal === 'pagina');

    if (v.niveau === 'gevaar' || v.niveau === 'besluit' || g.prioriteit === 'kritiek' || g.prioriteit === 'hoog') {
      aandachtIds.push(g.id);
    } else if (isAchtergrond) {
      achtergrondKlaarIds.push(g.id);
    } else {
      mensenIds.push(g.id);
    }
  }

  const geschatteSeconden = Math.max(10, aandachtIds.length * 10);
  const toon = achtergrondKlaarIds.length >= 2 && actief.length >= 3;

  const ukVraagVorm = (n: number): string => {
    const m100 = n % 100;
    const m10 = n % 10;
    if (m100 >= 11 && m100 <= 14) return `${n} питань чекають`;
    if (m10 === 1) return `${n} питання чекає`;
    if (m10 >= 2 && m10 <= 4) return `${n} питання чекають`;
    return `${n} питань чекають`;
  };
  const ukAchtergrondVorm = (n: number): string => {
    const m100 = n % 100;
    const m10 = n % 10;
    if (m100 >= 11 && m100 <= 14) return `${n} фонових дій виконано`;
    if (m10 === 1) return `${n} фонову дію виконано`;
    if (m10 >= 2 && m10 <= 4) return `${n} фонові дії виконано`;
    return `${n} фонових дій виконано`;
  };

  const titel =
    lang === 'nl'
      ? aandachtIds.length > 0
        ? `Rustig overzicht: ${aandachtIds.length} ${aandachtIds.length === 1 ? 'punt vraagt' : 'punten vragen'} uw keuze (~${geschatteSeconden} s)`
        : 'Rustig overzicht: alles is onder controle, geen dringende keuzes'
      : aandachtIds.length > 0
        ? `Спокійне зведення: ${ukVraagVorm(aandachtIds.length)} вашого слова (~${geschatteSeconden} с)`
        : 'Спокійне зведення: усе під контролем, термінових рішень немає';

  const subtitel =
    lang === 'nl'
      ? `${achtergrondKlaarIds.length} achtergrondtaken zijn vlekkeloos voltooid${mensenIds.length ? ` · ${mensenIds.length} berichten` : ''}.`
      : `Ще ${ukAchtergrondVorm(achtergrondKlaarIds.length)} штатно без зауважень${mensenIds.length ? ` · звісток: ${mensenIds.length}` : ''}.`;

  const actieLabel =
    lang === 'nl'
      ? `${achtergrondKlaarIds.length} voltooide opruimen`
      : `Згорнути ${achtergrondKlaarIds.length} виконаних`;

  return {
    toon,
    aandachtIds,
    geschatteSeconden,
    mensenIds,
    achtergrondKlaarIds,
    titel,
    subtitel,
    actieLabel,
  };
}

/**
 * Обчислює часову позначку для розумного умовного відкладення та перевіряє виконання умови.
 */
export function maakVoorwaardelijkUitstel(
  gebeurtenisId: string,
  soort: VoorwaardelijkUitstelSoort,
  nu: number,
  doelSubdomein?: MeldingSubdomein,
): { regel: VoorwaardelijkUitstelRegel; uitstelMinuten: number } {
  if (soort === '30m') {
    return { regel: { gebeurtenisId, soort, aangemaaktOp: nu, verlooptOp: nu + 30 * 60_000 }, uitstelMinuten: 30 };
  }
  if (soort === '60m') {
    return { regel: { gebeurtenisId, soort, aangemaaktOp: nu, verlooptOp: nu + 60 * 60_000 }, uitstelMinuten: 60 };
  }
  if (soort === 'morgen_09') {
    const d = new Date(nu);
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    const min = Math.max(60, Math.round((d.getTime() - nu) / 60_000));
    return { regel: { gebeurtenisId, soort, aangemaaktOp: nu, verlooptOp: d.getTime() }, uitstelMinuten: min };
  }
  // Для контекстних умов ставимо страховий рубіж 12 годин, але будимо миттєво при виконанні умови!
  return {
    regel: {
      gebeurtenisId,
      soort,
      aangemaaktOp: nu,
      ...(doelSubdomein ? { doelSubdomein } : {}),
      verlooptOp: nu + 12 * 3600_000,
    },
    uitstelMinuten: 720,
  };
}

export function isUitstelVoorwaardeVervuld(regel: VoorwaardelijkUitstelRegel, ctx: VoorwaardeContext): boolean {
  if (regel.verlooptOp && ctx.nu >= regel.verlooptOp) return true;
  // Не будимо в перші 15 секунд після встановлення умови на тому самому екрані, щоб користувач бачив відкладення.
  if (ctx.nu - regel.aangemaaktOp < 15_000) return false;
  if (regel.soort === 'op_computer') {
    return ctx.schermBreedte >= 1024 && !ctx.isAanraakScherm;
  }
  if (regel.soort === 'bij_onderdeel') {
    return Boolean(regel.doelSubdomein && ctx.subdomeinNu === regel.doelSubdomein);
  }
  if (regel.soort === 'na_taak') {
    return ctx.heeftRecentSuccesSignaal;
  }
  return false;
}

export function uitstelKeuzeLabel(soort: VoorwaardelijkUitstelSoort, lang: Taal, doelSubdomein?: MeldingSubdomein): string {
  const doelNaam = doelSubdomein ? subdomeinMenselijkLabel(doelSubdomein, lang) : '';
  const map: Record<VoorwaardelijkUitstelSoort, [string, string]> = {
    op_computer: ['Коли відкрию на комп’ютері', 'Zodra ik op een computer open'],
    bij_onderdeel: [
      doelNaam ? `Коли зайду в «${doelNaam}»` : 'Коли зайду у відповідний розділ',
      doelNaam ? `Zodra ik «${doelNaam}» open` : 'Zodra ik het onderdeel open',
    ],
    na_taak: ['Після завершення поточної дії / копії', 'Na afloop van lopende taak / kopie'],
    morgen_09: ['Завтра зранку (09:00)', 'Morgenochtend (09:00)'],
    '30m': ['Через 30 хвилин', 'Over 30 minuten'],
    '60m': ['Через 1 годину', 'Over 1 uur'],
  };
  return lang === 'nl' ? map[soort][1] : map[soort][0];
}

/**
 * Визначає активний фоновий процес для тихої «Живої капсули перебігу» біля дзвіночка.
 */
export function detecteerLiveVoortgang(
  stroom: readonly MeldingEcosysteemGebeurtenis[],
  lang: Taal,
  nu = Date.now(),
): LiveVoortgangPilInfo | null {
  const versVensterMs = 45 * 60_000;
  for (const g of stroom) {
    if (g.status === 'archief' || g.status === 'opgelost') continue;
    if (nu - g.bijgewerktOp > versVensterMs) continue;
    const pctMeta = typeof g.meta?.voortgangPct === 'number' ? Math.max(1, Math.min(99, Math.round(g.meta.voortgangPct))) : null;
    const t = `${g.bron} ${g.titel}`.toLowerCase();
    const isStart = /(розпочато|триває|складання|виконується|резервування|\.start|bezig|gestart)/i.test(t);
    const isEinde = /(завершено|виконано|готово|\.einde|\.klaar|voltooid|klaar)/i.test(t);
    if (!pctMeta && (!isStart || isEinde)) continue;

    // Перевіримо, чи немає новішої парної події завершення
    const stam = g.bron.replace(/\.(start|bezig)$/i, '');
    const alKlaar = stam
      ? stroom.some(
          (ander) =>
            ander.id !== g.id &&
            ander.bijgewerktOp >= g.bijgewerktOp &&
            ander.bron.startsWith(stam) &&
            /(\.einde|\.klaar|завершено|klaar)/i.test(`${ander.bron} ${ander.titel}`),
        )
      : false;
    if (alKlaar) continue;

    const anker = herkenMerkEnAnker(g, lang);
    const verstrekenMin = Math.max(1, Math.round((nu - g.aangemaaktOp) / 60_000));
    return {
      id: g.id,
      label: g.titel.slice(0, 48),
      procent: pctMeta,
      tijdTekst: lang === 'nl' ? `${verstrekenMin} min bezig` : `триває ${verstrekenMin} хв`,
      merkSleutel: anker.merkSleutel,
      icoon: anker.icoon,
    };
  }
  return null;
}

/**
 * Повага спливних вікон до потоку думки: під час активного набору тексту в полі вводу
 * некритичні сповіщення чекають короткої паузи (типово 2,5 с), тоді як критичні показуються одразу.
 */
export function magToastNuTonen(opties: {
  isKritiek: boolean;
  laatsteToetsDrukMs: number;
  nu: number;
  pauzeDrempelMs?: number;
}): boolean {
  if (opties.isKritiek) return true;
  const drempel = opties.pauzeDrempelMs ?? 2500;
  if (opties.laatsteToetsDrukMs <= 0) return true;
  return opties.nu - opties.laatsteToetsDrukMs >= drempel;
}

export function isInvoerElementActief(el: unknown): boolean {
  if (!el || typeof el !== 'object') return false;
  const tag = String((el as { tagName?: string }).tagName || '').toUpperCase();
  if (tag === 'TEXTAREA') return true;
  if (tag === 'INPUT') {
    const type = String((el as { type?: string }).type || 'text').toLowerCase();
    return !['button', 'checkbox', 'radio', 'submit', 'reset', 'range', 'color', 'file'].includes(type);
  }
  return Boolean((el as { isContentEditable?: boolean }).isContentEditable);
}

/**
 * Обчислює делікатну підказку тиші, якщо користувач тричі поспіль прибирає некритичні
 * сповіщення одного джерела без перегляду (безпека ніколи не пропонується до приглушення).
 */
export function registreerWeggekliktZonderOpenen(
  tellerMap: Record<string, number>,
  geb: MeldingEcosysteemGebeurtenis,
  lang: Taal,
  drempel = 3,
): { nieuweMap: Record<string, number>; suggestie: SlimmeStilteSuggestie | null } {
  const verrijkt = verrijkGebeurtenisVoorPuls(geb, lang);
  if (verrijkt.niveau === 'gevaar' || verrijkt.niveau === 'besluit' || geb.kanaal === 'beveiliging') {
    return { nieuweMap: tellerMap, suggestie: null };
  }
  const sleutel = `${geb.kanaal}:${geb.bron || geb.subdomein}`.toLowerCase().slice(0, 80);
  const aantal = (tellerMap[sleutel] || 0) + 1;
  const nieuweMap = { ...tellerMap, [sleutel]: aantal };
  if (aantal < drempel) return { nieuweMap, suggestie: null };

  const bronLabel = verrijkt.anker.label;
  return {
    nieuweMap,
    suggestie: {
      bronSleutel: sleutel,
      bronLabel,
      merkSleutel: verrijkt.anker.merkSleutel,
      icoon: verrijkt.anker.icoon,
      aantalKeer: aantal,
      vraagTekst:
        lang === 'nl'
          ? `U hebt «${bronLabel}» ${aantal}× achter elkaar opgeruimd zonder te openen. Voortaan stil in het logboek bewaren zonder pop-up?`
          : `Ви ${aantal} рази поспіль прибрали «${bronLabel}» не відкриваючи. Перевести такі сповіщення в спокійний журнал без спливання?`,
    },
  };
}
