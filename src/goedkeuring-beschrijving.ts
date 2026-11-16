// SEC-002 interface-01 / interface-02 (12.11.2026): WAT een wachtend verzoek precies doet en WIE erom vraagt, voor elk venster met
// «Дозволити»: de lijst op de pagina Agenten (ook in «Огляд»), de chat van «ШІ для вас» en de lijst van site-hulpmiddelen.
//
// Vroeger: in «Огляд» géén parameters (compact), elders JSON.stringify(...).slice(0, 240|800|1200) in de volgorde van jsonb (sleutels
// op lengte gesorteerd, niet zoals verstuurd). Bij `exec` stond `command` daardoor achteraan en viel weg, bij github_comment_issue
// zag de mens alleen de tekst en niet repo/number, bij calendar_create_event niet de deelnemers. Een AI (of een prompt-injectie)
// kon zo een onschuldig begin en een schadelijke staart sturen; de mens drukte op «Дозволити» zonder de staart te zien.
//
// Nu: elk veld apart, in een vaste betekenisvolle volgorde (programma en argumenten eerst, pad vóór inhoud, repo/nummer/titel vóór
// tekst, deelnemers en «notify» als eigen regel), NIETS afgekapt (lange waarden klapt de mens zelf open; tot dan blijft «Дозволити»
// uit — zie GoedkeuringInhoud.tsx) en onzichtbare tekens (richting omdraaien, nulbreedte, besturingstekens) zichtbaar gemaakt.
// Puur: geen React, geen DOM — gedeeld door de vensters en de tests.

type Tr = (uk: string, nl: string) => string;

/** Vanaf deze lengte (of dit aantal regels) toont het venster eerst een begin met «показано N із M знаків». */
export const LANG_VANAF = 400;
export const LANG_REGELS = 12;

/** Betekenisvolle volgorde: wie/wat eerst, grote tekst als laatste. Onbekende sleutels komen alfabetisch tussen beide. */
const EERST = ['command', 'program', 'args', 'cwd', 'action', 'name', 'app', 'key', 'path', 'paths', 'from', 'to', 'dest', 'destination', 'url', 'uid', 'selector', 'option', 'pageId',
  'owner', 'repo', 'number', 'issue', 'pr', 'branch', 'ref', 'title', 'summary', 'subject', 'recipients', 'cc', 'bcc', 'attendees', 'notify', 'sendUpdates', 'start', 'end', 'calendarId',
  'mode', 'recursive', 'force', 'overwrite', 'append', 'size'];
const LAATST = ['text', 'description', 'message', 'body', 'html', 'content', 'script', 'code', 'function', 'expression', 'data'];
const rang = (k: string) => { const a = EERST.indexOf(k); if (a >= 0) return a; const b = LAATST.indexOf(k); return b >= 0 ? 10_000 + b : 5_000; };

/** Leesbare naam per veld (alleen waar die echt iets toevoegt; anders de sleutel zelf). */
const NAMEN: Record<string, [string, string]> = {
  command: ['Програма', 'Programma'], args: ['Аргументи', 'Argumenten'], cwd: ['Робоча тека', 'Werkmap'], path: ['Шлях', 'Pad'], paths: ['Шляхи', 'Paden'],
  content: ['Вміст', 'Inhoud'], body: ['Текст', 'Tekst'], text: ['Текст', 'Tekst'], repo: ['Репозиторій', 'Repository'], owner: ['Власник', 'Eigenaar'], number: ['Номер', 'Nummer'],
  title: ['Заголовок', 'Titel'], subject: ['Тема', 'Onderwerp'], to: ['Кому', 'Aan'], cc: ['Копія', 'Kopie'], bcc: ['Прихована копія', 'Blinde kopie'], attendees: ['Учасники', 'Deelnemers'],
  notify: ['Сповістити учасників', 'Deelnemers verwittigen'], sendUpdates: ['Надіслати учасникам', 'Naar deelnemers sturen'], start: ['Початок', 'Begin'], end: ['Кінець', 'Einde'],
  url: ['Адреса', 'Adres'], name: ['Назва', 'Naam'], app: ['Додаток', 'App'], key: ['Ключ', 'Sleutel'], action: ['Дія', 'Actie'], description: ['Опис', 'Beschrijving'],
  message: ['Повідомлення', 'Bericht'], script: ['Скрипт', 'Script'], code: ['Код', 'Code'], recursive: ['Рекурсивно', 'Recursief'], force: ['Примусово', 'Geforceerd'],
};

/** Onzichtbare of misleidende tekens (bidi-overrides, nulbreedte, besturingstekens behalve \n en \t) als ⟦U+XXXX⟧. */
// eslint-disable-next-line no-control-regex
const ONZICHTBAAR = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u00ad\u061c\u115f\u1160\u180e\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u206f\u3164\ufe00-\ufe0f\ufeff\uffa0\ufff9-\ufffb]/g;
export function zichtbaarMaken(s: string): { tekst: string; verborgen: number } {
  let verborgen = 0;
  const tekst = s.replace(ONZICHTBAAR, (c) => { verborgen += 1; return `⟦U+${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}⟧`; });
  return { tekst, verborgen };
}

