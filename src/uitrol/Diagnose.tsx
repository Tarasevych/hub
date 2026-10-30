// «Діагностика»: waar stokt de keten site → goedkeur-inbox → systemd path → root-script? Drie lagen:
//  1. de momentopname van root (diagnose.json, elke minuut, alleen lezen) als overzicht: keten, units, vergrendeling, schijf;
//  2. een leesbaar journaal (kleur, pictogram, zoeken, filters, groepen per run, nieuwste bovenaan);
//  3. een catalogus van alleen-lezen controles die de eigenaar hier direct kan uitvoeren (POST /api/owner/uitrol/diagnose/uitvoeren,
//     vaste whitelist op de server) — met uitleg «?» en de gelijkwaardige SSH-opdracht.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  AlertTriangle, ArrowDownUp, ArrowRight, Check, CheckCircle2, ChevronDown, ChevronRight, CircleHelp, ClipboardCopy, Clock, Cpu, Database, Download, FileCode2, FolderOpen,
  Gauge, Globe, HardDrive, HeartPulse, Inbox, Info, KeyRound, Layers, ListChecks, Loader2, Lock, MemoryStick, Package, Play, Radio, RefreshCw, Rocket, ScrollText,
  Search, Server, ShieldCheck, Terminal, Workflow, X, XCircle,
} from 'lucide-react';
import { api } from '../platform/client';
import { foutCode } from '../platform/webauthn';
import { CHECKS, CHECK_GROEPEN, type CheckInfo, type CheckStatus, type CheckUitslag } from '../../shared/uitrol-diagnose-controles';
import { duurTekst, filterRegels, groepeer, leeftijdKort, markeer, parseJournaal, STATUS_VOLGORDE, uitvoerKlasse, type JGroep, type JRegel, type Niveau } from './diagnose-hulp';
import { bestandOpslaan, datumLang, mb, tr, type DiagnoseAntwoord, type Lang } from './types';
import './diagnose.css';

type Ctx = Record<string, unknown>;
type RootDiag = NonNullable<DiagnoseAntwoord['root']>;

// ------------------------------------------------------------------------------------------------ kleine bouwstenen
const PICTOGRAMMEN: Record<string, typeof Server> = {
  keten: Workflow, diensten: Layers, pakketten: Package, server: Server, journaal: ScrollText, inbox: Inbox, slot: Lock, script: FileCode2, momentopname: Radio, sleutel: KeyRound,
  site: Globe, hart: HeartPulse, release: Rocket, database: Database, pakket: Package, map: FolderOpen, stappen: ListChecks, schijf: HardDrive, geheugen: MemoryStick, belasting: Gauge,
};
const Pictogram = ({ naam }: { naam: string }) => { const I = PICTOGRAMMEN[naam] || Terminal; return <I aria-hidden='true' />; };

const STATUS_ICOON: Record<CheckStatus, typeof Check> = { ok: CheckCircle2, 'let-op': AlertTriangle, fout: XCircle, info: Info };
const STATUS_TEKST: Record<CheckStatus, [string, string]> = { ok: ['Справно', 'In orde'], 'let-op': ['Увага', 'Let op'], fout: ['Помилка', 'Fout'], info: ['Інформація', 'Informatie'] };
const BRON_TEKST: Record<CheckUitslag['bron'], [string, string]> = {
  live: ['наживо', 'live'], 'root-momentopname': ['знімок від root', 'momentopname van root'], database: ['з бази даних', 'uit de database'], app: ['перевірка сайту', 'controle door de site'],
};
const BRON_BELOFTE: Record<string, [string, string]> = {
  live: ['Виконується наживо на сервері', 'Wordt live op de server uitgevoerd'], 'live-of-root': ['Наживо; якщо немає прав — знімок від root', 'Live; zonder rechten uit de momentopname van root'],
  root: ['Бере дані зі знімка від root', 'Leest de momentopname van root'], database: ['Читає базу даних сайту', 'Leest de database van de site'], app: ['Перевірка робиться самим сайтом', 'De site voert de controle zelf uit'],
};

function Kopieerknop({ lang, tekst, label, klein }: { lang: Lang; tekst: string; label?: string; klein?: boolean }) {
  const [ok, setOk] = useState(false);
  return <button type='button' className={`ut-knop${klein ? ' ud-klein' : ''}`} onClick={() => {
    void navigator.clipboard?.writeText(tekst).then(() => { setOk(true); window.setTimeout(() => setOk(false), 1500); }).catch(() => undefined);
  }}>{ok ? <Check aria-hidden='true' /> : <ClipboardCopy aria-hidden='true' />}{ok ? tr(lang, 'Скопійовано', 'Gekopieerd') : label || tr(lang, 'Копіювати', 'Kopiëren')}</button>;
}

function Kop({ icoon: I, titel, sub, rechts, id }: { icoon: typeof Server; titel: string; sub?: string; rechts?: ReactNode; id?: string }) {
  return <div className='ud-kop'>
    <div><h3 id={id}><I aria-hidden='true' />{titel}</h3>{sub && <p className='ut-sub'>{sub}</p>}</div>
    {rechts && <div className='ud-kop-rechts'>{rechts}</div>}
  </div>;
}

