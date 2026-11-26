// IDENTITEIT-015 (крок «aanmelden»): кнопки входу БЕЗ Google на сторінці входу — ключ доступу, пароль, Microsoft/Discord/Apple.
// Aanmeldknoppen zonder Google: toegangssleutel, wachtwoord, Microsoft/Discord/Apple.
// Показуються лише способи, які сервер назвав робочими (GET /api/aanmelden/telegram/config → methoden; прапорці aanmelden-*).
// Кожен шлях: start → (браузер / провайдер / форма) → voltooien; сеанс видає той самий механізм, що й для Google.
// Повторне натискання під час роботи нічого не надсилає вдруге; перерваний вхід (закрите вікно ключа) — чесний текст і «Спробувати ще».
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Fingerprint, KeyRound, LogIn, MapPin } from 'lucide-react';
import { cleanRedirectReturnTo } from '../aanmeld-omleiding';
import { broadcastCanonicalAuthChange } from '../canoniek-gebeurtenissen';
import { sessieDienst } from '../canoniek-navigatie';
import { rememberViewAccountEverywhere } from '../domein-weergave-cache';
import { clearCachedAvatar, rememberAvatarUrl, zetWeergaveAccount } from '../gedeelde-voorkeuren';
import GeheimInvoer from '../geheim/GeheimInvoer';
import { api } from '../platform/client';
import { foutCode, kanPasskey } from '../platform/webauthn';
import { kekUitPrf, omslagOpenen, passkeyAanmeldenMetPrf, type PrfAssertieOpties } from '../platform/sleutelkluis-client';
import { ecosystemTabContext, setEcosystemSessionLikely } from '../tab-context';
import { aanmeldWeigering } from '../weigeringen';
import { plaatsVoorStart, plaatsVragen } from './plaats';
import MethodeMerk from '../merk/MethodeMerk';
import './aanmelden-zonder-google.css';

type Lang = 'uk' | 'nl';
const tr = (lang: Lang, uk: string, nl: string) => (lang === 'nl' ? nl : uk);
type Voltooid = { ok?: boolean; sessionCreated?: boolean; reasonCode?: string; returnTo?: string; user?: { id?: string; picture?: string | null } | null;
  /* KLUIS-AANMELDEN: omslagen van de gegevenssleutel voor deze passkey + eenmalig token (alleen dichte ruimtes) */
  kluis?: { token: string; omslagen: Array<{ ruimte: 'prive' | 'technisch'; envelop: string; aad: string }> } };
/**
 * KLUIS-AANMELDEN: dezelfde aanraking die aanmeldt, opent ook de gegevens. De PRF-uitkomst blijft in deze functie: de browser
 * opent de omslag en stuurt alleen de DEK (zoals bij elk ontgrendelen met een passkey). Lukt het niet (oude passkey zonder
 * aanmeldomslag, browser zonder PRF), dan gebeurt er niets bijzonders: de kaart «Ваші дані зараз зашифровані» neemt het over.
 */
async function kluisMeteenOpenen(prf: ArrayBuffer | null, k: Voltooid['kluis']): Promise<void> {
  if (!prf || !k?.token || !Array.isArray(k.omslagen)) return;
  const kek = await kekUitPrf(prf);
  for (const o of k.omslagen) {
    try {
      const dek = await omslagOpenen(kek, o.envelop, o.aad);
      await api.post('/api/aanmelden/kluis', { token: k.token, ruimte: o.ruimte, dek });
    } catch (e) { console.warn('[aanmelden] gegevens niet meteen ontsleuteld:', foutCode(e)); }
  }
}
export type ZonderGoogleId = 'passkey' | 'wachtwoord' | 'microsoft' | 'discord' | 'apple';
export const ZONDER_GOOGLE: readonly ZonderGoogleId[] = ['passkey', 'wachtwoord', 'microsoft', 'discord', 'apple'];

