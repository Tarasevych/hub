// UITROL-001 · «Перевірка вимог до встановлення»: що саме перевіряється, як, з яким результатом і скільки це тривало.
// Групи згортаються; група з помилкою відкрита сама. Біля кожної вимоги «?» пояснює, навіщо вона й що буде, якщо вона не виконана.
// UITROL-001 · Vereistenkaart: groepen (inklapbaar), per vereiste uitleg «?», bij een fout de precieze oorzaak (migratie, regel,
// beperking, werkelijke waarde, PostgreSQL-fout, wat te doen) en een live logboek met tijd (ms) en delta.
import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, CircleDashed, ClipboardCopy, Database, Fingerprint, FolderOpen, HelpCircle, ListChecks, Loader2, MinusCircle, Package, Server, ShieldCheck, Terminal as TerminalIcoon, Timer, Wrench, XCircle, type LucideIcon } from 'lucide-react';
import { GROEPEN, telVereisten, type Vereiste, type VereisteGroep, type VereistenAntwoord } from '../../shared/uitrol-vereisten';
import { emitCanonicalNotice } from '../canoniek-meldingen';
import { mb, tr, type Lang } from './types';
import { kopieerNaarKlembord } from './kopieer';
import ProbleemRapport from './ProbleemRapport';
import type { RapportInvoer } from './probleem-rapport';
import './vereisten.css';

const GROEP_ICOON: Record<VereisteGroep, LucideIcon> = { archief: Package, herkomst: Fingerprint, compatibiliteit: Database, server: Server };
const NIVEAU_ICOON: Record<Vereiste['niveau'], LucideIcon> = { ok: CheckCircle2, fout: XCircle, waarschuwing: AlertTriangle, wacht: CircleDashed, bezig: Loader2, overgeslagen: MinusCircle };
const sec = (ms: number, lang: Lang) => (ms < 1 ? tr(lang, '< 1 мс', '< 1 ms') : ms < 1000 ? `${Math.round(ms)} ${tr(lang, 'мс', 'ms')}` : `${(ms / 1000).toLocaleString(lang === 'uk' ? 'uk-UA' : 'nl-BE', { maximumFractionDigits: 1 })} ${tr(lang, 'с', 's')}`);
const klok = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : `${d.toLocaleTimeString('uk-UA', { hour12: false })}.${String(d.getMilliseconds()).padStart(3, '0')}`; };

type Props = {
  lang: Lang; antwoord: VereistenAntwoord | null; bezig: boolean; fout: string;
  bytes: number; rapport: Omit<RapportInvoer, 'lang' | 'beschrijving' | 'delen' | 'antwoord' | 'siteFout'>;
  onAnderArchief: () => void;
};

