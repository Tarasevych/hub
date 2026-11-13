// Cloud vNext — INTEGRATIES: het eerlijke integratiecentrum. De statische catalogus (shared/cloud-vnext-model.ts) zegt wat er
// in de code zit; de route /api/owner/cloud/vnext/integraties (backend/cloud-vnext-integraties.ts) zegt wat er LEEFT (Google-
// accounts, M4-sleutels op de server, zoekindex). Niets heet «підключено» zonder die levende controle, en er bestaat geen
// koppelknop voor een aanbieder waarvan de sleutels of de code ontbreken — de kaart zegt dan eerlijk wat de eigenaar moet doen.
// Google koppelen loopt via de BESTAANDE route (providers/google/connect/start) in een popup die vóór de await opengaat
// (popup-blokkering), daarna peilt dit scherm de levende status elke 3 s, hoogstens 4 minuten.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, ExternalLink, FolderSync, Link2, LoaderCircle, Lock, Minus, Plus, RefreshCw, Search, Settings2, X } from 'lucide-react';
import { CLOUD_RICHTING_LABEL, CLOUD_STAND_LABEL, CLOUD_VNEXT_AANBIEDERS, cloudTekst, type CloudVnextAanbieder } from '../../../shared/cloud-vnext-model';
import { OVERDRACHT_GRENZEN } from '../../../shared/cloud-overdracht-model';
import { cloudClient, CloudFout, type IntegratiesUit } from '../cloud-client';
import type { OnderdeelProps } from '../CloudPagina';
import { foutTekst, tr, type Lang } from '../tekst';

import { registerGroep } from '../register-koppeling';
import { useCatalogusV2 } from '../../integraties/catalogus-vlag';

const POLL_MS = 3000, POLL_MAX_MS = 4 * 60_000;

/** Statuswoord van een account, vertaald waar bekend; onbekende codes blijven zichtbaar (eerlijk, niets verzonnen). */
export const accountStatusTekst = (lang: Lang, status: string): string => {
  const map: Record<string, [string, string]> = {
    connected: ['підключено', 'gekoppeld'], reauth_required: ['потрібен повторний вхід', 'opnieuw aanmelden nodig'],
    disconnected: ['відключено', 'losgekoppeld'], disconnect_pending: ['відключення триває', 'loskoppelen bezig'],
    pending: ['очікує', 'wacht'], revoked: ['відкликано', 'ingetrokken'], not_connected: ['не підключено', 'niet gekoppeld'],
  };
  const p = map[status]; return p ? tr(lang, p[0], p[1]) : status;
};

/**
 * Checklist van de omgevingsvariabelen uit `vereist` (alleen 'sleutels-nodig'), met de LEVENDE m4-stand van de server:
 * ja/nee voor de ID+SECRET-paar (de server meldt het paar als één boolean) en voor CLOUD_M4_CONNECTIONS_STAGING; de overige
 * vlaggen rapporteert deze route niet — dat staat er dan eerlijk bij in plaats van een verzonnen vinkje.
 */
export function SleutelsChecklist({ lang, aanbieder, m4 }: { lang: Lang; aanbieder: CloudVnextAanbieder; m4: IntegratiesUit['m4'] | null }) {
  const rij = m4?.aanbieders.find((x) => x.id === aanbieder.id) || null;
  const standVan = (naam: string): 'ja' | 'nee' | 'onbekend' => {
    if (!m4) return 'onbekend';
    if (naam.endsWith('_CLIENT_ID') || naam.endsWith('_CLIENT_SECRET')) return rij ? (rij.sleutelsAanwezig ? 'ja' : 'nee') : 'onbekend';
    if (naam === 'CLOUD_M4_CONNECTIONS_STAGING') return m4.stagingAan ? 'ja' : 'nee';
    return 'onbekend';
  };
  if (!aanbieder.vereist?.length) return null;
  return (
    <div className='cvi-checklist' data-cvi-checklist={aanbieder.id}>
      <strong>{tr(lang, 'Що потрібно від власника сервера', 'Wat de servereigenaar moet zetten')}</strong>
      <ul>
        {aanbieder.vereist.map((naam) => {
          const stand = standVan(naam);
          return (
            <li key={naam} className={`cvi-check is-${stand}`} data-cvi-env={naam} data-cvi-stand={stand}>
              {stand === 'ja' ? <Check aria-hidden='true' /> : stand === 'nee' ? <X aria-hidden='true' /> : <Minus aria-hidden='true' />}
              <code>{naam}</code>
              <span>{stand === 'ja' ? tr(lang, 'на сервері є', 'staat op de server') : stand === 'nee' ? tr(lang, 'на сервері немає', 'ontbreekt op de server') : tr(lang, 'цей маршрут не звітує', 'wordt hier niet gerapporteerd')}</span>
            </li>
          );
        })}
      </ul>
      <p className='cvn-hint'>{tr(lang, 'ID і SECRET сервер перевіряє як пару: ✗ означає, що принаймні один із двох порожній.', 'ID en SECRET controleert de server als paar: ✗ betekent dat minstens één van beide leeg is.')}</p>
    </div>
  );
}

