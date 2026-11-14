// IDENTITEIT-015 (крок «aanmelden»): кнопки входу БЕЗ Google на сторінці входу — ключ доступу, пароль, Microsoft/Discord/Apple.
// Aanmeldknoppen zonder Google: toegangssleutel, wachtwoord, Microsoft/Discord/Apple.
// Показуються лише способи, які сервер назвав робочими (GET /api/aanmelden/telegram/config → methoden; прапорці aanmelden-*).
// Кожен шлях: start → (браузер / провайдер / форма) → voltooien; сеанс видає той самий механізм, що й для Google.
// Повторне натискання під час роботи нічого не надсилає вдруге; перерваний вхід (закрите вікно ключа) — чесний текст і «Спробувати ще».
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Fingerprint, KeyRound, LogIn } from 'lucide-react';
import { cleanRedirectReturnTo } from '../aanmeld-omleiding';
import { broadcastCanonicalAuthChange } from '../canoniek-gebeurtenissen';
import { sessieDienst } from '../canoniek-navigatie';
import { rememberViewAccountEverywhere } from '../domein-weergave-cache';
import { clearCachedAvatar, rememberAvatarUrl, zetWeergaveAccount } from '../gedeelde-voorkeuren';
import GeheimInvoer from '../geheim/GeheimInvoer';
import { api } from '../platform/client';
import { foutCode, kanPasskey, passkeyBevestigen, type AssertieOpties } from '../platform/webauthn';
import { ecosystemTabContext, setEcosystemSessionLikely } from '../tab-context';
import { aanmeldWeigering } from '../weigeringen';
import Merk from '../merk/Merk';
import './aanmelden-zonder-google.css';

type Lang = 'uk' | 'nl';
const tr = (lang: Lang, uk: string, nl: string) => (lang === 'nl' ? nl : uk);
type Voltooid = { ok?: boolean; sessionCreated?: boolean; reasonCode?: string; returnTo?: string; user?: { id?: string; picture?: string | null } | null };
export type ZonderGoogleId = 'passkey' | 'wachtwoord' | 'microsoft' | 'discord' | 'apple';
export const ZONDER_GOOGLE: readonly ZonderGoogleId[] = ['passkey', 'wachtwoord', 'microsoft', 'discord', 'apple'];

const ctx = (lang: Lang, remember: boolean) => {
  const tab = ecosystemTabContext();
  return { service: sessieDienst(), tab, tabContext: tab, sourceOrigin: location.origin, returnTo: cleanRedirectReturnTo(), locale: lang, remember, intent: 'login' };
};
/** Лише власні адреси *.tarasevych.com через https — інакше на головну. Alleen eigen adressen. */
const veiligTerug = (waarde: unknown): string => {
  if (typeof waarde !== 'string' || !waarde) return '/';
  try {
    const u = new URL(waarde, location.origin);
    if (u.protocol !== 'https:' || u.username || u.password) return '/';
    const h = u.hostname.toLowerCase();
    if (u.origin === location.origin || h === 'tarasevych.com' || h.endsWith('.tarasevych.com')) return u.toString();
  } catch { /* ongeldig */ }
  return '/';
};
/** Після сеансу — так само, як після входу через Telegram: обліковий запис у кеші вигляду, подія для інших вкладок, перехід. */
function naSessie(r: Voltooid) {
  if (r?.user?.id) {
    zetWeergaveAccount(rememberViewAccountEverywhere(r.user.id));
    if (r.user.picture) rememberAvatarUrl(r.user.picture); else clearCachedAvatar();
  }
  setEcosystemSessionLikely(true);
  broadcastCanonicalAuthChange();
  location.assign(veiligTerug(r?.returnTo));
}
const tekst = (lang: Lang, e: unknown): string => {
  const p = aanmeldWeigering(e);
  return p ? (lang === 'nl' ? p[1] : p[0]) : tr(lang, 'Вхід не вдався. Спробуйте ще раз або іншим способом.', 'Aanmelden is niet gelukt. Probeer opnieuw of op een andere manier.');
};
const alsFout = (code: string) => ({ message: code, response: { data: { error: code } } });

