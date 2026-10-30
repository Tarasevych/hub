// Afstemming vNext — «Мапа зв'язків» (uitvoerder D3, §6 van het dossier): de echte graf uit /api/owner/afstemming/graaf,
// met de hand getekend als SVG (geen nieuwe afhankelijkheden). Deterministische cirkelindeling per dienst (zvirka-kern),
// randkleur per koppelsoort met een TEKSTlegenda, voorgestelde (nog niet bevestigde) randen gestippeld. Filters, zoom en
// pannen; klik op een knoop opent een minikaart ERNAAST — detail zonder de context te verliezen (§2.3). Niets wordt hier
// samengevoegd of goedgekeurd: beslissen gebeurt in de kaart zelf (eigenaarsbesluit, §6).
import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { GitCompareArrows, Minus, Plus, RotateCcw, X } from 'lucide-react';
import { GEZONDHEID_LABEL, KOPPEL_LABEL, KOPPEL_SOORTEN, LEVENSFASE_LABEL, afstemmingTekst, type KoppelSoort } from '../../../shared/afstemming-model';
import { afstemmingClient, AfstemmingFout, type GraafUit } from '../afstemming-client';
import { GEZONDHEID_KLEUR, RAND_KLEUR, grafIndeling, zoomViewBox, type GraafKnoopXY } from '../zvirka-kern';
import { foutTekst, tr } from '../tekst';
import type { OnderdeelProps } from '../AfstemmingPagina';
import '../afstemming-mobiel.css';

const MAAT = 640;
const S: Record<string, CSSProperties> = {
  romp: { display: 'grid', gap: 'var(--ruimte-3)', minWidth: 0 },
  filters: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  chips: { display: 'flex', gap: 6, flexWrap: 'wrap' },
  vlak: { position: 'relative', border: '1px solid var(--line)', borderRadius: 'var(--straal-l)', background: 'var(--panel)', minWidth: 0, overflow: 'hidden' },
  zoom: { position: 'absolute', top: 8, right: 8, display: 'flex', gap: 4 },
  legenda: { display: 'flex', gap: 10, flexWrap: 'wrap', color: 'var(--muted)', fontSize: 'var(--tekst-mini)' },
  stip: { display: 'inline-block', width: 10, height: 10, borderRadius: 2, marginRight: 4, verticalAlign: 'middle' },
  mini: { display: 'grid', gap: 8, alignContent: 'start' },
};

