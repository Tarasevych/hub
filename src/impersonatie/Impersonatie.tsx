// «Подивитися як користувач» (0068). Twee kanten, elk in de technische laag (src/tech/TechLaag.tsx):
//  - ImpersonatieKnop + ImpersonatieVenster: beheerder in een actief technisch profiel vraagt, ziet zijn verzoeken en opent de
//    site van de gebruiker in DIT tabblad (src/impersonatie/modus.ts).
//  - ImpersonatieGebruiker (voor ELKE gebruiker): verzoek «Дозволити / Відхилити» met wie, waarom, hoe lang en wat zichtbaar is;
//    zolang iemand meekijkt een rode pil linksonder; venster «Хто зараз має доступ до мого акаунта» met «Завершити негайно» en het
//    journaal van wat de beheerder deed. «Дозволити» vraagt een verse passkey/code (client.ts opent dat venster bij STEP_UP_STRONG_REQUIRED).
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Eye, EyeOff, ScrollText, ShieldAlert, X } from 'lucide-react';
import { Venster } from '../platform/vensters';
import { api } from '../platform/client';
import { routeLang, serviceFromLocation } from '../canoniek-navigatie';
import { ecosystemTabContext } from '../tab-context';
import { abonneerZijbalk, zijbalkServerDienst } from '../zijbalk-voorkeuren';
import Vraag from '../tech/Vraag';
import { HELP_IMP_AANVRAGEN, HELP_IMP_TOESTEMMING, IMPERSONATIE_MAX, IMPERSONATIE_MIN, IMPERSONATIE_STANDAARD, IMPERSONATIE_ZICHTBAAR, resterend } from '../../shared/impersonatie';
import { impersonatieUrl, leesStaat } from './modus';
import './impersonatie.css';
import HulpVraag from '../hulp/HulpVraag';

export type ImpSessie = { id: string; reden: string; minuten: number; metActies: boolean; status: string; aangevraagd: number | null; besloten: number | null; eind: number | null;
  beeindigd: number | null; beeindigdDoor: 'gebruiker' | 'beheerder' | null; beeindigdReden: string; acties: number; geweigerd: number; laatstActief: number | null;
  beheerder?: string; beheerderNaam?: string; doel?: string; doelNaam?: string; ditTabblad?: boolean };
type Regel = { actie: string; resultaat: string; op: number; dienst: string; door: string; actorType: string; route: string; code: string };

