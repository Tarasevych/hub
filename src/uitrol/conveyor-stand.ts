// UITROL-001 · Stand van de acht knopen van de «конвеєр» (pijplijn) van een uitrol, puur en testbaar (tests/eenheid/uitrol-conveyor.test.ts):
//   Вимоги → Завантаження → Перевірка сайту → Схвалення → Підготовка (root) → База даних → Перемикання → Здоров’я.
// De eerste vier komen uit de wizard (Flow) of zijn bij een lopende run al voorbij; de laatste vier uit de run van root
// (stappen.jsonl + de voortgangsregels «[installeer] stap: <id> (<pct>%)» in het logboek, met tijdstip en duur per onderdeel).
// Стан восьми вузлів конвеєра розгортання; тривалості — з реальних рядків журналу.
import type { Flow, Regel, Run } from './types';

export type KnoopId = 'vereisten' | 'upload' | 'controle' | 'goedkeuring' | 'voorbereiding' | 'database' | 'overschakelen' | 'gezondheid';
export type KnoopStand = 'wacht' | 'actief' | 'ok' | 'fout' | 'gestopt' | 'overgeslagen';
export type Onderdeel = { id: string; uk: string; nl: string; knoop: KnoopId; tijd?: string; duurMs: number | null; stand: KnoopStand; pct?: number };
export type Knoop = { id: KnoopId; uk: string; nl: string; hulpUk: string; hulpNl: string; stand: KnoopStand; sub: string; subNl: string; duurMs: number | null; onderdelen: Onderdeel[] };

// Zachte afbreekstreepjes (U+00AD) in lange namen: op een smal scherm breekt het woord netjes af, elders onzichtbaar.
export const KNOPEN: Array<{ id: KnoopId; uk: string; nl: string; hulpUk: string; hulpNl: string }> = [
  { id: 'vereisten', uk: 'Вимоги', nl: 'Vereisten', hulpUk: 'Браузер читає архів, рахує SHA-256; сервер перевіряє вимоги; root пробує нові міграції на копії схеми — до завантаження', hulpNl: 'De browser leest het archief en berekent SHA-256; de server controleert de vereisten; root probeert nieuwe migraties op een kopie — vóór het uploaden' },
  { id: 'upload', uk: 'Заванта­ження', nl: 'Upload', hulpUk: 'Архів частинами на сервер; обрив мережі не страшний — продовжиться з місця зупинки', hulpNl: 'Het archief in stukken naar de server; een netwerkonderbreking is niet erg — het gaat verder waar het stopte' },
  { id: 'controle', uk: 'Перевірка сайту', nl: 'Controle site', hulpUk: 'SHA-256 звірено; структура, метадані, маніфест, міграції; SQL збігається з перевіреним пробою', hulpNl: 'SHA-256 vergeleken; structuur, metadata, manifest, migraties; SQL gelijk aan wat de proef controleerde' },
  { id: 'goedkeuring', uk: 'Схвалення', nl: 'Goed­keuring', hulpUk: 'Passkey власника; схвалення прив’язане до sha256 цього пакета й діє 5 хвилин', hulpNl: 'Passkey van de eigenaar; de goedkeuring is gebonden aan de sha256 van dit pakket en geldt 5 minuten' },
  { id: 'voorbereiding', uk: 'Підго­товка', nl: 'Voor­bereiding', hulpUk: 'Root: копія, перевірка passkey і вмісту, проба міграцій, npm ci, збірка — у новій теці, сайт працює далі', hulpNl: 'Root: kopie, passkey- en inhoudscontrole, migratieproef, npm ci, bouwen — in een nieuwe map, de site draait door' },
  { id: 'database', uk: 'База даних', nl: 'Database', hulpUk: 'Версія PostgreSQL, резервна копія, міграції (кожна в окремій транзакції)', hulpNl: 'PostgreSQL-versie, back-up, migraties (elk in een eigen transactie)' },
  { id: 'overschakelen', uk: 'Переми­кання', nl: 'Over­schakelen', hulpUk: 'Символьне посилання на новий випуск і перезапуск служби — з цього моменту зупинити вже не можна', hulpNl: 'Symlink naar de nieuwe release en herstart van de dienst — vanaf hier kan niet meer gestopt worden' },
  { id: 'gezondheid', uk: 'Здоров’я', nl: 'Gezondheid', hulpUk: 'Перевірка роботи сайту й нагляд; у разі збою — автоматичний відкат на попередній випуск', hulpNl: 'Gezondheidscontrole en nabewaking; bij een storing automatische terugdraai naar de vorige release' },
];

