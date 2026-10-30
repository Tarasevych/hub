// Details van één run: uitkomst + reden, stappen met tijden, pakketgegevens, gebeurtenissen en het volledige logboek (opnieuw te lezen, kopieerbaar, downloadbaar).
// De logregels komen uit de database; bij een lopende run wordt elke ~2 s bijgewerkt.
import { useEffect, useRef, useState } from 'react';
import { Check, ClipboardCopy, XCircle, CheckCircle2, Loader2, CircleDashed } from 'lucide-react';
import { api } from '../platform/client';
import Terminal from './Terminal';
import { codeTekst } from './fouten';
import Oorzaak from './Oorzaak';
import PakketActies from './PakketActies';
import './pakket.css';
import CommitTekst from './CommitTekst';
import { commitWeergave } from '../../shared/bron-commit';
import { DEELSTAPPEN, datumLang, deelStanden, duur, methodeTekst, mb, runDuur, staatTekst, subTijden, tijdKort, tr, type Gebeurtenis, type Lang, type Regel, type Run } from './types';

type Props = { lang: Lang; context: Record<string, unknown>; runId: string; hoogte?: number };

function Kopieerbaar({ lang, tekst }: { lang: Lang; tekst: string }) {
  const [ok, setOk] = useState(false);
  return <span className='ut-kopieerbaar'><code>{tekst}</code>
    <button type='button' className='ut-icoon' aria-label={tr(lang, 'Копіювати', 'Kopiëren')} onClick={() => { void navigator.clipboard?.writeText(tekst).then(() => { setOk(true); window.setTimeout(() => setOk(false), 1500); }).catch(() => undefined); }}>{ok ? <Check aria-hidden='true' /> : <ClipboardCopy aria-hidden='true' />}</button></span>;
}

