// «Майстер підключень» (admin → Інтеграції → Майстер, 20.10.2026): per externe OAuth-provider de precieze stappen in de
// vreemde console, de kant-en-klare waarden om te plakken, één veld om client id + secret in de EIGEN kluis te zetten, een
// echte controle bij de dienst en een eerlijke stand («підключено / не підключено / помилка з текстом»).
//
// Wat hier bewust NIET gebeurt: een geheim tonen, een geheim loggen, een geheim in een URL zetten. Het secret-veld gaat als
// POST naar de bestaande kluisroute (passkey/TOTP via client.ts → stap-op) en wordt daarna leeggemaakt. De server stuurt codes
// terug (shared/integraties-wizard.ts WIZARD_CODES), de browser kiest de taal.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ClipboardCopy, ExternalLink, KeyRound, RefreshCw, ServerCog, ShieldCheck, TriangleAlert } from 'lucide-react';
import { api } from '../platform/client';
import Logo from '../merk/MerkLogo';
import { integratie } from '../../shared/integraties-catalogus';
import {
  WIZARD_PROVIDERS, WIZARD_STAPPEN, geldigSecret, geldigeClientId, geldigeStripeSleutel, googleKluisTekst, wizardCodeTekst,
  type WizardProvider, type WizardProviderId, type WizardWaarde,
} from '../../shared/integraties-wizard';
import { leesAppSleutel, leesOauthApp } from '../../shared/github-koppeling';
import GeheimInvoer from '../geheim/GeheimInvoer';

type Lang = 'uk' | 'nl';
type Stand = 'ok' | 'let-op' | 'fout' | 'onbekend';
type ProviderStand = { id: WizardProviderId; ingesteld: boolean; bron: 'env' | 'kluis' | 'onleesbaar' | ''; clientId: string; env: Record<string, boolean>; herstartNodig: boolean; controle: { stand: Stand; code: string; detail: string; op: number } | null };
type WizardStand = { waarden: Record<WizardProviderId, WizardWaarde[]>; providers: Record<WizardProviderId, ProviderStand>; isEigenaar: boolean; sleutels: Record<string, boolean>; serverOpdrachtGeheimen: string };

interface Props { lang: Lang; context: Record<string, unknown>; onGewijzigd?: () => void }

const datum = (ms: number, lang: Lang) => new Date(ms).toLocaleString(lang === 'uk' ? 'uk-UA' : 'nl-BE', { dateStyle: 'medium', timeStyle: 'short' });
const STAND_TEKST: Record<Stand, readonly [string, string]> = { ok: ['Підключено', 'Gekoppeld'], 'let-op': ['Потрібна увага', 'Let op'], fout: ['Помилка', 'Fout'], onbekend: ['Невідомо', 'Onbekend'] };
const KLUIS_FOUTEN: Record<string, readonly [string, string]> = {
  OWNER_VAULT_ENCRYPTION_UNAVAILABLE: ['Сховище недоступне: на сервері немає OWNER_VAULT_ENCRYPTION_KEY_V1. Запустіть «mijn-ruimte-installeer geheimen».', 'Kluis niet beschikbaar: OWNER_VAULT_ENCRYPTION_KEY_V1 ontbreekt op de server. Voer «mijn-ruimte-installeer geheimen» uit.'],
  STEP_UP_REQUIRED: ['Потрібне підтвердження (passkey або код). Спробуйте ще раз.', 'Bevestiging nodig (passkey of code). Probeer het opnieuw.'],
  STEP_UP_STRONG_REQUIRED: ['Потрібне сильне підтвердження (passkey або код з застосунку).', 'Sterke bevestiging nodig (passkey of app-code).'],
  OWNER_VAULT_LIMIT_REACHED: ['Сховище заповнене (ліміт записів).', 'De kluis is vol (limiet aan items).'],
  OWNER_REQUIRED: ['Лише власник може писати у сховище.', 'Alleen de eigenaar kan in de kluis schrijven.'],
};

