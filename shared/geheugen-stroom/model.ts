// Чисте доменне ядро «Стріму пам’яті» (Stroom van geheugen) — без Node та DOM.
// Спільні типи, нормалізація, двомовні (uk + nl) довідники й захисний фільтр від випадкового збереження секретів.
import type { AiRuimte } from '../ai-ruimte';

export const GEHEUGEN_SOORTEN = ['feit', 'besluit', 'voorkeur', 'waarschuwing', 'context', 'koppeling'] as const;
export type GeheugenSoort = typeof GEHEUGEN_SOORTEN[number];

export const GEHEUGEN_STATUSSEN = ['actief', 'verouderd', 'gearchiveerd', 'herroepen'] as const;
export type GeheugenStatus = typeof GEHEUGEN_STATUSSEN[number];

export const GEHEUGEN_RELATIE_SOORTEN = ['vervangt', 'ondersteunt', 'spreekt_tegen', 'afhankelijk_van', 'verwijst_naar'] as const;
export type GeheugenRelatieSoort = typeof GEHEUGEN_RELATIE_SOORTEN[number];

export const GEHEUGEN_ACTIES = [
  'aangemaakt',
  'bijgewerkt',
  'vastgepind',
  'ontpind',
  'vervangen',
  'tegenspraak_gemarkeerd',
  'gearchiveerd',
  'hersteld',
  'geraadpleegd',
  'pakket_opgebouwd',
] as const;
export type GeheugenActie = typeof GEHEUGEN_ACTIES[number];

export const GEHEUGEN_DIENSTEN = ['ai', 'hub', 'mail', 'cloud', 'github', 'huis', 'mcp'] as const;
export type GeheugenDienst = typeof GEHEUGEN_DIENSTEN[number];

export interface GeheugenKnoop {
  id: string;
  ruimte: AiRuimte;
  werkruimteId?: string;
  sleutel: string;
  soort: GeheugenSoort;
  titel: string;
  inhoud: string;
  samenvatting: string;
  inhoudHash: string;
  bronDienst: string;
  bronAgent: string;
  labels: string[];
  status: GeheugenStatus;
  vastgepind: boolean;
  gewicht: number;
  geldigVanaf: number;
  geldigTot?: number;
  aanroepen: number;
  laatstGeraadpleegdOp?: number;
  aangemaaktOp: number;
  bijgewerktOp: number;
  versleuteld?: boolean;
  vergrendeld?: boolean;
}

export interface GeheugenRelatie {
  id: string;
  ruimte: AiRuimte;
  bronKnoopId: string;
  doelKnoopId: string;
  relatieSoort: GeheugenRelatieSoort;
  toelichting: string;
  sterkte: number;
  aangemaaktOp: number;
}

export interface GeheugenGebeurtenis {
  id: string;
  ruimte: AiRuimte;
  knoopId?: string;
  actie: GeheugenActie;
  bronAgent: string;
  bronDienst: string;
  details: Record<string, unknown>;
  aangemaaktOp: number;
}

export interface GeheugenTegenspraak {
  id: string;
  soort: 'expliciet' | 'impliciet';
  knoopAId: string;
  knoopBId: string;
  knoopATitel: string;
  knoopBTitel: string;
  redenUk: string;
  redenNl: string;
  relatieId?: string;
}

export interface GeheugenGerangschiktItem {
  knoop: GeheugenKnoop;
  score: number;
  redenenUk: string[];
  redenenNl: string[];
  vervangenDoor?: { id: string; sleutel: string; titel: string };
  tegenspraken: string[];
  gekoppeldAantal: number;
}

export interface GeheugenPakket {
  ruimte: AiRuimte;
  vraag: string;
  tekensGebruikt: number;
  tekensLimiet: number;
  totaalBekeken: number;
  items: GeheugenGerangschiktItem[];
  tegenspraken: GeheugenTegenspraak[];
  tekstUk: string;
  tekstNl: string;
}

export interface GeheugenKandidaat {
  sleutel: string;
  soort: GeheugenSoort;
  titel: string;
  inhoud: string;
  labels: string[];
  vertrouwen: number;
  geblokkeerdDoorGeheim?: boolean;
}

