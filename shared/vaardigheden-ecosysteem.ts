// Gedeeld model, validatie van de taalwet, zoeker en parser/bouwer voor het ecosysteem van agentvaardigheden (Mijn Ruimte).
// Puur (geen React/DOM/Node): gebruikt door browser, server, MCP-protocol 2026-07-28 én eenheidstests.

import { V2_AGENTEN, isAgentSlug, type AgentSlug } from './connector-v2/agenten';
import type { AiRuimte } from './ai-ruimte';

export type VaardigheidBron = 'systeem' | 'protocol' | 'eigen' | 'geimporteerd';
export type VaardigheidRuimte = AiRuimte;
export type VaardigheidRuimteBereik = VaardigheidRuimte | 'beide';
export type VaardigheidAansluiting = 'hulpmiddelen_aanwezig' | 'hulpmiddelen_ontbreken' | 'onbekend';

export interface VaardigheidTaalPaar {
  uk: string;
  nl: string;
}

export interface VaardigheidItem {
  id: string;
  uri: string;
  bron: VaardigheidBron;
  ruimte: VaardigheidRuimteBereik;
  versie: number;
  versieSemver?: string;
  afhankelijkheden?: string[];
  actief: boolean;
  /** Leeg = beschikbaar voor alle agenten in de toegestane ruimte; anders beperkt tot deze agenten. */
  agentKoppelingen: AgentSlug[];
  titel: VaardigheidTaalPaar;
  samenvatting: VaardigheidTaalPaar;
  inhoud: VaardigheidTaalPaar;
  termen: { uk: string[]; nl: string[] };
  vereisteHulpmiddelen: string[];
  heeftVoorbeeld: boolean;
  bijgewerktOp: number;
}

export interface VaardigheidAgentStand {
  agentSlug: AgentSlug | '*';
  vaardigheidId: string;
  actief: boolean;
  prioriteit: number;
  notitie: string;
  bijgewerktOp: number;
}

export interface VaardigheidRevisie {
  id: string;
  vaardigheidSlug: string;
  versie: number;
  actie: 'aangemaakt' | 'bijgewerkt' | 'geimporteerd' | 'hersteld' | 'verwijderd' | 'koppeling_gewijzigd';
  doorAgent: string;
  momentopname: Record<string, unknown>;
  aangemaaktOp: number;
}

export interface VaardigheidAanbeveling {
  id: string;
  uri: string;
  bron: VaardigheidBron;
  versieSemver?: string;
  afhankelijkheden?: string[];
  titel: VaardigheidTaalPaar;
  samenvatting: VaardigheidTaalPaar;
  score: number;
  aansluiting: VaardigheidAansluiting;
  ontbrekendeHulpmiddelen: string[];
}

export interface VaardigheidInvoer {
  slug: string;
  titelUk: string;
  titelNl: string;
  samenvattingUk: string;
  samenvattingNl: string;
  inhoudUk: string;
  inhoudNl: string;
  termenUk: string[];
  termenNl: string[];
  vereisteHulpmiddelen: string[];
  agentKoppelingen: AgentSlug[];
  bron: 'eigen' | 'geimporteerd';
  actief: boolean;
}

export const VAARDIGHEDEN_TOOL_NAMEN = [
  'vaardigheden_aanbevelen',
  'vaardigheden_opslaan',
] as const;

export const VAARDIGHEDEN_SCHRIJF_TOOL_NAMEN = [
  'vaardigheden_opslaan',
] as const;

export const VAARD_SLUG_RE = /^[a-z0-9][a-z0-9-]{1,63}$/;
const GERESERVEERDE_SLUGS = new Set(['overzicht', 'nieuw', 'standaard', 'alle', 'import', 'export']);

