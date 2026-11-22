// Зведена клієнтобезпечна База всіх типів сповіщень, схем доказів і серверних кодів дій (MELDINGEN-REGISTER-001).
// Дозволяє оглядати наживо в інтерфейсі (/melding та з Пульта уваги) кожен існуючий вид сповіщення й код дії,
// його розділ, простір, офіційний логотип із src/merk/, рівень важливості та схему доказів S1..S20.
// Eén samengevoegd clientveilig overzicht van alle meldingssoorten, bewijsschema's en serveractiecodes.

import { ACTIE_LABELS, ALLE_CATEGORIEEN, categorieVan, isRuis, type CategorieId } from './beheer-journaal';
import {
  MELDINGEN,
  MELDING_SCHEMAS,
  type MeldingNiveau,
  type MeldingSchemaId,
} from './meldingen-catalogus';
import { sfeerVanAuditActie } from './meldingen-soorten';
import { herkenKanaal, herkenSubdomein } from './meldingen-ecosysteem/tolk';
import type { MeldingKanaal, MeldingSubdomein, RuimteType } from './meldingen-ecosysteem/model';

export type RegisterHerkomstSoort = 'melding' | 'actie' | 'stille_audit';

export type MeldingRegisterRij = {
  id: string;
  code: string;
  herkomst: RegisterHerkomstSoort;
  titelUk: string;
  titelNl: string;
  subdomein: MeldingSubdomein;
  kanaal: MeldingKanaal;
  ruimte: RuimteType;
  niveau: MeldingNiveau;
  schemaId: MeldingSchemaId;
  schemaUk: string;
  schemaNl: string;
  emblemenUk: readonly string[];
  emblemenNl: readonly string[];
  categorie: CategorieId;
  categorieUk: string;
  categorieNl: string;
  merkSleutel: string | null;
  bronBestand: string;
};

export type MeldingRegisterStatistiek = {
  totaal: number;
  directeMeldingen: number;
  actieMeldingen: number;
  stilleAuditRegels: number;
  schemasAantal: number;
  onbekendOverig: number;
};

function bepaalMerkSleutelVoorCode(code: string, bestand = ''): string | null {
  const s = `${code} ${bestand}`.toLowerCase();
  if (/\btelegram|telegram-aanmelden|telegram_/.test(s)) return 'telegram';
  if (/\bgithub/.test(s)) return 'github';
  if (/\bgoogle-drive|googledrive/.test(s)) return 'googledrive';
  if (/\bgmail|mail\.google|google-oauth/.test(s)) return 'gmail';
  if (/\bgoogle/.test(s)) return 'google';
  if (/\boutlook|microsoft/.test(s)) return 'microsoft';
  if (/\bonedrive/.test(s)) return 'microsoftonedrive';
  if (/\bclaude/.test(s)) return 'claude';
  if (/\bgemini/.test(s)) return 'gemini';
  if (/\bgrok/.test(s)) return 'grok';
  if (/\bcodex/.test(s)) return 'codex';
  if (/\bantigravity/.test(s)) return 'antigravity';
  if (/\bautoclaw/.test(s)) return 'autoclaw';
  if (/\bcopilot/.test(s)) return 'copilot';
  if (/\bcursor/.test(s)) return 'cursor';
  if (/\bpasskey/.test(s)) return 'passkey';
  if (/\boauth/.test(s)) return 'oauth';
  if (/\bwebhook/.test(s)) return 'webhook';
  return null;
}

function bepaalSchemaVoorCategorie(cat: CategorieId, code: string): MeldingSchemaId {
  if (/niet-ik|fout-symbool|alarm|conflict/.test(code)) return 'S1';
  if (cat === 'uitrol') return 'S14';
  if (cat === 'geheimen') return 'S16';
  if (cat === 'ai') return /grant|deur|toestemming|mandaat/.test(code) ? 'S11' : 'S12';
  if (cat === 'apparaten') return /terminal|remote/.test(code) ? 'S18' : 'S1';
  if (cat === 'diagnose') return 'S15';
  if (cat === 'toegang') return /code|sleutelkluis|herstel/.test(code) ? 'S3' : 'S2';
  if (cat === 'sessie') return 'S1';
  if (cat === 'mail') return 'S8';
  if (cat === 'integraties') {
    if (/agenda/.test(code)) return 'S9';
    if (/cloud/.test(code)) return 'S10';
    return 'S16';
  }
  if (cat === 'tech') return /impersonatie|ondersteuning/.test(code) ? 'S7' : 'S15';
  if (cat === 'beheer') return /workspace|share|invite/.test(code) ? 'S6' : 'S5';
  return 'S13';
}

function bepaalNiveauVoorCode(code: string): MeldingNiveau {
  if (/(niet-ik|fout-symbool|alarm|zekering|geblokkeerd|conflict|te_vaak)/.test(code)) return 'gevaar';
  if (/(gevraagd|requested|voorstel|nodig|aangevraagd)/.test(code)) return 'besluit';
  return 'gewoon';
}

