// «Увійти через Telegram» op het aanmeldscherm (vlag telegram-aanmelden-v1; zonder vlag/sleutel toont de server zichtbaar=false
// en staat hier NIETS). Stroom:
//   1. start → server maakt dezelfde aanmeldtransactie als Google (bindingscookie voor DIT tabblad) + een eenmalig verzoek;
//   2. de gebruiker opent de bot (directe verwijzing t.me/<bot>?start=i_<id>) of het officiële aanmeldvenster (eigen mini-pagina);
//   3. in Telegram: kaart met apparaat, plaats en tijd → «Так, це я» (na aftelling) of «Ні, це не я» (blokkeert dit apparaat);
//   4. deze pagina leest elke 2 s de stand; vraagt het account een geheime code, dan hier invullen (nooit in de chat);
//   5. voltooien → sessie zoals bij Google (zonder extra bevestiging: gevoelige acties vragen daarna nog een toegangssleutel).
// Dubbel tikken doet niets, elke fout zegt eerlijk of opnieuw proberen zin heeft.
import { useEffect, useRef, useState } from 'react';
import { cleanRedirectReturnTo } from '../aanmeld-omleiding';
import { broadcastCanonicalAuthChange } from '../canoniek-gebeurtenissen';
import { sessieDienst } from '../canoniek-navigatie';
import { rememberViewAccountEverywhere } from '../domein-weergave-cache';
import { clearCachedAvatar, rememberAvatarUrl, zetWeergaveAccount } from '../gedeelde-voorkeuren';
import { ecosystemTabContext, setEcosystemSessionLikely } from '../tab-context';
import { foutCode, foutTekst, openbaarPost, pauzeBericht, useTelegramPauze } from './api';
import { laadAanmeldConfig } from './aanmeld-config';
import TelegramLogo from './TelegramLogo';
import { useEenmalig } from './Bevestigen';
import './telegram.css';

type Lang = 'uk' | 'nl';
const tr = (lang: Lang, uk: string, nl: string) => (lang === 'nl' ? nl : uk);
type Config = { zichtbaar: boolean; bot: string; stand: string; soort: string; status?: { stand: string; soort: string } };
// SEC-002 (aanmelden-04): symbool van dit verzoek (server: inlogSymbool); de bot toont hetzelfde in zijn kaart.
type Symbool = { id: string; emoji: string; uk: string; nl: string };
type Lopend = { id: string; geheim: string; deeplink: string; widgetUrl: string; verlooptOp: string; bot: string; symbool?: Symbool };
const geldigSymbool = (s: unknown): s is Symbool => !!s && typeof s === 'object' && ['emoji', 'uk', 'nl'].every((k) => typeof (s as Record<string, unknown>)[k] === 'string' && String((s as Record<string, unknown>)[k]).length <= 40);
type VoltooidAntwoord = {
  ok?: boolean;
  sessionCreated?: boolean;
  reasonCode?: string;
  returnTo?: string;
  user?: { id?: string; picture?: string | null } | null;
};
const OPSLAG = 'mr-tg-inlog';
const bewaar = (l: Lopend | null) => { try { if (l) sessionStorage.setItem(OPSLAG, JSON.stringify(l)); else sessionStorage.removeItem(OPSLAG); } catch { /* privévenster */ } };
const lees = (): Lopend | null => { try { const v = JSON.parse(sessionStorage.getItem(OPSLAG) || 'null'); return v && typeof v.id === 'string' && typeof v.geheim === 'string' ? v : null; } catch { return null; } };

const schoonTerugAdres = (): string => {
  try {
    const u = new URL(cleanRedirectReturnTo());
    u.searchParams.delete('tg_inlog');
    u.searchParams.delete('tg_fout');
    return u.toString();
  } catch {
    return `${location.origin}/`;
  }
};

