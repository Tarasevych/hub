// Beheer → «Доступ ШІ» / «AI-toegang» (§13.12): wat elke AI mag, met timers die de SERVER afdwingt, gewijzigd alleen met de
// passkey van de eigenaar. Wijzigingen gaan eerst in een wachtrij; «Перевірити й підписати» toont precies wat er verandert,
// de browser rekent zelf na dat de challenge bij dat ontwerp hoort (wat u ziet = wat u tekent), en root schrijft de nieuwe versie.
// Op mcp.tarasevych.com/agents verschijnt dezelfde weergave alleen-lezen (alleenLezen) met een link hierheen.
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Activity, ArrowDownUp, Ban, Bot, Boxes, Check, Clock, Crown, ExternalLink, Fingerprint, GitBranch, Globe, Hand, Info, Layers, Link2, Lock, Mail, Monitor, Plus, Power, RefreshCw, Rocket, Search, Server, ShieldAlert, ShieldCheck, Timer, Trash2, TriangleAlert, Undo2, X, type LucideIcon } from 'lucide-react';
import { api } from './platform/client';
import AgentLogo, { agentSlugVan } from './agenten/AgentLogo';
import Merk from './merk/Merk';
import { canonicalNavigationUrl } from './canoniek-navigatie';
import AgentStandLijst, { type AgentStandKort, type PoortKort } from './agenten/AgentStandLijst';
import NamensSessies from './agenten/NamensSessies';
import { foutCode, kanPasskey, passkeyBevestigen, type AssertieOpties } from './platform/webauthn';
import { foutTekst as herstartTekst, isHerstart } from './uitrol/fouten';
import { canonicalize } from '../shared/ai-beleid/canoniek';
import { diffPolicy, listGrants, type GrantRow, type Op, type Policy } from '../shared/ai-beleid/model';
import { PRESETS, countdown, formatClock, formatDuration, resolveGrant, zonedToUtc, type After, type GrantSpec, type Mode } from '../shared/ai-beleid/tijd';
import { Venster } from './platform/vensters';
import { textOf } from './mcp-teksten';
import './beheer-ai-beleid.css';
import './ai-beleid.css';
import HulpVraag from './hulp/HulpVraag';

type Lang = 'uk' | 'nl';
type Props = { lang: Lang; sourceOrigin: string; tabContext: string; alleenLezen?: boolean; dienst?: 'admin' | 'mcp' };
type Verbinding = { naam: string; soort: 'oauth' | 'token' | 'chat'; actief: boolean; agentId: string | null; laatst: number | null };
type Versie = { seq: number; hash: string; op: string; ondertekend: { soort?: string; label?: string; keyId?: string; vingerafdruk?: string } };
type Overzicht = {
  staat: 'niet-ingesteld' | 'ongeldig' | 'geldig'; code?: string; serverNow: number; tz: string;
  beleid?: Policy; hash?: string; versies?: Versie[]; verbindingen: Verbinding[]; sleutels: Array<{ label: string; vingerafdruk: string }>;
  /** Levend van de server: welke hulpmiddelen onder elke mogelijkheid vallen, en welke (nieuwe) nog nergens onder vallen. */
  mogelijkheden?: Array<{ id: string; group: string; groupNl?: string; label: string; hint?: string; risk?: 'read' | 'sensitive' | 'write' | 'dangerous'; sinds?: string; tools: string[] }>;
  /** Laatste activiteit per agent uit het logboek (laatste 30 dagen). */
  activiteit?: Record<string, { laatst: number; n24: number; geweigerd24: number; tool: string; resultaat: string }>;
  zonderGroep?: string[];
  /** De WARE stand per agent uit de hub (backend/connector-v2.ts → agentStanden): v2, oud /mcp, serverdeur, levende kant, hulpmiddelen nu. null = onbepaalbaar. */
  agenten?: { agenten: AgentStandKort[]; poort: PoortKort } | null;
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
// Audit 19.10.2026 (A3): tijdelijke 5xx/netwerk → dezelfde menselijke tekst als bij Updates (src/uitrol/fouten.ts), nooit «Помилка: HTTP_502».
const foutTekst = (lang: Lang, code: string) => { const t = FOUTEN[code] ?? (code.startsWith('ONTWERP_') ? ['Зміна недійсна: ' + code, 'Wijziging ongeldig: ' + code] as [string, string] : null); if (t) return tr(lang, t[0], t[1]); if (isHerstart(code)) return herstartTekst(lang, code); return tr(lang, 'Помилка: ', 'Fout: ') + (code || tr(lang, 'немає зв’язку', 'geen verbinding')); };
/** Welk deelverzoek faalde, zodat de melding dat benoemt (A3). */
export const deelFoutTekst = (lang: Lang, deel: 'overzicht' | 'voorstel' | 'ondertekenen', code: string) => {
  const naam = { overzicht: ['Не вдалося завантажити огляд політики', 'Overzicht van het beleid laden mislukt'], voorstel: ['Не вдалося підготувати чернетку для підпису', 'Ontwerp voor ondertekening voorbereiden mislukt'], ondertekenen: ['Не вдалося підписати зміни', 'Wijzigingen ondertekenen mislukt'] }[deel];
  return `${tr(lang, naam[0], naam[1])}: ${foutTekst(lang, code)}`;
};

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
      <fieldset><legend>{tr(lang, 'Власна тривалість', 'Eigen duur')} <HulpVraag k='aib.duur' lang={lang} /></legend>
        <div className='aib-keuze-rij'>
          <input type='number' min={1} max={9999} value={aantal} onChange={(e) => setAantal(e.target.value)} aria-label={tr(lang, 'Кількість', 'Aantal')} />
          <select data-hulp='aib.duur' value={eenheid} onChange={(e) => setEenheid(e.target.value as 'min' | 'h' | 'd')} aria-label={tr(lang, 'Одиниця', 'Eenheid')}>
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
      <fieldset><legend>{tr(lang, 'Після закінчення строку', 'Na afloop van de looptijd')} <HulpVraag k='aib.na-afloop' lang={lang} /></legend>
        <div className='aib-keuze-rij'>
          <label><input data-hulp='aib.na-afloop' type='radio' name='aib-na' checked={na === 'off'} onChange={() => setNa('off')} />{tr(lang, 'Вимкнути', 'Uitzetten')}</label>
          <label><input data-hulp='aib.na-afloop' type='radio' name='aib-na' checked={na === 'ask'} onChange={() => setNa('ask')} />{tr(lang, 'Питати щоразу', 'Elke keer vragen')}</label>
        </div>
      </fieldset>
      {fout ? <p className='aib-fout' role='alert'>{fout}</p> : null}
      <div className='aib-keuze-rij aib-rechts'><button type='button' onClick={onSluit}><X aria-hidden='true' />{tr(lang, 'Закрити', 'Sluiten')}</button></div>
    </div>
  );
}

// ------------------------------------------------------------------ hulp voor het nieuwe overzicht (kaarten, filters, groepen)
const GROEP_ICOON: Record<string, LucideIcon> = { 'Браузер': Globe, 'Пристрої': Monitor, 'Додатки': Boxes, 'Пошта й Google': Mail, GitHub: GitBranch, 'Сервер': Server, 'Розгортання': Rocket, 'Власник': Crown };
const RISICO: Record<string, [string, string, string]> = {
  read: ['читання', 'lezen', 'is-laag'], sensitive: ['чутливе', 'gevoelig', 'is-midden'], write: ['запис', 'schrijven', 'is-midden'], dangerous: ['небезпечне', 'gevaarlijk', 'is-hoog'],
};
const PRESET_AGENTEN: Array<{ id: string; naam: string; uk: string; nl: string }> = [
  { id: 'claude', naam: 'Claude', uk: 'Чат і код від Anthropic', nl: 'Chat en code van Anthropic' },
  { id: 'gpt', naam: 'ChatGPT', uk: 'Адреса /gpt', nl: 'Adres /gpt' },
  { id: 'gemini', naam: 'Gemini', uk: 'Google', nl: 'Google' },
  { id: 'grok', naam: 'Grok', uk: 'xAI', nl: 'xAI' },
  { id: 'copilot', naam: 'Copilot', uk: 'Microsoft / GitHub', nl: 'Microsoft / GitHub' },
  { id: 'cursor', naam: 'Cursor', uk: 'Редактор коду', nl: 'Code-editor' },
  { id: 'mistral', naam: 'Mistral', uk: 'Le Chat', nl: 'Le Chat' },
  { id: 'perplexity', naam: 'Perplexity', uk: 'Пошук з ШІ', nl: 'Zoeken met AI' },
];
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;
const maakId = (naam: string) => naam.toLowerCase().normalize('NFKC').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

