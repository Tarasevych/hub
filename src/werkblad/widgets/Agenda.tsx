// «Календар»: maandraster + de eerstvolgende afspraken uit POST /api/owner/hub/blocks/data (gekoppelde Google-agenda, alleen lezen).
// Het maandraster markeert alleen dagen waarvoor de projectie een afspraak heeft (de projectie kent de komende afspraken, ≤ 12).
// Hoogte: bij 3 rijen het raster + één regel «наступна подія»; elke rij meer geeft twee afspraken extra.
import { useState } from 'react';
import { ArrowRight, CalendarDays, ChevronLeft, ChevronRight, ExternalLink, Link2 } from 'lucide-react';
import { RuimteGeslotenVlak } from '../../RuimteStrook';
import { loadHubBlockData, readHubBlockDataCache, useBron, type HubBlockDataPayload } from '../gegevens';
import { locale, tijd, tr, wanneer, type Lang, type WidgetProps } from '../soorten';
import { Fout, Skelet } from './Vlak';

const dagSleutel = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

function Maand({ lang, jaar, maand, stippen, vandaag }: { lang: Lang; jaar: number; maand: number; stippen: Set<string>; vandaag: Date }) {
  const eerste = new Date(jaar, maand, 1);
  const start = (eerste.getDay() + 6) % 7; // maandag eerst
  const cellen: Array<{ d: Date; buiten: boolean }> = [];
  for (let i = 0; i < 42; i += 1) { const d = new Date(jaar, maand, 1 - start + i); cellen.push({ d, buiten: d.getMonth() !== maand }); }
  if (cellen.slice(35).every((c) => c.buiten)) cellen.length = 35;
  const koppen = Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(locale(lang), { weekday: 'short' }).format(new Date(2024, 0, 1 + i)));
  const vs = dagSleutel(vandaag);
  return (
    <table className='wb-maand' aria-label={new Intl.DateTimeFormat(locale(lang), { month: 'long', year: 'numeric' }).format(eerste)}>
      <thead><tr>{koppen.map((k) => <th key={k} scope='col'>{k.replace('.', '')}</th>)}</tr></thead>
      <tbody>
        {Array.from({ length: cellen.length / 7 }, (_, r) => (
          <tr key={r}>{cellen.slice(r * 7, r * 7 + 7).map((c) => {
            const s = dagSleutel(c.d);
            return <td key={s} className={`${c.buiten ? 'is-buiten' : ''}${s === vs ? ' is-vandaag' : ''}${stippen.has(s) ? ' heeft-afspraak' : ''}`} aria-current={s === vs ? 'date' : undefined}><span>{c.d.getDate()}</span>{stippen.has(s) ? <span className='sr-only'>{tr(lang, ' (є подія)', ' (afspraak)')}</span> : null}</td>;
          })}</tr>
        ))}
      </tbody>
    </table>
  );
}

