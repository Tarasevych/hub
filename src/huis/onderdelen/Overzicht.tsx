// Overzicht: kanaal, eerlijke lege toestand, kerncijfers ALLEEN uit waarnemingen (temperatuur met bron/tijd, licht aan als ACK'd,
// energie gemeten, beveiliging «onbekend» zonder officiële status), scènes, kleine plattegrond, drie recente gebeurtenissen.
import { useMemo, useState } from 'react';
import { AlertCircle, ArrowRight, Gauge, Lightbulb, Plug, ShieldCheck, Sparkles, Thermometer } from 'lucide-react';
import { VERSHEID_LABEL, versheid, type Apparaat } from '../../../shared/huis-model';
import type { OnderdeelProps } from '../HuisPagina';
import { HuisFout, huisClient, idem } from '../huis-client';
import { foutTekst, geledenTekst, hoofdTekst, toestandVan, tr } from '../tekst';
import Plattegrond from './Plattegrond';

export default function Overzicht({ lang, smal, woningId, ov, vernieuw, toon, naarTab }: OnderdeelProps) {
  const [bezig, setBezig] = useState('');
  const aparaten = ov.apparaten;
  const temp = useMemo(() => aparaten.map((a) => ({ a, t: toestandVan(a, 'temperatuur') })).filter((x) => x.t && typeof x.t.waarde === 'number'), [aparaten]);
  const lichten = useMemo(() => aparaten.filter((a) => a.soort === 'light'), [aparaten]);
  const lichtAan = lichten.filter((a) => toestandVan(a, 'aan')?.waarde === true && versheid(toestandVan(a, 'aan')) === 'vers');
  const vermogen = useMemo(() => aparaten.map((a) => toestandVan(a, 'vermogen')).filter((t) => t && typeof t.waarde === 'number' && versheid(t) === 'vers'), [aparaten]);
  const energie = useMemo(() => aparaten.map((a) => toestandVan(a, 'energie')).filter((t) => t && typeof t.waarde === 'number' && versheid(t) === 'vers'), [aparaten]);
  const meters = aparaten.filter((a) => a.mogelijkheden.some((m) => m.soort === 'energie' || m.soort === 'vermogen')).length;
  const alarm = aparaten.find((a) => a.mogelijkheden.some((m) => m.soort === 'alarm'));
  const alarmT = alarm ? toestandVan(alarm, 'alarm') : undefined;
  const runScene = async (id: string) => {
    setBezig(id);
    try { const r = await huisClient.sceneUitvoeren(woningId, id, idem('scene')); toon(r.uitkomst === 'voltooid' ? tr(lang, 'Сцену виконано й підтверджено.', 'Scène uitgevoerd en bevestigd.') : r.uitkomst === 'gedeeltelijk' ? tr(lang, 'Сцену виконано частково — див. Сцени.', 'Scène gedeeltelijk — zie Scènes.') : tr(lang, 'Сцена не виконана — див. Сцени.', 'Scène mislukt — zie Scènes.')); await vernieuw(); }
    catch (e) { toon(foutTekst(lang, e instanceof HuisFout ? e.code : 'FOUT')); } finally { setBezig(''); }
  };
  const geenIntegratie = !ov.integraties.length;
  return (
    <div className='hv-overzicht'>
      {geenIntegratie ? (
        <section className='hv-leeg' data-hv-leeg='geen-integratie'>
          <Plug aria-hidden='true' />
          <h3>{tr(lang, 'Шлюз ще не підключено', 'Nog geen gateway gekoppeld')}</h3>
          <p>{tr(lang, 'Ця сторінка не показує вигаданих температур чи станів. Підключіть Home Assistant — єдиний адаптер цього випуску — і пристрої з’являться з реальними, датованими значеннями.', 'Deze pagina toont geen verzonnen temperaturen of toestanden. Koppel Home Assistant — de enige adapter van deze release — en apparaten verschijnen met echte, gedateerde waarden.')}</p>
          <button type='button' className='hv-knop is-hoofd' onClick={() => naarTab('integrations')} data-hv-cta='integraties'><Plug aria-hidden='true' />{tr(lang, 'Налаштувати перший шлюз', 'Eerste gateway instellen')}</button>
        </section>
      ) : null}
      <div className='hv-tegels'>
        <button type='button' className='hv-tegel' onClick={() => naarTab('devices')} data-hv-tegel='temperatuur'>
          <Thermometer aria-hidden='true' /><strong>{temp.length ? `${temp[0].t!.waarde} ${temp[0].t!.eenheid}` : '—'}</strong>
          <span>{temp.length ? `${temp[0].a.naam} · ${geledenTekst(lang, temp[0].t!.waargenomenOp || temp[0].t!.ontvangenOp)}` : tr(lang, 'температура: немає вимірів', 'temperatuur: geen meting')}</span>
        </button>
        <button type='button' className='hv-tegel' onClick={() => naarTab('devices')} data-hv-tegel='licht'>
          <Lightbulb aria-hidden='true' /><strong>{lichten.length ? `${lichtAan.length}/${lichten.length}` : '—'}</strong>
          <span>{lichten.length ? tr(lang, 'світильників увімкнено (підтверджено)', 'lampen aan (bevestigd)') : tr(lang, 'світло: немає пристроїв', 'licht: geen apparaten')}</span>
        </button>
        <button type='button' className='hv-tegel' onClick={() => naarTab('energy')} data-hv-tegel='energie'>
          <Gauge aria-hidden='true' /><strong>{vermogen.length ? `${vermogen.reduce((s, t) => s + Number(t!.waarde), 0).toFixed(0)} W` : energie.length ? `${energie[0]!.waarde} ${energie[0]!.eenheid || 'kWh'}` : '—'}</strong>
          <span>{vermogen.length ? tr(lang, 'виміряна потужність зараз', 'gemeten vermogen nu') : energie.length ? tr(lang, 'лічильник енергії (сумарно)', 'energiemeter (totaal)') : meters ? tr(lang, 'лічильник є, актуального виміру немає', 'meter aanwezig, geen actuele meting') : tr(lang, 'енергія: немає лічильника', 'energie: geen meter')}</span>
        </button>
        <button type='button' className='hv-tegel' onClick={() => naarTab('security')} data-hv-tegel='beveiliging'>
          <ShieldCheck aria-hidden='true' /><strong>{alarmT && alarmT.waarde && versheid(alarmT) === 'vers' ? String(alarmT.waarde) : tr(lang, 'невідомо', 'onbekend')}</strong>
          <span>{alarm ? tr(lang, `охорона · ${geledenTekst(lang, alarmT?.waargenomenOp || alarmT?.ontvangenOp || null)}`, `alarm · ${geledenTekst(lang, alarmT?.waargenomenOp || alarmT?.ontvangenOp || null)}`) : tr(lang, 'охорона: офіційного статусу немає', 'alarm: geen officiële status')}</span>
        </button>
      </div>
      <div className={`hv-kolommen${smal ? ' is-een' : ''}`}>
        <section className='hv-blok' aria-labelledby='hv-ov-plan'>
          <h3 id='hv-ov-plan'>{tr(lang, 'План', 'Plattegrond')}</h3>
          {ov.ruimtes.length ? <Plattegrond lang={lang} ruimtes={ov.ruimtes} apparaten={aparaten} verdieping={ov.woning.verdiepingen[0]?.id ?? '0'} onKies={() => naarTab('rooms')} compact />
            : <p className='hv-hint'>{tr(lang, 'Кімнат ще немає.', 'Nog geen kamers.')} <button type='button' className='hv-knop is-klein' onClick={() => naarTab('rooms')}>{tr(lang, 'Додати кімнати', 'Kamers toevoegen')}<ArrowRight aria-hidden='true' /></button></p>}
        </section>
        <section className='hv-blok' aria-labelledby='hv-ov-scenes'>
          <h3 id='hv-ov-scenes'>{tr(lang, 'Сцени', 'Scènes')}</h3>
          {ov.scenes.length ? (
            <div className='hv-scenes-rij'>{ov.scenes.slice(0, 6).map((s) => (
              <button key={s.id} type='button' className='hv-scene-kaart' disabled={Boolean(bezig) || !ov.lid.magSchrijven} onClick={() => void runScene(s.id)} data-hv-scene={s.id}>
                <Sparkles aria-hidden='true' /><strong>{s.naam}</strong><small>{s.stappen.length} {tr(lang, 'дій', 'stappen')}{s.laatsteRun && (s.laatsteRun as any).uitkomst ? ` · ${(s.laatsteRun as any).uitkomst}` : ''}</small>
              </button>
            ))}</div>
          ) : <p className='hv-hint'>{tr(lang, 'Сцен ще немає.', 'Nog geen scènes.')} <button type='button' className='hv-knop is-klein' onClick={() => naarTab('scenes')}>{tr(lang, 'Створити', 'Maken')}<ArrowRight aria-hidden='true' /></button></p>}
        </section>
      </div>
      <section className='hv-blok' aria-labelledby='hv-ov-recent'>
        <h3 id='hv-ov-recent'>{tr(lang, 'Останні події', 'Recente gebeurtenissen')}</h3>
        {ov.gebeurtenissen.length ? <ul className='hv-gebeurtenissen is-klein'>{ov.gebeurtenissen.slice(0, 3).map((g) => <li key={g.id} className={`is-${g.ernst}`}><span>{geledenTekst(lang, g.ontvangenOp)}</span><strong>{g.bericht}</strong><small>{g.bron}</small></li>)}</ul> : <p className='hv-hint'>{tr(lang, 'Подій ще немає.', 'Nog geen gebeurtenissen.')}</p>}
        <button type='button' className='hv-knop is-klein is-stil' onClick={() => naarTab('activity')}>{tr(lang, 'Усі події', 'Alle gebeurtenissen')}<ArrowRight aria-hidden='true' /></button>
      </section>
      {ov.voorstellenWacht ? <p className='hv-melding is-info'><AlertCircle aria-hidden='true' />{tr(lang, `${ov.voorstellenWacht} пропозицій ШІ чекають на ваше рішення.`, `${ov.voorstellenWacht} AI-voorstellen wachten op uw besluit.`)} <button type='button' className='hv-knop is-klein' onClick={() => naarTab('assistant')}>{tr(lang, 'Переглянути', 'Bekijken')}</button></p> : null}
      {aparaten.some((a) => versheid(a.toestanden[0]) === 'verouderd') ? <p className='hv-hint'><AlertCircle aria-hidden='true' />{tr(lang, `Деякі значення застарілі (${VERSHEID_LABEL.verouderd[0]}): натисніть «Оновити» або перевірте шлюз.`, `Sommige waarden zijn verouderd: ververs of controleer de gateway.`)}</p> : null}
      <DeviceTeller lang={lang} apparaten={aparaten} />
    </div>
  );
}
function DeviceTeller({ lang, apparaten }: { lang: 'uk' | 'nl'; apparaten: Apparaat[] }) {
  if (!apparaten.length) return null;
  const vers = apparaten.filter((a) => versheid(a.toestanden[0]) === 'vers').length;
  return <p className='hv-hint' data-hv-teller={apparaten.length}>{tr(lang, `${apparaten.length} пристроїв, ${vers} з актуальними даними`, `${apparaten.length} apparaten, ${vers} met actuele gegevens`)} · {hoofdTekst(lang, apparaten[0]).tekst}</p>;
}
