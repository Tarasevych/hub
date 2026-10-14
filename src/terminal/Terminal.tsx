// Terminal in de browser (technisch profiel). xterm.js wordt pas geladen als een terminal echt opent (eigen chunk).
// Verbinding: POST /api/terminal/openen (stap-op) → eenmalig ticket → WSS /terminal/ws. De shell draait in een wegwerpcontainer op uw
// eigen apparaat (agent 0.6); niets draait op de server zelf.
import { useEffect, useRef, useState } from 'react';
import { Play, Square, TerminalSquare } from 'lucide-react';
import { Venster } from '../platform/vensters';
import { api } from '../platform/client';
import { routeLang, serviceFromLocation } from '../canonical-navigation';
import { ecosystemTabContext } from '../tab-context';
import { zijbalkServerDienst } from '../zijbalk-voorkeuren';
import Vraag from '../tech/Vraag';
import { HELP_TERMINAL } from '../../shared/terminal';
import '@xterm/xterm/css/xterm.css';
import './terminal.css';

const body = () => ({ service: zijbalkServerDienst() || serviceFromLocation(), tabContext: ecosystemTabContext(), sourceOrigin: location.origin });
type Apparaat = { id: string; naam: string; platform: string; online: boolean; terminal: boolean; test?: boolean; toegestaan?: boolean; image: string; maxMinuten: number; roots: Array<{ pad: string; alleenLezen: boolean }> };
type Open = { sid: string; ticket: string; eind: number; minuten: number; apparaat: string; root: string; schrijven: boolean };
const FOUTEN: Record<string, [string, string]> = {
  TECH_TERMINAL_VEREIST: ['Потрібен активний технічний профіль із правом термінала (Розробник, Адміністратор, Власник).', 'Een actief technisch profiel met terminalrecht is nodig.'],
  APPARAAT_OFFLINE: ['Пристрій не на зв’язку.', 'Apparaat niet verbonden.'],
  TERMINAL_ALLEEN_TESTMACHINE: ['Ваша роль відкриває лише тестові машини (позначені --test). Сервери — роль «Адміністратор» або «Власник».', 'Uw rol opent alleen testmachines (gemarkeerd met --test). Servers: rol «Адміністратор» of «Власник».'],
  TERMINAL_UIT_OP_APPARAAT: ['На пристрої термінал вимкнено: node agent.mjs terminal-config on', 'Terminal staat uit op het apparaat: node agent.mjs terminal-config on'],
  DUUR_ONGELDIG: ['Такий термін недоступний (не довше, ніж лишилося технічному профілю й дозволяє пристрій).', 'Deze duur kan niet (niet langer dan het technisch profiel en het apparaat toelaten).'],
  REDEN_ONGELDIG: ['Вкажіть причину (від 3 символів).', 'Geef een reden (minstens 3 tekens).'],
  ROOT_ALLEEN_LEZEN: ['Цю теку підключено лише для читання.', 'Deze map is alleen-lezen gekoppeld.'],
  TE_VEEL_TERMINALS: ['Уже відкрито 3 термінали.', 'Er zijn al 3 terminals open.'],
};
const foutTekst = (e: unknown, uk: boolean) => { const c = String((e as Error)?.message || 'FOUT'); const f = FOUTEN[c]; return f ? (uk ? f[0] : f[1]) : /STEP_UP|STAP_OP/.test(c) ? (uk ? 'Вхід не підтверджено — нічого не відкрито.' : 'Aanmelding niet bevestigd — niets geopend.') : `${uk ? 'Не вдалося' : 'Mislukt'} (${c}).`; };

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

