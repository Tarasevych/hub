// Afstemming vNext — «Перевірки» (§5+§8): виключно зафіксовані факти з карток і звіту (критерії без доказів, регресії,
// невідомий стан, застарілі перевірки), безпечні внутрішні проби готовності маршрутів власником (/proef) та статичний інвентар.
import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { Activity, CircleCheckBig, FileSearch, ScanSearch } from 'lucide-react';
import { AFSTEMMING_LIMIETEN, afstemmingTekst, voortgangTekst, type Kaart, type RouteProefUit, type ScanBevinding } from '../../../shared/afstemming-model';
import { afstemmingClient, AfstemmingFout, type RapportUit } from '../afstemming-client';
import { groepeerKaarten, type ControleGroepen } from '../zvirka-kern';
import { useVlag } from '../../functievlag-lezen';
import { foutTekst, geledenTekst, tr, type Lang } from '../tekst';
import type { OnderdeelProps } from '../AfstemmingPagina';

const S: Record<string, CSSProperties> = {
  rij: { display: 'flex', alignItems: 'center', gap: 10, width: '100%', minHeight: 44, padding: '8px 12px', border: '1px solid var(--line)', borderRadius: 'var(--straal-m)', background: 'var(--panel)', textAlign: 'left' },
  id: { font: '600 12px/1.2 ui-monospace, Menlo, Consolas, monospace', color: 'var(--accent)', flex: 'none' },
  titel: { flex: 1, minWidth: 0, overflowWrap: 'anywhere' },
  teller: { color: 'var(--muted)', fontSize: 'var(--tekst-mini)', flex: 'none' },
  badge: { display: 'inline-flex', alignItems: 'center', padding: '2px 10px', borderRadius: 999, fontSize: 'var(--tekst-mini)', fontWeight: 650, flex: 'none' },
};
const badge = (kleur: 'ok' | 'warn' | 'fout' | 'info'): CSSProperties => ({ ...S.badge, background: `var(--${kleur}-zacht)`, color: `var(--${kleur})` });
const BEVINDING_LABEL: Record<ScanBevinding['soort'], [string, string]> = {
  zonder_kaart: ['Знайдено без картки', 'Gevonden zonder kaart'], kaart_zonder_spoor: ['Картка без сліду в коді', 'Kaart zonder spoor in de code'],
  vlag: ['Прапорець', 'Vlag'], route: ['Маршрут', 'Route'], tab: ['Вкладка', 'Tab'],
};

