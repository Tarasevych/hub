import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BookOpen, CheckCircle2, CircleDot, ExternalLink, GitBranch, GitCommit, GitPullRequest, Github, KeyRound, Loader2, MessageSquarePlus, PlayCircle, Plus, RefreshCw, Search, Star, XCircle } from 'lucide-react';
import { api, ApiError } from './platform/client';
import { ecosystemTabContext } from './tab-context';
import { openIntegrations } from './AIServiceView';
import './github-view.css';

type Tr = (uk: string, nl: string) => string;
type Repo = { fullName: string; name: string; description: string; language: string; stars: number; forks: number; openIssues: number; private: boolean; archived: boolean; pushedAt: string; url: string; defaultBranch: string; fork: boolean };
type Item = { number: number; title: string; state: string; isPull: boolean; draft: boolean; author: string; comments: number; labels: { name: string; color: string }[]; updatedAt: string; url: string; body: string };
type Status = { connected: boolean; login?: string; name?: string; avatar?: string; url?: string; publicRepos?: number; privateRepos?: number; followers?: number };
type Rate = { remaining: number; reset: number } | undefined;

const ctx = () => ({ service: 'github', tabContext: ecosystemTabContext(), sourceOrigin: location.origin });
const call = async (name: string, body: Record<string, unknown> = {}) => (await api.post(`/api/owner/github/${name}`, { ...ctx(), ...body })).data;

function errorText(e: unknown, tr: Tr): string {
  const code = e instanceof ApiError ? String(e.response?.data?.error || e.message) : String((e as Error)?.message || '');
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
  };
  const hit = map[code];
  return hit ? tr(hit[0], hit[1]) : tr('Не вдалося виконати дію з GitHub. Спробуйте ще раз.', 'De GitHub-actie is niet gelukt. Probeer het opnieuw.');
}

const ago = (iso: string, tr: Tr) => {
  const t = Date.parse(iso); if (!t) return '';
  const m = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (m < 1) return tr('щойно', 'zojuist'); if (m < 60) return tr(`${m} хв тому`, `${m} min geleden`);
  const h = Math.round(m / 60); if (h < 48) return tr(`${h} год тому`, `${h} uur geleden`);
  return tr(`${Math.round(h / 24)} дн. тому`, `${Math.round(h / 24)} d geleden`);
};

