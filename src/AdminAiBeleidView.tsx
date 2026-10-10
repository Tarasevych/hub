// Beheer → «Доступ ШІ» / «AI-toegang» (§13.12): wat elke AI mag, met timers die de SERVER afdwingt, gewijzigd alleen met de
// passkey van de eigenaar. Wijzigingen gaan eerst in een wachtrij; «Перевірити й підписати» toont precies wat er verandert,
// de browser rekent zelf na dat de challenge bij dat ontwerp hoort (wat u ziet = wat u tekent), en root schrijft de nieuwe versie.
// Op mcp.tarasevych.com/agents verschijnt dezelfde weergave alleen-lezen (alleenLezen) met een link hierheen.
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Bot, Check, Clock, ExternalLink, Fingerprint, Lock, Plus, RefreshCw, ShieldAlert, ShieldCheck, Timer, TriangleAlert, Undo2, X } from 'lucide-react';
import { api } from './platform/client';
import { foutCode, kanPasskey, passkeyBevestigen, type AssertieOpties } from './platform/webauthn';
import { canonicalize } from '../shared/ai-beleid/canonical';
import { diffPolicy, listGrants, type GrantRow, type Op, type Policy } from '../shared/ai-beleid/model';
import { PRESETS, countdown, formatClock, formatDuration, resolveGrant, zonedToUtc, type After, type GrantSpec, type Mode } from '../shared/ai-beleid/time';
import { Venster } from './platform/vensters';
import './admin-ai-beleid.css';

type Lang = 'uk' | 'nl';
type Props = { lang: Lang; sourceOrigin: string; tabContext: string; alleenLezen?: boolean; dienst?: 'admin' | 'mcp' };
type Verbinding = { naam: string; soort: 'oauth' | 'token' | 'chat'; actief: boolean; agentId: string | null; laatst: number | null };
type Versie = { seq: number; hash: string; op: string; ondertekend: { soort?: string; label?: string; keyId?: string; vingerafdruk?: string } };
type Overzicht = {
  staat: 'niet-ingesteld' | 'ongeldig' | 'geldig'; code?: string; serverNow: number; tz: string;
  beleid?: Policy; hash?: string; versies?: Versie[]; verbindingen: Verbinding[]; sleutels: Array<{ label: string; vingerafdruk: string }>;
};
type Staged = { id: string; op: Op; uk: string; nl: string };
type Voorstel = { uitdagingId: string; verloopt: number; nonce: string; beleidHash: string; ontwerp: Policy; publicKey: AssertieOpties };

const tr = (lang: Lang, uk: string, nl: string) => (lang === 'uk' ? uk : nl);
const GROEP_NL: Record<string, string> = { 'Браузер': 'Browser', 'Пристрої': 'Apparaten', 'Пошта й Google': 'Mail en Google', GitHub: 'GitHub', 'Сервер': 'Server', 'Розгортання': 'Uitrollen', 'Власник': 'Eigenaar' };
const PRESET_NL: Record<string, string> = { '30m': '30 min', '1h': '1 uur', '2h': '2 uur', half_day: 'Halve dag', '1d': 'Dag', '1w': 'Week', '1m': 'Maand', '6m': 'Half jaar', '1y': 'Jaar', '2y': '2 jaar' };
const FOUTEN: Record<string, [string, string]> = {
  BELEID_NIET_GESTART: ['Політику ще не встановлено на сервері (перша версія — через SSH).', 'Het beleid is nog niet op de server geïnstalleerd (eerste versie via SSH).'],
  BELEID_KETEN_ONGELDIG: ['Ланцюжок версій пошкоджено — увесь доступ ШІ закрито.', 'De keten van versies is beschadigd — alle AI-toegang is dicht.'],
  GEEN_PASSKEY: ['На сервері немає passkey, яким можна підписувати (Адміністрування → Оновлення).', 'Er is op de server geen passkey om mee te tekenen (Beheer → Updates).'],
  ONTWERP_GEWIJZIGD: ['Чернетка змінилася після підпису — нічого не застосовано.', 'Het ontwerp is na het tekenen gewijzigd — niets toegepast.'],
  VERSIE_VERSCHILT_BELEID: ['Політику вже змінено іншим підписом. Сторінку оновлено — підготуйте зміни ще раз.', 'Het beleid is intussen gewijzigd. Pagina vernieuwd — bereid de wijzigingen opnieuw voor.'],
  ONTWERP_VERLOPEN: ['Чернетка застаріла (понад 15 хв). Підготуйте ще раз.', 'Het ontwerp is verouderd (meer dan 15 min). Bereid het opnieuw voor.'],
  UITDAGING_ONGELDIG: ['Запит застарів або вже використаний. Спробуйте ще раз.', 'Het verzoek is verlopen of al gebruikt. Probeer het opnieuw.'],
  UITDAGING_ANDERS: ['Сервер надіслав інший запит на підпис, ніж ви бачите. Підпис скасовано з міркувань безпеки.', 'De server stuurde een ander tekenverzoek dan u ziet. Tekenen geannuleerd voor de veiligheid.'],
  NotAllowedError: ['Підтвердження passkey скасовано або час вийшов.', 'Passkey-bevestiging geannuleerd of de tijd is verstreken.'],
  PASSKEY_SLEUTEL_ONBEKEND: ['Цей passkey не підтверджено на сервері.', 'Deze passkey is niet bevestigd op de server.'],
  PASSKEY_GEEN_VERIFICATIE: ['Потрібне розблокування (відбиток, обличчя або PIN).', 'Ontgrendeling is vereist (vingerafdruk, gezicht of pincode).'],
  OWNER_REQUIRED: ['Лише власник.', 'Alleen de eigenaar.'],
  ADMIN_SERVICE_REQUIRED: ['Змінювати можна лише на admin.tarasevych.com.', 'Wijzigen kan alleen op admin.tarasevych.com.'],
};
const foutTekst = (lang: Lang, code: string) => { const t = FOUTEN[code] ?? (code.startsWith('ONTWERP_') ? ['Зміна недійсна: ' + code, 'Wijziging ongeldig: ' + code] as [string, string] : null); return t ? tr(lang, t[0], t[1]) : tr(lang, 'Помилка: ', 'Fout: ') + (code || tr(lang, 'немає зв’язку', 'geen verbinding')); };

