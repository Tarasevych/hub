// Kaart «Поточне розгортання»: leest elke ~1,5 s /api/owner/uitrol/live (database app.uitrol_runs + app.uitrol_run_regels, door de app gevuld uit de
// bestanden die root schrijft) en toont fasen, deelstappen, voortgang, verstreken tijd en de echte terminaluitvoer — niet alleen een percentage.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, CircleDashed, Clock, Loader2, ScrollText, XCircle } from 'lucide-react';
import { api } from '../platform/client';
import Terminal from './Terminal';
import { codeTekst } from './fouten';
import Oorzaak from './Oorzaak';
import { DEELSTAPPEN, FASEN, deelStanden, subTijden, duur, methodeTekst, runDuur, staatTekst, tijdKort, tr, type Fase, type Flow, type Lang, type LiveAntwoord, type Regel, type Run } from './types';

export type WachtOpRoot = { id: string; versie: string; beslistOp: string };
type Props = {
  lang: Lang; context: Record<string, unknown>; wachtendOpGoedkeuring: number; goedgekeurd: WachtOpRoot[];
  openLog: (runId: string) => void; openDiagnose: () => void; onRunVerandert?: (run: Run | null) => void;
  /** Stand van de wizard «Нове оновлення»: bij een nieuw bestand beginnen de vier fases opnieuw, los van de vorige run. */
  flow?: Flow;
};
const MAX_REGELS = 4000;
/** Een afgeronde run (ook een mislukte) blijft zo lang zichtbaar; daarna maakt de kaart zich leeg en wacht op de volgende uitrol. De samenvatting staat in de lijst «Останні розгортання». */
export const OPSCHONEN_MS = 30_000;
const PAGINA = 2000; // zelfde als LIVE_PAGINA in backend/uitrol-runs.ts: bij een volle pagina meteen verder lezen
type FaseStand = 'wacht' | 'actief' | 'ok' | 'fout';

/** Welke van de vier fases loopt, is klaar of is mislukt — uit de run en uit de voorstellen. */
export function faseStanden(run: Run | null, wachtend: number, goedgekeurd: number): Record<Fase, FaseStand> {
  const s: Record<Fase, FaseStand> = { voorbereiding: 'wacht', goedkeuring: 'wacht', controles: 'wacht', uitrol: 'wacht' };
  const controleStappen = ['ontvangen', 'kopie', 'echtheid', 'inhoud'];
  if (run && (run.staat === 'bezig' || Date.now() - Date.parse(run.bijgewerkt) < 6 * 3600_000)) {
    s.voorbereiding = 'ok'; s.goedkeuring = 'ok';
    const inUitrol = run.stap === 'installeren' || run.stap === 'klaar' || run.staat === 'klaar';
    if (run.staat === 'bezig') { if (inUitrol) { s.controles = 'ok'; s.uitrol = 'actief'; } else s.controles = 'actief'; }
    else if (run.staat === 'klaar') { s.controles = 'ok'; s.uitrol = 'ok'; }
    else { if (inUitrol && run.stap !== 'ontvangen' && !controleStappen.includes(run.stap)) { s.controles = 'ok'; s.uitrol = 'fout'; } else s.controles = 'fout'; }
    if (run.methode === 'ssh') { s.voorbereiding = 'ok'; s.goedkeuring = 'ok'; s.controles = 'ok'; if (run.staat === 'klaar') s.uitrol = 'ok'; else if (run.staat !== 'bezig') s.uitrol = 'fout'; }
    return s;
  }
  if (goedgekeurd > 0) { s.voorbereiding = 'ok'; s.goedkeuring = 'ok'; s.controles = 'actief'; return s; }
  if (wachtend > 0) { s.voorbereiding = 'ok'; s.goedkeuring = 'actief'; return s; }
  return s;
}

function StapIcoon({ staat }: { staat: string }) {
  if (staat === 'ok') return <CheckCircle2 aria-hidden='true' />;
  if (staat === 'bezig' || staat === 'actief') return <Loader2 aria-hidden='true' className='ut-draai' />;
  if (staat === 'fout') return <XCircle aria-hidden='true' />;
  return <CircleDashed aria-hidden='true' />;
}

