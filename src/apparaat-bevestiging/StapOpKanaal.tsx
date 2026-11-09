// APPARAAT-001 — de kant van het VRAGENDE apparaat (A) in het venster «Підтвердіть доступ» en in het bevestigingsvenster van de
// bevestigingstabel: tabblad «Інший пристрій» of «У Telegram». Vraagt het verzoek aan, toont dezelfde symbolen als het andere
// apparaat met één uitgelicht, telt af, volgt de stand (elke 2 s + de snelle stroom) en haalt daarna — alleen voor de klassieke
// step-up — de step-up op via de poort van de bevestigingstabel (eventueel nog met de geheime code).
import { useCallback, useEffect, useRef, useState } from 'react';
import { Send, Smartphone } from 'lucide-react';
import Symbool from './Symbool';
import { abonneer } from './stroom';
import { aanvragen, foutCode, foutData, intrekken, poort, stand, telegramAanvragen, telegramCode, telegramStatus, type Ctx } from './api';
import { foutTekst, tr, type Lang } from './teksten';
import type { VasteSoort } from '../../shared/apparaat-bevestiging/symbolen';
import './apparaat.css';

export type Kanaal = 'apparaat' | 'telegram';
type Props = {
  kanaal: Kanaal; ctx: Ctx; lang: Lang;
  /** handeling in de bevestigingstabel: 'stap-op' (klassieke step-up) of de bewaakte handeling */
  matrixActie: string;
  /** wat de gebruiker echt deed (label uit de vaste lijst), alleen voor de tekst op het andere apparaat */
  label?: string;
  gevoelig?: boolean;
  /** true: na «bevestigd» de poort aanroepen (klassieke step-up); false: de aanroeper probeert zijn handeling zelf opnieuw */
  naPoort: boolean;
  onKlaar: (methode: Kanaal) => void;
  onAnnuleer?: () => void;
  /** hoeveel andere apparaten het venster kunnen tonen (uit /stap-op/methoden), alleen informatief */
  apparaten?: number;
};
type Symbolen = { soort: VasteSoort; kandidaten: number[]; juist: number } | null;
type Fase = 'start' | 'wacht' | 'code' | 'fout';

const resterend = (iso: string) => Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 1000));

