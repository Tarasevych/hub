// «Координація» на mcp.*/agenten (ORCH-001 етап 3, 31.10.2026): одна картина для всіх ШІ-агентів і три дії власника —
//   1. огляд: чинні правила (версія, відбиток, підтвердження власника), база, задачі зі статусами, черга, передачі, controleer;
//   2. передати результат агента з цього пристрою (zip/tar.gz/patch) у ТОЙ САМИЙ конвеєр, що й node scripts/orch.mjs inleveren;
//   3. змінити правила: редагування → перевірка (beoordeelVoorstel) → підпис passkey (рішення «orch-regels», root записує підтвердження)
//      → застосування: git-гілка regels/<versie>-<час> із новим lock, push, посилання на PR; агенти бачать нову версію через CONTEXT-COMPACT.
// Усі дані — з робочої копії репозиторію координації на сервері (ORCH_WORTEL); без неї сторінка чесно каже, що налаштувати (RUNBOOK §18).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Fingerprint, FileText, GitMerge, Loader2, RefreshCw, TriangleAlert, Upload } from 'lucide-react';
import { sessionBody } from '../agenten-gegevens';
import type { Tr } from '../mcp-ui';
import HulpVraag from '../hulp/HulpVraag';
import { kanPasskey } from '../platform/webauthn';
import { Badge, Groep, Knop, Melding, Rij, Tech, useActies, type Toon } from './ui';
import BesluitStand, { type LeefStand } from '../besluit/BesluitStand';
import { besluitCodeTekst, type OrchRegelsInhoud } from '../../shared/eigenaar-besluit';
import { besluitFoutCode, besluitOndertekenen, besluitStarten, besluitVolgen, type Gestart } from '../besluit/besluit-client';
import type { OrchOverzicht, OrchRegelsOverzicht, OrchTaak, OrchVoorstel, OrchZaak } from '../../shared/orch-model';
import { orchFoutTekst, orchInleveren, orchOverzicht, orchRegels, orchToepassen, orchVoorstelIntrekken, orchVoorstelMaken, type InleverUitkomst, type ToepassenUitkomst } from '../orch/orch-client';
import '../orch/orch.css';

const STATUS_TOON: Record<string, Toon> = { in_progress: 'info', integrated: 'ok', released: 'ok', installed: 'ok', bevroren: 'warn', geannuleerd: 'off' };
const kort = (s: string | null | undefined, n = 12) => (s ? s.slice(0, n) : '—');
const Zaken = ({ zaken, lang }: { zaken: OrchZaak[]; lang: 'uk' | 'nl' }) => (zaken.length ? <ul className='orch-zaken'>{zaken.map((z, i) => <li key={`${z.code}-${i}`} data-ernst={z.ernst}><code>{z.code}</code> {lang === 'uk' ? z.uk : z.nl}</li>)}</ul> : null);