/**
 * Zolang een pakket is goedgekeurd maar root nog geen stap van DIT pakket schreef, is de nieuwste run in de database een oudere (bv. een SSH-installatie
 * van daarnet). Die mag niet als «lopende uitrol» getoond worden: alle fases zouden dan groen op 100 % blijven staan.
 */
export function isOudeRun(run: Run | null, goedgekeurd: WachtOpRoot[]): boolean {
  if (!run || run.staat === 'bezig' || !goedgekeurd.length) return false;
  const eerst = Math.min(...goedgekeurd.map((g) => Date.parse(g.beslistOp)).filter(Number.isFinite));
  return Number.isFinite(eerst) && Date.parse(run.gestart) < eerst - 2000;
}

export default function LiveKaart({ lang, context, wachtendOpGoedkeuring, goedgekeurd, openLog, openDiagnose, onRunVerandert, flow }: Props) {
  const [laatsteRun, setRun] = useState<Run | null>(null);
  const [regels, setRegels] = useState<Regel[]>([]);
  const [fout, setFout] = useState('');
  const [nu, setNu] = useState(Date.now());
  const skew = useRef(0); // serverklok − browserklok, zodat «30 s na afloop» niet van een scheve klok afhangt
  const cursor = useRef(-1);
  const runId = useRef('');
  const bezig = useRef(false);
  const meer = useRef(false);
  const runBasis = isOudeRun(laatsteRun, goedgekeurd) ? null : laatsteRun;
  const eindMs = runBasis && runBasis.staat !== 'bezig' ? Date.parse(runBasis.geeindigd || runBasis.bijgewerkt) : NaN;
  const overMs = Number.isFinite(eindMs) ? Math.max(0, OPSCHONEN_MS - (nu + skew.current - eindMs)) : 0;
  const run = runBasis && (runBasis.staat === 'bezig' || overMs > 0) ? runBasis : null;
  const actief = run?.staat === 'bezig' || goedgekeurd.length > 0;
  const tikt = actief || overMs > 0;
  const actiefRef = useRef(actief);
  actiefRef.current = actief;

  const poll = useCallback(async () => {
    if (bezig.current) return;
    bezig.current = true; meer.current = false;
    try {
      const r = (await api.post('/api/owner/uitrol/live', { ...context, run: '', na: cursor.current })).data as LiveAntwoord;
      const sn = Date.parse(r.nu); if (Number.isFinite(sn)) skew.current = sn - Date.now();
      setNu(Date.now());
      const nieuwId = r.run?.id || '';
      if (nieuwId !== runId.current) { runId.current = nieuwId; cursor.current = -1; setRegels([]); if (nieuwId) { const volledig = (await api.post('/api/owner/uitrol/live', { ...context, run: nieuwId, na: -1 })).data as LiveAntwoord; setRun(volledig.run); setRegels(volledig.regels); meer.current = volledig.regels.length >= PAGINA; cursor.current = volledig.regels.length ? volledig.regels[volledig.regels.length - 1].nr : -1; onRunVerandert?.(volledig.run); setFout(''); return; } }
      setRun(r.run);
      if (r.regels.length) { meer.current = r.regels.length >= PAGINA; cursor.current = r.regels[r.regels.length - 1].nr; setRegels((oud) => [...oud, ...r.regels].slice(-MAX_REGELS)); }
      onRunVerandert?.(r.run);
      setFout('');
    } catch { setFout(tr(lang, 'Немає зв’язку із сервером — повторюю…', 'Geen verbinding met de server — opnieuw proberen…')); }
    finally { bezig.current = false; }
  }, [context, lang, onRunVerandert]);

  useEffect(() => {
    let weg = false; let t = 0;
    const lus = async () => { if (weg) return; if (!document.hidden) await poll(); if (!weg) t = window.setTimeout(lus, meer.current ? 50 : actiefRef.current ? 1500 : 8000); };
    void lus();
    return () => { weg = true; window.clearTimeout(t); };
  }, [poll, actief]); // bij het wisselen van rust ↔ actief meteen opnieuw peilen (anders wacht een rustige lus nog tot 8 s)
  useEffect(() => { if (!tikt) return; const t = window.setInterval(() => setNu(Date.now()), 1000); return () => window.clearInterval(t); }, [tikt]);

  const wachtSec = goedgekeurd.length ? Math.max(0, Math.round((nu - Math.min(...goedgekeurd.map((g) => Date.parse(g.beslistOp)))) / 1000)) : 0;
  const rootStil = goedgekeurd.length > 0 && !(run && run.staat === 'bezig') && wachtSec > 60;
  // Nieuw bestand in de wizard (en er loopt niets): de fases tonen DIT bestand, de vorige run wordt een gedempte samenvatting.
  const nieuweFlow = !!flow && flow.fase !== 'leeg' && !(laatsteRun && laatsteRun.staat === 'bezig') && goedgekeurd.length === 0;
  const fasen = useMemo<Record<Fase, FaseStand>>(() => nieuweFlow
    ? { voorbereiding: flow!.fase === 'voorbereiding' ? 'actief' : 'ok', goedkeuring: flow!.fase === 'goedkeuring' ? 'actief' : 'wacht', controles: 'wacht', uitrol: 'wacht' }
    : faseStanden(run, wachtendOpGoedkeuring, goedgekeurd.length), [nieuweFlow, flow, run, wachtendOpGoedkeuring, goedgekeurd.length]);
  const delen = useMemo(() => deelStanden(run), [run]);
  const subT = useMemo(() => subTijden(regels, run && run.staat !== 'bezig' ? run.geeindigd || run.bijgewerkt : undefined), [regels, run]);
  const toon = !!run;
  const pct = run ? (run.staat === 'klaar' ? 100 : run.pct) : 0;
  const detailVan = (id: string) => run?.stappen.find((s) => s.stap === id);
  // Onder de actieve fase staat welke deelstap nu loopt, zodat de vier blokjes bovenaan ook tijdens de lange installatie iets vertellen.
  const lopendeDeel = DEELSTAPPEN.find((d) => delen[d.id] === 'bezig');
  const faseSub = (f: Fase): string => {
    if (fasen[f] !== 'actief') return '';
    if (nieuweFlow) return f === 'voorbereiding' ? (flow!.detail || tr(lang, 'пакет готується', 'pakket wordt voorbereid')) : tr(lang, 'чекає вашого passkey', 'wacht op uw passkey');
    if (f === 'goedkeuring') return tr(lang, 'чекає вашого passkey', 'wacht op uw passkey');
    if (f === 'controles' && !run) return tr(lang, 'сервер підхоплює пакет…', 'de server pakt het pakket op…');
    return lopendeDeel ? tr(lang, lopendeDeel.uk, lopendeDeel.nl) : '';
  };

  return <section className='ut-kaart ut-live' data-ut-live data-staat={run?.staat || 'leeg'} data-idle={(!nieuweFlow && !run && goedgekeurd.length === 0 && wachtendOpGoedkeuring === 0) || undefined} aria-labelledby='ut-live-titel'>
    <header className='ut-kaart-kop'>
      <div>
        <h2 id='ut-live-titel'>{nieuweFlow ? <>{tr(lang, 'Нове оновлення', 'Nieuwe update')}{flow!.versie ? <> · <span className='ut-mono'>{flow!.versie}</span></> : null}</>
          : run && toon ? <>{run.staat === 'bezig' ? tr(lang, 'Поточне розгортання', 'Lopende uitrol') : tr(lang, 'Останнє розгортання', 'Laatste uitrol')} · <span className='ut-mono'>{run.versie || run.release || run.id}</span></>
          : goedgekeurd.length ? tr(lang, 'Схвалено — чекаємо сервер', 'Goedgekeurd — wachten op de server')
          : wachtendOpGoedkeuring ? tr(lang, 'Пакет чекає вашого схвалення', 'Pakket wacht op uw goedkeuring') : tr(lang, 'Готово до нового розгортання', 'Klaar voor een nieuwe uitrol')}</h2>
        {nieuweFlow && <p className='ut-sub'>{tr(lang, 'Етапи нижче стосуються лише вибраного файлу й починаються заново.', 'De fasen hieronder gelden alleen voor het gekozen bestand en beginnen opnieuw.')}</p>}
        {!nieuweFlow && run && toon && <p className='ut-sub'>{methodeTekst(lang, run.methode)}{run.wie ? ` · ${run.wie}` : ''}{run.adres ? ` · ${run.adres}` : ''} · {tr(lang, 'початок', 'start')} {tijdKort(lang, run.gestart)}</p>}
      </div>
      <div className='ut-kop-rechts'>
        {!nieuweFlow && run && toon && <span className='ut-badge' data-staat={run.staat}>{staatTekst(lang, run.staat)}</span>}
        {!nieuweFlow && run && toon && <span className='ut-tijd' title={tr(lang, 'Минуло часу', 'Verstreken tijd')}><Clock aria-hidden='true' />{run.staat === 'bezig' ? duur(nu - Date.parse(run.gestart)) : runDuur(run)}</span>}
        {!nieuweFlow && run && toon && <button type='button' className='ut-knop' onClick={() => openLog(run.id)}><ScrollText aria-hidden='true' />{tr(lang, 'Переглянути журнал', 'Logboek bekijken')}</button>}
      </div>
    </header>

    <ol className='ut-fasen' data-afgerond={(!nieuweFlow && !!run && run.staat !== 'bezig' && goedgekeurd.length === 0 && wachtendOpGoedkeuring === 0) || undefined} aria-label={tr(lang, 'Етапи розгортання', 'Fasen van de uitrol')}>
      {FASEN.map((f, i) => <li key={f.id} data-stand={fasen[f.id]} aria-current={fasen[f.id] === 'actief' ? 'step' : undefined}>
        <span className='ut-fase-bol'>{fasen[f.id] === 'ok' ? <CheckCircle2 aria-hidden='true' /> : fasen[f.id] === 'fout' ? <XCircle aria-hidden='true' /> : fasen[f.id] === 'actief' ? <Loader2 aria-hidden='true' className='ut-draai' /> : <span>{i + 1}</span>}</span>
        <span className='ut-fase-tekst'>{tr(lang, f.uk, f.nl)}</span>
        {faseSub(f.id) && <small className='ut-fase-sub'>{faseSub(f.id)}</small>}
      </li>)}
    </ol>

    {!nieuweFlow && rootStil && <div className='ut-waarschuwing' role='alert'>
      <AlertTriangle aria-hidden='true' />
      <div><b>{tr(lang, `Сервер (root) не відповідає вже ${duur(wachtSec * 1000)} після схвалення.`, `De server (root) reageert al ${duur(wachtSec * 1000)} na de goedkeuring niet.`)}</b>
        <p>{tr(lang, 'Схвалення збережене, але жодного кроку встановлення ще не з’явилося. Вкладка «Діагностика» покаже, на якій ланці зупинилось (юніт path, служба, блокування, inbox, диск).', 'De goedkeuring is bewaard, maar er verscheen nog geen installatiestap. Het tabblad «Діагностика» toont waar de keten stokt (path-unit, dienst, vergrendeling, inbox, schijf).')}</p>
        <button type='button' className='ut-knop' onClick={openDiagnose}>{tr(lang, 'Відкрити діагностику', 'Diagnose openen')}</button></div>
    </div>}
    {!nieuweFlow && goedgekeurd.length > 0 && !rootStil && !(run && run.staat === 'bezig') && <p className='ut-wacht' role='status'><Loader2 aria-hidden='true' className='ut-draai' />{tr(lang, `Схвалено. Чекаємо, поки сервер підхопить пакет (${wachtSec} с)…`, `Goedgekeurd. Wachten tot de server het pakket oppakt (${wachtSec} s)…`)}</p>}
    {fout && <p className='ut-fout' role='status'>{fout}</p>}

    {nieuweFlow && run && toon && <p className='ut-vorige'><span><b>{tr(lang, 'Попереднє розгортання', 'Vorige uitrol')}</b> · <span className='ut-mono'>{run.versie || run.release || run.id}</span> · {staatTekst(lang, run.staat)} · {tijdKort(lang, run.gestart)}</span>
      <button type='button' className='ut-knop' onClick={() => openLog(run.id)}><ScrollText aria-hidden='true' />{tr(lang, 'Журнал', 'Logboek')}</button></p>}
    {!nieuweFlow && run && toon && run.staat !== 'bezig' && goedgekeurd.length === 0 && wachtendOpGoedkeuring === 0 && <p className='ut-vorige-hint' data-ut-opschonen>{tr(lang, `Це завершене розгортання. Блок очиститься сам через ${Math.ceil(overMs / 1000)} с — підсумок лишається в «Останні розгортання» та в історії.`, `Dit is een afgeronde uitrol. Dit blok maakt zichzelf leeg over ${Math.ceil(overMs / 1000)} s — de samenvatting blijft in «Laatste uitrollen» en in de geschiedenis.`)}</p>}

    {!nieuweFlow && run && toon && <>
      <div className='ut-voortgang' role='progressbar' aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={tr(lang, 'Загальний прогрес', 'Totale voortgang')} data-staat={run.staat}>
        <div className='ut-voortgang-balk'><i style={{ width: `${pct}%` }} /></div><b>{pct}%</b>
      </div>
      {(run.staat === 'mislukt' || run.staat === 'geweigerd' || run.staat === 'afgebroken') && <div className='ut-uitkomst' data-staat={run.staat} role='alert'>
        <XCircle aria-hidden='true' /><div><b>{staatTekst(lang, run.staat)}{run.code ? ` · ${codeTekst(lang, run.code)}` : ''}</b><p>{lang === 'uk' ? run.uk : run.nl}</p><Oorzaak lang={lang} run={run} /></div>
      </div>}
      {run.staat === 'klaar' && <div className='ut-uitkomst' data-staat='klaar'><CheckCircle2 aria-hidden='true' /><div><b>{tr(lang, 'Розгортання завершено', 'Uitrol voltooid')}{run.release ? ` · ${run.release}` : ''}</b><p>{lang === 'uk' ? run.uk : run.nl}</p></div></div>}

      {run.methode !== 'ssh' && <ul className='ut-delen' aria-label={tr(lang, 'Кроки встановлення', 'Installatiestappen')}>
        {DEELSTAPPEN.map((d) => { const st = delen[d.id]; const info = !d.sub ? detailVan(d.stap) : undefined;
          return <li key={d.id} data-stand={st}>
            <StapIcoon staat={st} />
            <span className='ut-deel-tekst'><b>{tr(lang, d.uk, d.nl)}</b><small>{info && (lang === 'uk' ? info.uk : info.nl) ? (lang === 'uk' ? info.uk : info.nl) : tr(lang, d.hulpUk, d.hulpNl)}</small></span>
            <span className='ut-deel-stand'>{st === 'ok' ? tr(lang, 'готово', 'klaar') : st === 'bezig' ? tr(lang, 'виконується', 'bezig') : st === 'fout' ? tr(lang, 'помилка', 'fout') : tr(lang, 'очікує', 'wacht')}{info?.tijd && st !== 'wacht' ? ` · ${tijdKort(lang, info.tijd)}` : d.sub && subT[d.sub] && st !== 'wacht' ? ` · ${tijdKort(lang, subT[d.sub].tijd)}${subT[d.sub].duurMs !== null && st === 'ok' ? ` (${duur(subT[d.sub].duurMs as number)})` : ''}` : ''}</span>
          </li>; })}
      </ul>}
      {run.methode === 'ssh' && <p className='ut-hint'>{tr(lang, 'Це встановлення виконали вручну через SSH — сайт бачить лише результат, а не кожен крок.', 'Deze installatie is handmatig via SSH gedaan — de site ziet alleen de uitkomst, niet elke stap.')}</p>}

      {/* De terminal hoort bij de installatiefase: eerder (ontvangen/controles) is er niets te zien en verschijnt hij pas als root met installeren begint. */}
      {run.methode !== 'ssh' && fasen.uitrol !== 'wacht' && regels.length > 0 && <Terminal lang={lang} regels={regels} live={run.staat === 'bezig'} bestandsnaam={`uitrol-${run.id}.log`} hoogte={280} />}
      {run.methode !== 'ssh' && fasen.uitrol === 'wacht' && run.staat === 'bezig' && <p className='ut-hint' data-ut-terminal-verborgen>{tr(lang, 'Термінал з’явиться тут, щойно сервер перейде до встановлення (після перевірок).', 'De terminal verschijnt hier zodra de server met installeren begint (na de controles).')}</p>}
    </>}

    {!nieuweFlow && !run && !goedgekeurd.length && !wachtendOpGoedkeuring && <p className='ut-leeg' data-ut-leeg>{tr(lang, 'Готово до наступного розгортання. Кроки й термінал з’являться самі, коли почнеться нове.', 'Klaar voor de volgende uitrol. Stappen en terminal verschijnen vanzelf zodra er een nieuwe begint.')}</p>}
  </section>;
}
