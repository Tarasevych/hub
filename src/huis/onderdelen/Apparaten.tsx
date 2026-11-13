// Пристрої: пошук, відбір за родом, кімнатою й актуальністю, картки зі справжніми значеннями та оглядова панель пристрою.
// Apparaten: zoeken, selectie op soort, kamer en versheid, kaarten met gemeten waarden en het detailpaneel met bediening.
import { useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import { MOGELIJKHEID_LABEL, VERSHEID_LABEL, versheid } from '../../../shared/huis-model';
import type { OnderdeelProps } from '../HuisPagina';
import ApparaatBediening from '../ApparaatBediening';
import HuisLaag from '../HuisLaag';
import { HuisFout, huisClient } from '../huis-client';
import { datumTekst, foutTekst, hoofdTekst, soortTekst, tr } from '../tekst';
import '../huis-ruimtes-maquette.css';

export default function Apparaten({ lang, smal, woningId, ov, vernieuw, toon, naarTab }: OnderdeelProps) {
  const [vraag, setVraag] = useState('');
  const [soort, setSoort] = useState('');
  const [kamer, setKamer] = useState('');
  const [vers, setVers] = useState('');
  const [openId, setOpenId] = useState('');
  const [naam, setNaam] = useState('');
  const [bezig, setBezig] = useState(false);
  const mag = ov.lid.magSchrijven; const magCmd = mag && ov.integraties.some((i) => i.schrijven);
  const soorten = useMemo(() => [...new Set(ov.apparaten.map((a) => a.soort))].sort(), [ov.apparaten]);
  const lijst = useMemo(() => {
    const q = vraag.trim().toLowerCase();
    return ov.apparaten.filter((a) => (!q || a.naam.toLowerCase().includes(q) || a.bronId.toLowerCase().includes(q)) && (!soort || a.soort === soort) && (!kamer || (kamer === 'geen' ? !a.ruimteId : a.ruimteId === kamer)) && (!vers || versheid(a.toestanden[0]) === vers));
  }, [ov.apparaten, vraag, soort, kamer, vers]);
  const open = openId ? ov.apparaten.find((a) => a.id === openId) ?? null : null;
  const doe = async (f: () => Promise<unknown>, ok?: string) => { setBezig(true); try { await f(); await vernieuw(); if (ok) toon(ok); } catch (e) { toon(foutTekst(lang, e instanceof HuisFout ? e.code : 'FOUT'), 'fout'); } finally { setBezig(false); } };
  if (!ov.apparaten.length) return <section className='hv-leeg'><h3>{tr(lang, 'Пристроїв ще немає', 'Nog geen apparaten')}</h3><p>{tr(lang, ov.integraties.length ? 'Інтеграцію підключено, але нічого не імпортовано. Відкрийте Інтеграції → Знайти пристрої.' : 'Підключіть Home Assistant — пристрої з’являться з реальними станами.', ov.integraties.length ? 'De integratie is gekoppeld, maar er is niets geïmporteerd. Open Integraties → Apparaten zoeken.' : 'Koppel Home Assistant — apparaten verschijnen met echte toestanden.')}</p><button type='button' className='hv-knop is-hoofd' onClick={() => naarTab('integrations')}>{tr(lang, 'До інтеграцій', 'Naar integraties')}</button></section>;
  return (
    <div className='hv-apparaten' data-mq-sectie='apparaten'>
      <div className='hv-werkbalk' role='search'>
        <label className='hv-zoekveld'><Search aria-hidden='true' /><input type='search' value={vraag} placeholder={tr(lang, 'Пошук пристрою…', 'Apparaat zoeken…')} aria-label={tr(lang, 'Пошук пристрою', 'Apparaat zoeken')} onChange={(e) => setVraag(e.target.value)} data-hv-zoek='1' /></label>
        <select value={soort} onChange={(e) => setSoort(e.target.value)} aria-label={tr(lang, 'Тип', 'Soort')}><option value=''>{tr(lang, 'усі типи', 'alle soorten')}</option>{soorten.map((s) => <option key={s} value={s}>{soortTekst(lang, s)}</option>)}</select>
        <select value={kamer} onChange={(e) => setKamer(e.target.value)} aria-label={tr(lang, 'Кімната', 'Kamer')}><option value=''>{tr(lang, 'усі кімнати', 'alle kamers')}</option><option value='geen'>{tr(lang, 'без кімнати', 'zonder kamer')}</option>{ov.ruimtes.map((r) => <option key={r.id} value={r.id}>{r.naam}</option>)}</select>
        <select value={vers} onChange={(e) => setVers(e.target.value)} aria-label={tr(lang, 'Актуальність', 'Versheid')}><option value=''>{tr(lang, 'будь-яка актуальність', 'elke versheid')}</option>{(['vers', 'verouderd', 'onbekend', 'onbeschikbaar'] as const).map((v) => <option key={v} value={v}>{tr(lang, VERSHEID_LABEL[v][0], VERSHEID_LABEL[v][1])}</option>)}</select>
        {vraag || soort || kamer || vers ? <button type='button' className='hv-knop is-klein is-stil' onClick={() => { setVraag(''); setSoort(''); setKamer(''); setVers(''); }}><X aria-hidden='true' />{tr(lang, 'Скинути', 'Wissen')}</button> : null}
      </div>
      <p className='hv-hint'>{lijst.length} / {ov.apparaten.length}</p>
      <div className='hv-raster' data-hv-apparaten={lijst.length}>
        {lijst.map((a) => {
          const h = hoofdTekst(lang, a);
          const r = ov.ruimtes.find((x) => x.id === a.ruimteId);
          const verbinding = a.online === false || h.vers === 'onbeschikbaar' ? 'onbeschikbaar' : a.online === true && h.vers === 'vers' ? 'online' : 'onbekend';
          return (
            <button key={a.id} type='button' className={`hv-kaart is-${h.vers}${a.kritiek ? ' is-kritiek' : ''}`} onClick={() => { setOpenId(a.id); setNaam(a.naam); }} data-hv-apparaat-kaart={a.id} data-hv-versheid={h.vers} data-mq-verbinding={verbinding} data-mq-kritiek={a.kritiek ? 'ja' : undefined} data-mq-soort={a.soort}>
              <small>{soortTekst(lang, a.soort)}{r ? ` · ${r.naam}` : ''}</small>
              <strong>{a.naam}</strong>
              <span className='hv-waarde'>{h.tekst}</span>
              <em>{tr(lang, VERSHEID_LABEL[h.vers][0], VERSHEID_LABEL[h.vers][1])}{a.kritiek ? ` · ${tr(lang, 'критично', 'kritiek')}` : ''}</em>
            </button>
          );
        })}
      </div>
      {open ? (
        <HuisLaag lang={lang} soort={smal ? 'scherm' : 'paneel'} titel={open.naam} onSluit={() => setOpenId('')} data={{ 'hv-inspector': open.id }}>
          <ApparaatBediening lang={lang} woningId={woningId} apparaat={open} magSchrijven={magCmd} onVernieuw={() => void vernieuw()} />
          <h3 className='hv-sub'>{tr(lang, 'Спостережувані стани', 'Waargenomen toestanden')}</h3>
          <table className='hv-tabel'><tbody>{open.toestanden.map((t) => <tr key={t.kenmerk}><th scope='row'>{t.kenmerk}</th><td>{t.waarde === null || t.waarde === undefined ? '—' : String(t.waarde)}{t.eenheid ? ` ${t.eenheid}` : ''}</td><td>{tr(lang, VERSHEID_LABEL[versheid(t)][0], VERSHEID_LABEL[versheid(t)][1])}</td><td>{datumTekst(lang, t.waargenomenOp || t.ontvangenOp)}</td></tr>)}</tbody></table>
          <h3 className='hv-sub'>{tr(lang, 'Можливості', 'Mogelijkheden')}</h3>
          <ul className='hv-chips'>{open.mogelijkheden.map((m) => <li key={m.soort} className={`hv-chip is-passief${m.kritiek ? ' is-kritiek' : ''}`}>{tr(lang, MOGELIJKHEID_LABEL[m.soort][0], MOGELIJKHEID_LABEL[m.soort][1])} · {m.schrijven ? tr(lang, 'керування', 'bedienen') : tr(lang, 'читання', 'lezen')}{m.bereik ? ` ${m.bereik[0]}–${m.bereik[1]}${m.eenheid ?? ''}` : ''}</li>)}</ul>
          <h3 className='hv-sub'>{tr(lang, 'Джерело', 'Bron')}</h3>
          <table className='hv-tabel'><tbody>
            <tr><th scope='row'>{tr(lang, 'Ідентифікатор', 'Id bij de bron')}</th><td colSpan={3}><code>{open.bronId}</code></td></tr>
            <tr><th scope='row'>{tr(lang, 'Інтеграція', 'Integratie')}</th><td colSpan={3}>{ov.integraties.find((i) => i.id === open.integratieId)?.naam ?? '—'}</td></tr>
            <tr><th scope='row'>{tr(lang, 'Онлайн', 'Online')}</th><td colSpan={3}>{open.online === null ? tr(lang, 'невідомо', 'onbekend') : open.online ? tr(lang, 'так', 'ja') : tr(lang, 'ні', 'nee')} · {tr(lang, 'бачили', 'gezien')}: {datumTekst(lang, open.laatstGezien)}</td></tr>
            {open.model ? <tr><th scope='row'>{tr(lang, 'Модель', 'Model')}</th><td colSpan={3}>{open.fabrikant} {open.model} {open.firmware}</td></tr> : null}
          </tbody></table>
          {mag ? (
            <>
              <h3 className='hv-sub'>{tr(lang, 'Налаштування', 'Instellingen')}</h3>
              <form className='hv-rij' onSubmit={(e) => { e.preventDefault(); if (naam.trim() && naam.trim() !== open.naam) void doe(() => huisClient.apparaatWijzig(woningId, open.id, { naam: naam.trim() }), tr(lang, 'Перейменовано.', 'Hernoemd.')); }}>
                <input value={naam} maxLength={120} aria-label={tr(lang, 'Назва', 'Naam')} onChange={(e) => setNaam(e.target.value)} />
                <button type='submit' className='hv-knop is-klein' disabled={bezig || !naam.trim() || naam.trim() === open.naam}>{tr(lang, 'Зберегти', 'Opslaan')}</button>
              </form>
              <label className='hv-veld'><span>{tr(lang, 'Кімната', 'Kamer')}</span><select value={open.ruimteId ?? ''} disabled={bezig} onChange={(e) => void doe(() => huisClient.apparaatWijzig(woningId, open.id, { ruimteId: e.target.value || null }))}><option value=''>{tr(lang, '— без кімнати —', '— geen kamer —')}</option>{ov.ruimtes.map((r) => <option key={r.id} value={r.id}>{r.naam}</option>)}</select></label>
              <button type='button' className='hv-knop is-klein is-stil' disabled={bezig} onClick={() => void doe(() => huisClient.apparaatWijzig(woningId, open.id, { verborgen: true }), tr(lang, 'Пристрій приховано (повернеться після повторного імпорту).', 'Apparaat verborgen (komt terug na een nieuwe import).'))}>{tr(lang, 'Приховати з усіх списків', 'Verbergen uit alle lijsten')}</button>
            </>
          ) : null}
        </HuisLaag>
      ) : null}
    </div>
  );
}
