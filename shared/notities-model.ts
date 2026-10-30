// Notities van de hub (hub.tarasevych.com/notities): soorten notities, zoeken op tekst en etiketten,
// en de catalogus van externe notitie-apps.
//
// Opslag: er komt GEEN nieuwe tabel bij. Een notitie is een bord-item (app.mcp_console_items, kind 'note') met
// titel ≤ 160, tekst ≤ 4000 en maximaal 8 etiketten die moeten passen op /^[A-Za-z0-9:_-]{1,32}$/ en op de server
// worden verkleind naar kleine letters (backend/mcp-console.ts → schoneTags). Daarom zit alles wat een notitie
// «soort», «kleur» of «vastgezet» maakt in de etiketten:
//     hub            de notitie hoort bij dit tabblad (bestond al)
//     soort:<naam>   tekst | lijst | code | koppeling   (geen etiket = tekst)
//     kleur:<naam>   een van KLEUREN
//     vast           vastgezet (bovenaan)
// Dat zijn 4 van de 8 etiketten; de overige 4 zijn vrije etiketten van de gebruiker. Dezelfde regels draaien in de
// browser en in de test, zodat een notitie nooit met een etiket wordt opgeslagen dat de server zou weigeren.
//
// Eerlijkheidsregel voor de app-catalogus hieronder: dezelfde als shared/integraties-catalogus.ts —
// 'binnenkort' betekent dat er GEEN koppeling is, met in `ontbreekt` wat er op de server mist.

export type Tweetalig = readonly [string, string];
export type NotitieSoort = 'tekst' | 'lijst' | 'code' | 'koppeling';
export type NotitieKleur = 'geen' | 'geel' | 'groen' | 'blauw' | 'roze' | 'grijs';

export const SOORTEN: ReadonlyArray<{ id: NotitieSoort; titel: Tweetalig; uitleg: Tweetalig; icoon: string }> = Object.freeze([
  { id: 'tekst', titel: ['Текст', 'Tekst'], uitleg: ['Звичайна нотатка.', 'Een gewone notitie.'], icoon: 'text' },
  { id: 'lijst', titel: ['Контрольний список', 'Checklist'], uitleg: ['Рядки з галочками, які можна відмічати.', 'Regels met vinkjes die u kunt afstrepen.'], icoon: 'check' },
  { id: 'code', titel: ['Код', 'Code'], uitleg: ['Фрагмент коду моноширинним шрифтом, без форматування.', 'Een stuk code in een vaste letter, zonder opmaak.'], icoon: 'code' },
  { id: 'koppeling', titel: ['Посилання', 'Koppeling'], uitleg: ['Нотатка з посиланням (лише https) на файл, лист або сторінку.', 'Een notitie met een link (alleen https) naar een bestand, bericht of pagina.'], icoon: 'link' },
]);
export const SOORT_IDS: readonly NotitieSoort[] = Object.freeze(SOORTEN.map((s) => s.id));
export const KLEUREN: readonly NotitieKleur[] = Object.freeze(['geen', 'geel', 'groen', 'blauw', 'roze', 'grijs']);
export const KLEUR_LABEL: Record<NotitieKleur, Tweetalig> = Object.freeze({
  geen: ['без кольору', 'geen kleur'], geel: ['жовта', 'geel'], groen: ['зелена', 'groen'],
  blauw: ['синя', 'blauw'], roze: ['рожева', 'roze'], grijs: ['сіра', 'grijs'],
});

/** De etiketgrens van de server (backend/mcp-console.ts). */
export const MAX_ETIKETTEN = 8;
export const ETIKET = /^[a-z0-9][a-z0-9:_-]{0,31}$/;
export const HUB_ETIKET = 'hub';
export const VAST_ETIKET = 'vast';
export const MAX_TITEL = 160;
export const MAX_TEKST = 4000;
/** 4 systeem-etiketten (hub, soort, kleur, vast) → zoveel vrije etiketten blijven er over. */
export const MAX_VRIJE_ETIKETTEN = MAX_ETIKETTEN - 4;

