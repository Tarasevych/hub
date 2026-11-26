// SITE-001 (пункт 19): «Відвідування» — знеособлені денні лічильники власної аналітики (лише за згоди відвідувачів).
// Лише читання: маршрут /api/owner/admin/analyse-overzicht (admin.read). Немає облікових записів, IP-адрес, пристроїв чи адрес сторінок.
// nl: «Bezoeken» — anonieme dagtellers van de eigen analyse (alleen met toestemming van de bezoeker); alleen lezen.
import { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { api } from '../platform/client';
import type { Lang } from './hulp';

type Rij = { dag: string; naam: string; aantal: number };
type Overzicht = { vanaf: string; tot: string; dagen: number; rijen: Rij[]; totaal: number; perNaam: Array<{ naam: string; aantal: number }> };
const tr = (lang: Lang, uk: string, nl: string) => (lang === 'uk' ? uk : nl);
const PERIODES = [7, 30, 90] as const;

/** Людська назва події «bezoek.<сервіс>». */
export function gebeurtenisLabel(lang: Lang, naam: string): string {
  const m = /^bezoek\.([a-z0-9_-]+)$/.exec(naam);
  return m ? tr(lang, `Відвідування: ${m[1]}`, `Bezoek: ${m[1]}`) : naam;
}

export default function BezoekTab({ lang, ctx }: { lang: Lang; ctx: { service: string; sourceOrigin: string; tabContext: string } }) {
  const [dagen, setDagen] = useState<number>(30);
  const [data, setData] = useState<Overzicht | null>(null);
  const [laden, setLaden] = useState(false);
  const [fout, setFout] = useState('');
  const laad = useCallback(async () => {
    setLaden(true); setFout('');
    try { setData(await api.post<Overzicht>('/api/owner/admin/analyse-overzicht', { ...ctx, dagen })); }
    catch { setFout(tr(lang, 'Не вдалося прочитати лічильники. Спробуйте ще раз.', 'De tellers konden niet worden gelezen. Probeer het opnieuw.')); }
    finally { setLaden(false); }
  }, [ctx, dagen, lang]);
  useEffect(() => { void laad(); }, [laad]);

  const max = Math.max(1, ...(data?.perNaam.map((x) => x.aantal) ?? [1]));
  return (
    <section className='adg-bezoek' data-adg-bezoek aria-label={tr(lang, 'Відвідування', 'Bezoeken')}>
      <p className='adg-cat-waarom'>{tr(lang,
        'Знеособлені денні лічильники: рахуються лише відвідувачі, які самі дозволили аналітику у смузі згоди. Немає облікових записів, IP-адрес, пристроїв чи адрес сторінок — лише назва розділу й кількість.',
        'Anonieme dagtellers: alleen bezoekers die zelf analyse hebben toegestaan in de toestemmingsbalk worden geteld. Geen accounts, IP-adressen, apparaten of paginapaden — alleen de naam van het onderdeel en een aantal.')}</p>
      <div className='adg-gereedschap' role='group' aria-label={tr(lang, 'Період', 'Periode')}>
        {PERIODES.map((n) => (
          <button key={n} type='button' className={`adg-knop${dagen === n ? ' actief' : ''}`} aria-pressed={dagen === n} onClick={() => setDagen(n)}>
            {tr(lang, `${n} днів`, `${n} dagen`)}
          </button>
        ))}
        <button type='button' className='adg-knop' disabled={laden} onClick={() => void laad()}>
          {laden ? <Loader2 className='adg-spin' /> : <RefreshCw />}{tr(lang, 'Оновити', 'Vernieuwen')}
        </button>
      </div>
      {fout && <p className='adg-melding' data-soort='fout' role='alert'>{fout}</p>}
      {data && (
        <>
          <p data-adg-bezoek-totaal><b>{data.totaal}</b> {tr(lang, `відвідувань за ${data.vanaf} — ${data.tot}`, `bezoeken van ${data.vanaf} tot ${data.tot}`)}</p>
          {data.perNaam.length === 0
            ? <p className='adg-leeg'>{tr(lang, 'Ще немає підрахованих відвідувань. Аналітика типово вимкнена, тож порожній перелік — нормальний стан.', 'Nog geen getelde bezoeken. Analyse staat standaard uit, dus een lege lijst is normaal.')}</p>
            : (
              <table className='adg-tabel'>
                <thead><tr><th scope='col'>{tr(lang, 'Розділ', 'Onderdeel')}</th><th scope='col'>{tr(lang, 'Кількість', 'Aantal')}</th><th scope='col' aria-hidden='true' /></tr></thead>
                <tbody>
                  {data.perNaam.map((x) => (
                    <tr key={x.naam}>
                      <td>{gebeurtenisLabel(lang, x.naam)}</td>
                      <td>{x.aantal}</td>
                      <td aria-hidden='true'><i className='adg-balk'><u style={{ flex: x.aantal / max, background: 'var(--accent, #10b981)' }} /><u style={{ flex: 1 - x.aantal / max }} /></i></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </>
      )}
    </section>
  );
}
