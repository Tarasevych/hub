// Білий список зовнішніх MCP-хостів на mcp.*/agenten#extern (22.10.2026, зона B; RUNBOOK §15).
// Було: «Спочатку власник сервера має дозволити хости… mcp-rechten.json → externeMcpHosts» — лише SSH. Стало: власник додає й
// прибирає хости тут, підписує список passkey, root записує його у root-файл (атомарно, з резервною копією). Поточний список
// читається з файла (стан сервера), хости з EXTERNE_MCP_HOSTS (оточення) показуються окремо й тут не змінюються.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Fingerprint, Globe, Loader2, Plus, RotateCcw, X } from 'lucide-react';
import HulpVraag from '../hulp/HulpVraag';
import { kanPasskey } from '../platform/webauthn';
import { besluitCodeTekst } from '../../shared/eigenaar-besluit';
import BesluitStand, { type LeefStand } from './BesluitStand';
import { besluitFoutCode, besluitOndertekenen, besluitOverzicht, besluitStarten, besluitVolgen, type BesluitContext, type Gestart, type Overzicht } from './besluit-client';
import './besluit.css';

type Tr = (uk: string, nl: string) => string;
type Props = { tr: Tr; ctx: BesluitContext; /** Na een uitgevoerd besluit: de pagina (verbindingen + witte lijst) opnieuw laden. */ onKlaar?: () => void };

const HOST_RE = /^\*?\.?[a-z0-9.-]+$/;
/** Dezelfde regel als deploy/goedkeuring/besluit-kern.mjs hostRegelOk (de server en root controleren opnieuw). */
export const hostOk = (ruw: string) => { const r = ruw.trim().toLowerCase(); return !!r && r !== '*' && r !== '*.' && r.length <= 300 && HOST_RE.test(r) && !r.includes('..') && !/^[.-]/.test(r.replace(/^\*\./, '')); };
const gelijk = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

