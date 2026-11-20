// Admin → «Оновлення» / «Updates»: één dashboard voor het hele uitrolproces (RUNBOOK-VEILIGE-UITROL.md §13).
//   Огляд         — levende kaart (fasen, deelstappen, voortgang, echte terminal), archief uploaden (ook vanaf de telefoon), goedkeuren met passkey, laatste uitrollen
//   Історія       — ALLE uitrollen uit de database (passkey, SSH, geweigerd, mislukt) met zoeken, filters, paginering en volledige logboeken
//   Журнал        — het volledige logboek van één uitrol (opnieuw te lezen, kopiëren, downloaden)
//   Діагностика   — waar de keten site → inbox → systemd → root stokt (diagnose.json van root)
//   Налаштування  — passkey, SSH-bevestiging, AI-toegang, wie mag voorbereiden (de vroegere stappen 1–4)
// Passkeys zelf beheer je in Instellingen → «Способи входу». De browser maakt alleen de WebAuthn-assertie; server en root controleren alles opnieuw.
import ProblemenSamenvatting from './uitrol/ProblemenSamenvatting';
import { Deelnemers } from './uitrol/UitgaveBeschrijving';
import { useUitrolV2 } from './uitrol/uitrol-vlag';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './platform/client';
import { Bot, PackageCheck, RefreshCw, Fingerprint, UserCheck, UserRound, X } from 'lucide-react';
import { foutCode, kanPasskey as passkeyMogelijk, passkeyBevestigen } from './platform/webauthn';
import UitrolMeester from './UitrolMeester';
import Upload from './uitrol/Upload';
import ZoneKiezer, { useZone } from './uitrol/ZoneKiezer';
import LiveKaart from './uitrol/LiveKaart';
import Geschiedenis from './uitrol/Geschiedenis';
import Pogingen from './uitrol/Pogingen';
import type { PogingUit, PogingenAntwoord } from '../shared/uitrol-pogingen';
import RunDetail from './uitrol/RunDetail';
import Diagnose from './uitrol/Diagnose';
import Bronnen from './uitrol/Bronnen';
import Goedkeuring from './uitrol/Goedkeuring';
import UitrolStroom from './uitrol/UitrolStroom';
import UitrolStroomKaart from './uitrol/UitrolStroomKaart';
import Voorbereiders, { type RechtenWijzigInvoer } from './uitrol/Voorbereiders';
import type { GevenInvoer } from './uitrol/AgentToevoegen';
import GithubInstellingen from './uitrol/GithubInstellingen';
import TelegramArchief from './uitrol/TelegramArchief';
import SleutelsDrieFactoren from './uitrol/SleutelsDrieFactoren';
import SelectiefTerugdraaien from './uitrol/SelectiefTerugdraaien';
import VerdeeldeOpslagPaneel from './uitrol/VerdeeldeOpslagPaneel';
import './uitrol/pakket.css';
import Zijkant from './uitrol/Zijkant';
import { foutTekst, isHerstart } from './uitrol/fouten';
import { telPoging, wisPoging } from '../shared/foutuitleg';
import { datum, methodeTekst, runDuur, staatTekst, tr, type Flow, type Grant, type Keuze, type Lang, type LopendeInstallatie, type Overzicht, type Run, type RunsAntwoord, type Voorstel } from './uitrol/types';
import { etappeTekst, pogingActie, pogingOorzaak } from '../shared/uitrol-pogingen';
import { AlertTriangle, PlayCircle, RotateCcw } from 'lucide-react';
import './beheer-uitrol.css';
import './uitrol/uitrol.css';
import './uitrol/weergave-v2.css';
import './uitrol/uitrol-maquette.css';

// Punt 3 van de audit 19.10.2026: een mislukte actie noemt de route, de code, het tijdstip en het pogingnummer. De teller zit in
// shared/foutuitleg.ts en loopt alleen op bij een ECHTE mislukte poging (dit catch-blok), nooit bij hertekenen.
const feitenVan = (e: unknown, code: string, route: string) => {
  const { poging, tijd } = telPoging(`admin|${route}`);
  return { dienst: 'admin', route, code, status: Number((e as { status?: number } | null)?.status || 0), tijd, poging };
};

type Props = { lang: Lang; sourceOrigin: string; tabContext: string };
type Tab = 'overzicht' | 'stroom' | 'historie' | 'log' | 'diagnose' | 'instellen';

