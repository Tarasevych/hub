// Widgets van het beheeroverzicht (admin.* → Огляд) en de indeling per beheerder.
//
// De indeling is een GEORDENDE lijst: de volgorde in de lijst is de volgorde op het scherm (CSS-grid met 12 kolommen en
// automatische plaatsing), elke widget heeft een breedte (kolommen) en hoogte (rijen) uit een vaste set, en kan verborgen zijn.
// Waarom geen vrije x/y-posities: op een telefoon (1 kolom) en een brede monitor (12 kolommen) moet dezelfde indeling bruikbaar zijn;
// een geordende lijst met formaat verschuift vanzelf mee, kan met het toetsenbord worden aangepast en is eenvoudig te valideren.
// Dezelfde normalisatie draait in de browser én op de server (de server vertrouwt de browser niet).
export type WidgetId =
  | 'online' | 'sessies' | 'gebruikers' | 'activiteit' | 'fouten' | 'apparaten' | 'diensten' | 'uitrol' | 'populariteit' | 'stroom' | 'wachtrij' | 'gezag' | 'momenten';

export type WidgetDef = {
  id: WidgetId;
  titel: readonly [string, string];
  uitleg: readonly [string, string];
  /** standaardbreedte (kolommen van 12) en -hoogte (rijen) */
  w: number; h: number;
  /** kleinste toegestane afmetingen */
  minW: number; minH: number;
};

export const BREEDTES = [3, 4, 6, 8, 12] as const;
export const HOOGTES = [1, 2, 3, 4] as const;
export const MAX_WIDGETS = 24;

export const WIDGETS: readonly WidgetDef[] = [
  { id: 'online', titel: ['Користувачі онлайн', 'Gebruikers online'], uitleg: ['Хто був активний за останні 5 хвилин.', 'Wie in de laatste 5 minuten actief was.'], w: 4, h: 2, minW: 3, minH: 2 },
  { id: 'sessies', titel: ['Активні сесії', 'Actieve sessies'], uitleg: ['Відкриті сесії за сервісами.', 'Open sessies per dienst.'], w: 4, h: 2, minW: 3, minH: 2 },
  { id: 'gebruikers', titel: ['Користувачі', 'Gebruikers'], uitleg: ['Усього, нові й ті, що чекають на схвалення.', 'Totaal, nieuw en wachtend op goedkeuring.'], w: 4, h: 2, minW: 3, minH: 2 },
  { id: 'activiteit', titel: ['Події на сайті', 'Gebeurtenissen op de site'], uitleg: ['Кількість подій і збоїв за годинами або днями.', 'Aantal gebeurtenissen en storingen per uur of dag.'], w: 8, h: 3, minW: 4, minH: 2 },
  { id: 'fouten', titel: ['Збої та відмови', 'Storingen en weigeringen'], uitleg: ['Невдалі дії та відмови за добу.', 'Mislukte acties en weigeringen in 24 uur.'], w: 4, h: 3, minW: 3, minH: 2 },
  { id: 'apparaten', titel: ['Пристрої', 'Apparaten'], uitleg: ['Типи пристроїв, системи й браузери активних сесій.', 'Apparaattypen, systemen en browsers van actieve sessies.'], w: 4, h: 3, minW: 3, minH: 2 },
  { id: 'diensten', titel: ['Стан сервісів', 'Status van diensten'], uitleg: ['Короткий результат серверних перевірок.', 'Korte uitslag van de servercontroles.'], w: 4, h: 2, minW: 3, minH: 2 },
  { id: 'uitrol', titel: ['Останні оновлення', 'Laatste updates'], uitleg: ['П’ять останніх розгортань і те, що чекає схвалення.', 'De vijf laatste uitrol-runs en wat op goedkeuring wacht.'], w: 4, h: 3, minW: 3, minH: 2 },
  { id: 'populariteit', titel: ['Популярність сервісів і дій', 'Populariteit van diensten en acties'], uitleg: ['Що використовують найчастіше (за 7 днів, лише кількість).', 'Wat het meest wordt gebruikt (7 dagen, alleen aantallen).'], w: 6, h: 3, minW: 4, minH: 2 },
  { id: 'stroom', titel: ['Події наживо', 'Gebeurtenissen live'], uitleg: ['Останні дії користувачів. Клік на ім’я відкриває картку.', 'Laatste acties van gebruikers. Klik op een naam opent de kaart.'], w: 6, h: 4, minW: 4, minH: 3 },
  { id: 'wachtrij', titel: ['Чекають рішення', 'Wacht op beslissing'], uitleg: ['Запити доступу та оновлення, що чекають на вас.', 'Toegangsaanvragen en updates die op u wachten.'], w: 4, h: 2, minW: 3, minH: 1 },
  { id: 'momenten', titel: ['Знімки стану', 'Momentopnamen'], uitleg: ['Щогодини й щодня зберігаються лише лічильники (90 днів): тренди користувачів, сесій, подій і збоїв.', 'Elk uur en elke dag worden alleen tellers bewaard (90 dagen): trends van gebruikers, sessies, gebeurtenissen en storingen.'], w: 8, h: 3, minW: 4, minH: 2 },
  { id: 'gezag', titel: ['Межа повноважень', 'Bevoegdheidsgrens'], uitleg: ['Ваша роль і дозволи в адмін-панелі.', 'Uw rol en rechten in het beheerpaneel.'], w: 4, h: 2, minW: 3, minH: 1 },
];