export default function RunDetail({ lang, context, runId, hoogte }: Props) {
  const [run, setRun] = useState<Run | null>(null);
  const [events, setEvents] = useState<Gebeurtenis[]>([]);
  const [regels, setRegels] = useState<Regel[]>([]);
  const [fout, setFout] = useState('');
  const cursor = useRef(-1);
  const huidig = useRef('');

  useEffect(() => {
    huidig.current = runId; cursor.current = -1; setRun(null); setRegels([]); setEvents([]); setFout('');
    if (!runId) return;
    let weg = false; let t = 0;
    const ronde = async () => {
      if (weg) return;
      try {
        const d = (await api.post('/api/owner/uitrol/run', { ...context, id: runId })).data as { run: Run; gebeurtenissen: Gebeurtenis[] };
        if (weg || huidig.current !== runId) return;
        setRun(d.run); setEvents(d.gebeurtenissen);
        // alle ontbrekende regels ophalen (max. 2000 per aanroep) tot we bij zijn
        for (let i = 0; i < 40; i++) {
          const r = (await api.post('/api/owner/uitrol/run/regels', { ...context, id: runId, na: cursor.current })).data as { regels: Regel[] };
          if (weg || huidig.current !== runId) return;
          if (!r.regels.length) break;
          cursor.current = r.regels[r.regels.length - 1].nr;
          setRegels((oud) => [...oud, ...r.regels]);
          if (r.regels.length < 2000) break;
        }
        setFout('');
        if (!weg && d.run.staat === 'bezig') t = window.setTimeout(ronde, 2000);
      } catch { if (!weg) { setFout(tr(lang, 'Не вдалося завантажити запуск — повторюю…', 'De run kon niet worden geladen — opnieuw proberen…')); t = window.setTimeout(ronde, 3000); } }
    };
    void ronde();
    return () => { weg = true; window.clearTimeout(t); };
  }, [runId, context, lang]);

  if (!runId) return <p className='ut-leeg'>{tr(lang, 'Виберіть розгортання зі списку.', 'Kies een uitrol uit de lijst.')}</p>;
  if (!run) return <p className='ut-leeg' role='status'>{fout || tr(lang, 'Завантаження…', 'Laden…')}</p>;
  const delen = deelStanden(run);
  const subT = subTijden(regels, run.staat !== 'bezig' ? run.geeindigd || run.bijgewerkt : undefined);
  const reden = lang === 'uk' ? run.uk : run.nl;
  const mislukt = run.staat === 'mislukt' || run.staat === 'geweigerd' || run.staat === 'afgebroken';
  const rij = (k: string, v: React.ReactNode) => <><dt>{k}</dt><dd>{v}</dd></>;

  return <div className='ut-detail' data-ut-detail={run.id}>
    <div className='ut-uitkomst' data-staat={run.staat}>
      {run.staat === 'klaar' ? <CheckCircle2 aria-hidden='true' /> : run.staat === 'bezig' ? <Loader2 aria-hidden='true' className='ut-draai' /> : <XCircle aria-hidden='true' />}
      <div><b>{staatTekst(lang, run.staat)}{mislukt && run.code ? ` · ${codeTekst(lang, run.code)}` : ''}</b><p>{reden || (run.staat === 'bezig' ? tr(lang, 'Установлення триває…', 'Installatie loopt…') : '—')}</p>
        <Oorzaak lang={lang} run={run} /></div>
    </div>

    <div className='ut-detail-raster'>
      <section>
        <h3>{tr(lang, 'Розгортання', 'Uitrol')}</h3>
        <dl className='ut-dl'>
          {rij(tr(lang, 'Версія', 'Versie'), <b className='ut-mono'>{run.versie || '—'}</b>)}
          {run.release && rij(tr(lang, 'Реліз на сервері', 'Release op de server'), <code>{run.release}</code>)}
          {rij(tr(lang, 'Метод', 'Methode'), methodeTekst(lang, run.methode))}
          {rij(tr(lang, 'Початок', 'Start'), datumLang(lang, run.gestart))}
          {rij(tr(lang, 'Кінець', 'Einde'), run.staat === 'bezig' ? tr(lang, 'ще триває', 'loopt nog') : datumLang(lang, run.geeindigd || run.bijgewerkt))}
          {rij(tr(lang, 'Тривалість', 'Duur'), runDuur(run))}
          {run.wie && rij(tr(lang, 'Хто запустив', 'Gestart door'), run.wie)}
          {run.adres && rij(tr(lang, 'Адреса', 'Adres'), run.adres)}
          {rij(tr(lang, 'Ідентифікатор', 'Run-id'), <Kopieerbaar lang={lang} tekst={run.id} />)}
        </dl>
      </section>
      <section>
        <h3>{tr(lang, 'Пакет', 'Pakket')}</h3>
        <dl className='ut-dl'>
          {rij(tr(lang, 'Підготував', 'Voorbereid door'), run.voorbereider || '—')}
          {rij(tr(lang, 'Схвалив', 'Goedgekeurd door'), run.goedgekeurdDoor === 'ssh-root' || (run.methode === 'ssh' && !run.goedgekeurdDoor)
            ? <span data-schvalyv='ssh-root'>{tr(lang, 'SSH, root, без passkey', 'SSH, root, zonder passkey')}<br /><small className='ut-hint'>{tr(lang, 'Пакет встановлено командою на сервері через SSH. Схвалення passkey на сайті для такого способу не буває: доступ до SSH і є схваленням.', 'Het pakket is via SSH met een opdracht op de server geïnstalleerd. Bij deze manier is er geen passkey-goedkeuring op de site: de SSH-toegang zelf is de goedkeuring.')}</small></span>
            : run.goedgekeurdDoor || '—')}
          {rij(tr(lang, 'Коміт', 'Commit'), commitWeergave(lang, run.commit).waarschuwing ? <CommitTekst lang={lang} commit={run.commit} /> : <Kopieerbaar lang={lang} tekst={commitWeergave(lang, run.commit).kort} />)}
          {rij(tr(lang, 'Розмір', 'Grootte'), run.bytes || run.pakket?.grootte ? mb(run.bytes || run.pakket?.grootte || 0) : '—')}
          {/* 29.10.2026: twee sha256 naast elkaar — van het GELEVERDE archief en van het op de server BEWAARDE bestand. Vroeger pakte de
              SSH-installer het archief soms opnieuw in (pipefail-fout), dan verschilden ze zonder dat de pagina het zei. */}
          {(() => {
            const opgeslagen = run.pakket?.sha256 || run.sha256 || '';
            const geleverd = run.pakket?.geleverdSha256 || (run.methode !== 'ssh' ? run.sha256 : '') || '';
            const herkomst = run.pakket?.herkomst || '';
            const anders = !!geleverd && !!opgeslagen && geleverd !== opgeslagen;
            return <>
              {rij(tr(lang, 'sha256 доставленого архіву', 'sha256 geleverd archief'), geleverd ? <Kopieerbaar lang={lang} tekst={geleverd} />
                : <span className='ut-hint' data-sha-geleverd='onbekend'>{herkomst === 'opnieuw-ingepakt'
                  ? tr(lang, 'Невідомо: доставлений архів не лежав поруч із текою, сервер запакував теку заново.', 'Onbekend: het geleverde archief lag niet naast de map, de server pakte de map opnieuw in.')
                  : tr(lang, 'Не записано (встановлення до 29.10.2026). Звірте з файлом .sha256, який ви отримали разом з архівом.', 'Niet vastgelegd (installatie van vóór 29.10.2026). Vergelijk met het .sha256-bestand dat bij het archief hoorde.')}</span>)}
              {rij(tr(lang, 'sha256 збереженого файлу', 'sha256 bewaard bestand'), opgeslagen ? <Kopieerbaar lang={lang} tekst={opgeslagen} /> : '—')}
              {anders || herkomst === 'opnieuw-ingepakt' ? rij(tr(lang, 'Увага', 'Let op'), <span className='ut-hint ut-waarschuwing' data-sha-verschil='1'>{tr(lang,
                'Збережений файл — не той архів, який ви доставили: сервер запакував теку заново, тому sha256 і розмір інші. Вміст коду той самий, але для перевірки використовуйте sha256 доставленого архіву.',
                'Het bewaarde bestand is niet het archief dat u leverde: de server pakte de map opnieuw in, dus sha256 en grootte verschillen. De code is dezelfde, maar controleer met de sha256 van het geleverde archief.')}</span>) : null}
            </>;
          })()}
        </dl>
        {run.wijzigingen && <details open={run.wijzigingen.length < 600}><summary>{tr(lang, 'Що змінено', 'Wat er verandert')}</summary><pre className='ut-pre'>{run.wijzigingen}</pre></details>}
      </section>
    </div>

    {run.staat !== 'bezig' && <PakketActies lang={lang} context={context} run={run} />}

    {run.methode !== 'ssh' && <section>
      <h3>{tr(lang, 'Кроки', 'Stappen')}</h3>
      <ul className='ut-delen ut-delen-compact'>
        {DEELSTAPPEN.map((d) => { const st = delen[d.id]; const info = !d.sub ? run.stappen.find((s) => s.stap === d.stap) : undefined;
          return <li key={d.id} data-stand={st}>
            {st === 'ok' ? <CheckCircle2 aria-hidden='true' /> : st === 'fout' ? <XCircle aria-hidden='true' /> : st === 'bezig' ? <Loader2 aria-hidden='true' className='ut-draai' /> : <CircleDashed aria-hidden='true' />}
            <span className='ut-deel-tekst'><b>{tr(lang, d.uk, d.nl)}</b>{info && (lang === 'uk' ? info.uk : info.nl) && <small>{lang === 'uk' ? info.uk : info.nl}</small>}</span>
            <span className='ut-deel-stand'>{info?.tijd ? tijdKort(lang, info.tijd) : d.sub && subT[d.sub] && st !== 'wacht' ? `${tijdKort(lang, subT[d.sub].tijd)}${subT[d.sub].duurMs !== null && st === 'ok' ? ` (${duur(subT[d.sub].duurMs as number)})` : ''}` : ''}</span>
          </li>; })}
      </ul>
    </section>}

    {events.length > 0 && <section>
      <h3>{tr(lang, 'Події', 'Gebeurtenissen')}</h3>
      <ol className='ut-events'>{events.map((e) => <li key={e.id} data-niveau={e.niveau}><time>{tijdKort(lang, e.tijd)}</time><span><b title={e.code}>{codeTekst(lang, e.code)}</b> {lang === 'uk' ? e.uk : e.nl}</span></li>)}</ol>
    </section>}

    <section>
      <h3>{tr(lang, 'Повний журнал', 'Volledig logboek')} <small>({run.logRegels || regels.length} {tr(lang, 'рядків', 'regels')})</small></h3>
      {run.methode === 'ssh'
        ? <p className='ut-hint'>{tr(lang, 'Для встановлень через SSH повний журнал лежить на сервері: /var/lib/mijn-ruimte-uitrol-status/installeer.log.', 'Voor installaties via SSH staat het volledige logboek op de server: /var/lib/mijn-ruimte-uitrol-status/installeer.log.')}</p>
        : <Terminal lang={lang} regels={regels} live={run.staat === 'bezig'} bestandsnaam={`uitrol-${run.id}.log`} hoogte={hoogte ?? 420}
            leeg={tr(lang, 'Для цього запуску журнал не збережено (старий запис або сервер ще не опублікував його).', 'Voor deze run is geen logboek bewaard (oud record, of de server publiceerde het nog niet).')} />}
    </section>
  </div>;
}
