// Het venster waarin een mailbox ECHT gekoppeld wordt. Eén venster per dienst, in de gezamenlijke vensterlaag
// (src/platform/vensters.tsx): dus te verslepen, te vergroten en te MINIMALISEREN naar het dok — en dat minimaliseren
// overleeft hub → mail → cloud en F5 (src/platform/vensters-onthouden.ts).
//
// WAT ER PER DIENST GEBEURT (shared/mail-aanbieders.ts bepaalt het, niet dit bestand):
//   • Gmail/Google Workspace → de BESTAANDE Google-OAuth van de site (POST /api/owner/mail/google-suite/onboarding/start,
//     daarna de omleiding naar Google). Geen tweede, zachtere weg. 21.10.2026 (klacht «додатковий Google-акаунт → помилка»):
//     het venster vraagt EERST de echte stand op (/api/owner/mail/google-suite/accounts). Is de hoofdmailbox al gekoppeld, dan
//     start het een EXTRA account (accountRole 'additional' → Google toont zijn accountkiezer); anders biedt het beide keuzes.
//     tabContext en sourceOrigin gaan altijd mee, en elke servercode krijgt een eigen zin (src/mail/mail-koppel-model.ts).
//   • Outlook/Microsoft 365  → de BESTAANDE Microsoft-tak: het adres vastleggen (accounts/link) en dan
//     accounts/:id/connect/start. Zegt de server dat de beheerder de koppeling nog niet afrondde
//     (MAIL_PROVIDER_GATES_INCOMPLETE), dan staat dát er — niet «probeer later nog eens».
//   • iCloud, Ukr.net, Yahoo, I.ua → IMAP/SMTP met een APP-WACHTWOORD. De server meldt zich echt aan bij de dienst
//     voordat er iets bewaard wordt (backend/mail-imap.ts).
//   • Online.ua en Proton → geen knop. Het venster toont de concrete lijst van wat er ontbreekt.
//
// HET GEHEIM. Het app-wachtwoord staat alleen in de staat van dit venster en gaat in één verzoek naar de server, die het
// versleuteld bewaart. Bij MINIMALISEREN wordt het gewist (`klein` → leeg veld + de eerlijke regel «введіть пароль ще
// раз»): een geminimaliseerd venster mag nooit een wachtwoord in de lucht laten hangen, want zijn beschrijving reist mee
// naar een ander subdomein.
import { useEffect, useId, useRef, useState } from 'react';
import GeheimInvoer from '../geheim/GeheimInvoer';
import { ArrowRight, ChevronLeft, ExternalLink, Loader2, LockKeyhole, MailCheck, ShieldAlert, ShieldCheck, Sparkles } from 'lucide-react';
import Logo from '../merk/MerkLogo';
import { Venster } from '../platform/vensters';
import './mail-koppel-mobiel-sheet.css';
import { api } from '../platform/client';
import { geldigMailAdres, mailAanbieder, mailImapFoutTekst } from '../../shared/mail-aanbieders';
import type { VensterStap } from '../../shared/vensters-onthouden-model';
import { googleRolVoor, googleStartFoutTekst, googleStartLichaam, huidigTabblad, mailAccountsAdres, sleutelkluisAdres, type GoogleRol } from './mail-koppel-model';
import { useIsMaquette } from '../thema/useThema';

type Lang = 'uk' | 'nl';
type Props = {
  lang: Lang;
  /** Venster-id (= de id in de lade), bv. «mail-koppelen:icloud». */
  id: string;
  aanbieder: string;
  adres: string;
  stap: VensterStap;
  klein: boolean;
  /** Stap/adres bewaren (zonder geheim). */
  onStap: (stap: VensterStap, adres: string) => void;
  onSluit: () => void;
  /** De dienst van de pagina waarop het venster NU staat (mail, hub, cloud …). */
  huidigeDienst?: string;
};

