// UI-003 — Verbindingencentrum «Хмарне сховище → Акаунти» (vlag verbindingen-centrum-v2, migratie 0151, standaard UIT).
// Eén rustig beheercentrum in plaats van een technische providerlijst. Leest ALLEEN bestaande, levende bronnen:
//   • /api/owner/cloud/vnext/integraties (backend/cloud-vnext-integraties.ts) — Google-accounts, Photos-scope, M4-accounts,
//     zoekindex, en sinds UI-003 additief per Drive-account de echte syncstand (laatst gelukt / laatste poging / foutcode);
//   • /api/owner/cloud/vnext/taken (lijst) — de echte geschiedenis van overdrachten tussen opslagdiensten;
//   • koppelen/opnieuw autoriseren via de BESTAANDE route providers/google/connect/start (popup vóór de await).
// Niets heet «підключено» zonder levende controle; geen koppelknop waar er geen echte stroom is. Namen van omgevings-
// variabelen, staging-vlaggen en interne codes staan alleen in ingeklapte «Технічні деталі».
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, Clock, FolderSync, History, Link2, LoaderCircle, Plus, RefreshCw, Settings2 } from 'lucide-react';
import { CLOUD_VNEXT_AANBIEDERS, cloudTekst, type CloudVnextAanbieder } from '../../shared/cloud-vnext-model';
import type { CloudTaak } from '../../shared/cloud-overdracht-model';
import { cloudClient, CloudFout, type IntegratiesUit } from '../cloud-vnext/cloud-client';
import Logo from '../merk/MerkLogo';
import { accountStand, probleemUitleg, soortVan, wanneer, type AccountStand, type Soort } from './verbindingen-logica';
import './verbindingen.css';

type Lang = 'uk' | 'nl';
const tr = (lang: Lang, uk: string, nl: string) => (lang === 'uk' ? uk : nl);
const POLL_MS = 3000, POLL_MAX_MS = 4 * 60_000;

/** Echte merkvormen uit src/merk (niets verzonnen); zonder sleutel tekent Logo een monogram. */
export const MERK: Record<string, string> = {
  'google-drive': 'googledrive', 'google-photos': 'googlephotos', onedrive: 'microsoftonedrive', dropbox: 'dropbox', box: 'box',
  'icloud-drive': 'icloud', mega: 'mega', nextcloud: 'nextcloud', 'gmail-bijlagen': 'gmail',
};
/** Korte, eerlijke beschrijving van wat je ermee kunt (de lange uitleg blijft in de details). */
const KORT: Record<string, [string, string]> = {
  'google-drive': ['Теки, пошук, завантаження, перейменування, кошик; кілька акаунтів.', 'Mappen, zoeken, uploaden, hernoemen, prullenbak; meerdere accounts.'],
  'google-photos': ['Імпорт вибраних фото у вашу хмару.', 'Gekozen foto’s importeren in uw cloud.'],
  'gmail-bijlagen': ['Вкладення з листів зберігаються у хмару зі сторінки Пошти.', 'Bijlagen uit mails bewaren in de cloud via E-mail.'],
  onedrive: ['Перегляд тек і файлів (лише читання).', 'Mappen en bestanden bekijken (alleen lezen).'],
  dropbox: ['Перегляд тек і файлів (лише читання).', 'Mappen en bestanden bekijken (alleen lezen).'],
  box: ['Перегляд тек і файлів (лише читання).', 'Mappen en bestanden bekijken (alleen lezen).'],
};

const SOORT_LABEL: Record<Soort, [string, string]> = {
  verbonden: ['Підключено', 'Gekoppeld'], beschikbaar: ['Можна підключити', 'Kan gekoppeld worden'], beperkt: ['Потрібне налаштування сервера', 'Serverinstelling nodig'],
  gepland: ['Заплановано', 'Gepland'], onmogelijk: ['Недоступно з вебу', 'Niet mogelijk via het web'],
};
const STAND_LABEL: Record<AccountStand, [string, string]> = { ok: ['Працює', 'Werkt'], aandacht: ['Потребує уваги', 'Vraagt aandacht'], uit: ['Відключено', 'Losgekoppeld'], bezig: ['Триває', 'Bezig'] };