// ------------------------------------------------------------------------------------------------ keten (visueel overzicht)
type Schakel = { id: string; icoon: typeof Server; uk: string; nl: string; sub: string; staat: 'ok' | 'let-op' | 'fout' | 'onbekend' };
function ketenVan(lang: Lang, d: DiagnoseAntwoord, root: RootDiag): Schakel[] {
  const e = root.eenheden;
  const path = e['mijn-ruimte-goedkeuring.path'];
  const svc = e['mijn-ruimte-goedkeuring.service'];
  const inboxN = root.inbox.bestanden.length;
  const wacht = d.app.wachtOpRoot.filter((w) => w.seconden > 60).length;
  const svcFout = !!svc && svc.resultaat !== '' && svc.resultaat !== 'success' && svc.actief !== 'activating';
  const pad = (x: typeof path | undefined): Schakel['staat'] => (!x ? 'onbekend' : x.geladen !== 'loaded' ? 'fout' : x.actief === 'active' ? 'ok' : 'fout');
  return [
    { id: 'site', icoon: Globe, uk: 'Сайт', nl: 'Site', sub: d.app.statusMapLeesbaar ? tr(lang, 'бачить теку статусу', 'ziet de statusmap') : tr(lang, 'не бачить теку статусу', 'ziet de statusmap niet'), staat: d.app.statusMapLeesbaar ? 'ok' : 'fout' },
    { id: 'inbox', icoon: Inbox, uk: 'Черга пакетів', nl: 'Pakketwachtrij', sub: inboxN ? tr(lang, `файлів: ${inboxN}`, `bestanden: ${inboxN}`) : tr(lang, 'порожньо', 'leeg'), staat: wacht > 0 || (inboxN > 0 && svc && svc.actief !== 'activating' && svc.actief !== 'active') ? 'let-op' : 'ok' },
    { id: 'path', icoon: Radio, uk: 'Спостерігач', nl: 'Bewaker', sub: path ? (path.geladen !== 'loaded' ? tr(lang, 'не встановлено', 'niet geïnstalleerd') : `${path.actief}/${path.sub}`) : '—', staat: pad(path) },
    { id: 'svc', icoon: ShieldCheck, uk: 'Служба схвалень', nl: 'Goedkeur-dienst', sub: svc ? (svc.geladen !== 'loaded' ? tr(lang, 'не встановлено', 'niet geïnstalleerd') : svcFout ? `${svc.resultaat}${svc.exit ? ` (${svc.exit})` : ''}` : `${svc.actief}/${svc.sub}`) : '—', staat: !svc ? 'onbekend' : svc.geladen !== 'loaded' ? 'fout' : svcFout ? 'fout' : 'ok' },
    { id: 'script', icoon: FileCode2, uk: 'Root-скрипт', nl: 'Root-script', sub: root.script.bestaat ? (root.script.uitvoerbaar ? tr(lang, 'виконуваний', 'uitvoerbaar') : tr(lang, 'не виконуваний', 'niet uitvoerbaar')) : tr(lang, 'відсутній', 'ontbreekt'), staat: root.script.bestaat && root.script.uitvoerbaar ? 'ok' : 'fout' },
  ];
}
function Keten({ lang, schakels }: { lang: Lang; schakels: Schakel[] }) {
  return <ol className='ud-keten' aria-label={tr(lang, 'Ланцюг встановлення', 'Installatieketen')} data-ud-keten>
    {schakels.map((s, i) => <li key={s.id} data-staat={s.staat}>
      <span className='ud-schakel'><span className='ud-schakel-ico'><s.icoon aria-hidden='true' /></span>
        <b>{tr(lang, s.uk, s.nl)}</b><small>{s.sub}</small>
        <i className='ud-punt' aria-label={s.staat === 'ok' ? tr(lang, 'справно', 'in orde') : s.staat === 'fout' ? tr(lang, 'помилка', 'fout') : s.staat === 'let-op' ? tr(lang, 'увага', 'let op') : tr(lang, 'невідомо', 'onbekend')} /></span>
      {i < schakels.length - 1 && <ArrowRight aria-hidden='true' className='ud-pijl' />}
    </li>)}
  </ol>;
}

// ------------------------------------------------------------------------------------------------ systemd-units
const EENHEID_NAAM: Record<string, [string, string, typeof Server]> = {
  'mijn-ruimte-goedkeuring.path': ['Спостерігач черги пакетів', 'Bewaker van de pakketwachtrij', Radio],
  'mijn-ruimte-goedkeuring.service': ['Обробник схвалень (root)', 'Verwerker van goedkeuringen (root)', ShieldCheck],
  'mijn-ruimte-goedkeuring-wacht.timer': ['Сторожовий таймер', 'Waakhond-timer', Clock],
  'mijn-ruimte-uitrol.path': ['Спостерігач підписаних пакетів', 'Bewaker van ondertekende pakketten', Radio],
  'mijn-ruimte-uitrol.service': ['Обробник підписаних пакетів', 'Verwerker van ondertekende pakketten', Cpu],
  'mijn-ruimte.service': ['Сам сайт', 'De site zelf', Globe],
};
const ACTIEF_TEKST: Record<string, [string, string]> = {
  active: ['працює', 'actief'], inactive: ['спить', 'inactief'], failed: ['збій', 'mislukt'], activating: ['запускається', 'start op'], deactivating: ['зупиняється', 'stopt'],
};

// ------------------------------------------------------------------------------------------------ journaal-kijker
const NIVEAUS: Array<{ id: Niveau; uk: string; nl: string; emoji: string }> = [
  { id: 'fout', uk: 'Помилки', nl: 'Fouten', emoji: '❌' }, { id: 'let-op', uk: 'Попередження', nl: 'Waarschuwingen', emoji: '⚠️' },
  { id: 'ok', uk: 'Успіх', nl: 'Gelukt', emoji: '✅' }, { id: 'info', uk: 'Інформація', nl: 'Informatie', emoji: 'ℹ️' },
];
function Gemarkeerd({ tekst, zoek }: { tekst: string; zoek: string }) {
  return <>{markeer(tekst, zoek).map(([t, hit], i) => (hit ? <mark key={i}>{t}</mark> : <span key={i}>{t}</span>))}</>;
}

