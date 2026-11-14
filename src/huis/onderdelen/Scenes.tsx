// Сцени: перелік карток «одним дотиком», редактор кроків та виконання з покроковим підтвердженням від кожного пристрою.
// Scènes: lijst, bewerker per apparaat/mogelijkheid/waarde en uitvoeren met bevestiging per stap; kritieke apparaten uitgesloten.
import { useMemo, useState } from 'react';
import { Check, AlertCircle, Pencil, Play, Plus, Sparkles, Trash2 } from 'lucide-react';
import { KRITIEKE_SOORTEN, MOGELIJKHEID_LABEL, OPDRACHT_LABEL, type Apparaat, type MogelijkheidSoort, type OpdrachtStand, type Scene, type SceneStap } from '../../../shared/huis-model';
import type { OnderdeelProps } from '../HuisPagina';
import HuisLaag from '../HuisLaag';
import { HuisFout, huisClient, idem } from '../huis-client';
import { datumTekst, foutTekst, tr, type Lang } from '../tekst';
import '../huis-ruimtes-maquette.css';

type Uitkomst = Awaited<ReturnType<typeof huisClient.sceneUitvoeren>>;
export const SCHRIJFBAAR: readonly MogelijkheidSoort[] = Object.freeze(['aan_uit', 'helderheid', 'kleurtemperatuur', 'doeltemperatuur', 'open_dicht', 'positie']);

/** Stapwaarde-invoer: per soort de juiste velden (aan/uit, getal binnen bereik, open/dicht/stop). */
export function StapWaarde({ lang, apparaat, soort, waarde, onChange }: { lang: Lang; apparaat: Apparaat | undefined; soort: MogelijkheidSoort; waarde: Record<string, unknown>; onChange: (w: Record<string, unknown>) => void }) {
  const m = apparaat?.mogelijkheden.find((x) => x.soort === soort);
  if (soort === 'aan_uit') return <select value={waarde.aan === false ? 'uit' : 'aan'} aria-label={tr(lang, 'Значення', 'Waarde')} onChange={(e) => onChange({ aan: e.target.value === 'aan' })}><option value='aan'>{tr(lang, 'увімкнути', 'aan')}</option><option value='uit'>{tr(lang, 'вимкнути', 'uit')}</option></select>;
  if (soort === 'open_dicht') return <select value={String(waarde.actie ?? 'open')} aria-label={tr(lang, 'Дія', 'Actie')} onChange={(e) => onChange({ actie: e.target.value })}><option value='open'>{tr(lang, 'відкрити', 'open')}</option><option value='dicht'>{tr(lang, 'закрити', 'dicht')}</option><option value='stop'>{tr(lang, 'стоп', 'stop')}</option></select>;
  const [min, max] = m?.bereik ?? (soort === 'doeltemperatuur' ? [5, 35] : soort === 'kleurtemperatuur' ? [1000, 10000] : [0, 100]);
  return <input type='number' min={min} max={max} step={soort === 'doeltemperatuur' ? 0.5 : 1} value={typeof waarde.waarde === 'number' ? waarde.waarde : ''} aria-label={tr(lang, 'Значення', 'Waarde')} placeholder={`${min}–${max}${m?.eenheid ?? ''}`} onChange={(e) => onChange({ waarde: e.target.value === '' ? undefined : Number(e.target.value) })} />;
}