export default function TabOrch({ tr }: { tr: Tr }) {
  const lang = tr('uk', 'nl') as 'uk' | 'nl';
  const ctx = useMemo(() => sessionBody(), []);
  const acties = useActies(tr);
  const [data, setData] = useState<OrchOverzicht | null>(null);
  const [alleenEigenaar, setAlleenEigenaar] = useState(false);
  const [laadFout, setLaadFout] = useState('');
  const [open, setOpen] = useState('');
  const laden = useCallback(async () => {
    setLaadFout('');
    try { setData(await orchOverzicht(ctx)); }
    catch (e) { const c = besluitFoutCode(e); if (c === 'OWNER_REQUIRED' || c === 'ADMIN_SERVICE_REQUIRED') { setAlleenEigenaar(true); return; } setLaadFout(orchFoutTekst(e, lang)); }
  }, [ctx, lang]);
  useEffect(() => { void laden(); }, [laden]);

  // INTEG-001 (03.11.2026): elk deel is een blok .ag-blok met één kop (titel + (?) + knoppen) en één zin uitleg. De naam van het
  // tabblad («Координація») staat al in de rand van de pagina; de eerste kop zegt daarom wat dit blok is: de stand nu.
  if (alleenEigenaar) return <section className='ag-blok' data-orch='alleen-eigenaar'>
    <header className='ag-blok-kop'><h3 className='ag-blok-titel'><GitMerge aria-hidden='true' /> {tr('Координація агентів', 'Agentcoördinatie')}</h3>
      <p className='ag-blok-uitleg'>{tr('Координацію ШІ-агентів (правила, задачі, черга, передачі) веде власник сервера. Агенти бачать той самий стан через інструменти orch_* технічного простору.', 'De coördinatie van AI-agenten (regels, taken, wachtrij, overdrachten) beheert de eigenaar van de server. Agenten zien dezelfde staat via de orch_*-hulpmiddelen van de technische ruimte.')}</p></header></section>;

  const r = data?.regels;
  const eig = r?.eigenaar;
  return <div className='ag-tab' data-orch>
    <section className='ag-blok' aria-labelledby='orch-titel'>
      <header className='ag-blok-kop'>
        <h3 className='ag-blok-titel' id='orch-titel'><GitMerge aria-hidden='true' /> {tr('Стан зараз', 'Stand nu')} <HulpVraag k='orch.overzicht' lang={lang} /></h3>
        <div className='ag-knoppen'><Knop onClick={() => void laden()} icoon={<RefreshCw />} title={tr('Перечитати стан із робочої копії на сервері', 'De staat opnieuw uit de werkkopie op de server lezen')} data='orch-vernieuw'>{tr('Оновити', 'Vernieuwen')}</Knop></div>
        <p className='ag-blok-uitleg'>{tr('Координація агентів: одна пам’ять, одна система правил, одна черга інтеграції, один випуск — для Claude, Antigravity, ChatGPT, Codex, Grok, Copilot, Gemini, Cursor. Джерело правди: AGENTS.md і orchestratie/ у робочій копії на сервері; те саме читає node scripts/orch.mjs.', 'Agentcoördinatie: één geheugen, één regelsysteem, één integratiewachtrij, één release — voor Claude, Antigravity, ChatGPT, Codex, Grok, Copilot, Gemini, Cursor. Bron van waarheid: AGENTS.md en orchestratie/ in de werkkopie op de server; node scripts/orch.mjs leest hetzelfde.')}</p>
      </header>
      {laadFout && <p className='ag-fout' role='alert'>{laadFout}</p>}
      {!data && !laadFout && <p className='bsl-stil'><Loader2 size={14} className='bsl-spin' aria-hidden='true' /> {tr('Завантаження…', 'Laden…')}</p>}
      {data && !data.repo.aanwezig && <div className='orch-waarsch' role='alert' data-orch-geen-repo><TriangleAlert size={18} aria-hidden='true' /><div>
        <b>{tr('На сервері немає робочої копії репозиторію координації.', 'Op de server staat geen werkkopie van de coördinatierepository.')}</b>
        <p className='ag-meta'>{tr(`Очікуваний шлях: ${data.repo.wortel} (змінна ORCH_WORTEL служби). Налаштування — RUNBOOK §18: git clone гілки integratie з deploy-ключем лише для цього репозиторію; до того правила й передачі керуються лише через git і node scripts/orch.mjs.`, `Verwacht pad: ${data.repo.wortel} (variabele ORCH_WORTEL van de dienst). Inrichting — RUNBOOK §18: git clone van de tak integratie met een deploy-sleutel alleen voor deze repository; tot dan lopen regels en overdrachten alleen via git en node scripts/orch.mjs.`)}</p>
      </div></div>}
      {data?.repo.aanwezig && r && <div className='orch-grid'>
        <div className='orch-kv'><small>{tr('Чинні правила', 'Geldende regels')}</small><b>regelsVersie {r.regelsVersie}</b><code title={tr('Відбиток AGENTS.md + beleid.json + BESLUITEN.md (regels.lock.json). Агент має назвати його в передачі.', 'Afdruk van AGENTS.md + beleid.json + BESLUITEN.md (regels.lock.json). De agent moet hem in de overdracht noemen.')}>hash {kort(r.hash)}…</code></div>
        <div className='orch-kv'><small>{tr('Критичні політики', 'Kritieke regels')}</small>
          <b>{eig ? <Badge toon='ok'>{tr(`підтверджено (${eig.soort === 'passkey' ? 'passkey' : 'SSH'})`, `bevestigd (${eig.soort === 'passkey' ? 'passkey' : 'SSH'})`)}</Badge> : <Badge toon='warn'>{tr('не підтверджено — діють як пропозиція', 'niet bevestigd — gelden als voorstel')}</Badge>}</b>
          <code title={tr('kritiekHash — відбиток розділу kritiek у beleid.json; підпис власника стосується саме його.', 'kritiekHash — afdruk van de sectie kritiek in beleid.json; de handtekening van de eigenaar hoort daarbij.')}>kritiek {kort(r.kritiekHash)}…{eig?.passkey ? ` · passkey ${eig.passkey}` : eig?.sleutel ? ` · ${eig.sleutel.slice(0, 20)}…` : ''}</code>
          {r.eigenaarStatus && <small data-ernst={r.eigenaarStatus.ernst}>{lang === 'uk' ? r.eigenaarStatus.uk : r.eigenaarStatus.nl}</small>}</div>
        <div className='orch-kv'><small>{tr('База коду', 'Codebasis')}</small><b>{data.basis?.versie}</b><code>{kort(data.basis?.bronCommit)}… · {data.basis?.verificatie}</code>{data.geinstalleerd && <small>{tr('встановлено', 'geïnstalleerd')}: {data.geinstalleerd.versie} @ {kort(data.geinstalleerd.bronCommit)}…</small>}</div>
        <div className='orch-kv'><small>{tr('Робоча копія', 'Werkkopie')}</small><b>{data.integratie?.tak} ← {data.repo.tak}</b><code>{kort(data.repo.hoofd)}… · {data.repo.schoon ? tr('чисто', 'schoon') : tr('є незакомічені зміни', 'niet-gecommitte wijzigingen')}</code>{data.repo.origin && <small>{data.repo.origin}</small>}</div>
        <div className='orch-kv'><small>{tr('Перевірка правил (orch controleer)', 'Regelcontrole (orch controleer)')}</small>
          <b>{data.controleer ? (data.controleer.code === 0 ? <Badge toon='ok'>{tr('усе гаразд', 'alles in orde')}</Badge> : <Badge toon='bad'>{tr(`помилки (код ${data.controleer.code})`, `fouten (code ${data.controleer.code})`)}</Badge>) : '—'}</b>
          {data.controleer && <details><summary className='ag-meta'>{tr('Вивід', 'Uitvoer')}</summary><pre className='orch-regel-uit'>{data.controleer.regels.join('\n')}</pre></details>}</div>
      </div>}
      {data?.repo.aanwezig && <ul className='orch-chips' aria-label={tr('Агенти', 'Agenten')}>{data.agenten.map((a) => <li key={a.id} title={`${tr('канали', 'kanalen')}: ${a.kanalen.join(', ')}${a.adapter ? ` · ${a.adapter}` : ''}`}><b>{a.naam || a.id}</b> · {a.taken} {tr('задач', 'taken')}</li>)}</ul>}
    </section>

    {data?.repo.aanwezig && <Taken tr={tr} lang={lang} data={data} open={open} setOpen={setOpen} />}
    {data?.repo.aanwezig && <Inleveren tr={tr} lang={lang} ctx={ctx} data={data} naKlaar={laden} />}
    {data?.repo.aanwezig && <Regels tr={tr} lang={lang} ctx={ctx} naKlaar={laden} acties={acties} />}
    <Melding uitkomst={acties.uitkomst} tr={tr} onSluit={() => acties.setUitkomst(null)} />
  </div>;
}

