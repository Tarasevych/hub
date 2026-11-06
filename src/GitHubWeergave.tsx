import { useCallback, useEffect, useMemo, useState } from 'react';
import IntegratieStrook from './integraties/IntegratieStrook'; // UI-013 fase 2: gedeelde verbindingenstrook (vlag integraties-catalogus-v2)
import { AlertTriangle, BookOpen, Check, CheckCircle2, CircleDot, Clock, Copy, ExternalLink, GitBranch, GitCommit, GitPullRequest, Github, KeyRound, Loader2, MessageSquarePlus, PlayCircle, Plug, Plus, RefreshCw, Search, ServerCog, Settings, ShieldCheck, Star, Unplug, XCircle } from 'lucide-react';
import { api, ApiError } from './platform/client';
import { ecosystemTabContext } from './tab-context';
import { emitCanonicalNotice } from './canoniek-meldingen';
import { openVault } from './AIDienstWeergave';
import { canonicalNavigationUrl } from './canoniek-navigatie';
import Merk from './merk/Merk';
import {
  GITHUB_MCP_URL, GITHUB_OAUTH_FOUTEN, GITHUB_RECHTEN, KOPPEL_PADEN, VIA_NAAM, geldigeMcpUrl, koppelPad, koppelKaartStaat, padKnopActief,
  type GithubKoppelingFeiten, type KaartInvoer, type KoppelPad,
} from '../shared/github-koppeling';
import { staatTekst } from '../shared/kluis-meta';
import { isVaultDoel, type VaultDoel } from '../shared/geheimen';
import { GeheimVenster } from './geheimen/GeheimFormulier';
import { RuimteGeslotenVlak, RuimteStrook } from './RuimteStrook';
import { ruimteFeitenUit, ruimteGeslotenUit, type RuimteFeiten, type RuimteGesloten } from '../shared/ruimte-weergave';
import './github-weergave.css';

type Tr = (uk: string, nl: string) => string;
type Repo = { fullName: string; name: string; description: string; language: string; stars: number; forks: number; openIssues: number; private: boolean; archived: boolean; pushedAt: string; url: string; defaultBranch: string; fork: boolean };
type Item = { number: number; title: string; state: string; isPull: boolean; draft: boolean; author: string; comments: number; labels: { name: string; color: string }[]; updatedAt: string; url: string; body: string };
type Status = { connected: boolean; login?: string; name?: string; avatar?: string; url?: string; publicRepos?: number; privateRepos?: number; followers?: number };
type Rate = { remaining: number; reset: number } | undefined;

const ctx = () => ({ service: 'github', tabContext: ecosystemTabContext(), sourceOrigin: location.origin });
const call = async (name: string, body: Record<string, unknown> = {}) => (await api.post(`/api/owner/github/${name}`, { ...ctx(), ...body })).data;

/** Foutcode van de server (of van de verbinding) — nooit een waarde, nooit een token. */
const foutCode = (e: unknown): string => (e instanceof ApiError ? String(e.response?.data?.error || e.message) : String((e as Error)?.message || ''));

function codeTekst(code: string, tr: Tr): string {
  const map: Record<string, [string, string]> = {
    GITHUB_TOKEN_MISSING: ['GitHub не підключено: додайте токен у Кабінет → API-платформа → Сховище ключів (призначення «github»).', 'GitHub is niet gekoppeld: voeg een token toe via Account → API-platform → Sleutelkluis (doel "github").'],
    GITHUB_TOKEN_INVALID: ['GitHub відхилив токен (недійсний або прострочений). Створіть новий і замініть у сховищі.', 'GitHub weigerde de token (ongeldig of verlopen). Maak een nieuwe aan en vervang hem in de kluis.'],
    GITHUB_FORBIDDEN: ['Токен не має потрібних прав для цієї дії.', 'De token heeft niet de juiste rechten voor deze actie.'],
    GITHUB_RATE_LIMITED: ['Ліміт запитів GitHub вичерпано. Спробуйте пізніше.', 'De GitHub-aanvraaglimiet is bereikt. Probeer het later.'],
    GITHUB_NOT_FOUND: ['Не знайдено (репозиторій, ресурс або немає доступу).', 'Niet gevonden (repository, resource of geen toegang).'],
    GITHUB_UNREACHABLE: ['GitHub недоступний. Спробуйте ще раз.', 'GitHub is niet bereikbaar. Probeer het opnieuw.'],
    GITHUB_PROJECTS_SCOPE: ['Для проєктів токену потрібне право «project» (read:project).', 'Voor projecten heeft de token het recht "project" (read:project) nodig.'],
    GITHUB_TITLE_INVALID: ['Заголовок надто короткий (мінімум 3 символи).', 'De titel is te kort (minimaal 3 tekens).'],
    GITHUB_BODY_INVALID: ['Текст коментаря порожній.', 'De reactie is leeg.'],
    GITHUB_QUERY_INVALID: ['Запит надто короткий.', 'De zoekopdracht is te kort.'],
    RATE_LIMITED: ['Забагато запитів. Зачекайте кілька хвилин.', 'Te veel verzoeken. Wacht enkele minuten.'],
    OWNER_GITHUB_SESSION_REQUIRED: ['Сесія закінчилася. Увійдіть знову й повторіть підключення.', 'De sessie is verlopen. Meld u opnieuw aan en herhaal het koppelen.'],
    GITHUB_OAUTH_AFGEWEZEN: ['GitHub відхилив запит на підключення.', 'GitHub wees de koppelingsaanvraag af.'],
    GITHUB_OAUTH_GEEN_TOKEN: ['GitHub не повернув токена.', 'GitHub gaf geen token terug.'],
    GITHUB_OAUTH_ANTWOORD_ONLEESBAAR: ['Відповідь GitHub не вдалося прочитати.', 'Het antwoord van GitHub was niet leesbaar.'],
  };
  // De OAuth- en App-fouten staan in het gedeelde bestand, zodat server en browser dezelfde oorzaak noemen.
  const oauth = GITHUB_OAUTH_FOUTEN[code];
  if (oauth) return tr(oauth[0], oauth[1]);
  const hit = map[code];
  return hit ? tr(hit[0], hit[1]) : tr('Не вдалося виконати дію з GitHub. Спробуйте ще раз.', 'De GitHub-actie is niet gelukt. Probeer het opnieuw.');
}
const errorText = (e: unknown, tr: Tr): string => codeTekst(foutCode(e), tr);

const ago = (iso: string, tr: Tr) => {
  const t = Date.parse(iso); if (!t) return '';
  const m = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (m < 1) return tr('щойно', 'zojuist'); if (m < 60) return tr(`${m} хв тому`, `${m} min geleden`);
  const h = Math.round(m / 60); if (h < 48) return tr(`${h} год тому`, `${h} uur geleden`);
  return tr(`${Math.round(h / 24)} дн. тому`, `${Math.round(h / 24)} d geleden`);
};

/**
 * 0086: elk geslaagd antwoord van de GitHub-routes zegt uit welke GEGEVENSLADE het komt (`ruimte`), en een weigering van de
 * ruimtepoort is hier geen gewone fout maar een eigen staat (`gesloten`) met een uitleg in beide talen. Zo kan de pagina
 * zeggen «deze dienst staat uit in de technische ruimte» in plaats van «GitHub is niet gekoppeld» — dat laatste zou niet
 * waar zijn: de persoonlijke koppeling bestaat nog, zij hoort alleen niet in deze ruimte.
 */