export default function Scenes({ lang, smal, woningId, ov, vernieuw, toon }: OnderdeelProps) {
  const [open, setOpen] = useState<{ id: string | null; naam: string; stappen: SceneStap[] } | null>(null);
  const [uitkomst, setUitkomst] = useState<{ scene: Scene; u: Uitkomst } | null>(null);
  const [bezig, setBezig] = useState('');
  const mag = ov.lid.magSchrijven;
  const magCmd = mag && ov.integraties.some((i) => i.schrijven);
  const bedienbaar = useMemo(() => ov.apparaten.filter((a) => !a.kritiek && a.mogelijkheden.some((m) => m.schrijven && SCHRIJFBAAR.includes(m.soort) && !KRITIEKE_SOORTEN.includes(m.soort))), [ov.apparaten]);
  const naam = (id: string) => ov.apparaten.find((a) => a.id === id)?.naam ?? '?';
  const fout = (e: unknown) => toon(foutTekst(lang, e instanceof HuisFout ? e.code : 'FOUT'), 'fout');

  const run = async (s: Scene) => {
    setBezig(s.id);
    try { const u = await huisClient.sceneUitvoeren(woningId, s.id, idem('scene')); setUitkomst({ scene: s, u }); await vernieuw(); }
    catch (e) { fout(e); } finally { setBezig(''); }
  };
  const bewaar = async () => {
    if (!open || !open.naam.trim()) return;
    setBezig('bewaar');
    try { await huisClient.sceneBewaar(woningId, open.id, { naam: open.naam.trim(), stappen: open.stappen }); setOpen(null); await vernieuw(); toon(tr(lang, 'Сцену збережено.', 'Scène opgeslagen.')); }
    catch (e) { fout(e); } finally { setBezig(''); }
  };
  const verwijder = async (s: Scene) => {
    if (!window.confirm(tr(lang, `Видалити сцену «${s.naam}»?`, `Scène «${s.naam}» verwijderen?`))) return;
    setBezig(s.id);
    try { await huisClient.sceneVerwijder(woningId, s.id); await vernieuw(); } catch (e) { fout(e); } finally { setBezig(''); }
  };
  const nieuweStap = (): SceneStap | null => { const a = bedienbaar[0]; if (!a) return null; const m = a.mogelijkheden.find((x) => x.schrijven && SCHRIJFBAAR.includes(x.soort))!; return { apparaatId: a.id, mogelijkheid: m.soort, waarde: m.soort === 'aan_uit' ? { aan: true } : m.soort === 'open_dicht' ? { actie: 'open' } : { waarde: m.bereik?.[1] ?? 100 } }; };
  const zetStap = (i: number, s: SceneStap) => setOpen((o) => o && { ...o, stappen: o.stappen.map((x, j) => (j === i ? s : x)) });

  return (
    <div className='hv-scenes' data-mq-sectie='scenes'>
      <p className='hv-hint'>{tr(lang, 'Сцена — набір команд, що виконуються разом. Кожна команда чекає на підтвердження від пристрою; результат показується по кроках. Замки, охорона й сирени до сцен не входять.', 'Een scène is een reeks opdrachten die samen worden uitgevoerd. Elke opdracht wacht op bevestiging van het apparaat; de uitkomst staat per stap. Sloten, alarm en sirenes horen niet in een scène.')}</p>
      {mag ? <div className='hv-werkbalk'><button type='button' className='hv-knop is-hoofd' disabled={!bedienbaar.length} onClick={() => setOpen({ id: null, naam: '', stappen: nieuweStap() ? [nieuweStap()!] : [] })} data-hv-scene-nieuw='1'><Plus aria-hidden='true' />{tr(lang, 'Нова сцена', 'Nieuwe scène')}</button>{!bedienbaar.length ? <span className='hv-hint'>{tr(lang, 'Немає керованих пристроїв — спершу імпортуйте їх з інтеграції.', 'Geen bedienbare apparaten — importeer ze eerst uit een integratie.')}</span> : null}</div> : null}
      {!ov.scenes.length ? <section className='hv-leeg'><Sparkles aria-hidden='true' /><h3>{tr(lang, 'Сцен ще немає', 'Nog geen scènes')}</h3><p>{tr(lang, 'Наприклад «Вечір»: приглушити світло у вітальні та опустити ролети.', 'Bijvoorbeeld «Avond»: licht in de woonkamer dimmen en de rolluiken sluiten.')}</p></section> : null}
      <div className='hv-raster'>
        {ov.scenes.map((s) => {
          const lr = s.laatsteRun as { uitkomst?: string; op?: string } | undefined;
          const sceneStand = bezig === s.id ? 'bezig' : lr?.uitkomst ?? 'nieuw';
          return (
            <article key={s.id} className='hv-kaart is-scene' data-hv-scene-kaart={s.id} data-mq-scene-stand={sceneStand}>
              <small>{s.stappen.length} {tr(lang, 'дій', 'stappen')}</small>
              <strong>{s.naam}</strong>
              {s.stappen.length ? (
                <ul className='hv-chips' data-mq-scene-stappen='1' aria-label={tr(lang, 'Кроки сцени', 'Stappen van de scène')}>
                  {s.stappen.slice(0, 3).map((st, si) => (
                    <li key={si} className='hv-chip is-passief'>{naam(st.apparaatId)} · {tr(lang, MOGELIJKHEID_LABEL[st.mogelijkheid]?.[0] ?? st.mogelijkheid, MOGELIJKHEID_LABEL[st.mogelijkheid]?.[1] ?? st.mogelijkheid)}</li>
                  ))}
                  {s.stappen.length > 3 ? <li className='hv-chip is-passief'>+{s.stappen.length - 3}</li> : null}
                </ul>
              ) : null}
              <span className='hv-waarde'>{lr?.uitkomst ? `${tr(lang, 'останній запуск', 'laatste run')}: ${lr.uitkomst} · ${datumTekst(lang, lr.op ?? null)}` : tr(lang, 'ще не запускалась', 'nog niet uitgevoerd')}</span>
              <div className='hv-knoppen'>
                <button type='button' className='hv-knop is-klein is-hoofd' disabled={Boolean(bezig) || !magCmd} onClick={() => void run(s)} data-hv-scene-run={s.id}><Play aria-hidden='true' />{tr(lang, 'Виконати', 'Uitvoeren')}</button>
                {mag ? <button type='button' className='hv-icoonknop' disabled={Boolean(bezig)} onClick={() => setOpen({ id: s.id, naam: s.naam, stappen: s.stappen })} aria-label={tr(lang, 'Редагувати', 'Bewerken')}><Pencil /></button> : null}
                {mag ? <button type='button' className='hv-icoonknop is-gevaar' disabled={Boolean(bezig)} onClick={() => void verwijder(s)} aria-label={tr(lang, 'Видалити', 'Verwijderen')}><Trash2 /></button> : null}
              </div>
            </article>
          );
        })}
      </div>
      {open ? (
        <HuisLaag lang={lang} soort={smal ? 'scherm' : 'venster'} titel={open.id ? tr(lang, 'Редагувати сцену', 'Scène bewerken') : tr(lang, 'Нова сцена', 'Nieuwe scène')} onSluit={() => setOpen(null)} data={{ 'hv-scene-bewerker': '1' }}>
          <label className='hv-veld'><span>{tr(lang, 'Назва', 'Naam')}</span><input value={open.naam} maxLength={80} onChange={(e) => setOpen({ ...open, naam: e.target.value })} data-hv-eerste='1' data-hv-scene-naam='1' /></label>
          <h3 className='hv-sub'>{tr(lang, 'Кроки', 'Stappen')}</h3>
          <ol className='hv-stappen'>
            {open.stappen.map((s, i) => { const a = ov.apparaten.find((x) => x.id === s.apparaatId); return (
              <li key={i} className='hv-stap' data-hv-stap={i}>
                <select value={s.apparaatId} aria-label={tr(lang, 'Пристрій', 'Apparaat')} onChange={(e) => { const na = ov.apparaten.find((x) => x.id === e.target.value); const m = na?.mogelijkheden.find((x) => x.schrijven && SCHRIJFBAAR.includes(x.soort)); zetStap(i, { apparaatId: e.target.value, mogelijkheid: m?.soort ?? 'aan_uit', waarde: m?.soort === 'aan_uit' || !m ? { aan: true } : m.soort === 'open_dicht' ? { actie: 'open' } : { waarde: m.bereik?.[1] ?? 100 } }); }}>
                  {bedienbaar.map((x) => <option key={x.id} value={x.id}>{x.naam}</option>)}
                </select>
                <select value={s.mogelijkheid} aria-label={tr(lang, 'Можливість', 'Mogelijkheid')} onChange={(e) => { const soort = e.target.value as MogelijkheidSoort; zetStap(i, { ...s, mogelijkheid: soort, waarde: soort === 'aan_uit' ? { aan: true } : soort === 'open_dicht' ? { actie: 'open' } : { waarde: a?.mogelijkheden.find((x) => x.soort === soort)?.bereik?.[1] ?? 100 } }); }}>
                  {(a?.mogelijkheden ?? []).filter((m) => m.schrijven && SCHRIJFBAAR.includes(m.soort)).map((m) => <option key={m.soort} value={m.soort}>{tr(lang, MOGELIJKHEID_LABEL[m.soort][0], MOGELIJKHEID_LABEL[m.soort][1])}</option>)}
                </select>
                <StapWaarde lang={lang} apparaat={a} soort={s.mogelijkheid} waarde={s.waarde} onChange={(w) => zetStap(i, { ...s, waarde: w })} />
                <button type='button' className='hv-icoonknop is-gevaar' onClick={() => setOpen({ ...open, stappen: open.stappen.filter((_, j) => j !== i) })} aria-label={tr(lang, 'Прибрати крок', 'Stap weghalen')}><Trash2 /></button>
              </li>
            ); })}
          </ol>
          <div className='hv-knoppen'>
            <button type='button' className='hv-knop is-klein' disabled={open.stappen.length >= 40 || !bedienbaar.length} onClick={() => { const s = nieuweStap(); if (s) setOpen({ ...open, stappen: [...open.stappen, s] }); }} data-hv-stap-toevoegen='1'><Plus aria-hidden='true' />{tr(lang, 'Додати крок', 'Stap toevoegen')}</button>
            <button type='button' className='hv-knop is-hoofd' disabled={bezig === 'bewaar' || !open.naam.trim() || !open.stappen.length} onClick={() => void bewaar()} data-hv-scene-bewaar='1'><Check aria-hidden='true' />{tr(lang, 'Зберегти', 'Opslaan')}</button>
          </div>
        </HuisLaag>
      ) : null}
      {uitkomst ? (
        <HuisLaag lang={lang} soort={smal ? 'scherm' : 'venster'} titel={`${uitkomst.scene.naam}: ${uitkomst.u.uitkomst}`} onSluit={() => setUitkomst(null)} data={{ 'hv-scene-uitkomst': uitkomst.u.uitkomst }}>
          <p className={`hv-melding ${uitkomst.u.uitkomst === 'voltooid' ? 'is-ok' : 'is-fout'}`}>{uitkomst.u.uitkomst === 'voltooid' ? <Check aria-hidden='true' /> : <AlertCircle aria-hidden='true' />}{uitkomst.u.uitkomst === 'voltooid' ? tr(lang, 'Усі кроки підтверджено пристроями.', 'Alle stappen zijn door de apparaten bevestigd.') : uitkomst.u.uitkomst === 'gedeeltelijk' ? tr(lang, 'Частина кроків без підтвердження — стан нижче.', 'Een deel van de stappen is niet bevestigd — zie hieronder.') : tr(lang, 'Сцена не виконана.', 'De scène is niet uitgevoerd.')}</p>
          <table className='hv-tabel'><tbody>{uitkomst.u.stappen.map((s, i) => <tr key={i} data-hv-stap-stand={s.stand}><th scope='row'>{naam(s.apparaatId)}</th><td>{tr(lang, MOGELIJKHEID_LABEL[s.mogelijkheid as MogelijkheidSoort]?.[0] ?? s.mogelijkheid, MOGELIJKHEID_LABEL[s.mogelijkheid as MogelijkheidSoort]?.[1] ?? s.mogelijkheid)}</td><td>{OPDRACHT_LABEL[s.stand as OpdrachtStand] ? tr(lang, OPDRACHT_LABEL[s.stand as OpdrachtStand][0], OPDRACHT_LABEL[s.stand as OpdrachtStand][1]) : s.stand}{s.fout ? ` · ${foutTekst(lang, s.fout)}` : ''}</td></tr>)}</tbody></table>
          <p className='hv-hint'>{tr(lang, 'Кореляція', 'Correlatie')}: <code>{uitkomst.u.correlatie}</code></p>
        </HuisLaag>
      ) : null}
    </div>
  );
}
