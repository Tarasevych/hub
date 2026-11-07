// «Віддалений стіл» (technisch profiel, alleen eigenaar): RDP/VNC/SSH via Apache Guacamole. Eigen chunk (lazyTech in TechLaag);
// guacamole-common-js laadt pas als een sessie echt opent. Keten en regels: backend/remote-bureaublad.ts, shared/extern-bureaublad.ts.
//   Openen: passkey → POST /api/owner/remote/openen → ticket (60 s, eenmalig) → WSS /api/owner/remote/tunnel → eerste bericht «mr-auth».
//   Het wachtwoord gaat één keer naar de server (bij opslaan, naar de kluis) en komt nooit meer terug naar de browser.
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ClipboardCopy, Expand, Fingerprint, Keyboard, MonitorSmartphone, MonitorUp, Pencil, Play, Plug, Plus, Power, ShieldAlert, SquareTerminal, Trash2, X } from 'lucide-react';
import { Venster } from '../platform/vensters';
import { api } from '../platform/client';
import { routeLang } from '../canoniek-navigatie';
import { actieVoorUrl, bevestigToegang } from '../platform/stap-op';
import { techActief, techBody, useTech } from '../tech/tech-opslag';
import { REMOTE_PROTOCOLLEN, STANDAARD_INSTELLINGEN, STANDAARD_POORT, remoteEindeTekst, remoteFoutTekst, type RemoteInstellingen, type RemoteProtocol } from '../../shared/extern-bureaublad';
import { remoteSessieBegin } from './extern-opslag';
import './extern.css';
import HulpVraag from '../hulp/HulpVraag';
import GeheimInvoer from '../geheim/GeheimInvoer';

type Verbinding = { id: string; naam: string; protocol: RemoteProtocol; host: string; poort: number; gebruiker: string; heeftGeheim: boolean; instellingen: RemoteInstellingen; gewijzigd: number };
type Stand = { aan: boolean; guacd: boolean; kluis: boolean; techActief: boolean; techEind: number | null; verbindingen: Verbinding[]; toegestaneHosts: string[]; actief: Array<{ sid: string; naam: string; protocol: RemoteProtocol; host: string; begin: number; eind: number; verbonden: boolean }> };
export type Open = { sid: string; ticket: string; verloopt: number; eind: number; naam: string; protocol: RemoteProtocol; inactiefMs: number };
type Rij = { id: string; naam: string; protocol: string; host: string; poort: number; begin: number; eindGepland: number; einde: number | null; reden: string | null; bytesIn: number; bytesUit: number; opname: boolean; open: boolean };

const code = (e: unknown) => String((e as Error)?.message || 'FOUT');
const foutTekst = (e: unknown, uk: boolean) => { const c = code(e); const t = remoteFoutTekst(c, uk ? 'uk' : 'nl'); return t !== c ? t : /STEP_UP|STAP_OP/.test(c) ? (uk ? 'Passkey не підтверджено — нічого не змінено.' : 'Passkey niet bevestigd — niets gewijzigd.') : `${uk ? 'Не вдалося' : 'Mislukt'} (${c}).`; };
const PROTO: Record<RemoteProtocol, { naam: string; icoon: typeof MonitorUp }> = { rdp: { naam: 'RDP', icoon: MonitorUp }, vnc: { naam: 'VNC', icoon: MonitorSmartphone }, ssh: { naam: 'SSH', icoon: SquareTerminal } };
const RESOLUTIES: Array<[number, number]> = [[1280, 800], [1366, 768], [1600, 900], [1920, 1080], [1024, 768]];

/** Passkey vóór een handeling die de server met een verse passkey wil (geen Google/TOTP). false = niet bevestigd. */
async function metPasskey(url: string): Promise<boolean> {
  const b = techBody();
  const uit = await bevestigToegang({ service: b.service, tabContext: b.tabContext, post: (u, d) => api.post(u, d), toegestaan: ['passkey'], actie: actieVoorUrl(url) });
  return uit.ok;
}
async function postMetPasskey(url: string, data: Record<string, unknown>) {
  if (!(await metPasskey(url))) throw new Error('STEP_UP_REQUIRED');
  return api.post(url, { ...techBody(), ...data });
}