function useCall<T>(name: string, body: Record<string, unknown> | null, tr: Tr, deps: unknown[]) {
  const [state, setState] = useState<{ loading: boolean; error: string; code: string; data: T | null; rate?: Rate; ruimte?: RuimteFeiten | null; gesloten?: RuimteGesloten | null }>({ loading: !!body, error: '', code: '', data: null });
  const [rev, setRev] = useState(0);
  useEffect(() => {
    if (!body) { setState({ loading: false, error: '', code: '', data: null }); return; }
    let live = true;
    setState((s) => ({ ...s, loading: true, error: '', code: '' }));
    call(name, body)
      .then((d) => { if (live) setState({ loading: false, error: '', code: '', data: d as T, rate: d.rate, ruimte: ruimteFeitenUit(d), gesloten: null }); })
      .catch((e) => {
        if (!live) return;
        const dicht = ruimteGeslotenUit(e instanceof ApiError ? e.response?.data : null);
        if (dicht) { setState({ loading: false, error: '', code: dicht.code, data: null, ruimte: null, gesloten: dicht }); return; }
        setState({ loading: false, error: errorText(e, tr), code: foutCode(e), data: null, ruimte: null, gesloten: null });
      });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, rev, ...deps]);
  return { ...state, reload: () => setRev((v) => v + 1) };
}

const Notice = ({ kind, children }: { kind: 'error' | 'info'; children: React.ReactNode }) => <div className={`gh-notice gh-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>{kind === 'error' ? <AlertTriangle size={16} /> : <Loader2 size={16} />}<span>{children}</span></div>;
const Busy = ({ tr }: { tr: Tr }) => <div className="gh-busy"><Loader2 size={16} className="gh-spin" /> {tr('Завантаження…', 'Laden…')}</div>;
const Empty = ({ children }: { children: React.ReactNode }) => <p className="gh-empty">{children}</p>;
const Lang = ({ l }: { l: string }) => (l ? <span className="gh-chip">{l}</span> : null);

function RepoRow({ r, active, onPick, tr }: { r: Repo; active: boolean; onPick: () => void; tr: Tr }) {
  return <button type="button" className={`gh-repo${active ? ' is-active' : ''}`} onClick={onPick} aria-pressed={active}>
    <span className="gh-repo-name"><Github size={15} />{r.fullName}{r.private && <span className="gh-chip gh-chip-warn">{tr('приватний', 'privé')}</span>}{r.archived && <span className="gh-chip">{tr('архів', 'archief')}</span>}{r.fork && <span className="gh-chip">fork</span>}</span>
    {r.description && <span className="gh-repo-desc">{r.description}</span>}
    <span className="gh-repo-meta"><Lang l={r.language} /><span><Star size={12} /> {r.stars}</span><span><CircleDot size={12} /> {r.openIssues}</span><span>{ago(r.pushedAt, tr)}</span></span>
  </button>;
}

function ItemList({ items, tr }: { items: Item[]; tr: Tr }) {
  if (!items.length) return <Empty>{tr('Тут порожньо.', 'Hier is niets.')}</Empty>;
  return <ul className="gh-list">{items.map((i) => <li key={i.number}>
    <a href={i.url} target="_blank" rel="noopener noreferrer" className="gh-item">
      {i.isPull ? <GitPullRequest size={16} className={i.state === 'open' ? 'gh-ok' : 'gh-muted'} /> : <CircleDot size={16} className={i.state === 'open' ? 'gh-ok' : 'gh-muted'} />}
      <span className="gh-item-main"><strong>#{i.number} {i.title}</strong><span className="gh-sub">{i.author} · {ago(i.updatedAt, tr)}{i.comments ? ` · ${i.comments} 💬` : ''}{i.draft ? ` · ${tr('чернетка', 'concept')}` : ''}</span>
        {i.labels.length > 0 && <span className="gh-labels">{i.labels.map((l) => <span key={l.name} className="gh-label" style={{ borderColor: `#${l.color || '888'}` }}>{l.name}</span>)}</span>}</span>
      <ExternalLink size={13} className="gh-muted" /></a></li>)}</ul>;
}

function RepoDetail({ repo, tr }: { repo: string; tr: Tr }) {
  const [sub, setSub] = useState<'issues' | 'pulls' | 'commits' | 'actions'>('issues');
  const [state, setState] = useState<'open' | 'closed'>('open');
  const info = useCall<any>('repo', { repo }, tr, [repo]);
  const list = useCall<any>(sub === 'commits' ? 'commits' : sub === 'actions' ? 'actions' : 'issues', { repo, state, kind: sub === 'pulls' ? 'pr' : 'issue' }, tr, [repo, sub, state]);
  const [composer, setComposer] = useState(false);
  return <section className="gh-detail" aria-label={repo}>
    <header className="gh-detail-head"><h3>{repo}</h3><a href={`https://github.com/${repo}`} target="_blank" rel="noopener noreferrer" className="gh-btn"><ExternalLink size={14} />{tr('Відкрити на GitHub', 'Openen op GitHub')}</a></header>
    {info.error ? <Notice kind="error">{info.error}</Notice> : info.loading && !info.data ? <Busy tr={tr} /> : info.data && <div className="gh-facts">
      <span><Star size={13} /> {info.data.stars}</span><span><GitBranch size={13} /> {info.data.defaultBranch}</span><span><CircleDot size={13} /> {info.data.openIssues} {tr('відкритих', 'open')}</span>
      {info.data.license && <span>{info.data.license}</span>}{info.data.latestRelease && <span>🏷 {info.data.latestRelease.tag}</span>}
      {info.data.languages?.length > 0 && <span className="gh-langs">{info.data.languages.map((l: any) => <span key={l.name} className="gh-chip">{l.name} {l.percent}%</span>)}</span>}
    </div>}
    <div className="gh-tabs" role="tablist">{([['issues', tr('Issues', 'Issues'), CircleDot], ['pulls', 'Pull requests', GitPullRequest], ['commits', 'Commits', GitCommit], ['actions', 'CI / Actions', PlayCircle]] as const).map(([id, label, Icon]) =>
      <button key={id} role="tab" aria-selected={sub === id} className={sub === id ? 'is-on' : ''} onClick={() => setSub(id)}><Icon size={14} />{label}</button>)}
      {(sub === 'issues' || sub === 'pulls') && <select aria-label={tr('Стан', 'Status')} value={state} onChange={(e) => setState(e.target.value as 'open' | 'closed')}><option value="open">{tr('Відкриті', 'Open')}</option><option value="closed">{tr('Закриті', 'Gesloten')}</option></select>}
      {sub === 'issues' && <button className="gh-btn gh-primary" onClick={() => setComposer((v) => !v)}><Plus size={14} />{tr('Новий issue', 'Nieuw issue')}</button>}</div>
    {composer && sub === 'issues' && <IssueComposer repo={repo} tr={tr} onDone={() => { setComposer(false); list.reload(); }} />}
    {list.error ? <Notice kind="error">{list.error}</Notice> : list.loading ? <Busy tr={tr} /> : sub === 'commits' ? (
      <ul className="gh-list">{(list.data?.commits ?? []).map((c: any) => <li key={c.sha}><a href={c.url} target="_blank" rel="noopener noreferrer" className="gh-item"><GitCommit size={16} className="gh-muted" /><span className="gh-item-main"><strong>{c.message}</strong><span className="gh-sub">{c.login || c.author} · {c.sha.slice(0, 7)} · {ago(c.date, tr)}</span></span></a></li>)}</ul>
    ) : sub === 'actions' ? (
      <><p className="gh-sub">{list.data?.summary ? tr(`Усього запусків: ${list.data.summary.total}; серед останніх збійних: ${list.data.summary.failing}`, `Totaal runs: ${list.data.summary.total}; recent mislukt: ${list.data.summary.failing}`) : ''}</p>
        <ul className="gh-list">{(list.data?.runs ?? []).map((r: any) => <li key={r.id}><a href={r.url} target="_blank" rel="noopener noreferrer" className="gh-item">
          {r.conclusion === 'success' ? <CheckCircle2 size={16} className="gh-ok" /> : r.conclusion === 'failure' ? <XCircle size={16} className="gh-bad" /> : <PlayCircle size={16} className="gh-muted" />}
          <span className="gh-item-main"><strong>{r.name}</strong><span className="gh-sub">{r.branch} · {r.event} · {r.sha} · {r.conclusion || r.status} · {ago(r.updatedAt, tr)}</span></span></a></li>)}</ul></>
    ) : <><ItemList items={list.data?.items ?? []} tr={tr} /></>}
  </section>;
}