export default function StapOpKanaal({ kanaal, ctx, lang, matrixActie, label, gevoelig, naPoort, onKlaar, onAnnuleer, apparaten }: Props) {
  const [fase, setFase] = useState<Fase>('start');
  const [id, setId] = useState('');
  const [symbolen, setSymbolen] = useState<Symbolen>(null);
  const [verlooptOp, setVerlooptOp] = useState('');
  const [rest, setRest] = useState(0);
  const [fout, setFout] = useState('');
  const [info, setInfo] = useState('');
  const [code, setCode] = useState('');
  const [bezig, setBezig] = useState(false);
  const actief = useRef(true);
  const idRef = useRef('');
  useEffect(() => () => { actief.current = false; }, []);

  const afronden = useCallback(async () => {
    if (!naPoort) { onKlaar(kanaal); return; }
    try { const r = await poort(ctx); onKlaar(r.stepUp); }
    catch (e) {
      const c = foutCode(e), d = foutData(e);
      const ontbreekt = Array.isArray(d.ontbreekt) ? (d.ontbreekt as string[]) : [];
      if (c === 'TELEGRAM_BEVESTIGING_NODIG' && ontbreekt.includes('code')) { setFase('code'); setInfo(tr(lang, 'Підтверджено. За вашою таблицею потрібен ще таємний код.', 'Bevestigd. Volgens uw tabel is ook nog uw geheime code nodig.')); return; }
      setFase('fout'); setFout(foutTekst(lang, c));
    }
  }, [ctx, kanaal, lang, naPoort, onKlaar]);

  const start = useCallback(async () => {
    setFout(''); setFase('start'); setSymbolen(null); setCode('');
    try {
      if (kanaal === 'apparaat') {
        const v = await aanvragen(ctx, { actie: matrixActie, label, gevoelig });
        if (!actief.current) return;
        idRef.current = v.id; setId(v.id); setVerlooptOp(v.verlooptOp);
        setSymbolen(typeof v.juist === 'number' ? { soort: v.soort, kandidaten: v.kandidaten, juist: v.juist } : null);
        setInfo(tr(lang, `Запит надіслано на ${v.apparaten ?? apparaten ?? 1} інш. пристр. — там з’явилося вікно «Це ви?».`, `Verzoek gestuurd naar ${v.apparaten ?? apparaten ?? 1} ander(e) apparaat(en) — daar staat nu «Bent u het?».`));
      } else {
        const t = await telegramAanvragen(ctx, matrixActie);
        if (!actief.current) return;
        idRef.current = t.id; setId(t.id); setVerlooptOp(t.verlooptOp);
        setSymbolen(t.soort && t.kandidaten && typeof t.juist === 'number' ? { soort: t.soort, kandidaten: t.kandidaten, juist: t.juist } : null);
        setInfo(tr(lang, `Картку надіслано у ваш Telegram (${t.verstuurd}). Відкрийте чат із ботом.`, `Kaart verstuurd naar uw Telegram (${t.verstuurd}). Open de chat met de bot.`));
      }
      setFase('wacht');
    } catch (e) { if (actief.current) { setFase('fout'); setFout(foutTekst(lang, foutCode(e))); } }
  }, [apparaten, ctx, gevoelig, kanaal, label, lang, matrixActie]);
  useEffect(() => { void start(); }, [start]);

  // Stand volgen: elke 2 s (en meteen bij een gebeurtenis van de snelle stroom). «Ні» op het andere apparaat wint altijd.
  useEffect(() => {
    if (fase !== 'wacht' || !id) return;
    let weg = false; let t = 0;
    const kijk = async () => {
      if (weg) return;
      try {
        const s = kanaal === 'apparaat' ? (await stand(ctx, id)).stand : (await telegramStatus(ctx, id)).stand;
        if (weg) return;
        if (s === 'bevestigd' || s === 'gebruikt') { weg = true; await afronden(); return; }
        if (s === 'geweigerd') { weg = true; setFase('fout'); setFout(tr(lang, 'На іншому пристрої обрано інший символ або натиснуто «Це не я». Дію скасовано, нічого не змінено.', 'Op het andere apparaat is een ander symbool gekozen of «Dit ben ik niet» getikt. De handeling is geannuleerd, er is niets gewijzigd.')); return; }
        if (s === 'verlopen' || s === 'ingetrokken') { weg = true; setFase('fout'); setFout(tr(lang, 'Час на підтвердження вийшов. Спробуйте ще раз.', 'De tijd om te bevestigen is om. Probeer het opnieuw.')); return; }
      } catch { /* tijdelijke netwerkfout: gewoon opnieuw */ }
      t = window.setTimeout(kijk, 2000);
    };
    t = window.setTimeout(kijk, 1500);
    const af = kanaal === 'apparaat' ? abonneer(ctx, (g) => { if (g.soort === 'apparaat.afgerond' && g.id === id) { window.clearTimeout(t); void kijk(); } }) : () => undefined;
    return () => { weg = true; window.clearTimeout(t); af(); };
  }, [afronden, ctx, fase, id, kanaal, lang]);

  // Aftelling tot het verzoek verloopt.
  useEffect(() => {
    if (!verlooptOp) return;
    setRest(resterend(verlooptOp));
    const t = window.setInterval(() => setRest(resterend(verlooptOp)), 500);
    return () => window.clearInterval(t);
  }, [verlooptOp]);

  const codeSturen = async () => {
    const c = code.trim(); if (c.length < 4 || bezig) return;
    setBezig(true); setFout('');
    try {
      const r = await telegramCode(ctx, c, matrixActie);
      setCode('');
      if (r.ok) { await afronden(); return; }
      setFout(r.uitkomst === 'pauze' ? tr(lang, 'Забагато невдалих спроб. Код тимчасово призупинено.', 'Te veel mislukte pogingen. De code is tijdelijk gepauzeerd.')
        : r.uitkomst === 'uit' ? tr(lang, 'Код вимкнено після багатьох помилок. Відновіть його у «Способах входу» з ключем доступу.', 'De code is na te veel fouten uitgeschakeld. Herstel hem bij «Aanmeldmethoden» met uw toegangssleutel.')
          : tr(lang, 'Код не підходить. Перевірте й спробуйте ще раз.', 'De code klopt niet. Controleer en probeer opnieuw.'));
    } catch (e) { setFout(foutTekst(lang, foutCode(e))); }
    finally { setBezig(false); }
  };
  const annuleren = () => { if (kanaal === 'apparaat' && idRef.current) void intrekken(ctx, idRef.current).catch(() => undefined); onAnnuleer?.(); };

  const Icoon = kanaal === 'apparaat' ? Smartphone : Send;
  return <div className='apb-kanaal' data-kanaal={kanaal} data-fase={fase}>
    <p className='apb-uitleg'><Icoon className='apb-uitleg-icoon' aria-hidden='true' />
      {kanaal === 'apparaat'
        ? tr(lang, 'На вашому іншому пристрої (телефон, інший комп’ютер), де ви вже увійшли, з’явиться вікно з тими самими символами. Натисніть там виділений символ і підтвердьте ключем доступу.', 'Op uw andere apparaat (telefoon, andere computer) waarop u al bent aangemeld verschijnt een venster met dezelfde symbolen. Tik daar het uitgelichte symbool en bevestig met uw toegangssleutel.')
        : tr(lang, 'У чаті з ботом @MijnRuimte_Bot з’явиться картка з описом дії. Прочитайте її й натисніть виділений символ (або «Так, це я»).', 'In de chat met de bot @MijnRuimte_Bot verschijnt een kaart met de handeling. Lees hem en tik het uitgelichte symbool (of «Ja, dit ben ik»).')}
    </p>
    {fase === 'start' && <p className='apb-wacht'><span className='apb-draai' aria-hidden='true' /> {tr(lang, 'Надсилаємо запит…', 'Verzoek sturen…')}</p>}
    {(fase === 'wacht' || fase === 'code') && symbolen && <div className='apb-symbolen' role='group' aria-label={tr(lang, 'Символи; виділений треба натиснути на іншому пристрої', 'Symbolen; het uitgelichte tikt u op het andere apparaat')}>
      {symbolen.kandidaten.map((k, pos) => <div key={`${symbolen.soort}-${k}`} className={`apb-tegel${pos === symbolen.juist ? ' is-uitgelicht' : ''}`} aria-current={pos === symbolen.juist ? 'true' : undefined}>
        <Symbool soort={symbolen.soort} index={k} lang={lang} uitgelicht={pos === symbolen.juist} />
        {pos === symbolen.juist && <span className='apb-tegel-label'>{tr(lang, 'цей', 'deze')}</span>}
      </div>)}
    </div>}
    {fase === 'wacht' && <>
      <p className='apb-wacht'><span className='apb-draai' aria-hidden='true' /> {symbolen
        ? tr(lang, 'Чекаємо, доки на іншому боці натиснуть виділений символ…', 'Wachten tot aan de andere kant het uitgelichte symbool wordt getikt…')
        : tr(lang, 'Чекаємо на вашу відповідь…', 'Wachten op uw antwoord…')}</p>
      {info && <p className='apb-klein'>{info}</p>}
      <p className='apb-klein' aria-live='polite'>{tr(lang, `Запит дійсний ще ${rest} с. Одна спроба: інший символ скасує дію.`, `Verzoek nog ${rest} s geldig. Eén poging: een ander symbool annuleert de handeling.`)}</p>
    </>}
    {fase === 'code' && <form className='apb-code' onSubmit={(e) => { e.preventDefault(); void codeSturen(); }}>
      {info && <p className='apb-klein'>{info}</p>}
      <label htmlFor='apb-code'>{tr(lang, 'Ваш таємний код', 'Uw geheime code')}</label>
      <input id='apb-code' type='password' inputMode='text' autoComplete='off' value={code} onChange={(e) => setCode(e.target.value)} maxLength={64} autoFocus />
      <button type='submit' className='apb-knop apb-knop-hoofd' disabled={bezig || code.trim().length < 4}>{tr(lang, 'Підтвердити', 'Bevestigen')}</button>
    </form>}
    {fout && <p className='apb-fout' role='alert'>{fout}</p>}
    <div className='apb-rij'>
      {fase === 'fout' && <button type='button' className='apb-knop apb-knop-hoofd' onClick={() => void start()}>{tr(lang, 'Спробувати ще раз', 'Opnieuw proberen')}</button>}
      {onAnnuleer && <button type='button' className='apb-knop' onClick={annuleren}>{tr(lang, 'Скасувати', 'Annuleren')}</button>}
    </div>
  </div>;
}