export default function RemoteBureaublad({ sluit }: { sluit: () => void }) {
  const uk = routeLang() !== 'nl';
  const [stand, setStand] = useState<Stand | null>(null);
  const [melding, setMelding] = useState<{ tekst: string; ok?: boolean } | null>(null);
  const [bewerk, setBewerk] = useState<Verbinding | 'nieuw' | null>(null);
  const [hosts, setHosts] = useState(false);
  const [geschiedenis, setGeschiedenis] = useState(false);
  const [bezig, setBezig] = useState('');
  const [test, setTest] = useState<Record<string, { ok: boolean; ms: number; ip: string; fout?: string }>>({});
  const [open, setOpen] = useState<Open | null>(null);
  const laden = () => api.post('/api/owner/remote/stand', techBody()).then((r) => setStand(r.data as Stand), (e) => setMelding({ tekst: foutTekst(e, uk) }));
  useEffect(() => { void laden(); }, []);

  const testen = async (v: Verbinding) => {
    setBezig(`test:${v.id}`);
    try { const r = await api.post('/api/owner/remote/verbinding/testen', { ...techBody(), id: v.id }); setTest((t) => ({ ...t, [v.id]: r.data })); }
    catch (e) { setTest((t) => ({ ...t, [v.id]: { ok: false, ms: 0, ip: '', fout: foutTekst(e, uk) } })); }
    finally { setBezig(''); }
  };
  const openen = async (v: Verbinding) => {
    setBezig(`open:${v.id}`); setMelding(null);
    try {
      const vp = typeof window !== 'undefined' ? window.visualViewport : null;
      const w = Math.round(vp?.width ?? window.innerWidth), h = Math.round((vp?.height ?? window.innerHeight) - 48);
      const r = await postMetPasskey('/api/owner/remote/openen', { id: v.id, ...(w >= 640 && h >= 480 && v.protocol === 'rdp' ? { breedte: w, hoogte: h, dpi: 96 } : {}) });
      setOpen(r.data as Open);
    } catch (e) { setMelding({ tekst: foutTekst(e, uk) }); } finally { setBezig(''); }
  };
  const verwijderen = async (v: Verbinding) => {
    if (!window.confirm(uk ? `Видалити підключення «${v.naam}» разом із паролем у сховищі?` : `Verbinding «${v.naam}» met het wachtwoord in de kluis verwijderen?`)) return;
    setBezig(`weg:${v.id}`);
    try { await postMetPasskey('/api/owner/remote/verbinding/verwijderen', { id: v.id }); setMelding({ tekst: uk ? 'Підключення видалено.' : 'Verbinding verwijderd.', ok: true }); await laden(); }
    catch (e) { setMelding({ tekst: foutTekst(e, uk) }); } finally { setBezig(''); }
  };

  if (open) return <RemoteSessie open={open} uk={uk} sluit={() => { setOpen(null); void laden(); }} />;
  if (bewerk) return <VerbindingForm uk={uk} v={bewerk === 'nieuw' ? null : bewerk} sluit={(ok) => { setBewerk(null); if (ok) { setMelding({ tekst: uk ? 'Збережено.' : 'Opgeslagen.', ok: true }); void laden(); } }} />;
  if (hosts && stand) return <HostsForm uk={uk} hosts={stand.toegestaneHosts} sluit={(ok) => { setHosts(false); if (ok) void laden(); }} />;
  if (geschiedenis) return <Geschiedenis uk={uk} sluit={() => setGeschiedenis(false)} />;

  const uitleg = !stand ? null : !stand.aan ? remoteFoutTekst('REMOTE_UIT', uk ? 'uk' : 'nl') : !stand.guacd ? remoteFoutTekst('GUACD_ONBEREIKBAAR', uk ? 'uk' : 'nl') : !stand.techActief ? remoteFoutTekst('TECH_PROFIEL_VEREIST', uk ? 'uk' : 'nl') : '';
  return (
    <Venster id='remote-bureaublad' titel={uk ? 'Віддалений стіл' : 'Extern bureaublad'} breedte={760} onSluit={sluit}>
      <div className='tech-venster rb-venster' data-rb-venster='lijst'>
        <p className='tech-lead'>{uk
          ? 'RDP, VNC або SSH до комп’ютерів у вашій мережі — у вікні браузера. Лише власник, лише з активним технічним профілем у цій вкладці; кожне відкриття — з passkey і записується в журнал. ШІ-агенти доступу не мають.'
          : 'RDP, VNC of SSH naar computers in uw netwerk — in het browservenster. Alleen de eigenaar, alleen met een actief technisch profiel in dit tabblad; elke sessie met passkey en in het logboek. AI-agenten hebben geen toegang.'}</p>
        {stand ? (
          <p className='rb-stand' data-rb-stand={`${stand.aan ? 'aan' : 'uit'}|${stand.guacd ? 'guacd' : 'geen-guacd'}|${stand.techActief ? 'tech' : 'geen-tech'}`}>
            <span className={stand.aan ? 'is-ok' : 'is-uit'}>{uk ? 'Сервер' : 'Server'}: {stand.aan ? (uk ? 'увімкнено' : 'aan') : (uk ? 'вимкнено' : 'uit')}</span>
            <span className={stand.guacd ? 'is-ok' : 'is-uit'}>guacd: {stand.guacd ? (uk ? 'працює' : 'actief') : (uk ? 'недоступний' : 'onbereikbaar')}</span>
            <span className={stand.kluis ? 'is-ok' : 'is-uit'}>{uk ? 'Сховище' : 'Kluis'}: {stand.kluis ? 'OK' : (uk ? 'не налаштовано' : 'niet ingericht')}</span>
            <span className={stand.techActief ? 'is-ok' : 'is-uit'}>{uk ? 'Техпрофіль' : 'Techprofiel'}: {stand.techActief ? (uk ? 'активний' : 'actief') : (uk ? 'неактивний' : 'niet actief')}</span>
          </p>
        ) : <p className='tech-meta'>{uk ? 'Завантаження…' : 'Laden…'}</p>}
        {uitleg ? <p className='tech-melding' data-rb-uitleg='1'>{uitleg}</p> : null}
        {melding ? <p className={`tech-melding${melding.ok ? ' is-ok' : ''}`} role={melding.ok ? 'status' : 'alert'}>{melding.tekst}</p> : null}
        {stand && !stand.verbindingen.length ? <p className='tech-meta' data-rb-leeg='1'>{uk ? 'Ще немає підключень. Додайте перше — адреса з приватної мережі (10.x, 192.168.x, 172.16–31.x, localhost) або явно дозволений хост.' : 'Nog geen verbindingen. Voeg er een toe — een adres in een privénetwerk (10.x, 192.168.x, 172.16–31.x, localhost) of een uitdrukkelijk toegestane host.'}</p> : null}
        <ul className='rb-kaarten' data-rb-lijst='1'>
          {(stand?.verbindingen ?? []).map((v) => {
            const P = PROTO[v.protocol]; const tr = test[v.id];
            const live = stand?.actief.find((a) => a.naam === v.naam);
            return (
              <li key={v.id} className='rb-kaart' data-rb-kaart={v.id} data-rb-protocol={v.protocol}>
                <div className='rb-kaart-kop'>
                  <P.icoon aria-hidden='true' />
                  <b className='rb-kaart-naam'>{v.naam}</b>
                  <span className={`rb-chip is-${v.protocol}`}>{P.naam}</span>
                  {live ? <span className='rb-chip is-live' data-rb-live='1'>● {uk ? 'відкрито' : 'open'}</span> : null}
                </div>
                <p className='rb-kaart-doel'><code>{v.host}:{v.poort}</code>{v.gebruiker ? <> · {v.gebruiker}</> : null} · {v.heeftGeheim ? (uk ? 'пароль у сховищі' : 'wachtwoord in kluis') : (uk ? 'без пароля' : 'zonder wachtwoord')}</p>
                <p className='rb-kaart-opties'>
                  <span>{v.instellingen.klembord ? (uk ? 'буфер обміну: так' : 'klembord: aan') : (uk ? 'буфер обміну: ні' : 'klembord: uit')}</span>
                  <span>{v.instellingen.bestanden ? (uk ? 'файли: так' : 'bestanden: aan') : (uk ? 'файли: ні' : 'bestanden: uit')}</span>
                  {v.instellingen.opnemen ? <span className='is-rec'>● {uk ? 'запис' : 'opname'}</span> : null}
                  {v.protocol === 'rdp' ? <span>{v.instellingen.breedte}×{v.instellingen.hoogte}</span> : null}
                </p>
                {tr ? <p className={`rb-test ${tr.ok ? 'is-ok' : 'is-uit'}`} data-rb-test={tr.ok ? 'ok' : 'dicht'}>{tr.ok ? (uk ? `Доступний (${tr.ip}, ${tr.ms} мс)` : `Bereikbaar (${tr.ip}, ${tr.ms} ms)`) : (tr.fout || remoteFoutTekst('TCP_DICHT', uk ? 'uk' : 'nl'))}</p> : null}
                <div className='tech-knoppen'>
                  <button type='button' className='is-hoofd' disabled={!!bezig || !stand?.aan || !stand?.guacd || !stand?.techActief} onClick={() => void openen(v)} data-rb-knop={`open:${v.id}`}><Play aria-hidden='true' />{uk ? 'Відкрити' : 'Openen'}</button>
                  <button type='button' disabled={!!bezig} onClick={() => void testen(v)} data-rb-knop={`test:${v.id}`}><Plug aria-hidden='true' />{bezig === `test:${v.id}` ? (uk ? 'Перевірка…' : 'Testen…') : (uk ? 'Перевірити' : 'Testen')}</button>
                  <button type='button' disabled={!!bezig} onClick={() => setBewerk(v)} data-rb-knop={`bewerk:${v.id}`}><Pencil aria-hidden='true' />{uk ? 'Змінити' : 'Wijzigen'}</button>
                  <button type='button' className='is-gevaar' disabled={!!bezig} onClick={() => void verwijderen(v)} data-rb-knop={`weg:${v.id}`}><Trash2 aria-hidden='true' />{uk ? 'Видалити' : 'Verwijderen'}</button>
                </div>
              </li>
            );
          })}
        </ul>
        <div className='tech-knoppen'>
          <button type='button' className='is-hoofd' disabled={!stand} onClick={() => setBewerk('nieuw')} data-rb-knop='nieuw'><Plus aria-hidden='true' />{uk ? 'Додати підключення' : 'Verbinding toevoegen'}</button>
          <button type='button' disabled={!stand} onClick={() => setHosts(true)} data-rb-knop='hosts'><ShieldAlert aria-hidden='true' />{uk ? `Дозволені хости (${stand?.toegestaneHosts.length ?? 0})` : `Toegestane hosts (${stand?.toegestaneHosts.length ?? 0})`}</button>
          <button type='button' onClick={() => setGeschiedenis(true)} data-rb-knop='geschiedenis'>{uk ? 'Журнал сеансів' : 'Sessielogboek'}</button>
        </div>
      </div>
    </Venster>
  );
}

