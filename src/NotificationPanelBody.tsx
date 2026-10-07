import { useMemo, useState, type ComponentType } from 'react';
import { Bell, Bot, Check, ChevronDown, ChevronUp, CircleCheck, Cloud, Globe, Info, Laptop, Mail, Search, Trash2, Undo2 } from 'lucide-react';
import { activityLink, activityTitle, durationText, sourceLabel, statusInfo, type ActivityEvent } from './connector-activity';
import './notification-panel.css';

type Lang = 'uk' | 'nl';
type Kind = 'info' | 'success' | 'warning' | 'error';
type Category = 'claude' | 'agent' | 'browser' | 'mail' | 'cloud' | 'site';
type Detail = { icon: string; label: string; value: string };
type Section = { title: string; items: Detail[] };

export type LocalRow = { id: string; text: string; kind: Kind; createdAt: number; source: string; read: boolean; link?: { href: string; label: string }; details?: Section[]; action?: { label: string; onAction: () => void | Promise<void> } };
export type ServerRow = { id: string; kind: string; title: string; message: string; createdAt: number; read?: boolean };

type Item = {
  key: string; origin: 'local' | 'server' | 'activity'; kind: Kind; title: string; text?: string; category: Category; createdAt: number; read: boolean;
  status?: { text: string; group: 'waiting' | 'active' | 'done' | 'failed' | 'rejected' | 'expired' }; duration?: string;
  link?: { href: string; label: string }; details?: Section[]; facts?: Array<[string, string]>; markRead: () => void; remove?: () => void; action?: LocalRow['action'];
};
type Props = {
  lang: Lang; local: LocalRow[]; server: ServerRow[]; events: ActivityEvent[]; readEvents: Set<string>;
  onReadLocal: (id: string) => void; onRemoveLocal: (id: string) => void; onRunAction: (id: string, action: NonNullable<LocalRow['action']>) => void | Promise<void>;
  onReadServer?: (id: string) => void | Promise<void>; onReadEvent: (id: string) => void;
  detailIcons: Record<string, ComponentType<any>>;
};

const CATEGORY_ICON: Record<Category, ComponentType<any>> = { claude: Bot, agent: Laptop, browser: Globe, mail: Mail, cloud: Cloud, site: Bell };
const categoryOf = (source: string): Category => (/^mail/.test(source) ? 'mail' : /^(cloud|drive)/.test(source) ? 'cloud' : 'site');
const categoryName = (c: Category, lang: Lang) => ({
  claude: 'Claude', agent: lang === 'uk' ? 'Пристрої' : 'Apparaten', browser: lang === 'uk' ? 'Браузер' : 'Browser', mail: lang === 'uk' ? 'Пошта' : 'E-mail', cloud: lang === 'uk' ? 'Хмара' : 'Cloud', site: lang === 'uk' ? 'Сайт' : 'Site',
} as Record<Category, string>)[c];

function relative(value: number, lang: Lang): string {
  const s = Math.max(0, Math.round((Date.now() - value) / 1000));
  if (s < 60) return lang === 'uk' ? 'щойно' : 'zojuist';
  const m = Math.round(s / 60);
  if (m < 60) return lang === 'uk' ? `${m} хв тому` : `${m} min geleden`;
  const h = Math.round(m / 60);
  if (h < 24) return lang === 'uk' ? `${h} год тому` : `${h} uur geleden`;
  const d = Math.round(h / 24);
  return lang === 'uk' ? `${d} дн. тому` : `${d} dagen geleden`;
}
const dayKey = (value: number) => { const d = new Date(value); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };
function dayLabel(value: number, lang: Lang): string {
  const today = dayKey(Date.now()), yesterday = dayKey(Date.now() - 86400000);
  const key = dayKey(value);
  if (key === today) return lang === 'uk' ? 'Сьогодні' : 'Vandaag';
  if (key === yesterday) return lang === 'uk' ? 'Учора' : 'Gisteren';
  return new Date(value).toLocaleDateString(lang === 'uk' ? 'uk-UA' : 'nl-BE', { day: 'numeric', month: 'long' });
}

type Filter = 'all' | 'unread' | 'waiting' | 'problems';
type Sort = 'new' | 'old' | 'unread' | 'status';

/**
 * Lijst van het meldingencentrum: meldingen van de site, wat Claude en uw apparaten doen (met stand en duur), met zoeken, filteren op stand en bron,
 * sorteren, groeperen per dag en uitklapbare details. Eén lijst voor alles; de bron staat bij elke regel.
 */