export default function Controles({ lang, openKaart, toon }: OnderdeelProps) {
  const volledigAan = useVlag('afstemming-volledig-v1', false);
  const [groepen, setGroepen] = useState<ControleGroepen | null>(null);
  const [rapport, setRapport] = useState<RapportUit | null>(null);
  const [laden, setLaden] = useState(true);
  const [fout, setFout] = useState('');
  const [bouw, setBouw] = useState(false);
  const [scanUit, setScanUit] = useState<{ bevindingen: ScanBevinding[]; op: string } | null>(null);
  const [scanBezig, setScanBezig] = useState(false);
  const [maakBezig, setMaakBezig] = useState('');
  const [proefDienst, setProefDienst] = useState('');
  const [proefUit, setProefUit] = useState<RouteProefUit | null>(null);
  const [proefBezig, setProefBezig] = useState(false);

  useEffect(() => {
    let weg = false;
    Promise.all([afstemmingClient.kaarten({}), afstemmingClient.rapport().catch(() => null)])
      .then(([k, r]) => { if (!weg) { setGroepen(groepeerKaarten(k.kaarten)); setRapport(r); setFout(''); } })
      .catch((e) => { if (weg) return; const code = e instanceof AfstemmingFout ? e.code : 'FOUT'; if (code === 'NOG_NIET_GEBOUWD') setBouw(true); else setFout(foutTekst(lang, code)); })
      .finally(() => { if (!weg) setLaden(false); });
    return () => { weg = true; };
  }, [lang]);

  const scan = useCallback(async () => {
    setScanBezig(true);
    try { setScanUit(await afstemmingClient.scan()); setFout(''); }
    catch (e) { setFout(foutTekst(lang, e instanceof AfstemmingFout ? e.code : 'FOUT')); }
    finally { setScanBezig(false); }
  }, [lang]);

  const draaiProef = useCallback(async () => {
    if (!volledigAan) return;
    setProefBezig(true);
    try {
      const uit = await afstemmingClient.proef(proefDienst ? { dienst: proefDienst } : {});
      setProefUit(uit);
      setFout('');
    } catch (e) {
      setFout(foutTekst(lang, e instanceof AfstemmingFout ? e.code : 'FOUT'));
    } finally {
      setProefBezig(false);
    }
  }, [lang, proefDienst, volledigAan]);

  // Сценарій 6: знахідка без картки → чернетка з ключем повторостійкості (повторне натискання повертає ту саму картку).
  const maakConcept = useCallback(async (b: ScanBevinding) => {
    setMaakBezig(b.sleutel);
    try {
      const { kaart } = await afstemmingClient.voorstel({ titel: b.sleutel, bedoeling: b.detail, categorie: 'scan', bron: 'gesprek', idempotentie: `scan:${b.sleutel}` });
      toon(tr(lang, `Чернетку створено: ${kaart.externId}`, `Concept gemaakt: ${kaart.externId}`));
      openKaart(kaart.id);
    } catch (e) { setFout(foutTekst(lang, e instanceof AfstemmingFout ? e.code : 'FOUT')); }
    finally { setMaakBezig(''); }
  }, [lang, openKaart, toon]);

  if (laden) return <p className='afv-hint' role='status' aria-busy='true'>{tr(lang, 'Завантаження перевірок…', 'Controles laden…')}</p>;
  if (bouw) return <section className='afv-leeg' data-afv-bouw='Controles'><p>{tr(lang, 'Серверна частина перевірок ще збирається.', 'De serverkant van de controles is nog in aanbouw.')}</p></section>;

  const rij = (k: Kaart) => (
    <button key={k.id} type='button' style={S.rij} data-afv-controle-kaart={k.externId} onClick={() => openKaart(k.id)}>
      <span style={S.id}>{k.externId}</span>
      <span style={S.titel}>{afstemmingTekst(k.titel, lang)}</span>
      <span style={S.teller}>{voortgangTekst(k.criteriaGeslaagd, k.criteriaTotaal, lang)}</span>
    </button>
  );
  const groep = (kop: string, uitleg: string, kaarten: Kaart[], kleur: 'warn' | 'fout' | 'info', attr: string) => (
    <section className='afv-blok' data-afv-controle-groep={attr}>
      <h3><CircleCheckBig aria-hidden='true' />{kop} <span style={badge(kleur)}>{kaarten.length}</span></h3>
      <p className='afv-hint'>{uitleg}</p>
      {kaarten.length ? <div style={{ display: 'grid', gap: 6 }} role='list'>{kaarten.map(rij)}</div> : <p className='afv-hint'>{tr(lang, 'Нічого — добре.', 'Niets — mooi zo.')}</p>}
    </section>
  );

  return (
    <div style={{ display: 'grid', gap: 'var(--ruimte-4)', minWidth: 0 }} data-afv-controles=''>
      {fout ? <p className='afv-melding is-fout' role='alert'>{fout}</p> : null}
      <p className='afv-melding is-info' data-afv-eerlijk=''>
        {tr(lang,
          'Чесно: тут показані зафіксовані докази (випробування, перевірки після випуску, рішення власника) та безпечні внутрішні проби готовності маршрутів без жодних мутацій даних.',
          'Eerlijk: hier staan vastgelegde bewijzen (tests, controles na uitrol, eigenaarsbesluiten) en veilige interne routecontroles zonder gegevensmutaties.')}
      </p>
      {volledigAan ? (
        <section className='afv-blok' data-afv-proef-blok=''>
          <h3><Activity aria-hidden='true' />{tr(lang, 'Безпечні внутрішні проби готовності маршрутів', 'Veilige interne routecontroles')}</h3>
          <p className='afv-hint'>{tr(lang,
            'Перевірка з’єднання з базою даних, реєстру прапорців, канонічних вкладок і внутрішніх маршрутів у режимі лише читання без зовнішніх мережевих запитів.',
            'Alleen-lezen controle van databaseverbinding, vlaggenregister, canonieke tabbladen en interne routes zonder externe netwerkaanroepen.')}</p>
          <div className='afv-rij'>
            <select value={proefDienst} aria-label={tr(lang, 'Цільова служба', 'Doeldienst')} onChange={(e) => setProefDienst(e.target.value)}>
              <option value=''>{tr(lang, 'Усі основні служби', 'Alle hoofddiensten')}</option>
              {(['hub', 'mail', 'cloud', 'api', 'admin', 'mcp', 'huis', 'identity'] as const).map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            <button type='button' className='afv-knop' data-afv-proef='' disabled={proefBezig} onClick={() => void draaiProef()}>
              {proefBezig ? tr(lang, 'Виконуємо пробу…', 'Proef loopt…') : tr(lang, 'Запустити внутрішню пробу', 'Interne proef starten')}
            </button>
          </div>
          {proefUit ? (
            <div style={{ display: 'grid', gap: 6 }} data-afv-proef-uit={proefUit.omgeving}>
              <p className='afv-hint'>
                {tr(lang, `Середовище: ${proefUit.omgeving} · ${geledenTekst(lang, proefUit.op)}`, `Omgeving: ${proefUit.omgeving} · ${geledenTekst(lang, proefUit.op)}`)}
              </p>
              <div style={{ display: 'grid', gap: 6 }} role='list'>
                {proefUit.controles.map((c) => (
                  <div key={c.id} style={{ ...S.rij, cursor: 'default' }} role='listitem' data-afv-proef-item={c.id}>
                    <span style={badge(c.status === 'ok' ? 'ok' : c.status === 'let_op' ? 'warn' : 'fout')}>{c.status}</span>
                    <span style={S.titel}>{afstemmingTekst(c.naam, lang)}</span>
                    <code style={{ fontSize: 11 }}>{c.detail}</code>
                    <span style={S.teller}>{c.duurMs} ms</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}
      {groepen ? (
        <>
          {groep(tr(lang, 'Критерії без доказів', 'Criteria zonder bewijs'), tr(lang, 'Картки з критеріями приймання, до яких ще не прикріплено жодного доказу.', 'Kaarten met acceptatiecriteria waar nog geen enkel bewijsstuk aan hangt.'), groepen.zonderBewijs, 'warn', 'zonder-bewijs')}
          {groep(tr(lang, 'Регресії', 'Regressies'), tr(lang, 'Раніше працювало — тепер доказ каже, що ні. Потребує уваги першим.', 'Werkte eerder — nu zegt het bewijs van niet. Verdient als eerste aandacht.'), groepen.regressies, 'fout', 'regressies')}
          {groep(tr(lang, 'Невідомий стан', 'Onbekende staat'), tr(lang, 'Жодного свіжого доказу ні «за», ні «проти» — чесна відповідь: невідомо.', 'Geen vers bewijs vóór of tegen — het eerlijke antwoord: onbekend.'), groepen.onbekend, 'info', 'onbekend')}
        </>
      ) : null}
      <section className='afv-blok'>
        <h3><FileSearch aria-hidden='true' />{tr(lang, 'Застарілі перевірки', 'Verouderde controles')} {rapport ? <span style={badge('warn')}>{rapport.verouderd}</span> : null}</h3>
        <p className='afv-hint'>{tr(lang,
          `Доказ старіший за ${AFSTEMMING_LIMIETEN.gezondheidVerouderdDagen} днів більше не вважається свіжим: сайт змінюється, тож перевірку варто повторити.`,
          `Bewijs ouder dan ${AFSTEMMING_LIMIETEN.gezondheidVerouderdDagen} dagen telt niet meer als vers: de site verandert, dus de controle verdient een herhaling.`)}</p>
        {!rapport ? <p className='afv-hint'>{tr(lang, 'Звіт ще недоступний.', 'Het rapport is nog niet beschikbaar.')}</p> : null}
      </section>
      <section className='afv-blok'>
        <h3><ScanSearch aria-hidden='true' />{tr(lang, 'Статичний інвентар', 'Statische inventaris')}</h3>
        <p className='afv-hint'>{tr(lang,
          'Порівняння в режимі лише читання реєстрів самого сервера (маршрути, прапорці, вкладки) з картотекою: що живе без картки і які картки не мають сліду. Без жодного запиту до зовнішньої мережі.',
          'Alleen-lezen vergelijking van de registers van de server zelf (routes, vlaggen, tabs) met de kartotheek: wat leeft zonder kaart en welke kaarten geen spoor hebben. Zonder één externe aanroep.')}</p>
        <div><button type='button' className='afv-knop' data-afv-scan='' disabled={scanBezig} onClick={() => void scan()}>{scanBezig ? tr(lang, 'Сканування…', 'Scannen…') : tr(lang, 'Запустити інвентаризацію', 'Inventarisatie starten')}</button></div>
        {scanUit ? (
          <>
            <p className='afv-hint'>{tr(lang, `Знахідок: ${scanUit.bevindingen.length} · ${geledenTekst(lang, scanUit.op)}`, `Bevindingen: ${scanUit.bevindingen.length} · ${geledenTekst(lang, scanUit.op)}`)}</p>
            <div style={{ display: 'grid', gap: 6 }} role='list'>
              {scanUit.bevindingen.map((b, i) => (
                <div key={`${b.soort}-${b.sleutel}-${i}`} style={{ ...S.rij, cursor: 'default' }} role='listitem' data-afv-bevinding={b.soort}>
                  <span style={badge(b.soort === 'zonder_kaart' ? 'warn' : b.soort === 'kaart_zonder_spoor' ? 'info' : 'ok')}>{tr(lang, BEVINDING_LABEL[b.soort][0], BEVINDING_LABEL[b.soort][1])}</span>
                  <code style={{ flex: 'none' }}>{b.sleutel}</code>
                  <span style={S.titel} className='afv-hint'>{b.detail}</span>
                  {b.soort === 'zonder_kaart' ? (
                    <button type='button' className='afv-knop is-klein' data-afv-bevinding-concept={b.sleutel} disabled={maakBezig === b.sleutel} onClick={() => void maakConcept(b)}>{tr(lang, 'Створити чернетку', 'Concept maken')}</button>
                  ) : null}
                  {b.soort === 'kaart_zonder_spoor' && b.kaartId ? (
                    <button type='button' className='afv-knop is-klein' onClick={() => openKaart(b.kaartId!)}>{tr(lang, 'Відкрити картку', 'Kaart openen')}</button>
                  ) : null}
                </div>
              ))}
            </div>
          </>
        ) : null}
      </section>
    </div>
  );
}

/** Збережено для сумісності експорту типів цього файла. */
export type ControlesLang = Lang;