// ---------------------------------------------------------------- formulier
function VerbindingForm({ uk, v, sluit }: { uk: boolean; v: Verbinding | null; sluit: (ok: boolean) => void }) {
  const [naam, setNaam] = useState(v?.naam ?? '');
  const [protocol, setProtocol] = useState<RemoteProtocol>(v?.protocol ?? 'rdp');
  const [host, setHost] = useState(v?.host ?? '');
  const [poort, setPoort] = useState(String(v?.poort ?? STANDAARD_POORT.rdp));
  const [gebruiker, setGebruiker] = useState(v?.gebruiker ?? '');
  const [geheim, setGeheim] = useState('');
  const [inst, setInst] = useState<RemoteInstellingen>(v?.instellingen ?? STANDAARD_INSTELLINGEN);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState('');
  const zet = <K extends keyof RemoteInstellingen>(k: K, w: RemoteInstellingen[K]) => setInst((i) => ({ ...i, [k]: w }));
  const kiesProtocol = (p: RemoteProtocol) => { if (String(STANDAARD_POORT[protocol]) === poort || !poort) setPoort(String(STANDAARD_POORT[p])); setProtocol(p); };
  const resolutie = `${inst.breedte}x${inst.hoogte}`;
  const sleutel = protocol === 'ssh' && /PRIVATE KEY/.test(geheim);
  const opslaan = async () => {
    setBezig(true); setFout('');
    try {
      await postMetPasskey('/api/owner/remote/verbinding/opslaan', { ...(v ? { id: v.id } : {}), naam, protocol, host, poort: Number(poort), gebruiker, ...(geheim ? { geheim } : {}), instellingen: inst });
      setGeheim('');
      sluit(true);
    } catch (e) { setFout(foutTekst(e, uk)); } finally { setBezig(false); }
  };
  return (
    <Venster id='remote-verbinding' titel={v ? (uk ? 'Змінити підключення' : 'Verbinding wijzigen') : (uk ? 'Нове підключення' : 'Nieuwe verbinding')} breedte={600} onSluit={() => sluit(false)}>
      <form className='tech-venster rb-venster' data-rb-venster='formulier' autoComplete='off' onSubmit={(e) => { e.preventDefault(); if (!bezig) void opslaan(); }}>
        <label className='tech-veld'><span>{uk ? 'Назва' : 'Naam'}</span><input value={naam} onChange={(e) => setNaam(e.target.value)} maxLength={60} required data-rb-veld='naam' /></label>
        <div className='rb-rij'>
          <label className='tech-veld'><span>{uk ? 'Протокол' : 'Protocol'} <HulpVraag k='remote.protocol' uk={uk} /></span>
            <select data-hulp='remote.protocol' value={protocol} onChange={(e) => kiesProtocol(e.target.value as RemoteProtocol)} data-rb-veld='protocol'>{REMOTE_PROTOCOLLEN.map((p) => <option key={p} value={p}>{PROTO[p].naam}</option>)}</select></label>
          <label className='tech-veld rb-breed'><span>{uk ? 'Хост (IP або ім’я)' : 'Host (IP of naam)'}</span><input value={host} onChange={(e) => setHost(e.target.value)} maxLength={253} required inputMode='url' spellCheck={false} placeholder='192.168.1.20' data-rb-veld='host' /></label>
          <label className='tech-veld rb-smal'><span>{uk ? 'Порт' : 'Poort'}</span><input value={poort} onChange={(e) => setPoort(e.target.value.replace(/\D/g, '').slice(0, 5))} inputMode='numeric' required data-rb-veld='poort' /></label>
        </div>
        <p className='tech-meta'>{uk ? 'Дозволено: приватні мережі й localhost без налаштувань; публічні адреси — лише зі списку «Дозволені хости». Сервер сам перевіряє DNS (усі адреси) і підключається за IP.' : 'Toegestaan: privénetwerken en localhost; publieke adressen alleen van de lijst «Toegestane hosts». De server controleert DNS (alle adressen) en verbindt op IP.'}</p>
        <label className='tech-veld'><span>{uk ? 'Логін' : 'Gebruikersnaam'}</span><input value={gebruiker} onChange={(e) => setGebruiker(e.target.value)} maxLength={120} autoComplete='off' spellCheck={false} data-rb-veld='gebruiker' /></label>
        <label className='tech-veld'><span>{protocol === 'ssh' ? (uk ? 'Пароль або приватний ключ (PEM)' : 'Wachtwoord of privésleutel (PEM)') : (uk ? 'Пароль' : 'Wachtwoord')}</span>
          {protocol === 'ssh' ? <GeheimInvoer lang={uk ? 'uk' : 'nl'} value={geheim} onChange={setGeheim} rijen={sleutel ? 6 : 2} verborgen={!sleutel} spellCheck={false} autoComplete='off' placeholder={v?.heeftGeheim ? (uk ? 'порожньо — залишити як є' : 'leeg — ongewijzigd laten') : ''} max={16384} soort='pem' data={{ 'rb-veld': 'geheim' }} />
            : <GeheimInvoer lang={uk ? 'uk' : 'nl'} value={geheim} onChange={setGeheim} autoComplete='new-password' placeholder={v?.heeftGeheim ? (uk ? 'порожньо — залишити як є' : 'leeg — ongewijzigd laten') : ''} max={8192} soort='remote' data={{ 'rb-veld': 'geheim' }} />}
        </label>
        <p className='tech-meta'>{uk ? 'Пароль/ключ зберігається зашифрованим у «Секрети й ключі» (сховище власника) і більше не показується. У журнал він не потрапляє.' : 'Wachtwoord/sleutel wordt versleuteld bewaard in «Geheimen en sleutels» (kluis van de eigenaar) en nooit meer getoond. Het komt niet in het logboek.'}</p>
        <fieldset className='rb-opties'><legend>{uk ? 'Налаштування' : 'Instellingen'}</legend>
          {protocol === 'rdp' ? (
            <div className='rb-rij'>
              <label className='tech-veld'><span>{uk ? 'Роздільність (якщо вікно менше)' : 'Resolutie (als het venster kleiner is)'} <HulpVraag k='remote.resolutie' uk={uk} /></span>
                <select data-hulp='remote.resolutie' value={resolutie} onChange={(e) => { const [w, h] = e.target.value.split('x').map(Number); setInst((i) => ({ ...i, breedte: w, hoogte: h })); }} data-rb-veld='resolutie'>
                  {RESOLUTIES.map(([w, h]) => <option key={`${w}x${h}`} value={`${w}x${h}`}>{w}×{h}</option>)}
                  {!RESOLUTIES.some(([w, h]) => w === inst.breedte && h === inst.hoogte) ? <option value={resolutie}>{inst.breedte}×{inst.hoogte}</option> : null}
                </select></label>
              <label className='tech-veld'><span>{uk ? 'Безпека RDP' : 'RDP-beveiliging'} <HulpVraag k='remote.beveiliging' uk={uk} /></span>
                <select data-hulp='remote.beveiliging' value={inst.beveiliging} onChange={(e) => zet('beveiliging', e.target.value as RemoteInstellingen['beveiliging'])} data-rb-veld='beveiliging'>
                  <option value='any'>{uk ? 'автоматично' : 'automatisch'}</option><option value='nla'>NLA</option><option value='tls'>TLS</option><option value='rdp'>RDP</option>
                </select></label>
            </div>
          ) : null}
          <label className='rb-vink'><input data-hulp='remote.klembord' type='checkbox' checked={inst.klembord} onChange={(e) => zet('klembord', e.target.checked)} data-rb-veld='klembord' />{uk ? 'Спільний буфер обміну (копіювати/вставити)' : 'Gedeeld klembord (kopiëren/plakken)'} <HulpVraag k='remote.klembord' uk={uk} /></label>
          <label className='rb-vink'><input data-hulp='remote.bestanden' type='checkbox' checked={inst.bestanden} onChange={(e) => zet('bestanden', e.target.checked)} data-rb-veld='bestanden' />{uk ? 'Передавання файлів (типово вимкнено)' : 'Bestandsoverdracht (standaard uit)'} <HulpVraag k='remote.bestanden' uk={uk} /></label>
          {inst.bestanden ? <p className='tech-melding' data-rb-waarschuwing='bestanden'>{uk ? 'Файли зможуть іти в обидва боки. Вмикайте лише на час потреби.' : 'Bestanden kunnen dan beide kanten op. Zet dit alleen aan zolang het nodig is.'}</p> : null}
          <label className='rb-vink'><input data-hulp='remote.opnemen' type='checkbox' checked={inst.opnemen} onChange={(e) => zet('opnemen', e.target.checked)} data-rb-veld='opnemen' />{uk ? 'Записувати сеанс (на сервері, 30 днів)' : 'Sessie opnemen (op de server, 30 dagen)'} <HulpVraag k='remote.opnemen' uk={uk} /></label>
          {protocol === 'rdp' ? <label className='rb-vink'><input data-hulp='remote.cert' type='checkbox' checked={inst.certNegeren} onChange={(e) => zet('certNegeren', e.target.checked)} data-rb-veld='cert' />{uk ? 'Приймати самопідписаний сертифікат (типово в локальній мережі)' : 'Zelfondertekend certificaat accepteren (gebruikelijk in een LAN)'} <HulpVraag k='remote.cert' uk={uk} /></label> : null}
        </fieldset>
        {fout ? <p className='tech-melding' role='alert'>{fout}</p> : null}
        <div className='tech-knoppen'>
          <button type='button' onClick={() => sluit(false)}>{uk ? 'Скасувати' : 'Annuleren'}</button>
          <button type='submit' className='is-hoofd' disabled={bezig || !naam.trim() || !host.trim() || !poort} data-rb-knop='opslaan'><Fingerprint aria-hidden='true' />{uk ? 'Зберегти з passkey' : 'Opslaan met passkey'}</button>
        </div>
      </form>
    </Venster>
  );
}

