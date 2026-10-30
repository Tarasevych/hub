// AI-assistent: de AI (via MCP of deze pagina) mag alleen VOORSTELLEN doen; een mens keurt goed of wijst af. Een goedgekeurd
// voorstel wordt een gewone opdracht (via 'ai-voorstel') met ACK. Kritieke apparaten komen niet eens in de lijst. Geen chat die
// doet alsof: zonder gekoppelde AI-dienst toont de pagina eerlijk hoe de keten werkt en laat ze handmatig een voorstel opstellen
// (om de goedkeuringsketen te testen).
import { useEffect, useMemo, useState } from 'react';
import { Bot, Check, ShieldCheck, X } from 'lucide-react';
import { KRITIEKE_SOORTEN, MOGELIJKHEID_LABEL, OPDRACHT_LABEL, type MogelijkheidSoort, type Voorstel } from '../../../shared/huis-model';
import type { OnderdeelProps } from '../HuisPagina';
import { HuisFout, huisClient } from '../huis-client';
import { datumTekst, foutTekst, tr } from '../tekst';
import { SCHRIJFBAAR, StapWaarde } from './Scenes';

const STAND: Record<Voorstel['stand'], [string, string]> = { wacht: ['чекає', 'wacht'], goedgekeurd: ['схвалено', 'goedgekeurd'], afgewezen: ['відхилено', 'afgewezen'], verlopen: ['прострочено', 'verlopen'] };