const RU_LETTERS = /[\u0401\u0451\u042a\u044a\u042b\u044b\u042d\u044d]/;
const CYRILLISCH = /[\u0400-\u04FF]/;
const LATIJNS = /[A-Za-z]/;
const TECH_JARGON = new RegExp(
  '(?:^|[^\\p{L}])(' +
    [
      '\u0431\u0430\u0433',
      '\u0431\u0430\u0433\u0438',
      '\u0431\u0430\u0433\u0456\u0432',
      '\u0444\u0456\u043a\u0441',
      '\u0444\u0456\u043a\u0441\u0438',
      '\u0431\u0456\u043b\u0434',
      '\u0431\u0456\u043b\u0434\u0443',
      '\u0434\u0435\u043f\u043b\u043e\u0439',
      '\u0434\u0435\u043f\u043b\u043e\u044e',
      '\u043a\u043e\u043c\u0456\u0442',
      '\u043a\u043e\u043c\u0456\u0442\u0443',
      '\u0431\u0440\u0435\u043d\u0447',
      '\u043f\u0443\u043b-?\u0440\u0435\u043a\u0432\u0435\u0441\u0442',
      '\u0442\u0430\u0441\u043a\u0430',
      '\u0442\u0430\u0441\u043a\u0443',
      '\u0444\u0456\u0447\u0430',
      '\u0444\u0456\u0447\u0456',
      '\u043a\u0435\u0448',
      '\u043c\u0456\u043a\u0440\u043e\u043a\u0435\u0448\u0443\u0432\u0430\u043d\u043d\u044f',
      '\u0431\u0435\u043a\u0430\u043f',
      '\u0434\u0435\u0444\u043e\u043b\u0442\u043d',
      '\u043a\u0430\u0441\u0442\u043e\u043c\u043d',
      '\u0430\u043f\u0434\u0435\u0439\u0442',
      '\u0441\u043a\u0440\u0456\u043d\u0448\u043e\u0442',
      '\u043b\u0435\u0439\u0430\u0443\u0442',
      '\u0432\u043e\u0442\u0435\u0440\u0444\u043e\u043b',
      '\u0442\u0430\u0439\u043c\u0430\u0443\u0442',
      '\u0447\u0435\u043a-?\u043b\u0456\u0441\u0442',
      '\u0434\u0435\u0434\u0443\u043f\u043b\u0456\u043a\u0430\u0446\u0456\u044f',
    ].join('|') +
    ')(?:[^\\p{L}]|$)',
  'iu',
);