function HostsForm({ uk, hosts, sluit }: { uk: boolean; hosts: string[]; sluit: (ok: boolean) => void }) {
  const [tekst, setTekst] = useState(hosts.join('\n'));
  const [fout, setFout] = useState('');
  const [bezig, setBezig] = useState(false);
  const opslaan = async () => {
    setBezig(true); setFout('');
    try { await postMetPasskey('/api/owner/remote/hosts/opslaan', { hosts: tekst.split(/[\s,]+/).map((h) => h.trim()).filter(Boolean) }); sluit(true); }
    catch (e) { setFout(foutTekst(e, uk)); } finally { setBezig(false); }
  };
  return (
    <Venster id='remote-hosts' titel={uk ? 'Дозволені хости' : 'Toegestane hosts'} breedte={520} onSluit={() => sluit(false)}>
      <form className='tech-venster rb-venster' data-rb-venster='hosts' onSubmit={(e) => { e.preventDefault(); if (!bezig) void opslaan(); }}>
        <p className='tech-lead'>{uk ? 'Публічні адреси, до яких дозволено підключатися (по одній у рядку, ім’я або IP, до 20). Приватні мережі й localhost дозволені завжди. Link-local (169.254.x, метадані хмари), multicast і 0.0.0.0 заборонені завжди — навіть тут.' : 'Publieke adressen die mogen (één per regel, naam of IP, max. 20). Privénetwerken en localhost mogen altijd. Link-local (169.254.x, cloud-metadata), multicast en 0.0.0.0 zijn altijd verboden — ook hier.'}</p>
        <label className='tech-veld'><span>{uk ? 'Хости' : 'Hosts'}</span><textarea value={tekst} onChange={(e) => setTekst(e.target.value)} rows={6} spellCheck={false} data-rb-veld='hosts' /></label>
        {fout ? <p className='tech-melding' role='alert'>{fout}</p> : null}
        <div className='tech-knoppen'>
          <button type='button' onClick={() => sluit(false)}>{uk ? 'Скасувати' : 'Annuleren'}</button>
          <button type='submit' className='is-hoofd' disabled={bezig} data-rb-knop='hosts-opslaan'><Fingerprint aria-hidden='true' />{uk ? 'Зберегти з passkey' : 'Opslaan met passkey'}</button>
        </div>
      </form>
    </Venster>
  );
}

