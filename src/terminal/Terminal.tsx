// Terminal in de browser (technisch profiel). Twee werelden, één venster (zone G, 22.10.2026):
//   1. OPDRACHT-TERMINAL (standaard): opent meteen op het server-apparaat («підключено як beheer@host»), één programma per regel uit de
//      toegestane lijst, zonder shell; lezende opdrachten lopen direct, wijzigende (en elke PowerShell-regel) vragen een bevestiging in dit
//      venster; uitvoer wordt opgenomen (app.terminal_opdrachten). Geschiedenis, autodoploen, kopiëren. Windows-pc = PowerShell.
//   2. CONTAINER (zoals voorheen): wegwerpcontainer op een apparaat met podman (xterm.js, WSS /terminal/ws, stap-op).
// Zonder apparaat: de wizard «Підключити сервер як пристрій» met de exacte opdracht en een knop «Перевірити».
// xterm.js wordt pas geladen als een containerterminal echt opent (eigen chunk).
import { useEffect, useRef, useState, type KeyboardEvent as ToetsEvent } from 'react';
import { Check, Copy, History, Play, RefreshCw, Server, Settings2, Square, TerminalSquare, X } from 'lucide-react';
import { Venster } from '../platform/vensters';
import { api } from '../platform/client';
import { routeLang, serviceFromLocation } from '../canoniek-navigatie';
import { ecosystemTabContext } from '../tab-context';
import { zijbalkServerDienst } from '../zijbalk-voorkeuren';
import Vraag from '../tech/Vraag';
import { HELP_TERMINAL } from '../../shared/terminal';
import { aanvullingen, FOUT_TEKST, HELP_TERMINAL_OPDRACHT, type Bevestiging } from '../../shared/terminal-opdrachten';
import '@xterm/xterm/css/xterm.css';
import './terminal.css';
import HulpVraag from '../hulp/HulpVraag';

const body = () => ({ service: zijbalkServerDienst() || serviceFromLocation(), tabContext: ecosystemTabContext(), sourceOrigin: location.origin });
type Apparaat = { id: string; naam: string; platform: string; ruimte: 'prive' | 'technisch'; online: boolean; terminal: boolean; opdrachten: boolean; powershell: boolean; allow: string[]; gebruiker: string; host: string; bevestiging: Bevestiging; versie: string; test?: boolean; toegestaan?: boolean; image: string; maxMinuten: number; roots: Array<{ pad: string; alleenLezen: boolean }> };
type Open = { sid: string; ticket: string; eind: number; minuten: number; apparaat: string; root: string; schrijven: boolean };
type Rij = { id: string; apparaat: string; agentId: string; regel: string; programma: string; soort: 'lezend' | 'wijzigend'; powershell: boolean; bevestigd: boolean; cwd: string; staat: 'bezig' | 'klaar' | 'mislukt' | 'tijd' | 'geweigerd'; code: number | null; uitvoer: string; afgekapt: boolean; fout: string; bytes: number; begin: number; einde: number | null; email?: string };
const FOUTEN: Record<string, [string, string]> = {
  ...(FOUT_TEKST as Record<string, [string, string]>),
  TECH_TERMINAL_VEREIST: ['Потрібен активний технічний профіль із правом термінала (Розробник, Адміністратор, Власник).', 'Een actief technisch profiel met terminalrecht is nodig.'],
  TERMINAL_ALLEEN_TESTMACHINE: ['Ваша роль відкриває лише тестові машини (позначені --test). Сервери — роль «Адміністратор» або «Власник».', 'Uw rol opent alleen testmachines (gemarkeerd met --test). Servers: rol «Адміністратор» of «Власник».'],
  TERMINAL_UIT_OP_APPARAAT: ['На пристрої контейнерний термінал вимкнено: node agent.mjs terminal-config on', 'Containerterminal staat uit op het apparaat: node agent.mjs terminal-config on'],
  DUUR_ONGELDIG: ['Такий термін недоступний (не довше, ніж лишилося технічному профілю й дозволяє пристрій).', 'Deze duur kan niet (niet langer dan het technisch profiel en het apparaat toelaten).'],
  REDEN_ONGELDIG: ['Вкажіть причину (від 3 символів).', 'Geef een reden (minstens 3 tekens).'],
  ROOT_ALLEEN_LEZEN: ['Цю теку підключено лише для читання.', 'Deze map is alleen-lezen gekoppeld.'],
  TE_VEEL_TERMINALS: ['Уже відкрито 3 термінали.', 'Er zijn al 3 terminals open.'],
};
const foutTekst = (e: unknown, uk: boolean) => { const c = String((e as Error)?.message || 'FOUT'); const f = FOUTEN[c]; return f ? (uk ? f[0] : f[1]) : /STEP_UP|STAP_OP/.test(c) ? (uk ? 'Вхід не підтверджено — нічого не відкрито.' : 'Aanmelding niet bevestigd — niets geopend.') : `${uk ? 'Не вдалося' : 'Mislukt'} (${c}).`; };
const INRICHTEN = 'sudo mijn-ruimte-installeer terminal-inrichten';

// CSP van de site: style-src-elem 'self' (geen inline <style>). xterm.js maakt zelf <style>-elementen (thema, maten) en zou dan
// geweigerd worden. Zolang een terminal open is, krijgt xterm in plaats van <style> een onzichtbaar element; de tekst ervan zetten we
// via constructable stylesheets (CSSOM, toegestaan door CSP) op de pagina. Alleen voor dit document en alleen tijdens een terminal.
let brugTeller = 0;
let origineel: typeof document.createElement | null = null;
const bladen = new Map<Element, CSSStyleSheet>();
let waarnemer: MutationObserver | null = null;
function brugSync() {
  for (const el of document.querySelectorAll('mr-xterm-stijl')) {
    let sh = bladen.get(el); if (!sh) { sh = new CSSStyleSheet(); bladen.set(el, sh); }
    try { sh.replaceSync(el.textContent || ''); } catch { /* ongeldige css: overslaan */ }
  }
  for (const el of [...bladen.keys()]) if (!el.isConnected) bladen.delete(el);
  const eigen = new Set(bladen.values());
  document.adoptedStyleSheets = [...document.adoptedStyleSheets.filter((x) => !(x as CSSStyleSheet & { __mr?: boolean }).__mr), ...[...eigen].map((x) => Object.assign(x, { __mr: true }))];
}
function xtermCspBrug(): () => void {
  if (brugTeller++ === 0) {
    origineel = document.createElement;
    const o = origineel;
    document.createElement = function (this: Document, tag: string, opties?: ElementCreationOptions) {
      return String(tag).toLowerCase() === 'style' ? o.call(this, 'mr-xterm-stijl', opties) : o.call(this, tag, opties);
    } as typeof document.createElement;
    waarnemer = new MutationObserver(brugSync);
    waarnemer.observe(document.body, { subtree: true, childList: true, characterData: true });
  }
  return () => {
    if (--brugTeller > 0) return;
    if (origineel) document.createElement = origineel;
    waarnemer?.disconnect(); waarnemer = null; bladen.clear(); brugSync();
  };
}
const b64 = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
const vanB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const kopieer = async (t: string) => { try { await navigator.clipboard.writeText(t); return true; } catch { return false; } };

