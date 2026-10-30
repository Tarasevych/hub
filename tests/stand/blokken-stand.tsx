// Lokale stand voor BlokWeergave (stroom B): 4 voorbeeldblokken in licht en donker. Alleen voor scripts/blokken-stand.mjs.
import { createRoot } from 'react-dom/client';
import { Mail, CalendarPlus, ListChecks, NotebookPen, Bot, Search, Upload, LayoutGrid, Languages, SquareKanban, PenLine, Sun } from 'lucide-react';
import { STANDAARD_INDELING, type Blok, type Knoop, type Onderdeel } from '../../shared/werkblad-blokken';
import { BlokWeergave } from '../../src/werkblad/blokken/BlokWeergave';
import '../../src/ontwerp/tokens.css';

const A = { soort: 'auto' } as const;
const ICONEN = { mail: Mail, agenda: CalendarPlus, taken: ListChecks, notities: NotebookPen, ai: Bot, zoeken: Search, upload: Upload, bord: SquareKanban, vertalen: Languages, overzicht: LayoutGrid, schrijven: PenLine, dag: Sun } as const;
const NAMEN: Record<string, string> = { mail: 'Пошта', agenda: 'Календар', taken: 'Завдання', notities: 'Нотатки', ai: 'ШІ', zoeken: 'Пошук', upload: 'Завантажити', bord: 'Дошка', vertalen: 'Переклад', overzicht: 'Огляд', schrijven: 'Написати', dag: 'День' };
const ids = Object.keys(ICONEN);
const o = (id: string, v: number, x: Partial<Onderdeel> = {}): Onderdeel => ({ soort: 'onderdeel', id: `${id}-${v}`, itemId: id, volgorde: v, afmeting: { breedte: A, hoogte: A }, ...x });
const b = (id: string, kinderen: Knoop[], ind: Partial<Blok['indeling']>, x: Partial<Blok> = {}): Blok => ({ soort: 'blok', id, volgorde: 0, afmeting: { breedte: A, hoogte: A }, indeling: { ...STANDAARD_INDELING, ...ind }, kinderen, ...x });

const voorbeelden: Array<{ titel: string; wortel: Blok; hoogte?: number }> = [
  { titel: 'Авто (як зараз)', wortel: b('auto', ids.map((id, i) => o(id, i)), {}) },
  { titel: 'Різні розміри + кольори', wortel: b('mix', [
    o('mail', 0, { icoon: { grootte: { soort: 'px', waarde: 64 } }, rasterSpan: { kolommen: 2, rijen: 2 }, uiterlijk: { achtergrond: '#1d4ed8', vorm: 'afgerond', straal: 20, schaduw: 'zacht' } }),
    o('agenda', 1, { icoon: { grootte: { soort: 'px', waarde: 24 }, stijl: 'rond' }, uiterlijk: { achtergrond: '#fde047' } }),
    o('taken', 2, { label: { tonen: 'nee', plaats: 'onder' }, uiterlijk: { vorm: 'cirkel' } }),
    o('notities', 3, { uiterlijk: { achtergrond: 'token:accent-soft', randKleur: 'token:accent', randDikte: 2 } }),
    o('ai', 4, { uiterlijk: { doorzichtigheid: 0.6 } }), o('zoeken', 5),
  ], { rasterKolommen: 4 }) },
  { titel: 'Блок у блоці: колонка + ряд + сітка', wortel: b('nest', [
    b('links', [o('mail', 0, { label: { tonen: 'ja', plaats: 'rechts' } }), o('agenda', 1, { label: { tonen: 'ja', plaats: 'rechts' } }), o('taken', 2, { label: { tonen: 'ja', plaats: 'rechts' } })], { modus: 'kolom', omloop: false, uitlijningDwars: 'rek', binnenrand: 8 }, { titel: 'Колонка', volgorde: 0, afmeting: { breedte: { soort: 'procent', waarde: 34 }, hoogte: A } }),
    b('rechts', [
      b('rij', [o('ai', 0, { afmeting: { breedte: { soort: 'deel', waarde: 1 }, hoogte: A } }), o('zoeken', 1, { afmeting: { breedte: { soort: 'deel', waarde: 2 }, hoogte: A } })], { modus: 'rij', omloop: false, binnenrand: 6 }, { titel: 'Ряд 1:2', volgorde: 0 }),
      b('raster', ['upload', 'bord', 'vertalen', 'overzicht'].map((id, i) => o(id, i)), { binnenrand: 6 }, { titel: 'Сітка', volgorde: 1 }),
    ], { modus: 'kolom', omloop: false, uitlijningDwars: 'rek', tussenruimte: 12 }, { volgorde: 1, afmeting: { breedte: { soort: 'deel', waarde: 1 }, hoogte: A } }),
  ], { modus: 'rij', omloop: false, tussenruimte: 12, uitlijningDwars: 'begin' }) },
  { titel: 'Вільно (без накладання)', hoogte: 220, wortel: b('vrij', [
    o('mail', 0, { positie: { x: 10, y: 10, z: 0 }, icoon: { grootte: { soort: 'px', waarde: 48 } } }),
    o('agenda', 1, { positie: { x: 40, y: 30, z: 1 } }),
    o('schrijven', 2, { positie: { x: 220, y: 20, z: 2 }, afmeting: { breedte: { soort: 'px', waarde: 140 }, hoogte: { soort: 'px', waarde: 50 } }, label: { tonen: 'ja', plaats: 'rechts' } }),
    o('dag', 3, { positie: { x: 160, y: 120, z: 3 }, uiterlijk: { vorm: 'pil', achtergrond: '#065f46' }, afmeting: { breedte: { soort: 'px', waarde: 120 }, hoogte: { soort: 'px', waarde: 44 } }, label: { tonen: 'ja', plaats: 'rechts' } }),
  ], { modus: 'vrij' }) },
];

const apparaat = window.innerWidth < 700 ? 'telefoon' : 'computer';
const beschrijf = (id: string) => { const I = ICONEN[id as keyof typeof ICONEN] || LayoutGrid; return { naam: NAMEN[id] || id, icoon: (px: number) => <I width={px} height={px} />, uitleg: `Відкрити «${NAMEN[id] || id}»` }; };
function Paneel({ thema }: { thema: string }) {
  return (
    <section className={`theme-${thema}`} style={{ background: 'var(--bg)', color: 'var(--text)', padding: 12, display: 'grid', gap: 16 }}>
      {voorbeelden.map((v) => (
        <article key={v.titel} style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 12, padding: 12 }}>
          <h3 style={{ margin: '0 0 10px', fontSize: 14 }}>{v.titel}</h3>
          <BlokWeergave wortel={v.wortel} apparaat={apparaat} beschrijf={beschrijf} hoogte={v.hoogte ?? 'inhoud'} geselecteerd={new Set(v.wortel.id === 'mix' ? ['agenda-1'] : [])} bewerken={v.wortel.id === 'mix'} />
        </article>
      ))}
    </section>
  );
}
createRoot(document.getElementById('wortel')!).render(<><Paneel thema="light" /><Paneel thema="dark" /></>);
