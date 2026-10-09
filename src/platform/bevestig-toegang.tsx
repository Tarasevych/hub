// Venster «Підтвердіть доступ» / «Toegang bevestigen» (zoals GitHub «Confirm access», sudo mode). Wordt lui geladen door
// stap-op.ts. Eén taal tegelijk: de taal van de pagina (<html lang>), live bijgewerkt als de gebruiker de taal omschakelt.
// Toont alleen manieren die deze gebruiker heeft (POST /api/owner/access/stap-op/methoden); fouten in het venster, geen alerts.
import { useEffect, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Fingerprint, KeyRound, LifeBuoy, LogIn, ShieldCheck, X } from 'lucide-react';
import { kanPasskey } from './webauthn';
import { bewaarHervat, paginaTaal, passkeyStapOpCode, type BevestigOpties, type StapOpMethode, type StapOpUitkomst } from './stap-op';
import './bevestig-toegang.css';

type Lang = 'uk' | 'nl';
type Methoden = { passkey: boolean; totp: boolean; herstelcode: boolean; google: boolean };
type Info = { email: string; naam: string; foto: string; methoden: Methoden; maxAgeSeconds: number };
const ALLE: StapOpMethode[] = ['passkey', 'totp', 'herstelcode', 'google'];

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
  googleUitleg: ['Відкриється сторінка входу Google. Після входу ви повернетеся сюди, і дія продовжиться автоматично.', 'De aanmeldpagina van Google opent. Daarna kom je hier terug en gaat de actie automatisch verder.'],
  alleenGoogle: ['У вас ще немає passkey чи застосунку-автентифікатора, тому підтвердьте доступ повторним входом у Google.', 'Je hebt nog geen passkey of authenticator-app. Bevestig daarom je toegang door opnieuw in te loggen bij Google.'],
  problemen: ['Виникли проблеми?', 'Problemen?'],
  altPasskey: ['Використати passkey', 'Passkey gebruiken'],
  altTotp: ['Використати код із застосунку-автентифікатора', 'Code uit de authenticator-app gebruiken'],
  altHerstel: ['Використати код відновлення', 'Herstelcode gebruiken'],
  altGoogle: ['Увійти повторно через Google', 'Opnieuw inloggen bij Google'],
  tip: ['Порада: після підтвердження протягом 5 хвилин важливі дії в цьому вікні не вимагатимуть повторного підтвердження.', 'Tip: na de bevestiging vragen we 5 minuten lang in dit venster niet opnieuw om bevestiging voor belangrijke acties.'],
  annuleren: ['Скасувати', 'Annuleren'],
  sluiten: ['Закрити', 'Sluiten'],
  geenMethode: ['Для цієї дії немає доступного способу підтвердження. Налаштуйте застосунок-автентифікатор або passkey на сторінці «Способи входу».', 'Voor deze actie is geen bevestigingsmethode beschikbaar. Stel een authenticator-app of passkey in op de pagina «Aanmeldmethoden».'],
  doorsturen: ['Перехід до Google…', 'Doorsturen naar Google…'],
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
  NETWORK_ERROR: ['Немає зв’язку із сервером. Спробуйте ще раз.', 'Geen verbinding met de server. Probeer het opnieuw.'],
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
  for (const m of ['passkey', 'totp', 'google', 'herstelcode'] as StapOpMethode[]) if (beschikbaar.includes(m)) return m;
  return null;
}
export function beschikbareMethoden(m: Methoden, toegestaan: StapOpMethode[], webauthn: boolean): StapOpMethode[] {
  return ALLE.filter((x) => toegestaan.includes(x) && m[x] && (x !== 'passkey' || webauthn));
}

