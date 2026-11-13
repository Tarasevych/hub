// «Браузер і агенти» — ÉÉN scherm voor alles wat een AI via de browserextensie mag (zone E, 22.10.2026; hub mcp.*/agents#browser).
//
// Klacht 1 van de eigenaar: «Що може ШІ» was onvindbaar en los van het ontgrendelen. Hier staat alles bij elkaar:
//   1. de twee sloten (privé / technisch) met hun stand, termijn en de knoppen «Відкрити доступ» / «Заблокувати»;
//   2. de matrix slot × mogelijkheid × agent (claude, gpt, grok, gemini, copilot, cursor, «усі»), met snelle sets, per vinkje een «?»
//      (shared/hulp-register.ts ← HELP_MATRIX), opslaan met step-up als het ruimer wordt; een lopende ontgrendeling wordt meteen
//      opnieuw ondertekend (server: capsHerzien) — geen tweede passkey/step-up;
//   3. de laatste weigeringen EXTENSIE_* van de connector, in gewone taal, met de rij/kolom die ontbreekt;
//   4. een korte uitleg voor agenten (docs/agenten/BROWSER-VIA-CONNECTOR.md).
// INTEG-001 (03.11.2026): elk onderdeel is een blok (.ag-blok: naam, één zin, knoppen in de kop); de eigen h2 «Браузер і агенти» is weg
// (de sectiekop van de hub draagt die naam al). Eigen opmaak binnen de blokken: src/agenten/agenten-tabs-2.css.
// Server: GET/POST /api/owner/agents/extensie-matrix (MatrixStand), POST …/zet, POST …/snel (backend/extensie-matrix.ts).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Ban, Bot, Check, Eye, Hand, KeyRound, Lock, LockOpen, RefreshCw, Save, ShieldCheck, ShieldOff, User } from 'lucide-react';
import HulpVraag from '../hulp/HulpVraag';
import { api } from '../platform/client';
import { foutTekst } from '../agenten/fouten';
import { openTechVenster, techActief, techBody, useTech } from '../tech/tech-opslag';
import type { AiRuimte } from '../../shared/ai-ruimte';
import { ADMIN_HOSTS_STANDAARD, ADMIN_HOSTS_TOEGESTAAN, PRIVE_HOSTS, STAAT_TEKST, type BrowserCap, type ExtensieStaat } from '../../shared/extensie-ontgrendeling';
import {
  BROWSER_BEHEER_URL, CAP_INFO, MATRIX_AGENTEN, MATRIX_AGENT_ALLE, SNEL_SETS, capsVoorAgent, capsVoorRuimte, eindeWeergave, termijnenVoorRuimte,
  type Matrix, type MatrixAgent, type MatrixStand, type TermijnId,
} from '../../shared/extensie-matrix';
import { combineer, useExtensieLiveToestand, type ExtensieLive } from './extensie-live';
import { V2_OPTIES } from '../../shared/connector-v2/catalogus';
import { intrekken, ontgrendelen, ontgrendelenPrive, type Weigering } from './ExtensieOntgrendeling';
import { restLang } from './ExtensiePrive';
import './ExtensieOntgrendeling.css';
import './BrowserEnAgenten.css';
import { alleenMens, geenAi } from '../menselijke-actie';
import '../agenten/agenten-tabs-2.css';

type Tr = (uk: string, nl: string) => string;
const RUIMTES: AiRuimte[] = ['prive', 'technisch'];
const kort = (c: BrowserCap) => c.replace('browser.', '');
const body = () => techBody();
const datumTijd = (ms: number, uk: boolean) => new Date(ms).toLocaleString(uk ? 'uk-UA' : 'nl-NL', { day: '2-digit', month: '2-digit', ...(new Date(ms).getFullYear() !== new Date().getFullYear() ? { year: 'numeric' as const } : {}), hour: '2-digit', minute: '2-digit' });

/** Matrix (één ruimte) als bewerkbare kaart: agent → set caps. */
type Kaart = Record<MatrixAgent, Set<BrowserCap>>;
function kaartVan(m: Matrix, ruimte: AiRuimte): Kaart {
  const k = {} as Kaart;
  for (const a of MATRIX_AGENTEN) k[a] = new Set(capsVoorAgent(m, ruimte, a === MATRIX_AGENT_ALLE ? null : a) ?? []);
  return k;
}
const gelijk = (a: Kaart, b: Kaart) => MATRIX_AGENTEN.every((x) => a[x].size === b[x].size && [...a[x]].every((c) => b[x].has(c)));