type Weergave = 'opdracht' | 'container' | 'opnames' | 'wizard';
const kanOpdracht = (a: Apparaat) => (a.opdrachten || a.powershell) && a.toegestaan !== false;
/** Soort apparaat voor de keuzelijst (server Linux / pc Windows / Mac), uit het platform dat de agent meldt (os.platform()-arch). */
const soortVan = (a: Apparaat, uk: boolean) => (/^win32/.test(a.platform) ? (uk ? 'ПК Windows' : 'Windows-pc') : /^linux/.test(a.platform) ? (uk ? 'сервер Linux' : 'Linux-server') : /^darwin/.test(a.platform) ? 'Mac' : '');

export function TerminalOpenen({ sluit }: { sluit: () => void }) {
  const uk = routeLang() !== 'nl';
  const [lijst, setLijst] = useState<Apparaat[] | null>(null);
  const [melding, setMelding] = useState('');
  const [agentId, setAgentId] = useState('');
  const [weergave, setWeergave] = useState<Weergave | ''>('');
  const laad = async () => {
    setMelding('');
    try {
      const r = await api.post('/api/terminal/apparaten', body());
      const l = (r.data?.apparaten ?? []) as Apparaat[];
      setLijst(l);
      // Meteen op de server: eerst een technisch apparaat met opdracht-terminal, dan elk ander; anders container; anders wizard.
      const eerste = l.find((a) => a.online && kanOpdracht(a) && a.ruimte === 'technisch') ?? l.find((a) => a.online && kanOpdracht(a)) ?? l.find((a) => kanOpdracht(a));
      if (eerste) { setAgentId(eerste.id); setWeergave('opdracht'); return; }
      setWeergave(l.some((a) => a.terminal) ? 'container' : 'wizard');
    } catch (e) { setLijst([]); setMelding(foutTekst(e, uk)); setWeergave('wizard'); }
  };
  useEffect(() => { void laad(); }, []);
  const ap = lijst?.find((a) => a.id === agentId) ?? null;
  if (weergave === 'opnames') return <Opnames uk={uk} sluit={() => setWeergave(ap ? 'opdracht' : 'container')} />;
  if (weergave === 'container') return <ContainerOpenen uk={uk} lijst={lijst ?? []} sluit={sluit} terug={lijst?.some(kanOpdracht) ? () => setWeergave('opdracht') : undefined} naarOpnames={() => setWeergave('opnames')} />;
  if (weergave === 'opdracht' && ap && lijst) return <OpdrachtTerminal uk={uk} ap={ap} lijst={lijst} kies={(id) => setAgentId(id)} herlaad={laad} sluit={sluit} naarContainer={lijst.some((a) => a.terminal) ? () => setWeergave('container') : undefined} naarOpnames={() => setWeergave('opnames')} />;
  return (
    <Venster id='terminal-openen' titel={uk ? 'Термінал' : 'Terminal'} breedte={640} onSluit={sluit}>
      <div className='tech-venster' data-term-venster='wizard'>
        {lijst === null ? <p className='tech-meta'>{uk ? 'Завантаження…' : 'Laden…'}</p> : <Wizard uk={uk} lijst={lijst} herlaad={laad} melding={melding} />}
      </div>
    </Venster>
  );
}

/** Zonder apparaat: geen droge melding, maar de weg ernaartoe — één opdracht op de server, en de stand na «Перевірити». */
function Wizard({ uk, lijst, herlaad, melding }: { uk: boolean; lijst: Apparaat[]; herlaad: () => Promise<void>; melding: string }) {
  const [bezig, setBezig] = useState(false);
  const [gekopieerd, setGekopieerd] = useState(false);
  const offline = lijst.filter((a) => kanOpdracht(a) && !a.online);
  const zonderModus = lijst.filter((a) => !a.opdrachten && !a.powershell && !a.terminal);
  return (
    <div className='term-wizard' data-term-wizard='1'>
      <p className='tech-lead'><Server aria-hidden='true' /> <b>{uk ? 'Підключити сервер як пристрій' : 'Server als apparaat koppelen'}</b> <Vraag help={HELP_TERMINAL_OPDRACHT} uk={uk} label={uk ? 'Термінал' : 'Terminal'} /></p>
      {melding ? <p className='tech-melding' role='alert'>{melding}</p> : null}
      <p>{uk ? 'Термінал працює через агент на пристрої. Жодного пристрою з увімкненим терміналом ще немає. Один крок на консолі сервера (SSH як beheer) — і термінал відкриється тут одразу, уже авторизований:' : 'De terminal werkt via een agent op het apparaat. Er is nog geen apparaat met terminal. Eén stap op de console van de server (SSH als beheer) en de terminal opent hier meteen, al aangemeld:'}</p>
      <ol className='term-stappen'>
        <li>
          <code className='term-code' data-term-opdracht-inrichten='1'>{INRICHTEN}</code>
          <button type='button' onClick={() => void kopieer(INRICHTEN).then((ok) => { setGekopieerd(ok); window.setTimeout(() => setGekopieerd(false), 2500); })} data-term-knop='kopieer-inrichten' aria-live='polite'>{gekopieerd ? <Check aria-hidden='true' /> : <Copy aria-hidden='true' />}{gekopieerd ? (uk ? 'Скопійовано' : 'Gekopieerd') : (uk ? 'Копіювати' : 'Kopiëren')}</button>
          <small>{uk ? 'Інсталятор (root) сам створює одноразовий код зв’язки для вашого облікового запису, запускає агент як окрему службу mijn-ruimte-apparaat.service від користувача beheer (без sudo, NoNewPrivileges) з дозволеним списком команд і вмикає термінал для технічного простору. Код ніде не з’являється — нічого копіювати з сайту не треба.' : 'De installer (root) maakt zelf een eenmalige koppelcode voor uw account, start de agent als aparte dienst mijn-ruimte-apparaat.service als gebruiker beheer (geen sudo, NoNewPrivileges) met een toegestane lijst van programma’s en zet de terminal aan voor de technische ruimte. De code verschijnt nergens — niets overtypen.'}</small>
        </li>
        <li>
          <span>{uk ? 'Windows-ПК (PowerShell): агент 0.8 під Node на Windows, код зв’язки з mcp.* → Пристрої (технічний простір), потім node agent.mjs terminal-config on --powershell. Покрокова інструкція: deploy/agent/WINDOWS-POWERSHELL.md.' : 'Windows-pc (PowerShell): agent 0.8 onder Node op Windows, koppelcode van mcp.* → Apparaten (technische ruimte), dan node agent.mjs terminal-config on --powershell. Stap voor stap: deploy/agent/WINDOWS-POWERSHELL.md.'}</span>
        </li>
      </ol>
      {offline.length ? <p className='tech-meta' data-term-wizard-offline={offline.length}>{uk ? `Є пристрій з терміналом, але не на зв’язку: ${offline.map((a) => a.naam).join(', ')}. На сервері: systemctl status mijn-ruimte-apparaat.service.` : `Er is een apparaat met terminal, maar niet verbonden: ${offline.map((a) => a.naam).join(', ')}. Op de server: systemctl status mijn-ruimte-apparaat.service.`}</p> : null}
      {zonderModus.length ? <p className='tech-meta'>{uk ? `Пристрої без терміналу: ${zonderModus.map((a) => a.naam).join(', ')} — на пристрої: node agent.mjs terminal-config on --opdrachten (або --powershell).` : `Apparaten zonder terminal: ${zonderModus.map((a) => a.naam).join(', ')} — op het apparaat: node agent.mjs terminal-config on --opdrachten (of --powershell).`}</p> : null}
      <div className='tech-knoppen'>
        <button type='button' className='is-hoofd' disabled={bezig} onClick={() => { setBezig(true); void herlaad().finally(() => setBezig(false)); }} data-term-knop='controleer'><RefreshCw aria-hidden='true' />{uk ? 'Перевірити стан' : 'Stand controleren'}</button>
      </div>
    </div>
  );
}

