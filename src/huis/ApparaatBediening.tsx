// Bediening van één apparaat per mogelijkheid, met de ECHTE levensloop van een opdracht: «verzonden…» tot de bron de gewenste
// toestand teruggeeft (voltooid), of geweigerd/verlopen/offline. Nooit optimistisch «aan» zonder ACK: de knop toont «sending»
// en valt terug op de waargenomen toestand als het misgaat. Schuifregelaars met debounce; kritieke mogelijkheden alleen na een
// uitdrukkelijke bevestiging (step-up van de server) en nooit via deze pagina voor de AI.
import { useEffect, useRef, useState } from 'react';
import { AlertCircle, ArrowDownToLine, ArrowUpToLine, Check, Lock, LockOpen, Minus, Plus, Square, Unplug } from 'lucide-react';
import { MOGELIJKHEID_LABEL, OPDRACHT_EIND, OPDRACHT_LABEL, VERSHEID_LABEL, versheid, type Apparaat, type Mogelijkheid, type MogelijkheidSoort, type Opdracht } from '../../shared/huis-model';
import { HuisFout, huisClient, idem } from './huis-client';
import { foutTekst, toestandVan, tr, type Lang } from './tekst';

type Props = { lang: Lang; woningId: string; apparaat: Apparaat; magSchrijven: boolean; compact?: boolean; onOpdracht?: (o: Opdracht) => void; onVernieuw?: () => void };
type Lopend = { mogelijkheid: MogelijkheidSoort; opdracht: Opdracht | null; fout: string };