type Stand = 'aan' | 'deels' | 'uit';
type GroepCijfer = { allow: number; ask: number; deny: number; totaal: number };
type AgentCijfers = GroepCijfer & { timers: number; enabled: boolean; stand: Stand; groepen: Map<string, GroepCijfer> };
type Filter = 'alle' | Stand;
type Sorteer = 'activiteit' | 'naam' | 'rechten' | 'timers';

const standVan = (c: GroepCijfer, enabled: boolean): Stand => (!enabled || c.allow + c.ask === 0 ? 'uit' : c.allow === c.totaal ? 'aan' : 'deels');

/**
 * Merklogo uit het ENE register (src/merk) voor bekende agents (claude, gpt, grok, gemini, copilot, cursor — src/agenten/AgentLogo);
 * een onbekende agent (Mistral, Perplexity, een eigen naam) gaat ook door <Merk>: kent het register het merk, dan het logo, anders
 * het monogram met de vaste tint van het register — nooit meer een eigen tekenblok hier (20.10.2026: «логотипи псевдо»).
 */
function Avatar({ naam, id, groot = false }: { naam: string; id: string; groot?: boolean }) {
  const maat = groot ? 52 : 38;
  if (agentSlugVan(id) || agentSlugVan(naam)) return <AgentLogo agent={agentSlugVan(id) || naam} naam={naam} size={maat} className={`aiz-avatar-logo${groot ? ' is-groot' : ''}`} />;
  return <Merk merk={id || naam} naam={naam} maat={maat} className={`aiz-avatar-logo${groot ? ' is-groot' : ''}`} />;
}

const sindsTekst = (lang: Lang, ms: number, nu: number) => {
  const m = Math.floor(Math.max(0, nu - ms) / 60_000);
  if (m < 1) return tr(lang, 'щойно', 'zojuist');
  if (m < 60) return tr(lang, `${m} хв тому`, `${m} min geleden`);
  const h = Math.floor(m / 60);
  if (h < 48) return tr(lang, `${h} год тому`, `${h} uur geleden`);
  return tr(lang, `${Math.floor(h / 24)} дн. тому`, `${Math.floor(h / 24)} dgn geleden`);
};

