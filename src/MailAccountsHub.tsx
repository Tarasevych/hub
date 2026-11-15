// De pagina «Підключіть свої поштові акаунти».
//
// WAT HIER FOUT WAS (opdracht van de eigenaar, 20.10.2026). Acht tegels met een LETTER in een gekleurd vierkant in plaats
// van een logo, en achter elke tegel dezelfde knop — ook achter de zes diensten waar niets gebeurde («Цей поштовий сервіс
// поки не підключається тут»). Daarbij stond onderaan alleen «Підключені акаунти 0», zonder één woord over wat een
// koppeling oplevert.
//
// EN OP 21.10.2026 (telefoon van de eigenaar, mail → Акаунти):
//   • «Підключені акаунти» toonde eigenaar@example.test zonder één handeling — geen «Відключити», geen stand, geen
//     «Перепідключити». Nu heeft ELKE koppeling (Gmail, Outlook/Microsoft 365, IMAP) haar stand (працює / потрібен повторний
//     вхід / помилка / доступ ще не надано), «Перепідключити» en «Відключити» met een bevestiging waarin de mens kiest of de
//     lokale gegevens blijven of weg gaan, en per dienst «Додати ще один <dienst>». Het hoofdaccount staat gemarkeerd, en de
//     bevestiging zegt eerlijk wat loskoppelen wel en niet raakt (de aanmelding op de site NIET — die staat los van de mail).
//   • de aparte sectie «Microsoft — Додаткові акаунти Microsoft» (select + e-mailveld + «Додати акаунт») onder de tegels was
//     een dubbel van de tegel Outlook. Weg: de tegel Outlook (en «Додати ще один Outlook») opent het venster waarin het adres
//     wordt ingevuld en daarna OAuth volgt. De Microsoft-accounts zelf staan nu gewoon in «Підключені акаунти».
//   • op de telefoon stonden de tegels in twee smalle kolommen en rekten de lange uitleggen van Online.ua en Proton het raster
//     op. Nu: ≤ 480 px één kolom met compacte tegels, en de uitleg zit ingeklapt onder «Чому недоступно?».
//
// WAT HET VERDER IS:
//   • de diensten komen uit shared/mail-aanbieders.ts — met per dienst de ECHTE weg of eerlijk `nog-niet` (geen knop);
//   • elk logo komt uit het ENE merkregister (src/merk/merk-register.ts). Merken zonder vorm met echte herkomst krijgen de
//     neutrale plaat (geen nagetekend logo); de beheerder kan het officiële bestand zelf neerleggen (deploy/LEESMIJ.md);
//   • klikken opent een VENSTER uit de gezamenlijke laag (src/platform/VensterHerstel.tsx → MailKoppelVenster).
import { useCallback, useEffect, useRef, useState } from 'react';
import { focusVerloren } from './platform/toegankelijk';
import { ShieldCheck } from 'lucide-react';
import Logo from './merk/MerkLogo';
import MailOrbitIntro from './mail/MailOrbitIntro';
import { api } from './platform/client';
import { mailKoppelenOpenen } from './platform/VensterHerstel';
import { mailAanbieder, mailAanbiederHeeftKnop, mailImapFoutTekst, type MailAanbieder, type MailImapKoppelingPubliek } from '../shared/mail-aanbieders';
import { isMailMeldingNiveau, type MailMeldingNiveau } from '../shared/mail-melding-niveau';
import MailMeldingBel from './mail/MailMeldingBel';
// Raster, tegels, uitlegkolom, accountbeheer en meldingsvenster van deze pagina (mobiel 21.10.2026). De import ontbrak sinds de
// momentopname van 30.10: het bestand werd nergens geladen (oude fout, 05.11.2026; mobiel-geometrie-20261021 check 1).
import './mail-accounts-hub.css';
import {
  WIS_BEVESTIGING, googleStand, huidigTabblad, googleStartFoutTekst, googleStartLichaam, imapStand, microsoftStand, ontkoppelUitleg, standTekst,
  type KoppelStand,
} from './mail/mail-koppel-model';
// Raster en tegels in CSS (mobiel 21.10.2026): de inline `gridTemplateColumns:'minmax(0,1fr) 320px'` gaf op 390 px een
// hoofdkolom van 0 px (390 − 2×24 padding − 24 gap < 320): de begroeting stond letter voor letter onder elkaar en de rechter
// kolom («Вікна, які не губляться») lag over de tegels heen — Playwright: «<div>…</div> intercepts pointer events».
import { laatsteRegel, zojuist, type LaatsteBrief } from './mail/laatste-brief';
import { useIsMaquette } from './thema/useThema';

