// «Увійти через Telegram» op het aanmeldscherm (vlag telegram-aanmelden-v1; zonder vlag/sleutel toont de server zichtbaar=false
// en staat hier NIETS). Stroom:
//   1. start → server maakt dezelfde aanmeldtransactie als Google (bindingscookie voor DIT tabblad) + een eenmalig verzoek;
//   2. de gebruiker opent de bot (deeplink t.me/<bot>?start=i_<id>) of het officiële Login Widget (eigen mini-pagina);
//   3. in Telegram: kaart met apparaat, plaats en tijd → «Так, це я» (na aftelling) of «Ні, це не я» (blokkeert dit apparaat);
//   4. deze pagina leest elke 2 s de stand; vraagt het account een geheime code, dan hier invullen (nooit in de chat);
//   5. voltooien → sessie zoals bij Google (zonder step-up: gevoelige acties vragen daarna nog een passkey).
// Dubbel tikken doet niets, elke fout zegt eerlijk of opnieuw proberen zin heeft.
import { useEffect, useRef, useState } from 'react';
import { ecosystemTabContext } from '../tab-context';
import { foutCode, foutTekst, openbaarGet, openbaarPost } from './api';
import TelegramLogo from './TelegramLogo';
import { useEenmalig } from './Bevestigen';
import './telegram.css';

type Lang = 'uk' | 'nl';
const tr = (lang: Lang, uk: string, nl: string) => (lang === 'nl' ? nl : uk);
type Config = { zichtbaar: boolean; bot: string; stand: string; soort: string; status?: { stand: string; soort: string } };
type Lopend = { id: string; geheim: string; deeplink: string; widgetUrl: string; verlooptOp: string; bot: string };
const OPSLAG = 'mr-tg-inlog';
const bewaar = (l: Lopend | null) => { try { if (l) sessionStorage.setItem(OPSLAG, JSON.stringify(l)); else sessionStorage.removeItem(OPSLAG); } catch { /* privévenster */ } };
const lees = (): Lopend | null => { try { const v = JSON.parse(sessionStorage.getItem(OPSLAG) || 'null'); return v && typeof v.id === 'string' && typeof v.geheim === 'string' ? v : null; } catch { return null; } };

