// @tech-asset — zone D (22.10.2026): beheercode van het technisch profiel, alleen via /assets/tech/ (shared/tech-bundels.ts).
// /zoek — HET INDEXVENSTER (zone D, 22.10.2026). Vraag van de eigenaar: «кнопка для примусового запуску повної або часткової
// індексації … у плаваючому вікні ("вікно у вікні"), яке можна перетягувати, згортати, розгортати та закривати, щоб не блокувати
// роботу з основною сторінкою». Daarom GEEN eigen venster: het gezamenlijke vensterbeheer van de site (src/platform/vensters.tsx —
// slepen aan de titelbalk, «Згорнути» naar het dok, «Розгорнути», sluiten, bewaarde positie/grootte, telefoon = schermvullend met
// het dok om terug te komen), met modaal={false}: de zoekpagina blijft bedienbaar terwijl de indexeerder loopt.
//
// Alleen in het technisch profiel (ZoekPagina toont de knop alleen bij techActief; de server weigert anders met 403).
// Gegevens uitsluitend van de server (src/zoek/zoek-index-api.ts): polling elke 1,5 s zolang een run loopt, elke 10 s daarna.
// Staten: kiezen (volledig / gedeeltelijk: bronnen + «alleen gewijzigd sinds»), loopt (bron → stap → %, verwerkt/wachtrij/fouten,
// duur, «Зупинити»), aangesloten (cron loopt: volgen), klaar/gestopt/tijd/limiet/fout (uitkomst + fouten met reden), journaal.
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, History, Loader2, Play, RefreshCw, Square } from 'lucide-react';
import { Venster } from '../platform/vensters';
import HulpVraag from '../hulp/HulpVraag';
import { ApiError } from '../platform/client';
import { BRON_NAAM, BRON_STAND_NAAM, type ZoekBron } from '../../shared/zoek-model';
import { fmtDatum } from './ZoekKaart';
import { ACTIEF, INDEX_BRONNEN, fmtDuur, indexGeschiedenis, indexStand, indexStarten, indexStoppen, isActief, runSom, runVoortgang, sindsVanDatum, type CronRij, type IndexStand, type Run, type RunModus } from './zoek-index-api';
import type { Lang } from './zoek-kern';

