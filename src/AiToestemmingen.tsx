// Toestemmingen (grants) per apparaat of browser: presets Спостерігач / Помічник / Разово, losse toestemmingen met duur en
// domeinen, 'altijd' (alleen na step-up, met vervaldatum, max. 90 dagen) en per regel een stopknop. Plus de noodstop 'Стоп'.
// Teksten alleen in het Oekraïens en Nederlands. De server beslist; deze pagina toont en vraagt alleen.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Ban, Clock, Eye, Infinity as AlwaysIcon, Loader2, OctagonX, ShieldCheck, Square } from 'lucide-react';
import { api } from './platform/client';
import { ecosystemTabContext } from './tab-context';
import { Help, IconButton, type Tr } from './mcp-ui';
import { foutTekst } from './agenten/fouten';

type Capability = 'browser.read' | 'browser.navigate' | 'browser.interact' | 'browser.screenshot' | 'browser.console' | 'browser.debug' | 'browser.script' | 'machine.read' | 'machine.write' | 'machine.exec' | 'machine.docker';
type Grant = { id: string; agentId: string; capability: Capability; domains: string[]; always: boolean; preset: string | null; grantedAt: number; expiresAt: number; revokedAt: number | null };
type Preset = { uk: string; nl: string; minutes: number; browser: Capability[]; machine: Capability[] };
type ListResponse = { settings: { blocked: boolean; epoch: number }; grants: Grant[]; catalog: { destructive: Capability[]; presets: Record<string, Preset>; limits: { maxDays: number; alwaysDefaultDays: number } } };

const body = () => ({ service: 'mcp', tabContext: ecosystemTabContext(), sourceOrigin: location.origin });
export const CAP_TEXT: Record<Capability, [string, string, string, string]> = {
  'browser.read': ['Читати сторінки', 'Pagina\'s lezen', 'текст, вкладки, консоль і мережа (без вмісту запитів)', 'tekst, tabbladen, console en netwerk (zonder inhoud van verzoeken)'],
  'browser.navigate': ['Відкривати сторінки', 'Pagina\'s openen', 'лише на сайтах tarasevych.com', 'alleen op tarasevych.com'],
  'browser.interact': ['Натискати й вводити', 'Klikken en typen', 'кнопки, поля, форми — щоразу з вашим підтвердженням, якщо не «завжди»', 'knoppen, velden, formulieren — telkens met uw akkoord, tenzij "altijd"'],
  'browser.screenshot': ['Знімки екрана', 'Schermafbeeldingen', 'бачить усе, що видно на вкладці', 'ziet alles wat zichtbaar is op het tabblad'],
  'browser.console': ['Консоль і мережа', 'Console en netwerk', 'повідомлення консолі та список запитів вкладки (без вмісту)', 'consoleberichten en de lijst verzoeken van het tabblad (zonder inhoud)'],
  'browser.debug': ['Глибока діагностика', 'Diepe diagnose', 'debugger браузера; лише якщо в розширенні ввімкнено «діагностику»', 'browserdebugger; alleen als "diagnose" in de extensie aan staat'],
  'browser.script': ['Скрипти', 'Scripts', 'виконання JavaScript у технічній вкладці (evaluate_script); лише технічний слот і пакет «діагностика»', 'JavaScript uitvoeren in het technische tabblad (evaluate_script); alleen technisch slot en pakket «diagnose»'],
  'machine.read': ['Читати файли й стан', 'Bestanden en status lezen', 'список і вміст файлів, процеси, метрики', 'lijst en inhoud van bestanden, processen, metrieken'],
  'machine.write': ['Записувати файли', 'Bestanden schrijven', 'змінює файли на пристрої', 'wijzigt bestanden op het apparaat'],
  'machine.exec': ['Запускати програми', 'Programma\'s starten', 'лише дозволені агентом програми, без оболонки й без -e/-c', 'alleen door de agent toegestane programma\'s, zonder shell en zonder -e/-c'],
  'machine.docker': ['Керувати Docker', 'Docker beheren', 'запуск і зупинка контейнерів', 'containers starten en stoppen'],
};
const DURATIONS: Array<[number, string, string]> = [[60, '1 година', '1 uur'], [1440, '1 день', '1 dag'], [10080, '7 днів', '7 dagen'], [43200, '30 днів', '30 dagen'], [129600, '90 днів', '90 dagen']];
const when = (ms: number) => new Intl.DateTimeFormat(undefined, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }).format(new Date(ms));
const errText = (tr: Tr, e: unknown, wat?: [string, string]) => foutTekst(e, tr, wat);