export default function ExterneHosts({ tr, ctx, onKlaar }: Props) {
  const lang = tr('uk', 'nl') as 'uk' | 'nl';
  // `tr` en `onKlaar` komen elke render nieuw van de ouder: via een ref, anders zou `laden` (useCallback) blijven lussen.
  const trRef = useRef(tr); trRef.current = tr;
  const klaarRef = useRef(onKlaar); klaarRef.current = onKlaar;
  const [ov, setOv] = useState<Overzicht | null>(null);
  const [laadFout, setLaadFout] = useState('');
  const [alleenEigenaar, setAlleenEigenaar] = useState(false);
  const [lijst, setLijst] = useState<string[]>([]);
  const [nieuw, setNieuw] = useState('');
  const [veldFout, setVeldFout] = useState('');
  const [bezig, setBezig] = useState<'' | 'starten' | 'passkey' | 'volgen'>('');
  const [fout, setFout] = useState('');
  const [gestart, setGestart] = useState<Gestart | null>(null);
  const [leef, setLeef] = useState<LeefStand>({ besluit: null });
  const weg = useRef<AbortController | null>(null);

  const laden = useCallback(async () => {
    setLaadFout('');
    try { const d = await besluitOverzicht(ctx); setOv(d); setLijst(d.stand.hosts); }
    catch (e) {
      const code = besluitFoutCode(e);
      // Geen eigenaar: de lijst is van de eigenaar van de server; een gewone gebruiker ziet alleen de uitleg (geen fout).
      if (code === 'OWNER_REQUIRED' || code === 'ADMIN_SERVICE_REQUIRED') { setAlleenEigenaar(true); return; }
      setLaadFout(trRef.current('Не вдалося прочитати білий список із сервера.', 'De witte lijst kon niet van de server worden gelezen.'));
    }
  }, [ctx]);
  useEffect(() => { void laden(); return () => weg.current?.abort(); }, [laden]);

  const toevoegen = () => {
    const r = nieuw.trim().toLowerCase();
    if (!hostOk(r)) { setVeldFout(tr('Недопустима форма: ім’я хоста (api.example.org) або *.суфікс; «*» заборонено.', 'Onjuiste vorm: hostnaam (api.example.org) of *.achtervoegsel; «*» is verboden.')); return; }
    if (lijst.includes(r)) { setVeldFout(tr('Цей хост уже в списку.', 'Deze host staat al in de lijst.')); return; }
    if (lijst.length >= (ov?.limieten.maxHosts || 50)) { setVeldFout(besluitCodeTekst(lang, 'TE_VEEL_HOSTS')); return; }
    setLijst([...lijst, r]); setNieuw(''); setVeldFout('');
  };

  const volg = useCallback(async (id: string) => {
    setBezig('volgen');
    const ac = new AbortController(); weg.current = ac;
    const eind = await besluitVolgen(ctx, id, (s) => { if ('pauze' in s) setLeef((l) => ({ ...l, pauze: s.fout })); else setLeef({ besluit: s.besluit, pauze: '' }); }, { signal: ac.signal, maxMs: 5 * 60_000 });
    setBezig('');
    if (eind?.besluit.staat === 'klaar') { await laden(); klaarRef.current?.(); }
  }, [ctx, laden]);

  const onderteken = useCallback(async (g: Gestart) => {
    setFout(''); setBezig('passkey');
    try {
      const b = await besluitOndertekenen(ctx, g);
      setLeef({ besluit: b });
      if (b.staat === 'ondertekend') await volg(b.id); else { setBezig(''); if (b.staat === 'klaar') { await laden(); klaarRef.current?.(); } }
    } catch (e) {
      const code = besluitFoutCode(e);
      setBezig('');
      if (code === 'PASSKEY_GEANNULEERD') setFout(trRef.current('Підпис скасовано або не вдався. Натисніть «Підтвердити passkey ще раз».', 'De handtekening is geannuleerd of mislukt. Klik op «Passkey opnieuw bevestigen».'));
      else { setGestart(null); setFout(besluitCodeTekst(lang, code) || code); }
    }
  }, [ctx, laden, lang, volg]);

  const start = useCallback(async () => {
    setFout(''); setBezig('starten'); setLeef({ besluit: null });
    let g: Gestart;
    try { g = await besluitStarten(ctx, 'externe-hosts', { hosts: lijst }); }
    catch (e) { setBezig(''); setFout(besluitCodeTekst(lang, besluitFoutCode(e))); return; }
    setGestart(g);
    await onderteken(g);
  }, [ctx, lang, lijst, onderteken]);

  if (alleenEigenaar) return <section className='ag-kaart bsl-hosts' data-besluit-hosts='alleen-eigenaar'><h3><Globe size={16} aria-hidden='true' /> {tr('Дозволені хости', 'Toegestane hosts')}</h3>
    <p className='ag-meta'>{tr('Білий список зовнішніх MCP-хостів веде власник сервера (підпис passkey). Попросіть власника додати потрібний хост.', 'De witte lijst van externe MCP-hosts beheert de eigenaar van de server (passkey-handtekening). Vraag de eigenaar de gewenste host toe te voegen.')}</p></section>;
  const s = ov?.stand;
  const gewijzigd = !!s && !gelijk(lijst, s.hosts);
  const blok = !s ? '' : ov?.inbox && !ov.inbox.schrijfbaar ? `${besluitCodeTekst(lang, ov.inbox.code || 'INBOX_SCHRIJFFOUT')} (${ov.inbox.detail})` : !s.rechtenLeesbaar ? tr('Сайт не може прочитати /etc/mijn-ruimte/mcp-rechten.json (права файла root:mijnruimte 0640).', 'De site kan /etc/mijn-ruimte/mcp-rechten.json niet lezen (bestandsrechten root:mijnruimte 0640).')
    : !s.schakelaars.externeHostsPasskey ? besluitCodeTekst(lang, 'BESLUIT_UIT')
    : !(ov?.passkeys.length) ? besluitCodeTekst(lang, 'GEEN_PASSKEY')
    : !kanPasskey() ? tr('Відкрийте цю сторінку в браузері з підтримкою passkey.', 'Open deze pagina in een browser die passkeys ondersteunt.') : '';
  const kan = !!s && !blok && gewijzigd;
  const klaar = leef.besluit && ['klaar', 'geweigerd', 'mislukt', 'verlopen'].includes(leef.besluit.staat);

  return <section className='ag-kaart bsl-hosts' data-besluit-hosts aria-labelledby='bsl-hosts-titel'>
    <h3 id='bsl-hosts-titel'><Globe size={16} aria-hidden='true' /> {tr('Дозволені хости (білий список власника)', 'Toegestane hosts (witte lijst van de eigenaar)')} <HulpVraag k='besluit.externe-hosts' lang={lang} /></h3>
    <p className='ag-meta'>{tr('Список живе в root-файлі /etc/mijn-ruimte/mcp-rechten.json. Сайт його не пише: ви підписуєте новий список passkey, root перевіряє підпис і записує сам (атомарно, з резервною копією).', 'De lijst leeft in het root-bestand /etc/mijn-ruimte/mcp-rechten.json. De site schrijft hem niet: u ondertekent de nieuwe lijst met uw passkey, root controleert de handtekening en schrijft zelf (atomisch, met reservekopie).')}</p>
    {laadFout && <p className='bsl-fout' role='alert'>{laadFout}</p>}
    {!s && !laadFout && <p className='bsl-stil'><Loader2 size={14} className='bsl-spin' aria-hidden='true' /> {tr('Завантаження…', 'Laden…')}</p>}
    {s && !leef.besluit && <>
      <ul className='bsl-chips' aria-label={tr('Хости в списку', 'Hosts in de lijst')} data-besluit-hosts-lijst={lijst.length}>
        {lijst.map((h) => <li key={h} className={`bsl-chip${s.hosts.includes(h) ? '' : ' is-nieuw'}`} data-host={h}>
          <code>{h}</code>
          <button type='button' className='bsl-chip-x' disabled={!!bezig} onClick={() => setLijst(lijst.filter((x) => x !== h))} aria-label={tr(`Прибрати ${h}`, `${h} weghalen`)}><X size={14} aria-hidden='true' /></button>
        </li>)}
        {s.hostsUitOmgeving.filter((h) => !lijst.includes(h)).map((h) => <li key={`env-${h}`} className='bsl-chip is-omgeving' data-host-omgeving={h} title={tr('З EXTERNE_MCP_HOSTS (оточення сервера) — тут не змінити.', 'Uit EXTERNE_MCP_HOSTS (serveromgeving) — hier niet te wijzigen.')}><code>{h}</code><small>{tr('оточення', 'omgeving')}</small></li>)}
        {!lijst.length && !s.hostsUitOmgeving.length && <li className='bsl-chip is-leeg'>{tr('Список порожній — жодне вихідне MCP-з’єднання неможливе.', 'De lijst is leeg — geen enkele uitgaande MCP-verbinding is mogelijk.')}</li>}
      </ul>
      <form className='bsl-rij' onSubmit={(e) => { e.preventDefault(); toevoegen(); }}>
        <label className='bsl-veld bsl-groei'><span>{tr('Додати хост', 'Host toevoegen')}</span>
          <input type='text' inputMode='url' autoComplete='off' spellCheck={false} value={nieuw} placeholder='api.githubcopilot.com' maxLength={300} disabled={!!bezig || !!blok} onChange={(e) => { setNieuw(e.target.value); setVeldFout(''); }} data-besluit-veld='host' /></label>
        <button type='submit' className='bsl-knop' disabled={!!bezig || !!blok || !nieuw.trim()} data-besluit-knop='host-toevoegen'><Plus size={16} aria-hidden='true' />{tr('Додати', 'Toevoegen')}</button>
      </form>
      {veldFout && <p className='bsl-fout' role='alert'>{veldFout}</p>}
      {blok && <p className='bsl-fout' role='alert' data-besluit-blok>{blok}</p>}
      {fout && <p className='bsl-fout' role='alert'>{fout}</p>}
      <div className='bsl-acties'>
        {gestart && fout
          ? <button type='button' className='bsl-knop bsl-knop-primair' disabled={!!bezig} onClick={() => void onderteken(gestart)} data-besluit-knop='opnieuw'><Fingerprint size={16} aria-hidden='true' />{tr('Підтвердити passkey ще раз', 'Passkey opnieuw bevestigen')}</button>
          : <button type='button' className='bsl-knop bsl-knop-primair' disabled={!kan || !!bezig} onClick={() => void start()} data-besluit-knop='ondertekenen'>
            {bezig === 'passkey' ? <><Loader2 size={16} className='bsl-spin' aria-hidden='true' />{tr('Підтвердіть на телефоні або ключі…', 'Bevestig op uw telefoon of sleutel…')}</> : bezig === 'starten' ? <><Loader2 size={16} className='bsl-spin' aria-hidden='true' />{tr('Готую рішення…', 'Besluit voorbereiden…')}</> : <><Fingerprint size={16} aria-hidden='true' />{tr('Підписати passkey й зберегти список', 'Ondertekenen met passkey en lijst opslaan')}</>}
          </button>}
        {gewijzigd && <button type='button' className='bsl-knop' disabled={!!bezig} onClick={() => { setLijst(s.hosts); setFout(''); setGestart(null); }} data-besluit-knop='herstel'><RotateCcw size={16} aria-hidden='true' />{tr('Повернути як у файлі', 'Terug naar het bestand')}</button>}
      </div>
      {!gewijzigd && !blok && <p className='bsl-stil'>{tr('Змініть список — тоді з’явиться можливість підписати.', 'Wijzig de lijst — dan kunt u ondertekenen.')}</p>}
    </>}
    {leef.besluit && <>
      <p className='bsl-lead'>{tr('Новий список: ', 'Nieuwe lijst: ')}<b>{'hosts' in leef.besluit.inhoud ? (leef.besluit.inhoud.hosts.join(', ') || tr('порожній', 'leeg')) : ''}</b></p>
      <BesluitStand tr={tr} stand={leef} />
      {klaar && <div className='bsl-acties'>
        <button type='button' className='bsl-knop bsl-knop-primair' onClick={() => { setLeef({ besluit: null }); setGestart(null); setFout(''); void laden(); }} data-besluit-knop='sluiten'>{leef.besluit.staat === 'klaar' ? tr('Готово', 'Klaar') : tr('Назад до списку', 'Terug naar de lijst')}</button>
      </div>}
    </>}
  </section>;
}
