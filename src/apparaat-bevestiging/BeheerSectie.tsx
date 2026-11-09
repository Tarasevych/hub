// APPARAAT-001 — Адміністрування → «Єдиний вхід» → «Підтвердження з іншого пристрою» (beheerder). Noodschakelaar (uit zonder
// toegangssleutel), alle instellingen als data (wachttijd, aftelling, symbolen, aantal, authenticator-code op B, «sterk» bij
// toegangssleutel, symboolknoppen in Telegram, limieten, levende minuten, wie mag), één stap ongedaan maken, cijfers van de week.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { MonitorSmartphone, Undo2 } from 'lucide-react';
import { ecosystemTabContext } from '../tab-context';
import { beheerNoodUit, beheerOngedaan, beheerOpslaan, beheerOverzicht, foutCode, metSleutel, type BeheerOverzicht, type Ctx } from './api';
import { useApparaatVlag } from './vlag';
import { foutTekst, tr, type Lang } from './teksten';
import { SYMBOOL_SOORTEN, SYMBOOL_SOORT_NAMEN, type ApparaatInstellingen } from '../../shared/apparaat-bevestiging/model';
import './apparaat.css';

export default function ApparaatBeheerSectie({ lang }: { lang: Lang }) {
  const vlag = useApparaatVlag();
  const ctx = useMemo<Ctx>(() => ({ service: 'admin', tabContext: ecosystemTabContext() }), []);
  const [o, setO] = useState<BeheerOverzicht | null>(null);
  const [i, setI] = useState<ApparaatInstellingen | null>(null);
  const [fout, setFout] = useState('');
  const [melding, setMelding] = useState('');
  const [bezig, setBezig] = useState(false);
  const laden = useCallback(async () => { try { const r = await beheerOverzicht(ctx); setO(r); setI(r.instellingen); setFout(''); } catch (e) { setFout(foutTekst(lang, foutCode(e))); } }, [ctx, lang]);
  useEffect(() => { if (vlag) void laden(); }, [vlag, laden]);
  if (!vlag || !o || !i) return null;
  const doe = async (fn: () => Promise<unknown>, ok: string) => {
    setBezig(true); setFout(''); setMelding('');
    try { await fn(); setMelding(ok); await laden(); } catch (e) { setFout(foutTekst(lang, foutCode(e))); } finally { setBezig(false); }
  };
  const getal = (k: keyof ApparaatInstellingen, min: number, max: number, label: string, hulp: string) => <label className='apb-veld'><span>{label}</span>
    <input type='number' min={min} max={max} value={Number(i[k])} onChange={(e) => setI({ ...i, [k]: Number(e.target.value) })} /><span className='apb-klein'>{hulp}</span></label>;
  const vink = (k: keyof ApparaatInstellingen, label: string, hulp: string) => <label className='apb-vinkje'><input type='checkbox' checked={Boolean(i[k])} onChange={(e) => setI({ ...i, [k]: e.target.checked })} /><span><strong>{label}</strong><br /><span className='apb-klein'>{hulp}</span></span></label>;
  const gewijzigd = JSON.stringify(i) !== JSON.stringify(o.instellingen);

  return <section className='apb-beheer' data-apparaat-beheer aria-labelledby='apb-beheer-titel'>
    <header className='apb-sectie-kop'><MonitorSmartphone aria-hidden='true' /><h2 id='apb-beheer-titel'>{tr(lang, 'Підтвердження з іншого пристрою', 'Bevestigen vanaf een ander apparaat')}</h2>
      <span className='apb-stand' data-stand={o.instellingen.aan ? 'werkt' : 'uit'}>{o.instellingen.aan ? tr(lang, 'Увімкнено', 'Aan') : tr(lang, 'Вимкнено для всіх', 'Voor iedereen uit')}</span></header>
    <div className='apb-tegels'>
      <div className='apb-cijfer'><strong>{o.cijfers.dag}</strong><span>{tr(lang, 'запитів за добу', 'verzoeken per dag')}</span></div>
      <div className='apb-cijfer'><strong>{o.cijfers.week}</strong><span>{tr(lang, 'запитів за тиждень', 'verzoeken per week')}</span></div>
      <div className='apb-cijfer'><strong>{o.cijfers.bevestigd}</strong><span>{tr(lang, 'підтверджено (тиждень)', 'bevestigd (week)')}</span></div>
      <div className='apb-cijfer'><strong>{o.cijfers.geweigerd}</strong><span>{tr(lang, 'інший символ (тиждень)', 'ander symbool (week)')}</span></div>
      <div className='apb-cijfer'><strong>{o.cijfers.nietIk}</strong><span>{tr(lang, '«Це не я» (тиждень)', '«Dit ben ik niet» (week)')}</span></div>
      <div className='apb-cijfer'><strong>{o.cijfers.uitgeschakeldeAccounts}</strong><span>{tr(lang, 'облікових записів вимкнено', 'accounts uitgeschakeld')}</span></div>
    </div>
    <div className='apb-nood'>
      {o.instellingen.aan
        ? <>{tr(lang, 'Аварійний вимикач: вимкнути для всіх одразу, без ключа доступу. Увімкнути знову можна нижче (з ключем).', 'Noodschakelaar: voor iedereen meteen uit, zonder toegangssleutel. Weer aanzetten kan hieronder (met sleutel).')} <button type='button' className='apb-knop apb-knop-gevaar' disabled={bezig} onClick={() => void doe(() => beheerNoodUit(ctx), tr(lang, 'Вимкнено для всіх.', 'Voor iedereen uit.'))}>{tr(lang, 'Вимкнути для всіх', 'Voor iedereen uit')}</button></>
        : tr(lang, 'Спосіб вимкнено для всіх. Поставте позначку «Увімкнено» нижче й збережіть з ключем доступу.', 'De manier staat voor iedereen uit. Vink hieronder «Aan» aan en sla op met uw toegangssleutel.')}
    </div>
    <div className='apb-raster'>
      {vink('aan', tr(lang, 'Увімкнено', 'Aan'), tr(lang, 'Головний вимикач для всіх користувачів.', 'Hoofdschakelaar voor alle gebruikers.'))}
      <label className='apb-veld'><span>{tr(lang, 'Хто може користуватися', 'Wie mag het gebruiken')}</span>
        <select value={i.wieMag} onChange={(e) => setI({ ...i, wieMag: e.target.value as ApparaatInstellingen['wieMag'] })}><option value='iedereen'>{tr(lang, 'Усі користувачі', 'Alle gebruikers')}</option><option value='eigenaar'>{tr(lang, 'Лише власник', 'Alleen de eigenaar')}</option></select></label>
      {getal('wachtSeconden', 60, 300, tr(lang, 'Час очікування запиту (с)', 'Wachttijd van een verzoek (s)'), tr(lang, '60–300. Google і Microsoft працюють у межах 1–3 хв.', '60–300. Google en Microsoft zitten op 1–3 minuten.'))}
      {getal('aftelSeconden', 3, 30, tr(lang, 'Відлік перед вибором (с)', 'Aftelling vóór de keuze (s)'), tr(lang, 'Символи стають активними лише після відліку — щоб спершу прочитати картку.', 'De symbolen worden pas na de aftelling actief — eerst de kaart lezen.'))}
      {getal('aftelSecondenGevoelig', 5, 60, tr(lang, 'Відлік для чутливих дій (с)', 'Aftelling bij gevoelige handelingen (s)'), '')}
      <label className='apb-veld'><span>{tr(lang, 'Символи типово', 'Standaardsymbolen')}</span>
        <select value={i.symbolenStandaard} onChange={(e) => setI({ ...i, symbolenStandaard: e.target.value as ApparaatInstellingen['symbolenStandaard'] })}>{SYMBOOL_SOORTEN.map((s) => <option key={s} value={s}>{SYMBOOL_SOORT_NAMEN[s][lang === 'nl' ? 1 : 0]}</option>)}</select>
        <span className='apb-klein'>{tr(lang, 'Користувач може обрати інший вид у своїх «Способах входу».', 'De gebruiker kan in zijn «Aanmeldmethoden» een andere soort kiezen.')}</span></label>
      {getal('aantalKandidaten', 3, 5, tr(lang, 'Кількість символів', 'Aantal symbolen'), tr(lang, '3–5. Більше — менша ймовірність вгадати (1/3 → 1/5), але щільніший екран.', '3–5. Meer = kleinere raadkans (1/3 → 1/5), maar een voller scherm.'))}
      {vink('totpToegestaan', tr(lang, 'Дозволити код автентифікатора на іншому пристрої', 'Authenticator-code op het andere apparaat toestaan'), tr(lang, 'Якщо на іншому пристрої немає ключа доступу. Користувач має ще й сам увімкнути це. Ніколи не рахується «сильним».', 'Als het andere apparaat geen toegangssleutel heeft. De gebruiker moet het zelf ook aanzetten. Telt nooit als «sterk».'))}
      {vink('sterkBijPasskey', tr(lang, 'Ключ доступу на іншому пристрої = «сильне» підтвердження', 'Toegangssleutel op het andere apparaat = «sterke» bevestiging'), tr(lang, 'Тоді після підтвердження з іншого пристрою можна й відкликати права, схвалювати оновлення тощо.', 'Dan kan na een bevestiging vanaf een ander apparaat ook rechten intrekken, uitrollen goedkeuren, enz.'))}
      {vink('telegramSymbolen', tr(lang, 'Символи й у картці Telegram', 'Symbolen ook in de Telegram-kaart'), tr(lang, 'Замість однієї кнопки «Так, це я» — три символи (цифри, літери або емодзі з назвою). Захист від «бомбардування» запитами.', 'In plaats van één knop «Ja, dit ben ik» drie symbolen (cijfers, letters of emoji met naam). Bescherming tegen «bombarderen» met verzoeken.'))}
      {getal('maxPerTienMinuten', 3, 30, tr(lang, 'Запитів на обліковий запис за 10 хв', 'Verzoeken per account per 10 min'), '')}
      {getal('pauzeNa', 1, 10, tr(lang, 'Пауза після N неправильних символів', 'Pauze na N verkeerde symbolen'), '')}
      {getal('pauzeMinuten', 1, 240, tr(lang, 'Тривалість паузи (хв)', 'Duur van de pauze (min)'), '')}
      {getal('uitNa', 2, 20, tr(lang, 'Вимкнути після N помилок', 'Uit na N fouten'), tr(lang, 'До відновлення ключем доступу у «Способах входу».', 'Tot herstel met de toegangssleutel bij «Aanmeldmethoden».'))}
      {getal('levendMinuten', 1, 60, tr(lang, 'Пристрій «живий», якщо був на сайті за останні (хв)', 'Apparaat telt als «levend» als het de site gebruikte in de laatste (min)'), '')}
    </div>
    <div className='apb-rij' style={{ justifyContent: 'flex-start' }}>
      <button type='button' className='apb-knop apb-knop-hoofd' disabled={bezig || !gewijzigd} onClick={() => void doe(() => metSleutel(ctx, () => beheerOpslaan(ctx, i)), tr(lang, 'Збережено.', 'Opgeslagen.'))}>{tr(lang, 'Зберегти (ключ доступу)', 'Opslaan (toegangssleutel)')}</button>
      {o.ongedaanMogelijk && <button type='button' className='apb-knop' disabled={bezig} onClick={() => void doe(() => metSleutel(ctx, () => beheerOngedaan(ctx)), tr(lang, 'Повернуто попередні налаштування.', 'Vorige instellingen teruggezet.'))}><Undo2 aria-hidden='true' style={{ width: 16, height: 16 }} />{tr(lang, 'Скасувати останню зміну', 'Laatste wijziging ongedaan maken')}</button>}
      {melding && <span className='apb-ok' role='status'>{melding}</span>}
    </div>
    {fout && <p className='apb-fout' role='alert'>{fout}</p>}
  </section>;
}