function Geschiedenis({ uk, sluit }: { uk: boolean; sluit: () => void }) {
  const [rijen, setRijen] = useState<Rij[] | null>(null);
  const [fout, setFout] = useState('');
  useEffect(() => { void api.post('/api/owner/remote/sessies', techBody()).then((r) => setRijen(r.data?.sessies ?? []), (e) => setFout(foutTekst(e, uk))); }, []);
  const duur = (r: Rij) => { const s = Math.max(0, Math.round(((r.einde ?? Date.now()) - r.begin) / 1000)); return s >= 3600 ? `${Math.floor(s / 3600)} ${uk ? 'год' : 'u'} ${Math.round((s % 3600) / 60)} ${uk ? 'хв' : 'min'}` : s >= 60 ? `${Math.round(s / 60)} ${uk ? 'хв' : 'min'}` : `${s} ${uk ? 'с' : 's'}`; };
  return (
    <Venster id='remote-geschiedenis' titel={uk ? 'Журнал сеансів' : 'Sessielogboek'} breedte={720} onSluit={sluit}>
      <div className='tech-venster rb-venster' data-rb-venster='geschiedenis'>
        {fout ? <p className='tech-melding' role='alert'>{fout}</p> : !rijen ? <p className='tech-meta'>{uk ? 'Завантаження…' : 'Laden…'}</p> : !rijen.length ? <p className='tech-meta'>{uk ? 'Сеансів ще не було.' : 'Nog geen sessies.'}</p> : (
          <ul className='tech-lijst' data-rb-geschiedenis='1'>{rijen.map((r) => (
            <li key={r.id} data-rb-sessie={r.id}>
              <span className='tech-lijst-wie'><b>{r.naam} · {r.protocol.toUpperCase()} · {r.host}:{r.poort}</b><small>{new Date(r.begin).toLocaleString(uk ? 'uk-UA' : 'nl-NL')} · {duur(r)}{r.opname ? (uk ? ' · запис' : ' · opname') : ''}</small></span>
              <span className='tech-lijst-stand'>{r.open ? (uk ? '● відкритий' : '● open') : remoteEindeTekst(r.reden, uk ? 'uk' : 'nl')}</span>
            </li>
          ))}</ul>
        )}
      </div>
    </Venster>
  );
}