const body = () => ({ service: zijbalkServerDienst() || serviceFromLocation(), tabContext: ecosystemTabContext(), sourceOrigin: location.origin });
const tijd = (ms: number | null) => (ms ? new Date(ms).toLocaleTimeString(routeLang() === 'nl' ? 'nl-NL' : 'uk-UA', { hour: '2-digit', minute: '2-digit' }) : '—');
// «від вашого імені» alleen bij wat de beheerder IN uw account deed (bekijken, acties, geblokkeerd, journaalregels van de routes zelf).
const inUwNaam = (r: Regel) => r.actorType === 'impersonatie' && !/^owner\.impersonatie\.(gevraagd|beeindigd|toegestaan|geweigerd)$/.test(r.actie);
const FOUTEN: Record<string, [string, string]> = {
  TECH_IMPERSONATIE_VEREIST: ['Потрібен активний технічний профіль із правом «Подивитися як користувач».', 'Een actief technisch profiel met «Bekijken als gebruiker» is nodig.'],
  GEBRUIKER_NIET_GEVONDEN: ['Користувача з такою поштою не знайдено.', 'Geen gebruiker met dit e-mailadres.'],
  GEBRUIKER_NIET_GOEDGEKEURD: ['Цей обліковий запис ще не схвалено.', 'Dit account is nog niet goedgekeurd.'],
  EIGENAAR_ONAANTASTBAAR: ['Акаунт власника сервера переглядати не можна.', 'Het account van de eigenaar kan niet bekeken worden.'],
  NIET_AAN_JEZELF: ['Собі — не можна.', 'Niet bij uzelf.'],
  DUUR_ONGELDIG: [`Термін — від ${IMPERSONATIE_MIN} до ${IMPERSONATIE_MAX} хв.`, `Duur ${IMPERSONATIE_MIN}–${IMPERSONATIE_MAX} min.`],
  REDEN_ONGELDIG: ['Вкажіть причину (від 3 символів).', 'Geef een reden (minstens 3 tekens).'],
  EMAIL_ONGELDIG: ['Перевірте адресу пошти.', 'Controleer het e-mailadres.'],
  VERZOEK_NIET_OPEN: ['Запит уже закрито (відповідь, час або скасування).', 'Verzoek is al gesloten.'],
  ANDER_TABBLAD: ['Переглядати можна лише у вкладці, з якої надіслано запит.', 'Alleen in het tabblad van de aanvraag.'],
  IMPERSONATIE_NIET_GEVONDEN: ['Не знайдено.', 'Niet gevonden.'],
};
const foutTekst = (e: unknown, uk: boolean) => { const c = String((e as Error)?.message || 'FOUT'); const f = FOUTEN[c]; return f ? (uk ? f[0] : f[1]) : /STEP_UP|STAP_OP/.test(c) ? (uk ? 'Вхід не підтверджено passkey або кодом — нічого не дозволено.' : 'Niet bevestigd met passkey of code — niets toegestaan.') : `${uk ? 'Не вдалося' : 'Mislukt'} (${c}).`; };
const STATUS: Record<string, [string, string]> = { wacht: ['чекає відповіді', 'wacht op antwoord'], actief: ['триває', 'loopt'], geweigerd: ['відхилено', 'geweigerd'], beeindigd: ['завершено', 'beëindigd'], verlopen: ['час вийшов', 'verlopen'], ingetrokken: ['скасовано', 'ingetrokken'] };
const REDEN: Record<string, [string, string]> = { gebruiker: ['завершили ви', 'door u beëindigd'], beheerder: ['завершив адміністратор', 'door de beheerder beëindigd'], tijd: ['час вийшов', 'tijd om'], 'tech-beeindigd': ['адміністратор вийшов', 'beheerder is uitgelogd'], 'geen-antwoord': ['без відповіді', 'geen antwoord'], vervangen: ['замінено новим запитом', 'vervangen'], geweigerd: ['відхилено', 'geweigerd'] };
const ACTIE: Record<string, [string, string]> = {
  'owner.impersonatie.gevraagd': ['попросив доступ', 'vroeg toegang'], 'owner.impersonatie.toegestaan': ['ви дозволили', 'u stond toe'], 'owner.impersonatie.geweigerd': ['ви відхилили', 'u weigerde'],
  'owner.impersonatie.bekeken': ['переглянув', 'bekeek'], 'owner.impersonatie.actie': ['дія', 'actie'], 'owner.impersonatie.geweigerd-route': ['заблоковано', 'geblokkeerd'], 'owner.impersonatie.beeindigd': ['завершено', 'beëindigd'],
};
const statusChip = (s: string, uk: boolean) => <span className={`imp-chip${s === 'actief' ? ' is-actief' : s === 'wacht' ? ' is-wacht' : ''}`} data-imp-status={s}>{(STATUS[s] || [s, s])[uk ? 0 : 1]}</span>;

function Journaal({ id, uk }: { id: string; uk: boolean }) {
  const [d, setD] = useState<{ regels: Regel[]; samenvatting: { bekeken: number; acties: number; geweigerd: number } } | null>(null);
  const [fout, setFout] = useState('');
  useEffect(() => { void api.post('/api/impersonatie/journaal', { ...body(), id }).then((r) => setD(r.data), (e) => setFout(foutTekst(e, uk))); }, [id]);
  if (fout) return <p className='imp-melding' role='alert'>{fout}</p>;
  if (!d) return <p className='imp-meta'>{uk ? 'Завантаження журналу…' : 'Journaal laden…'}</p>;
  return (
    <div data-imp-journaal={id}>
      <p className='imp-meta' data-imp-samenvatting='1'>{uk ? `Переглядів: ${d.samenvatting.bekeken} · дій: ${d.samenvatting.acties} · заблоковано: ${d.samenvatting.geweigerd}` : `Bekeken: ${d.samenvatting.bekeken} · acties: ${d.samenvatting.acties} · geblokkeerd: ${d.samenvatting.geweigerd}`}</p>
      <ol className='imp-journaal'>{d.regels.map((r, i) => (
        <li key={i} className={r.actie.endsWith('geweigerd-route') ? 'is-geweigerd' : ''} data-imp-actor={r.actorType || r.door}>
          <time>{tijd(r.op)}</time>
          <span>{(ACTIE[r.actie] || [r.actie, r.actie])[uk ? 0 : 1]}{r.route ? <> · <code>{r.route}</code></> : null}{r.code ? ` · ${r.code}` : ''}{inUwNaam(r) ? (uk ? ' · від вашого імені' : ' · namens u') : ''}</span>
        </li>))}</ol>
    </div>
  );
}

