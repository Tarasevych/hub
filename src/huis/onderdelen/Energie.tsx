// Energie: ALLEEN gemeten waarden (vermogen/energie-mogelijkheden) en de geschiedenis die de gateway teruggeeft. Geen schatting,
// geen tarief, geen «besparing» — zonder meter staat er «geen meter». Grafiek als eenvoudige SVG-lijn met ontwerp-tokens.
import { useEffect, useState, type CSSProperties } from 'react';
import { Gauge, Zap } from 'lucide-react';
import { VERSHEID_LABEL, versheid, type Apparaat } from '../../../shared/huis-model';
import type { OnderdeelProps } from '../HuisPagina';
import { HuisFout, huisClient } from '../huis-client';
import { datumTekst, foutTekst, tr, toestandVan, type Lang } from '../tekst';
import '../huis-beheer-maquette.css';

type Uit = Awaited<ReturnType<typeof huisClient.energie>>;

export default function Energie({ lang, woningId, ov, toon }: OnderdeelProps) {
  const [uren, setUren] = useState(24);
  const [uit, setUit] = useState<Uit | null>(null);
  const [bezig, setBezig] = useState(false);
  useEffect(() => {
    let actief = true; setBezig(true);
    huisClient.energie(woningId, uren).then((d) => { if (actief) setUit(d); }).catch((e) => { if (actief) toon(foutTekst(lang, e instanceof HuisFout ? e.code : 'FOUT'), 'fout'); }).finally(() => { if (actief) setBezig(false); });
    return () => { actief = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [woningId, uren, ov.apparaten.length]);
  const meters = uit?.apparaten ?? ov.apparaten.filter((a) => a.mogelijkheden.some((m) => m.soort === 'energie' || m.soort === 'vermogen'));
  const vermogen = meters.map((a) => toestandVan(a, 'vermogen')).filter((t) => t && typeof t.waarde === 'number' && versheid(t) === 'vers');
  const totaalW = vermogen.reduce((s, t) => s + Number(t!.waarde), 0);
  const maxW = Math.max(1, ...vermogen.map((t) => Math.abs(Number(t!.waarde))));
  const energieMetingen = meters.map((a) => toestandVan(a, 'energie')).filter((t) => t && typeof t.waarde === 'number' && (!t.eenheid || t.eenheid === 'kWh') && versheid(t) === 'vers');
  const totaalKwh = energieMetingen.reduce((s, t) => s + Number(t!.waarde), 0);
  return (
    <div className='hv-energie' data-mq-beheer='energie'>
      <div className='hv-tegels'>
        <div className='hv-tegel mq-accent-amber' data-hv-tegel='vermogen-nu' data-mq-actief={vermogen.length ? 'ja' : 'nee'} data-mq-boven={tr(lang, 'МИТТЄВА ПОТУЖНІСТЬ', 'ACTUEEL VERMOGEN')}><Zap aria-hidden='true' /><strong>{vermogen.length ? `${totaalW.toFixed(0)} W` : '—'}</strong><span>{vermogen.length ? tr(lang, `виміряна потужність зараз (${vermogen.length} лічильн.)`, `gemeten vermogen nu (${vermogen.length} meters)`) : tr(lang, 'немає актуального виміру потужності', 'geen actuele vermogensmeting')}</span></div>
        <div className='hv-tegel mq-accent-mint' data-hv-tegel='meters' data-mq-boven={tr(lang, 'КОНТУР ВИМІРЮВАННЯ', 'MEETKRING')} data-mq-kwh={energieMetingen.length ? `${tr(lang, 'Накопичено', 'Opgeteld')}: ${totaalKwh.toFixed(2)} kWh` : undefined}><Gauge aria-hidden='true' /><strong>{meters.length}</strong><span>{tr(lang, 'лічильників/розеток з виміром', 'meters/stekkers met meting')}</span></div>
      </div>
      {!meters.length ? <section className='hv-leeg' data-hv-leeg='geen-meter'><Gauge aria-hidden='true' /><h3>{tr(lang, 'Лічильника немає', 'Geen meter')}</h3><p>{tr(lang, 'Ця сторінка не оцінює й не вгадує споживання. Підключіть розумний лічильник (P1), вимірювальну розетку чи інвертор до Home Assistant — і тут з’являться виміряні значення.', 'Deze pagina schat of raadt het verbruik niet. Koppel een slimme meter (P1), een meetstekker of een omvormer aan Home Assistant — dan verschijnen hier gemeten waarden.')}</p></section> : null}
      {meters.length ? (
        <>
          <div className='hv-werkbalk'>
            <div className='hv-chips' role='tablist' aria-label={tr(lang, 'Період', 'Periode')}>{[6, 24, 72, 168].map((u) => <button key={u} type='button' role='tab' aria-selected={uren === u} className={`hv-chip${uren === u ? ' is-actief' : ''}`} onClick={() => setUren(u)}>{u <= 24 ? `${u} ${tr(lang, 'год', 'u')}` : `${u / 24} ${tr(lang, 'дн.', 'd')}`}</button>)}</div>
            {bezig ? <span className='hv-hint' role='status' aria-busy='true'>{tr(lang, 'читаю історію…', 'geschiedenis lezen…')}</span> : null}
          </div>
          {uit?.fout ? <p className='hv-melding is-fout mq-accent-coral'>{tr(lang, 'Історію не отримано', 'Geschiedenis niet ontvangen')}: {foutTekst(lang, uit.fout)}</p> : null}
          <div className='hv-raster'>
            {meters.map((a) => <Meter key={a.id} lang={lang} a={a} maxW={maxW} reeks={uit?.reeksen[a.id] ?? []} />)}
          </div>
          <p className='hv-hint'>{tr(lang, 'Значення й історія — такі, як їх віддає шлюз (Home Assistant history); сайт не інтерполює та не множить на тарифи.', 'Waarden en geschiedenis zijn zoals de gateway ze geeft (Home Assistant history); de site interpoleert niet en rekent geen tarieven.')}</p>
        </>
      ) : null}
    </div>
  );
}

function Meter({ lang, a, maxW, reeks }: { lang: Lang; a: Apparaat; maxW: number; reeks: Array<{ op: string; waarde: number }> }) {
  const v = toestandVan(a, 'vermogen'); const e = toestandVan(a, 'energie'); const t = v ?? e ?? a.toestanden[0];
  const vers = versheid(t);
  const heeftW = Boolean(v && typeof v.waarde === 'number');
  const aandeel = heeftW ? Math.min(100, Math.max(4, Math.round((Math.abs(Number(v!.waarde)) / maxW) * 100))) : 0;
  const accent = vers === 'vers' ? 'mq-accent-amber' : vers === 'verouderd' ? 'mq-accent-violet' : vers === 'onbeschikbaar' ? 'mq-accent-coral' : 'mq-accent-blue';
  return (
    <article className={`hv-kaart is-${vers} ${accent}`} data-hv-meter={a.id} data-mq-versheid={vers} data-mq-schaal={heeftW ? 'ja' : 'nee'} style={heeftW ? ({ '--mq-meter-pct': `${aandeel}%` } as CSSProperties) : undefined}>
      <small>{a.naam}</small>
      <strong>{v && typeof v.waarde === 'number' ? `${v.waarde} ${v.eenheid || 'W'}` : e && typeof e.waarde === 'number' ? `${e.waarde} ${e.eenheid || 'kWh'}` : '—'}</strong>
      {v && e && typeof e.waarde === 'number' ? <span className='hv-waarde'>{tr(lang, 'сумарно', 'totaal')}: {e.waarde} {e.eenheid || 'kWh'}</span> : null}
      <em>{tr(lang, VERSHEID_LABEL[vers][0], VERSHEID_LABEL[vers][1])} · {datumTekst(lang, t?.waargenomenOp || t?.ontvangenOp || null)}</em>
      {reeks.length > 1 ? <Lijn reeks={reeks} lang={lang} /> : <span className='hv-hint'>{tr(lang, 'історії за період немає', 'geen geschiedenis in deze periode')}</span>}
    </article>
  );
}

function Lijn({ reeks, lang }: { reeks: Array<{ op: string; waarde: number }>; lang: Lang }) {
  const W = 240, H = 60; const xs = reeks.map((p) => Date.parse(p.op)); const ys = reeks.map((p) => p.waarde);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const px = (x: number) => (x1 === x0 ? 0 : ((x - x0) / (x1 - x0)) * W); const py = (y: number) => (y1 === y0 ? H / 2 : H - ((y - y0) / (y1 - y0)) * (H - 6) - 3);
  const d = reeks.map((p, i) => `${i ? 'L' : 'M'}${px(Date.parse(p.op)).toFixed(1)},${py(p.waarde).toFixed(1)}`).join(' ');
  return (
    <svg className='hv-lijn' viewBox={`0 0 ${W} ${H}`} role='img' aria-label={tr(lang, `${reeks.length} точок, від ${y0} до ${y1}`, `${reeks.length} punten, van ${y0} tot ${y1}`)} data-hv-lijn={reeks.length}>
      <path d={d} fill='none' />
      <text x={2} y={10} className='hv-lijn-tekst'>{y1}</text><text x={2} y={H - 2} className='hv-lijn-tekst'>{y0}</text>
    </svg>
  );
}