export default function Vereisten({ lang, antwoord, bezig, fout, bytes, rapport, onAnderArchief }: Props) {
  const [rapportOpen, setRapportOpen] = useState(false);
  const [volg, setVolg] = useState(true);
  const logRef = useRef<HTMLDivElement>(null);
  const tel = useMemo(() => telVereisten(antwoord?.vereisten || []), [antwoord]);
  const geblokkeerd = !!antwoord && antwoord.klaar && !antwoord.ok;
  const lopend = bezig || (!!antwoord && !antwoord.klaar);

  // Elke uitkomst één keer in het meldingencentrum (met uitleg en details), ook als de gebruiker intussen ergens anders kijkt.
  const gemeld = useRef('');
  useEffect(() => {
    if (!antwoord || !antwoord.klaar || gemeld.current === antwoord.id) return;
    gemeld.current = antwoord.id;
    const fouten = antwoord.vereisten.filter((v) => v.niveau === 'fout');
    const o = fouten.find((v) => v.oorzaak)?.oorzaak;
    emitCanonicalNotice({
      kind: antwoord.ok ? (tel.waarschuwing ? 'warning' : 'success') : 'error', source: 'uitrol', retain: true, topic: `uitrol|vereisten|${rapport.archief?.sha256 || ''}`,
      context: rapport.archief ? `${rapport.archief.bestand} · ${rapport.archief.versie}` : undefined,
      text: antwoord.ok
        ? tr(lang, `Архів ${rapport.archief?.versie || ''} відповідає вимогам (${tel.ok}/${antwoord.vereisten.length}) — можна завантажувати`, `Archief ${rapport.archief?.versie || ''} voldoet aan de vereisten (${tel.ok}/${antwoord.vereisten.length}) — uploaden kan`)
        : tr(lang, `Архів ${rapport.archief?.versie || ''} не відповідає вимогам — завантаження не почалося`, `Archief ${rapport.archief?.versie || ''} voldoet niet aan de vereisten — uploaden is niet begonnen`),
      explain: o ? tr(lang, `${o.migratie}${o.regel ? `, рядок ${o.regel}` : ''}: ${o.uitlegUk} ${o.actieUk}`, `${o.migratie}${o.regel ? `, regel ${o.regel}` : ''}: ${o.uitlegNl} ${o.actieNl}`)
        : fouten.length ? fouten.map((v) => `${tr(lang, v.uk, v.nl)}: ${tr(lang, v.waardeUk || '', v.waardeNl || '')}`).join(' · ') : undefined,
      details: [{ title: tr(lang, 'Перевірка вимог', 'Controle van de vereisten'), items: [
        { icon: 'results', label: tr(lang, 'Виконано', 'Voldaan'), value: `${tel.ok}/${antwoord.vereisten.length}` },
        { icon: 'duration', label: tr(lang, 'Тривалість', 'Duur'), value: sec(antwoord.ms + (antwoord.proef.uitslag?.stappen.reduce((s, x) => s + x.ms, 0) || 0), lang) },
        ...fouten.slice(0, 4).map((v) => ({ icon: 'error' as const, label: tr(lang, v.uk, v.nl), value: tr(lang, v.waardeUk || '', v.waardeNl || '').slice(0, 200) })),
        ...(!antwoord.ok ? [{ icon: 'saved' as const, label: tr(lang, 'Трафік не витрачено', 'Geen verkeer verbruikt'), value: mb(bytes) }] : []),
      ] }],
    });
  }, [antwoord, tel, lang, bytes, rapport.archief]);

  useEffect(() => { const el = logRef.current; if (el && volg) el.scrollTop = el.scrollHeight; }, [antwoord?.log.length, volg]);

  const totaalMs = (antwoord?.ms || 0) + (antwoord?.proef.uitslag?.stappen.reduce((s, x) => s + x.ms, 0) || 0);
  const kopieerLog = () => { void kopieerNaarKlembord((antwoord?.log || []).map((l) => `${klok(l.t)} ${l.niveau} ${l.tekst}`).join('\n')); };

  return <section className='ut-vr' data-ut-vereisten data-stand={geblokkeerd ? 'fout' : lopend ? 'bezig' : antwoord ? 'ok' : fout ? 'onbekend' : 'wacht'}>
    {geblokkeerd && <div className='ut-vr-banner' role='alert'>
      <XCircle aria-hidden='true' />
      <div>
        <h4>{tr(lang, `Архів ${rapport.archief?.versie || ''} не придатний для цього сервера`, `Archief ${rapport.archief?.versie || ''} past niet op deze server`)}</h4>
        <p>{tr(lang, 'Знайдено до завантаження. На сервер не пішов жоден байт архіву, нічого не встановлено й не змінено.', 'Gevonden vóór het uploaden. Er ging geen byte van het archief naar de server; er is niets geïnstalleerd of gewijzigd.')}</p>
        <span className='ut-vr-bespaard'><ShieldCheck aria-hidden='true' />{tr(lang, `Трафік не витрачено: ${mb(bytes)}`, `Geen verkeer verbruikt: ${mb(bytes)}`)}</span>
      </div>
      <div className='ut-vr-acties'>
        <button type='button' className='ut-knop ut-knop-primair' data-ut-hoofdactie onClick={() => setRapportOpen(true)} title={tr(lang, 'Відкриває вікно з описом, причиною, вимогами й журналом в одному тексті — без секретів. Його можна скопіювати й передати агентові.', 'Opent een venster met beschrijving, oorzaak, vereisten en logboek in één tekst — zonder geheimen. Kopieer het en geef het aan een agent.')}><ClipboardCopy aria-hidden='true' />{tr(lang, 'Скопіювати звіт про проблему', 'Probleemrapport kopiëren')}</button>
        <button type='button' className='ut-knop' onClick={onAnderArchief} title={tr(lang, 'Скидає цей файл і відкриває вибір іншого. Нічого на сервері не змінюється.', 'Wist dit bestand en opent de keuze van een ander. Op de server verandert niets.')}><FolderOpen aria-hidden='true' />{tr(lang, 'Інший архів', 'Ander archief')}</button>
      </div>
    </div>}

    <header className='ut-vr-kop'>
      <div>
        <h4><ListChecks aria-hidden='true' />{tr(lang, 'Перевірка вимог до встановлення', 'Controle van de vereisten')}</h4>
        <p>{tr(lang, 'Виконується ще до завантаження: браузер читає архів локально, на сервер іде лише опис і SQL нових міграцій. Сервер пробує ці міграції на тимчасовій копії схеми бази й одразу її видаляє.', 'Loopt vóór het uploaden: de browser leest het archief lokaal; naar de server gaan alleen een beschrijving en de SQL van nieuwe migraties. De server probeert die migraties op een tijdelijke kopie van het databaseschema en verwijdert die meteen.')}</p>
      </div>
      <div className='ut-vr-chips'>
        {antwoord && <span className='ut-vr-chip' data-soort={geblokkeerd ? 'fout' : tel.waarschuwing ? 'waarschuwing' : 'ok'}>{tel.ok}/{antwoord.vereisten.length} ✓{tel.fout ? ` · ${tel.fout} ✗` : ''}{tel.waarschuwing ? ` · ${tel.waarschuwing} !` : ''}</span>}
        {(antwoord || lopend) && <span className='ut-vr-chip ut-mono' title={tr(lang, 'Загальний час перевірки, включно з пробою міграцій', 'Totale duur van de controle, inclusief de migratieproef')}>{lopend ? <Loader2 aria-hidden='true' className='ut-draai' /> : <Timer aria-hidden='true' />}{sec(totaalMs, lang)}</span>}
      </div>
    </header>

    {fout && !antwoord && <p className='ut-vr-let-op' role='status'><AlertTriangle aria-hidden='true' />{tr(lang, `Сайт не зміг перевірити вимоги заздалегідь (${fout}). Завантажувати можна: root перевірить усе під час установлення й першим кроком спробує міграції на копії.`, `De site kon de vereisten niet vooraf controleren (${fout}). Uploaden kan: root controleert alles bij de installatie en probeert de migraties als eerste stap op een kopie.`)}</p>}
    {bezig && !antwoord && <p className='ut-wacht' role='status'><Loader2 aria-hidden='true' className='ut-draai' />{tr(lang, 'Перевіряю вимоги…', 'Vereisten controleren…')}</p>}

    {antwoord && <div className='ut-vr-groepen'>
      {GROEPEN.map((g) => {
        const lijst = antwoord.vereisten.filter((v) => v.groep === g.id);
        if (!lijst.length) return null;
        const t = telVereisten(lijst);
        const Icoon = GROEP_ICOON[g.id];
        return <details key={g.id} className='ut-vr-groep' open={t.fout > 0 || t.open > 0 || undefined} data-groep={g.id}>
          <summary><Icoon aria-hidden='true' /><span>{tr(lang, g.uk, g.nl)}</span>
            <b className='ut-vr-tel' data-soort={t.fout ? 'fout' : t.waarschuwing ? 'waarschuwing' : t.open ? 'bezig' : 'ok'}>{t.fout ? `${t.fout} ✗` : `${t.ok}/${lijst.length}`}</b>
            <ChevronDown aria-hidden='true' className='ut-vr-pijl' /></summary>
          <ul>{lijst.map((v) => <Regel key={v.id} lang={lang} v={v} />)}</ul>
        </details>;
      })}
    </div>}

    {antwoord && antwoord.log.length > 0 && <details className='ut-vr-log' open={geblokkeerd || lopend || undefined}>
      <summary><TerminalIcoon aria-hidden='true' /><span>{tr(lang, 'Журнал перевірки', 'Logboek van de controle')}</span>{lopend && <i className='ut-vr-live'>{tr(lang, 'наживо', 'live')}</i>}<ChevronDown aria-hidden='true' className='ut-vr-pijl' /></summary>
      <div className='ut-vr-logbalk'>
        <label><input type='checkbox' data-hulp-vrij='filter' checked={volg} onChange={(e) => setVolg(e.target.checked)} />{tr(lang, 'стежити за новими рядками', 'nieuwe regels volgen')}</label>
        <button type='button' onClick={kopieerLog}><ClipboardCopy aria-hidden='true' />{tr(lang, 'Копіювати', 'Kopiëren')}</button>
      </div>
      <div className='ut-vr-regels ut-mono' ref={logRef} tabIndex={0} aria-label={tr(lang, 'Журнал перевірки', 'Logboek van de controle')}>
        {antwoord.log.map((l, i) => {
          const vorig = i ? Date.parse(antwoord.log[i - 1].t) : NaN; const nu = Date.parse(l.t);
          return <div key={i} className='ut-vr-ln' data-niveau={l.niveau}><span className='ut-vr-ts'>{klok(l.t)}</span><span className='ut-vr-dl'>{Number.isFinite(vorig) && Number.isFinite(nu) ? `+${((nu - vorig) / 1000).toFixed(2)}` : ''}</span><span className='ut-vr-tx'>{l.tekst}</span></div>;
        })}
      </div>
    </details>}

    {rapportOpen && <ProbleemRapport lang={lang} invoer={{ ...rapport, antwoord, siteFout: fout || undefined }} onSluiten={() => setRapportOpen(false)} />}
  </section>;
}

