// UI-015: details van één methode in een zijpaneel (≥860 px) of onderblad (telefoon), in plaats van lange formulieren op de pagina.
// Binnenin draaien de BESTAANDE onderdelen ongewijzigd (PasskeysSection, HerstelcodesSectie, SleutelkluisSectie, Toegangscodes)
// en dezelfde API-routes/step-up als de oude weergave (wachtwoord, TOTP). Toegankelijk: role=dialog, aria-modal, focus-val,
// Esc sluit, focus terug naar de kaart. Het venster «Підтвердіть доступ» (z-index 1000) ligt erboven; de focus-val laat het met rust.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, ExternalLink, Monitor, Trash2, X, Plus } from 'lucide-react';
import { tekstVan, type MethodeKaart, type Taal } from '../../shared/aanmeldmethoden-model';
import { MethodeIcoon } from './iconen';
import { staatLabel } from './IdentityMethodCard';
import { PasskeysSection } from '../ToegangssleutelsSectie';
import { HerstelcodesSectie } from '../HerstelcodesSectie';
import { SleutelkluisSectie } from '../SleutelkluisSectie';
import { Toegangscodes } from '../Toegangscodes';
import GeheimInvoer from '../geheim/GeheimInvoer';
import { api } from '../platform/client';
import { bevestigToegang } from '../platform/stap-op';

export type DetailsProps = {
  lang: Taal; busy: boolean; notice: string; context: Record<string, unknown>;
  password: string; setPassword: (v: string) => void; otpauth: string; secret: string; code: string; setCode: (v: string) => void;
  recovery: string[]; lockout: boolean; mustChange: boolean; totpEnrolled: boolean;
  write: (route: string, payload?: Record<string, unknown>) => Promise<void>; load: () => Promise<void>;
  nieuweHerstelcodes: () => Promise<void>; totpUitschakelen: () => Promise<void>; recoverySaved: () => Promise<void>;
  onSessies?: () => void;
};

const FOCUSBAAR = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function IdentityMethodDetails({ k, onClose, p }: { k: MethodeKaart; onClose: () => void; p: DetailsProps }) {
  const { lang } = p;
  const tr = (uk: string, nl: string) => (lang === 'nl' ? nl : uk);
  const paneel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const terug = document.activeElement as HTMLElement | null;
    const eerste = paneel.current?.querySelector<HTMLElement>('.amv2-paneel-sluit');
    eerste?.focus({ preventScroll: true });
    const opToets = (e: KeyboardEvent) => {
      const el = paneel.current; if (!el) return;
      // Alleen als de focus in ONS paneel staat (niet in «Підтвердіть доступ» of een InfoTip-popover erboven).
      if (!el.contains(document.activeElement) && document.activeElement !== document.body) return;
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
      if (e.key !== 'Tab') return;
      const lijst = Array.from(el.querySelectorAll<HTMLElement>(FOCUSBAAR)).filter((x) => x.offsetParent !== null);
      if (!lijst.length) return;
      const a = lijst[0], z = lijst[lijst.length - 1];
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); } else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    };
    document.addEventListener('keydown', opToets);
    const html = document.documentElement; const oud = html.style.overflow; html.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', opToets); html.style.overflow = oud; try { terug?.focus({ preventScroll: true }); } catch { /* weg */ } };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const label = staatLabel(k, lang);
  let inhoud: ReactNode = null;
  if (k.id === 'google') inhoud = <>
    <Feiten lang={lang} rijen={[[tr('Акаунт', 'Account'), k.accountLabel || tr('Google-акаунт', 'Google-account')], [tr('Стан', 'Status'), label]]} />
    {k.beschermd && <p className='amv2-let' data-google-enige>{tr('Google — зараз ваш єдиний спосіб входу, тому його не можна вимкнути. Passkey поки що лише підтверджує важливі дії.', 'Google is nu je enige aanmeldmethode en kan daarom niet worden uitgeschakeld. Een passkey bevestigt voorlopig alleen belangrijke acties.')}</p>}
    <p className='amv2-uitleg'>{tr('Адресу й пароль Google змінюють лише в самому Google.', 'Adres en wachtwoord van Google wijzig je alleen bij Google zelf.')}</p>
    <div className='amv2-knoppen'><a className='amv2-knop hoofd' href='https://myaccount.google.com/security' target='_blank' rel='noopener noreferrer'><ExternalLink aria-hidden='true' />{tr('Керувати в Google', 'Beheren bij Google')}</a>
      {p.onSessies && <button type='button' className='amv2-knop' onClick={() => { onClose(); p.onSessies?.(); }}><Monitor aria-hidden='true' />{tr('Ваші пристрої', 'Je apparaten')}</button>}</div>
  </>;
  else if (k.id === 'password') inhoud = <WachtwoordDetails p={p} />;
  else if (k.id === 'passkey') inhoud = <PasskeysSection lang={lang} context={p.context} onChange={() => void p.load()} />;
  else if (k.id === 'totp') inhoud = <TotpDetails p={p} />;
  else if (k.id === 'recovery') inhoud = <HerstelcodesSectie lang={lang} context={p.context} codes={p.recovery} busy={p.busy} nieuweHerstelcodes={p.nieuweHerstelcodes} recoverySaved={p.recoverySaved} onChange={() => void p.load()} />;
  else if (k.id === 'vault') inhoud = <SleutelkluisSectie lang={lang} context={p.context} />;
  else if (k.id === 'guest-code') inhoud = <Toegangscodes lang={lang} context={p.context} />;
  else inhoud = <AanbiederDetails k={k} p={p} onClose={onClose} />;

  return <div className='amv2-laag' onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div ref={paneel} className='amv2-paneel' role='dialog' aria-modal='true' aria-labelledby='amv2-paneel-titel' data-paneel={k.id}>
      <header className='amv2-paneel-kop'>
        <MethodeIcoon icoon={k.icoon} />
        <div><h3 id='amv2-paneel-titel'>{k.titel[lang]}</h3><small>{k.ondertitel[lang]}</small></div>
        <button type='button' className='amv2-paneel-sluit' onClick={onClose} aria-label={tr('Закрити', 'Sluiten')}><X aria-hidden='true' /></button>
      </header>
      {p.notice && <p className='amv2-melding' role='alert'>{p.notice}</p>}
      <div className='amv2-paneel-inhoud access-plane'>{inhoud}</div>
    </div>
  </div>;
}