function IssueComposer({ repo, tr, onDone }: { repo: string; tr: Tr; onDone: () => void }) {
  const [title, setTitle] = useState(''); const [body, setBody] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const send = async () => {
    if (!window.confirm(tr(`Створити issue у ${repo} від вашого імені?`, `Issue aanmaken in ${repo} namens u?`))) return;
    setBusy(true); setErr('');
    try { const made = await call('issue/create', { repo, title, body }); emitCanonicalNotice({ text: tr(`Issue створено в ${repo}`, `Issue aangemaakt in ${repo}`), kind: 'success', source: 'github', retain: true, link: made?.url ? { href: String(made.url), label: tr('Відкрити на GitHub', 'Openen op GitHub') } : undefined }); onDone(); } catch (e) { setErr(errorText(e, tr)); } finally { setBusy(false); }
  };
  return <form className="gh-form" onSubmit={(e) => { e.preventDefault(); void send(); }}>
    <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={tr('Заголовок', 'Titel')} maxLength={250} aria-label={tr('Заголовок', 'Titel')} />
    <textarea data-concept='github-issue' value={body} onChange={(e) => setBody(e.target.value)} placeholder={tr('Опис (необов’язково)', 'Beschrijving (optioneel)')} rows={4} aria-label={tr('Опис', 'Beschrijving')} />
    {err && <Notice kind="error">{err}</Notice>}
    <button className="gh-btn gh-primary" disabled={busy || title.trim().length < 3}>{busy ? <Loader2 size={14} className="gh-spin" /> : <MessageSquarePlus size={14} />}{tr('Створити issue', 'Issue aanmaken')}</button>
  </form>;
}

// ---------------------------------------------------------------------------------------------- koppelkaart (tabblad «Облікові записи»)

/**
 * Eén waarde die de eigenaar letterlijk bij GitHub moet invullen, met een knop «Копіювати». Alleen-lezen: wat hier staat is
 * door de server uit ZIJN domein gerekend, dus er valt niets te typen — alleen te kopiëren.
 */
function KopieerRij({ label, waarde, uitleg, tr }: { label: string; waarde: string; uitleg?: string; tr: Tr }) {
  const [gekopieerd, setGekopieerd] = useState(false);
  const kopieer = () => { void navigator.clipboard?.writeText(waarde).then(() => { setGekopieerd(true); window.setTimeout(() => setGekopieerd(false), 1600); }).catch(() => undefined); };
  return <div className='gh-veld'>
    <label>{label}</label>
    <div className='gh-veld-rij'>
      <input value={waarde} readOnly spellCheck={false} autoComplete='off' onFocus={(e) => e.currentTarget.select()} aria-label={label} />
      <button type='button' className='gh-btn' onClick={kopieer} disabled={!waarde}>{gekopieerd ? <Check size={14} /> : <Copy size={14} />}{gekopieerd ? tr('Скопійовано', 'Gekopieerd') : tr('Копіювати', 'Kopiëren')}</button>
    </div>
    {uitleg ? <p className='gh-sub'>{uitleg}</p> : null}
  </div>;
}

/**
 * Veld met het MCP-adres van GitHub: kopiëren, en uitleg waar het hoort. Het adres blijft in DEZE BROWSER (de server bewaart
 * het niet), maar het is wél een gegeven van de koppeling — dus het hoort ook PER GEGEVENSLADE (0086). Daarom staat de sleutel
 * van de opslag per ruimte: wie in het technische profiel een ander adres invult, verandert daarmee niets aan het adres van
 * zijn persoonlijke profiel, en omgekeerd. De oude sleutel blijft de persoonlijke, dus niemand verliest wat hij had.
 */
function McpAdresVeld({ tr, ruimte }: { tr: Tr; ruimte: 'prive' | 'technisch' }) {
  const sleutel = ruimte === 'technisch' ? 'mr.gh.mcp.technisch' : 'mr.gh.mcp';
  const [adres, setAdres] = useState<string>(() => { try { return localStorage.getItem(sleutel) || GITHUB_MCP_URL; } catch { return GITHUB_MCP_URL; } });
  const [gekopieerd, setGekopieerd] = useState(false);
  const geldig = geldigeMcpUrl(adres);
  const wijzig = (waarde: string) => { setAdres(waarde); try { localStorage.setItem(sleutel, waarde); } catch { /* geen opslag */ } };
  const kopieer = () => { void navigator.clipboard?.writeText(adres).then(() => { setGekopieerd(true); window.setTimeout(() => setGekopieerd(false), 1600); }).catch(() => undefined); };
  return <div className='gh-veld'>
    <label htmlFor='gh-mcp-url'><ServerCog size={14} aria-hidden='true' />{tr('Server-URL (MCP-сервер GitHub)', 'Server-URL (MCP-server van GitHub)')}</label>
    <div className='gh-veld-rij'>
      <input id='gh-mcp-url' value={adres} onChange={(e) => wijzig(e.target.value)} spellCheck={false} autoComplete='off' inputMode='url'
        aria-invalid={!geldig} aria-describedby='gh-mcp-uitleg' />
      <button type='button' className='gh-btn' onClick={kopieer} disabled={!geldig}>{gekopieerd ? <Check size={14} /> : <Copy size={14} />}{gekopieerd ? tr('Скопійовано', 'Gekopieerd') : tr('Копіювати', 'Kopiëren')}</button>
      <button type='button' className='gh-btn' onClick={() => wijzig(GITHUB_MCP_URL)} disabled={adres === GITHUB_MCP_URL}><RefreshCw size={14} />{tr('Типово', 'Standaard')}</button>
    </div>
    {!geldig && <p className='gh-sub gh-bad' role='alert'>{tr('Адреса має бути https, без логіна, пароля й параметрів у посиланні.', 'Het adres moet https zijn, zonder gebruikersnaam, wachtwoord of parameters.')}</p>}
    <p className='gh-sub' id='gh-mcp-uitleg'>{tr('Куди вставляти: у ваш ШІ-клієнт як віддалений MCP-сервер — Claude (Settings → Connectors → Add custom connector), VS Code / Copilot (mcp.json, поле "url"), або будь-який інший клієнт з підтримкою MCP через HTTP. Там же клієнт попросить увійти в GitHub — цей сайт при цьому не бере участі й токена не бачить.',
      'Waar het hoort: in uw AI-client als externe MCP-server — Claude (Settings → Connectors → Add custom connector), VS Code / Copilot (mcp.json, veld "url") of een andere client die MCP over HTTP ondersteunt. Die client vraagt u daar zelf om bij GitHub aan te melden; deze site doet daar niet aan mee en ziet die token niet.')}</p>
  </div>;
}