export default function AanmeldTelegram({ lang, remember = true }: { lang: Lang; remember?: boolean }) {
  const [cfg, setCfg] = useState<Config | null>(null);
  const [lopend, setLopend] = useState<Lopend | null>(null);
  const [stand, setStand] = useState('');
  const [reden, setReden] = useState('');
  const [codeNodig, setCodeNodig] = useState(false);
  const [code, setCode] = useState('');
  const [fout, setFout] = useState('');
  const [rest, setRest] = useState(0);
  const { bezig, doe } = useEenmalig();
  const klaar = useRef(false);

  useEffect(() => {
    let actief = true;
    openbaarGet<Config>('/api/aanmelden/telegram/config').then((c) => { if (actief) setCfg(c); }).catch(() => { if (actief) setCfg(null); });
    // Terug van het Login Widget (?tg_inlog=<id>) of de pagina herladen tijdens het wachten: verder waar we waren.
    const url = new URL(location.href);
    const terug = url.searchParams.get('tg_inlog');
    const terugFout = url.searchParams.get('tg_fout');
    if (terug) { url.searchParams.delete('tg_inlog'); url.searchParams.delete('tg_fout'); history.replaceState(history.state, '', url.toString()); }
    const l = lees();
    if (l && (!terug || terug === l.id) && new Date(l.verlooptOp).getTime() > Date.now()) setLopend(l);
    if (terugFout) setFout(terugFout === 'VERLOPEN' ? tr(lang, 'Підтвердження Telegram застаріло. Почніть знову.', 'De Telegram-bevestiging is verouderd. Begin opnieuw.')
      : terugFout === 'APPARAAT_GEBLOKKEERD' ? tr(lang, 'Цей пристрій заблоковано для входу через Telegram. Увійдіть через Google.', 'Dit apparaat is geblokkeerd voor aanmelden met Telegram. Meld u aan met Google.')
      : terugFout === 'GEPAUZEERD' ? tr(lang, 'Вхід через цей Telegram призупинено: підтвердьте зміну даних на сайті ключем доступу.', 'Aanmelden met deze Telegram staat op pauze: bevestig de gewijzigde gegevens op de site met uw passkey.')
      : terugFout === 'NIET_GEKOPPELD' ? tr(lang, 'Цей Telegram не прив’язано до жодного акаунта. Спершу увійдіть через Google і прив’яжіть його у «Способах входу».', 'Deze Telegram is aan geen enkel account gekoppeld. Meld u eerst aan met Google en koppel hem bij «Aanmeldmethoden».')
        : tr(lang, 'Telegram не підтвердив вхід. Спробуйте ще раз або іншим способом.', 'Telegram bevestigde de aanmelding niet. Probeer opnieuw of op een andere manier.'));
    return () => { actief = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Aftellen tot het verzoek verloopt.
  useEffect(() => {
    if (!lopend) return;
    const t = window.setInterval(() => setRest(Math.max(0, Math.round((new Date(lopend.verlooptOp).getTime() - Date.now()) / 1000))), 500);
    return () => window.clearInterval(t);
  }, [lopend]);

  // Stand volgen elke 2 s.
  useEffect(() => {
    if (!lopend) return;
    let actief = true; let t = 0; let netwerkFouten = 0;
    const kijk = async () => {
      if (!actief || klaar.current) return;
      try {
        const s = await openbaarPost<{ stand: string; reden?: string; codeNodig: boolean; codeOk: boolean }>('/api/aanmelden/telegram/status', { id: lopend.id, geheim: lopend.geheim });
        netwerkFouten = 0;
        setStand(s.stand); setReden(s.reden || '');
        if (s.stand === 'goedgekeurd' && s.codeNodig && !s.codeOk) setCodeNodig(true);
        if (s.stand === 'goedgekeurd' && (!s.codeNodig || s.codeOk)) { void voltooien(lopend); return; }
        if (['geweigerd', 'verlopen', 'ingewisseld'].includes(s.stand)) { bewaar(null); return; }
      } catch (e) {
        if (foutCode(e) === 'VERZOEK_ONBEKEND') { bewaar(null); setLopend(null); setFout(foutTekst(lang, e)); return; }
        netwerkFouten++;
        if (netwerkFouten >= 3) setFout(foutTekst(lang, new Error('NETWORK_ERROR')));
      }
      t = window.setTimeout(kijk, 2000);
    };
    t = window.setTimeout(kijk, 1000);
    return () => { actief = false; window.clearTimeout(t); };
  }, [lopend]); // eslint-disable-line react-hooks/exhaustive-deps

  const start = () => doe(async () => {
    setFout(''); setStand(''); setCodeNodig(false); klaar.current = false;
    try {
      const r = await openbaarPost<Lopend>('/api/aanmelden/telegram/start', { tab: ecosystemTabContext(), locale: lang, remember });
      bewaar(r); setLopend(r); setStand('wacht');
    } catch (e) { setFout(foutTekst(lang, e)); }
  });
  const voltooien = (l: Lopend) => doe(async () => {
    if (klaar.current) return;
    klaar.current = true;
    try {
      const r = await openbaarPost<{ returnTo?: string }>('/api/aanmelden/telegram/voltooien', { id: l.id, geheim: l.geheim });
      bewaar(null);
      setStand('ingelogd');
      location.assign(typeof r?.returnTo === 'string' && r.returnTo.startsWith(location.origin) ? r.returnTo : '/');
    } catch (e) { klaar.current = false; bewaar(null); setLopend(null); setFout(foutTekst(lang, e)); }
  });
  const codeSturen = () => doe(async () => {
    if (!lopend) return;
    setFout('');
    try {
      const r = await openbaarPost<{ ok: boolean; uitkomst: string }>('/api/aanmelden/telegram/code', { id: lopend.id, geheim: lopend.geheim, code });
      setCode('');
      if (r.ok) { setCodeNodig(false); return; }
      setFout(r.uitkomst === 'pauze' ? tr(lang, 'Забагато невдалих спроб — код призупинено. Увійдіть іншим способом або спробуйте пізніше.', 'Te veel mislukte pogingen — de code is gepauzeerd. Meld u op een andere manier aan of probeer later.')
        : r.uitkomst === 'uit' ? tr(lang, 'Код вимкнено. Увійдіть через Google і відновіть його з ключем доступу.', 'De code is uitgeschakeld. Meld u aan met Google en herstel hem met uw passkey.')
          : tr(lang, 'Код не підходить.', 'De code klopt niet.'));
    } catch (e) { setFout(foutTekst(lang, e)); }
  });
  const stoppen = () => { bewaar(null); setLopend(null); setStand(''); setCodeNodig(false); setFout(''); };

  if (!cfg?.zichtbaar) return null;
  const storing = cfg.status?.stand === 'storing' || cfg.stand === 'storing';
  const lang10 = cfg.status?.soort === 'lang' || cfg.soort === 'lang';
  const mmss = `${Math.floor(rest / 60)}:${String(rest % 60).padStart(2, '0')}`;

  if (!lopend || ['geweigerd', 'verlopen'].includes(stand)) return <div className='tga-aanmeld'>
    <button type='button' className='tga-aanmeld-knop' onClick={() => void start()} disabled={bezig || storing} aria-disabled={bezig || storing}>
      <TelegramLogo maat={20} /><span>{tr(lang, 'Увійти через Telegram', 'Aanmelden met Telegram')}</span>{bezig && <span className='tga-draai' aria-hidden='true' />}
    </button>
    {storing && <p className='tga-klein' role='status'>{lang10 ? tr(lang, 'Telegram не відповідає вже понад 10 хвилин. Увійдіть через Google — ми покажемо, щойно запрацює.', 'Telegram antwoordt al meer dan 10 minuten niet. Meld u aan met Google — we tonen het zodra het weer werkt.')
      : tr(lang, 'Telegram тимчасово не відповідає. Спробуйте за хвилину або увійдіть через Google.', 'Telegram antwoordt tijdelijk niet. Probeer over een minuut of meld u aan met Google.')}</p>}
    {stand === 'geweigerd' && <p className='tga-fout' role='alert'>{
      reden === 'niet-ik' ? tr(lang, 'Вхід відхилено в Telegram («Ні, це не я»), цей пристрій заблоковано для входу через Telegram. Якщо це були ви — увійдіть через Google.', 'Aanmelding geweigerd in Telegram («Nee, dit ben ik niet»); dit apparaat is geblokkeerd voor Telegram. Was u het wel — meld u aan met Google.')
        : reden === 'passkey-nodig' ? tr(lang, 'Telegram підтвердив, але для цього пристрою (або акаунта) ваші налаштування вимагають ще ключ доступу. Увійдіть через Google і підтвердьте ключем доступу — потім цей пристрій стане відомим.', 'Telegram bevestigde, maar voor dit apparaat (of account) vragen uw instellingen ook een passkey. Meld u aan met Google en bevestig met uw passkey — daarna is dit apparaat bekend.')
          : reden === 'niet-gekoppeld' ? tr(lang, 'Цей Telegram не прив’язано до жодного акаунта. Увійдіть через Google і прив’яжіть його у «Способах входу».', 'Deze Telegram is aan geen enkel account gekoppeld. Meld u aan met Google en koppel hem bij «Aanmeldmethoden».')
            : reden === 'apparaat-geblokkeerd' ? tr(lang, 'Цей пристрій заблоковано для входу через Telegram (раніше на ньому відхилили вхід). Увійдіть через Google.', 'Dit apparaat is geblokkeerd voor aanmelden met Telegram (eerder werd hier een aanmelding geweigerd). Meld u aan met Google.')
            : reden === 'gepauzeerd' ? tr(lang, 'Вхід через цей Telegram призупинено: дані Telegram змінилися. Увійдіть через Google і підтвердьте зміну ключем доступу.', 'Aanmelden met deze Telegram staat op pauze: de Telegram-gegevens zijn gewijzigd. Meld u aan met Google en bevestig de wijziging met uw passkey.')
              : tr(lang, 'Вхід не вдалося завершити. Скористайтеся іншим способом.', 'De aanmelding kon niet worden afgerond. Gebruik een andere manier.')}</p>}
    {stand === 'verlopen' && <p className='tga-fout' role='alert'>{tr(lang, 'Час на підтвердження (3 хв) вийшов. Почніть знову.', 'De tijd om te bevestigen (3 min) is om. Begin opnieuw.')}</p>}
    {fout && <p className='tga-fout' role='alert'>{fout}</p>}
  </div>;

  return <div className='tga-aanmeld tga-aanmeld-open' aria-live='polite'>
    <h2 className='tga-kop'><TelegramLogo maat={24} /> {tr(lang, 'Вхід через Telegram', 'Aanmelden met Telegram')}</h2>
    {stand === 'ingelogd' ? <p><span className='tga-draai' aria-hidden='true' /> {tr(lang, 'Готово — відкриваємо ваш простір…', 'Klaar — uw ruimte wordt geopend…')}</p> : codeNodig ? <form onSubmit={(e) => { e.preventDefault(); void codeSturen(); }} className='tga-blok'>
      <p>{tr(lang, 'Telegram підтвердив. Ваш акаунт також вимагає таємний код — введіть його тут (ніколи не в чаті).', 'Telegram heeft bevestigd. Uw account vraagt ook uw geheime code — vul die hier in (nooit in de chat).')}</p>
      <input type='password' autoComplete='off' value={code} onChange={(e) => setCode(e.target.value)} maxLength={64} autoFocus aria-label={tr(lang, 'Таємний код', 'Geheime code')} />
      <button type='submit' className='tga-knop tga-knop-hoofd' disabled={bezig || code.length < 4}>{tr(lang, 'Увійти', 'Aanmelden')}</button>
    </form> : <>
      <ol className='tga-stappen'>
        <li>{tr(lang, 'Відкрийте Telegram кнопкою нижче.', 'Open Telegram met de knop hieronder.')}</li>
        <li>{tr(lang, `У чаті з @${lopend.bot} перевірте пристрій і час та натисніть «Так, це я».`, `Controleer in de chat met @${lopend.bot} het apparaat en de tijd en tik «Ja, dit ben ik».`)}</li>
        <li>{tr(lang, 'Поверніться сюди — сторінка відкриється сама.', 'Kom hier terug — de pagina opent vanzelf.')}</li>
      </ol>
      <a className='tga-aanmeld-knop' href={lopend.deeplink} target='_blank' rel='noopener noreferrer'><TelegramLogo maat={20} /><span>{tr(lang, 'Відкрити Telegram', 'Telegram openen')}</span></a>
      <a className='tga-link' href={lopend.widgetUrl}>{tr(lang, 'Telegram на іншому пристрої? Увійти через офіційний віджет Telegram', 'Telegram op een ander apparaat? Aanmelden met de officiële Telegram-widget')}</a>
      <p className='tga-wacht'><span className='tga-draai' aria-hidden='true' /> {tr(lang, `Чекаємо на підтвердження… залишилось ${mmss}`, `Wachten op bevestiging… nog ${mmss}`)}</p>
      <p className='tga-klein'>{tr(lang, 'Чому так: вхід підтверджується лише у вашому власному Telegram, тож пароль не потрібен, а чужий пристрій ви одразу побачите й заблокуєте.', 'Waarom zo: de aanmelding wordt alleen in uw eigen Telegram bevestigd, dus geen wachtwoord nodig, en een vreemd apparaat ziet en blokkeert u meteen.')}</p>
    </>}
    {fout && <p className='tga-fout' role='alert'>{fout}</p>}
    <button type='button' className='tga-knop' onClick={stoppen}>{tr(lang, 'Скасувати', 'Annuleren')}</button>
  </div>;
}
