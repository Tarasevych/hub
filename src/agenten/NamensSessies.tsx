// «Агент від імені власника» (audit 18.10.2026, K1): wie mag tijdelijk namens u beheerweergaven lezen, hoe lang, wat hij deed;
// intrekken met één klik. Aanmaken alleen met passkey (de server vraagt STEP_UP_REQUIRED → venster «Підтвердіть доступ»).
// Daaronder de spooksessies die de verwijderde instrumenten (auto_session …) achterlieten: onschadelijk gemaakt, definitief wissen met passkey.
import { useCallback, useEffect, useState } from 'react';
import { Ban, Clock, Eraser, Fingerprint, Ghost, Plus, RefreshCw, ShieldCheck, UserCheck, X } from 'lucide-react';
import { api } from '../platform/client';
import AgentLogo from './AgentLogo';
import { Venster } from '../platform/vensters';
import './namens-sessies.css';

type Lang = 'uk' | 'nl';
const tr = (lang: Lang, uk: string, nl: string) => (lang === 'uk' ? uk : nl);
type Sessie = { id: string; agent: string; ruimte: 'prive' | 'technisch'; omvang: string[]; aangemaaktOp: number; verlooptOp: number; ingetrokkenOp: number | null; ingetrokkenReden: string; acties: number; laatstActief: number | null };
type Spook = { id: string; createdAt: number; absoluteExpiresAt: number; service: string; verwijderdOp: number | null; verwijderdReden: string };
type Lijst = { actief: Sessie[]; voorbij: Sessie[]; spoken: Spook[]; agents: Array<{ slug: string; naam: string }>; omvang: Array<{ id: string; uk: string; nl: string }>; grenzen: { min: number; max: number; standaard: number } };

const DUREN = [15, 30, 60, 120, 240, 480];
const duurTekst = (lang: Lang, m: number) => (m < 60 ? tr(lang, `${m} хв`, `${m} min`) : tr(lang, `${m / 60} год`, `${m / 60} u`));
const tijd = (lang: Lang, ms: number | null) => (ms ? new Date(ms).toLocaleString(lang === 'uk' ? 'uk-UA' : 'nl-BE', { dateStyle: 'short', timeStyle: 'short' }) : '—');
const FOUT: Record<string, [string, string]> = {
  STEP_UP_REQUIRED: ['Потрібне підтвердження passkey.', 'Bevestiging met passkey nodig.'],
  NAMENS_OMVANG_LEEG: ['Оберіть хоча б один розділ.', 'Kies minstens één onderdeel.'],
  NAMENS_AGENT_ONGELDIG: ['Невідомий агент.', 'Onbekende agent.'],
  NAMENS_NIET_GEVONDEN: ['Дозвіл уже завершено.', 'De toestemming is al beëindigd.'],
  OWNER_REQUIRED: ['Лише власник.', 'Alleen de eigenaar.'],
  AGENT_NIET_TOEGESTAAN: ['Агент не може змінювати права від імені власника.', 'Een agent kan geen rechten wijzigen namens de eigenaar.'],
};
const fout = (lang: Lang, e: unknown) => { const c = String((e as { message?: string })?.message || ''); const t = FOUT[c]; return t ? tr(lang, t[0], t[1]) : tr(lang, 'Помилка: ', 'Fout: ') + (c || tr(lang, 'немає звʼязку', 'geen verbinding')); };