/** Noodstop: alle toestemmingen weg, wachtende opdrachten afgewezen, browsers los (debugger los, buffers leeg). Geen step-up, wel een
 * bevestiging op de pagina (één extra klik), daarna een duidelijke uitkomst met wat er veranderde. */
export function AiStopKnop({ tr, onDone }: { tr: Tr; onDone?: () => void }) {
  const [busy, setBusy] = useState(false);
  const [vraag, setVraag] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const stop = () => {
    setVraag(false); setBusy(true); setNote(null);
    void api.post('/api/owner/ai/stop', body())
      .then((r) => {
        const n = Number(r.data?.grants ?? 0), c = Number(r.data?.commands ?? 0), k = Number(r.data?.connectors ?? 0), t = Number(r.data?.tokens ?? 0);
        // D-01: ook de connectorverbindingen (Claude/ChatGPT…) zijn ingetrokken — dat moet de gebruiker weten, want die moeten opnieuw verbonden worden.
        setNote({ ok: true, text: tr(
          `Зупинено. Забрано дозволів: ${n}, скасовано дій: ${c}, відкликано підключень ШІ: ${k}, токенів: ${t}; браузери вимкнено. Підключення ШІ (Claude, ChatGPT…) доведеться під’єднати заново.`,
          `Gestopt. Ingetrokken toestemmingen: ${n}, geannuleerde acties: ${c}, ingetrokken AI-verbindingen: ${k}, tokens: ${t}; browsers uitgezet. AI-verbindingen (Claude, ChatGPT…) moeten opnieuw verbonden worden.`) });
        onDone?.();
      })
      .catch((e) => setNote({ ok: false, text: errText(tr, e, ['Не вдалося зупинити', 'Stoppen mislukt']) }))
      .finally(() => setBusy(false));
  };
  return (
    <span className='ai-stop' data-ai-stop={vraag ? 'vraag' : busy ? 'bezig' : 'rust'}>
      {vraag ? (
        <span className='ag-bevestig is-klein' role='group' aria-label={tr('Підтвердження зупинки', 'Bevestig stoppen')}>
          <span className='ag-bevestig-vraag'>{tr('Забрати всі дозволи ШІ, скасувати всі дії й відкликати всі підключення ШІ (Claude, ChatGPT…)? Їх доведеться під’єднати заново.', 'Alle AI-toestemmingen intrekken, alle acties annuleren en alle AI-verbindingen (Claude, ChatGPT…) verbreken? Die moeten daarna opnieuw verbonden worden.')}</span>
          <IconButton tone='danger' icon={<OctagonX />} onClick={stop}>{tr('Так, зупинити все', 'Ja, alles stoppen')}</IconButton>
          <IconButton icon={<Square />} onClick={() => setVraag(false)}>{tr('Скасувати', 'Annuleren')}</IconButton>
        </span>
      ) : (
        <IconButton tone='danger' icon={busy ? <Loader2 className='ag-spin' /> : <OctagonX />} disabled={busy} title={tr('Негайно забрати всі дозволи ШІ й зупинити всі дії', 'Meteen alle AI-toestemmingen intrekken en alle acties stoppen')} onClick={() => setVraag(true)}>
          {tr('Стоп', 'Stop')}
        </IconButton>
      )}
      {note ? <small className={`ag-melding ag-melding-${note.ok ? 'ok' : 'fout'}`} role={note.ok ? 'status' : 'alert'}>{note.text}</small> : null}
    </span>
  );
}

