// Toestemmingen (grants) per apparaat of browser: presets Спостерігач / Помічник / Разово, losse toestemmingen met duur en
// domeinen, 'altijd' (alleen na step-up, met vervaldatum, max. 90 dagen) en per regel een stopknop. Plus de noodstop 'Стоп'.
// Teksten alleen in het Oekraïens en Nederlands. De server beslist; deze pagina toont en vraagt alleen.
import { useCallback, useEffect, useState } from 'react';
import { Ban, Clock, Infinity as AlwaysIcon, OctagonX, ShieldCheck, Square } from 'lucide-react';
import { api } from './platform/client';
import { ecosystemTabContext } from './tab-context';
import { IconButton, type Tr } from './mcp-ui';

type Capability = 'browser.read' | 'browser.navigate' | 'browser.interact' | 'browser.screenshot' | 'browser.debug' | 'machine.read' | 'machine.write' | 'machine.exec' | 'machine.docker';
type Grant = { id: string; agentId: string; capability: Capability; domains: string[]; always: boolean; preset: string | null; grantedAt: number; expiresAt: number; revokedAt: number | null };
type Preset = { uk: string; nl: string; minutes: number; browser: Capability[]; machine: Capability[] };
type ListResponse = { settings: { blocked: boolean; epoch: number }; grants: Grant[]; catalog: { destructive: Capability[]; presets: Record<string, Preset>; limits: { maxDays: number; alwaysDefaultDays: number } } };

const body = () => ({ service: 'mcp', tabContext: ecosystemTabContext(), sourceOrigin: location.origin });
export const CAP_TEXT: Record<Capability, [string, string, string, string]> = {
  'browser.read': ['Читати сторінки', 'Pagina\'s lezen', 'текст, вкладки, консоль і мережа (без вмісту запитів)', 'tekst, tabbladen, console en netwerk (zonder inhoud van verzoeken)'],
  'browser.navigate': ['Відкривати сторінки', 'Pagina\'s openen', 'лише на сайтах tarasevych.com', 'alleen op tarasevych.com'],
  'browser.interact': ['Натискати й вводити', 'Klikken en typen', 'кнопки, поля, форми — щоразу з вашим підтвердженням, якщо не «завжди»', 'knoppen, velden, formulieren — telkens met uw akkoord, tenzij "altijd"'],
  'browser.screenshot': ['Знімки екрана', 'Schermafbeeldingen', 'бачить усе, що видно на вкладці', 'ziet alles wat zichtbaar is op het tabblad'],
  'browser.debug': ['Глибока діагностика', 'Diepe diagnose', 'debugger браузера; лише якщо в розширенні ввімкнено «діагностику»', 'browserdebugger; alleen als "diagnose" in de extensie aan staat'],
  'machine.read': ['Читати файли й стан', 'Bestanden en status lezen', 'список і вміст файлів, процеси, метрики', 'lijst en inhoud van bestanden, processen, metrieken'],
  'machine.write': ['Записувати файли', 'Bestanden schrijven', 'змінює файли на пристрої', 'wijzigt bestanden op het apparaat'],
  'machine.exec': ['Запускати програми', 'Programma\'s starten', 'лише дозволені агентом програми, без оболонки й без -e/-c', 'alleen door de agent toegestane programma\'s, zonder shell en zonder -e/-c'],
  'machine.docker': ['Керувати Docker', 'Docker beheren', 'запуск і зупинка контейнерів', 'containers starten en stoppen'],
};
const DURATIONS: Array<[number, string, string]> = [[60, '1 година', '1 uur'], [1440, '1 день', '1 dag'], [10080, '7 днів', '7 dagen'], [43200, '30 днів', '30 dagen'], [129600, '90 днів', '90 dagen']];
const when = (ms: number) => new Intl.DateTimeFormat(undefined, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }).format(new Date(ms));
const errText = (tr: Tr, e: unknown) => {
  const code = String((e as { response?: { data?: { error?: string } } })?.response?.data?.error || (e as Error)?.message || '');
  if (code.includes('STEP_UP')) return tr('Потрібне повторне підтвердження входу. Спробуйте ще раз.', 'Een nieuwe bevestiging van de aanmelding is nodig. Probeer opnieuw.');
  if (code.includes('USER_BLOCKED')) return tr('Доступ ШІ заблоковано.', 'AI-toegang is geblokkeerd.');
  if (code.includes('CAPABILITY_OFF')) return tr('Цю можливість вимкнено у ваших загальних налаштуваннях ШІ.', 'Deze mogelijkheid staat uit in uw algemene AI-instellingen.');
  return tr(`Не вдалося (${code || 'помилка'}).`, `Mislukt (${code || 'fout'}).`);
};

