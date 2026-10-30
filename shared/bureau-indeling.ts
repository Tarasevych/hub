// Bureaublad van de hub («Мій простір» → /overzicht): de gebruiker legt zelf tegels (widgets) op een raster neer,
// sleept ze, wijzigt hun formaat en bewaart de indeling PER GEBRUIKER op de server (backend/hub-bureau.ts).
//
// Waarom een geordende lijst met formaat in rastereenheden en geen vrije x/y-coördinaten:
// hetzelfde bureaublad moet werken op een telefoon (1 kolom) en op een brede monitor (12 kolommen). Een geordende lijst
// schuift vanzelf mee, is met het toetsenbord te bedienen en is eenvoudig te valideren. De vensterafhandeling zelf
// (slepen, formaat, dok) komt uit src/platform/vensters.* — dit bestand beschrijft alleen WAT er op het bureaublad ligt.
//
// Eerlijkheidsregel (zelfde regel als shared/integraties-catalogus.ts):
//   `stand: 'klaar'`       de tegel leest ECHTE gegevens; `bron` noemt de route die dat doet.
//   `stand: 'binnenkort'`  er is GEEN bron die de hub mag aanroepen. Zulke tegels staan in de catalogus (met uitleg in
//                          `ontbreekt`) maar kunnen NIET op het bureaublad worden gelegd — normaliseerBureau gooit ze eruit.
// Zo kan er nooit een tegel op het bureaublad staan die doet alsof ze werkt.

export type BureauCategorie = 'post' | 'agenda' | 'bestanden' | 'taken' | 'notities' | 'github' | 'diensten' | 'ai';
export type BureauStand = 'klaar' | 'binnenkort';
export type BureauWidgetId =
  | 'post-laatste' | 'post-tellers'
  | 'agenda-komend' | 'agenda-vandaag'
  | 'bestanden-recent'
  | 'taken-volgende' | 'taken-tellers'
  | 'notities-laatste' | 'notities-vast'
  | 'diensten-stand'
  | 'github-activiteit'
  | 'ai-toegang';

export type Tweetalig = readonly [string, string];

export type BureauWidgetDef = {
  id: BureauWidgetId;
  cat: BureauCategorie;
  titel: Tweetalig;
  uitleg: Tweetalig;
  /** standaardformaat: kolommen (van 12) en rijen */
  k: number; r: number;
  /** kleinste toegestane formaat */
  minK: number; minR: number;
  stand: BureauStand;
  /** De route die de echte gegevens levert. Leeg bij 'binnenkort'. */
  bron: string;
  /** Wat er nog ontbreekt. Verplicht bij 'binnenkort', leeg bij 'klaar'. */
  ontbreekt?: Tweetalig;
};

export const KOLOMMEN = [3, 4, 6, 8, 12] as const;
export const RIJEN = [1, 2, 3, 4] as const;
export const RASTER_KOLOMMEN = 12;
export const MAX_TEGELS = 16;

export const BUREAU_CATEGORIEEN: ReadonlyArray<{ id: BureauCategorie; titel: Tweetalig; icoon: string }> = Object.freeze([
  { id: 'post', titel: ['Пошта', 'E-mail'], icoon: 'mail' },
  { id: 'agenda', titel: ['Календар', 'Agenda'], icoon: 'calendar' },
  { id: 'bestanden', titel: ['Файли', 'Bestanden'], icoon: 'folder' },
  { id: 'taken', titel: ['Завдання', 'Taken'], icoon: 'list' },
  { id: 'notities', titel: ['Нотатки', 'Notities'], icoon: 'note' },
  { id: 'github', titel: ['GitHub', 'GitHub'], icoon: 'code' },
  { id: 'diensten', titel: ['Стан сервісів', 'Status van diensten'], icoon: 'activity' },
  { id: 'ai', titel: ['ШІ', 'AI'], icoon: 'bot' },
]);