type Lang = 'uk' | 'nl';
type GoogleRij = { id: string; email: string; accountRole?: string; status: string; displayName?: string };
type MicrosoftRij = { id: string; email: string; provider: string; status: string; primary?: boolean };
type Props = {
  lang: Lang;
  userName?: string;
  /** Google-mailboxen uit de bootstrap (eerste beeld); daarna haalt de pagina zelf de echte stand op. */
  accounts?: Array<{ id: string; email: string; provider: string; status: string; lastSync?: string; accountRole?: string }>;
  /** Blijft bestaan voor de oude aanroep (MailFunctionalView): de pagina opent het venster zelf als er niets meegegeven is. */
  onConnect?: (provider: string) => void;
  /** Na loskoppelen: de aanroeper ververst zijn eigen stand (bv. de mailbootstrap). */
  onVeranderd?: () => void;
  /** Сигнал для студійної оболонки «Макет»: чи активний зараз порожній вступний екран орбіти та скільки підключень. */
  onLeegVeranderd?: (leeg: boolean) => void;
  onAantalVeranderd?: (aantal: number) => void;
  /** Vanaf welk subdomein dit venster geopend wordt (het dok toont het daarna overal). */
  dienst?: string;
  tabContext?: string;
  sourceOrigin?: string;
};

/** Eén regel in «Підключені акаунти», ongeacht de dienst. */
type Koppeling = {
  sleutel: string; id: string; soort: 'google' | 'microsoft' | 'imap'; aanbieder: string; email: string; merk: string; naam: string;
  stand: KoppelStand; hoofd: boolean; extra: string;
};

const kaart: React.CSSProperties = { background: 'var(--panel,#fff)', borderRadius: 16, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,.08)' };