/** Noodstop: alle toestemmingen weg, wachtende opdrachten afgewezen, browsers los (debugger los, buffers leeg). Geen step-up. */
export function AiStopKnop({ tr, onDone }: { tr: Tr; onDone?: () => void }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  return (
    <span className='ai-stop'>
      <IconButton tone='danger' icon={<OctagonX />} disabled={busy} title={tr('Негайно забрати всі дозволи ШІ й зупинити всі дії', 'Meteen alle AI-toestemmingen intrekken en alle acties stoppen')}
        onClick={() => { setBusy(true); setNote(''); void api.post('/api/owner/ai/stop', body()).then((r) => { const n = Number(r.data?.grants ?? 0), c = Number(r.data?.commands ?? 0); setNote(tr(`Зупинено. Забрано дозволів: ${n}, скасовано дій: ${c}.`, `Gestopt. Ingetrokken toestemmingen: ${n}, geannuleerde acties: ${c}.`)); onDone?.(); }).catch((e) => setNote(errText(tr, e))).finally(() => setBusy(false)); }}>
        {tr('Стоп', 'Stop')}
      </IconButton>
      {note ? <small className='hub-meta' role='status'> {note}</small> : null}
    </span>
  );
}

export default function AiToestemmingen({ tr, agentId, platform, onChange }: { tr: Tr; agentId: string; platform: 'browser' | 'machine'; onChange?: (activeGrants: number, blocked: boolean) => void }) {
  const [data, setData] = useState<ListResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const caps = (Object.keys(CAP_TEXT) as Capability[]).filter((c) => c.startsWith(platform === 'browser' ? 'browser.' : 'machine.'));
  const [cap, setCap] = useState<Capability>(caps[0]);
  const [minutes, setMinutes] = useState(1440);
  const [domains, setDomains] = useState('');
  const [always, setAlways] = useState(false);

  const load = useCallback(async () => {
    const res = await api.post('/api/owner/ai/grants/list', body());
    const d = res.data as ListResponse;
    setData(d);
    onChange?.(d.grants.filter((g) => g.agentId === agentId && !g.revokedAt && g.expiresAt > Date.now()).length, !!d.settings.blocked);
  }, [agentId, onChange]);
  useEffect(() => { void load().catch(() => setNote(tr('Не вдалося завантажити дозволи.', 'Toestemmingen laden mislukt.'))); }, [load, tr]);

  const act = async (job: () => Promise<unknown>, ok: string) => {
    setBusy(true); setNote('');
    try { await job(); setNote(ok); await load(); } catch (e) { setNote(errText(tr, e)); }
    setBusy(false);
  };
  if (!data) return <p className='hub-meta'>{note || tr('Завантаження дозволів…', 'Toestemmingen laden…')}</p>;
  const destructive = new Set(data.catalog.destructive);
  const mine = data.grants.filter((g) => g.agentId === agentId && !g.revokedAt && g.expiresAt > Date.now());
  const maxDays = data.catalog.limits.maxDays;
  const domainList = domains.split(/[\s,]+/).map((d) => d.trim().toLowerCase()).filter(Boolean);

  return (
    <div className='ai-grants' data-ai-grants={agentId}>
      {data.settings.blocked ? <p className='hub-note' role='alert'><Ban size={14} /> {tr('Доступ ШІ для вашого облікового запису заблоковано. Дозволи не діють.', 'AI-toegang voor uw account is geblokkeerd. Toestemmingen werken niet.')}</p> : null}

      <h3>{tr('Готові набори', 'Kant-en-klare sets')}</h3>
      <div className='hub-actions'>
        {Object.entries(data.catalog.presets).map(([id, p]) => {
          const list = platform === 'browser' ? p.browser : p.machine;
          const risky = list.some((c) => destructive.has(c));
          return (
            <IconButton key={id} icon={id === 'spostericach' ? <ShieldCheck /> : <Clock />} disabled={busy || data.settings.blocked}
              title={`${list.map((c) => tr(CAP_TEXT[c][0], CAP_TEXT[c][1])).join(', ')} · ${DURATIONS.find((d) => d[0] === p.minutes)?.[1] ?? `${p.minutes} хв`}`}
              onClick={() => void act(() => api.post('/api/owner/ai/grants/preset', { ...body(), agentId, preset: id }), tr(`Набір «${p.uk}» застосовано.`, `Set "${p.nl}" toegepast.`))}>
              {tr(p.uk, p.nl)}{risky ? ' *' : ''}
            </IconButton>
          );
        })}
      </div>
      <p className='hub-meta'>{tr('Спостерігач: лише читання, 30 днів. Помічник: ще відкривати й натискати (кожна дія з підтвердженням), 7 днів. Разово: майже все на 1 годину. * — потрібне повторне підтвердження входу.', 'Waarnemer: alleen lezen, 30 dagen. Helper: ook openen en klikken (elke actie met akkoord), 7 dagen. Eenmalig: bijna alles voor 1 uur. * — vraagt een nieuwe bevestiging van de aanmelding.')}</p>

      <h3>{tr('Діючі дозволи', 'Geldige toestemmingen')} ({mine.length})</h3>
      {mine.length ? (
        <ul className='ai-grant-list'>
          {mine.map((g) => (
            <li key={g.id} data-grant={g.capability}>
              <span><b>{tr(CAP_TEXT[g.capability][0], CAP_TEXT[g.capability][1])}</b>{g.always ? <span className='hub-pill warn'><AlwaysIcon size={12} /> {tr('завжди', 'altijd')}</span> : null}
                <small> {tr('до', 'tot')} {when(g.expiresAt)}{g.domains.length ? ` · ${g.domains.join(', ')}` : ''}{destructive.has(g.capability) && !g.always ? ` · ${tr('кожна дія з підтвердженням', 'elke actie met akkoord')}` : ''}</small></span>
              <IconButton tone='danger' icon={<Square />} disabled={busy} onClick={() => void act(() => api.post('/api/owner/ai/grants/revoke', { ...body(), grantId: g.id }), tr('Дозвіл забрано.', 'Toestemming ingetrokken.'))}>{tr('Зупинити', 'Stoppen')}</IconButton>
            </li>
          ))}
        </ul>
      ) : <p className='hub-meta'>{tr('Немає дозволів: ШІ нічого не може робити на цьому пристрої.', 'Geen toestemmingen: de AI kan niets op dit apparaat.')}</p>}
      {mine.length ? <IconButton tone='danger' icon={<Ban />} disabled={busy} onClick={() => void act(() => api.post('/api/owner/ai/grants/revoke', { ...body(), agentId }), tr('Усі дозволи цього пристрою забрано.', 'Alle toestemmingen van dit apparaat ingetrokken.'))}>{tr('Забрати всі дозволи цього пристрою', 'Alle toestemmingen van dit apparaat intrekken')}</IconButton> : null}

      <h3>{tr('Окремий дозвіл', 'Losse toestemming')}</h3>
      <form className='ai-grant-form' onSubmit={(e) => { e.preventDefault(); void act(() => api.post('/api/owner/ai/grants/add', { ...body(), agentId, capability: cap, minutes: always && minutes > maxDays * 1440 ? maxDays * 1440 : minutes, always, ...(platform === 'browser' && domainList.length ? { domains: domainList } : {}) }), tr('Дозвіл додано.', 'Toestemming toegevoegd.')); }}>
        <label>{tr('Що', 'Wat')}
          <select value={cap} onChange={(e) => setCap(e.target.value as Capability)} disabled={busy}>
            {caps.map((c) => <option key={c} value={c}>{tr(CAP_TEXT[c][0], CAP_TEXT[c][1])}</option>)}
          </select>
        </label>
        <small className='hub-meta'>{tr(CAP_TEXT[cap][2], CAP_TEXT[cap][3])}</small>
        <label>{tr('Скільки', 'Hoe lang')}
          <select value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} disabled={busy}>
            {DURATIONS.filter((d) => d[0] <= maxDays * 1440).map(([m, uk, nl]) => <option key={m} value={m}>{tr(uk, nl)}</option>)}
          </select>
        </label>
        {platform === 'browser' ? (
          <label>{tr('Лише ці адреси (необов’язково)', 'Alleen deze adressen (optioneel)')}
            <input value={domains} onChange={(e) => setDomains(e.target.value)} placeholder='mail.tarasevych.com, cloud.tarasevych.com' disabled={busy} />
          </label>
        ) : null}
        {destructive.has(cap) ? (
          <label className='ai-always'>
            <input type='checkbox' checked={always} onChange={(e) => setAlways(e.target.checked)} disabled={busy} />
            {tr(`Завжди, без підтвердження кожної дії (максимум ${maxDays} днів; потрібне повторне підтвердження входу; записується в журнал)`, `Altijd, zonder akkoord per actie (maximaal ${maxDays} dagen; vraagt een nieuwe bevestiging van de aanmelding; komt in het logboek)`)}
          </label>
        ) : null}
        <IconButton type='submit' icon={<ShieldCheck />} disabled={busy || data.settings.blocked}>{tr('Дозволити', 'Toestaan')}</IconButton>
      </form>
      {note ? <p className='hub-note' role='status'>{note}</p> : null}
    </div>
  );
}