export default function Assistent({ lang, woningId, ov, vernieuw, toon }: OnderdeelProps) {
  const [lijst, setLijst] = useState<Voorstel[] | null>(null);
  const [bezig, setBezig] = useState('');
  const [besluit, setBesluit] = useState<Record<string, string>>({});
  const bedienbaar = useMemo(() => ov.apparaten.filter((a) => !a.kritiek && a.mogelijkheden.some((m) => m.schrijven && SCHRIJFBAAR.includes(m.soort) && !KRITIEKE_SOORTEN.includes(m.soort))), [ov.apparaten]);
  const [nieuw, setNieuw] = useState<{ samenvatting: string; apparaatId: string; mogelijkheid: MogelijkheidSoort; waarde: Record<string, unknown> } | null>(null);
  const fout = (e: unknown) => toon(foutTekst(lang, e instanceof HuisFout ? e.code : 'FOUT'));
  const laad = async () => { try { setLijst(await huisClient.voorstellen(woningId)); } catch (e) { fout(e); setLijst([]); } };
  useEffect(() => { void laad(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [woningId, ov.voorstellenWacht]);
  const naam = (id: string) => ov.apparaten.find((a) => a.id === id)?.naam ?? '?';
  const beslis = async (v: Voorstel, ja: boolean) => {
    setBezig(v.id);
    try {
      const r = await huisClient.voorstelBesluit(woningId, v.id, ja);
      const o = r.opdracht;
      if (o) setBesluit((b) => ({ ...b, [v.id]: tr(lang, OPDRACHT_LABEL[o.stand][0], OPDRACHT_LABEL[o.stand][1]) + (o.fout ? ` · ${foutTekst(lang, o.fout)}` : '') }));
      else if (r.error) setBesluit((b) => ({ ...b, [v.id]: foutTekst(lang, r.error!) }));
      await laad(); await vernieuw();
    } catch (e) { fout(e); } finally { setBezig(''); }
  };
  const maak = async () => {
    if (!nieuw) return; setBezig('nieuw');
    try { await huisClient.voorstelNieuw(woningId, nieuw); setNieuw(null); await laad(); await vernieuw(); toon(tr(lang, 'Пропозицію створено — тепер її треба схвалити.', 'Voorstel gemaakt — nu moet iemand het goedkeuren.')); }
    catch (e) { fout(e); } finally { setBezig(''); }
  };
  const wacht = (lijst ?? []).filter((v) => v.stand === 'wacht'); const rest = (lijst ?? []).filter((v) => v.stand !== 'wacht');
  return (
    <div className='hv-assistent'>
      <section className='hv-blok'>
        <h3><Bot aria-hidden='true' /> {tr(lang, 'Як працює помічник', 'Hoe de assistent werkt')}</h3>
        <ol className='hv-uitleg'>
          <li>{tr(lang, 'ШІ (через MCP-конектор або цю сторінку) бачить стани й може лише запропонувати команду зі стислим поясненням.', 'De AI (via de MCP-connector of deze pagina) ziet toestanden en mag alleen een opdracht voorstellen met een korte uitleg.')}</li>
          <li>{tr(lang, 'Людина схвалює або відхиляє. Схвалена пропозиція стає звичайною командою з очікуванням підтвердження від пристрою.', 'Een mens keurt goed of wijst af. Een goedgekeurd voorstel wordt een gewone opdracht die op bevestiging van het apparaat wacht.')}</li>
          <li><ShieldCheck aria-hidden='true' /> {tr(lang, 'Замки, охорона, сирени, дим/газ — ніколи не в пропозиціях: сервер відхиляє їх ще на етапі створення.', 'Sloten, alarm, sirenes, rook/gas: nooit in een voorstel — de server weigert ze al bij het maken.')}</li>
        </ol>
        <p className='hv-hint'>{tr(lang, 'У цьому випуску немає вбудованого чат-бота для оселі: пропозиції надходять від зовнішнього ШІ через конектор або створюються вручну нижче для перевірки ланцюжка схвалення.', 'In deze release zit geen ingebouwde chatbot voor de woning: voorstellen komen van een externe AI via de connector of maakt u hieronder handmatig om de goedkeuringsketen te testen.')}</p>
      </section>
      <section className='hv-blok' aria-labelledby='hv-vs-wacht'>
        <h3 id='hv-vs-wacht'>{tr(lang, 'Чекають рішення', 'Wachten op besluit')} <small>{wacht.length}</small></h3>
        {lijst && !wacht.length ? <p className='hv-hint'>{tr(lang, 'Немає пропозицій, що чекають.', 'Geen wachtende voorstellen.')}</p> : null}
        <ul className='hv-lijst'>
          {wacht.map((v) => (
            <li key={v.id} data-hv-voorstel={v.id} data-hv-voorstel-stand={v.stand}>
              <div className='hv-lijst-knop'><strong>{v.samenvatting}</strong><small>{naam(v.opdracht.apparaatId)} → {tr(lang, MOGELIJKHEID_LABEL[v.opdracht.mogelijkheid]?.[0] ?? v.opdracht.mogelijkheid, MOGELIJKHEID_LABEL[v.opdracht.mogelijkheid]?.[1] ?? v.opdracht.mogelijkheid)} {JSON.stringify(v.opdracht.waarde)} · {v.door} · {tr(lang, 'до', 'tot')} {datumTekst(lang, v.verlooptOp)}</small></div>
              {ov.lid.magSchrijven ? <span className='hv-knoppen'>
                <button type='button' className='hv-knop is-klein is-hoofd' disabled={Boolean(bezig)} onClick={() => void beslis(v, true)} data-hv-goedkeuren={v.id}><Check aria-hidden='true' />{tr(lang, 'Схвалити', 'Goedkeuren')}</button>
                <button type='button' className='hv-knop is-klein is-stil' disabled={Boolean(bezig)} onClick={() => void beslis(v, false)} data-hv-afwijzen={v.id}><X aria-hidden='true' />{tr(lang, 'Відхилити', 'Afwijzen')}</button>
              </span> : null}
            </li>
          ))}
        </ul>
      </section>
      {ov.lid.magSchrijven ? (
        <section className='hv-blok' aria-labelledby='hv-vs-nieuw'>
          <h3 id='hv-vs-nieuw'>{tr(lang, 'Створити пропозицію вручну (тест ланцюжка)', 'Handmatig een voorstel maken (keten testen)')}</h3>
          {!bedienbaar.length ? <p className='hv-hint'>{tr(lang, 'Немає керованих пристроїв.', 'Geen bedienbare apparaten.')}</p> : !nieuw ? <button type='button' className='hv-knop' onClick={() => { const a = bedienbaar[0]; const m = a.mogelijkheden.find((x) => x.schrijven && SCHRIJFBAAR.includes(x.soort))!; setNieuw({ samenvatting: '', apparaatId: a.id, mogelijkheid: m.soort, waarde: m.soort === 'aan_uit' ? { aan: true } : m.soort === 'open_dicht' ? { actie: 'open' } : { waarde: m.bereik?.[1] ?? 100 } }); }} data-hv-voorstel-nieuw='1'>{tr(lang, 'Нова пропозиція', 'Nieuw voorstel')}</button> : (
            <form className='hv-rij is-wrap' onSubmit={(e) => { e.preventDefault(); void maak(); }}>
              <input value={nieuw.samenvatting} maxLength={500} placeholder={tr(lang, 'Чому? напр. «Нікого немає, світло у коридорі горить»', 'Waarom? bv. «Niemand thuis, licht in de gang brandt»')} aria-label={tr(lang, 'Пояснення', 'Uitleg')} onChange={(e) => setNieuw({ ...nieuw, samenvatting: e.target.value })} data-hv-voorstel-tekst='1' />
              <select value={nieuw.apparaatId} aria-label={tr(lang, 'Пристрій', 'Apparaat')} onChange={(e) => { const a = ov.apparaten.find((x) => x.id === e.target.value); const m = a?.mogelijkheden.find((x) => x.schrijven && SCHRIJFBAAR.includes(x.soort)); setNieuw({ ...nieuw, apparaatId: e.target.value, mogelijkheid: m?.soort ?? 'aan_uit', waarde: m?.soort === 'open_dicht' ? { actie: 'open' } : m && m.soort !== 'aan_uit' ? { waarde: m.bereik?.[1] ?? 100 } : { aan: true } }); }}>{bedienbaar.map((a) => <option key={a.id} value={a.id}>{a.naam}</option>)}</select>
              <select value={nieuw.mogelijkheid} aria-label={tr(lang, 'Можливість', 'Mogelijkheid')} onChange={(e) => { const soort = e.target.value as MogelijkheidSoort; setNieuw({ ...nieuw, mogelijkheid: soort, waarde: soort === 'aan_uit' ? { aan: true } : soort === 'open_dicht' ? { actie: 'open' } : { waarde: 100 } }); }}>{(ov.apparaten.find((a) => a.id === nieuw.apparaatId)?.mogelijkheden ?? []).filter((m) => m.schrijven && SCHRIJFBAAR.includes(m.soort)).map((m) => <option key={m.soort} value={m.soort}>{tr(lang, MOGELIJKHEID_LABEL[m.soort][0], MOGELIJKHEID_LABEL[m.soort][1])}</option>)}</select>
              <StapWaarde lang={lang} apparaat={ov.apparaten.find((a) => a.id === nieuw.apparaatId)} soort={nieuw.mogelijkheid} waarde={nieuw.waarde} onChange={(w) => setNieuw({ ...nieuw, waarde: w })} />
              <button type='submit' className='hv-knop is-hoofd' disabled={bezig === 'nieuw' || !nieuw.samenvatting.trim()} data-hv-voorstel-maak='1'>{tr(lang, 'Запропонувати', 'Voorstellen')}</button>
              <button type='button' className='hv-knop is-stil' onClick={() => setNieuw(null)}>{tr(lang, 'Скасувати', 'Annuleren')}</button>
            </form>
          )}
        </section>
      ) : null}
      {rest.length ? (
        <section className='hv-blok' aria-labelledby='hv-vs-hist'>
          <h3 id='hv-vs-hist'>{tr(lang, 'Історія', 'Geschiedenis')}</h3>
          <ul className='hv-lijst is-dicht'>{rest.map((v) => <li key={v.id} data-hv-voorstel={v.id} data-hv-voorstel-stand={v.stand}><span><strong>{v.samenvatting}</strong> <small>{tr(lang, STAND[v.stand][0], STAND[v.stand][1])} · {datumTekst(lang, v.besluitOp ?? v.verlooptOp)}{besluit[v.id] ? ` · ${besluit[v.id]}` : ''}</small></span></li>)}</ul>
        </section>
      ) : null}
    </div>
  );
}