export default function Relatiekaart({ lang, smal, openKaart, naarSectie }: OnderdeelProps) {
  const [uit, setUit] = useState<GraafUit | null>(null);
  const [laden, setLaden] = useState(true);
  const [fout, setFout] = useState('');
  const [bouw, setBouw] = useState(false);
  const [dienst, setDienst] = useState('');
  const [soorten, setSoorten] = useState<readonly KoppelSoort[]>(KOPPEL_SOORTEN);
  const [alleenBevestigd, setAlleenBevestigd] = useState(false);
  const [schaal, setSchaal] = useState(1);
  const [pan, setPan] = useState({ dx: 0, dy: 0 });
  const [gekozen, setGekozen] = useState<GraafKnoopXY | null>(null);
  const sleep = useRef<{ x: number; y: number } | null>(null);
  const vlak = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    let weg = false;
    afstemmingClient.graaf({})
      .then((g) => { if (!weg) { setUit(g); setFout(''); } })
      .catch((e) => { if (weg) return; const code = e instanceof AfstemmingFout ? e.code : 'FOUT'; if (code === 'NOG_NIET_GEBOUWD') setBouw(true); else setFout(foutTekst(lang, code)); })
      .finally(() => { if (!weg) setLaden(false); });
    return () => { weg = true; };
  }, [lang]);

  const indeling = useMemo(() => (uit ? grafIndeling(uit, { dienst, soorten, alleenBevestigd }, MAAT) : null), [uit, dienst, soorten, alleenBevestigd]);
  const soortenInBeeld = useMemo(() => [...new Set((indeling?.randen || []).map((r) => r.soort))], [indeling]);
  const wisselSoort = (s: KoppelSoort) => setSoorten((huidig) => (huidig.includes(s) ? huidig.filter((x) => x !== s) : [...huidig, s]));

  // Pannen in tekening-eenheden: de verschuiving van de wijzer wordt omgerekend naar de huidige viewBox-schaal.
  const panStart = (e: ReactPointerEvent<SVGSVGElement>) => { sleep.current = { x: e.clientX, y: e.clientY }; (e.currentTarget as SVGSVGElement).setPointerCapture?.(e.pointerId); };
  const panStap = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!sleep.current) return;
    const breedte = vlak.current?.getBoundingClientRect().width || MAAT;
    const factor = (MAAT / schaal) / breedte;
    setPan((p) => ({ dx: p.dx - (e.clientX - sleep.current!.x) * factor, dy: p.dy - (e.clientY - sleep.current!.y) * factor }));
    sleep.current = { x: e.clientX, y: e.clientY };
  };
  const panKlaar = () => { sleep.current = null; };

  if (laden) return <p className='afv-hint' role='status' aria-busy='true'>{tr(lang, 'Завантаження мапи…', 'Relatiekaart laden…')}</p>;
  if (bouw) return <section className='afv-leeg' data-afv-bouw='Relatiekaart'><p>{tr(lang, 'Серверна частина мапи ще збирається.', 'De serverkant van de kaart is nog in aanbouw.')}</p></section>;
  if (fout) return <p className='afv-melding is-fout' role='alert'>{fout}</p>;
  const leeg = !indeling || indeling.knopen.length === 0;

  return (
    <div style={S.romp} data-afv-graaf=''>
      <section className='afv-blok'>
        <h3><GitCompareArrows aria-hidden='true' />{tr(lang, 'Мапа зв’язків', 'Relatiekaart')}</h3>
        <p className='afv-hint'>{tr(lang, 'Залежності, дублікати й конфлікти між картками. Пунктир — запропоновано системою, рішення ухвалює власник у самій картці; тут нічого не зливається автоматично.', 'Afhankelijkheden, duplicaten en conflicten tussen kaarten. Gestippeld = door het systeem voorgesteld; beslissen doet de eigenaar in de kaart zelf — hier wordt niets automatisch samengevoegd.')}</p>
        <div style={S.filters} role='group' aria-label={tr(lang, 'Фільтри мапи', 'Kaartfilters')}>
          <label className='afv-hint'>{tr(lang, 'Сервіс', 'Dienst')}{' '}
            <select value={dienst} data-afv-graaf-dienst='' onChange={(e) => { setDienst(e.target.value); setGekozen(null); }}>
              <option value=''>{tr(lang, '— усі —', '— alle —')}</option>
              {(indeling?.diensten || []).map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </label>
          <label className='afv-hint' style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <input type='checkbox' checked={alleenBevestigd} data-afv-graaf-bevestigd='' onChange={(e) => setAlleenBevestigd(e.target.checked)} />
            {tr(lang, 'Лише підтверджені зв’язки', 'Alleen bevestigde koppelingen')}
          </label>
        </div>
        <div style={S.chips} role='group' aria-label={tr(lang, 'Типи зв’язків', 'Koppelsoorten')}>
          {KOPPEL_SOORTEN.map((s) => (
            <button key={s} type='button' className={`afv-knop is-klein${soorten.includes(s) ? ' is-actief' : ''}`} aria-pressed={soorten.includes(s)} data-afv-graaf-soort={s} onClick={() => wisselSoort(s)}>
              <span aria-hidden='true' style={{ ...S.stip, background: RAND_KLEUR[s] }} />{afstemmingTekst(KOPPEL_LABEL[s], lang)}
            </button>
          ))}
        </div>
        {leeg ? (
          <div className='afv-leeg'>
            <p>{tr(lang, 'Зв’язків поки немає (або фільтри все сховали).', 'Nog geen koppelingen (of de filters verbergen alles).')}</p>
            <p className='afv-hint'>{tr(lang, 'Зв’язок створюється у самій картці (вкладка «Зв’язки») або з кандидатів, яких система знаходить після змін.', 'Een koppeling ontstaat in de kaart zelf (tab «Relaties») of uit de kandidaten die het systeem na wijzigingen vindt.')}</p>
            <button type='button' className='afv-knop' onClick={() => naarSectie('kartotheek')}>{tr(lang, 'До картотеки', 'Naar de kartotheek')}</button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: smal || !gekozen ? 'minmax(0, 1fr)' : 'minmax(0, 1fr) 260px', gap: 'var(--ruimte-3)' }} className='afv-graaf-romp'>
            <div style={S.vlak}>
              <svg ref={vlak} viewBox={zoomViewBox(MAAT, schaal, pan.dx, pan.dy)} role='img' style={{ width: '100%', height: 'auto', display: 'block', touchAction: 'none', cursor: sleep.current ? 'grabbing' : 'grab' }}
                aria-label={tr(lang, `Граф: ${indeling.knopen.length} карток, ${indeling.randen.length} зв’язків`, `Graf: ${indeling.knopen.length} kaarten, ${indeling.randen.length} koppelingen`)}
                onPointerDown={panStart} onPointerMove={panStap} onPointerUp={panKlaar} onPointerLeave={panKlaar}>
                {indeling.randen.map((r, i) => (
                  <path key={`${r.van}-${r.naar}-${r.soort}-${i}`} d={`M ${r.x1} ${r.y1} Q ${r.mx} ${r.my} ${r.x2} ${r.y2}`} fill='none'
                    stroke={RAND_KLEUR[r.soort]} strokeWidth={1.6} opacity={0.85} strokeDasharray={r.stand === 'bevestigd' ? undefined : '6 4'} data-afv-rand={r.soort}>
                    <title>{`${afstemmingTekst(KOPPEL_LABEL[r.soort], lang)}${r.stand === 'bevestigd' ? '' : tr(lang, ' (запропоновано)', ' (voorgesteld)')}`}</title>
                  </path>
                ))}
                {indeling.knopen.map((k) => (
                  <g key={k.id} transform={`translate(${k.x} ${k.y})`} role='button' tabIndex={0} data-afv-knoop={k.externId}
                    aria-label={`${k.externId} · ${afstemmingTekst(k.titel, lang)}`}
                    style={{ cursor: 'pointer' }}
                    onClick={() => setGekozen(k)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setGekozen(k); } }}>
                    <title>{`${k.externId} · ${afstemmingTekst(k.titel, lang)} · ${afstemmingTekst(LEVENSFASE_LABEL[k.fase], lang)} · ${afstemmingTekst(GEZONDHEID_LABEL[k.gezondheid as keyof typeof GEZONDHEID_LABEL] || ['—', '—'], lang)}`}</title>
                    <circle r={14} fill={gekozen?.id === k.id ? 'var(--accent-soft)' : 'var(--panel)'} stroke={GEZONDHEID_KLEUR[k.gezondheid as keyof typeof GEZONDHEID_KLEUR] || 'var(--muted)'} strokeWidth={2.5} />
                    <text y={28} textAnchor='middle' fontSize={10} fill='var(--text)' style={{ userSelect: 'none' }}>{k.externId}</text>
                  </g>
                ))}
              </svg>
              <div style={S.zoom} data-afv-zoom='' role='group' aria-label={tr(lang, 'Масштаб', 'Zoom')}>
                <button type='button' className='afv-icoonknop' style={{ background: 'var(--surface)' }} aria-label={tr(lang, 'Збільшити', 'Inzoomen')} onClick={() => setSchaal((s) => Math.min(4, Math.round(s * 125) / 100))}><Plus aria-hidden='true' /></button>
                <button type='button' className='afv-icoonknop' style={{ background: 'var(--surface)' }} aria-label={tr(lang, 'Зменшити', 'Uitzoomen')} onClick={() => setSchaal((s) => Math.max(0.5, Math.round((s / 1.25) * 100) / 100))}><Minus aria-hidden='true' /></button>
                <button type='button' className='afv-icoonknop' style={{ background: 'var(--surface)' }} aria-label='100%' onClick={() => { setSchaal(1); setPan({ dx: 0, dy: 0 }); }}><RotateCcw aria-hidden='true' /></button>
              </div>
            </div>
            {gekozen && !smal ? <MiniKaart lang={lang} knoop={gekozen} onOpen={() => openKaart(gekozen.id)} onSluit={() => setGekozen(null)} /> : null}
          </div>
        )}
        {gekozen && smal ? <MiniKaart lang={lang} knoop={gekozen} onOpen={() => openKaart(gekozen.id)} onSluit={() => setGekozen(null)} /> : null}
        {!leeg ? (
          <p style={S.legenda} aria-hidden='false'>
            {soortenInBeeld.map((s) => <span key={s}><span aria-hidden='true' style={{ ...S.stip, background: RAND_KLEUR[s] }} />{afstemmingTekst(KOPPEL_LABEL[s], lang)}</span>)}
            <span>{tr(lang, 'пунктир — запропоновано', 'gestippeld — voorgesteld')}</span>
          </p>
        ) : null}
      </section>
    </div>
  );
}

