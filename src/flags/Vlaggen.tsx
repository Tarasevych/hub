// Venster «Прапорці» in de band van het technisch profiel (etap F).
//  - Адміністратор / Власник (diensten.beheren): aanmaken, wijzigen, verwijderen.
//  - Тестувальник / Розробник / Власник (flags.test): een vlag voor ZICHZELF aan- of uitzetten tot het einde van het profiel.
// Een vlag geeft nooit rechten; het venster zegt dat ook.
import { useEffect, useState } from 'react';
import { Flag, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { Venster } from '../platform/vensters';
import { api } from '../platform/client';
import { routeLang, serviceFromLocation } from '../canonical-navigation';
import { ecosystemTabContext } from '../tab-context';
import { zijbalkServerDienst } from '../zijbalk-voorkeuren';
import Vraag from '../tech/Vraag';
import { HELP_FLAGS, SLEUTEL_RE, type Uitkomst } from '../../shared/flags';
import { vlaggenVernieuwen } from './flags';
import './flags.css';

const body = () => ({ service: zijbalkServerDienst() || serviceFromLocation(), tabContext: ecosystemTabContext(), sourceOrigin: location.origin });
type Rij = { sleutel: string; omschrijving: string; aan: boolean; standaard: boolean; percentage: number; gebruikers: string[]; aantalGebruikers: number; voorMij: Uitkomst; mijnTest: boolean | null };
type Lijst = { magBeheren: boolean; magTesten: boolean; testTot: number; vlaggen: Rij[] };
type Bewerk = { sleutel: string; omschrijving: string; aan: boolean; standaard: boolean; percentage: number; gebruikers: string; nieuw: boolean };

const FOUTEN: Record<string, [string, string]> = {
  TECH_FLAGS_VEREIST: ['Потрібен активний технічний профіль із правом на прапорці (Тестувальник, Розробник, Адміністратор, Власник).', 'Een actief technisch profiel met vlaggenrecht is nodig.'],
  TECH_FLAGS_BEHEER_VEREIST: ['Змінювати прапорці можуть Адміністратор і Власник.', 'Vlaggen wijzigen kunnen Адміністратор en Власник.'],
  TECH_FLAGS_TEST_VEREIST: ['Тестувати для себе може роль із правом flags.test.', 'Voor uzelf testen kan een rol met flags.test.'],
  SLEUTEL_ONGELDIG: ['Ключ: латиниця в нижньому регістрі, цифри й «-», 3–41 символ, з літери.', 'Sleutel: kleine letters, cijfers en «-», 3–41 tekens, begint met een letter.'],
  PERCENTAGE_ONGELDIG: ['Частка — ціле число від 0 до 100.', 'Deel: een heel getal van 0 tot 100.'],
  EMAIL_ONGELDIG: ['Перевірте адреси пошти.', 'Controleer de e-mailadressen.'],
  GEBRUIKERS_ONGELDIG: ['Не більше 200 адрес.', 'Hoogstens 200 adressen.'],
  VLAG_NIET_GEVONDEN: ['Такого прапорця вже немає.', 'Deze vlag bestaat niet meer.'],
};
function foutTekst(e: unknown, uk: boolean) {
  const c = String((e as Error)?.message || 'FOUT');
  if (c.startsWith('GEBRUIKER_NIET_GEVONDEN')) { const m = c.split(':')[1] || ''; return uk ? `Користувача ${m} не знайдено.` : `Gebruiker ${m} niet gevonden.`; }
  const f = FOUTEN[c]; return f ? (uk ? f[0] : f[1]) : `${uk ? 'Не вдалося' : 'Mislukt'} (${c}).`;
}
const reden = (x: Uitkomst, uk: boolean) => ({
  STATIC: uk ? 'типове значення' : 'standaardwaarde', TARGETING_MATCH: x.metadata?.test ? (uk ? 'ваш тест' : 'uw test') : (uk ? 'ви у списку' : 'u staat in de lijst'),
  SPLIT: uk ? 'частка користувачів' : 'deel van de gebruikers', DISABLED: uk ? 'вимкнено для всіх' : 'voor iedereen uit', ERROR: uk ? 'помилка' : 'fout',
}[x.reason]);

export default function VlaggenVenster({ sluit }: { sluit: () => void }) {
  const uk = routeLang() !== 'nl';
  const [lijst, setLijst] = useState<Lijst | null>(null);
  const [melding, setMelding] = useState('');
  const [bewerk, setBewerk] = useState<Bewerk | null>(null);
  const [weg, setWeg] = useState('');
  const [bezig, setBezig] = useState(false);
  const laad = () => api.post('/api/beheer/flags', body()).then((r) => setLijst(r.data as Lijst), (e) => setMelding(foutTekst(e, uk)));
  useEffect(() => { void laad(); }, []);
  const doe = async (pad: string, extra: Record<string, unknown>) => {
    setBezig(true); setMelding('');
    try { const r = await api.post(pad, { ...body(), ...extra }); setLijst(r.data as Lijst); void vlaggenVernieuwen(); return true; }
    catch (e) { setMelding(foutTekst(e, uk)); return false; } finally { setBezig(false); }
  };
  const opslaan = async () => {
    if (!bewerk) return;
    const gebruikers = bewerk.gebruikers.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean);
    if (await doe('/api/beheer/flags/zetten', { vlag: { sleutel: bewerk.sleutel, omschrijving: bewerk.omschrijving, aan: bewerk.aan, standaard: bewerk.standaard, percentage: bewerk.percentage, gebruikers } })) setBewerk(null);
  };
  const tot = lijst ? new Date(lijst.testTot).toLocaleTimeString(uk ? 'uk-UA' : 'nl-NL', { hour: '2-digit', minute: '2-digit' }) : '';

  return (
    <Venster id='tech-vlaggen' titel={uk ? 'Прапорці функцій' : 'Functievlaggen'} breedte={640} onSluit={sluit}>
      <div className='tech-venster' data-vlaggen-venster='1'>
        <p className='tech-lead'>{uk ? 'Нову функцію можна ввімкнути спершу для себе, потім для вибраних людей або частки користувачів. Прапорець не дає й не забирає прав.' : 'Een nieuwe functie kan eerst voor uzelf aan, dan voor gekozen mensen of een deel van de gebruikers. Een vlag geeft of neemt geen rechten.'} <Vraag help={HELP_FLAGS} uk={uk} label={uk ? 'Прапорці' : 'Vlaggen'} /></p>
        {melding ? <p className='tech-melding' role='alert'>{melding}</p> : null}
        {lijst === null ? <p className='tech-meta'>{uk ? 'Завантаження…' : 'Laden…'}</p> : (
          <>
            {lijst.magTesten ? <p className='tech-meta'>{uk ? `Ваші тести діють до ${tot} (кінець технічного профілю) і лише для вас.` : `Uw tests gelden tot ${tot} (einde technisch profiel) en alleen voor u.`}</p> : null}
            {lijst.vlaggen.length === 0 ? <p className='tech-meta'>{uk ? 'Прапорців ще немає.' : 'Nog geen vlaggen.'}</p> : (
              <ul className='tech-lijst' data-vlaggen-lijst='1'>
                {lijst.vlaggen.map((v) => (
                  <li key={v.sleutel} data-vlag={v.sleutel} className={v.aan ? '' : 'is-weg'}>
                    <span className='tech-lijst-wie'><b><code>{v.sleutel}</code></b>{v.omschrijving ? <small>{v.omschrijving}</small> : null}</span>
                    <span className='tech-lijst-stand'>
                      {v.aan ? (uk ? 'увімкнено' : 'aan') : (uk ? 'вимкнено для всіх' : 'voor iedereen uit')}
                      {v.aan && v.percentage ? ` · ${v.percentage}%` : ''}{v.aan && !v.percentage ? ` · ${uk ? 'типово' : 'standaard'} ${v.standaard ? (uk ? 'так' : 'aan') : (uk ? 'ні' : 'uit')}` : ''}
                      {v.aantalGebruikers ? ` · ${v.aantalGebruikers} ${uk ? 'осіб у списку' : 'in de lijst'}` : ''}
                    </span>
                    <span className='tech-lijst-stand' data-vlag-voor-mij={v.voorMij.value ? 'aan' : 'uit'}>{uk ? 'Для вас' : 'Voor u'}: <b>{v.voorMij.value ? (uk ? 'так' : 'aan') : (uk ? 'ні' : 'uit')}</b> ({reden(v.voorMij, uk)})</span>
                    <span className='tech-knoppen'>
                      {lijst.magTesten ? (
                        <span className='vlag-test' role='group' aria-label={uk ? 'Тест для себе' : 'Test voor uzelf'}>
                          <button type='button' aria-pressed={v.mijnTest === true} disabled={bezig} onClick={() => void doe('/api/beheer/flags/test', { sleutel: v.sleutel, waarde: true })} data-vlag-test='aan'>{uk ? 'Тест: так' : 'Test: aan'}</button>
                          <button type='button' aria-pressed={v.mijnTest === false} disabled={bezig} onClick={() => void doe('/api/beheer/flags/test', { sleutel: v.sleutel, waarde: false })} data-vlag-test='uit'>{uk ? 'Тест: ні' : 'Test: uit'}</button>
                          {v.mijnTest !== null ? <button type='button' disabled={bezig} onClick={() => void doe('/api/beheer/flags/test', { sleutel: v.sleutel, waarde: null })} data-vlag-test='weg'><RotateCcw aria-hidden='true' />{uk ? 'Скинути' : 'Herstellen'}</button> : null}
                        </span>
                      ) : null}
                      {lijst.magBeheren ? (
                        <>
                          <button type='button' disabled={bezig} onClick={() => setBewerk({ sleutel: v.sleutel, omschrijving: v.omschrijving, aan: v.aan, standaard: v.standaard, percentage: v.percentage, gebruikers: v.gebruikers.join('\n'), nieuw: false })} data-vlag-knop='wijzigen'><Pencil aria-hidden='true' />{uk ? 'Змінити' : 'Wijzigen'}</button>
                          {weg === v.sleutel
                            ? <button type='button' className='is-gevaar' disabled={bezig} onClick={() => { setWeg(''); void doe('/api/beheer/flags/verwijderen', { sleutel: v.sleutel }); }} data-vlag-knop='zeker'>{uk ? 'Точно видалити' : 'Echt verwijderen'}</button>
                            : <button type='button' className='is-gevaar' disabled={bezig} onClick={() => setWeg(v.sleutel)} data-vlag-knop='verwijderen'><Trash2 aria-hidden='true' />{uk ? 'Видалити' : 'Verwijderen'}</button>}
                        </>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {lijst.magBeheren && !bewerk ? <div className='tech-knoppen'><button type='button' className='is-hoofd' onClick={() => setBewerk({ sleutel: '', omschrijving: '', aan: false, standaard: false, percentage: 0, gebruikers: '', nieuw: true })} data-vlag-knop='nieuw'><Plus aria-hidden='true' />{uk ? 'Новий прапорець' : 'Nieuwe vlag'}</button></div> : null}
            {bewerk ? (
              <form className='tech-geven' data-vlag-form='1' onSubmit={(e) => { e.preventDefault(); if (!bezig) void opslaan(); }}>
                <h3><Flag aria-hidden='true' />{bewerk.nieuw ? (uk ? 'Новий прапорець' : 'Nieuwe vlag') : `${uk ? 'Змінити' : 'Wijzigen'}: ${bewerk.sleutel}`}</h3>
                {bewerk.nieuw ? <label className='tech-veld'><span>{uk ? 'Ключ (у коді)' : 'Sleutel (in de code)'}</span><input value={bewerk.sleutel} onChange={(e) => setBewerk({ ...bewerk, sleutel: e.target.value.toLowerCase() })} required maxLength={41} placeholder='nieuwe-mail-editor' data-vlag-veld='sleutel' /></label> : null}
                <label className='tech-veld'><span>{uk ? 'Опис' : 'Omschrijving'}</span><input value={bewerk.omschrijving} onChange={(e) => setBewerk({ ...bewerk, omschrijving: e.target.value })} maxLength={300} data-vlag-veld='omschrijving' /></label>
                <label className='ond-nood'><input type='checkbox' checked={bewerk.aan} onChange={(e) => setBewerk({ ...bewerk, aan: e.target.checked })} data-vlag-veld='aan' />{uk ? 'Головний перемикач: увімкнено (вимкнено = вимкнено для всіх)' : 'Hoofdschakelaar: aan (uit = voor iedereen uit)'}</label>
                <label className='tech-veld'><span>{uk ? 'Частка користувачів, %' : 'Deel van de gebruikers, %'}</span><input type='number' min={0} max={100} step={1} value={bewerk.percentage} onChange={(e) => setBewerk({ ...bewerk, percentage: Math.round(Number(e.target.value)) })} data-vlag-veld='percentage' /></label>
                {bewerk.percentage === 0 ? <label className='ond-nood'><input type='checkbox' checked={bewerk.standaard} onChange={(e) => setBewerk({ ...bewerk, standaard: e.target.checked })} data-vlag-veld='standaard' />{uk ? 'Типово увімкнено для всіх' : 'Standaard aan voor iedereen'}</label> : null}
                <label className='tech-veld'><span>{uk ? 'Завжди для цих людей (пошта, по одній у рядку)' : 'Altijd voor deze mensen (e-mail, één per regel)'}</span><textarea rows={3} value={bewerk.gebruikers} onChange={(e) => setBewerk({ ...bewerk, gebruikers: e.target.value })} data-vlag-veld='gebruikers' /></label>
                <div className='tech-knoppen'>
                  <button type='button' onClick={() => setBewerk(null)}>{uk ? 'Скасувати' : 'Annuleren'}</button>
                  <button type='submit' className='is-hoofd' disabled={bezig || (bewerk.nieuw && !SLEUTEL_RE.test(bewerk.sleutel))} data-vlag-knop='opslaan'>{uk ? 'Зберегти' : 'Opslaan'}</button>
                </div>
              </form>
            ) : null}
          </>
        )}
      </div>
    </Venster>
  );
}