// ------------------------------------------------------------------ hulp: hash en challenge in de browser (WYSIWYS)
const b64u = (buf: ArrayBuffer) => { let s = ''; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, '0')).join('');
const sha = (t: string) => crypto.subtle.digest('SHA-256', new TextEncoder().encode(t));
/** Zelfde formule als deploy/goedkeuring/webauthn-kern.mjs uitdagingVoor('ai-beleid', …). */
export async function verwachteUitdaging(ontwerp: Policy, nonce: string, verloopt: number): Promise<{ hash: string; challenge: string }> {
  const hash = hex(await sha(canonicalize(ontwerp)));
  const challenge = b64u(await sha(['mijn-ruimte-goedkeuring/v1', 'ai-beleid', hash, nonce, String(verloopt)].join('\n')));
  return { hash, challenge };
}

// ------------------------------------------------------------------ server-tijd die meeloopt
function useServerTijd(serverNow: number | undefined) {
  const verschil = useRef(0);
  const [nu, setNu] = useState(() => Date.now());
  useEffect(() => { if (serverNow) verschil.current = serverNow - Date.now(); }, [serverNow]);
  useEffect(() => { const t = window.setInterval(() => setNu(Date.now()), 1000); return () => window.clearInterval(t); }, []);
  return nu + verschil.current;
}

const modusTekst = (lang: Lang, m: Mode) => m.kind === 'off' ? tr(lang, 'Вимкнено', 'Uit') : m.kind === 'ask' ? tr(lang, 'Питати щоразу', 'Elke keer vragen') : m.kind === 'always' ? tr(lang, 'Завжди', 'Altijd') : tr(lang, 'За таймером', 'Met timer');
const specTekst = (lang: Lang, s: GrantSpec, tz: string, nu: number) => {
  if (s.type === 'off' || s.type === 'ask' || s.type === 'always') return modusTekst(lang, { kind: s.type });
  const na = s.after === 'ask' ? tr(lang, ', потім питати', ', daarna vragen') : tr(lang, ', потім вимкнути', ', daarna uit');
  if (s.type === 'preset') return `${tr(lang, PRESETS.find((p) => p.id === s.preset)?.short ?? s.preset, PRESET_NL[s.preset] ?? s.preset)}${na}`;
  try { const m = resolveGrant(s, nu, tz); return m.kind === 'timed' ? `${tr(lang, 'до', 'tot')} ${new Date(m.expiresAt).toLocaleString(lang === 'uk' ? 'uk-UA' : 'nl-BE', { timeZone: tz, dateStyle: 'short', timeStyle: 'short' })}${na}` : modusTekst(lang, m); }
  catch { return '—'; }
};

