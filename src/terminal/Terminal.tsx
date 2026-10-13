// Термінал у браузері (etap C). xterm.js лише показує те, що надсилає контейнер на власному пристрої.
// Стилі xterm ідуть через constructable stylesheets: CSP сайту забороняє inline <style>.
import { useEffect, useRef, useState } from 'react';
import { SquareTerminal } from 'lucide-react';
import '@xterm/xterm/css/xterm.css';
import { Venster } from '../platform/vensters';
import { api } from '../platform/client';
import { ecosystemTabContext } from '../tab-context';
import { serviceFromLocation } from '../canonical-navigation';
import { zijbalkServerDienst } from '../zijbalk-voorkeuren';
import Vraag from '../tech/Vraag';
import { HELP_TERMINAL } from '../../shared/terminal';
import './terminal.css';

type Apparaat = { id: string; naam: string; online: boolean; roots: string[]; alleenLezen: string[]; maxMinuten: number; test: boolean };
const body = () => ({ service: zijbalkServerDienst() || serviceFromLocation(), tabContext: ecosystemTabContext(), sourceOrigin: location.origin });

let brugTeller = 0;
let origineel: typeof document.createElement | null = null;
const bladen = new Map<Element, CSSStyleSheet>();
let waarnemer: MutationObserver | null = null;
function brugSync() {
  for (const el of document.querySelectorAll('mr-xterm-stijl')) {
    let sh = bladen.get(el); if (!sh) { sh = new CSSStyleSheet(); bladen.set(el, sh); }
    try { sh.replaceSync(el.textContent || ''); } catch { /* ongeldige css */ }
  }
  for (const el of [...bladen.keys()]) if (!el.isConnected) bladen.delete(el);
  const eigen = [...bladen.values()];
  document.adoptedStyleSheets = [...document.adoptedStyleSheets.filter((x) => !(x as CSSStyleSheet & { __mr?: boolean }).__mr), ...eigen.map((x) => Object.assign(x, { __mr: true }))];
}
function xtermCspBrug(): () => void {
  if (brugTeller++ === 0) {
    origineel = document.createElement;
    const o = origineel;
    document.createElement = function (this: Document, tag: string, opties?: ElementCreationOptions) {
      return String(tag).toLowerCase() === 'style' ? o.call(this, 'mr-xterm-stijl', opties) : o.call(this, tag, opties);
    } as typeof document.createElement;
    waarnemer = new MutationObserver(brugSync);
    waarnemer.observe(document.documentElement, { subtree: true, childList: true, characterData: true });
  }
  return () => {
    if (--brugTeller > 0) return;
    if (origineel) document.createElement = origineel;
    origineel = null;
    waarnemer?.disconnect();
    waarnemer = null;
    document.adoptedStyleSheets = document.adoptedStyleSheets.filter((x) => !(x as CSSStyleSheet & { __mr?: boolean }).__mr);
    bladen.clear();
    document.querySelectorAll('mr-xterm-stijl').forEach((el) => el.remove());
  };
}