/** Помилка, з якою провайдер повернув людину на сторінку входу (?aanmeld_fout=…); параметр одразу прибирається з адреси. */
export function useTerugFout(lang: Lang): string {
  const [fout, setFout] = useState('');
  useEffect(() => {
    try {
      const u = new URL(location.href);
      const code = u.searchParams.get('aanmeld_fout');
      if (!code) return;
      u.searchParams.delete('aanmeld_fout');
      history.replaceState(history.state, '', u.pathname + u.search + u.hash);
      setFout(tekst(lang, alsFout(code.replace(/[^A-Za-z_]/g, '').slice(0, 40))));
    } catch { /* zonder adresbalk */ }
  }, [lang]);
  return fout;
}

const KNOP: Record<Exclude<ZonderGoogleId, 'wachtwoord'>, { uk: string; nl: string; merk: string; uitleg: [string, string] }> = {
  passkey: { uk: 'Увійти ключем доступу', nl: 'Aanmelden met toegangssleutel', merk: '', uitleg: ['Відбиток, обличчя, PIN або телефон, на якому збережено ключ. Google не потрібен.', 'Vingerafdruk, gezicht, pincode of de telefoon met de sleutel. Google is niet nodig.'] },
  microsoft: { uk: 'Увійти через Microsoft', nl: 'Aanmelden met Microsoft', merk: 'microsoft', uitleg: ['Лише якщо ви раніше прив’язали Microsoft у «Способах входу».', 'Alleen als u Microsoft eerder koppelde bij «Aanmeldmethoden».'] },
  discord: { uk: 'Увійти через Discord', nl: 'Aanmelden met Discord', merk: 'discord', uitleg: ['Лише якщо ви раніше прив’язали Discord у «Способах входу».', 'Alleen als u Discord eerder koppelde bij «Aanmeldmethoden».'] },
  apple: { uk: 'Увійти через Apple', nl: 'Aanmelden met Apple', merk: 'apple', uitleg: ['Лише якщо ви раніше прив’язали Apple у «Способах входу».', 'Alleen als u Apple eerder koppelde bij «Aanmeldmethoden».'] },
};