/** Minikaart naast de graf: detail zonder de context te verliezen; het echte werk gebeurt via «Відкрити картку». */
function MiniKaart({ lang, knoop, onOpen, onSluit }: { lang: 'uk' | 'nl'; knoop: GraafKnoopXY; onOpen: () => void; onSluit: () => void }) {
  return (
    <aside className='afv-blok' style={S.mini} data-afv-graaf-mini={knoop.externId} aria-label={knoop.externId}>
      <h3 style={{ justifyContent: 'space-between' }}>{knoop.externId}
        <button type='button' className='afv-icoonknop' aria-label={tr(lang, 'Закрити', 'Sluiten')} onClick={onSluit}><X aria-hidden='true' /></button>
      </h3>
      <strong style={{ overflowWrap: 'anywhere' }}>{afstemmingTekst(knoop.titel, lang)}</strong>
      <p className='afv-hint' style={{ margin: 0 }}>{afstemmingTekst(LEVENSFASE_LABEL[knoop.fase], lang)}</p>
      <p className='afv-hint' style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
        <span aria-hidden='true' style={{ ...S.stip, borderRadius: 999, background: GEZONDHEID_KLEUR[knoop.gezondheid as keyof typeof GEZONDHEID_KLEUR] || 'var(--muted)' }} />
        {afstemmingTekst(GEZONDHEID_LABEL[knoop.gezondheid as keyof typeof GEZONDHEID_LABEL] || ['Невідомо', 'Onbekend'], lang)}
      </p>
      <button type='button' className='afv-knop is-hoofd' data-afv-graaf-open='' onClick={onOpen}>{tr(lang, 'Відкрити картку', 'Kaart openen')}</button>
    </aside>
  );
}
