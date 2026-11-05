// Cloud vNext — BRON: de per-aanbiederpagina. Voor google-drive een LICHTE LEZER op de bestaande routes
// (/api/owner/cloud/google-suite/drive/browse en /drive/file): kruimelpad, raster, zoeken, «meer tonen» met pageToken en een
// veilige voorvertoning met dezelfde motor als de mailbijlagen (src/MailBijlageVoorbeeld.tsx). Schrijven (hernoemen, verplaatsen,
// prullenbak) hoort hier eerlijk NIET bij — dat zegt de pagina er ook bij. Voor onedrive/dropbox: geen nep-verkenner maar de
// levende sleutelchecklist (SleutelsChecklist uit ./Integraties) — de lees-/previewcode (M8/M10) zit al in de repository.
// De voorvertoning leeft in een EIGEN laag (BronLaag): portaal in <body>, Esc, Tab-val — zelfde regels als src/huis/HuisLaag.tsx.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight, CloudDownload, File, FileImage, FileText, Folder, Link2, LoaderCircle, RefreshCw, Search, X } from 'lucide-react';
import { CLOUD_RICHTING_LABEL, CLOUD_STAND_LABEL, cloudTekst, cloudVnextAanbieder } from '../../../shared/cloud-vnext-model';
import { MailAttachmentPreviewBody, loadMailAttachmentPreviewFromBlob, revokeMailAttachmentPreview, type MailAttachmentPreview } from '../../MailBijlageVoorbeeld';
import { cloudClient, CloudFout, type IntegratiesUit } from '../cloud-client';
import { OVERDRACHT_GRENZEN } from '../../../shared/cloud-overdracht-model';
import type { OnderdeelProps } from '../CloudPagina';
import { bytesTekst, foutTekst, tr, type Lang } from '../tekst';
import { Monogram, SleutelsChecklist, accountStatusTekst } from './Integraties';
import { sessieLees, sessieZet } from '../hulp';

/**
 * ZOEKDIEP-001 (05.11.2026): overdracht uit «Пошук» of een diepe link (CloudPagina → 'cvn-drive-open' = { bestand, principal }).
 * Vóór 05.11 schreef de zoekpagina hier een kale id die niemand las; zo'n waarde telt nog als bestand-id zonder account.
 * Alleen LEZEN tijdens de render: React kan een eerste render weggooien (Suspense), dan zou een gewiste sleutel verloren zijn.
 * Gewist wordt pas in het effect dat het bestand opent.
 */
function leesDriveOverdracht(): { bestand: string; principal: string } | null {
  const w = sessieLees('cvn-drive-open');
  if (!w) return null;
  try {
    const p = JSON.parse(w) as { bestand?: unknown; principal?: unknown };
    if (p && typeof p === 'object' && typeof p.bestand === 'string' && p.bestand) return { bestand: p.bestand.slice(0, 1100), principal: String(p.principal || '').slice(0, 120) };
  } catch { /* geen JSON */ }
  return /^[\x21-\x7e]{1,1100}$/.test(w) ? { bestand: w, principal: '' } : null;
}

type DriveBestand = { id: string; name: string; mimeType: string; modifiedAt: number; size: string; folder: boolean };
type Kruimel = { id: string; naam: string };
type DriveAntwoord = { files?: DriveBestand[]; nextPageToken?: string };
type BestandAntwoord = { name: string; mimeType: string; kind: string; sizeBytes: number; data: string };
const POLL_MS = 3000, POLL_MAX_MS = 4 * 60_000;
const decodeer = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