// ---------------------------------------------------------------- beheerder
export function ImpersonatieKnop({ uk }: { uk: boolean }) {
  const [open, setOpen] = useState(false);
  useEffect(() => { const op = () => setOpen(true); window.addEventListener('mr-impersonatie-venster', op); return () => window.removeEventListener('mr-impersonatie-venster', op); }, []);
  return (
    <>
      <button type='button' onClick={() => setOpen(true)} data-tech-knop='impersonatie'><Eye aria-hidden='true' /><span>{uk ? 'Подивитися як користувач' : 'Bekijken als gebruiker'}</span></button>
      {open ? createPortal(<ImpersonatieVenster sluit={() => setOpen(false)} />, document.body) : null}
    </>
  );
}

export function ImpersonatieVenster({ sluit }: { sluit: () => void }) {
  const uk = routeLang() !== 'nl';
  const [email, setEmail] = useState('');
  const [reden, setReden] = useState('');
  const [minuten, setMinuten] = useState(IMPERSONATIE_STANDAARD);
  const [lijst, setLijst] = useState<ImpSessie[] | null>(null);
  const [bezig, setBezig] = useState('');
  const [melding, setMelding] = useState<{ ok: boolean; tekst: string } | null>(null);
  const [journaal, setJournaal] = useState('');
  const [, setTik] = useState(0);
  const laad = () => api.post('/api/impersonatie/mijn-aanvragen', body()).then((r) => setLijst((r.data?.aanvragen ?? []) as ImpSessie[]), (e) => setMelding({ ok: false, tekst: foutTekst(e, uk) }));
  useEffect(() => { void laad(); const i = window.setInterval(() => void laad(), 10_000); const t = window.setInterval(() => setTik((x) => x + 1), 1000); return () => { window.clearInterval(i); window.clearInterval(t); }; }, []);
  const vraag = async () => {
    setBezig('vraag'); setMelding(null);
    try { await api.post('/api/impersonatie/aanvragen', { ...body(), email, reden, minuten }); setMelding({ ok: true, tekst: uk ? 'Запит надіслано. Користувач отримав сповіщення; чекаємо відповіді (до 15 хв).' : 'Verzoek verstuurd. De gebruiker is verwittigd; wachten op antwoord (tot 15 min).' }); setReden(''); await laad(); }
    catch (e) { setMelding({ ok: false, tekst: foutTekst(e, uk) }); } finally { setBezig(''); }
  };
  const beeindig = (id: string) => void api.post('/api/impersonatie/beeindigen', { ...body(), id }).then(laad, (e) => setMelding({ ok: false, tekst: foutTekst(e, uk) }));
  const duren = [5, 10, 15, 20, 30, 45, 60].filter((m) => m >= IMPERSONATIE_MIN && m <= IMPERSONATIE_MAX);
  const lopend = leesStaat();
  return (
    <Venster id='tech-impersonatie' titel={uk ? 'Подивитися як користувач (за згодою)' : 'Bekijken als gebruiker (met toestemming)'} breedte={600} onSluit={sluit}>
      <div className='imp-venster' data-tech-venster='impersonatie'>
        <p className='imp-vraag-rij'>{uk ? 'Користувач сам дозволяє з passkey. Ви бачите його сайт у цій вкладці, типово лише перегляд, лише на дозволений час.' : 'De gebruiker staat het zelf toe met passkey. U ziet zijn site in dit tabblad, standaard alleen bekijken, alleen voor de toegestane tijd.'} <Vraag help={HELP_IMP_AANVRAGEN} uk={uk} label={uk ? 'Подивитися як користувач' : 'Bekijken als gebruiker'} /></p>
        <form className='imp-venster' style={{ padding: 0 }} onSubmit={(e) => { e.preventDefault(); if (!bezig) void vraag(); }}>
          <label className='imp-veld'><span>{uk ? 'Пошта користувача' : 'E-mail van de gebruiker'}</span><input type='email' value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete='off' data-imp-email='1' /></label>
          <label className='imp-veld'><span>{uk ? 'Причина (користувач її побачить)' : 'Reden (de gebruiker ziet die)'}</span><input value={reden} onChange={(e) => setReden(e.target.value)} minLength={3} maxLength={300} required data-imp-reden='1' /></label>
          <label className='imp-veld'><span>{uk ? 'Термін' : 'Duur'} <HulpVraag k='imp.duur' uk={uk} /></span><select data-hulp='imp.duur' value={minuten} onChange={(e) => setMinuten(Number(e.target.value))} data-imp-minuten='1'>{duren.map((m) => <option key={m} value={m}>{m} {uk ? 'хв' : 'min'}{m === IMPERSONATIE_STANDAARD ? (uk ? ' (типово)' : ' (standaard)') : ''}</option>)}</select></label>
          <div className='imp-knoppen'><button type='submit' className='is-hoofd' disabled={!!bezig || !email || reden.trim().length < 3} data-imp-knop='aanvragen'>{uk ? 'Надіслати запит' : 'Verzoek sturen'}</button></div>
        </form>
        {melding ? <p className={`imp-melding${melding.ok ? ' is-ok' : ''}`} role={melding.ok ? 'status' : 'alert'}>{melding.tekst}</p> : null}
        <h3>{uk ? 'Ваші запити' : 'Uw verzoeken'}</h3>
        {lijst === null ? <p className='imp-meta'>{uk ? 'Завантаження…' : 'Laden…'}</p> : !lijst.length ? <p className='imp-meta'>{uk ? 'Ще немає.' : 'Nog geen.'}</p> : (
          <ul className='imp-lijst' data-imp-lijst='1'>{lijst.map((v) => (
            <li key={v.id} data-imp-sessie={v.id} data-imp-status={v.status}>
              <span className='imp-lijst-kop'><b>{v.doelNaam || v.doel}</b>{statusChip(v.status, uk)}</span>
              <span className='imp-meta'>{v.doel} · {v.minuten} {uk ? 'хв' : 'min'} · {v.metActies ? (uk ? 'з правом дій' : 'met acties') : (uk ? 'лише перегляд' : 'alleen bekijken')}{v.status === 'actief' && v.eind ? ` · ${uk ? 'залишилось' : 'nog'} ${resterend(v.eind)}` : ''}</span>
              <span className='imp-reden'>{v.reden}</span>
              <span className='imp-knoppen'>
                {v.status === 'actief' && (v.eind ?? 0) > Date.now() ? (v.ditTabblad
                  ? <button type='button' className='is-hoofd' onClick={() => location.assign(impersonatieUrl(v.id, 'hub'))} disabled={lopend?.id === v.id} data-imp-knop={`openen:${v.id}`}><Eye aria-hidden='true' />{uk ? 'Відкрити сайт користувача' : 'Site van de gebruiker openen'}</button>
                  : <span className='imp-meta'>{uk ? 'лише у вкладці запиту' : 'alleen in het tabblad van de aanvraag'}</span>) : null}
                {v.status === 'actief' || v.status === 'wacht' ? <button type='button' className='is-gevaar' onClick={() => beeindig(v.id)} data-imp-knop={`beeindigen:${v.id}`}>{v.status === 'wacht' ? (uk ? 'Скасувати' : 'Annuleren') : (uk ? 'Завершити' : 'Beëindigen')}</button> : null}
                {v.status !== 'wacht' ? <button type='button' onClick={() => setJournaal(journaal === v.id ? '' : v.id)} aria-expanded={journaal === v.id} data-imp-knop={`journaal:${v.id}`}><ScrollText aria-hidden='true' />{uk ? 'Журнал' : 'Journaal'}</button> : null}
              </span>
              {journaal === v.id ? <Journaal id={v.id} uk={uk} /> : null}
            </li>))}</ul>
        )}
      </div>
    </Venster>
  );
}