export default function MailAccountsHub({ lang, userName = '', accounts = [], onConnect, onVeranderd, onLeegVeranderd, onAantalVeranderd, dienst = 'mail', tabContext, sourceOrigin }: Props) {
  const t = (uk: string, nl: string) => (lang === 'uk' ? uk : nl);
  const isMaquette = useIsMaquette();
  const [imap, setImap] = useState<MailImapKoppelingPubliek[]>([]);
  const [google, setGoogle] = useState<GoogleRij[]>(() => accounts.map((a) => ({ id: a.id, email: a.email, accountRole: a.accountRole, status: a.status })));
  const [microsoft, setMicrosoft] = useState<MicrosoftRij[]>([]);
  const [bezig, setBezig] = useState('');
  const [melding, setMelding] = useState<{ tekst: string; fout: boolean } | null>(null);
  const [vraag, setVraag] = useState<{ sleutel: string; wissen: boolean } | null>(null);
  const [niveaus, setNiveaus] = useState<Record<string, MailMeldingNiveau>>({});
  const [erfenis, setErfenis] = useState<MailMeldingNiveau>('action');
  const [bel, setBel] = useState('');
  const [laatste, setLaatste] = useState<Record<string, LaatsteBrief>>({});
  // MAILACC-002: pas na de eerste lading weten we of er echt geen accounts zijn (anders flitst de lege orbit).
  const [geladen, setGeladen] = useState(dienst !== 'mail' || accounts.length > 0);
  // Toegankelijkheid 21.10 (WCAG 2.4.3, 4.1.2): de vraag «Відключити …?» is een (niet-modale) alertdialog; openen = focus op de VEILIGE
  // keuze («Скасувати»), Esc/«Скасувати» = dicht en de focus terug op «Відключити» van die rij; is de rij weg (losgekoppeld), dan op de melding.
  const hubRef = useRef<HTMLDivElement | null>(null);
  const vorigeVraag = useRef('');
  useEffect(() => {
    const nu = vraag?.sleutel || '', was = vorigeVraag.current;
    vorigeVraag.current = nu;
    const hub = hubRef.current;
    if (!hub) return;
    const rijVan = (sl: string) => [...hub.querySelectorAll<HTMLElement>('[data-mail-koppeling-sleutel]')].find((e) => e.dataset.mailKoppelingSleutel === sl);
    if (nu && nu !== was) { rijVan(nu)?.querySelector<HTMLElement>('[data-mail-ontkoppel-annuleer]')?.focus(); return; }
    if (!nu && was) {
      const rij = rijVan(was);
      if (rij) { if (focusVerloren() || rij.contains(document.activeElement)) rij.querySelector<HTMLElement>('[data-mail-ontkoppel]')?.focus(); }
      else if (focusVerloren()) hub.querySelector<HTMLElement>('[data-mail-melding-focus]')?.focus();
    }
  }, [vraag?.sleutel]);

  const context = useCallback(() => {
    const tab = tabContext || huidigTabblad();
    return { service: dienst === 'hub' ? 'mail' : dienst, tabContext: tab, sourceOrigin: sourceOrigin || (typeof location !== 'undefined' ? location.origin : '') };
  }, [dienst, tabContext, sourceOrigin]);

  const laden = useCallback(async () => {
    const c = context();
    // Drie bronnen, elk apart: valt er één weg, dan blijven de andere zichtbaar.
    await Promise.all([
      api.post('/api/owner/mail/imap/aanbieders', c).then((r) => setImap(((r.data as { koppelingen?: MailImapKoppelingPubliek[] }).koppelingen) || [])).catch(() => undefined),
      api.post('/api/owner/mail/google-suite/accounts', c).then((r) => {
        const d = r.data as { accounts?: GoogleRij[]; inactiveAccounts?: GoogleRij[] };
        setGoogle([...(d.accounts || []), ...(d.inactiveAccounts || [])]);
      }).catch(() => undefined),
      api.post('/api/owner/mail/accounts/list', c).then((r) => setMicrosoft(((r.data as { accounts?: MicrosoftRij[] }).accounts || []).filter((a) => a.provider === 'microsoft' && a.status !== 'disconnected'))).catch(() => undefined),
      api.post('/api/owner/mail/notification-preferences/list', c).then((r) => {
        const data = r.data as { legacy?: { minimum?: unknown }; accounts?: Array<{ accountKey?: string; minimum?: unknown }> };
        const map: Record<string, MailMeldingNiveau> = {};
        for (const row of data.accounts || []) {
          if (row.accountKey && isMailMeldingNiveau(row.minimum)) map[row.accountKey] = row.minimum;
        }
        setNiveaus(map);
        if (isMailMeldingNiveau(data.legacy?.minimum)) setErfenis(data.legacy.minimum);
      }).catch(() => undefined),
    ]);
    setGeladen(true);
  }, [context]);

  // De eigen koppelingen erbij (alleen op de maildienst: daar is de sessie die deze routes vragen).
  useEffect(() => { if (dienst === 'mail') void laden(); }, [dienst, laden]);

  const googleIds = google.map((a) => a.id).filter(Boolean).join(',');
  const haalLaatste = useCallback(async (ids: string[]) => {
    if (!ids.length || dienst !== 'mail') return;
    try {
      const r = await api.post('/api/owner/mail/google-suite/laatste-ontvangst', { ...context(), accountIds: ids });
      const items = ((r.data as { items?: Array<LaatsteBrief & { accountId: string }> }).items) || [];
      setLaatste((huidig) => {
        const next = { ...huidig };
        for (const item of items) next[item.accountId] = { latestReceivedAt: item.latestReceivedAt, empty: item.empty, checkedAt: item.checkedAt, errorCode: item.errorCode };
        return next;
      });
    } catch {
      setLaatste((huidig) => {
        const next = { ...huidig };
        for (const id of ids) next[id] = { latestReceivedAt: 0, empty: false, checkedAt: Date.now(), errorCode: 'CHECK_FAILED' };
        return next;
      });
    }
  }, [context, dienst]);
  useEffect(() => { if (googleIds) void haalLaatste(googleIds.split(',')); }, [googleIds, haalLaatste]);

  const openen = (a: MailAanbieder) => {
    if (onConnect) { onConnect(a.id); return; }
    mailKoppelenOpenen(a.id, `${t('Підключення', 'Koppelen')}: ${a.naam}`, dienst);
  };

  // ------------------------------------------------------------------------------------------------ gekoppelde accounts
  const gmail = mailAanbieder('gmail')!, outlook = mailAanbieder('outlook')!;
  const alleKoppelingen: Koppeling[] = [
    ...google.map((a) => ({
      sleutel: `google:${a.id}`, id: a.id, soort: 'google' as const, aanbieder: 'gmail', email: a.email, merk: gmail.merk, naam: gmail.naam,
      stand: googleStand(a.status), hoofd: a.accountRole === 'primary', extra: '',
    })),
    ...microsoft.map((a) => ({
      sleutel: `microsoft:${a.id}`, id: a.id, soort: 'microsoft' as const, aanbieder: 'outlook', email: a.email, merk: outlook.merk, naam: outlook.naam,
      stand: microsoftStand(a.status), hoofd: false, extra: '',
    })),
    ...imap.map((k) => {
      const d = mailAanbieder(k.aanbieder);
      return {
        sleutel: `imap:${k.id}`, id: k.id, soort: 'imap' as const, aanbieder: k.aanbieder, email: k.adres, merk: d?.merk || k.aanbieder, naam: d?.naam || k.aanbieder,
        stand: imapStand(k), hoofd: false,
        extra: k.fout ? mailImapFoutTekst(k.fout, lang) : k.smtpGoed ? t('читання і надсилання', 'lezen en verzenden') : t('лише читання', 'alleen lezen'),
      };
    }),
  ];
  const groepen = [...new Set(alleKoppelingen.map((k) => k.aanbieder))].map((id) => ({ dienst: mailAanbieder(id), rijen: alleKoppelingen.filter((k) => k.aanbieder === id) }));
  const aantalKoppelingen = alleKoppelingen.length;
  useEffect(() => {
    if (!geladen) return; // nog niet bekend: de oproeper niet laten wisselen naar het lege scherm
    onLeegVeranderd?.(aantalKoppelingen === 0);
    onAantalVeranderd?.(aantalKoppelingen);
  }, [geladen, aantalKoppelingen, onLeegVeranderd, onAantalVeranderd]);

  const fout = (gevangen: unknown) => {
    const lichaam = (gevangen as { response?: { data?: { fout?: string; error?: string } } })?.response?.data;
    return String(lichaam?.fout || lichaam?.error || (gevangen as { message?: string } | null)?.message || 'HTTP');
  };

  const opnieuwKoppelen = async (k: Koppeling) => {
    setMelding(null);
    if (k.soort === 'imap') { mailKoppelenOpenen(k.aanbieder, `${t('Підключення', 'Koppelen')}: ${k.naam}`, dienst, k.email); return; }
    setBezig(k.sleutel);
    try {
      if (k.soort === 'google') {
        const c = context();
        const r = await api.post('/api/owner/mail/google-suite/onboarding/start', googleStartLichaam({
          taal: lang, returnTo: location.href, sourceOrigin: c.sourceOrigin, tabContext: c.tabContext,
          rol: k.hoofd ? 'primary' : 'additional', loginHint: k.hoofd ? '' : k.email, opnieuw: k.hoofd,
        }));
        const url = String((r.data as { authUrl?: string }).authUrl || '');
        if (!url) throw new Error('GEEN_URL');
        location.assign(url);
        return;
      }
      await startMicrosoftConnection(k);
    } catch (gevangen) {
      const code = fout(gevangen);
      setMelding({ fout: true, tekst: k.soort === 'google' ? googleStartFoutTekst(code, lang) : code === 'MAIL_PROVIDER_GATES_INCOMPLETE' ? t('Microsoft 365 ще не ввімкнено на цьому сервері.', 'Microsoft 365 is op deze server nog niet aangezet.') : `${t('Повторне підключення не розпочато. Код сервера:', 'Opnieuw koppelen is niet gestart. Servercode:')} ${code}` });
    } finally { setBezig(''); }
  };

  // Dezelfde stroom als vroeger in MailFunctionalView (startMicrosoftConnection): accounts/:id/connect/start → Microsoft.
  const startMicrosoftConnection = async (k: Koppeling) => {
    const r = await api.post(`/api/owner/mail/accounts/${k.id}/connect/start`, { ...context(), locale: lang, returnTo: location.href });
    const url = String((r.data as { authUrl?: string }).authUrl || '');
    if (!url) throw new Error('MAIL_OAUTH_URL_MISSING');
    location.assign(url);
  };

  // Dezelfde route als vroeger (disconnectMicrosoftAccount), nu met de keuze bewaren/wissen; Google en IMAP via hun eigen route.
  const disconnectMicrosoftAccount = async (k: Koppeling, wissen: boolean) =>
    api.post(`/api/owner/mail/accounts/${k.id}/disconnect`, { ...context(), retainLocalData: !wissen, ...(wissen ? { confirmation: WIS_BEVESTIGING } : {}) });

  const ontkoppelen = async (k: Koppeling, wissen: boolean) => {
    setBezig(k.sleutel); setMelding(null);
    try {
      if (k.soort === 'microsoft') await disconnectMicrosoftAccount(k, wissen);
      else if (k.soort === 'google') await api.post(`/api/owner/mail/google/accounts/${k.id}/disconnect`, { ...context(), retainLocalData: !wissen, ...(wissen ? { confirmation: WIS_BEVESTIGING } : {}) });
      else await api.post('/api/owner/mail/imap/ontkoppelen', { ...context(), id: k.id });
      setVraag(null);
      setMelding({ fout: false, tekst: `${k.email}: ${t('відключено.', 'losgekoppeld.')} ${wissen ? t('Локальні дані видалено.', 'De lokale gegevens zijn gewist.') : k.soort === 'imap' ? '' : t('Локальні дані збережено.', 'De lokale gegevens zijn bewaard.')}`.trim() });
      await laden();
      onVeranderd?.();
    } catch (gevangen) {
      setMelding({ fout: true, tekst: `${t('Не відключено. Код сервера:', 'Niet losgekoppeld. Servercode:')} ${fout(gevangen)}` });
    } finally { setBezig(''); }
  };

  const nogEen = (a: MailAanbieder | null) => a && mailAanbiederHeeftKnop(a) ? (
    <button type='button' className='mail-koppeling-knop' onClick={() => openen(a)} data-mail-nog-een={a.id}>
      {t('Додати ще один', 'Nog een toevoegen:')} {a.naam}
    </button>
  ) : null;

  const bewaarNiveau = async (k: Koppeling, minimum: MailMeldingNiveau) => {
    const vorige = niveaus[k.sleutel];
    setNiveaus((huidig) => ({ ...huidig, [k.sleutel]: minimum }));
    try {
      await api.post('/api/owner/mail/notification-preferences/save', { ...context(), accountKey: k.sleutel, minimum });
    } catch (gevangen) {
      setNiveaus((huidig) => {
        const next = { ...huidig };
        if (vorige) next[k.sleutel] = vorige; else delete next[k.sleutel];
        return next;
      });
      setMelding({ fout: true, tekst: `${t('Поріг дзвоника не збережено.', 'De drempel van de bel is niet bewaard.')} ${fout(gevangen)}` });
    }
  };

  const rij = (k: Koppeling) => {
    const open = vraag?.sleutel === k.sleutel;
    const vraagId = `mail-ontkoppel-${k.sleutel.replace(/[^A-Za-z0-9_-]/g, '_')}`;
    const uitleg = ontkoppelUitleg(k.soort, { hoofd: k.hoofd, taal: lang });
    const imapGoed = k.soort === 'imap' ? imap.find((x) => x.id === k.id)?.laatstGoedOp || 0 : 0;
    return (
      <div key={k.sleutel} className='mail-koppeling' data-mail-koppeling={k.soort} data-mail-koppeling-stand={k.stand} data-mail-koppeling-sleutel={k.sleutel}>
        <div className='mail-koppeling-kop'>
          <Logo id={k.id} naam={k.naam} logo={k.merk} maat={32} />
          <div className='mail-koppeling-tekst'>
            <div className='mail-koppeling-adres'>{k.email}</div>
            <div className='mail-koppeling-sub'>
              <span className={`mail-koppeling-stand is-${k.stand}`}>{standTekst(k.stand, lang)}</span>
              {k.hoofd ? <span className='mail-koppeling-hoofd'>{t('Основний', 'Hoofdaccount')}</span> : null}
              {k.extra ? <span>{k.extra}</span> : null}
              {k.soort === 'google' ? <span className='mail-koppeling-laatste' data-mail-laatste={laatste[k.id]?.errorCode || (laatste[k.id] ? 'ok' : 'wacht')}>{laatsteRegel(lang, laatste[k.id])}</span> : null}
              {k.soort === 'google' && laatste[k.id]?.errorCode === 'CHECK_FAILED' ? <button type='button' className='mail-laatste-opnieuw' data-mail-laatste-opnieuw onClick={() => void haalLaatste([k.id])}>{t('Ще раз', 'Opnieuw')}</button> : null}
              {imapGoed ? <span className='mail-koppeling-laatste' data-mail-laatste='imap'>{t('Вхід перевірено', 'Postvak gecontroleerd')} {zojuist(imapGoed, lang)}</span> : null}
            </div>
          </div>
          <MailMeldingBel
            lang={lang}
            email={k.email}
            sleutel={k.sleutel}
            niveau={niveaus[k.sleutel] || erfenis}
            eigen={Boolean(niveaus[k.sleutel])}
            open={bel === k.sleutel}
            bezig={bezig === k.sleutel}
            onOpen={(open) => { if (open) setVraag(null); setBel(open ? k.sleutel : ''); }}
            onKies={(minimum) => void bewaarNiveau(k, minimum)}
          />
        </div>
        <div className='mail-koppeling-acties'>
          <button type='button' className='mail-koppeling-knop' disabled={!!bezig} onClick={() => void opnieuwKoppelen(k)} data-mail-opnieuw aria-label={`${k.stand === 'nog-geen-toegang' ? t('Надати доступ', 'Toegang verlenen') : t('Перепідключити', 'Opnieuw koppelen')} ${k.email}`}>
            {k.stand === 'nog-geen-toegang' ? t('Надати доступ', 'Toegang verlenen') : t('Перепідключити', 'Opnieuw koppelen')}
          </button>
          <button type='button' className='mail-koppeling-knop is-gevaar' disabled={!!bezig} aria-expanded={open} aria-label={`${t('Відключити', 'Loskoppelen')} ${k.email}`}
            onClick={() => { setBel(''); setVraag(open ? null : { sleutel: k.sleutel, wissen: false }); }} data-mail-ontkoppel>
            {t('Відключити', 'Loskoppelen')}
          </button>
        </div>
        {open ? (
          <div className='mail-ontkoppel-vraag' role='alertdialog' aria-labelledby={`${vraagId}-titel`} aria-describedby={`${vraagId}-uitleg`} data-mail-ontkoppel-vraag
            onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setVraag(null); } }}>
            <strong id={`${vraagId}-titel`}>{t('Відключити', 'Loskoppelen:')} {k.email}?</strong>
            <ul id={`${vraagId}-uitleg`}>{uitleg.map((r, i) => <li key={i}>{r}</li>)}</ul>
            {k.soort !== 'imap' ? (
              <fieldset className='mail-ontkoppel-keuze'>
                <legend>{t('Що робити з даними на цьому сервері?', 'Wat gebeurt er met de gegevens op deze server?')}</legend>
                <label><input type='radio' name={`wis-${k.sleutel}`} checked={!vraag!.wissen} onChange={() => setVraag({ sleutel: k.sleutel, wissen: false })} />
                  <span>{t('Залишити локальні дані (листи, уже збережені тут)', 'Lokale gegevens bewaren (berichten die hier al staan)')}</span></label>
                <label><input type='radio' name={`wis-${k.sleutel}`} checked={vraag!.wissen} onChange={() => setVraag({ sleutel: k.sleutel, wissen: true })} />
                  <span>{t('Видалити локальні дані цієї скриньки', 'De lokale gegevens van deze mailbox wissen')}</span></label>
              </fieldset>
            ) : null}
            <div className='mail-koppeling-acties'>
              <button type='button' className='mail-koppeling-knop is-gevaar-vol' disabled={!!bezig} onClick={() => void ontkoppelen(k, vraag!.wissen)} data-mail-ontkoppel-bevestig>
                {bezig === k.sleutel ? t('Відключаємо…', 'Bezig…') : vraag!.wissen ? t('Відключити й видалити дані', 'Loskoppelen en gegevens wissen') : t('Відключити', 'Loskoppelen')}
              </button>
              <button type='button' className='mail-koppeling-knop' onClick={() => setVraag(null)} data-mail-ontkoppel-annuleer>{t('Скасувати', 'Annuleren')}</button>
            </div>
          </div>
        ) : null}
      </div>
    );
  };

  // MAILACC-002 (15.11.2026, oude fout): vóór het laden waren alle lijsten leeg, dus toonde de hub eerst de lege orbit
  // («Підключіть першу скриньку») en sprong hij na ~1 с naar de lange beheerpagina. Nu: eerst een rustige laadkaart,
  // daarna ÉÉN ontwerp — de orbit — met of zonder gekoppelde accounts. Без «блимання» між двома різними сторінками.
  if (!geladen && alleKoppelingen.length === 0) {
    return (
      <div className='mail-accounts-hub mail-accounts-orbit-mode mail-accounts-laden' data-mail-accounts-laden='ja' aria-busy='true'>
        <div className='mail-accounts-laadkaart' role='status'>
          <span className='mail-accounts-laadkaart-puls' aria-hidden='true' />
          <span>{t('Завантажуємо ваші поштові скриньки…', 'Uw mailboxen worden geladen…')}</span>
        </div>
      </div>
    );
  }

  // MAILORBIT-001: het lege scherm is de orbit; beheer en ontkoppeling bij bestaande accounts blijven onaangeroerd.
  if (alleKoppelingen.length === 0) {
    return (
      <div className='mail-accounts-hub mail-accounts-orbit-mode' data-mail-accounts-empty='true' data-mail-accounts-orbit='ja'>
        <MailOrbitIntro lang={lang} onSelect={openen} />
        <div ref={hubRef} className='mail-orbit-lege-status' data-mail-gekoppeld>
          {melding ? <p role={melding.fout ? 'alert' : 'status'} className={'mail-koppeling-melding' + (melding.fout ? ' is-fout' : '')}>{melding.tekst}</p> : null}
        </div>
      </div>
    );
  }

  // MAILACC-002: met accounts dezelfde orbit bovenaan (variant «extra») in plaats van de oude kop + tegelcatalogus.
  // Één catalogus per pagina: de orbit heeft alle koppelbare diensten, «Увесь каталог» en «Чому недоступно?».
  const naarBeheer = () => {
    const doel = typeof document !== 'undefined' ? document.getElementById('mail-sectie-gekoppeld') : null;
    doel?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    doel?.focus({ preventScroll: true });
  };

  return (
    <div className='mail-accounts-hub mail-accounts-met-orbit' data-mail-accounts-empty='false' data-mail-accounts-orbit='ja'>
      <div className='mail-accounts-orbit-rij'>
        <MailOrbitIntro lang={lang} onSelect={openen} variant='extra' aantal={alleKoppelingen.length} onManage={naarBeheer}
          groet={userName ? `${t('Вітаємо, ', 'Welkom, ')}${userName}!` : ''} />
      </div>
      <div className='mail-accounts-hoofd'>

        <div id='mail-sectie-gekoppeld' tabIndex={-1} className='mail-accounts-kaart mail-accounts-gekoppeld-kaart' style={isMaquette ? undefined : kaart} data-mail-gekoppeld ref={hubRef}>
          <div className='mail-accounts-kaart-kop' style={isMaquette ? undefined : { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div className='mail-accounts-kaart-titel' style={isMaquette ? undefined : { fontWeight: 600 }}>{t('Підключені акаунти', 'Gekoppelde accounts')} <span className='mail-accounts-teller' style={isMaquette ? undefined : { background: 'var(--surface,#f1f5f9)', borderRadius: 999, padding: '2px 8px', fontSize: 12 }}>{alleKoppelingen.length}</span></div>
          </div>
          {/* Altijd aanwezige live-regio's (een regio die pas mét tekst verschijnt, wordt vaak niet voorgelezen — WCAG 4.1.3). */}
          <div role='status' tabIndex={-1} data-mail-melding-focus>{melding && !melding.fout ? <p className='mail-koppeling-melding'>{melding.tekst}</p> : null}</div>
          <div role='alert'>{melding?.fout ? <p className='mail-koppeling-melding is-fout'>{melding.tekst}</p> : null}</div>
          {alleKoppelingen.length === 0 ? (
            // Punt 5 van de opdracht: een leeg vak legt uit wat een koppeling GEEFT, in plaats van een nul te tonen.
            <div className='mail-accounts-leeg-uitleg' style={isMaquette ? undefined : { display: 'grid', gap: 8, padding: '8px 0', color: 'var(--muted,#475569)', fontSize: 14 }} data-mail-leeg='uitleg'>
              <strong style={{ color: 'inherit' }}>{t('Ще жодної скриньки не підключено. Що дає підключення:', 'Er is nog geen mailbox gekoppeld. Wat een koppeling u geeft:')}</strong>
              <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
                <li>{t('усі листи читаються в одному вікні, без перемикання між сервісами;', 'alle berichten leest u in één venster, zonder tussen diensten te wisselen;')}</li>
                <li>{t('пошук, контакти й підказки працюють по всіх скриньках разом;', 'zoeken, contacten en hints werken over alle mailboxen samen;')}</li>
                <li>{t('Google і Microsoft підключаються без пароля (OAuth), решта — паролем застосунку, який лежить лише зашифрованим;', 'Google en Microsoft koppelen zonder wachtwoord (OAuth), de rest met een app-wachtwoord dat alleen versleuteld wordt bewaard;')}</li>
                <li>{t('для IMAP-скриньок зараз перевіряється вхід і надсилання; завантаження листів з них ще не ввімкнене — і ми цього не приховуємо.', 'voor IMAP-mailboxen wordt nu het aanmelden en verzenden gecontroleerd; het binnenhalen van berichten staat nog niet aan — en dat verzwijgen we niet.')}</li>
              </ul>
            </div>
          ) : groepen.map((g) => (
            <section key={g.dienst?.id || g.rijen[0].aanbieder} className='mail-koppeling-groep' data-mail-groep={g.dienst?.id}>
              <header className='mail-koppeling-groep-kop'>
                <h3>{g.dienst?.naam || g.rijen[0].naam} <span>{g.rijen.length}</span></h3>
                {nogEen(g.dienst)}
              </header>
              {g.rijen.map(rij)}
            </section>
          ))}
          <p className='mail-koppeling-noot'><ShieldCheck size={14} aria-hidden='true' /> {t(
            'Вхід на сайт не надає доступу до пошти, а відключення пошти не завершує ваш сеанс: кожне підключення керується окремо.',
            'Aanmelden op de site geeft geen toegang tot e-mail, en een mailbox loskoppelen beëindigt uw sessie niet: elke koppeling wordt apart beheerd.')}</p>
        </div>
      </div>

      <aside className='mail-accounts-kant'>
        <div id='mail-sectie-uitleg' className='mail-accounts-kaart mail-accounts-kant-info' style={isMaquette ? undefined : { ...kaart, background: 'var(--info-zacht)', color: 'var(--text)' }}>
          <div className='mail-accounts-kant-titel' style={isMaquette ? undefined : { fontWeight: 700, fontSize: 18, marginBottom: 8 }}>{t('Вікна, які не губляться', 'Vensters die niet verdwijnen')}</div>
          <p style={isMaquette ? undefined : { fontSize: 13, margin: 0 }}>{t(
            'Згорнуте вікно підключення лишається в доку праворуч знизу — і залишається там, коли ви переходите на хаб, пошту чи хмару та після перезавантаження сторінки. Пароль при згортанні стирається навмисно.',
            'Een geminimaliseerd koppelvenster blijft in het dok rechtsonder staan — ook als u naar de hub, post of cloud gaat, en na het herladen van de pagina. Het wachtwoord wordt bij minimaliseren bewust gewist.')}</p>
        </div>

        <div className='mail-accounts-kaart mail-accounts-kant-uitleg' style={isMaquette ? undefined : kaart}>
          <div className='mail-accounts-kaart-titel' style={isMaquette ? undefined : { fontWeight: 600, marginBottom: 12 }}>{t('Як саме це працює', 'Hoe het precies werkt')}</div>
          <ul style={isMaquette ? undefined : { margin: 0, paddingLeft: 18, fontSize: 13, color: 'var(--muted,#475569)', lineHeight: 1.6 }}>
            <li>{t('Gmail — OAuth Google. Другий і наступні акаунти Google: Google покаже вибір акаунта.', 'Gmail — OAuth van Google. Een tweede en volgend Google-account: Google toont een accountkeuze.')}</li>
            <li>{t('Outlook — OAuth Microsoft; адресу вводите у вікні. Якщо адміністратор ще не завершив налаштування, вікно покаже, чого бракує.', 'Outlook — OAuth van Microsoft; het adres vult u in het venster in. Heeft de beheerder de configuratie nog niet af, dan toont het venster wat ontbreekt.')}</li>
            <li>{t('iCloud, Ukr.net, Yahoo, I.ua — сервер справді входить у скриньку по IMAP і перевіряє SMTP, перш ніж щось зберегти.', 'iCloud, Ukr.net, Yahoo, I.ua — de server meldt zich echt via IMAP aan en controleert SMTP voordat er iets bewaard wordt.')}</li>
            <li>{t('Online.ua і Proton — кнопки немає: під «Чому недоступно?» перелічено, чого саме бракує.', 'Online.ua en Proton — geen knop: onder «Waarom niet beschikbaar?» staat wat er precies ontbreekt.')}</li>
          </ul>
        </div>
      </aside>
    </div>
  );
}
