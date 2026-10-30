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
import { ExternalLink, Loader2, MailCheck, ShieldAlert } from 'lucide-react';
import { Venster } from '../platform/vensters';
import { api } from '../platform/client';
import { geldigMailAdres, mailAanbieder, mailImapFoutTekst } from '../../shared/mail-aanbieders';
import type { VensterStap } from '../../shared/vensters-onthouden-model';
import { googleRolVoor, googleStartFoutTekst, googleStartLichaam, huidigTabblad, mailAccountsAdres, type GoogleRol } from './mail-koppel-model';

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
const codeVan = (gevangen: unknown) => String((gevangen as { message?: string } | null)?.message || '');
type GoogleStand = { accounts: Array<{ email: string; accountRole: string }>; sessionEmail: string; connectEnabled: boolean } | null;

export default function MailKoppelVenster({ lang, id, aanbieder, adres, stap, klein, onStap, onSluit, huidigeDienst }: Props) {
  const dienst = mailAanbieder(aanbieder);
  const [adresIn, setAdresIn] = useState(adres);
  // Opnieuw geopend met een ander adres («Перепідключити» van een IMAP-koppeling): dat adres overnemen.
  useEffect(() => { setAdresIn((v) => (v === adres ? v : adres)); }, [adres]);
  const [wachtwoord, setWachtwoord] = useState('');
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState('');
  const [klaar, setKlaar] = useState<{ mappen: number; smtpGoed: boolean } | null>(null);
  const [opnieuwNodig, setOpnieuwNodig] = useState(stap === 'wachtwoord-opnieuw');
  const [alGekoppeld, setAlGekoppeld] = useState(false);
  const [googleStand, setGoogleStand] = useState<GoogleStand>(null);
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
    void api.post('/api/owner/mail/google-suite/accounts', context())
      .then((r) => { const d = r.data as { accounts?: Array<{ email: string; accountRole: string }>; sessionEmail?: string; connectEnabled?: boolean }; if (leeft) setGoogleStand({ accounts: d.accounts || [], sessionEmail: String(d.sessionEmail || ''), connectEnabled: d.connectEnabled !== false }); })
      .catch(() => { if (leeft) setGoogleStand({ accounts: [], sessionEmail: '', connectEnabled: true }); });
    return () => { leeft = false; };
  }, [aanbieder, opMail]);

  // Minimaliseren wist het geheim. Komt het venster terug, dan vraagt het eerlijk om het wachtwoord opnieuw.
  useEffect(() => {
    if (klein && !wasKlein.current) {
      setWachtwoord('');
      setFout('');
      setOpnieuwNodig(true);
    }
    wasKlein.current = klein;
  }, [klein]);

  if (!dienst) return null;
  const titel = `${tr(lang, 'Підключення', 'Koppelen')}: ${dienst.naam}`;
  const melden = (code: string) => setFout(mailImapFoutTekst(code, lang));

  const googleStarten = async (gevraagd?: GoogleRol) => {
    setBezig(true); setFout(''); setGoogleKlaar('');
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
      setFout(googleStartFoutTekst(codeVan(gevangen), lang));
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
    <label style={{ display: 'grid', gap: 4 }}>
      <span style={{ fontWeight: 600, fontSize: '.9rem' }}>{tr(lang, 'Адреса пошти', 'E-mailadres')}</span>
      <input style={veld} type='email' autoComplete='email' inputMode='email' value={adresIn} data-mail-koppel-adres
        onChange={(e) => { setAdresIn(e.target.value); setAlGekoppeld(false); onStap(stap === 'klaar' ? 'adres' : stap, e.target.value); }} />
    </label>
  );

  const inhoud = () => {
    if (dienst.wijze === 'nog-niet') {
      return (
        <div style={{ display: 'grid', gap: 12 }}>
          <p style={{ margin: 0, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <ShieldAlert aria-hidden='true' style={{ flex: 'none' }} />
            <strong>{tr(lang, 'Цей сервіс ще не підключається — і ось чого бракує:', 'Deze dienst wordt nog niet gekoppeld — en dit ontbreekt er:')}</strong>
          </p>
          <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.5 }}>
            {(dienst.ontbreekt || []).map((rij, i) => <li key={i}>{tr(lang, rij[0], rij[1])}</li>)}
          </ul>
          <p style={{ margin: 0, color: 'var(--muted,#4b5563)', fontSize: '.9rem' }}>
            {tr(lang, 'Кнопки тут немає навмисно: вона б нічого не зробила.', 'Er staat hier bewust geen knop: die zou niets doen.')}
          </p>
        </div>
      );
    }
    if (dienst.wijze === 'oauth-google') {
      if (!opMail) {
        // Het venster reist mee naar hub/cloud (het dok), maar koppelen kan alleen met een mailsessie: dan een eerlijke link, geen knop die 403 geeft.
        return (
          <div style={{ display: 'grid', gap: 12 }}>
            <p style={{ margin: 0 }}>{googleStartFoutTekst('OWNER_MAIL_SESSION_REQUIRED', lang)}</p>
            <a href={mailAccountsAdres(location.origin)} onClick={(e) => { e.preventDefault(); void import('../canoniek-dienst').then((m) => location.assign(m.canonicalServiceUrl('mail', 'accounts', lang))).catch(() => location.assign(mailAccountsAdres(location.origin))); }} style={{ ...knop(true), display: 'inline-flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}>{tr(lang, 'Відкрити «Поштові акаунти»', '«E-mailaccounts» openen')}</a>
          </div>
        );
      }
      const hoofdWerkt = (googleStand?.accounts || []).some((a) => a.accountRole === 'primary');
      const gekoppeld = (googleStand?.accounts || []).map((a) => a.email).filter(Boolean);
      return (
        <div style={{ display: 'grid', gap: 12 }} data-mail-google-rol={googleStand ? (hoofdWerkt ? 'additional' : 'keuze') : 'laden'}>
          <p style={{ margin: 0 }}>{tr(lang,
            'Gmail підключається через Google: ви надаєте доступ у вікні Google, а пароль не вводите тут узагалі.',
            'Gmail wordt via Google gekoppeld: u geeft toestemming in het venster van Google en typt hier geen wachtwoord.')}</p>
          {gekoppeld.length ? (
            <p style={{ margin: 0, fontSize: '.9rem' }}>{tr(lang, 'Уже підключено:', 'Al gekoppeld:')} <strong>{gekoppeld.join(', ')}</strong>. {tr(lang,
              'Google покаже вибір акаунта — оберіть ІНШИЙ акаунт, ніж уже підключені.', 'Google toont een accountkeuze — kies een ANDER account dan de al gekoppelde.')}</p>
          ) : null}
          {!googleStand ? <p style={{ margin: 0 }} role='status'><Loader2 aria-hidden='true' /> {tr(lang, 'Перевіряємо, що вже підключено…', 'We kijken wat er al gekoppeld is…')}</p>
            : hoofdWerkt ? (
              <button type='button' style={knop(true)} disabled={bezig} onClick={() => void googleStarten('additional')} data-mail-koppel-start data-mail-google-start='additional'>
                {bezig ? <Loader2 aria-hidden='true' /> : null} {tr(lang, 'Вибрати інший акаунт Google', 'Ander Google-account kiezen')}
              </button>
            ) : (
              <div style={{ display: 'grid', gap: 8 }}>
                <button type='button' style={knop(true)} disabled={bezig} onClick={() => void googleStarten('primary')} data-mail-koppel-start data-mail-google-start='primary'>
                  {bezig ? <Loader2 aria-hidden='true' /> : null} {googleStand.sessionEmail ? `${tr(lang, 'Підключити основну пошту', 'Hoofdmailbox koppelen')} (${googleStand.sessionEmail})` : tr(lang, 'Перейти до Google', 'Naar Google')}
                </button>
                <button type='button' style={knop(false)} disabled={bezig} onClick={() => void googleStarten('additional')} data-mail-google-start='additional'>
                  {tr(lang, 'Підключити інший акаунт Google', 'Een ander Google-account koppelen')}
                </button>
              </div>
            )}
          {googleKlaar ? <p role='status' style={{ margin: 0 }}>{googleKlaar}</p> : null}
        </div>
      );
    }
    if (dienst.wijze === 'oauth-microsoft') {
      return (
        <div style={{ display: 'grid', gap: 12 }}>
          <p style={{ margin: 0 }}>{tr(lang,
            'Outlook/Microsoft 365 підключається через Microsoft. Введіть адресу — далі вхід відбувається на боці Microsoft.',
            'Outlook/Microsoft 365 koppelt via Microsoft. Vul het adres in — het aanmelden gebeurt daarna bij Microsoft.')}</p>
          {adresRegel}
          <button type='button' style={knop(true)} disabled={bezig} onClick={() => void microsoftStarten()} data-mail-koppel-start>
            {tr(lang, 'Перейти до Microsoft', 'Naar Microsoft')}
          </button>
        </div>
      );
    }
    if (klaar) {
      return (
        <div style={{ display: 'grid', gap: 10 }} ref={klaarRef} tabIndex={-1} role='status'>
          <p style={{ margin: 0, display: 'flex', gap: 8, alignItems: 'center' }}><MailCheck aria-hidden='true' /><strong>{tr(lang, 'Скриньку підключено', 'Mailbox gekoppeld')}</strong></p>
          <p style={{ margin: 0 }}>{tr(lang, 'Сервер справді увійшов у скриньку й побачив папок:', 'De server heeft zich echt aangemeld en zag mappen:')} <strong>{klaar.mappen}</strong></p>
          <p style={{ margin: 0 }}>{klaar.smtpGoed
            ? tr(lang, 'Надсилання (SMTP) також прийняло пароль застосунку.', 'Verzenden (SMTP) accepteerde het app-wachtwoord ook.')
            : tr(lang, 'Надсилання (SMTP) пароль не прийняло — читати пошту можна, надсилати поки ні.', 'Verzenden (SMTP) accepteerde het wachtwoord niet — lezen kan, verzenden nog niet.')}</p>
          <button type='button' style={knop(false)} onClick={onSluit}>{tr(lang, 'Закрити', 'Sluiten')}</button>
        </div>
      );
    }
    return (
      <div style={{ display: 'grid', gap: 12 }}>
        <p style={{ margin: 0 }}>{tr(lang, dienst.hulp?.[0] || '', dienst.hulp?.[1] || '')}</p>
        {dienst.hulpAdres ? (
          <a href={dienst.hulpAdres} target='_blank' rel='noreferrer noopener' style={{ display: 'inline-flex', gap: 6, alignItems: 'center', minHeight: 'var(--tik-hoogte)' /* 21.10: was 16 px hoog — tikvlak 44 px op de telefoon */ }}>
            <ExternalLink aria-hidden='true' /> {tr(lang, 'Де створити пароль застосунку', 'Waar u het app-wachtwoord maakt')}
          </a>
        ) : null}
        {adresRegel}
        <label style={{ display: 'grid', gap: 4 }}>
          <span style={{ fontWeight: 600, fontSize: '.9rem' }} id={`${veldId}-naam`}>{tr(lang, 'Пароль застосунку', 'App-wachtwoord')}</span>
          <GeheimInvoer lang={lang} style={veld} value={wachtwoord} autoComplete='off' ariaLabelledBy={`${veldId}-naam`} ariaDescribedBy={`${veldId}-uitleg`} max={1024} soort='imap' data={{ 'mail-koppel-wachtwoord': '' }}
            onChange={(volgende) => { setWachtwoord(volgende); onStap('wachtwoord', adresIn); }} />
          <small style={{ color: 'var(--muted,#4b5563)' }} id={`${veldId}-uitleg`}>
            {opnieuwNodig
              ? tr(lang, 'Вікно було згорнуте, тому пароль стерто — введіть пароль ще раз.', 'Het venster was geminimaliseerd, dus het wachtwoord is gewist — vul het opnieuw in.')
              : tr(lang, 'Пароль ніколи не зберігається у вікні: він іде одним запитом на сервер і лежить там лише зашифрованим.', 'Het wachtwoord wordt nooit in het venster bewaard: het gaat in één verzoek naar de server en staat daar alleen versleuteld.')}
          </small>
        </label>
        <p style={{ margin: 0, fontSize: '.85rem', color: 'var(--muted,#4b5563)' }}>
          IMAP {dienst.imap?.host}:{dienst.imap?.poort} · SMTP {dienst.smtp?.host}:{dienst.smtp?.poort}
        </p>
        <button type='button' style={knop(true)} disabled={bezig} onClick={() => void imapKoppelen(alGekoppeld)} data-mail-koppel-start>
          {bezig ? tr(lang, 'Перевіряємо на сервері…', 'We controleren het op de server…')
            : alGekoppeld ? tr(lang, 'Оновити пароль застосунку', 'App-wachtwoord vervangen') : tr(lang, 'Підключити', 'Koppelen')}
        </button>
        {alGekoppeld ? <small style={{ color: 'var(--muted,#4b5563)' }}>{tr(lang,
          'Ця скринька вже підключена. Якщо ви створили новий пароль застосунку, сервер спершу перевірить його, а тоді замінить старий.',
          'Deze mailbox is al gekoppeld. Maakte u een nieuw app-wachtwoord, dan controleert de server het eerst en vervangt pas dan het oude.')}</small> : null}
      </div>
    );
  };

  return (
    <Venster id={id} titel={titel} breedte={520} modaal={false} onSluit={onSluit} lang={lang === 'uk' ? 'uk' : 'nl'}>
      <div style={{ padding: 16, display: 'grid', gap: 12 }} data-mail-koppel={dienst.id}>
        {inhoud()}
        {fout ? <p role='alert' style={{ margin: 0, color: 'var(--fout,#b42318)' }}>{fout}</p> : null}
      </div>
    </Venster>
  );
}