type JournaalBron = { regels: string[]; bron: 'root-momentopname' | 'live'; leeftijdSec?: number };
function JournaalKijker({ lang, ctx, root }: { lang: Lang; ctx: Ctx; root: RootDiag }) {
  const uk = lang === 'uk';
  const [live, setLive] = useState<JournaalBron | null>(null);
  const [laden, setLaden] = useState(false);
  const [melding, setMelding] = useState('');
  const [zoek, setZoek] = useState('');
  const [actief, setActief] = useState<Set<Niveau>>(new Set());
  const [nieuwsteEerst, setNieuwsteEerst] = useState(true);
  const [dicht, setDicht] = useState<Set<string>>(new Set());
  const bron: JournaalBron = live ?? { regels: root.journaal, bron: 'root-momentopname', leeftijdSec: root.tijd ? Math.max(0, Math.round((Date.now() - Date.parse(root.tijd)) / 1000)) : undefined };
  const alle = useMemo(() => parseJournaal(bron.regels), [bron.regels]);
  const tellers = useMemo(() => { const t: Record<Niveau, number> = { fout: 0, 'let-op': 0, ok: 0, info: 0 }; alle.forEach((r) => { t[r.niveau]++; }); return t; }, [alle]);
  const groepen = useMemo(() => {
    const gefilterd = new Set(filterRegels(alle, zoek, actief).map((r) => r.nr));
    const g = groepeer(alle).map((x) => ({ ...x, regels: x.regels.filter((r) => gefilterd.has(r.nr)) })).filter((x) => x.regels.length);
    const volgorde: JGroep[] = nieuwsteEerst ? [...g].reverse() : g;
    return volgorde.map((x) => ({ ...x, regels: nieuwsteEerst ? [...x.regels].reverse() : x.regels }));
  }, [alle, zoek, actief, nieuwsteEerst]);
  const zichtbaar = groepen.reduce((n, g) => n + g.regels.length, 0);

  const haalLive = async () => {
    setLaden(true); setMelding('');
    try {
      const u = (await api.post('/api/owner/uitrol/diagnose/uitvoeren', { ...ctx, id: 'goedkeur-journaal' })).data as CheckUitslag;
      if (u.bron === 'live') {
        setLive({ regels: u.uitvoer.split('\n').filter(Boolean), bron: 'live' });
        setMelding(tr(lang, 'Свіжі рядки з journalctl отримано наживо.', 'Verse journalctl-regels live opgehaald.'));
      } else {
        setLive(null);
        setMelding(tr(lang, 'Сайт не має прав читати journalctl — показано знімок від root.', 'De site mag journalctl niet lezen — de momentopname van root wordt getoond.'));
      }
    } catch { setMelding(tr(lang, 'Не вдалося отримати журнал.', 'Het journaal kon niet worden opgehaald.')); }
    finally { setLaden(false); }
  };
  const tekstVoorKopie = () => groepen.flatMap((g) => g.regels.map((r) => r.ruw)).join('\n');
  const toggle = (id: string) => setDicht((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const wissel = (n: Niveau) => setActief((s) => { const x = new Set(s); if (x.has(n)) x.delete(n); else x.add(n); return x; });

  return <section className='ud-blok' aria-labelledby='ud-journaal-titel' data-ud-journaal>
    <Kop id='ud-journaal-titel' icoon={ScrollText} titel={tr(lang, 'Журнал служби схвалень', 'Journaal van de goedkeur-dienst')}
      sub={tr(lang, 'Що писала служба, яка приймає ваші схвалення: помилки червоним, успіх зеленим, кожен запуск окремим блоком.', 'Wat de dienst schreef die uw goedkeuringen verwerkt: fouten rood, succes groen, elke run in een eigen blok.')}
      rechts={<>
        <span className='ud-bron' data-bron={bron.bron}>{bron.bron === 'live' ? <><Radio aria-hidden='true' />{tr(lang, 'наживо', 'live')}</> : <><Clock aria-hidden='true' />{tr(lang, 'знімок від root', 'momentopname van root')}{bron.leeftijdSec != null ? ` · ${leeftijdKort(bron.leeftijdSec, uk)}` : ''}</>}</span>
        <button type='button' className='ut-knop' disabled={laden} onClick={() => void haalLive()}><RefreshCw aria-hidden='true' className={laden ? 'ut-draai' : ''} />{tr(lang, 'Отримати наживо', 'Live ophalen')}</button>
      </>} />
    {melding && <p className='ut-hint' role='status'>{melding}</p>}
    <div className='ud-gereedschap'>
      <label className='ud-zoek'><Search aria-hidden='true' /><span className='ud-sr'>{tr(lang, 'Пошук у журналі', 'Zoeken in het journaal')}</span>
        <input type='search' value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder={tr(lang, 'Пошук у журналі…', 'Zoeken in het journaal…')} data-ud-zoek />
        {zoek && <button type='button' className='ud-wis' aria-label={tr(lang, 'Очистити пошук', 'Zoekopdracht wissen')} onClick={() => setZoek('')}><X aria-hidden='true' /></button>}</label>
      <div className='ud-chips' role='group' aria-label={tr(lang, 'Фільтр за рівнем', 'Filter op niveau')}>
        {NIVEAUS.map((n) => <button key={n.id} type='button' className='ud-chip' data-niveau={n.id} aria-pressed={actief.has(n.id)} onClick={() => wissel(n.id)}>
          <span aria-hidden='true'>{n.emoji}</span>{uk ? n.uk : n.nl}<b>{tellers[n.id]}</b></button>)}
      </div>
      <div className='ud-acties'>
        <button type='button' className='ut-knop' aria-pressed={nieuwsteEerst} onClick={() => setNieuwsteEerst((v) => !v)} title={tr(lang, 'Змінити порядок', 'Volgorde omdraaien')}>
          <ArrowDownUp aria-hidden='true' />{nieuwsteEerst ? tr(lang, 'Спочатку нові', 'Nieuwste eerst') : tr(lang, 'Спочатку старі', 'Oudste eerst')}</button>
        <Kopieerknop lang={lang} tekst={tekstVoorKopie()} klein />
        <button type='button' className='ut-knop ud-klein' onClick={() => bestandOpslaan('goedkeur-journaal.log', tekstVoorKopie())}><Download aria-hidden='true' />{tr(lang, 'Завантажити', 'Downloaden')}</button>
      </div>
    </div>
    {alle.length === 0 && <p className='ut-leeg'>{tr(lang, '— журнал порожній —', '— het journaal is leeg —')}</p>}
    {alle.length > 0 && zichtbaar === 0 && <p className='ut-leeg'>{tr(lang, 'Нічого не знайдено за цим фільтром.', 'Niets gevonden met dit filter.')}</p>}
    <div className='ud-journaal' tabIndex={0} role='log' aria-label={tr(lang, 'Журнал', 'Journaal')}>
      {groepen.map((g, gi) => {
        const open = !dicht.has(g.id);
        const eerste = nieuwsteEerst ? gi === 0 : gi === groepen.length - 1;
        return <div key={g.id} className='ud-groep' data-fout={g.fouten > 0} data-nieuwste={eerste}>
          <button type='button' className='ud-groep-kop' aria-expanded={open} onClick={() => toggle(g.id)}>
            {open ? <ChevronDown aria-hidden='true' /> : <ChevronRight aria-hidden='true' />}
            <b>{g.run ? tr(lang, `Запуск ${g.run}`, `Run ${g.run}`) : tr(lang, `Запуск о ${g.tijd || '—'}`, `Run om ${g.tijd || '—'}`)}</b>
            {eerste && <i className='ud-nieuw'>{tr(lang, 'найновіший', 'nieuwste')}</i>}
            <span className='ud-groep-tel'>{g.regels.length} {tr(lang, 'рядків', 'regels')}{g.fouten > 0 && <em data-n='fout'>❌ {g.fouten}</em>}{g.waarschuwingen > 0 && <em data-n='let-op'>⚠️ {g.waarschuwingen}</em>}</span>
          </button>
          {open && <ol className='ud-regels'>{g.regels.map((r) => <JournaalRegel key={r.nr} r={r} zoek={zoek} />)}</ol>}
        </div>;
      })}
    </div>
  </section>;
}
function JournaalRegel({ r, zoek }: { r: JRegel; zoek: string }) {
  return <li className='ud-regel' data-niveau={r.niveau}>
    <span className='ud-mark' aria-hidden='true'>{r.markering}</span>
    <time className='ud-tijd' dateTime={r.tijd}>{r.kort || '—'}</time>
    {r.eenheid && <span className='ud-eenheid' title={r.pid ? `pid ${r.pid}` : undefined}>{r.eenheid}</span>}
    <span className='ud-tekst'><Gemarkeerd tekst={r.tekst} zoek={zoek} /></span>
  </li>;
}

// ------------------------------------------------------------------------------------------------ catalogus van controles
type Resultaat = { u?: CheckUitslag; bezig?: boolean; fout?: string };
type Sortering = 'groep' | 'naam' | 'stand' | 'recent';

function UitvoerBlok({ tekst }: { tekst: string }) {
  const regels = tekst.split('\n');
  return <pre className='ud-uitvoer' tabIndex={0}>{regels.map((r, i) => <span key={i} className='ud-uitregel' data-k={uitvoerKlasse(r)}>{r || ' '}{'\n'}</span>)}</pre>;
}

function Hulp({ lang, c }: { lang: Lang; c: CheckInfo }) {
  return <div className='ud-hulp' role='region' aria-label={tr(lang, `Довідка: ${c.titel[0]}`, `Uitleg: ${c.titel[1]}`)}>
    <dl>
      <dt>🎯 {tr(lang, 'Навіщо', 'Waarvoor')}</dt><dd>{tr(lang, c.doel[0], c.doel[1])}</dd>
      <dt>✅ {tr(lang, 'Як виглядає справний результат', 'Zo ziet een gezond resultaat eruit')}</dt><dd>{tr(lang, c.gezond[0], c.gezond[1])}</dd>
      <dt>⚠️ {tr(lang, 'Типові відхилення', 'Veelvoorkomende afwijkingen')}</dt>
      <dd><ul>{c.fouten.map((f, i) => <li key={i}><b>{tr(lang, f.teken[0], f.teken[1])}</b> — {tr(lang, f.betekenis[0], f.betekenis[1])}</li>)}</ul></dd>
      <dt>🛰️ {tr(lang, 'Звідки дані', 'Waar komt het vandaan')}</dt><dd>{tr(lang, BRON_BELOFTE[c.bron][0], BRON_BELOFTE[c.bron][1])}</dd>
    </dl>
    {c.ssh ? <div className='ud-ssh'><span>{tr(lang, 'Те саме через SSH (лише читання):', 'Hetzelfde via SSH (alleen lezen):')}</span><code>{c.ssh}</code><Kopieerknop lang={lang} tekst={c.ssh} klein /></div>
      : <p className='ut-hint'>{tr(lang, 'Цю перевірку можна виконати лише тут: вона читає базу даних сайту.', 'Deze controle kan alleen hier: ze leest de database van de site.')}</p>}
  </div>;
}

function Controles({ lang, ctx }: { lang: Lang; ctx: Ctx }) {
  const uk = lang === 'uk';
  const [res, setRes] = useState<Record<string, Resultaat>>({});
  const [zoek, setZoek] = useState('');
  const [groep, setGroep] = useState<string>('alle');
  const [sort, setSort] = useState<Sortering>('groep');
  const [hulp, setHulp] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [alleBezig, setAlleBezig] = useState<{ i: number; n: number } | null>(null);
  const stop = useRef(false);

  const naam = useCallback((c: CheckInfo) => (uk ? c.titel[0] : c.titel[1]), [uk]);
  const uitvoeren = useCallback(async (c: CheckInfo) => {
    setRes((r) => ({ ...r, [c.id]: { ...r[c.id], bezig: true, fout: '' } }));
    setOpen((o) => new Set(o).add(c.id));
    for (let poging = 0; poging < 6; poging++) {
      try {
        const u = (await api.post('/api/owner/uitrol/diagnose/uitvoeren', { ...ctx, id: c.id })).data as CheckUitslag;
        setRes((r) => ({ ...r, [c.id]: { u } }));
        return;
      } catch (e) {
        const code = foutCode(e);
        if (/DIAGNOSE_BEZIG/.test(code) && poging < 5) { await new Promise((r) => window.setTimeout(r, 500)); continue; }
        const tekst = /RATE_LIMITED/.test(code) ? tr(lang, 'Забагато запусків за короткий час — зачекайте хвилину.', 'Te veel uitvoeringen kort na elkaar — wacht een minuut.')
          : /DIAGNOSE_BEZIG/.test(code) ? tr(lang, 'Зараз виконується інша перевірка. Спробуйте ще раз.', 'Er loopt al een andere controle. Probeer het opnieuw.')
          : /OWNER_REQUIRED|ADMIN_SERVICE/.test(code) ? tr(lang, 'Лише власник на admin.tarasevych.com може запускати перевірки.', 'Alleen de eigenaar op admin.tarasevych.com mag controles uitvoeren.')
          : tr(lang, 'Не вдалося виконати перевірку. Дані не змінено.', 'De controle kon niet worden uitgevoerd. Er is niets gewijzigd.');
        setRes((r) => ({ ...r, [c.id]: { fout: tekst } }));
        return;
      }
    }
  }, [ctx, lang]);

  const lijst = useMemo(() => {
    const q = zoek.trim().toLowerCase();
    let l = CHECKS.filter((c) => (groep === 'alle' || c.groep === groep)
      && (!q || [c.titel[0], c.titel[1], c.kort[0], c.kort[1], c.doel[0], c.doel[1], c.id, c.ssh ?? ''].some((t) => t.toLowerCase().includes(q))));
    if (sort === 'naam') l = [...l].sort((a, b) => naam(a).localeCompare(naam(b), uk ? 'uk' : 'nl'));
    if (sort === 'stand') l = [...l].sort((a, b) => (STATUS_VOLGORDE[res[a.id]?.u?.status ?? 'nieuw'] ?? 2) - (STATUS_VOLGORDE[res[b.id]?.u?.status ?? 'nieuw'] ?? 2));
    if (sort === 'recent') l = [...l].sort((a, b) => Date.parse(res[b.id]?.u?.tijd ?? '') - Date.parse(res[a.id]?.u?.tijd ?? '') || 0);
    return l;
  }, [zoek, groep, sort, res, naam, uk]);

  const alleUitvoeren = async () => {
    stop.current = false;
    const doel = lijst;
    for (let i = 0; i < doel.length; i++) {
      if (stop.current) break;
      setAlleBezig({ i: i + 1, n: doel.length });
      await uitvoeren(doel[i]);
    }
    setAlleBezig(null);
  };
  const uitgevoerd = Object.values(res).filter((r) => r.u);
  const telling = (s: CheckStatus) => uitgevoerd.filter((r) => r.u!.status === s).length;
  const samenvatting = (u: CheckUitslag) => uk ? u.samenvatting[0] : u.samenvatting[1];
  const groepen = groep === 'alle' && sort === 'groep' ? CHECK_GROEPEN : [{ id: '*', pictogram: 'keten', naam: ['', ''] as const, uitleg: ['', ''] as const }];

  return <section className='ud-blok' aria-labelledby='ud-controles-titel' data-ud-controles>
    <Kop id='ud-controles-titel' icoon={ListChecks} titel={tr(lang, 'Перевірки (лише читання)', 'Controles (alleen lezen)')}
      sub={tr(lang, 'Те, що раніше доводилось копіювати в SSH, тепер запускається тут і результат видно одразу. Жодна перевірка нічого не змінює.', 'Wat u vroeger naar SSH moest kopiëren, voert u nu hier uit met het resultaat direct in beeld. Geen enkele controle wijzigt iets.')}
      rechts={<>
        {alleBezig ? <button type='button' className='ut-knop' onClick={() => { stop.current = true; }}><X aria-hidden='true' />{tr(lang, `Зупинити (${alleBezig.i}/${alleBezig.n})`, `Stoppen (${alleBezig.i}/${alleBezig.n})`)}</button>
          : <button type='button' className='ut-knop ut-knop-primair' onClick={() => void alleUitvoeren()} data-ud-alle><Play aria-hidden='true' />{tr(lang, `Запустити всі (${lijst.length})`, `Alles uitvoeren (${lijst.length})`)}</button>}
      </>} />
    {uitgevoerd.length > 0 && <p className='ud-totaal' role='status'>
      <span data-s='ok'>✅ {telling('ok')}</span><span data-s='info'>ℹ️ {telling('info')}</span><span data-s='let-op'>⚠️ {telling('let-op')}</span><span data-s='fout'>❌ {telling('fout')}</span>
      <small>{tr(lang, `виконано ${uitgevoerd.length} з ${CHECKS.length}`, `${uitgevoerd.length} van ${CHECKS.length} uitgevoerd`)}</small></p>}
    <div className='ud-gereedschap'>
      <label className='ud-zoek'><Search aria-hidden='true' /><span className='ud-sr'>{tr(lang, 'Пошук перевірок', 'Controles zoeken')}</span>
        <input type='search' value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder={tr(lang, 'Пошук: диск, журнал, passkey…', 'Zoeken: schijf, journaal, passkey…')} data-ud-zoek-controles />
        {zoek && <button type='button' className='ud-wis' aria-label={tr(lang, 'Очистити пошук', 'Zoekopdracht wissen')} onClick={() => setZoek('')}><X aria-hidden='true' /></button>}</label>
      <div className='ud-chips' role='group' aria-label={tr(lang, 'Категорії', 'Categorieën')}>
        <button type='button' className='ud-chip' aria-pressed={groep === 'alle'} onClick={() => setGroep('alle')}>{tr(lang, 'Усі', 'Alles')}<b>{CHECKS.length}</b></button>
        {CHECK_GROEPEN.map((g) => <button key={g.id} type='button' className='ud-chip' aria-pressed={groep === g.id} onClick={() => setGroep(g.id)}>
          <Pictogram naam={g.pictogram} />{tr(lang, g.naam[0], g.naam[1])}<b>{CHECKS.filter((c) => c.groep === g.id).length}</b></button>)}
      </div>
      <label className='ud-sorteer'><ArrowDownUp aria-hidden='true' /><span className='ud-sr'>{tr(lang, 'Сортування', 'Sorteren')}</span>
        <select data-hulp-vrij='sortering' value={sort} onChange={(e) => setSort(e.target.value as Sortering)} aria-label={tr(lang, 'Сортування', 'Sorteren')}>
          <option value='groep'>{tr(lang, 'За категорією', 'Op categorie')}</option><option value='naam'>{tr(lang, 'За назвою', 'Op naam')}</option>
          <option value='stand'>{tr(lang, 'Спочатку проблемні', 'Problemen eerst')}</option><option value='recent'>{tr(lang, 'Нещодавно запущені', 'Recent uitgevoerd')}</option>
        </select></label>
    </div>
    {lijst.length === 0 && <p className='ut-leeg'>{tr(lang, 'Нічого не знайдено — змініть пошук або категорію.', 'Niets gevonden — pas de zoekopdracht of categorie aan.')}</p>}
    {groepen.map((g) => {
      const items = g.id === '*' ? lijst : lijst.filter((c) => c.groep === g.id);
      if (!items.length) return null;
      return <div key={g.id} className='ud-categorie'>
        {g.id !== '*' && <h4><Pictogram naam={g.pictogram} />{tr(lang, g.naam[0], g.naam[1])}<small>{tr(lang, g.uitleg[0], g.uitleg[1])}</small></h4>}
        <ul className='ud-kaarten'>
          {items.map((c) => {
            const r = res[c.id] || {};
            const st = r.u?.status;
            const SIcon = st ? STATUS_ICOON[st] : null;
            const hulpOpen = hulp === c.id;
            const uitslagOpen = open.has(c.id) && (r.u || r.fout || r.bezig);
            return <li key={c.id} className='ud-kaart' data-check={c.id} data-status={st ?? 'nieuw'} data-open={!!uitslagOpen}>
              <div className='ud-kaart-kop'>
                <span className='ud-kaart-ico'><Pictogram naam={c.pictogram} /></span>
                <span className='ud-kaart-tekst'><b>{tr(lang, c.titel[0], c.titel[1])}</b><small>{tr(lang, c.kort[0], c.kort[1])}</small></span>
                {st && SIcon && <span className='ud-stand' data-s={st}><SIcon aria-hidden='true' />{tr(lang, STATUS_TEKST[st][0], STATUS_TEKST[st][1])}</span>}
              </div>
              <div className='ud-kaart-acties'>
                <button type='button' className='ut-knop ut-knop-primair ud-klein' disabled={!!r.bezig || !!alleBezig} onClick={() => void uitvoeren(c)} data-ud-start={c.id}>
                  {r.bezig ? <Loader2 aria-hidden='true' className='ut-draai' /> : <Play aria-hidden='true' />}{r.bezig ? tr(lang, 'Виконується…', 'Bezig…') : r.u ? tr(lang, 'Ще раз', 'Opnieuw') : tr(lang, 'Запустити', 'Uitvoeren')}</button>
                <button type='button' className='ut-knop ud-klein ud-vraag' aria-expanded={hulpOpen} aria-label={tr(lang, `Довідка: ${c.titel[0]}`, `Uitleg: ${c.titel[1]}`)} title={tr(lang, 'Що це і що означає результат', 'Wat dit is en wat het resultaat betekent')}
                  onClick={() => setHulp(hulpOpen ? null : c.id)} onKeyDown={(e) => { if (e.key === 'Escape') setHulp(null); }}><CircleHelp aria-hidden='true' /></button>
                {c.ssh && <Kopieerknop lang={lang} tekst={c.ssh} label={tr(lang, 'SSH', 'SSH')} klein />}
                <span className='ud-bronchip' data-bron={c.bron}>{tr(lang, BRON_BELOFTE[c.bron][0], BRON_BELOFTE[c.bron][1])}</span>
              </div>
              {hulpOpen && <Hulp lang={lang} c={c} />}
              {uitslagOpen && <div className='ud-uitslag' role='status' aria-live='polite'>
                {r.bezig && !r.u && <p className='ut-hint'><Loader2 aria-hidden='true' className='ut-draai' /> {tr(lang, 'Виконується…', 'Bezig…')}</p>}
                {r.fout && <p className='ut-fout' role='alert'>{r.fout}</p>}
                {r.u && <>
                  <p className='ud-uitslag-kop'><b>{samenvatting(r.u)}</b>
                    <span className='ud-bron' data-bron={r.u.bron}>{r.u.bron === 'root-momentopname' ? <Clock aria-hidden='true' /> : <Radio aria-hidden='true' />}
                      {tr(lang, BRON_TEKST[r.u.bron][0], BRON_TEKST[r.u.bron][1])}{r.u.leeftijdSec != null ? ` · ${tr(lang, 'вік', 'leeftijd')} ${leeftijdKort(r.u.leeftijdSec, uk)}` : ''}</span>
                    <small>{duurTekst(r.u.duurMs, lang === 'uk')} · {datumLang(lang, r.u.tijd)}</small></p>
                  {r.u.bron === 'root-momentopname' && <p className='ud-let-op'><AlertTriangle aria-hidden='true' />{tr(lang, 'Це не пряма перевірка: сайт не має прав root і показує те, що root записав сам. Дані можуть бути старшими на вказаний вік.', 'Dit is geen directe controle: de site heeft geen rootrechten en toont wat root zelf opschreef. De gegevens kunnen zo oud zijn als aangegeven.')}</p>}
                  <UitvoerBlok tekst={r.u.uitvoer} />
                  {r.u.afgekapt && <p className='ut-hint'>{tr(lang, 'Вивід скорочено (довгі рядки або забагато даних).', 'Uitvoer ingekort (lange regels of te veel gegevens).')}</p>}
                  <div className='ud-kaart-acties'>
                    <Kopieerknop lang={lang} tekst={r.u.uitvoer} label={tr(lang, 'Копіювати результат', 'Resultaat kopiëren')} klein />
                    <button type='button' className='ut-knop ud-klein' onClick={() => setOpen((o) => { const n = new Set(o); n.delete(c.id); return n; })}><ChevronDown aria-hidden='true' />{tr(lang, 'Згорнути', 'Inklappen')}</button>
                  </div>
                </>}
              </div>}
              {!uitslagOpen && r.u && <button type='button' className='ud-toon' onClick={() => setOpen((o) => new Set(o).add(c.id))}><ChevronRight aria-hidden='true' />{samenvatting(r.u)}</button>}
            </li>;
          })}
        </ul>
      </div>;
    })}
  </section>;
}

// ------------------------------------------------------------------------------------------------ hoofdscherm
export default function Diagnose({ lang, context }: { lang: Lang; context: Ctx }) {
  const [d, setD] = useState<DiagnoseAntwoord | null>(null);
  const [fout, setFout] = useState('');
  const [bezig, setBezig] = useState(false);
  const laden = useCallback(async () => {
    setBezig(true);
    try { setD((await api.post('/api/owner/uitrol/diagnose', context)).data as DiagnoseAntwoord); setFout(''); }
    catch { setFout(tr(lang, 'Не вдалося завантажити діагностику.', 'De diagnose kon niet worden geladen.')); }
    finally { setBezig(false); }
  }, [context, lang]);
  useEffect(() => { void laden(); const t = window.setInterval(() => { if (!document.hidden) void laden(); }, 10000); return () => window.clearInterval(t); }, [laden]);

  if (!d) return <section className='ut-kaart ud-root'><p className='ut-leeg' role='status'>{fout || tr(lang, 'Завантаження…', 'Laden…')}</p></section>;
  const root = d.root;
  const oud = !!root && root.leeftijdSec > 180;
  const problemen = root?.problemen ?? [];
  const wachten = d.app.wachtOpRoot.filter((w) => w.seconden > 60);

  return <section className='ut-kaart ud-root' data-ut-diagnose aria-labelledby='ut-diag-titel'>
    <header className='ut-kaart-kop'>
      <div><h2 id='ut-diag-titel'><Workflow aria-hidden='true' /> {tr(lang, 'Діагностика ланцюга встановлення', 'Diagnose van de installatieketen')}</h2>
        <p className='ut-sub'>{tr(lang, 'Сайт → черга пакетів → спостерігач → служба схвалень → root-скрипт. Тут видно, на якій ланці зупинилось, без пошуків через SSH.', 'Site → pakketwachtrij → bewaker → goedkeur-dienst → root-script. Hier ziet u op welke schakel het stokt, zonder via SSH te zoeken.')}</p></div>
      <button type='button' className='ut-knop' onClick={() => void laden()} disabled={bezig} title={tr(lang, 'Перечитати знімок від root', 'Momentopname van root opnieuw lezen')}><RefreshCw aria-hidden='true' className={bezig ? 'ut-draai' : ''} />{tr(lang, 'Перечитати дані', 'Gegevens herlezen')}</button>
    </header>
    {fout && <p className='ut-fout' role='alert'>{fout}</p>}

    {!root && <div className='ut-waarschuwing' role='alert'><AlertTriangle aria-hidden='true' /><div>
      <b>{tr(lang, 'Файл діагностики від root відсутній.', 'Het diagnosebestand van root ontbreekt.')}</b>
      <p>{tr(lang, 'Це означає, що на сервері ще не встановлено цей випуск (таймер mijn-ruimte-diagnose не працює). Встановіть його один раз через SSH — далі діагностика оновлюється щохвилини.', 'Dit betekent dat deze release nog niet op de server staat (de timer mijn-ruimte-diagnose draait niet). Installeer hem één keer via SSH — daarna wordt de diagnose elke minuut ververst.')}</p></div></div>}
    {root && oud && <div className='ut-waarschuwing' role='alert'><AlertTriangle aria-hidden='true' /><div><b>{tr(lang, `Дані від root застарі (${duurTekst(root.leeftijdSec * 1000, lang === 'uk')}).`, `De gegevens van root zijn verouderd (${duurTekst(root.leeftijdSec * 1000, lang === 'uk')}).`)}</b>
      <p>{tr(lang, 'Таймер mijn-ruimte-diagnose, схоже, не працює: sudo systemctl enable --now mijn-ruimte-diagnose.timer', 'De timer mijn-ruimte-diagnose lijkt niet te draaien: sudo systemctl enable --now mijn-ruimte-diagnose.timer')}</p></div></div>}
    {wachten.length > 0 && <div className='ut-waarschuwing' role='alert'><AlertTriangle aria-hidden='true' /><div>
      <b>{tr(lang, 'Схвалені пакети без жодної відповіді сервера:', 'Goedgekeurde pakketten zonder enig antwoord van de server:')}</b>
      <p>{wachten.map((w) => `${w.versie} (${duurTekst(w.seconden * 1000, lang === 'uk')})`).join(', ')}</p></div></div>}

    {root && <>
      <div className='ut-uitkomst' data-staat={problemen.length ? 'mislukt' : 'klaar'}>
        {problemen.length ? <AlertTriangle aria-hidden='true' /> : <CheckCircle2 aria-hidden='true' />}
        <div><b>{problemen.length ? tr(lang, `Знайдено проблем: ${problemen.length}`, `Gevonden problemen: ${problemen.length}`) : tr(lang, 'Ланцюг виглядає справним', 'De keten ziet er gezond uit')}</b>
          <p>{tr(lang, 'Знімок від root зроблено', 'Momentopname van root genomen')} {datumLang(lang, root.tijd)}</p></div>
      </div>
      {problemen.length > 0 && <ul className='ut-problemen'>{problemen.map((p) => <li key={p.code}><AlertTriangle aria-hidden='true' /><span><b className='ud-code'>{p.code}</b> {lang === 'uk' ? p.uk : p.nl}</span></li>)}</ul>}

      <Keten lang={lang} schakels={ketenVan(lang, d, root)} />

      <section className='ud-blok' aria-labelledby='ud-diensten-titel'>
        <Kop id='ud-diensten-titel' icoon={Layers} titel={tr(lang, 'Служби', 'Diensten')} sub={tr(lang, 'Стан юнітів systemd за знімком від root.', 'Stand van de systemd-units volgens de momentopname van root.')} />
        <div className='ut-tabel ut-eenheden'>
          {Object.entries(root.eenheden).map(([naam, e]) => {
            const goed = e.geladen === 'loaded' && (naam.endsWith('.service') ? e.resultaat === '' || e.resultaat === 'success' : e.actief === 'active');
            const info = EENHEID_NAAM[naam];
            const Ico = info?.[2] ?? Server;
            const act = ACTIEF_TEKST[e.actief];
            return <div key={naam} className='ut-rij ut-rij-statisch ud-dienst' data-staat={goed ? 'klaar' : e.geladen !== 'loaded' ? 'afgebroken' : 'mislukt'}>
              <span className='ud-dienst-naam'><Ico aria-hidden='true' /><span><b>{info ? tr(lang, info[0], info[1]) : naam}</b><small className='ut-mono'>{naam}</small></span></span>
              <span>{e.geladen !== 'loaded' ? tr(lang, 'не встановлено', 'niet geïnstalleerd') : `${act ? tr(lang, act[0], act[1]) : e.actief} · ${e.sub}`}</span>
              <span>{e.bestand ? (e.bestand === 'enabled' ? tr(lang, 'автозапуск увімкнено', 'start automatisch') : e.bestand === 'static' ? tr(lang, 'запускається іншим юнітом', 'gestart door een andere unit') : e.bestand) : ''}</span>
              <span>{e.resultaat && e.resultaat !== 'success' ? `${tr(lang, 'результат', 'resultaat')}: ${e.resultaat} (${e.exit})` : e.einde || ''}</span>
            </div>;
          })}
        </div>
      </section>

      <div className='ut-detail-raster'>
        <section className='ud-blok'><Kop icoon={Lock} titel={tr(lang, 'Блокування та скрипт', 'Vergrendeling en script')} />
          <dl className='ut-dl'>
            <dt>{tr(lang, 'Блокування встановлення', 'Installatievergrendeling')}</dt><dd>{root.lock.bezet ? tr(lang, `утримується: ${root.lock.door}`, `vastgehouden door ${root.lock.door}`) : tr(lang, 'вільне', 'vrij')}</dd>
            <dt>{tr(lang, 'Root-скрипт', 'Root-script')}</dt><dd>{root.script.bestaat ? `${root.script.uitvoerbaar ? tr(lang, 'виконуваний', 'uitvoerbaar') : tr(lang, 'НЕ виконуваний', 'NIET uitvoerbaar')} · ${root.script.sha12 || ''}` : tr(lang, 'відсутній', 'ontbreekt')}</dd>
            <dt>{tr(lang, 'Тека статусу доступна сайту', 'Statusmap leesbaar voor de site')}</dt><dd>{d.app.statusMapLeesbaar ? tr(lang, 'так', 'ja') : tr(lang, 'ні — перевірте права (root:mijnruimte 0750)', 'nee — controleer rechten (root:mijnruimte 0750)')}</dd>
            <dt>{tr(lang, 'Останній крок від root', 'Laatste stap van root')}</dt><dd>{d.app.laatsteStapTijd ? datumLang(lang, d.app.laatsteStapTijd) : tr(lang, 'ще жодного', 'nog geen enkele')}</dd>
          </dl></section>
        <section className='ud-blok'><Kop icoon={HardDrive} titel={tr(lang, 'Диск і черга пакетів', 'Schijf en pakketwachtrij')} />
          <dl className='ut-dl'>
            {Object.entries(root.schijf).map(([p, v]) => <FragmentRij key={p} k={p}><dd data-laag={v.vrijMB < 800}>{tr(lang, 'вільно', 'vrij')} {mb(v.vrijMB * 1048576)} / {mb(v.totaalMB * 1048576)}</dd></FragmentRij>)}
            <dt>{tr(lang, 'Файли в черзі', 'Bestanden in de wachtrij')}</dt><dd>{root.inbox.bestanden.length ? root.inbox.bestanden.map((b) => `${b.naam} (${mb(b.bytes)})`).join(', ') : tr(lang, 'порожньо — це нормально', 'leeg — dat is normaal')}</dd>
          </dl></section>
      </div>

      <JournaalKijker lang={lang} ctx={context} root={root} />
    </>}

    <Controles lang={lang} ctx={context} />
  </section>;
}
function FragmentRij({ k, children }: { k: string; children: ReactNode }) { return <><dt>{k}</dt>{children}</>; }