export default function AiToestemmingen({ tr, agentId, platform, onChange, versie = 0 }: { tr: Tr; agentId: string; platform: 'browser' | 'machine'; onChange?: (activeGrants: number, blocked: boolean) => void; versie?: number }) {
  const [data, setData] = useState<ListResponse | null>(null);
  const [busy, setBusy] = useState<string>('');
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const caps = (Object.keys(CAP_TEXT) as Capability[]).filter((c) => c.startsWith(platform === 'browser' ? 'browser.' : 'machine.'));
  const [cap, setCap] = useState<Capability>(caps[0]);
  const [minutes, setMinutes] = useState(1440);
  const [domains, setDomains] = useState('');
  const [always, setAlways] = useState(false);
  // onChange via een ref: een nieuwe functie per render van de ouder mag NIET opnieuw laden. Dat gaf een eindeloze lus van
  // /api/owner/ai/grants/list (ouder zet state in onChange → nieuwe onChange → opnieuw laden …) en daarmee «RATE_LIMITED» (RUNBOOK §13.9).
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const load = useCallback(async () => {
    const res = await api.post('/api/owner/ai/grants/list', body());
    const d = res.data as ListResponse;
    setData(d);
    onChangeRef.current?.(d.grants.filter((g) => g.agentId === agentId && !g.revokedAt && g.expiresAt > Date.now()).length, !!d.settings.blocked);
  }, [agentId]);
  useEffect(() => { void load().catch((e) => setNote({ ok: false, text: errText(tr, e, ['Не вдалося завантажити дозволи', 'Toestemmingen laden mislukt']) })); }, [load, versie]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (key: string, job: () => Promise<unknown>, ok: () => string, wat: [string, string]) => {
    setBusy(key); setNote(null);
    try { await job(); await load(); setNote({ ok: true, text: ok() }); } catch (e) { setNote({ ok: false, text: errText(tr, e, wat) }); }
    setBusy('');
  };
  if (!data) return <p className='hub-meta'>{note?.text || tr('Завантаження дозволів…', 'Toestemmingen laden…')}</p>;
  const destructive = new Set(data.catalog.destructive);
  const mine = data.grants.filter((g) => g.agentId === agentId && !g.revokedAt && g.expiresAt > Date.now()).sort((a, b) => a.expiresAt - b.expiresAt);
  const maxDays = data.catalog.limits.maxDays;
  const domainList = domains.split(/[\s,]+/).map((d) => d.trim().toLowerCase()).filter(Boolean);
  const presets = Object.entries(data.catalog.presets);
  const huidig = mine.length && mine.every((g) => g.preset === mine[0].preset) && data.catalog.presets[mine[0].preset ?? ''] ? String(mine[0].preset) : '';
  const duur = (m: number) => { const d = DURATIONS.find((x) => x[0] === m); return d ? tr(d[1], d[2]) : tr(`${m} хв`, `${m} min`); };
  const capNaam = (c: Capability) => tr(CAP_TEXT[c][0], CAP_TEXT[c][1]);
  const geblokkeerd = data.settings.blocked;

  return (
    <div className='ai-grants' data-ai-grants={agentId}>
      {geblokkeerd ? <p className='hub-note is-warn' role='alert'><Ban size={14} /> {tr('Доступ ШІ для вашого облікового запису заблоковано. Дозволи не діють.', 'AI-toegang voor uw account is geblokkeerd. Toestemmingen werken niet.')}</p> : null}

      <div className='ai-blok'>
        <div className='ai-blok-kop'><h4>{tr('Набір дозволів', 'Set toestemmingen')}</h4><small className='hub-meta'>{tr('Застосування набору замінює чинні дозволи цього пристрою.', 'Een set toepassen vervangt de huidige toestemmingen van dit apparaat.')}</small></div>
        <div className='ag-segment ai-presets' role='radiogroup' aria-label={tr('Набір дозволів', 'Set toestemmingen')}>
          {presets.map(([id, p]) => {
            const list = platform === 'browser' ? p.browser : p.machine;
            const risky = list.some((c) => destructive.has(c));
            return (
              <span key={id} className='ag-segment-optie'>
                <button type='button' role='radio' aria-checked={huidig === id} disabled={!!busy || geblokkeerd} data-preset={id}
                  onClick={() => void act(`preset:${id}`, () => api.post('/api/owner/ai/grants/preset', { ...body(), agentId, preset: id }),
                    () => tr(`Набір «${p.uk}» застосовано: ${list.length} дозв. на ${duur(p.minutes)}; попередні дозволи цього пристрою замінено.`, `Set "${p.nl}" toegepast: ${list.length} toest. voor ${duur(p.minutes)}; eerdere toestemmingen van dit apparaat vervangen.`),
                    ['Не вдалося застосувати набір', 'Set toepassen mislukt'])}>
                  {busy === `preset:${id}` ? <Loader2 className='ag-spin' aria-hidden='true' /> : id === 'spostericach' ? <Eye aria-hidden='true' /> : id === 'razovo' ? <Clock aria-hidden='true' /> : <ShieldCheck aria-hidden='true' />}
                  <span>{tr(p.uk, p.nl)}</span>
                </button>
                <Help tr={tr} content={{ title: tr(p.uk, p.nl), what: list.map(capNaam).join(', '), touches: tr(`Лише цей пристрій · діє ${duur(p.minutes)}`, `Alleen dit apparaat · geldig ${duur(p.minutes)}`), risk: risky ? tr('Містить дії, що змінюють дані: кожна дія чекає вашого підтвердження; для застосування потрібне повторне підтвердження входу.', 'Bevat acties die gegevens wijzigen: elke actie wacht op uw akkoord; toepassen vraagt een nieuwe bevestiging van de aanmelding.') : undefined }} />
              </span>
            );
          })}
        </div>
      </div>

      <div className='ai-blok'>
        <div className='ai-blok-kop'>
          <h4>{tr('Чинні дозволи', 'Geldige toestemmingen')} <span className='ag-teller'>{mine.length}</span></h4>
          {mine.length ? <IconButton tone='danger' icon={busy === 'alles' ? <Loader2 className='ag-spin' /> : <Ban />} disabled={!!busy} onClick={() => void act('alles', () => api.post('/api/owner/ai/grants/revoke', { ...body(), agentId }), () => tr(`Забрано всі дозволи цього пристрою (${mine.length}). ШІ більше нічого не може тут робити.`, `Alle toestemmingen van dit apparaat ingetrokken (${mine.length}). De AI kan hier niets meer.`), ['Не вдалося забрати дозволи', 'Intrekken mislukt'])}>{tr('Зупинити всі', 'Alle stoppen')}</IconButton> : null}
        </div>
        {mine.length ? (
          <table className='ai-tabel' data-ai-tabel={agentId}>
            <thead><tr><th scope='col'>{tr('Що', 'Wat')}</th><th scope='col'>{tr('Межі', 'Grenzen')}</th><th scope='col'>{tr('До', 'Tot')}</th><th scope='col'><span className='sr-only'>{tr('Дія', 'Actie')}</span></th></tr></thead>
            <tbody>
              {mine.map((g) => (
                <tr key={g.id} data-grant={g.capability}>
                  <td><b>{capNaam(g.capability)}</b>{g.always ? <span className='ag-badge ag-warn'><AlwaysIcon size={12} aria-hidden='true' /> {tr('завжди', 'altijd')}</span> : null}</td>
                  <td className='hub-meta'>{g.domains.length ? g.domains.join(', ') : platform === 'browser' ? tr('сайти tarasevych.com', 'sites van tarasevych.com') : tr('дозволені теки й програми', 'toegestane mappen en programma\'s')}{destructive.has(g.capability) && !g.always ? ` · ${tr('кожна дія з підтвердженням', 'elke actie met akkoord')}` : ''}</td>
                  <td><time dateTime={new Date(g.expiresAt).toISOString()} title={when(g.expiresAt)}>{when(g.expiresAt)}</time></td>
                  <td className='ai-tabel-actie'><IconButton tone='danger' icon={busy === g.id ? <Loader2 className='ag-spin' /> : <Square />} disabled={!!busy} onClick={() => void act(g.id, () => api.post('/api/owner/ai/grants/revoke', { ...body(), grantId: g.id }), () => tr(`Дозвіл «${capNaam(g.capability)}» зупинено.`, `Toestemming "${capNaam(g.capability)}" gestopt.`), ['Не вдалося зупинити дозвіл', 'Stoppen mislukt'])}>{tr('Стоп', 'Stop')}</IconButton></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className='hub-meta'>{tr('Немає дозволів: ШІ нічого не може робити на цьому пристрої.', 'Geen toestemmingen: de AI kan niets op dit apparaat.')}</p>}
      </div>

      <div className='ai-blok'>
        <div className='ai-blok-kop'><h4>{tr('Окремий дозвіл', 'Losse toestemming')}</h4></div>
        <form className='ai-grant-form' onSubmit={(e) => { e.preventDefault(); void act('add', () => api.post('/api/owner/ai/grants/add', { ...body(), agentId, capability: cap, minutes: always && minutes > maxDays * 1440 ? maxDays * 1440 : minutes, always, ...(platform === 'browser' && domainList.length ? { domains: domainList } : {}) }), () => tr(`Дозвіл «${capNaam(cap)}» додано на ${duur(minutes)}.`, `Toestemming "${capNaam(cap)}" toegevoegd voor ${duur(minutes)}.`), ['Не вдалося додати дозвіл', 'Toevoegen mislukt']); }}>
          <label className='ai-veld'><span>{tr('Що', 'Wat')}</span>
            <select value={cap} onChange={(e) => setCap(e.target.value as Capability)} disabled={!!busy}>
              {caps.map((c) => <option key={c} value={c}>{capNaam(c)}</option>)}
            </select>
          </label>
          <label className='ai-veld'><span>{tr('Скільки', 'Hoe lang')}</span>
            <select value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} disabled={!!busy}>
              {DURATIONS.filter((d) => d[0] <= maxDays * 1440).map(([m, uk, nl]) => <option key={m} value={m}>{tr(uk, nl)}</option>)}
            </select>
          </label>
          {platform === 'browser' ? (
            <label className='ai-veld ai-veld-breed'><span>{tr('Лише ці адреси (необов’язково)', 'Alleen deze adressen (optioneel)')}</span>
              <input value={domains} onChange={(e) => setDomains(e.target.value)} placeholder='mail.tarasevych.com' disabled={!!busy} />
            </label>
          ) : null}
          <span className='ai-veld ai-veld-knop'><span aria-hidden='true'>&nbsp;</span><IconButton type='submit' tone='primary' icon={busy === 'add' ? <Loader2 className='ag-spin' /> : <ShieldCheck />} disabled={!!busy || geblokkeerd}>{tr('Дозволити', 'Toestaan')}</IconButton></span>
          <small className='hub-meta ai-veld-uitleg'>{tr(CAP_TEXT[cap][2], CAP_TEXT[cap][3])}</small>
          {destructive.has(cap) ? (
            <label className='ai-always'>
              <input type='checkbox' checked={always} onChange={(e) => setAlways(e.target.checked)} disabled={!!busy} />
              {tr(`Завжди, без підтвердження кожної дії (максимум ${maxDays} днів; потрібне повторне підтвердження входу; записується в журнал)`, `Altijd, zonder akkoord per actie (maximaal ${maxDays} dagen; vraagt een nieuwe bevestiging van de aanmelding; komt in het logboek)`)}
            </label>
          ) : null}
        </form>
      </div>
      {note ? <p className={`ag-melding ag-melding-${note.ok ? 'ok' : 'fout'}`} role={note.ok ? 'status' : 'alert'} data-ag-melding={note.ok ? 'ok' : 'fout'}>{note.text}</p> : null}
    </div>
  );
}