/** Onderdelen van installeer-app.sh («stap: <id> (<pct>%)») → knoop en leesbare naam. */
export const ONDERDELEN: Record<string, { uk: string; nl: string; knoop: KnoopId }> = {
  proef: { uk: 'проба міграцій на копії схеми', nl: 'migratieproef op een kopie van het schema', knoop: 'voorbereiding' },
  kopie: { uk: 'копіювання коду', nl: 'broncode kopiëren', knoop: 'voorbereiding' },
  npm: { uk: 'npm ci (залежності)', nl: 'npm ci (afhankelijkheden)', knoop: 'voorbereiding' },
  bouwen: { uk: 'збірка (vite, сервер)', nl: 'bouwen (vite, server)', knoop: 'voorbereiding' },
  pgversie: { uk: 'перевірка версії PostgreSQL', nl: 'PostgreSQL-versie controleren', knoop: 'database' },
  backup: { uk: 'резервна копія бази', nl: 'back-up van de database', knoop: 'database' },
  migraties: { uk: 'міграції бази даних', nl: 'databasemigraties', knoop: 'database' },
  activeren: { uk: 'перемикання й перезапуск служби', nl: 'overschakelen en de dienst herstarten', knoop: 'overschakelen' },
  gezondheid: { uk: 'перевірка роботи сайту', nl: 'gezondheidscontrole', knoop: 'gezondheid' },
  nabewaken: { uk: 'нагляд за новим випуском', nl: 'nabewaking van de nieuwe release', knoop: 'gezondheid' },
  gestopt: { uk: 'зупинено власником', nl: 'gestopt door de eigenaar', knoop: 'voorbereiding' },
};
const ROOT_STAPPEN: Record<string, { uk: string; nl: string }> = {
  ontvangen: { uk: 'пакет отримано', nl: 'pakket ontvangen' }, kopie: { uk: 'копія в робочу теку root', nl: 'kopie naar de werkmap van root' },
  echtheid: { uk: 'перевірка passkey і sha256', nl: 'passkey en sha256 controleren' }, inhoud: { uk: 'перевірка вмісту', nl: 'inhoud controleren' },
};
const STAP_REGEL = /^\[installeer\] stap: (\S+) \((\d+)%\)/;
const VOLGORDE: KnoopId[] = KNOPEN.map((k) => k.id);

/** Onderdelen van de installer uit de logregels, met begintijd en duur (tot het volgende onderdeel, of tot `eind`/nu als het nog loopt). */
export function installerOnderdelen(regels: Regel[], eind?: string, nu = Date.now()): Onderdeel[] {
  const uit: Onderdeel[] = [];
  for (const r of regels) {
    const m = STAP_REGEL.exec(r.tekst);
    if (!m) continue;
    const id = m[1]; const def = ONDERDELEN[id];
    if (!def || uit.some((o) => o.id === id)) continue;
    uit.push({ id, uk: def.uk, nl: def.nl, knoop: def.knoop, tijd: r.tijd, duurMs: null, stand: 'actief', pct: Number(m[2]) || 0 });
  }
  uit.forEach((o, i) => {
    const volgende = uit[i + 1];
    const tot = volgende ? Date.parse(volgende.tijd || '') : eind ? Date.parse(eind) : nu;
    const van = Date.parse(o.tijd || '');
    o.duurMs = Number.isFinite(van) && Number.isFinite(tot) && tot >= van ? tot - van : null;
    if (volgende) o.stand = 'ok';
    if (o.id === 'gestopt') o.stand = 'gestopt';
  });
  return uit;
}

type Invoer = {
  run: Run | null; regels: Regel[]; flow?: Flow; nieuweFlow: boolean; wachtend: number; goedgekeurd: number; nu?: number;
};