export default function Agenda({ lang, item, acties, zichtbaar, ownerUserId: owner, kolommen }: WidgetProps) {
  const { waarde, fout, bezig, herlaad } = useBron<HubBlockDataPayload>((f) => loadHubBlockData(owner, f), readHubBlockDataCache(owner), zichtbaar);
  const vandaag = new Date();
  const [toon, setToon] = useState({ jaar: vandaag.getFullYear(), maand: vandaag.getMonth() });
  if (fout) return <Fout lang={lang} code={fout} opnieuw={herlaad} />;
  const bron = waarde?.sources?.calendar;
  if (!bron) return bezig || !zichtbaar ? <Skelet rijen={5} /> : <Fout lang={lang} code='GEEN_BRON' opnieuw={herlaad} />;
  if (bron.status === 'gesloten' && bron.gesloten) return <div className='wb-leeg-vlak' data-wb-gesloten='calendar'><RuimteGeslotenVlak gesloten={{ code: bron.gesloten.code as never, dienst: bron.gesloten.dienst as never, dienstNaam: bron.gesloten.dienstNaam, uitleg: bron.gesloten.uitleg }} lang={lang} /></div>;
  const nietGekoppeld = bron.status === 'empty' && bron.gekoppeld === false;
  const vandaagAlleen = item.inst?.filter === 'vandaag';
  const items = vandaagAlleen ? bron.items.filter((i) => i.updatedAt >= Date.now() && i.updatedAt <= Date.now() + 86_400_000) : bron.items;
  const stippen = new Set(bron.items.map((i) => dagSleutel(new Date(i.updatedAt))));
  const telefoon = kolommen === 1;
  const metRaster = telefoon || (item.r >= 3 && item.k >= 3);
  // Zonder raster: twee afspraken per rij (min. kop/voet); met raster: bij 3 rijen één regel, daarna twee per extra rij.
  const aantal = telefoon ? 4 : metRaster ? (item.r <= 3 ? 0 : (item.r - 3) * 2) : Math.max(1, item.r * 2 - 2);
  // «Жовтень 2026» (zelfstandige maandnaam + jaar, zonder «р.»): past ook in een halve tegel op de tablet.
  const titel = `${new Intl.DateTimeFormat(locale(lang), { month: 'long' }).format(new Date(toon.jaar, toon.maand, 1))} ${toon.jaar}`;
  const verschuif = (n: number) => setToon((t) => { const d = new Date(t.jaar, t.maand + n, 1); return { jaar: d.getFullYear(), maand: d.getMonth() }; });
  const open = () => acties.hubTab('calendar');
  const volgende = items[0];
  const rij = (a: (typeof items)[number]) => (
    <li key={a.id}>
      <span className='wb-afspraak-tijd'><strong>{new Intl.DateTimeFormat(locale(lang), { day: '2-digit', month: 'short' }).format(new Date(a.updatedAt))}</strong><small>{tijd(lang, a.updatedAt)}</small></span>
      {a.url ? <a href={a.url} target='_blank' rel='noreferrer'><span className='wb-rij-titel'>{a.title}{a.subtitle ? <small>{a.subtitle}</small> : null}</span><ExternalLink aria-hidden='true' /></a> : <span className='wb-rij-titel'>{a.title}{a.subtitle ? <small>{a.subtitle}</small> : null}</span>}
    </li>
  );
  return (
    <div className='wb-agenda' data-wb-agenda={nietGekoppeld ? 'niet-gekoppeld' : items.length ? 'klaar' : 'leeg'}>
      {metRaster ? (
        <>
          <div className='wb-agenda-balk'>
            <strong>{titel.charAt(0).toUpperCase() + titel.slice(1)}</strong>
            <span className='wb-agenda-knoppen'>
              <button type='button' className='wb-agenda-vandaag' onClick={() => setToon({ jaar: vandaag.getFullYear(), maand: vandaag.getMonth() })}>{tr(lang, 'Сьогодні', 'Vandaag')}</button>
              <button type='button' className='wb-icoonknop' aria-label={tr(lang, 'Попередній місяць', 'Vorige maand')} onClick={() => verschuif(-1)}><ChevronLeft aria-hidden='true' /></button>
              <button type='button' className='wb-icoonknop' aria-label={tr(lang, 'Наступний місяць', 'Volgende maand')} onClick={() => verschuif(1)}><ChevronRight aria-hidden='true' /></button>
              <button type='button' className='wb-icoonknop' aria-label={tr(lang, 'Відкрити календар', 'Agenda openen')} title={tr(lang, 'Відкрити календар', 'Agenda openen')} onClick={open}><ArrowRight aria-hidden='true' /></button>
            </span>
          </div>
          <Maand lang={lang} jaar={toon.jaar} maand={toon.maand} stippen={stippen} vandaag={vandaag} />
        </>
      ) : null}
      {nietGekoppeld ? (
        <p className='wb-agenda-regel' data-wb-niet-gekoppeld='calendar'><Link2 aria-hidden='true' /><span>{tr(lang, 'Календар не підключено.', 'De agenda is niet gekoppeld.')}</span><button type='button' className='wb-link-knop' onClick={open}>{tr(lang, 'Підключити', 'Koppelen')}</button></p>
      ) : !items.length ? (
        <p className='wb-agenda-regel'><CalendarDays aria-hidden='true' /><span>{vandaagAlleen ? tr(lang, 'Найближчої доби подій немає.', 'In de komende 24 uur staan er geen afspraken.') : tr(lang, 'Майбутніх подій немає.', 'Er zijn geen aankomende afspraken.')}</span></p>
      ) : metRaster && aantal === 0 && volgende ? (
        <p className='wb-agenda-regel' data-wb-volgende='1'><CalendarDays aria-hidden='true' /><span><strong>{volgende.title}</strong> · {wanneer(lang, volgende.updatedAt)} {tijd(lang, volgende.updatedAt)}</span></p>
      ) : (
        <ul className='wb-rijen wb-afspraken'>{items.slice(0, Math.max(1, aantal)).map(rij)}</ul>
      )}
      {!metRaster ? <button type='button' className='wb-alles' onClick={open}>{tr(lang, 'Відкрити календар', 'Agenda openen')}<ArrowRight aria-hidden='true' /></button> : null}
    </div>
  );
}