export const WIDGET_IDS: readonly WidgetId[] = WIDGETS.map((w) => w.id);
export const widgetDef = (id: string): WidgetDef | undefined => WIDGETS.find((w) => w.id === id);

export type IndelingItem = { id: WidgetId; w: number; h: number; verborgen: boolean };
export type Indeling = { v: 1; items: IndelingItem[] };

const dichtstBij = (waarde: number, toegestaan: readonly number[], min: number) => {
  const mogelijk = toegestaan.filter((x) => x >= min);
  const lijst = mogelijk.length ? mogelijk : toegestaan;
  let beste = lijst[0];
  for (const x of lijst) if (Math.abs(x - waarde) < Math.abs(beste - waarde)) beste = x;
  return beste;
};

/** Standaardindeling: alle widgets zichtbaar in de vaste volgorde van WIDGETS. */
export function standaardIndeling(): Indeling {
  return { v: 1, items: WIDGETS.map((d) => ({ id: d.id, w: d.w, h: d.h, verborgen: false })) };
}

/** Maakt van willekeurige invoer een geldige indeling: onbekende of dubbele widgets vallen weg, afmetingen worden vastgezet,
 *  ontbrekende widgets (bijv. na een nieuwe versie) komen zichtbaar achteraan. */
export function normaliseerIndeling(raw: unknown): Indeling {
  const bron = raw && typeof raw === 'object' ? (raw as { items?: unknown }).items : undefined;
  const items: IndelingItem[] = [];
  const gezien = new Set<string>();
  if (Array.isArray(bron)) {
    for (const r of bron.slice(0, MAX_WIDGETS * 2)) {
      if (!r || typeof r !== 'object') continue;
      const o = r as Record<string, unknown>;
      const def = typeof o.id === 'string' ? widgetDef(o.id) : undefined;
      if (!def || gezien.has(def.id)) continue;
      gezien.add(def.id);
      const w = dichtstBij(Number(o.w) || def.w, BREEDTES, def.minW);
      const h = dichtstBij(Number(o.h) || def.h, HOOGTES, def.minH);
      items.push({ id: def.id, w, h, verborgen: o.verborgen === true });
    }
  }
  for (const d of WIDGETS) if (!gezien.has(d.id)) items.push({ id: d.id, w: d.w, h: d.h, verborgen: false });
  return { v: 1, items };
}

/** Verplaatst een widget naar een andere plek in de volgorde (positie in de volledige lijst). */
export function verplaats(ind: Indeling, id: WidgetId, naar: number): Indeling {
  const van = ind.items.findIndex((i) => i.id === id);
  if (van < 0) return ind;
  const items = ind.items.slice();
  const [it] = items.splice(van, 1);
  items.splice(Math.max(0, Math.min(items.length, naar)), 0, it);
  return { v: 1, items };
}

/** Verplaatst een widget één zichtbare plek naar voren/achteren (voor het toetsenbord); verborgen widgets worden overgeslagen. */
export function schuif(ind: Indeling, id: WidgetId, richting: -1 | 1): Indeling {
  const zichtbaar = ind.items.filter((i) => !i.verborgen);
  const pos = zichtbaar.findIndex((i) => i.id === id);
  const doel = zichtbaar[pos + richting];
  if (pos < 0 || !doel) return ind;
  return verplaats(ind, id, ind.items.findIndex((i) => i.id === doel.id));
}

/** Zet de afmeting (door op de hulpknoppen te klikken of met Shift+pijl); houdt rekening met het minimum. */
export function formaatZetten(ind: Indeling, id: WidgetId, w?: number, h?: number): Indeling {
  const def = widgetDef(id);
  if (!def) return ind;
  return { v: 1, items: ind.items.map((i) => (i.id !== id ? i : {
    ...i,
    w: w === undefined ? i.w : dichtstBij(w, BREEDTES, def.minW),
    h: h === undefined ? i.h : dichtstBij(h, HOOGTES, def.minH),
  })) };
}

export function verbergen(ind: Indeling, id: WidgetId, verborgen: boolean): Indeling {
  return { v: 1, items: ind.items.map((i) => (i.id === id ? { ...i, verborgen } : i)) };
}

export const gelijkeIndeling = (a: Indeling, b: Indeling) => JSON.stringify(a) === JSON.stringify(b);

/** Stap naar de volgende toegestane waarde (+1/-1) in een lijst, begrensd door het minimum. */
export function stap(huidig: number, toegestaan: readonly number[], min: number, richting: -1 | 1): number {
  const lijst = toegestaan.filter((x) => x >= min);
  const i = Math.max(0, lijst.indexOf(huidig));
  return lijst[Math.max(0, Math.min(lijst.length - 1, i + richting))];
}