/** Strikte controle tegen open omleiding: uitsluitend https-domeinen binnen *.tarasevych.com zonder inloggegevens in de URL. */
const veiligTerugAdres = (waarde: unknown): string => {
  if (typeof waarde !== 'string' || !waarde) return '/';
  try {
    const u = new URL(waarde, location.origin);
    if (u.protocol !== 'https:' || u.username || u.password) return '/';
    const h = u.hostname.toLowerCase();
    if (u.origin === location.origin || h === 'tarasevych.com' || h.endsWith('.tarasevych.com')) return u.toString();
  } catch { /* ongeldig adres */ }
  return '/';
};

export default function AanmeldTelegram({
  lang,
  remember = true,
  intent = 'login',
  onVoltooid,
}: {
  lang: Lang;
  remember?: boolean;
  intent?: 'login' | 'replace-tab';
  onVoltooid?: (r: Record<string, unknown>) => void;
}) {
  const [cfg, setCfg] = useState<Config | null>(null);
  const [lopend, setLopend] = useState<Lopend | null>(null);
  const [stand, setStand] = useState('');
  const [reden, setReden] = useState('');
  // SEC-002 (slot «u»): de server geeft bij «passkey-nodig» zonder toegangssleutel op het account de weg via Google (advies
  // NIEUW_APPARAAT_ANDERE_WEG + uitleg uk/nl, backend/telegram-aanmelden/inloggen.ts). Die tekst wint dan van de algemene.
  const [andereWeg, setAndereWeg] = useState<{ uk: string; nl: string } | null>(null);
  const [codeNodig, setCodeNodig] = useState(false);
  const [code, setCode] = useState('');
  const [fout, setFout] = useState('');
  const [rest, setRest] = useState(0);
  const { bezig, doe } = useEenmalig();
  const pauze = useTelegramPauze();
  const klaar = useRef(false);

  useEffect(() => {
    let actief = true;
    const haalConfig = (forceer = false) => {
      void laadAanmeldConfig(forceer).then((c) => {
        if (actief && c) setCfg(c as Config);
      });
    };
    haalConfig(false);
    const herstel = () => haalConfig(true);
    window.addEventListener('online', herstel);
    window.addEventListener('pageshow', herstel);
    // Terug van het aanmeldvenster (?tg_inlog=<id>) of de pagina herladen tijdens het wachten: verder waar we waren.
    const url = new URL(location.href);
    const terug = url.searchParams.get('tg_inlog');
    const terugFout = url.searchParams.get('tg_fout');
    if (terug || terugFout) { url.searchParams.delete('tg_inlog'); url.searchParams.delete('tg_fout'); history.replaceState(history.state, '', url.toString()); }
    const l = lees();
    if (l && (!terug || terug === l.id) && new Date(l.verlooptOp).getTime() > Date.now()) setLopend(l);
    if (terugFout) setFout(terugFout === 'VERLOPEN' ? tr(lang, 'Підтвердження Telegram застаріло. Почніть знову.', 'De Telegram-bevestiging is verouderd. Begin opnieuw.')
      : terugFout === 'APPARAAT_GEBLOKKEERD' ? tr(lang, 'Цей пристрій заблоковано для входу через Telegram. Увійдіть через Google.', 'Dit apparaat is geblokkeerd voor aanmelden met Telegram. Meld u aan met Google.')
      : terugFout === 'GEPAUZEERD' ? tr(lang, 'Вхід через цей Telegram призупинено: підтвердьте зміну даних на сайті ключем доступу.', 'Aanmelden met deze Telegram staat op pauze: bevestig de gewijzigde gegevens op de site met uw toegangssleutel.')
      // SEC-002 aanmelden-04: het aanmeldvenster van Telegram hoort bij de browser waarin de aanmelding begon (binding-cookie).
      : terugFout === 'ANDERE_BROWSER' ? tr(lang, 'Цей вхід через Telegram почато в іншому браузері, тому тут його не завершено (нічого не змінено). Почніть вхід знову саме в цьому браузері. Якщо ви нічого не починали — хтось міг надіслати вам чуже посилання: не підтверджуйте його в Telegram.', 'Deze aanmelding met Telegram is in een andere browser begonnen en is hier dus niet afgerond (er is niets gewijzigd). Begin de aanmelding opnieuw in deze browser. Begon u niets, dan kreeg u misschien een vreemde link: bevestig die niet in Telegram.')
      : terugFout === 'NIET_GEKOPPELD' ? tr(lang, 'Цей Telegram не прив’язано до жодного облікового запису. Спершу увійдіть через Google і прив’яжіть його у «Способах входу».', 'Deze Telegram is aan geen enkel account gekoppeld. Meld u eerst aan met Google en koppel hem bij «Aanmeldmethoden».')
        : tr(lang, 'Telegram не підтвердив вхід. Спробуйте ще раз або іншим способом.', 'Telegram bevestigde de aanmelding niet. Probeer opnieuw of op een andere manier.'));
    return () => {
      actief = false;
      window.removeEventListener('online', herstel);
      window.removeEventListener('pageshow', herstel);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Aftellen tot het verzoek verloopt.
  useEffect(() => {
    if (!lopend) return;
    const t = window.setInterval(() => setRest(Math.max(0, Math.round((new Date(lopend.verlooptOp).getTime() - Date.now()) / 1000))), 500);
    return () => window.clearInterval(t);
  }, [lopend]);

  const voltooien = async (l: Lopend) => {
    if (klaar.current) return;
    klaar.current = true;
    try {
      const r = await openbaarPost<VoltooidAntwoord>('/api/aanmelden/telegram/voltooien', { id: l.id, geheim: l.geheim });
      if (r?.ok === false || r?.sessionCreated === false) {
        throw new Error(String(r?.reasonCode || 'AANMELDEN_MISLUKT'));
      }
      bewaar(null);
      pauze.wis();
      try {
        const schoon = new URL(location.href);
        schoon.searchParams.delete('tg_inlog');
        schoon.searchParams.delete('tg_fout');
        history.replaceState(history.state, '', schoon.pathname + schoon.search + schoon.hash);
      } catch { /* zonder geschiedenis */ }
      if (r?.user?.id) {
        const nieuwKey = rememberViewAccountEverywhere(r.user.id);
        zetWeergaveAccount(nieuwKey);
        if (r.user.picture) rememberAvatarUrl(r.user.picture);
        else clearCachedAvatar();
      }
      setEcosystemSessionLikely(true);
      broadcastCanonicalAuthChange();
      setStand('ingelogd');
      if (onVoltooid) { onVoltooid(r as Record<string, unknown>); return; }
      location.assign(veiligTerugAdres(r?.returnTo));
    } catch (e) {
      klaar.current = false;
      bewaar(null);
      setLopend(null);
      const p = pauze.vangPauze(e);
      if (p.isPauze) { setFout(''); return; }
      setFout(foutTekst(lang, e));
    }
  };

  // Stand volgen elke 2 s.
  useEffect(() => {
    if (!lopend) return;
    let actief = true; let t = 0; let netwerkFouten = 0;
    const kijk = async () => {
      if (!actief || klaar.current) return;
      try {
        const s = await openbaarPost<{ stand: string; reden?: string; codeNodig: boolean; codeOk: boolean; advies?: string; uitleg?: { uk?: unknown; nl?: unknown } }>('/api/aanmelden/telegram/status', { id: lopend.id, geheim: lopend.geheim });
        netwerkFouten = 0;
        setStand(s.stand); setReden(s.reden || '');
        setAndereWeg(s.advies === 'NIEUW_APPARAAT_ANDERE_WEG' && typeof s.uitleg?.uk === 'string' && typeof s.uitleg?.nl === 'string' ? { uk: s.uitleg.uk.slice(0, 600), nl: s.uitleg.nl.slice(0, 600) } : null);
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

  const start = () => {
    if (pauze.actief) return;
    void doe(async () => {
      setFout(''); setStand(''); setReden(''); setCodeNodig(false); klaar.current = false;
      try {
        const tab = ecosystemTabContext();
        const r = await openbaarPost<Lopend>('/api/aanmelden/telegram/start', {
          service: sessieDienst(),
          tab,
          tabContext: tab,
          sourceOrigin: location.origin,
          returnTo: schoonTerugAdres(),
          intent,
          locale: lang,
          remember,
        });
        pauze.wis();
        bewaar(r); setLopend(r); setStand('wacht');
      } catch (e) {
        const p = pauze.vangPauze(e);
        if (p.isPauze) { setFout(''); return; }
        setFout(foutTekst(lang, e));
      }
    });
  };
  const codeSturen = () => {
    if (pauze.actief) return;
    void doe(async () => {
      if (!lopend) return;
      setFout('');
      try {
        const r = await openbaarPost<{ ok: boolean; uitkomst: string }>('/api/aanmelden/telegram/code', { id: lopend.id, geheim: lopend.geheim, code });
        setCode('');
        if (r.ok) {
          setCodeNodig(false);
          await voltooien(lopend);
          return;
        }
        setFout(r.uitkomst === 'pauze' ? tr(lang, 'Забагато невдалих спроб — код призупинено. Увійдіть іншим способом або спробуйте пізніше.', 'Te veel mislukte pogingen — de code is gepauzeerd. Meld u op een andere manier aan of probeer later.')
          : r.uitkomst === 'uit' ? tr(lang, 'Код вимкнено. Увійдіть через Google і відновіть його з ключем доступу.', 'De code is uitgeschakeld. Meld u aan met Google en herstel hem met uw toegangssleutel.')
            : tr(lang, 'Код не підходить.', 'De code klopt niet.'));
      } catch (e) {
        const p = pauze.vangPauze(e);
        if (p.isPauze) { setFout(''); return; }
        setFout(foutTekst(lang, e));
      }
    });
  };
  const stoppen = () => { klaar.current = false; bewaar(null); setLopend(null); setStand(''); setReden(''); setCodeNodig(false); setFout(''); };

  if (!cfg?.zichtbaar) return null;
  const storing = cfg.status?.stand === 'storing' || cfg.stand === 'storing';
  const lang10 = cfg.status?.soort === 'lang' || cfg.soort === 'lang';
  const mmss = `${Math.floor(rest / 60)}:${String(rest % 60).padStart(2, '0')}`;
  const pauzeTekst = pauze.actief || pauze.zojuistVrij ? pauzeBericht(Math.max(1, pauze.resterend), lang, 'aanmelden') : null;
  const uitgeschakeld = bezig || storing || pauze.actief;

  if (!lopend || ['geweigerd', 'verlopen'].includes(stand)) return <div className='tga-aanmeld'>
    <button
      type='button'
      className='tga-aanmeld-knop'
      data-bezig={bezig ? 'true' : 'false'}
      data-pauze={pauze.actief ? 'true' : 'false'}
      onClick={start}
      disabled={uitgeschakeld}
      aria-disabled={uitgeschakeld}
    >
      <span className='tga-aanmeld-logo' aria-hidden='true'><TelegramLogo maat={22} /></span>
      <span className='tga-aanmeld-tekst'>
        {pauze.actief && pauzeTekst ? pauzeTekst.knop : tr(lang, 'Увійти через Telegram', 'Aanmelden met Telegram')}
      </span>
      <span className='tga-aanmeld-eind' aria-hidden='true'>
        {bezig ? <span className='tga-draai' /> : pauze.actief ? '·' : '→'}
      </span>
    </button>
    {pauzeTekst && <p className={pauze.actief ? 'tga-let' : 'tga-ok'} role='status' aria-live='polite'>
      {pauze.actief ? <><strong>{pauzeTekst.kop}.</strong> {pauzeTekst.uitleg}</> : pauzeTekst.vrij}
    </p>}
    {storing && <p className='tga-klein' role='status'>{lang10 ? tr(lang, 'Telegram не відповідає вже понад 10 хвилин. Увійдіть через Google — ми покажемо, щойно запрацює.', 'Telegram antwoordt al meer dan 10 minuten niet. Meld u aan met Google — we tonen het zodra het weer werkt.')
      : tr(lang, 'Telegram тимчасово не відповідає. Спробуйте за хвилину або увійдіть через Google.', 'Telegram antwoordt tijdelijk niet. Probeer over een minuut of meld u aan met Google.')}</p>}
    {stand === 'geweigerd' && <p className='tga-fout' role='alert'>{
      reden === 'niet-ik' ? tr(lang, 'Вхід відхилено в Telegram («Ні, це не я»), цей пристрій заблоковано для входу через Telegram. Якщо це були ви — увійдіть через Google.', 'Aanmelding geweigerd in Telegram («Nee, dit ben ik niet»); dit apparaat is geblokkeerd voor Telegram. Was u het wel — meld u aan met Google.')
        : reden === 'passkey-nodig' && andereWeg ? tr(lang, andereWeg.uk, andereWeg.nl)
        : reden === 'passkey-nodig' ? tr(lang, 'Telegram підтвердив, але для цього пристрою (або облікового запису) ваші налаштування вимагають ще ключ доступу. Увійдіть через Google і підтвердьте ключем доступу — потім цей пристрій стане відомим.', 'Telegram bevestigde, maar voor dit apparaat (of account) vragen uw instellingen ook een toegangssleutel. Meld u aan met Google en bevestig met uw toegangssleutel — daarna is dit apparaat bekend.')
          : reden === 'niet-gekoppeld' ? tr(lang, 'Цей Telegram не прив’язано до жодного облікового запису. Увійдіть через Google і прив’яжіть його у «Способах входу».', 'Deze Telegram is aan geen enkel account gekoppeld. Meld u aan met Google en koppel hem bij «Aanmeldmethoden».')
            : reden === 'apparaat-geblokkeerd' ? tr(lang, 'Цей пристрій заблоковано для входу через Telegram (раніше на ньому відхилили вхід). Увійдіть через Google.', 'Dit apparaat is geblokkeerd voor aanmelden met Telegram (eerder werd hier een aanmelding geweigerd). Meld u aan met Google.')
            : reden === 'gepauzeerd' ? tr(lang, 'Вхід через цей Telegram призупинено: дані Telegram змінилися. Увійдіть через Google і підтвердьте зміну ключем доступу.', 'Aanmelden met deze Telegram staat op pauze: de Telegram-gegevens zijn gewijzigd. Meld u aan met Google en bevestig de wijziging met uw toegangssleutel.')
              : tr(lang, 'Вхід не вдалося завершити. Скористайтеся іншим способом.', 'De aanmelding kon niet worden afgerond. Gebruik een andere manier.')}</p>}
    {stand === 'verlopen' && <p className='tga-fout' role='alert'>{tr(lang, 'Час на підтвердження (3 хв) вийшов. Почніть знову.', 'De tijd om te bevestigen (3 min) is om. Begin opnieuw.')}</p>}
    {fout && <p className='tga-fout' role='alert'>{fout}</p>}
  </div>;

  return <div className='tga-aanmeld tga-aanmeld-open' aria-live='polite'>
    <h2 className='tga-kop'><TelegramLogo maat={24} /> {tr(lang, 'Вхід через Telegram', 'Aanmelden met Telegram')}</h2>
    {stand === 'ingelogd' ? <p><span className='tga-draai' aria-hidden='true' /> {tr(lang, 'Готово — відкриваємо ваш простір…', 'Klaar — uw ruimte wordt geopend…')}</p> : codeNodig ? <form onSubmit={(e) => { e.preventDefault(); codeSturen(); }} className='tga-blok'>
      <p>{tr(lang, 'Telegram підтвердив. Ваш обліковий запис також вимагає таємний код — введіть його тут (ніколи не в чаті).', 'Telegram heeft bevestigd. Uw account vraagt ook uw geheime code — vul die hier in (nooit in de chat).')}</p>
      <input type='password' autoComplete='off' value={code} onChange={(e) => setCode(e.target.value)} maxLength={64} autoFocus aria-label={tr(lang, 'Таємний код', 'Geheime code')} />
      <button type='submit' className='tga-knop tga-knop-hoofd' disabled={bezig || pauze.actief || code.length < 4}>
        {pauze.actief && pauzeTekst ? pauzeTekst.knop : tr(lang, 'Увійти', 'Aanmelden')}
      </button>
    </form> : <>
      <ol className='tga-stappen'>
        <li>{tr(lang, 'Відкрийте Telegram кнопкою нижче.', 'Open Telegram met de knop hieronder.')}</li>
        <li>{tr(lang, `У чаті з @${lopend.bot} перевірте пристрій і час та натисніть «Це я, увійти».`, `Controleer in de chat met @${lopend.bot} het apparaat en de tijd en tik «Ik ben het, aanmelden».`)}</li>
        {geldigSymbool(lopend.symbool) ? <li>{tr(lang, 'Переконайтеся, що бот показує той самий символ, що й тут (нижче).', 'Controleer dat de bot hetzelfde symbool toont als hier (hieronder).')}</li> : null}
        <li>{tr(lang, 'Поверніться сюди — сторінка відкриється сама.', 'Kom hier terug — de pagina opent vanzelf.')}</li>
      </ol>
      <a className='tga-aanmeld-knop' href={lopend.deeplink} target='_blank' rel='noopener noreferrer'>
        <span className='tga-aanmeld-logo' aria-hidden='true'><TelegramLogo maat={22} /></span>
        <span className='tga-aanmeld-tekst'>{tr(lang, 'Відкрити Telegram', 'Telegram openen')}</span>
        <span className='tga-aanmeld-eind' aria-hidden='true'>↗</span>
      </a>
      {geldigSymbool(lopend.symbool) ? <div className='tga-symbool' role='note' data-tg-symbool={lopend.symbool.id}
        style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '10px 14px', margin: '10px 0', borderRadius: 12, border: '1px solid var(--rand, #c9d6d6)' }}>
        <span aria-hidden='true' style={{ fontSize: 34, lineHeight: 1 }}>{lopend.symbool.emoji}</span>
        <span><strong>{tr(lang, `Символ цього входу: ${lopend.symbool.uk}`, `Symbool van deze aanmelding: ${lopend.symbool.nl}`)}</strong><br />
          <small>{tr(lang, 'Бот у Telegram покаже символ у своєму повідомленні. Натискайте «Це я, увійти», лише якщо він той самий. Інший символ або повідомлення без цього екрана — натисніть у боті «Це не я»: так хтось інший намагається увійти у ваш обліковий запис.', 'De bot in Telegram toont een symbool in zijn bericht. Tik alleen op «Ik ben het, aanmelden» als het hetzelfde is. Een ander symbool of een bericht zonder dit scherm — tik in de bot op «Dit ben ik niet»: dan probeert iemand anders in uw account te komen.')}</small></span>
      </div> : null}
      <a className='tga-link' href={lopend.widgetUrl}>{tr(lang, 'Telegram на іншому пристрої? Увійти через офіційне вікно входу Telegram', 'Telegram op een ander apparaat? Aanmelden via het officiële aanmeldvenster van Telegram')}</a>
      <p className='tga-wacht'><span className='tga-draai' aria-hidden='true' /> {tr(lang, `Чекаємо на підтвердження… залишилось ${mmss}`, `Wachten op bevestiging… nog ${mmss}`)}</p>
      <p className='tga-klein'>{tr(lang, 'Чому так: вхід підтверджується лише у вашому власному Telegram, тож пароль не потрібен, а чужий пристрій ви одразу побачите й заблокуєте.', 'Waarom zo: de aanmelding wordt alleen in uw eigen Telegram bevestigd, dus geen wachtwoord nodig, en een vreemd apparaat ziet en blokkeert u meteen.')}</p>
    </>}
    {pauzeTekst && <p className={pauze.actief ? 'tga-let' : 'tga-ok'} role='status' aria-live='polite'>
      {pauze.actief ? <><strong>{pauzeTekst.kop}.</strong> {pauzeTekst.uitleg}</> : pauzeTekst.vrij}
    </p>}
    {fout && <p className='tga-fout' role='alert'>{fout}</p>}
    <button type='button' className='tga-knop' onClick={stoppen}>{tr(lang, 'Скасувати', 'Annuleren')}</button>
  </div>;
}
