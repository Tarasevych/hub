// Gebeurtenissen: het journaal van de woning (opdrachten, syncs, integraties, voorstellen, sensoren) met bron, ernst, tijd en
// correlatie; filter op soort; «meer» via cursor (voor = ontvangenOp van het laatste item).
import { useEffect, useState } from 'react';
import { Activity, ChevronDown } from 'lucide-react';
import type { Gebeurtenis } from '../../../shared/huis-model';
import type { OnderdeelProps } from '../HuisPagina';
import { HuisFout, huisClient } from '../huis-client';
import { datumTekst, foutTekst, tr } from '../tekst';

const SOORTEN: Array<[string, [string, string]]> = [['', ['усі', 'alle']], ['opdracht', ['команди', 'opdrachten']], ['sync', ['синхронізації', 'syncs']], ['integratie', ['інтеграції', 'integraties']], ['voorstel', ['пропозиції ШІ', 'AI-voorstellen']], ['scene', ['сцени', 'scènes']], ['sensor', ['датчики', 'sensoren']], ['lid', ['учасники', 'leden']]];
const ERNST: Record<Gebeurtenis['ernst'], [string, string]> = { info: ['інфо', 'info'], belangrijk: ['важливо', 'belangrijk'], kritiek: ['критично', 'kritiek'] };

export default function Gebeurtenissen({ lang, woningId, ov, toon }: OnderdeelProps) {
  const [soort, setSoort] = useState('');
  const [lijst, setLijst] = useState<Gebeurtenis[]>([]);
  const [volgende, setVolgende] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);
  const [open, setOpen] = useState('');
  const laad = async (voor?: string) => {
    setBezig(true);
    try { const d = await huisClient.gebeurtenissen(woningId, { soort: soort || undefined, voor }); setLijst((l) => (voor ? [...l, ...d.gebeurtenissen] : d.gebeurtenissen)); setVolgende(d.volgende); }
    catch (e) { toon(foutTekst(lang, e instanceof HuisFout ? e.code : 'FOUT'), 'fout'); } finally { setBezig(false); }
  };
  useEffect(() => { void laad(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [woningId, soort, ov.gebeurtenissen[0]?.id]);
  const naam = (id: string | null) => (id ? ov.apparaten.find((a) => a.id === id)?.naam ?? '' : '');
  return (
    <div className='hv-gebeurtenissen-pagina'>
      <div className='hv-werkbalk'>
        <div className='hv-chips' role='tablist' aria-label={tr(lang, 'Тип подій', 'Soort gebeurtenis')}>{SOORTEN.map(([s, l]) => <button key={s} type='button' role='tab' aria-selected={soort === s} className={`hv-chip${soort === s ? ' is-actief' : ''}`} onClick={() => setSoort(s)} data-hv-soort={s || 'alle'}>{tr(lang, l[0], l[1])}</button>)}</div>
      </div>
      {!lijst.length && !bezig ? <section className='hv-leeg'><Activity aria-hidden='true' /><h3>{tr(lang, 'Подій ще немає', 'Nog geen gebeurtenissen')}</h3><p>{tr(lang, 'Тут буде журнал: кожна команда з результатом, синхронізації, зміни інтеграцій та пропозиції ШІ.', 'Hier komt het journaal: elke opdracht met uitkomst, syncs, wijzigingen aan integraties en AI-voorstellen.')}</p></section> : null}
      <ul className='hv-gebeurtenissen' data-hv-gebeurtenissen={lijst.length}>
        {lijst.map((g) => (
          <li key={g.id} className={`is-${g.ernst}`} data-hv-gebeurtenis={g.id}>
            <span>{datumTekst(lang, g.ontvangenOp)}</span>
            <button type='button' className='hv-lijst-knop' aria-expanded={open === g.id} onClick={() => setOpen(open === g.id ? '' : g.id)}><strong>{g.bericht}</strong><small>{g.bron} · {g.soort} · {tr(lang, ERNST[g.ernst][0], ERNST[g.ernst][1])}{naam(g.apparaatId) ? ` · ${naam(g.apparaatId)}` : ''}</small></button>
            {open === g.id ? <dl className='hv-details'>{g.bronTijd ? <><dt>{tr(lang, 'Час джерела', 'Brontijd')}</dt><dd>{datumTekst(lang, g.bronTijd)}</dd></> : null}<dt>{tr(lang, 'Кореляція', 'Correlatie')}</dt><dd><code>{g.correlatie || '—'}</code></dd>{g.opdrachtId ? <><dt>{tr(lang, 'Команда', 'Opdracht')}</dt><dd><code>{g.opdrachtId}</code></dd></> : null}{Object.keys(g.gegevens || {}).length ? <><dt>{tr(lang, 'Дані', 'Gegevens')}</dt><dd><pre>{JSON.stringify(g.gegevens, null, 1)}</pre></dd></> : null}</dl> : null}
          </li>
        ))}
      </ul>
      {volgende ? <button type='button' className='hv-knop is-stil' disabled={bezig} onClick={() => void laad(volgende)} data-hv-meer='1'><ChevronDown aria-hidden='true' />{tr(lang, 'Давніші', 'Oudere')}</button> : null}
    </div>
  );
}