function Feiten({ lang, rijen }: { lang: Taal; rijen: Array<[string, string]> }) {
  void lang;
  return <dl className='amv2-feiten'>{rijen.filter((r) => r[1]).map(([a, b]) => <div key={a}><dt>{a}</dt><dd>{b}</dd></div>)}</dl>;
}

function WachtwoordDetails({ p }: { p: DetailsProps }) {
  const tr = (uk: string, nl: string) => (p.lang === 'nl' ? nl : uk);
  return <>
    {p.mustChange && <p className='amv2-let'>{tr('Тимчасовий пароль — потрібно змінити', 'Tijdelijk wachtwoord — wijzigen vereist')}</p>}
    <div className='amv2-formulier'>
      <GeheimInvoer lang={p.lang} value={p.password} onChange={p.setPassword} autoComplete='new-password' placeholder={tr('Новий пароль, мін. 10 символів', 'Nieuw wachtwoord, min. 10 tekens')} minLength={10} max={1024} soort='wachtwoord' />
      <div className='amv2-knoppen'>
        <button type='button' className='amv2-knop hoofd' disabled={p.busy || p.password.length < 10} onClick={() => void p.write('/api/owner/access/password/set', { password: p.password })}><Check aria-hidden='true' />{tr('Зберегти', 'Opslaan')}</button>
        <button type='button' className='amv2-knop gevaar' disabled={p.busy || p.lockout} onClick={() => void p.write('/api/owner/access/password/remove')}><Trash2 aria-hidden='true' />{tr('Прибрати пароль', 'Wachtwoord verwijderen')}</button>
      </div>
      {p.lockout && <small className='amv2-uitleg'>{tr('Прибрати не можна: це останній спосіб входу.', 'Verwijderen kan niet: dit is de laatste aanmeldmethode.')}</small>}
    </div>
  </>;
}

function TotpDetails({ p }: { p: DetailsProps }) {
  const tr = (uk: string, nl: string) => (p.lang === 'nl' ? nl : uk);
  if (p.totpEnrolled) return <>
    <p className='amv2-uitleg'>{tr('Коди з вашого застосунку підтверджують важливі дії. SMS не використовуємо.', 'Codes uit je app bevestigen belangrijke acties. Sms gebruiken we niet.')}</p>
    <div className='amv2-knoppen'><button type='button' className='amv2-knop gevaar' disabled={p.busy} onClick={() => void p.totpUitschakelen()}><Trash2 aria-hidden='true' />{tr('Вимкнути', 'Uitschakelen')}</button></div>
    <small className='amv2-uitleg'>{tr('Для вимкнення потрібен поточний код або код відновлення.', 'Uitschakelen vraagt de huidige code of een herstelcode.')}</small>
  </>;
  if (!p.otpauth) return <>
    <ol className='amv2-stappen'><li>{tr('Відкрийте застосунок-автентифікатор (Google Authenticator, Microsoft Authenticator, 1Password).', 'Open een authenticator-app (Google Authenticator, Microsoft Authenticator, 1Password).')}</li><li>{tr('Додайте ключ, який ми покажемо.', 'Voeg de sleutel toe die we tonen.')}</li><li>{tr('Введіть 6-значний код.', 'Voer de 6-cijferige code in.')}</li></ol>
    <div className='amv2-knoppen'><button type='button' className='amv2-knop hoofd' disabled={p.busy} onClick={() => void p.write('/api/owner/access/totp/start')}><Plus aria-hidden='true' />{tr('Налаштувати', 'Instellen')}</button></div>
  </>;
  return <div className='amv2-formulier access-plane-totp-setup'>
    <strong>{tr('Додайте ключ у застосунок-автентифікатор і введіть код', 'Voeg de sleutel toe in de authenticator-app en voer de code in')}</strong>
    <code className='access-plane-mono access-plane-secret'>{p.secret}</code>
    <small>{tr('Ключ показано один раз.', 'De sleutel wordt eenmalig getoond.')}</small>
    <input className='amv2-code' inputMode='numeric' autoComplete='one-time-code' value={p.code} onChange={(e) => p.setCode(e.target.value.replace(/\D+/g, ''))} placeholder={tr('6-значний код', '6-cijferige code')} aria-label={tr('6-значний код', '6-cijferige code')} maxLength={6} />
    <div className='amv2-knoppen'><button type='button' className='amv2-knop hoofd' disabled={p.busy || p.code.length !== 6} onClick={() => void p.write('/api/owner/access/totp/confirm', { code: p.code })}><Check aria-hidden='true' />{tr('Підтвердити', 'Bevestigen')}</button></div>
  </div>;
}

