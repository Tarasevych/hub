// Venster «Підтвердіть доступ» / «Toegang bevestigen» (zoals GitHub «Confirm access», sudo mode). Wordt lui geladen door
// stap-op.ts. Eén taal tegelijk: de taal van de pagina (<html lang>), live bijgewerkt als de gebruiker de taal omschakelt.
// Toont alleen manieren die deze gebruiker heeft (POST /api/owner/access/stap-op/methoden); fouten in het venster, geen alerts.
import { Component, Suspense, lazy, useEffect, useRef, useState, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Fingerprint, KeyRound, LifeBuoy, LogIn, Send, ShieldCheck, Smartphone } from 'lucide-react';
// APPARAAT-001: tabbladen «Інший пристрій» en «У Telegram» (lui geladen; alleen als de server ze aanbiedt).
const StapOpKanaal = lazy(() => import('../apparaat-bevestiging/StapOpKanaal'));
import { kanPasskey } from './webauthn';
import { bewaarHervat, bewaarOnthoudKeuze, neemTerugMelding, paginaTaal, passkeyStapOpCode, type BevestigOpties, type StapOpMethode, type StapOpUitkomst } from './stap-op';
import { Venster as VensterLaag } from './vensters';
import GeheimInvoer from '../geheim/GeheimInvoer';
import './bevestig-toegang.css';
import { ruimtesV2Nu } from '../tech/ruimtes/ruimtes-vlag';
import { WOORDEN } from '../tech/ruimtes/teksten';
import { aanmeldPauzeBericht, useAftelPauze } from '../aanmeld-pauze';

type Lang = 'uk' | 'nl';
type Methoden = { passkey: boolean; totp: boolean; herstelcode: boolean; google: boolean; codewoord?: boolean; apparaat?: boolean; telegram?: boolean };
type Kanalen = { apparaten: number; reden: string; eis: string[][]; eisTekst: { uk: string; nl: string } } | null;
type Info = { email: string; naam: string; foto: string; methoden: Methoden; maxAgeSeconds: number; onthoudMag: boolean; onthoudUren: number; kanalen?: Kanalen };
const ALLE: StapOpMethode[] = ['passkey', 'totp', 'apparaat', 'telegram', 'herstelcode', 'codewoord', 'google'];