/** Wat de gebruiker van een notitie kan instellen. */
export type NotitieVorm = {
  titel: string;
  tekst: string;
  soort: NotitieSoort;
  kleur: NotitieKleur;
  vast: boolean;
  /** Vrije etiketten van de gebruiker (zonder de systeem-etiketten). */
  etiketten: readonly string[];
};

export const leegVorm = (): NotitieVorm => ({ titel: '', tekst: '', soort: 'tekst', kleur: 'geen', vast: false, etiketten: [] });

/** Eén vrij etiket opschonen: kleine letters, geen spaties, nooit een systeem-etiket. Leeg = niet bruikbaar. */
export function schoonEtiket(raw: unknown): string {
  const basis = String(raw ?? '').trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9:_-]/g, '').replace(/^[^a-z0-9]+/, '').slice(0, 32);
  if (!basis || !ETIKET.test(basis)) return '';
  if (basis === HUB_ETIKET || basis === VAST_ETIKET || basis.startsWith('soort:') || basis.startsWith('kleur:')) return '';
  return basis;
}

/** De etiketten zoals ze naar de server gaan. Altijd geldig voor schoneTags: ≤ 8, elk op ETIKET. */
export function etikettenVoorServer(vorm: NotitieVorm): string[] {
  const uit = [HUB_ETIKET];
  if (vorm.soort !== 'tekst') uit.push(`soort:${vorm.soort}`);
  if (vorm.kleur !== 'geen') uit.push(`kleur:${vorm.kleur}`);
  if (vorm.vast) uit.push(VAST_ETIKET);
  for (const e of vorm.etiketten) {
    const schoon = schoonEtiket(e);
    if (schoon && !uit.includes(schoon) && uit.length < MAX_ETIKETTEN) uit.push(schoon);
  }
  return uit;
}

/** Wat een bewaarde notitie werkelijk is, afgeleid uit haar etiketten. Onbekende waarden vallen terug op het veilige. */
export function vormUitEtiketten(titel: unknown, tekst: unknown, etiketten: unknown): NotitieVorm {
  const lijst = (Array.isArray(etiketten) ? etiketten : []).map((e) => String(e ?? '').toLowerCase());
  const soortEtiket = lijst.find((e) => e.startsWith('soort:'))?.slice(6) ?? '';
  const kleurEtiket = lijst.find((e) => e.startsWith('kleur:'))?.slice(6) ?? '';
  return {
    titel: String(titel ?? '').slice(0, MAX_TITEL),
    tekst: String(tekst ?? '').slice(0, MAX_TEKST),
    soort: (SOORT_IDS as readonly string[]).includes(soortEtiket) ? (soortEtiket as NotitieSoort) : 'tekst',
    kleur: (KLEUREN as readonly string[]).includes(kleurEtiket) && kleurEtiket !== 'geen' ? (kleurEtiket as NotitieKleur) : 'geen',
    vast: lijst.includes(VAST_ETIKET),
    etiketten: lijst.filter((e) => e !== HUB_ETIKET && e !== VAST_ETIKET && !e.startsWith('soort:') && !e.startsWith('kleur:')),
  };
}

// ------------------------------------------------------------------------------- контрольний список / checklist
export type LijstRegel = { af: boolean; tekst: string };
/** «- [ ] melk» / «- [x] brood» ⇄ regels. Alles wat niet op die vorm past blijft gewoon een niet-afgestreepte regel. */
export function lijstUitTekst(tekst: unknown): LijstRegel[] {
  return String(tekst ?? '').split('\n').map((regel) => {
    const treffer = /^\s*-\s*\[( |x|X)\]\s?(.*)$/.exec(regel);
    return treffer ? { af: treffer[1].toLowerCase() === 'x', tekst: treffer[2].trim() } : { af: false, tekst: regel.trim() };
  }).filter((r) => r.tekst.length > 0);
}
export function tekstUitLijst(regels: readonly LijstRegel[]): string {
  return regels.filter((r) => r.tekst.trim()).map((r) => `- [${r.af ? 'x' : ' '}] ${r.tekst.trim()}`).join('\n').slice(0, MAX_TEKST);
}
export const lijstAf = (regels: readonly LijstRegel[]) => regels.filter((r) => r.af).length;