// ------------------------------------------------------------------ timer: встановлено / минуло / залишилось
function TimerRij({ lang, rij, nu, tz }: { lang: Lang; rij: GrantRow; nu: number; tz: string }) {
  const m = rij.mode;
  if (m.kind !== 'timed') return null;
  const c = countdown(m, nu)!;
  const scoreSoon = !c.expired && (c.remaining <= 5 * 60_000 || c.fraction >= 0.9);
  const fmt = (ms: number) => new Date(ms).toLocaleString(lang === 'uk' ? 'uk-UA' : 'nl-BE', { timeZone: tz, dateStyle: 'short', timeStyle: 'short' });
  return (
    <div className={`aib-timer${c.expired ? ' is-op' : scoreSoon ? ' is-bijna' : ''}`} role='group' aria-label={tr(lang, 'Таймер дозволу', 'Timer van de toestemming')}>
      <div className='aib-balk' aria-hidden='true'><span style={{ width: `${Math.round(c.fraction * 100)}%` }} /></div>
      <dl>
        <div><dt>{tr(lang, 'Встановлено', 'Ingesteld')}</dt><dd>{formatDuration(c.total)} · {fmt(m.startedAt)}</dd></div>
        <div><dt>{tr(lang, 'Минуло', 'Verstreken')}</dt><dd>{formatClock(c.elapsed)}</dd></div>
        <div><dt>{c.expired ? tr(lang, 'Строк вичерпано', 'Verlopen') : scoreSoon ? tr(lang, 'Скоро закінчиться · залишилось', 'Bijna voorbij · resterend') : tr(lang, 'Залишилось', 'Resterend')}</dt>
          <dd aria-live={scoreSoon ? 'polite' : 'off'}>{c.expired ? `${fmt(m.expiresAt)} → ${m.after === 'ask' ? tr(lang, 'тепер питати щоразу', 'nu elke keer vragen') : tr(lang, 'тепер вимкнено', 'nu uit')}` : `${formatClock(c.remaining)} (${tr(lang, 'до', 'tot')} ${fmt(m.expiresAt)})`}</dd></div>
      </dl>
    </div>
  );
}

