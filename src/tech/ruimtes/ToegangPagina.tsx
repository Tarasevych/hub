// Eén plek «Доступ і терміни» (vlag tech-ruimtes-v2) met tabbladen, gevoed door POST …/ruimtes/toegang. Elk gegeven staat er één keer;
// de oude plekken (band «Профілі», Безпека → Сесії, згода ШІ) linken hierheen. Het gekozen tabblad blijft bewaard (localStorage).
// AI-toegang heeft ÉÉN termijnenset (AI_TERMIJNEN).
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { ShieldCheck } from 'lucide-react';
import { Venster } from '../../platform/vensters';
import { ruimtesApi, type Ruimte, type RuimtesToegang, type ToegangRegel } from '../ruimtes-api';
import { AI_TERMIJNEN, RUIMTE_NAAM, TABBLADEN, WOORDEN, tabVanRegel, termijnNaam, uurMinuut, type TabId, type Taal } from './teksten';
import { useRuimtes } from './ruimtes-opslag';
import { openTechVenster, techSnelkoppelingenZetten } from '../tech-opslag';
import RuimteWissel from './RuimteWissel';
import { foutTekst } from './StartVenster';
import AiToegangKaart, { groepeerAi, type AiOpslaan } from './AiToegangKaart';
import Merk from '../../merk/Merk';
import './ruimtes.css';

const TAB_SLEUTEL = 'mr-ruimtes-tab';
const leesTab = (): TabId => { try { const v = localStorage.getItem(TAB_SLEUTEL) as TabId | null; return v && TABBLADEN.some((t) => t.id === v) ? v : 'eigen'; } catch { return 'eigen'; } };

export function termijnRegel(r: ToegangRegel, taal: Taal): string {
  const t = r.termijn;
  if (!t) return taal === 'uk' ? 'без терміну' : 'zonder termijn';
  if (t.modus === 'tot-intrekken') return WOORDEN.totIntrekken[taal];
  return termijnNaam(t.modus, taal, t.eindTijd);
}

/** Welke AI-termijnkeuze uit AI_TERMIJNEN op dit moment al exact voor deze regel geldt (nooit twee keer dezelfde stand aanbieden). */
export function actieveAiKeuzeId(r: ToegangRegel): (typeof AI_TERMIJNEN)[number]['id'] | null {
  const heeftTech = (r.ruimtes ?? ['prive']).includes('technisch');
  if (!heeftTech) return 'prive';
  if (r.termijn?.modus === 'tot-technisch-einde') return 'tot-technisch-einde';
  if (r.termijn?.modus === 'tot-site-uitloggen') return 'tot-site-uitloggen';
  return null;
}

