// Автоматизації: конструктор «Коли / Якщо / Тоді» та пробний прогін без зовнішніх дій за останніми спостереженнями.
// Automatiseringen: bewerker Wanneer/Als/Dan en droogloop zonder externe aanroepen op de laatste waarnemingen; kritieke apparaten uitgesloten.
import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Check, FlaskConical, Pencil, Plus, Trash2, Workflow, X } from 'lucide-react';
import { KRITIEKE_SOORTEN, MOGELIJKHEID_LABEL, legeRegel, type Als, type Automatisering, type Dan, type Droogloop, type MogelijkheidSoort, type Regel, type Wanneer } from '../../../shared/huis-model';
import type { OnderdeelProps } from '../HuisPagina';
import HuisLaag from '../HuisLaag';
import { HuisFout, huisClient } from '../huis-client';
import { datumTekst, foutTekst, tr, type Lang } from '../tekst';
import { SCHRIJFBAAR, StapWaarde } from './Scenes';
import '../huis-ruimtes-maquette.css';

const STAND_LABEL: Record<Automatisering['stand'], [string, string]> = { concept: ['чернетка', 'concept'], simulatie: ['симуляція', 'simulatie'], aan: ['увімкнено', 'aan'], gepauzeerd: ['пауза', 'gepauzeerd'], fout: ['помилка', 'fout'] };
const OPMERKING: Record<string, [string, string]> = { KRITIEK_IN_DAN: ['У «Тоді» є критичний пристрій — сервер таке не збереже.', 'In «Dan» staat een kritiek apparaat — de server slaat dit niet op.'], GEEN_AFKOELTIJD: ['Без часу охолодження правило може спрацьовувати безперервно.', 'Zonder afkoeltijd kan de regel onophoudelijk afgaan.'], MOGELIJKE_LUS: ['Можлива петля: «Тоді» змінює пристрій, за яким стежить «Коли».', 'Mogelijke lus: «Dan» verandert het apparaat waarop «Wanneer» let.'] };
const DAGEN: [string, string][] = [['Нд', 'zo'], ['Пн', 'ma'], ['Вт', 'di'], ['Ср', 'wo'], ['Чт', 'do'], ['Пт', 'vr'], ['Сб', 'za']];