type Regel = { id: string; regel: string; cwd: string; uitvoer: string; code: number | null; staat: Rij['staat'] | 'wacht' | 'fout'; fout: string; tijd: number; afgekapt?: boolean; soort?: string; powershell?: boolean };
function OpdrachtTerminal({ uk, ap, lijst, kies, herlaad, sluit, naarContainer, naarOpnames }: { uk: boolean; ap: Apparaat; lijst: Apparaat[]; kies: (id: string) => void; herlaad: () => Promise<void>; sluit: () => void; naarContainer?: () => void; naarOpnames: () => void }) {
  const [regels, setRegels] = useState<Regel[]>([]);
  const [invoer, setInvoer] = useState('');
  const [cwd, setCwd] = useState(ap.roots[0]?.pad ?? '');
  const [bezig, setBezig] = useState(false);
  const [bevestig, setBevestig] = useState<{ regel: string; programma: string; soort: string; powershell: boolean } | null>(null);
  const [melding, setMelding] = useState('');
  const [geschiedenis, setGeschiedenis] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState(-1);
  const [tips, setTips] = useState<string[]>([]);
  const [instellingen, setInstellingen] = useState(false);
  const [bevestiging, setBevestiging] = useState<Bevestiging>(ap.bevestiging);
  const [toonHist, setToonHist] = useState(false);
  const [hist, setHist] = useState<{ magAlle: boolean; opdrachten: Rij[] } | null>(null);
  const uitvoerRef = useRef<HTMLDivElement | null>(null);
  const invoerRef = useRef<HTMLInputElement | null>(null);
  const bevestigRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => { setCwd(ap.roots[0]?.pad ?? ''); setBevestiging(ap.bevestiging); setRegels([]); invoerRef.current?.focus(); }, [ap.id]);
  // Eén handeling tegelijk: zolang de bevestiging open is, staat zij op de plek van de invoerregel (focus op «Виконати»);
  // annuleren brengt de invoer terug met dezelfde tekst.
  useEffect(() => { if (bevestig) { bevestigRef.current?.focus(); bevestigRef.current?.scrollIntoView({ block: 'nearest' }); } else invoerRef.current?.focus(); }, [bevestig]);
  useEffect(() => { uitvoerRef.current?.scrollTo({ top: uitvoerRef.current.scrollHeight }); }, [regels]);
  useEffect(() => { setTips(invoer.trim() ? aanvullingen(invoer, ap.powershell && !ap.opdrachten ? [] : ap.allow) : []); }, [invoer, ap.id]);
  const titel = ap.powershell && !ap.opdrachten ? `PowerShell · ${ap.naam}` : `${uk ? 'Термінал' : 'Terminal'} · ${ap.naam}`;
  const wie = ap.gebruiker && ap.host ? `${ap.gebruiker}@${ap.host}` : ap.naam;
  const prompt = ap.powershell && !ap.opdrachten ? `PS ${cwd}>` : `${wie}:${cwd}$`;
  const bijwerken = (id: string, p: Partial<Regel>) => setRegels((r) => r.map((x) => (x.id === id ? { ...x, ...p } : x)));
  const uitRij = (r: Rij): Partial<Regel> => ({ uitvoer: r.uitvoer, code: r.code, staat: r.staat, fout: r.fout ? (FOUTEN[r.fout] ? (uk ? FOUTEN[r.fout][0] : FOUTEN[r.fout][1]) : r.fout) : '', afgekapt: r.afgekapt, soort: r.soort, powershell: r.powershell });
  const voerUit = async (regel: string, bevestigd: boolean) => {
    const lokaalId = `l-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setBezig(true); setMelding(''); setBevestig(null);
    try {
      const r = await api.post('/api/terminal/opdracht', { ...body(), agentId: ap.id, regel, cwd, bevestigd });
      const d = r.data as { bevestiging?: boolean; programma?: string; soort?: string; powershell?: boolean; klaar?: boolean; id?: string } & Partial<Rij>;
      if (d.bevestiging) { setBevestig({ regel, programma: String(d.programma), soort: String(d.soort), powershell: !!d.powershell }); setBezig(false); return; }
      setGeschiedenis((g) => [regel, ...g.filter((x) => x !== regel)].slice(0, 100)); setHistIdx(-1); setInvoer('');
      setRegels((x) => [...x, { id: lokaalId, regel, cwd, uitvoer: '', code: null, staat: 'wacht', fout: '', tijd: Date.now() }]);
      let rij: Rij | null = d.klaar ? (d as Rij) : null;
      if (!rij && d.id) {
        for (let i = 0; i < 90 && !rij; i++) {
          await new Promise((x) => setTimeout(x, 1000));
          const s = await api.post('/api/terminal/opdracht-stand', { ...body(), id: d.id });
          if (s.data?.klaar) rij = s.data as Rij;
        }
      }
      if (!rij) { bijwerken(lokaalId, { staat: 'tijd', fout: uk ? FOUTEN.OPDRACHT_TIJD[0] : FOUTEN.OPDRACHT_TIJD[1] }); return; }
      bijwerken(lokaalId, { id: rij.id, ...uitRij(rij) });
      if (rij.programma === 'cd' && rij.staat === 'klaar' && rij.cwd) setCwd(rij.cwd);
    } catch (e) {
      const t = foutTekst(e, uk);
      setRegels((x) => x.some((y) => y.id === lokaalId) ? x.map((y) => (y.id === lokaalId ? { ...y, staat: 'fout', fout: t } : y)) : [...x, { id: lokaalId, regel, cwd, uitvoer: '', code: null, staat: 'fout', fout: t, tijd: Date.now() }]);
    } finally { setBezig(false); invoerRef.current?.focus(); }
  };
  const toets = (e: ToetsEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); if (!bezig && invoer.trim()) void voerUit(invoer.trim(), false); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); const i = Math.min(geschiedenis.length - 1, histIdx + 1); if (i >= 0) { setHistIdx(i); setInvoer(geschiedenis[i]); } }
    else if (e.key === 'ArrowDown') { e.preventDefault(); const i = histIdx - 1; setHistIdx(i); setInvoer(i >= 0 ? geschiedenis[i] : ''); }
    else if (e.key === 'Tab' && tips.length) { e.preventDefault(); setInvoer(`${tips[0]} `); }
    else if (e.key === 'l' && e.ctrlKey) { e.preventDefault(); setRegels([]); }
  };
  const zetBevestiging = async (v: Bevestiging) => {
    const vorige = bevestiging; setBevestiging(v);
    try { await api.post('/api/terminal/instelling', { ...body(), agentId: ap.id, bevestiging: v }); void herlaad(); } catch (e) { setBevestiging(vorige); setMelding(foutTekst(e, uk)); }
  };
  const laadHist = () => { setToonHist(true); setHist(null); void api.post('/api/terminal/opdrachten', { ...body(), agentId: ap.id }).then((r) => setHist(r.data), (e) => setMelding(foutTekst(e, uk))); };
  const kiesbaar = lijst.filter((a) => kanOpdracht(a) || a.terminal);
  const allowTekst = ap.powershell && !ap.opdrachten ? 'PowerShell' : ap.allow.join(', ');
  return (
    <Venster id='terminal-sessie' titel={titel} breedte={960} hoogte={640} onSluit={sluit}>
      <div className='term-sessie term-opdracht' data-term-sessie='opdracht' data-term-apparaat-id={ap.id} data-term-modus={ap.powershell && !ap.opdrachten ? 'powershell' : 'opdrachten'}>
        <div className='term-kop term-kop-opdracht'>
          <span className='term-status' data-term-status={ap.online ? 'online' : 'offline'}>
            <TerminalSquare aria-hidden='true' />
            {kiesbaar.length > 1 ? (
              <select data-hulp-vrij='keuze' value={ap.id} onChange={(e) => { const a = lijst.find((x) => x.id === e.target.value); if (!a) return; if (kanOpdracht(a)) kies(a.id); else naarContainer?.(); }} data-term-apparaat='1' aria-label={uk ? 'Пристрій' : 'Apparaat'}>
                {kiesbaar.map((a) => <option key={a.id} value={a.id}>{a.powershell && !a.opdrachten ? `PowerShell ${uk ? 'на' : 'op'} ${a.naam}` : a.naam}{soortVan(a, uk) ? ` · ${soortVan(a, uk)}` : ''}{a.online ? '' : (uk ? ' (не на зв’язку)' : ' (offline)')}</option>)}
              </select>
            ) : null}
            <b data-term-wie='1'>{ap.online ? (uk ? 'підключено як ' : 'verbonden als ') : (uk ? 'не на зв’язку: ' : 'niet verbonden: ')}{ap.powershell && !ap.opdrachten ? `PowerShell ${uk ? 'на' : 'op'} ${wie}` : wie}</b>
            <span>· {uk ? 'тека' : 'map'} <code>{cwd || '—'}</code></span>
            <span className='term-allow' title={allowTekst}>· {uk ? 'дозволено' : 'toegestaan'}: {allowTekst.length > 60 ? `${allowTekst.slice(0, 57)}… (${ap.allow.length})` : allowTekst}</span>
            <span className='term-rec'>● {uk ? 'запис виводу' : 'opname uitvoer'}</span>
            <span>· {bevestiging === 'alles' ? (uk ? 'підтвердження: кожна команда' : 'bevestiging: elke opdracht') : (uk ? 'підтвердження: команди, що змінюють' : 'bevestiging: wijzigende opdrachten')}{ap.powershell && !ap.opdrachten ? (uk ? ' (PowerShell: завжди)' : ' (PowerShell: altijd)') : ''}</span>
            <Vraag help={HELP_TERMINAL_OPDRACHT} uk={uk} label={uk ? 'Термінал' : 'Terminal'} />
          </span>
          <span className='term-kop-knoppen'>
            <button type='button' onClick={laadHist} data-term-knop='geschiedenis' aria-label={uk ? 'Історія команд' : 'Opdrachtgeschiedenis'}><History aria-hidden='true' /><span>{uk ? 'Історія' : 'Geschiedenis'}</span></button>
            <button type='button' onClick={() => setInstellingen((v) => !v)} aria-expanded={instellingen} data-term-knop='instellingen' aria-label={uk ? 'Налаштування пристрою' : 'Apparaatinstellingen'}><Settings2 aria-hidden='true' /><span>{uk ? 'Налаштування' : 'Instellingen'}</span></button>
            {naarContainer ? <button type='button' onClick={naarContainer} data-term-knop='container'><span>{uk ? 'Контейнер' : 'Container'}</span></button> : null}
            <button type='button' onClick={sluit} data-term-knop='sluiten'><Square aria-hidden='true' /><span>{uk ? 'Закрити' : 'Sluiten'}</span></button>
          </span>
        </div>
        {instellingen ? (
          <div className='term-instellingen' data-term-instellingen='1'>
            <label className='tech-veld'><span>{uk ? 'Підтвердження на сайті' : 'Bevestiging op de site'} <HulpVraag k='terminal.bevestiging' uk={uk} /></span>
              <select data-hulp='terminal.bevestiging' value={bevestiging} onChange={(e) => void zetBevestiging(e.target.value as Bevestiging)} data-term-bevestiging='1'>
                <option value='wijzigend'>{uk ? 'Лише команди, що змінюють (читання — одразу)' : 'Alleen wijzigende opdrachten (lezen meteen)'}</option>
                <option value='alles'>{uk ? 'Кожна команда' : 'Elke opdracht'}</option>
              </select></label>
            <p className='tech-meta'>{uk ? `Пристрій: ${ap.naam} · агент ${ap.versie || '?'} · теки: ${ap.roots.map((r) => `${r.pad}${r.alleenLezen ? (uk ? ' (лише читання)' : ' (alleen lezen)') : ''}`).join(', ') || '—'} · простір: ${ap.ruimte === 'technisch' ? 'технічний' : 'приватний'}. Список команд і теки змінюються на пристрої (agent.mjs pair --allow … / --root …).` : `Apparaat: ${ap.naam} · agent ${ap.versie || '?'} · mappen: ${ap.roots.map((r) => `${r.pad}${r.alleenLezen ? ' (alleen lezen)' : ''}`).join(', ') || '—'} · ruimte: ${ap.ruimte}. Lijst en mappen wijzigt u op het apparaat (agent.mjs pair --allow … / --root …).`}</p>
            <p className='tech-knoppen'><button type='button' onClick={naarOpnames} data-term-knop='opnames'>{uk ? 'Контейнерні сеанси й записи' : 'Containersessies en opnames'}</button></p>
          </div>
        ) : null}
        {melding ? <p className='tech-melding' role='alert'>{melding}</p> : null}
        <div className='term-uitvoer' ref={uitvoerRef} data-term-uitvoer='1' role='log' aria-live='polite' aria-label={uk ? 'Вивід команд' : 'Uitvoer van opdrachten'}>
          {regels.length === 0 ? <p className='term-leeg'>{ap.powershell && !ap.opdrachten ? (uk ? 'Введіть команду PowerShell. Кожна команда підтверджується перед виконанням; вивід записується.' : 'Typ een PowerShell-opdracht. Elke opdracht wordt vóór het uitvoeren bevestigd; uitvoer wordt opgenomen.') : (uk ? 'Введіть команду (одна програма на рядок, без | ; &&). Tab — автодоповнення, ↑/↓ — історія, Ctrl+L — очистити. Наприклад: systemctl status mijn-ruimte' : 'Typ een opdracht (één programma per regel, zonder | ; &&). Tab vult aan, ↑/↓ geschiedenis, Ctrl+L wist. Bijvoorbeeld: systemctl status mijn-ruimte')}</p> : null}
          {regels.map((r) => <Uitvoer key={r.id} r={r} uk={uk} prompt={ap.powershell && !ap.opdrachten ? `PS ${r.cwd}>` : `${wie}:${r.cwd}$`} />)}
        </div>
        {bevestig ? (
          <div className='term-bevestig' role='alertdialog' aria-labelledby='term-bevestig-kop' data-term-bevestig='1' onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setBevestig(null); } }}>
            <p id='term-bevestig-kop'><b>{bevestig.powershell ? (uk ? 'PowerShell: команда виконається на' : 'PowerShell: deze opdracht draait op') : (uk ? 'Ця команда змінює систему на' : 'Deze opdracht wijzigt het systeem op')} «{ap.naam}»</b></p>
            <code className='term-code'>{bevestig.regel}</code>
            <p className='tech-meta'>{bevestig.powershell ? (uk ? 'Усередині PowerShell текст довільний, тому підтвердження обов’язкове. Виконується як powershell -NoProfile -NonInteractive -Command, без cmd.exe, від імені користувача агента.' : 'Binnen PowerShell is de tekst willekeurig, daarom is bevestiging verplicht. Draait als powershell -NoProfile -NonInteractive -Command, zonder cmd.exe, als de agentgebruiker.') : (uk ? `Програма «${bevestig.programma}» з такими аргументами позначена як така, що змінює. Виконується без sudo від імені ${wie}; вивід буде записано.` : `Programma «${bevestig.programma}» met deze argumenten is als wijzigend gemarkeerd. Draait zonder sudo als ${wie}; de uitvoer wordt opgenomen.`)}</p>
            <div className='tech-knoppen'>
              <button type='button' ref={bevestigRef} className='is-hoofd' onClick={() => void voerUit(bevestig.regel, true)} data-term-knop='bevestig'><Play aria-hidden='true' />{uk ? 'Виконати' : 'Uitvoeren'}</button>
              <button type='button' onClick={() => setBevestig(null)} data-term-knop='annuleer'><X aria-hidden='true' />{uk ? 'Скасувати' : 'Annuleren'}</button>
            </div>
          </div>
        ) : null}
        {!bevestig ? <form className='term-invoer' onSubmit={(e) => { e.preventDefault(); if (!bezig && invoer.trim()) void voerUit(invoer.trim(), false); }}>
          <label className='term-prompt' htmlFor='term-invoer-veld'><span aria-hidden='true'>{prompt}</span><span className='term-vis-verborgen'>{uk ? 'Команда' : 'Opdracht'}</span></label>
          <input id='term-invoer-veld' ref={invoerRef} value={invoer} onChange={(e) => { setInvoer(e.target.value); setHistIdx(-1); }} onKeyDown={toets} disabled={bezig || !ap.online} autoComplete='off' autoCapitalize='off' autoCorrect='off' spellCheck={false} placeholder={ap.online ? (ap.powershell && !ap.opdrachten ? 'Get-Service wuauserv' : 'systemctl status mijn-ruimte') : (uk ? 'пристрій не на зв’язку' : 'apparaat niet verbonden')} data-term-invoer='1' />
          <button type='submit' className='is-hoofd' disabled={bezig || !invoer.trim() || !ap.online} data-term-knop='uitvoeren' aria-label={uk ? 'Виконати' : 'Uitvoeren'}><Play aria-hidden='true' /><span>{bezig ? (uk ? 'Виконується…' : 'Bezig…') : (uk ? 'Виконати' : 'Uitvoeren')}</span></button>
        </form> : null}
        {tips.length && !bevestig ? <ul className='term-tips' data-term-tips={tips.length} aria-label={uk ? 'Підказки' : 'Suggesties'}>{tips.map((t) => <li key={t}><button type='button' onClick={() => { setInvoer(`${t} `); invoerRef.current?.focus(); }}>{t}</button></li>)}</ul> : null}
        {toonHist ? <Geschiedenis uk={uk} hist={hist} sluit={() => setToonHist(false)} herhaal={(regel) => { setToonHist(false); setInvoer(regel); invoerRef.current?.focus(); }} /> : null}
      </div>
    </Venster>
  );
}

function Uitvoer({ r, uk, prompt }: { r: Regel; uk: boolean; prompt: string }) {
  const [ok, setOk] = useState(false);
  const staat = r.staat === 'wacht' ? (uk ? 'виконується…' : 'bezig…') : r.staat === 'klaar' ? (r.code === 0 || r.code === null ? 'ok' : `${uk ? 'код' : 'code'} ${r.code}`) : r.staat === 'tijd' ? (uk ? 'час вийшов' : 'tijd verstreken') : r.staat === 'mislukt' ? (uk ? 'відмовлено' : 'geweigerd') : (uk ? 'помилка' : 'fout');
  return (
    <div className='term-regel' data-term-regel={r.staat} data-term-code={r.code ?? ''}>
      <div className='term-regel-kop'>
        <span className='term-regel-prompt'>{prompt}</span> <span className='term-regel-cmd'>{r.regel}</span>
        <span className={`term-regel-staat is-${r.staat === 'klaar' && r.code !== 0 && r.code !== null ? 'code' : r.staat}`}>{staat}{r.soort === 'wijzigend' || r.powershell ? ` · ${uk ? 'підтверджено' : 'bevestigd'}` : ''}</span>
        {r.uitvoer ? <button type='button' className='term-kopieer' onClick={() => void kopieer(r.uitvoer).then((v) => { setOk(v); window.setTimeout(() => setOk(false), 2000); })} aria-label={uk ? 'Копіювати вивід' : 'Uitvoer kopiëren'} data-term-knop='kopieer'>{ok ? <Check aria-hidden='true' /> : <Copy aria-hidden='true' />}</button> : null}
      </div>
      {r.fout ? <p className='term-regel-fout' role='alert'>{r.fout}</p> : null}
      {r.uitvoer ? <pre className='term-pre'>{r.uitvoer}{r.afgekapt ? `\n[${uk ? 'вивід обрізано' : 'uitvoer afgekapt'}]` : ''}</pre> : null}
    </div>
  );
}

function Geschiedenis({ uk, hist, sluit, herhaal }: { uk: boolean; hist: { magAlle: boolean; opdrachten: Rij[] } | null; sluit: () => void; herhaal: (regel: string) => void }) {
  const [open, setOpen] = useState('');
  return (
    <div className='term-geschiedenis' data-term-geschiedenis='1'>
      <p className='term-geschiedenis-kop'><b>{uk ? 'Історія команд' : 'Opdrachtgeschiedenis'}</b>{hist?.magAlle ? <small> · {uk ? 'усі користувачі (право «записи»)' : 'alle gebruikers (recht «opnames»)'}</small> : null}<button type='button' onClick={sluit} data-term-knop='geschiedenis-sluiten' aria-label={uk ? 'Закрити історію' : 'Geschiedenis sluiten'}><X aria-hidden='true' /></button></p>
      {!hist ? <p className='tech-meta'>{uk ? 'Завантаження…' : 'Laden…'}</p> : hist.opdrachten.length === 0 ? <p className='tech-meta'>{uk ? 'Ще немає команд.' : 'Nog geen opdrachten.'}</p> : (
        <ul className='tech-lijst' data-term-lijst='opdrachten'>{hist.opdrachten.map((o) => (
          <li key={o.id} data-term-rij={o.id}>
            <span className='tech-lijst-wie'><b><code>{o.regel}</code></b><small>{new Date(o.begin).toLocaleString()} · {o.apparaat}{o.email ? ` · ${o.email}` : ''} · {o.soort === 'lezend' ? (uk ? 'читання' : 'lezen') : (uk ? 'зміна' : 'wijziging')}{o.powershell ? ' · PowerShell' : ''} · {o.staat}{o.code !== null ? ` (${o.code})` : ''} · {o.bytes} B</small></span>
            <span className='tech-knoppen'>
              {o.uitvoer ? <button type='button' onClick={() => setOpen(open === o.id ? '' : o.id)} data-term-knop={`toon:${o.id}`}>{open === o.id ? (uk ? 'Сховати' : 'Verberg') : (uk ? 'Вивід' : 'Uitvoer')}</button> : null}
              <button type='button' onClick={() => herhaal(o.regel)} data-term-knop={`herhaal:${o.id}`}>{uk ? 'Повторити' : 'Herhaal'}</button>
            </span>
            {open === o.id ? <pre className='term-pre'>{o.uitvoer}</pre> : null}
          </li>
        ))}</ul>
      )}
    </div>
  );
}

/** Containerterminal (zoals voorheen): wegwerpcontainer op een apparaat met podman/docker; stap-op bij het openen. */
function ContainerOpenen({ uk, lijst, sluit, terug, naarOpnames }: { uk: boolean; lijst: Apparaat[]; sluit: () => void; terug?: () => void; naarOpnames: () => void }) {
  const [agentId, setAgentId] = useState(() => lijst.find((a) => a.online && a.terminal && a.toegestaan !== false)?.id ?? '');
  const [root, setRoot] = useState(() => lijst.find((a) => a.online && a.terminal && a.toegestaan !== false)?.roots[0]?.pad ?? '');
  const [schrijven, setSchrijven] = useState(false);
  const [minuten, setMinuten] = useState(15);
  const [reden, setReden] = useState('');
  const [bezig, setBezig] = useState(false);
  const [melding, setMelding] = useState('');
  const [open, setOpen] = useState<Open | null>(null);
  const ap = lijst.find((a) => a.id === agentId);
  const rootInfo = ap?.roots.find((r) => r.pad === root);
  const doe = async () => {
    setBezig(true); setMelding('');
    try {
      const r = await api.post('/api/terminal/openen', { ...body(), agentId, root, schrijven: schrijven && !rootInfo?.alleenLezen, minuten, reden, cols: 100, rows: 30 });
      setOpen(r.data as Open);
    } catch (e) { setMelding(foutTekst(e, uk)); } finally { setBezig(false); }
  };
  if (open) return <TerminalSessie open={open} uk={uk} sluit={() => { setOpen(null); sluit(); }} />;
  return (
    <Venster id='terminal-openen' titel={uk ? 'Термінал · контейнер' : 'Terminal · container'} breedte={560} onSluit={sluit}>
      <form className='tech-venster' data-term-venster='openen' onSubmit={(e) => { e.preventDefault(); if (!bezig) void doe(); }}>
        <p className='tech-lead'>{uk ? 'Командний рядок у тимчасовому контейнері на вашому пристрої: без мережі, обрана тека — типово лише для читання. Вихід записується.' : 'Opdrachtregel in een tijdelijke container op uw apparaat: geen netwerk, gekozen map standaard alleen-lezen. Uitvoer wordt opgenomen.'} <Vraag help={HELP_TERMINAL} uk={uk} label={uk ? 'Термінал' : 'Terminal'} /></p>
        {!lijst.some((a) => a.terminal) ? (
          <p className='tech-melding'>{uk ? 'Немає пристрою з увімкненим контейнерним терміналом. На пристрої (агент 0.8): node agent.mjs terminal-config on, потім node agent.mjs run.' : 'Geen apparaat met containerterminal. Op het apparaat (agent 0.8): node agent.mjs terminal-config on, daarna node agent.mjs run.'}</p>
        ) : (
          <>
            <label className='tech-veld'><span>{uk ? 'Пристрій' : 'Apparaat'}</span>
              <select data-hulp-vrij='keuze' value={agentId} onChange={(e) => { setAgentId(e.target.value); const a = lijst.find((x) => x.id === e.target.value); setRoot(a?.roots[0]?.pad ?? ''); }} data-term-apparaat='1'>
                {lijst.filter((a) => a.terminal).map((a) => <option key={a.id} value={a.id} disabled={!a.online || a.toegestaan === false}>{a.naam}{a.test ? (uk ? ' · тестова' : ' · test') : ''}{a.online ? '' : (uk ? ' (не на зв’язку)' : ' (offline)')}{a.toegestaan === false ? (uk ? ' (лише для ролі з доступом до серверів)' : ' (alleen voor een rol met servertoegang)') : ''}</option>)}
              </select></label>
            <label className='tech-veld'><span>{uk ? 'Тека (стане /werk)' : 'Map (wordt /werk)'} <HulpVraag k='terminal.map' uk={uk} /></span>
              <select data-hulp='terminal.map' value={root} onChange={(e) => setRoot(e.target.value)} data-term-root='1'>{(ap?.roots ?? []).map((r) => <option key={r.pad} value={r.pad}>{r.pad}{r.alleenLezen ? (uk ? ' — лише читання' : ' — alleen lezen') : ''}</option>)}</select></label>
            <label className='ond-nood'><input data-hulp='terminal.schrijven' type='checkbox' checked={schrijven && !rootInfo?.alleenLezen} disabled={!!rootInfo?.alleenLezen} onChange={(e) => setSchrijven(e.target.checked)} data-term-schrijven='1' />{uk ? 'Дозволити запис у теку (типово лише читання)' : 'Schrijven in de map toestaan (standaard alleen lezen)'} <HulpVraag k='terminal.schrijven' uk={uk} /></label>
            <label className='tech-veld'><span>{uk ? 'Термін' : 'Duur'} <HulpVraag k='terminal.duur' uk={uk} /></span><select data-hulp='terminal.duur' value={minuten} onChange={(e) => setMinuten(Number(e.target.value))} data-term-minuten='1'>{[5, 15, 30, 60].filter((m) => m <= (ap?.maxMinuten ?? 60)).map((m) => <option key={m} value={m}>{m} {uk ? 'хв' : 'min'}</option>)}</select></label>
            <label className='tech-veld'><span>{uk ? 'Причина' : 'Reden'}</span><input value={reden} onChange={(e) => setReden(e.target.value)} minLength={3} maxLength={300} required data-term-reden='1' /></label>
          </>
        )}
        {melding ? <p className='tech-melding' role='alert'>{melding}</p> : null}
        <div className='tech-knoppen'>
          {terug ? <button type='button' onClick={terug} data-term-knop='terug'>{uk ? '← Командний термінал' : '← Opdracht-terminal'}</button> : null}
          <button type='button' onClick={naarOpnames} data-term-knop='opnames'>{uk ? 'Сеанси й записи' : 'Sessies en opnames'}</button>
          <button type='submit' className='is-hoofd' disabled={bezig || !ap?.online || !root || reden.trim().length < 3} data-term-knop='openen'><Play aria-hidden='true' />{uk ? 'Відкрити термінал' : 'Terminal openen'}</button>
        </div>
      </form>
    </Venster>
  );
}

/** HUB-08: reden van het einde (agent/server: 'einde', 'tijd', 'fout', 'gesloten', 'browser-weg', …) in gewone taal. */
export const EINDE_REDEN: Record<string, [string, string]> = {
  einde: ['оболонку завершено', 'shell beëindigd'], tijd: ['час вийшов', 'tijd verstreken'], fout: ['помилка', 'fout'], gesloten: ['закрито', 'gesloten'],
  'browser-weg': ['сторінку закрито', 'pagina gesloten'], 'agent-weigert': ['агент відмовив', 'agent weigerde'], 'agent-niet-bereikbaar': ['агент недоступний', 'agent onbereikbaar'],
  noodstop: ['кнопка «Стоп»', 'noodstop'], verbinding: ['з’єднання з агентом розірвано', 'verbinding met de agent verbroken'],
};
export const eindeTekst = (reden: unknown, uk: boolean): string => { const r = String(reden || 'einde'); const t = EINDE_REDEN[r]; return t ? (uk ? t[0] : t[1]) : r; };

function TerminalSessie({ open, uk, sluit }: { open: Open; uk: boolean; sluit: () => void }) {
  const doos = useRef<HTMLDivElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [stand, setStand] = useState<'verbinden' | 'actief' | 'einde'>('verbinden');
  const [melding, setMelding] = useState('');
  const [, setTik] = useState(0);
  useEffect(() => {
    let dicht = false; let term: import('@xterm/xterm').Terminal | null = null;
    const brugWeg = xtermCspBrug();
    void (async () => {
      const { Terminal } = await import('@xterm/xterm');
      if (dicht || !doos.current) return;
      term = new Terminal({ cols: 100, rows: 30, convertEol: false, cursorBlink: true, fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 14, scrollback: 5000, theme: { background: '#0d1117', foreground: '#e6edf3' } });
      term.open(doos.current);
      term.focus();
      const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/terminal/ws`);
      wsRef.current = ws;
      ws.onopen = () => ws.send(JSON.stringify({ t: 'auth', ticket: open.ticket }));
      ws.onmessage = (ev) => {
        let m: any; try { m = JSON.parse(String(ev.data)); } catch { return; }
        if (m.t === 'out') term?.write(vanB64(m.d));
        else if (m.t === 'gestart') setStand('actief');
        else if (m.t === 'fout') { setMelding(String(m.reden)); setStand('einde'); }
        else if (m.t === 'exit') { setStand('einde'); term?.write(`\r\n\x1b[33m[${uk ? 'сеанс завершено' : 'sessie beëindigd'}: ${eindeTekst(m.reden, uk)}]\x1b[0m\r\n`); }
      };
      ws.onclose = () => setStand('einde');
      term.onData((d) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ t: 'in', d: b64(d) })); });
    })();
    const i = window.setInterval(() => setTik((x) => x + 1), 15_000);
    return () => { dicht = true; window.clearInterval(i); try { wsRef.current?.send(JSON.stringify({ t: 'close' })); wsRef.current?.close(); } catch { /* al dicht */ } term?.dispose(); brugWeg(); };
  }, []);
  const rest = Math.max(0, Math.ceil((open.eind - Date.now()) / 60_000));
  return (
    <Venster id='terminal-sessie' titel={`${uk ? 'Термінал' : 'Terminal'} · ${open.apparaat}`} breedte={900} hoogte={620} onSluit={sluit}>
      <div className='term-sessie' data-term-sessie={open.sid} data-term-stand={stand}>
        <p className='term-kop'><TerminalSquare aria-hidden='true' /><b>{open.root}</b> · {open.schrijven ? (uk ? 'запис дозволено' : 'schrijven toegestaan') : (uk ? 'лише читання' : 'alleen lezen')} · {uk ? 'без мережі' : 'geen netwerk'} · <span className='term-rec'>● {uk ? 'запис виводу' : 'opname uitvoer'}</span> · {stand === 'einde' ? (uk ? 'завершено' : 'beëindigd') : (uk ? `ще ${rest} хв` : `nog ${rest} min`)}
          <button type='button' onClick={sluit} data-term-knop='sluiten'><Square aria-hidden='true' />{uk ? 'Закрити' : 'Sluiten'}</button></p>
        {melding ? <p className='tech-melding' role='alert'>{melding}</p> : null}
        <div className='term-doos' ref={doos} data-term-doos='1' />
      </div>
    </Venster>
  );
}

