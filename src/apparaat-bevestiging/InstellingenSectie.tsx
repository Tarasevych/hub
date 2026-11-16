// APPARAAT-001 — «Способи входу» → «Підтвердження з іншого пристрою» (gebruiker). Alles wat de gebruiker over deze manier moet
// weten en kunnen, op één plek: staat hij aan en waarom (niet), welke andere apparaten er nu zijn, hoe de symbolen eruitzien
// (voorbeeld), geluid, zwevend venster of alleen een melding, authenticator-code op het andere apparaat (als de beheerder dat
// toestaat), de teller van verkeerde symbolen met herstel (toegangssleutel), en de laatste verzoeken. Wijzigen vraagt een verse
// toegangssleutel (zoals alles wat de beveiliging zelf raakt).
import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { ChevronDown, MonitorSmartphone, RefreshCw } from 'lucide-react';
import { ecosystemTabContext } from '../tab-context';
import Symbool from './Symbool';
import { foutCode, herstellen, metSleutel, overzicht, voorkeurenOpslaan, type Ctx, type Overzicht } from './api';
import { useApparaatVlag } from './vlag';
import { foutTekst, REDEN_NAMEN, STAND_NAMEN, tijd, tr, type Lang } from './teksten';
import { SYMBOOL_SOORTEN, SYMBOOL_SOORT_NAMEN, effectieveSoort, type ApparaatVoorkeuren, type SymboolSoort } from '../../shared/apparaat-bevestiging/model';
import { trek } from '../../shared/apparaat-bevestiging/symbolen';
import './apparaat.css';

const REDEN_UITLEG: Record<string, [string, string]> = {
  UITGESCHAKELD: ['Вимкнено (адміністратором або нижче у ваших налаштуваннях).', 'Uitgeschakeld (door de beheerder of hieronder in uw instellingen).'],
  NIET_TOEGESTAAN: ['Адміністратор дозволив цей спосіб лише власнику.', 'De beheerder staat deze manier alleen voor de eigenaar toe.'],
  METHODE_UIT: ['Вимкнено після забагатьох неправильних символів — відновіть нижче ключем доступу.', 'Uit na te veel verkeerde symbolen — herstel hieronder met uw toegangssleutel.'],
  METHODE_PAUZE: ['Коротка пауза після кількох помилок.', 'Korte pauze na enkele fouten.'],
  GEEN_ANDER_APPARAAT: ['Зараз немає іншого пристрою, де ви увійшли нещодавно. Відкрийте сайт на телефоні чи іншому комп’ютері — і спосіб запрацює.', 'Er is nu geen ander apparaat waarop u onlangs bent aangemeld. Open de site op uw telefoon of een andere computer — dan werkt het.'],
  VLAG_UIT: ['Ще не ввімкнено для вашого облікового запису.', 'Nog niet aan voor uw account.'],
};