// ---------------------------------------------------------------- задачі, черга, передачі
function Taken({ tr, lang, data, open, setOpen }: { tr: Tr; lang: 'uk' | 'nl'; data: OrchOverzicht; open: string; setOpen: (v: string) => void }) {
  const statusTekst = (t: OrchTaak) => ({ in_progress: tr('в роботі', 'in bewerking'), integrated: tr('інтегровано', 'geïntegreerd'), released: tr('випущено', 'uitgebracht'), installed: tr('встановлено', 'geïnstalleerd'), bevroren: tr('заморожено', 'bevroren'), geannuleerd: tr('скасовано', 'geannuleerd') } as Record<string, string>)[t.status] ?? t.status;
  return <section className='ag-blok' aria-labelledby='orch-taken'>
    <header className='ag-blok-kop'>
      <h3 className='ag-blok-titel' id='orch-taken'><FileText aria-hidden='true' /> {tr('Задачі', 'Taken')} <span className='ag-teller'>{data.taken.length}</span></h3>
      <p className='ag-blok-uitleg'>{tr('Задачі всіх агентів зі статусом; рядок розгортається з гілкою, базою й правилами задачі. Нижче — черга інтеграції й останні передачі.', 'De taken van alle agenten met hun status; een rij klapt open met tak, basis en regels van de taak. Daaronder de integratiewachtrij en de laatste overdrachten.')}</p>
    </header>
    {!data.taken.length && <p className='ag-leeg'>{tr('Задач ще немає. Агент реєструє задачу через node scripts/orch.mjs taak-start або інструмент orch_taak_start.', 'Nog geen taken. Een agent registreert een taak via node scripts/orch.mjs taak-start of het hulpmiddel orch_taak_start.')}</p>}
    {data.taken.length > 0 && <ul className='ag-lijst'>{data.taken.map((t) => <Rij key={t.id} id={`taak-${t.id}`} logo={<FileText />} titel={`${t.id} · ${t.agent}`} open={open === t.id} onToggle={() => setOpen(open === t.id ? '' : t.id)}
      badges={<><Badge toon={STATUS_TOON[t.status] ?? 'info'} data={t.status}>{statusTekst(t)}</Badge>{t.staat === 'ter_integratie' && <Badge toon='info'>{tr('у черзі', 'in de wachtrij')}</Badge>}{!t.regelsActueel && <Badge toon='warn' data='regels-verouderd'>{tr(`правила ${t.regelsVersie} — застаріли`, `regels ${t.regelsVersie} — verouderd`)}</Badge>}</>}
      status={<>{t.omschrijving || t.tak} · {tr('оновлено', 'bijgewerkt')} {t.bijgewerkt.slice(0, 16).replace('T', ' ')}</>}>
      <Tech rijen={[[tr('Гілка', 'Tak'), <code>{t.tak}</code>], [tr('База', 'Basis'), <code>{t.basisCommit} ({t.basisVersie})</code>], [tr('Правила задачі', 'Regels van de taak'), <code>{t.regelsVersie} {kort(t.regelsHash)}</code>], [tr('Канал', 'Kanaal'), t.kanaal], [tr('Передачі', 'Overdrachten'), t.overdrachten.length ? t.overdrachten.join(', ') : '—']]} />
      {!t.regelsActueel && <p className='ag-meta'>{tr('Агент має перечитати AGENTS.md і виконати node scripts/orch.mjs taak-herlees --id ', 'De agent moet AGENTS.md herlezen en node scripts/orch.mjs taak-herlees --id uitvoeren: ')}{t.id}{tr(' — інакше його передачу відхилить REGELS_VEROUDERD.', ' — anders weigert REGELS_VEROUDERD zijn overdracht.')}</p>}
    </Rij>)}</ul>}
    {data.wachtrij && <Groep titel={tr(`Черга інтеграції → ${data.wachtrij.integratieTak}`, `Integratiewachtrij → ${data.wachtrij.integratieTak}`)} aantal={data.wachtrij.wachtrij.length} data='wachtrij'>
      {data.wachtrij.wachtrij.map((w) => <li key={w.inleveringId} className='ag-rij'><div className='ag-rij-kop'><span className='ag-rij-tekst'><span className='ag-rij-titel'><b>{w.taakId}</b> <Badge toon={w.staat === 'bezig' ? 'warn' : 'info'}>{w.staat}</Badge></span><small className='ag-rij-status'>{w.agent} · {w.tak} · {w.kanaal} · {w.ingediend.slice(0, 16).replace('T', ' ')}</small></span></div></li>)}
    </Groep>}
    <Groep titel={tr('Останні передачі', 'Laatste overdrachten')} aantal={data.inleveringen.length} data='inleveringen'>
      {data.inleveringen.map((i) => <li key={i.id} className='ag-rij'><div className='ag-rij-kop'><span className='ag-rij-tekst'><span className='ag-rij-titel'><b>{i.id}</b> <Badge toon={i.uitkomst === 'aanvaard' ? 'ok' : 'bad'}>{i.uitkomst === 'aanvaard' ? tr('прийнято', 'aanvaard') : tr('відхилено', 'geweigerd')}</Badge></span>
        <small className='ag-rij-status'>{i.agent ?? '—'} · {i.kanaal} · {i.bestanden} {tr('файлів', 'bestanden')} · {i.tests ? `${i.tests.geslaagd + i.tests.mislukt ? `${tr('перевірки', 'controles')} ${i.tests.geslaagd}/${i.tests.geslaagd + i.tests.mislukt}` : ''}${i.tests.overgeslagen ? ` · ${tr('тести агента пропущено', 'agenttests overgeslagen')}` : ''}` : ''}</small></span></div>
        <Zaken zaken={i.zaken.filter((z) => z.ernst === 'fout')} lang={lang} /></li>)}
    </Groep>
  </section>;
}