export const BUREAU_WIDGETS: readonly BureauWidgetDef[] = Object.freeze([
  {
    id: 'post-laatste', cat: 'post', titel: ['Останні листи', 'Laatste berichten'],
    uitleg: ['Останні листи з вашої синхронізованої поштової проєкції.', 'De laatste berichten uit uw gesynchroniseerde mailprojectie.'],
    k: 6, r: 3, minK: 4, minR: 2, stand: 'klaar', bron: 'POST /api/owner/hub/blocks/data',
  },
  {
    id: 'post-tellers', cat: 'post', titel: ['Пошта — лічильники', 'E-mail — tellers'],
    uitleg: ['Скільки листів у проєкції й скільки з них непрочитані.', 'Hoeveel berichten in de projectie staan en hoeveel daarvan ongelezen zijn.'],
    k: 3, r: 1, minK: 3, minR: 1, stand: 'klaar', bron: 'POST /api/owner/hub/blocks/data',
  },
  {
    id: 'agenda-komend', cat: 'agenda', titel: ['Найближчі події', 'Aankomende afspraken'],
    uitleg: ['Майбутні події з підключеного календаря Google (лише читання).', 'Aankomende afspraken uit de gekoppelde Google-agenda (alleen lezen).'],
    k: 6, r: 3, minK: 4, minR: 2, stand: 'klaar', bron: 'POST /api/owner/hub/blocks/data',
  },
  {
    id: 'agenda-vandaag', cat: 'agenda', titel: ['Сьогодні в календарі', 'Vandaag in de agenda'],
    uitleg: ['Події, що починаються протягом наступних 24 годин.', 'Afspraken die in de komende 24 uur beginnen.'],
    k: 4, r: 2, minK: 3, minR: 1, stand: 'klaar', bron: 'POST /api/owner/hub/blocks/data',
  },
  {
    id: 'bestanden-recent', cat: 'bestanden', titel: ['Останні файли', 'Laatste bestanden'],
    uitleg: ['Останні файли з вашої хмари й проєкції Google Drive.', 'De laatste bestanden uit uw cloud en de Google Drive-projectie.'],
    k: 6, r: 3, minK: 4, minR: 2, stand: 'klaar', bron: 'POST /api/owner/hub/blocks/data',
  },
  {
    id: 'taken-volgende', cat: 'taken', titel: ['Наступні завдання', 'Volgende taken'],
    uitleg: ['Завдання з вашої дошки, що ще не завершені.', 'Taken van uw bord die nog niet klaar zijn.'],
    k: 4, r: 3, minK: 3, minR: 2, stand: 'klaar', bron: 'POST /api/mcp/board/list',
  },
  {
    id: 'taken-tellers', cat: 'taken', titel: ['Завдання — лічильники', 'Taken — tellers'],
    uitleg: ['Скільки завдань у кожному стані дошки.', 'Hoeveel taken in elke stand van het bord staan.'],
    k: 3, r: 1, minK: 3, minR: 1, stand: 'klaar', bron: 'POST /api/mcp/board/list',
  },
  {
    id: 'notities-laatste', cat: 'notities', titel: ['Останні нотатки', 'Laatste notities'],
    uitleg: ['Останні нотатки цього простору (вкладка «Нотатки»).', 'De laatste notities van deze ruimte (tabblad «Notities»).'],
    k: 4, r: 3, minK: 3, minR: 2, stand: 'klaar', bron: 'POST /api/mcp/board/list',
  },
  {
    id: 'notities-vast', cat: 'notities', titel: ['Закріплені нотатки', 'Vastgezette notities'],
    uitleg: ['Нотатки, які ви закріпили.', 'Notities die u hebt vastgezet.'],
    k: 4, r: 2, minK: 3, minR: 1, stand: 'klaar', bron: 'POST /api/mcp/board/list',
  },
  {
    id: 'diensten-stand', cat: 'diensten', titel: ['Стан моїх служб', 'Status van mijn diensten'],
    uitleg: ['Пошта, календар, Drive, пристрої — стан саме вашого акаунта.', 'E-mail, agenda, Drive, apparaten — de stand van uw eigen account.'],
    k: 6, r: 3, minK: 4, minR: 2, stand: 'klaar', bron: 'POST /api/owner/diagnostiek/mijn-diensten',
  },
  {
    id: 'github-activiteit', cat: 'github', titel: ['GitHub — активність', 'GitHub — activiteit'],
    uitleg: ['Ваші останні дії в GitHub.', 'Uw laatste acties in GitHub.'],
    k: 6, r: 3, minK: 4, minR: 2, stand: 'binnenkort', bron: '',
    ontbreekt: [
      'Маршрути GitHub на сервері приймають лише сесію сервісу github.tarasevych.com, тому хаб не може їх запитати. Потрібен окремий маршрут для хаба.',
      'De GitHub-routes op de server accepteren alleen een sessie van github.tarasevych.com, dus de hub mag ze niet aanroepen. Er is een eigen route voor de hub nodig.',
    ],
  },
  {
    id: 'ai-toegang', cat: 'ai', titel: ['Дозволи ШІ', 'AI-toestemmingen'],
    uitleg: ['Які дозволи ШІ активні у вашому просторі.', 'Welke AI-toestemmingen in uw ruimte actief zijn.'],
    k: 4, r: 2, minK: 3, minR: 1, stand: 'binnenkort', bron: '',
    ontbreekt: [
      'Маршрут дозволів ШІ приймає лише сесії mcp, ai та api — хаб у цьому списку немає. Потрібен маршрут читання для хаба.',
      'De route voor AI-toestemmingen accepteert alleen sessies van mcp, ai en api — de hub staat niet in die lijst. Er is een leesroute voor de hub nodig.',
    ],
  },
]);

