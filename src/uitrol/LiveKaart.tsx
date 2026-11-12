// Kaart «Поточне розгортання»: leest elke ~1,5 s /api/owner/uitrol/live (database app.uitrol_runs + app.uitrol_run_regels, door de app gevuld uit de
// bestanden die root schrijft) en toont fasen, deelstappen, voortgang, verstreken tijd en de echte terminaluitvoer — niet alleen een percentage.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, CircleDashed, Clock, Fingerprint, Link2, Loader2, OctagonX, ScrollText, ShieldCheck, XCircle } from 'lucide-react';
import Conveyor from './Conveyor';
import { conveyorStand } from './conveyor-stand';
import { api } from '../platform/client';
import Terminal from './Terminal';
import { codeTekst } from './fouten';
import Oorzaak from './Oorzaak';
import { DEELSTAPPEN, FASEN, deelStanden, duur, methodeTekst, runDuur, staatTekst, tijdKort, tr, type Fase, type Flow, type Lang, type LiveAntwoord, type Regel, type Run } from './types';

export type WachtOpRoot = { id: string; versie: string; beslistOp: string };
type Props = {
  lang: Lang; context: Record<string, unknown>; wachtendOpGoedkeuring: number; goedgekeurd: WachtOpRoot[];
  openLog: (runId: string) => void; openDiagnose: () => void; onRunVerandert?: (run: Run | null) => void;
  /** Stand van de wizard «Нове оновлення»: bij een nieuw bestand beginnen de vier fases opnieuw, los van de vorige run. */
  flow?: Flow;
  /** UITROL-001 «Зупинити встановлення»: step-up + reden; root honoreert tot vóór het overschakelen (< 90 %). */
  stoppen?: (v: { id: string; versie: string; run: string; reden: string }) => void;
  busy?: string;
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


/**
 * Zolang een pakket is goedgekeurd maar root nog geen stap van DIT pakket schreef, is de nieuwste run in de database een oudere (bv. een SSH-installatie
 * van daarnet). Die mag niet als «lopende uitrol» getoond worden: alle fases zouden dan groen op 100 % blijven staan.
 */
export function isOudeRun(run: Run | null, goedgekeurd: WachtOpRoot[]): boolean {
  if (!run || run.staat === 'bezig' || !goedgekeurd.length) return false;
  const eerst = Math.min(...goedgekeurd.map((g) => Date.parse(g.beslistOp)).filter(Number.isFinite));
  return Number.isFinite(eerst) && Date.parse(run.gestart) < eerst - 2000;
}

export default function LiveKaart({ lang, context, wachtendOpGoedkeuring, goedgekeurd, openLog, openDiagnose, onRunVerandert, flow, stoppen, busy }: Props) {
  const [laatsteRun, setRun] = useState<Run | null>(null);
  const [stopVeld, setStopVeld] = useState(false);
  const [stopReden, setStopReden] = useState('');
  // De wizard (stap 5) kan het stopveld openen: één plek voor de knop, bereikbaar vanuit beide kaarten.
  useEffect(() => { const open = () => { setStopVeld(true); window.setTimeout(() => document.getElementById('ut-stop-reden')?.focus(), 350); }; window.addEventListener('ut-stop-open', open); return () => window.removeEventListener('ut-stop-open', open); }, []);
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
  const knopen = useMemo(() => conveyorStand({ run, regels, flow, nieuweFlow, wachtend: wachtendOpGoedkeuring, goedgekeurd: goedgekeurd.length, nu }), [run, regels, flow, nieuweFlow, wachtendOpGoedkeuring, goedgekeurd.length, nu]);
  const toon = !!run;
  const pct = run ? (run.staat === 'klaar' ? 100 : run.pct) : 0;
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
        {!nieuweFlow && run && toon && <span className='ut-badge' data-staat={run.code === 'GESTOPT' ? 'gestopt' : run.staat}>{run.code === 'GESTOPT' ? tr(lang, 'Зупинено', 'Gestopt') : staatTekst(lang, run.staat)}</span>}
        {!nieuweFlow && run && toon && <span className='ut-tijd' title={tr(lang, 'Минуло часу', 'Verstreken tijd')}><Clock aria-hidden='true' />{run.staat === 'bezig' ? duur(nu - Date.parse(run.gestart)) : runDuur(run)}</span>}
        {!nieuweFlow && run && toon && <button type='button' className='ut-knop' onClick={() => openLog(run.id)}><ScrollText aria-hidden='true' />{tr(lang, 'Переглянути журнал', 'Logboek bekijken')}</button>}
      </div>
    </header>

    {/* UITROL-001: acht knopen (Вимоги → … → Здоров’я) i.p.v. de vier fasen; de oude indeling (faseStanden) blijft de bron voor de terminal- en stopregels hieronder. */}
    <div data-afgerond={(!nieuweFlow && !!run && run.staat !== 'bezig' && goedgekeurd.length === 0 && wachtendOpGoedkeuring === 0) || undefined} className='ut-conv-houder'>
      <Conveyor lang={lang} knopen={knopen} />
      {FASEN.some((f) => faseSub(f.id)) && !run && <p className='ut-conv-nu' role='status'>{FASEN.map((f) => faseSub(f.id)).filter(Boolean)[0]}</p>}
    </div>

    {!nieuweFlow && rootStil && <div className='ut-waarschuwing' role='alert'>
      <AlertTriangle aria-hidden='true' />
      <div><b>{tr(lang, `Сервер (root) не відповідає вже ${duur(wachtSec * 1000)} після схвалення.`, `De server (root) reageert al ${duur(wachtSec * 1000)} na de goedkeuring niet.`)}</b>
        <p>{tr(lang, 'Схвалення збережене, але жодного кроку встановлення ще не з’явилося. Вкладка «Діагностика» покаже, на якій ланці зупинилось (юніт path, служба, блокування, inbox, диск).', 'De goedkeuring is bewaard, maar er verscheen nog geen installatiestap. Het tabblad «Діагностика» toont waar de keten stokt (path-unit, dienst, vergrendeling, inbox, schijf).')}</p>
        <button type='button' className='ut-knop' onClick={openDiagnose}>{tr(lang, 'Відкрити діагностику', 'Diagnose openen')}</button></div>
    </div>}
    {!nieuweFlow && goedgekeurd.length > 0 && !rootStil && !(run && run.staat === 'bezig') && <p className='ut-wacht' role='status'><Loader2 aria-hidden='true' className='ut-draai' />{tr(lang, `Схвалено. Чекаємо, поки сервер підхопить пакет (${wachtSec} с)…`, `Goedgekeurd. Wachten tot de server het pakket oppakt (${wachtSec} s)…`)}</p>}
    {fout && <p className='ut-fout' role='status'>{fout}</p>}
    {/* UITROL-001 «Зупинити встановлення»: zichtbaar zolang stoppen zin heeft — na goedkeuring (root pakt op) en tijdens de installatie tot het overschakelen (< 90 %). */}
    {!nieuweFlow && stoppen && (() => {
      const lopend = run && run.staat === 'bezig' && run.methode === 'passkey';
      const kan = lopend || (goedgekeurd.length > 0 && !(run && run.staat === 'bezig'));
      if (!kan) return null;
      const pctNu = lopend ? run!.pct : 0;
      const teLaat = lopend && pctNu >= 90;
      const doel = { id: goedgekeurd[0]?.id || run?.voorstelId || '', versie: (lopend ? run!.versie : goedgekeurd[0]?.versie) || '', run: lopend ? run!.id : '' };
      const stopBezig = !!busy && busy.startsWith('stop-');
      return <div className='ut-stop' data-ut-stop data-te-laat={teLaat || undefined}>
        {teLaat ? <p className='ut-hint ut-stop-te-laat'><ShieldCheck aria-hidden='true' />{tr(lang, 'Зупинити вже не можна: триває перемикання на новий випуск. Якщо перевірка здоров’я не пройде, сервер сам відкотиться на попередній.', 'Stoppen kan niet meer: het overschakelen naar de nieuwe release loopt. Slaagt de gezondheidscontrole niet, dan draait de server zelf terug.')}</p>
          : !stopVeld ? <div className='ut-acties'><button type='button' className='ut-knop ut-knop-gevaar' disabled={stopBezig} onClick={() => setStopVeld(true)} title={tr(lang, 'Перервати встановлення цього пакета. Поточний випуск лишиться активним; незавершену теку сервер прибере сам. Потрібне підтвердження (passkey/step-up) і причина.', 'De installatie van dit pakket afbreken. De huidige release blijft actief; de onvolledige map ruimt de server zelf op. Vraagt een bevestiging (passkey/step-up) en een reden.')} data-ut-stop-knop><OctagonX aria-hidden='true' />{tr(lang, 'Зупинити встановлення', 'Installatie stoppen')}</button>
              <small className='ut-stop-uitleg'>{tr(lang, 'Можна до етапу «Перемикання». Нічого не встановиться; попередній випуск лишиться.', 'Kan tot de fase «Overschakelen». Er wordt niets geïnstalleerd; de vorige release blijft.')}</small></div>
          : <div className='ut-reden-veld' role='group' aria-labelledby='ut-stop-titel' data-ut-stop-veld>
              <label id='ut-stop-titel' htmlFor='ut-stop-reden'>{tr(lang, 'Чому зупиняєте? (щонайменше 10 знаків — потрапить у журнал і в історію)', 'Waarom stopt u? (minstens 10 tekens — komt in het logboek en de geschiedenis)')}</label>
              <textarea id='ut-stop-reden' rows={2} maxLength={300} value={stopReden} onChange={(e) => setStopReden(e.target.value)} disabled={stopBezig} placeholder={tr(lang, 'Наприклад: помилково схвалив стару збірку', 'Bijvoorbeeld: per ongeluk een oude build goedgekeurd')} />
              <div className='ut-acties'>
                <button type='button' className='ut-knop ut-knop-gevaar' disabled={stopBezig || [...stopReden.trim()].length < 10} onClick={() => { stoppen({ ...doel, reden: stopReden.trim().slice(0, 300) }); setStopVeld(false); setStopReden(''); }} data-ut-stop-bevestig><OctagonX aria-hidden='true' />{stopBezig ? tr(lang, 'Зупиняю…', 'Stoppen…') : tr(lang, 'Так, зупинити', 'Ja, stoppen')}</button>
                <button type='button' className='ut-knop' disabled={stopBezig} onClick={() => { setStopVeld(false); setStopReden(''); }}>{tr(lang, 'Не зупиняти', 'Niet stoppen')}</button>
              </div>
              <small className='ut-stop-uitleg'>{tr(lang, `Пакет ${doel.versie}: сервер отримає запит і перерве встановлення до перемикання. Запит підтверджується passkey/step-up і фіксується в аудиті.`, `Pakket ${doel.versie}: de server krijgt het verzoek en breekt de installatie vóór het overschakelen af. Het verzoek wordt met passkey/step-up bevestigd en in de audit vastgelegd.`)}</small>
            </div>}
      </div>; })()}

    {nieuweFlow && run && toon && <p className='ut-vorige'><span><b>{tr(lang, 'Попереднє розгортання', 'Vorige uitrol')}</b> · <span className='ut-mono'>{run.versie || run.release || run.id}</span> · {staatTekst(lang, run.staat)} · {tijdKort(lang, run.gestart)}</span>
      <button type='button' className='ut-knop' onClick={() => openLog(run.id)}><ScrollText aria-hidden='true' />{tr(lang, 'Журнал', 'Logboek')}</button></p>}
    {!nieuweFlow && run && toon && run.staat !== 'bezig' && goedgekeurd.length === 0 && wachtendOpGoedkeuring === 0 && <p className='ut-vorige-hint' data-ut-opschonen>{tr(lang, `Це завершене розгортання. Блок очиститься сам через ${Math.ceil(overMs / 1000)} с — підсумок лишається в «Останні розгортання» та в історії.`, `Dit is een afgeronde uitrol. Dit blok maakt zichzelf leeg over ${Math.ceil(overMs / 1000)} s — de samenvatting blijft in «Laatste uitrollen» en in de geschiedenis.`)}</p>}

    {!nieuweFlow && run && toon && <>
      <div className='ut-voortgang' role='progressbar' aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={tr(lang, 'Загальний прогрес', 'Totale voortgang')} data-staat={run.staat}>
        <div className='ut-voortgang-balk'><i style={{ width: `${pct}%` }} /></div><b>{pct}%</b>
      </div>
      {(run.staat === 'mislukt' || run.staat === 'geweigerd' || run.staat === 'afgebroken') && <div className='ut-uitkomst' data-staat={run.code === 'GESTOPT' ? 'gestopt' : run.staat} role='alert'>
        {run.code === 'GESTOPT' ? <OctagonX aria-hidden='true' /> : <XCircle aria-hidden='true' />}<div><b>{run.code === 'GESTOPT' ? tr(lang, 'Зупинено', 'Gestopt') : staatTekst(lang, run.staat)}{run.code ? ` · ${codeTekst(lang, run.code)}` : ''}</b>{(lang === 'uk' ? run.uk : run.nl) && (lang === 'uk' ? run.uk : run.nl) !== codeTekst(lang, run.code) ? <p>{lang === 'uk' ? run.uk : run.nl}</p> : null}<Oorzaak lang={lang} run={run} /></div>
      </div>}
      {run.methode === 'passkey' && (() => { const sha = run.sha256 || run.pakket?.sha256 || ''; const kort = sha ? `${sha.slice(0, 8)}…${sha.slice(-6)}` : '';
        const schakels: Array<[string, string, string, boolean]> = [
          ['browser', tr(lang, 'SHA-256 пораховано в браузері', 'SHA-256 in de browser berekend'), tr(lang, 'Відбиток архіву рахується на вашому пристрої до завантаження; проба міграцій прив’язана до нього.', 'De vingerafdruk van het archief wordt op uw apparaat berekend vóór het uploaden; de migratieproef is eraan gebonden.'), true],
          ['server', tr(lang, 'Сервер звірив після завантаження', 'Server vergeleek na de upload'), tr(lang, 'Сайт перерахував SHA-256 отриманого файлу; інший файл під тим самим описом неможливий.', 'De site berekende de SHA-256 van het ontvangen bestand opnieuw; een ander bestand onder dezelfde beschrijving kan niet.'), true],
          ['passkey', tr(lang, 'Схвалення passkey прив’язане до sha256', 'Passkey-goedkeuring gebonden aan de sha256'), tr(lang, 'Підпис passkey містить ідентифікатор пропозиції, версію, sha256 і одноразовий nonce; діє 5 хвилин.', 'De passkey-handtekening bevat voorstel-id, versie, sha256 en een eenmalige nonce; geldig 5 minuten.'), true],
          ['root', tr(lang, 'Root перевірив сам', 'Root controleerde zelf'), tr(lang, 'Root перерахував sha256 своєї копії й перевірив підпис passkey власним ключем — сайт нічого не може схвалити.', 'Root berekende de sha256 van zijn eigen kopie en controleerde de passkey met eigen sleutels — de site kan niets goedkeuren.'), run.stappen.some((s) => s.stap === 'echtheid' && s.staat === 'ok')],
          ['terugdraai', tr(lang, 'Відкат напоготові', 'Terugdraai staat klaar'), tr(lang, 'Резервна копія бази й попередній випуск лишаються; збій перевірки здоров’я → автоматичний відкат.', 'Back-up van de database en de vorige release blijven; mislukt de gezondheidscontrole → automatische terugdraai.'), true],
        ];
        return <details className='ut-keten' data-ut-keten><summary><Link2 aria-hidden='true' />{tr(lang, 'Ланцюг довіри', 'Vertrouwensketen')}{kort ? <code className='ut-mono'>{kort}</code> : null}<small>{tr(lang, 'кожна ланка перевіряє попередню — підмінити пакет непомітно неможливо', 'elke schakel controleert de vorige — een pakket ongemerkt verwisselen kan niet')}</small></summary>
          <ol>{schakels.map(([id, naam, uitleg, ok]) => <li key={id} data-ok={ok}>{id === 'passkey' ? <Fingerprint aria-hidden='true' /> : ok ? <CheckCircle2 aria-hidden='true' /> : <CircleDashed aria-hidden='true' />}<div><b>{naam}</b><p>{uitleg}</p></div></li>)}</ol>
        </details>; })()}
      {run.staat === 'klaar' && <div className='ut-uitkomst' data-staat='klaar'><CheckCircle2 aria-hidden='true' /><div><b>{tr(lang, 'Розгортання завершено', 'Uitrol voltooid')}{run.release ? ` · ${run.release}` : ''}</b><p>{lang === 'uk' ? run.uk : run.nl}</p></div></div>}

      {/* UITROL-001: de lijst met negen deelstappen staat niet meer hier — de conveyor hierboven toont dezelfde onderdelen met echte tijdstippen en duur (uitklappen per knoop). */}
      {run.methode === 'ssh' && <p className='ut-hint'>{tr(lang, 'Це встановлення виконали вручну через SSH — сайт бачить лише результат, а не кожен крок.', 'Deze installatie is handmatig via SSH gedaan — de site ziet alleen de uitkomst, niet elke stap.')}</p>}

      {/* De terminal hoort bij de installatiefase: eerder (ontvangen/controles) is er niets te zien en verschijnt hij pas als root met installeren begint. */}
      {run.methode !== 'ssh' && fasen.uitrol !== 'wacht' && regels.length > 0 && <Terminal lang={lang} regels={regels} live={run.staat === 'bezig'} bestandsnaam={`uitrol-${run.id}.log`} hoogte={320} />}
      {run.methode !== 'ssh' && fasen.uitrol === 'wacht' && run.staat === 'bezig' && <p className='ut-hint' data-ut-terminal-verborgen>{tr(lang, 'Термінал з’явиться тут, щойно сервер перейде до встановлення (після перевірок).', 'De terminal verschijnt hier zodra de server met installeren begint (na de controles).')}</p>}
    </>}

    {!nieuweFlow && !run && !goedgekeurd.length && !wachtendOpGoedkeuring && <p className='ut-leeg' data-ut-leeg>{tr(lang, 'Готово до наступного розгортання. Кроки й термінал з’являться самі, коли почнеться нове.', 'Klaar voor de volgende uitrol. Stappen en terminal verschijnen vanzelf zodra er een nieuwe begint.')}</p>}
  </section>;
}
