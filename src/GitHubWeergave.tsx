import { useCallback, useEffect, useMemo, useState } from 'react';
import IntegratieStrook from './integraties/IntegratieStrook'; // UI-013 fase 2: gedeelde verbindingenstrook (vlag integraties-catalogus-v2)
import { AlertTriangle, BookOpen, Check, CheckCircle2, CircleDot, Clock, Code2, Copy, ExternalLink, FolderGit2, GitBranch, GitCommit, GitFork, GitPullRequest, Github, KeyRound, Loader2, MessageSquarePlus, Package, PlayCircle, Plug, Plus, Radio, RefreshCw, Search, ServerCog, Settings, ShieldCheck, Star, Unplug, XCircle } from 'lucide-react';
import { api, ApiError } from './platform/client';
import { ecosystemTabContext } from './tab-context';
import { emitCanonicalNotice } from './canoniek-meldingen';
import { openVault } from './AIDienstWeergave';
import { canonicalNavigationUrl, writeLocalTab } from './canoniek-navigatie';
import Merk from './merk/Merk';
import {
  GITHUB_MCP_URL, GITHUB_OAUTH_FOUTEN, GITHUB_RECHTEN, KOPPEL_PADEN, VIA_NAAM, geldigeMcpUrl, koppelPad, koppelKaartStaat, padKnopActief, sleutelkluisOntgrendelAdres,
  type GithubKoppelingFeiten, type KaartInvoer, type KoppelPad,
} from '../shared/github-koppeling';
import type { GithubEenklikFeiten } from '../shared/github-werkruimte';
import { staatTekst } from '../shared/kluis-meta';
import { isVaultDoel, type VaultDoel } from '../shared/geheimen';
import { GeheimVenster } from './geheimen/GeheimFormulier';
import { RuimteGeslotenVlak, RuimteStrook } from './RuimteStrook';
import { ruimteFeitenUit, ruimteGeslotenUit, type RuimteFeiten, type RuimteGesloten } from '../shared/ruimte-weergave';
import { MaquetteAnkerRail, MaquetteHeld, type MaquetteAnkerItem, type MaquetteHeldStatistiek } from './maquette-kern';
import { useIsMaquette } from './thema/useThema';
import { GhDialoog, ghFoutTekst, ghPost } from './github/github-client';
import EenklikKoppelPaneel from './github/EenklikKoppelPaneel';
import CodeEnEditorPaneel from './github/CodeEnEditorPaneel';
import ZakenEnSamenvoegingenPaneel from './github/ZakenEnSamenvoegingenPaneel';
import ActiesEnUitgavenPaneel from './github/ActiesEnUitgavenPaneel';
import SpiegelEnBrugPaneel from './github/SpiegelEnBrugPaneel';
import './github-weergave.css';
import './github/github-overzicht-maquette.css';