/** Eigen laag van dit onderdeel (venster): portaal + Esc (ook bij verloren focus) + Tab-val, naar het voorbeeld van HuisLaag. */
function BronLaag({ lang, titel, onSluit, children }: { lang: Lang; titel: string; onSluit: () => void; children: ReactNode }) {
  const vak = useRef<HTMLDivElement | null>(null);
  const terug = useRef<HTMLElement | null>(typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null);
  useEffect(() => {
    (vak.current?.querySelector<HTMLElement>('[data-cvi-eerste]') || vak.current)?.focus();
    const knop = terug.current; const html = document.documentElement; const was = html.style.overflow; html.style.overflow = 'hidden';
    return () => { html.style.overflow = was; if (knop && document.contains(knop)) knop.focus(); };
  }, []);
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const lagen = document.querySelectorAll('.cvn-laag'); if (lagen[lagen.length - 1] !== vak.current?.parentElement) return;
      if (vak.current && vak.current.contains(document.activeElement)) return;
      e.preventDefault(); onSluit();
    };
    window.addEventListener('keydown', f); return () => window.removeEventListener('keydown', f);
  }, [onSluit]);
  const toets = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); onSluit(); return; }
    if (e.key !== 'Tab' || !vak.current) return;
    const f = Array.from(vak.current.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex="0"]')).filter((x) => x.offsetParent !== null);
    if (!f.length) return;
    const [a, z] = [f[0], f[f.length - 1]];
    if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); } else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
  };
  return createPortal(
    <div className='cvn-laag is-venster cvi-laag' onMouseDown={(e) => { if (e.target === e.currentTarget) onSluit(); }}>
      <div ref={vak} className='cvn-laag-vak cvi-laag-vak' role='dialog' aria-modal='true' aria-label={titel} tabIndex={-1} onKeyDown={toets} data-cvi-laag=''>
        <header className='cvn-laag-kop'><h2>{titel}</h2><button type='button' className='cvn-icoonknop' data-cvi-eerste='' onClick={onSluit} aria-label={tr(lang, 'Закрити', 'Sluiten')} title='Esc'><X aria-hidden='true' /></button></header>
        <div className='cvn-laag-inhoud cvi-laag-inhoud'>{children}</div>
      </div>
    </div>, document.body);
}

const mimeNaam = (lang: Lang, b: DriveBestand): string => {
  if (b.folder) return tr(lang, 'Папка', 'Map');
  const g = /^application\/vnd\.google-apps\.(\w+)$/.exec(String(b.mimeType || ''));
  if (g) { const soort: Record<string, string> = { document: 'Google Docs', spreadsheet: 'Google Sheets', presentation: 'Google Slides', form: 'Google Forms', drawing: 'Google Drawings', shortcut: tr(lang, 'Ярлик', 'Snelkoppeling') }; return soort[g[1]] || `Google ${g[1]}`; }
  return String(b.mimeType || '').split(';')[0] || tr(lang, 'Файл', 'Bestand');
};
const Icoon = ({ b }: { b: DriveBestand }) => { const I = b.folder ? Folder : b.mimeType.startsWith('image/') ? FileImage : b.mimeType.includes('pdf') || b.mimeType.startsWith('text/') ? FileText : File; return <I aria-hidden='true' />; };

export default function Bron(props: OnderdeelProps & { bron: 'google-drive' | 'onedrive' | 'dropbox' }) {
  const { lang, bron } = props;
  const [integr, setIntegr] = useState<IntegratiesUit | null>(null);
  const [laden, setLaden] = useState(true);
  const [fout, setFout] = useState('');
  const laadIntegraties = useCallback(async (): Promise<IntegratiesUit | null> => {
    try { const vers = await cloudClient.integraties(); setIntegr(vers); return vers; }
    catch (e) { setFout(foutTekst(lang, e instanceof CloudFout ? e.code : 'FOUT')); return null; }
    finally { setLaden(false); }
  }, [lang]);
  useEffect(() => { void laadIntegraties(); }, [laadIntegraties]);

  if (bron !== 'google-drive') {
    const a = cloudVnextAanbieder(bron);
    if (!a) return null;
    const m4rij = integr?.m4.aanbieders.find((x) => x.id === a.id) || null;
    return (
      <section className='cvn-blok cvi' data-cvi-bron={bron}>
        <div className='cvi-kaart-kop'>
          <Monogram tekst={a.monogram} />
          <div className='cvi-kaart-naam'><strong>{a.naam}</strong><span className='cvi-richting'>{cloudTekst(CLOUD_RICHTING_LABEL[a.richting], lang)}</span></div>
          <span className={`cvi-stand is-${a.stand}`}>{cloudTekst(CLOUD_STAND_LABEL[a.stand], lang)}</span>
        </div>
        <p>{cloudTekst(a.uitleg, lang)}</p>
        <p className='cvn-hint'>{cloudTekst(a.detail, lang)}</p>
        {laden ? <p className='cvn-hint' role='status' aria-busy='true'><LoaderCircle className='cvi-draai' aria-hidden='true' />{tr(lang, 'Перевіряємо живий стан ключів…', 'Levende sleutelstatus controleren…')}</p> : <SleutelsChecklist lang={lang} aanbieder={a} m4={integr?.m4 || null} />}
        {m4rij?.accounts.length ? (
          <ul className='cvi-accounts'>
            {m4rij.accounts.map((acc) => <li key={acc.id}><span className={`cvi-stip is-${acc.status === 'connected' ? 'ok' : 'uit'}`} aria-hidden='true' /><span className='cvi-account-mail'>{acc.label}</span><span className='cvi-account-status'>{accountStatusTekst(lang, acc.status)}</span></li>)}
          </ul>
        ) : null}
        <p className='cvn-melding is-info'>{tr(lang, 'Коли всі пункти стануть ✓, тут з’явиться перегляд файлів: код для списку і безпечного прев’ю (модулі M8/M10) уже в репозиторії — бракує лише ключів власника.', 'Zodra alle punten ✓ zijn, verschijnt hier de bestandsweergave: de code voor lijst en veilige preview (modules M8/M10) zit al in de repository — alleen de sleutels van de eigenaar ontbreken.')}</p>
      </section>
    );
  }

  return <GoogleDriveLezer {...props} integr={integr} laden={laden} fout={fout} herlaad={laadIntegraties} />;
}