export default function AdminUitrolView({ lang, sourceOrigin, tabContext }: Props) {
  const context = useMemo(() => ({ service: 'admin', tabContext, sourceOrigin }), [tabContext, sourceOrigin]);
  const [tab, setTab] = useState<Tab>('overzicht');
  useZone(); // tijdzonekeuze → hele pagina hertekenen (ZoneKiezer.tsx)
  const [data, setData] = useState<Overzicht | null>(null);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState<{ ok: boolean; text: string; herstart?: boolean } | null>(null);
  // Sommige browsers (Safari) staan WebAuthn alleen direct na een tik toe; na het ophalen van de challenge kan dat verlopen zijn.
  // Dan bewaren we de (nog geldige, ≤ 5 min) challenge en tonen een knop die de passkey meteen bij de volgende tik vraagt.
  const [herhaal, setHerhaal] = useState<null | (() => Promise<string | void>)>(null);
  const [openRun, setOpenRun] = useState('');
  const [logRun, setLogRun] = useState('');
  const [stroomVersie, setStroomVersie] = useState('');
  const [recent, setRecent] = useState<Run[]>([]);
  // Pogingen die niet tot een installatie kwamen (migratie 0081). Ze staan NIET in app.uitrol_runs: een afbreking in de browser
  // (leesfout van de schijf, netwerk weg, tabblad gesloten) heeft nooit een run op de server gestart. Zonder deze lijst bleef
  // zo'n poging volledig onzichtbaar en leek alleen de geslaagde tweede poging ooit te hebben bestaan.
  const [pogingen, setPogingen] = useState<PogingUit[]>([]);
  const lopendeRun = useRef('');
  const [flow, setFlow] = useState<Flow>({ fase: 'leeg', versie: '', detail: '' });
  const [nieuwId, setNieuwId] = useState('');
  const [tgBlokkade, setTgBlokkade] = useState<{ geblokkeerd: boolean; huidigeVersie?: string; huidigeRunId?: string; klaar?: boolean } | null>(null);
  const kanPasskey = passkeyMogelijk();
  const v2 = useUitrolV2() === true;

  const tgStandLaden = useCallback(async () => {
    try {
      const r = (await api.post('/api/owner/uitrol/telegram/stand', context)).data as { klaar?: boolean; blokkade?: { geblokkeerd: boolean; huidigeVersie?: string; huidigeRunId?: string } };
      setTgBlokkade(r?.blokkade?.geblokkeerd ? { ...r.blokkade, klaar: Boolean(r.klaar) } : { geblokkeerd: false, klaar: Boolean(r?.klaar) });
    } catch { /* опційно */ }
  }, [context]);

  const laden = useCallback(async () => {
    try { setData((await api.post('/api/owner/uitrol/overzicht', context)).data as Overzicht); wisPoging('admin|POST /api/owner/uitrol/overzicht'); setNotice((n) => (n?.herstart ? null : n)); void tgStandLaden(); }
    catch (c) { const code = foutCode(c); setNotice({ ok: false, text: foutTekst(lang, code, feitenVan(c, code, 'POST /api/owner/uitrol/overzicht')), herstart: isHerstart(code) }); }
  }, [context, lang, tgStandLaden]);
  const actiefGoedgekeurd = !!data?.voorstellen.some((v) => v.status === 'goedgekeurd');
  useEffect(() => { void laden(); const t = window.setInterval(() => { if (!document.hidden) void laden(); }, notice?.herstart ? 3000 : actiefGoedgekeurd ? 4000 : 20000); return () => window.clearInterval(t); }, [laden, actiefGoedgekeurd, notice?.herstart]);

  // Een succesmelding verdwijnt na 12 s; een herstartmelding (502) ook zodra de volgende poging slaagt (zie laden()).
  useEffect(() => { if (!notice?.ok) return; const t = window.setTimeout(() => setNotice(null), 12000); return () => window.clearTimeout(t); }, [notice]);

  const recenteLaden = useCallback(async (aantal = 5) => {
    try { setRecent(((await api.post('/api/owner/uitrol/runs', { ...context, perPagina: aantal })).data as RunsAntwoord).runs); } catch { /* lijst blijft zoals ze was */ }
    try { setPogingen(((await api.post('/api/owner/uitrol/pogingen', { ...context, limiet: Math.max(5, aantal) })).data as PogingenAntwoord).pogingen); } catch { /* lijst blijft zoals ze was */ }
  }, [context]);
  useEffect(() => { void recenteLaden(tab === 'log' ? 50 : 5); const t = window.setInterval(() => { if (!document.hidden) void recenteLaden(tab === 'log' ? 50 : 5); }, 10000); return () => window.clearInterval(t); }, [recenteLaden, tab]);

  const doe = useCallback(async (sleutel: string, run: () => Promise<string | void>) => {
    setBusy(sleutel); setNotice(null); setHerhaal(null);
    try { const ok = await run(); wisPoging(`admin|${sleutel}`); if (ok) setNotice({ ok: true, text: ok }); await laden(); }
    catch (c) { const code = foutCode(c); setNotice({ ok: false, text: foutTekst(lang, code, feitenVan(c, code, sleutel)), herstart: isHerstart(code) }); }
    finally { setBusy(''); }
  }, [laden, lang]);

  const metPasskey = async <T,>(maak: () => Promise<T>, vervolg: (r: T) => Promise<string | void>) => {
    try { return await vervolg(await maak()); }
    catch (e) { if (foutCode(e) === 'NotAllowedError') setHerhaal(() => async () => vervolg(await maak())); throw e; }
  };
  const goedkeuren = useCallback((v: Voorstel, risicoBevestigd?: boolean) => doe(`ok-${v.id}`, async () => {
    const u = (await api.post('/api/owner/uitrol/voorstel/uitdaging', { ...context, id: v.id, ...(risicoBevestigd ? { risicoBevestigd: true } : {}) })).data as { uitdagingId: string; publicKey: { challenge: string; rpId: string; timeout: number; allowCredentials: Array<{ type: string; id: string }> } };
    return metPasskey(() => passkeyBevestigen(u.publicKey), async (assertie) => {
      await api.post('/api/owner/uitrol/voorstel/goedkeuren', { ...context, id: v.id, uitdagingId: u.uitdagingId, assertie, ...(risicoBevestigd ? { risicoBevestigd: true } : {}) });
      setTab('overzicht'); window.scrollTo({ top: 0, behavior: 'smooth' });
      return tr(lang, `Схвалено. Стежте за ходом встановлення версії ${v.versie} у картці вище — кожен крок і рядок терміналу з’являється в реальному часі.`, `Goedgekeurd. Volg de installatie van versie ${v.versie} in de kaart hierboven — elke stap en terminalregel verschijnt in real time.`);
    });
  }), [context, doe, lang]); // eslint-disable-line react-hooks/exhaustive-deps
  // UITROL-001: «Зупинити встановлення» — de server vraagt step-up (client.ts handelt STEP_UP_REQUIRED af) en een reden ≥ 10 tekens.
  const stoppen = useCallback((v: { id: string; versie: string; run: string; reden: string }) => { void doe(`stop-${v.versie}`, async () => {
    const r = (await api.post('/api/owner/uitrol/run/stoppen', { ...context, id: v.id || undefined, versie: v.versie || undefined, reden: v.reden })).data as { modus: 'inbox' | 'lopend' | 'te-laat'; pct: number };
    if (r.modus === 'inbox') return tr(lang, `Зупинено до початку: пакет ${v.versie} прибрано з черги сервера, нічого не змінено.`, `Gestopt vóór het begin: pakket ${v.versie} is uit de wachtrij van de server gehaald, er is niets gewijzigd.`);
    if (r.modus === 'te-laat') return tr(lang, `Запит надійшов на ${r.pct} % — перемикання вже триває, тож сервер його не виконає. Результат вирішать перевірка здоров’я й автоматичний відкат.`, `Het verzoek kwam bij ${r.pct} % — het overschakelen loopt al, dus de server voert het niet uit. Gezondheidscontrole en automatische terugdraai beslissen.`);
    return tr(lang, `Запит на зупинку передано серверу (${r.pct} %). За кілька секунд встановлення перерветься; попередній випуск лишиться активним.`, `Het stopverzoek is aan de server doorgegeven (${r.pct} %). Binnen enkele seconden breekt de installatie af; de vorige release blijft actief.`);
  }); }, [context, doe, lang]);
  const afwijzen = useCallback((v: Voorstel, reden: string) => { void doe(`nee-${v.id}`, async () => { await api.post('/api/owner/uitrol/voorstel/afwijzen', { ...context, id: v.id, reden }); return tr(lang, 'Відхилено.', 'Afgewezen.'); }); }, [context, doe, lang]);
  const grantGeven = useCallback((g: GevenInvoer) => { void doe('grant', async () => { await api.post('/api/owner/uitrol/voorbereiders/toevoegen', { ...context, ...g }); return tr(lang, 'Дозвіл надано.', 'Toestemming gegeven.'); }); }, [context, doe, lang]);
  const grantRechten = useCallback((g: Grant, r: RechtenWijzigInvoer) => { void doe(`rc-${g.id}`, async () => { await api.post('/api/owner/uitrol/voorbereiders/rechten', { ...context, id: g.id, ...r }); return tr(lang, 'Права агента оновлено й записано в журнал.', 'Rechten van de agent gewijzigd en in het logboek vastgelegd.'); }); }, [context, doe, lang]);
  const grantTermijn = useCallback((g: Grant, t: { dagen: number; onbepaald: boolean }) => { void doe(`tm-${g.id}`, async () => { await api.post('/api/owner/uitrol/voorbereiders/termijn', { ...context, id: g.id, ...t }); return tr(lang, 'Термін змінено й записано в журнал.', 'Termijn gewijzigd en in het logboek vastgelegd.'); }); }, [context, doe, lang]);
  const grantIntrekken = useCallback((g: Grant, reden: string) => { void doe(`in-${g.id}`, async () => { await api.post('/api/owner/uitrol/voorbereiders/intrekken', { ...context, id: g.id, reden }); return tr(lang, 'Дозвіл відкликано. Користувач отримав сповіщення з причиною.', 'Toestemming ingetrokken. De gebruiker kreeg een melding met de reden.'); }); }, [context, doe, lang]);

  // «Кому дозволено»: zoeken onder ALLE goedgekeurde accounts, niet alleen het eerste blok dat het overzicht meestuurt (20.10.2026).
  const zoekAccounts = useCallback(async (zoek: string) => {
    const r = await api.post('/api/owner/uitrol/kandidaten', { ...context, zoek });
    return (r.data as { kandidaten?: { accounts?: Keuze[]; accountsTotaal?: number } }).kandidaten || {};
  }, [context]);
  const openLog = useCallback((id: string) => { setLogRun(id); setTab('log'); window.scrollTo({ top: 0 }); }, []);
  const naarStroom = useCallback((versie?: string) => { if (versie) setStroomVersie(versie); setTab('stroom'); window.scrollTo({ top: 0, behavior: 'smooth' }); }, []);
  const naarUpload = useCallback(() => { setTab('overzicht'); window.setTimeout(() => document.getElementById('uitrol-upload-anchor')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60); }, []);
  /**
   * Vanuit een afgebroken poging terug naar de wizard. `hervat` = de server heeft nog een deel van dit pakket: dan hoeft de
   * eigenaar alleen hetzelfde bestand opnieuw te kiezen en gaat de upload verder waar hij stopte (src/uitrol/Upload.tsx doet dat
   * zelf). Is hervatten NIET mogelijk, dan opent meteen het bestandsvenster voor een nieuwe poging.
   */
  // UITROL-002: ligt het archief van die poging nog op de server, dan krijgt de wizard het voorstel-id en hervat hij meteen (zonder upload).
  const [hervatVerzoek, setHervatVerzoek] = useState<{ id: string; n: number } | null>(null);
  const naarUploadPoging = useCallback((hervat: boolean, voorstelId = '') => {
    naarUpload();
    if (hervat && voorstelId) setHervatVerzoek((o) => ({ id: voorstelId, n: (o?.n || 0) + 1 }));
    else if (!hervat) window.setTimeout(() => (document.querySelector('[data-meester-bestand]') as HTMLInputElement | null)?.click(), 400);
  }, [naarUpload]);
  // TOEGANG-001: «Керувати доступом» opende alleen het tabblad «Налаштування»; de lijst «Хто готує оновлення» staat daar ONDER de
  // installatiewizard, dus de eigenaar zag niets veranderen en dacht dat de knop niet werkte. Nu: tabblad + scrollen + focus op de lijst.
  const naarToegang = useCallback(() => {
    setTab('instellen');
    window.setTimeout(() => { const el = document.getElementById('ut-voorb-titel'); el?.scrollIntoView({ behavior: 'smooth', block: 'start' }); (el?.closest('[data-ut-voorbereiders]') as HTMLElement | null)?.focus({ preventScroll: true }); }, 80);
  }, []);
  const naarLive = useCallback(() => { document.getElementById('ut-live-titel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, []);
  const onRunVerandert = useCallback((r: Run | null) => { lopendeRun.current = r?.id || ''; }, []);

  // Beide useMemo's staan vóór de vroege return hieronder: hooks mogen nooit achter een conditionele return komen.
  // UITROL-002: wat er nu loopt of op root wacht (voor de wizard en de goedkeurkaart: één installatie tegelijk).
  const lopendeInstallatie = useMemo<LopendeInstallatie | null>(() => {
    const r = recent.find((x) => x.staat === 'bezig' && x.methode !== 'ssh');
    if (r) return { soort: 'run', id: r.voorstelId || r.id, versie: r.versie || r.release || '', wie: r.goedgekeurdDoor || r.wie || '', adres: r.adres || '', sinds: r.gestart };
    const g = data?.voorstellen.find((v) => v.status === 'goedgekeurd');
    return g ? { soort: 'goedgekeurd', id: g.id, versie: g.versie, wie: g.beslistDoor || '', adres: '', sinds: g.beslistOp || g.bijgewerktOp || g.aangemaaktOp } : null;
  }, [recent, data?.voorstellen]);
  // UITROL-002 (eigenaar: «обриви на виборі файлу й першому етапі не показуються»): runs van root én afgebroken pogingen uit de
  // browser samen op datum in «Останні розгортання» — niet alleen in de volledige geschiedenis.
  const recentSamen = useMemo(() => [
    ...recent.map((r) => ({ soort: 'run' as const, tijd: Date.parse(r.gestart) || 0, run: r })),
    ...pogingen.filter((p) => !recent.some((r) => r.voorstelId && r.voorstelId === p.voorstelId && Math.abs(Date.parse(r.gestart) - Date.parse(p.tijd)) < 15 * 60_000)).map((p) => ({ soort: 'poging' as const, tijd: Date.parse(p.tijd) || 0, poging: p })),
  ].sort((a, b) => b.tijd - a.tijd).slice(0, 6), [recent, pogingen]);

  // Контекстна навігація з меню якорів усередині сторінки оновлень (UPD-007).
  const broadcastUitrolStand = useCallback(() => {
    const isKlaar = Boolean(data?.schakelaar && (data?.passkeys?.length ?? 0) > 0 && kanPasskey);
    window.dispatchEvent(new CustomEvent('tsv:uitrol-tab', {
      detail: {
        tab,
        wachtend: data?.voorstellen.filter((v) => v.status === 'wacht-op-goedkeuring').length ?? 0,
        recentAantal: recent.length,
        instellenAandacht: Boolean(data) && !isKlaar,
      },
    }));
  }, [tab, data, recent.length, kanPasskey]);

  useEffect(() => {
    broadcastUitrolStand();
  }, [broadcastUitrolStand]);

  useEffect(() => {
    const onNav = (ev: Event) => {
      const detail = (ev as CustomEvent<{ tab?: Tab; anker?: string; actie?: 'vernieuw' }>).detail;
      if (!detail) return;
      if (detail.actie === 'vernieuw') {
        void laden();
        void recenteLaden(tab === 'log' ? 50 : 5);
        return;
      }
      if (detail.tab && ['overzicht', 'stroom', 'historie', 'log', 'diagnose', 'instellen'].includes(detail.tab)) {
        if (detail.tab === 'log' && recent.some((r) => r.staat === 'bezig')) setLogRun('');
        setTab(detail.tab);
      }
      if (detail.anker) {
        const target = detail.anker;
        window.setTimeout(() => {
          document.getElementById(target)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 70);
      }
    };
    const onVraag = () => broadcastUitrolStand();
    window.addEventListener('tsv:uitrol-nav', onNav);
    window.addEventListener('tsv:uitrol-vraag-stand', onVraag);
    return () => {
      window.removeEventListener('tsv:uitrol-nav', onNav);
      window.removeEventListener('tsv:uitrol-vraag-stand', onVraag);
    };
  }, [broadcastUitrolStand, laden, recenteLaden, recent, tab]);

  // Поки дані не прийшли — той самий компактний індикатор, що й у консолі (src/beheer-laden.css); помилка — без обертання. · Zelfde compacte laadindicator; bij een fout zonder draaien.
  if (!data) return <div className='admin-laden' role='status' aria-busy={!notice || undefined} data-admin-uitrol data-fout={notice && !notice.ok ? '' : undefined}>{notice && !notice.ok ? <PackageCheck aria-hidden='true' /> : <RefreshCw className='spin' aria-hidden='true' />}<p>{notice?.text || tr(lang, 'Завантажуємо оновлення сервера…', 'Serverupdates worden geladen…')}</p></div>;

  const wachtend = data.voorstellen.filter((v) => v.status === 'wacht-op-goedkeuring').length;
  const goedgekeurd = data.voorstellen.filter((v) => v.status === 'goedgekeurd').map((v) => ({ id: v.id, versie: v.versie, beslistOp: v.beslistOp }));
  const klaar = data.schakelaar && data.passkeys.length > 0 && kanPasskey;
  const goedkeurenId = (id: string, risicoBevestigd?: boolean) => { const v = data.voorstellen.find((x) => x.id === id); if (v) void goedkeuren(v, risicoBevestigd); };
  const lopend = recent.find((r) => r.staat === 'bezig')?.id || '';
  const logId = logRun || lopend || lopendeRun.current || recent[0]?.id || '';

  return <div className='admin-uitrol ut-root' data-admin-uitrol data-ut-tab={tab}>
    <header className='ut-hoofd'>
      <div><h1><PackageCheck aria-hidden='true' /> {tr(lang, 'Оновлення сервера', 'Serverupdates')}</h1>
        <p>{tr(lang, 'Завантажте архів випуску (.tar.gz) — навіть з телефона, схваліть passkey і дивіться установку крок за кроком у реальному часі. Кожен запуск зберігається в історії з повним журналом.', 'Upload een release-archief (.tar.gz) — ook vanaf uw telefoon, keur goed met uw passkey en volg de installatie stap voor stap in real time. Elke run blijft met volledig logboek in de geschiedenis.')}</p></div>
      <button type='button' className='ut-knop' onClick={() => { void laden(); void recenteLaden(tab === 'log' ? 50 : 5); }}><RefreshCw aria-hidden='true' />{tr(lang, 'Оновити', 'Vernieuwen')}</button>
    </header>

    {(notice || herhaal) && <div className='ut-melding' role='status'>
      {notice && <p className='ut-notice' data-ok={notice.ok} data-herstart={notice.herstart || undefined}><span>{notice.text}</span><button type='button' className='ut-notice-x' aria-label={tr(lang, 'Закрити повідомлення', 'Melding sluiten')} onClick={() => setNotice(null)}><X aria-hidden='true' /></button></p>}
      {herhaal && <button type='button' className='ut-knop ut-knop-primair' disabled={!!busy} onClick={() => { const run = herhaal; void doe('herhaal', run); }}><Fingerprint aria-hidden='true' />{tr(lang, 'Підтвердити passkey ще раз', 'Passkey opnieuw bevestigen')}</button>}
    </div>}

    <div role='tabpanel' id={`ut-paneel-${tab}`} aria-labelledby={`ut-tab-${tab}`} className='ut-paneel'>
      <div className='ut-raster' hidden={tab !== 'overzicht'}>
        <div className='ut-hoofdkolom'>
          {wachtend > 0 && tgBlokkade?.geblokkeerd && (
            <section className='ut-kaart' role='alert' data-ut-tg-blok-banner>
              <p className='ut-fout'>
                {tr(
                  lang,
                  `Схвалення очікуваного оновлення заблоковано політикою обов’язкового архівування в Telegram: поточний випуск ${tgBlokkade.huidigeVersie || ''} ще не збережено в каналі Telegram.`,
                  `Goedkeuren is geblokkeerd door verplichte Telegram-archivering: de huidige release ${tgBlokkade.huidigeVersie || ''} staat nog niet in Telegram.`,
                )}
              </p>
              <div className='ut-pakket-knoppen'>
                {tgBlokkade.klaar && tgBlokkade.huidigeRunId && (
                  <button
                    type='button'
                    className='ut-knop ut-knop-primair'
                    disabled={Boolean(busy)}
                    onClick={() => void doe('tg-blok-archief', async () => {
                      const r = (await api.post('/api/owner/uitrol/telegram/archiveren', { ...context, runId: tgBlokkade.huidigeRunId })).data as { versie: string; aantalDelen: number };
                      return tr(lang, `Випуск ${r.versie} заархівовано в Telegram (${r.aantalDelen} част.). Тепер можна схвалювати оновлення passkey.`, `Release ${r.versie} in Telegram gearchiveerd (${r.aantalDelen} delen). U kunt nu met passkey goedkeuren.`);
                    })}
                  >
                    {tr(lang, `Заархівувати ${tgBlokkade.huidigeVersie} у Telegram зараз`, `Nu ${tgBlokkade.huidigeVersie} in Telegram archiveren`)}
                  </button>
                )}
                <button
                  type='button'
                  className='ut-knop'
                  onClick={() => {
                    setTab('instellen');
                    window.setTimeout(() => document.getElementById('ut-telegram-archief-anker')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
                  }}
                >
                  {tr(lang, 'Налаштування архіву Telegram', 'Instellingen Telegram-archief')}
                </button>
              </div>
            </section>
          )}
          {/* Eerst de handeling (uploaden); daarna de levende kaart en de goedkeuring, die alleen iets tonen als er echt iets loopt of wacht. */}
          <Upload hervatVerzoek={hervatVerzoek} andereInstallatie={lopendeInstallatie} lang={lang} context={context} data={data} busy={busy} klaar={klaar} kanPasskey={kanPasskey} doe={doe} laden={laden} goedkeurenId={goedkeurenId} onFlow={setFlow} onNieuwId={setNieuwId} naarLive={naarLive} />
          <LiveKaart lang={lang} context={context} wachtendOpGoedkeuring={wachtend} goedgekeurd={goedgekeurd} openLog={openLog} openDiagnose={() => setTab('diagnose')} onRunVerandert={onRunVerandert} flow={flow} stoppen={stoppen} busy={busy} />
          <Goedkeuring lang={lang} data={data} busy={busy} klaar={klaar} goedkeuren={(v, risicoBevestigd) => void goedkeuren(v, risicoBevestigd)} afwijzen={afwijzen} verberg={nieuwId} naarStroom={naarStroom} lopend={lopendeInstallatie} />
          <UitrolStroomKaart lang={lang} context={context} versie={data.voorstellen.find((v) => v.status === 'wacht-op-goedkeuring' || v.status === 'goedgekeurd')?.versie || data.actieveVersie || ''} refreshSleutel={`${data.voorstellen.length}:${recent.length}:${data.actieveVersie || ''}`} naarStroom={naarStroom} />
          <section className='ut-kaart' aria-labelledby='ut-recent-titel'>
            <header className='ut-kaart-kop'><h2 id='ut-recent-titel'>{tr(lang, 'Останні розгортання', 'Laatste uitrollen')}</h2><button type='button' className='ut-knop' onClick={() => setTab('historie')}>{tr(lang, 'Уся історія', 'Volledige geschiedenis')}</button></header>
            <ul className='ut-lijst ut-recent'>
              {recentSamen.map((it) => it.soort === 'poging' ? (() => { const p = it.poging; const oorzaak = pogingOorzaak(lang, p.code, p.redenBekend); const hervat = pogingActie(p) === 'hervatten' || data.voorstellen.some((v) => v.id === p.voorstelId && v.pakketAanwezig === true);
                return <li key={`poging:${p.id}`} data-staat='afgebroken' data-ut-recent-poging={p.etappe}><button type='button' onClick={() => { setOpenRun(`poging:${p.id}`); setTab('historie'); }}>
                  <b className='ut-mono'>{p.versie || tr(lang, 'версія невідома', 'versie onbekend')}</b><i className='ut-badge' data-staat='afgebroken'>{tr(lang, 'Обрив', 'Afgebroken')}</i>
                  <span>{tr(lang, 'етап: ', 'etappe: ')}{etappeTekst(lang, p.etappe)}{p.bytes > 0 ? ` · ${p.procent}%` : ''} · {datum(lang, p.tijd)}</span><small><AlertTriangle aria-hidden='true' /> {oorzaak.waarom}</small></button>
                  <span className='ut-recent-acties'>{hervat
                    ? <button type='button' className='ut-knop ut-knop-primair' data-ut-recent-hervat onClick={() => naarUploadPoging(true, p.voorstelId)}><PlayCircle aria-hidden='true' />{tr(lang, 'Продовжити', 'Hervatten')}</button>
                    : <button type='button' className='ut-knop' data-ut-recent-opnieuw onClick={() => naarUploadPoging(false)}><RotateCcw aria-hidden='true' />{tr(lang, 'Почати заново', 'Opnieuw beginnen')}</button>}</span></li>; })()
              : (() => { const r = it.run; return <li key={r.id} data-staat={r.staat}><button type='button' onClick={() => { setOpenRun(r.id); setTab('historie'); }}>
                <b className='ut-mono'>{r.versie || r.release || '—'}</b><i className='ut-badge' data-staat={r.staat}>{staatTekst(lang, r.staat)}</i>
                <span>{methodeTekst(lang, r.methode)} · {datum(lang, r.gestart)} · {runDuur(r, lang)}</span><small>{lang === 'uk' ? r.uk : r.nl}</small>
                {(() => { const meta = data.voorstellen.find((v) => v.id === r.voorstelId)?.pakketMeta; const door = r.voorbereider || '';
                  return door || meta ? <span className='ut-recent-wie'>{door ? <i><UserCheck aria-hidden='true' />{tr(lang, 'Підготував: ', 'Voorbereid door: ')}{door}</i> : null}{meta?.auteur ? <i><UserRound aria-hidden='true' />{tr(lang, 'Автор: ', 'Auteur: ')}{meta.auteur}</i> : null}{meta?.agent ? <i><Bot aria-hidden='true' />{tr(lang, 'Агент: ', 'Agent: ')}{meta.agent}</i> : null}</span> : null; })()}</button>{(r.staat === 'mislukt' || r.staat === 'afgebroken') && r.voorstelId && data.voorstellen.some((v) => v.id === r.voorstelId && v.pakketAanwezig === true) ? <span className='ut-recent-acties'><button type='button' className='ut-knop ut-knop-primair' data-ut-recent-hervat onClick={() => naarUploadPoging(true, r.voorstelId)} title={tr(lang, 'Архів цієї спроби ще на сервері: встановлення продовжиться без повторного завантаження (passkey знадобиться знову).', 'Het archief van deze poging ligt nog op de server: de installatie gaat verder zonder nieuwe upload (passkey is opnieuw nodig).')}><PlayCircle aria-hidden='true' />{tr(lang, 'Продовжити', 'Hervatten')}</button></span> : null}</li>; })())}
              {recent.length === 0 && pogingen.length === 0 && <li className='ut-leeg'>{tr(lang, 'Поки порожньо.', 'Nog leeg.')}</li>}
            </ul>
            {/* Elke poging laat een spoor na: ook die nooit een run op de server begon (afbreking in de browser). */}
            {/* UI-010 (vlag uitrol-weergave-v2): hier alleen een korte samenvatting; de volledige lijst staat in «Історія». */}
            {v2 ? <ProblemenSamenvatting lang={lang} pogingen={pogingen} runs={recent} actieveVersie={data.actieveVersie || ''} naarGeschiedenis={(id) => { setOpenRun(`poging:${id}`); setTab('historie'); }} />
              : <Pogingen lang={lang} pogingen={pogingen.slice(0, 5)} naarUpload={naarUploadPoging} compact />}
          </section>
        </div>
        <Zijkant lang={lang} context={context} data={data} kanPasskey={kanPasskey} naarUpload={naarUpload} naarLog={() => openLog(lopendeRun.current || recent[0]?.id || '')} naarDiagnose={() => setTab('diagnose')} naarInstellen={() => setTab('instellen')} naarToegang={naarToegang} />
      </div>

      {tab === 'stroom' && <UitrolStroom lang={lang} context={context} versie={stroomVersie} onVersie={setStroomVersie} />}

      {/* Eén tijdlijn (22.10.2026): runs, afgebroken pogingen én pakketten die niet tot installatie kwamen staan samen op datum (src/uitrol/Geschiedenis.tsx). */}
      {tab === 'historie' && <>
        <SelectiefTerugdraaien lang={lang} context={context} />
        <Geschiedenis lang={lang} context={context} openId={openRun} onOpenId={setOpenRun} naarUpload={naarUploadPoging} data={data} v2={v2} naarLog={openLog} naarDiagnose={() => setTab('diagnose')} naarStroom={naarStroom} />
      </>}

      {tab === 'log' && <section className='ut-kaart' data-ut-logtab aria-labelledby='ut-log-titel'>
        <header className='ut-kaart-kop'><div><h2 id='ut-log-titel'>{tr(lang, 'Журнал встановлення', 'Installatielogboek')}</h2>
          <p className='ut-sub'>{tr(lang, 'Повний вивід сервера для вибраного запуску. Його можна перечитати будь-коли, скопіювати чи завантажити.', 'De volledige uitvoer van de server voor de gekozen run. Altijd opnieuw te lezen, te kopiëren of te downloaden.')}</p></div>
          <label className='ut-kies'>{tr(lang, 'Запуск', 'Run')}
            <select data-hulp-vrij='keuze' value={logId} onChange={(e) => setLogRun(e.target.value)}>
              {recent.map((r) => <option key={r.id} value={r.id}>{(r.versie || r.release || r.id)} · {staatTekst(lang, r.staat)} · {datum(lang, r.gestart)}</option>)}
              {logId && !recent.some((r) => r.id === logId) && <option value={logId}>{logId}</option>}
            </select></label>
        </header>
        {v2 && (() => { const r = recent.find((x) => x.id === logId); const v = r?.voorstelId ? data.voorstellen.find((x) => x.id === r.voorstelId) : undefined; const m = v?.pakketMeta?.manifest;
          return r ? <div className='ut-log-wie' data-ut-log-wie><small>{methodeTekst(lang, r.methode)}{(v?.voorbereider || r.voorbereider) ? ` · ${tr(lang, 'завантажив', 'geüpload door')} ${v?.voorbereider || r.voorbereider}` : ''}{(v?.beslistDoor || r.goedgekeurdDoor) ? ` · ${tr(lang, 'схвалив', 'goedgekeurd door')} ${v?.beslistDoor || r.goedgekeurdDoor}` : ''}</small>{m ? <Deelnemers lang={lang} m={m} /> : null}</div> : null; })()}
        <RunDetail lang={lang} context={context} runId={logId} hoogte={520} naarStroom={naarStroom} />
      </section>}

      {tab === 'diagnose' && <><Diagnose lang={lang} context={context} /><Bronnen lang={lang} context={context} /></>}

      {tab === 'instellen' && <>
        <UitrolMeester lang={lang} context={context} sourceOrigin={sourceOrigin} tabContext={tabContext} data={data} laden={laden} naarOverzicht={naarUpload} teGoedkeuren={wachtend} />
        <Voorbereiders lang={lang} data={data} busy={busy} geven={grantGeven} intrekken={grantIntrekken} termijn={grantTermijn} rechten={grantRechten} zoekAccounts={zoekAccounts} />
        <SleutelsDrieFactoren lang={lang} context={context} data={data} />
        <GithubInstellingen lang={lang} context={context} onVoorstelOntvangen={() => { void laden(); setTab('overzicht'); }} />
        <TelegramArchief lang={lang} context={context} runs={recent} onGewijzigd={() => void laden()} />
        <VerdeeldeOpslagPaneel lang={lang} context={context} />
        <ZoneKiezer lang={lang} />
      </>}
    </div>
  </div>;
}