// ---------------------------------------------------------------- передача результату з цього пристрою
function Inleveren({ tr, lang, ctx, data, naKlaar }: { tr: Tr; lang: 'uk' | 'nl'; ctx: Record<string, unknown>; data: OrchOverzicht; naKlaar: () => Promise<void> }) {
  const [bestand, setBestand] = useState<File | null>(null);
  const [taakId, setTaakId] = useState('');
  const [bezig, setBezig] = useState(false);
  const [voortgang, setVoortgang] = useState(0);
  const [fout, setFout] = useState('');
  const [uit, setUit] = useState<InleverUitkomst | null>(null);
  const start = async () => {
    if (!bestand) return;
    setBezig(true); setFout(''); setUit(null); setVoortgang(0);
    try { const r = await orchInleveren(ctx, bestand, { taakId: taakId.trim() || undefined, onVoortgang: (o, t) => setVoortgang(t ? o / t : 0) }); setUit(r); setBestand(null); await naKlaar(); }
    catch (e) { setFout(orchFoutTekst(e, lang)); }
    finally { setBezig(false); }
  };
  return <section className='ag-blok' aria-labelledby='orch-inleveren'>
    <header className='ag-blok-kop'>
      <h3 className='ag-blok-titel' id='orch-inleveren'><Upload aria-hidden='true' /> {tr('Передати результат агента', 'Resultaat van een agent inleveren')} <HulpVraag k='orch.inlevering' lang={lang} /></h3>
      <p className='ag-blok-uitleg'>{tr('Пакет від агента з цього пристрою йде в той самий конвеєр приймання, що й на сервері; нічого не зливається й не встановлюється.', 'Een pakket van een agent gaat vanaf dit apparaat door dezelfde inleverpijplijn als op de server; er wordt niets samengevoegd of geïnstalleerd.')}</p>
    </header>
    <p className='ag-meta'>{tr(`Пакет mijn-ruimte-<versie>-<agent>-overdracht.zip, zip/tar.gz з ORCH-OVERDRACHT.json або git patch (до ${Math.round(data.limieten.uploadMaxBytes / 1048576)} МіБ). Той самий конвеєр, що й node scripts/orch.mjs inleveren: гілка від бази, правила, конфлікти з integratie, тести, запис, черга. Нічого не зливається й не встановлюється.`, `Pakket mijn-ruimte-<versie>-<agent>-overdracht.zip, zip/tar.gz met ORCH-OVERDRACHT.json of git patch (hoogstens ${Math.round(data.limieten.uploadMaxBytes / 1048576)} MiB). Dezelfde pijplijn als node scripts/orch.mjs inleveren: tak vanaf de basis, regels, conflicten met integratie, tests, record, wachtrij. Er wordt niets samengevoegd of geïnstalleerd.`)}</p>
    <div className='ag-formrij'>
      <label className='bsl-veld bsl-groei'><span>{tr('Файл пакета', 'Pakketbestand')}</span><input type='file' accept='.zip,.gz,.patch,application/zip,application/gzip' disabled={bezig} onChange={(e) => setBestand(e.target.files?.[0] ?? null)} data-orch-veld='bestand' /></label>
      <label className='bsl-veld'><span>{tr('Task ID (якщо немає в пакеті)', 'Task ID (als die niet in het pakket zit)')}</span><input type='text' value={taakId} placeholder='ABC-001' maxLength={16} disabled={bezig} onChange={(e) => setTaakId(e.target.value.toUpperCase())} data-orch-veld='taak' /></label>
      <Knop toon='primary' icoon={<Upload />} bezig={bezig} disabled={!bestand} onClick={() => void start()} title={tr('Надсилає файл фрагментами по 512 КіБ, звіряє SHA-256 і запускає конвеєр приймання на сервері.', 'Stuurt het bestand in stukken van 512 KiB, vergelijkt de SHA-256 en start de inleverpijplijn op de server.')} data='orch-inleveren'>{tr('Передати', 'Inleveren')}</Knop>
    </div>
    {bezig && <div className='orch-balk' aria-label={tr('Поступ', 'Voortgang')}><i style={{ width: `${Math.round(voortgang * 100)}%` }} /></div>}
    {fout && <p className='ag-fout' role='alert'>{fout}</p>}
    {uit && <div className={`ag-kaart${uit.record.uitkomst === 'aanvaard' ? ' ag-vers' : ' ag-waarschuwing'}`} data-orch-uitkomst={uit.record.uitkomst}>
      <p><b>{uit.record.uitkomst === 'aanvaard' ? tr('Прийнято', 'Aanvaard') : tr('Відхилено', 'Geweigerd')}</b> · {uit.record.id}</p>
      <Tech rijen={[[tr('Задача', 'Taak'), uit.record.taakId ?? '—'], [tr('Гілка', 'Tak'), <code>{uit.record.tak ?? '—'}</code>], ['commit', <code>{kort(uit.record.commit)}</code>], [tr('Файлів', 'Bestanden'), String(uit.record.bestanden.length)], [tr('Тести', 'Tests'), uit.record.tests ? `${uit.record.tests.geslaagd} ok / ${uit.record.tests.mislukt} ${tr('помилок', 'fout')}${uit.record.tests.overgeslagen ? ` · ${tr('тести агента пропущено', 'agenttests overgeslagen')}: ${uit.record.tests.reden ?? ''}` : ''}` : '—'], uit.record.conflicten.length ? [tr('Конфлікти', 'Conflicten'), uit.record.conflicten.join(', ')] : null, [tr('Стан закомічено', 'Staat gecommit'), <code>{kort(uit.staatCommit)}</code>]]} />
      <Zaken zaken={uit.record.zaken} lang={lang} />
    </div>}
  </section>;
}