export const BUREAU_WIDGET_IDS: readonly BureauWidgetId[] = Object.freeze(BUREAU_WIDGETS.map((w) => w.id));
export const bureauWidget = (id: unknown): BureauWidgetDef | undefined => BUREAU_WIDGETS.find((w) => w.id === id);
/** Alleen deze tegels mogen op het bureaublad liggen: ze lezen echte gegevens. */
export const plaatsbaar = (id: unknown): boolean => bureauWidget(id)?.stand === 'klaar';

/** Eén tegel op het bureaublad. `tid` is de instantie (dezelfde widget mag er twee keer liggen). */
export type BureauTegel = { tid: string; id: BureauWidgetId; k: number; r: number };
export type BureauIndeling = { v: 1; tegels: BureauTegel[] };

export const TID = /^[a-z][a-z0-9_-]{0,23}$/;

/** Leeg bureaublad: de ECHTE begintoestand. De gebruiker legt zelf zijn eerste tegels neer. */
export const leegBureau = (): BureauIndeling => ({ v: 1, tegels: [] });
export const leegIs = (ind: BureauIndeling): boolean => ind.tegels.length === 0;

/** Voorstel voor de lege toestand: de drie tegels waarmee bijna iedereen begint (alle drie «klaar»). */
export const EERSTE_SUGGESTIE: readonly BureauWidgetId[] = Object.freeze(['post-laatste', 'agenda-komend', 'taken-volgende']);

const dichtstBij = (waarde: number, toegestaan: readonly number[], min: number) => {
  const mogelijk = toegestaan.filter((x) => x >= min);
  const lijst = mogelijk.length ? mogelijk : toegestaan;
  let beste = lijst[0];
  for (const x of lijst) if (Math.abs(x - waarde) < Math.abs(beste - waarde)) beste = x;
  return beste;
};

/** Eerste vrije instantie-id (t1, t2, …): zuiver, dus server en browser komen op hetzelfde uit. */
export function nieuweTid(ind: BureauIndeling): string {
  const bezet = new Set(ind.tegels.map((t) => t.tid));
  for (let n = 1; n <= MAX_TEGELS + 1; n += 1) { const kandidaat = `t${n}`; if (!bezet.has(kandidaat)) return kandidaat; }
  return `t${MAX_TEGELS + 2}`;
}

/**
 * Maakt van willekeurige invoer een geldige indeling. Dezelfde functie draait in de browser én op de server
 * (de server vertrouwt de browser niet): onbekende widgets, niet-plaatsbare («binnenkort») widgets, dubbele of
 * onbruikbare instantie-id's en formaten buiten het raster vallen weg of worden rechtgezet.
 */
export function normaliseerBureau(raw: unknown): BureauIndeling {
  const bron = raw && typeof raw === 'object' ? (raw as { tegels?: unknown }).tegels : undefined;
  const tegels: BureauTegel[] = [];
  if (Array.isArray(bron)) {
    const gezien = new Set<string>();
    for (const rij of bron.slice(0, MAX_TEGELS * 3)) {
      if (tegels.length >= MAX_TEGELS) break;
      if (!rij || typeof rij !== 'object' || Array.isArray(rij)) continue;
      const o = rij as Record<string, unknown>;
      const def = bureauWidget(o.id);
      if (!def || def.stand !== 'klaar') continue;
      const gevraagd = typeof o.tid === 'string' && TID.test(o.tid) ? o.tid : '';
      let tid = gevraagd && !gezien.has(gevraagd) ? gevraagd : '';
      if (!tid) { tid = nieuweTid({ v: 1, tegels }); if (gezien.has(tid)) continue; }
      gezien.add(tid);
      tegels.push({
        tid, id: def.id,
        k: dichtstBij(Number(o.k) || def.k, KOLOMMEN, def.minK),
        r: dichtstBij(Number(o.r) || def.r, RIJEN, def.minR),
      });
    }
  }
  return { v: 1, tegels };
}