/**
 * Instelpagina (punt 2 van de opdracht): precies wat de eigenaar in zijn eigen OAuth-app of GitHub App moet invullen. De
 * waarden komen van de SERVER, gerekend uit het domein van deze installatie — er staat hier dus geen tarasevych.com in de
 * code, en op een andere server staat daar die andere naam.
 */
function InstelBlok({ feiten, tr }: { feiten: GithubKoppelingFeiten | null; tr: Tr }) {
  const uk = tr('uk', 'nl') === 'uk';
  const instel = feiten?.instel;
  if (!instel?.callbackUrl) return null;
  return <div className='gh-koppel-blok'>
    <h4><Settings size={15} aria-hidden='true' />{tr('Що зареєструвати на GitHub (значення для вашого домену)', 'Wat u op GitHub registreert (waarden voor uw domein)')}</h4>
    <ol className='gh-stappen'>
      <li>{tr('OAuth: github.com → Settings → Developer settings → OAuth Apps → «New OAuth App». GitHub App: там само → «GitHub Apps» → «New GitHub App».',
        'OAuth: github.com → Settings → Developer settings → OAuth Apps → «New OAuth App». GitHub App: daar → «GitHub Apps» → «New GitHub App».')}</li>
      <li>{tr('Впишіть два значення нижче (скопіюйте їх — вони мають збігатися символ у символ).', 'Vul de twee waarden hieronder in (kopieer ze — ze moeten teken voor teken kloppen).')}</li>
      <li>{tr('Створіть client secret (OAuth) або приватний ключ (GitHub App) і покладіть його у сховище ключів — значення вводиться лише там, із підтвердженням passkey або TOTP.',
        'Maak een client secret (OAuth) of een persoonlijke sleutel (GitHub App) en zet die in de sleutelkluis — de waarde voert u alleen daar in, met passkey of TOTP.')}</li>
      <li>{tr('Поверніться сюди й натисніть «Увійти через GitHub» або «Під’єднати застосунок».', 'Kom hier terug en klik op «Aanmelden met GitHub» of «App verbinden».')}</li>
    </ol>
    <KopieerRij tr={tr} label='Homepage URL' waarde={instel.homepageUrl}
      uitleg={tr('Домашня адреса застосунку — сторінка GitHub у вашому просторі.', 'Het startadres van de app — de GitHub-pagina in uw ruimte.')} />
    <KopieerRij tr={tr} label='Redirect URI (Authorization callback URL)' waarde={instel.callbackUrl}
      uitleg={tr('Єдина адреса, на яку сервер приймає повернення з GitHub. Інша адреса дасть помилку «redirect_uri_mismatch».', 'Het enige adres waarop de server de terugkeer van GitHub aanneemt. Een ander adres geeft «redirect_uri_mismatch».')} />
    <KopieerRij tr={tr} label={tr('Області (scopes), які запитує сервер', 'Scopes die de server vraagt')} waarde={instel.scopeTekst}
      uitleg={tr('Саме ці права запитує кнопка «Увійти через GitHub» — не більше. Що дає кожне, написано нижче.', 'Precies deze rechten vraagt de knop «Aanmelden met GitHub» — niet meer. Wat elk recht geeft, staat hieronder.')} />
    <ul className='gh-rechten'>
      {GITHUB_RECHTEN.map((recht) => <li key={recht.code}>
        <code>{recht.code}</code>
        <span className={recht.verplicht ? 'gh-chip gh-chip-warn' : 'gh-chip'}>{recht.verplicht ? tr('обов’язкове', 'verplicht') : tr('необов’язкове', 'optioneel')}</span>
        <span className='gh-sub'>{uk ? recht.waarvoor[0] : recht.waarvoor[1]}</span>
      </li>)}
    </ul>
    <p className='gh-sub'>{feiten?.oauthClientId
      ? tr(`Застосунок OAuth у сховищі: client id ${feiten.oauthClientId} (secret залишається на сервері).`, `OAuth-app in de kluis: client id ${feiten.oauthClientId} (de secret blijft op de server).`)
      : tr('OAuth-застосунку ще немає у сховищі (призначення «github-oauth»).', 'Er staat nog geen OAuth-app in de kluis (doel «github-oauth»).')}</p>
    <p className='gh-sub'>{feiten?.appId
      ? tr(`GitHub App у сховищі: App ID ${feiten.appId} (приватний ключ зашифрований).`, `GitHub App in de kluis: App ID ${feiten.appId} (de persoonlijke sleutel is versleuteld).`)
      : tr('Ключа GitHub App ще немає у сховищі (призначення «github-app»).', 'Er staat nog geen GitHub-App-sleutel in de kluis (doel «github-app»).')}</p>
  </div>;
}

/**
 * Eén weg om te koppelen: wat ze doet, of de server haar vandaag echt kan lopen, en — als de eigenaar zijn app nog niet in de
 * kluis heeft gezet — wat hij daarvoor eerst moet doen. Een niet-gebouwde weg krijgt nog steeds nooit een knop.
 */
function PadRij({ pad, tr, klaar, bezig, onActie, onOpenKluis }: { pad: KoppelPad; tr: Tr; klaar: boolean; bezig: boolean; onActie: (pad: KoppelPad) => void; onOpenKluis: (doel: VaultDoel) => void }) {
  const uk = tr('uk', 'nl') === 'uk';
  const actief = padKnopActief(pad);
  // Een weg die de server kan lopen maar waarvoor de sleutel nog ontbreekt: de knop opent het canonieke kluisvenster ter plekke.
  const naarKluis = pad.actie === 'kluis' || !klaar;
  const doel: VaultDoel = isVaultDoel(pad.doel) ? pad.doel : 'github';
  const label = pad.actie === 'oauth' ? tr('Увійти через GitHub', 'Aanmelden met GitHub')
    : pad.actie === 'app' ? tr('Під’єднати застосунок', 'App verbinden')
    : tr('Відкрити безпечне поле', 'Beveiligd veld openen');
  return <li className={`gh-pad${actief ? '' : ' is-uit'}`}>
    <span className='gh-pad-kop'>
      {actief ? <Plug size={15} className='gh-ok' aria-hidden='true' /> : <Unplug size={15} className='gh-muted' aria-hidden='true' />}
      <strong>{uk ? pad.naam[0] : pad.naam[1]}</strong>
      <span className={actief ? 'gh-chip' : 'gh-chip gh-chip-warn'}>{actief ? tr('працює', 'werkt') : tr('ще не реалізовано', 'nog niet gebouwd')}</span>
      {actief && pad.doel ? <span className={klaar ? 'gh-chip' : 'gh-chip gh-chip-warn'}>{klaar ? tr('ключ у сховищі', 'sleutel in de kluis') : tr('ключа ще немає', 'sleutel ontbreekt nog')}</span> : null}
    </span>
    <span className='gh-sub'>{uk ? pad.uitleg[0] : pad.uitleg[1]}</span>
    {!actief && pad.ontbreekt ? <span className='gh-sub gh-pad-mist'>{tr('Ще не реалізовано: ', 'Nog niet gebouwd: ')}{uk ? pad.ontbreekt[0] : pad.ontbreekt[1]}</span> : null}
    {actief && !klaar && pad.doel && pad.actie !== 'kluis'
      ? <span className='gh-sub gh-pad-mist'>{tr(`Спершу покладіть дані у сховище (призначення «${pad.doel}») — точні значення для GitHub показані вище.`, `Zet eerst de gegevens in de kluis (doel «${pad.doel}») — de exacte waarden voor GitHub staan hierboven.`)}</span>
      : null}
    {actief ? <button type='button' className={naarKluis ? 'gh-btn' : 'gh-btn gh-primary'} data-gh-pad-actie={pad.id} disabled={bezig} onClick={() => (naarKluis ? onOpenKluis(doel) : onActie(pad))}>
      {bezig ? <Loader2 size={14} className='gh-spin' /> : naarKluis ? <KeyRound size={14} /> : <Plug size={14} />}
      {naarKluis ? tr('Відкрити безпечне поле', 'Beveiligd veld openen') : label}
    </button> : null}
  </li>;
}