// ---------------------------------------------------------------- правила: редагування → перевірка → passkey → гілка
function Regels({ tr, lang, ctx, naKlaar, acties }: { tr: Tr; lang: 'uk' | 'nl'; ctx: Record<string, unknown>; naKlaar: () => Promise<void>; acties: ReturnType<typeof useActies> }) {
  const [ov, setOv] = useState<OrchRegelsOverzicht | null>(null);
  const [bewerk, setBewerk] = useState(false);
  const [teksten, setTeksten] = useState<Record<string, string>>({});
  const [voorstel, setVoorstel] = useState<OrchVoorstel | null>(null);
  const [zaken, setZaken] = useState<OrchZaak[]>([]);
  const [bezig, setBezig] = useState<'' | 'controle' | 'starten' | 'passkey' | 'volgen' | 'toepassen'>('');
  const [fout, setFout] = useState('');
  const [gestart, setGestart] = useState<Gestart | null>(null);
  const [leef, setLeef] = useState<LeefStand>({ besluit: null });
  const [klaar, setKlaar] = useState<ToepassenUitkomst | null>(null);
  const weg = useRef<AbortController | null>(null);
  const laden = useCallback(async () => { try { const d = await orchRegels(ctx); setOv(d); setTeksten((t) => (Object.keys(t).length ? t : { ...d.bestanden })); } catch (e) { setFout(orchFoutTekst(e, lang)); } }, [ctx, lang]);
  useEffect(() => { void laden(); return () => weg.current?.abort(); }, [laden]);

  const gewijzigd = useMemo(() => Object.fromEntries(Object.entries(teksten).map(([p, t]) => [p, t !== (ov?.bestanden[p] ?? '')])), [teksten, ov]);
  const ietsGewijzigd = Object.values(gewijzigd).some(Boolean);
  const controleren = async () => {
    setBezig('controle'); setFout(''); setVoorstel(null); setZaken([]); setKlaar(null);
    // Лише змінені файли йдуть на сервер — решту він бере з робочої копії (beoordeelVoorstel). / Alleen gewijzigde bestanden gaan mee.
    const gewijzigdeTeksten: Record<string, string> = Object.fromEntries(Object.entries(teksten).filter(([p]) => gewijzigd[p]));
    try { const r = await orchVoorstelMaken(ctx, gewijzigdeTeksten); setVoorstel(r.voorstel); setZaken(r.zaken); }
    catch (e) { setFout(orchFoutTekst(e, lang)); }
    finally { setBezig(''); }
  };
  const toepassen = useCallback(async (v: OrchVoorstel, besluitId: string) => {
    setBezig('toepassen');
    try { const r = await orchToepassen(ctx, v.id, besluitId); setKlaar(r); setBewerk(false); setTeksten({}); setVoorstel(null); await laden(); await naKlaar(); }
    catch (e) { setFout(orchFoutTekst(e, lang)); }
    finally { setBezig(''); }
  }, [ctx, lang, laden, naKlaar]);
  const volg = useCallback(async (v: OrchVoorstel, id: string) => {
    setBezig('volgen'); const ac = new AbortController(); weg.current = ac;
    const eind = await besluitVolgen(ctx, id, (s) => { if ('pauze' in s) setLeef((l) => ({ ...l, pauze: s.fout })); else setLeef({ besluit: s.besluit, pauze: '' }); }, { signal: ac.signal, maxMs: 5 * 60_000 });
    setBezig('');
    if (eind?.besluit.staat === 'klaar') await toepassen(v, eind.besluit.id);
  }, [ctx, toepassen]);
  const onderteken = useCallback(async (v: OrchVoorstel, g: Gestart) => {
    setFout(''); setBezig('passkey');
    try { const b = await besluitOndertekenen(ctx, g); setLeef({ besluit: b }); if (b.staat === 'ondertekend') await volg(v, b.id); else { setBezig(''); if (b.staat === 'klaar') await toepassen(v, b.id); } }
    catch (e) { const code = besluitFoutCode(e); setBezig(''); if (code === 'PASSKEY_GEANNULEERD') setFout(tr('Підпис скасовано або не вдався. Натисніть «Підтвердити passkey ще раз».', 'De handtekening is geannuleerd of mislukt. Klik op «Passkey opnieuw bevestigen».')); else { setGestart(null); setFout(besluitCodeTekst(lang, code) || code); } }
  }, [ctx, lang, toepassen, tr, volg]);
  const start = useCallback(async (v: OrchVoorstel) => {
    setFout(''); setBezig('starten'); setLeef({ besluit: null });
    const inhoud: OrchRegelsInhoud = { regelsVersie: v.regelsVersie, hash: v.hash, kritiekHash: v.kritiekHash, voorstel: v.id };
    let g: Gestart;
    try { g = await besluitStarten(ctx, 'orch-regels', inhoud); } catch (e) { setBezig(''); setFout(besluitCodeTekst(lang, besluitFoutCode(e))); return; }
    setGestart(g); await onderteken(v, g);
  }, [ctx, lang, onderteken]);

  const blok = !ov ? '' : !ov.schakelaar.orchRegelsPasskey ? besluitCodeTekst(lang, 'BESLUIT_UIT') : !ov.repo.schoon ? tr('У робочій копії є незакомічені зміни — спершу наведіть лад через SSH (git status).', 'De werkkopie heeft niet-gecommitte wijzigingen — ruim eerst op via SSH (git status).') : !kanPasskey() ? tr('Відкрийте цю сторінку в браузері з підтримкою passkey.', 'Open deze pagina in een browser die passkeys ondersteunt.') : '';
  const eind = leef.besluit && ['klaar', 'geweigerd', 'mislukt', 'verlopen'].includes(leef.besluit.staat);
  return <section className='ag-blok' aria-labelledby='orch-regels-titel' data-orch-regels>
    <header className='ag-blok-kop'>
      <h3 className='ag-blok-titel' id='orch-regels-titel'><Fingerprint aria-hidden='true' /> {tr('Правила координації', 'Coördinatieregels')} <HulpVraag k='orch.regels' lang={lang} /></h3>
      {ov && !bewerk && <div className='ag-knoppen'><Knop onClick={() => { setBewerk(true); setKlaar(null); setTeksten({ ...ov.bestanden }); }} icoon={<FileText />} disabled={!!blok} title={blok || tr('Відкриває редактор AGENTS.md, beleid.json і BESLUITEN.md. Зміна набуде сили лише після перевірки, підпису passkey і злиття гілки.', 'Opent de editor voor AGENTS.md, beleid.json en BESLUITEN.md. De wijziging geldt pas na controle, passkey-handtekening en het samenvoegen van de tak.')} data='orch-regels-bewerk'>{tr('Змінити правила', 'Regels wijzigen')}</Knop></div>}
      <p className='ag-blok-uitleg'>{tr('Правила, за якими працюють усі агенти; змінюються лише через перевірку й ваш підпис passkey.', 'De regels waarnaar alle agenten werken; ze veranderen alleen via controle en uw passkey-handtekening.')}</p>
    </header>
    <p className='ag-meta'>{tr('Зміна → перевірка (regelsVersie вища, запис у BESLUITEN.md, beleid.json валідний) → підпис passkey (root записує підтвердження) → гілка regels/<versie>-<час> із новим regels.lock.json і CONTEXT-COMPACT.md іде в GitHub; агенти бачать нову версію й мають перечитати правила. Злиття в integratie лишається за вами.', 'Wijziging → controle (regelsVersie hoger, regel in BESLUITEN.md, beleid.json geldig) → passkey-handtekening (root legt de bevestiging vast) → tak regels/<versie>-<tijd> met nieuwe regels.lock.json en CONTEXT-COMPACT.md gaat naar GitHub; agenten zien de nieuwe versie en moeten de regels herlezen. Samenvoegen in integratie blijft aan u.')}</p>
    {blok && <p className='ag-fout' data-orch-blok>{blok}</p>}
    {fout && <p className='ag-fout' role='alert'>{fout}</p>}
    {klaar && <div className='ag-kaart ag-vers' data-orch-toegepast><p><CheckCircle2 size={16} aria-hidden='true' /> <b>{tr(`Правила ${klaar.voorstel.regelsVersie} застосовано в гілці`, `Regels ${klaar.voorstel.regelsVersie} toegepast in de tak`)}</b> <code>{klaar.tak}</code></p>
      <Tech rijen={[['commit', <code>{klaar.commit}</code>], [tr('Відправлено в origin', 'Naar origin gestuurd'), klaar.gepusht ? tr('так', 'ja') : `${tr('ні', 'nee')} — ${klaar.pushDetail}`], klaar.prUrl ? ['PR', <a className='ag-link' href={klaar.prUrl} target='_blank' rel='noreferrer'>{klaar.prUrl}</a>] : null, [tr('Перевірка', 'Controle'), <pre className='orch-regel-uit'>{klaar.controleer.join('\n')}</pre>]]} />
      {!klaar.gepusht && <p className='ag-meta'>{tr('Гілка існує лише на сервері: відправте її через SSH (git push -u origin <tak>) або налаштуйте deploy-ключ із правом запису (RUNBOOK §18).', 'De tak bestaat alleen op de server: stuur hem via SSH (git push -u origin <tak>) of richt een deploy-sleutel met schrijfrecht in (RUNBOOK §18).')}</p>}</div>}
    {bewerk && ov && !leef.besluit && <div className='orch-regels'>
      {Object.keys(ov.bestanden).map((p) => <div key={p} className='orch-bestand'><label><span><code>{p}</code>{gewijzigd[p] && <> · <Badge toon='info'>{tr('змінено', 'gewijzigd')}</Badge></>}</span><button type='button' className='ag-link' disabled={!gewijzigd[p]} onClick={() => setTeksten({ ...teksten, [p]: ov.bestanden[p] })}>{tr('повернути як у репозиторії', 'terug naar de repository')}</button></label>
        <textarea className={gewijzigd[p] ? 'is-gewijzigd' : undefined} value={teksten[p] ?? ''} spellCheck={false} disabled={!!bezig} onChange={(e) => { setTeksten({ ...teksten, [p]: e.target.value }); setVoorstel(null); }} data-orch-bestand={p} /></div>)}
      <div className='ag-knoppen'>
        <Knop toon='primary' bezig={bezig === 'controle'} disabled={!ietsGewijzigd || !!bezig} onClick={() => void controleren()} title={tr('Сервер оцінює пропозицію тими самими функціями, що й node scripts/orch.mjs vergrendel: версія, запис у BESLUITEN.md, валідність beleid.json, новий відбиток.', 'De server beoordeelt het voorstel met dezelfde functies als node scripts/orch.mjs vergrendel: versie, regel in BESLUITEN.md, geldigheid van beleid.json, nieuwe afdruk.')} data='orch-regels-controle'>{tr('Перевірити пропозицію', 'Voorstel controleren')}</Knop>
        <Knop disabled={!!bezig} onClick={() => { setBewerk(false); setVoorstel(null); setZaken([]); setFout(''); }} data='orch-regels-annuleer'>{tr('Скасувати', 'Annuleren')}</Knop>
      </div>
      <Zaken zaken={zaken} lang={lang} />
      {voorstel && <div className='ag-kaart' data-orch-voorstel={voorstel.id}>
        <p><b>{tr('Пропозиція', 'Voorstel')} {voorstel.regelsVersie}</b> · hash <code>{kort(voorstel.hash, 16)}…</code> · kritiek <code>{kort(voorstel.kritiekHash, 16)}…</code></p>
        <ul className='orch-chips'>{Object.entries(voorstel.verschil).filter(([, v]: [string, OrchVoorstel['verschil'][string]]) => v.gewijzigd).map(([p, v]) => <li key={p}><code>{p}</code> +{v.toegevoegd} −{v.verwijderd}</li>)}</ul>
        {voorstel.kritiekGewijzigd && <div className='orch-waarsch' data-orch-kritiek><TriangleAlert size={18} aria-hidden='true' /><span>{tr('Змінено критичні політики (kritiek): режими встановлення, захищені гілки, приватні ключі. Ваш підпис passkey підтверджує саме їх; після цього GitOps зможе встановлювати автоматично, якщо automatisch_beperkt дозволений.', 'Kritieke regels (kritiek) gewijzigd: installatiemodi, beschermde takken, privésleutels. Uw passkey-handtekening bevestigt precies die; daarna kan GitOps automatisch installeren als automatisch_beperkt is toegestaan.')}</span></div>}
        <div className='bsl-acties'>
          {gestart && fout
            ? <button type='button' className='bsl-knop bsl-knop-primair' disabled={!!bezig} onClick={() => void onderteken(voorstel, gestart)} data-besluit-knop='opnieuw'><Fingerprint size={16} aria-hidden='true' />{tr('Підтвердити passkey ще раз', 'Passkey opnieuw bevestigen')}</button>
            : <button type='button' className='bsl-knop bsl-knop-primair' disabled={!!bezig || !!blok} onClick={() => void start(voorstel)} data-besluit-knop='ondertekenen' title={tr('Підпис над відбитком саме цієї пропозиції. Root перевіряє підпис своїми ключами й записує підтвердження; далі сервер створює git-гілку.', 'Handtekening over de afdruk van precies dit voorstel. Root controleert de handtekening met zijn eigen sleutels en legt de bevestiging vast; daarna maakt de server een git-tak.')}>
              {bezig === 'passkey' ? <><Loader2 size={16} className='bsl-spin' aria-hidden='true' />{tr('Підтвердіть на телефоні або ключі…', 'Bevestig op uw telefoon of sleutel…')}</> : bezig === 'starten' ? <><Loader2 size={16} className='bsl-spin' aria-hidden='true' />{tr('Готую рішення…', 'Besluit voorbereiden…')}</> : <><Fingerprint size={16} aria-hidden='true' />{tr('Підписати passkey й створити гілку', 'Ondertekenen met passkey en tak maken')}</>}
            </button>}
          <button type='button' className='bsl-knop' disabled={!!bezig} onClick={() => { void orchVoorstelIntrekken(ctx, voorstel.id).catch(() => undefined); setVoorstel(null); }} data-besluit-knop='intrekken'>{tr('Відкликати пропозицію', 'Voorstel intrekken')}</button>
        </div>
      </div>}
    </div>}
    {leef.besluit && <>
      <BesluitStand tr={tr} stand={leef} />
      {bezig === 'toepassen' && <p className='bsl-stil'><Loader2 size={14} className='bsl-spin' aria-hidden='true' /> {tr('Root підтвердив; створюю гілку з новими правилами, перевіряю (orch controleer) і відправляю в origin…', 'Root heeft bevestigd; tak met de nieuwe regels maken, controleren (orch controleer) en naar origin sturen…')}</p>}
      {eind && !bezig && <div className='bsl-acties'><button type='button' className='bsl-knop bsl-knop-primair' onClick={() => { setLeef({ besluit: null }); setGestart(null); setFout(''); void laden(); }} data-besluit-knop='sluiten'>{leef.besluit.staat === 'klaar' ? tr('Готово', 'Klaar') : tr('Назад до правил', 'Terug naar de regels')}</button></div>}
    </>}
    {ov && <Groep titel={tr('Пропозиції правил', 'Regelvoorstellen')} aantal={ov.voorstellen.length} data='voorstellen'>
      {ov.voorstellen.map((v) => <li key={v.id} className='ag-rij'><div className='ag-rij-kop'><span className='ag-rij-tekst'><span className='ag-rij-titel'><b>{v.regelsVersie}</b> <Badge toon={v.staat === 'toegepast' ? 'ok' : v.staat === 'ontwerp' ? 'info' : 'off'}>{v.staat}</Badge>{v.kritiekGewijzigd && <Badge toon='warn'>kritiek</Badge>}</span><small className='ag-rij-status'>{v.id} · {v.door} · {v.aangemaakt.slice(0, 16).replace('T', ' ')}{v.toegepast ? ` → ${v.toegepast.tak} (${kort(v.toegepast.commit)})${v.toegepast.gepusht ? '' : ` · ${tr('не відправлено', 'niet gepusht')}`}` : ''}</small></span></div></li>)}
    </Groep>}
    {ov && <Groep titel={tr('Підтвердження root (passkey)', 'Bevestigingen van root (passkey)')} aantal={ov.bevestigingen.length} data='bevestigingen'>
      {ov.bevestigingen.map((b) => <li key={`${b.besluit}-${b.tijd}`} className='ag-rij'><div className='ag-rij-kop'><span className='ag-rij-tekst'><span className='ag-rij-titel'><b>{b.regelsVersie}</b> <code>{kort(b.hash)}…</code></span><small className='ag-rij-status'>passkey {b.passkey}{b.label ? ` (${b.label})` : ''} · {b.tijd} · {tr('пропозиція', 'voorstel')} {b.voorstel}</small></span></div></li>)}
    </Groep>}
    {acties.uitkomst ? null : null}
  </section>;
}