const tr = (lang: Lang, uk: string, nl: string) => (lang === 'uk' ? uk : nl);
const knop = (hoofd: boolean): React.CSSProperties => ({
  minHeight: 40, padding: '8px 16px', borderRadius: 10, cursor: 'pointer', fontWeight: 600,
  border: hoofd ? 'none' : '1px solid var(--line,#d7dee8)',
  background: hoofd ? 'var(--accent,#2f6f73)' : 'transparent', color: hoofd ? 'var(--text-on-accent,#fff)' : 'inherit',
});
const veld: React.CSSProperties = { width: '100%', minHeight: 40, padding: '8px 10px', borderRadius: 10, border: '1px solid var(--line,#d7dee8)', background: 'var(--panel,#fff)', color: 'inherit' };
/** De poort van de gescheiden gegevensruimtes kiest de lade met tabContext: zonder dat zou een technisch tabblad persoonlijk koppelen. */
const context = () => ({ service: 'mail', tabContext: huidigTabblad(), sourceOrigin: location.origin });
const codeVan = (gevangen: unknown) => {
  const obj = gevangen as { response?: { data?: { error?: string; reasonCode?: string } }; message?: string } | null;
  return String(obj?.response?.data?.reasonCode || obj?.response?.data?.error || obj?.message || '');
};
type GoogleStand = { accounts: Array<{ email: string; accountRole: string }>; sessionEmail: string; connectEnabled: boolean } | null;