type SessieRij = { id: string; apparaat: string; root: string; schrijven: boolean; reden: string; minuten: number; begin: number; einde: number | null; eindeReden: string | null; bytes: number; opname: boolean; email: string; open: boolean };
function Opnames({ uk, sluit }: { uk: boolean; sluit: () => void }) {
  const [d, setD] = useState<{ magOpnames: boolean; sessies: SessieRij[] } | null>(null);
  const [cast, setCast] = useState('');
  const [fout, setFout] = useState('');
  useEffect(() => { void api.post('/api/terminal/sessies', body()).then((r) => setD(r.data), (e) => setFout(foutTekst(e, uk))); }, []);
  return (
    <Venster id='terminal-opnames' titel={uk ? 'Сеанси термінала' : 'Terminalsessies'} breedte={760} onSluit={sluit}>
      <div className='tech-venster' data-term-venster='opnames'>
        {fout ? <p className='tech-melding' role='alert'>{fout}</p> : !d ? <p className='tech-meta'>{uk ? 'Завантаження…' : 'Laden…'}</p> : (
          <>
            {!d.magOpnames ? <p className='tech-meta'>{uk ? 'Записи переглядають лише Аудитор і Власник (в активному технічному профілі).' : 'Opnames bekijken alleen Auditor en Eigenaar (actief technisch profiel).'}</p> : null}
            {d.sessies.length === 0 ? <p className='tech-meta'>{uk ? 'Контейнерних сеансів ще не було.' : 'Nog geen containersessies.'}</p> : null}
            <ul className='tech-lijst' data-term-lijst='1'>{d.sessies.map((s) => (
              <li key={s.id} data-term-rij={s.id}>
                <span className='tech-lijst-wie'><b>{s.apparaat} · {s.root}</b><small>{new Date(s.begin).toLocaleString()} · {s.email} · {s.schrijven ? (uk ? 'запис' : 'schrijven') : (uk ? 'читання' : 'lezen')} · {s.reden}</small></span>
                <span className='tech-lijst-stand'>{s.open ? (uk ? 'відкритий' : 'open') : `${s.eindeReden ?? '—'} · ${s.bytes} B`}</span>
                {s.opname ? <span className='tech-knoppen'><button type='button' onClick={() => void api.post('/api/terminal/opname', { ...body(), id: s.id }).then((r) => setCast(String(r.data?.cast || '')), (e) => setFout(foutTekst(e, uk)))} data-term-knop={`opname:${s.id}`}>{uk ? 'Відтворити запис' : 'Opname afspelen'}</button></span> : null}
              </li>
            ))}</ul>
            {cast ? <Afspelen cast={cast} /> : null}
          </>
        )}
      </div>
    </Venster>
  );
}
function Afspelen({ cast }: { cast: string }) {
  const doos = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    let term: import('@xterm/xterm').Terminal | null = null; let weg = false;
    const brugWeg = xtermCspBrug();
    void (async () => {
      const { Terminal } = await import('@xterm/xterm');
      if (weg || !doos.current) return;
      term = new Terminal({ cols: 100, rows: 24, disableStdin: true, fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 13, theme: { background: '#0d1117', foreground: '#e6edf3' } });
      term.open(doos.current);
      for (const regel of cast.split('\n').slice(1)) { try { const [, soort, tekst] = JSON.parse(regel); if (soort === 'o') term.write(tekst); } catch { /* lege regel */ } }
    })();
    return () => { weg = true; term?.dispose(); brugWeg(); };
  }, [cast]);
  return <div className='term-doos is-afspelen' ref={doos} data-term-afspelen='1' />;
}