export function TerminalOpenen({ sluit }: { sluit: () => void }) {
  const uk = routeLang() !== 'nl';
  const [lijst, setLijst] = useState<Apparaat[] | null>(null);
  const [agentId, setAgentId] = useState('');
  const [root, setRoot] = useState('');
  const [schrijven, setSchrijven] = useState(false);
  const [minuten, setMinuten] = useState(15);
  const [reden, setReden] = useState('');
  const [bezig, setBezig] = useState(false);
  const [melding, setMelding] = useState('');
  const [open, setOpen] = useState<Open | null>(null);
  const [opnames, setOpnames] = useState(false);
  useEffect(() => {
    void api.post('/api/terminal/apparaten', body()).then((r) => {
      const l = (r.data?.apparaten ?? []) as Apparaat[];
      setLijst(l);
      const eerste = l.find((a) => a.online && a.terminal && a.toegestaan !== false);
      if (eerste) { setAgentId(eerste.id); setRoot(eerste.roots[0]?.pad ?? ''); }
    }, (e) => setMelding(foutTekst(e, uk)));
  }, []);
  const ap = lijst?.find((a) => a.id === agentId);
  const rootInfo = ap?.roots.find((r) => r.pad === root);
  const doe = async () => {
    setBezig(true); setMelding('');
    try {
      const r = await api.post('/api/terminal/openen', { ...body(), agentId, root, schrijven: schrijven && !rootInfo?.alleenLezen, minuten, reden, cols: 100, rows: 30 });
      setOpen(r.data as Open);
    } catch (e) { setMelding(foutTekst(e, uk)); } finally { setBezig(false); }
  };
  if (open) return <TerminalSessie open={open} uk={uk} sluit={() => { setOpen(null); sluit(); }} />;
  if (opnames) return <Opnames uk={uk} sluit={() => setOpnames(false)} />;
  return (
    <Venster id='terminal-openen' titel={uk ? 'Термінал' : 'Terminal'} breedte={560} onSluit={sluit}>
      <form className='tech-venster' data-term-venster='openen' onSubmit={(e) => { e.preventDefault(); if (!bezig) void doe(); }}>
        <p className='tech-lead'>{uk ? 'Командний рядок у тимчасовому контейнері на вашому пристрої: без мережі, обрана тека — за замовчуванням лише для читання. Вихід записується.' : 'Opdrachtregel in een tijdelijke container op uw apparaat: geen netwerk, gekozen map standaard alleen-lezen. Uitvoer wordt opgenomen.'} <Vraag help={HELP_TERMINAL} uk={uk} label={uk ? 'Термінал' : 'Terminal'} /></p>
        {lijst === null ? <p className='tech-meta'>{uk ? 'Завантаження…' : 'Laden…'}</p> : !lijst.some((a) => a.terminal) ? (
          <p className='tech-melding'>{uk ? 'Немає пристрою з увімкненим терміналом. На пристрої (агент 0.6): node agent.mjs terminal-config on, потім node agent.mjs run.' : 'Geen apparaat met terminal. Op het apparaat (agent 0.6): node agent.mjs terminal-config on, daarna node agent.mjs run.'}</p>
        ) : (
          <>
            <label className='tech-veld'><span>{uk ? 'Пристрій' : 'Apparaat'}</span>
              <select value={agentId} onChange={(e) => { setAgentId(e.target.value); const a = lijst.find((x) => x.id === e.target.value); setRoot(a?.roots[0]?.pad ?? ''); }} data-term-apparaat='1'>
                {lijst.filter((a) => a.terminal).map((a) => <option key={a.id} value={a.id} disabled={!a.online || a.toegestaan === false}>{a.naam}{a.test ? (uk ? ' · тестова' : ' · test') : ''}{a.online ? '' : (uk ? ' (не на зв’язку)' : ' (offline)')}{a.toegestaan === false ? (uk ? ' (лише для ролі з доступом до серверів)' : ' (alleen voor een rol met servertoegang)') : ''}</option>)}
              </select></label>
            <label className='tech-veld'><span>{uk ? 'Тека (стане /werk)' : 'Map (wordt /werk)'}</span>
              <select value={root} onChange={(e) => setRoot(e.target.value)} data-term-root='1'>{(ap?.roots ?? []).map((r) => <option key={r.pad} value={r.pad}>{r.pad}{r.alleenLezen ? (uk ? ' — лише читання' : ' — alleen lezen') : ''}</option>)}</select></label>
            <label className='ond-nood'><input type='checkbox' checked={schrijven && !rootInfo?.alleenLezen} disabled={!!rootInfo?.alleenLezen} onChange={(e) => setSchrijven(e.target.checked)} data-term-schrijven='1' />{uk ? 'Дозволити запис у теку (за замовчуванням лише читання)' : 'Schrijven in de map toestaan (standaard alleen lezen)'}</label>
            <label className='tech-veld'><span>{uk ? 'Термін' : 'Duur'}</span><select value={minuten} onChange={(e) => setMinuten(Number(e.target.value))} data-term-minuten='1'>{[5, 15, 30, 60].filter((m) => m <= (ap?.maxMinuten ?? 60)).map((m) => <option key={m} value={m}>{m} {uk ? 'хв' : 'min'}</option>)}</select></label>
            <label className='tech-veld'><span>{uk ? 'Причина' : 'Reden'}</span><input value={reden} onChange={(e) => setReden(e.target.value)} minLength={3} maxLength={300} required data-term-reden='1' /></label>
          </>
        )}
        {melding ? <p className='tech-melding' role='alert'>{melding}</p> : null}
        <div className='tech-knoppen'>
          <button type='button' onClick={() => setOpnames(true)} data-term-knop='opnames'>{uk ? 'Сеанси й записи' : 'Sessies en opnames'}</button>
          <button type='submit' className='is-hoofd' disabled={bezig || !ap?.online || !root || reden.trim().length < 3} data-term-knop='openen'><Play aria-hidden='true' />{uk ? 'Відкрити термінал' : 'Terminal openen'}</button>
        </div>
      </form>
    </Venster>
  );
}

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
        else if (m.t === 'exit') { setStand('einde'); term?.write(`\r\n\x1b[33m[${uk ? 'сеанс завершено' : 'sessie beëindigd'}: ${m.reden}]\x1b[0m\r\n`); }
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
