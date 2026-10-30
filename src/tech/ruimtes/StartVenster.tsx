// «Вхід у технічний простір» (vlag tech-ruimtes-v2): drie termijnen als radiokaarten met één regel uitleg; niet beschikbare keuzes
// blijven ZICHTBAAR, uitgegrijsd, met de reden. Vervangt het oude venster «Увімкнути / Подовжити» (TechLaag Activeren) achter de vlag.
// Loopt er al een sessie: «Змінити термін» (vervangen, telt vanaf nu) of «Додати час» (bijtellen) — nooit het dubbelzinnige «Подовжити».
import { useEffect, useMemo, useState } from 'react';
import { Venster } from '../../platform/vensters';
import { duurKort, eersteBeschikbare, termijnNaam, termijnUitleg, termijnenVolledig, WOORDEN, type Taal } from './teksten';
import { ruimtesVernieuwen, starten, useRuimtes, verlengen } from './ruimtes-opslag';
import type { Termijn, TermijnModus } from '../ruimtes-api';
import Vraag from '../Vraag';
import './ruimtes.css';

const FOUT: Record<string, [string, string]> = {
  TERMIJN_NIET_BESCHIKBAAR: ['Такий термін недоступний для ваших ролей.', 'Deze termijn is niet beschikbaar voor uw rollen.'],
  REDEN_ONGELDIG: ['Вкажіть причину (від 3 символів).', 'Geef een reden (minstens 3 tekens).'],
  GEEN_TECH_PROFIEL: ['У вас немає дозволу на технічний простір.', 'U hebt geen toestemming voor de technische ruimte.'],
  DUUR_ONGELDIG: ['Такий термін недоступний для ваших ролей.', 'Deze termijn is niet beschikbaar voor uw rollen.'],
  GEEN_TECH_SESSIE: ['Технічний сеанс не відкритий — спершу увійдіть у технічний простір.', 'Er is geen technische sessie — open eerst de technische ruimte.'],
  NIET_OP_TIJD: ['Цей сеанс без обмеження за часом — час до нього не додається.', 'Deze sessie heeft geen tijdsgrens — er valt geen tijd bij te tellen.'],
  TECH_RUIMTES_V2_UIT: ['Нові простори для вас ще вимкнені (прапорець tech-ruimtes-v2).', 'De nieuwe ruimtes staan voor u nog uit (vlag tech-ruimtes-v2).'],
  TECH_RUIMTE_VEREIST: ['Це можна змінити лише в технічному просторі (не на паузі).', 'Dit kan alleen in de technische ruimte (niet gepauzeerd).'],
  SESSIE_VEREIST: ['Спершу увійдіть на сайт.', 'Meld u eerst aan op de site.'],
};
export const foutTekst = (c: string, uk: boolean) => { const f = FOUT[c]; if (f) return uk ? f[0] : f[1]; if (/STEP_UP|STAP_OP/.test(c)) return uk ? 'Вхід не підтверджено — нічого не змінено.' : 'Aanmelding niet bevestigd — niets gewijzigd.'; return `${uk ? 'Не вдалося' : 'Mislukt'} (${c}). ${uk ? 'Нічого не змінено.' : 'Niets gewijzigd.'}`; };