export const GEHEUGEN_FOUTEN = {
  geenSessie: 'GEHEUGEN_SESSIE_VEREIST',
  geenRecht: 'API_RECHT_VEREIST',
  ongeldigeInvoer: 'GEHEUGEN_ONGELDIGE_INVOER',
  geheimGeweigerd: 'GEHEUGEN_GEHEIM_GEWEIGERD',
  nietGevonden: 'GEHEUGEN_NIET_GEVONDEN',
  zelfRelatie: 'GEHEUGEN_ZELF_RELATIE_ONGELDIG',
  sleutelGesloten: 'SLEUTELKLUIS_GESLOTEN',
} as const;

export const GEHEUGEN_SOORT_META: Record<GeheugenSoort, { uk: string; nl: string; uitlegUk: string; uitlegNl: string; halfwaardeDagen: number; basisFactor: number }> = {
  besluit: {
    uk: 'Рішення',
    nl: 'Besluit',
    uitlegUk: 'Ухвалений вибір або архітектурне рішення, що визначає подальші кроки.',
    uitlegNl: 'Een genomen keuze of ontwerpbesluit dat richting geeft aan vervolgstappen.',
    halfwaardeDagen: 180,
    basisFactor: 1.35,
  },
  voorkeur: {
    uk: 'Уподобання',
    nl: 'Voorkeur',
    uitlegUk: 'Сталі вподобання, стиль роботи, правила оформлення чи мови користувача.',
    uitlegNl: 'Blijvende voorkeur, werkstijl, opmaak- of taalregel van de gebruiker.',
    halfwaardeDagen: 365,
    basisFactor: 1.3,
  },
  waarschuwing: {
    uk: 'Застереження',
    nl: 'Waarschuwing',
    uitlegUk: 'Важливі обмеження, ризики та речі, яких не можна робити.',
    uitlegNl: 'Belangrijke grenzen, risico’s en zaken die niet mogen gebeuren.',
    halfwaardeDagen: 150,
    basisFactor: 1.4,
  },
  feit: {
    uk: 'Факт',
    nl: 'Feit',
    uitlegUk: 'Перевірений факт про проєкт, пристрої, домовленості або середовище.',
    uitlegNl: 'Geverifieerd feit over een project, apparaat, afspraak of omgeving.',
    halfwaardeDagen: 90,
    basisFactor: 1.0,
  },
  context: {
    uk: 'Робочий контекст',
    nl: 'Werkcontext',
    uitlegUk: 'Опис поточного завдання, зв’язків між сервісами та проміжного стану.',
    uitlegNl: 'Beschrijving van een lopende taak, samenhang tussen diensten en tussenstand.',
    halfwaardeDagen: 45,
    basisFactor: 0.95,
  },
  koppeling: {
    uk: 'Зв’язок',
    nl: 'Verbinding',
    uitlegUk: 'Зв’язок між подіями, листами, файлами чи діями в екосистемі.',
    uitlegNl: 'Verbinding tussen gebeurtenissen, berichten, bestanden of acties in het ecosysteem.',
    halfwaardeDagen: 60,
    basisFactor: 0.9,
  },
};

export const GEHEUGEN_RELATIE_META: Record<GeheugenRelatieSoort, { uk: string; nl: string; omgekeerdUk: string; omgekeerdNl: string }> = {
  vervangt: {
    uk: 'Замінює',
    nl: 'Vervangt',
    omgekeerdUk: 'Замінено вузлом',
    omgekeerdNl: 'Vervangen door',
  },
  ondersteunt: {
    uk: 'Підтверджує',
    nl: 'Ondersteunt',
    omgekeerdUk: 'Підтверджено вузлом',
    omgekeerdNl: 'Ondersteund door',
  },
  spreekt_tegen: {
    uk: 'Суперечить',
    nl: 'Spreekt tegen',
    omgekeerdUk: 'У суперечності з',
    omgekeerdNl: 'In tegenspraak met',
  },
  afhankelijk_van: {
    uk: 'Залежить від',
    nl: 'Afhankelijk van',
    omgekeerdUk: 'Є основою для',
    omgekeerdNl: 'Basis voor',
  },
  verwijst_naar: {
    uk: 'Посилається на',
    nl: 'Verwijst naar',
    omgekeerdUk: 'Згадано в',
    omgekeerdNl: 'Vermeld in',
  },
};