const GEHEIM_PATRONEN: readonly RegExp[] = [
  /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/i,
  /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/,
  /\bglpat-[A-Za-z0-9_-]{16,}\b/,
  /\bxox[baprs]-[A-Za-z0-9-]{12,}\b/,
  /\bsk-(?:proj|live|test)-[A-Za-z0-9_-]{16,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bmcpa_[A-Za-z0-9_-]{16,}\b/,
];

export const VAARD_FOUT_TEKST: Readonly<Record<string, VaardigheidTaalPaar>> = Object.freeze({
  VAARD_SLUG_ONGELDIG: {
    uk: 'Ідентифікатор навички має складатися з 2–64 малих латинських літер, цифр і дефісів (без зарезервованих слів).',
    nl: 'De vaardigheidssleutel moet uit 2–64 kleine letters, cijfers en koppeltekens bestaan (zonder gereserveerde namen).',
  },
  VAARD_TEKST_VERPLICHT: {
    uk: 'Усі обов’язкові поля двомовної навички (назва, підсумок і настанова українською та нідерландською) мають бути заповнені.',
    nl: 'Alle verplichte tweetalige velden (titel, samenvatting en inhoud in het Oekraïens en Nederlands) moeten ingevuld zijn.',
  },
  VAARD_TAALWET_GESCHONDEN: {
    uk: 'Порушено мовний закон: заборонено літери російської абетки та техно-сленг; українська частина потребує кирилиці, а нідерландська — латиниці.',
    nl: 'Taalwet geschonden: verboden tekens of jargon zijn niet toegestaan; het Oekraïense deel vereist Cyrillisch en het Nederlandse Latijns schrift.',
  },
  VAARD_GEHEIM_VERBODEN: {
    uk: 'Навичка містить зразок ключа доступу, пароля або приватного ключа. Ніколи не зберігайте таємниці в навичках агентів.',
    nl: 'De vaardigheid bevat een token-, wachtwoord- of privésleutelpatroon. Bewaar nooit geheimen in agentvaardigheden.',
  },
  VAARD_TE_GROOT: {
    uk: 'Текст навички перевищує дозволений ліміт (48 000 символів на мовну версію).',
    nl: 'De tekst van de vaardigheid overschrijdt het toegestane maximum (48 000 tekens per taalversie).',
  },
  VAARD_NIET_GEVONDEN: {
    uk: 'Навичку в активному просторі не знайдено або її приховано політикою простору.',
    nl: 'De vaardigheid is niet gevonden in de actieve ruimte of is afgeschermd door ruimtescheiding.',
  },
  VAARD_SYSTEEM_ALLEEN_SCHAKELEN: {
    uk: 'Вбудовану системну навичку можна вмикати чи вимикати для агентів, але не видаляти.',
    nl: 'Een ingebouwde systeemvaardigheid kan voor agenten worden aan- of uitgezet, maar niet worden verwijderd.',
  },
  VAARD_MARKDOWN_ONGELDIG: {
    uk: 'Не вдалося розібрати формат SKILL.md або JSON-пакет навички.',
    nl: 'Het formaat van SKILL.md of het JSON-vaardigheidspakket kon niet worden geparseerd.',
  },
  VAARD_TECH_PROFIEL_VEREIST: {
    uk: 'Для перегляду чи зміни технічних навичок потрібен активний технічний профіль у поточній вкладці.',
    nl: 'Voor het bekijken of wijzigen van technische vaardigheden is een actief technisch profiel in het huidige tabblad vereist.',
  },
});

export function vaardFoutTekst(code: string, taal: 'uk' | 'nl'): string {
  const paar = VAARD_FOUT_TEKST[code];
  return paar ? paar[taal] : code;
}

export function heeftVerbodenGeheim(tekst: string): boolean {
  return GEHEIM_PATRONEN.some((re) => re.test(tekst));
}

export function taalwetOvertreding(tekst: string): boolean {
  if (!tekst) return false;
  return RU_LETTERS.test(tekst) || TECH_JARGON.test(tekst);
}

export function schoonLijst(ruw: unknown, max: number, maxLen = 80): string[] {
  if (!Array.isArray(ruw)) return [];
  const gezien = new Set<string>();
  const uit: string[] = [];
  for (const x of ruw) {
    const s = String(x ?? '').trim().slice(0, maxLen);
    if (!s || gezien.has(s)) continue;
    gezien.add(s);
    uit.push(s);
    if (uit.length >= max) break;
  }
  return uit;
}

export function schoonAgentKoppelingen(ruw: unknown): AgentSlug[] {
  if (!Array.isArray(ruw)) return [];
  const gezien = new Set<AgentSlug>();
  for (const x of ruw) {
    const s = String(x ?? '').trim().toLowerCase();
    if (isAgentSlug(s)) gezien.add(s);
  }
  return [...gezien];
}

export function valideerVaardigheidInvoer(
  ruw: Record<string, unknown>,
): { ok: true; waarde: VaardigheidInvoer } | { ok: false; code: string } {
  const slug = String(ruw.slug ?? '').trim().toLowerCase();
  if (!VAARD_SLUG_RE.test(slug) || GERESERVEERDE_SLUGS.has(slug)) {
    return { ok: false, code: 'VAARD_SLUG_ONGELDIG' };
  }
  const titelUk = String(ruw.titelUk ?? ruw.titel_uk ?? '').trim();
  const titelNl = String(ruw.titelNl ?? ruw.titel_nl ?? '').trim();
  const samenvattingUk = String(ruw.samenvattingUk ?? ruw.samenvatting_uk ?? '').trim();
  const samenvattingNl = String(ruw.samenvattingNl ?? ruw.samenvatting_nl ?? '').trim();
  const inhoudUk = String(ruw.inhoudUk ?? ruw.inhoud_uk ?? '').trim();
  const inhoudNl = String(ruw.inhoudNl ?? ruw.inhoud_nl ?? '').trim();

  if (!titelUk || !titelNl || !samenvattingUk || !samenvattingNl || !inhoudUk || !inhoudNl) {
    return { ok: false, code: 'VAARD_TEKST_VERPLICHT' };
  }
  if (
    titelUk.length > 160 ||
    titelNl.length > 160 ||
    samenvattingUk.length > 600 ||
    samenvattingNl.length > 600 ||
    inhoudUk.length > 48_000 ||
    inhoudNl.length > 48_000
  ) {
    return { ok: false, code: 'VAARD_TE_GROOT' };
  }

  const termenUk = schoonLijst(ruw.termenUk ?? ruw.termen_uk, 40, 80);
  const termenNl = schoonLijst(ruw.termenNl ?? ruw.termen_nl, 40, 80);
  const vereisteHulpmiddelen = schoonLijst(
    ruw.vereisteHulpmiddelen ?? ruw.vereiste_hulpmiddelen,
    24,
    80,
  ).filter((n) => /^[a-z0-9][a-z0-9_.:-]{1,79}$/.test(n));
  const agentKoppelingen = schoonAgentKoppelingen(ruw.agentKoppelingen ?? ruw.agent_koppelingen);

  const alleTekst = [titelUk, titelNl, samenvattingUk, samenvattingNl, inhoudUk, inhoudNl, ...termenUk, ...termenNl];
  if (alleTekst.some((t) => heeftVerbodenGeheim(t))) {
    return { ok: false, code: 'VAARD_GEHEIM_VERBODEN' };
  }
  if (
    alleTekst.some((t) => taalwetOvertreding(t)) ||
    !CYRILLISCH.test(titelUk) ||
    !CYRILLISCH.test(samenvattingUk) ||
    !CYRILLISCH.test(inhoudUk) ||
    !LATIJNS.test(titelNl) ||
    !LATIJNS.test(samenvattingNl) ||
    !LATIJNS.test(inhoudNl)
  ) {
    return { ok: false, code: 'VAARD_TAALWET_GESCHONDEN' };
  }

  const bron = ruw.bron === 'geimporteerd' ? 'geimporteerd' : 'eigen';
  const actief = ruw.actief !== false;

  return {
    ok: true,
    waarde: {
      slug,
      titelUk,
      titelNl,
      samenvattingUk,
      samenvattingNl,
      inhoudUk,
      inhoudNl,
      termenUk,
      termenNl,
      vereisteHulpmiddelen,
      agentKoppelingen,
      bron,
      actief,
    },
  };
}

const schoonTerm = (waarde: unknown): string =>
  String(waarde ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

function berekenScore(vraag: string, item: VaardigheidItem): number {
  const vraagSchoon = schoonTerm(vraag);
  if (!vraagSchoon) return 0;
  const tekst = ` ${vraagSchoon} `;
  const woorden = vraagSchoon.split(' ');
  let score = 0;

  for (const waarde of [...item.termen.uk, ...item.termen.nl]) {
    const term = schoonTerm(waarde);
    if (!term) continue;
    if (tekst.includes(` ${term} `)) {
      score += term.includes(' ') ? 5 : 3;
    } else if (!term.includes(' ') && term.length >= 5 && woorden.some((w) => w.startsWith(term))) {
      score += 2;
    }
  }

  for (const veld of [item.id.replace(/-/g, ' '), item.titel.uk, item.titel.nl, item.samenvatting.uk, item.samenvatting.nl]) {
    const schoonVeld = schoonTerm(veld);
    if (!schoonVeld) continue;
    for (const w of woorden) {
      if (w.length >= 4 && schoonVeld.includes(w)) score += 1;
    }
  }
  return score;
}

export function isVaardigheidZichtbaarInRuimte(ruimteBereik: VaardigheidRuimteBereik, actieveRuimte: VaardigheidRuimte): boolean {
  if (actieveRuimte === 'technisch') return true;
  return ruimteBereik === 'prive' || ruimteBereik === 'beide';
}

export function isVaardigheidActiefVoorAgent(
  item: VaardigheidItem,
  standen: readonly VaardigheidAgentStand[],
  agentSlug?: AgentSlug,
  actieveRuimte: VaardigheidRuimte = 'prive',
): boolean {
  if (!isVaardigheidZichtbaarInRuimte(item.ruimte, actieveRuimte)) return false;

  if (agentSlug) {
    const eigenStand = standen.find((s) => s.vaardigheidId === item.id && s.agentSlug === agentSlug);
    if (eigenStand) return eigenStand.actief;
  }
  const globaleStand = standen.find((s) => s.vaardigheidId === item.id && s.agentSlug === '*');
  if (globaleStand) {
    if (!globaleStand.actief) return false;
  } else if (!item.actief) {
    return false;
  }

  if (!agentSlug) return true;
  if (item.agentKoppelingen.length === 0) return true;
  return item.agentKoppelingen.includes(agentSlug);
}

export function effectieveVaardighedenVoorAgent(
  items: readonly VaardigheidItem[],
  standen: readonly VaardigheidAgentStand[],
  opties: { agentSlug?: AgentSlug; ruimte?: VaardigheidRuimte } = {},
): VaardigheidItem[] {
  const ruimte = opties.ruimte ?? 'prive';
  return items.filter((item) => isVaardigheidActiefVoorAgent(item, standen, opties.agentSlug, ruimte));
}

export function heeftVereistHulpmiddel(zichtbaar: ReadonlySet<string>, vereist: string): boolean {
  if (zichtbaar.has(vereist)) return true;
  if (vereist.includes(':')) return false;
  const prefix = `${vereist}:`;
  for (const sleutel of zichtbaar) {
    if (sleutel.startsWith(prefix)) return true;
  }
  return false;
}

export function zoekEnRankVaardigheden(
  vraag: string,
  items: readonly VaardigheidItem[],
  opties: {
    standen?: readonly VaardigheidAgentStand[];
    agentSlug?: AgentSlug;
    ruimte?: VaardigheidRuimte;
    zichtbareHulpmiddelen?: readonly string[] | null;
    maximum?: number;
  } = {},
): VaardigheidAanbeveling[] {
  if (typeof vraag !== 'string' || !vraag.trim()) return [];
  const standen = opties.standen ?? [];
  const ruimte = opties.ruimte ?? 'prive';
  const zichtbaar = Array.isArray(opties.zichtbareHulpmiddelen) ? new Set(opties.zichtbareHulpmiddelen) : null;
  const max = Number.isInteger(opties.maximum) ? Math.max(1, Math.min(12, Number(opties.maximum))) : 5;

  return effectieveVaardighedenVoorAgent(items, standen, { agentSlug: opties.agentSlug, ruimte })
    .map((item) => {
      const score = berekenScore(vraag, item);
      const ontbrekend =
        zichtbaar === null ? [] : item.vereisteHulpmiddelen.filter((h) => !heeftVereistHulpmiddel(zichtbaar, h));
      const aansluiting: VaardigheidAansluiting =
        zichtbaar === null ? 'onbekend' : ontbrekend.length ? 'hulpmiddelen_ontbreken' : 'hulpmiddelen_aanwezig';
      return {
        id: item.id,
        uri: item.uri,
        bron: item.bron,
        ...(item.versieSemver ? { versieSemver: item.versieSemver } : {}),
        ...(item.afhankelijkheden ? { afhankelijkheden: [...item.afhankelijkheden] } : {}),
        titel: item.titel,
        samenvatting: item.samenvatting,
        score,
        aansluiting,
        ontbrekendeHulpmiddelen: ontbrekend,
      };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id, 'nl'))
    .slice(0, max);
}

export function splitsTweetaligeSkillInhoud(ruweInhoud: string, titelFallback?: VaardigheidTaalPaar): VaardigheidTaalPaar {
  const schoon = String(ruweInhoud ?? '').replace(/^---[\s\S]*?---\s*/, '').trim();
  const ukMatch = /<!--\s*lang:uk\s*-->([\s\S]*?)(?=<!--\s*lang:nl\s*-->|$)/i.exec(schoon);
  const nlMatch = /<!--\s*lang:nl\s*-->([\s\S]*?)(?=<!--\s*lang:uk\s*-->|$)/i.exec(schoon);
  if (ukMatch && nlMatch) {
    return { uk: ukMatch[1].trim(), nl: nlMatch[1].trim() };
  }
  const nlHeader = /\n##\s+Nederlands[^\n]*\n([\s\S]*)$/i.exec(schoon);
  if (nlHeader && nlHeader.index > 0) {
    return { uk: schoon.slice(0, nlHeader.index).trim(), nl: nlHeader[1].trim() };
  }
  const uk = schoon || `# ${titelFallback?.uk ?? ''}`;
  const nl = schoon
    ? `${schoon}\n\n_(Vertaling / Samenvatting: ${titelFallback?.nl ?? ''})_`
    : `# ${titelFallback?.nl ?? ''}`;
  return { uk, nl };
}

export function bouwSkillMarkdown(item: Pick<VaardigheidItem, 'id' | 'versie' | 'ruimte' | 'agentKoppelingen' | 'titel' | 'samenvatting' | 'inhoud' | 'vereisteHulpmiddelen'>): string {
  const lines = [
    '---',
    `name: ${item.id}`,
    `description: ${item.samenvatting.uk} ${item.samenvatting.nl}`,
    `versie: ${item.versie}`,
    `ruimte: ${item.ruimte}`,
    ...(item.agentKoppelingen.length ? [`agenten: ${item.agentKoppelingen.join(', ')}`] : []),
    ...(item.vereisteHulpmiddelen.length ? [`hulpmiddelen: ${item.vereisteHulpmiddelen.join(', ')}`] : []),
    '---',
    '',
    '<!-- lang:uk -->',
    `# ${item.titel.uk}`,
    '',
    item.inhoud.uk.trim(),
    '',
    '<!-- lang:nl -->',
    `# ${item.titel.nl}`,
    '',
    item.inhoud.nl.trim(),
    '',
  ];
  return lines.join('\n');
}

export function bouwVaardigheidPakket(item: VaardigheidItem): Record<string, unknown> {
  return {
    schema: 'mr-vaardigheid-v1',
    slug: item.id,
    versie: item.versie,
    ruimte: item.ruimte,
    actief: item.actief,
    agentKoppelingen: item.agentKoppelingen,
    titel: item.titel,
    samenvatting: item.samenvatting,
    inhoud: item.inhoud,
    termen: item.termen,
    vereisteHulpmiddelen: item.vereisteHulpmiddelen,
    markdown: bouwSkillMarkdown(item),
  };
}

export function parseerSkillMarkdown(ruweTekst: string): { ok: true; waarde: VaardigheidInvoer } | { ok: false; code: string } {
  const tekst = String(ruweTekst ?? '').replace(/\r\n/g, '\n').trim();
  const fm = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(tekst);
  if (!fm) return { ok: false, code: 'VAARD_MARKDOWN_ONGELDIG' };

  const meta: Record<string, string> = {};
  for (const line of fm[1].split('\n')) {
    const idx = line.indexOf(':');
    if (idx <= 0) continue;
    meta[line.slice(0, idx).trim().toLowerCase()] = line.slice(idx + 1).trim();
  }
  const slug = (meta.name ?? '').toLowerCase();
  const desc = meta.description ?? '';
  const body = fm[2].trim();
  if (!slug || !desc || !body) return { ok: false, code: 'VAARD_MARKDOWN_ONGELDIG' };

  const ukM = /<!--\s*lang:uk\s*-->([\s\S]*?)(?=<!--\s*lang:nl\s*-->|$)/i.exec(body);
  const nlM = /<!--\s*lang:nl\s*-->([\s\S]*?)(?=<!--\s*lang:uk\s*-->|$)/i.exec(body);
  const descDelen = desc.split(/(?<=[.!?])\s+/).filter(Boolean);
  const samenvattingUk = descDelen.find((d) => CYRILLISCH.test(d)) ?? desc;
  const samenvattingNl = descDelen.find((d) => !CYRILLISCH.test(d) && LATIJNS.test(d)) ?? desc;

  const ruwUk = (ukM ? ukM[1] : body).trim();
  const ruwNl = (nlM ? nlM[1] : body).trim();
  const inhoudUk = CYRILLISCH.test(ruwUk) ? ruwUk : `# ${samenvattingUk}\n\n${ruwUk}`.trim();
  const inhoudNl = LATIJNS.test(ruwNl) ? ruwNl : `# ${samenvattingNl}\n\n${ruwNl}`.trim();

  const ukHeading = /^#\s+(.+)$/m.exec(inhoudUk)?.[1]?.trim() || samenvattingUk.slice(0, 80);
  const nlHeading = /^#\s+(.+)$/m.exec(inhoudNl)?.[1]?.trim() || samenvattingNl.slice(0, 80);

  const agentKoppelingen = (meta.agenten ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => isAgentSlug(s)) as AgentSlug[];
  const vereisteHulpmiddelen = (meta.hulpmiddelen ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  return valideerVaardigheidInvoer({
    slug,
    titelUk: ukHeading,
    titelNl: nlHeading,
    samenvattingUk,
    samenvattingNl,
    inhoudUk,
    inhoudNl,
    termenUk: [slug.replace(/-/g, ' ')],
    termenNl: [slug.replace(/-/g, ' ')],
    vereisteHulpmiddelen,
    agentKoppelingen,
    bron: 'geimporteerd',
    actief: true,
  });
}

export function parseerVaardigheidInvoerPakket(ruw: unknown): { ok: true; waarde: VaardigheidInvoer } | { ok: false; code: string } {
  if (typeof ruw === 'string') {
    const trimmed = ruw.trim();
    if (trimmed.startsWith('{')) {
      try {
        return parseerVaardigheidInvoerPakket(JSON.parse(trimmed));
      } catch {
        return { ok: false, code: 'VAARD_MARKDOWN_ONGELDIG' };
      }
    }
    return parseerSkillMarkdown(trimmed);
  }
  if (!ruw || typeof ruw !== 'object' || Array.isArray(ruw)) {
    return { ok: false, code: 'VAARD_MARKDOWN_ONGELDIG' };
  }
  const o = ruw as Record<string, unknown>;
  if (typeof o.markdown === 'string' && !o.inhoudUk && !(o.inhoud && typeof o.inhoud === 'object')) {
    return parseerSkillMarkdown(o.markdown);
  }
  const titel = (o.titel && typeof o.titel === 'object' ? (o.titel as Record<string, unknown>) : {}) as Record<string, unknown>;
  const samenvatting = (o.samenvatting && typeof o.samenvatting === 'object' ? (o.samenvatting as Record<string, unknown>) : {}) as Record<string, unknown>;
  const inhoud = (o.inhoud && typeof o.inhoud === 'object' ? (o.inhoud as Record<string, unknown>) : {}) as Record<string, unknown>;
  const termen = (o.termen && typeof o.termen === 'object' ? (o.termen as Record<string, unknown>) : {}) as Record<string, unknown>;

  return valideerVaardigheidInvoer({
    slug: o.slug ?? o.id,
    titelUk: o.titelUk ?? o.titel_uk ?? titel.uk,
    titelNl: o.titelNl ?? o.titel_nl ?? titel.nl,
    samenvattingUk: o.samenvattingUk ?? o.samenvatting_uk ?? samenvatting.uk,
    samenvattingNl: o.samenvattingNl ?? o.samenvatting_nl ?? samenvatting.nl,
    inhoudUk: o.inhoudUk ?? o.inhoud_uk ?? inhoud.uk,
    inhoudNl: o.inhoudNl ?? o.inhoud_nl ?? inhoud.nl,
    termenUk: o.termenUk ?? o.termen_uk ?? termen.uk,
    termenNl: o.termenNl ?? o.termen_nl ?? termen.nl,
    vereisteHulpmiddelen: o.vereisteHulpmiddelen ?? o.vereiste_hulpmiddelen,
    agentKoppelingen: o.agentKoppelingen ?? o.agent_koppelingen,
    bron: 'geimporteerd',
    actief: o.actief !== false,
  });
}

export function standaardAgentProfielen(
  items: readonly VaardigheidItem[],
  standen: readonly VaardigheidAgentStand[],
  ruimte: VaardigheidRuimte,
) {
  return V2_AGENTEN.map((ag) => {
    const actiefVoorAgent = effectieveVaardighedenVoorAgent(items, standen, {
      agentSlug: ag.slug,
      ruimte,
    });
    return {
      slug: ag.slug,
      naam: ag.naam,
      actieveVaardigheden: actiefVoorAgent.map((v) => v.id),
      aantalActief: actiefVoorAgent.length,
    };
  });
}