export default function StartVenster({ taal, sluit }: { taal: Taal; sluit: () => void }) {
  const uk = taal === 'uk';
  const r = useRuimtes();
  const s = r.status;
  // Vastgelegd bij het openen: na een geslaagde start mag het venster niet nog even omspringen naar «Змінити термін».
  const [lopend] = useState(() => !!s?.sessie);
  const lijst = useMemo(() => termijnenVolledig(s?.termijnen ?? [], taal), [s?.termijnen, taal]);
  const tijden = lijst.filter((x) => x.modus === 'tijd');
  const open = lijst.filter((x) => x.modus !== 'tijd');
  const eerste = eersteBeschikbare(lijst);
  const [keuze, setKeuze] = useState<string>(eerste ? sleutel(eerste) : '');
  const [reden, setReden] = useState('');
  const [melding, setMelding] = useState<{ ok: boolean; tekst: string } | null>(null);
  const [soort, setSoort] = useState<'vervangen' | 'bijtellen'>('vervangen');
  const gekozen = lijst.find((x) => sleutel(x) === keuze && x.beschikbaar) ?? null;
  // Fix 28.10: status kan NA het openen binnenkomen (of na een vernieuwing) — kies dan alsnog de eerste beschikbare termijn.
  const eersteSleutel = eerste ? sleutel(eerste) : '';
  useEffect(() => { if (!keuze && eersteSleutel) setKeuze(eersteSleutel); }, [keuze, eersteSleutel]);
  useEffect(() => { if (!s) void ruimtesVernieuwen(); }, [s]);
  const statusFout = r.geladen && !s;
  const nu = Date.now();
  const eindVan = (x: Termijn) => (x.modus === 'tijd' && x.minuten ? nu + x.minuten * 60000 : null);
  const bezig = r.bezig === 'starten' || r.bezig === 'verlengen';
  const redenNodig = !(lopend && gekozen?.modus === 'tijd');
  const redenOk = !redenNodig || reden.trim().length >= 3;
  const knopTekst = () => {
    if (bezig) return lopend ? (uk ? 'Змінюю термін…' : 'Termijn wijzigen…') : (uk ? 'Входжу…' : 'Bezig met openen…');
    if (!gekozen) return uk ? 'Оберіть термін' : 'Kies een termijn';
    if (!redenOk) return uk ? 'Вкажіть причину' : 'Geef een reden';
    if (lopend) return soort === 'bijtellen' ? `${WOORDEN.bijtellen[taal]} · +${duurKort(gekozen.minuten ?? 0, taal)}` : `${WOORDEN.wijzigTermijn[taal]} · ${termijnNaam(gekozen.modus, taal, eindVan(gekozen))}`;
    return `${uk ? 'Підтвердити й увійти' : 'Bevestigen en openen'} · ${termijnNaam(gekozen.modus, taal, eindVan(gekozen))}`;
  };
  const doe = async () => {
    if (!gekozen || bezig || !redenOk) return;
    setMelding(null);
    try {
      if (lopend && gekozen.modus === 'tijd') await verlengen(gekozen.minuten ?? 0, soort);
      else await starten(gekozen.modus, reden.trim(), gekozen.minuten);
      setMelding({ ok: true, tekst: uk ? 'Готово: технічний простір відкрито.' : 'Klaar: de technische ruimte is open.' });
      window.setTimeout(sluit, 700);
    } catch (e) { setMelding({ ok: false, tekst: foutTekst(String((e as Error)?.message || 'FOUT'), uk) }); }
  };
  const kaart = (x: Termijn) => {
    const k = sleutel(x);
    const id = `rs-${k}`;
    return (
      <label key={k} className={`rs-kaart${x.beschikbaar ? '' : ' is-uit'}${keuze === k ? ' is-gekozen' : ''}`} data-termijn={x.modus} data-minuten={x.minuten ?? ''} data-beschikbaar={x.beschikbaar ? '1' : '0'}>
        <input type='radio' name='rs-termijn' value={k} checked={keuze === k} disabled={!x.beschikbaar} onChange={() => setKeuze(k)} aria-describedby={`${id}-u`} />
        <span className='rs-kaart-tekst'>
          <b className='rs-naam'>{termijnNaam(x.modus, taal)}</b>
          <small id={`${id}-u`} className='rs-uitleg'>{x.beschikbaar ? termijnUitleg(x.modus, taal, eindVan(x)) : <span className='rs-reden' data-termijn-reden='1'>{uk ? 'Недоступно: ' : 'Niet beschikbaar: '}{x.reden?.[taal] ?? (uk ? 'обмеження вашої ролі.' : 'beperking van uw rol.')}</span>}</small>
        </span>
      </label>
    );
  };
  return (
    <Venster id='tech-ruimte-start' titel={lopend ? WOORDEN.wijzigTermijn[taal] : (uk ? 'Вхід у технічний простір' : 'De technische ruimte openen')} breedte={560} onSluit={sluit}>
      <form className='tech-venster rs' data-tech-venster='ruimte-start' onSubmit={(e) => { e.preventDefault(); void doe(); }}>
        <p className='tech-lead'>{uk ? 'Технічний простір — це ваш звичайний простір плюс технічні сторінки. Ваш вхід на сайт не змінюється.' : 'De technische ruimte is uw gewone ruimte plus technische pagina\u2019s. Uw aanmelding op de site verandert niet.'}</p>
        {lopend ? <p className='rs-meta' data-rs-wijzig='1'>{WOORDEN.wijzigUitleg[taal]}</p> : null}
        <fieldset className='rs-groep'><legend>{uk ? 'На час' : 'Voor een tijd'} <Vraag uk={uk} label={uk ? 'На час' : 'Voor een tijd'} help={{ wat: [termijnUitleg('tijd', 'uk'), termijnUitleg('tijd', 'nl')], gevolg: [`Найдовше для ваших ролей: ${duurKort(s?.maxMinuten ?? 0, 'uk')}.`, `Maximaal voor uw rollen: ${duurKort(s?.maxMinuten ?? 0, 'nl')}.`] }} /></legend>
          <div className='rs-tijden' role='radiogroup' aria-label={uk ? 'Тривалість' : 'Duur'}>{tijden.map((x) => {
            const k = sleutel(x);
            return (
              <label key={k} className={`rs-chip${x.beschikbaar ? '' : ' is-uit'}${keuze === k ? ' is-gekozen' : ''}`} data-termijn='tijd' data-minuten={x.minuten ?? ''} data-beschikbaar={x.beschikbaar ? '1' : '0'} title={x.beschikbaar ? undefined : `${uk ? 'Недоступно: ' : 'Niet beschikbaar: '}${x.reden?.[taal] ?? ''}`}>
                <input type='radio' name='rs-termijn' value={k} checked={keuze === k} disabled={!x.beschikbaar} onChange={() => setKeuze(k)} /><span>{duurKort(x.minuten ?? 0, taal)}</span>
              </label>
            );
          })}</div>
          {gekozen?.modus === 'tijd' ? <p className='rs-keuze' data-rs-tijd='1'><b className='rs-naam'>{termijnNaam('tijd', taal, eindVan(gekozen))}</b> <small className='rs-uitleg'>{termijnUitleg('tijd', taal, eindVan(gekozen))}</small></p> : null}
          {tijden.some((x) => !x.beschikbaar) ? <small className='rs-reden' data-termijn-reden='tijd'>{uk ? 'Недоступно' : 'Niet beschikbaar'} ({tijden.filter((x) => !x.beschikbaar).map((x) => duurKort(x.minuten ?? 0, taal)).join(', ')}): {tijden.find((x) => !x.beschikbaar)?.reden?.[taal] ?? ''}</small> : null}
        </fieldset>
        <fieldset className='rs-groep'><legend>{uk ? 'Без обмеження за часом' : 'Zonder tijdsgrens'}</legend>{open.map(kaart)}</fieldset>
        {lopend && gekozen?.modus === 'tijd' ? (
          <div className='rs-soort' role='radiogroup' aria-label={uk ? 'Як змінити' : 'Hoe wijzigen'}>
            <label><input type='radio' name='rs-soort' checked={soort === 'vervangen'} onChange={() => setSoort('vervangen')} data-rs-soort='vervangen' />{WOORDEN.wijzigTermijn[taal]} <small>{WOORDEN.wijzigUitleg[taal]}</small></label>
            <label><input type='radio' name='rs-soort' checked={soort === 'bijtellen'} onChange={() => setSoort('bijtellen')} data-rs-soort='bijtellen' />{WOORDEN.bijtellen[taal]} <small>{uk ? 'Додається до поточного кінця.' : 'Komt bij het huidige einde.'}</small></label>
          </div>
        ) : null}
        {redenNodig ? (
          <div className='tech-veld'><label htmlFor='rs-reden'>{uk ? 'Причина (від 3 символів)' : 'Reden (minstens 3 tekens)'}</label>
            <input id='rs-reden' value={reden} onChange={(e) => setReden(e.target.value)} maxLength={300} minLength={3} required placeholder={uk ? 'напр. запит №42: пошта не синхронізується' : 'bijv. melding #42: mail synchroniseert niet'} data-rs-reden='1' />
            <span className='rs-sjablonen'>{(uk ? ['Перевірка роботи сайту', 'Встановлення оновлення', 'Запит користувача'] : ['Controle van de site', 'Update installeren', 'Vraag van een gebruiker']).map((x) => <button key={x} type='button' className='rs-sjabloon' onClick={() => setReden(x)} data-rs-sjabloon='1'>{x}</button>)}</span></div>
        ) : null}
        {statusFout ? <p className='tech-melding' role='alert' data-rs-statusfout='1'>{uk ? `Не вдалося отримати від сервера стан технічного простору${r.fout ? ` (${r.fout})` : ''}. Оновіть сторінку (Ctrl+F5); якщо не допоможе — увійдіть через hub.tarasevych.com.` : `De stand van de technische ruimte kwam niet van de server${r.fout ? ` (${r.fout})` : ''}. Vernieuw de pagina (Ctrl+F5); helpt dat niet, open dan via hub.tarasevych.com.`}</p> : null}
        {melding ? <p className={`tech-melding${melding.ok ? ' is-ok' : ''}`} role={melding.ok ? 'status' : 'alert'} data-rs-melding='1'>{melding.tekst}</p> : null}
        <div className='tech-knoppen'>
          <button type='button' onClick={sluit}>{uk ? 'Скасувати' : 'Annuleren'}</button>
          <button type='submit' className='is-hoofd' disabled={!gekozen || bezig || !redenOk} aria-busy={bezig || undefined} data-tech-knop='ruimte-start'>{knopTekst()}</button>
        </div>
      </form>
    </Venster>
  );
}
const sleutel = (x: { modus: TermijnModus; minuten?: number }) => (x.modus === 'tijd' ? `tijd-${x.minuten ?? 0}` : x.modus);