export default function ApparaatBediening({ lang, woningId, apparaat: a, magSchrijven, compact, onOpdracht, onVernieuw }: Props) {
  const [lopend, setLopend] = useState<Lopend | null>(null);
  const [bevestig, setBevestig] = useState<{ mogelijkheid: MogelijkheidSoort; waarde: Record<string, unknown> } | null>(null);
  const timer = useRef<number | null>(null);
  const poller = useRef<number | null>(null);
  useEffect(() => () => { if (poller.current) clearInterval(poller.current); if (timer.current) clearTimeout(timer.current); }, []);

  const stuur = async (mogelijkheid: MogelijkheidSoort, waarde: Record<string, unknown>, kritiekBevestigd = false) => {
    setLopend({ mogelijkheid, opdracht: null, fout: '' });
    try {
      const o = await huisClient.opdracht(woningId, { apparaatId: a.id, mogelijkheid, waarde, idempotentie: idem(), kritiekBevestigd });
      setLopend({ mogelijkheid, opdracht: o, fout: '' }); onOpdracht?.(o);
      if (!OPDRACHT_EIND.includes(o.stand)) {
        if (poller.current) clearInterval(poller.current);
        poller.current = window.setInterval(async () => {
          try { const n = await huisClient.opdrachtEen(woningId, o.id); setLopend({ mogelijkheid, opdracht: n, fout: '' }); onOpdracht?.(n); if (OPDRACHT_EIND.includes(n.stand)) { if (poller.current) clearInterval(poller.current); poller.current = null; onVernieuw?.(); } }
          catch { if (poller.current) clearInterval(poller.current); poller.current = null; }
        }, 1500);
      } else onVernieuw?.();
    } catch (e) {
      const code = e instanceof HuisFout ? e.code : 'FOUT';
      const o = e instanceof HuisFout ? (e.data?.opdracht as Opdracht | null) : null;
      setLopend({ mogelijkheid, opdracht: o, fout: foutTekst(lang, code) });
      if (o) onOpdracht?.(o);
    }
  };
  const bezig = Boolean(lopend && (lopend.opdracht ? !OPDRACHT_EIND.includes(lopend.opdracht.stand) : !lopend.fout));
  const kritiek = (m: Mogelijkheid) => Boolean(a.kritiek && (m.kritiek || ['vergrendeld', 'alarm', 'rook', 'gas'].includes(m.soort)));
  const vraag = (m: Mogelijkheid, waarde: Record<string, unknown>) => { if (kritiek(m)) setBevestig({ mogelijkheid: m.soort, waarde }); else void stuur(m.soort, waarde); };
  const schuif = (m: Mogelijkheid, waarde: number) => { if (timer.current) clearTimeout(timer.current); timer.current = window.setTimeout(() => vraag(m, { waarde }), 450); };
  const stand = lopend?.opdracht?.stand;
  const standTekst = stand ? tr(lang, OPDRACHT_LABEL[stand][0], OPDRACHT_LABEL[stand][1]) : lopend && !lopend.fout ? tr(lang, 'надсилаю…', 'verzenden…') : '';
  const eind = stand && OPDRACHT_EIND.includes(stand);
  const geslaagd = stand === 'voltooid';

  return (
    <div className={`hv-bediening${compact ? ' is-compact' : ''}`} data-hv-bediening={a.id}>
      {a.mogelijkheden.filter((m) => m.schrijven).map((m) => {
        const t = toestandVan(a, m.soort === 'aan_uit' ? 'aan' : m.soort === 'open_dicht' ? 'open' : m.soort);
        const vers = versheid(t); const onbekend = !t || t.waarde === null || vers === 'onbekend' || vers === 'onbeschikbaar';
        const uit = !magSchrijven || bezig;
        const label = tr(lang, MOGELIJKHEID_LABEL[m.soort][0], MOGELIJKHEID_LABEL[m.soort][1]);
        if (m.soort === 'aan_uit' || m.soort === 'vergrendeld' || m.soort === 'alarm') {
          const aan = m.soort === 'aan_uit' ? t?.waarde === true : m.soort === 'vergrendeld' ? t?.waarde === true : typeof t?.waarde === 'string' && String(t.waarde).startsWith('armed');
          const I = m.soort === 'vergrendeld' ? (aan ? Lock : LockOpen) : null;
          return (
            <div key={m.soort} className='hv-regelaar'>
              <span className='hv-regelaar-naam'>{I ? <I aria-hidden='true' /> : null}{label}{kritiek(m) ? <em className='hv-kritiek'>{tr(lang, 'критично', 'kritiek')}</em> : null}</span>
              <button type='button' role='switch' aria-checked={onbekend ? 'mixed' : aan} aria-label={`${label}: ${onbekend ? tr(lang, 'невідомо', 'onbekend') : aan ? tr(lang, 'увімкнено', 'aan') : tr(lang, 'вимкнено', 'uit')}`} className={`hv-schakelaar${aan ? ' is-aan' : ''}${onbekend ? ' is-onbekend' : ''}`} disabled={uit} onClick={() => vraag(m, { aan: !aan })} data-hv-schakel={m.soort}>
                <span className='hv-schakelaar-knop' />
              </button>
            </div>
          );
        }
        if (m.soort === 'helderheid' || m.soort === 'positie' || m.soort === 'doeltemperatuur' || m.soort === 'kleurtemperatuur') {
          const [min, max] = m.bereik ?? [0, 100]; const stap = m.soort === 'doeltemperatuur' ? 0.5 : m.soort === 'kleurtemperatuur' ? 100 : 1;
          const huidig = typeof t?.waarde === 'number' ? t.waarde : null;
          return (
            <div key={m.soort} className='hv-regelaar is-schuif'>
              <span className='hv-regelaar-naam'>{label} <small>{huidig === null ? tr(lang, 'невідомо', 'onbekend') : `${huidig}${m.eenheid ? ' ' + m.eenheid : ''}`}</small></span>
              <div className='hv-schuif'>
                <button type='button' className='hv-icoonknop' disabled={uit || huidig === null} onClick={() => vraag(m, { waarde: Math.max(min, (huidig ?? min) - stap * (m.soort === 'kleurtemperatuur' ? 5 : m.soort === 'doeltemperatuur' ? 1 : 10)) })} aria-label={tr(lang, `${label} менше`, `${label} lager`)}><Minus /></button>
                <input type='range' min={min} max={max} step={stap} defaultValue={huidig ?? min} disabled={uit} aria-label={label} onChange={(e) => schuif(m, Number(e.target.value))} data-hv-schuif={m.soort} />
                <button type='button' className='hv-icoonknop' disabled={uit || huidig === null} onClick={() => vraag(m, { waarde: Math.min(max, (huidig ?? min) + stap * (m.soort === 'kleurtemperatuur' ? 5 : m.soort === 'doeltemperatuur' ? 1 : 10)) })} aria-label={tr(lang, `${label} більше`, `${label} hoger`)}><Plus /></button>
              </div>
            </div>
          );
        }
        if (m.soort === 'open_dicht') {
          return (
            <div key={m.soort} className='hv-regelaar'>
              <span className='hv-regelaar-naam'>{label} <small>{onbekend ? tr(lang, 'невідомо', 'onbekend') : t?.waarde ? tr(lang, 'відкрито', 'open') : tr(lang, 'закрито', 'dicht')}</small></span>
              <div className='hv-knoppen'>
                <button type='button' className='hv-knop is-klein' disabled={uit} onClick={() => vraag(m, { actie: 'open' })} data-hv-cover='open'><ArrowUpToLine aria-hidden='true' />{tr(lang, 'Відкрити', 'Open')}</button>
                <button type='button' className='hv-knop is-klein' disabled={uit} onClick={() => vraag(m, { actie: 'stop' })}><Square aria-hidden='true' />{tr(lang, 'Стоп', 'Stop')}</button>
                <button type='button' className='hv-knop is-klein' disabled={uit} onClick={() => vraag(m, { actie: 'dicht' })} data-hv-cover='dicht'><ArrowDownToLine aria-hidden='true' />{tr(lang, 'Закрити', 'Dicht')}</button>
              </div>
            </div>
          );
        }
        return null;
      })}
      {!magSchrijven ? <p className='hv-hint'><Unplug aria-hidden='true' />{tr(lang, 'Команди недоступні: роль «лише читання» або для інтеграції не ввімкнено запис.', 'Geen opdrachten: rol «alleen lezen» of de integratie heeft geen schrijftoestemming.')}</p> : null}
      {lopend ? (
        <p className={`hv-opdracht-stand is-${stand ?? 'bezig'}`} role='status' aria-live='polite' data-hv-opdracht-stand={stand ?? 'bezig'}>
          {geslaagd ? <Check aria-hidden='true' /> : eind || lopend.fout ? <AlertCircle aria-hidden='true' /> : <span className='hv-spin' aria-hidden='true' />}
          {lopend.fout || standTekst}
          {stand === 'verzonden' || stand === 'bevestigd' ? <small> · {tr(lang, 'чекаю підтвердження від пристрою', 'wacht op bevestiging van het apparaat')}</small> : null}
        </p>
      ) : null}
      {a.toestanden.length ? <small className='hv-versheid'>{tr(lang, 'дані', 'gegevens')}: {tr(lang, VERSHEID_LABEL[versheid(a.toestanden[0])][0], VERSHEID_LABEL[versheid(a.toestanden[0])][1])}</small> : null}
      {bevestig ? (
        <div className='hv-bevestig' role='alertdialog' aria-label={tr(lang, 'Критична дія', 'Kritieke actie')} data-hv-bevestig='1'>
          <p><AlertCircle aria-hidden='true' />{tr(lang, 'Це критичний пристрій (замок/охорона). Сервер попросить підтвердити вхід. ШІ та сцени ніколи цього не роблять.', 'Dit is een kritiek apparaat (slot/alarm). De server vraagt om bevestiging van de aanmelding. AI en scènes doen dit nooit.')}</p>
          <div className='hv-knoppen'>
            <button type='button' className='hv-knop is-hoofd' onClick={() => { const b = bevestig; setBevestig(null); void stuur(b.mogelijkheid, b.waarde, true); }} data-hv-bevestig-ja='1'>{tr(lang, 'Так, виконати з підтвердженням', 'Ja, met bevestiging uitvoeren')}</button>
            <button type='button' className='hv-knop is-stil' onClick={() => setBevestig(null)}>{tr(lang, 'Скасувати', 'Annuleren')}</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