/** De acht knopen met stand, lopend onderdeel, duur en uitklapbare onderdelen. */
export function conveyorStand({ run, regels, flow, nieuweFlow, wachtend, goedgekeurd, nu = Date.now() }: Invoer): Knoop[] {
  const knopen: Knoop[] = KNOPEN.map((k) => ({ ...k, stand: 'wacht', sub: '', subNl: '', duurMs: null, onderdelen: [] }));
  const zetSub = (id: KnoopId, uk: string, nl = uk) => { K(id).sub = uk; K(id).subNl = nl; };
  const K = (id: KnoopId) => knopen[VOLGORDE.indexOf(id)];
  const totEnMet = (id: KnoopId, stand: KnoopStand) => { for (const k of knopen) { if (k.stand === 'wacht') k.stand = stand; if (k.id === id) break; } };

  // ---- A. wizard (nieuw bestand, nog geen run van root voor dit pakket)
  if (nieuweFlow && flow && flow.fase !== 'leeg') {
    const stap = flow.stap || (flow.fase === 'goedkeuring' ? 'goedkeuring' : 'vereisten');
    const idx = VOLGORDE.indexOf(stap);
    knopen.forEach((k, i) => { if (i < idx) k.stand = 'ok'; else if (i === idx) k.stand = flow.stand === 'fout' ? 'fout' : 'actief'; });
    if (K(stap).stand === 'actief' || K(stap).stand === 'fout') zetSub(stap, flow.detail || '');
    return knopen;
  }

  // ---- B. run van root (passkey, handtekening, ssh)
  if (run) {
    const ssh = run.methode === 'ssh';
    const stap = (naam: string) => run.stappen.find((s) => s.stap === naam);
    // Vóór root: bij passkey allemaal gedaan; bij ssh/handtekening niet van toepassing («overgeslagen»).
    for (const id of ['vereisten', 'upload', 'controle', 'goedkeuring'] as KnoopId[]) K(id).stand = run.methode === 'passkey' ? 'ok' : 'overgeslagen';
    if (run.methode === 'passkey') zetSub('goedkeuring', run.goedgekeurdDoor || '');
    const onderdelen = installerOnderdelen(regels, run.staat !== 'bezig' ? run.geeindigd || run.bijgewerkt : undefined, nu);
    for (const o of onderdelen) K(o.knoop).onderdelen.push(o);
    // Root-controles (stappen.jsonl) horen bij «Підготовка», vóór de installer-onderdelen.
    const rootControles: Onderdeel[] = [];
    for (const id of ['ontvangen', 'kopie', 'echtheid', 'inhoud']) {
      const s = stap(id); if (!s) continue;
      rootControles.push({ id: `root-${id}`, uk: ROOT_STAPPEN[id].uk, nl: ROOT_STAPPEN[id].nl, knoop: 'voorbereiding', tijd: s.tijd, duurMs: null, stand: s.staat === 'ok' ? 'ok' : s.staat === 'fout' ? 'fout' : 'actief', pct: s.pct });
    }
    rootControles.forEach((o, i) => { const volgende = rootControles[i + 1] || K('voorbereiding').onderdelen[0]; const tot = volgende?.tijd ? Date.parse(volgende.tijd) : NaN; const van = Date.parse(o.tijd || ''); o.duurMs = Number.isFinite(van) && Number.isFinite(tot) && tot >= van ? tot - van : null; });
    K('voorbereiding').onderdelen.unshift(...rootControles);
    if (ssh) { for (const id of ['voorbereiding', 'database', 'overschakelen'] as KnoopId[]) K(id).stand = 'overgeslagen'; K('gezondheid').stand = run.staat === 'klaar' ? 'ok' : run.staat === 'bezig' ? 'actief' : 'fout'; return knopen; }
    // Welke knoop loopt: het laatste onderdeel, anders de root-controles.
    const laatste = onderdelen[onderdelen.length - 1];
    const lopend: KnoopId = laatste ? laatste.knoop : 'voorbereiding';
    const lopendIdx = VOLGORDE.indexOf(lopend);
    knopen.forEach((k, i) => { if (i >= 4 && i < lopendIdx) k.stand = 'ok'; });
    if (run.staat === 'klaar') { for (const k of knopen) if (k.stand === 'wacht' || k.stand === 'actief') k.stand = 'ok'; }
    else if (run.staat === 'bezig') { K(lopend).stand = 'actief'; if (!laatste) { const r = stap('inhoud') ? ROOT_STAPPEN.inhoud : stap('echtheid') ? ROOT_STAPPEN.echtheid : stap('kopie') ? ROOT_STAPPEN.kopie : ROOT_STAPPEN.ontvangen; zetSub(lopend, r.uk, r.nl); } }
    else { K(lopend).stand = run.code === 'GESTOPT' || onderdelen.some((o) => o.id === 'gestopt') ? 'gestopt' : 'fout'; }
    if (laatste && K(lopend).stand === 'actief') zetSub(lopend, laatste.uk, laatste.nl);
    // Duur per knoop = som van de onderdelen (root-controles én installer-onderdelen met een bekende duur).
    for (const k of knopen) { const d = k.onderdelen.filter((o) => o.duurMs !== null); k.duurMs = d.length ? d.reduce((s, o) => s + (o.duurMs || 0), 0) : null; }
    totEnMet('goedkeuring', run.methode === 'passkey' ? 'ok' : 'overgeslagen');
    return knopen;
  }

  // ---- C. geen run: goedgekeurd (root pakt op) of wachtend op passkey
  if (goedgekeurd > 0) { totEnMet('goedkeuring', 'ok'); K('voorbereiding').stand = 'actief'; return knopen; }
  if (wachtend > 0) { totEnMet('controle', 'ok'); K('goedkeuring').stand = 'actief'; return knopen; }
  return knopen;
}