export default function NotificationPanelBody(p: Props) {
  const t = (uk: string, nl: string) => (p.lang === 'uk' ? uk : nl);
  const [filter, setFilter] = useState<Filter>('all');
  const [category, setCategory] = useState<'all' | Category>('all');
  const [sort, setSort] = useState<Sort>('new');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    for (const r of p.local) out.push({ key: `l:${r.id}`, origin: 'local', kind: r.kind, title: r.text, category: categoryOf(r.source), createdAt: r.createdAt, read: r.read, details: r.details, link: r.link, markRead: () => p.onReadLocal(r.id), remove: () => p.onRemoveLocal(r.id), action: r.action });
    for (const r of p.server) out.push({ key: `s:${r.id}`, origin: 'server', kind: /error|fail/i.test(r.kind) ? 'error' : /warn/i.test(r.kind) ? 'warning' : 'info', title: r.title, text: r.message, category: 'site', createdAt: r.createdAt, read: Boolean(r.read), markRead: () => { if (!r.read) void p.onReadServer?.(r.id); } });
    for (const e of p.events) {
      const st = statusInfo(e.status, p.lang);
      const category: Category = e.source === 'claude' ? 'claude' : e.source === 'browser' ? 'browser' : 'agent';
      out.push({
        key: `a:${e.id}`, origin: 'activity', category, createdAt: e.createdAt, read: p.readEvents.has(e.id),
        kind: st.group === 'failed' ? 'error' : st.group === 'waiting' ? 'warning' : st.group === 'done' || e.kind === 'grant' ? 'success' : 'info',
        title: activityTitle(e, p.lang), status: st, duration: e.kind === 'grant' ? undefined : durationText(e, p.lang),
        facts: [
          [t('Джерело', 'Bron'), `${sourceLabel(e.source, p.lang)}${e.kind === 'command' ? ` → ${e.subject}` : ''}`],
          [t('Стан', 'Status'), st.text],
          [t('Початок', 'Begin'), new Date(e.createdAt).toLocaleString(p.lang === 'uk' ? 'uk-UA' : 'nl-BE')],
          ...(e.finishedAt ? [[t('Завершення', 'Einde'), new Date(e.finishedAt).toLocaleString(p.lang === 'uk' ? 'uk-UA' : 'nl-BE')] as [string, string]] : []),
          ...(e.kind !== 'grant' ? [[t('Тривалість', 'Duur'), durationText(e, p.lang)] as [string, string]] : []),
        ],
        link: activityLink(e, p.lang), markRead: () => p.onReadEvent(e.id),
      });
    }
    return out;
  }, [p.local, p.server, p.events, p.readEvents, p.lang]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = items.filter((i) => {
      if (category !== 'all' && i.category !== category) return false;
      if (filter === 'unread' && i.read) return false;
      if (filter === 'waiting' && i.status?.group !== 'waiting') return false;
      if (filter === 'problems' && !(i.kind === 'error' || i.kind === 'warning' || i.status?.group === 'failed' || i.status?.group === 'expired' || i.status?.group === 'rejected')) return false;
      if (q && !`${i.title} ${i.text || ''} ${categoryName(i.category, p.lang)} ${i.status?.text || ''}`.toLowerCase().includes(q)) return false;
      return true;
    });
    const rank: Record<string, number> = { waiting: 0, active: 1, failed: 2, rejected: 3, expired: 4, done: 5 };
    list = [...list].sort((a, b) => {
      if (sort === 'old') return a.createdAt - b.createdAt;
      if (sort === 'unread') return Number(a.read) - Number(b.read) || b.createdAt - a.createdAt;
      if (sort === 'status') return (rank[a.status?.group ?? 'done'] ?? 6) - (rank[b.status?.group ?? 'done'] ?? 6) || b.createdAt - a.createdAt;
      return b.createdAt - a.createdAt;
    });
    return list;
  }, [items, filter, category, sort, query, p.lang]);

  const counts = useMemo(() => ({
    unread: items.filter((i) => !i.read).length,
    waiting: items.filter((i) => i.status?.group === 'waiting').length,
    problems: items.filter((i) => i.kind === 'error' || i.status?.group === 'failed').length,
  }), [items]);
  const categories = useMemo(() => [...new Set(items.map((i) => i.category))], [items]);

  const chip = (id: Filter, label: string, n?: number) => (
    <button key={id} type='button' className='cnc-chip' aria-pressed={filter === id} onClick={() => setFilter(id)}>{label}{n ? <span className='cnc-chip-n'>{n}</span> : null}</button>
  );

  let lastDay = '';
  return (
    <div className='cnc-body'>
      <div className='cnc-tools'>
        <label className='cnc-search'><Search aria-hidden='true' /><input type='search' value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('Пошук у сповіщеннях', 'Zoeken in meldingen')} aria-label={t('Пошук у сповіщеннях', 'Zoeken in meldingen')} /></label>
        <div className='cnc-chips' role='group' aria-label={t('Фільтр за станом', 'Filter op status')}>
          {chip('all', t('Усі', 'Alle'))}
          {chip('unread', t('Непрочитані', 'Ongelezen'), counts.unread)}
          {chip('waiting', t('Очікують', 'Wachtend'), counts.waiting)}
          {chip('problems', t('Проблеми', 'Problemen'), counts.problems)}
        </div>
        <div className='cnc-selects'>
          <label>{t('Джерело', 'Bron')}
            <select value={category} onChange={(e) => setCategory(e.target.value as 'all' | Category)}>
              <option value='all'>{t('Усі', 'Alle')}</option>
              {categories.map((c) => <option key={c} value={c}>{categoryName(c, p.lang)}</option>)}
            </select>
          </label>
          <label>{t('Порядок', 'Volgorde')}
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
              <option value='new'>{t('Спершу нові', 'Nieuwste eerst')}</option>
              <option value='old'>{t('Спершу старі', 'Oudste eerst')}</option>
              <option value='unread'>{t('Непрочитані зверху', 'Ongelezen bovenaan')}</option>
              <option value='status'>{t('За станом', 'Op status')}</option>
            </select>
          </label>
        </div>
      </div>

      <div className='cnc-list' role='list'>
        {!shown.length ? (
          <div className='canonical-notification-empty'><Bell /><strong>{items.length ? t('Нічого не знайдено', 'Niets gevonden') : t('Історія сповіщень порожня', 'Meldingsgeschiedenis is leeg')}</strong>
            <span>{items.length ? t('Змініть фільтр або пошук.', 'Pas het filter of de zoekopdracht aan.') : t('Тут з’являтиметься все, що роблять Claude, ваші пристрої, браузер, пошта й сайт.', 'Hier verschijnt alles wat Claude, uw apparaten, de browser, de mail en de site doen.')}</span></div>
        ) : null}
        {shown.map((item) => {
          const day = dayKey(item.createdAt);
          const header = (sort === 'new' || sort === 'old') && day !== lastDay ? dayLabel(item.createdAt, p.lang) : null;
          lastDay = day;
          const CatIcon = CATEGORY_ICON[item.category] ?? Info;
          const expandable = Boolean(item.details?.length || item.facts?.length || item.text);
          const isOpen = Boolean(open[item.key]);
          return (
            <div key={item.key} role='listitem'>
              {header ? <div className='cnc-day'>{header}</div> : null}
              <article className={`cnc-row kind-${item.kind}${item.read ? ' is-read' : ' is-unread'}${item.status ? ` st-${item.status.group}` : ''}`} data-origin={item.origin} onPointerDown={() => { if (!item.read) item.markRead(); }}>
                <span className='cnc-icon' aria-hidden='true'><CatIcon aria-hidden='true' /></span>
                <div className='cnc-main'>
                  <strong>{item.title}</strong>
                  <div className='cnc-meta'>
                    <span className='cnc-cat'>{categoryName(item.category, p.lang)}</span>
                    {item.status ? <span className={`cnc-status st-${item.status.group}`}><i aria-hidden='true' />{item.status.text}</span> : null}
                    <span title={new Date(item.createdAt).toLocaleString(p.lang === 'uk' ? 'uk-UA' : 'nl-BE')}>{relative(item.createdAt, p.lang)}</span>
                    {item.duration ? <span>{item.duration}</span> : null}
                  </div>
                  {item.link ? <a className='cnc-link' href={item.link.href} onClick={() => item.markRead()}>{item.link.label} →</a> : null}
                  {isOpen ? (
                    <div className='cnc-details'>
                      {item.text ? <p>{item.text}</p> : null}
                      {item.facts ? <dl>{item.facts.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl> : null}
                      {item.details?.map((section, si) => (
                        <section key={si} className='canonical-notification-detail-section'>
                          <h4>{section.title}</h4>
                          <div>{section.items.map((d, di) => { const Icon = p.detailIcons[d.icon] || Info; return <div key={di} className='canonical-notification-detail-row'><Icon aria-hidden='true' /><span><small>{d.label}</small><strong className='canonical-notification-detail-value'>{d.value}</strong></span></div>; })}</div>
                        </section>
                      ))}
                    </div>
                  ) : null}
                </div>
                <div className='cnc-actions'>
                  {item.action ? <button type='button' title={item.action.label} aria-label={item.action.label} onClick={() => void p.onRunAction(item.key.slice(2), item.action!)}><Undo2 /></button> : null}
                  {expandable ? <button type='button' aria-expanded={isOpen} title={isOpen ? t('Згорнути', 'Inklappen') : t('Докладніше', 'Meer details')} aria-label={isOpen ? t('Згорнути', 'Inklappen') : t('Докладніше', 'Meer details')} onClick={() => { item.markRead(); setOpen((c) => ({ ...c, [item.key]: !c[item.key] })); }}>{isOpen ? <ChevronUp /> : <ChevronDown />}</button> : null}
                  {!item.read ? <button type='button' title={t('Позначити прочитаним', 'Als gelezen markeren')} aria-label={t('Позначити прочитаним', 'Als gelezen markeren')} onClick={() => item.markRead()}><CircleCheck /></button> : <span className='cnc-done' title={t('Прочитано', 'Gelezen')}><Check /></span>}
                  {item.remove ? <button type='button' title={t('Видалити з історії', 'Uit geschiedenis verwijderen')} aria-label={t('Видалити з історії', 'Uit geschiedenis verwijderen')} onClick={() => item.remove!()}><Trash2 /></button> : null}
                </div>
              </article>
            </div>
          );
        })}
      </div>
    </div>
  );
}