const T = {
  titel: ['Підтвердіть доступ', 'Toegang bevestigen'],
  ingelogd: ['Ви ввійшли як', 'Aangemeld als'],
  laden: ['Завантаження…', 'Laden…'],
  passkeyKnop: ['Використати passkey', 'Passkey gebruiken'],
  passkeyUitleg: ['Підтвердіть відбитком, обличчям, PIN-кодом або телефоном, на якому збережено passkey.', 'Bevestig met vingerafdruk, gezicht, pincode of de telefoon waarop de passkey staat.'],
  passkeyBezig: ['Підтвердіть на пристрої…', 'Bevestig op je apparaat…'],
  totpLabel: ['Код автентифікації', 'Verificatiecode'],
  totpUitleg: ['Відкрийте застосунок-автентифікатор і введіть 6-значний код.', 'Open je authenticator-app en voer de 6-cijferige code in.'],
  herstelLabel: ['Код відновлення', 'Herstelcode'],
  herstelUitleg: ['Кожен код відновлення діє лише один раз. Після використання ми надішлемо вам сповіщення.', 'Elke herstelcode werkt maar één keer. Na gebruik krijg je een melding.'],
  bevestigen: ['Підтвердити', 'Bevestigen'],
  googleKnop: ['Підтвердити повторним входом через Google', 'Bevestigen door opnieuw in te loggen bij Google'],
  codewoordLabel: ['Кодове слово', 'Codewoord'],
  codewoordUitleg: ['Введіть кодове слово цього акаунта.', 'Voer het codewoord van dit account in.'],
  googleUitleg: ['Відкриється сторінка входу Google. Після входу ви повернетеся сюди, і дія продовжиться автоматично.', 'De aanmeldpagina van Google opent. Daarna kom je hier terug en gaat de actie automatisch verder.'],
  alleenGoogle: ['У вас ще немає passkey чи застосунку-автентифікатора, тому підтвердьте доступ повторним входом у Google.', 'Je hebt nog geen passkey of authenticator-app. Bevestig daarom je toegang door opnieuw in te loggen bij Google.'],
  problemen: ['Виникли проблеми?', 'Problemen?'],
  altPasskey: ['Використати passkey', 'Passkey gebruiken'],
  altTotp: ['Використати код із застосунку-автентифікатора', 'Code uit de authenticator-app gebruiken'],
  altHerstel: ['Використати код відновлення', 'Herstelcode gebruiken'],
  altCodewoord: ['Використати кодове слово', 'Codewoord gebruiken'],
  altGoogle: ['Увійти повторно через Google', 'Opnieuw inloggen bij Google'],
  altApparaat: ['Підтвердити з іншого пристрою', 'Bevestigen vanaf een ander apparaat'],
  altTelegram: ['Підтвердити в Telegram', 'Bevestigen in Telegram'],
  tip: ['Порада: після підтвердження протягом 5 хвилин важливі дії в цьому вікні не вимагатимуть повторного підтвердження.', 'Tip: na de bevestiging vragen we 5 minuten lang in dit venster niet opnieuw om bevestiging voor belangrijke acties.'],
  onthoudUitleg: ['Ми запам’ятаємо підтвердження лише для цього браузера й цього акаунта. Воно зникає, коли ви виходите з акаунта, і діє щонайбільше {u} год.', 'We onthouden de bevestiging alleen voor deze browser en dit account. Hij verdwijnt zodra je uitlogt en geldt hoogstens {u} uur.'],
  onthoudNooit: ['Цю дію запам’ятати не можна: вона завжди вимагає підтвердження. Це стосується схвалення випусків, видалення, ключів у сховищі, passkey, кодів відновлення та зміни способів входу.', 'Deze actie kan niet onthouden worden: hiervoor vragen we altijd opnieuw. Dat geldt voor het goedkeuren van uitrollen, verwijderen, sleutels in de kluis, passkeys, herstelcodes en het wijzigen van aanmeldmethoden.'],
  onthoudMislukt: ['Доступ підтверджено на 5 хвилин, але 12-годинне запам’ятовування не збереглося. Для наступної дії доведеться підтвердити доступ знову.', 'Toegang 5 minuten bevestigd, maar 12 uur onthouden is niet opgeslagen. De volgende actie kan opnieuw om bevestiging vragen.'],
  onthoudCodewoord: ['Запам’ятовування на 12 годин недоступне для кодового слова. Використайте passkey або код автентифікатора.', 'Twaalf uur onthouden is niet beschikbaar met het codewoord. Gebruik een passkey of authenticatorcode.'],
  annuleren: ['Скасувати', 'Annuleren'],
  geenMethode: ['Для цієї дії немає доступного способу підтвердження. Налаштуйте застосунок-автентифікатор або passkey на сторінці «Способи входу».', 'Voor deze actie is geen bevestigingsmethode beschikbaar. Stel een authenticator-app of passkey in op de pagina «Aanmeldmethoden».'],
  doorsturen: ['Перехід до Google…', 'Doorsturen naar Google…'],
  sterk: ['Для цієї дії потрібен надійніший спосіб: passkey, код із застосунку-автентифікатора або код відновлення. Повторного входу через Google недостатньо.', 'Voor deze actie is een sterkere manier nodig: passkey, code uit de authenticator-app of een herstelcode. Opnieuw inloggen bij Google is niet genoeg.'],
} as const;
const FOUT: Record<string, readonly [string, string]> = {
  NotAllowedError: ['Підтвердження passkey скасовано або час вийшов. Спробуйте ще раз або виберіть інший спосіб.', 'Passkey-bevestiging geannuleerd of de tijd is verstreken. Probeer opnieuw of kies een andere manier.'],
  SecurityError: ['Браузер не дозволив passkey на цій адресі.', 'De browser staat de passkey op dit adres niet toe.'],
  GEEN_WEBAUTHN: ['Цей браузер не підтримує passkey. Виберіть інший спосіб.', 'Deze browser ondersteunt geen passkeys. Kies een andere manier.'],
  GEEN_PASSKEY: ['У вас немає passkey. Виберіть інший спосіб.', 'Je hebt geen passkey. Kies een andere manier.'],
  PASSKEY_SLEUTEL_ONBEKEND: ['Цей passkey не належить до вашого акаунта. Виберіть інший passkey.', 'Deze passkey hoort niet bij je account. Kies een andere passkey.'],
  PASSKEY_TELLER_TERUG: ['Passkey відхилено (можлива копія ключа).', 'Passkey geweigerd (mogelijk een kopie van de sleutel).'],
  UITDAGING_ONGELDIG: ['Запит застарів. Спробуйте ще раз.', 'Het verzoek is verlopen. Probeer het opnieuw.'],
  ACCESS_TOTP_INVALID: ['Неправильний код. Перевірте час на телефоні й спробуйте ще раз.', 'Onjuiste code. Controleer de tijd op je telefoon en probeer opnieuw.'],
  ACCESS_TOTP_CODE_REQUIRED: ['Неправильний код. Спробуйте ще раз.', 'Onjuiste code. Probeer het opnieuw.'],
  ACCESS_TOTP_REUSED: ['Цей код уже використано. Дочекайтеся наступного коду.', 'Deze code is al gebruikt. Wacht op de volgende code.'],
  ACCESS_RECOVERY_INVALID: ['Код відновлення неправильний або вже використаний.', 'De herstelcode is onjuist of al gebruikt.'],
  ACCESS_LOCKED_TEMPORARILY: ['Забагато спроб. Зачекайте кілька хвилин.', 'Te veel pogingen. Wacht een paar minuten.'],
  RATE_LIMITED: ['Забагато спроб. Зачекайте кілька хвилин.', 'Te veel pogingen. Wacht een paar minuten.'],
  STEP_UP_TOTP_NOT_ENROLLED: ['Застосунок-автентифікатор не налаштовано.', 'De authenticator-app is niet ingesteld.'],
  STEP_UP_RECOVERY_NOT_ENROLLED: ['Кодів відновлення немає.', 'Er zijn geen herstelcodes.'],
  OWNER_IDENTITY_MISMATCH: ['Цей Google-акаунт не збігається з ідентичністю власника. Вхід відхилено.', 'Dit Google-account hoort niet bij de identiteit van de eigenaar. Geweigerd.'],
  STEP_UP_ACCOUNT_MISMATCH: ['Ви вибрали інший акаунт Google. Підтвердьте тим самим акаунтом, з яким ви ввійшли сюди.', 'Je koos een ander Google-account. Bevestig met hetzelfde account waarmee je hier bent aangemeld.'],
  STEP_UP_NOT_FRESH: ['Google не підтвердив новий вхід. Спробуйте ще раз або виберіть інший спосіб.', 'Google bevestigde geen nieuwe aanmelding. Probeer opnieuw of kies een andere manier.'],
  STEP_UP_GOOGLE_NIET_BEVESTIGD: ['Повторний вхід через Google не підтвердив доступ. Спробуйте ще раз або виберіть інший спосіб.', 'Opnieuw inloggen bij Google heeft de toegang niet bevestigd. Probeer opnieuw of kies een andere manier.'],
  GOOGLE_INVALID_GRANT: ['Google-вхід застарів. Спробуйте ще раз.', 'De Google-aanmelding is verlopen. Probeer het opnieuw.'],
  OWNER_OAUTH_EXPIRED: ['Спроба входу через Google застаріла. Спробуйте ще раз.', 'De Google-aanmeldpoging is verlopen. Probeer het opnieuw.'],
  LOGIN_BINDING_MISMATCH: ['Вхід через Google почато в іншій вкладці чи браузері. Спробуйте ще раз тут.', 'De Google-aanmelding is in een ander tabblad of andere browser gestart. Probeer het hier opnieuw.'],
  access_denied: ['Вхід через Google скасовано.', 'Aanmelden bij Google geannuleerd.'],
  NETWORK_ERROR: ['Немає зв’язку із сервером. Спробуйте ще раз.', 'Geen verbinding met de server. Probeer het opnieuw.'],
  STEP_UP_STRONG_REQUIRED: ['Потрібне підтвердження passkey, кодом із застосунку або кодом відновлення.', 'Bevestiging met passkey, app-code of herstelcode is nodig.'],
};
const foutTekst = (lang: Lang, code: string) => {
  const f = FOUT[code];
  if (f) return f[lang === 'nl' ? 1 : 0];
  return lang === 'nl' ? `Bevestigen is mislukt (${code || 'onbekend'}). Probeer het opnieuw.` : `Підтвердження не вдалося (${code || 'невідомо'}). Спробуйте ще раз.`;
};
const foutVan = (c: unknown) => {
  const v = c as { response?: { data?: { error?: unknown; reasonCode?: unknown } }; reasonCode?: unknown; message?: unknown };
  return String(v?.response?.data?.error || v?.response?.data?.reasonCode || v?.reasonCode || v?.message || '');
};