export default function ToegangPagina({ taal, sluit, start }: { taal: Taal; sluit: () => void; start?: TabId }) {
  const uk = taal === 'uk';
  const [tab, setTab] = useState<TabId>(start ?? leesTab());
  const [data, setData] = useState<RuimtesToegang | null>(null);
  const [fout, setFout] = useState('');
  const [bezig, setBezig] = useState('');
  const [melding, setMelding] = useState<{ ok: boolean; tekst: string } | null>(null);
  const r = useRuimtes();
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const laad = () => ruimtesApi.toegang().then((d) => { setData(d); setFout(''); }, (e) => setFout(String((e as Error)?.message || 'FOUT')));
  useEffect(() => { void laad(); }, []);
  useEffect(() => { try { localStorage.setItem(TAB_SLEUTEL, tab); } catch { /* geen opslag */ } }, [tab]);
  // AI-TERMIJN-001: andere pagina's (bv. agentpagina «Терміни й правила…») kunnen een tabblad openen terwijl het venster al open is.
  useEffect(() => { const h = (e: Event) => { const v = (e as CustomEvent<TabId>).detail; if (TABBLADEN.some((t) => t.id === v)) setTab(v); }; window.addEventListener('mr-ruimtes-tab', h); return () => window.removeEventListener('mr-ruimtes-tab', h); }, []);
  const toets = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = TABBLADEN.findIndex((t) => t.id === tab);
    const n = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? TABBLADEN.length - 1 : null;
    if (n === null) return;
    e.preventDefault();
    const nieuw = TABBLADEN[(n + TABBLADEN.length) % TABBLADEN.length].id;
    setTab(nieuw); tabRefs.current[nieuw]?.focus();
  };
  const regels = (data?.regels ?? []).filter((x) => tabVanRegel(x) === tab);
  const [openKaart, setOpenKaart] = useState('');
  const [nu, setNu] = useState(() => Date.now());
  useEffect(() => { const i = setInterval(() => setNu(Date.now()), 30_000); return () => clearInterval(i); }, []);
  const aiOpslaan = async (o: AiOpslaan) => {
    setBezig(o.sleutel); setMelding(null);
    try {
      setData(await ruimtesApi.aiZetten(o.sleutel, ['prive', 'technisch'] as Ruimte[], o.termijn, o.minuten, { eindOp: o.eindOp ?? null, regels: o.regels, naam: o.naam || undefined, alleVerbindingen: o.sleutel === '*' }));
      setOpenKaart(''); setNu(Date.now());
      setMelding({ ok: true, tekst: uk ? `Збережено: ${o.naam || 'усі ШІ'}. Запис додано в журнал і центр сповіщень.` : `Opgeslagen: ${o.naam || 'alle AI'}. Vastgelegd in journaal en meldingencentrum.` });
    } catch (e) { setMelding({ ok: false, tekst: `${uk ? 'Не збережено' : 'Niet opgeslagen'}: ${foutTekst(String((e as Error)?.message || 'FOUT'), uk)}` }); }
    finally { setBezig(''); }
  };
  const aiIntrekken = async (sleutel: string, naam: string) => {
    setBezig(sleutel); setMelding(null);
    try { setData(await ruimtesApi.aiIntrekken(sleutel, naam)); setMelding({ ok: true, tekst: uk ? `Технічний доступ знято: ${naam}. Звичайний простір лишається.` : `Technische toegang ingetrokken: ${naam}. De gewone ruimte blijft.` }); }
    catch (e) { setMelding({ ok: false, tekst: `${uk ? 'Не знято' : 'Niet ingetrokken'}: ${foutTekst(String((e as Error)?.message || 'FOUT'), uk)}` }); }
    finally { setBezig(''); }
  };
  const zetYarlykToegang = async (x: ToegangRegel) => {
    if (!x.userId) return;
    const nieuw = !x.snelkoppelingenToegestaan;
    setBezig(x.id); setMelding(null);
    try {
      await techSnelkoppelingenZetten(x.userId, nieuw);
      await laad();
      setMelding({ ok: true, tekst: uk ? `Ярлики в обох частинах меню для ${x.naam} ${nieuw ? 'дозволено' : 'заборонено'}.` : `Snelkoppelingen in beide delen voor ${x.naam} ${nieuw ? 'toegestaan' : 'uitgeschakeld'}.` });
    } catch (e) {
      setMelding({ ok: false, tekst: `${uk ? 'Не збережено' : 'Niet opgeslagen'}: ${foutTekst(String((e as Error)?.message || 'FOUT'), uk)}` });
    } finally { setBezig(''); }
  };
  void AI_TERMIJNEN; void actieveAiKeuzeId;
  const s = r.status;
  const aiMag = !!s && s.actief === 'technisch' && !!s.sessie;
  const aiReden = uk ? 'Давати чи змінювати доступ ШІ можна лише в технічному просторі (не на паузі) і з Passkey. Зняти доступ можна будь-коли.' : 'AI-toegang geven of wijzigen kan alleen in de technische ruimte (niet gepauzeerd) en met Passkey. Intrekken kan altijd.';
  return (
    <Venster id='tech-ruimte-toegang' titel={WOORDEN.toegangPagina[taal]} breedte={820} onSluit={sluit}>
      <div className='tech-venster rt' data-tech-venster='toegang'>
        <div className='rt-tabs' role='tablist' aria-label={WOORDEN.toegangPagina[taal]} onKeyDown={toets}>
          {TABBLADEN.map((t) => (
            <button key={t.id} ref={(el) => { tabRefs.current[t.id] = el; }} type='button' role='tab' id={`rt-tab-${t.id}`} aria-controls={`rt-paneel-${t.id}`} aria-selected={tab === t.id} tabIndex={tab === t.id ? 0 : -1} data-rt-tab={t.id} onClick={() => setTab(t.id)}>{t.naam[taal]}</button>
          ))}
        </div>
        <section className='rt-paneel' role='tabpanel' id={`rt-paneel-${tab}`} aria-labelledby={`rt-tab-${tab}`} data-rt-paneel={tab}>
          {tab === 'eigen' && s ? (
            <div className='rt-eigen'>
              <RuimteWissel taal={taal} />
              <dl className='rt-feiten'>
                <dt>{uk ? 'Зараз' : 'Nu'}</dt><dd data-rt-nu='1'>{RUIMTE_NAAM[s.actief][taal]}{s.pauze ? (uk ? ' · технічний на паузі' : ' · technisch gepauzeerd') : ''}</dd>
                <dt>{uk ? 'Термін' : 'Termijn'}</dt><dd data-rt-termijn='1'>{s.sessie ? termijnNaam(s.sessie.modus, taal, s.sessie.eindTijd) : (uk ? 'технічний сеанс не розпочато' : 'geen technische sessie')}</dd>
                <dt>{uk ? 'Ролі' : 'Rollen'}</dt><dd>{s.rollen.map((x) => `${x.naam} (≤ ${x.maxMinuten >= 60 ? `${x.maxMinuten / 60} ${uk ? 'год' : 'u'}` : `${x.maxMinuten} ${uk ? 'хв' : 'min'}`})`).join(' · ') || '—'}</dd>
              </dl>
              {/* INTEG-001 (03.11.2026): geen aparte knop «Увійти в технічний простір» meer naast de tumbler hierboven — die tumbler IS de
                  ingang (aanzetten zonder sessie opent hetzelfde startvenster). «Змінити термін» blijft zolang er een sessie loopt. */}
              <div className='tech-knoppen'>
                {s.sessie ? <button type='button' onClick={() => openTechVenster('activeren')} data-rt-knop='termijn'>{WOORDEN.wijzigTermijn[taal]}</button> : null}
                <button type='button' onClick={() => openTechVenster('uitloggen')} data-rt-knop='uitloggen'>{uk ? 'Вийти…' : 'Afmelden…'}</button>
              </div>
            </div>
          ) : null}
          {fout ? <p className='tech-melding' role='alert'>{uk ? 'Не вдалося завантажити' : 'Laden mislukt'} ({fout}). <button type='button' onClick={() => void laad()}>{uk ? 'Спробувати знову' : 'Opnieuw'}</button></p> : null}
          {!data && !fout ? <p className='tech-meta' role='status'>{uk ? 'Завантаження…' : 'Laden…'}</p> : null}
          {data && tab === 'ai' ? (
            <div className='ait-lijst' data-rt-lijst='ai'>
              <p className='ait-intro'>{uk
                ? 'Тут ви вирішуєте, скільки часу кожен ШІ може працювати у вашому технічному просторі і коли доступ скидається. Типові правила найбезпечніші; ширші варіанти позначено «!».'
                : 'Hier bepaalt u hoe lang elke AI in uw technische ruimte mag werken en wanneer die toegang vervalt. De standaardregels zijn het veiligst; ruimere keuzes dragen «!».'}</p>
              {groepeerAi(regels).map((g) => (
                <AiToegangKaart key={g.sleutel} taal={taal} groep={g} nu={nu} mag={aiMag} magReden={aiReden} bezig={bezig === g.sleutel} open={openKaart === g.sleutel}
                  onOpen={(o) => setOpenKaart(o ? g.sleutel : '')} onOpslaan={(o) => void aiOpslaan(o)} onIntrekken={(k, n) => void aiIntrekken(k, n)} />
              ))}
              {!regels.length ? <p className='tech-meta' data-rt-leeg='1'>{uk ? 'Жоден ШІ ще не підключений.' : 'Nog geen AI gekoppeld.'}</p> : null}
            </div>
          ) : data ? (regels.length ? (
            <ul className='rt-lijst' data-rt-lijst={tab}>{regels.map((x) => (
              <li key={x.id} data-rt-regel={x.soort}>
                {x.soort === 'sessie' ? (
                  <span className='rt-sessie'>
                    <Merk merk={x.browser || 'browser'} naam={x.browser || 'Browser'} maat={28} />
                    <span className='rt-sessie-tekst'>
                      <b>{x.dienst ? `${x.dienst}.*` : (uk ? 'Вхід на сайт' : 'Aanmelding')}{x.deze ? <span className='rt-deze'>{uk ? 'ця вкладка' : 'dit tabblad'}</span> : null}</b>
                      <small>{[x.browser, x.apparaat].filter(Boolean).join(' · ') || (uk ? 'пристрій невідомий' : 'apparaat onbekend')}</small>
                    </span>
                  </span>
                ) : <span className='rt-wie'><b>{x.naam}</b>{x.detail ? <small>{x.detail}</small> : null}</span>}
                <span className='rt-termijn'>{termijnRegel(x, taal)}{x.termijn?.eindTijd && x.termijn.modus !== 'tijd' ? ` · ${uurMinuut(x.termijn.eindTijd, taal)}` : ''}</span>
                {x.soort === 'sessie' ? <span className={`rt-sessie-stand${x.actief ? ' is-tech' : ''}`}>{x.actief ? (uk ? 'працює' : 'actief') : (uk ? 'на паузі' : 'gepauzeerd')}</span> : null}
                {x.ruimtes && x.soort !== 'sessie' ? <span className='rt-ruimtes'>{x.ruimtes.map((q) => RUIMTE_NAAM[q][taal]).join(' + ')}</span> : null}
                {tab === 'mensen' && x.soort === 'persoon' && x.actief && x.userId && data.magBeheren ? (
                  <button type='button' className={x.snelkoppelingenToegestaan ? 'is-hoofd' : ''} aria-pressed={!!x.snelkoppelingenToegestaan} disabled={bezig === x.id} data-rt-yarlyk={x.userId} onClick={() => void zetYarlykToegang(x)}>
                    <ShieldCheck aria-hidden='true' />{' '}
                    {x.snelkoppelingenToegestaan ? (uk ? 'Ярлики в обох частинах: дозволено' : 'Snelkoppelingen: aan') : (uk ? 'Ярлики в обох частинах: вимкнено' : 'Snelkoppelingen: uit')}
                  </button>
                ) : null}
              </li>
            ))}</ul>
          ) : tab !== 'eigen' ? <p className='tech-meta' data-rt-leeg='1'>{uk ? 'Тут поки нічого немає.' : 'Hier staat nog niets.'}</p> : null) : null}
          {tab === 'ai' && data && !aiMag ? <p className='tech-meta' data-rt-ai-reden='1'>{aiReden}</p> : null}
          {tab === 'mensen' && data && !data.magBeheren ? <p className='tech-meta' data-rt-mensen-reden='1'>{uk ? 'Список видно лише в технічному просторі з правом керувати людьми.' : 'De lijst is alleen zichtbaar in de technische ruimte met het recht om mensen te beheren.'}</p> : null}
          {data?.fouten.length ? <p className='tech-melding' role='alert' data-rt-fouten='1'>{uk ? 'Не вдалося прочитати: ' : 'Niet gelezen: '}{data.fouten.join(', ')}</p> : null}
          {melding ? <p className={`tech-melding${melding.ok ? ' is-ok' : ''}`} role={melding.ok ? 'status' : 'alert'}>{melding.tekst}</p> : null}
        </section>
        <div className='tech-knoppen'><button type='button' onClick={sluit}>{uk ? 'Закрити' : 'Sluiten'}</button></div>
      </div>
    </Venster>
  );
}