export const GEHEUGEN_STATUS_META: Record<GeheugenStatus, { uk: string; nl: string }> = {
  actief: { uk: 'Активний', nl: 'Actief' },
  verouderd: { uk: 'Застарілий', nl: 'Verouderd' },
  gearchiveerd: { uk: 'В архіві', nl: 'Gearchiveerd' },
  herroepen: { uk: 'Спростований', nl: 'Herroepen' },
};

export const GEHEUGEN_DIENST_LABELS: Record<string, { uk: string; nl: string }> = {
  ai: { uk: 'ШІ та чат', nl: 'AI en chat' },
  hub: { uk: 'Мій простір', nl: 'Mijn ruimte' },
  mail: { uk: 'Пошта', nl: 'E-mail' },
  cloud: { uk: 'Хмарне сховище', nl: 'Cloudopslag' },
  github: { uk: 'GitHub', nl: 'GitHub' },
  huis: { uk: 'Розумний будинок', nl: 'Slim huis' },
  mcp: { uk: 'Міст і агенти', nl: 'MCP en agenten' },
};

export const GEHEUGEN_ACTIE_META: Record<GeheugenActie, { uk: string; nl: string }> = {
  aangemaakt: { uk: 'Створено вузол', nl: 'Knoop aangemaakt' },
  bijgewerkt: { uk: 'Оновлено вузол', nl: 'Knoop bijgewerkt' },
  vastgepind: { uk: 'Закріплено вузол', nl: 'Knoop vastgezet' },
  ontpind: { uk: 'Відкріплено вузол', nl: 'Knoop losgemaakt' },
  vervangen: { uk: 'Замінено новішим записом', nl: 'Vervangen door nieuwere knoop' },
  tegenspraak_gemarkeerd: { uk: 'Позначено суперечність', nl: 'Tegenspraak gemarkeerd' },
  gearchiveerd: { uk: 'Перенесено до архіву', nl: 'Gearchiveerd' },
  hersteld: { uk: 'Відновлено з архіву', nl: 'Hersteld uit archief' },
  geraadpleegd: { uk: 'Звернення до вузла', nl: 'Knoop geraadpleegd' },
  pakket_opgebouwd: { uk: 'Зібрано пакет для ШІ', nl: 'Geheugenpakket samengesteld' },
};

const SLEUTEL_RE = /^[a-z0-9][a-z0-9._:-]{1,95}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Захисні патерни проти випадкового збереження ключів доступу, паролів або сертифікатів у пам’ять.
const GEHEIME_PATRONEN: readonly RegExp[] = [
  /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/,
  /\b(?:sk-(?:ant|proj)-[A-Za-z0-9_-]{12,}|sk-[A-Za-z0-9]{20,})\b/,
  /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/,
  /\bmcpa_[A-Za-z0-9_-]{12,}\b/,
  /\bAIza[0-9A-Za-z_-]{20,}\b/,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\b\d{6,15}:AA[A-Za-z0-9_-]{20,}\b/,
  /\bBearer\s+[A-Za-z0-9._-]{24,}\b/i,
  /\b(?:password|wachtwoord|пароль|api[_-]?key|secret[_-]?key|access[_-]?token|refresh[_-]?token|bot[_-]?token)\s*[:=]\s*["']?[^\s"']{6,}/i,
];

export function bevatGevoeligGeheim(tekst: unknown): boolean {
  if (typeof tekst !== 'string' || !tekst) return false;
  return GEHEIME_PATRONEN.some((patroon) => patroon.test(tekst));
}

export function filterGeheimePatronen(tekst: unknown): string {
  let schoon = String(tekst ?? '');
  for (const patroon of GEHEIME_PATRONEN) {
    const globaal = new RegExp(patroon.source, patroon.flags.includes('g') ? patroon.flags : `${patroon.flags}g`);
    schoon = schoon.replace(globaal, '[ПРИХОВАНО/AFGESCHERMD]');
  }
  return schoon;
}

const CYR_NAAR_LAT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'h', ґ: 'g', д: 'd', е: 'e', є: 'ye', ж: 'zh', з: 'z', и: 'y', і: 'i', ї: 'yi', й: 'y',
  к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch',
  ш: 'sh', щ: 'shch', ь: '', ю: 'yu', я: 'ya',
};