export default function NamensSessies({ lang, context, alleenLezen = false }: { lang: Lang; context: { service: string; tabContext: string; sourceOrigin: string }; alleenLezen?: boolean }) {
  const [data, setData] = useState<Lijst | null>(null);
  const [melding, setMelding] = useState<{ ok: boolean; tekst: string } | null>(null);
  const [bezig, setBezig] = useState('');
  const [nieuw, setNieuw] = useState(false);
  const [agent, setAgent] = useState('claude');
  const [ruimte, setRuimte] = useState<'technisch' | 'prive'>('technisch');
  const [minuten, setMinuten] = useState(60);
  const [omvang, setOmvang] = useState<string[]>(['uitrol']);
  const [nu, setNu] = useState(Date.now());

  const laden = useCallback(async () => {
    try { setData((await api.post('/api/owner/agent-namens/lijst', context)).data as Lijst); }
    catch (e) { setMelding({ ok: false, tekst: fout(lang, e) }); }
  }, [context, lang]);
  useEffect(() => { void laden(); }, [laden]);
  useEffect(() => { const t = window.setInterval(() => setNu(Date.now()), 30_000); return () => window.clearInterval(t); }, []);

  const aanmaken = async () => {
    setBezig('maak'); setMelding(null);
    try {
      await api.post('/api/owner/agent-namens/aanmaken', { ...context, agent, ruimte, minuten, omvang });
      setNieuw(false); setMelding({ ok: true, tekst: tr(lang, 'Дозвіл видано. Агент не отримує жодного токена чи cookie — сайт перевіряє дозвіл при кожному виклику.', 'Toestemming gegeven. De agent krijgt geen token of cookie — de site controleert de toestemming bij elke aanroep.') });
      await laden();
    } catch (e) { setMelding({ ok: false, tekst: fout(lang, e) }); }
    setBezig('');
  };
  const intrekken = async (s: Sessie) => {
    setBezig(s.id); setMelding(null);
    try { await api.post('/api/owner/agent-namens/intrekken', { ...context, id: s.id, reden: 'door de eigenaar ingetrokken' }); setMelding({ ok: true, tekst: tr(lang, 'Дозвіл відкликано. Наступний виклик агента вже буде відхилено.', 'Toestemming ingetrokken. De volgende aanroep van de agent wordt al geweigerd.') }); await laden(); }
    catch (e) { setMelding({ ok: false, tekst: fout(lang, e) }); }
    setBezig('');
  };
  const spokenOpruimen = async () => {
    setBezig('spoken'); setMelding(null);
    try { const r = (await api.post('/api/owner/agent-namens/spoken/opruimen', context)).data as { verwijderd: number }; setMelding({ ok: true, tekst: tr(lang, `Видалено назавжди: ${r.verwijderd}.`, `Definitief verwijderd: ${r.verwijderd}.`) }); await laden(); }
    catch (e) { setMelding({ ok: false, tekst: fout(lang, e) }); }
    setBezig('');
  };
  const naam = (slug: string) => data?.agents.find((a) => a.slug === slug)?.naam || slug;
  const omvangTekst = (id: string) => { const o = data?.omvang.find((x) => x.id === id); return o ? tr(lang, o.uk, o.nl) : id; };

  return (
    <section className='ns' data-namens-sessies='' aria-labelledby='ns-titel'>
      <header className='ns-kop'>
        <div><h2 id='ns-titel'><UserCheck aria-hidden='true' />{tr(lang, 'Агенти від імені власника', 'Agents namens de eigenaar')}</h2>
          <p>{tr(lang, 'Тимчасовий дозвіл агенту читати адмін-розділи від вашого імені. Лише з passkey, до 8 годин. Агент не отримує вашої сесії чи cookie, усі його дії видно в журналі як дії агента. Змінювати ваш акаунт, ролі, доступи, політику ШІ чи секрети агент не може ніколи.', 'Tijdelijke toestemming voor een agent om beheerweergaven namens u te lezen. Alleen met passkey, maximaal 8 uur. De agent krijgt uw sessie of cookie niet; al zijn acties staan in het logboek als acties van de agent. Uw account, rollen, toegang, AI-beleid of geheimen kan een agent nooit wijzigen.')}</p></div>
        <div className='ns-knoppen'>
          <button type='button' onClick={() => void laden()} aria-label={tr(lang, 'Оновити', 'Vernieuwen')}><RefreshCw aria-hidden='true' /></button>
          {!alleenLezen ? <button type='button' className='ns-hoofd' onClick={() => setNieuw(true)}><Plus aria-hidden='true' />{tr(lang, 'Надати дозвіл', 'Toestemming geven')}</button> : null}
        </div>
      </header>
      {melding ? <p className='ns-melding' data-ok={String(melding.ok)} role={melding.ok ? 'status' : 'alert'}>{melding.tekst}</p> : null}

      {!data ? <p className='ns-leeg'>{tr(lang, 'Завантаження…', 'Laden…')}</p> : (
        <>
          {data.actief.length ? (
            <ul className='ns-lijst' aria-label={tr(lang, 'Активні дозволи', 'Actieve toestemmingen')}>
              {data.actief.map((s) => {
                const rest = Math.max(0, s.verlooptOp - nu), totaal = Math.max(1, s.verlooptOp - s.aangemaaktOp);
                return (
                  <li key={s.id} className='ns-kaart' data-namens-id={s.id}>
                    <AgentLogo agent={s.agent} size={36} />
                    <div className='ns-info'>
                      <strong>{naam(s.agent)} <span className='ns-chip' data-ruimte={s.ruimte}>{s.ruimte === 'technisch' ? tr(lang, 'технічний', 'technisch') : tr(lang, 'приватний', 'privé')}</span></strong>
                      <span className='ns-omvang'>{s.omvang.map(omvangTekst).join(' · ')}</span>
                      <div className='ns-balk' aria-hidden='true'><span style={{ width: `${Math.round((rest / totaal) * 100)}%` }} /></div>
                      <small><Clock aria-hidden='true' />{tr(lang, `до ${tijd(lang, s.verlooptOp)} · ще ${Math.ceil(rest / 60000)} хв`, `tot ${tijd(lang, s.verlooptOp)} · nog ${Math.ceil(rest / 60000)} min`)} · {tr(lang, `дій: ${s.acties}`, `acties: ${s.acties}`)}{s.laatstActief ? ` · ${tr(lang, 'остання', 'laatste')} ${tijd(lang, s.laatstActief)}` : ''}</small>
                    </div>
                    {!alleenLezen ? <button type='button' className='ns-intrek' disabled={bezig === s.id} onClick={() => void intrekken(s)}><Ban aria-hidden='true' />{tr(lang, 'Відкликати', 'Intrekken')}</button> : null}
                  </li>
                );
              })}
            </ul>
          ) : <p className='ns-leeg'><ShieldCheck aria-hidden='true' />{tr(lang, 'Жоден агент зараз не діє від вашого імені.', 'Geen enkele agent werkt nu namens u.')}</p>}

          {data.voorbij.length ? (
            <details className='ns-voorbij'><summary>{tr(lang, `Завершені дозволи (${data.voorbij.length})`, `Beëindigde toestemmingen (${data.voorbij.length})`)}</summary>
              <ul>{data.voorbij.map((s) => <li key={s.id}><AgentLogo agent={s.agent} size={20} /> {naam(s.agent)} · {tijd(lang, s.aangemaaktOp)} → {tijd(lang, s.ingetrokkenOp || s.verlooptOp)} · {s.ingetrokkenOp ? tr(lang, 'відкликано', 'ingetrokken') : tr(lang, 'минув строк', 'verlopen')} · {tr(lang, `дій: ${s.acties}`, `acties: ${s.acties}`)}</li>)}</ul>
            </details>
          ) : null}

          {data.spoken.length ? (
            <div className='ns-spoken' data-spoken={data.spoken.length}>
              <h3><Ghost aria-hidden='true' />{tr(lang, `Примарні сесії (знешкоджено): ${data.spoken.length}`, `Spooksessies (onschadelijk gemaakt): ${data.spoken.length}`)}</h3>
              <p>{tr(lang, 'Ці записи створили старі інструменти auto_session / exchange_session (аудит 18.10.2026). Вони вже не дають доступу: сайт їх ігнорує. Їх можна видалити назавжди — з passkey.', 'Deze rijen maakten de oude instrumenten auto_session / exchange_session (audit 18.10.2026). Ze geven geen toegang meer: de site negeert ze. Definitief verwijderen kan met passkey.')}</p>
              <ul>{data.spoken.slice(0, 10).map((s) => <li key={s.id}><code>{s.id.slice(0, 8)}</code> · {tr(lang, 'створено', 'aangemaakt')} {tijd(lang, s.createdAt)} · {s.verwijderdOp ? tr(lang, `знешкоджено ${tijd(lang, s.verwijderdOp)}`, `onschadelijk ${tijd(lang, s.verwijderdOp)}`) : tr(lang, 'ігнорується', 'genegeerd')}</li>)}</ul>
              {!alleenLezen ? <button type='button' disabled={bezig === 'spoken'} onClick={() => void spokenOpruimen()}><Eraser aria-hidden='true' />{tr(lang, 'Очистити назавжди', 'Definitief opruimen')}</button> : null}
            </div>
          ) : null}
        </>
      )}

      {nieuw && data ? (
        <Venster id='namens-nieuw' titel={tr(lang, 'Дозвіл агенту діяти від вашого імені', 'Agent toestemming geven namens u')} prioriteit='kritiek' breedte={560} onSluit={() => setNieuw(false)}>
          <div className='ns-venster'>
            <fieldset><legend>{tr(lang, 'Агент', 'Agent')}</legend>
              <div className='ns-agenten'>{data.agents.map((a) => (
                <label key={a.slug} className='ns-agent' data-gekozen={String(agent === a.slug)}><input type='radio' name='ns-agent' value={a.slug} checked={agent === a.slug} onChange={() => setAgent(a.slug)} /><AgentLogo agent={a.slug} size={28} /><span>{a.naam}</span></label>
              ))}</div>
            </fieldset>
            <fieldset><legend>{tr(lang, 'Простір підключення', 'Ruimte van de koppeling')}</legend>
              <label><input type='radio' name='ns-ruimte' checked={ruimte === 'technisch'} onChange={() => setRuimte('technisch')} /> {tr(lang, 'Технічний (адмін-підключення агента)', 'Technisch (beheerkoppeling van de agent)')}</label>
              <label><input type='radio' name='ns-ruimte' checked={ruimte === 'prive'} onChange={() => setRuimte('prive')} /> {tr(lang, 'Приватний', 'Privé')}</label>
            </fieldset>
            <fieldset><legend>{tr(lang, 'На скільки', 'Hoe lang')}</legend>
              <div className='ns-duren'>{DUREN.filter((m) => m >= data.grenzen.min && m <= data.grenzen.max).map((m) => <button key={m} type='button' aria-pressed={minuten === m} onClick={() => setMinuten(m)}>{duurTekst(lang, m)}</button>)}</div>
            </fieldset>
            <fieldset><legend>{tr(lang, 'Що агент може читати', 'Wat de agent mag lezen')}</legend>
              {data.omvang.map((o) => <label key={o.id}><input type='checkbox' checked={omvang.includes(o.id)} onChange={(e) => setOmvang((v) => (e.target.checked ? [...v, o.id] : v.filter((x) => x !== o.id)))} /> {tr(lang, o.uk, o.nl)}</label>)}
            </fieldset>
            <p className='ns-klein'>{tr(lang, 'Ніколи, навіть із дозволом: зміни акаунта власника, ролей, доступів, passkey, політики ШІ, секретів, видача дозволів іншим.', 'Nooit, ook niet met toestemming: wijzigingen aan het eigenaarsaccount, rollen, toegang, passkeys, AI-beleid, geheimen, rechten aan anderen geven.')}</p>
            <div className='ns-knoppen'>
              <button type='button' onClick={() => setNieuw(false)}><X aria-hidden='true' />{tr(lang, 'Скасувати', 'Annuleren')}</button>
              <button type='button' className='ns-hoofd' disabled={bezig === 'maak' || !omvang.length} onClick={() => void aanmaken()}><Fingerprint aria-hidden='true' />{tr(lang, `Підтвердити passkey і дозволити на ${duurTekst(lang, minuten)}`, `Met passkey bevestigen en ${duurTekst(lang, minuten)} toestaan`)}</button>
            </div>
          </div>
        </Venster>
      ) : null}
    </section>
  );
}