// ------------------------------------------------------------------------------- koppeling / link
/** Alleen https; al het andere is geen koppeling (geen javascript:, geen data:). */
export function veiligeKoppeling(raw: unknown): string {
  const waarde = String(raw ?? '').trim();
  if (!waarde) return '';
  try { const url = new URL(waarde); return url.protocol === 'https:' ? url.toString() : ''; } catch { return ''; }
}
/** De eerste https-koppeling in de tekst van een notitie (voor de kaart «Посилання»). */
export function eersteKoppeling(tekst: unknown): string {
  for (const stuk of String(tekst ?? '').split(/\s+/)) { const veilig = veiligeKoppeling(stuk); if (veilig) return veilig; }
  return '';
}

// ------------------------------------------------------------------------------- zoeken, etiketten, ordenen
export type NotitieRij = { id: string; title: string; body: string; tags: string[]; updatedAt: string; createdAt: string };

/** Alleen notities van dit tabblad. */
export const hubNotities = <T extends { tags?: string[] }>(rijen: readonly T[] | null | undefined): T[] =>
  (rijen ?? []).filter((n) => (n.tags ?? []).includes(HUB_ETIKET));

/** Vastgezette notities bovenaan, daarbinnen de nieuwste eerst. */
export function ordenNotities<T extends NotitieRij>(rijen: readonly T[]): T[] {
  const tijd = (n: T) => Date.parse(n.updatedAt || n.createdAt) || 0;
  return [...rijen].sort((a, b) => {
    const va = (a.tags ?? []).includes(VAST_ETIKET) ? 1 : 0, vb = (b.tags ?? []).includes(VAST_ETIKET) ? 1 : 0;
    return va !== vb ? vb - va : tijd(b) - tijd(a);
  });
}

/** Zoeken op titel, tekst en etiketten (kleine letters, accenten genegeerd); leeg filter = alles. */
export function zoekNotities<T extends NotitieRij>(rijen: readonly T[], vraag: string, etiket = '', soort: NotitieSoort | '' = ''): T[] {
  const laag = (v: string) => v.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const woorden = laag(String(vraag ?? '')).split(/\s+/).filter(Boolean);
  const gewenstEtiket = schoonEtiket(etiket);
  return rijen.filter((n) => {
    if (gewenstEtiket && !(n.tags ?? []).includes(gewenstEtiket)) return false;
    if (soort && vormUitEtiketten(n.title, n.body, n.tags).soort !== soort) return false;
    if (!woorden.length) return true;
    const hooi = laag([n.title, n.body, ...(n.tags ?? [])].join(' '));
    return woorden.every((w) => hooi.includes(w));
  });
}

/** Alle vrije etiketten die in deze notities voorkomen, met hun aantal, meest gebruikte eerst. */
export function etiketWolk(rijen: readonly NotitieRij[]): Array<{ etiket: string; aantal: number }> {
  const tel = new Map<string, number>();
  for (const n of rijen) {
    for (const ruw of n.tags ?? []) {
      const e = String(ruw).toLowerCase();
      if (e === HUB_ETIKET || e === VAST_ETIKET || e.startsWith('soort:') || e.startsWith('kleur:')) continue;
      tel.set(e, (tel.get(e) ?? 0) + 1);
    }
  }
  return [...tel.entries()].map(([etiket, aantal]) => ({ etiket, aantal })).sort((a, b) => (a.aantal !== b.aantal ? b.aantal - a.aantal : a.etiket.localeCompare(b.etiket)));
}

// ------------------------------------------------------------------------------- catalogus van externe notitie-apps
export type NotitieAppStand = 'beschikbaar' | 'binnenkort';
export type NotitieApp = {
  id: string;
  naam: string;
  logo: string;
  site: string;
  stand: NotitieAppStand;
  /** Wat na het koppelen werkt. */
  richting: 'invoer' | 'lezen-en-schrijven' | 'geen';
  uitleg: Tweetalig;
  doel?: { dienst: 'cloud' | 'mcp' | 'identity'; tab: string };
  ontbreekt?: Tweetalig;
};