type Tr = (uk: string, nl: string) => string;
type Repo = { fullName: string; name: string; description: string; language: string; stars: number; forks: number; openIssues: number; private: boolean; archived: boolean; pushedAt: string; url: string; defaultBranch: string; fork: boolean; homepage?: string; topics?: string[] };
type Item = { number: number; title: string; state: string; isPull: boolean; draft: boolean; author: string; comments: number; labels: { name: string; color: string }[]; updatedAt: string; url: string; body: string };
type Status = { connected: boolean; login?: string; name?: string; avatar?: string; url?: string; publicRepos?: number; privateRepos?: number; followers?: number; eenklik?: GithubEenklikFeiten };
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
    <div className="gh-tabs" role="tablist" data-no-edge-swipe>{([['issues', tr('Issues', 'Issues'), CircleDot], ['pulls', 'Pull requests', GitPullRequest], ['commits', 'Commits', GitCommit], ['actions', 'CI / Actions', PlayCircle]] as const).map(([id, label, Icon]) =>
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
          <span className="gh-item-main"><strong>{r.name}</strong><span className="gh-sub">{r.branch} · {r.event} · {String(r.sha || '').slice(0, 7)} · {r.conclusion || r.status} · {ago(r.updatedAt, tr)}</span></span></a></li>)}</ul></>
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
  const [actieFoutCode, setActieFoutCode] = useState('');
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
    setBezig(pad.id); setActieFout(''); setActieFoutCode('');
    try {
      if (pad.actie === 'oauth') {
        const uit = await call('oauth/start');
        const adres = String(uit?.authUrl || '');
        if (!adres.startsWith('https://github.com/login/oauth/authorize')) throw new Error('GITHUB_OAUTH_AFGEWEZEN');
        window.location.assign(adres);
        return;
      }
      if (pad.actie === 'app') { await call('app/verbinden', {}); onHerlaad(); }
    } catch (e) { setActieFoutCode(foutCode(e)); setActieFout(errorText(e, tr)); } finally { setBezig(''); }
  };

  /** Ontkoppelen: de server trekt de token bij GitHub in (OAuth) en verwijdert het record. */
  const ontkoppel = async () => {
    const weg = staat.via === 'app' ? 'app' : 'oauth';
    if (staat.via === 'pat' || !staat.via) { openVault(); return; }
    if (!window.confirm(tr('Відключити GitHub і відкликати токен на GitHub?', 'GitHub ontkoppelen en de token bij GitHub intrekken?'))) return;
    setBezig('ontkoppel'); setActieFout(''); setActieFoutCode('');
    try { await call('ontkoppelen', { weg }); onHerlaad(); } catch (e) { setActieFoutCode(foutCode(e)); setActieFout(errorText(e, tr)); } finally { setBezig(''); }
  };

  const vernieuw = async () => {
    setBezig('vernieuw'); setActieFout(''); setActieFoutCode('');
    try { await call('oauth/vernieuwen'); onHerlaad(); } catch (e) { setActieFoutCode(foutCode(e)); setActieFout(errorText(e, tr)); } finally { setBezig(''); }
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
  const kluisDicht = staat.reden === 'SLEUTELKLUIS_GESLOTEN' || terugkeer === 'SLEUTELKLUIS_GESLOTEN' || actieFoutCode === 'SLEUTELKLUIS_GESLOTEN';
  return <section className='gh-card gh-koppel' aria-label='GitHub' data-gh-dialoog-open={kluisDoel ? '1' : undefined}>
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
    {kluisDicht ? <div className='gh-actions'>
      <a className='gh-btn gh-primary' href={sleutelkluisOntgrendelAdres(window.location.origin)}><KeyRound size={14} />{tr('Відкрити сховище ключів', 'Sleutelkluis ontgrendelen')}</a>
    </div> : null}

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

function RepoWerkbalk({
  repos,
  actieveRepo,
  tab,
  tr,
  onKiesRepo,
  onVernieuwRepos,
  onGaNaarTab,
}: {
  repos: Repo[];
  actieveRepo: string;
  tab: string;
  tr: Tr;
  onKiesRepo: (fullName: string) => void;
  onVernieuwRepos: () => void;
  onGaNaarTab: (doelTab: string) => void;
}) {
  const huidig = useMemo(() => repos.find((r) => r.fullName === actieveRepo) ?? null, [repos, actieveRepo]);
  const [nieuwOpen, setNieuwOpen] = useState(false);
  const [nieuwNaam, setNieuwNaam] = useState('');
  const [nieuwOmschrijving, setNieuwOmschrijving] = useState('');
  const [nieuwPrive, setNieuwPrive] = useState(true);
  const [nieuwInit, setNieuwInit] = useState(true);
  const [nieuwGitignore, setNieuwGitignore] = useState('');
  const [nieuwLicentie, setNieuwLicentie] = useState('');

  const [instelOpen, setInstelOpen] = useState(false);
  const [instelOmschrijving, setInstelOmschrijving] = useState('');
  const [instelStartpagina, setInstelStartpagina] = useState('');
  const [instelStandaardTak, setInstelStandaardTak] = useState('');
  const [instelOnderwerpen, setInstelOnderwerpen] = useState('');
  const [instelArchief, setInstelArchief] = useState(false);

  const [gesterd, setGesterd] = useState(false);
  const [bezigActie, setBezigActie] = useState('');
  const [fout, setFout] = useState('');

  const openInstellingen = () => {
    if (!huidig) return;
    setInstelOmschrijving(huidig.description || '');
    setInstelStartpagina(huidig.homepage || '');
    setInstelStandaardTak(huidig.defaultBranch || 'main');
    setInstelOnderwerpen((huidig.topics ?? []).join(', '));
    setInstelArchief(Boolean(huidig.archived));
    setFout('');
    setInstelOpen(true);
  };

  const maakRepo = async () => {
    setBezigActie('maken');
    setFout('');
    try {
      const uit = await ghPost<{ repo: Repo }>('repo/create', {
        name: nieuwNaam.trim(),
        description: nieuwOmschrijving.trim(),
        private: nieuwPrive,
        autoInit: nieuwInit,
        gitignoreTemplate: nieuwGitignore || undefined,
        licenseTemplate: nieuwLicentie || undefined,
      });
      setNieuwOpen(false);
      setNieuwNaam('');
      setNieuwOmschrijving('');
      onVernieuwRepos();
      if (uit.repo?.fullName) onKiesRepo(uit.repo.fullName);
      emitCanonicalNotice({
        text: tr(`Сховище ${uit.repo?.fullName || ''} створено`, `Opslagplaats ${uit.repo?.fullName || ''} aangemaakt`),
        kind: 'success',
        source: 'github',
        retain: true,
      });
    } catch (e) {
      setFout(ghFoutTekst(e, tr));
    } finally {
      setBezigActie('');
    }
  };

  const bewaarInstellingen = async () => {
    if (!actieveRepo) return;
    setBezigActie('instellen');
    setFout('');
    try {
      const onderwerpen = instelOnderwerpen
        .split(',')
        .map((x) => x.trim().toLowerCase())
        .filter(Boolean);
      await ghPost('repo/update', {
        repo: actieveRepo,
        description: instelOmschrijving,
        homepage: instelStartpagina,
        defaultBranch: instelStandaardTak || undefined,
        topics: onderwerpen,
        archived: instelArchief,
      });
      setInstelOpen(false);
      onVernieuwRepos();
      emitCanonicalNotice({
        text: tr(`Налаштування ${actieveRepo} збережено`, `Instellingen van ${actieveRepo} opgeslagen`),
        kind: 'success',
        source: 'github',
      });
    } catch (e) {
      setFout(ghFoutTekst(e, tr));
    } finally {
      setBezigActie('');
    }
  };

  const wisselSter = async () => {
    if (!actieveRepo) return;
    setBezigActie('ster');
    setFout('');
    try {
      const doel = !gesterd;
      await ghPost('repo/star', { repo: actieveRepo, starred: doel });
      setGesterd(doel);
    } catch (e) {
      setFout(ghFoutTekst(e, tr));
    } finally {
      setBezigActie('');
    }
  };

  const splitsRepoAf = async () => {
    if (!actieveRepo) return;
    if (!window.confirm(tr(`Створити власне відгалуження сховища ${actieveRepo}?`, `Een eigen afsplitsing maken van ${actieveRepo}?`))) return;
    setBezigActie('fork');
    setFout('');
    try {
      const uit = await ghPost<{ repo: Repo }>('repo/fork', { repo: actieveRepo });
      onVernieuwRepos();
      if (uit.repo?.fullName) onKiesRepo(uit.repo.fullName);
      emitCanonicalNotice({
        text: tr(`Створено відгалуження ${uit.repo?.fullName || ''}`, `Afsplitsing ${uit.repo?.fullName || ''} aangemaakt`),
        kind: 'success',
        source: 'github',
        retain: true,
      });
    } catch (e) {
      setFout(ghFoutTekst(e, tr));
    } finally {
      setBezigActie('');
    }
  };

  return <section className="gh-card gh-repo-balk" aria-label={tr('Активне сховище', 'Actieve opslagplaats')} data-gh-dialoog-open={nieuwOpen || instelOpen ? '1' : undefined}>
    <div className="gh-werkbalk">
      <div className="gh-werkbalk-groep">
        <label className="gh-select-wikkel" aria-label={tr('Активне сховище', 'Actieve opslagplaats')}>
          <FolderGit2 size={15} />
          <select value={actieveRepo} onChange={(e) => onKiesRepo(e.target.value)} disabled={repos.length === 0}>
            {repos.length === 0 ? <option value="">{tr('Немає сховищ', 'Geen opslagplaatsen')}</option> : null}
            {repos.map((r) => <option key={r.fullName} value={r.fullName}>{r.fullName}{r.private ? ' · 🔒' : ''}</option>)}
          </select>
        </label>
        {huidig ? <span className={huidig.private ? 'gh-chip gh-chip-warn' : 'gh-chip'}>{huidig.private ? tr('приватне', 'besloten') : tr('публічне', 'openbaar')}</span> : null}
        {huidig?.defaultBranch ? <span className="gh-chip"><GitBranch size={12} /> {huidig.defaultBranch}</span> : null}
      </div>

      <div className="gh-werkbalk-groep">
        <button type="button" className="gh-btn gh-primary" data-gh-nieuw-repo="1" onClick={() => { setFout(''); setNieuwOpen(true); }}>
          <Plus size={14} /> {tr('Нове сховище', 'Nieuwe opslagplaats')}
        </button>
        {actieveRepo ? <>
          <button type="button" className="gh-btn" disabled={Boolean(bezigActie)} onClick={() => void wisselSter()}>
            <Star size={14} className={gesterd ? 'gh-ok' : ''} /> {gesterd ? tr('Відзначено', 'Gemarkeerd') : tr('Зірочка', 'Ster')}
          </button>
          <button type="button" className="gh-btn" disabled={Boolean(bezigActie)} onClick={() => void splitsRepoAf()}>
            {bezigActie === 'fork' ? <Loader2 size={14} className="gh-spin" /> : <GitFork size={14} />}
            {tr('Відгалужити', 'Afsplitsen')}
          </button>
          <button type="button" className="gh-btn" onClick={openInstellingen}>
            <Settings size={14} /> {tr('Налаштування сховища', 'Opslagplaatsinstellingen')}
          </button>
          <a className="gh-btn" href={`https://github.com/${actieveRepo}`} target="_blank" rel="noopener noreferrer">
            <ExternalLink size={14} /> GitHub
          </a>
        </> : null}
      </div>
    </div>

    <GhAfdelingNav tab={tab} tr={tr} onGaNaarTab={onGaNaarTab} />

    {fout && !nieuwOpen && !instelOpen ? <Notice kind="error">{fout}</Notice> : null}

    <GhDialoog open={nieuwOpen} titel={tr('Створити нове сховище на GitHub', 'Nieuwe opslagplaats op GitHub aanmaken')} onSluit={() => setNieuwOpen(false)} tr={tr}>
      <div className="gh-form">
        {fout ? <Notice kind="error">{fout}</Notice> : null}
        <label className="gh-sub" htmlFor="gh-nieuw-repo-naam">{tr('Назва сховища (латинські літери, цифри, дефіс):', 'Naam van de opslagplaats (letters, cijfers, koppelteken):')}</label>
        <input id="gh-nieuw-repo-naam" value={nieuwNaam} onChange={(e) => setNieuwNaam(e.target.value)} placeholder="mijn-project" spellCheck={false} />
        <label className="gh-sub" htmlFor="gh-nieuw-repo-omschr">{tr('Короткий опис (необов’язково):', 'Korte beschrijving (optioneel):')}</label>
        <input id="gh-nieuw-repo-omschr" value={nieuwOmschrijving} onChange={(e) => setNieuwOmschrijving(e.target.value)} placeholder={tr('Призначення сховища', 'Doel van de opslagplaats')} />
        <div className="gh-keuze-rij">
          <label className="gh-radio">
            <input type="radio" checked={nieuwPrive} onChange={() => setNieuwPrive(true)} />
            <span>{tr('Приватне (лише у вашому ізольованому просторі)', 'Besloten (alleen zichtbaar voor u)')}</span>
          </label>
          <label className="gh-radio">
            <input type="radio" checked={!nieuwPrive} onChange={() => setNieuwPrive(false)} />
            <span>{tr('Публічне (відкрите всім)', 'Openbaar (voor iedereen leesbaar)')}</span>
          </label>
        </div>
        <label className="gh-radio">
          <input type="checkbox" checked={nieuwInit} onChange={(e) => setNieuwInit(e.target.checked)} />
          <span>{tr('Одразу додати початковий файл README.md', 'Direct een startbestand README.md aanmaken')}</span>
        </label>
        <div className="gh-werkbalk">
          <label className="gh-veld-inline">
            <span>.gitignore:</span>
            <select value={nieuwGitignore} onChange={(e) => setNieuwGitignore(e.target.value)}>
              <option value="">{tr('Без шаблону', 'Geen sjabloon')}</option>
              <option value="Node">Node</option>
              <option value="Python">Python</option>
              <option value="Go">Go</option>
              <option value="Rust">Rust</option>
            </select>
          </label>
          <label className="gh-veld-inline">
            <span>{tr('Ліцензія:', 'Licentie:')}</span>
            <select value={nieuwLicentie} onChange={(e) => setNieuwLicentie(e.target.value)}>
              <option value="">{tr('Без ліцензії', 'Geen licentie')}</option>
              <option value="mit">MIT</option>
              <option value="apache-2.0">Apache 2.0</option>
              <option value="gpl-3.0">GPL 3.0</option>
              <option value="bsd-3-clause">BSD 3-Clause</option>
            </select>
          </label>
        </div>
        <div className="gh-actions">
          <button type="button" className="gh-btn gh-primary" disabled={bezigActie === 'maken' || !nieuwNaam.trim()} onClick={() => void maakRepo()}>
            {bezigActie === 'maken' ? <Loader2 size={14} className="gh-spin" /> : <Plus size={14} />}
            {tr('Створити сховище', 'Opslagplaats aanmaken')}
          </button>
        </div>
      </div>
    </GhDialoog>

    <GhDialoog open={instelOpen} titel={tr(`Налаштування сховища ${actieveRepo}`, `Instellingen van ${actieveRepo}`)} onSluit={() => setInstelOpen(false)} tr={tr}>
      <div className="gh-form">
        {fout ? <Notice kind="error">{fout}</Notice> : null}
        <label className="gh-sub" htmlFor="gh-instel-omschr">{tr('Опис сховища:', 'Beschrijving van de opslagplaats:')}</label>
        <input id="gh-instel-omschr" value={instelOmschrijving} onChange={(e) => setInstelOmschrijving(e.target.value)} />
        <label className="gh-sub" htmlFor="gh-instel-url">{tr('Адреса сайту проєкту:', 'Website van het project:')}</label>
        <input id="gh-instel-url" value={instelStartpagina} onChange={(e) => setInstelStartpagina(e.target.value)} placeholder="https://" spellCheck={false} />
        <label className="gh-sub" htmlFor="gh-instel-tak">{tr('Типова гілка:', 'Standaardtak:')}</label>
        <input id="gh-instel-tak" value={instelStandaardTak} onChange={(e) => setInstelStandaardTak(e.target.value)} spellCheck={false} />
        <label className="gh-sub" htmlFor="gh-instel-topics">{tr('Теми сховища (через кому):', 'Onderwerpen (gescheiden door komma):')}</label>
        <input id="gh-instel-topics" value={instelOnderwerpen} onChange={(e) => setInstelOnderwerpen(e.target.value)} placeholder="mijn-ruimte, zelfhostend" spellCheck={false} />
        <label className="gh-radio">
          <input type="checkbox" checked={instelArchief} onChange={(e) => setInstelArchief(e.target.checked)} />
          <span>{tr('Перевести сховище в архівний режим (лише для читання)', 'Opslagplaats archiveren (alleen-lezen)')}</span>
        </label>
        <div className="gh-actions">
          <button type="button" className="gh-btn gh-primary" disabled={bezigActie === 'instellen'} onClick={() => void bewaarInstellingen()}>
            {bezigActie === 'instellen' ? <Loader2 size={14} className="gh-spin" /> : <Check size={14} />}
            {tr('Зберегти зміни', 'Wijzigingen opslaan')}
          </button>
        </div>
      </div>
    </GhDialoog>
  </section>;
}

function GhAfdelingNav({ tab, tr, onGaNaarTab }: { tab: string; tr: Tr; onGaNaarTab: (t: string) => void }) {
  const alleAfdelingen: Array<[string, string, typeof Github]> = [
    ['overview', tr('Огляд', 'Overzicht'), FolderGit2],
    ['repositories', tr('Сховища', 'Opslagplaatsen'), Github],
    ['code', tr('Код і редактор', 'Code en editor'), Code2],
    ['issues', tr('Задачі', 'Vraagstukken'), CircleDot],
    ['pulls', tr('Запити на злиття', 'Samenvoegingen'), GitPullRequest],
    ['actions', tr('Конвеєри дій', 'Werkstromen'), PlayCircle],
    ['releases', tr('Випуски й розгортання', 'Uitgaven en uitrol'), Package],
    ['sync', tr('Двосторонній міст', 'Tweerichtingsspiegel'), Radio],
    ['projects', tr('Проєкти', 'Projecten'), BookOpen],
    ['documentation', tr('Документація', 'Documentatie'), BookOpen],
    ['research', tr('Пошук', 'Zoeken'), Search],
    ['activity', tr('Активність', 'Activiteit'), Clock],
    ['accounts', tr('Підключення', 'Koppeling'), Plug],
  ];
  return (
    <nav className="gh-snel-nav" data-no-edge-swipe aria-label={tr('Розділи робочого простору GitHub', 'Onderdelen van de GitHub-werkruimte')}>
      {alleAfdelingen.map(([id, naam, Icoon]) => (
        <button
          key={id}
          type="button"
          className={`gh-snel-pil${tab === id ? ' is-actief' : ''}`}
          aria-current={tab === id ? 'page' : undefined}
          onClick={() => onGaNaarTab(id)}
        >
          <Icoon size={14} />
          <span>{naam}</span>
        </button>
      ))}
    </nav>
  );
}

const WERKRUIMTE_TABS = new Set(['overview', 'repositories', 'code', 'issues', 'pulls', 'actions', 'releases', 'sync', 'documentation']);
const VOLLEDIG_MAQUETTE_TABS: ReadonlySet<string> = new Set(['overview', 'repositories', 'accounts']);
const GH_MODAAL_SELECTOR = '.geheim-venster-laag, [data-gh-dialoog-open], [role="dialog"][aria-modal="true"], dialog.gh-dialoog[open], .gm-venster';

type GhHeldInhoud = {
  boven: readonly [string, string];
  voor: readonly [string, string];
  cursief: readonly [string, string];
  beschrijving: readonly [string, string];
};

const GH_MAQUETTE_TEKST: Record<string, GhHeldInhoud> = {
  overview: {
    boven: ['ПРОСТІР КОДУ · ОГЛЯД', 'CODERUIMTE · OVERZICHT'],
    voor: ['Ваші сховища й розробка в', 'Uw opslagplaatsen en code in'],
    cursief: ['інженерному ладі', 'heldere samenhang'],
    beschrijving: [
      'Живий зріз вашого простору розробки: останні сховища, відкриті задачі, хід конвеєрів перевірки та події без зайвих переходів.',
      'Actueel overzicht van uw ontwikkelruimte: recente opslagplaatsen, openstaande vraagstukken, werkstromen en gebeurtenissen op één plek.',
    ],
  },
  repositories: {
    boven: ['ПРОСТІР КОДУ · СХОВИЩА', 'CODERUIMTE · OPSLAGPLAATSEN'],
    voor: ['Публічні та закриті', 'Openbare en besloten'],
    cursief: ['сховища коду', 'opslagplaatsen'],
    beschrijving: [
      'Миттєвий відбір за назвою й мовою, створення нових сховищ, відгалуження, гілки та зведення стану кожного проєкту.',
      'Direct filteren op naam en taal, nieuwe opslagplaatsen aanmaken, afsplitsen, takken beheren en projectfeiten inzien.',
    ],
  },
  code: {
    boven: ['ПРОСТІР КОДУ · РЕДАКТОР', 'CODERUIMTE · CODE EN EDITOR'],
    voor: ['Дерево файлів і чисте', 'Bestandsboom en zuiver'],
    cursief: ['редагування коду', 'codewerk'],
    beschrijving: [
      'Перегляд гілок, читання й редагування вихідного коду та охайна фіксація змін просто з вашого робочого простору.',
      'Takken verkennen, broncode lezen en bewerken en wijzigingen rechtstreeks vanuit uw werkruimte vastleggen.',
    ],
  },
  issues: {
    boven: ['ПРОСТІР КОДУ · ЗАДАЧІ', 'CODERUIMTE · VRAAGSTUKKEN'],
    voor: ['Відкриті задачі та', 'Openstaande vraagstukken en'],
    cursief: ['ясні пріоритети', 'heldere prioriteiten'],
    beschrijving: [
      'Ведіть облік задач і обговорень обраного сховища, відбирайте за мітками й станом та створюйте нові звернення.',
      'Volg vraagstukken en besprekingen van de gekozen opslagplaats, filter op labels en status en maak nieuwe meldingen aan.',
    ],
  },
  pulls: {
    boven: ['ПРОСТІР КОДУ · ЗЛИТТЯ', 'CODERUIMTE · SAMENVOEGINGEN'],
    voor: ['Запити на злиття та', 'Samenvoegingsverzoeken en'],
    cursief: ['зважений перегляд', 'zorgvuldige beoordeling'],
    beschrijving: [
      'Переглядайте запропоновані зміни між гілками, порівнюйте різницю рядків і проводьте перевірку перед злиттям.',
      'Bekijk voorgestelde wijzigingen tussen takken, vergelijk regelverschillen en voer controles uit vóór het samenvoegen.',
    ],
  },
  actions: {
    boven: ['ПРОСТІР КОДУ · КОНВЕЄРИ', 'CODERUIMTE · WERKSTROMEN'],
    voor: ['Автоматичні перевірки й', 'Automatische controles en'],
    cursief: ['хід складань', 'actuele doorlopen'],
    beschrijving: [
      'Спостерігайте за виконанням конвеєрів дій, станом перевірок і журналами кроків для кожної гілки сховища.',
      'Volg de uitvoering van werkstromen, controlestatussen en stapverslagen voor elke tak van de opslagplaats.',
    ],
  },
  releases: {
    boven: ['ПРОСТІР КОДУ · ВИПУСКИ', 'CODERUIMTE · UITGAVEN'],
    voor: ['Випуски версій та', 'Versie-uitgaven en'],
    cursief: ['контроль розгортання', 'geordende uitrol'],
    beschrijving: [
      'Перелік опублікованих версій, супровідних пакунків і середовищ розгортання обраного сховища.',
      'Overzicht van gepubliceerde versies, bijbehorende pakketten en uitrolomgevingen van de gekozen opslagplaats.',
    ],
  },
  sync: {
    boven: ['ПРОСТІР КОДУ · МІСТ', 'CODERUIMTE · TWEERICHTINGSSPIEGEL'],
    voor: ['Двосторонній міст і', 'Tweerichtingsspiegel en'],
    cursief: ['живе дзеркало', 'levende synchronisatie'],
    beschrijving: [
      'Узгоджена робота власного сервера з віддаленими сховищами в ізольованому просторі без втрати контролю.',
      'Afgestemde werking tussen uw eigen server en externe opslagplaatsen binnen een geïsoleerde ruimte.',
    ],
  },
  projects: {
    boven: ['ПРОСТІР КОДУ · ПРОЄКТИ', 'CODERUIMTE · PROJECTEN'],
    voor: ['Дошки планування та', 'Planningsborden en'],
    cursief: ['спільний поступ', 'gezamenlijke voortgang'],
    beschrijving: [
      'Огляд проєктних дощок вашого облікового запису з кількістю елементів, станом і швидким переходом.',
      'Overzicht van de projectborden van uw account met aantallen onderdelen, status en directe doorgang.',
    ],
  },
  documentation: {
    boven: ['ПРОСТІР КОДУ · ДОКУМЕНТАЦІЯ', 'CODERUIMTE · DOCUMENTATIE'],
    voor: ['Описи сховищ і чисте', 'Projectbeschrijvingen en rustig'],
    cursief: ['читання настанов', 'naslagwerk lezen'],
    beschrijving: [
      'Спокійне студійне читання головних сторінок документації кожного вашого сховища без візуального шуму.',
      'Rustige studio-weergave van de hoofddocumentatie van elke opslagplaats zonder visuele ruis.',
    ],
  },
  research: {
    boven: ['ПРОСТІР КОДУ · ПОШУК', 'CODERUIMTE · ZOEKEN'],
    voor: ['Глибокий пошук серед', 'Gericht zoeken door'],
    cursief: ['сховищ і коду', 'opslagplaatsen en code'],
    beschrijving: [
      'Шукайте потрібні сховища, обговорення задач і фрагменти вихідного коду в одному узгодженому вікні.',
      'Doorzoek opslagplaatsen, vraagstukken en broncodefragmenten vanuit één overzichtelijk venster.',
    ],
  },
  activity: {
    boven: ['ПРОСТІР КОДУ · ПОДІЇ', 'CODERUIMTE · ACTIVITEIT'],
    voor: ['Хроніка змін і живий', 'Tijdslijn van wijzigingen en'],
    cursief: ['ритм розробки', 'ontwikkelritme'],
    beschrijving: [
      'Послідовний літопис останніх дій у ваших сховищах: фіксації змін, гілки, випуски та обговорення.',
      'Chronologisch overzicht van recente handelingen in uw opslagplaatsen: vastleggingen, takken, uitgaven en besprekingen.',
    ],
  },
  accounts: {
    boven: ['ПРОСТІР КОДУ · З’ЄДНАННЯ', 'CODERUIMTE · KOPPELING'],
    voor: ['Захищений міст під', 'Beschermde koppeling onder'],
    cursief: ['вашим контролем', 'uw eigen beheer'],
    beschrijving: [
      'Швидке приєднання в один натиск або через захищене сховище ключів: ключі доступу зашифровані на сервері й ніколи не передаються назовні.',
      'Snel koppelen in één klik of via de versleutelde sleutelkluis: toegangssleutels blijven op de server en verlaten uw ruimte nooit.',
    ],
  },
  nietGekoppeld: {
    boven: ['ПРОСТІР КОДУ · ПРИЄДНАННЯ', 'CODERUIMTE · VERBINDEN'],
    voor: ['Приєднайте сховища в', 'Verbind uw opslagplaatsen in'],
    cursief: ['один натиск', 'één bevestiging'],
    beschrijving: [
      'Відкрийте доступ до ваших сховищ, коду, задач і конвеєрів перевірки в ізольованому шифрованому контурі без ручного копіювання ключів.',
      'Open toegang tot uw opslagplaatsen, broncode, vraagstukken en werkstromen in een geïsoleerde versleutelde omgeving zonder handmatige sleutels.',
    ],
  },
};

const GH_ANKER_AFDELINGEN: ReadonlyArray<readonly [string, string, string]> = [
  ['overview', 'Огляд', 'Overzicht'],
  ['repositories', 'Сховища', 'Opslagplaatsen'],
  ['code', 'Код і редактор', 'Code en editor'],
  ['issues', 'Задачі', 'Vraagstukken'],
  ['pulls', 'Запити на злиття', 'Samenvoegingen'],
  ['actions', 'Конвеєри дій', 'Werkstromen'],
  ['releases', 'Випуски й розгортання', 'Uitgaven en uitrol'],
  ['sync', 'Двосторонній міст', 'Tweerichtingsspiegel'],
  ['projects', 'Проєкти', 'Projecten'],
  ['documentation', 'Документація', 'Documentatie'],
  ['research', 'Пошук', 'Zoeken'],
  ['activity', 'Активність', 'Activiteit'],
  ['accounts', 'Підключення', 'Koppeling'],
];

const GH_STAT_LABEL = {
  openbaar: ['публічних сховищ', 'openbare opslag'] as const,
  besloten: ['приватних сховищ', 'besloten opslag'] as const,
  openZaken: ['відкритих задач', 'open vraagstukken'] as const,
  aanvragen: ['залишок запитів', 'resterende aanvragen'] as const,
  verbinding: ['стан з’єднання', 'verbindingsstatus'] as const,
  gekoppeld: ['Підключено', 'Gekoppeld'] as const,
  nietGekoppeld: ['Очікує', 'Wacht'] as const,
  koppelwegen: ['захищені шляхи', 'veilige koppelwegen'] as const,
  sleutelkluis: ['сховище ключів', 'sleutelkluis'] as const,
  geisoleerd: ['Ізольовано', 'Geïsoleerd'] as const,
  railTitel: ['Розділи простору', 'Onderdelen'],
  railOndertitel: ['13 розділів коду', '13 code-onderdelen'],
  naarCode: ['До коду й редактора', 'Naar code en editor'],
  nieuwRepo: ['Нове сховище', 'Nieuwe opslagplaats'],
  openCode: ['Відкрити код', 'Code openen'],
  naarPulls: ['Запити на злиття', 'Samenvoegingen'],
  alleRepos: ['Усі сховища', 'Alle opslagplaatsen'],
  naarOverzicht: ['До огляду сховищ', 'Naar overzicht'],
  controleerStaat: ['Перевірити стан', 'Status controleren'],
  eenklikKoppelen: ['Приєднати в 1 натиск', 'In 1 klik koppelen'],
  openSleutelkluis: ['Сховище ключів', 'Sleutelkluis'],
  koppelkaart: ['Картка підключення', 'Koppelkaart'],
} as const;

function GhMaquetteSchil({
  actief,
  voor,
  children,
}: {
  actief: boolean;
  voor?: React.ReactNode;
  children: React.ReactNode;
}) {
  if (!actief) return <>{children}</>;
  return (
    <div className="mq-schil gh-maquette-wikkel" data-mq-dienst="github">
      {voor}
      {children}
    </div>
  );
}

export default function GitHubView({ tab, tr }: { tab: string; tr: Tr }) {
  // Koppelkaart: één verzoek met de staat én de gegevens van de sleutel in de kluis (zonder waarde). Daar is `status` dus niet
  // nodig: `koppeling` geeft dezelfde velden terug, plus de sleutel — zo blijft het bij één verzoek per tabblad.
  const isMaquette = useIsMaquette();
  const status = useCall<Status>('status', tab === 'accounts' ? null : {}, tr, [tab]);
  const koppeling = useCall<GithubKoppelingFeiten>('koppeling', tab === 'accounts' ? {} : null, tr, [tab]);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string>(() => { try { return sessionStorage.getItem('mr.gh.repo') || ''; } catch { return ''; } });
  const [splitMobielPaneel, setSplitMobielPaneel] = useState<'lijst' | 'detail'>('lijst');
  const [dialoogOpen, setDialoogOpen] = useState(false);
  const pick = useCallback((full: string) => { setSelected(full); try { sessionStorage.setItem('mr.gh.repo', full); } catch { /* geen opslag */ } }, []);
  const ruimteLang: 'uk' | 'nl' = tr('uk', 'nl') === 'uk' ? 'uk' : 'nl';
  const taalIdx: 0 | 1 = ruimteLang === 'uk' ? 0 : 1;
  const gaNaarTab = useCallback((doelTab: string) => {
    writeLocalTab('github', doelTab, ruimteLang);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, [ruimteLang]);

  const openNieuwRepoDialoog = useCallback(() => {
    const knop = document.querySelector<HTMLButtonElement>('[data-gh-nieuw-repo="1"]');
    if (knop) {
      knop.click();
      return;
    }
    gaNaarTab('repositories');
  }, [gaNaarTab]);

  const startSnelleKoppeling = useCallback(() => {
    const knop = document.querySelector<HTMLButtonElement>('[data-gh-eenklik-start="1"]');
    if (knop && !knop.disabled) {
      knop.click();
      return;
    }
    gaNaarTab('accounts');
  }, [gaNaarTab]);

  useEffect(() => {
    if (!isMaquette || typeof document === 'undefined') {
      setDialoogOpen(false);
      return;
    }
    const controleer = () => {
      setDialoogOpen(Boolean(document.querySelector(GH_MODAAL_SELECTOR)));
    };
    controleer();
    const waarnemer = new MutationObserver(controleer);
    waarnemer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['open', 'hidden', 'class', 'aria-modal', 'data-gh-dialoog-open'],
    });
    return () => waarnemer.disconnect();
  }, [isMaquette, tab]);

  const connected = !!status.data?.connected;
  const needRepos = connected && WERKRUIMTE_TABS.has(tab);
  const repos = useCall<{ repos: Repo[]; hasMore: boolean }>('repos', needRepos ? {} : null, tr, [tab, connected]);
  const alleRepos = repos.data?.repos ?? [];

  useEffect(() => {
    if (!connected || alleRepos.length === 0) return;
    if (!selected || !alleRepos.some((r) => r.fullName === selected)) {
      pick(alleRepos[0].fullName);
    }
  }, [connected, alleRepos, selected, pick]);

  const filtered = useMemo(() => { const q = query.trim().toLowerCase(); return alleRepos.filter((r) => !q || `${r.fullName} ${r.description} ${r.language}`.toLowerCase().includes(q)); }, [alleRepos, query]);

  const totaalOpenZaken = useMemo(
    () => alleRepos.reduce((som, r) => som + (r.openIssues || 0), 0),
    [alleRepos],
  );

  const bekendAantalRepos = useMemo(() => {
    if (alleRepos.length > 0) return alleRepos.length;
    const somStatus = (status.data?.publicRepos ?? 0) + (status.data?.privateRepos ?? 0);
    if (somStatus > 0) return somStatus;
    return (koppeling.data?.publicRepos ?? 0) + (koppeling.data?.privateRepos ?? 0);
  }, [alleRepos.length, status.data?.publicRepos, status.data?.privateRepos, koppeling.data?.publicRepos, koppeling.data?.privateRepos]);

  const ankerItems = useMemo<ReadonlyArray<MaquetteAnkerItem>>(
    () =>
      GH_ANKER_AFDELINGEN.map(([id, ukNaam, nlNaam]) => ({
        id,
        label: taalIdx === 0 ? ukNaam : nlNaam,
        badge:
          id === 'repositories' && bekendAantalRepos > 0
            ? bekendAantalRepos
            : id === 'issues' && repos.data && totaalOpenZaken > 0
              ? totaalOpenZaken
              : undefined,
      })),
    [taalIdx, bekendAantalRepos, repos.data, totaalOpenZaken],
  );

  const werkruimteStatistieken = useMemo<ReadonlyArray<MaquetteHeldStatistiek>>(() => {
    const d = status.data;
    if (!d?.connected) return [];
    const lijst: MaquetteHeldStatistiek[] = [
      { waarde: d.publicRepos ?? 0, label: GH_STAT_LABEL.openbaar[taalIdx] },
      { waarde: d.privateRepos ?? 0, label: GH_STAT_LABEL.besloten[taalIdx] },
    ];
    if (repos.data) {
      lijst.push({ waarde: totaalOpenZaken, label: GH_STAT_LABEL.openZaken[taalIdx] });
    }
    if (status.rate) {
      lijst.push({ waarde: status.rate.remaining, label: GH_STAT_LABEL.aanvragen[taalIdx] });
    }
    lijst.push({
      waarde: d.login ? `@${d.login}` : GH_STAT_LABEL.gekoppeld[taalIdx],
      label: GH_STAT_LABEL.verbinding[taalIdx],
    });
    return lijst;
  }, [status.data, status.rate, repos.data, totaalOpenZaken, taalIdx]);

  const accountsStatistieken = useMemo<ReadonlyArray<MaquetteHeldStatistiek>>(() => {
    const kd = koppeling.data;
    if (kd?.connected) {
      const lijst: MaquetteHeldStatistiek[] = [
        { waarde: kd.publicRepos ?? 0, label: GH_STAT_LABEL.openbaar[taalIdx] },
        { waarde: kd.privateRepos ?? 0, label: GH_STAT_LABEL.besloten[taalIdx] },
      ];
      if (koppeling.rate) {
        lijst.push({ waarde: koppeling.rate.remaining, label: GH_STAT_LABEL.aanvragen[taalIdx] });
      }
      lijst.push({
        waarde: kd.login ? `@${kd.login}` : GH_STAT_LABEL.gekoppeld[taalIdx],
        label: GH_STAT_LABEL.verbinding[taalIdx],
      });
      return lijst;
    }
    return [
      {
        waarde: koppeling.loading && !kd ? '…' : GH_STAT_LABEL.nietGekoppeld[taalIdx],
        label: GH_STAT_LABEL.verbinding[taalIdx],
      },
      { waarde: 3, label: GH_STAT_LABEL.koppelwegen[taalIdx] },
      { waarde: GH_STAT_LABEL.geisoleerd[taalIdx], label: GH_STAT_LABEL.sleutelkluis[taalIdx] },
    ];
  }, [koppeling.data, koppeling.loading, koppeling.rate, taalIdx]);

  const nietGekoppeldStatistieken = useMemo<ReadonlyArray<MaquetteHeldStatistiek>>(
    () => [
      { waarde: GH_STAT_LABEL.nietGekoppeld[taalIdx], label: GH_STAT_LABEL.verbinding[taalIdx] },
      { waarde: 3, label: GH_STAT_LABEL.koppelwegen[taalIdx] },
      { waarde: GH_STAT_LABEL.geisoleerd[taalIdx], label: GH_STAT_LABEL.sleutelkluis[taalIdx] },
    ],
    [taalIdx],
  );

  const verbergAnkerRail =
    !isMaquette ||
    tab === 'code' ||
    !connected ||
    Boolean(status.gesloten) ||
    (status.loading && !status.data) ||
    Boolean(status.error) ||
    dialoogOpen;

  const heldInhoud = GH_MAQUETTE_TEKST[tab] ?? GH_MAQUETTE_TEKST.overview;
  const accountsHeldInhoud = GH_MAQUETTE_TEKST.accounts;
  const nietGekoppeldInhoud = GH_MAQUETTE_TEKST.nietGekoppeld;

  const accountsHeldNode = isMaquette && !koppeling.gesloten ? (
    <MaquetteHeld
      key="gh-held-accounts"
      id="gh-maquette-held"
      dienst="github"
      lang={ruimteLang}
      modus="volledig"
      opslagSleutel="github-accounts"
      bovenregel={accountsHeldInhoud.boven[taalIdx]}
      titelVoor={accountsHeldInhoud.voor[taalIdx]}
      titelCursief={accountsHeldInhoud.cursief[taalIdx]}
      beschrijving={accountsHeldInhoud.beschrijving[taalIdx]}
      statistieken={accountsStatistieken}
      primair={
        koppeling.data?.connected
          ? { label: GH_STAT_LABEL.naarOverzicht[taalIdx], onClick: () => gaNaarTab('overview') }
          : { label: GH_STAT_LABEL.eenklikKoppelen[taalIdx], onClick: startSnelleKoppeling }
      }
      secundair={
        koppeling.data?.connected
          ? { label: GH_STAT_LABEL.controleerStaat[taalIdx], onClick: koppeling.reload }
          : { label: GH_STAT_LABEL.openSleutelkluis[taalIdx], onClick: openVault }
      }
    />
  ) : null;

  const nietGekoppeldHeldNode = isMaquette ? (
    <MaquetteHeld
      key="gh-held-connect"
      id="gh-maquette-held"
      dienst="github"
      lang={ruimteLang}
      modus="volledig"
      opslagSleutel="github-connect"
      bovenregel={nietGekoppeldInhoud.boven[taalIdx]}
      titelVoor={nietGekoppeldInhoud.voor[taalIdx]}
      titelCursief={nietGekoppeldInhoud.cursief[taalIdx]}
      beschrijving={nietGekoppeldInhoud.beschrijving[taalIdx]}
      statistieken={nietGekoppeldStatistieken}
      primair={{ label: GH_STAT_LABEL.eenklikKoppelen[taalIdx], onClick: startSnelleKoppeling }}
      secundair={{ label: GH_STAT_LABEL.koppelkaart[taalIdx], onClick: () => gaNaarTab('accounts') }}
    />
  ) : null;

  const werkruimteHeldNode = isMaquette ? (
    <MaquetteHeld
      key={`gh-held-${tab}`}
      id="gh-maquette-held"
      dienst="github"
      lang={ruimteLang}
      modus={VOLLEDIG_MAQUETTE_TABS.has(tab) ? 'volledig' : 'compact'}
      opslagSleutel={'github-' + tab}
      bovenregel={heldInhoud.boven[taalIdx]}
      titelVoor={heldInhoud.voor[taalIdx]}
      titelCursief={heldInhoud.cursief[taalIdx]}
      beschrijving={heldInhoud.beschrijving[taalIdx]}
      statistieken={werkruimteStatistieken}
      primair={
        tab === 'repositories'
          ? { label: GH_STAT_LABEL.nieuwRepo[taalIdx], icoon: '+', onClick: openNieuwRepoDialoog }
          : tab === 'code'
            ? { label: GH_STAT_LABEL.naarPulls[taalIdx], onClick: () => gaNaarTab('pulls') }
            : { label: GH_STAT_LABEL.naarCode[taalIdx], onClick: () => gaNaarTab('code') }
      }
      secundair={
        tab === 'overview'
          ? { label: GH_STAT_LABEL.nieuwRepo[taalIdx], onClick: openNieuwRepoDialoog }
          : tab === 'repositories'
            ? { label: GH_STAT_LABEL.openCode[taalIdx], onClick: () => gaNaarTab('code') }
            : { label: GH_STAT_LABEL.alleRepos[taalIdx], onClick: () => gaNaarTab('repositories') }
      }
    />
  ) : null;

  const ankerRailNode = !verbergAnkerRail ? (
    <MaquetteAnkerRail
      lang={ruimteLang}
      opslagSleutel="github-anker"
      titel={GH_STAT_LABEL.railTitel[taalIdx]}
      ondertitel={selected || GH_STAT_LABEL.railOndertitel[taalIdx]}
      items={ankerItems}
      actief={GH_ANKER_AFDELINGEN.some(([id]) => id === tab) ? tab : 'overview'}
      onKies={gaNaarTab}
    />
  ) : null;

  if (status.loading && !status.data) return <GhMaquetteSchil actief={isMaquette}><div className="gh-root"><Busy tr={tr} /></div></GhMaquetteSchil>;
  // Poort dicht: geen «koppel GitHub»-uitnodiging (die zou liegen), maar de echte reden uit de kern.
  if (status.gesloten) return <GhMaquetteSchil actief={isMaquette}><div className="gh-root"><RuimteGeslotenVlak gesloten={status.gesloten} lang={ruimteLang} /></div></GhMaquetteSchil>;
  // Het tabblad «Облікові записи» is er juist voor het koppelen: het toont de kaart ook als er nog geen token is of GitHub hem weigerde.
  if (tab === 'accounts') return <GhMaquetteSchil actief={isMaquette} voor={accountsHeldNode}><div className="gh-root"><IntegratieStrook dienst='github' />
    <RuimteStrook feiten={koppeling.ruimte ?? null} lang={ruimteLang} />
    <section className="gh-card gh-repo-balk"><GhAfdelingNav tab={tab} tr={tr} onGaNaarTab={gaNaarTab} /></section>
    {koppeling.gesloten ? <RuimteGeslotenVlak gesloten={koppeling.gesloten} lang={ruimteLang} /> : <>
      <EenklikKoppelPaneel tr={tr} gekoppeld={Boolean(koppeling.data?.connected)} login={koppeling.data?.login} eenklik={koppeling.data?.eenklik} onGekoppeld={koppeling.reload} />
      <KoppelKaart tr={tr} onHerlaad={koppeling.reload} ruimte={koppeling.ruimte ?? null} rate={koppeling.rate}
        invoer={{ laden: koppeling.loading && !koppeling.data, fout: koppeling.code, feiten: koppeling.data }} />
    </>}
  </div></GhMaquetteSchil>;
  if (status.error) return <GhMaquetteSchil actief={isMaquette}><div className="gh-root"><Notice kind="error">{status.error}</Notice><div className="gh-actions">{status.code === 'SLEUTELKLUIS_GESLOTEN' ? <a className="gh-btn gh-primary" href={sleutelkluisOntgrendelAdres(window.location.origin)}><KeyRound size={14} />{tr('Відкрити сховище ключів', 'Sleutelkluis ontgrendelen')}</a> : null}<button className="gh-btn" onClick={status.reload}><RefreshCw size={14} />{tr('Повторити', 'Opnieuw')}</button></div></div></GhMaquetteSchil>;
  if (!connected) return <GhMaquetteSchil actief={isMaquette} voor={nietGekoppeldHeldNode}><div className="gh-root">
    <section className="gh-card gh-repo-balk"><GhAfdelingNav tab={tab} tr={tr} onGaNaarTab={gaNaarTab} /></section>
    <EenklikKoppelPaneel tr={tr} gekoppeld={false} eenklik={status.data?.eenklik} onGekoppeld={status.reload} />
    <section className="gh-card gh-connect">
      <Github size={38} /><h2>{tr('Підключіть GitHub', 'Koppel GitHub')}</h2>
      <p>{tr('Токен зберігається лише в зашифрованому сховищі ключів і ніколи не потрапляє в браузер чи в ШІ. Створіть персональний токен (classic: repo, read:project; або fine-grained з доступом до потрібних репозиторіїв) і додайте його.', 'De token staat alleen in de versleutelde sleutelkluis en komt nooit in de browser of bij de AI. Maak een persoonlijke token (classic: repo, read:project; of fine-grained met toegang tot de gewenste repositories) en voeg hem toe.')}</p>
      <ol><li>{tr('Відкрийте github.com → Settings → Developer settings → Personal access tokens.', 'Open github.com → Settings → Developer settings → Personal access tokens.')}</li><li>{tr('Кабінет → API-платформа → Сховище ключів → призначення «github».', 'Account → API-platform → Sleutelkluis → doel "github".')}</li><li>{tr('Поверніться сюди й натисніть «Перевірити».', 'Kom terug en klik op "Controleren".')}</li></ol>
      {/* G1 (audit 19.10.2026): één tokenbron — deze pagina én de GitHub-instrumenten van de AI-koppelingen lezen dezelfde kluissleutel (doel «github»). */}
      <p className="gh-sub">{tr('Той самий ключ використовують і інструменти GitHub у підключеннях ШІ (мій простір → Підключені ШІ): окремого токена для них немає.', 'Dezelfde sleutel gebruiken ook de GitHub-instrumenten van de AI-koppelingen: er is geen aparte token voor.')}</p>
      <div className="gh-actions"><button className="gh-btn gh-primary" onClick={openVault}><KeyRound size={14} />{tr('Відкрити сховище ключів', 'Sleutelkluis openen')}</button><button className="gh-btn" onClick={status.reload}><RefreshCw size={14} />{tr('Перевірити', 'Controleren')}</button>
        <a className="gh-btn" href={canonicalNavigationUrl('github', 'accounts', tr('uk', 'nl') === 'uk' ? 'uk' : 'nl')}><Plug size={14} />{tr('Картка підключення', 'Koppelkaart')}</a></div>
    </section>
  </div></GhMaquetteSchil>;

  const s = status.data as Status;
  const Header = <header className="gh-me">{s.avatar ? <img src={s.avatar} alt="" width={40} height={40} /> : <Github size={40} />}<div><strong>{s.name || s.login}</strong><span className="gh-sub">@{s.login} · {s.publicRepos} {tr('публічних', 'publiek')} · {s.privateRepos} {tr('приватних', 'privé')}</span></div>
    {status.rate && <span className="gh-sub gh-rate" title={tr('Залишок запитів до GitHub API', 'Resterende GitHub API-aanvragen')}>API: {status.rate.remaining}</span>}</header>;

  const repoList = <>
    <label className="gh-search"><Search size={14} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={tr('Фільтр репозиторіїв…', 'Repositories filteren…')} aria-label={tr('Фільтр репозиторіїв', 'Repositories filteren')} /></label>
    {repos.error ? <Notice kind="error">{repos.error}</Notice> : repos.loading && !repos.data ? <Busy tr={tr} /> : filtered.length ? <div className="gh-repos">{filtered.map((r) => <RepoRow key={r.fullName} r={r} active={selected === r.fullName} onPick={() => { pick(r.fullName); setSplitMobielPaneel('detail'); }} tr={tr} />)}</div> : <Empty>{tr('Репозиторіїв не знайдено.', 'Geen repositories gevonden.')}</Empty>}
  </>;

  const geenRepoKaart = repos.loading && !repos.data
    ? <section className="gh-card"><Busy tr={tr} /></section>
    : <section className="gh-card"><Empty>{tr('Оберіть сховище у верхній панелі або створіть перше натиском на «Нове сховище».', 'Kies een opslagplaats in de bovenbalk of maak uw eerste aan met «Nieuwe opslagplaats».')}</Empty></section>;

  return <GhMaquetteSchil actief={isMaquette} voor={isMaquette ? <>{werkruimteHeldNode}{ankerRailNode}</> : null}><div className="gh-root">
    {Header}
    {WERKRUIMTE_TABS.has(tab) ? (
      <RepoWerkbalk
        repos={alleRepos}
        actieveRepo={selected}
        tab={tab}
        tr={tr}
        onKiesRepo={pick}
        onVernieuwRepos={repos.reload}
        onGaNaarTab={gaNaarTab}
      />
    ) : (
      <section className="gh-card gh-repo-balk"><GhAfdelingNav tab={tab} tr={tr} onGaNaarTab={gaNaarTab} /></section>
    )}
    {tab === 'overview' && <div className="gh-grid">
      <section className="gh-card"><h3>{tr('Останні репозиторії', 'Recente repositories')}</h3>{repos.loading && !repos.data ? <Busy tr={tr} /> : <div className="gh-repos">{alleRepos.slice(0, 6).map((r) => <RepoRow key={r.fullName} r={r} active={selected === r.fullName} onPick={() => pick(r.fullName)} tr={tr} />)}</div>}</section>
      <ActivityCard tr={tr} limit={6} />
      {selected && <section className="gh-card gh-wide"><RepoDetail repo={selected} tr={tr} /></section>}
    </div>}
    {tab === 'repositories' && <>
      <div className="gh-mobiel-wissel">
        <button type="button" className={`gh-btn${splitMobielPaneel === 'lijst' ? ' gh-primary' : ''}`} onClick={() => setSplitMobielPaneel('lijst')}>
          <FolderGit2 size={14} /> {tr('Список сховищ', 'Opslagplaatsen')} ({filtered.length})
        </button>
        <button type="button" className={`gh-btn${splitMobielPaneel === 'detail' ? ' gh-primary' : ''}`} onClick={() => setSplitMobielPaneel('detail')}>
          <Github size={14} /> {selected ? selected.split('/').pop() : tr('Деталі сховища', 'Details')}
        </button>
      </div>
      <div className="gh-split" data-mobiel-paneel={splitMobielPaneel}>
        <section className={`gh-card gh-split-lijst${splitMobielPaneel !== 'lijst' ? ' is-verborgen-mobiel' : ''}`}>{repoList}</section>
        <section className={`gh-card gh-split-detail${splitMobielPaneel !== 'detail' ? ' is-verborgen-mobiel' : ''}`}>
          <div className="gh-mobiel-terug-rij">
            <button type="button" className="gh-btn" onClick={() => setSplitMobielPaneel('lijst')}>
              <FolderGit2 size={14} /> {tr('← До списку сховищ', '← Naar lijst van opslagplaatsen')}
            </button>
          </div>
          {selected ? <RepoDetail repo={selected} tr={tr} /> : <Empty>{tr('Оберіть репозиторій зліва.', 'Kies links een repository.')}</Empty>}
        </section>
      </div>
    </>}
    {tab === 'code' && (selected ? <CodeEnEditorPaneel repo={selected} tr={tr} onOpenPulls={() => gaNaarTab('pulls')} /> : geenRepoKaart)}
    {(tab === 'issues' || tab === 'pulls') && (selected ? <ZakenEnSamenvoegingenPaneel tab={tab} repo={selected} tr={tr} /> : geenRepoKaart)}
    {(tab === 'actions' || tab === 'releases') && (selected ? <ActiesEnUitgavenPaneel tab={tab} repo={selected} tr={tr} /> : geenRepoKaart)}
    {tab === 'sync' && <SpiegelEnBrugPaneel repo={selected} tr={tr} onKiesRepo={pick} />}
    {tab === 'projects' && <ProjectsCard tr={tr} />}
    {tab === 'documentation' && <>
      <div className="gh-mobiel-wissel">
        <button type="button" className={`gh-btn${splitMobielPaneel === 'lijst' ? ' gh-primary' : ''}`} onClick={() => setSplitMobielPaneel('lijst')}>
          <FolderGit2 size={14} /> {tr('Список сховищ', 'Opslagplaatsen')} ({filtered.length})
        </button>
        <button type="button" className={`gh-btn${splitMobielPaneel === 'detail' ? ' gh-primary' : ''}`} onClick={() => setSplitMobielPaneel('detail')}>
          <BookOpen size={14} /> {selected ? `${selected.split('/').pop()} · README` : 'README'}
        </button>
      </div>
      <div className="gh-split" data-mobiel-paneel={splitMobielPaneel}>
        <section className={`gh-card gh-split-lijst${splitMobielPaneel !== 'lijst' ? ' is-verborgen-mobiel' : ''}`}>{repoList}</section>
        <section className={`gh-card gh-split-detail${splitMobielPaneel !== 'detail' ? ' is-verborgen-mobiel' : ''}`}>
          <div className="gh-mobiel-terug-rij">
            <button type="button" className="gh-btn" onClick={() => setSplitMobielPaneel('lijst')}>
              <FolderGit2 size={14} /> {tr('← До списку сховищ', '← Naar lijst van opslagplaatsen')}
            </button>
          </div>
          {selected ? <Readme repo={selected} tr={tr} /> : <Empty>{tr('Оберіть репозиторій, щоб прочитати README.', 'Kies een repository om de README te lezen.')}</Empty>}
        </section>
      </div>
    </>}
    {tab === 'research' && <SearchCard tr={tr} onPick={(full) => { pick(full); gaNaarTab('overview'); }} />}
    {tab === 'activity' && <ActivityCard tr={tr} limit={30} />}
  </div></GhMaquetteSchil>;
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
  return <section><header className="gh-detail-head"><h3>{repo} · README</h3>{r.data && <a href={r.data.url} className="gh-btn" target="_blank" rel="noopener noreferrer"><ExternalLink size={14} />GitHub</a>}</header>{r.error ? <Notice kind="error">{r.error}</Notice> : r.loading ? <Busy tr={tr} /> : <pre className="gh-readme" data-no-edge-swipe>{r.data?.text}{r.data?.truncated ? `\n\n… ${tr('(скорочено)', '(ingekort)')}` : ''}</pre>}</section>;
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