export default function MailKoppelVenster({ lang, id, aanbieder, adres, stap, klein, onStap, onSluit, huidigeDienst }: Props) {
  const isMaquette = useIsMaquette();
  const dienst = mailAanbieder(aanbieder);
  const [adresIn, setAdresIn] = useState(adres);
  // Opnieuw geopend met een ander adres («Перепідключити» van een IMAP-koppeling): dat adres overnemen.
  useEffect(() => { setAdresIn((v) => (v === adres ? v : adres)); }, [adres]);
  const [wachtwoord, setWachtwoord] = useState('');
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState('');
  const [foutCode, setFoutCode] = useState('');
  const [klaar, setKlaar] = useState<{ mappen: number; smtpGoed: boolean } | null>(null);
  const [opnieuwNodig, setOpnieuwNodig] = useState(stap === 'wachtwoord-opnieuw');
  const [alGekoppeld, setAlGekoppeld] = useState(false);
  const [googleStand, setGoogleStand] = useState<GoogleStand>(null);
  const [googleStandFout, setGoogleStandFout] = useState('');
  const [googleStandHerlaad, setGoogleStandHerlaad] = useState(0);
  const [googleKlaar, setGoogleKlaar] = useState('');
  const wasKlein = useRef(klein);
  // Toegankelijkheid 21.10: het wachtwoordveld heet «Пароль застосунку» (de lange uitleg is de BESCHRIJVING, niet de naam), en na
  // «Підключити» verdwijnt die knop: de focus gaat naar het resultaat, zodat de schermlezer «Скриньку підключено …» voorleest.
  const veldId = useId();
  const klaarRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => { if (klaar) klaarRef.current?.focus(); }, [klaar]);
  // Op welke dienst staat deze pagina? (VensterHerstel geeft het mee; het venster zelf reist mee naar hub/cloud via het dok.)
  const opMail = huidigeDienst ? huidigeDienst === 'mail' : typeof location !== 'undefined' && location.hostname.startsWith('mail.');

  // Gmail: eerst de ECHTE stand (welke Google-mailboxen al werken). Daaruit volgt de rol van de volgende koppeling.
  useEffect(() => {
    if (aanbieder !== 'gmail' || !opMail) return;
    let leeft = true;
    setGoogleStandFout('');
    void api.post('/api/owner/mail/google-suite/accounts', context())
      .then((r) => { const d = r.data as { accounts?: Array<{ email: string; accountRole: string }>; sessionEmail?: string; connectEnabled?: boolean }; if (leeft) setGoogleStand({ accounts: d.accounts || [], sessionEmail: String(d.sessionEmail || ''), connectEnabled: d.connectEnabled !== false }); })
      .catch((gevangen) => { if (leeft) { setGoogleStand(null); setGoogleStandFout(googleStartFoutTekst(codeVan(gevangen), lang)); } });
    return () => { leeft = false; };
  }, [aanbieder, opMail, googleStandHerlaad, lang]);

  // Minimaliseren wist het geheim. Komt het venster terug, dan vraagt het eerlijk om het wachtwoord opnieuw.
  useEffect(() => {
    if (klein && !wasKlein.current) {
      setWachtwoord('');
      setFout('');
      setFoutCode('');
      setOpnieuwNodig(true);
    }
    wasKlein.current = klein;
  }, [klein]);

  if (!dienst) return null;
  const titel = `${tr(lang, 'Підключення', 'Koppelen')}: ${dienst.naam}`;
  const melden = (code: string) => { setFoutCode(code); setFout(mailImapFoutTekst(code, lang)); };

  const googleStarten = async (gevraagd?: GoogleRol) => {
    if (!googleStand || googleStand.connectEnabled === false) return;
    setBezig(true); setFout(''); setFoutCode(''); setGoogleKlaar('');
    try {
      const rol = googleRolVoor(googleStand, gevraagd);
      const c = context();
      const r = await api.post('/api/owner/mail/google-suite/onboarding/start', googleStartLichaam({ taal: lang, returnTo: location.href, sourceOrigin: c.sourceOrigin, tabContext: c.tabContext, rol }));
      const d = r.data as { authUrl?: string; alreadyGranted?: boolean };
      // De hoofdmailbox was al gekoppeld (bv. in een ander tabblad): dat is GEEN fout. Zeg het, en bied «інший акаунт» aan.
      if (d.alreadyGranted && !d.authUrl) { setGoogleKlaar(tr(lang, 'Основна скринька Gmail уже підключена. Щоб додати ще один акаунт Google, натисніть «Вибрати інший акаунт Google».', 'De hoofd-Gmail is al gekoppeld. Om nog een Google-account toe te voegen, kies «Ander Google-account kiezen».')); const hoofd: GoogleRol = 'primary'; setGoogleStand((v) => ({ accounts: [...(v?.accounts || []), { email: v?.sessionEmail || '', accountRole: hoofd }], sessionEmail: v?.sessionEmail || '', connectEnabled: true })); setBezig(false); return; }
      const url = String(d.authUrl || '');
      if (!url) throw new Error('GEEN_URL');
      location.assign(url);
    } catch (gevangen) {
      const code = codeVan(gevangen);
      setFoutCode(code);
      setFout(googleStartFoutTekst(code, lang));
      setBezig(false);
    }
  };

  const microsoftStarten = async () => {
    const schoon = geldigMailAdres(adresIn);
    if (!schoon) { melden('MAIL_IMAP_ADRES_ONGELDIG'); return; }
    setBezig(true); setFout('');
    try {
      let accountId = '';
      try {
        const gemaakt = await api.post('/api/owner/mail/accounts/link', { ...context(), provider: 'microsoft', email: schoon });
        accountId = String((gemaakt.data as { account?: { id?: string } })?.account?.id || '');
      } catch (gevangen) {
        // Al bekend: dan gewoon doorgaan met de bestaande rij (ook «Додати ще один Outlook» met een adres dat er al staat).
        if (codeVan(gevangen) !== 'MAIL_ACCOUNT_ALREADY_EXISTS') throw gevangen;
        const lijst = await api.post('/api/owner/mail/accounts/list', context());
        accountId = String(((lijst.data as { accounts?: Array<{ id: string; email: string }> })?.accounts || []).find((a) => a.email?.toLowerCase() === schoon)?.id || '');
      }
      if (!accountId) throw new Error('MAIL_ACCOUNT_NOT_FOUND');
      const start = await api.post(`/api/owner/mail/accounts/${accountId}/connect/start`, { ...context(), locale: lang, returnTo: location.href });
      const data = start.data as { authUrl?: string; ok?: boolean; reasonCode?: string; provider?: { missing?: string[] } };
      if (data.authUrl) { location.assign(String(data.authUrl)); return; }
      setFout(tr(lang, 'Microsoft не повернув адресу для входу.', 'Microsoft gaf geen aanmeldadres terug.'));
    } catch (gevangen) {
      const code = codeVan(gevangen);
      const ontbreekt = ((gevangen as { response?: { data?: { provider?: { missing?: string[] } } } })?.response?.data?.provider?.missing || []).join(', ');
      setFout(code === 'MAIL_PROVIDER_GATES_INCOMPLETE'
        ? `${tr(lang, 'Microsoft 365 ще не ввімкнено на цьому сервері. Бракує:', 'Microsoft 365 is op deze server nog niet aangezet. Ontbreekt:')} ${ontbreekt || '—'}`
        : code === 'MAIL_ADDITIONAL_ACCOUNTS_DISABLED' ? tr(lang, 'Адміністратор вимкнув додаткові поштові акаунти.', 'De beheerder heeft extra mailaccounts uitgezet.')
        : code === 'MAIL_ACCOUNT_LIMIT_REACHED' ? tr(lang, 'Досягнуто межі в 12 поштових акаунтів.', 'De grens van 12 mailaccounts is bereikt.')
        : code === 'OWNER_MAIL_SESSION_REQUIRED' ? googleStartFoutTekst(code, lang)
        : `${tr(lang, 'Підключення Microsoft 365 не розпочато. Код сервера:', 'De Microsoft 365-koppeling is niet gestart. Servercode:')} ${code || 'HTTP'}`);
    } finally { setBezig(false); }
  };

  const imapKoppelen = async (vervang = false) => {
    const schoon = geldigMailAdres(adresIn);
    if (!schoon) { melden('MAIL_IMAP_ADRES_ONGELDIG'); return; }
    if (wachtwoord.replace(/\s+/g, '').length < 6) { melden('MAIL_IMAP_WACHTWOORD_ONTBREEKT'); return; }
    setBezig(true); setFout('');
    try {
      const r = await api.post('/api/owner/mail/imap/koppelen', { ...context(), aanbieder: dienst.id, adres: schoon, wachtwoord, ...(vervang ? { vervang: true } : {}) });
      const data = r.data as { ok?: boolean; fout?: string; koppeling?: { mappen: number; smtpGoed: boolean } };
      if (!data.ok || !data.koppeling) { melden(String(data.fout || 'MAIL_IMAP_ONBEKEND')); return; }
      setWachtwoord(''); // het geheim heeft hier niets meer te zoeken
      setKlaar({ mappen: data.koppeling.mappen, smtpGoed: data.koppeling.smtpGoed });
      setOpnieuwNodig(false); setAlGekoppeld(false);
      onStap('klaar', schoon);
    } catch (gevangen) {
      // De server antwoordt 400 { ok:false, fout } → de ApiError draagt die code niet in message: lees het lichaam.
      const lichaam = (gevangen as { response?: { data?: { fout?: string } } })?.response?.data;
      const code = String(lichaam?.fout || codeVan(gevangen) || 'MAIL_IMAP_ONBEKEND');
      if (code === 'MAIL_IMAP_AL_GEKOPPELD') setAlGekoppeld(true);
      melden(code);
    } finally { setBezig(false); }
  };

  const adresRegel = (
    <label className='mail-koppel-veld-label' style={isMaquette ? undefined : { display: 'grid', gap: 4 }}>
      <span className='mail-koppel-veld-titel' style={isMaquette ? undefined : { fontWeight: 600, fontSize: '.9rem' }}>{tr(lang, 'Адреса пошти', 'E-mailadres')}</span>
      <input className='mail-koppel-veld' style={isMaquette ? undefined : veld} type='email' autoComplete='email' inputMode='email' value={adresIn} data-mail-koppel-adres
        onChange={(e) => { setAdresIn(e.target.value); setAlGekoppeld(false); onStap(stap === 'klaar' ? 'adres' : stap, e.target.value); }} />
    </label>
  );

  const inhoud = () => {
    if (dienst.wijze === 'nog-niet') {
      return (
        <div className='mail-koppel-nog-niet' style={isMaquette ? undefined : { display: 'grid', gap: 12 }}>
          <p className='mail-koppel-nog-niet-kop' style={isMaquette ? undefined : { margin: 0, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <ShieldAlert aria-hidden='true' style={{ flex: 'none' }} />
            <strong>{tr(lang, 'Цей сервіс ще не підключається — і ось чого бракує:', 'Deze dienst wordt nog niet gekoppeld — en dit ontbreekt er:')}</strong>
          </p>
          <ul className='mail-koppel-nog-niet-lijst' style={isMaquette ? undefined : { margin: 0, paddingLeft: 20, lineHeight: 1.5 }}>
            {(dienst.ontbreekt || []).map((rij, i) => <li key={i}>{tr(lang, rij[0], rij[1])}</li>)}
          </ul>
          <p className='mail-koppel-gedempt' style={isMaquette ? undefined : { margin: 0, color: 'var(--muted,#4b5563)', fontSize: '.9rem' }}>
            {tr(lang, 'Кнопки тут немає навмисно: вона б нічого не зробила.', 'Er staat hier bewust geen knop: die zou niets doen.')}
          </p>
        </div>
      );
    }
    if (dienst.wijze === 'oauth-google') {
      if (!opMail) {
        // Het venster reist mee naar hub/cloud (het dok), maar koppelen kan alleen met een mailsessie: dan een eerlijke link, geen knop die 403 geeft.
        return (
          <div className='mail-koppel-elders' style={isMaquette ? undefined : { display: 'grid', gap: 12 }}>
            <p style={{ margin: 0 }}>{googleStartFoutTekst('OWNER_MAIL_SESSION_REQUIRED', lang)}</p>
            <a className='mail-koppel-actie-knop is-hoofd' href={mailAccountsAdres(location.origin)} onClick={(e) => { e.preventDefault(); void import('../canoniek-dienst').then((m) => location.assign(m.canonicalServiceUrl('mail', 'accounts', lang))).catch(() => location.assign(mailAccountsAdres(location.origin))); }} style={isMaquette ? undefined : { ...knop(true), display: 'inline-flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}>{tr(lang, 'Відкрити «Поштові акаунти»', '«E-mailaccounts» openen')}</a>
          </div>
        );
      }
      const hoofdWerkt = (googleStand?.accounts || []).some((a) => a.accountRole === 'primary');
      const gekoppeld = (googleStand?.accounts || []).map((a) => a.email).filter(Boolean);
      return (
        <div className='mail-koppel-google' data-mail-google-rol={googleStand ? (hoofdWerkt ? 'additional' : 'keuze') : 'laden'}>
          <div className='mail-koppel-vertrouwen' role='list' aria-label={tr(lang, 'Як захищено підключення', 'Zo is de verbinding beveiligd')}>
            <div className='mail-koppel-vertrouwen-rij' role='listitem'>
              <ShieldCheck size={26} strokeWidth={1.8} aria-hidden='true' />
              <span><strong>{tr(lang, 'Вхід на стороні Google', 'Aanmelden bij Google')}</strong><small>{tr(lang,
                'Ви надаєте доступ на офіційній сторінці Google.',
                'U geeft toestemming op de officiële Google-pagina.')}</small></span>
            </div>
            <div className='mail-koppel-vertrouwen-rij' role='listitem'>
              <LockKeyhole size={25} strokeWidth={1.8} aria-hidden='true' />
              <span><strong>{tr(lang, 'Ваш пароль залишається у Google', 'Uw wachtwoord blijft bij Google')}</strong><small>{tr(lang,
                'Ми не просимо вводити його й не зберігаємо.',
                'Wij vragen uw wachtwoord niet en bewaren het niet.')}</small></span>
            </div>
          </div>
          {gekoppeld.length ? <p className='mail-koppel-verbonden'>{tr(lang, 'Уже підключено:', 'Al gekoppeld:')} <strong>{gekoppeld.join(', ')}</strong>. {tr(lang,
            'Для нової скриньки виберіть інший Google-акаунт.', 'Kies een ander Google-account voor een nieuwe mailbox.')}</p> : null}
          {googleStandFout ? <div className='mail-koppel-status' role='alert'><p>{googleStandFout}</p><button type='button' className='mail-koppel-andere-account' onClick={() => setGoogleStandHerlaad((v) => v + 1)}>{tr(lang, 'Перевірити ще раз', 'Opnieuw controleren')}</button></div>
            : !googleStand ? <p className='mail-koppel-status' role='status'><Loader2 className='mail-koppel-draait' aria-hidden='true' /> {tr(lang, 'Перевіряємо ваші підключення…', 'Uw verbindingen worden gecontroleerd…')}</p>
            : !googleStand.connectEnabled ? <p className='mail-koppel-status' role='alert'>{tr(lang, 'Сервер поки не дозволяє підключення Google. Зверніться до адміністратора; ця кнопка не запускатиме безрезультатний вхід.', 'De server staat Google-koppeling nog niet toe. Neem contact op met de beheerder; de knop start geen mislukte aanmelding.')}</p>
            : hoofdWerkt ? (
              <button type='button' className='mail-koppel-hoofdactie' disabled={bezig} onClick={() => void googleStarten('additional')} data-mail-koppel-start data-mail-google-start='additional'>
                <span className='mail-koppel-google-embleem' aria-hidden='true'><Logo id='google' naam='Google' logo='google' maat={24} /></span>
                <span>{tr(lang, 'Додати інший Google-акаунт', 'Ander Google-account toevoegen')}</span>
                {bezig ? <Loader2 className='mail-koppel-draait' size={21} aria-hidden='true' /> : <ArrowRight size={22} aria-hidden='true' />}
              </button>
            ) : (
              <div className='mail-koppel-google-acties'>
                <button type='button' className='mail-koppel-hoofdactie' disabled={bezig} onClick={() => void googleStarten('primary')} data-mail-koppel-start data-mail-google-start='primary'>
                  <span className='mail-koppel-google-embleem' aria-hidden='true'><Logo id='google' naam='Google' logo='google' maat={24} /></span>
                  <span>{tr(lang, 'Продовжити з Google', 'Doorgaan met Google')}</span>
                  {bezig ? <Loader2 className='mail-koppel-draait' size={21} aria-hidden='true' /> : <ArrowRight size={22} aria-hidden='true' />}
                </button>
                {googleStand.sessionEmail ? <p className='mail-koppel-email'>{tr(lang, 'Основна скринька:', 'Hoofdmailbox:')} <strong>{googleStand.sessionEmail}</strong></p> : null}
                <button type='button' className='mail-koppel-andere-account' disabled={bezig} onClick={() => void googleStarten('additional')} data-mail-google-start='additional'>
                  {tr(lang, 'Підключити інший Google-акаунт', 'Een ander Google-account koppelen')}
                </button>
              </div>
            )}
          {googleKlaar ? <p role='status' className='mail-koppel-status'>{googleKlaar}</p> : null}
        </div>
      );
    }
    if (dienst.wijze === 'oauth-microsoft') {
      return (
        <div className='mail-koppel-google'>
          <div className='mail-koppel-vertrouwen' role='list'>
            <div className='mail-koppel-vertrouwen-rij' role='listitem'><ShieldCheck size={26} aria-hidden='true' />
              <span><strong>{tr(lang, 'Вхід на стороні Microsoft', 'Aanmelden bij Microsoft')}</strong><small>{tr(lang,
                'Ви авторизуєте доступ на офіційній сторінці Microsoft.',
                'U geeft toestemming op de officiële Microsoft-pagina.')}</small></span></div>
            <div className='mail-koppel-vertrouwen-rij' role='listitem'><LockKeyhole size={25} aria-hidden='true' />
              <span><strong>{tr(lang, 'Пароль не вводиться тут', 'Geen wachtwoord op deze pagina')}</strong><small>{tr(lang,
                'Mijn Ruimte не просить ваш пароль Microsoft.', 'Mijn Ruimte vraagt niet naar uw Microsoft-wachtwoord.')}</small></span></div>
          </div>
          {adresRegel}
          <button type='button' className='mail-koppel-hoofdactie' disabled={bezig} onClick={() => void microsoftStarten()} data-mail-koppel-start>
            <span>{tr(lang, 'Продовжити з Microsoft', 'Doorgaan met Microsoft')}</span>
            {bezig ? <Loader2 className='mail-koppel-draait' aria-hidden='true' /> : <ArrowRight aria-hidden='true' />}
          </button>
        </div>
      );
    }
    if (klaar) {
      return (
        <div className='mail-koppel-klaar' style={isMaquette ? undefined : { display: 'grid', gap: 10 }} ref={klaarRef} tabIndex={-1} role='status'>
          <p className='mail-koppel-klaar-kop' style={isMaquette ? undefined : { margin: 0, display: 'flex', gap: 8, alignItems: 'center' }}><MailCheck aria-hidden='true' /><strong>{tr(lang, 'Скриньку підключено', 'Mailbox gekoppeld')}</strong></p>
          <p style={{ margin: 0 }}>{tr(lang, 'Сервер справді увійшов у скриньку й побачив тек:', 'De server heeft zich echt aangemeld en zag mappen:')} <strong>{klaar.mappen}</strong></p>
          <p style={{ margin: 0 }}>{klaar.smtpGoed
            ? tr(lang, 'Надсилання (SMTP) також прийняло пароль застосунку.', 'Verzenden (SMTP) accepteerde het app-wachtwoord ook.')
            : tr(lang, 'Надсилання (SMTP) пароль не прийняло — читати пошту можна, надсилати поки ні.', 'Verzenden (SMTP) accepteerde het wachtwoord niet — lezen kan, verzenden nog niet.')}</p>
          <button type='button' className='mail-koppel-actie-knop' style={isMaquette ? undefined : knop(false)} onClick={onSluit}>{tr(lang, 'Закрити', 'Sluiten')}</button>
        </div>
      );
    }
    return (
      <div className='mail-koppel-imap-vak' style={isMaquette ? undefined : { display: 'grid', gap: 12 }}>
        <p style={{ margin: 0 }}>{tr(lang, dienst.hulp?.[0] || '', dienst.hulp?.[1] || '')}</p>
        {dienst.hulpAdres ? (
          <a className='mail-koppel-hulp-link' href={dienst.hulpAdres} target='_blank' rel='noreferrer noopener' style={isMaquette ? undefined : { display: 'inline-flex', gap: 6, alignItems: 'center', minHeight: 'var(--tik-hoogte)' /* 21.10: was 16 px hoog — tikvlak 44 px op de telefoon */ }}>
            <ExternalLink aria-hidden='true' /> {tr(lang, 'Де створити пароль застосунку', 'Waar u het app-wachtwoord maakt')}
          </a>
        ) : null}
        {adresRegel}
        <label className='mail-koppel-veld-label' style={isMaquette ? undefined : { display: 'grid', gap: 4 }}>
          <span className='mail-koppel-veld-titel' style={isMaquette ? undefined : { fontWeight: 600, fontSize: '.9rem' }} id={`${veldId}-naam`}>{tr(lang, 'Пароль застосунку', 'App-wachtwoord')}</span>
          <GeheimInvoer lang={lang} style={isMaquette ? undefined : veld} value={wachtwoord} autoComplete='off' ariaLabelledBy={`${veldId}-naam`} ariaDescribedBy={`${veldId}-uitleg`} max={1024} soort='imap' data={{ 'mail-koppel-wachtwoord': '' }}
            onChange={(volgende) => { setWachtwoord(volgende); onStap('wachtwoord', adresIn); }} />
          <small className='mail-koppel-gedempt' style={isMaquette ? undefined : { color: 'var(--muted,#4b5563)' }} id={`${veldId}-uitleg`}>
            {opnieuwNodig
              ? tr(lang, 'Вікно було згорнуте, тому пароль стерто — введіть пароль ще раз.', 'Het venster was geminimaliseerd, dus het wachtwoord is gewist — vul het opnieuw in.')
              : tr(lang, 'Пароль ніколи не зберігається у вікні: він іде одним запитом на сервер і лежить там лише зашифрованим.', 'Het wachtwoord wordt nooit in het venster bewaard: het gaat in één verzoek naar de server en staat daar alleen versleuteld.')}
          </small>
        </label>
        <p className='mail-koppel-server-regel' style={isMaquette ? undefined : { margin: 0, fontSize: '.85rem', color: 'var(--muted,#4b5563)' }}>
          IMAP {dienst.imap?.host}:{dienst.imap?.poort} · SMTP {dienst.smtp?.host}:{dienst.smtp?.poort}
        </p>
        <button type='button' className='mail-koppel-actie-knop is-hoofd' style={isMaquette ? undefined : knop(true)} disabled={bezig} onClick={() => void imapKoppelen(alGekoppeld)} data-mail-koppel-start>
          {bezig ? tr(lang, 'Перевіряємо на сервері…', 'We controleren het op de server…')
            : alGekoppeld ? tr(lang, 'Оновити пароль застосунку', 'App-wachtwoord vervangen') : tr(lang, 'Підключити', 'Koppelen')}
        </button>
        {alGekoppeld ? <small className='mail-koppel-gedempt' style={isMaquette ? undefined : { color: 'var(--muted,#4b5563)' }}>{tr(lang,
          'Ця скринька вже підключена. Якщо ви створили новий пароль застосунку, сервер спершу перевірить його, а тоді замінить старий.',
          'Deze mailbox is al gekoppeld. Maakte u een nieuw app-wachtwoord, dan controleert de server het eerst en vervangt pas dan het oude.')}</small> : null}
      </div>
    );
  };

  return (
    <Venster id={id} titel={titel} breedte={520} className='mail-koppel-mobile-sheet' modaal={false} onSluit={onSluit} lang={lang === 'uk' ? 'uk' : 'nl'}>
      <div className='mail-koppel-ervaring' data-mail-koppel={dienst.id}>
        <header className='mail-koppel-hero'>
          <span className='mail-koppel-merk' aria-hidden='true'><Logo id={dienst.id} naam={dienst.naam} logo={dienst.merk} maat={64} /></span>
          <span className='mail-koppel-kicker'><Sparkles size={13} aria-hidden='true' /> {tr(lang, 'ПОШТА · НОВЕ ПІДКЛЮЧЕННЯ', 'E-MAIL · NIEUWE VERBINDING')}</span>
          <h2>{dienst.wijze === 'nog-niet' ? tr(lang, `${dienst.naam} поки недоступний`, `${dienst.naam} nog niet beschikbaar`) : tr(lang, `Підключити ${dienst.naam}`, `${dienst.naam} koppelen`)}</h2>
          <p>{dienst.wijze === 'oauth-google' ? tr(lang, 'Безпечне підключення через Google', 'Veilig verbinden via Google')
            : dienst.wijze === 'oauth-microsoft' ? tr(lang, 'Безпечне підключення через Microsoft', 'Veilig verbinden via Microsoft')
            : dienst.wijze === 'nog-niet' ? tr(lang, 'Ми чесно показуємо, що ще потрібно реалізувати.', 'Wij laten eerlijk zien wat er nog ontbreekt.')
            : tr(lang, 'Ваша скринька у спільному поштовому просторі', 'Uw mailbox in één e-mailruimte')}</p>
        </header>
        {inhoud()}
        {fout ? (
          <div className='mail-koppel-fout' style={{ display: 'grid', gap: 10 }}>
            <p style={{ margin: 0 }} role='alert'>{fout}</p>
            {foutCode === 'SLEUTELKLUIS_GESLOTEN' ? (
              <a
                className='mail-koppel-actie-knop is-hoofd'
                href={sleutelkluisAdres(location.origin)}
                style={isMaquette ? undefined : { ...knop(true), display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, textDecoration: 'none' }}
              >
                <LockKeyhole size={17} aria-hidden='true' />
                <span>{tr(lang, 'Відкрити сховище ключів', 'Sleutelkluis ontgrendelen')}</span>
              </a>
            ) : null}
          </div>
        ) : null}
        <footer className='mail-koppel-voet'>
          <p><ShieldCheck size={17} strokeWidth={1.7} aria-hidden='true' /> {tr(lang,
            'Підключення пошти не змінює ваш вхід до Mijn Ruimte.',
            'Een e-mailverbinding verandert uw aanmelding bij Mijn Ruimte niet.')}</p>
          <button type='button' className='mail-koppel-terug' onClick={onSluit}><ChevronLeft size={20} aria-hidden='true' />
            {tr(lang, 'Обрати інший сервіс', 'Een andere dienst kiezen')}</button>
        </footer>
      </div>
    </Venster>
  );
}