// ---------------------------------------------------------------- gebruiker
export function ImpersonatieGebruiker() {
  const uk = routeLang() !== 'nl';
  const [open, setOpen] = useState<ImpSessie[]>([]);
  const [recent, setRecent] = useState<ImpSessie[]>([]);
  const [bezig, setBezig] = useState('');
  const [melding, setMelding] = useState('');
  const [metActies, setMetActies] = useState(false);
  const [toegang, setToegang] = useState(() => /(^#|&)wie-heeft-toegang(&|$)/.test(location.hash));
  const [verborgen, setVerborgen] = useState<string[]>([]);
  const [journaal, setJournaal] = useState('');
  const [, setTik] = useState(0);
  const zet = (d: { open?: ImpSessie[]; recent?: ImpSessie[] }) => { setOpen(d.open ?? []); setRecent(d.recent ?? []); };
  const laad = () => { if (!zijbalkServerDienst() || leesStaat()) return Promise.resolve(); return api.post('/api/impersonatie/voor-mij', body()).then((r) => zet(r.data || {}), () => undefined); };
  useEffect(() => {
    let laatsteDienst = '';
    const wijz = () => { const d = zijbalkServerDienst(); if (d !== laatsteDienst) { laatsteDienst = d; if (d) void laad(); else zet({}); } };
    const weg = abonneerZijbalk(wijz); wijz();
    const i = window.setInterval(() => { if (!document.hidden) void laad(); }, 30_000);
    const zicht = () => { if (!document.hidden) void laad(); };
    document.addEventListener('visibilitychange', zicht);
    const t = window.setInterval(() => setTik((x) => x + 1), 15_000);
    const opToegang = () => { setToegang(true); void laad(); };
    window.addEventListener('mr-wie-heeft-toegang', opToegang);
    const hash = () => { if (/(^#|&)wie-heeft-toegang(&|$)/.test(location.hash)) opToegang(); };
    window.addEventListener('hashchange', hash);
    return () => { weg(); window.clearInterval(i); window.clearInterval(t); document.removeEventListener('visibilitychange', zicht); window.removeEventListener('mr-wie-heeft-toegang', opToegang); window.removeEventListener('hashchange', hash); };
  }, []);
  const actief = open.filter((v) => v.status === 'actief' && (v.eind ?? 0) > Date.now());
  const wacht = open.find((v) => v.status === 'wacht' && !verborgen.includes(v.id));
  const doe = async (pad: string, id: string, extra: Record<string, unknown> = {}) => {
    setBezig(id + pad); setMelding('');
    try { await api.post(pad, { ...body(), id, ...extra }); await laad(); setMetActies(false); }
    catch (e) { setMelding(foutTekst(e, uk)); } finally { setBezig(''); }
  };
  const z = IMPERSONATIE_ZICHTBAAR[uk ? 'uk' : 'nl'];
  const wie = (v: ImpSessie) => v.beheerderNaam ? `${v.beheerderNaam} (${v.beheerder})` : (v.beheerder || '—');
  return (
    <>
      {actief.length ? (
        <div className='imp-pil' role='status' data-imp-pil='1'>
          <Eye aria-hidden='true' />
          <span className='imp-pil-tekst'>{actief.length === 1 ? (uk ? `${actief[0].beheerder} бачить ваш акаунт до ${tijd(actief[0].eind)}` : `${actief[0].beheerder} bekijkt uw account tot ${tijd(actief[0].eind)}`) : (uk ? `${actief.length} адміністратори бачать ваш акаунт` : `${actief.length} beheerders bekijken uw account`)}</span>
          <button type='button' onClick={() => setToegang(true)} data-imp-knop='wie'>{uk ? 'Хто має доступ' : 'Wie heeft toegang'}</button>
          {actief.length === 1 ? <button type='button' className='is-hoofd' onClick={() => void doe('/api/impersonatie/beeindigen', actief[0].id)} disabled={!!bezig} data-imp-knop='nu-beeindigen'><X aria-hidden='true' />{uk ? 'Завершити' : 'Beëindigen'}</button> : null}
        </div>
      ) : null}
      {wacht ? (
        <Venster id='imp-toestemming' titel={uk ? 'Запит: подивитися ваш акаунт вашими очима' : 'Verzoek: uw account met uw ogen bekijken'} breedte={520} onSluit={() => setVerborgen((l) => [...l, wacht.id])} prioriteit='kritiek'>
          <div className='imp-venster' data-imp-toestemming={wacht.id}>
            <p className='imp-vraag-rij'><span><ShieldAlert aria-hidden='true' style={{ width: 16, height: 16, verticalAlign: '-3px' }} /> <b>{wie(wacht)}</b> {uk ? `просить ${wacht.minuten} хв, щоб побачити сайт так, як бачите його ви.` : `vraagt ${wacht.minuten} min om de site te zien zoals u die ziet.`}</span> <Vraag help={HELP_IMP_TOESTEMMING} uk={uk} label={uk ? 'Що це означає' : 'Wat dit betekent'} /></p>
            <p className='imp-reden'><b>{uk ? 'Причина' : 'Reden'}:</b> {wacht.reden}</p>
            <dl className='imp-zicht'>
              <dt>{uk ? 'Буде видно' : 'Zichtbaar'}</dt><dd>{z.ziet}</dd>
              <dt>{uk ? 'Ніколи' : 'Nooit'}</dt><dd>{z.nooit}</dd>
              <dt>{uk ? 'Як довго' : 'Hoe lang'}</dt><dd>{uk ? `${wacht.minuten} хв від дозволу; завершити можна будь-коли` : `${wacht.minuten} min vanaf toestemming; op elk moment te beëindigen`}</dd>
            </dl>
            <label className='imp-vink'><input data-hulp='imp.acties' type='checkbox' checked={metActies} onChange={(e) => setMetActies(e.target.checked)} data-imp-acties='1' /><span>{uk ? 'Дозволити також дії (натискати кнопки від мого імені)' : 'Ook acties toestaan (knoppen namens mij gebruiken)'}<br /><small className='imp-meta'>{metActies ? z.acties : z.lezen}</small></span> <HulpVraag k='imp.acties' uk={uk} /></label>
            {melding ? <p className='imp-melding' role='alert'>{melding}</p> : null}
            <div className='imp-knoppen'>
              <button type='button' onClick={() => void doe('/api/impersonatie/weigeren', wacht.id)} disabled={!!bezig} data-imp-knop='weigeren'>{uk ? 'Відхилити' : 'Weigeren'}</button>
              <button type='button' className='is-hoofd' onClick={() => void doe('/api/impersonatie/toestaan', wacht.id, { metActies })} disabled={!!bezig} aria-busy={bezig === wacht.id + '/api/impersonatie/toestaan' || undefined} data-imp-knop='toestaan'>{uk ? `Дозволити на ${wacht.minuten} хв` : `Toestaan voor ${wacht.minuten} min`}</button>
            </div>
            <p className='imp-meta'>{uk ? 'Сайт попросить підтвердити passkey або кодом з додатка. Без відповіді запит зникне через 15 хв.' : 'De site vraagt bevestiging met passkey of app-code. Zonder antwoord vervalt het verzoek na 15 min.'}</p>
          </div>
        </Venster>
      ) : null}
      {toegang ? (
        <Venster id='imp-wie-heeft-toegang' titel={uk ? 'Хто зараз має доступ до мого акаунта' : 'Wie heeft nu toegang tot mijn account'} breedte={600} onSluit={() => { setToegang(false); if (/wie-heeft-toegang/.test(location.hash)) history.replaceState(history.state, '', location.pathname + location.search); }}>
          <div className='imp-venster' data-imp-toegang='1'>
            {!open.length ? <p className='imp-melding is-ok' data-imp-niemand='1'><EyeOff aria-hidden='true' style={{ width: 16, height: 16, verticalAlign: '-3px' }} /> {uk ? 'Зараз ніхто не має доступу до вашого акаунта.' : 'Niemand heeft nu toegang tot uw account.'}</p> : (
              <ul className='imp-lijst'>{open.map((v) => (
                <li key={v.id} data-imp-sessie={v.id} data-imp-status={v.status}>
                  <span className='imp-lijst-kop'><b>{wie(v)}</b>{statusChip(v.status, uk)}</span>
                  <span className='imp-meta'>{v.status === 'actief' ? `${uk ? 'до' : 'tot'} ${tijd(v.eind)} · ${uk ? 'залишилось' : 'nog'} ${v.eind ? resterend(v.eind) : ''} · ` : ''}{v.metActies ? (uk ? 'з правом дій' : 'met acties') : (uk ? 'лише перегляд' : 'alleen bekijken')}{v.status === 'actief' ? ` · ${uk ? 'дій' : 'acties'}: ${v.acties} · ${uk ? 'заблоковано' : 'geblokkeerd'}: ${v.geweigerd}` : ''}</span>
                  <span className='imp-reden'>{v.reden}</span>
                  <span className='imp-knoppen'>
                    {v.status === 'actief' ? <button type='button' onClick={() => setJournaal(journaal === v.id ? '' : v.id)} aria-expanded={journaal === v.id}><ScrollText aria-hidden='true' />{uk ? 'Що зараз робиться' : 'Wat er gebeurt'}</button> : null}
                    <button type='button' className='is-hoofd' onClick={() => void doe('/api/impersonatie/beeindigen', v.id)} disabled={!!bezig} data-imp-knop={`negayno:${v.id}`}><X aria-hidden='true' />{v.status === 'wacht' ? (uk ? 'Відхилити' : 'Weigeren') : (uk ? 'Завершити негайно' : 'Nu beëindigen')}</button>
                  </span>
                  {journaal === v.id ? <Journaal id={v.id} uk={uk} /> : null}
                </li>))}</ul>
            )}
            {melding ? <p className='imp-melding' role='alert'>{melding}</p> : null}
            <h3>{uk ? 'Останні 24 години' : 'Laatste 24 uur'}</h3>
            {!recent.length ? <p className='imp-meta'>{uk ? 'Нічого.' : 'Niets.'}</p> : (
              <ul className='imp-lijst' data-imp-recent='1'>{recent.map((v) => (
                <li key={v.id} data-imp-sessie={v.id} data-imp-status={v.status}>
                  <span className='imp-lijst-kop'><b>{wie(v)}</b>{statusChip(v.status, uk)}</span>
                  <span className='imp-meta'>{tijd(v.besloten || v.aangevraagd)}–{tijd(v.beeindigd)} · {(REDEN[v.beeindigdReden] || [v.beeindigdReden, v.beeindigdReden])[uk ? 0 : 1]} · {uk ? `дій: ${v.acties}, заблоковано: ${v.geweigerd}` : `acties: ${v.acties}, geblokkeerd: ${v.geweigerd}`}</span>
                  <span className='imp-knoppen'>{v.besloten ? <button type='button' onClick={() => setJournaal(journaal === v.id ? '' : v.id)} aria-expanded={journaal === v.id} data-imp-knop={`journaal:${v.id}`}><ScrollText aria-hidden='true' />{uk ? 'Журнал дій' : 'Journaal'}</button> : null}</span>
                  {journaal === v.id ? <Journaal id={v.id} uk={uk} /> : null}
                </li>))}</ul>
            )}
            <p className='imp-meta'>{uk ? 'Кожен перегляд і кожна дія записуються у ваш журнал із позначкою «від вашого імені».' : 'Elke weergave en actie staat in uw journaal met de markering «namens u».'}</p>
          </div>
        </Venster>
      ) : null}
    </>
  );
}