export const INDEX_VENSTER_ID = 'zoek-index';
/** Oekraïens meervoud: 1 крок, 2–4 кроки, 5+ кроків (11–14 → кроків). */
const ukMv = (n: number, een: string, enkele: string, veel: string) => { const r = n % 10, h = n % 100; return r === 1 && h !== 11 ? een : r >= 2 && r <= 4 && (h < 12 || h > 14) ? enkele : veel; };
const POLL_ACTIEF = 1500, POLL_RUST = 10_000;
const T = {
  uk: { titel: 'Індексація пошуку', intro: 'Примусовий запуск індексатора для вашого простору (особистий + технічний за правами). Працює у фоні на сервері; це вікно можна згорнути — індексація триватиме.', modus: 'Режим', volledig: 'Повна індексація', volledigUitleg: 'усі джерела з нуля: кожен об’єкт перечитується, зниклі — видаляються', gedeeltelijk: 'Часткова', gedeeltelijkUitleg: 'лише вибрані джерела — повністю, або лише змінене з дати',
    bronnen: 'Джерела', sinds: 'Лише змінені з', sindsHint: 'порожньо — вибрані джерела повністю; джерело, яке ще не сканувалося, читається повністю завжди', start: 'Запустити', stop: 'Зупинити', opnieuw: 'Запустити ще раз', bezig: 'Працює…', aangesloten: 'Працює фоновий запуск (cron) — приєднано: показуємо його хід, нічого не запускаємо вдруге.', cronLoopt: 'Фоновий запуск зараз триває; ваш запуск приєднається до нього.',
    stap: 'Зараз', scan: 'сканування', item: 'об’єкт', verwerkt: 'Оброблено', wachtrij: 'У черзі', fouten: 'Помилок', duur: 'Тривалість', limiet: (ms: number, n: number) => `Ліміт запуску: ${fmtDuur(ms, 'uk')} або ${n} елементів (ENV ZOEK_BEHEER_*); решту добере cron.`,
    uitkomst: 'Результат', status: { loopt: 'Виконується', aangesloten: 'Приєднано до фонового запуску', klaar: 'Завершено', gestopt: 'Зупинено', tijd: 'Зупинено за часом (решту добере cron)', limiet: 'Досягнуто ліміту елементів (решту добере cron)', fout: 'Помилка' },
    toegevoegd: 'нових', bijgewerkt: 'оновлених', verwijderd: 'видалених', overgeslagen: 'без змін', ocr: 'через OCR', stappen: 'кроків', items: 'об’єктів', stappenN: (n: number) => `${n} ${ukMv(n, 'крок', 'кроки', 'кроків')}`, itemsN: (n: number) => `${n} ${ukMv(n, 'об’єкт', 'об’єкти', 'об’єктів')}`, perBron: 'За джерелами', foutenLijst: 'Помилки з причинами', geenFouten: 'Без помилок.', definitief: 'остаточно', herhaal: 'повтор заплановано',
    cronStatus: { ok: 'успішно', running: 'виконується', skipped: 'пропущено (попередній ще працював)', error: 'помилка', onderbroken: 'перервано (перезапуск сервера)' } as Record<string, string>,
    cronNaam: { 'zoek-index': 'фоновий (cron)', 'zoek-index@server': 'фоновий у процесі сервера', 'zoek-index@handmatig': 'ручний' } as Record<string, string>,
    reden: 'причина',
    journaal: 'Журнал останніх запусків', eigen: 'ваші ручні запуски', cron: 'фонові запуски (cron)', geenJournaal: 'Ще не було запусків.', laden: 'Простори', prive: 'особистий', technisch: 'технічний', ruimteUitleg: 'Індексуються лише ваші власні дані; інших користувачів це не торкається.',
    geenGepland: 'Нічого не заплановано: вибрані джерела не входять до просторів цієї вкладки (див. «Простори» вище).', fout: 'Не вдалося. Дані не змінено.', geenRecht: 'Потрібен активний технічний профіль у цій вкладці.', vernieuwen: 'Оновити', geenBronnen: 'Виберіть хоча б одне джерело.', stand: 'Стан', ladenNu: 'Завантаження…' },
  nl: { titel: 'Zoekindex bijwerken', intro: 'Geforceerde run van de indexeerder voor uw ruimte (persoonlijk + technisch volgens rechten). Loopt op de server; dit venster mag dicht of in het dok — het indexeren gaat door.', modus: 'Modus', volledig: 'Volledig', volledigUitleg: 'alle bronnen van voren af aan: elk object wordt herlezen, verdwenen objecten verwijderd', gedeeltelijk: 'Gedeeltelijk', gedeeltelijkUitleg: 'alleen de gekozen bronnen — volledig, of alleen wat sinds een datum wijzigde',
    bronnen: 'Bronnen', sinds: 'Alleen gewijzigd sinds', sindsHint: 'leeg = de gekozen bronnen volledig; een bron die nog nooit gescand werd, wordt altijd volledig gelezen', start: 'Starten', stop: 'Stoppen', opnieuw: 'Opnieuw starten', bezig: 'Bezig…', aangesloten: 'Er loopt al een achtergrondrun (cron) — aangesloten: we volgen die, niets start twee keer.', cronLoopt: 'De achtergrondrun loopt nu; uw run sluit erbij aan.',
    stap: 'Nu', scan: 'scan', item: 'object', verwerkt: 'Verwerkt', wachtrij: 'In de rij', fouten: 'Fouten', duur: 'Duur', limiet: (ms: number, n: number) => `Grens per run: ${fmtDuur(ms, 'nl')} of ${n} items (ENV ZOEK_BEHEER_*); de rest pakt de cron.`,
    uitkomst: 'Uitkomst', status: { loopt: 'Loopt', aangesloten: 'Aangesloten bij de achtergrondrun', klaar: 'Klaar', gestopt: 'Gestopt', tijd: 'Gestopt op tijd (de cron pakt de rest)', limiet: 'Itemgrens bereikt (de cron pakt de rest)', fout: 'Fout' },
    toegevoegd: 'nieuw', bijgewerkt: 'bijgewerkt', verwijderd: 'verwijderd', overgeslagen: 'ongewijzigd', ocr: 'via OCR', stappen: 'stappen', items: 'objecten', stappenN: (n: number) => `${n} ${n === 1 ? 'stap' : 'stappen'}`, itemsN: (n: number) => `${n} ${n === 1 ? 'object' : 'objecten'}`, perBron: 'Per bron', foutenLijst: 'Fouten met reden', geenFouten: 'Geen fouten.', definitief: 'definitief', herhaal: 'nieuwe poging gepland',
    cronStatus: { ok: 'gelukt', running: 'loopt', skipped: 'overgeslagen (vorige liep nog)', error: 'fout', onderbroken: 'onderbroken (server herstart)' } as Record<string, string>,
    cronNaam: { 'zoek-index': 'achtergrond (cron)', 'zoek-index@server': 'achtergrond in het serverproces', 'zoek-index@handmatig': 'handmatig' } as Record<string, string>,
    reden: 'reden',
    journaal: 'Journaal van de laatste runs', eigen: 'uw handmatige runs', cron: 'achtergrondruns (cron)', geenJournaal: 'Nog geen runs.', laden: 'Ruimtes', prive: 'persoonlijk', technisch: 'technisch', ruimteUitleg: 'Alleen uw eigen gegevens worden geïndexeerd; andere gebruikers blijven onaangeroerd.',
    geenGepland: 'Niets gepland: de gekozen bronnen horen niet bij de ruimtes van dit tabblad (zie «Ruimtes» hierboven).', fout: 'Mislukt. Er is niets gewijzigd.', geenRecht: 'Hiervoor is een actief technisch profiel in dit tabblad nodig.', vernieuwen: 'Vernieuwen', geenBronnen: 'Kies minstens één bron.', stand: 'Stand', ladenNu: 'Laden…' },
};

