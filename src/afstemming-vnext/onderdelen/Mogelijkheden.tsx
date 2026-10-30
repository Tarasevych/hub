// Afstemming vNext — «Можливості» (uitvoerder D3, §2.6): de MENSELIJKE gids over wat de site vandaag kan en hoe je het
// gebruikt. De stand komt van de server en wordt hier nooit opgeplust: «перевірено» (groen) bestaat alleen met productie­-
// bewijs achter de kaart; al het andere heet neutraal «не перевірено» met de eerlijke uitleg waarom. Geen technische
// geheimen — alleen uitleg en de route.
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Search, Sparkles } from 'lucide-react';
import { afstemmingTekst } from '../../../shared/afstemming-model';
import { afstemmingClient, AfstemmingFout, type MogelijkhedenUit } from '../afstemming-client';
import { filterMogelijkheden } from '../zvirka-kern';
import { foutTekst, tr } from '../tekst';
import type { OnderdeelProps } from '../AfstemmingPagina';

const S: Record<string, CSSProperties> = {
  item: { display: 'grid', gap: 4, padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 'var(--straal-m)', background: 'var(--panel)', minWidth: 0 },
  kop: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  badge: { display: 'inline-flex', alignItems: 'center', padding: '2px 10px', borderRadius: 999, fontSize: 'var(--tekst-mini)', fontWeight: 650 },
  zoek: { position: 'relative', display: 'flex', alignItems: 'center', maxWidth: 420 },
};

export default function Mogelijkheden({ lang }: OnderdeelProps) {
  const [uit, setUit] = useState<MogelijkhedenUit | null>(null);
  const [laden, setLaden] = useState(true);
  const [fout, setFout] = useState('');
  const [bouw, setBouw] = useState(false);
  const [zoek, setZoek] = useState('');

  useEffect(() => {
    let weg = false;
    afstemmingClient.mogelijkheden()
      .then((m) => { if (!weg) { setUit(m); setFout(''); } })
      .catch((e) => { if (weg) return; const code = e instanceof AfstemmingFout ? e.code : 'FOUT'; if (code === 'NOG_NIET_GEBOUWD') setBouw(true); else setFout(foutTekst(lang, code)); })
      .finally(() => { if (!weg) setLaden(false); });
    return () => { weg = true; };
  }, [lang]);

  const rubrieken = useMemo(() => (uit ? filterMogelijkheden(uit.rubrieken, zoek) : []), [uit, zoek]);

  if (laden) return <p className='afv-hint' role='status' aria-busy='true'>{tr(lang, 'Завантаження довідника…', 'Gids laden…')}</p>;
  if (bouw) return <section className='afv-leeg' data-afv-bouw='Mogelijkheden'><p>{tr(lang, 'Серверна частина довідника ще збирається.', 'De serverkant van de gids is nog in aanbouw.')}</p></section>;
  if (fout) return <p className='afv-melding is-fout' role='alert'>{fout}</p>;

  return (
    <div style={{ display: 'grid', gap: 'var(--ruimte-4)', minWidth: 0 }} data-afv-mogelijkheden=''>
      <section className='afv-blok'>
        <h3><Sparkles aria-hidden='true' />{tr(lang, 'Що вже вміє сайт', 'Wat de site al kan')}</h3>
        <p className='afv-hint'>{tr(lang,
          'Довідник для людини: можливість, коротке «як користуватися» і адреса. Зелене «перевірено» з’являється лише тоді, коли за карткою стоїть доказ із production — не зі слів агента.',
          'De gids voor mensen: de mogelijkheid, een korte gebruiksuitleg en de route. Het groene «перевірено» verschijnt alleen wanneer er productiebewijs achter de kaart staat — niet op het woord van een agent.')}</p>
        <div style={S.zoek}>
          <Search aria-hidden='true' style={{ position: 'absolute', left: 10, color: 'var(--muted)', pointerEvents: 'none' }} />
          <input value={zoek} data-afv-mogelijkheden-zoek='' style={{ width: '100%', paddingLeft: 32, borderRadius: 999 }}
            placeholder={tr(lang, 'Пошук можливості…', 'Zoek een mogelijkheid…')} aria-label={tr(lang, 'Пошук у довіднику', 'Zoeken in de gids')}
            onChange={(e) => setZoek(e.target.value)} />
        </div>
      </section>
      {!rubrieken.length ? (
        <section className='afv-leeg'>
          <p>{zoek ? tr(lang, 'Нічого не знайдено за цим запитом.', 'Niets gevonden voor deze zoekopdracht.') : tr(lang, 'Довідник ще порожній: він наповнюється з карток, що мають інструкцію.', 'De gids is nog leeg: hij vult zich uit kaarten met een gebruiksuitleg.')}</p>
        </section>
      ) : rubrieken.map((r) => (
        <section key={r.dienst} className='afv-blok' data-afv-mogelijkheden-rubriek={r.dienst}>
          <h3>{r.dienst}</h3>
          <div style={{ display: 'grid', gap: 8 }} role='list'>
            {r.items.map((i) => (
              <article key={i.externId} style={S.item} role='listitem' data-afv-mogelijkheid={i.externId}>
                <div style={S.kop}>
                  <strong style={{ overflowWrap: 'anywhere' }}>{afstemmingTekst(i.titel, lang)}</strong>
                  {i.stand === 'перевірено'
                    ? <span style={{ ...S.badge, background: 'var(--ok-zacht)', color: 'var(--ok)' }} data-afv-stand='перевірено'>{tr(lang, 'перевірено', 'gecontroleerd')}</span>
                    : <span style={{ ...S.badge, background: 'var(--surface)', color: 'var(--muted)' }} data-afv-stand='не перевірено' title={tr(lang, 'Потрібен доказ із production', 'Productiebewijs vereist')}>{tr(lang, 'не перевірено', 'niet gecontroleerd')}</span>}
                </div>
                <p style={{ margin: 0, overflowWrap: 'anywhere' }}>{i.uitleg}</p>
                <p className='afv-hint' style={{ margin: 0 }}>{tr(lang, 'Де:', 'Waar:')} <code>{i.route}</code></p>
                {i.stand !== 'перевірено' ? <p className='afv-hint' style={{ margin: 0 }}>{tr(lang, 'Стане «перевірено» після доказу з production (розділ «Перевірки»).', 'Wordt «gecontroleerd» na productiebewijs (onderdeel «Controles»).')}</p> : null}
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