// ------------------------------------------------------------------ keuze: шаблони, власна тривалість, до години, до дати
function Keuze({ lang, tz, nu, onKies, onSluit }: { lang: Lang; tz: string; nu: number; onKies: (s: GrantSpec) => void; onSluit: () => void }) {
  const [na, setNa] = useState<After>('off');
  const [aantal, setAantal] = useState('2');
  const [eenheid, setEenheid] = useState<'min' | 'h' | 'd'>('h');
  const [uur, setUur] = useState('18:00');
  const [moment, setMoment] = useState('');
  const [fout, setFout] = useState('');
  const doos = useRef<HTMLDivElement>(null);
  useEffect(() => { doos.current?.querySelector<HTMLElement>('button')?.focus(); }, []);
  const toets = (e: ReactKeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onSluit(); } };
  const probeer = (s: GrantSpec) => { try { resolveGrant(s, nu, tz); setFout(''); onKies(s); } catch (err) { setFout(String((err as Error).message || err)); } };
  const duur = () => { const n = Number(aantal); const ms = n * (eenheid === 'min' ? 60_000 : eenheid === 'h' ? 3_600_000 : 86_400_000); probeer({ type: 'duration', ms, after: na }); };
  const totUur = () => { const m = /^(\d{1,2}):(\d{2})$/.exec(uur); if (!m) { setFout(tr(lang, 'Вкажіть час як 18:30.', 'Geef de tijd op als 18:30.')); return; } probeer({ type: 'until_clock', hour: Number(m[1]), minute: Number(m[2]), after: na }); };
  const totMoment = () => {
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(moment);
    if (!m) { setFout(tr(lang, 'Оберіть дату й час.', 'Kies datum en tijd.')); return; }
    // Wandkloktijd in de tijdzone van de eigenaar (niet die van dit apparaat) → absoluut moment; zomertijd zoals op de server.
    const at = zonedToUtc(+m[1], +m[2], +m[3], +m[4], +m[5], 0, tz);
    if (at <= nu) { setFout(tr(lang, 'Цей момент уже минув.', 'Dit moment is al voorbij.')); return; }
    probeer({ type: 'until', at, after: na });
  };
  return (
    <div className='aib-keuze' role='dialog' aria-modal='false' aria-label={tr(lang, 'Обрати строк', 'Looptijd kiezen')} ref={doos} onKeyDown={toets}>
      <div className='aib-keuze-rij'>
        {(['off', 'ask', 'always'] as const).map((k) => <button key={k} type='button' className='aib-chip' onClick={() => onKies({ type: k })}>{modusTekst(lang, { kind: k })}</button>)}
      </div>
      <fieldset><legend>{tr(lang, 'Швидкі строки', 'Snelle looptijden')}</legend>
        <div className='aib-keuze-rij'>{PRESETS.map((p) => <button key={p.id} type='button' className='aib-chip' onClick={() => probeer({ type: 'preset', preset: p.id, after: na })}>{tr(lang, p.short, PRESET_NL[p.id] ?? p.short)}</button>)}</div>
      </fieldset>
      <fieldset><legend>{tr(lang, 'Власна тривалість', 'Eigen duur')}</legend>
        <div className='aib-keuze-rij'>
          <input type='number' min={1} max={9999} value={aantal} onChange={(e) => setAantal(e.target.value)} aria-label={tr(lang, 'Кількість', 'Aantal')} />
          <select value={eenheid} onChange={(e) => setEenheid(e.target.value as 'min' | 'h' | 'd')} aria-label={tr(lang, 'Одиниця', 'Eenheid')}>
            <option value='min'>{tr(lang, 'хвилин', 'minuten')}</option><option value='h'>{tr(lang, 'годин', 'uur')}</option><option value='d'>{tr(lang, 'днів', 'dagen')}</option>
          </select>
          <button type='button' onClick={duur}>{tr(lang, 'Застосувати', 'Toepassen')}</button>
        </div>
      </fieldset>
      <fieldset><legend>{tr(lang, 'До години', 'Tot een tijdstip')}</legend>
        <div className='aib-keuze-rij'><input type='time' value={uur} onChange={(e) => setUur(e.target.value)} aria-label={tr(lang, 'Година', 'Tijd')} /><button type='button' onClick={totUur}>{tr(lang, 'Застосувати', 'Toepassen')}</button></div>
      </fieldset>
      <fieldset><legend>{tr(lang, 'До дати й часу', 'Tot datum en tijd')}</legend>
        <div className='aib-keuze-rij'><input type='datetime-local' value={moment} onChange={(e) => setMoment(e.target.value)} aria-label={tr(lang, 'Дата й час', 'Datum en tijd')} /><button type='button' onClick={totMoment}>{tr(lang, 'Застосувати', 'Toepassen')}</button></div>
      </fieldset>
      <fieldset><legend>{tr(lang, 'Після закінчення строку', 'Na afloop van de looptijd')}</legend>
        <div className='aib-keuze-rij'>
          <label><input type='radio' name='aib-na' checked={na === 'off'} onChange={() => setNa('off')} />{tr(lang, 'Вимкнути', 'Uitzetten')}</label>
          <label><input type='radio' name='aib-na' checked={na === 'ask'} onChange={() => setNa('ask')} />{tr(lang, 'Питати щоразу', 'Elke keer vragen')}</label>
        </div>
      </fieldset>
      {fout ? <p className='aib-fout' role='alert'>{fout}</p> : null}
      <div className='aib-keuze-rij aib-rechts'><button type='button' onClick={onSluit}><X aria-hidden='true' />{tr(lang, 'Закрити', 'Sluiten')}</button></div>
    </div>
  );
}