function useCall<T>(name: string, body: Record<string, unknown> | null, tr: Tr, deps: unknown[]) {
  const [state, setState] = useState<{ loading: boolean; error: string; data: T | null; rate?: Rate }>({ loading: !!body, error: '', data: null });
  const [rev, setRev] = useState(0);
  useEffect(() => {
    if (!body) { setState({ loading: false, error: '', data: null }); return; }
    let live = true;
    setState((s) => ({ ...s, loading: true, error: '' }));
    call(name, body).then((d) => { if (live) setState({ loading: false, error: '', data: d as T, rate: d.rate }); }).catch((e) => { if (live) setState({ loading: false, error: errorText(e, tr), data: null }); });
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
    try { await call('issue/create', { repo, title, body }); onDone(); } catch (e) { setErr(errorText(e, tr)); } finally { setBusy(false); }
  };
  return <form className="gh-form" onSubmit={(e) => { e.preventDefault(); void send(); }}>
    <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={tr('Заголовок', 'Titel')} maxLength={250} aria-label={tr('Заголовок', 'Titel')} />
    <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder={tr('Опис (необов’язково)', 'Beschrijving (optioneel)')} rows={4} aria-label={tr('Опис', 'Beschrijving')} />
    {err && <Notice kind="error">{err}</Notice>}
    <button className="gh-btn gh-primary" disabled={busy || title.trim().length < 3}>{busy ? <Loader2 size={14} className="gh-spin" /> : <MessageSquarePlus size={14} />}{tr('Створити issue', 'Issue aanmaken')}</button>
  </form>;
}

export default function GitHubView({ tab, tr }: { tab: string; tr: Tr }) {
  const status = useCall<Status>('status', {}, tr, []);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string>(() => { try { return sessionStorage.getItem('mr.gh.repo') || ''; } catch { return ''; } });
  const pick = useCallback((full: string) => { setSelected(full); try { sessionStorage.setItem('mr.gh.repo', full); } catch { /* geen opslag */ } }, []);
  const connected = !!status.data?.connected;
  const needRepos = connected && ['overview', 'repositories', 'documentation'].includes(tab);
  const repos = useCall<{ repos: Repo[]; hasMore: boolean }>('repos', needRepos ? {} : null, tr, [tab, connected]);
  const filtered = useMemo(() => { const q = query.trim().toLowerCase(); return (repos.data?.repos ?? []).filter((r) => !q || `${r.fullName} ${r.description} ${r.language}`.toLowerCase().includes(q)); }, [repos.data, query]);

  if (status.loading && !status.data) return <div className="gh-root"><Busy tr={tr} /></div>;
  if (status.error) return <div className="gh-root"><Notice kind="error">{status.error}</Notice><button className="gh-btn" onClick={status.reload}><RefreshCw size={14} />{tr('Повторити', 'Opnieuw')}</button></div>;
  if (!connected) return <div className="gh-root"><section className="gh-card gh-connect">
    <Github size={38} /><h2>{tr('Підключіть GitHub', 'Koppel GitHub')}</h2>
    <p>{tr('Токен зберігається лише в зашифрованому сховищі ключів і ніколи не потрапляє в браузер чи в ШІ. Створіть персональний токен (classic: repo, read:project; або fine-grained з доступом до потрібних репозиторіїв) і додайте його.', 'De token staat alleen in de versleutelde sleutelkluis en komt nooit in de browser of bij de AI. Maak een persoonlijke token (classic: repo, read:project; of fine-grained met toegang tot de gewenste repositories) en voeg hem toe.')}</p>
    <ol><li>{tr('Відкрийте github.com → Settings → Developer settings → Personal access tokens.', 'Open github.com → Settings → Developer settings → Personal access tokens.')}</li><li>{tr('Кабінет → API-платформа → Сховище ключів → призначення «github».', 'Account → API-platform → Sleutelkluis → doel "github".')}</li><li>{tr('Поверніться сюди й натисніть «Перевірити».', 'Kom terug en klik op "Controleren".')}</li></ol>
    <div className="gh-actions"><button className="gh-btn gh-primary" onClick={openIntegrations}><KeyRound size={14} />{tr('Відкрити сховище ключів', 'Sleutelkluis openen')}</button><button className="gh-btn" onClick={status.reload}><RefreshCw size={14} />{tr('Перевірити', 'Controleren')}</button></div>
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
    {tab === 'accounts' && <section className="gh-card"><h3>{tr('Підключений обліковий запис', 'Gekoppeld account')}</h3>
      <p><a href={s.url} target="_blank" rel="noopener noreferrer">@{s.login}</a> · {s.followers} {tr('підписників', 'volgers')}</p>
      <p className="gh-sub">{tr('Токен лежить у сховищі ключів (призначення «github»), шифрований, і використовується лише сервером. Щоб замінити чи відкликати доступ — змініть токен у сховищі та на github.com.', 'De token staat versleuteld in de sleutelkluis (doel "github") en wordt alleen door de server gebruikt. Vervang of trek de toegang in via de kluis en github.com.')}</p>
      <div className="gh-actions"><button className="gh-btn" onClick={openIntegrations}><KeyRound size={14} />{tr('Сховище ключів', 'Sleutelkluis')}</button><button className="gh-btn" onClick={status.reload}><RefreshCw size={14} />{tr('Перевірити знову', 'Opnieuw controleren')}</button></div>
      {status.rate && <p className="gh-sub">{tr(`Залишок запитів: ${status.rate.remaining}; оновлення ліміту: ${new Date(status.rate.reset).toLocaleTimeString()}`, `Resterende aanvragen: ${status.rate.remaining}; limiet vernieuwd om ${new Date(status.rate.reset).toLocaleTimeString()}`)}</p>}
    </section>}
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