function GoogleDriveLezer({ lang, naarTab, integr, laden, fout: bovenFout, herlaad }: OnderdeelProps & { integr: IntegratiesUit | null; laden: boolean; fout: string; herlaad: () => Promise<IntegratiesUit | null> }) {
  const [accountId, setAccountId] = useState('');
  const [kruimels, setKruimels] = useState<Kruimel[]>([]);
  const [bestanden, setBestanden] = useState<DriveBestand[]>([]);
  const [token, setToken] = useState('');
  const [zoekVeld, setZoekVeld] = useState('');
  const [zoek, setZoek] = useState('');
  const [lijstLaden, setLijstLaden] = useState(false);
  const [meerLaden, setMeerLaden] = useState(false);
  const [fout, setFout] = useState('');
  const [voorbeeld, setVoorbeeld] = useState<MailAttachmentPreview | null>(null);
  const [voorbeeldLaden, setVoorbeeldLaden] = useState(false);
  const [bezig, setBezig] = useState(false);
  const [wachten, setWachten] = useState(false);
  const poll = useRef<number | null>(null);
  const wortelNaam = tr(lang, 'Мій диск', 'Mijn Drive');

  const verbonden = integr?.google.accounts.filter((a) => a.status === 'connected') || [];
  const overdracht = useRef<{ bestand: string; principal: string } | null | undefined>(undefined);
  if (overdracht.current === undefined) overdracht.current = leesDriveOverdracht();
  useEffect(() => {
    if (accountId || !verbonden.length) return;
    // Een diepe link noemt het account (principalId); anders het actieve account zoals altijd.
    const gevraagd = overdracht.current?.principal ? verbonden.find((a) => a.principalId === overdracht.current?.principal) : undefined;
    const actief = gevraagd || verbonden.find((a) => a.actief) || verbonden[0];
    setAccountId(actief.id);
  }, [integr]); // eslint-disable-line react-hooks/exhaustive-deps

  const blader = useCallback(async (mapId: string, volgendeKruimels: Kruimel[], vraag: string, account = accountId) => {
    if (!account) return;
    setLijstLaden(true); setFout('');
    try {
      const r = (await cloudClient.driveBrowse({ accountId: account, folderId: mapId, query: vraag, pageToken: '' })) as DriveAntwoord;
      setBestanden(r.files || []); setToken(String(r.nextPageToken || '')); setKruimels(volgendeKruimels); setZoek(vraag);
    } catch (e) { setFout(foutTekst(lang, e instanceof CloudFout ? e.code : 'FOUT')); }
    finally { setLijstLaden(false); }
  }, [accountId, lang]);
  useEffect(() => { if (accountId) void blader('root', [{ id: 'root', naam: wortelNaam }], ''); }, [accountId]); // eslint-disable-line react-hooks/exhaustive-deps

  const meer = async () => {
    if (!accountId || !token || meerLaden) return;
    setMeerLaden(true);
    try {
      const mapId = kruimels[kruimels.length - 1]?.id || 'root';
      const r = (await cloudClient.driveBrowse({ accountId, folderId: mapId, query: zoek, pageToken: token })) as DriveAntwoord;
      const kaart = new Map(bestanden.map((b) => [b.id, b] as const));
      for (const b of r.files || []) kaart.set(b.id, b);
      setBestanden([...kaart.values()]); setToken(String(r.nextPageToken || ''));
    } catch (e) { setFout(foutTekst(lang, e instanceof CloudFout ? e.code : 'FOUT')); }
    finally { setMeerLaden(false); }
  };

  const [taakBezig, setTaakBezig] = useState('');
  const [taakMelding, setTaakMelding] = useState('');
  /* Kopie Drive → eigen cloud als achtergrondtaak op de server: de pagina blijft bruikbaar, voortgang bij «Передачі». */
  const naarEigen = async (b: DriveBestand) => {
    if (!accountId || taakBezig) return;
    setTaakBezig(b.id); setTaakMelding(''); setFout('');
    try {
      await cloudClient.taken({ actie: 'nieuw', soort: 'kopie', bron: { dienst: 'google-drive', account: accountId, id: b.id, naam: b.name }, doel: { dienst: 'eigen' } });
      setTaakMelding(tr(lang, `«${b.name}» копіюється у вашу хмару у фоні — прогрес у «Мої файли» → «Передачі».`, `«${b.name}» wordt op de achtergrond naar uw cloud gekopieerd — voortgang bij «Mijn bestanden» → «Overdrachten».`));
    } catch (e) { setFout(foutTekst(lang, e instanceof CloudFout ? e.code : 'FOUT')); }
    finally { setTaakBezig(''); }
  };
  const open = async (b: DriveBestand) => {
    if (b.folder) { void blader(b.id, [...kruimels, { id: b.id, naam: b.name || tr(lang, 'Папка', 'Map') }], ''); setZoekVeld(''); return; }
    if (!accountId || voorbeeldLaden) return;
    setVoorbeeldLaden(true); setFout('');
    try {
      const r = (await cloudClient.driveFile({ accountId, fileId: b.id })) as BestandAntwoord;
      const blob = new Blob([decodeer(r.data || '')], { type: r.mimeType || 'application/octet-stream' });
      const vb = await loadMailAttachmentPreviewFromBlob({ blob, filename: r.name || b.name || 'bestand', contentType: r.mimeType || 'application/octet-stream' });
      setVoorbeeld((oud) => { if (oud) revokeMailAttachmentPreview(oud); return vb; });
    } catch (e) {
      const status = e instanceof CloudFout ? e.status : 0;
      setFout(status === 413 ? tr(lang, 'Файл завеликий для безпечного перегляду тут (ліміт 32 МБ, відео 128 МБ).', 'Het bestand is te groot voor een veilige weergave hier (grens 32 MB, video 128 MB).')
        : status === 415 ? tr(lang, 'Цей формат не можна безпечно показати всередині сервісу.', 'Dit formaat kan niet veilig binnen de dienst worden getoond.')
        : foutTekst(lang, e instanceof CloudFout ? e.code : 'FOUT'));
    } finally { setVoorbeeldLaden(false); }
  };
  useEffect(() => () => { if (voorbeeld) revokeMailAttachmentPreview(voorbeeld); }, [voorbeeld]);
  // Overdracht één keer openen zodra het account vaststaat (de map eronder blijft gewoon «Мій диск»).
  useEffect(() => {
    const o = overdracht.current;
    if (!accountId || !o) return;
    overdracht.current = null; sessieZet('cvn-drive-open', '');
    void open({ id: o.bestand, name: '', mimeType: '', modifiedAt: 0, size: '', folder: false });
  }, [accountId]); // eslint-disable-line react-hooks/exhaustive-deps

  const stopPoll = useCallback(() => { if (poll.current) { window.clearInterval(poll.current); poll.current = null; } setWachten(false); }, []);
  useEffect(() => () => { if (poll.current) window.clearInterval(poll.current); }, []);
  /** Zelfde koppelstroom als het integratiecentrum: popup vóór de await, daarna elke 3 s peilen (hoogstens 4 minuten). */
  const koppelen = async () => {
    if (bezig) return;
    const venster = window.open('about:blank', 'cloud-google-koppeling', 'popup=yes,width=520,height=720');
    setBezig(true);
    try {
      const r = await cloudClient.googleStart('primary');
      if (r.authUrl) {
        if (venster) venster.location.href = r.authUrl; else location.assign(r.authUrl);
        stopPoll(); setWachten(true);
        const tot = Date.now() + POLL_MAX_MS;
        poll.current = window.setInterval(async () => {
          if (Date.now() > tot) { stopPoll(); return; }
          const vers = await herlaad();
          if (vers?.google.gekoppeld) stopPoll();
        }, POLL_MS);
      } else { venster?.close(); await herlaad(); }
    } catch (e) { venster?.close(); setFout(foutTekst(lang, e instanceof CloudFout ? e.code : 'FOUT')); }
    finally { setBezig(false); }
  };

  if (laden) return <section className='cvn-leeg'><p className='cvn-hint' role='status' aria-busy='true'><LoaderCircle className='cvi-draai' aria-hidden='true' />{tr(lang, 'Перевіряємо підключення Google…', 'Google-koppeling controleren…')}</p></section>;
  if (!verbonden.length) {
    return (
      <section className='cvn-leeg cvi' data-cvi-bron='google-drive'>
        <Folder aria-hidden='true' />
        <strong>{tr(lang, 'Google Drive ще не підключено.', 'Google Drive is nog niet gekoppeld.')}</strong>
        <p className='cvn-hint'>{tr(lang, 'Після входу тут з’являться ваші теки й файли: перегляд, пошук і безпечне прев’ю.', 'Na het aanmelden verschijnen hier uw mappen en bestanden: bladeren, zoeken en een veilige preview.')}</p>
        {bovenFout ? <p className='cvn-melding is-fout' role='alert'>{bovenFout}</p> : null}
        {wachten ? <p className='cvn-melding is-info' role='status'><LoaderCircle className='cvi-draai' aria-hidden='true' />{tr(lang, 'Вікно входу Google відкрито — сторінка оновиться сама.', 'Het Google-aanmeldvenster is open — deze pagina ververst zichzelf.')}</p> : null}
        <button type='button' className='cvn-knop is-hoofd' disabled={bezig} onClick={() => void koppelen()} data-cvi-actie='koppelen'><Link2 aria-hidden='true' />{tr(lang, 'Підключити Google Drive', 'Google Drive koppelen')}</button>
      </section>
    );
  }

  const huidigeMap = kruimels[kruimels.length - 1]?.id || 'root';
  return (
    <div className='cvi cvi-verkenner' data-cvi-bron='google-drive' data-cvi-map={huidigeMap}>
      <section className='cvn-blok'>
        <div className='cvi-werkbalk'>
          {verbonden.length > 1 ? (
            <label className='cvi-accountkeuze'>
              <span className='cvn-hint'>{tr(lang, 'Акаунт', 'Account')}</span>
              <select value={accountId} onChange={(e) => { setAccountId(e.target.value); setKruimels([]); setBestanden([]); setZoekVeld(''); }}>
                {verbonden.map((a) => <option key={a.id} value={a.id}>{a.email}</option>)}
              </select>
            </label>
          ) : <span className='cvn-hint'>{verbonden[0]?.email}</span>}
          <div className='cvi-zoek' role='search'>
            <Search aria-hidden='true' />
            <input value={zoekVeld} onChange={(e) => setZoekVeld(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void blader(huidigeMap, kruimels, zoekVeld.trim()); }} placeholder={tr(lang, 'Пошук у цьому акаунті', 'Zoeken in dit account')} aria-label={tr(lang, 'Пошук у Google Drive', 'Zoeken in Google Drive')} />
            <button type='button' className='cvn-knop is-klein' disabled={lijstLaden} onClick={() => void blader(huidigeMap, kruimels, zoekVeld.trim())}>{tr(lang, 'Знайти', 'Zoeken')}</button>
          </div>
          <div className='cvi-werkbalk-rechts'>
            <button type='button' className='cvn-knop is-klein' onClick={() => void blader(huidigeMap, kruimels, zoek)} disabled={lijstLaden} data-cvi-actie='vernieuwen'><RefreshCw aria-hidden='true' />{tr(lang, 'Оновити', 'Verversen')}</button>
            <button type='button' className='cvn-knop is-klein' onClick={() => naarTab('accounts')}>{tr(lang, 'Інтеграції', 'Integraties')}</button>
          </div>
        </div>
        <nav className='cvi-kruimels' aria-label={tr(lang, 'Шлях тек', 'Mappad')}>
          {kruimels.map((k, i) => (
            <span key={`${k.id}:${i}`} className='cvi-kruimel'>
              {i > 0 ? <ChevronRight aria-hidden='true' /> : null}
              <button type='button' disabled={i === kruimels.length - 1} onClick={() => { const volgende = kruimels.slice(0, i + 1); setZoekVeld(''); void blader(k.id, volgende, ''); }}>{k.naam}</button>
            </span>
          ))}
          {zoek ? <span className='cvn-hint'>{tr(lang, `· пошук: «${zoek}»`, `· zoekopdracht: ‘${zoek}’`)}</span> : null}
        </nav>
        {fout ? <p className='cvn-melding is-fout' role='alert'>{fout}</p> : null}
        {taakMelding ? <p className='cvn-melding is-ok' role='status'>{taakMelding}</p> : null}
        <p className='cvn-hint' data-cvi-grens='google-drive'>{tr(lang, OVERDRACHT_GRENZEN['google-drive'].bron[0], OVERDRACHT_GRENZEN['google-drive'].bron[1])}</p>
        {lijstLaden ? <p className='cvn-hint' role='status' aria-busy='true'><LoaderCircle className='cvi-draai' aria-hidden='true' />{tr(lang, 'Завантажуємо файли…', 'Bestanden laden…')}</p> : bestanden.length ? (
          <>
            <div className='cvi-bestanden'>
              {bestanden.map((b) => (
                <span key={b.id} className='cvi-bestand-rij'>
                  <button type='button' className={`cvi-bestand${b.folder ? ' is-map' : ''}`} onClick={() => void open(b)} disabled={voorbeeldLaden} data-cvi-bestand={b.id}>
                    <span className='cvi-bestand-icoon'><Icoon b={b} /></span>
                    <strong>{b.name || tr(lang, 'Без назви', 'Naamloos')}</strong>
                    <small>{mimeNaam(lang, b)}{!b.folder && Number(b.size) ? ` · ${bytesTekst(lang, Number(b.size))}` : ''}</small>
                  </button>
                  {!b.folder ? <button type='button' className='cvn-icoonknop cvi-naar-eigen' disabled={Boolean(taakBezig)} data-cvn-ov-taak-nieuw={b.id}
                    onClick={() => void naarEigen(b)} title={tr(lang, 'У мою хмару (фоном)', 'Naar mijn cloud (achtergrond)')}
                    aria-label={tr(lang, `«${b.name}» у мою хмару (фонова задача)`, `«${b.name}» naar mijn cloud (achtergrondtaak)`)}><CloudDownload aria-hidden='true' /></button> : null}
                </span>
              ))}
            </div>
            {token ? <button type='button' className='cvn-knop cvi-meer' disabled={meerLaden} onClick={() => void meer()} data-cvi-actie='meer'>{meerLaden ? <LoaderCircle className='cvi-draai' aria-hidden='true' /> : null}{meerLaden ? tr(lang, 'Завантажуємо ще…', 'Meer laden…') : tr(lang, 'Показати ще', 'Meer tonen')}</button> : null}
          </>
        ) : <section className='cvn-leeg'><Folder aria-hidden='true' /><strong>{zoek ? tr(lang, 'Нічого не знайдено. Можна змінити запит.', 'Niets gevonden. Pas de zoekopdracht aan.') : tr(lang, 'У цій папці зараз немає файлів.', 'Deze map bevat nu geen bestanden.')}</strong></section>}
        <p className='cvn-hint'>{tr(lang, 'Тут — читання: навігація, пошук і безпечне прев’ю. Перейменування, переміщення та кошик Google Drive — у класичному провіднику (сторінка Хмари без прапорця vNext) або на drive.google.com.', 'Hier alleen lezen: bladeren, zoeken en een veilige preview. Hernoemen, verplaatsen en de prullenbak van Google Drive: in de klassieke verkenner (de cloudpagina zonder vNext-vlag) of op drive.google.com.')}</p>
      </section>
      {voorbeeldLaden ? <BronLaag lang={lang} titel={tr(lang, 'Готуємо безпечний перегляд…', 'Veilige weergave voorbereiden…')} onSluit={() => setVoorbeeldLaden(false)}><p className='cvn-hint' role='status' aria-busy='true'><LoaderCircle className='cvi-draai' aria-hidden='true' />{tr(lang, 'Завантажуємо вміст…', 'Inhoud laden…')}</p></BronLaag> : null}
      {voorbeeld ? (
        <BronLaag lang={lang} titel={voorbeeld.filename} onSluit={() => setVoorbeeld((oud) => { if (oud) revokeMailAttachmentPreview(oud); return null; })}>
          <div className='cvi-voorbeeld'><MailAttachmentPreviewBody preview={voorbeeld} lang={lang} /></div>
          <p className='cvn-hint'>{voorbeeld.contentType} · {bytesTekst(lang, voorbeeld.sizeBytes)}</p>
        </BronLaag>
      ) : null}
    </div>
  );
}