/** Legt een tegel achteraan neer. Weigert onbekende, nog niet werkende en te veel tegels. */
export function voegTegelToe(ind: BureauIndeling, id: unknown): BureauIndeling {
  const def = bureauWidget(id);
  if (!def || def.stand !== 'klaar' || ind.tegels.length >= MAX_TEGELS) return ind;
  return { v: 1, tegels: [...ind.tegels, { tid: nieuweTid(ind), id: def.id, k: def.k, r: def.r }] };
}

export function verwijderTegel(ind: BureauIndeling, tid: string): BureauIndeling {
  const over = ind.tegels.filter((t) => t.tid !== tid);
  return over.length === ind.tegels.length ? ind : { v: 1, tegels: over };
}

/** Verplaatst een tegel naar een andere plek in de volgorde (dat is de plek op het raster). */
export function verplaatsTegel(ind: BureauIndeling, tid: string, naar: number): BureauIndeling {
  const van = ind.tegels.findIndex((t) => t.tid === tid);
  if (van < 0) return ind;
  const doel = Math.max(0, Math.min(ind.tegels.length - 1, Math.trunc(naar)));
  if (doel === van) return ind;
  const tegels = ind.tegels.slice();
  const [tegel] = tegels.splice(van, 1);
  tegels.splice(doel, 0, tegel);
  return { v: 1, tegels };
}

/** Eén plek naar voren of achteren (voor het toetsenbord). */
export function schuifTegel(ind: BureauIndeling, tid: string, richting: -1 | 1): BureauIndeling {
  const van = ind.tegels.findIndex((t) => t.tid === tid);
  if (van < 0 || van + richting < 0 || van + richting >= ind.tegels.length) return ind;
  return verplaatsTegel(ind, tid, van + richting);
}

/** Zet het formaat; nooit kleiner dan het minimum van de widget en nooit buiten het raster. */
export function formaatTegel(ind: BureauIndeling, tid: string, k?: number, r?: number): BureauIndeling {
  const tegel = ind.tegels.find((t) => t.tid === tid);
  const def = tegel && bureauWidget(tegel.id);
  if (!tegel || !def) return ind;
  const volgendeK = k === undefined ? tegel.k : dichtstBij(k, KOLOMMEN, def.minK);
  const volgendeR = r === undefined ? tegel.r : dichtstBij(r, RIJEN, def.minR);
  if (volgendeK === tegel.k && volgendeR === tegel.r) return ind;
  return { v: 1, tegels: ind.tegels.map((t) => (t.tid === tid ? { ...t, k: volgendeK, r: volgendeR } : t)) };
}

/** Stap naar de volgende toegestane waarde (Shift+pijl, of de formaatknoppen). */
export function stapFormaat(huidig: number, toegestaan: readonly number[], min: number, richting: -1 | 1): number {
  const lijst = toegestaan.filter((x) => x >= min);
  const i = Math.max(0, lijst.indexOf(huidig));
  return lijst[Math.max(0, Math.min(lijst.length - 1, i + richting))];
}

/** Hoeveel rasterkolommen een tegel inneemt bij een gegeven schermbreedte (1, 6 of 12 kolommen). */
export const kolommenBij = (tegel: BureauTegel, raster: number): number => Math.max(1, Math.min(raster, tegel.k));

/**
 * Waar een gesleepte tegel terechtkomt: vóór de eerste tegel waarvan het midden voorbij de aanwijzer ligt.
 * Zuiver (alleen rechthoeken en een punt), zodat de regel zonder browser te testen is.
 */
export function neerzetIndex(rechthoeken: ReadonlyArray<{ left: number; top: number; width: number; height: number }>, x: number, y: number): number {
  for (let i = 0; i < rechthoeken.length; i += 1) {
    const r = rechthoeken[i];
    const midX = r.left + r.width / 2, midY = r.top + r.height / 2;
    if (y < r.top || (y <= r.top + r.height && x < midX) || (y < midY && x < r.left)) return i;
  }
  return rechthoeken.length;
}

export const gelijkBureau = (a: BureauIndeling, b: BureauIndeling) => JSON.stringify(a) === JSON.stringify(b);
export const bureauTekst = (paar: Tweetalig, lang: 'uk' | 'nl') => (lang === 'uk' ? paar[0] : paar[1]);