/** Дані запиту «почати вхід»; місце пристрою додається лише якщо браузер уже має дозвіл (TELEGRAM-004, без нового запитання). */
const ctx = async (lang: Lang, remember: boolean) => {
  const tab = ecosystemTabContext();
  return { ...(await plaatsVoorStart()), service: sessieDienst(), tab, tabContext: tab, sourceOrigin: location.origin, returnTo: cleanRedirectReturnTo(), locale: lang, remember, intent: 'login' };
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

let laatsteTerugCode = '';
const plaatsNodig = (e: unknown) => /PLAATS_NODIG/.test(JSON.stringify((e as { response?: unknown; message?: unknown })?.response ?? '') + String((e as { message?: unknown })?.message ?? ''));

/** TELEGRAM-004: обліковий запис вимагає місце пристрою, а браузер його не надав. Кнопка викликає запит дозволу самого браузера;
 *  `daarna` — повторити той самий вхід одразу (ключ доступу, пароль); без нього людина натискає свій спосіб входу ще раз. */
export function PlaatsNodig({ lang, daarna }: { lang: Lang; daarna?: () => void }) {
  const [stand, setStand] = useState<'' | 'bezig' | 'gegeven' | 'geweigerd' | 'mislukt'>('');
  const geef = async () => {
    setStand('bezig');
    const u = await plaatsVragen();
    if (typeof u !== 'object') { setStand(u); return; }
    setStand('gegeven');
    daarna?.();
  };
  return <div className='mr-sign-in-plaats' data-aanmeld-plaats={stand || 'nodig'}>
    {stand !== 'gegeven' && <button type='button' className='mr-sign-in-optie-actie' disabled={stand === 'bezig'} onClick={() => void geef()}
      title={tr(lang, 'Браузер запитає дозвіл на місце цього пристрою. Сайт отримає лише приблизну точку (близько 1 км) для цієї спроби входу. Без дозволу цей спосіб входу для вашого облікового запису не спрацює.', 'De browser vraagt toestemming voor de plaats van dit apparaat. De site krijgt alleen een punt bij benadering (ongeveer 1 km) voor deze aanmeldpoging. Zonder toestemming werkt deze aanmeldmethode voor uw account niet.')}>
      <MapPin aria-hidden='true' />{stand === 'bezig' ? tr(lang, 'Чекаємо на дозвіл браузера…', 'Wachten op de browser…') : daarna ? tr(lang, 'Надати місце й увійти', 'Plaats delen en aanmelden') : tr(lang, 'Надати місце пристрою', 'Plaats van het apparaat delen')}</button>}
    {stand === 'gegeven' && !daarna && <small className='mr-sign-in-hint' role='status'>{tr(lang, 'Місце надано. Тепер увійдіть ще раз тим самим способом.', 'De plaats is gedeeld. Meld u nu opnieuw aan op dezelfde manier.')}</small>}
    {stand === 'geweigerd' && <small className='mr-sign-in-hint' role='alert'>{tr(lang, 'Браузер не дав доступ до місця. Дозвольте його в налаштуваннях сайту (значок біля адреси) і натисніть ще раз — або увійдіть способом, для якого ви не вмикали цю вимогу.', 'De browser gaf geen toegang tot de locatie. Sta die toe in de site-instellingen (pictogram naast het adres) en klik opnieuw — of meld u aan met een methode waarvoor u deze eis niet aanzette.')}</small>}
    {stand === 'mislukt' && <small className='mr-sign-in-hint' role='alert'>{tr(lang, 'Пристрій не зміг визначити місце. Спробуйте ще раз або увійдіть способом, для якого ви не вмикали цю вимогу.', 'Het apparaat kon de plaats niet bepalen. Probeer opnieuw of meld u aan met een methode waarvoor u deze eis niet aanzette.')}</small>}
  </div>;
}
/** Кнопка «Надати місце пристрою» під помилкою, з якою людину повернули на сторінку входу (Google, Microsoft, Discord, Apple). */
export function PlaatsNaTerugFout({ lang }: { lang: Lang }) { return laatsteTerugCode === 'PLAATS_NODIG' ? <PlaatsNodig lang={lang} /> : null; }

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
      const schoon = code.replace(/[^A-Za-z_]/g, '').slice(0, 40);
      laatsteTerugCode = schoon;
      setFout(tekst(lang, alsFout(schoon)));
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
  const [geenPlaats, setGeenPlaats] = useState(false); // TELEGRAM-004: сервер відмовив, бо обліковий запис вимагає місце пристрою
  const opnieuw = useRef<(() => void) | null>(null);
  /* SITE-001 (пункт 17): помилку пов'язано з полями (aria-describedby), після відмови фокус повертається в поле пароля. */
  const foutId = `${useId()}-fout`;
  const wachtwoordId = `${foutId}-wachtwoord`;
  const klas = hoofd ? 'mr-sign-in-main-button mr-sign-in-zonder-google' : 'mr-sign-in-optie';

  const doe = async (werk: () => Promise<void>) => {
    if (loopt.current) return; // повторне натискання під час роботи — нічого
    loopt.current = true; setBezig(true); setFout(''); setGeenPlaats(false);
    try { await werk(); }
    catch (e) {
      setFout(tekst(lang, e)); setGeenPlaats(plaatsNodig(e));
      if (id === 'wachtwoord') window.setTimeout(() => { const v = document.getElementById(wachtwoordId) as HTMLInputElement | null; v?.focus(); v?.select(); }, 0);
    }
    finally { loopt.current = false; setBezig(false); }
  };

  const passkey = () => { opnieuw.current = () => void passkey(); return doe(async () => {
    if (!kanPasskey()) throw alsFout('NotAllowedError');
    const o = (await api.post('/api/aanmelden/passkey/opties', await ctx(lang, remember))).data as { uitdagingId: string; publicKey: PrfAssertieOpties };
    let a;
    try { a = await passkeyAanmeldenMetPrf(o.publicKey); } catch (e) { throw alsFout(foutCode(e) || 'NotAllowedError'); }
    const { prf, prf2: _p2, ...assertie } = a;
    const r = (await api.post('/api/aanmelden/passkey/voltooien', { uitdagingId: o.uitdagingId, assertie })).data as Voltooid;
    if (r?.ok === false || r?.sessionCreated === false) throw alsFout(String(r?.reasonCode || 'AANMELDEN_MISLUKT'));
    await kluisMeteenOpenen(prf, r?.kluis).catch(() => undefined);
    naSessie(r);
  }); };
  const extern = (aanbieder: 'microsoft' | 'discord' | 'apple') => doe(async () => {
    const r = (await api.post('/api/aanmelden/extern/start', { ...(await ctx(lang, remember)), id: aanbieder })).data as { url?: string };
    if (!r?.url) throw alsFout('METHODE_UIT');
    location.assign(r.url);
  });
  const wachtwoordInloggen = (ev?: FormEvent) => { ev?.preventDefault(); opnieuw.current = () => wachtwoordInloggen(); void doe(async () => {
    const s = (await api.post('/api/aanmelden/wachtwoord/start', await ctx(lang, remember))).data as { pogingId: string };
    const r = (await api.post('/api/aanmelden/wachtwoord/voltooien', { pogingId: s.pogingId, email: email.trim(), password: wachtwoord, code: code.trim() })).data as Voltooid;
    if (r?.ok === false || r?.sessionCreated === false) throw alsFout(String(r?.reasonCode || 'AANMELDEN_MISLUKT'));
    setWachtwoord(''); setCode('');
    naSessie(r);
  }); };

  const foutRegel = fout ? <><p id={foutId} className='mr-sign-in-fout' role='alert' data-aanmeld-zonder-google-fout={id}>{fout}</p>{geenPlaats && <PlaatsNodig lang={lang} daarna={() => opnieuw.current?.()} />}</> : null;
  if (id === 'wachtwoord') {
    return <div className='mr-sign-in-wachtwoord' data-aanmeld-zonder-google='wachtwoord'>
      <button type='button' className={klas} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span className={hoofd ? 'mr-sign-in-logo' : 'mr-sign-in-optie-logo'} aria-hidden='true'><KeyRound /></span>
        <span className={hoofd ? 'mr-sign-in-main-tekst' : 'mr-sign-in-optie-tekst'}><strong>{tr(lang, 'Увійти паролем', 'Aanmelden met wachtwoord')}</strong>{!hoofd && <small>{tr(lang, 'Адреса й пароль; якщо налаштовано — ще код із застосунку або код відновлення.', 'Adres en wachtwoord; als ingesteld ook de app-code of een herstelcode.')}</small>}</span>
      </button>
      {open && <form className='mr-sign-in-wachtwoord-form' onSubmit={wachtwoordInloggen} aria-busy={bezig}>
        <label><span>{tr(lang, 'Електронна пошта', 'E-mailadres')}</span>
          <input type='email' autoComplete='username' required aria-invalid={fout ? true : undefined} aria-describedby={fout ? foutId : undefined} value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} autoFocus /></label>
        <label><span>{tr(lang, 'Пароль', 'Wachtwoord')}</span>
          <GeheimInvoer lang={lang} id={wachtwoordId} value={wachtwoord} onChange={setWachtwoord} autoComplete='current-password' required max={1024} soort='wachtwoord' ariaInvalid={!!fout} ariaDescribedBy={fout ? foutId : undefined} /></label>
        <label><span>{tr(lang, 'Код із застосунку або код відновлення (якщо налаштовано)', 'App-code of herstelcode (als ingesteld)')}</span>
          <input inputMode='text' autoComplete='one-time-code' aria-invalid={fout && code ? true : undefined} aria-describedby={fout ? foutId : undefined} value={code} onChange={(e) => setCode(e.target.value.slice(0, 40))} maxLength={40} /></label>
        <small className='mr-sign-in-hint'>{tr(lang, 'Після кількох помилок спроби тимчасово блокуються — це захищає ваш обліковий запис від підбору пароля.', 'Na enkele fouten worden pogingen tijdelijk geblokkeerd — dat beschermt uw account tegen raden.')}</small>
        <button type='submit' className='mr-sign-in-optie-actie' disabled={bezig || !email || !wachtwoord}><LogIn aria-hidden='true' />{bezig ? tr(lang, 'Перевіряємо…', 'Controleren…') : tr(lang, 'Увійти', 'Aanmelden')}</button>
        {foutRegel}
      </form>}
    </div>;
  }
  const k = KNOP[id];
  return <div data-aanmeld-zonder-google={id}>
    <button type='button' className={klas} disabled={bezig} aria-busy={bezig} onClick={() => void (id === 'passkey' ? passkey() : extern(id))}>
      <span className={hoofd ? 'mr-sign-in-logo' : 'mr-sign-in-optie-logo'} aria-hidden='true'>{k.merk ? <MethodeMerk merk={k.merk} naam={k.nl.replace('Aanmelden met ', '')} maat={20} terugval={null} /> : <Fingerprint />}</span>
      <span className={hoofd ? 'mr-sign-in-main-tekst' : 'mr-sign-in-optie-tekst'}><strong>{bezig ? tr(lang, 'Зачекайте…', 'Even geduld…') : tr(lang, k.uk, k.nl)}</strong>{!hoofd && <small>{tr(lang, k.uitleg[0], k.uitleg[1])}</small>}</span>
    </button>
    {foutRegel}
  </div>;
}