/** Drie knoppen «Вимк. / Питати / Завжди» voor één mogelijkheid, groep of agent. */
function SnelKeuze({ lang, huidig, onKies, label }: { lang: Lang; huidig?: Mode['kind']; onKies: (s: GrantSpec) => void; label: string }) {
  const opties: Array<{ k: 'off' | 'ask' | 'always'; Icoon: LucideIcon; uk: string; nl: string }> = [
    { k: 'off', Icoon: Ban, uk: 'Вимк.', nl: 'Uit' }, { k: 'ask', Icoon: Hand, uk: 'Питати', nl: 'Vragen' }, { k: 'always', Icoon: Check, uk: 'Завжди', nl: 'Altijd' },
  ];
  return <div className='aiz-segment' role='group' aria-label={label}>
    {opties.map(({ k, Icoon, uk, nl }) => <button key={k} type='button' className={`aiz-seg is-${k}`} aria-pressed={huidig === k} title={`${label}: ${modusTekst(lang, { kind: k })}`} onClick={() => onKies({ type: k })}><Icoon aria-hidden='true' />{tr(lang, uk, nl)}</button>)}
  </div>;
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
  // `bron: 'laden'` = fout van het periodieke overzicht-verzoek: verdwijnt vanzelf zodra dat verzoek weer slaagt (A3).
  const [melding, setMelding] = useState<{ ok: boolean; tekst: string; bron?: 'laden' } | null>(null);
  const [zoek, setZoek] = useState('');
  const [filter, setFilter] = useState<Filter>('alle');
  const [groepFilter, setGroepFilter] = useState('');
  const [sorteer, setSorteer] = useState<Sorteer>('activiteit');
  const [bulkGroep, setBulkGroep] = useState('');
  const [bulkDoel, setBulkDoel] = useState<'zichtbaar' | 'alle'>('zichtbaar');
  const [openGroepen, setOpenGroepen] = useState<Record<string, boolean>>({});
  const [nieuwOpen, setNieuwOpen] = useState(false);
  const [nieuwNaam, setNieuwNaam] = useState('');
  const [nieuwId, setNieuwId] = useState('');
  const [nieuwModus, setNieuwModus] = useState<'ask' | 'off'>('ask');
  const [verwijder, setVerwijder] = useState('');
  const paneel = useRef<HTMLDivElement>(null);
  const nu = useServerTijd(data?.serverNow);
  const tz = data?.tz || 'Europe/Brussels';

  const laden = useCallback(async () => {
    try { const r = await api.post('/api/owner/ai-beleid/overzicht', context); setData(r.data as Overzicht); setMelding((m) => (m?.bron === 'laden' ? null : m)); }
    catch (c) { setMelding({ ok: false, tekst: deelFoutTekst(lang, 'overzicht', foutCode(c)), bron: 'laden' }); }
  }, [context, lang]);
  useEffect(() => { void laden(); const t = window.setInterval(() => { void laden(); }, 30000); return () => window.clearInterval(t); }, [laden]);

  const beleid = data?.beleid;
  const rijen = useMemo(() => (beleid ? listGrants(beleid, nu, tz) : []), [beleid, nu, tz]);
  const capInfo = useMemo(() => new Map((data?.mogelijkheden ?? []).map((m) => [m.id, m])), [data?.mogelijkheden]);
  const toolNaam = useCallback((n: string) => textOf(n, lang)?.title || n, [lang]);
  const groepNl = (g: string) => [...capInfo.values()].find((m) => m.group === g)?.groupNl ?? GROEP_NL[g] ?? g;
  const groepNaam = (g: string) => tr(lang, g, groepNl(g));
  const alleGroepen = useMemo(() => { const u: string[] = []; for (const r of rijen) if (!u.includes(r.group)) u.push(r.group); if (!u.length) for (const m of data?.mogelijkheden ?? []) if (!u.includes(m.group) && m.group !== 'Власник') u.push(m.group); return u; }, [rijen, data?.mogelijkheden]);

  const cijfers = useMemo(() => {
    const m = new Map<string, AgentCijfers>();
    for (const r of rijen) {
      let c = m.get(r.agentId);
      if (!c) { c = { allow: 0, ask: 0, deny: 0, totaal: 0, timers: 0, enabled: r.enabled, stand: 'uit', groepen: new Map() }; m.set(r.agentId, c); }
      const k = r.effect === 'allow' ? 'allow' : r.effect === 'ask' ? 'ask' : 'deny';
      c[k]++; c.totaal++;
      if (r.timer && !r.timer.expired) c.timers++;
      const g = c.groepen.get(r.group) ?? { allow: 0, ask: 0, deny: 0, totaal: 0 };
      g[k]++; g.totaal++; c.groepen.set(r.group, g);
    }
    for (const c of m.values()) c.stand = standVan(c, c.enabled);
    return m;
  }, [rijen]);

  const q = zoek.trim().toLowerCase();
  const capTekst = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of data?.mogelijkheden ?? []) m.set(c.id, [c.label, c.hint ?? '', c.group, c.groupNl ?? GROEP_NL[c.group] ?? '', c.id, ...c.tools, ...c.tools.map(toolNaam)].join(' ').toLowerCase());
    return m;
  }, [data?.mogelijkheden, toolNaam]);
  const capTreffers = useMemo(() => new Set(q ? [...capTekst.entries()].filter(([, t]) => t.includes(q)).map(([id]) => id) : []), [capTekst, q]);
  const verbindingenVan = useCallback((id: string) => (data?.verbindingen ?? []).filter((v) => v.agentId === id), [data?.verbindingen]);

  const laatsteActiviteit = useCallback((id: string) => Math.max(data?.activiteit?.[id]?.laatst ?? 0, ...verbindingenVan(id).map((v) => v.laatst ?? 0)), [data?.activiteit, verbindingenVan]);
  const agentNaamMatch = (id: string, naam: string) => !q || `${id} ${naam} ${verbindingenVan(id).map((v) => v.naam).join(' ')}`.toLowerCase().includes(q);
  const capMatchVoor = (id: string) => (q ? rijen.some((r) => r.agentId === id && capTreffers.has(r.capability) && (!groepFilter || r.group === groepFilter)) : false);

  const alleAgenten = useMemo(() => Object.entries(beleid?.agents ?? {}), [beleid]);
  const zichtbaar = useMemo(() => {
    const lijst = alleAgenten.filter(([id, a]) => {
      const c = cijfers.get(id);
      if (!c) return false;
      if (q && !agentNaamMatch(id, a.name) && !capMatchVoor(id)) return false;
      const g = groepFilter ? c.groepen.get(groepFilter) : null;
      if (groepFilter && !g) return false;
      const st = groepFilter && g ? standVan(g, a.enabled) : c.stand;
      return filter === 'alle' || st === filter;
    });
    return lijst.sort((a, b) => {
      const ca = cijfers.get(a[0])!, cb = cijfers.get(b[0])!;
      if (sorteer === 'activiteit') { const d = laatsteActiviteit(b[0]) - laatsteActiviteit(a[0]); if (d) return d; }
      else if (sorteer === 'rechten') { const d = (cb.allow * 2 + cb.ask) - (ca.allow * 2 + ca.ask); if (d) return d; }
      else if (sorteer === 'timers') { const d = cb.timers - ca.timers; if (d) return d; }
      return a[1].name.localeCompare(b[1].name);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alleAgenten, cijfers, q, capTreffers, filter, groepFilter, sorteer, rijen, data?.verbindingen, data?.activiteit]);

  // Standaard de agent die het laatst iets deed (meestal de AI die u net verbond), niet de eerste in alfabetische volgorde.
  useEffect(() => {
    if (agent || !alleAgenten.length) return;
    const best = [...alleAgenten].sort((a, b) => laatsteActiviteit(b[0]) - laatsteActiviteit(a[0]) || a[1].name.localeCompare(b[1].name))[0];
    if (best) setAgent(best[0]);
  }, [agent, alleAgenten, laatsteActiviteit]);

  const telFilter = (f: Filter) => alleAgenten.filter(([id]) => f === 'alle' || cijfers.get(id)?.stand === f).length;

  // ---- wachtrij en ondertekenen (ongewijzigde veiligheidsstroom)
  const zetInRij = (op: Op, uk: string, nl: string) => { setWachtrij((w) => [...w, { id: `${Date.now()}-${w.length}`, op, uk, nl }]); setOpen(''); setVerwijder(''); };
  const agentNaam = (id: string) => beleid?.agents[id]?.name ?? id;
  /** Eén mogelijkheid-wijziging voor één of meer agenten. Alle agenten tegelijk = één '*'-bewerking. */
  const zetGrant = (ids: string[], caps: string[], spec: GrantSpec, waarUk: string, waarNl: string) => {
    if (!ids.length || !caps.length) return;
    const alle = ids.length === alleAgenten.length && alleAgenten.length > 1;
    const tUk = specTekst('uk', spec, tz, nu), tNl = specTekst('nl', spec, tz, nu);
    const wie = (l: Lang) => (alle ? tr(l, 'Усі агенти', 'Alle agents') : ids.length === 1 ? `«${agentNaam(ids[0])}»` : `${ids.length} ${tr(l, 'агентів', 'agents')}`);
    const ops: Op[] = alle ? [{ op: 'grant', agent: '*', capabilities: caps, spec }] : ids.map((id) => ({ op: 'grant', agent: id, capabilities: caps, spec }) as Op);
    setWachtrij((w) => [...w, ...ops.map((op, i) => ({ id: `${Date.now()}-${w.length}-${i}`, op, uk: `${wie('uk')} · ${waarUk}: ${tUk}`, nl: `${wie('nl')} · ${waarNl}: ${tNl}` }))]);
    setOpen('');
  };
  const kiesVoor = (cap: string, label: string, spec: GrantSpec) => zetGrant([agent], [cap], spec, label, label);

  const ondertekenen = async () => {
    if (!wachtrij.length) return;
    setBezig('voorstel'); setMelding(null);
    try {
      const r = await api.post('/api/owner/ai-beleid/voorstel', { ...context, ops: wachtrij.map((w) => w.op) });
      const v = r.data as Voorstel;
      const eigen = await verwachteUitdaging(v.ontwerp, v.nonce, v.verloopt);
      if (eigen.challenge !== v.publicKey.challenge || eigen.hash !== v.beleidHash) throw Object.assign(new Error('UITDAGING_ANDERS'), { message: 'UITDAGING_ANDERS' });
      setVenster(v);
    } catch (c) { setMelding({ ok: false, tekst: deelFoutTekst(lang, 'voorstel', foutCode(c)) }); }
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
      setMelding({ ok: false, tekst: deelFoutTekst(lang, 'ondertekenen', code) });
      if (code === 'VERSIE_VERSCHILT_BELEID') { setVenster(null); setWachtrij([]); await laden(); }
    } finally { setBezig(''); }
  };

  const kies = (id: string) => { setAgent(id); setOpen(''); setVerwijder(''); window.setTimeout(() => paneel.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30); };

  if (!data) return <section className='admin-section aib aiz'><p>{tr(lang, 'Завантаження…', 'Laden…')}</p>{melding ? <p className='aib-melding' data-ok='false' role='alert'>{melding.tekst}</p> : null}</section>;

  const kop = (
    <header className='aib-kop'>
      <div>
        <h2><ShieldCheck aria-hidden='true' />{tr(lang, 'Доступ ШІ за вашим підписом', 'AI-toegang met uw handtekening')}</h2>
        <p>{tr(lang, 'Що може кожен ШІ і як довго. Таймер рахує сервер і сам знімає доступ у момент закінчення. Змінити можна лише з вашим passkey.', 'Wat elke AI mag en hoe lang. De server telt de timer en trekt de toegang zelf in op het eindmoment. Wijzigen kan alleen met uw passkey.')}</p>
      </div>
      <button type='button' className='aib-icoonknop' onClick={() => void laden()} aria-label={tr(lang, 'Оновити', 'Vernieuwen')} title={tr(lang, 'Оновити', 'Vernieuwen')}><RefreshCw aria-hidden='true' /></button>
    </header>
  );

  // De WARE stand per AI — altijd, ook zonder beleid (20.10.2026: «Агенти досі не інтегровано?» — de pagina zei alleen «политику ще не
  // встановлено» en «немає підключень», terwijl Claude via de deur werkte). Instellen gebeurt op de plek van die AI in de hub.
  const hubAgent = (slug: string) => `${canonicalNavigationUrl('mcp', 'agents', lang).replace(/#.*$/, '')}#agent/${slug}`;
  const standBlok = <AgentStandLijst lang={lang} stand={data.agenten ?? null} nu={nu} naarAgent={hubAgent} />;

  if (data.staat === 'niet-ingesteld') return (
    <section className='admin-section aib aiz' data-aib-staat='niet-ingesteld'>{kop}{standBlok}
      <div className='aib-stand' data-ok='onbekend'><Clock aria-hidden='true' /><div>
        <strong>{tr(lang, 'Політику ще не встановлено на сервері', 'Het beleid is nog niet op de server geïnstalleerd')}</strong>
        <p>{tr(lang, 'Поки її немає, діють лише звичайні налаштування інструментів. Перша версія (ваш genesis.signed.json, підписаний офлайн-ключем) встановлюється на сервері однією командою від root:', 'Zolang het er niet is, gelden alleen de gewone instellingen van de hulpmiddelen. De eerste versie (uw genesis.signed.json, getekend met de offline sleutel) installeert root met één opdracht:')}</p>
        <code className='aib-ssh'>sudo mijn-ruimte-passkey beleid-start /шлях/genesis.signed.json &lt;{tr(lang, 'відбиток офлайн-ключа', 'vingerafdruk van de offline sleutel')}&gt;</code>
      </div></div>
    </section>
  );
  if (data.staat === 'ongeldig') return (
    <section className='admin-section aib aiz' data-aib-staat='ongeldig'>{kop}{standBlok}
      <div className='aib-stand' data-ok='false' role='alert'><ShieldAlert aria-hidden='true' /><div>
        <strong>{tr(lang, 'Ланцюжок політики не пройшов перевірку — увесь доступ ШІ закрито', 'De beleidsketen is niet geldig — alle AI-toegang is dicht')}</strong>
        <p>{tr(lang, 'Хтось змінив або видалив версію без вашого підпису. ШІ нічого не може, доки root не відновить ланцюжок із резервної копії.', 'Iemand heeft een versie gewijzigd of verwijderd zonder uw handtekening. AI kan niets tot root de keten uit een back-up herstelt.')} <code>{data.code}</code></p>
      </div></div>
    </section>
  );

  const b = beleid!;
  const laatste = data.versies?.[0];
  // «Нове»: de mogelijkheid bestaat pas sinds na de laatste ondertekende versie — de eigenaar heeft er nog niet over beslist.
  const getekendOp = (() => { try { return laatste?.op ? new Date(laatste.op).toISOString().slice(0, 10) : ''; } catch { return ''; } })();
  const isNieuw = (cap: string) => { const s = capInfo.get(cap)?.sinds; return !!s && (!getekendOp || getekendOp < s); };
  const geselecteerd = b.agents[agent];
  const mijnCijfers = cijfers.get(agent);
  const zonderAgent = data.verbindingen.filter((v) => !v.agentId);
  const zichtbareIds = zichtbaar.map(([id]) => id);
  const mijnRijen = rijen.filter((r) => r.agentId === agent && (!groepFilter || r.group === groepFilter));
  const toonRij = (r: GrantRow) => !q || agentNaamMatch(agent, geselecteerd?.name ?? '') || capTreffers.has(r.capability);
  const groepen = alleGroepen.filter((g) => mijnRijen.some((r) => r.group === g && toonRij(r)));
  const groepOpen = (g: string) => openGroepen[`${agent}:${g}`] ?? (!!groepFilter || !!q || g === 'Розгортання' || mijnRijen.some((r) => r.group === g && (r.timer && !r.timer.expired)));
  const zetGroepOpen = (g: string, v: boolean) => setOpenGroepen((o) => ({ ...o, [`${agent}:${g}`]: v }));
  const capsVan = (g: string) => (data.mogelijkheden ?? []).filter((m) => m.group === g && m.id !== 'policy.change').map((m) => m.id);
  const deployAan = alleAgenten.filter(([id]) => { const r = rijen.find((x) => x.agentId === id && x.capability === 'deploy.release'); return r && r.effect !== 'deny'; }).length;
  const timersTotaal = [...cijfers.values()].reduce((s, c) => s + c.timers, 0);
  const bulkCaps = bulkGroep ? capsVan(bulkGroep) : (data.mogelijkheden ?? []).filter((m) => m.id !== 'policy.change').map((m) => m.id);
  const bulkIds = bulkDoel === 'alle' ? alleAgenten.map(([id]) => id) : zichtbareIds;
  const bulkWaarUk = bulkGroep ? `${bulkGroep} (${bulkCaps.length})` : `усі можливості (${bulkCaps.length})`;
  const bulkWaarNl = bulkGroep ? `${groepNl(bulkGroep)} (${bulkCaps.length})` : `alle mogelijkheden (${bulkCaps.length})`;
  const bulkWaarTekst = tr(lang, bulkWaarUk, bulkWaarNl);
  const verbindingenTekst = (v: Verbinding) => `${v.naam} · ${v.soort === 'oauth' ? 'OAuth' : v.soort === 'token' ? tr(lang, 'токен', 'token') : tr(lang, 'чат сайту', 'chat van de site')}${v.laatst ? ` · ${sindsTekst(lang, v.laatst, nu)}` : ''}`;
  const presets = PRESET_AGENTEN.filter((p) => !b.agents[p.id]);

  const voegToe = (id: string, naam: string, modus: 'ask' | 'off') => {
    zetInRij({ op: 'agent_add', agent: id, name: naam.slice(0, 80), spec: { type: modus } }, `Додати «${naam}» (${modus === 'ask' ? 'питати щоразу' : 'вимкнено'})`, `«${naam}» toevoegen (${modus === 'ask' ? 'elke keer vragen' : 'uit'})`);
    setNieuwOpen(false); setNieuwNaam(''); setNieuwId('');
  };
  const nieuwIdWaarde = nieuwId || maakId(nieuwNaam);
  const nieuwFout = !nieuwNaam.trim() ? '' : !ID_RE.test(nieuwIdWaarde) ? tr(lang, 'Ідентифікатор: латиниця, цифри, . _ : -', 'Id: latijnse letters, cijfers, . _ : -') : b.agents[nieuwIdWaarde] ? tr(lang, 'Такий агент уже є.', 'Deze agent bestaat al.') : '';

  // ---- uitleg «waarom kan deze agent (niet) uitrollen?» — gebaseerd op het beleid én op wat de server over de verbindingen weet
  const uitrolControle = (id: string) => {
    const a = b.agents[id];
    const rel = rijen.find((r) => r.agentId === id && r.capability === 'deploy.release');
    const sta = rijen.find((r) => r.agentId === id && r.capability === 'deploy.status');
    const vb = verbindingenVan(id);
    type Item = { s: 'ok' | 'bad' | 'info'; t: string };
    const lijst: Item[] = [];
    lijst.push(a?.enabled ? { s: 'ok', t: tr(lang, 'Агента увімкнено в політиці.', 'De agent staat aan in het beleid.') } : { s: 'bad', t: tr(lang, 'Агента вимкнено повністю — жоден інструмент не працює.', 'De agent staat helemaal uit — geen enkel hulpmiddel werkt.') });
    if (rel) lijst.push(rel.effect === 'deny' ? { s: 'bad', t: tr(lang, '«Розгортати сайт» вимкнено — підготовка пакета відхиляється. Увімкніть «Питати щоразу» або «Завжди».', '«Site uitrollen» staat uit — een pakket voorbereiden wordt geweigerd. Zet op «Vragen» of «Altijd».') }
      : { s: 'ok', t: tr(lang, `«Розгортати сайт»: ${modusTekst(lang, rel.mode)}. Блокує лише «Вимкнено»; «Питати щоразу» підготовку пакета не зупиняє.`, `«Site uitrollen»: ${modusTekst(lang, rel.mode)}. Alleen «Uit» blokkeert; «Vragen» houdt het voorbereiden van een pakket niet tegen.`) });
    if (sta && sta.effect === 'deny') lijst.push({ s: 'bad', t: tr(lang, '«Дивитися стан розгортання» вимкнено — агент не бачить стан своїх пакетів.', '«Uitrolstatus bekijken» staat uit — de agent ziet de stand van zijn pakketten niet.') });
    lijst.push(vb.length ? { s: 'ok', t: tr(lang, `Підключень, що зіставляються з цим агентом: ${vb.length} (${vb.map((v) => v.naam).join(', ')}).`, `Verbindingen die bij deze agent horen: ${vb.length} (${vb.map((v) => v.naam).join(', ')}).`) }
      : { s: 'bad', t: tr(lang, 'Жодне підключення не зіставляється з цим агентом (за назвою клієнта чи адресою /<агент>) — сервер скаже «агента немає в політиці». Додайте його під тією назвою, яку показує підключення.', 'Geen enkele verbinding hoort bij deze agent (op clientnaam of adres /<agent>) — de server zegt dan «agent niet in het beleid». Voeg hem toe onder de naam die de verbinding toont.') });
    lijst.push({ s: 'info', t: tr(lang, 'Окремо від цієї політики: право «готувати оновлення» (Оновлення → Налаштування → Хто готує). Воно видається конкретному підключенню на обмежений строк (типово 1 день); після повторного підключення потрібно видати його знову.', 'Los van dit beleid: het recht «updates voorbereiden» (Updates → Instellingen → Wie bereidt voor). Het geldt voor één verbinding en een beperkte tijd (standaard 1 dag); na opnieuw verbinden moet u het opnieuw geven.') });
    lijst.push({ s: 'info', t: tr(lang, 'Ще окремо: інструменти технічної частини (_beheer) мають бути дозволені в mcp → Агенти → Конектори; погодити оновлення агент ніколи не може — лише ви, passkey.', 'Ook los: de hulpmiddelen van de technische kant (_beheer) moeten aan staan onder mcp → Agenten → Connectors; goedkeuren kan een agent nooit — alleen u, met de passkey.') });
    return lijst;
  };

  const aantalTekst = tr(lang, `Показано ${zichtbaar.length} з ${alleAgenten.length}`, `${zichtbaar.length} van ${alleAgenten.length} getoond`);
  const act = (id: string) => data.activiteit?.[id];

  return (
    <section className='admin-section aib aiz' data-aib-staat='geldig'>{kop}
      <div className='aib-stand' data-ok='true'><Lock aria-hidden='true' /><div>
        <strong>{tr(lang, `Версія ${b.seq}`, `Versie ${b.seq}`)} · <code>{data.hash?.slice(0, 12)}</code></strong>
        <p>{laatste ? tr(lang, `Підписано: ${laatste.ondertekend.soort === 'passkey' ? `passkey «${laatste.ondertekend.label ?? ''}»` : `офлайн-ключ ${laatste.ondertekend.keyId ?? ''}`} · ${laatste.op ? new Date(laatste.op).toLocaleString('uk-UA') : ''}`, `Getekend: ${laatste.ondertekend.soort === 'passkey' ? `passkey «${laatste.ondertekend.label ?? ''}»` : `offline sleutel ${laatste.ondertekend.keyId ?? ''}`} · ${laatste.op ? new Date(laatste.op).toLocaleString('nl-BE') : ''}`) : null}</p>
        <ul className='aiz-cijfers' aria-label={tr(lang, 'Коротко', 'In het kort')}>
          <li><Bot aria-hidden='true' /><b>{alleAgenten.length}</b> {tr(lang, 'агентів', 'agents')}</li>
          <li><Rocket aria-hidden='true' /><b>{deployAan}</b> {tr(lang, 'можуть готувати оновлення', 'mogen updates voorbereiden')}</li>
          <li><Timer aria-hidden='true' /><b>{timersTotaal}</b> {tr(lang, 'активних таймерів', 'actieve timers')}</li>
        </ul>
      </div></div>
      {melding ? <p className='aib-melding' data-ok={String(melding.ok)} role={melding.ok ? 'status' : 'alert'}>{melding.tekst}</p> : null}
      {standBlok}

      {dienst === 'admin' ? <NamensSessies lang={lang} context={context} alleenLezen={alleenLezen} /> : null}

      {data.zonderGroep?.length ? (
        <div className='aib-waarschuwing' data-zonder-groep=''><TriangleAlert aria-hidden='true' /><div>
          <strong>{tr(lang, 'Нові інструменти без групи в політиці — ШІ питатиме вас щоразу:', 'Nieuwe hulpmiddelen zonder groep in het beleid — de AI vraagt u elke keer:')}</strong>
          <p>{data.zonderGroep.map(toolNaam).join(', ')}</p>
        </div></div>
      ) : null}

      {zonderAgent.length ? (
        <div className='aib-waarschuwing' data-zonder-agent=''><TriangleAlert aria-hidden='true' /><div>
          <strong>{tr(lang, 'Підключення ШІ без запису в політиці — їм усе заборонено:', 'AI-verbindingen zonder plaats in het beleid — alles is hen verboden:')}</strong>
          <ul>{zonderAgent.map((v) => <li key={`${v.soort}:${v.naam}`}><span className='aiz-mini'><Avatar naam={v.naam} id={maakId(v.naam)} />{verbindingenTekst(v)}</span>
            {!alleenLezen ? <button type='button' className='aib-klein' onClick={() => voegToe(maakId(v.naam) || `ai-${Date.now()}`, v.naam, 'ask')}><Plus aria-hidden='true' />{tr(lang, 'Додати (питати щоразу)', 'Toevoegen (elke keer vragen)')}</button> : null}</li>)}</ul>
        </div></div>
      ) : null}

      {/* ---- zoeken, filters, sorteren */}
      <div className='aiz-balk' role='search' aria-label={tr(lang, 'Пошук і фільтри агентів', 'Zoeken en filteren van agents')}>
        <label className='aiz-zoek'><Search aria-hidden='true' />
          <input type='search' value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder={tr(lang, 'Пошук: агент, можливість, інструмент', 'Zoek: agent, mogelijkheid, hulpmiddel')} aria-label={tr(lang, 'Пошук', 'Zoeken')} data-aiz-zoek />
          {zoek ? <button type='button' className='aiz-wis' onClick={() => setZoek('')} aria-label={tr(lang, 'Очистити пошук', 'Zoekopdracht wissen')}><X aria-hidden='true' /></button> : null}
        </label>
        <div className='aiz-chips' role='group' aria-label={tr(lang, 'Стан', 'Stand')}>
          {([['alle', 'Усі', 'Alle'], ['aan', 'Увімкнені', 'Aan'], ['deels', 'Частково', 'Gedeeltelijk'], ['uit', 'Вимкнені', 'Uit']] as const).map(([f, uk, nl]) => (
            <button key={f} type='button' className={`aiz-chip is-${f}`} aria-pressed={filter === f} onClick={() => setFilter(f)}>{tr(lang, uk, nl)}<b>{telFilter(f)}</b></button>
          ))}
        </div>
        <label className='aiz-sorteer'><ArrowDownUp aria-hidden='true' /><span className='sr-only'>{tr(lang, 'Сортування', 'Sorteren')}</span>
          <select data-hulp-vrij='sortering' value={sorteer} onChange={(e) => setSorteer(e.target.value as Sorteer)} aria-label={tr(lang, 'Сортування', 'Sorteren')}>
            <option value='activiteit'>{tr(lang, 'Остання активність', 'Laatste activiteit')}</option><option value='naam'>{tr(lang, 'Назва', 'Naam')}</option>
            <option value='rechten'>{tr(lang, 'Найбільше дозволів', 'Meeste rechten')}</option><option value='timers'>{tr(lang, 'Активні таймери', 'Actieve timers')}</option>
          </select></label>
      </div>
      <div className='aiz-chips aiz-groepen' role='group' aria-label={tr(lang, 'Група можливостей', 'Groep van mogelijkheden')}>
        <button type='button' className='aiz-chip' aria-pressed={!groepFilter} onClick={() => setGroepFilter('')}><Activity aria-hidden='true' />{tr(lang, 'Усі групи', 'Alle groepen')}</button>
        {alleGroepen.map((g) => { const Icoon = GROEP_ICOON[g] ?? Info; return <button key={g} type='button' className='aiz-chip' aria-pressed={groepFilter === g} onClick={() => setGroepFilter(groepFilter === g ? '' : g)}><Icoon aria-hidden='true' />{groepNaam(g)}</button>; })}
      </div>
      <p className='aiz-teller-lijn' role='status' aria-live='polite'>{aantalTekst}{zoek || filter !== 'alle' || groepFilter ? <button type='button' className='aiz-link' onClick={() => { setZoek(''); setFilter('alle'); setGroepFilter(''); }}>{tr(lang, 'Скинути фільтри', 'Filters wissen')}</button> : null}</p>

      {/* ---- groepsbeheer */}
      {!alleenLezen ? (
        <div className='aiz-bulk' data-aiz-bulk>
          <div className='aiz-bulk-deploy aib-allen'>
            <div><strong><Rocket aria-hidden='true' />{tr(lang, 'Розгортання для всіх агентів одразу', 'Uitrollen voor alle agents tegelijk')}</strong>
              <small>{tr(lang, `Зараз «Розгортати сайт» не вимкнено в ${deployAan} з ${alleAgenten.length}. Блокує лише «Вимкнено».`, `«Site uitrollen» staat niet uit bij ${deployAan} van ${alleAgenten.length}. Alleen «Uit» blokkeert.`)}</small></div>
            <div className='aib-keuze-rij'>
              <button type='button' onClick={() => zetInRij({ op: 'grant', agent: '*', capabilities: ['deploy.release'], spec: { type: 'off' } }, 'Усі агенти · Розгортати сайт: Вимкнено', 'Alle agents · Site uitrollen: Uit')}>{tr(lang, 'Вимкнути всім', 'Voor iedereen uit')}</button>
              <button type='button' onClick={() => zetInRij({ op: 'grant', agent: '*', capabilities: ['deploy.release'], spec: { type: 'ask' } }, 'Усі агенти · Розгортати сайт: Питати щоразу', 'Alle agents · Site uitrollen: Elke keer vragen')}>{tr(lang, 'Питати щоразу для всіх', 'Voor iedereen elke keer vragen')}</button>
            </div>
          </div>
          <details className='aiz-bulk-algemeen'>
            <summary><Layers aria-hidden='true' />{tr(lang, 'Групове керування групами та агентами', 'Groepsbeheer van groepen en agents')}</summary>
            <div className='aiz-bulk-rij'>
              <label>{tr(lang, 'Група', 'Groep')}
                <HulpVraag k='aib.bulk-groep' lang={lang} /><select data-hulp='aib.bulk-groep' value={bulkGroep} onChange={(e) => setBulkGroep(e.target.value)} data-aiz-bulk-groep>
                  <option value=''>{tr(lang, 'Усі групи', 'Alle groepen')}</option>
                  {alleGroepen.map((g) => <option key={g} value={g}>{groepNaam(g)}</option>)}
                </select></label>
              <fieldset className='aiz-doel'><legend>{tr(lang, 'Для кого', 'Voor wie')} <HulpVraag k='aib.bulk-doel' lang={lang} /></legend>
                <label><input data-hulp='aib.bulk-doel' type='radio' name='aiz-doel' checked={bulkDoel === 'zichtbaar'} onChange={() => setBulkDoel('zichtbaar')} />{tr(lang, `Для показаних агентів (${zichtbareIds.length})`, `Voor de getoonde agents (${zichtbareIds.length})`)}</label>
                <label><input data-hulp='aib.bulk-doel' type='radio' name='aiz-doel' checked={bulkDoel === 'alle'} onChange={() => setBulkDoel('alle')} />{tr(lang, `Для всіх агентів (${alleAgenten.length})`, `Voor alle agents (${alleAgenten.length})`)}</label>
              </fieldset>
            </div>
            <p className='aiz-uitleg'>{tr(lang, `Буде змінено: ${bulkWaarTekst} у ${bulkIds.length} агент(ів). Нічого не діє, доки ви не підпишете passkey.`, `Dit wijzigt: ${bulkWaarTekst} bij ${bulkIds.length} agent(s). Er geldt niets tot u met de passkey tekent.`)}</p>
            <div className='aiz-bulk-knoppen'>
              <SnelKeuze lang={lang} label={tr(lang, 'Групова дія', 'Groepsactie')} onKies={(s) => zetGrant(bulkIds, bulkCaps, s, bulkWaarUk, bulkWaarNl)} />
              <button type='button' className='aib-klein' aria-expanded={open === '__bulk'} aria-haspopup='dialog' onClick={() => setOpen(open === '__bulk' ? '' : '__bulk')}><Timer aria-hidden='true' />{tr(lang, 'Таймер…', 'Timer…')}</button>
            </div>
            {open === '__bulk' ? <Keuze lang={lang} tz={tz} nu={nu} onSluit={() => setOpen('')} onKies={(s) => zetGrant(bulkIds, bulkCaps, s, bulkWaarUk, bulkWaarNl)} /> : null}
          </details>
        </div>
      ) : null}

      {/* ---- agentkaarten */}
      <div className='aiz-kaarten'>
        <div className='aiz-tablist' role='tablist' aria-label={tr(lang, 'Агенти в політиці', 'Agents in het beleid')}>
        {zichtbaar.map(([id, a]) => {
          const c = cijfers.get(id)!;
          const vb = verbindingenVan(id);
          const ac = act(id);
          const laatst = laatsteActiviteit(id);
          const groepenKaart = alleGroepen.filter((g) => c.groepen.has(g) && (!groepFilter || g === groepFilter));
          const treffers = q ? rijen.filter((r) => r.agentId === id && capTreffers.has(r.capability) && !agentNaamMatch(id, a.name)).slice(0, 3) : [];
          return (
            <button key={id} id={`aib-tab-${id}`} type='button' role='tab' aria-selected={agent === id} aria-controls='aib-agentpaneel' className={`aiz-kaart is-${c.stand}${agent === id ? ' is-gekozen' : ''}`} data-agent={id} onClick={() => kies(id)}>
              <span className='aiz-kaart-kop'>
                <Avatar naam={a.name} id={id} />
                <span className='aiz-kaart-naam'><strong>{a.name}</strong><small>{id}</small></span>
                <span className={`aiz-stand is-${a.enabled ? c.stand : 'uit'}`}>{!a.enabled ? tr(lang, 'Агента вимкнено', 'Agent uit') : c.stand === 'aan' ? tr(lang, 'Увімкнено', 'Aan') : c.stand === 'deels' ? tr(lang, 'Частково', 'Gedeeltelijk') : tr(lang, 'Вимкнено', 'Uit')}</span>
              </span>
              <span className='aiz-activiteit'>
                <Clock aria-hidden='true' />
                {laatst ? <span>{tr(lang, 'Остання активність: ', 'Laatste activiteit: ')}<b>{sindsTekst(lang, laatst, nu)}</b>{ac ? <small>{ac.tool ? ` · ${toolNaam(ac.tool)}` : ''} · {tr(lang, `${ac.n24} викликів за 24 год`, `${ac.n24} aanroepen in 24 uur`)}{ac.geweigerd24 ? tr(lang, `, ${ac.geweigerd24} відмов`, `, ${ac.geweigerd24} geweigerd`) : ''}</small> : null}</span>
                  : <span className='aiz-zacht'>{tr(lang, 'Ще не користувався', 'Nog niet gebruikt')}</span>}
              </span>
              <span className='aiz-verbindingen'>
                <Link2 aria-hidden='true' />
                {vb.length ? vb.slice(0, 2).map((v) => <span key={`${v.soort}:${v.naam}`} className={`aiz-pil${v.actief ? '' : ' is-uit'}`} title={verbindingenTekst(v)}>{v.naam}</span>) : <span className='aiz-pil is-waarschuwing'>{tr(lang, 'немає підключень', 'geen verbindingen')}</span>}
                {vb.length > 2 ? <span className='aiz-zacht'>+{vb.length - 2}</span> : null}
              </span>
              <span className='aiz-groep-chips'>
                {groepenKaart.map((g) => {
                  const gc = c.groepen.get(g)!; const Icoon = GROEP_ICOON[g] ?? Info;
                  const st = standVan(gc, a.enabled);
                  return <span key={g} className={`aiz-gchip is-${st}`} title={`${groepNaam(g)}: ${gc.allow} ${tr(lang, 'дозволено', 'toegestaan')} · ${gc.ask} ${tr(lang, 'питати', 'vragen')} · ${gc.deny} ${tr(lang, 'вимкнено', 'uit')}`}><Icoon aria-hidden='true' />{groepNaam(g)}<b>{gc.allow + gc.ask}/{gc.totaal}</b></span>;
                })}
              </span>
              {c.timers || treffers.length ? <span className='aiz-onderrij'>
                {c.timers ? <span className='aib-teller' title={tr(lang, 'Активних таймерів', 'Actieve timers')}><Timer aria-hidden='true' />{c.timers}</span> : null}
                {treffers.map((r) => <span key={r.capability} className='aiz-treffer'>{r.label}</span>)}
              </span> : null}
            </button>
          );
        })}
        </div>
        {!zichtbaar.length ? <p className='aiz-leeg'>{tr(lang, 'Нічого не знайдено. Змініть пошук чи фільтри — або додайте агента нижче.', 'Niets gevonden. Pas de zoekopdracht of filters aan — of voeg hieronder een agent toe.')}</p> : null}
        {!alleenLezen ? <button type='button' className='aiz-kaart aiz-nieuw-kaart' aria-expanded={nieuwOpen} onClick={() => setNieuwOpen((v) => !v)} data-aiz-nieuw><Plus aria-hidden='true' /><strong>{tr(lang, 'Додати агента', 'Agent toevoegen')}</strong><small>{tr(lang, 'Claude, ChatGPT, Gemini, Grok… або власного', 'Claude, ChatGPT, Gemini, Grok… of een eigen')}</small></button> : null}
      </div>

      {nieuwOpen && !alleenLezen ? (
        <div className='aiz-toevoegen' role='region' aria-label={tr(lang, 'Додати агента', 'Agent toevoegen')}>
          <h3>{tr(lang, 'Швидко додати', 'Snel toevoegen')}</h3>
          <div className='aiz-presets'>
            {presets.map((p) => <button key={p.id} type='button' className='aiz-preset' onClick={() => { setNieuwNaam(p.naam); setNieuwId(p.id); }} aria-pressed={nieuwId === p.id}><Avatar naam={p.naam} id={p.id} /><span><strong>{p.naam}</strong><small>{tr(lang, p.uk, p.nl)}</small></span></button>)}
          </div>
          <h3>{tr(lang, 'Або власний агент', 'Of een eigen agent')}</h3>
          <div className='aiz-formrij'>
            <label>{tr(lang, 'Назва', 'Naam')}<input value={nieuwNaam} maxLength={80} onChange={(e) => { setNieuwNaam(e.target.value); setNieuwId(''); }} placeholder='Claude' data-aiz-nieuw-naam /></label>
            <label>{tr(lang, 'Ідентифікатор', 'Id')}<input value={nieuwIdWaarde} maxLength={64} onChange={(e) => setNieuwId(e.target.value)} placeholder='claude' /></label>
            <fieldset className='aiz-doel'><legend>{tr(lang, 'Початковий режим', 'Beginmodus')} <HulpVraag k='aib.nieuw-modus' lang={lang} /></legend>
              <label><input data-hulp='aib.nieuw-modus' type='radio' name='aiz-modus' checked={nieuwModus === 'ask'} onChange={() => setNieuwModus('ask')} />{tr(lang, 'Питати щоразу (рекомендовано)', 'Elke keer vragen (aanbevolen)')}</label>
              <label><input data-hulp='aib.nieuw-modus' type='radio' name='aiz-modus' checked={nieuwModus === 'off'} onChange={() => setNieuwModus('off')} />{tr(lang, 'Усе вимкнено', 'Alles uit')}</label>
            </fieldset>
          </div>
          <p className='aiz-uitleg'>{tr(lang, 'Ідентифікатор для підключень у конекторі v2 збігається з адресою /<агент> (claude, gpt, grok, gemini, copilot, cursor) — тоді сервер впізнає агента напевно, незалежно від назви клієнта.', 'Bij connector v2 hoort het id bij het adres /<agent> (claude, gpt, grok, gemini, copilot, cursor) — dan herkent de server de agent altijd, ongeacht de clientnaam.')}</p>
          {nieuwFout ? <p className='aib-fout' role='alert'>{nieuwFout}</p> : null}
          <div className='aib-knoppen'>
            <button type='button' onClick={() => setNieuwOpen(false)}><X aria-hidden='true' />{tr(lang, 'Закрити', 'Sluiten')}</button>
            <button type='button' className='aib-hoofd' disabled={!nieuwNaam.trim() || !!nieuwFout || !nieuwIdWaarde} onClick={() => voegToe(nieuwIdWaarde, nieuwNaam.trim(), nieuwModus)}><Plus aria-hidden='true' />{tr(lang, 'Додати до черги на підпис', 'Toevoegen aan de wachtrij')}</button>
          </div>
        </div>
      ) : null}

      {/* ---- detail van de gekozen agent */}
      <div ref={paneel}>
      {geselecteerd && mijnCijfers ? (
        <div className='aib-agentpaneel aiz-detail' id='aib-agentpaneel' role='tabpanel' aria-labelledby={`aib-tab-${agent}`}>
          <div className='aib-agentkop aiz-detail-kop'>
            <Avatar naam={geselecteerd.name} id={agent} groot />
            <div className='aiz-detail-titel'><strong>{geselecteerd.name}</strong> <code>{agent}</code>
              <small>{tr(lang, 'типово', 'standaard')}: {modusTekst(lang, geselecteerd.defaultMode)} · {tr(lang, `дозволено ${mijnCijfers.allow}, питати ${mijnCijfers.ask}, вимкнено ${mijnCijfers.deny}`, `toegestaan ${mijnCijfers.allow}, vragen ${mijnCijfers.ask}, uit ${mijnCijfers.deny}`)}</small>
              {verbindingenVan(agent).length ? <small>{verbindingenVan(agent).map(verbindingenTekst).join(' · ')}</small> : null}
              {agentSlugVan(agent) ? <small><a className='aiz-link' href={hubAgent(agentSlugVan(agent)!)} data-aiz-naar-agent={agentSlugVan(agent)!}>{tr(lang, 'Підключення, дозволи й журнал цього ШІ — на його сторінці в хабі', 'Koppeling, rechten en logboek van deze AI staan op zijn plek in de hub')}<ExternalLink aria-hidden='true' /></a></small> : null}</div>
            {!alleenLezen ? <div className='aib-knoppen'>
              <button type='button' onClick={() => zetInRij({ op: 'agent_enable', agent, enabled: !geselecteerd.enabled }, `${geselecteerd.enabled ? 'Вимкнути' : 'Увімкнути'} «${geselecteerd.name}» повністю`, `«${geselecteerd.name}» volledig ${geselecteerd.enabled ? 'uitzetten' : 'aanzetten'}`)}><Power aria-hidden='true' />{geselecteerd.enabled ? tr(lang, 'Вимкнути агента повністю', 'Agent volledig uitzetten') : tr(lang, 'Увімкнути агента', 'Agent aanzetten')}</button>
              <button type='button' onClick={() => setOpen(open === '__standaard' ? '' : '__standaard')} aria-expanded={open === '__standaard'} aria-haspopup='dialog'>{tr(lang, 'Змінити «типово»', 'Standaard wijzigen')}</button>
            </div> : null}
          </div>
          {open === '__standaard' ? <Keuze lang={lang} tz={tz} nu={nu} onSluit={() => setOpen('')} onKies={(spec) => zetInRij({ op: 'default', agent, spec }, `«${geselecteerd.name}» · типово: ${specTekst('uk', spec, tz, nu)}`, `«${geselecteerd.name}» · standaard: ${specTekst('nl', spec, tz, nu)}`)} /> : null}
          {!alleenLezen ? <div className='aiz-agent-snel'>
            <span>{tr(lang, 'Усе для цього агента:', 'Alles voor deze agent:')}</span>
            <SnelKeuze lang={lang} label={tr(lang, 'Усі можливості агента', 'Alle mogelijkheden van de agent')} onKies={(s) => zetGrant([agent], (data.mogelijkheden ?? []).filter((m) => m.id !== 'policy.change').map((m) => m.id), s, 'усі можливості', 'alle mogelijkheden')} />
          </div> : null}
          {groepen.length === 0 ? <p className='aiz-leeg'>{tr(lang, 'У цього агента немає можливостей, що відповідають пошуку.', 'Deze agent heeft geen mogelijkheden die bij de zoekopdracht passen.')}</p> : null}
          {groepen.map((g) => {
            const Icoon = GROEP_ICOON[g] ?? Info;
            const gc = mijnCijfers.groepen.get(g)!;
            const isOpen = groepOpen(g);
            const rijenG = mijnRijen.filter((r) => r.group === g && toonRij(r));
            const nieuwInGroep = rijenG.some((r) => isNieuw(r.capability));
            const gKies = (s: GrantSpec) => zetGrant([agent], capsVan(g), s, g, groepNl(g));
            return (
              <section key={g} className={`aib-groep aiz-groep is-${standVan(gc, geselecteerd.enabled)}`} data-groep={g}>
                <div className='aiz-groep-kop'>
                  <h3 className='aiz-groep-titel'><button type='button' className='aiz-groep-toggle' aria-expanded={isOpen} onClick={() => zetGroepOpen(g, !isOpen)}>
                    <Icoon aria-hidden='true' /><span className='aiz-groep-naam'>{groepNaam(g)}</span>{nieuwInGroep ? <span className='aib-nieuw' data-nieuw-groep={g}>{tr(lang, 'Нове', 'Nieuw')}</span> : null}
                    <span className='aiz-groep-telling'>{tr(lang, `${gc.allow} дозволено · ${gc.ask} питати · ${gc.deny} вимкнено`, `${gc.allow} toegestaan · ${gc.ask} vragen · ${gc.deny} uit`)}</span>
                  </button></h3>
                  {!alleenLezen ? <div className='aiz-groep-acties'>
                    <SnelKeuze lang={lang} label={tr(lang, `Уся група «${groepNaam(g)}»`, `Hele groep «${groepNaam(g)}»`)} onKies={gKies} />
                    <button type='button' className='aib-klein' aria-haspopup='dialog' aria-expanded={open === `grp:${g}`} onClick={() => setOpen(open === `grp:${g}` ? '' : `grp:${g}`)}><Timer aria-hidden='true' />{tr(lang, 'Таймер…', 'Timer…')}</button>
                  </div> : null}
                </div>
                {open === `grp:${g}` ? <Keuze lang={lang} tz={tz} nu={nu} onSluit={() => setOpen('')} onKies={gKies} /> : null}
                {isOpen ? <>
                  {g === 'Розгортання' ? (
                    <div className='aiz-controle' data-aiz-uitrol-controle>
                      <strong><Rocket aria-hidden='true' />{tr(lang, 'Чому цей агент може (або не може) розгортати?', 'Waarom kan (of kan niet) deze agent uitrollen?')}</strong>
                      <ul>{uitrolControle(agent).map((it, i) => <li key={i} className={`is-${it.s}`}>{it.s === 'ok' ? <Check aria-hidden='true' /> : it.s === 'bad' ? <X aria-hidden='true' /> : <Info aria-hidden='true' />}<span>{it.t}</span></li>)}</ul>
                      <a className='aiz-link' href='https://admin.tarasevych.com/updates' target='_blank' rel='noreferrer'>{tr(lang, 'Оновлення → Налаштування → Хто готує оновлення', 'Updates → Instellingen → Wie bereidt updates voor')}<ExternalLink aria-hidden='true' /></a>
                    </div>
                  ) : null}
                  <ul className='aib-rijen'>
                    {rijenG.map((r) => {
                      const inRij = wachtrij.filter((w) => w.op.op === 'grant' && (w.op.agent === agent || w.op.agent === '*') && Array.isArray(w.op.capabilities) && w.op.capabilities.includes(r.capability));
                      const info = capInfo.get(r.capability);
                      const risico = info?.risk ? RISICO[info.risk] : undefined;
                      return (
                        <li key={r.capability} className='aib-rij aiz-rij' data-cap={r.capability} data-effect={r.effect}>
                          <div className='aib-rij-kop'>
                            <div><strong>{r.label}</strong>{isNieuw(r.capability) ? <span className='aib-nieuw'>{tr(lang, 'Нове', 'Nieuw')}</span> : null}{risico ? <span className={`aiz-risico ${risico[2]}`}>{tr(lang, risico[0], risico[1])}</span> : null}{r.inherited ? <small className='aib-geerfd'>{tr(lang, ' · як типово', ' · zoals standaard')}</small> : null}
                              {info?.hint ? <small className='aiz-hint'>{info.hint}</small> : null}
                              {info?.tools.length ? <small className='aib-tools' data-tools={r.capability}>{tr(lang, 'Інструменти: ', 'Hulpmiddelen: ')}{info.tools.map((n) => <span key={n} title={n}>{toolNaam(n)}</span>)}</small> : null}</div>
                            <span className={`aib-status is-${r.effect}`}>{r.effect === 'allow' ? <><Check aria-hidden='true' />{tr(lang, 'Дозволено', 'Toegestaan')}</> : r.effect === 'ask' ? <><Fingerprint aria-hidden='true' />{tr(lang, 'Питати щоразу', 'Elke keer vragen')}</> : <><X aria-hidden='true' />{tr(lang, 'Вимкнено', 'Uit')}</>}</span>
                            {!alleenLezen ? <span className='aiz-rij-acties'>
                              <SnelKeuze lang={lang} huidig={r.mode.kind === 'timed' ? undefined : r.mode.kind} label={r.label} onKies={(s) => kiesVoor(r.capability, r.label, s)} />
                              <button type='button' className='aib-klein' aria-haspopup='dialog' aria-expanded={open === r.capability} onClick={() => setOpen(open === r.capability ? '' : r.capability)}><Timer aria-hidden='true' />{tr(lang, 'Змінити', 'Wijzigen')}</button>
                            </span> : null}
                          </div>
                          <TimerRij lang={lang} rij={r} nu={nu} tz={tz} />
                          {inRij.length ? <p className='aib-inrij'>{tr(lang, 'У черзі на підпис: ', 'In de wachtrij om te tekenen: ')}{tr(lang, inRij[inRij.length - 1].uk, inRij[inRij.length - 1].nl).split(': ').slice(1).join(': ')}</p> : null}
                          {open === r.capability ? <Keuze lang={lang} tz={tz} nu={nu} onSluit={() => setOpen('')} onKies={(spec) => kiesVoor(r.capability, r.label, spec)} /> : null}
                        </li>
                      );
                    })}
                  </ul>
                </> : null}
              </section>
            );
          })}
          {!alleenLezen ? <div className='aiz-gevaar'>
            {verwijder === agent
              ? <><span>{tr(lang, `Видалити «${geselecteerd.name}» зі списку? Його підключення знову стануть «без запису» й будуть заборонені.`, `«${geselecteerd.name}» uit de lijst halen? Zijn verbindingen vallen dan weer onder «zonder plaats» en worden geweigerd.`)}</span>
                <button type='button' className='aib-klein' onClick={() => setVerwijder('')}>{tr(lang, 'Ні', 'Nee')}</button>
                <button type='button' className='aib-klein aiz-rood' onClick={() => zetInRij({ op: 'agent_remove', agent }, `Видалити агента «${geselecteerd.name}»`, `Agent «${geselecteerd.name}» verwijderen`)}><Trash2 aria-hidden='true' />{tr(lang, 'Так, додати до черги', 'Ja, in de wachtrij')}</button></>
              : <button type='button' className='aiz-link aiz-rood' onClick={() => setVerwijder(agent)}><Trash2 aria-hidden='true' />{tr(lang, 'Видалити агента зі списку…', 'Agent uit de lijst halen…')}</button>}
          </div> : null}
        </div>
      ) : null}
      </div>

      {alleenLezen ? <p className='aib-link'><a href='https://admin.tarasevych.com/ai'>{tr(lang, 'Змінити в Адмініструванні → Доступ ШІ', 'Wijzigen in Beheer → AI-toegang')}<ExternalLink aria-hidden='true' /></a></p> : null}

      {wachtrij.length && !alleenLezen ? (
        <div className='aib-wachtrij aiz-wachtrij' role='region' aria-label={tr(lang, 'Зміни в черзі', 'Wijzigingen in de wachtrij')}>
          <span>{tr(lang, `${wachtrij.length} змін(и) чекають підпису — ще нічого не діє`, `${wachtrij.length} wijziging(en) wachten op uw handtekening — er geldt nog niets`)}</span>
          <details className='aiz-wachtlijst'><summary>{tr(lang, 'Показати, що саме', 'Toon wat precies')}</summary>
            <ul>{wachtrij.map((w) => <li key={w.id}>{tr(lang, w.uk, w.nl)}</li>)}</ul></details>
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
            <ul className='aib-diff'>{diffPolicy(b, venster.ontwerp, nu, tz).map((l, i) => <li key={i}><strong>{l.text}</strong>{l.kind === 'key' ? null : <span className='aib-van-naar'><span>{l.from}</span><span aria-hidden='true'> → </span><span className='sr-only'>{tr(lang, ' стане ', ' wordt ')}</span><span>{l.to}</span></span>}</li>)}</ul>
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