let _cache: { rijen: readonly MeldingRegisterRij[]; statistiek: MeldingRegisterStatistiek } | null = null;

export function bouwMeldingRegisterOverzicht(): {
  rijen: readonly MeldingRegisterRij[];
  statistiek: MeldingRegisterStatistiek;
} {
  if (_cache) return _cache;

  const catMap = new Map(ALLE_CATEGORIEEN.map((c) => [c.id, c] as const));
  const rijen: MeldingRegisterRij[] = [];
  const gezieneActieCodes = new Set<string>();

  // 1. Усі зареєстровані прямі сповіщення з MELDINGEN (shared/meldingen-catalogus.ts)
  for (const m of MELDINGEN) {
    const schema = MELDING_SCHEMAS[m.schema] || MELDING_SCHEMAS.S13;
    const cat = categorieVan(m.soort) !== 'overig'
      ? categorieVan(m.soort)
      : m.type.startsWith('tech.')
        ? 'tech'
        : m.type === 'beveiliging'
          ? 'toegang'
          : m.type === 'post'
            ? 'mail'
            : m.type === 'ai'
              ? 'ai'
              : 'beheer';
    const catObj = catMap.get(cat) || catMap.get('beheer')!;
    const ruimte: RuimteType = m.type.startsWith('tech.') ? 'technisch' : 'prive';
    const subdomein = herkenSubdomein(`${m.bestand} ${m.soort}`, '', ruimte === 'technisch' ? 'admin' : 'hub');
    const kanaal = herkenKanaal(`${m.bestand} ${m.soort}`, m.soort, subdomein);

    if (m.kanaal === 'activiteit') gezieneActieCodes.add(m.soort);

    rijen.push({
      id: `cat:${m.id}`,
      code: m.sub ? `${m.soort} (${m.sub})` : m.soort,
      herkomst: 'melding',
      titelUk: m.titel[0],
      titelNl: m.titel[1],
      subdomein,
      kanaal,
      ruimte,
      niveau: m.niveau,
      schemaId: m.schema,
      schemaUk: schema.naam[0],
      schemaNl: schema.naam[1],
      emblemenUk: schema.emblemen.map((e) => e[0]),
      emblemenNl: schema.emblemen.map((e) => e[1]),
      categorie: cat,
      categorieUk: catObj.uk,
      categorieNl: catObj.nl,
      merkSleutel: bepaalMerkSleutelVoorCode(m.soort, m.bestand),
      bronBestand: m.bestand,
    });
  }

  // 2. Усі серверні коди дій з ACTIE_LABELS (shared/beheer-journaal.ts)
  const stilleExtraRe = /^(owner\.ruimte\.geweigerd$|owner\.extensie\.zijpaneel\.chat$|owner\.meldingen\.ecosysteem\.(actie|profiel)$)/;
  let onbekendOverig = 0;

  for (const [code, [titelUk, titelNl]] of Object.entries(ACTIE_LABELS)) {
    const cat = categorieVan(code);
    if (cat === 'overig') onbekendOverig += 1;
    const catObj = catMap.get(cat) || catMap.get('overig')!;
    const stil = isRuis(code) || stilleExtraRe.test(code);
    const ruimte: RuimteType = sfeerVanAuditActie(code) === 'technisch' ? 'technisch' : 'prive';
    const subdomein = herkenSubdomein(code, '', ruimte === 'technisch' ? 'admin' : 'id');
    const kanaal = herkenKanaal(code, code, subdomein);
    const schemaId = bepaalSchemaVoorCategorie(cat, code);
    const schema = MELDING_SCHEMAS[schemaId] || MELDING_SCHEMAS.S13;

    if (gezieneActieCodes.has(code) && !stil) continue;

    rijen.push({
      id: `act:${code}`,
      code,
      herkomst: stil ? 'stille_audit' : 'actie',
      titelUk,
      titelNl,
      subdomein,
      kanaal,
      ruimte,
      niveau: bepaalNiveauVoorCode(code),
      schemaId,
      schemaUk: schema.naam[0],
      schemaNl: schema.naam[1],
      emblemenUk: schema.emblemen.map((e) => e[0]),
      emblemenNl: schema.emblemen.map((e) => e[1]),
      categorie: cat,
      categorieUk: catObj.uk,
      categorieNl: catObj.nl,
      merkSleutel: bepaalMerkSleutelVoorCode(code),
      bronBestand: 'shared/beheer-journaal.ts',
    });
  }

  const directeMeldingen = rijen.filter((r) => r.herkomst === 'melding').length;
  const actieMeldingen = rijen.filter((r) => r.herkomst === 'actie').length;
  const stilleAuditRegels = rijen.filter((r) => r.herkomst === 'stille_audit').length;

  _cache = {
    rijen,
    statistiek: {
      totaal: rijen.length,
      directeMeldingen,
      actieMeldingen,
      stilleAuditRegels,
      schemasAantal: Object.keys(MELDING_SCHEMAS).length,
      onbekendOverig,
    },
  };
  return _cache;
}