function Venster({ opties, klaar }: { opties: BevestigOpties; klaar: (u: StapOpUitkomst) => void }) {
  const lang = useLang();
  const t = (k: keyof typeof T) => T[k][lang === 'nl' ? 1 : 0];
  const [info, setInfo] = useState<Info | null>(null);
  const [weergave, setWeergave] = useState<StapOpMethode | null>(null);
  const [code, setCode] = useState('');
  const [bezig, setBezig] = useState('');
  const [fout, setFout] = useState('');
  const invoer = useRef<HTMLInputElement | null>(null);
  const toegestaan = opties.toegestaan?.length ? opties.toegestaan : ALLE;

  useEffect(() => {
    let weg = false;
    (async () => {
      let i: Info;
      try { i = ((await opties.post('/api/owner/access/stap-op/methoden', { service: opties.service, tabContext: opties.tabContext })) as { data: Info }).data; }
      catch { i = { email: '', naam: '', foto: '', methoden: { passkey: false, totp: false, herstelcode: false, google: true }, maxAgeSeconds: 300 }; }
      if (weg) return;
      setInfo(i);
      setWeergave(primaireMethode(beschikbareMethoden(i.methoden, toegestaan, kanPasskey())));
    })();
    return () => { weg = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !bezig) klaar({ ok: false, reden: 'geannuleerd' }); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [bezig, klaar]);
  useEffect(() => { setCode(''); setFout(''); if (weergave === 'totp' || weergave === 'herstelcode') window.setTimeout(() => invoer.current?.focus(), 30); }, [weergave]);

  const beschikbaar = info ? beschikbareMethoden(info.methoden, toegestaan, kanPasskey()) : [];
  const alleenGoogle = beschikbaar.length === 1 && beschikbaar[0] === 'google';

  const metPasskey = async () => {
    setBezig('passkey'); setFout('');
    const f = await passkeyStapOpCode(opties.service, opties.tabContext, opties.post);
    setBezig('');
    if (!f) klaar({ ok: true, methode: 'passkey' }); else setFout(foutTekst(lang, f));
  };
  const metCode = async (methode: 'totp' | 'herstelcode') => {
    const c = methode === 'totp' ? code.replace(/\D/g, '') : code.replace(/[\s-]/g, '').toUpperCase();
    if (methode === 'totp' ? c.length !== 6 : c.length < 8) return;
    if (opties.codeTerug) { klaar({ ok: true, methode, code: c }); return; }
    setBezig(methode); setFout('');
    try {
      await opties.post('/api/owner/access/stap-op', { service: opties.service, tabContext: opties.tabContext, code: c, ...(methode === 'herstelcode' ? { methode: 'herstelcode' } : {}) });
      klaar({ ok: true, methode });
    } catch (e) { setFout(foutTekst(lang, foutVan(e))); setCode(''); invoer.current?.focus(); }
    finally { setBezig(''); }
  };
  const metGoogle = async () => {
    setBezig('google'); setFout('');
    bewaarHervat(opties.hervat || null);
    try {
      const { startPrimaryRedirectLogin } = await import('../redirect-login');
      await startPrimaryRedirectLogin({ service: opties.service as never, tabContext: opties.tabContext, sourceOrigin: location.origin, locale: lang, intent: 'step-up', remember: false });
      // De pagina navigeert naar Google; het venster blijft «Перехід до Google…» tonen.
    } catch (e) {
      try { sessionStorage.removeItem('mijn-ruimte-bevestig-hervat'); } catch { /* negeren */ }
      setBezig(''); setFout(foutTekst(lang, foutVan(e)));
    }
  };

  const ALT: Record<StapOpMethode, [keyof typeof T, typeof Fingerprint]> = { passkey: ['altPasskey', Fingerprint], totp: ['altTotp', KeyRound], herstelcode: ['altHerstel', LifeBuoy], google: ['altGoogle', LogIn] };
  const alternatieven = beschikbaar.filter((m) => m !== weergave);

  return <div className='bevestig-toegang-achter' role='presentation' onMouseDown={(e) => { if (e.target === e.currentTarget && !bezig) klaar({ ok: false, reden: 'geannuleerd' }); }}>
    <div className='bevestig-toegang' role='dialog' aria-modal='true' aria-labelledby='bevestig-toegang-titel' lang={lang}>
      <button type='button' className='bevestig-toegang-sluit' aria-label={t('sluiten')} disabled={!!bezig} onClick={() => klaar({ ok: false, reden: 'geannuleerd' })}><X /></button>
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
        {info && !weergave && <p className='bevestig-toegang-fout' role='alert'>{t('geenMethode')}</p>}

        {weergave === 'passkey' && <>
          <p className='bevestig-toegang-uitleg'>{t('passkeyUitleg')}</p>
          <button type='button' className='bevestig-toegang-primair' autoFocus disabled={!!bezig} onClick={() => void metPasskey()}><Fingerprint />{bezig === 'passkey' ? t('passkeyBezig') : t('passkeyKnop')}</button>
        </>}

        {(weergave === 'totp' || weergave === 'herstelcode') && <form onSubmit={(e) => { e.preventDefault(); void metCode(weergave); }}>
          <label htmlFor='bevestig-toegang-code'>{weergave === 'totp' ? t('totpLabel') : t('herstelLabel')}</label>
          {weergave === 'totp'
            ? <input id='bevestig-toegang-code' ref={invoer} autoFocus inputMode='numeric' autoComplete='one-time-code' pattern='[0-9 ]*' maxLength={7} placeholder='123456' value={code}
              onChange={(e) => { const v = e.target.value.replace(/[^\d ]/g, ''); setCode(v); if (v.replace(/\D/g, '').length === 6 && !bezig) window.setTimeout(() => (e.target.form as HTMLFormElement | null)?.requestSubmit(), 0); }} />
            : <input id='bevestig-toegang-code' ref={invoer} autoFocus autoComplete='off' autoCapitalize='characters' spellCheck={false} maxLength={20} placeholder='XXXXXXXXXXXX' value={code} onChange={(e) => setCode(e.target.value)} />}
          <p className='bevestig-toegang-uitleg'>{weergave === 'totp' ? t('totpUitleg') : t('herstelUitleg')}</p>
          <button type='submit' className='bevestig-toegang-primair' disabled={!!bezig || (weergave === 'totp' ? code.replace(/\D/g, '').length !== 6 : code.replace(/[\s-]/g, '').length < 8)}><KeyRound />{t('bevestigen')}</button>
        </form>}

        {weergave === 'google' && <>
          {alleenGoogle && <p className='bevestig-toegang-uitleg'>{t('alleenGoogle')}</p>}
          <button type='button' className='bevestig-toegang-primair' autoFocus disabled={!!bezig} onClick={() => void metGoogle()}><LogIn />{bezig === 'google' ? t('doorsturen') : t('googleKnop')}</button>
          <p className='bevestig-toegang-uitleg'>{t('googleUitleg')}</p>
        </>}

        {fout && <p className='bevestig-toegang-fout' role='alert'>{fout}</p>}
      </div>

      {alternatieven.length > 0 && <div className='bevestig-toegang-alt'>
        <h3>{t('problemen')}</h3>
        <ul>{alternatieven.map((m) => { const [k, Icoon] = ALT[m]; return <li key={m}><button type='button' disabled={!!bezig} onClick={() => setWeergave(m)}><Icoon />{t(k)}</button></li>; })}</ul>
      </div>}

      <p className='bevestig-toegang-tip'>{t('tip')}</p>
      <div className='bevestig-toegang-voet'><button type='button' className='bevestig-toegang-annuleer' disabled={!!bezig} onClick={() => klaar({ ok: false, reden: 'geannuleerd' })}>{t('annuleren')}</button></div>
    </div>
  </div>;
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
    r.render(<Venster key={Date.now()} opties={opties} klaar={klaar} />);
  }));
  rij = volgende.catch(() => undefined);
  return volgende;
}

/** Korte melding na terugkeer van Google zonder bekende actie: «Доступ підтверджено — повторіть дію». */
export function toonHervatMelding() {
  const lang = paginaTaal();
  const el = document.createElement('div');
  el.className = 'bevestig-toegang-melding';
  el.setAttribute('role', 'status');
  el.textContent = lang === 'nl' ? 'Toegang bevestigd. Voer de actie nu opnieuw uit (5 minuten geldig).' : 'Доступ підтверджено. Тепер повторіть дію (діє 5 хвилин).';
  document.body.appendChild(el);
  window.setTimeout(() => el.remove(), 8000);
}