// ---------------------------------------------------------------- sessievenster
const KEYSYM = { ctrl: 0xffe3, alt: 0xffe9, del: 0xffff, esc: 0xff1b, tab: 0xff09, win: 0xffeb };
type Fase = 'verbinden' | 'actief' | 'einde';

export function RemoteSessie({ open, uk, sluit, tunnelUrl = '/api/owner/remote/tunnel' }: { open: Open; uk: boolean; sluit: () => void; tunnelUrl?: string }) {
  const t = useTech();
  const doos = useRef<HTMLDivElement | null>(null);
  const kader = useRef<HTMLDivElement | null>(null);
  const clientRef = useRef<import('guacamole-common-js').default.Client | null>(null);
  const sinkRef = useRef<{ focus: () => void } | null>(null);
  const laatsteInvoer = useRef(Date.now());
  const [fase, setFase] = useState<Fase>('verbinden');
  const [einde, setEinde] = useState('');
  const [eind, setEind] = useState(open.eind);
  const [inactiefMs, setInactiefMs] = useState(open.inactiefMs);
  const [klembord, setKlembord] = useState<{ open: boolean; tekst: string }>({ open: false, tekst: '' });
  const [, setTik] = useState(0);
  const mobiel = useMemo(() => typeof window !== 'undefined' && (window.matchMedia?.('(pointer: coarse)').matches || window.innerWidth <= 520), []);

  useEffect(() => {
    let weg = false;
    const klaar = remoteSessieBegin();
    let opruimen: Array<() => void> = [];
    void (async () => {
      const Guacamole = (await import('guacamole-common-js')).default;
      if (weg || !doos.current) return;
      const tunnel = new Guacamole.WebSocketTunnel(tunnelUrl);
      // Ticket als eerste bericht (niet in de URL). onuuid komt vóór OPEN: één tik wachten, dan mag sendMessage.
      tunnel.onuuid = () => { window.setTimeout(() => tunnel.sendMessage('mr-auth', open.ticket), 0); };
      const client = new Guacamole.Client(tunnel);
      clientRef.current = client;
      const intern = tunnel.oninstruction;
      tunnel.oninstruction = (opcode, args) => {
        if (opcode === 'mr-info') { setEind(Number(args[1]) || open.eind); setInactiefMs(Number(args[2]) || open.inactiefMs); return; }
        if (opcode === 'mr-einde') { setEinde(remoteEindeTekst(args[0], uk ? 'uk' : 'nl')); return; }
        intern?.(opcode, args);
      };
      const el = client.getDisplay().getElement();
      el.classList.add('rb-display');
      doos.current.appendChild(el);
      const passend = () => {
        const d = client.getDisplay(), k = kader.current;
        if (!k || !d.getWidth() || !d.getHeight()) return;
        d.scale(Math.min(k.clientWidth / d.getWidth(), k.clientHeight / d.getHeight(), 1.5));
      };
      client.getDisplay().onresize = passend;
      const ro = typeof ResizeObserver !== 'undefined' && kader.current ? new ResizeObserver(passend) : null;
      if (ro && kader.current) ro.observe(kader.current);
      opruimen.push(() => ro?.disconnect());
      client.onstatechange = (s) => { if (s === 3) { setFase('actief'); passend(); } else if (s === 5) setFase('einde'); };
      client.onerror = (st) => { setEinde((x) => x || `${uk ? 'Помилка' : 'Fout'} ${st.code}${st.message && st.message !== String(st.code) ? `: ${st.message}` : ''}`); setFase('einde'); };
      client.onclipboard = (stream, mime) => {
        if (!/^text\//.test(mime)) return;
        const r = new Guacamole.StringReader(stream); let tekst = '';
        r.ontext = (x) => { tekst += x; }; r.onend = () => setKlembord((k) => ({ ...k, tekst }));
      };
      const invoer = () => { laatsteInvoer.current = Date.now(); };
      const muis = mobiel ? new Guacamole.Mouse.Touchscreen(el) : new Guacamole.Mouse(el);
      muis.onEach(['mousedown', 'mouseup', 'mousemove'], (e) => { invoer(); client.sendMouseState(e.state, true); });
      // Toetsen alleen als het kader (of het verborgen invoerveld voor mobiel) focus heeft; Guacamole.Keyboard telt elk event één keer.
      const toetsen = new Guacamole.Keyboard(kader.current ?? doos.current);
      const sink = new Guacamole.InputSink();
      sink.getElement().classList.add('rb-sink');
      doos.current.appendChild(sink.getElement());
      toetsen.listenTo(sink.getElement());
      sinkRef.current = sink;
      toetsen.onkeydown = (ks) => { invoer(); client.sendKeyEvent(1, ks); return false; };
      toetsen.onkeyup = (ks) => { client.sendKeyEvent(0, ks); };
      opruimen.push(() => { toetsen.onkeydown = null; toetsen.onkeyup = null; toetsen.reset(); });
      client.connect('');
      kader.current?.focus();
    })().catch((e) => { setEinde(String((e as Error)?.message || e)); setFase('einde'); });
    const tik = window.setInterval(() => setTik((x) => x + 1), 15_000);
    return () => {
      weg = true; window.clearInterval(tik);
      for (const f of opruimen) { try { f(); } catch { /* al weg */ } }
      opruimen = [];
      try { clientRef.current?.disconnect(); } catch { /* al dicht */ }
      void api.post('/api/owner/remote/sluiten', { ...techBody(), sid: open.sid }).catch(() => undefined);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
      klaar();
    };
  }, []);

  // Technisch profiel in dit tabblad weg → meteen dicht (de server sluit ook, binnen 20 s of meteen via de haak).
  useEffect(() => { if (!techActief(t) && fase !== 'einde') { try { clientRef.current?.disconnect(); } catch { /* */ } setEinde(remoteEindeTekst('tech-uit', uk ? 'uk' : 'nl')); setFase('einde'); } }, [t, fase]);

  const stuurToetsen = (...ks: number[]) => { const c = clientRef.current; if (!c) return; for (const k of ks) c.sendKeyEvent(1, k); for (const k of [...ks].reverse()) c.sendKeyEvent(0, k); laatsteInvoer.current = Date.now(); };
  const volScherm = () => { const k = kader.current?.parentElement; if (!k) return; if (document.fullscreenElement) void document.exitFullscreen(); else void k.requestFullscreen?.().catch(() => undefined); };
  const klembordSturen = () => {
    const c = clientRef.current; if (!c) return;
    void import('guacamole-common-js').then(({ default: G }) => { const w = new G.StringWriter(c.createClipboardStream('text/plain')); w.sendText(klembord.tekst); w.sendEnd(); });
    laatsteInvoer.current = Date.now();
  };
  const restMin = Math.max(0, Math.ceil((eind - Date.now()) / 60_000));
  const inactiefRest = Math.max(0, inactiefMs - (Date.now() - laatsteInvoer.current));
  const P = PROTO[open.protocol];

  return createPortal(
    <div className='rb-sessie' role='dialog' aria-modal='true' aria-label={`${uk ? 'Віддалений стіл' : 'Extern bureaublad'} · ${open.naam}`} data-rb-sessie={open.sid} data-rb-fase={fase} lang={uk ? 'uk' : 'nl'}>
      <div className='rb-balk' role='toolbar' aria-label={uk ? 'Керування сеансом' : 'Sessiebediening'}>
        <span className='rb-balk-titel'><P.icoon aria-hidden='true' /><b>{open.naam}</b><span className={`rb-chip is-${open.protocol}`}>{P.naam}</span>
          <span className='rb-balk-tijd' data-rb-fase-tekst='1'>{fase === 'verbinden' ? (uk ? 'під’єднання…' : 'verbinden…') : fase === 'einde' ? (uk ? 'завершено' : 'beëindigd') : (uk ? `ще ${restMin} хв` : `nog ${restMin} min`)}</span>
          {fase === 'actief' && inactiefRest < 3 * 60_000 ? <span className='rb-balk-inactief' role='status'>{uk ? `без дій: закриється за ${Math.ceil(inactiefRest / 60_000)} хв` : `geen invoer: sluit over ${Math.ceil(inactiefRest / 60_000)} min`}</span> : null}
        </span>
        <span className='rb-balk-knoppen'>
          <button type='button' onClick={volScherm} title={uk ? 'На весь екран' : 'Volledig scherm'} aria-label={uk ? 'На весь екран' : 'Volledig scherm'} data-rb-knop='volscherm'><Expand aria-hidden='true' /><span>{uk ? 'Екран' : 'Scherm'}</span></button>
          <button type='button' onClick={() => stuurToetsen(KEYSYM.ctrl, KEYSYM.alt, KEYSYM.del)} disabled={fase !== 'actief'} title='Ctrl+Alt+Del' data-rb-knop='cad'><span>Ctrl+Alt+Del</span></button>
          <button type='button' onClick={() => setKlembord((k) => ({ ...k, open: !k.open }))} aria-expanded={klembord.open} disabled={fase !== 'actief'} title={uk ? 'Буфер обміну' : 'Klembord'} aria-label={uk ? 'Буфер обміну' : 'Klembord'} data-rb-knop='klembord'><ClipboardCopy aria-hidden='true' /><span>{uk ? 'Буфер' : 'Klembord'}</span></button>
          {mobiel ? <button type='button' onClick={() => sinkRef.current?.focus()} disabled={fase !== 'actief'} title={uk ? 'Клавіатура' : 'Toetsenbord'} aria-label={uk ? 'Клавіатура' : 'Toetsenbord'} data-rb-knop='toetsenbord'><Keyboard aria-hidden='true' /><span>{uk ? 'Клавіатура' : 'Toetsen'}</span></button> : null}
          {mobiel ? <button type='button' onClick={() => stuurToetsen(KEYSYM.esc)} disabled={fase !== 'actief'} data-rb-knop='esc'><span>Esc</span></button> : null}
          {mobiel ? <button type='button' onClick={() => stuurToetsen(KEYSYM.tab)} disabled={fase !== 'actief'} data-rb-knop='tab'><span>Tab</span></button> : null}
          <button type='button' className='is-gevaar' onClick={sluit} data-rb-knop='einde'>{fase === 'einde' ? <X aria-hidden='true' /> : <Power aria-hidden='true' />}<span>{fase === 'einde' ? (uk ? 'Закрити' : 'Sluiten') : (uk ? 'Завершити' : 'Beëindigen')}</span></button>
        </span>
      </div>
      {klembord.open ? (
        <div className='rb-klembord' data-rb-klembord='1'>
          <label><span>{uk ? 'Текст для віддаленого комп’ютера (і отриманий звідти)' : 'Tekst voor de doelcomputer (en ontvangen van daar)'}</span>
            <textarea value={klembord.tekst} onChange={(e) => setKlembord((k) => ({ ...k, tekst: e.target.value }))} rows={3} spellCheck={false} /></label>
          <span className='rb-klembord-knoppen'>
            <button type='button' onClick={klembordSturen} data-rb-knop='klembord-sturen'>{uk ? 'Надіслати в сеанс' : 'Naar de sessie sturen'}</button>
            <button type='button' onClick={() => void navigator.clipboard?.writeText(klembord.tekst).catch(() => undefined)}>{uk ? 'Копіювати сюди' : 'Hierheen kopiëren'}</button>
          </span>
        </div>
      ) : null}
      <div className='rb-kader' ref={kader} tabIndex={0} onPointerDown={() => kader.current?.focus()} data-rb-kader='1'>
        <div className='rb-doos' ref={doos} />
        {fase !== 'actief' ? (
          <div className='rb-over' data-rb-over={fase}>
            {fase === 'verbinden' ? <p>{uk ? 'Під’єднання до' : 'Verbinden met'} {open.naam}…</p> : <p>{uk ? 'Сеанс завершено' : 'Sessie beëindigd'}{einde ? `: ${einde}` : ''}.</p>}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