const alsTekst = (v: unknown): string => {
  if (v === null || v === undefined) return String(v);
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'bigint') return String(v);
  // Een lijst van korte waarden op één regel (zo ziet de mens de grenzen tussen argumenten); al het andere ingesprongen.
  try {
    if (Array.isArray(v) && v.every((x) => x === null || ['string', 'number', 'boolean'].includes(typeof x))) return JSON.stringify(v);
    return JSON.stringify(v, null, 2) ?? String(v);
  } catch { return String(v); }
};

export type Veld = { sleutel: string; label: string; waarde: string; tekens: number; lang: boolean; verborgen: number };
export type Beschrijving = { velden: Veld[]; lang: boolean; verborgen: number; leeg: boolean };

/** Alle parameters van een verzoek als velden, in betekenisvolle volgorde en volledig. Een niet-object (tekst, lijst) is één veld. */
export function beschrijfParams(params: unknown, tr: Tr): Beschrijving {
  const paren: Array<[string, unknown]> = params && typeof params === 'object' && !Array.isArray(params)
    ? Object.entries(params as Record<string, unknown>)
    : params === undefined || params === null ? [] : [['', params]];
  paren.sort(([a], [b]) => rang(a) - rang(b) || a.localeCompare(b));
  const velden = paren.map(([sleutel, v]) => {
    const { tekst, verborgen } = zichtbaarMaken(alsTekst(v));
    const n = NAMEN[sleutel];
    const label = n ? `${tr(n[0], n[1])} (${sleutel})` : sleutel || tr('Значення', 'Waarde');
    const lang = tekst.length > LANG_VANAF || tekst.split('\n').length > LANG_REGELS;
    return { sleutel, label, waarde: tekst, tekens: tekst.length, lang, verborgen };
  });
  return { velden, lang: velden.some((v) => v.lang), verborgen: velden.reduce((s, v) => s + v.verborgen, 0), leeg: velden.length === 0 };
}

/** Eén korte regel over wat er gebeurt (voor de kop van een verzoek): programma + argumenten, pad + grootte, repo#nummer, deelnemers. */
export function kernVan(params: unknown, tr: Tr): string {
  if (!params || typeof params !== 'object' || Array.isArray(params)) return '';
  const p = params as Record<string, unknown>;
  const s = (v: unknown) => zichtbaarMaken(alsTekst(v)).tekst;
  const delen: string[] = [];
  if (typeof p.command === 'string') delen.push(`${s(p.command)}${Array.isArray(p.args) ? ` ${p.args.map((a) => JSON.stringify(String(a))).join(' ')}` : ''}`);
  if (typeof p.path === 'string') delen.push(`${s(p.path)}${typeof p.content === 'string' ? ` · ${tr(`${p.content.length} знаків`, `${p.content.length} tekens`)}` : ''}`);
  if (p.repo !== undefined) delen.push(`${s(p.owner ? `${s(p.owner)}/${s(p.repo)}` : p.repo)}${p.number !== undefined ? `#${s(p.number)}` : ''}`);
  if (p.attendees !== undefined) delen.push(`${tr('учасники', 'deelnemers')}: ${s(p.attendees)}`);
  if (p.to !== undefined) delen.push(`${tr('кому', 'aan')}: ${s(p.to)}`);
  return delen.join(' · ');
}

export type Aanvrager = { client?: string; agent?: string; verbinding?: string; site?: boolean } | null | undefined;
/**
 * WIE vroeg dit? De naam van de klant zoals de server die bij de geauthenticeerde verbinding kent (nooit een vaste «Claude»), met de
 * agent en een stukje van het verbindings-id. Onbekend blijft eerlijk onbekend, met een waarschuwing.
 */
export function aanvragerTekst(a: Aanvrager, tr: Tr): { tekst: string; onbekend: boolean; site: boolean } {
  if (a?.site) return { tekst: tr('Ви (з сайту)', 'U (vanaf de site)'), onbekend: false, site: true };
  const client = String(a?.client ?? '').trim().slice(0, 80);
  // g10a-4: '?' is de naam die de server geeft als de klant er geen had — ook dat is onbekend, met waarschuwing.
  if (!client || client === '?') return { tekst: tr('Невідомий клієнт ШІ', 'Onbekende AI-klant'), onbekend: true, site: false };
  const agent = String(a?.agent ?? '').trim();
  const verbinding = String(a?.verbinding ?? '').trim();
  const extra = [agent && agent.toLowerCase() !== client.toLowerCase() ? agent : '', verbinding ? `${tr('підключення', 'verbinding')} ${verbinding}…` : ''].filter(Boolean).join(' · ');
  // SEC-002 (slot «u», interface п.9): de server bewaart een klantnaam die op het teken van de site lijkt («site:…») met het
  // voorvoegsel «ШІ «…»» (backend/connectors-opslag.ts, max. 80 tekens — het slotteken kan ontbreken). Op het scherm in de taal
  // van de mens: in het Nederlands «AI «…»».
  const gemerkt = /^ШІ «([\s\S]*?)»?$/.exec(client);
  const naam = gemerkt ? tr(`ШІ «${gemerkt[1]}»`, `AI «${gemerkt[1]}»`) : client;
  return { tekst: zichtbaarMaken(extra ? `${naam} · ${extra}` : naam).tekst, onbekend: false, site: false };
}