/** Eén regel met een kopieerknop. Het is nooit een geheim: alleen adressen, namen, scopes. */
function Kopieer({ tekst, lang, label }: { tekst: string; lang: Lang; label: string }) {
  const [ok, setOk] = useState(false);
  const tr = (uk: string, nl: string) => (lang === 'uk' ? uk : nl);
  const kopieer = async () => { try { await navigator.clipboard.writeText(tekst); setOk(true); window.setTimeout(() => setOk(false), 1800); } catch { /* browser weigerde */ } };
  return (
    <button type='button' className='il-w-kopieer' onClick={() => void kopieer()} disabled={!tekst} title={tr('Скопіювати', 'Kopiëren')} aria-label={`${tr('Скопіювати', 'Kopiëren')}: ${label}`}>
      {ok ? <CheckCircle2 aria-hidden /> : <ClipboardCopy aria-hidden />}<span>{ok ? tr('Скопійовано', 'Gekopieerd') : tr('Копіювати', 'Kopiëren')}</span>
    </button>
  );
}

export default function Wizard({ lang, context, onGewijzigd }: Props) {
  const tr = (uk: string, nl: string) => (lang === 'uk' ? uk : nl);
  const t = (x: readonly [string, string]) => x[lang === 'uk' ? 0 : 1];
  const [stand, setStand] = useState<WizardStand | null>(null);
  const [laden, setLaden] = useState(true);
  const [fout, setFout] = useState('');
  const [open, setOpen] = useState<WizardProviderId>('google');
  const [bezig, setBezig] = useState<'' | `test:${WizardProviderId}` | `save:${WizardProviderId}`>('');
  const [bericht, setBericht] = useState<{ voor: WizardProviderId; soort: 'ok' | 'fout'; tekst: string } | null>(null);
  // Invoer per provider. Het secret blijft alleen in de React-state tot het is verzonden; nooit in browseropslag, nooit in een URL.
  const [invoer, setInvoer] = useState<Record<WizardProviderId, { id: string; secret: string; pem: string }>>({ google: { id: '', secret: '', pem: '' }, microsoft: { id: '', secret: '', pem: '' }, github: { id: '', secret: '', pem: '' }, 'github-app': { id: '', secret: '', pem: '' }, stripe: { id: '', secret: '', pem: '' } });

  const laad = useCallback(async () => {
    setLaden(true); setFout('');
    try { setStand((await api.post('/api/owner/admin/integraties/wizard/stand', context)).data as WizardStand); }
    catch { setStand(null); setFout(tr('Не вдалося прочитати стан майстра з сервера.', 'De stand van de wizard kon niet van de server worden gelezen.')); }
    setLaden(false);
  }, [context]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void laad(); }, [laad]);

  const foutTekst = (e: unknown) => { const code = String((e as Error)?.message || ''); return KLUIS_FOUTEN[code] ? t(KLUIS_FOUTEN[code]) : tr(`Не вдалося виконати дію${code ? ` (${code})` : ''}.`, `De actie is niet gelukt${code ? ` (${code})` : ''}.`); };

  const controleer = async (p: WizardProvider) => {
    setBezig(`test:${p.id}`); setBericht(null);
    try {
      const r = (await api.post('/api/owner/admin/integraties/wizard/controleer', { ...context, provider: p.id })).data as { stand: Stand; code: string; detail: string; n?: number; op: number };
      setStand((s) => s ? { ...s, providers: { ...s.providers, [p.id]: { ...s.providers[p.id], controle: { stand: r.stand, code: r.code, detail: r.detail, op: r.op } } } } : s);
      setBericht({ voor: p.id, soort: r.stand === 'ok' ? 'ok' : 'fout', tekst: wizardCodeTekst(r.code, lang, r.n, r.detail) });
      onGewijzigd?.();
    } catch (e) { setBericht({ voor: p.id, soort: 'fout', tekst: foutTekst(e) }); }
    setBezig('');
  };

  /** Client id + secret → kluis (bestaande route met passkey/TOTP). Daarna cache wissen en de stand opnieuw lezen. */
  const bewaar = async (p: WizardProvider) => {
    const v = invoer[p.id];
    let waarde = '';
    if (p.id === 'stripe') {
      // Alleen een BEPERKTE sleutel (rk_…): een volledige geheime sleutel kan geld verplaatsen en hoort niet bij een leeshulpmiddel.
      if (!geldigeStripeSleutel(v.secret)) { setBericht({ voor: p.id, soort: 'fout', tekst: tr('Потрібен обмежений ключ (rk_live_… або rk_test_…); повний секретний ключ sk_… сайт не прийме.', 'Een beperkte sleutel is nodig (rk_live_… of rk_test_…); een volledige geheime sleutel sk_… neemt de site niet aan.') }); return; }
      waarde = v.secret.trim();
    } else if (p.id === 'github-app') {
      const s = leesAppSleutel(v.pem);
      if (!s) { setBericht({ voor: p.id, soort: 'fout', tekst: tr('Очікується «app_id: <число>» і повний PEM приватного ключа.', 'Verwacht «app_id: <getal>» en de volledige PEM van de persoonlijke sleutel.') }); return; }
      waarde = v.pem.trim();
    } else {
      const id = v.id.trim(), secret = v.secret.trim();
      if (!geldigeClientId(p.id, id)) { setBericht({ voor: p.id, soort: 'fout', tekst: tr('Client ID має неправильний формат.', 'Client ID heeft een ongeldig formaat.') }); return; }
      if (!geldigSecret(secret)) { setBericht({ voor: p.id, soort: 'fout', tekst: tr('Client secret має неправильний формат (16–200 символів).', 'Client secret heeft een ongeldig formaat (16–200 tekens).') }); return; }
      waarde = p.id === 'google' ? googleKluisTekst(id, secret) : `client_id: ${id}\nclient_secret: ${secret}`;
      if (p.id === 'github' && !leesOauthApp(waarde)) { setBericht({ voor: p.id, soort: 'fout', tekst: tr('GitHub не прийме такий client id/secret.', 'GitHub zal dit client id/secret niet aannemen.') }); return; }
    }
    setBezig(`save:${p.id}`); setBericht(null);
    try {
      const r = await api.post('/api/owner/api-platform/vault/save', { ...context, name: p.kluisNaam, purpose: p.kluisDoel, usedBy: p.kluisDoel, value: waarde });
      const d = (r as { data?: Record<string, unknown> })?.data || {};
      if (d.plaintext || d.value || d.secret) throw new Error('LEK');
      setInvoer((x) => ({ ...x, [p.id]: { id: '', secret: '', pem: '' } }));
      await api.post('/api/owner/admin/integraties/wizard/vernieuwen', context).catch(() => undefined);
      await laad();
      setBericht({ voor: p.id, soort: 'ok', tekst: tr('Збережено у зашифрованому сховищі. Дію записано в журнал. Натисніть «Перевірити».', 'Opgeslagen in de versleutelde kluis. De actie staat in het logboek. Kies «Controleren».') });
      onGewijzigd?.();
    } catch (e) { setBericht({ voor: p.id, soort: 'fout', tekst: foutTekst(e) }); }
    setBezig('');
  };

  const chip = (ps: ProviderStand | undefined) => {
    if (!ps) return null;
    const c = ps.controle;
    const l: Stand | 'niet' = c ? c.stand : ps.ingesteld ? 'let-op' : 'niet';
    const tekst = l === 'niet' ? tr('Не підключено', 'Niet gekoppeld') : c ? t(STAND_TEKST[c.stand]) : tr('Налаштовано, не перевірено', 'Ingesteld, niet geverifieerd');
    return <span className='il-levend' data-levend={l === 'ok' ? 'verbonden' : l === 'fout' ? 'fout' : l === 'niet' ? 'niet' : 'ingesteld'}><i aria-hidden />{tekst}</span>;
  };
  const bronTekst = (ps: ProviderStand) => ps.bron === 'env' ? tr('джерело: env на сервері', 'bron: env op de server') : ps.bron === 'kluis' ? tr('джерело: зашифроване сховище', 'bron: versleutelde kluis') : ps.bron === 'onleesbaar' ? tr('у сховищі є запис, але він нечитабельний', 'er staat iets in de kluis, maar onleesbaar') : tr('облікові дані відсутні', 'geen gegevens');

  const sleutelsMis = useMemo(() => Object.entries(stand?.sleutels || {}).filter(([, ok]) => !ok).map(([n]) => n), [stand]);

  return (
    <div className='il-w' data-integraties-wizard='v1'>
      <p className='il-w-intro'>{tr('Зовнішні консолі (Google Cloud, Microsoft Entra, GitHub) вимагають вашого входу й згоди — це сайт зробити за вас не може. Усе інше майстер робить сам: готові адреси, перевірка у сервісу, збереження у сховищі. Значення секретів ніколи не показуються й не потрапляють у журнал.', 'De externe consoles (Google Cloud, Microsoft Entra, GitHub) vragen uw eigen aanmelding en toestemming — dat kan de site niet voor u doen. Al het andere doet de wizard: kant-en-klare adressen, controle bij de dienst, opslaan in de kluis. Waarden van geheimen worden nooit getoond en komen nooit in het logboek.')}</p>
      {fout ? <p className='il-melding' role='alert'>{fout}</p> : null}

      {/* Serversleutels: zonder MAIL_APP_WACHTWOORD_SLEUTEL_V1 werkt mail met app-wachtwoord stil niet — daarom hier, hardop. */}
      {stand ? (
        <section className='il-d-sectie il-w-sleutels' data-sleutels-missen={sleutelsMis.length}>
          <h4><KeyRound aria-hidden />{tr('Ключі шифрування на сервері', 'Versleutelingssleutels op de server')}</h4>
          <ul className='il-w-sleutellijst'>
            {Object.entries(stand.sleutels).map(([n, ok]) => <li key={n} data-ok={ok ? 'ja' : 'nee'}>{ok ? <CheckCircle2 aria-hidden /> : <TriangleAlert aria-hidden />}<code>{n}</code><span>{ok ? tr('задано', 'ingesteld') : tr('відсутній', 'ontbreekt')}</span></li>)}
          </ul>
          {sleutelsMis.length ? (
            <p className='il-d-noot'>
              {sleutelsMis.includes('MAIL_APP_WACHTWOORD_SLEUTEL_V1') ? tr('Без MAIL_APP_WACHTWOORD_SLEUTEL_V1 підключення пошти через пароль застосунку (iCloud, Ukr.net, Yahoo, I.ua) відмовить із кодом помилки. ', 'Zonder MAIL_APP_WACHTWOORD_SLEUTEL_V1 weigert het koppelen van mail met een app-wachtwoord (iCloud, Ukr.net, Yahoo, I.ua) met een foutcode. ') : null}
              {tr('Згенерувати відсутні ключі на сервері (наявні не змінюються; показуються лише назви й відбитки):', 'Ontbrekende sleutels op de server genereren (bestaande blijven; alleen namen en vingerafdrukken worden getoond):')}
            </p>
          ) : <p className='il-d-noot'>{tr('Усі ключі задано. Реєстр (назви, призначення, відбитки — без значень): «mijn-ruimte-installeer geheimen-register».', 'Alle sleutels zijn ingesteld. Register (namen, doel, vingerafdrukken — geen waarden): «mijn-ruimte-installeer geheimen-register».')}</p>}
          {sleutelsMis.length ? <div className='il-w-opdracht'><code>{stand.serverOpdrachtGeheimen}</code><Kopieer tekst={stand.serverOpdrachtGeheimen} lang={lang} label='opdracht' /></div> : null}
        </section>
      ) : null}

      <div className='il-w-lijst'>
        {WIZARD_PROVIDERS.map((p) => {
          const ps = stand?.providers?.[p.id];
          const cat = integratie(p.catalogusId);
          const isOpen = open === p.id;
          const v = invoer[p.id];
          const b = bericht?.voor === p.id ? bericht : null;
          return (
            <section key={p.id} className='il-w-kaart' data-provider={p.id} data-open={isOpen ? 'ja' : 'nee'}>
              <button type='button' className='il-w-kop' aria-expanded={isOpen} aria-controls={`il-w-${p.id}`} onClick={() => setOpen(p.id)}>
                <Logo id={p.catalogusId} naam={cat?.naam || p.naam} logo={cat?.logo || ''} />
                <span className='il-w-titel'><strong>{p.naam}</strong><small>{ps ? bronTekst(ps) : laden ? tr('читаємо стан…', 'stand lezen…') : ''}{ps?.clientId ? ` · ${ps.clientId}` : ''}</small></span>
                {chip(ps)}
              </button>
              {isOpen ? (
                <div id={`il-w-${p.id}`} className='il-w-body'>
                  <div className='il-w-acties'>
                    <a className='il-knop is-primair' href={p.console.url} target='_blank' rel='noopener noreferrer'><ExternalLink aria-hidden />{tr('Відкрити консоль', 'Console openen')}<span className='il-sr'> — {t(p.console.label)}</span></a>
                    <button type='button' className='il-knop' onClick={() => void controleer(p)} disabled={bezig !== ''}><RefreshCw className={bezig === `test:${p.id}` ? 'spin' : ''} aria-hidden />{tr('Перевірити', 'Controleren')}</button>
                    <a className='il-knop is-stil' href={p.docs} target='_blank' rel='noopener noreferrer'><ExternalLink aria-hidden />{tr('Документація', 'Documentatie')}</a>
                  </div>
                  <p className='il-d-noot'>{t(p.console.label)}{p.id === 'microsoft' ? ` · ${tr('назви пунктів у консолі можуть відрізнятися', 'namen van menu-items kunnen verschillen')}` : ''}</p>

                  <section className='il-d-sectie'>
                    <h4><ServerCog aria-hidden />{tr('Кроки у консолі (ваші кліки)', 'Stappen in de console (uw klikken)')}</h4>
                    <ol>{WIZARD_STAPPEN[p.id].map((s, n) => <li key={n}><strong>{t(s.kop)}.</strong> {t(s.tekst)}</li>)}</ol>
                  </section>

                  <section className='il-d-sectie'>
                    <h4><ClipboardCopy aria-hidden />{tr('Готові значення для вставки', 'Kant-en-klare waarden om te plakken')}</h4>
                    {stand ? (
                      <dl className='il-w-waarden'>
                        {stand.waarden[p.id].map((w, n) => (
                          <div key={n}>
                            <dt>{t(w.label)}</dt>
                            <dd>
                              {w.regels ? <ul>{w.regels.map((r) => <li key={r}><code>{r}</code><Kopieer tekst={r} lang={lang} label={r} /></li>)}</ul> : <><code>{w.waarde || '—'}</code><Kopieer tekst={w.waarde} lang={lang} label={t(w.label)} /></>}
                              {w.regels && w.regels.length > 1 ? <Kopieer tekst={w.regels.join('\n')} lang={lang} label={`${t(w.label)} (${tr('усі', 'alle')})`} /> : null}
                              {w.uitleg ? <small>{t(w.uitleg)}</small> : null}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    ) : <p className='il-d-noot'>{tr('Значення зʼявляться після зчитування стану.', 'De waarden verschijnen zodra de stand is gelezen.')}</p>}
                  </section>

                  <section className='il-d-sectie'>
                    <h4><ShieldCheck aria-hidden />{tr('Збереження на сервері', 'Opslaan op de server')}</h4>
                    {p.kluisDoel ? (
                      <form className='il-w-formulier' onSubmit={(e) => { e.preventDefault(); void bewaar(p); }} autoComplete='off'>
                        {p.id === 'google' && stand && !stand.isEigenaar ? <p className='il-d-noot' data-let-op='ja'>{tr('Ви не власник сайту (OWNER_EMAIL): Google-клієнт зі сховища читається лише зі сховища власника. Збережіть його під обліковим записом власника або через серверну команду.', 'U bent niet de eigenaar (OWNER_EMAIL): de Google-client uit de kluis wordt alleen uit de kluis van de eigenaar gelezen. Sla hem op onder het eigenaarsaccount of via de serveropdracht.')}</p> : null}
                        {p.id === 'stripe' ? (
                          <label className='il-w-veld'><span>{tr('Обмежений ключ (restricted key)', 'Beperkte sleutel (restricted key)')}</span><GeheimInvoer lang={lang} value={v.secret} onChange={(secret) => setInvoer((x) => ({ ...x, [p.id]: { ...x[p.id], secret } }))} autoComplete='new-password' spellCheck={false} placeholder='rk_live_…' max={8192} soort='integratie' data={{ geheim: 'ja' }} /></label>
                        ) : p.id === 'github-app' ? (
                          <label className='il-w-veld'><span>{tr('App ID + приватний ключ (PEM)', 'App ID + persoonlijke sleutel (PEM)')}</span>
                            <GeheimInvoer lang={lang} value={v.pem} onChange={(pem) => setInvoer((x) => ({ ...x, [p.id]: { ...x[p.id], pem } }))} rijen={6} spellCheck={false} autoComplete='off' max={16384} soort='pem' placeholder={'app_id: 123456\n-----BEGIN RSA PRIVATE' + ' KEY-----\n…\n-----END RSA PRIVATE' + ' KEY-----' /* opgeknipt: anders ziet de geheimenscan van de uitrol deze placeholder als sleutel */} data={{ geheim: 'ja' }} />
                          </label>
                        ) : (
                          <>
                            <label className='il-w-veld'><span>Client ID</span><input type='text' value={v.id} onChange={(e) => setInvoer((x) => ({ ...x, [p.id]: { ...x[p.id], id: e.target.value } }))} autoComplete='off' spellCheck={false} inputMode='text' /></label>
                            <label className='il-w-veld'><span>Client secret</span><GeheimInvoer lang={lang} value={v.secret} onChange={(secret) => setInvoer((x) => ({ ...x, [p.id]: { ...x[p.id], secret } }))} autoComplete='new-password' spellCheck={false} max={8192} soort='integratie' data={{ geheim: 'ja' }} /></label>
                          </>
                        )}
                        <p className='il-d-noot'>{tr(`Записується у ваше зашифроване сховище (призначення «${p.kluisDoel}», назва «${p.kluisNaam}»); при збереженні сайт попросить passkey або код. Діє одразу, без перезапуску сервера.`, `Gaat naar uw versleutelde kluis (doel «${p.kluisDoel}», naam «${p.kluisNaam}»); bij het opslaan vraagt de site een passkey of code. Werkt meteen, zonder herstart.`)}{p.id === 'google' ? ` ${tr('Виняток: кнопка «Увійти через Google» підхоплює нового клієнта протягом 5 хвилин. Якщо на сервері задано env-змінні GOOGLE_OAUTH_CLIENT_ID/SECRET, вони мають пріоритет над сховищем.', 'Uitzondering: «Aanmelden met Google» pikt een nieuwe client binnen 5 minuten op. Staan GOOGLE_OAUTH_CLIENT_ID/SECRET als env op de server, dan winnen die van de kluis.')}` : ''}</p>
                        <button type='submit' className='il-knop is-primair' disabled={bezig !== ''}>{bezig === `save:${p.id}` ? tr('Зберігаємо…', 'Opslaan…') : tr('Зберегти у сховищі', 'In de kluis opslaan')}</button>
                      </form>
                    ) : (
                      <>
                        <p className='il-d-noot'>{tr('Ці значення сервер читає лише з /etc/mijn-ruimte/geheimen.env (root). Через браузер їх не записати — сайт свідомо не має root. На сервері, від робочого користувача (напр. beheer):', 'Deze waarden leest de server alleen uit /etc/mijn-ruimte/geheimen.env (root). Via de browser kan dat niet — de site heeft bewust geen root. Op de server, als werkgebruiker (bv. beheer):')}</p>
                        <div className='il-w-opdracht'><code>{p.serverOpdracht}</code><Kopieer tekst={p.serverOpdracht} lang={lang} label='opdracht' /></div>
                        <p className='il-d-noot'>{tr('Команда запитує значення приховано (без ехо, не в аргументах, не в історії), перевіряє формат, пише атомарно, перезапускає сервіс і перевіряє, що сайт відповідає. Потім натисніть «Перевірити» тут.', 'De opdracht vraagt de waarden verborgen (geen echo, niet in argumenten, niet in de geschiedenis), controleert het formaat, schrijft atomisch, herstart de dienst en controleert of de site antwoordt. Kies daarna hier «Controleren».')}</p>
                      </>
                    )}
                    {p.id === 'google' ? <p className='il-d-noot'>{tr('Альтернатива для Google — та сама серверна команда:', 'Alternatief voor Google — dezelfde serveropdracht:')} <code>{p.serverOpdracht}</code></p> : null}
                    {ps ? <ul className='il-w-env'>{Object.entries(ps.env).map(([n, ok]) => <li key={n} data-ok={ok ? 'ja' : 'nee'}><code>{n}</code> {ok ? tr('задано', 'ingesteld') : tr('не задано', 'niet ingesteld')}</li>)}</ul> : null}
                  </section>

                  <section className='il-d-sectie'>
                    <h4><RefreshCw aria-hidden />{tr('Остання перевірка', 'Laatste controle')}</h4>
                    {ps?.controle ? <p className='il-d-controle' data-stand={ps.controle.stand}><b>{t(STAND_TEKST[ps.controle.stand])}</b> · {datum(ps.controle.op, lang)}<br />{wizardCodeTekst(ps.controle.code, lang, undefined, ps.controle.detail)}{ps.controle.detail ? <small> ({ps.controle.detail})</small> : null}</p> : <p className='il-d-noot'>{tr('Ще не перевіряли. «Перевірити» звертається до сервісу напряму: Google і Microsoft — token endpoint із тестовим кодом, GitHub — /applications/{client_id}/token; секрет лишається на сервері.', 'Nog niet gecontroleerd. «Controleren» spreekt de dienst rechtstreeks aan: Google en Microsoft het token endpoint met een testcode, GitHub /applications/{client_id}/token; het secret blijft op de server.')}</p>}
                    {ps?.herstartNodig ? <p className='il-d-noot'>{tr('Після зміни env потрібен перезапуск сервісу — серверна команда робить це сама.', 'Na een wijziging van env is een herstart nodig — de serveropdracht doet dat zelf.')}</p> : null}
                  </section>

                  {b ? <p className='il-d-bericht' data-soort={b.soort} role='status'>{b.soort === 'fout' ? <TriangleAlert aria-hidden /> : <CheckCircle2 aria-hidden />}{b.tekst}</p> : null}
                </div>
              ) : null}
            </section>
          );
        })}
      </div>

      <section className='il-d-sectie'>
        <h4><ShieldCheck aria-hidden />{tr('Без майстра (нічого реєструвати не треба)', 'Zonder wizard (niets te registreren)')}</h4>
        <ul>
          <li>{tr('Пошта через пароль застосунку (iCloud, Ukr.net, Yahoo, I.ua): користувач вводить пароль застосунку на сторінці Пошта → Акаунти; сервер перевіряє його у IMAP/SMTP самої служби. Потрібен лише MAIL_APP_WACHTWOORD_SLEUTEL_V1 (вище).', 'Mail met app-wachtwoord (iCloud, Ukr.net, Yahoo, I.ua): de gebruiker voert het app-wachtwoord in op E-mail → Accounts; de server controleert het bij IMAP/SMTP van de dienst zelf. Alleen MAIL_APP_WACHTWOORD_SLEUTEL_V1 is nodig (hierboven).')}</li>
          <li>{tr('Календар CalDAV / ICS: адреса, логін і пароль застосунку на сторінці Календар; потрібен AGENDA_ABONNEMENT_SLEUTEL_V1.', 'Agenda CalDAV / ICS: adres, login en app-wachtwoord op de pagina Agenda; AGENDA_ABONNEMENT_SLEUTEL_V1 is nodig.')}</li>
          <li>{tr('Cloudflare Tunnel: налаштовується на сервері (deploy/cloudflared-config.yml), не через OAuth.', 'Cloudflare Tunnel: op de server (deploy/cloudflared-config.yml), niet via OAuth.')}</li>
        </ul>
      </section>
    </div>
  );
}