/** Eén «?» per blok: een kleine knop die een korte uitleg onder de kop uitklapt. */
function Uitleg({ lang, id, children }: { lang: Lang; id: string; children: string }) {
  const [open, setOpen] = useState(false);
  return <>
    <button type='button' className='vbc-vraag is-icoon' aria-expanded={open} aria-controls={`vbc-u-${id}`} onClick={() => setOpen((v) => !v)} aria-label={tr(lang, 'Що це?', 'Wat is dit?')} data-vbc-vraag={id}>?</button>
    {open ? <p id={`vbc-u-${id}`} className='vbc-uitleg'>{children}</p> : null}
  </>;
}
const Badge = ({ soort, tekst }: { soort: string; tekst: string }) => <span className={`vbc-badge is-${soort}`}>{tekst}</span>;

export default function VerbindingenCentrum({ lang, naarTab }: { lang: Lang; naarTab: (t: string) => void }) {
  const [data, setData] = useState<IntegratiesUit | null>(null);
  const [taken, setTaken] = useState<CloudTaak[] | null>(null);
  const [fout, setFout] = useState('');
  const [laden, setLaden] = useState(true);
  const [bezig, setBezig] = useState(false);
  const [wachten, setWachten] = useState(false);
  const poll = useRef<{ timer: number; tot: number; was: number } | null>(null);
  const catalogusRef = useRef<HTMLElement | null>(null);
  const foutTekst = (code: string) => code === 'NETWERK' || code === 'FOUT' ? tr(lang, 'Не вдалося отримати стан підключень. Перевірте зʼєднання і спробуйте ще раз.', 'De status van de koppelingen kon niet worden opgehaald. Controleer de verbinding en probeer opnieuw.') : tr(lang, 'Не вдалося отримати стан підключень.', 'De status van de koppelingen kon niet worden opgehaald.');

  const laad = useCallback(async (): Promise<IntegratiesUit | null> => {
    try { const v = await cloudClient.integraties(); setData(v); setFout(''); return v; }
    catch (e) { setFout(foutTekst(e instanceof CloudFout ? e.code : 'FOUT')); return null; }
    finally { setLaden(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);
  useEffect(() => { void laad(); }, [laad]);
  useEffect(() => { let leeft = true; cloudClient.taken({ actie: 'lijst' }).then((r) => { if (leeft) setTaken(r.taken || []); }).catch(() => { if (leeft) setTaken([]); }); return () => { leeft = false; }; }, []);

  const dataRef = useRef<IntegratiesUit | null>(null); dataRef.current = data;
  const stopPoll = useCallback(() => { if (poll.current) { window.clearInterval(poll.current.timer); poll.current = null; } setWachten(false); }, []);
  useEffect(() => () => { if (poll.current) window.clearInterval(poll.current.timer); }, []);
  const startPoll = useCallback(() => {
    stopPoll(); setWachten(true);
    const tel = (d: IntegratiesUit | null) => d?.google.accounts.filter((a) => accountStand(a) === 'ok').length ?? 0;
    const was = tel(dataRef.current);
    const timer = window.setInterval(async () => {
      if (!poll.current || Date.now() > poll.current.tot) { stopPoll(); return; }
      const v = await laad();
      if (v && tel(v) > poll.current.was) stopPoll();
    }, POLL_MS);
    poll.current = { timer, tot: Date.now() + POLL_MAX_MS, was };
  }, [laad, stopPoll]);

  /** Bestaande Google-route; popup opent VÓÓR de await (anders blokkeert de browser hem). */
  const google = async (rol: 'primary' | 'additional') => {
    if (bezig) return;
    const venster = window.open('about:blank', 'cloud-google-koppeling', 'popup=yes,width=520,height=720');
    setBezig(true);
    try {
      const r = await cloudClient.googleStart(rol);
      if (r.authUrl) { if (venster) venster.location.href = r.authUrl; else location.assign(r.authUrl); startPoll(); }
      else { venster?.close(); await laad(); }
    } catch (e) { venster?.close(); setFout(foutTekst(e instanceof CloudFout ? e.code : 'FOUT')); }
    finally { setBezig(false); }
  };

  const gAccounts = data?.google.accounts || [];
  const m4Accounts = (data?.m4.aanbieders || []).flatMap((f) => f.accounts.map((acc) => ({ ...acc, familie: f.id })));
  const telling = useMemo(() => {
    const st = gAccounts.map(accountStand);
    const ok = st.filter((s) => s === 'ok').length + m4Accounts.filter((a) => a.status === 'connected').length + (data?.photos.gekoppeld ? 1 : 0);
    const aandacht = st.filter((s) => s === 'aandacht').length + m4Accounts.filter((a) => a.status === 'reauth_required').length;
    const beschikbaar = CLOUD_VNEXT_AANBIEDERS.filter((a) => soortVan(a, data) === 'beschikbaar').length;
    const laatste = Math.max(0, ...gAccounts.map((a) => a.sync?.laatstGeluktOp || 0));
    return { ok, aandacht, beschikbaar, laatste };
  }, [data, gAccounts, m4Accounts]);

  const naarCatalogus = () => { const el = catalogusRef.current; if (!el) return; el.scrollIntoView({ behavior: 'smooth', block: 'start' }); (el.querySelector('h3') as HTMLElement | null)?.focus(); };
  const aanbieder = (id: string) => CLOUD_VNEXT_AANBIEDERS.find((a) => a.id === id);
  const naamFamilie = (id: string) => aanbieder(id)?.naam || id;

  if (laden) return <div className='vbc' data-vbc-centrum='laden'><p className='vbc-hint' role='status' aria-busy='true'><LoaderCircle className='vbc-draai' aria-hidden='true' />{tr(lang, 'Перевіряємо підключення…', 'Koppelingen controleren…')}</p></div>;

  const groepen: Array<[Soort, CloudVnextAanbieder[]]> = (['verbonden', 'beschikbaar', 'beperkt', 'gepland', 'onmogelijk'] as Soort[]).map((s) => [s, CLOUD_VNEXT_AANBIEDERS.filter((a) => soortVan(a, data) === s)]);
  const heeftIets = gAccounts.length > 0 || m4Accounts.length > 0 || Boolean(data?.photos.gekoppeld);

  return (
    <div className='vbc' data-vbc-centrum=''>
      <header className='vbc-kop'>
        <div><h2 id='vbc-titel'>{tr(lang, 'Підключення', 'Koppelingen')}</h2><p className='vbc-hint'>{tr(lang, 'Ваші хмарні акаунти та сервіси в одному місці.', 'Uw cloudaccounts en diensten op één plek.')}</p></div>
        <button type='button' className='vbc-knop is-hoofd' onClick={naarCatalogus} data-vbc-actie='toevoegen'><Plus aria-hidden='true' />{tr(lang, 'Додати підключення', 'Koppeling toevoegen')}</button>
      </header>

      {fout ? <p className='vbc-melding is-fout' role='alert'><AlertTriangle aria-hidden='true' />{fout}<button type='button' className='vbc-knop is-klein' onClick={() => { setLaden(true); void laad(); }}><RefreshCw aria-hidden='true' />{tr(lang, 'Ще раз', 'Opnieuw')}</button></p> : null}
      {wachten ? <p className='vbc-melding is-info' role='status'><LoaderCircle className='vbc-draai' aria-hidden='true' />{tr(lang, 'Вікно входу Google відкрито. Після входу список оновиться сам.', 'Het Google-aanmeldvenster is open. Na het aanmelden ververst de lijst vanzelf.')}<button type='button' className='vbc-knop is-klein' onClick={stopPoll}>{tr(lang, 'Скасувати', 'Annuleren')}</button></p> : null}

      <section className='vbc-overzicht' aria-label={tr(lang, 'Стан', 'Status')} data-vbc-overzicht=''>
        <div className='vbc-tegel' data-vbc-tel='ok'><CheckCircle2 aria-hidden='true' className='is-ok' /><strong>{telling.ok}</strong><span>{tr(lang, 'працюють', 'werken')}</span></div>
        <div className={`vbc-tegel${telling.aandacht ? ' is-aandacht' : ''}`} data-vbc-tel='aandacht'><AlertTriangle aria-hidden='true' /><strong>{telling.aandacht}</strong><span>{tr(lang, 'потребують уваги', 'vragen aandacht')}</span></div>
        <div className='vbc-tegel' data-vbc-tel='beschikbaar'><Link2 aria-hidden='true' /><strong>{telling.beschikbaar}</strong><span>{tr(lang, 'можна підключити', 'te koppelen')}</span></div>
        <div className='vbc-tegel' data-vbc-tel='sync'><Clock aria-hidden='true' /><strong className='is-tekst'>{telling.laatste ? wanneer(lang, telling.laatste) : '—'}</strong><span>{tr(lang, 'остання синхронізація', 'laatste synchronisatie')}</span></div>
      </section>

      <section className='vbc-blok' aria-labelledby='vbc-mijn'>
        <div className='vbc-blokkop'><h3 id='vbc-mijn'>{tr(lang, 'Мої підключення', 'Mijn koppelingen')}</h3><Uitleg lang={lang} id='mijn'>{tr(lang, 'Акаунти, які вже підключені. Стан перевіряється наживо при кожному відкритті сторінки. Ключі доступу зберігаються на сервері зашифрованими й не потрапляють у браузер.', 'Accounts die al gekoppeld zijn. De status wordt live gecontroleerd bij elke opening. Toegangssleutels staan versleuteld op de server en komen nooit in de browser.')}</Uitleg></div>
        {!heeftIets ? (
          <div className='vbc-leeg' data-vbc-leeg='mijn'><p>{tr(lang, 'Ще нічого не підключено.', 'Nog niets gekoppeld.')}</p><button type='button' className='vbc-knop is-hoofd' disabled={bezig} onClick={() => void google('primary')} data-vbc-actie='google-koppelen'><Link2 aria-hidden='true' />{tr(lang, 'Підключити Google Drive', 'Google Drive koppelen')}</button></div>
        ) : (
          <ul className='vbc-lijst'>
            {gAccounts.map((a, i) => {
              const st = accountStand(a), p = probleemUitleg(lang, a);
              return (
                <li key={a.id} className={`vbc-kaart is-${st}`} data-vbc-account={a.id} data-vbc-stand={st}>
                  <div className='vbc-kaart-kop'>
                    <Logo id='google-drive' naam='Google Drive' logo={MERK['google-drive']} maat={36} />
                    <div className='vbc-naam'><strong>Google Drive</strong><span>{a.email || tr(lang, 'без адреси', 'zonder adres')}{a.actief ? ` · ${tr(lang, 'основний', 'actief')}` : ''}</span></div>
                    <Badge soort={st} tekst={tr(lang, ...STAND_LABEL[st])} />
                  </div>
                  <p className='vbc-hint'>{tr(lang, 'Остання синхронізація: ', 'Laatste synchronisatie: ')}<span data-vbc-laatst={a.sync?.laatstGeluktOp || 0}>{a.status === 'connected' ? wanneer(lang, a.sync?.laatstGeluktOp || 0) : '—'}</span></p>
                  {p ? <p className='vbc-melding is-waarschuwing' data-vbc-probleem={p.actie}><AlertTriangle aria-hidden='true' />{p.tekst}</p> : null}
                  <div className='vbc-acties'>
                    {st === 'aandacht' && p?.actie === 'opnieuw' || st === 'uit' ? <button type='button' className='vbc-knop is-hoofd' disabled={bezig} onClick={() => void google(i === 0 ? 'primary' : 'additional')} data-vbc-actie='opnieuw'><RefreshCw aria-hidden='true' />{tr(lang, 'Повторно підключити', 'Opnieuw koppelen')}</button> : null}
                    {a.status === 'connected' ? <button type='button' className='vbc-knop' onClick={() => naarTab('google')} data-vbc-actie='beheren'><Settings2 aria-hidden='true' />{tr(lang, 'Керувати', 'Beheren')}</button> : null}
                  </div>
                  {a.sync?.foutCode || a.status !== 'connected' ? <details className='vbc-tech'><summary>{tr(lang, 'Технічні деталі', 'Technische details')}</summary><dl><dt>{tr(lang, 'Стан', 'Status')}</dt><dd><code>{a.status}</code></dd>{a.sync?.foutCode ? <><dt>{tr(lang, 'Код', 'Code')}</dt><dd><code>{a.sync.foutCode}</code></dd></> : null}{a.sync ? <><dt>{tr(lang, 'Остання спроба', 'Laatste poging')}</dt><dd>{wanneer(lang, a.sync.laatstPogingOp)}</dd></> : null}</dl></details> : null}
                </li>
              );
            })}
            {data?.photos.gekoppeld ? (
              <li className='vbc-kaart is-ok' data-vbc-account='google-photos' data-vbc-stand='ok'>
                <div className='vbc-kaart-kop'><Logo id='google-photos' naam='Google Photos' logo={MERK['google-photos']} maat={36} /><div className='vbc-naam'><strong>Google Photos</strong><span>{tr(lang, ...KORT['google-photos'])}</span></div><Badge soort='ok' tekst={tr(lang, ...STAND_LABEL.ok)} /></div>
                <div className='vbc-acties'><button type='button' className='vbc-knop' onClick={() => naarTab('photos')} data-vbc-actie='fotos'><Settings2 aria-hidden='true' />{tr(lang, 'Керувати', 'Beheren')}</button></div>
              </li>
            ) : null}
            {m4Accounts.map((acc) => {
              const st: AccountStand = acc.status === 'connected' ? 'ok' : acc.status === 'reauth_required' ? 'aandacht' : 'uit';
              return (
                <li key={acc.id} className={`vbc-kaart is-${st}`} data-vbc-account={acc.id} data-vbc-stand={st}>
                  <div className='vbc-kaart-kop'><Logo id={acc.familie} naam={naamFamilie(acc.familie)} logo={MERK[acc.familie] || ''} maat={36} /><div className='vbc-naam'><strong>{naamFamilie(acc.familie)}</strong><span>{acc.label}</span></div><Badge soort={st} tekst={tr(lang, ...STAND_LABEL[st])} /></div>
                  <p className='vbc-hint'>{tr(lang, 'Пробний режим: лише перегляд. Керування з цієї сторінки ще не доступне.', 'Proefmodus: alleen bekijken. Beheer vanaf deze pagina is nog niet beschikbaar.')}</p>
                </li>
              );
            })}
          </ul>
        )}
        {data?.google.gekoppeld ? <div className='vbc-acties'><button type='button' className='vbc-knop' disabled={bezig} onClick={() => void google('additional')} data-vbc-actie='extra-account'><Plus aria-hidden='true' />{tr(lang, 'Додати акаунт Google', 'Google-account toevoegen')}</button></div> : null}
      </section>

      <section className='vbc-blok' aria-labelledby='vbc-catalogus' ref={catalogusRef} data-vbc-catalogus=''>
        <div className='vbc-blokkop'><h3 id='vbc-catalogus' tabIndex={-1}>{tr(lang, 'Каталог сервісів', 'Catalogus van diensten')}</h3><Uitleg lang={lang} id='catalogus'>{tr(lang, '«Можна підключити» працює вже зараз. «Потрібне налаштування сервера» — код готовий, але адміністратор ще має його увімкнути. «Заплановано» і «Недоступно з вебу» не мають кнопки підключення; для них показано, як перенести файли вручну.', '«Kan gekoppeld worden» werkt nu al. «Serverinstelling nodig» — de code is klaar, de beheerder moet het nog aanzetten. «Gepland» en «Niet mogelijk via het web» hebben geen koppelknop; daar staat hoe u bestanden handmatig overzet.')}</Uitleg></div>
        {groepen.filter(([s, l]) => s !== 'verbonden' && l.length).map(([s, lijst]) => (
          <div key={s} className='vbc-groep' data-vbc-groep={s}>
            <h4>{tr(lang, ...SOORT_LABEL[s])} <span className='vbc-tel'>{lijst.length}</span></h4>
            <ul className='vbc-raster'>
              {lijst.map((a) => <CatalogusKaart key={a.id} lang={lang} a={a} soort={s} bezig={bezig} data={data} onGoogle={() => void google(data?.google.gekoppeld ? 'additional' : 'primary')} naarTab={naarTab} />)}
            </ul>
          </div>
        ))}
      </section>

      <section className='vbc-blok' aria-labelledby='vbc-sync' data-vbc-sync=''>
        <div className='vbc-blokkop'><h3 id='vbc-sync'><FolderSync aria-hidden='true' />{tr(lang, 'Синхронізація', 'Synchronisatie')}</h3><Uitleg lang={lang} id='sync'>{tr(lang, 'Google Drive оновлюється у фоні приблизно кожні 5 хвилин. Google Photos — лише імпорт фото, які ви самі обрали. Двостороння синхронізація з іншими сховищами ще не існує.', 'Google Drive wordt ongeveer elke 5 minuten op de achtergrond bijgewerkt. Google Photos: alleen import van foto’s die u zelf kiest. Tweerichtingssynchronisatie met andere opslag bestaat nog niet.')}</Uitleg></div>
        <ul className='vbc-synclijst'>
          {gAccounts.filter((a) => a.status === 'connected').map((a) => <li key={a.id} data-vbc-sync-account={a.id}><span>{a.email}</span><span className='vbc-hint'>{a.sync ? wanneer(lang, a.sync.laatstGeluktOp) : tr(lang, 'ще не було', 'nog nooit')}</span></li>)}
          {!gAccounts.some((a) => a.status === 'connected') ? <li className='vbc-hint'>{tr(lang, 'Немає акаунтів для синхронізації.', 'Geen accounts om te synchroniseren.')}</li> : null}
          <li><span>{tr(lang, 'Пошук знає вашу хмару', 'Zoeken kent uw cloud')}</span><span className='vbc-hint'>{data?.zoekIndex.cloud ? tr(lang, 'так', 'ja') : tr(lang, 'ні', 'nee')}</span></li>
          <li><span>{tr(lang, 'Пошук знає Google Drive', 'Zoeken kent Google Drive')}</span><span className='vbc-hint'>{data?.zoekIndex.drive ? tr(lang, 'так', 'ja') : tr(lang, 'ні', 'nee')}</span></li>
        </ul>
      </section>

      <section className='vbc-blok' aria-labelledby='vbc-historie' data-vbc-historie=''>
        <div className='vbc-blokkop'><h3 id='vbc-historie'><History aria-hidden='true' />{tr(lang, 'Історія', 'Geschiedenis')}</h3><Uitleg lang={lang} id='historie'>{tr(lang, 'Останні копіювання й переміщення файлів між вашою хмарою і Google Drive.', 'De laatste kopieer- en verplaatsacties tussen uw cloud en Google Drive.')}</Uitleg></div>
        {taken === null ? <p className='vbc-hint' role='status'>{tr(lang, 'Завантаження…', 'Laden…')}</p> : taken.length === 0 ? <p className='vbc-hint' data-vbc-leeg='historie'>{tr(lang, 'Ще нічого не переносилось.', 'Er is nog niets overgezet.')}</p> : (
          <ul className='vbc-synclijst'>
            {taken.slice(0, 8).map((t) => <li key={t.id} data-vbc-taak={t.stand}><span>{t.soort === 'kopie' ? tr(lang, 'Копія', 'Kopie') : tr(lang, 'Переміщення', 'Verplaatsing')}: {t.naam}</span><span className={`vbc-hint is-${t.stand}`}>{({ wacht: tr(lang, 'в черзі', 'in de rij'), bezig: tr(lang, 'триває', 'bezig'), klaar: tr(lang, 'готово', 'klaar'), fout: tr(lang, 'помилка', 'fout'), geannuleerd: tr(lang, 'скасовано', 'geannuleerd') } as Record<string, string>)[t.stand]} · {wanneer(lang, Date.parse(t.bijgewerktOp) || 0)}</span></li>)}
          </ul>
        )}
      </section>
    </div>
  );
}

function CatalogusKaart({ lang, a, soort, bezig, data, onGoogle, naarTab }: { lang: Lang; a: CloudVnextAanbieder; soort: Soort; bezig: boolean; data: IntegratiesUit | null; onGoogle: () => void; naarTab: (t: string) => void }) {
  const [open, setOpen] = useState(false);
  const kort = KORT[a.id] ? tr(lang, ...KORT[a.id]) : cloudTekst(a.uitleg, lang);
  const m4 = data?.m4.aanbieders.find((x) => x.id === a.id) || null;
  const actie = soort === 'beschikbaar' ? (a.id === 'google-drive' ? <button type='button' className='vbc-knop is-hoofd' disabled={bezig} onClick={onGoogle} data-vbc-actie='koppelen'><Link2 aria-hidden='true' />{tr(lang, 'Підключити', 'Koppelen')}</button>
    : a.id === 'google-photos' ? <button type='button' className='vbc-knop' onClick={() => naarTab('photos')} data-vbc-actie='fotos'><Link2 aria-hidden='true' />{tr(lang, 'Підключити у «Фото»', 'Koppelen bij Foto’s')}</button>
    : a.id === 'gmail-bijlagen' ? <a className='vbc-knop' href='https://mail.tarasevych.com/' data-vbc-actie='mail'>{tr(lang, 'Відкрити Пошту', 'E-mail openen')}</a> : null) : null;
  return (
    <li className={`vbc-kaart is-${soort}`} data-vbc-aanbieder={a.id} data-vbc-soort={soort}>
      <div className='vbc-kaart-kop'>
        <Logo id={a.id} naam={a.naam} logo={MERK[a.id] || ''} maat={32} />
        <div className='vbc-naam'><strong>{a.naam}</strong><span>{kort}</span></div>
      </div>
      <div className='vbc-acties'>
        <Badge soort={soort} tekst={tr(lang, ...SOORT_LABEL[soort])} />
        {actie}
        <button type='button' className='vbc-knop is-stil' aria-expanded={open} onClick={() => setOpen((v) => !v)} data-vbc-actie='details'>{tr(lang, 'Деталі', 'Details')}<ChevronDown aria-hidden='true' className={open ? 'is-open' : ''} /></button>
      </div>
      {open ? (
        <div className='vbc-details'>
          <p>{cloudTekst(a.uitleg, lang)}</p>
          {soort === 'beperkt' ? <p className='vbc-hint'>{tr(lang, 'Код уже є, але адміністратор сервера ще не увімкнув цей сервіс. До того кнопки підключення не буде.', 'De code is er, maar de serverbeheerder heeft deze dienst nog niet aangezet. Tot dan is er geen koppelknop.')}</p> : soort !== 'onmogelijk' && soort !== 'gepland' ? <p className='vbc-hint'>{cloudTekst(a.detail, lang)}</p> : null}
          {a.omweg ? <p className='vbc-omweg'>{cloudTekst(a.omweg, lang)}</p> : null}
          {soort === 'beperkt' || soort === 'gepland' || soort === 'onmogelijk' ? (
            <details className='vbc-tech' data-vbc-tech={a.id}><summary>{tr(lang, 'Технічні деталі (для адміністратора)', 'Technische details (voor de beheerder)')}</summary>
              <p>{cloudTekst(a.detail, lang)}</p>
              {a.vereist?.length ? <ul>{a.vereist.map((n) => <li key={n}><code>{n}</code>{n.endsWith('_CLIENT_ID') || n.endsWith('_CLIENT_SECRET') ? ` — ${m4 ? (m4.sleutelsAanwezig ? tr(lang, 'є', 'aanwezig') : tr(lang, 'немає', 'ontbreekt')) : '?'}` : n === 'CLOUD_M4_CONNECTIONS_STAGING' && data ? ` — ${data.m4.stagingAan ? tr(lang, 'увімкнено', 'aan') : tr(lang, 'вимкнено', 'uit')}` : ''}</li>)}</ul> : null}
            </details>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