export default function TerminalVenster({ uk, sluit }: { uk: boolean; sluit: () => void }) {
  const [apps, setApps] = useState<Apparaat[]>([]);
  const [agentId, setAgentId] = useState('');
  const [root, setRoot] = useState('');
  const [schrijven, setSchrijven] = useState(false);
  const [minuten, setMinuten] = useState(15);
  const [reden, setReden] = useState('');
  const [fout, setFout] = useState('');
  const [bezig, setBezig] = useState(false);
  const [sid, setSid] = useState('');
  const scherm = useRef<HTMLDivElement | null>(null);
  const gekozen = apps.find((a) => a.id === agentId);

  useEffect(() => {
    api.post('/api/terminal/apparaten', body()).then((r) => {
      const lijst = (r.data?.apparaten ?? []) as Apparaat[];
      setApps(lijst);
      const eerste = lijst.find((a) => a.online) || lijst[0];
      if (eerste) { setAgentId(eerste.id); setRoot(eerste.roots[0] || ''); setMinuten(Math.min(15, eerste.maxMinuten)); }
    }).catch((e) => setFout(String((e as Error).message || 'FOUT')));
  }, []);

  useEffect(() => {
    if (!sid || !scherm.current) return;
    const el = scherm.current;
    let weg = false;
    let ws: WebSocket | null = null;
    const los = xtermCspBrug();
    const start = async () => {
      const { Terminal } = await import('@xterm/xterm');
      if (weg) return;
      const term = new Terminal({ cursorBlink: true, fontSize: 14, theme: { background: '#0d1117', foreground: '#e6edf3' } });
      term.open(el);
      term.writeln(uk ? 'З’єднання…' : 'Verbinden…');
      const ticket = el.dataset.ticket || '';
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(`${proto}//${location.host}/terminal/ws`);
      ws.onopen = () => ws?.send(JSON.stringify({ t: 'auth', ticket }));
      ws.onmessage = (ev) => {
        const msg = JSON.parse(String(ev.data));
        if (msg.t === 'out' && typeof msg.data === 'string') term.write(msg.data);
        if (msg.t === 'ready') term.clear();
      };
      term.onData((data) => { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ t: 'in', data })); });
      const ro = new ResizeObserver(() => { const cols = Math.max(20, Math.floor(el.clientWidth / 9)); const rows = Math.max(5, Math.floor(el.clientHeight / 18)); term.resize(cols, rows); });
      ro.observe(el);
      return () => { ro.disconnect(); term.dispose(); };
    };
    let opruimen: (() => void) | undefined;
    start().then((f) => { opruimen = f; });
    return () => { weg = true; ws?.close(); opruimen?.(); los(); };
  }, [sid, uk]);

  const open = async () => {
    setFout(''); setBezig(true);
    try {
      const el = scherm.current;
      const cols = el ? Math.max(20, Math.floor(el.clientWidth / 9)) : 80;
      const rows = el ? Math.max(5, Math.floor(el.clientHeight / 18)) : 24;
      const r = await api.post('/api/terminal/openen', { ...body(), agentId, root, schrijven, minuten, reden, cols, rows });
      const id = String(r.data?.id || '');
      const ticket = String(r.data?.ticket || '');
      if (scherm.current) scherm.current.dataset.ticket = ticket;
      setSid(id);
    } catch (e) { setFout(String((e as Error).message || 'FOUT')); }
    finally { setBezig(false); }
  };

  return (
    <Venster id='tech-terminal' titel={uk ? 'Термінал' : 'Terminal'} onSluit={sluit} breedte={760} hoogte={560} className='tech-venster' labelledBy='term-titel'>
      <div data-term-venster='1'>
      <h2 id='term-titel'>{uk ? 'Термінал' : 'Terminal'} <Vraag help={HELP_TERMINAL} uk={uk} /></h2>
      {!sid ? (
        <>
          <div className='term-rij'>
            <label>{uk ? 'Пристрій' : 'Apparaat'}
              <select value={agentId} onChange={(e) => { const id = e.target.value; setAgentId(id); const a = apps.find((x) => x.id === id); setRoot(a?.roots[0] || ''); }} data-term='apparaat'>
                {apps.length === 0 ? <option value=''>{uk ? 'Немає пристроїв із терміналом' : 'Geen apparaten met terminal'}</option> : null}
                {apps.map((a) => <option key={a.id} value={a.id}>{a.naam}{a.online ? '' : (uk ? ' (не в мережі)' : ' (offline)')}{a.test ? ' · test' : ''}</option>)}
              </select>
            </label>
            <label>{uk ? 'Тека' : 'Map'}
              <select value={root} onChange={(e) => setRoot(e.target.value)} data-term='map'>
                {(gekozen?.roots || []).map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>
            <label>{uk ? 'Хвилин' : 'Minuten'}
              <input type='number' min={1} max={gekozen?.maxMinuten || 60} value={minuten} onChange={(e) => setMinuten(Number(e.target.value))} data-term='minuten' />
            </label>
          </div>
          <label>{uk ? 'Причина' : 'Reden'}
            <input type='text' value={reden} onChange={(e) => setReden(e.target.value)} data-term='reden' />
          </label>
          <label><span><input type='checkbox' checked={schrijven} onChange={(e) => setSchrijven(e.target.checked)} data-term='schrijven' /> {uk ? 'Дозволити запис у теку' : 'Schrijven in de map toestaan'}</span></label>
          <button type='button' disabled={bezig || !agentId || !root || reden.trim().length < 3} onClick={() => void open()} data-term-knop='open'><SquareTerminal aria-hidden='true' />{uk ? 'Відкрити' : 'Openen'}</button>
        </>
      ) : <p>{uk ? 'Сесію записано. Введення не зберігається.' : 'Sessie wordt opgenomen. Invoer wordt niet bewaard.'}</p>}
      {fout ? <p className='term-let'>{fout}</p> : null}
      <div className='term-scherm' ref={scherm} data-term='scherm' />
      </div>
    </Venster>
  );
}