export const NOTITIE_APPS: readonly NotitieApp[] = Object.freeze([
  {
    id: 'markdown-invoer', naam: 'Markdown', logo: 'markdown', site: 'https://daringfireball.net/projects/markdown/',
    stand: 'binnenkort', richting: 'geen',
    uitleg: ['Імпорт файлів .md як нотаток — по одному або теку відразу.', 'Bestanden .md als notities importeren — één voor één of een hele map.'],
    ontbreekt: [
      'Немає маршруту імпорту: нотатки створює лише POST /api/mcp/board, по одній, і він не приймає файл. Потрібен маршрут, що читає .md, розбиває на нотатки й ставить етикетки.',
      'Er is geen importroute: notities maakt alleen POST /api/mcp/board, één per keer, en die neemt geen bestand aan. Er is een route nodig die .md leest, in notities splitst en etiketten zet.',
    ],
  },
  {
    id: 'google-keep', naam: 'Google Keep', logo: 'googlekeep', site: 'https://keep.google.com',
    stand: 'binnenkort', richting: 'geen',
    uitleg: ['Нотатки Google Keep.', 'Notities uit Google Keep.'],
    ontbreekt: [
      'Публічний API Keep відкритий лише для Google Workspace з обліковим записом служби; наш вхід Google просить області пошти, Drive, календаря й фото — Keep серед них немає.',
      'De publieke Keep-API bestaat alleen voor Google Workspace met een serviceaccount; onze Google-aanmelding vraagt de scopes van mail, Drive, agenda en foto’s — Keep staat daar niet bij.',
    ],
  },
  {
    id: 'notion', naam: 'Notion', logo: 'notion', site: 'https://www.notion.so',
    stand: 'binnenkort', richting: 'geen',
    uitleg: ['Сторінки й бази Notion як нотатки.', 'Notion-pagina’s en -databases als notities.'],
    ontbreekt: [
      'Немає з’єднувача Notion: ні OAuth-застосунку, ні місця для токена в сейфі, ні маршруту, що тягне сторінки. Потрібен окремий серверний модуль.',
      'Er is geen Notion-connector: geen OAuth-app, geen plek voor een token in de kluis en geen route die pagina’s binnenhaalt. Dat is een eigen servermodule.',
    ],
  },
  {
    id: 'obsidian', naam: 'Obsidian', logo: 'obsidian', site: 'https://obsidian.md',
    stand: 'binnenkort', richting: 'geen',
    uitleg: ['Локальна тека-сховище Obsidian на вашому комп’ютері.', 'Een lokale Obsidian-kluis op uw eigen computer.'],
    ontbreekt: [
      'Obsidian тримає файли на вашому ПК, а не на сервері. Потрібен агент на комп’ютері, який читає теку й надсилає нотатки, а також ваш дозвіл на цю теку.',
      'Obsidian bewaart bestanden op uw pc, niet op de server. Er is een agent op de computer nodig die de map leest en notities doorstuurt, plus uw toestemming voor die map.',
    ],
  },
  {
    id: 'apple-notes', naam: 'Apple Notes', logo: 'apple', site: 'https://www.icloud.com/notes',
    stand: 'binnenkort', richting: 'geen',
    uitleg: ['Нотатки iCloud з iPhone і Mac.', 'iCloud-notities van iPhone en Mac.'],
    ontbreekt: [
      'Apple не має публічного API для нотаток iCloud. Реально лише експорт із застосунку вручну — а імпорту файлів у нас теж ще немає.',
      'Apple heeft geen publieke API voor iCloud-notities. Alleen handmatig exporteren uit de app is mogelijk — en bestandsimport hebben wij ook nog niet.',
    ],
  },
]);

export const notitieApp = (id: unknown): NotitieApp | undefined => NOTITIE_APPS.find((a) => a.id === id);
export const notitieKanVerbinden = (app: NotitieApp) => app.stand === 'beschikbaar' && Boolean(app.doel);
export const notitieTekst = (paar: Tweetalig, lang: 'uk' | 'nl') => (lang === 'uk' ? paar[0] : paar[1]);