/** Monogram in plaats van merkafbeeldingen (geen logo’s in de bundel — zelfde regel als de agenda-catalogus). */
export const Monogram = ({ tekst }: { tekst: string }) => <span className='cvi-monogram' aria-hidden='true'>{tekst}</span>;

export default function Integraties({ lang, naarTab }: OnderdeelProps) {
  const [data, setData] = useState<IntegratiesUit | null>(null);
  const [fout, setFout] = useState('');
  const [laden, setLaden] = useState(true);
  const [bezig, setBezig] = useState(false);
  const [wachten, setWachten] = useState(false); // popup open → elke 3 s peilen, hoogstens 4 minuten
  const poll = useRef<{ timer: number; tot: number; was: number } | null>(null);

  const laad = useCallback(async (): Promise<IntegratiesUit | null> => {
    try { const vers = await cloudClient.integraties(); setData(vers); setFout(''); return vers; }
    catch (e) { setFout(foutTekst(lang, e instanceof CloudFout ? e.code : 'FOUT', e instanceof CloudFout ? e.data : undefined)); return null; }
    finally { setLaden(false); }
  }, [lang]);
  useEffect(() => { void laad(); }, [laad]);

  const dataRef = useRef<IntegratiesUit | null>(null);
  dataRef.current = data;
  const stopPoll = useCallback(() => { if (poll.current) { window.clearInterval(poll.current.timer); poll.current = null; } setWachten(false); }, []);
  useEffect(() => () => { if (poll.current) window.clearInterval(poll.current.timer); }, []);
  const startPoll = useCallback(() => {
    stopPoll(); setWachten(true);
    const was = (dataRef.current?.google.accounts.filter((a) => a.status === 'connected').length ?? 0);
    const timer = window.setInterval(async () => {
      if (!poll.current || Date.now() > poll.current.tot) { stopPoll(); return; }
      const vers = await laad();
      const nu = vers?.google.accounts.filter((a) => a.status === 'connected').length ?? 0;
      if (vers && nu > poll.current.was) stopPoll();
    }, POLL_MS);
    poll.current = { timer, tot: Date.now() + POLL_MAX_MS, was };
  }, [laad, stopPoll]);

  /** Google koppelen via de bestaande route; de popup gaat open VÓÓR de await, anders blokkeert de browser hem. */
  const googleKoppelen = async (rol: 'primary' | 'additional') => {
    if (bezig) return;
    const venster = window.open('about:blank', 'cloud-google-koppeling', 'popup=yes,width=520,height=720');
    setBezig(true);
    try {
      const r = await cloudClient.googleStart(rol);
      if (r.authUrl) { if (venster) venster.location.href = r.authUrl; else location.assign(r.authUrl); startPoll(); }
      else { venster?.close(); await laad(); }
    } catch (e) { venster?.close(); setFout(foutTekst(lang, e instanceof CloudFout ? e.code : 'FOUT', e instanceof CloudFout ? e.data : undefined)); }
    finally { setBezig(false); }
  };

  const levend = (a: CloudVnextAanbieder): boolean => {
    if (!data) return false;
    if (a.levend === 'google') return data.google.gekoppeld;
    if (a.levend === 'photos') return data.photos.gekoppeld;
    if (a.levend === 'm4') return Boolean(data.m4.aanbieders.find((x) => x.id === a.id)?.accounts.some((acc) => acc.status === 'connected'));
    return false;
  };
  const aantalLevend = data ? CLOUD_VNEXT_AANBIEDERS.filter(levend).length : 0;
  const overige = CLOUD_VNEXT_AANBIEDERS.filter((a) => a.id !== 'google-drive' && a.id !== 'google-photos');
  const drive = CLOUD_VNEXT_AANBIEDERS.find((a) => a.id === 'google-drive');
  const fotos = CLOUD_VNEXT_AANBIEDERS.find((a) => a.id === 'google-photos');

  const registerAan = useCatalogusV2() === true; // UI-013 fase 2: registerbadge achter vlag
  const standBadge = (a: CloudVnextAanbieder) => (<>
    <span className={`cvi-stand is-${a.stand}${levend(a) ? ' is-levend' : ''}`} data-cvi-standbadge={a.stand}>
      {levend(a) ? tr(lang, 'підключено', 'gekoppeld') : cloudTekst(CLOUD_STAND_LABEL[a.stand], lang)}
    </span>{registerAan ? (() => { const g = registerGroep(a.id); return g ? <span className='cvi-stand is-register' data-cvi-register={g.groep}>{tr(lang, 'Каталог: ', 'Catalogus: ')}{lang === 'uk' ? g.uk : g.nl}{g.adapter ? tr(lang, ' · є перевірка з’єднання', ' · verbindingscontrole beschikbaar') : ''}</span> : null; })() : null}
  </>);

  if (laden) return <section className='cvn-leeg'><p className='cvn-hint' role='status' aria-busy='true'><LoaderCircle className='cvi-draai' aria-hidden='true' />{tr(lang, 'Перевіряємо живий стан підключень…', 'Levende koppelstatus controleren…')}</p></section>;

  return (
    <div className='cvi' data-cvi-centrum=''>
      {fout ? <p className='cvn-melding is-fout' role='alert'>{fout} <button type='button' className='cvn-knop is-klein' onClick={() => { setLaden(true); void laad(); }}><RefreshCw aria-hidden='true' />{tr(lang, 'Ще раз', 'Opnieuw')}</button></p> : null}

      {/* ---- samenvatting: alleen controleerbare feiten, geen marketinggetallen ---- */}
      <section className='cvn-blok cvi-samenvatting' aria-label={tr(lang, 'Зведення', 'Samenvatting')}>
        <div className='cvi-chips'>
          <span className='cvi-chip is-ok' data-cvi-levend={aantalLevend}><Link2 aria-hidden='true' />{tr(lang, `Підключено: ${aantalLevend}`, `Gekoppeld: ${aantalLevend}`)}</span>
          <span className='cvi-chip'><FolderSync aria-hidden='true' />{tr(lang, 'Фонова синхронізація Google-проєкції: кожні 5 хв', 'Achtergrondsynchronisatie van de Google-projectie: elke 5 min')}</span>
          <span className='cvi-chip'><Lock aria-hidden='true' />{tr(lang, 'Токени: зашифровано на сервері', 'Tokens: versleuteld op de server')}</span>
          <span className='cvi-chip is-stil'>{tr(lang, 'Автоматизації: заплановано', 'Automatiseringen: gepland')}</span>
        </div>
      </section>

      {/* ---- gekoppeld: Google Drive (echte accounts) en Google Photos (levende scope-controle) ---- */}
      <section className='cvn-blok' aria-labelledby='cvi-gekoppeld-kop'>
        <h3 id='cvi-gekoppeld-kop'><Link2 aria-hidden='true' />{tr(lang, 'Підключені', 'Gekoppeld')}</h3>
        {wachten ? <p className='cvn-melding is-info' role='status'><LoaderCircle className='cvi-draai' aria-hidden='true' />{tr(lang, 'Вікно входу Google відкрито — щойно ви завершите, список оновиться сам (перевірка кожні 3 с, до 4 хв).', 'Het Google-aanmeldvenster is open — zodra u klaar bent, ververst de lijst zichzelf (controle elke 3 s, tot 4 min).')}</p> : null}

        <article className='cvi-kaart is-open' data-cvi-aanbieder='google-drive'>
          <div className='cvi-kaart-kop'>
            <Monogram tekst={drive?.monogram || 'G'} />
            <div className='cvi-kaart-naam'><strong>Google Drive</strong><span className='cvi-richting'>{cloudTekst(CLOUD_RICHTING_LABEL['lezen-en-schrijven'], lang)}</span></div>
            {drive ? standBadge(drive) : null}
          </div>
          {data?.google.fout ? <p className='cvn-melding is-fout'>{tr(lang, 'Стан Google зараз не читається:', 'De Google-status is nu niet leesbaar:')} <code>{data.google.fout}</code></p> : null}
          <p className='cvn-hint' data-cvi-grens='google-drive'>{cloudTekst(OVERDRACHT_GRENZEN['google-drive'].bron, lang)}</p>
          {data?.google.accounts.length ? (
            <ul className='cvi-accounts'>
              {data.google.accounts.map((a) => (
                <li key={a.id} data-cvi-account={a.id}>
                  <span className={`cvi-stip is-${a.status === 'connected' ? 'ok' : 'uit'}`} aria-hidden='true' />
                  <span className='cvi-account-mail'>{a.email || tr(lang, '(без адреси)', '(zonder adres)')}</span>
                  <span className='cvi-account-status'>{accountStatusTekst(lang, a.status)}{a.actief ? ` · ${tr(lang, 'активний', 'actief')}` : ''}</span>
                </li>
              ))}
            </ul>
          ) : <p className='cvn-hint'>{tr(lang, 'Жодного Google-акаунта ще не підключено.', 'Er is nog geen Google-account gekoppeld.')}</p>}
          <div className='cvi-acties'>
            {data?.google.gekoppeld ? (
              <>
                <button type='button' className='cvn-knop' onClick={() => naarTab('google')} data-cvi-actie='beheren'><Settings2 aria-hidden='true' />{tr(lang, 'Керувати', 'Beheren')}</button>
                <button type='button' className='cvn-knop' disabled={bezig} onClick={() => void googleKoppelen('additional')} data-cvi-actie='extra-account'><Plus aria-hidden='true' />{tr(lang, 'Ще акаунт', 'Nog een account')}</button>
              </>
            ) : (
              <button type='button' className='cvn-knop is-hoofd' disabled={bezig} onClick={() => void googleKoppelen('primary')} data-cvi-actie='koppelen'><Link2 aria-hidden='true' />{tr(lang, 'Підключити Google Drive', 'Google Drive koppelen')}</button>
            )}
          </div>
          {drive ? <p className='cvn-hint'>{cloudTekst(drive.detail, lang)}</p> : null}
        </article>

        <article className='cvi-kaart is-open' data-cvi-aanbieder='google-photos'>
          <div className='cvi-kaart-kop'>
            <Monogram tekst={fotos?.monogram || 'GP'} />
            <div className='cvi-kaart-naam'><strong>Google Photos</strong><span className='cvi-richting'>{cloudTekst(CLOUD_RICHTING_LABEL.importeren, lang)}</span></div>
            {fotos ? standBadge(fotos) : null}
          </div>
          {fotos ? <p className='cvn-hint'>{cloudTekst(fotos.uitleg, lang)}</p> : null}
          <div className='cvi-acties'>
            <button type='button' className='cvn-knop' onClick={() => naarTab('photos')} data-cvi-actie='fotos'><Settings2 aria-hidden='true' />{data?.photos.gekoppeld ? tr(lang, 'Відкрити Фото', 'Foto’s openen') : tr(lang, 'Підключити на сторінці Фото', 'Koppelen op de pagina Foto’s')}</button>
          </div>
          {!data?.photos.gekoppeld && fotos ? <p className='cvn-hint'>{cloudTekst(fotos.detail, lang)}</p> : null}
        </article>
      </section>

      {/* ---- beschikbaar: de rest van de catalogus, zonder valse koppelknoppen ---- */}
      <section className='cvn-blok' aria-labelledby='cvi-beschikbaar-kop'>
        <h3 id='cvi-beschikbaar-kop'><Search aria-hidden='true' />{tr(lang, 'Доступні сховища', 'Beschikbare opslagdiensten')}</h3>
        <p className='cvn-hint'>{tr(lang, 'Чесно, станом на сьогодні: що в коді, чого бракує і які обхідні шляхи. Кнопки підключення немає там, де вона б збрехала.', 'Eerlijk, per vandaag: wat in de code zit, wat ontbreekt en welke omwegen er zijn. Er is geen koppelknop waar die zou liegen.')}</p>
        <div className='cvi-kaarten'>
          {overige.map((a) => {
            const m4rij = data?.m4.aanbieders.find((x) => x.id === a.id) || null;
            const allesJa = Boolean(m4rij?.sleutelsAanwezig && data?.m4.stagingAan);
            return (
              <details key={a.id} className='cvi-kaart' data-cvi-aanbieder={a.id} data-cvi-stand={a.stand}>
                <summary>
                  <Monogram tekst={a.monogram} />
                  <div className='cvi-kaart-naam'><strong>{a.naam}</strong><span className='cvi-richting'>{cloudTekst(CLOUD_RICHTING_LABEL[a.richting], lang)}</span></div>
                  {standBadge(a)}
                </summary>
                <div className='cvi-kaart-inhoud'>
                  <p>{cloudTekst(a.uitleg, lang)}</p>
                  <p className='cvn-hint'>{cloudTekst(a.detail, lang)}</p>
                  {a.stand === 'sleutels-nodig' ? (
                    <>
                      <SleutelsChecklist lang={lang} aanbieder={a} m4={data?.m4 || null} />
                      {m4rij?.accounts.length ? (
                        <ul className='cvi-accounts'>
                          {m4rij.accounts.map((acc) => (
                            <li key={acc.id} data-cvi-account={acc.id}>
                              <span className={`cvi-stip is-${acc.status === 'connected' ? 'ok' : 'uit'}`} aria-hidden='true' />
                              <span className='cvi-account-mail'>{acc.label}</span>
                              <span className='cvi-account-status'>{accountStatusTekst(lang, acc.status)}</span>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      {allesJa && !m4rij?.accounts.length ? <p className='cvn-melding is-info'>{tr(lang, 'Ключі на сервері є, staging увімкнено — акаунтів ще немає. Кнопка підключення з’явиться наступним кроком: OAuth-маршрути M4 уже в репозиторії, але цей випуск їх у вітрину ще не виводить.', 'De sleutels staan op de server en staging staat aan — accounts zijn er nog niet. De koppelknop komt in de volgende stap: de M4-OAuth-routes zitten al in de repository, maar deze release toont ze nog niet in de etalage.')}</p> : null}
                    </>
                  ) : null}
                  {a.omweg ? <p className='cvi-omweg'>{cloudTekst(a.omweg, lang)}</p> : null}
                  <a className='cvi-site' href={a.site} target='_blank' rel='noreferrer noopener'><ExternalLink aria-hidden='true' />{a.site.replace(/^https:\/\//, '')}</a>
                </div>
              </details>
            );
          })}
        </div>
      </section>

      {/* ---- synchronisatie en richtingen: alleen wat echt zo werkt ---- */}
      <section className='cvn-blok' aria-labelledby='cvi-sync-kop'>
        <h3 id='cvi-sync-kop'><FolderSync aria-hidden='true' />{tr(lang, 'Синхронізація і напрямки', 'Synchronisatie en richtingen')}</h3>
        <ul className='cvi-sync'>
          <li data-cvi-sync='drive'><Check aria-hidden='true' />{tr(lang, 'Google Drive: метадані синхронізуються у фоні кожні 5 хв (проєкція на сервері); читання і запис — через сторінку Google Drive.', 'Google Drive: metadata synchroniseert elke 5 min op de achtergrond (projectie op de server); lezen en schrijven via de pagina Google Drive.')}</li>
          <li data-cvi-sync='zoek-cloud'>{data?.zoekIndex.cloud ? <Check aria-hidden='true' /> : <X aria-hidden='true' />}{tr(lang, `Пошуковий індекс знає власну хмару: ${data?.zoekIndex.cloud ? 'так' : 'ні'}.`, `De zoekindex kent de eigen cloud: ${data?.zoekIndex.cloud ? 'ja' : 'nee'}.`)}</li>
          <li data-cvi-sync='zoek-drive'>{data?.zoekIndex.drive ? <Check aria-hidden='true' /> : <X aria-hidden='true' />}{tr(lang, `Пошуковий індекс знає Google Drive: ${data?.zoekIndex.drive ? 'так' : 'ні'}.`, `De zoekindex kent Google Drive: ${data?.zoekIndex.drive ? 'ja' : 'nee'}.`)}</li>
          <li data-cvi-sync='fotos'><Check aria-hidden='true' />{tr(lang, 'Google Photos: лише імпорт за вашим вибором (офіційний Picker) — повної синхронізації бібліотеки Google не дає нікому.', 'Google Photos: alleen import op uw keuze (officiële Picker) — volledige bibliotheeksynchronisatie geeft Google aan niemand.')}</li>
          <li data-cvi-sync='tokens'><Lock aria-hidden='true' />{tr(lang, 'Токени доступу зашифровані на сервері (AES-256-GCM) і ніколи не потрапляють у браузер чи у відповіді цієї сторінки.', 'Toegangstokens zijn op de server versleuteld (AES-256-GCM) en komen nooit in de browser of in de antwoorden van deze pagina.')}</li>
          <li data-cvi-sync='automatisering' className='is-stil'><Minus aria-hidden='true' />{tr(lang, 'Двостороння синхронізація з іншими сховищами та автоматизації — заплановано; кнопок для цього тут свідомо немає.', 'Tweerichtingssynchronisatie met andere opslagdiensten en automatiseringen: gepland; daar staan hier bewust geen knoppen voor.')}</li>
        </ul>
      </section>
    </div>
  );
}