export default function BrowserEnAgenten({ tr, naarExtensie, openSlot = '' }: { tr: Tr; naarExtensie?: () => void; openSlot?: '' | 'prive' | 'technisch' }) {
  const uk = tr('uk', 'nl') === 'uk';
  const tech = useTech();
  const t = useExtensieLiveToestand();
  const [stand, setStand] = useState<MatrixStand | null>(null);
  const [laadFout, setLaadFout] = useState('');
  const [ruimte, setRuimte] = useState<AiRuimte>(openSlot || 'prive');
  const [kaart, setKaart] = useState<Kaart | null>(null);
  const [inst, setInst] = useState<{ zonderBevestiging: boolean; devtoolsNamen: boolean } | null>(null);
  const [bezig, setBezig] = useState('');
  const [melding, setMelding] = useState<{ ok: boolean; tekst: string } | null>(null);
  const [bevestigAlles, setBevestigAlles] = useState(false);
  // Telefoon (≤ 560 px): de matrix toont één agentkolom tegelijk (CSS verbergt de rest); hier kiest u welke.
  const [kolom, setKolom] = useState<MatrixAgent>(MATRIX_AGENT_ALLE);
  const [nu, setNu] = useState(() => Date.now());
  useEffect(() => { const i = window.setInterval(() => setNu(Date.now()), 15_000); return () => window.clearInterval(i); }, []);
  // ?ontgrendelen=prive|technisch (розширення 0.7): цей слот і фокус на виборі строку.
  // Строк з’являється лише коли браузер підключено (`kan`); доти гортаємо до картки слота і пробуємо ще раз.
  useEffect(() => {
    if (!openSlot) return;
    setRuimte(openSlot);
    let n = 0;
    const t = window.setInterval(() => {
      n += 1;
      const termijn = document.querySelector(`[data-bea-termijn="${openSlot}"]`);
      const slot = document.getElementById(`bea-slot-${openSlot}`);
      if (termijn instanceof HTMLElement) {
        try { termijn.focus(); termijn.scrollIntoView({ block: 'center' }); } catch { /* geen DOM */ }
        window.clearInterval(t);
      } else if (slot && n === 1) {
        try { slot.scrollIntoView({ block: 'center' }); } catch { /* geen DOM */ }
      } else if (n > 25) window.clearInterval(t);
    }, 100);
    return () => window.clearInterval(t);
  }, [openSlot]);

  const laden = useCallback(async () => {
    try { const r = await api.post('/api/owner/agents/extensie-matrix', body()); setStand(r.data as MatrixStand); setLaadFout(''); }
    catch (e) { setLaadFout(foutTekst(e, tr, ['Не вдалося завантажити матрицю', 'Matrix laden mislukt'])); }
  }, [tr]);
  useEffect(() => { void laden(); }, [laden]);
  // Bij een nieuwe stand (laden, opslaan, snelle set) of een slotwissel: de bewerkbare kaart opnieuw uit de server nemen.
  useEffect(() => {
    if (!stand) return;
    setKaart(kaartVan(stand.matrix, ruimte));
    setInst({ ...stand.matrix.instellingen[ruimte] });
  }, [stand, ruimte]);

  const basis = useMemo(() => (stand ? kaartVan(stand.matrix, ruimte) : null), [stand, ruimte]);
  const dirty = !!(kaart && basis && (!gelijk(kaart, basis) || (inst && stand && (inst.zonderBevestiging !== stand.matrix.instellingen[ruimte].zonderBevestiging || inst.devtoolsNamen !== stand.matrix.instellingen[ruimte].devtoolsNamen))));
  const caps = capsVoorRuimte(ruimte);
  const agentNaam = (a: MatrixAgent) => (a === MATRIX_AGENT_ALLE ? tr('усі агенти', 'alle agenten') : (stand?.agenten.find((x) => x.slug === a)?.naam ?? a));
  const live: Record<AiRuimte, ExtensieLive> = { prive: combineer(t, undefined, nu, 'prive'), technisch: combineer(t, undefined, nu, 'technisch') };

  const zet = (agent: MatrixAgent, c: BrowserCap, aan: boolean) => setKaart((k) => {
    if (!k) return k;
    const n = { ...k, [agent]: new Set(k[agent]) } as Kaart;
    if (aan) n[agent].add(c); else n[agent].delete(c);
    return n;
  });
  // Groepsknoppen (overgenomen uit de hub-UX): veilige of gevaarlijke mogelijkheden in één keer toestaan of intrekken, voor de gekozen
  // agentkolom. Ze wijzigen alleen de bewerkbare kaart; pas «Opslaan» schrijft naar de server (zelfde controle als bij een vinkje).
  const groepCaps = (g: 'veilig' | 'gevaarlijk' | 'alles') => caps.filter((c) => g === 'alles' || (g === 'veilig' ? !CAP_INFO[c].gevaarlijk : !!CAP_INFO[c].gevaarlijk));
  const groepAllesAan = (g: 'veilig' | 'gevaarlijk' | 'alles') => { const lijst = groepCaps(g); const set = kaart?.[kolom]; return lijst.length > 0 && !!set && lijst.every((c) => set.has(c)); };
  const zetGroep = (g: 'veilig' | 'gevaarlijk' | 'alles', aan: boolean) => setKaart((k) => {
    if (!k) return k;
    const n = { ...k, [kolom]: new Set(k[kolom]) } as Kaart;
    for (const c of groepCaps(g)) { if (aan) n[kolom].add(c); else n[kolom].delete(c); }
    return n;
  });
  const opslaan = async () => {
    if (!kaart || !inst) return;
    setBezig('opslaan'); setMelding(null);
    try {
      const r = await api.post('/api/owner/agents/extensie-matrix/zet', { ...body(), ruimte, rijen: MATRIX_AGENTEN.map((agent) => ({ agent, caps: caps.filter((c) => kaart[agent].has(c)) })), instellingen: inst });
      const d = r.data as MatrixStand & { herzien?: number };
      setStand(d);
      setMelding({ ok: true, tekst: d.herzien ? tr(`Збережено. Чинне розблокування переподписано (${d.herzien}) — агентам нічого не треба робити заново.`, `Opgeslagen. De lopende ontgrendeling is opnieuw ondertekend (${d.herzien}) — agenten hoeven niets opnieuw te doen.`) : tr('Збережено.', 'Opgeslagen.') });
    } catch (e) { setMelding({ ok: false, tekst: foutTekst(e, tr, ['Не вдалося зберегти', 'Opslaan mislukt']) }); }
    setBezig('');
  };
  const snel = async (set: keyof typeof SNEL_SETS) => {
    setBezig(`snel:${set}`); setMelding(null); setBevestigAlles(false);
    try {
      const r = await api.post('/api/owner/agents/extensie-matrix/snel', { ...body(), ruimte, set });
      setStand(r.data as MatrixStand);
      setMelding({ ok: true, tekst: tr(`Застосовано: ${SNEL_SETS[set].uk}.`, `Toegepast: ${SNEL_SETS[set].nl}.`) });
    } catch (e) { setMelding({ ok: false, tekst: foutTekst(e, tr, ['Не вдалося застосувати', 'Toepassen mislukt']) }); }
    setBezig('');
  };

  // INTEG-001 (agpag2, 03.11.2026): vijf blokken (.ag-blok, contract van agenten-pagina.css) — elk met een naam, één zin waarvoor
  // het dient en de knoppen in de kop. De dubbele kop «Браузер і агенти» is weg: die staat al in de kop van de sectie op de hub.
  return (
    // SEC-002 extensie-02: wat een AI in de browser mag, beslist alleen de mens — de extensie bedient deze hele zone niet en de
    // beslisknoppen tellen alleen een echte klik (een AI met «Клік і введення» gaf zichzelf hier anders alles).
    <div className='bea ag2-blokken' data-tab-inhoud='browser' data-bea-ruimte={ruimte} {...geenAi}>
      {laadFout ? <p className='ag-melding ag-melding-fout' role='alert'>{laadFout}</p> : null}

      {/* ---------------------------------------------------------------- 1. sloten */}
      <section className='ag-blok' data-ag-blok='browser-sloten' aria-labelledby='bea-sloten-kop'>
        <header className='ag-blok-kop'>
          <h3 className='ag-blok-titel' id='bea-sloten-kop'><LockOpen aria-hidden='true' /> {tr('Доступ розширення зараз', 'Toegang van de extensie nu')}</h3>
          <p className='ag-blok-uitleg'>{tr('Приватний слот відкриває ваші сторінки, технічний — адмін-сторінки; кожен відкривається на обраний строк і блокується одним натиском.', 'Het privéslot opent uw pagina’s, het technische de beheerpagina’s; elk gaat open voor de gekozen termijn en gaat met één klik weer dicht.')}</p>
        </header>
        <div className='bea-sloten' aria-label={tr('Слоти розширення', 'Sloten van de extensie')}>
          {RUIMTES.map((r) => <SlotKaart key={r} tr={tr} uk={uk} ruimte={r} live={live[r]} nu={nu} stand={stand} techProfiel={live[r].techProfiel ?? (tech.geladen ? !!tech.profiel : false)} techActief={techActief(tech)} naarExtensie={naarExtensie} naLaden={laden} />)}
        </div>
      </section>

      {/* ---------------------------------------------------------------- 2. matrix */}
      <section className='ag-blok' aria-labelledby='bea-matrix-kop' data-ag-blok='browser-matrix' data-bea-matrix={ruimte}>
        <header className='ag-blok-kop'>
          <h3 className='ag-blok-titel' id='bea-matrix-kop'><Bot aria-hidden='true' /> {tr('Що може кожен агент', 'Wat elke agent mag')} <HulpVraag k='browser.matrix.agent' uk={uk} label={tr('Що може кожен агент', 'Wat elke agent mag')} /></h3>
          <p className='ag-blok-uitleg'>{tr('Усі агенти (Claude, ChatGPT, Grok, Gemini, Copilot, Cursor) отримують ті самі інструменти браузера — що саме кожен може, вирішує ця матриця.', 'Alle agenten (Claude, ChatGPT, Grok, Gemini, Copilot, Cursor) krijgen dezelfde browserhulpmiddelen — wat elk precies mag, beslist deze matrix.')}</p>
          <div className='ag-knoppen ag2-vol-telefoon'>
            <div className='ag2-slotkeuze' role='radiogroup' aria-label={tr('Слот', 'Slot')}>
              {RUIMTES.map((r) => (
                <button key={r} type='button' role='radio' aria-checked={ruimte === r} data-hulp-vrij='keuze' data-bea-slotkeuze={r} onClick={() => { if (!dirty || window.confirm(tr('Незбережені зміни буде втрачено. Перейти?', 'Niet-opgeslagen wijzigingen gaan verloren. Doorgaan?'))) setRuimte(r); }}>
                  {r === 'prive' ? <User aria-hidden='true' /> : <ShieldCheck aria-hidden='true' />}<span>{r === 'prive' ? tr('Приватний слот', 'Privéslot') : tr('Технічний слот', 'Technisch slot')}</span>
                </button>
              ))}
            </div>
          </div>
        </header>
        <div className='ag2-matrix'>
        {stand && !stand.ingesteld[ruimte] ? (
          <p className='bea-erfenis' role='status' data-bea-erfenis={ruimte}>
            <Eye size={16} aria-hidden='true' />
            <span>{tr('Матрицю для цього слота ще не збережено: діють старі дозволи «Що може ШІ» на кожному браузері', 'De matrix voor dit slot is nog niet opgeslagen: de oude toestemmingen «Wat mag de AI» per browser gelden')}
              {stand.erfenis[ruimte].length ? ` (${stand.erfenis[ruimte].map((c) => (uk ? CAP_INFO[c].uk[0] : CAP_INFO[c].nl[0])).join(', ')})` : tr(' (жодного)', ' (geen)')}. {tr('Позначте потрібне й натисніть «Зберегти» — відтоді керує ця матриця.', 'Vink aan wat nodig is en klik «Opslaan» — vanaf dan beslist deze matrix.')}</span>
          </p>
        ) : null}
        <div className='bea-snel' role='group' aria-label={tr('Швидкі набори для всіх агентів', 'Snelle sets voor alle agenten')}>
          <span className='ag2-noot'>{tr('Швидко для всіх агентів:', 'Snel voor alle agenten:')}</span>
          <button type='button' className='eo-knop' disabled={!!bezig} data-bea-snel='alles' onClick={() => setBevestigAlles(true)}><LockOpen aria-hidden='true' />{tr(SNEL_SETS.alles.uk, SNEL_SETS.alles.nl)}</button>
          <button type='button' className='eo-knop' disabled={!!bezig} data-bea-snel='lezen' onClick={() => void snel('lezen')}><Eye aria-hidden='true' />{tr(SNEL_SETS.lezen.uk, SNEL_SETS.lezen.nl)}</button>
          <button type='button' className='eo-knop is-gevaar' disabled={!!bezig} data-bea-snel='niets' onClick={() => void snel('niets')}><Lock aria-hidden='true' />{tr(SNEL_SETS.niets.uk, SNEL_SETS.niets.nl)}</button>
        </div>
        {bevestigAlles ? (
          <div className='bea-waarschuwing' role='alertdialog' aria-label={tr('Підтвердження', 'Bevestiging')} data-bea-waarschuwing='alles'>
            <AlertTriangle aria-hidden='true' />
            <p>{ruimte === 'technisch'
              ? tr('Усі агенти зможуть читати, відкривати, натискати, робити знімки, читати консоль, запускати глибоку діагностику й виконувати скрипти в технічних вкладках. Це режим розробки: будь-яка помилка моделі — одразу дія на адмін-сторінках. Сервер попросить підтвердити вхід.', 'Alle agenten kunnen lezen, openen, klikken, schermafdrukken maken, de console lezen, diepe diagnose draaien en scripts uitvoeren in technische tabbladen. Dit is de ontwikkelmodus: elke fout van het model is meteen een actie op de beheerpagina’s. De server vraagt een bevestiging van de aanmelding.')
              : tr('Усі агенти зможуть читати, відкривати, натискати, робити знімки й читати консоль на ваших сторінках (пошта, файли, хаб). Сервер попросить підтвердити вхід.', 'Alle agenten kunnen lezen, openen, klikken, schermafdrukken maken en de console lezen op uw pagina’s (mail, bestanden, hub). De server vraagt een bevestiging van de aanmelding.')}</p>
            <div className='eo-knoppen'>
              <button type='button' className='eo-knop is-hoofd' onClick={alleenMens(() => void snel('alles'))} data-bea-snel-ok='1'><Check aria-hidden='true' />{tr('Так, дозволити все', 'Ja, alles toestaan')}</button>
              <button type='button' className='eo-knop' onClick={() => setBevestigAlles(false)}>{tr('Скасувати', 'Annuleren')}</button>
            </div>
          </div>
        ) : null}

        {kaart ? (
          <label className='eo-veld bea-kolomkeuze'>
            <span>{tr('Показати стовпчик', 'Kolom tonen')} <HulpVraag k='browser.matrix.kolom' uk={uk} label={tr('Стовпчик агента', 'Kolom van de agent')} /></span>
            <select data-hulp='browser.matrix.kolom' value={kolom} onChange={(e) => setKolom(e.target.value as MatrixAgent)} data-bea-kolomkeuze='1'>
              {MATRIX_AGENTEN.map((a) => {
                const ag = stand?.agenten.find((x) => x.slug === a);
                return <option key={a} value={a}>{a === MATRIX_AGENT_ALLE ? tr('Усі агенти — типово для решти', 'Alle agenten — standaard voor de rest') : `${ag?.naam ?? a} — ${ag?.verbonden ? tr('підключено', 'gekoppeld') : tr('не підключено', 'niet gekoppeld')}`}</option>;
              })}
            </select>
          </label>
        ) : null}
        {kaart ? (
          <div className='bea-tabel-wrap'>
            <div className='ag2-matrix-groepen' data-bea-groepen={kolom}>
              <small className='hub-meta'>{tr('Для:', 'Voor:')} <b>{agentNaam(kolom)}</b></small>
              {(['veilig', 'gevaarlijk'] as const).map((g) => {
                const aan = groepAllesAan(g);
                return (
                  <button key={g} type='button' className='eo-knop' disabled={!!bezig} data-bea-groep={g} data-bea-groep-aan={aan ? 'ja' : 'nee'} onClick={() => zetGroep(g, !aan)}>
                    {aan ? <Ban aria-hidden='true' /> : <ShieldCheck aria-hidden='true' />}
                    {g === 'veilig'
                      ? (aan ? tr('Безпечні: зняти всі', 'Veilige: alles intrekken') : tr('Безпечні: дозволити всі', 'Veilige: alles toestaan'))
                      : (aan ? tr('Небезпечні: зняти всі', 'Gevaarlijke: alles intrekken') : tr('Небезпечні: дозволити всі', 'Gevaarlijke: alles toestaan'))}
                  </button>
                );
              })}
              <button type='button' className='eo-knop' disabled={!!bezig} data-bea-groep='alles' data-bea-groep-aan={groepAllesAan('alles') ? 'ja' : 'nee'} onClick={() => zetGroep('alles', !groepAllesAan('alles'))}>
                {groepAllesAan('alles') ? <Ban aria-hidden='true' /> : <ShieldCheck aria-hidden='true' />}
                {groepAllesAan('alles') ? tr('Усе зняти', 'Alles intrekken') : tr('Усе дозволити', 'Alles toestaan')}
              </button>
              <small className='hub-meta'>{tr('Зміни діють після «Зберегти».', 'Wijzigingen gelden na «Opslaan».')}</small>
            </div>
            <table className='bea-tabel' data-bea-tabel={ruimte} data-bea-kolom={kolom}>
              <thead>
                <tr>
                  <th scope='col'>{tr('Можливість', 'Mogelijkheid')}</th>
                  {MATRIX_AGENTEN.map((a) => {
                    const ag = stand?.agenten.find((x) => x.slug === a);
                    return (
                      <th key={a} scope='col' data-bea-agent={a} className={[ag?.verbonden ? 'is-verbonden' : '', a === kolom ? 'is-gekozen' : ''].filter(Boolean).join(' ') || undefined}>
                        <span className='bea-agent-naam'>{a === MATRIX_AGENT_ALLE ? tr('усі', 'alle') : ag?.naam ?? a}</span>
                        {a !== MATRIX_AGENT_ALLE ? <small className='bea-agent-stand'>{ag?.verbonden ? tr('підключено', 'gekoppeld') : tr('не підключено', 'niet gekoppeld')}</small> : <small className='bea-agent-stand'>{tr('типово для решти', 'standaard voor de rest')}</small>}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {caps.map((c) => (
                  <tr key={c} data-bea-cap={c} className={CAP_INFO[c].gevaarlijk ? 'is-gevaarlijk' : ''}>
                    <th scope='row'>
                      <span className='bea-cap-naam'>{uk ? CAP_INFO[c].uk[0] : CAP_INFO[c].nl[0]} <HulpVraag k={`browser.matrix.${kort(c)}`} uk={uk} label={uk ? CAP_INFO[c].uk[0] : CAP_INFO[c].nl[0]} /></span>
                      <small className='bea-cap-uitleg'>{uk ? CAP_INFO[c].uk[1] : CAP_INFO[c].nl[1]}</small>
                    </th>
                    {MATRIX_AGENTEN.map((a) => (
                      <td key={a} data-bea-cel={`${a}:${c}`} className={a === kolom ? 'is-gekozen' : undefined}>
                        <label className='bea-cel'>
                          <input type='checkbox' data-hulp={`browser.matrix.${kort(c)}`} checked={kaart[a].has(c)} disabled={!!bezig} onChange={(e) => zet(a, c, e.target.checked)}
                            aria-label={`${uk ? CAP_INFO[c].uk[0] : CAP_INFO[c].nl[0]} — ${agentNaam(a)}`} />
                          <span className='bea-vink' aria-hidden='true'>
                            {!kaart[a].has(c) ? <Ban size={14} /> : CAP_INFO[c].gevaarlijk && inst && !inst.zonderBevestiging ? <Hand size={14} /> : <ShieldCheck size={14} />}
                          </span>
                        </label>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className='hub-meta ag2-legenda' data-bea-legenda='1'>
              <span><Ban size={13} aria-hidden='true' /> {tr('заборонено', 'verboden')}</span>
              <span><ShieldCheck size={13} aria-hidden='true' /> {tr('дозволено', 'toegestaan')}</span>
              <span><Hand size={13} aria-hidden='true' /> {tr('дозволено, але кожна небезпечна дія спершу чекає вашого підтвердження (якщо нижче не ввімкнено «Без підтвердження»)', 'toegestaan, maar elke gevaarlijke stap vraagt eerst uw bevestiging (tenzij «Zonder bevestiging» hieronder aan staat)')}</span>
            </p>
          </div>
        ) : <p className='hub-meta'>{tr('Завантаження…', 'Laden…')}</p>}

        {inst ? (
          <div className='bea-instellingen'>
            <label className='bea-schakel'>
              <button type='button' role='switch' aria-checked={inst.zonderBevestiging} data-hulp='browser.matrix.zonder-bevestiging' data-bea-schakel='zonder-bevestiging' disabled={!!bezig} className={`hub-toggle${inst.zonderBevestiging ? ' is-aan' : ''}`} onClick={() => setInst({ ...inst, zonderBevestiging: !inst.zonderBevestiging })} aria-label={tr('Без підтвердження кожної дії', 'Zonder bevestiging per actie')} />
              <span>{tr('Дії без підтвердження кожного кроку (клік/введення, скріншот, діагностика, скрипти)', 'Acties zonder bevestiging per stap (klikken/typen, schermafdruk, diagnose, scripts)')}</span>
              <HulpVraag k='browser.matrix.zonder-bevestiging' uk={uk} label={tr('Без підтвердження', 'Zonder bevestiging')} />
            </label>
            <label className='bea-schakel'>
              <button type='button' role='switch' aria-checked={inst.devtoolsNamen} data-hulp='browser.matrix.devtools-namen' data-bea-schakel='devtools-namen' disabled={!!bezig} className={`hub-toggle${inst.devtoolsNamen ? ' is-aan' : ''}`} onClick={() => setInst({ ...inst, devtoolsNamen: !inst.devtoolsNamen })} aria-label={tr('Назви як у chrome-devtools-mcp', 'Namen zoals chrome-devtools-mcp')} />
              <span>{tr('Показувати агентам також назви як у chrome-devtools-mcp (navigate_page, take_snapshot, click, fill, evaluate_script…)', 'Agenten ook de namen van chrome-devtools-mcp tonen (navigate_page, take_snapshot, click, fill, evaluate_script…)')}</span>
              <HulpVraag k='browser.matrix.devtools-namen' uk={uk} label={tr('Назви devtools', 'Devtools-namen')} />
            </label>
          </div>
        ) : null}
        <div className='eo-knoppen bea-opslaan'>
          <button type='submit' className='eo-knop is-hoofd' disabled={!dirty || !!bezig} aria-busy={bezig === 'opslaan' || undefined} data-bea-opslaan='1' onClick={alleenMens(() => void opslaan())}>
            <Save aria-hidden='true' />{bezig === 'opslaan' ? tr('Зберігаю…', 'Opslaan…') : tr('Зберегти', 'Opslaan')}
          </button>
          {dirty ? <small className='hub-meta'>{tr('Є незбережені зміни. Розширення прав попросить підтвердити вхід; звуження — ні.', 'Er zijn niet-opgeslagen wijzigingen. Ruimer vraagt een bevestiging van de aanmelding; strenger niet.')}</small> : null}
          <button type='button' className='eo-knop' disabled={!!bezig} onClick={() => void laden()} aria-label={tr('Оновити', 'Verversen')}><RefreshCw aria-hidden='true' />{tr('Оновити', 'Verversen')}</button>
        </div>
        {melding ? <p className={`eo-melding${melding.ok ? ' is-ok' : ''}`} role={melding.ok ? 'status' : 'alert'} data-bea-melding={melding.ok ? 'ok' : 'fout'}>{melding.tekst}</p> : null}
        </div>
      </section>

      {/* ---------------------------------------------------------------- 2b. ketting: wat er naast de matrix nog moet kloppen */}
      {stand && stand.keten.length ? <Keten tr={tr} uk={uk} stand={stand} techProfiel={live.technisch.techProfiel ?? (tech.geladen ? !!tech.profiel : false)} /> : null}

      {/* ---------------------------------------------------------------- 3. weigeringen */}
      <section className='ag-blok' aria-labelledby='bea-weig-kop' data-ag-blok='browser-weigeringen' data-bea-weigeringen={stand?.weigeringen.length ?? 0}>
        <header className='ag-blok-kop'>
          <h3 className='ag-blok-titel' id='bea-weig-kop'><ShieldOff aria-hidden='true' /> {tr('Останні відмови агентам', 'Laatste weigeringen aan agenten')}</h3>
          <p className='ag-blok-uitleg'>{tr('Коли розширення не пустило агента, тут видно, кого, в чому і чому — звичайними словами.', 'Als de extensie een agent tegenhield, ziet u hier wie, waarbij en waarom — in gewone taal.')}</p>
        </header>
        {stand && stand.weigeringen.length ? (
          <ul className='bea-weig-lijst'>
            {stand.weigeringen.map((w, i) => (
              <li key={`${w.at}-${i}`} data-bea-weigering={w.code}>
                <time dateTime={new Date(w.at).toISOString()}>{datumTijd(w.at, uk)}</time>
                <b>{w.agent}</b>{w.tool ? <code>{w.tool}</code> : null}
                <span className='bea-weig-code'>{w.code}</span>
                <span>{uk ? w.uk : w.nl}</span>
              </li>
            ))}
          </ul>
        ) : <p className='ag-leeg' data-bea-geen-weigeringen='1'>{tr('Жодної відмови останнім часом.', 'Geen weigering de laatste tijd.')}</p>}
      </section>

      {/* ---------------------------------------------------------------- 4. voor agenten */}
      <section className='ag-blok' aria-labelledby='bea-ag-kop' data-ag-blok='browser-uitleg'>
        <header className='ag-blok-kop'>
          <h3 className='ag-blok-titel' id='bea-ag-kop'><Bot aria-hidden='true' /> {tr('Як агент працює з браузером', 'Hoe een agent met de browser werkt')}</h3>
          <p className='ag-blok-uitleg'>{tr('Чотири кроки, після яких ШІ може працювати у вашому браузері.', 'Vier stappen waarna een AI in uw browser kan werken.')}</p>
        </header>
        <ol className='ag2-stappen'>
          <li>{tr('Підключіть агента на його адресі (вкладка «Підключені ШІ») і дозвольте йому групу «Браузер» у приватній і/або технічній частині.', 'Koppel de agent op zijn adres (tab «Verbonden AI’s») en sta hem de groep «Browser» toe in het privé- en/of technische deel.')}</li>
          <li>{tr('Позначте тут, що саме цей агент може в кожному слоті, і відкрийте слот на потрібний строк.', 'Vink hier aan wat die agent in elk slot mag en open het slot voor de gewenste termijn.')}</li>
          <li>{tr('Технічний слот: технічний профіль має бути активним у вкладці — навіть якщо розблокування триває довше.', 'Technisch slot: het technische profiel moet actief zijn in het tabblad — ook als de ontgrendeling langer loopt.')}</li>
          <li>{tr('Агент бачить інструменти браузера як «lezen_pagina_…», «openen_pagina_…» тощо — або, з перемикачем вище, як navigate_page / take_snapshot / click / fill / evaluate_script.', 'De agent ziet de browserhulpmiddelen als «lezen_pagina_…», «openen_pagina_…» enz. — of, met de schakelaar hierboven, als navigate_page / take_snapshot / click / fill / evaluate_script.')}</li>
        </ol>
        <p className='hub-meta'>{tr('Повний опис із прикладами викликів: docs/agenten/BROWSER-VIA-CONNECTOR.md у пакеті сайту. Адреса цього екрана, яку агент отримує в кожній відмові: ', 'Volledige beschrijving met voorbeeldaanroepen: docs/agenten/BROWSER-VIA-CONNECTOR.md in het sitepakket. Het adres van dit scherm, dat de agent in elke weigering krijgt: ')}<code>{BROWSER_BEHEER_URL}</code></p>
      </section>
    </div>
  );
}

// ================================================================== ketting per agent («що ще має бути дозволено»)
const titelVan = (intern: string, uk: boolean) => { const o = V2_OPTIES.find((x) => x.intern === intern); return o ? (uk ? o.uk[0] : o.nl[0]) : intern; };
function Keten({ tr, uk, stand, techProfiel }: { tr: Tr; uk: boolean; stand: MatrixStand; techProfiel: boolean }) {
  const bron = stand.keten[0]?.bron ?? 'site';
  return (
    <section className='ag-blok' aria-labelledby='bea-keten-kop' data-ag-blok='browser-keten' data-bea-keten={bron}>
      <header className='ag-blok-kop'>
        <h3 className='ag-blok-titel' id='bea-keten-kop'><ShieldCheck aria-hidden='true' /> {tr('Що ще має бути дозволено', 'Wat er verder nog toegestaan moet zijn')}</h3>
        <p className='ag-blok-uitleg'>{tr('Окрім матриці, агентові потрібні права конектора й дозвіл режиму сайту — тут видно, чого бракує кожному.', 'Naast de matrix heeft een agent connectorrechten en de toestemming van de sitemodus nodig — hier ziet u wat elk mist.')}</p>
        {bron !== 'site' ? (
          <div className='ag-knoppen'>
            <a className='ag-knop ag2-link-knop' href='https://admin.tarasevych.com/ai' data-bea-beleid-link='1'>{tr('Відкрити «Доступ ШІ»', 'Open «AI-toegang»')}</a>
          </div>
        ) : null}
      </header>
      <p className='ag2-noot'>{bron === 'ondertekend'
        ? tr('Діє ваша підписана політика ШІ (admin → «Доступ ШІ»): вона вирішує, які інструменти браузера бачить кожен агент. Тут — лише показ; змінити можна там, з passkey.', 'Uw ondertekende AI-beleid geldt (admin → «AI-toegang»): dat beslist welke browserhulpmiddelen elke agent ziet. Hier alleen weergave; wijzigen kan daar, met passkey.')
        : bron === 'ongeldig'
          ? tr('Підписану політику ШІ не вдалося перевірити — усі дії ШІ заблоковано, доки ви її не виправите (admin → «Доступ ШІ»).', 'Het ondertekende AI-beleid kon niet worden gecontroleerd — alle AI-acties zijn geblokkeerd tot u het herstelt (admin → «AI-toegang»).')
          : tr('Ризикові інструменти браузера (клік, введення, скріншот, діагностика, скрипти) на сайті типово вимкнені. Збереження матриці вмикає їх саме для дозволених можливостей: «з підтвердженням» або, з перемикачем вище, без нього.', 'Riskante browserhulpmiddelen (klikken, typen, schermafdruk, diagnose, scripts) staan op de site standaard uit. Opslaan van de matrix zet ze aan voor precies de toegestane mogelijkheden: «met bevestiging» of, met de schakelaar hierboven, zonder.')}</p>
      {/* Een lijst i.p.v. een tabel: op 390 px past elke agent als een eigen blok (geen horizontale scroll); op brede schermen drie kolommen. */}
      <ul className='bea-keten-lijst'>
        {stand.keten.map((a) => {
          const kanten = a.kanten.filter((k) => k.kant === 'gebruiker' || techProfiel);
          const uit = [...new Set(kanten.flatMap((k) => k.uit))];
          return (
            <li key={a.slug} data-bea-keten-agent={a.slug}>
              <b className='bea-keten-naam'>{a.naam}</b>
              <div>
                <small className='bea-keten-kop'>{tr('Конектор (права)', 'Connector (rechten)')}</small>
                {kanten.map((k) => (
                  <span key={k.kant} className='bea-keten-regel' data-bea-keten-rechten={`${k.kant}:${k.rechten ?? 'geen'}`}>
                    {k.kant === 'gebruiker' ? tr('приватно', 'privé') : tr('технічно', 'technisch')}: {k.rechten === null ? tr('не підключено через адресу агента', 'niet gekoppeld via het agentadres') : `${k.rechten}/${k.totaal}`}
                  </span>
                ))}
              </div>
              <div>
                <small className='bea-keten-kop'>{tr('Вимкнено режимом', 'Uit door de modus')}</small>
                {uit.length ? <span className='bea-keten-uit' data-bea-keten-uit={uit.length}>{uit.map((t) => titelVan(t, uk)).join(', ')}</span> : <span className='hub-meta'>{tr('нічого', 'niets')}</span>}
              </div>
            </li>
          );
        })}
      </ul>
      <p className='ag2-noot'>{tr('Права конектора кожного агента змінюються на вкладці «Підключені ШІ» (вікно «Дозволити» під час підключення).', 'De connectorrechten van elke agent wijzigt u op het tabblad «Verbonden AI’s» (venster «Toestaan» bij het koppelen).')}</p>
    </section>
  );
}

// ================================================================== één slot: stand + termijn + openen/blokkeren
function SlotKaart({ tr, uk, ruimte, live, nu, stand, techProfiel, techActief: actief, naarExtensie, naLaden }: {
  tr: Tr; uk: boolean; ruimte: AiRuimte; live: ExtensieLive; nu: number; stand: MatrixStand | null; techProfiel: boolean; techActief: boolean; naarExtensie?: () => void; naLaden: () => Promise<void>;
}) {
  const termijnen = termijnenVoorRuimte(ruimte);
  const [termijn, setTermijn] = useState<TermijnId>(ruimte === 'technisch' ? 'tech-einde' : '30d');
  const toegestaan = ruimte === 'prive' ? [...PRIVE_HOSTS] : [...ADMIN_HOSTS_TOEGESTAAN];
  const [domeinen, setDomeinen] = useState<string[]>(ruimte === 'prive' ? [...PRIVE_HOSTS] : [...ADMIN_HOSTS_STANDAARD]);
  const [bezig, setBezig] = useState<'' | 'open' | 'dicht'>('');
  const [stap, setStap] = useState('');
  const [melding, setMelding] = useState<{ ok: boolean; tekst: string; weigering?: Weigering } | null>(null);
  const staat: ExtensieStaat = live.staat === 'onbekend' ? 'vergrendeld' : live.staat;
  const o = live.ontgrendeling;
  const open = (staat === 'ontgrendeld' || staat === 'agent') && !!o;
  const rest = o ? Math.max(0, o.eind - (nu + live.scheef)) : 0;
  const gekozen = termijnen.find((x) => x.id === termijn) ?? termijnen[0];
  const kan = live.heeftBrowser && !!live.agentId && (ruimte === 'prive' || (techProfiel && actief));

  const doeOpen = async () => {
    if (!live.agentId || bezig) return;
    setBezig('open'); setMelding(null);
    const r = ruimte === 'prive'
      ? await ontgrendelenPrive({ agentId: live.agentId, dagen: 1, domeinen, lokaal: false, termijn })
      : await ontgrendelen({ agentId: live.agentId, minuten: 60, domeinen, lokaal: false, termijn }, (s) => setStap(s));
    setBezig(''); setStap('');
    setMelding(r.ok ? { ok: true, tekst: tr('Доступ відкрито.', 'Toegang open.') } : { ok: false, tekst: uk ? r.weigering.uk : r.weigering.nl, weigering: r.weigering });
    void naLaden();
  };
  const doeDicht = async () => {
    if (!live.agentId || bezig) return;
    setBezig('dicht'); setMelding(null);
    const r = await intrekken(live.agentId, o?.gid || undefined);
    setBezig('');
    setMelding(r.ok ? { ok: true, tekst: tr('Заблоковано.', 'Vergrendeld.') } : { ok: false, tekst: uk ? r.weigering.uk : r.weigering.nl, weigering: r.weigering });
    void naLaden();
  };

  return (
    <article className={`eo bea-slot ag2-slot is-${staat}`} data-bea-slot={ruimte} data-eo-staat={staat} aria-labelledby={`bea-slot-${ruimte}`}>
      {/* INTEG-001: de slotkaart staat nu ín het blok «Доступ розширення зараз». De kop blijft h3: de zoekcatalogus
          (scripts/zoek-ui-catalogus.mjs) koppelt de knoppen van het slot aan de laatste h1–h3 ervoor — met h4 kwamen ze onder «Що ще має бути дозволено». */}
      <h3 className='ag2-slot-titel' id={`bea-slot-${ruimte}`}>{ruimte === 'prive' ? <User aria-hidden='true' /> : <ShieldCheck aria-hidden='true' />} {ruimte === 'prive' ? tr('Приватний слот — ваші сторінки', 'Privéslot — uw pagina’s') : tr('Технічний слот — адміністрування', 'Technisch slot — beheer')}</h3>
      <div className={`eo-kaart is-${staat}`} role='status' aria-live='polite'>
        <span className='eo-icoon' aria-hidden='true'>{staat === 'agent' ? <Bot /> : open ? <LockOpen /> : <Lock />}</span>
        <div className='eo-kaart-tekst'>
          <b>{uk ? STAAT_TEKST[staat][0] : STAAT_TEKST[staat][1]}</b>
          {open && o ? <span className='eo-rest' data-bea-rest='1'>{(() => {
            const datum = datumTijd(o.eind - live.scheef, uk);
            const w = eindeWeergave(o.eindeSoort, { uk: `ще ${restLang(rest, true)} · до ${datum}`, nl: `nog ${restLang(rest, false)} · tot ${datum}` }, datum);
            return `${uk ? w.uk : w.nl}${o.overleeftActivatie ? tr(' · переживає активацію', ' · overleeft de activering') : ''}`;
          })()}</span> : null}
          {open && o ? <span className='eo-meta'>{o.caps.map((c) => (uk ? CAP_INFO[c]?.uk[0] : CAP_INFO[c]?.nl[0]) ?? c).join(', ')} · {o.domeinen.join(', ')}</span> : null}
          {!live.heeftBrowser ? <span className='eo-meta'>{tr('У цьому слоті ще не підключено розширення.', 'In dit slot is nog geen extensie gekoppeld.')} {naarExtensie ? <button type='button' className='eo-actie' onClick={naarExtensie} data-bea-naar-extensie={ruimte}>{tr('Підключити', 'Koppelen')}</button> : null}</span> : null}
          {!live.online && live.heeftBrowser ? <span className='eo-meta'>{tr('Розширення зараз не з’єднане із сервером.', 'De extensie is nu niet met de server verbonden.')}</span> : null}
          {live.ai.verbonden ? <span className='eo-meta' data-bea-ai='1'>{tr('Працює зараз: ', 'Nu actief: ')}{live.ai.agenten.map((a) => a.naam).join(', ')}</span> : null}
        </div>
      </div>
      {ruimte === 'technisch' && !techProfiel ? <p className='eo-meta'>{tr('У вашого облікового запису немає технічного профілю — технічний слот недоступний.', 'Uw account heeft geen technisch profiel — het technische slot bestaat niet.')}</p> : null}
      {ruimte === 'technisch' && techProfiel && !actief ? (
        <p className='eo-meta bea-tech-regel'>
          <span>{tr('Технічний профіль не активний у цій вкладці. Активуйте його, щоб відкрити технічний слот — і пам’ятайте: кожен технічний інструмент вимагає активного профілю, навіть якщо розблокування триває довше.', 'Het technische profiel is in dit tabblad niet actief. Activeer het om het technische slot te openen — en onthoud: elk technisch hulpmiddel eist een actief profiel, ook als de ontgrendeling langer loopt.')}</span>
          <button type='button' className='eo-actie' onClick={() => openTechVenster('activeren')} data-bea-tech-aan='1'><ShieldCheck size={16} aria-hidden='true' />{tr('Активувати', 'Activeren')}</button>
        </p>
      ) : null}
      {kan ? (
        <form className='eo-form' onSubmit={(e) => { e.preventDefault(); alleenMens(() => void doeOpen())(e); }} data-bea-form={ruimte}>
          <label className='eo-veld'>
            <span>{tr('Строк', 'Termijn')} <HulpVraag k='browser.matrix.termijn' uk={uk} label={tr('Строк', 'Termijn')} /></span>
            <select data-hulp='browser.matrix.termijn' value={termijn} disabled={!!bezig} onChange={(e) => setTermijn(e.target.value as TermijnId)} data-bea-termijn={ruimte}>
              {termijnen.map((x) => <option key={x.id} value={x.id}>{uk ? x.uk : x.nl}</option>)}
            </select>
            <small data-bea-termijn-risico='1'>{uk ? gekozen.risico.uk : gekozen.risico.nl}{ruimte === 'technisch' && gekozen.soort !== 'tech-einde' ? tr(' Переживає кінець активації; технічні інструменти працюють лише з активним профілем.', ' Overleeft het einde van de activering; technische hulpmiddelen werken alleen met een actief profiel.') : ''}</small>
          </label>
          <details className='bea-domeinen'>
            <summary>{tr('Сторінки', 'Pagina’s')} ({domeinen.length}) <HulpVraag k='browser.matrix.domeinen' uk={uk} label={tr('Сторінки', 'Pagina’s')} /></summary>
            <div className='eo-domeinen'>
              {toegestaan.map((h) => (
                <label key={h} className='eo-vink'>
                  <input data-hulp='browser.matrix.domeinen' type='checkbox' checked={domeinen.includes(h)} disabled={!!bezig} onChange={(e) => setDomeinen(e.target.checked ? [...domeinen, h] : domeinen.filter((x) => x !== h))} data-bea-domein={`${ruimte}:${h}`} />
                  <code>{h}</code>
                </label>
              ))}
            </div>
          </details>
          <div className='eo-knoppen'>
            <button type='submit' className='eo-knop is-hoofd' disabled={!!bezig || !domeinen.length} aria-busy={bezig === 'open' || undefined} data-bea-open={ruimte} onClick={alleenMens(() => undefined)}>
              <KeyRound aria-hidden='true' />{bezig === 'open' ? (stap === 'passkey' ? tr('Підтвердіть passkey…', 'Bevestig de passkey…') : tr('Відкриваю…', 'Openen…')) : open ? tr('Відкрити заново на цей строк', 'Opnieuw openen voor deze termijn') : ruimte === 'technisch' ? tr('Розблокувати з passkey', 'Ontgrendelen met passkey') : tr('Відкрити доступ', 'Toegang openen')}
            </button>
            {open ? <button type='button' className='eo-knop is-gevaar' disabled={!!bezig} onClick={() => void doeDicht()} data-bea-dicht={ruimte}><Lock aria-hidden='true' />{tr('Заблокувати', 'Blokkeren')}</button> : null}
          </div>
        </form>
      ) : null}
      {melding ? (melding.ok ? <p className='eo-melding is-ok' role='status'>{melding.tekst}</p> : (
        <div className='eo-weigering' role='alert' data-eo-weigering={melding.weigering?.code}><ShieldOff aria-hidden='true' /><p>{melding.tekst}</p>
          {melding.weigering?.actie ? <a className='eo-actie' href={melding.weigering.actie.url}>{uk ? melding.weigering.actie.uk : melding.weigering.actie.nl}</a> : null}</div>
      )) : null}
      {stand ? <p className='eo-meta' data-bea-ingesteld={stand.ingesteld[ruimte] ? '1' : '0'}>{stand.ingesteld[ruimte] ? tr('Матриця для цього слота збережена — вона вирішує, що може кожен агент.', 'De matrix voor dit slot is opgeslagen — zij beslist wat elke agent mag.') : tr('Матриця ще не збережена: діють старі дозволи на кожному браузері.', 'De matrix is nog niet opgeslagen: de oude toestemmingen per browser gelden.')}</p> : null}
    </article>
  );
}