function Regel({ lang, v }: { lang: Lang; v: Vereiste }) {
  const Icoon = NIVEAU_ICOON[v.niveau];
  const waarde = tr(lang, v.waardeUk || '', v.waardeNl || '');
  const o = v.oorzaak;
  return <li className='ut-vr-regel' data-niveau={v.niveau} data-vereiste={v.id}>
    <Icoon aria-hidden='true' className={v.niveau === 'bezig' ? 'ut-draai' : undefined} />
    <div className='ut-vr-midden'>
      <b>{tr(lang, v.uk, v.nl)}<button type='button' className='ut-vr-waarom' aria-label={tr(lang, `Навіщо: ${v.uk}`, `Waarom: ${v.nl}`)} title={tr(lang, v.waaromUk, v.waaromNl)} onClick={(e) => { const el = e.currentTarget.closest('li')?.querySelector('.ut-vr-uitleg'); el?.toggleAttribute('hidden'); }}><HelpCircle aria-hidden='true' /></button></b>
      {waarde && <small>{waarde}</small>}
      <p className='ut-vr-uitleg' hidden>{tr(lang, v.waaromUk, v.waaromNl)}</p>
      {v.details?.length ? <ul className='ut-vr-details ut-mono'>{v.details.map((d, i) => <li key={i}>{d}</li>)}</ul> : null}
      {o && <div className='ut-vr-oorzaak' data-ut-oorzaak>
        <dl>
          <dt>{tr(lang, 'Міграція', 'Migratie')}</dt><dd className='ut-mono'>{o.migratie}{o.regel ? `, ${tr(lang, 'рядок', 'regel')} ${o.regel}` : ''}</dd>
          {o.constraint && <><dt>{tr(lang, 'Обмеження', 'Beperking')}</dt><dd className='ut-mono'>{o.constraint}{o.definitie ? <> — <span>{o.definitie}</span></> : null}</dd></>}
          {o.teLang && <><dt>{tr(lang, 'Фактично', 'Werkelijk')}</dt><dd><b>{o.teLang.lengte}</b> {tr(lang, 'знаків при межі', 'tekens bij een grens van')} {o.teLang.grens}</dd></>}
          {(o.tabel || o.kolom) && <><dt>{tr(lang, 'Таблиця', 'Tabel')}</dt><dd className='ut-mono'>{[o.tabel, o.kolom].filter(Boolean).join('.')}</dd></>}
          <dt>PostgreSQL</dt><dd className='ut-mono'>{o.code} · {o.bericht}</dd>
        </dl>
        {o.fragment && <pre className='ut-vr-fragment'>{o.fragment}</pre>}
        <p className='ut-vr-doen'><Wrench aria-hidden='true' /><span><b>{tr(lang, 'Що робити:', 'Wat te doen:')}</b> {tr(lang, o.actieUk, o.actieNl)}</span></p>
      </div>}
    </div>
    <span className='ut-vr-ms ut-mono'>{v.ms != null ? sec(v.ms, lang) : ''}</span>
  </li>;
}