export function normaliseerGeheugenSleutel(raw: unknown, terugval = 'geheugen'): string {
  const bron = String(raw ?? '').trim().toLowerCase();
  let latijn = '';
  for (const ch of bron) {
    if (ch in CYR_NAAR_LAT) latijn += CYR_NAAR_LAT[ch];
    else latijn += ch;
  }
  const schoon = latijn
    .replace(/[^a-z0-9._:-]+/g, '-')
    .replace(/^[-.:_]+|[-.:_]+$/g, '')
    .slice(0, 95);
  if (SLEUTEL_RE.test(schoon)) return schoon;
  const basis = terugval.replace(/[^a-z0-9._:-]+/g, '-').slice(0, 40) || 'geheugen';
  return schoon.length === 1 ? `${basis}-${schoon}` : `${basis}-item`;
}

export function isGeldigeGeheugenSleutel(raw: unknown): boolean {
  return typeof raw === 'string' && SLEUTEL_RE.test(raw.trim());
}

export function isGeldigUuid(raw: unknown): boolean {
  return typeof raw === 'string' && UUID_RE.test(raw.trim());
}

export function schoonGeheugenSoort(raw: unknown): GeheugenSoort {
  return (GEHEUGEN_SOORTEN as readonly string[]).includes(String(raw)) ? (raw as GeheugenSoort) : 'feit';
}

export function schoonGeheugenStatus(raw: unknown): GeheugenStatus {
  return (GEHEUGEN_STATUSSEN as readonly string[]).includes(String(raw)) ? (raw as GeheugenStatus) : 'actief';
}

export function schoonRelatieSoort(raw: unknown): GeheugenRelatieSoort {
  return (GEHEUGEN_RELATIE_SOORTEN as readonly string[]).includes(String(raw)) ? (raw as GeheugenRelatieSoort) : 'verwijst_naar';
}

export function schoonGeheugenDienst(raw: unknown): string {
  const s = String(raw ?? '').trim().toLowerCase().slice(0, 40);
  return (GEHEUGEN_DIENSTEN as readonly string[]).includes(s) ? s : 'ai';
}

export function schoonGeheugenAgent(raw: unknown): string {
  return String(raw ?? '').trim().toLowerCase().replace(/[^a-z0-9_.-]/g, '').slice(0, 48);
}

export function normaliseerGeheugenGewicht(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 1.0;
  return Math.max(0.1, Math.min(5.0, Math.round(n * 100) / 100));
}

export function normaliseerGeheugenLabels(raw: unknown): string[] {
  const bron = Array.isArray(raw)
    ? raw
    : typeof raw === 'string'
      ? raw.split(/[,\n;]+/)
      : [];
  const uit: string[] = [];
  for (const item of bron) {
    const label = String(item ?? '').trim().toLowerCase().replace(/\s+/g, '-').slice(0, 40);
    if (!label || uit.includes(label)) continue;
    uit.push(label);
    if (uit.length >= 24) break;
  }
  return uit;
}

export function maakSamenvatting(titel: string, inhoud: string): string {
  const basis = inhoud.trim() || titel.trim();
  const eenRegel = basis.replace(/\s+/g, ' ').trim();
  if (eenRegel.length <= 240) return eenRegel;
  return `${eenRegel.slice(0, 237)}…`;
}

export function maakKnoopSleutelVanTitel(titel: string, nu = Date.now()): string {
  const basis = normaliseerGeheugenSleutel(titel, 'knoop').slice(0, 68);
  const staart = Math.abs(Math.floor(nu)).toString(36).slice(-6);
  const kandidaat = `${basis}-${staart}`.slice(0, 95);
  return SLEUTEL_RE.test(kandidaat) ? kandidaat : `knoop-${staart}`;
}