function useLang(): Lang {
  const [lang, setLang] = useState<Lang>(paginaTaal());
  useEffect(() => {
    const o = new MutationObserver(() => setLang(paginaTaal()));
    o.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
    return () => o.disconnect();
  }, []);
  return lang;
}

/** Eerste/primaire manier (GitHub: passkey > app > … ; zonder iets anders: Google). */
export function primaireMethode(beschikbaar: StapOpMethode[]): StapOpMethode | null {
  // Zonder toegangssleutel op dit apparaat: eerst de authenticator-code, dan een ander apparaat, dan Telegram (APPARAAT-001).
  for (const m of ['passkey', 'totp', 'apparaat', 'telegram', 'codewoord', 'google', 'herstelcode'] as StapOpMethode[]) if (beschikbaar.includes(m)) return m;
  return null;
}
export function beschikbareMethoden(m: Methoden, toegestaan: StapOpMethode[], webauthn: boolean): StapOpMethode[] {
  return ALLE.filter((x) => toegestaan.includes(x) && !!m[x] && (x !== 'passkey' || webauthn));
}

function Venster({ opties, klaar }: { opties: BevestigOpties; klaar: (u: StapOpUitkomst) => void }) {
  const lang = useLang();
  const t = (k: keyof typeof T) => T[k][lang === 'nl' ? 1 : 0];
  const [info, setInfo] = useState<Info | null>(null);
  const [weergave, setWeergave] = useState<StapOpMethode | null>(null);
  const [code, setCode] = useState('');
  const [onthoud, setOnthoud] = useState(false);
  const [bezig, setBezig] = useState('');
  // Terug van Google maar nog niet bevestigd: meteen de reden tonen (geen stille lus).
  const [fout, setFout] = useState(() => { const r = neemTerugMelding(); return r ? foutTekst(paginaTaal(), r) : ''; });
  const eersteWeergave = useRef(true);
  const invoer = useRef<HTMLInputElement | null>(null);
  const pauze = useAftelPauze();
  const pauzeTekst = pauze.actief || pauze.zojuistVrij
    ? aanmeldPauzeBericht(Math.max(1, pauze.resterend), lang, 'bevestig', pauze.limiet)
    : null;
  // Sterk (§13.10): Google valt weg zodra de gebruiker iets sterkers heeft (de server weigert het anders toch).
  const basisToegestaan = opties.toegestaan?.length ? opties.toegestaan : ALLE;
  const toegestaan = opties.sterk ? basisToegestaan.filter((m) => m !== 'google') : basisToegestaan;

  useEffect(() => {
    let weg = false;
    (async () => {
      let i: Info;
      try { i = ((await opties.post('/api/owner/access/stap-op/methoden', { service: opties.service, tabContext: opties.tabContext, actie: opties.actie || 'onbekend', sterk: !!opties.sterk })) as { data: Info }).data; }
      catch { i = { email: '', naam: '', foto: '', methoden: { passkey: false, totp: false, herstelcode: false, google: true }, maxAgeSeconds: 300, onthoudMag: false, onthoudUren: 0 }; }
      if (weg) return;
      setInfo(i);
      setWeergave(primaireMethode(beschikbareMethoden(i.methoden, toegestaan, kanPasskey())));
    })();
    return () => { weg = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setCode(''); if (eersteWeergave.current) { if (weergave) eersteWeergave.current = false; } else setFout(''); if (weergave === 'totp' || weergave === 'herstelcode') window.setTimeout(() => invoer.current?.focus(), 30); }, [weergave]);

  const beschikbaar = info ? beschikbareMethoden(info.methoden, toegestaan, kanPasskey()) : [];
  const alleenGoogle = beschikbaar.length === 1 && beschikbaar[0] === 'google';
  // Mag deze actie onthouden worden? De server beslist (NOOIT_ONTHOUDEN in backend/stap-op.ts); «sterk» nooit. Kan het niet,
  // dan is er geen vinkje maar een eerlijke regel waarom — nooit een stil uitgeschakeld vinkje.
  const onthoudMag = !opties.sterk && !!info?.onthoudMag && weergave !== 'codewoord';
  const meldOnthoudMislukt = () => {
    void import('../canoniek-meldingen').then(({ emitCanonicalNotice }) => emitCanonicalNotice({
      text: t('onthoudMislukt'), kind: 'warning', source: 'stap-op', dedupeSeconds: 30,
    })).catch(() => undefined);
  };
  const onthoudAan = onthoud && onthoudMag;

  const metPasskey = async () => {
    if (pauze.actief) return;
    setBezig('passkey'); setFout('');
    const f = await passkeyStapOpCode(opties.service, opties.tabContext, opties.post, opties.actie, onthoudAan);
    setBezig('');
    if (!f || f === 'ONTHOUD_NIET_OPGESLAGEN') {
      pauze.wis();
      klaar({ ok: true, methode: 'passkey' });
      if (f) meldOnthoudMislukt();
    } else if (f === 'RATE_LIMITED') {
      pauze.startPauze(60);
    } else setFout(foutTekst(lang, f));
  };
  const metCode = async (methode: 'totp' | 'herstelcode') => {
    if (pauze.actief) return;
    const c = methode === 'totp' ? code.replace(/\D/g, '') : code.replace(/[\s-]/g, '').toUpperCase();
    if (methode === 'totp' ? c.length !== 6 : c.length < 8) return;
    if (opties.codeTerug) { klaar({ ok: true, methode, code: c }); return; }
    setBezig(methode); setFout('');
    try {
      const antwoord = (await opties.post('/api/owner/access/stap-op', { service: opties.service, tabContext: opties.tabContext, code: c, actie: opties.actie || 'onbekend', ...(onthoudAan ? { onthoud: true } : {}), ...(methode === 'herstelcode' ? { methode: 'herstelcode' } : {}) })) as { data?: { onthouden?: boolean } };
      pauze.wis();
      klaar({ ok: true, methode });
      if (onthoudAan && antwoord?.data?.onthouden !== true) meldOnthoudMislukt();
    } catch (e) {
      const p = pauze.vangPauze(e);
      if (!p.isPauze) setFout(foutTekst(lang, foutVan(e)));
      setCode('');
      invoer.current?.focus();
    }
    finally { setBezig(''); }
  };
  const metGoogle = async () => {
    if (pauze.actief) return;
    setBezig('google'); setFout('');
    bewaarHervat(opties.hervat || null);
    // De keuze «запам'ятати» overleeft de omleiding in sessionStorage; na terugkeer stuurt client.ts hem naar de server.
    // (`remember` van startPrimaryRedirectLogin is iets anders: dat is het onthouden van de AANMELDING, niet van de bevestiging.)
    if (onthoudAan) bewaarOnthoudKeuze({ service: opties.service, tabContext: opties.tabContext, actie: opties.actie });
    try {
      const { startPrimaryRedirectLogin } = await import('../aanmeld-omleiding');
      await startPrimaryRedirectLogin({ service: opties.service as never, tabContext: opties.tabContext, sourceOrigin: location.origin, locale: lang, intent: 'step-up' });
      // De pagina navigeert naar Google; het venster blijft «Перехід до Google…» tonen.
    } catch (e) {
      try { sessionStorage.removeItem('mijn-ruimte-bevestig-hervat'); } catch { /* negeren */ }
      setBezig('');
      const p = pauze.vangPauze(e);
      if (!p.isPauze) setFout(foutTekst(lang, foutVan(e)));
    }
  };

  const metCodewoord = async () => {
    if (pauze.actief) return;
    const w = code.trim();
    if (w.length < 4) return;
    setBezig('codewoord'); setFout('');
    try {
      await opties.post('/api/owner/access/stap-op/codewoord', { service: opties.service, tabContext: opties.tabContext, woord: w, actie: opties.actie || 'onbekend' });
      pauze.wis();
      klaar({ ok: true, methode: 'codewoord' });
    } catch (e) {
      const p = pauze.vangPauze(e);
      if (!p.isPauze) setFout(foutTekst(lang, foutVan(e)));
      setCode('');
    }
    finally { setBezig(''); }
  };

  const ALT: Record<StapOpMethode, [keyof typeof T, typeof Fingerprint]> = { passkey: ['altPasskey', Fingerprint], totp: ['altTotp', KeyRound], herstelcode: ['altHerstel', LifeBuoy], codewoord: ['altCodewoord', KeyRound], google: ['altGoogle', LogIn], apparaat: ['altApparaat', Smartphone], telegram: ['altTelegram', Send] };
  // APPARAAT-001: na een bevestiging via een kanaal is de step-up al door de server vastgelegd (poort); «onthouden» gaat dan apart.
  const kanaalKlaar = (m: 'apparaat' | 'telegram') => {
    klaar({ ok: true, methode: m });
    if (onthoudAan) void opties.post('/api/owner/access/stap-op/onthouden', { service: opties.service, tabContext: opties.tabContext, actie: opties.actie || 'onbekend' })
      .then((a) => { if ((a as { data?: { onthouden?: boolean } })?.data?.onthouden !== true) meldOnthoudMislukt(); }).catch(() => meldOnthoudMislukt());
  };
  const alternatieven = beschikbaar.filter((m) => m !== weergave);
  const onthoudLabel = ruimtesV2Nu() ? WOORDEN.onthoud[lang === 'nl' ? 'nl' : 'uk'].replace('{u}', String(info?.onthoudUren || 12)) : lang === 'nl' ? 'Onthoud deze browser (niet opnieuw vragen tot uitloggen)' : 'Запам’ятати цей браузер (не питати знову до виходу)';

  // Kritiek venster in de gezamenlijke laag: altijd boven elk ander venster (ook boven het venster dat erom vroeg).
  return <VensterLaag id='bevestig-toegang' titel={t('titel')} prioriteit='kritiek' breedte={400} onSluit={() => klaar({ ok: false, reden: 'geannuleerd' })} sluitenUit={!!bezig} labelledBy='bevestig-toegang-titel' lang={lang} className='bevestig-toegang-venster'>
    <div className='bevestig-toegang'>
      <div className='bevestig-toegang-kop'>
        <ShieldCheck className='bevestig-toegang-logo' />
        <h2 id='bevestig-toegang-titel'>{t('titel')}</h2>
        {info?.email && <p className='bevestig-toegang-wie'>
          {t('ingelogd')}
          <span className='bevestig-toegang-account'>
            {info.foto ? <img src={info.foto} alt='' referrerPolicy='no-referrer' /> : <span className='bevestig-toegang-initiaal' aria-hidden='true'>{(info.naam || info.email).slice(0, 1).toUpperCase()}</span>}
            <strong>{info.email}</strong>
          </span>
        </p>}
      </div>

      <div className='bevestig-toegang-kaart'>
        {!info && <p className='bevestig-toegang-uitleg'>{t('laden')}</p>}
        {info && opties.sterk && <p className='bevestig-toegang-uitleg' data-sterk='1'>{t('sterk')}</p>}
        {info && !weergave && <p className='bevestig-toegang-fout' role='alert'>{t('geenMethode')}</p>}

        {weergave === 'passkey' && <>
          <p className='bevestig-toegang-uitleg'>{t('passkeyUitleg')}</p>
          <button type='button' className='bevestig-toegang-primair' autoFocus disabled={!!bezig || pauze.actief} onClick={() => void metPasskey()}><Fingerprint />{bezig === 'passkey' ? t('passkeyBezig') : pauze.actief && pauzeTekst ? pauzeTekst.knop : t('passkeyKnop')}</button>
        </>}

        {(weergave === 'totp' || weergave === 'herstelcode') && <form onSubmit={(e) => { e.preventDefault(); void metCode(weergave); }}>
          <label htmlFor='bevestig-toegang-code'>{weergave === 'totp' ? t('totpLabel') : t('herstelLabel')}</label>
          {weergave === 'totp'
            ? <input id='bevestig-toegang-code' ref={invoer} autoFocus inputMode='numeric' autoComplete='one-time-code' pattern='[0-9 ]*' maxLength={7} placeholder='123456' value={code}
              onChange={(e) => { const v = e.target.value.replace(/[^\d ]/g, ''); setCode(v); if (v.replace(/\D/g, '').length === 6 && !bezig && !pauze.actief) window.setTimeout(() => (e.target.form as HTMLFormElement | null)?.requestSubmit(), 0); }} />
            : <input id='bevestig-toegang-code' ref={invoer} autoFocus autoComplete='off' autoCapitalize='characters' spellCheck={false} maxLength={20} placeholder='XXXX-XXXX-XXXX' value={code} onChange={(e) => setCode(e.target.value)} />}
          <p className='bevestig-toegang-uitleg'>{weergave === 'totp' ? t('totpUitleg') : t('herstelUitleg')}</p>
          <button type='submit' className='bevestig-toegang-primair' disabled={!!bezig || pauze.actief || (weergave === 'totp' ? code.replace(/\D/g, '').length !== 6 : code.replace(/[\s-]/g, '').length < 8)}><KeyRound />{pauze.actief && pauzeTekst ? pauzeTekst.knop : t('bevestigen')}</button>
        </form>}

        {weergave === 'google' && <>
          {alleenGoogle && <p className='bevestig-toegang-uitleg'>{t('alleenGoogle')}</p>}
          <button type='button' className='bevestig-toegang-primair' autoFocus disabled={!!bezig || pauze.actief} onClick={() => void metGoogle()}><LogIn />{bezig === 'google' ? t('doorsturen') : pauze.actief && pauzeTekst ? pauzeTekst.knop : t('googleKnop')}</button>
          <p className='bevestig-toegang-uitleg'>{t('googleUitleg')}</p>
        </>}

        {(weergave === 'apparaat' || weergave === 'telegram') && <Suspense fallback={<p className='bevestig-toegang-uitleg'>{t('laden')}</p>}>
          <StapOpKanaal kanaal={weergave} ctx={{ service: opties.service, tabContext: opties.tabContext }} lang={lang} matrixActie='stap-op' label={opties.actie} naPoort apparaten={info?.kanalen?.apparaten} onKlaar={kanaalKlaar} />
        </Suspense>}

        {weergave === 'codewoord' && <form onSubmit={(e) => { e.preventDefault(); void metCodewoord(); }}>
          <label htmlFor='bevestig-toegang-codewoord'>{t('codewoordLabel')}</label>
          <GeheimInvoer lang={lang} id='bevestig-toegang-codewoord' value={code} onChange={setCode} autoFocus />
          <p className='bevestig-toegang-uitleg'>{t('codewoordUitleg')}</p>
          <button type='submit' className='bevestig-toegang-primair' disabled={!!bezig || pauze.actief || code.trim().length < 4}><KeyRound />{pauze.actief && pauzeTekst ? pauzeTekst.knop : t('bevestigen')}</button>
        </form>}

        {pauzeTekst && <p className={pauze.actief ? 'bevestig-toegang-fout' : 'bevestig-toegang-uitleg'} role='status' aria-live='polite'>{pauze.actief ? `${pauzeTekst.kop}. ${pauzeTekst.uitleg}` : pauzeTekst.vrij}</p>}
        {fout && !pauze.actief && <p className='bevestig-toegang-fout' role='alert'>{fout}</p>}

        {info && weergave && (onthoudMag
          ? <><label className='bevestig-toegang-onthoud' data-onthoud='kan'>
              <input type='checkbox' checked={onthoud} disabled={!!bezig} onChange={(e) => setOnthoud(e.target.checked)} />
              <span>{onthoudLabel}</span>
            </label>
            <p className='bevestig-toegang-uitleg' data-onthoud-uitleg='1'>{t('onthoudUitleg').replace('{u}', String(info.onthoudUren || 12))}</p></>
          : <p className='bevestig-toegang-uitleg' data-onthoud='nooit'>{weergave === 'codewoord' && info.onthoudMag ? t('onthoudCodewoord') : t('onthoudNooit')}</p>)}
      </div>

      {alternatieven.length > 0 && <div className='bevestig-toegang-alt'>
        <h3>{t('problemen')}</h3>
        <ul>{alternatieven.map((m) => { const [k, Icoon] = ALT[m]; return <li key={m}><button type='button' disabled={!!bezig} onClick={() => setWeergave(m)}><Icoon />{t(k)}</button></li>; })}</ul>
      </div>}

      <p className='bevestig-toegang-tip'>{t('tip')}</p>
      <div className='bevestig-toegang-voet'><button type='button' className='bevestig-toegang-annuleer' disabled={!!bezig} onClick={() => klaar({ ok: false, reden: 'geannuleerd' })}>{t('annuleren')}</button></div>
    </div>
  </VensterLaag>;
}

/** Renderfout in het venster: nooit een onzichtbaar, hangend verzoek — de aanroeper krijgt een fout die de pagina toont. */
class Grens extends Component<{ klaar: (u: StapOpUitkomst) => void; children: ReactNode }, { fout: boolean }> {
  state = { fout: false };
  static getDerivedStateFromError() { return { fout: true }; }
  componentDidCatch(err: unknown) { console.error('[stap-op] venster «Підтвердіть доступ»: renderfout', err); this.props.klaar({ ok: false, reden: 'VENSTER_FOUT' }); }
  render() { return this.state.fout ? null : this.props.children; }
}

// ------------------------------------------------------------------------------------------------ imperatief openen
let wortel: Root | null = null;
let rij: Promise<unknown> = Promise.resolve();
function wortelVan(): Root {
  if (wortel) return wortel;
  const el = document.createElement('div');
  el.id = 'bevestig-toegang-wortel';
  document.body.appendChild(el);
  wortel = createRoot(el);
  return wortel;
}
/** Eén venster tegelijk; volgende aanvragen wachten. Focus keert terug naar het element dat de actie startte. */
export function toonBevestigVenster(opties: BevestigOpties): Promise<StapOpUitkomst> {
  const volgende = rij.then(() => new Promise<StapOpUitkomst>((resolve) => {
    const terug = document.activeElement as HTMLElement | null;
    const r = wortelVan();
    let klaarGezet = false;
    const klaar = (u: StapOpUitkomst) => { if (klaarGezet) return; klaarGezet = true; r.render(null); document.body.classList.remove('bevestig-toegang-open'); try { terug?.focus?.(); } catch { /* negeren */ } resolve(u); };
    document.body.classList.add('bevestig-toegang-open');
    r.render(<Grens key={Date.now()} klaar={klaar}><Venster opties={opties} klaar={klaar} /></Grens>);
  }));
  rij = volgende.catch(() => undefined);
  return volgende;
}

/** Korte melding na terugkeer van Google zonder bekende actie: «Доступ підтверджено — повторіть дію». */
export function toonHervatMelding(fout = '') {
  const lang = paginaTaal();
  const el = document.createElement('div');
  el.className = 'bevestig-toegang-melding';
  el.setAttribute('role', 'status');
  if (fout) el.dataset.fout = '1';
  el.textContent = fout ? foutTekst(lang, fout) : lang === 'nl' ? 'Toegang bevestigd. Voer de actie nu opnieuw uit (5 minuten geldig).' : 'Доступ підтверджено. Тепер повторіть дію (діє 5 хвилин).';
  document.body.appendChild(el);
  window.setTimeout(() => el.remove(), 8000);
}