/** Одна кнопка входу без Google. `soort` — вигляд: «optie» (у списку «Інші способи входу») або головна кнопка. */
export default function AanmeldZonderGoogle({ id, lang, remember = true, hoofd = false }: { id: ZonderGoogleId; lang: Lang; remember?: boolean; hoofd?: boolean }) {
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState('');
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [wachtwoord, setWachtwoord] = useState('');
  const [code, setCode] = useState('');
  const loopt = useRef(false);
  const klas = hoofd ? 'mr-sign-in-main-button mr-sign-in-zonder-google' : 'mr-sign-in-optie';

  const doe = async (werk: () => Promise<void>) => {
    if (loopt.current) return; // повторне натискання під час роботи — нічого
    loopt.current = true; setBezig(true); setFout('');
    try { await werk(); }
    catch (e) { setFout(tekst(lang, e)); }
    finally { loopt.current = false; setBezig(false); }
  };

  const passkey = () => doe(async () => {
    if (!kanPasskey()) throw alsFout('NotAllowedError');
    const o = (await api.post('/api/aanmelden/passkey/opties', ctx(lang, remember))).data as { uitdagingId: string; publicKey: AssertieOpties };
    let assertie;
    try { assertie = await passkeyBevestigen(o.publicKey); } catch (e) { throw alsFout(foutCode(e) || 'NotAllowedError'); }
    const r = (await api.post('/api/aanmelden/passkey/voltooien', { uitdagingId: o.uitdagingId, assertie })).data as Voltooid;
    if (r?.ok === false || r?.sessionCreated === false) throw alsFout(String(r?.reasonCode || 'AANMELDEN_MISLUKT'));
    naSessie(r);
  });
  const extern = (aanbieder: 'microsoft' | 'discord' | 'apple') => doe(async () => {
    const r = (await api.post('/api/aanmelden/extern/start', { ...ctx(lang, remember), id: aanbieder })).data as { url?: string };
    if (!r?.url) throw alsFout('METHODE_UIT');
    location.assign(r.url);
  });
  const wachtwoordInloggen = (ev: FormEvent) => { ev.preventDefault(); void doe(async () => {
    const s = (await api.post('/api/aanmelden/wachtwoord/start', ctx(lang, remember))).data as { pogingId: string };
    const r = (await api.post('/api/aanmelden/wachtwoord/voltooien', { pogingId: s.pogingId, email: email.trim(), password: wachtwoord, code: code.trim() })).data as Voltooid;
    if (r?.ok === false || r?.sessionCreated === false) throw alsFout(String(r?.reasonCode || 'AANMELDEN_MISLUKT'));
    setWachtwoord(''); setCode('');
    naSessie(r);
  }); };

  const foutRegel = fout ? <p className='mr-sign-in-fout' role='alert' data-aanmeld-zonder-google-fout={id}>{fout}</p> : null;
  if (id === 'wachtwoord') {
    return <div className='mr-sign-in-wachtwoord' data-aanmeld-zonder-google='wachtwoord'>
      <button type='button' className={klas} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span className={hoofd ? 'mr-sign-in-logo' : 'mr-sign-in-optie-logo'} aria-hidden='true'><KeyRound /></span>
        <span className={hoofd ? 'mr-sign-in-main-tekst' : 'mr-sign-in-optie-tekst'}><strong>{tr(lang, 'Увійти паролем', 'Aanmelden met wachtwoord')}</strong>{!hoofd && <small>{tr(lang, 'Адреса й пароль; якщо налаштовано — ще код із застосунку або код відновлення.', 'Adres en wachtwoord; als ingesteld ook de app-code of een herstelcode.')}</small>}</span>
      </button>
      {open && <form className='mr-sign-in-wachtwoord-form' onSubmit={wachtwoordInloggen} aria-busy={bezig}>
        <label><span>{tr(lang, 'Електронна пошта', 'E-mailadres')}</span>
          <input type='email' autoComplete='username' required value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} autoFocus /></label>
        <label><span>{tr(lang, 'Пароль', 'Wachtwoord')}</span>
          <GeheimInvoer lang={lang} value={wachtwoord} onChange={setWachtwoord} autoComplete='current-password' required max={1024} soort='wachtwoord' /></label>
        <label><span>{tr(lang, 'Код із застосунку або код відновлення (якщо налаштовано)', 'App-code of herstelcode (als ingesteld)')}</span>
          <input inputMode='text' autoComplete='one-time-code' value={code} onChange={(e) => setCode(e.target.value.slice(0, 40))} maxLength={40} /></label>
        <small className='mr-sign-in-hint'>{tr(lang, 'Після кількох помилок спроби тимчасово блокуються — це захищає ваш обліковий запис від підбору пароля.', 'Na enkele fouten worden pogingen tijdelijk geblokkeerd — dat beschermt uw account tegen raden.')}</small>
        <button type='submit' className='mr-sign-in-optie-actie' disabled={bezig || !email || !wachtwoord}><LogIn aria-hidden='true' />{bezig ? tr(lang, 'Перевіряємо…', 'Controleren…') : tr(lang, 'Увійти', 'Aanmelden')}</button>
        {foutRegel}
      </form>}
    </div>;
  }
  const k = KNOP[id];
  return <div data-aanmeld-zonder-google={id}>
    <button type='button' className={klas} disabled={bezig} aria-busy={bezig} onClick={() => void (id === 'passkey' ? passkey() : extern(id))}>
      <span className={hoofd ? 'mr-sign-in-logo' : 'mr-sign-in-optie-logo'} aria-hidden='true'>{k.merk ? <Merk merk={k.merk} vorm='gliefje' maat={20} terugval={null} /> : <Fingerprint />}</span>
      <span className={hoofd ? 'mr-sign-in-main-tekst' : 'mr-sign-in-optie-tekst'}><strong>{bezig ? tr(lang, 'Зачекайте…', 'Even geduld…') : tr(lang, k.uk, k.nl)}</strong>{!hoofd && <small>{tr(lang, k.uitleg[0], k.uitleg[1])}</small>}</span>
    </button>
    {foutRegel}
  </div>;
}