export default function ApparaatInstellingenSectie({ lang, service = 'identity' }: { lang: Lang; service?: string }) {
  const titelId = useId();
  const vlag = useApparaatVlag();
  const ctx = useMemo<Ctx>(() => ({ service, tabContext: ecosystemTabContext() }), [service]);
  const [o, setO] = useState<Overzicht | null>(null);
  const [vk, setVk] = useState<ApparaatVoorkeuren | null>(null);
  const [fout, setFout] = useState('');
  const [melding, setMelding] = useState('');
  const [bezig, setBezig] = useState(false);
  const laden = useCallback(async () => {
    try {
      const r = await overzicht(ctx);
      if (!r || !r.beheer || !r.voorkeuren || !r.teller) return;
      setO({ ...r, apparaten: Array.isArray(r.apparaten) ? r.apparaten : [], recent: Array.isArray(r.recent) ? r.recent : [] });
      setVk(r.voorkeuren);
      setFout('');
    } catch (e) { setFout(foutTekst(lang, foutCode(e))); }
  }, [ctx, lang]);
  useEffect(() => { if (vlag) void laden(); }, [vlag, laden]);
  if (!vlag || !o || !vk) return null;

  const soortNu: SymboolSoort = effectieveSoort({ ...o.beheer, pauzeNa: 3, pauzeMinuten: 15, uitNa: 5, maxPerTienMinuten: 10 }, vk);
  const voorbeeld = trek(soortNu === 'gemengd' ? 'pictogrammen' : soortNu, o.beheer.aantalKandidaten, (n) => Math.floor(Math.random() * n));
  const opslaan = async () => {
    setBezig(true); setFout(''); setMelding('');
    try { await metSleutel(ctx, () => voorkeurenOpslaan(ctx, vk)); setMelding(tr(lang, 'Збережено.', 'Opgeslagen.')); await laden(); }
    catch (e) { setFout(foutTekst(lang, foutCode(e))); }
    finally { setBezig(false); }
  };
  const herstel = async () => {
    setBezig(true); setFout(''); setMelding('');
    try { await metSleutel(ctx, () => herstellen(ctx)); setMelding(tr(lang, 'Спосіб знову працює.', 'De manier werkt weer.')); await laden(); }
    catch (e) { setFout(foutTekst(lang, foutCode(e))); }
    finally { setBezig(false); }
  };
  const stand = o.beschikbaar ? 'werkt' : o.teller.uitgeschakeld || !o.beheer.aan ? 'uit' : 'niet';
  const gewijzigd = JSON.stringify(vk) !== JSON.stringify(o.voorkeuren);

  return <section className='apb-sectie' data-apparaat-bevestiging aria-labelledby={titelId}>
    <header className='apb-sectie-kop'>
      <span className='apb-sectie-icoon' aria-hidden='true'><MonitorSmartphone aria-hidden='true' /></span>
      <div className='apb-sectie-titel'>
        <h3 id={titelId}>{tr(lang, 'Підтвердження з іншого пристрою', 'Bevestigen vanaf een ander apparaat')}</h3>
        <p className='apb-uitleg'>{tr(lang,
          'Коли на пристрої немає ключа доступу, вікно «Підтвердіть доступ» пропонує «Інший пристрій»: на вашому телефоні чи іншому комп’ютері, де ви вже увійшли, з’являється вікно з тими самими символами. Там ви натискаєте виділений символ і підтверджуєте ключем доступу.',
          'Als een apparaat geen toegangssleutel heeft, biedt het venster «Toegang bevestigen» «Ander apparaat» aan: op uw telefoon of andere computer waarop u al bent aangemeld verschijnt een venster met dezelfde symbolen. Daar tikt u het uitgelichte symbool en bevestigt u met uw toegangssleutel.')}</p>
      </div>
      <div className='apb-kop-rechts'>
        <span className='apb-stand' data-stand={stand}>{stand === 'werkt' ? tr(lang, 'Працює', 'Werkt') : stand === 'uit' ? tr(lang, 'Вимкнено', 'Uit') : tr(lang, 'Зараз недоступно', 'Nu niet beschikbaar')}</span>
        <button type='button' className='apb-knop apb-knop-icoon' onClick={() => void laden()} aria-label={tr(lang, 'Оновити', 'Vernieuwen')} title={tr(lang, 'Оновити', 'Vernieuwen')}><RefreshCw aria-hidden='true' /></button>
      </div>
    </header>
    {!o.beschikbaar && o.reden && <p className='apb-hint-balk apb-klein' role='status'>{(REDEN_UITLEG[o.reden] ?? ['', ''])[lang === 'nl' ? 1 : 0]}</p>}

    <div className='apb-kaart'>
      <label className='apb-vinkje'>
        <input type='checkbox' checked={vk.aan} onChange={(e) => setVk({ ...vk, aan: e.target.checked })} />
        <span className='apb-vinkje-tekst'>
          <strong>{tr(lang, 'Дозволити підтвердження з моїх інших пристроїв', 'Bevestigen vanaf mijn andere apparaten toestaan')}</strong>
          <span className='apb-klein'>{tr(lang, 'Вимкнено — вкладка «Інший пристрій» не показується, запити не надходять.', 'Uit — het tabblad «Ander apparaat» verschijnt niet en er komen geen verzoeken.')}</span>
        </span>
      </label>

      {vk.aan && <>
        <div className='apb-raster'>
          <div className='apb-subkaart'>
            <span className='apb-subkaart-titel'>{tr(lang, 'Інші пристрої зараз', 'Andere apparaten nu')}</span>
            {o.apparaten.length ? <ul className='apb-klein apb-apparaten-lijst'>{o.apparaten.map((a, i) => <li key={i}>{tr(lang, 'був на сайті', 'was op de site')} {tijd(a.laatstGezien, lang)}{a.dienst ? ` · ${a.dienst}` : ''}</li>)}</ul>
              : <span className='apb-klein'>{tr(lang, `Жодного за останні ${o.beheer.levendMinuten} хв.`, `Geen in de laatste ${o.beheer.levendMinuten} min.`)}</span>}
          </div>
          <div className='apb-subkaart'>
            <span className='apb-subkaart-titel'>{tr(lang, 'Так виглядають символи', 'Zo zien de symbolen eruit')}</span>
            <div className='apb-voorbeeld' aria-hidden='true'>{voorbeeld.kandidaten.map((k, pos) => <div key={k} className={`apb-tegel${pos === voorbeeld.juist ? ' is-uitgelicht' : ''}`}><Symbool soort={voorbeeld.soort} index={k} lang={lang} klein /></div>)}</div>
            <span className='apb-klein'>{tr(lang, 'Виділений — це той, що треба натиснути на іншому пристрої.', 'Het uitgelichte is het symbool dat u op het andere apparaat tikt.')}</span>
          </div>
        </div>

        <div className='apb-raster'>
          <label className='apb-veld'><span>{tr(lang, 'Вид символів', 'Soort symbolen')}</span>
            <select value={vk.symbolen} onChange={(e) => setVk({ ...vk, symbolen: e.target.value as ApparaatVoorkeuren['symbolen'] })}>
              <option value='standaard'>{tr(lang, 'Як радить адміністратор', 'Zoals de beheerder aanraadt')} ({(SYMBOOL_SOORT_NAMEN[o.beheer.symbolenStandaard])[lang === 'nl' ? 1 : 0].toLowerCase()})</option>
              {SYMBOOL_SOORTEN.map((s) => <option key={s} value={s}>{SYMBOOL_SOORT_NAMEN[s][lang === 'nl' ? 1 : 0]}</option>)}
            </select></label>
          <label className='apb-veld'><span>{tr(lang, 'Як показувати запит на іншому пристрої', 'Hoe het verzoek op het andere apparaat tonen')}</span>
            <select value={vk.toonAls} onChange={(e) => setVk({ ...vk, toonAls: e.target.value as 'venster' | 'melding' })}>
              <option value='venster'>{tr(lang, 'Спливне вікно «Це ви?» одразу', 'Zwevend venster «Bent u het?» meteen')}</option>
              <option value='melding'>{tr(lang, 'Лише сповіщення в центрі (відкрию сам)', 'Alleen een melding in het centrum (ik open het zelf)')}</option>
            </select></label>
        </div>

        <label className='apb-vinkje'>
          <input type='checkbox' checked={vk.geluid} onChange={(e) => setVk({ ...vk, geluid: e.target.checked })} />
          <span className='apb-vinkje-tekst'><strong>{tr(lang, 'Короткий звук при новому запиті', 'Kort geluid bij een nieuw verzoek')}</strong></span>
        </label>

        {o.beheer.totpToegestaan && <label className='apb-vinkje'>
          <input type='checkbox' checked={vk.totpOpApparaat} onChange={(e) => setVk({ ...vk, totpOpApparaat: e.target.checked })} />
          <span className='apb-vinkje-tekst'>
            <strong>{tr(lang, 'На іншому пристрої дозволити код автентифікатора замість ключа доступу', 'Op het andere apparaat een authenticator-code toestaan in plaats van de toegangssleutel')}</strong>
            <span className='apb-klein'>{tr(lang, 'Слабше за ключ доступу; таке підтвердження ніколи не рахується «сильним».', 'Zwakker dan de toegangssleutel; zo’n bevestiging telt nooit als «sterk».')}</span>
          </span>
        </label>}
      </>}

      {(gewijzigd || melding) && <div className='apb-voet'>
        {gewijzigd && <button type='button' className='apb-knop apb-knop-hoofd' disabled={bezig} onClick={() => void opslaan()}>{tr(lang, 'Зберегти (ключ доступу)', 'Opslaan (toegangssleutel)')}</button>}
        {gewijzigd && <button type='button' className='apb-knop' disabled={bezig} onClick={() => setVk(o.voorkeuren)}>{tr(lang, 'Скасувати зміни', 'Wijzigingen terugdraaien')}</button>}
        {melding && <span className='apb-ok' role='status'>{melding}</span>}
      </div>}
    </div>

    {(o.teller.mislukt > 0 || o.teller.uitgeschakeld || o.teller.pauzeTot) && <div className='apb-nood' role='status'>
      <span>{o.teller.uitgeschakeld
        ? tr(lang, `Спосіб вимкнено після ${o.teller.mislukt} неправильних символів.`, `De manier staat uit na ${o.teller.mislukt} verkeerde symbolen.`)
        : o.teller.pauzeTot && new Date(o.teller.pauzeTot).getTime() > Date.now()
          ? tr(lang, `Пауза до ${tijd(o.teller.pauzeTot, lang)} після ${o.teller.mislukt} помилок.`, `Pauze tot ${tijd(o.teller.pauzeTot, lang)} na ${o.teller.mislukt} fouten.`)
          : tr(lang, `Неправильних символів поспіль: ${o.teller.mislukt}.`, `Verkeerde symbolen na elkaar: ${o.teller.mislukt}.`)}</span>
      <button type='button' className='apb-knop' disabled={bezig} onClick={() => void herstel()}>{tr(lang, 'Відновити (ключ доступу)', 'Herstellen (toegangssleutel)')}</button>
    </div>}
    {fout && <p className='apb-fout' role='alert'>{fout}</p>}

    {o.recent.length > 0 && <details className='apb-geschiedenis'>
      <summary className='apb-uitklap'>
        <span className='apb-uitklap-titel'>{tr(lang, `Останні запити (${o.recent.length})`, `Laatste verzoeken (${o.recent.length})`)}</span>
        <ChevronDown className='apb-chevron' aria-hidden='true' />
      </summary>
      <table className='apb-tabel'><thead><tr><th>{tr(lang, 'Коли', 'Wanneer')}</th><th>{tr(lang, 'Дія', 'Handeling')}</th><th>{tr(lang, 'Пристрій', 'Apparaat')}</th><th>{tr(lang, 'Стан', 'Stand')}</th></tr></thead>
        <tbody>{o.recent.map((r) => <tr key={r.id}><td>{tijd(r.aangemaaktOp, lang)}</td><td>{lang === 'nl' ? r.actieNaam[1] : r.actieNaam[0]}</td><td>{r.apparaatA}{r.regioA ? ` · ${r.regioA}` : ''}{r.apparaatB ? ` → ${r.apparaatB}` : ''}</td>
          <td>{(STAND_NAMEN[r.stand] ?? [r.stand, r.stand])[lang === 'nl' ? 1 : 0]}{r.reden && REDEN_NAMEN[r.reden]?.[0] ? ` (${REDEN_NAMEN[r.reden][lang === 'nl' ? 1 : 0]})` : ''}{r.methodeB ? ` · ${r.methodeB === 'passkey' ? tr(lang, 'ключ доступу', 'toegangssleutel') : tr(lang, 'код автентифікатора', 'authenticator-code')}` : ''}</td></tr>)}</tbody></table>
    </details>}
  </section>;
}