// ------------------------------------------------------------------ hoofdweergave
export default function AdminAiBeleidView({ lang, sourceOrigin, tabContext, alleenLezen = false, dienst = 'admin' }: Props) {
  const context = useMemo(() => ({ service: dienst, tabContext, sourceOrigin }), [dienst, tabContext, sourceOrigin]);
  const [data, setData] = useState<Overzicht | null>(null);
  const [agent, setAgent] = useState('');
  const [open, setOpen] = useState('');
  const [wachtrij, setWachtrij] = useState<Staged[]>([]);
  const [venster, setVenster] = useState<Voorstel | null>(null);
  const [bezig, setBezig] = useState('');
  const [melding, setMelding] = useState<{ ok: boolean; tekst: string } | null>(null);
  const nu = useServerTijd(data?.serverNow);
  const tz = data?.tz || 'Europe/Brussels';

  const laden = useCallback(async () => {
    try { const r = await api.post('/api/owner/ai-beleid/overzicht', context); setData(r.data as Overzicht); }
    catch (c) { setMelding({ ok: false, tekst: foutTekst(lang, foutCode(c)) }); }
  }, [context, lang]);
  useEffect(() => { void laden(); const t = window.setInterval(() => { void laden(); }, 30000); return () => window.clearInterval(t); }, [laden]);
  const agenten = useMemo(() => Object.entries(data?.beleid?.agents ?? {}).sort((a, b) => a[1].name.localeCompare(b[1].name)), [data?.beleid]);
  useEffect(() => { if (!agent && agenten.length) setAgent(agenten[0][0]); }, [agenten, agent]);
  const rijen = useMemo(() => (data?.beleid ? listGrants(data.beleid, nu, tz) : []), [data?.beleid, nu, tz]);

  const zetInRij = (op: Op, uk: string, nl: string) => { setWachtrij((w) => [...w, { id: `${Date.now()}-${w.length}`, op, uk, nl }]); setOpen(''); };
  const kiesVoor = (cap: string, label: string, spec: GrantSpec) => {
    const tekst = specTekst(lang, spec, tz, nu);
    zetInRij({ op: 'grant', agent, capabilities: [cap], spec }, `«${data?.beleid?.agents[agent]?.name}» · ${label}: ${tekst}`, `«${data?.beleid?.agents[agent]?.name}» · ${label}: ${tekst}`);
  };

  const ondertekenen = async () => {
    if (!wachtrij.length) return;
    setBezig('voorstel'); setMelding(null);
    try {
      const r = await api.post('/api/owner/ai-beleid/voorstel', { ...context, ops: wachtrij.map((w) => w.op) });
      const v = r.data as Voorstel;
      const eigen = await verwachteUitdaging(v.ontwerp, v.nonce, v.verloopt);
      if (eigen.challenge !== v.publicKey.challenge || eigen.hash !== v.beleidHash) throw Object.assign(new Error('UITDAGING_ANDERS'), { message: 'UITDAGING_ANDERS' });
      setVenster(v);
    } catch (c) { setMelding({ ok: false, tekst: foutTekst(lang, foutCode(c)) }); }
    finally { setBezig(''); }
  };
  const bevestigen = async () => {
    if (!venster) return;
    setBezig('teken'); setMelding(null);
    try {
      const assertie = await passkeyBevestigen(venster.publicKey);
      const r = await api.post('/api/owner/ai-beleid/ondertekenen', { ...context, uitdagingId: venster.uitdagingId, ontwerp: venster.ontwerp, assertie });
      const u = r.data as { resultaat: string; code: string | null; uk: string | null; nl: string | null; seq: number };
      if (u.resultaat === 'klaar') { setMelding({ ok: true, tekst: tr(lang, `Підписано. Сервер застосував версію ${u.seq}; таймери вже йдуть.`, `Getekend. De server paste versie ${u.seq} toe; de timers lopen al.`) }); setWachtrij([]); }
      else if (u.resultaat === 'geweigerd') setMelding({ ok: false, tekst: tr(lang, u.uk || 'Сервер відхилив зміну.', u.nl || 'De server weigerde de wijziging.') });
      else setMelding({ ok: true, tekst: tr(lang, 'Підпис передано серверу; зміна з’явиться тут за кілька секунд.', 'Handtekening aan de server gegeven; de wijziging verschijnt hier binnen enkele seconden.') });
      setVenster(null);
      await laden();
    } catch (c) {
      const code = foutCode(c);
      setMelding({ ok: false, tekst: foutTekst(lang, code) });
      if (code === 'VERSIE_VERSCHILT_BELEID') { setVenster(null); setWachtrij([]); await laden(); }
    } finally { setBezig(''); }
  };

  if (!data) return <section className='admin-section aib'><p>{tr(lang, 'Завантаження…', 'Laden…')}</p>{melding ? <p className='aib-melding' data-ok='false' role='alert'>{melding.tekst}</p> : null}</section>;

  const kop = (
    <header className='aib-kop'>
      <div>
        <h2><ShieldCheck aria-hidden='true' />{tr(lang, 'Доступ ШІ за вашим підписом', 'AI-toegang met uw handtekening')}</h2>
        <p>{tr(lang, 'Що може кожен ШІ і як довго. Таймер рахує сервер і сам знімає доступ у момент закінчення. Змінити можна лише з вашим passkey.', 'Wat elke AI mag en hoe lang. De server telt de timer en trekt de toegang zelf in op het eindmoment. Wijzigen kan alleen met uw passkey.')}</p>
      </div>
      <button type='button' className='aib-icoonknop' onClick={() => void laden()} aria-label={tr(lang, 'Оновити', 'Vernieuwen')}><RefreshCw aria-hidden='true' /></button>
    </header>
  );

  if (data.staat === 'niet-ingesteld') return (
    <section className='admin-section aib' data-aib-staat='niet-ingesteld'>{kop}
      <div className='aib-stand' data-ok='onbekend'><Clock aria-hidden='true' /><div>
        <strong>{tr(lang, 'Політику ще не встановлено на сервері', 'Het beleid is nog niet op de server geïnstalleerd')}</strong>
        <p>{tr(lang, 'Поки її немає, діють лише звичайні налаштування інструментів. Перша версія (ваш genesis.signed.json, підписаний офлайн-ключем) встановлюється на сервері однією командою від root:', 'Zolang het er niet is, gelden alleen de gewone instellingen van de hulpmiddelen. De eerste versie (uw genesis.signed.json, getekend met de offline sleutel) installeert root met één opdracht:')}</p>
        <code className='aib-ssh'>sudo mijn-ruimte-passkey beleid-start /шлях/genesis.signed.json &lt;{tr(lang, 'відбиток офлайн-ключа', 'vingerafdruk van de offline sleutel')}&gt;</code>
      </div></div>
    </section>
  );
  if (data.staat === 'ongeldig') return (
    <section className='admin-section aib' data-aib-staat='ongeldig'>{kop}
      <div className='aib-stand' data-ok='false' role='alert'><ShieldAlert aria-hidden='true' /><div>
        <strong>{tr(lang, 'Ланцюжок політики не пройшов перевірку — увесь доступ ШІ закрито', 'De beleidsketen is niet geldig — alle AI-toegang is dicht')}</strong>
        <p>{tr(lang, 'Хтось змінив або видалив версію без вашого підпису. ШІ нічого не може, доки root не відновить ланцюжок із резервної копії.', 'Iemand heeft een versie gewijzigd of verwijderd zonder uw handtekening. AI kan niets tot root de keten uit een back-up herstelt.')} <code>{data.code}</code></p>
      </div></div>
    </section>
  );

  const beleid = data.beleid!;
  const laatste = data.versies?.[0];
  const mijnRijen = rijen.filter((r) => r.agentId === agent);
  const groepen = [...new Set(mijnRijen.map((r) => r.group))];
  const geselecteerd = beleid.agents[agent];
  const zonderAgent = data.verbindingen.filter((v) => !v.agentId);

  return (
    <section className='admin-section aib' data-aib-staat='geldig'>{kop}
      <div className='aib-stand' data-ok='true'><Lock aria-hidden='true' /><div>
        <strong>{tr(lang, `Версія ${beleid.seq}`, `Versie ${beleid.seq}`)} · <code>{data.hash?.slice(0, 12)}</code></strong>
        <p>{laatste ? tr(lang, `Підписано: ${laatste.ondertekend.soort === 'passkey' ? `passkey «${laatste.ondertekend.label ?? ''}»` : `офлайн-ключ ${laatste.ondertekend.keyId ?? ''}`} · ${laatste.op ? new Date(laatste.op).toLocaleString('uk-UA') : ''}`, `Getekend: ${laatste.ondertekend.soort === 'passkey' ? `passkey «${laatste.ondertekend.label ?? ''}»` : `offline sleutel ${laatste.ondertekend.keyId ?? ''}`} · ${laatste.op ? new Date(laatste.op).toLocaleString('nl-BE') : ''}`) : null}</p>
      </div></div>
      {melding ? <p className='aib-melding' data-ok={String(melding.ok)} role={melding.ok ? 'status' : 'alert'}>{melding.tekst}</p> : null}

      {zonderAgent.length ? (
        <div className='aib-waarschuwing'><TriangleAlert aria-hidden='true' /><div>
          <strong>{tr(lang, 'Підключення ШІ без запису в політиці — їм усе заборонено:', 'AI-verbindingen zonder plaats in het beleid — alles is hen verboden:')}</strong>
          <ul>{zonderAgent.map((v) => <li key={`${v.soort}:${v.naam}`}>{v.naam} <small>({v.soort === 'oauth' ? 'OAuth' : v.soort === 'token' ? tr(lang, 'токен', 'token') : tr(lang, 'чат сайту', 'chat van de site')})</small>
            {!alleenLezen ? <button type='button' className='aib-klein' onClick={() => { const id = v.naam.toLowerCase().normalize('NFKC').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || `ai-${Date.now()}`; zetInRij({ op: 'agent_add', agent: id, name: v.naam.slice(0, 80), spec: { type: 'ask' } }, `Додати «${v.naam}» (питати щоразу)`, `«${v.naam}» toevoegen (elke keer vragen)`); }}><Plus aria-hidden='true' />{tr(lang, 'Додати (питати щоразу)', 'Toevoegen (elke keer vragen)')}</button> : null}</li>)}</ul>
        </div></div>
      ) : null}

      <div className='aib-agenten' role='tablist' aria-label={tr(lang, 'Агенти в політиці', 'Agents in het beleid')}>
        {agenten.map(([id, a]) => {
          const actief = rijen.filter((r) => r.agentId === id && r.timer && !r.timer.expired).length;
          return <button key={id} id={`aib-tab-${id}`} type='button' role='tab' aria-selected={agent === id} aria-controls='aib-agentpaneel' className={`aib-agent${agent === id ? ' is-gekozen' : ''}${a.enabled ? '' : ' is-uit'}`} onClick={() => { setAgent(id); setOpen(''); }}>
            <Bot aria-hidden='true' />{a.name}{actief ? <span className='aib-teller' title={tr(lang, 'Активних таймерів', 'Actieve timers')}><Timer aria-hidden='true' />{actief}</span> : null}{!a.enabled ? <span className='aib-uit'>{tr(lang, 'вимкнено', 'uit')}</span> : null}
          </button>;
        })}
      </div>

      {geselecteerd ? (
        <div className='aib-agentpaneel' id='aib-agentpaneel' role='tabpanel' aria-labelledby={`aib-tab-${agent}`}>
          <div className='aib-agentkop'>
            <div><strong>{geselecteerd.name}</strong> · {tr(lang, 'за замовчуванням', 'standaard')}: {modusTekst(lang, geselecteerd.defaultMode)}</div>
            {!alleenLezen ? <div className='aib-knoppen'>
              <button type='button' onClick={() => zetInRij({ op: 'agent_enable', agent, enabled: !geselecteerd.enabled }, `${geselecteerd.enabled ? 'Вимкнути' : 'Увімкнути'} «${geselecteerd.name}» повністю`, `«${geselecteerd.name}» volledig ${geselecteerd.enabled ? 'uitzetten' : 'aanzetten'}`)}>{geselecteerd.enabled ? tr(lang, 'Вимкнути агента повністю', 'Agent volledig uitzetten') : tr(lang, 'Увімкнути агента', 'Agent aanzetten')}</button>
              <button type='button' onClick={() => setOpen(open === '__standaard' ? '' : '__standaard')} aria-expanded={open === '__standaard'} aria-haspopup='dialog'>{tr(lang, 'Змінити «за замовчуванням»', 'Standaard wijzigen')}</button>
            </div> : null}
          </div>
          {open === '__standaard' ? <Keuze lang={lang} tz={tz} nu={nu} onSluit={() => setOpen('')} onKies={(spec) => zetInRij({ op: 'default', agent, spec }, `«${geselecteerd.name}» · за замовчуванням: ${specTekst('uk', spec, tz, nu)}`, `«${geselecteerd.name}» · standaard: ${specTekst('nl', spec, tz, nu)}`)} /> : null}
          {groepen.map((g) => (
            <div key={g} className='aib-groep'>
              <h3>{tr(lang, g, GROEP_NL[g] ?? g)}</h3>
              <ul className='aib-rijen'>
                {mijnRijen.filter((r) => r.group === g).map((r) => {
                  const inRij = wachtrij.filter((w) => w.op.op === 'grant' && w.op.agent === agent && Array.isArray(w.op.capabilities) && w.op.capabilities.includes(r.capability));
                  return (
                    <li key={r.capability} className='aib-rij' data-cap={r.capability} data-effect={r.effect}>
                      <div className='aib-rij-kop'>
                        <div><strong>{r.label}</strong>{r.inherited ? <small className='aib-geerfd'>{tr(lang, ' · як за замовчуванням', ' · zoals standaard')}</small> : null}</div>
                        <span className={`aib-status is-${r.effect}`}>{r.effect === 'allow' ? <><Check aria-hidden='true' />{tr(lang, 'Дозволено', 'Toegestaan')}</> : r.effect === 'ask' ? <><Fingerprint aria-hidden='true' />{tr(lang, 'Питати щоразу', 'Elke keer vragen')}</> : <><X aria-hidden='true' />{tr(lang, 'Вимкнено', 'Uit')}</>}</span>
                        {!alleenLezen ? <button type='button' className='aib-klein' aria-haspopup='dialog' aria-expanded={open === r.capability} onClick={() => setOpen(open === r.capability ? '' : r.capability)}><Timer aria-hidden='true' />{tr(lang, 'Змінити', 'Wijzigen')}</button> : null}
                      </div>
                      <TimerRij lang={lang} rij={r} nu={nu} tz={tz} />
                      {inRij.length ? <p className='aib-inrij'>{tr(lang, 'У черзі на підпис: ', 'In de wachtrij om te tekenen: ')}{tr(lang, inRij[inRij.length - 1].uk, inRij[inRij.length - 1].nl).split(': ').slice(1).join(': ')}</p> : null}
                      {open === r.capability ? <Keuze lang={lang} tz={tz} nu={nu} onSluit={() => setOpen('')} onKies={(spec) => kiesVoor(r.capability, r.label, spec)} /> : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      ) : null}

      {!alleenLezen ? (
        <div className='aib-allen'>
          <strong>{tr(lang, 'Розгортання для всіх агентів одразу', 'Uitrollen voor alle agents tegelijk')}</strong>
          <div className='aib-keuze-rij'>
            <button type='button' onClick={() => zetInRij({ op: 'grant', agent: '*', capabilities: ['deploy.release'], spec: { type: 'off' } }, 'Усі агенти · Розгортати сайт: Вимкнено', 'Alle agents · Site uitrollen: Uit')}>{tr(lang, 'Вимкнути всім', 'Voor iedereen uit')}</button>
            <button type='button' onClick={() => zetInRij({ op: 'grant', agent: '*', capabilities: ['deploy.release'], spec: { type: 'ask' } }, 'Усі агенти · Розгортати сайт: Питати щоразу', 'Alle agents · Site uitrollen: Elke keer vragen')}>{tr(lang, 'Питати щоразу для всіх', 'Voor iedereen elke keer vragen')}</button>
          </div>
        </div>
      ) : <p className='aib-link'><a href='https://admin.tarasevych.com/ai'>{tr(lang, 'Змінити в Адмініструванні → Доступ ШІ', 'Wijzigen in Beheer → AI-toegang')}<ExternalLink aria-hidden='true' /></a></p>}

      {wachtrij.length && !alleenLezen ? (
        <div className='aib-wachtrij' role='region' aria-label={tr(lang, 'Зміни в черзі', 'Wijzigingen in de wachtrij')}>
          <span>{tr(lang, `${wachtrij.length} змін(и) чекають підпису — ще нічого не діє`, `${wachtrij.length} wijziging(en) wachten op uw handtekening — er geldt nog niets`)}</span>
          <div className='aib-knoppen'>
            <button type='button' onClick={() => setWachtrij((w) => w.slice(0, -1))}><Undo2 aria-hidden='true' />{tr(lang, 'Скасувати останню', 'Laatste ongedaan')}</button>
            <button type='button' onClick={() => setWachtrij([])}><X aria-hidden='true' />{tr(lang, 'Очистити', 'Leegmaken')}</button>
            <button type='button' className='aib-hoofd' disabled={!!bezig || !kanPasskey()} onClick={() => void ondertekenen()}><Fingerprint aria-hidden='true' />{tr(lang, 'Перевірити й підписати', 'Controleren en tekenen')}</button>
          </div>
        </div>
      ) : null}

      {venster ? (
        <Venster id='ai-beleid-tekenen' titel={tr(lang, 'Підпис зміни доступу ШІ', 'Wijziging AI-toegang tekenen')} prioriteit='kritiek' breedte={640} onSluit={() => setVenster(null)} sluitenUit={bezig === 'teken'} labelledBy='aib-venster-titel' className='aib-venster-laag'>
          <div className='aib aib-venster'>
            <h2 id='aib-venster-titel'>{tr(lang, 'Підтвердіть зміну доступу ШІ', 'Bevestig de wijziging van de AI-toegang')}</h2>
            <p>{tr(lang, `Нова версія ${venster.ontwerp.seq}. Ось точно те, що ви підписуєте (сторінка сама перевірила, що запит на підпис відповідає цьому списку):`, `Nieuwe versie ${venster.ontwerp.seq}. Dit is precies wat u tekent (de pagina controleerde zelf dat het tekenverzoek bij deze lijst hoort):`)}</p>
            <ul className='aib-diff'>{diffPolicy(beleid, venster.ontwerp, nu, tz).map((l, i) => <li key={i}><strong>{l.text}</strong>{l.kind === 'key' ? null : <span className='aib-van-naar'><span>{l.from}</span><span aria-hidden='true'> → </span><span className='sr-only'>{tr(lang, ' стане ', ' wordt ')}</span><span>{l.to}</span></span>}</li>)}</ul>
            <p className='aib-klein-tekst'>{tr(lang, 'Відбиток зміни: ', 'Vingerafdruk van de wijziging: ')}<code>{venster.beleidHash.slice(0, 16)}</code> · {tr(lang, 'діє 5 хв', 'geldig 5 min')}</p>
            <div className='aib-knoppen'>
              <button type='button' onClick={() => setVenster(null)}><X aria-hidden='true' />{tr(lang, 'Скасувати', 'Annuleren')}</button>
              <button type='button' className='aib-hoofd' autoFocus disabled={!!bezig} onClick={() => void bevestigen()}><Fingerprint aria-hidden='true' />{bezig === 'teken' ? tr(lang, 'Чекаю passkey…', 'Wacht op passkey…') : tr(lang, 'Підтвердити passkey', 'Bevestigen met passkey')}</button>
            </div>
          </div>
        </Venster>
      ) : null}
    </section>
  );
}