function AanbiederDetails({ k, p, onClose }: { k: MethodeKaart; p: DetailsProps; onClose: () => void }) {
  const { lang } = p;
  const tr = (uk: string, nl: string) => (lang === 'nl' ? nl : uk);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState('');
  const naam = k.titel[lang];
  const datum = k.gekoppeldOp && !Number.isNaN(Date.parse(k.gekoppeldOp)) ? new Date(k.gekoppeldOp).toLocaleString(lang === 'nl' ? 'nl-BE' : 'uk-UA', { dateStyle: 'medium', timeStyle: 'short' }) : '';
  const losmaken = async () => {
    if (!k.losmaakUrl || bezig) return;
    setBezig(true); setFout('');
    try {
      const ctx = p.context as { service?: string; tabContext?: string };
      const uit = await bevestigToegang({ service: String(ctx.service || 'identity'), tabContext: String(ctx.tabContext || ''), post: (url, body) => api.post(url, body), toegestaan: ['passkey', 'totp', 'herstelcode', 'google'], actie: `aanbieder-losmaken-${k.id.slice(10)}` });
      if (!uit.ok) { setBezig(false); return; }
      await api.post(k.losmaakUrl, { ...p.context, aanbieder: k.id.slice(10) });
      await p.load(); onClose();
    } catch (e) {
      const code = String((e as { message?: string })?.message || '');
      setFout(code === 'LAST_LOGIN_METHOD_PROTECTED' ? tr('Не можна: це останній спосіб входу.', 'Kan niet: dit is de laatste aanmeldmethode.') : tr(`Не вдалося від'єднати (${code || 'помилка'}).`, `Loskoppelen mislukt (${code || 'fout'}).`));
    }
    setBezig(false);
  };
  return <>
    <Feiten lang={lang} rijen={[[tr('Стан', 'Status'), staatLabel(k, lang)], [tr('Акаунт', 'Account'), k.accountLabel || ''], [tr('Підключено', 'Gekoppeld op'), datum]]} />
    {k.staat === 'ready' && k.koppelUrl && <>
      <p className='amv2-uitleg'>{tr(`Вас буде перенаправлено до ${naam}. Після входу там сервер прив'яже цей акаунт і попросить підтвердження.`, `Je gaat naar ${naam}. Na het aanmelden daar koppelt de server dit account en vraagt om bevestiging.`)}</p>
      <div className='amv2-knoppen'><a className='amv2-knop hoofd' href={k.koppelUrl}><Plus aria-hidden='true' />{tr('Підключити', 'Koppelen')}</a></div></>}
    {k.staat === 'not-configured' && <p className='amv2-uitleg'>{tr(`Щоб увімкнути ${naam}, адміністратор має додати ключі провайдера на сервері. До того цей спосіб не працює.`, `Om ${naam} aan te zetten moet de beheerder de sleutels van de aanbieder op de server zetten. Tot dan werkt deze methode niet.`)}</p>}
    {(k.staat === 'unavailable' || k.staat === 'unknown') && <p className='amv2-uitleg'>{tekstVan(k.reden, lang)}</p>}
    {k.staat === 'active' && (k.beschermd
      ? <p className='amv2-let'>{tr("Від'єднати не можна: це останній спосіб входу або так вимагають правила.", 'Loskoppelen kan niet: dit is de laatste aanmeldmethode of het beleid verbiedt het.')}</p>
      : k.losmaakUrl ? <div className='amv2-knoppen'><button type='button' className='amv2-knop gevaar' disabled={bezig} onClick={() => void losmaken()}><Trash2 aria-hidden='true' />{tr("Від'єднати", 'Loskoppelen')}</button></div> : null)}
    {fout && <p className='amv2-melding' role='alert'>{fout}</p>}
  </>;
}