/**
 * De echte koppelkaart van GitHub (punt 6, 19.10.2026). Alles erop komt uit de feiten van de server: de login uit /user, de
 * sleutelnaam, het doel en de termijn uit de kluis. De tokenwaarde staat nergens in het antwoord en wordt hier dus ook nooit
 * getoond; «Підключити» leidt naar het beveiligde veld van de kluis, waar passkey of TOTP nodig is.
 */
function KoppelKaart({ tr, invoer, onHerlaad, ruimte, rate }: { tr: Tr; invoer: KaartInvoer; onHerlaad: () => void; ruimte: RuimteFeiten | null; rate?: Rate }) {
  const uk = tr('uk', 'nl') === 'uk';
  const lang: 'uk' | 'nl' = uk ? 'uk' : 'nl';
  const staat = koppelKaartStaat(invoer);
  const feiten = invoer.feiten;
  const sleutel = feiten?.sleutel ?? null;
  const [bezig, setBezig] = useState('');
  const [actieFout, setActieFout] = useState('');
  const [kluisDoel, setKluisDoel] = useState<VaultDoel | null>(null);
  // Resultaat van de terugkeer van GitHub: de server zette alleen een CODE in de adresbalk (nooit een token of een code van
  // GitHub). Die lezen we één keer en halen we daarna uit de URL weg.
  const [terugkeer, setTerugkeer] = useState('');
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      const code = url.searchParams.get('github');
      if (!code) return;
      setTerugkeer(code);
      url.searchParams.delete('github');
      window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
      if (code === 'ok') onHerlaad();
    } catch { /* geen URL-API */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Een weg echt starten. De server antwoordt met het adres van GitHub; daar gaat de browser naartoe. */
  const start = async (pad: KoppelPad) => {
    setBezig(pad.id); setActieFout('');
    try {
      if (pad.actie === 'oauth') {
        const uit = await call('oauth/start');
        const adres = String(uit?.authUrl || '');
        if (!adres.startsWith('https://github.com/login/oauth/authorize')) throw new Error('GITHUB_OAUTH_AFGEWEZEN');
        window.location.assign(adres);
        return;
      }
      if (pad.actie === 'app') { await call('app/verbinden', {}); onHerlaad(); }
    } catch (e) { setActieFout(errorText(e, tr)); } finally { setBezig(''); }
  };

  /** Ontkoppelen: de server trekt de token bij GitHub in (OAuth) en verwijdert het record. */
  const ontkoppel = async () => {
    const weg = staat.via === 'app' ? 'app' : 'oauth';
    if (staat.via === 'pat' || !staat.via) { openVault(); return; }
    if (!window.confirm(tr('Відключити GitHub і відкликати токен на GitHub?', 'GitHub ontkoppelen en de token bij GitHub intrekken?'))) return;
    setBezig('ontkoppel'); setActieFout('');
    try { await call('ontkoppelen', { weg }); onHerlaad(); } catch (e) { setActieFout(errorText(e, tr)); } finally { setBezig(''); }
  };

  const vernieuw = async () => {
    setBezig('vernieuw'); setActieFout('');
    try { await call('oauth/vernieuwen'); onHerlaad(); } catch (e) { setActieFout(errorText(e, tr)); } finally { setBezig(''); }
  };

  const termijnTekst = (ms: number) => {
    if (!ms) return tr('без терміну (поки не відкликано)', 'zonder termijn (tot intrekken)');
    const over = Math.round((ms - Date.now()) / 60000);
    if (over <= 0) return tr('термін вийшов', 'verlopen');
    if (over < 120) return tr(`${over} хв`, `${over} min`);
    const uur = Math.round(over / 60);
    return uur < 48 ? tr(`${uur} год`, `${uur} uur`) : tr(`${Math.round(uur / 24)} дн.`, `${Math.round(uur / 24)} d`);
  };
  const titels: Record<typeof staat.soort, string> = {
    laden: tr('Перевіряємо підключення…', 'Koppeling controleren…'),
    'geen-sleutel': tr('Не підключено', 'Niet gekoppeld'),
    'sleutel-ongeldig': tr('Не підключено: GitHub відхилив токен', 'Niet gekoppeld: GitHub weigerde de token'),
    'sleutel-verlopen': tr('Термін дії токена вийшов', 'De token is verlopen'),
    'sleutel-bijna': tr('Підключено, але термін токена завершується', 'Gekoppeld, maar de token loopt af'),
    gekoppeld: tr('Підключено', 'Gekoppeld'),
    fout: tr('Не вдалося перевірити підключення', 'Koppeling kon niet worden gecontroleerd'),
  };
  const Teken = staat.toon === 'ok' ? CheckCircle2 : staat.toon === 'waarschuwing' ? Clock : staat.toon === 'fout' ? XCircle : Loader2;
  return <section className='gh-card gh-koppel' aria-label='GitHub'>
    <header className='gh-koppel-kop'>
      <Merk merk='github' naam='GitHub' maat={40} titel='GitHub' vorm='tegel' />
      <div className='gh-koppel-titels'>
        <strong>GitHub</strong>
        <span className='gh-sub'>{tr('Репозиторії, issues, pull requests, коміти й CI вашого облікового запису — просто в «Мій простір».', 'Repositories, issues, pull requests, commits en CI van uw account — gewoon in «Mijn Ruimte».')}</span>
      </div>
      <span className={`gh-staat tone-${staat.toon}`}><Teken size={15} className={staat.soort === 'laden' ? 'gh-spin' : ''} aria-hidden='true' />{titels[staat.soort]}</span>
    </header>

    {staat.login ? <p className='gh-koppel-wie'>
      {feiten?.avatar ? <img src={feiten.avatar} alt='' width={28} height={28} /> : <Github size={20} aria-hidden='true' />}
      <a href={feiten?.url || `https://github.com/${staat.login}`} target='_blank' rel='noopener noreferrer'>@{staat.login}</a>
      {staat.via ? <span className='gh-chip'>{uk ? VIA_NAAM[staat.via][0] : VIA_NAAM[staat.via][1]}</span> : null}
      {feiten?.name ? <span className='gh-sub'>{feiten.name}</span> : null}
      <span className='gh-sub'>{feiten?.publicRepos ?? 0} {tr('публічних', 'publiek')} · {feiten?.privateRepos ?? 0} {tr('приватних', 'privé')} · {feiten?.followers ?? 0} {tr('підписників', 'volgers')}</span>
    </p> : null}

    {staat.reden ? <Notice kind='error'>{codeTekst(staat.reden, tr)}</Notice> : null}
    {terugkeer && terugkeer !== 'ok' ? <Notice kind='error'>{codeTekst(terugkeer, tr)}</Notice> : null}
    {actieFout ? <Notice kind='error'>{actieFout}</Notice> : null}

    {/* De weg waarlangs de server nu echt praat, met termijn en toegekende права — allemaal feiten van de server. */}
    {feiten?.verbinding?.via ? <dl className='gh-feiten'>
      <div><dt>{tr('Спосіб підключення', 'Manier van koppelen')}</dt><dd>{uk ? VIA_NAAM[feiten.verbinding.via as 'oauth' | 'app' | 'pat'][0] : VIA_NAAM[feiten.verbinding.via as 'oauth' | 'app' | 'pat'][1]}</dd></div>
      <div><dt>{tr('Термін дії токена', 'Geldigheid van de token')}</dt><dd>{termijnTekst(feiten.verbinding.verlooptOp)}{feiten.verbinding.vernieuwbaar ? ` · ${tr('оновлюється сервером', 'wordt door de server vernieuwd')}` : ''}</dd></div>
      {feiten.verbinding.scopes.length ? <div><dt>{tr('Видані права', 'Toegekende rechten')}</dt><dd>{feiten.verbinding.scopes.map((x) => <code key={x} className='gh-chip'>{x}</code>)}</dd></div> : null}
      {feiten.verbinding.installatie ? <div><dt>{tr('Встановлення застосунку', 'Installatie van de app')}</dt><dd>#{feiten.verbinding.installatie}{feiten.verbinding.repos.length ? ` · ${feiten.verbinding.repos.length} ${tr('репозиторіїв', 'repositories')}` : ''}</dd></div> : null}
      {feiten.verbinding.repos.length ? <div><dt>{tr('Доступні репозиторії', 'Bereikbare repositories')}</dt><dd>{feiten.verbinding.repos.slice(0, 12).map((x) => <span key={x} className='gh-chip'>{x}</span>)}</dd></div> : null}
    </dl> : null}

    {sleutel ? <dl className='gh-feiten'>
      <div><dt>{tr('Ключ у сховищі', 'Sleutel in de kluis')}</dt><dd>{sleutel.keyName} <span className='gh-chip'>{tr('призначення', 'doel')}: {sleutel.purpose}</span></dd></div>
      <div><dt>{tr('Термін дії токена', 'Geldigheid van de token')}</dt><dd>{staatTekst(sleutel.meta, lang)}</dd></div>
      {sleutel.meta.notitie ? <div><dt>{tr('Нотатка до ключа', 'Notitie bij de sleutel')}</dt><dd>{sleutel.meta.notitie}</dd></div> : null}
      <div><dt>{tr('Значення', 'Waarde')}</dt><dd>{tr('зашифроване на сервері; ця сторінка його не отримує й не записує в журнал.', 'versleuteld op de server; deze pagina ontvangt hem niet en schrijft hem niet in het logboek.')}</dd></div>
    </dl> : staat.soort === 'laden' ? null : <div className='gh-koppel-leeg'>
      <p>{tr('Що дає підключення:', 'Wat de koppeling u geeft:')}</p>
      <ul>
        <li>{tr('перелік ваших репозиторіїв (разом із приватними) з мовами, зірками й останніми змінами;', 'een lijst van uw repositories (ook privé) met talen, sterren en laatste wijzigingen;')}</li>
        <li>{tr('issues, pull requests, коміти й запуски CI — без переходу на github.com;', 'issues, pull requests, commits en CI-runs — zonder naar github.com te gaan;')}</li>
        <li>{tr('створення issue й коментарів від вашого імені (з підтвердженням);', 'issues en reacties aanmaken namens u (met bevestiging);')}</li>
        <li>{tr('README, пошук по GitHub і «Проєкти»;', 'README, zoeken op GitHub en «Projecten»;')}</li>
        <li>{tr('ті самі дані для інструментів GitHub у ваших ШІ-підключеннях — окремого токена для них не потрібно.', 'dezelfde gegevens voor de GitHub-instrumenten van uw AI-koppelingen — daar is geen aparte token voor nodig.')}</li>
      </ul>
    </div>}

    <div className='gh-actions'>
      {/* «Увійти через GitHub» werkt echt zodra de OAuth-app van de eigenaar in de kluis staat; anders opent het canonieke kluisvenster ter plekke. */}
      <button type='button' className='gh-btn gh-primary' data-gh-hoofd-actie='1' disabled={!staat.kanVerbinden || !!bezig}
        onClick={() => (feiten?.oauthKlaar ? void start(koppelPad('oauth')) : setKluisDoel(sleutel?.purpose && isVaultDoel(sleutel.purpose) ? sleutel.purpose : 'github-oauth'))}>
        {bezig === 'oauth' ? <Loader2 size={14} className='gh-spin' /> : feiten?.oauthKlaar ? <Github size={14} /> : <KeyRound size={14} />}
        {feiten?.oauthKlaar ? tr('Увійти через GitHub', 'Aanmelden met GitHub') : sleutel ? tr('Замінити токен', 'Token vervangen') : tr('Підключити', 'Verbinden')}
      </button>
      <button type='button' className='gh-btn' onClick={onHerlaad}><RefreshCw size={14} />{tr('Перевірити', 'Controleren')}</button>
      {feiten?.verbinding?.vernieuwbaar && feiten.verbinding.via === 'oauth'
        ? <button type='button' className='gh-btn' disabled={!!bezig} onClick={() => void vernieuw()}>{bezig === 'vernieuw' ? <Loader2 size={14} className='gh-spin' /> : <RefreshCw size={14} />}{tr('Оновити токен', 'Token vernieuwen')}</button>
        : null}
      <button type='button' className='gh-btn' disabled={!staat.kanOntkoppelen || !!bezig} onClick={() => void ontkoppel()}>
        {bezig === 'ontkoppel' ? <Loader2 size={14} className='gh-spin' /> : <Unplug size={14} />}{tr('Відключити', 'Ontkoppelen')}
      </button>
      <a className='gh-btn' href='https://github.com/settings/applications' target='_blank' rel='noopener noreferrer'><ExternalLink size={14} />{tr('Дозволи на GitHub', 'Toestemmingen op GitHub')}</a>
    </div>
    {/* Resterend aantal GitHub-API-aanvragen, uit het antwoord van de server. */}
    {rate ? <p className='gh-sub' title={tr('Залишок запитів до GitHub API', 'Resterende GitHub API-aanvragen')}>
      {tr(`Залишок запитів: ${rate.remaining}`, `Resterende aanvragen: ${rate.remaining}`)}
      {rate.reset ? tr(`; оновлення ліміту: ${new Date(rate.reset).toLocaleTimeString()}`, `; limiet vernieuwd om ${new Date(rate.reset).toLocaleTimeString()}`) : ''}
    </p> : null}
    <p className='gh-sub'>{staat.via === 'oauth' || staat.via === 'app'
      ? tr('«Відключити» справді відкликає токен на GitHub (для OAuth — через DELETE /applications/{client_id}/token) і видаляє запис на сервері. Саме встановлення GitHub App прибирають на github.com.',
        '«Ontkoppelen» trekt de token echt in bij GitHub (bij OAuth via DELETE /applications/{client_id}/token) en verwijdert het record op de server. De installatie van een GitHub App haalt u weg op github.com.')
      : tr('Персональний токен уводиться лише в безпечному полі сховища ключів (Кабінет → API-платформа → Сховище ключів), із підтвердженням passkey або TOTP. Значення ніколи не потрапляє в цей браузер.',
        'Een persoonlijke token voert u alleen in het beveiligde veld van de sleutelkluis in (Account → API-platform → Sleutelkluis), met passkey of TOTP. De waarde komt nooit in deze browser.')}</p>

    <InstelBlok feiten={feiten} tr={tr} />

    <div className='gh-koppel-blok'>
      <h4><Plug size={15} aria-hidden='true' />{tr('Способи підключення', 'Manieren om te koppelen')}</h4>
      <ul className='gh-paden'>{KOPPEL_PADEN.map((pad) => <PadRij key={pad.id} pad={pad} tr={tr} bezig={bezig === pad.id}
        klaar={pad.id === 'oauth' ? !!feiten?.oauthKlaar : pad.id === 'github-app' ? !!feiten?.appKlaar : pad.id === 'pat' ? !!sleutel : false}
        onActie={(p) => void start(p)}
        onOpenKluis={(d) => setKluisDoel(d)} />)}</ul>
    </div>

    {kluisDoel ? (
      <GeheimVenster
        id='gh-kluis-venster'
        lang={lang}
        beginDoel={kluisDoel}
        githubHost={feiten?.instel?.host}
        context={ctx()}
        formulierNaam='github-kluis'
        onSluit={() => setKluisDoel(null)}
        onOpgeslagen={async () => {
          setKluisDoel(null);
          onHerlaad();
        }}
      />
    ) : null}

    <div className='gh-koppel-blok'>
      <h4><ShieldCheck size={15} aria-hidden='true' />{tr('Якщо ви обрали персональний токен', 'Als u voor een persoonlijke token kiest')}</h4>
      <p className='gh-sub'>{tr('Класичний токен: позначте «repo» (та за потреби «read:org», «read:project»). Fine-grained токен: доступ лише до потрібних репозиторіїв, права читання Contents, Issues, Pull requests, Actions і запис Issues. Більших прав сторінка не використовує.',
        'Klassieke token: vink «repo» aan (en zo nodig «read:org», «read:project»). Fine-grained token: alleen de gewenste repositories, leesrechten op Contents, Issues, Pull requests, Actions en schrijfrecht op Issues. Meer gebruikt deze pagina niet.')}</p>
      <a className='gh-btn' href='https://github.com/settings/tokens' target='_blank' rel='noopener noreferrer'><ExternalLink size={14} />{tr('Токени на GitHub', 'Tokens op GitHub')}</a>
    </div>

    <McpAdresVeld tr={tr} ruimte={ruimte?.ruimte ?? 'prive'} />
  </section>;
}

export default function GitHubView({ tab, tr }: { tab: string; tr: Tr }) {
  // Koppelkaart: één verzoek met de staat én de gegevens van de sleutel in de kluis (zonder waarde). Daar is `status` dus niet
  // nodig: `koppeling` geeft dezelfde velden terug, plus de sleutel — zo blijft het bij één verzoek per tabblad.
  const status = useCall<Status>('status', tab === 'accounts' ? null : {}, tr, [tab]);
  const koppeling = useCall<GithubKoppelingFeiten>('koppeling', tab === 'accounts' ? {} : null, tr, [tab]);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string>(() => { try { return sessionStorage.getItem('mr.gh.repo') || ''; } catch { return ''; } });
  const pick = useCallback((full: string) => { setSelected(full); try { sessionStorage.setItem('mr.gh.repo', full); } catch { /* geen opslag */ } }, []);
  const connected = !!status.data?.connected;
  const needRepos = connected && ['overview', 'repositories', 'documentation'].includes(tab);
  const repos = useCall<{ repos: Repo[]; hasMore: boolean }>('repos', needRepos ? {} : null, tr, [tab, connected]);
  const filtered = useMemo(() => { const q = query.trim().toLowerCase(); return (repos.data?.repos ?? []).filter((r) => !q || `${r.fullName} ${r.description} ${r.language}`.toLowerCase().includes(q)); }, [repos.data, query]);

  const ruimteLang: 'uk' | 'nl' = tr('uk', 'nl') === 'uk' ? 'uk' : 'nl';
  if (status.loading && !status.data) return <div className="gh-root"><Busy tr={tr} /></div>;
  // Poort dicht: geen «koppel GitHub»-uitnodiging (die zou liegen), maar de echte reden uit de kern.
  if (status.gesloten) return <div className="gh-root"><RuimteGeslotenVlak gesloten={status.gesloten} lang={ruimteLang} /></div>;
  // Het tabblad «Облікові записи» is er juist voor het koppelen: het toont de kaart ook als er nog geen token is of GitHub hem weigerde.
  if (tab === 'accounts') return <div className="gh-root"><IntegratieStrook dienst='github' />
    <RuimteStrook feiten={koppeling.ruimte ?? null} lang={ruimteLang} />
    {koppeling.gesloten ? <RuimteGeslotenVlak gesloten={koppeling.gesloten} lang={ruimteLang} /> : null}
    <KoppelKaart tr={tr} onHerlaad={koppeling.reload} ruimte={koppeling.ruimte ?? null} rate={koppeling.rate}
      invoer={{ laden: koppeling.loading && !koppeling.data, fout: koppeling.code, feiten: koppeling.data }} />
  </div>;
  if (status.error) return <div className="gh-root"><Notice kind="error">{status.error}</Notice><button className="gh-btn" onClick={status.reload}><RefreshCw size={14} />{tr('Повторити', 'Opnieuw')}</button></div>;
  if (!connected) return <div className="gh-root"><section className="gh-card gh-connect">
    <Github size={38} /><h2>{tr('Підключіть GitHub', 'Koppel GitHub')}</h2>
    <p>{tr('Токен зберігається лише в зашифрованому сховищі ключів і ніколи не потрапляє в браузер чи в ШІ. Створіть персональний токен (classic: repo, read:project; або fine-grained з доступом до потрібних репозиторіїв) і додайте його.', 'De token staat alleen in de versleutelde sleutelkluis en komt nooit in de browser of bij de AI. Maak een persoonlijke token (classic: repo, read:project; of fine-grained met toegang tot de gewenste repositories) en voeg hem toe.')}</p>
    <ol><li>{tr('Відкрийте github.com → Settings → Developer settings → Personal access tokens.', 'Open github.com → Settings → Developer settings → Personal access tokens.')}</li><li>{tr('Кабінет → API-платформа → Сховище ключів → призначення «github».', 'Account → API-platform → Sleutelkluis → doel "github".')}</li><li>{tr('Поверніться сюди й натисніть «Перевірити».', 'Kom terug en klik op "Controleren".')}</li></ol>
    {/* G1 (audit 19.10.2026): één tokenbron — deze pagina én de GitHub-instrumenten van de AI-koppelingen lezen dezelfde kluissleutel (doel «github»). */}
    <p className="gh-sub">{tr('Той самий ключ використовують і інструменти GitHub у підключеннях ШІ (мій простір → Підключені ШІ): окремого токена для них немає.', 'Dezelfde sleutel gebruiken ook de GitHub-instrumenten van de AI-koppelingen: er is geen aparte token voor.')}</p>
    <div className="gh-actions"><button className="gh-btn gh-primary" onClick={openVault}><KeyRound size={14} />{tr('Відкрити сховище ключів', 'Sleutelkluis openen')}</button><button className="gh-btn" onClick={status.reload}><RefreshCw size={14} />{tr('Перевірити', 'Controleren')}</button>
      <a className="gh-btn" href={canonicalNavigationUrl('github', 'accounts', tr('uk', 'nl') === 'uk' ? 'uk' : 'nl')}><Plug size={14} />{tr('Картка підключення', 'Koppelkaart')}</a></div>
  </section></div>;

  const s = status.data as Status;
  const Header = <header className="gh-me">{s.avatar ? <img src={s.avatar} alt="" width={40} height={40} /> : <Github size={40} />}<div><strong>{s.name || s.login}</strong><span className="gh-sub">@{s.login} · {s.publicRepos} {tr('публічних', 'publiek')} · {s.privateRepos} {tr('приватних', 'privé')}</span></div>
    {status.rate && <span className="gh-sub gh-rate" title={tr('Залишок запитів до GitHub API', 'Resterende GitHub API-aanvragen')}>API: {status.rate.remaining}</span>}</header>;

  const repoList = <>
    <label className="gh-search"><Search size={14} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={tr('Фільтр репозиторіїв…', 'Repositories filteren…')} aria-label={tr('Фільтр репозиторіїв', 'Repositories filteren')} /></label>
    {repos.error ? <Notice kind="error">{repos.error}</Notice> : repos.loading && !repos.data ? <Busy tr={tr} /> : filtered.length ? <div className="gh-repos">{filtered.map((r) => <RepoRow key={r.fullName} r={r} active={selected === r.fullName} onPick={() => pick(r.fullName)} tr={tr} />)}</div> : <Empty>{tr('Репозиторіїв не знайдено.', 'Geen repositories gevonden.')}</Empty>}
  </>;

  return <div className="gh-root">
    {Header}
    {tab === 'overview' && <div className="gh-grid">
      <section className="gh-card"><h3>{tr('Останні репозиторії', 'Recente repositories')}</h3>{repos.loading && !repos.data ? <Busy tr={tr} /> : <div className="gh-repos">{(repos.data?.repos ?? []).slice(0, 6).map((r) => <RepoRow key={r.fullName} r={r} active={selected === r.fullName} onPick={() => pick(r.fullName)} tr={tr} />)}</div>}</section>
      <ActivityCard tr={tr} limit={6} />
      {selected && <section className="gh-card gh-wide"><RepoDetail repo={selected} tr={tr} /></section>}
    </div>}
    {tab === 'repositories' && <div className="gh-split"><section className="gh-card">{repoList}</section><section className="gh-card">{selected ? <RepoDetail repo={selected} tr={tr} /> : <Empty>{tr('Оберіть репозиторій зліва.', 'Kies links een repository.')}</Empty>}</section></div>}
    {tab === 'projects' && <ProjectsCard tr={tr} />}
    {tab === 'documentation' && <div className="gh-split"><section className="gh-card">{repoList}</section><section className="gh-card">{selected ? <Readme repo={selected} tr={tr} /> : <Empty>{tr('Оберіть репозиторій, щоб прочитати README.', 'Kies een repository om de README te lezen.')}</Empty>}</section></div>}
    {tab === 'research' && <SearchCard tr={tr} onPick={pick} />}
    {tab === 'activity' && <ActivityCard tr={tr} limit={30} />}
  </div>;
}

function ActivityCard({ tr, limit }: { tr: Tr; limit: number }) {
  const a = useCall<{ events: { id: string; type: string; repo: string; createdAt: string; summary: string }[] }>('activity', {}, tr, []);
  return <section className="gh-card"><h3>{tr('Активність', 'Activiteit')} <button className="gh-icon" onClick={a.reload} aria-label={tr('Оновити', 'Vernieuwen')}><RefreshCw size={14} /></button></h3>
    {a.error ? <Notice kind="error">{a.error}</Notice> : a.loading && !a.data ? <Busy tr={tr} /> : (a.data?.events ?? []).length ? <ul className="gh-list">{a.data!.events.slice(0, limit).map((e) => <li key={e.id} className="gh-item"><span className="gh-item-main"><strong>{e.summary}</strong><span className="gh-sub">{e.repo} · {ago(e.createdAt, tr)}</span></span></li>)}</ul> : <Empty>{tr('Подій ще немає.', 'Nog geen gebeurtenissen.')}</Empty>}</section>;
}

function ProjectsCard({ tr }: { tr: Tr }) {
  const p = useCall<{ projects: { id: string; title: string; description: string; url: string; closed: boolean; updatedAt: string; items: number }[] }>('projects', {}, tr, []);
  return <section className="gh-card"><h3>{tr('Проєкти GitHub', 'GitHub-projecten')}</h3>{p.error ? <Notice kind="error">{p.error}</Notice> : p.loading ? <Busy tr={tr} /> : (p.data?.projects ?? []).length ? <ul className="gh-list">{p.data!.projects.map((x) => <li key={x.id}><a className="gh-item" href={x.url} target="_blank" rel="noopener noreferrer"><BookOpen size={16} className="gh-muted" /><span className="gh-item-main"><strong>{x.title}{x.closed ? ` (${tr('закрито', 'gesloten')})` : ''}</strong><span className="gh-sub">{x.items} {tr('елементів', 'items')} · {ago(x.updatedAt, tr)}{x.description ? ` · ${x.description}` : ''}</span></span><ExternalLink size={13} className="gh-muted" /></a></li>)}</ul> : <Empty>{tr('Проєктів немає.', 'Geen projecten.')}</Empty>}</section>;
}

function Readme({ repo, tr }: { repo: string; tr: Tr }) {
  const r = useCall<{ name: string; text: string; truncated: boolean; url: string }>('readme', { repo }, tr, [repo]);
  return <section><header className="gh-detail-head"><h3>{repo} · README</h3>{r.data && <a href={r.data.url} className="gh-btn" target="_blank" rel="noopener noreferrer"><ExternalLink size={14} />GitHub</a>}</header>{r.error ? <Notice kind="error">{r.error}</Notice> : r.loading ? <Busy tr={tr} /> : <pre className="gh-readme">{r.data?.text}{r.data?.truncated ? `\n\n… ${tr('(скорочено)', '(ingekort)')}` : ''}</pre>}</section>;
}

function SearchCard({ tr, onPick }: { tr: Tr; onPick: (full: string) => void }) {
  const [q, setQ] = useState(''); const [type, setType] = useState<'repositories' | 'issues' | 'code'>('repositories');
  const [state, setState] = useState<{ loading: boolean; error: string; data: any | null }>({ loading: false, error: '', data: null });
  const run = async () => { setState({ loading: true, error: '', data: null }); try { setState({ loading: false, error: '', data: await call('search', { q, type }) }); } catch (e) { setState({ loading: false, error: errorText(e, tr), data: null }); } };
  return <section className="gh-card"><h3>{tr('Пошук у GitHub', 'Zoeken op GitHub')}</h3>
    <form className="gh-searchbar" onSubmit={(e) => { e.preventDefault(); void run(); }}>
      <label className="gh-search"><Search size={14} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr('Що шукаємо?', 'Wat zoeken we?')} aria-label={tr('Пошук', 'Zoeken')} /></label>
      <select value={type} onChange={(e) => setType(e.target.value as typeof type)} aria-label={tr('Тип', 'Type')}><option value="repositories">{tr('Репозиторії', 'Repositories')}</option><option value="issues">Issues / PR</option><option value="code">{tr('Код', 'Code')}</option></select>
      <button className="gh-btn gh-primary" disabled={q.trim().length < 2 || state.loading}>{state.loading ? <Loader2 size={14} className="gh-spin" /> : <Search size={14} />}{tr('Шукати', 'Zoeken')}</button></form>
    {state.error ? <Notice kind="error">{state.error}</Notice> : state.data && <>
      <p className="gh-sub">{tr(`Знайдено: ${state.data.total}`, `Gevonden: ${state.data.total}`)}</p>
      {state.data.type === 'repositories' ? <div className="gh-repos">{state.data.items.map((r: Repo) => <RepoRow key={r.fullName} r={r} active={false} onPick={() => onPick(r.fullName)} tr={tr} />)}</div>
        : state.data.type === 'issues' ? <ItemList items={state.data.items} tr={tr} />
        : <ul className="gh-list">{state.data.items.map((c: any, i: number) => <li key={i}><a className="gh-item" href={c.url} target="_blank" rel="noopener noreferrer"><span className="gh-item-main"><strong>{c.path}</strong><span className="gh-sub">{c.repo}</span></span><ExternalLink size={13} className="gh-muted" /></a></li>)}</ul>}</>}
  </section>;
}