export type IndexVensterProps = { lang: Lang; onSluit: () => void; /** Na een afgeronde run: de pagina laadt de stand van de bronnen opnieuw. */ onKlaar?: () => void };

export default function ZoekIndexVenster({ lang, onSluit, onKlaar }: IndexVensterProps) {
  const t = T[lang]; const uid = useId();
  const [stand, setStand] = useState<IndexStand | null>(null);
  const [fout, setFout] = useState<string>('');
  const [modus, setModus] = useState<RunModus>('volledig');
  const [bronnen, setBronnen] = useState<ZoekBron[]>([...INDEX_BRONNEN]);
  const [sindsDatum, setSindsDatum] = useState('');
  const [bezig, setBezig] = useState(false);
  const [journaal, setJournaal] = useState<{ eigen: Run[]; runs: CronRij[] } | null>(null);
  const [tik, setTik] = useState(0);   // levende duur
  const vorigeStatus = useRef<string>('');
  const run = stand?.run || null; const actief = isActief(run);

  const laad = useCallback(async () => {
    try { const s = await indexStand(); setStand(s); setFout(''); }
    catch (e) { setFout(e instanceof ApiError && (e.statusCode === 403 || e.statusCode === 401) ? 'geenRecht' : 'fout'); }
  }, []);
  const laadJournaal = useCallback(() => { indexGeschiedenis(25).then(setJournaal).catch(() => undefined); }, []);
  useEffect(() => { void laad(); laadJournaal(); }, [laad, laadJournaal]);
  // Polling: snel zolang de run loopt, rustig daarna. Een run die afrondt → stand van de bronnen op de pagina vernieuwen + journaal.
  useEffect(() => { const id = window.setInterval(() => { void laad(); }, actief ? POLL_ACTIEF : POLL_RUST); return () => window.clearInterval(id); }, [actief, laad]);
  useEffect(() => { if (!actief) return; const id = window.setInterval(() => setTik((n) => n + 1), 1000); return () => window.clearInterval(id); }, [actief]);
  useEffect(() => {
    const nu = run ? `${run.id}:${run.status}` : '';
    if (vorigeStatus.current && vorigeStatus.current !== nu && run && !isActief(run)) { onKlaar?.(); laadJournaal(); }
    vorigeStatus.current = nu;
  }, [run?.id, run?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const start = async () => {
    if (modus === 'gedeeltelijk' && !bronnen.length) { setFout('geenBronnen'); return; }
    setBezig(true); setFout('');
    try {
      const r = await indexStarten({ modus, ...(modus === 'gedeeltelijk' ? { bronnen, sinds: sindsVanDatum(sindsDatum) } : {}) });
      if (!r.ok) { setFout(r.code); return; }
      setStand((s) => (s ? { ...s, run: r.run } : s)); void laad();
    } catch (e) { setFout(e instanceof ApiError && (e.statusCode === 403 || e.statusCode === 401) ? 'geenRecht' : 'fout'); }
    finally { setBezig(false); }
  };
  const stop = async () => { setBezig(true); try { const r = await indexStoppen(); setStand((s) => (s && r.run ? { ...s, run: r.run } : s)); void laad(); } catch { setFout('fout'); } finally { setBezig(false); } };
  const toggle = (b: ZoekBron) => setBronnen((l) => (l.includes(b) ? l.filter((x) => x !== b) : [...l, b]));
  // Stand per lade: technisch eerst (het venster bestaat alleen in het technisch profiel), anders persoonlijk.
  const bronStand = (b: ZoekBron, ruimte?: 'prive' | 'technisch') => stand?.bronnen.find((s) => s.bron === b && (ruimte ? s.ruimte === ruimte : s.ruimte === 'technisch')) || (ruimte ? undefined : stand?.bronnen.find((s) => s.bron === b));
  const naam = (b: ZoekBron) => BRON_NAAM[b][lang];
  const ruimteNaam = (r: 'prive' | 'technisch') => (r === 'prive' ? t.prive : t.technisch);
  const pct = runVoortgang(run); const som = run ? runSom(run) : null;
  void tik;

  const statusKlasse = (s: Run['status']) => (s === 'klaar' ? 'pil-ok' : s === 'fout' || s === 'gestopt' ? 'pil-fout' : s === 'loopt' || s === 'aangesloten' ? 'pil-info' : 'pil-warn');
  const foutTekst = fout === 'geenRecht' ? t.geenRecht : fout === 'fout' ? t.fout : fout === 'geenBronnen' ? t.geenBronnen : fout ? `${t.fout} ${fout}` : '';

  return (
    <Venster id={INDEX_VENSTER_ID} titel={actief ? `${t.titel} — ${pct}%` : t.titel} modaal={false} breedte={520} onSluit={onSluit} lang={lang} className='zk-iv' describedBy={`${uid}-intro`}
      kop={<span className='zk-iv-kop'><RefreshCw aria-hidden='true' className={actief ? 'zk-spin' : undefined} /><strong>{t.titel}</strong>{run && <span className={`pil ${statusKlasse(run.status)} zk-iv-kop-pil`}>{t.status[run.status]}</span>}</span>}>
      <div className='zk-iv-inhoud' data-mq-laag-open='1' data-zoek-index-venster={run ? run.status : stand ? 'kiezen' : 'laden'} data-zoek-index-run={run?.id || ''}>
        <p id={`${uid}-intro`} className='zk-iv-intro'>{t.intro}</p>
        {stand && stand.laden.length > 0 && <p className='zk-iv-laden'><span className='zk-iv-label'>{t.laden}:</span> {stand.laden.map((l) => <span key={l.ruimte} className='pil pil-stil'>{ruimteNaam(l.ruimte)} · {l.bronnen.length}</span>)} <small>{t.ruimteUitleg}</small></p>}
        {foutTekst && <p className='melding melding-warn' role='alert'><AlertTriangle aria-hidden='true' /><span>{foutTekst}</span></p>}
        {!stand && !fout && <p className='zk-iv-laadt'><Loader2 className='zk-spin' aria-hidden='true' /> {t.ladenNu}</p>}

        {/* kiezen: modus, bronnen, sinds, starten */}
        {stand && !actief && (
          <form className='zk-iv-form' onSubmit={(e) => { e.preventDefault(); void start(); }} aria-label={t.titel}>
            <fieldset className='zk-iv-groep'>
              <legend>{t.modus} <HulpVraag k='zoek.index.modus' lang={lang} /></legend>
              <label className='zk-vink'><input type='radio' name={`${uid}-m`} data-hulp='zoek.index.modus' checked={modus === 'volledig'} onChange={() => setModus('volledig')} /><span className='zk-vink-tekst'>{t.volledig}<small className='zk-vink-hint'> — {t.volledigUitleg}</small></span></label>
              <label className='zk-vink'><input type='radio' name={`${uid}-m`} data-hulp='zoek.index.modus' checked={modus === 'gedeeltelijk'} onChange={() => setModus('gedeeltelijk')} /><span className='zk-vink-tekst'>{t.gedeeltelijk}<small className='zk-vink-hint'> — {t.gedeeltelijkUitleg}</small></span></label>
            </fieldset>
            {modus === 'gedeeltelijk' && (
              <>
                <fieldset className='zk-iv-groep'>
                  <legend>{t.bronnen} <HulpVraag k='zoek.index.bron' lang={lang} /></legend>
                  <div className='zk-iv-bronnen'>
                    {INDEX_BRONNEN.map((b) => { const s = bronStand(b); return (
                      <label key={b} className='zk-vink'><input type='checkbox' data-hulp='zoek.index.bron' checked={bronnen.includes(b)} onChange={() => toggle(b)} /><span className='zk-vink-tekst'>{naam(b)}{s && <small className='zk-vink-hint'> · {BRON_STAND_NAAM[s.stand][lang]}{s.stand === 'indexeert' ? ` ${s.voortgang}%` : ''}{s.aantal ? ` · ${s.aantal}` : ''}</small>}</span></label>); })}
                  </div>
                </fieldset>
                <label className='zk-iv-sinds'><span>{t.sinds} <HulpVraag k='zoek.index.sinds' lang={lang} /></span><input type='date' data-hulp='zoek.index.sinds' value={sindsDatum} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setSindsDatum(e.target.value)} /><small>{t.sindsHint}</small></label>
              </>)}
            {stand.cron.loopt && <p className='melding melding-info'><Loader2 className='zk-spin' aria-hidden='true' /><span>{t.cronLoopt}</span></p>}
            <div className='zk-iv-knoppen'>
              <button type='submit' className='knop knop-primair' disabled={bezig} data-zoek-index-start='1'>{bezig ? <Loader2 className='zk-spin' aria-hidden='true' /> : <Play aria-hidden='true' />}{run && !actief ? t.opnieuw : t.start}</button>
              <button type='button' className='knop knop-stil is-klein' onClick={() => { void laad(); laadJournaal(); }}><RefreshCw aria-hidden='true' />{t.vernieuwen}</button>
            </div>
            <p className='zk-iv-limiet'>{t.limiet(stand.limieten.runMs, stand.limieten.items)}</p>
          </form>)}

        {/* loopt / aangesloten: levende voortgang */}
        {run && actief && (
          <section className='zk-iv-voortgang' aria-live='polite' aria-labelledby={`${uid}-v`}>
            <h3 id={`${uid}-v`} className='zk-sr'>{t.status[run.status]}</h3>
            {run.status === 'aangesloten' && <p className='melding melding-info'><Loader2 className='zk-spin' aria-hidden='true' /><span>{t.aangesloten}</span></p>}
            <div className='zk-iv-balk'><progress className='zk-voortgang' max={100} value={pct} aria-label={`${t.verwerkt}: ${pct}%`} /><span className='zk-iv-pct'>{pct}%</span></div>
            <dl className='zk-iv-cijfers'>
              <div><dt>{t.verwerkt}</dt><dd>{run.verwerkt}</dd></div>
              <div><dt>{t.wachtrij}</dt><dd>{run.wachtend + run.bezig}</dd></div>
              <div><dt>{t.fouten}</dt><dd>{som ? som.fouten + som.opnieuw : 0}</dd></div>
              <div><dt>{t.duur}</dt><dd>{fmtDuur(Date.now() - run.begin, lang)}</dd></div>
            </dl>
            {run.stap && <p className='zk-iv-stap'><span className='zk-iv-label'>{t.stap}:</span> <b>{naam(run.stap.bron)}</b> <span className='pil pil-stil'>{ruimteNaam(run.stap.ruimte)}</span> → {run.stap.actie === 'volledig' ? t.scan : `${t.item}${run.stap.id ? ` ${run.stap.id}` : ''}`}{(() => { const s = bronStand(run.stap.bron, run.stap.ruimte); return s && s.stand === 'indexeert' ? ` → ${s.voortgang}%` : ''; })()}</p>}
            <BronTabel lang={lang} run={run} stand={stand} />
            <div className='zk-iv-knoppen'><button type='button' className='knop knop-secundair' onClick={() => void stop()} disabled={bezig} data-zoek-index-stop='1'><Square aria-hidden='true' />{t.stop}</button></div>
          </section>)}

        {/* afgerond: uitkomst */}
        {run && !actief && som && (
          <section className='zk-iv-uitkomst kaart-zacht' aria-labelledby={`${uid}-u`} data-zoek-index-uitkomst={run.status}>
            <h3 id={`${uid}-u`}>{run.status === 'klaar' ? <CheckCircle2 aria-hidden='true' className='zk-iv-ok' /> : <AlertTriangle aria-hidden='true' className='zk-iv-warn' />} {t.uitkomst}: {t.status[run.status]}{run.fout ? ` (${run.fout})` : ''}</h3>
            {run.gepland === 0 && run.verwerkt === 0 && <p className='melding melding-warn'><AlertTriangle aria-hidden='true' /><span>{t.geenGepland}</span></p>}
            <p className='zk-iv-som'>{t.verwerkt}: <b>{run.verwerkt}</b> ({t.stappenN(som.stappen)}, {t.itemsN(som.items)}) · {t.duur}: {fmtDuur(run.duurMs, lang)} · {fmtDatum(run.begin, lang)}</p>
            <ul className='zk-iv-tellers'>
              <li><b>{som.toegevoegd}</b> {t.toegevoegd}</li><li><b>{som.bijgewerkt}</b> {t.bijgewerkt}</li><li><b>{som.verwijderd}</b> {t.verwijderd}</li><li><b>{som.overgeslagen}</b> {t.overgeslagen}</li><li><b>{som.ocr}</b> {t.ocr}</li><li className={som.fouten + som.opnieuw ? 'is-fout' : ''}><b>{som.fouten + som.opnieuw}</b> {t.fouten.toLowerCase()}</li>
            </ul>
            <BronTabel lang={lang} run={run} stand={stand} />
            <details className='zk-iv-fouten' open={run.fouten.length > 0}>
              <summary>{t.foutenLijst} ({run.fouten.length})</summary>
              {run.fouten.length ? <ul>{run.fouten.map((f, i) => <li key={i}><span className='pil pil-stil'>{naam(f.bron)}</span> <code>{f.code}</code>{f.id ? <small> · {f.id}</small> : null} <small>· {f.definitief ? t.definitief : t.herhaal}</small></li>)}</ul> : <p>{t.geenFouten}</p>}
            </details>
          </section>)}

        {/* journaal */}
        <details className='zk-iv-journaal'>
          <summary><History aria-hidden='true' /> {t.journaal}</summary>
          {!journaal ? <p className='zk-iv-laadt'>{t.ladenNu}</p> : !journaal.eigen.length && !journaal.runs.length ? <p>{t.geenJournaal}</p> : (
            <>
              {journaal.eigen.length > 0 && <><h4>{t.eigen}</h4><ul className='zk-iv-lijst'>{journaal.eigen.map((r) => { const s = runSom(r); return <li key={r.id}><span className={`pil ${statusKlasse(r.status)}`}>{t.status[r.status]}</span> {fmtDatum(r.begin, lang)} · {r.modus === 'volledig' ? t.volledig : t.gedeeltelijk} · {r.bronnen.map(naam).join(', ')} · {r.verwerkt} · +{s.toegevoegd} ~{s.bijgewerkt} −{s.verwijderd} · {fmtDuur(r.duurMs, lang)}</li>; })}</ul></>}
              {journaal.runs.length > 0 && <><h4>{t.cron}</h4><ul className='zk-iv-lijst'>{journaal.runs.map((r) => { const v = r.velden; const reden = /reden=(\S+)/.exec(r.detail)?.[1] || (r.status === 'error' ? r.detail.slice(0, 120) : ''); return (
                <li key={r.id} data-zoek-index-cron={r.status}><span className={`pil ${r.status === 'ok' ? 'pil-ok' : r.status === 'running' ? 'pil-info' : r.status === 'skipped' || r.status === 'onderbroken' ? 'pil-stil' : 'pil-fout'}`}>{t.cronStatus[r.status] || r.status}</span> {fmtDatum(r.begin, lang)} · <span title={r.naam}>{t.cronNaam[r.naam] || r.naam}</span>{r.eind ? ` · ${fmtDuur(r.eind - r.begin, lang)}` : ''}
                  {Object.keys(v).length ? ` · ${v.modus === 'gedeeltelijk' ? t.gedeeltelijk : v.modus === 'volledig' ? t.volledig : ''} · ${t.verwerkt.toLowerCase()} ${v.verwerkt || 0} · +${v.toegevoegd || 0} ~${v.bijgewerkt || 0} −${v.verwijderd || 0}${Number(v.fouten) ? ` · ${t.fouten.toLowerCase()} ${v.fouten}` : ''}` : null}
                  {reden ? <small> · {t.reden}: <code>{reden}</code></small> : null}</li>); })}</ul></>}
            </>)}
        </details>
      </div>
    </Venster>);
}

const UI_DELEN: readonly ZoekBron[] = ['ui', 'pagina', 'instelling', 'hulp'];
/** Per bron (en ruimte): stand van de kern + wat deze run deed. */
function BronTabel({ lang, run, stand }: { lang: Lang; run: Run; stand: IndexStand | null }) {
  const t = T[lang];
  const rijen = run.laden.flatMap((l) => l.bronnen.filter((b) => run.bronnen.includes(b) || (b === 'mail' && run.bronnen.includes('bijlage'))).map((b) => ({ ruimte: l.ruimte, bron: b })));
  if (!rijen.length) return null;
  return (
    <div className='zk-iv-tabel-rol' tabIndex={0} role='region' aria-label={t.perBron}><table className='zk-iv-tabel'><caption className='zk-sr'>{t.perBron}</caption>
      <thead><tr><th scope='col'>{t.bronnen}</th><th scope='col'>{t.stand}</th><th scope='col'>{t.verwerkt}</th><th scope='col'>+ / ~ / −</th><th scope='col'>{t.fouten}</th></tr></thead>
      <tbody>{rijen.map(({ ruimte, bron }) => {
        // «Інтерфейс» (ui) dekt ook pagina/instelling/hulp: hun tellers horen in dezelfde rij (anders klopt de som niet met de uitkomst).
        const delen: readonly ZoekBron[] = bron === 'ui' ? UI_DELEN : [bron];
        const ts = run.tellingen.filter((x) => x.ruimte === ruimte && delen.includes(x.bron)); const tel = ts.length ? runSom({ tellingen: ts }) : null;
        const s = stand?.bronnen.find((x) => x.bron === bron && x.ruimte === ruimte); const w = stand?.wachtrij[`${ruimte}:${bron}`];
        return (<tr key={`${ruimte}:${bron}`} data-zoek-index-bron={bron}>
          <td>{BRON_NAAM[bron][lang]} <small className='zk-iv-ruimte'>{ruimte === 'prive' ? t.prive : t.technisch}</small></td>
          <td>{s ? <span className={`pil ${s.stand === 'klaar' ? 'pil-ok' : s.stand === 'fout' ? 'pil-fout' : s.stand === 'niet_gekoppeld' ? 'pil-stil' : 'pil-warn'}`}>{BRON_STAND_NAAM[s.stand][lang]}{s.stand === 'indexeert' ? ` ${s.voortgang}%` : ''}</span> : '—'}{w && w.wachtend + w.bezig > 0 ? <small> · {t.wachtrij.toLowerCase()} {w.wachtend + w.bezig}</small> : null}</td>
          <td>{tel ? `${tel.stappen + tel.items}` : '0'}</td>
          <td>{tel ? `${tel.toegevoegd} / ${tel.bijgewerkt} / ${tel.verwijderd}${tel.ocr ? ` · OCR ${tel.ocr}` : ''}` : '—'}</td>
          <td>{tel && tel.fouten + tel.opnieuw + tel.uitgesteld ? <span className='pil pil-fout'>{tel.fouten + tel.opnieuw + tel.uitgesteld}</span> : '0'}</td>
        </tr>); })}</tbody>
    </table></div>);
}

export { ACTIEF as INDEX_ACTIEVE_STATUSSEN };