export default function Automatiseringen({ lang, smal, woningId, ov, toon }: OnderdeelProps) {
  const [lijst, setLijst] = useState<Automatisering[] | null>(null);
  const [open, setOpen] = useState<{ id: string | null; naam: string; regel: Regel; stand: 'concept' | 'simulatie' } | null>(null);
  const [droog, setDroog] = useState<{ d: Droogloop; tijd: string } | null>(null);
  const [tijd, setTijd] = useState('');
  const [bezig, setBezig] = useState(false);
  const mag = ov.lid.magSchrijven;
  const fout = (e: unknown) => toon(foutTekst(lang, e instanceof HuisFout ? e.code : 'FOUT'), 'fout');
  const laad = async () => { try { setLijst(await huisClient.automatiseringen(woningId)); } catch (e) { fout(e); setLijst([]); } };
  useEffect(() => { void laad(); }, [woningId]);
  const bedienbaar = useMemo(() => ov.apparaten.filter((a) => !a.kritiek && a.mogelijkheden.some((m) => m.schrijven && SCHRIJFBAAR.includes(m.soort) && !KRITIEKE_SOORTEN.includes(m.soort))), [ov.apparaten]);
  const kenmerken = (id: string) => ov.apparaten.find((a) => a.id === id)?.toestanden.map((t) => t.kenmerk) ?? [];
  const eersteApparaat = ov.apparaten[0]?.id ?? '';
  const naam = (id: string) => ov.apparaten.find((a) => a.id === id)?.naam ?? ov.scenes.find((s) => s.id === id)?.naam ?? id;

  const bewaar = async () => {
    if (!open) return; setBezig(true);
    try { await huisClient.automatiseringBewaar(woningId, open.id, { naam: open.naam.trim(), regel: open.regel, stand: open.stand }); setOpen(null); setDroog(null); await laad(); toon(tr(lang, 'Автоматизацію збережено (не виконується — чернетка/симуляція).', 'Automatisering opgeslagen (wordt niet uitgevoerd — concept/simulatie).')); }
    catch (e) { fout(e); } finally { setBezig(false); }
  };
  const simuleer = async (regel: Regel) => {
    setBezig(true);
    try { const r = await huisClient.droogloop(woningId, regel, tijd || undefined); setDroog({ d: r.droogloop, tijd: tijd || tr(lang, 'зараз', 'nu') }); }
    catch (e) { fout(e); } finally { setBezig(false); }
  };
  const verwijder = async (a: Automatisering) => { if (!window.confirm(tr(lang, `Видалити «${a.naam}»?`, `«${a.naam}» verwijderen?`))) return; setBezig(true); try { await huisClient.automatiseringVerwijder(woningId, a.id); await laad(); } catch (e) { fout(e); } finally { setBezig(false); } };
  const zet = (f: (r: Regel) => Regel) => setOpen((o) => o && { ...o, regel: f(o.regel) });
  const nieuweWanneer = (soort: Wanneer['soort']): Wanneer => soort === 'tijd' ? { soort: 'tijd', tijd: '07:00' } : soort === 'toestand' ? { soort: 'toestand', apparaatId: eersteApparaat, kenmerk: kenmerken(eersteApparaat)[0] ?? 'aan', wordt: true } : { soort: 'drempel', apparaatId: eersteApparaat, kenmerk: kenmerken(eersteApparaat)[0] ?? 'temperatuur', boven: 25 };
  const nieuweAls = (soort: Als['soort']): Als => soort === 'tijdvenster' ? { soort: 'tijdvenster', van: '18:00', tot: '23:00' } : soort === 'toestand' ? { soort: 'toestand', apparaatId: eersteApparaat, kenmerk: kenmerken(eersteApparaat)[0] ?? 'aan', is: true } : { soort: 'aanwezig', aanwezig: true };
  const nieuweDan = (soort: Dan['soort']): Dan => { if (soort === 'scene') return { soort: 'scene', sceneId: ov.scenes[0]?.id ?? '' }; if (soort === 'melding') return { soort: 'melding', tekst: '' }; const a = bedienbaar[0]; const m = a?.mogelijkheden.find((x) => x.schrijven && SCHRIJFBAAR.includes(x.soort)); return { soort: 'opdracht', apparaatId: a?.id ?? '', mogelijkheid: m?.soort ?? 'aan_uit', waarde: m?.soort === 'open_dicht' ? { actie: 'open' } : m && m.soort !== 'aan_uit' ? { waarde: m.bereik?.[1] ?? 100 } : { aan: true } }; };
  const parseWaarde = (s: string): unknown => (s === 'true' ? true : s === 'false' ? false : /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : s);

  return (
    <div className='hv-automatiseringen' data-mq-sectie='automatiseringen'>
      <p className='hv-melding is-info'><FlaskConical aria-hidden='true' />{tr(lang, 'У цьому випуску сайт не виконує правила самостійно: ви можете створити чернетку та прогнати симуляцію на останніх спостереженнях. Виконання з’явиться після перевірки двигуна; критичні пристрої ніколи не будуть у «Тоді».', 'In deze release voert de site regels niet zelf uit: u kunt een concept maken en een simulatie draaien op de laatste waarnemingen. Uitvoering komt na toetsing van de engine; kritieke apparaten komen nooit in «Dan».')}</p>
      {mag ? <div className='hv-werkbalk'><button type='button' className='hv-knop is-hoofd' onClick={() => { setDroog(null); setOpen({ id: null, naam: '', regel: { ...legeRegel(), wanneer: [nieuweWanneer('tijd')], dan: ov.scenes.length ? [nieuweDan('scene')] : bedienbaar.length ? [nieuweDan('opdracht')] : [nieuweDan('melding')] }, stand: 'concept' }); }} data-hv-auto-nieuw='1'><Plus aria-hidden='true' />{tr(lang, 'Нове правило', 'Nieuwe regel')}</button></div> : null}
      {lijst && !lijst.length ? <section className='hv-leeg'><Workflow aria-hidden='true' /><h3>{tr(lang, 'Правил ще немає', 'Nog geen regels')}</h3><p>{tr(lang, 'Наприклад: «Коли датчик руху у коридорі спрацьовує, Якщо 22:00–06:00, Тоді сцена Нічне світло».', 'Bijvoorbeeld: «Wanneer de bewegingssensor in de gang afgaat, Als 22:00–06:00, Dan scène Nachtlicht».')}</p></section> : null}
      <ul className='hv-lijst' data-mq-regels-lijst='1'>
        {(lijst ?? []).map((a) => (
          <li key={a.id} data-hv-auto={a.id} data-mq-auto-stand={a.stand}>
            <div className='hv-lijst-knop'><strong>{a.naam} <em className={`hv-chip is-passief is-${a.stand}`}>{tr(lang, STAND_LABEL[a.stand][0], STAND_LABEL[a.stand][1])}</em></strong><small>{a.regel.wanneer.length} {tr(lang, 'коли', 'wanneer')} · {a.regel.als.length} {tr(lang, 'якщо', 'als')} · {a.regel.dan.length} {tr(lang, 'тоді', 'dan')} · v{a.versie} · {datumTekst(lang, a.bijgewerktOp)}</small></div>
            <span className='hv-knoppen'>
              <button type='button' className='hv-knop is-klein' disabled={bezig} onClick={() => { setOpen({ id: a.id, naam: a.naam, regel: a.regel, stand: a.stand === 'simulatie' ? 'simulatie' : 'concept' }); void simuleer(a.regel); }} data-hv-auto-sim={a.id}><FlaskConical aria-hidden='true' />{tr(lang, 'Симуляція', 'Simulatie')}</button>
              {mag ? <button type='button' className='hv-icoonknop' disabled={bezig} onClick={() => { setDroog(null); setOpen({ id: a.id, naam: a.naam, regel: a.regel, stand: a.stand === 'simulatie' ? 'simulatie' : 'concept' }); }} aria-label={tr(lang, 'Редагувати', 'Bewerken')}><Pencil /></button> : null}
              {mag ? <button type='button' className='hv-icoonknop is-gevaar' disabled={bezig} onClick={() => void verwijder(a)} aria-label={tr(lang, 'Видалити', 'Verwijderen')}><Trash2 /></button> : null}
            </span>
          </li>
        ))}
      </ul>
      {open ? (
        <HuisLaag lang={lang} soort={smal ? 'scherm' : 'venster'} titel={open.id ? tr(lang, 'Правило', 'Regel') : tr(lang, 'Нове правило', 'Nieuwe regel')} onSluit={() => { setOpen(null); setDroog(null); }} data={{ 'hv-auto-bewerker': '1' }}>
          <label className='hv-veld'><span>{tr(lang, 'Назва', 'Naam')}</span><input value={open.naam} maxLength={80} onChange={(e) => setOpen({ ...open, naam: e.target.value })} data-hv-eerste='1' data-hv-auto-naam='1' /></label>
          <Blok lang={lang} titel={tr(lang, 'Коли (тригер)', 'Wanneer (trigger)')} soorten={[['tijd', tr(lang, 'час', 'tijd')], ['toestand', tr(lang, 'стан пристрою', 'toestand')], ['drempel', tr(lang, 'поріг', 'drempel')]]} onNieuw={(s) => zet((r) => ({ ...r, wanneer: [...r.wanneer, nieuweWanneer(s as Wanneer['soort'])] }))} data='wanneer'>
            {open.regel.wanneer.map((w, i) => (
              <li key={i} className='hv-stap'>
                {w.soort === 'tijd' ? <><input type='time' value={w.tijd} aria-label={tr(lang, 'Час', 'Tijd')} onChange={(e) => zet((r) => ({ ...r, wanneer: r.wanneer.map((x, j) => (j === i ? { ...w, tijd: e.target.value } : x)) }))} /><span className='hv-chips'>{DAGEN.map((d, di) => <button key={di} type='button' className={`hv-chip${!w.dagen?.length || w.dagen.includes(di) ? ' is-actief' : ''}`} aria-pressed={!w.dagen?.length || w.dagen.includes(di)} onClick={() => zet((r) => ({ ...r, wanneer: r.wanneer.map((x, j) => { if (j !== i) return x; const cur = w.dagen?.length ? w.dagen : [0, 1, 2, 3, 4, 5, 6]; const nxt = cur.includes(di) ? cur.filter((q) => q !== di) : [...cur, di]; return { ...w, dagen: nxt.length === 7 ? undefined : nxt }; }) }))}>{tr(lang, d[0], d[1])}</button>)}</span></>
                  : <><select value={w.apparaatId} aria-label={tr(lang, 'Пристрій', 'Apparaat')} onChange={(e) => zet((r) => ({ ...r, wanneer: r.wanneer.map((x, j) => (j === i ? { ...w, apparaatId: e.target.value, kenmerk: kenmerken(e.target.value)[0] ?? w.kenmerk } : x)) }))}>{ov.apparaten.map((a) => <option key={a.id} value={a.id}>{a.naam}</option>)}</select>
                    <select value={w.kenmerk} aria-label={tr(lang, 'Ознака', 'Kenmerk')} onChange={(e) => zet((r) => ({ ...r, wanneer: r.wanneer.map((x, j) => (j === i ? { ...w, kenmerk: e.target.value } : x)) }))}>{[...new Set([w.kenmerk, ...kenmerken(w.apparaatId)])].map((k) => <option key={k} value={k}>{k}</option>)}</select>
                    {w.soort === 'toestand' ? <input value={String(w.wordt ?? '')} aria-label={tr(lang, 'стає', 'wordt')} placeholder={tr(lang, 'стає (true/false/число)', 'wordt (true/false/getal)')} onChange={(e) => zet((r) => ({ ...r, wanneer: r.wanneer.map((x, j) => (j === i ? { ...w, wordt: parseWaarde(e.target.value) } : x)) }))} />
                      : <><input type='number' value={w.boven ?? ''} placeholder={tr(lang, 'вище', 'boven')} aria-label={tr(lang, 'вище', 'boven')} onChange={(e) => zet((r) => ({ ...r, wanneer: r.wanneer.map((x, j) => (j === i ? { ...w, boven: e.target.value === '' ? undefined : Number(e.target.value) } : x)) }))} /><input type='number' value={w.onder ?? ''} placeholder={tr(lang, 'нижче', 'onder')} aria-label={tr(lang, 'нижче', 'onder')} onChange={(e) => zet((r) => ({ ...r, wanneer: r.wanneer.map((x, j) => (j === i ? { ...w, onder: e.target.value === '' ? undefined : Number(e.target.value) } : x)) }))} /></>}</>}
                <button type='button' className='hv-icoonknop is-gevaar' onClick={() => zet((r) => ({ ...r, wanneer: r.wanneer.filter((_, j) => j !== i) }))} aria-label={tr(lang, 'Прибрати', 'Weghalen')}><X /></button>
              </li>
            ))}
          </Blok>
          <Blok lang={lang} titel={tr(lang, 'Якщо (умови)', 'Als (voorwaarden)')} soorten={[['tijdvenster', tr(lang, 'проміжок часу', 'tijdvenster')], ['toestand', tr(lang, 'стан пристрою', 'toestand')], ['aanwezig', tr(lang, 'присутність', 'aanwezig')]]} onNieuw={(s) => zet((r) => ({ ...r, als: [...r.als, nieuweAls(s as Als['soort'])] }))} data='als' extra={<label className='hv-veld is-rij'><span>{tr(lang, 'Режим', 'Modus')}</span><select value={open.regel.alsModus} onChange={(e) => zet((r) => ({ ...r, alsModus: e.target.value as 'alle' | 'een' }))}><option value='alle'>{tr(lang, 'усі умови', 'alle voorwaarden')}</option><option value='een'>{tr(lang, 'будь-яка', 'één is genoeg')}</option></select></label>}>
            {open.regel.als.map((a, i) => (
              <li key={i} className='hv-stap'>
                {a.soort === 'tijdvenster' ? <><input type='time' value={a.van} aria-label={tr(lang, 'від', 'van')} onChange={(e) => zet((r) => ({ ...r, als: r.als.map((x, j) => (j === i ? { ...a, van: e.target.value } : x)) }))} /><span>–</span><input type='time' value={a.tot} aria-label={tr(lang, 'до', 'tot')} onChange={(e) => zet((r) => ({ ...r, als: r.als.map((x, j) => (j === i ? { ...a, tot: e.target.value } : x)) }))} /></>
                  : a.soort === 'toestand' ? <><select value={a.apparaatId} aria-label={tr(lang, 'Пристрій', 'Apparaat')} onChange={(e) => zet((r) => ({ ...r, als: r.als.map((x, j) => (j === i ? { ...a, apparaatId: e.target.value, kenmerk: kenmerken(e.target.value)[0] ?? a.kenmerk } : x)) }))}>{ov.apparaten.map((x) => <option key={x.id} value={x.id}>{x.naam}</option>)}</select><select value={a.kenmerk} aria-label={tr(lang, 'Ознака', 'Kenmerk')} onChange={(e) => zet((r) => ({ ...r, als: r.als.map((x, j) => (j === i ? { ...a, kenmerk: e.target.value } : x)) }))}>{[...new Set([a.kenmerk, ...kenmerken(a.apparaatId)])].map((k) => <option key={k} value={k}>{k}</option>)}</select><input value={String(a.is ?? '')} aria-label={tr(lang, 'дорівнює', 'is')} placeholder={tr(lang, 'дорівнює', 'is')} onChange={(e) => zet((r) => ({ ...r, als: r.als.map((x, j) => (j === i ? { ...a, is: parseWaarde(e.target.value) } : x)) }))} /></>
                  : <select value={a.aanwezig ? 'ja' : 'nee'} aria-label={tr(lang, 'Присутність', 'Aanwezigheid')} onChange={(e) => zet((r) => ({ ...r, als: r.als.map((x, j) => (j === i ? { soort: 'aanwezig', aanwezig: e.target.value === 'ja' } : x)) }))}><option value='ja'>{tr(lang, 'хтось удома', 'iemand thuis')}</option><option value='nee'>{tr(lang, 'нікого немає', 'niemand thuis')}</option></select>}
                <button type='button' className='hv-icoonknop is-gevaar' onClick={() => zet((r) => ({ ...r, als: r.als.filter((_, j) => j !== i) }))} aria-label={tr(lang, 'Прибрати', 'Weghalen')}><X /></button>
              </li>
            ))}
          </Blok>
          <Blok lang={lang} titel={tr(lang, 'Тоді (дії)', 'Dan (acties)')} soorten={[['scene', tr(lang, 'сцена', 'scène')], ['opdracht', tr(lang, 'команда', 'opdracht')], ['melding', tr(lang, 'сповіщення', 'melding')]]} onNieuw={(s) => zet((r) => ({ ...r, dan: [...r.dan, nieuweDan(s as Dan['soort'])] }))} data='dan'>
            {open.regel.dan.map((d, i) => { const ap = d.soort === 'opdracht' ? ov.apparaten.find((x) => x.id === d.apparaatId) : undefined; return (
              <li key={i} className='hv-stap'>
                {d.soort === 'scene' ? <select value={d.sceneId} aria-label={tr(lang, 'Сцена', 'Scène')} onChange={(e) => zet((r) => ({ ...r, dan: r.dan.map((x, j) => (j === i ? { soort: 'scene', sceneId: e.target.value } : x)) }))}>{ov.scenes.map((s) => <option key={s.id} value={s.id}>{s.naam}</option>)}{!ov.scenes.length ? <option value=''>{tr(lang, '— немає сцен —', '— geen scènes —')}</option> : null}</select>
                  : d.soort === 'melding' ? <input value={d.tekst} maxLength={200} placeholder={tr(lang, 'Текст сповіщення', 'Tekst van de melding')} aria-label={tr(lang, 'Текст', 'Tekst')} onChange={(e) => zet((r) => ({ ...r, dan: r.dan.map((x, j) => (j === i ? { soort: 'melding', tekst: e.target.value } : x)) }))} />
                  : <><select value={d.apparaatId} aria-label={tr(lang, 'Пристрій', 'Apparaat')} onChange={(e) => { const na = ov.apparaten.find((x) => x.id === e.target.value); const m = na?.mogelijkheden.find((x) => x.schrijven && SCHRIJFBAAR.includes(x.soort)); zet((r) => ({ ...r, dan: r.dan.map((x, j) => (j === i ? { soort: 'opdracht', apparaatId: e.target.value, mogelijkheid: m?.soort ?? 'aan_uit', waarde: m?.soort === 'open_dicht' ? { actie: 'open' } : m && m.soort !== 'aan_uit' ? { waarde: m.bereik?.[1] ?? 100 } : { aan: true } } : x)) })); }}>{bedienbaar.map((x) => <option key={x.id} value={x.id}>{x.naam}</option>)}</select>
                    <select value={d.mogelijkheid} aria-label={tr(lang, 'Можливість', 'Mogelijkheid')} onChange={(e) => { const soort = e.target.value as MogelijkheidSoort; zet((r) => ({ ...r, dan: r.dan.map((x, j) => (j === i ? { ...d, mogelijkheid: soort, waarde: soort === 'aan_uit' ? { aan: true } : soort === 'open_dicht' ? { actie: 'open' } : { waarde: ap?.mogelijkheden.find((m) => m.soort === soort)?.bereik?.[1] ?? 100 } } : x)) })); }}>{(ap?.mogelijkheden ?? []).filter((m) => m.schrijven && SCHRIJFBAAR.includes(m.soort)).map((m) => <option key={m.soort} value={m.soort}>{tr(lang, MOGELIJKHEID_LABEL[m.soort][0], MOGELIJKHEID_LABEL[m.soort][1])}</option>)}</select>
                    <StapWaarde lang={lang} apparaat={ap} soort={d.mogelijkheid} waarde={d.waarde} onChange={(w) => zet((r) => ({ ...r, dan: r.dan.map((x, j) => (j === i ? { ...d, waarde: w } : x)) }))} /></>}
                <button type='button' className='hv-icoonknop is-gevaar' onClick={() => zet((r) => ({ ...r, dan: r.dan.filter((_, j) => j !== i) }))} aria-label={tr(lang, 'Прибрати', 'Weghalen')}><X /></button>
              </li>
            ); })}
          </Blok>
          <h3 className='hv-sub'>{tr(lang, 'Запобіжники', 'Veiligheidsmarges')}</h3>
          <div className='hv-rij is-wrap' data-mq-veiligheidsmarges='1'>
            <label className='hv-veld'><span>{tr(lang, 'Охолодження, хв', 'Afkoeltijd, min')}</span><input type='number' min={0} max={1440} value={open.regel.instellingen.afkoelMinuten} onChange={(e) => zet((r) => ({ ...r, instellingen: { ...r.instellingen, afkoelMinuten: Number(e.target.value) } }))} /></label>
            <label className='hv-veld'><span>{tr(lang, 'Макс. на день', 'Max. per dag')}</span><input type='number' min={1} max={1000} value={open.regel.instellingen.maxPerDag} onChange={(e) => zet((r) => ({ ...r, instellingen: { ...r.instellingen, maxPerDag: Number(e.target.value) } }))} /></label>
            <label className='hv-veld'><span>{tr(lang, 'Затримка, с', 'Vertraging, s')}</span><input type='number' min={0} max={3600} value={open.regel.instellingen.vertragingSeconden} onChange={(e) => zet((r) => ({ ...r, instellingen: { ...r.instellingen, vertragingSeconden: Number(e.target.value) } }))} /></label>
            <label className='hv-veld'><span>{tr(lang, 'Стан', 'Stand')}</span><select value={open.stand} onChange={(e) => setOpen({ ...open, stand: e.target.value as 'concept' | 'simulatie' })} data-hv-auto-stand='1'><option value='concept'>{tr(lang, 'чернетка', 'concept')}</option><option value='simulatie'>{tr(lang, 'симуляція (без виконання)', 'simulatie (geen uitvoering)')}</option></select></label>
          </div>
          <h3 className='hv-sub'>{tr(lang, 'Симуляція', 'Simulatie')}</h3>
          <div className='hv-rij'>
            <input type='time' value={tijd} aria-label={tr(lang, 'Час для симуляції', 'Tijd voor de simulatie')} onChange={(e) => setTijd(e.target.value)} />
            <button type='button' className='hv-knop' disabled={bezig} onClick={() => void simuleer(open.regel)} data-hv-droogloop='1'><FlaskConical aria-hidden='true' />{tr(lang, 'Прогнати на поточних даних', 'Droogloop op huidige gegevens')}</button>
          </div>
          {droog ? (
            <section className={`hv-droogloop ${droog.d.zouStarten ? 'is-ok' : 'is-neutraal'}`} data-hv-droogloop-uitkomst={droog.d.zouStarten ? 'ja' : 'nee'}>
              <p><strong>{droog.d.zouStarten ? tr(lang, `О ${droog.tijd} правило спрацювало б.`, `Om ${droog.tijd} zou de regel afgaan.`) : tr(lang, `О ${droog.tijd} правило не спрацювало б.`, `Om ${droog.tijd} zou de regel niet afgaan.`)}</strong> <small>{tr(lang, 'Нічого не надіслано — це лише симуляція.', 'Er is niets verzonden — dit is alleen een simulatie.')}</small></p>
              <ul className='hv-lijst is-dicht'>
                {droog.d.wanneer.map((x, i) => <li key={`w${i}`}>{x.waar ? <Check aria-hidden='true' /> : <X aria-hidden='true' />}<span>{tr(lang, 'Коли', 'Wanneer')}: {x.beschrijving}</span></li>)}
                {droog.d.als.map((x, i) => <li key={`a${i}`}>{x.waar ? <Check aria-hidden='true' /> : <X aria-hidden='true' />}<span>{tr(lang, 'Якщо', 'Als')}: {x.beschrijving}</span></li>)}
                {droog.d.dan.map((x, i) => <li key={`d${i}`} className={x.kritiek ? 'is-kritiek' : ''}><span>→ {tr(lang, 'Тоді', 'Dan')}: {x.beschrijving.replace(/^[0-9a-f-]{36}/, (id) => naam(id))}{x.kritiek ? ` (${tr(lang, 'критично!', 'kritiek!')})` : ''}</span></li>)}
              </ul>
              {droog.d.opmerkingen.map((o) => <p key={o} className='hv-melding is-fout'><AlertCircle aria-hidden='true' />{OPMERKING[o] ? tr(lang, OPMERKING[o][0], OPMERKING[o][1]) : o}</p>)}
            </section>
          ) : null}
          {mag ? <div className='hv-knoppen'><button type='button' className='hv-knop is-hoofd' disabled={bezig || !open.naam.trim() || !open.regel.wanneer.length || !open.regel.dan.length} onClick={() => void bewaar()} data-hv-auto-bewaar='1'><Check aria-hidden='true' />{tr(lang, 'Зберегти', 'Opslaan')}</button></div> : null}
        </HuisLaag>
      ) : null}
    </div>
  );
}

function Blok({ lang, titel, soorten, onNieuw, children, data, extra }: { lang: Lang; titel: string; soorten: Array<[string, string]>; onNieuw: (s: string) => void; children: React.ReactNode; data: string; extra?: React.ReactNode }) {
  return (
    <section className='hv-blok is-regel' data-hv-regelblok={data}>
      <h3 className='hv-sub'>{titel}</h3>
      {extra}
      <ol className='hv-stappen'>{children}</ol>
      <div className='hv-chips'>{soorten.map(([s, l]) => <button key={s} type='button' className='hv-chip' onClick={() => onNieuw(s)} data-hv-regel-nieuw={`${data}-${s}`}><Plus aria-hidden='true' />{l}</button>)}</div>
      <span className='hv-hint'>{tr(lang, 'Додати умову/дію', 'Voorwaarde/actie toevoegen')}</span>
    </section>
  );
}
