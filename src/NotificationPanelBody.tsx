import { useMemo, useState, type ComponentType } from 'react';
import { Bell, Check, ChevronDown, ChevronUp, CircleCheck, Info, Layers, Search, Trash2, Undo2 } from 'lucide-react';
import { activityLink, activityTitle, durationText, sourceLabel, statusInfo, type ActivityEvent } from './connector-activity';
import { Logo } from './mcp-ui';
import { sectionLabel, styleOf, type Section } from './notification-style';
import './notification-panel.css';

type Lang = 'uk' | 'nl';
type Kind = 'info' | 'success' | 'warning' | 'error';
type Detail = { icon: string; label: string; value: string };
type SectionBlock = { title: string; items: Detail[] };

export type LocalRow = { id: string; text: string; kind: Kind; createdAt: number; source: string; read: boolean; link?: { href: string; label: string }; details?: SectionBlock[]; action?: { label: string; onAction: () => void | Promise<void> } };
export type ServerRow = { id: string; kind: string; title: string; message: string; createdAt: number; read?: boolean };

type Item = {
  key: string; group: string; origin: 'local' | 'server' | 'activity'; kind: Kind; title: string; text?: string; source: string; createdAt: number; read: boolean;
  status?: { text: string; group: 'waiting' | 'active' | 'done' | 'failed' | 'rejected' | 'expired' }; duration?: string;
  link?: { href: string; label: string }; details?: SectionBlock[]; facts?: Array<[string, string]>; markRead: () => void; remove?: () => void; action?: LocalRow['action'];
};
type Props = {
  lang: Lang; local: LocalRow[]; server: ServerRow[]; events: ActivityEvent[]; readEvents: Set<string>;
  onReadLocal: (id: string) => void; onRemoveLocal: (id: string) => void; onRunAction: (id: string, action: NonNullable<LocalRow['action']>) => void | Promise<void>;
  onReadServer?: (id: string) => void | Promise<void>; onReadEvent: (id: string) => void;
  detailIcons: Record<string, ComponentType<any>>;
};

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
  const key = dayKey(value);
  if (key === dayKey(Date.now())) return lang === 'uk' ? 'Сьогодні' : 'Vandaag';
  if (key === dayKey(Date.now() - 86400000)) return lang === 'uk' ? 'Учора' : 'Gisteren';
  return new Date(value).toLocaleDateString(lang === 'uk' ? 'uk-UA' : 'nl-BE', { day: 'numeric', month: 'long' });
}
/** Ключ групи: однакові за змістом сповіщення (без чисел і лапок) з однієї служби зливаються в одну групу. */
const groupKeyOf = (source: string, text: string) => `${source}|${text.toLowerCase().replace(/[\d«»"'“”‘’.,:;!?()[\]{}]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 48)}`;

type Filter = 'all' | 'unread' | 'waiting' | 'problems';
type Sort = 'new' | 'old' | 'unread' | 'status';
const GROUP_KEY = 'mr.notif.group';
const readGroupPref = () => { try { return localStorage.getItem(GROUP_KEY) !== '0'; } catch { return true; } };

/**
 * Список центру сповіщень: кожна мітка має колірний значок розділу з логотипом служби (Google, Microsoft, Claude, ОС пристрою…), легкий тон за типом
 * (успіх, увага, помилка), однакові сповіщення групуються (видно останнє, решта розгортається), пошук, фільтри, сортування, групування за днями.
 */
export default function NotificationPanelBody(p: Props) {
  const t = (uk: string, nl: string) => (p.lang === 'uk' ? uk : nl);
  const [filter, setFilter] = useState<Filter>('all');
  const [section, setSection] = useState<'all' | Section>('all');
  const [sort, setSort] = useState<Sort>('new');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [grouped, setGrouped] = useState<boolean>(readGroupPref);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const toggleGroupMode = () => { const next = !grouped; setGrouped(next); try { localStorage.setItem(GROUP_KEY, next ? '1' : '0'); } catch { /* geen opslag */ } };

  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    for (const r of p.local) out.push({ key: `l:${r.id}`, group: groupKeyOf(r.source, r.text), origin: 'local', kind: r.kind, title: r.text, source: r.source, createdAt: r.createdAt, read: r.read, link: r.link, details: r.details, markRead: () => p.onReadLocal(r.id), remove: () => p.onRemoveLocal(r.id), action: r.action });
    for (const r of p.server) out.push({ key: `s:${r.id}`, group: groupKeyOf('site', r.title), origin: 'server', kind: /error|fail/i.test(r.kind) ? 'error' : /warn/i.test(r.kind) ? 'warning' : 'info', title: r.title, text: r.message, source: 'site', createdAt: r.createdAt, read: Boolean(r.read), markRead: () => { if (!r.read) void p.onReadServer?.(r.id); } });
    for (const e of p.events) {
      const st = statusInfo(e.status, p.lang);
      const source = e.kind === 'site' ? e.source : e.source === 'claude' ? 'claude' : e.source === 'browser' ? `browser:${/edge/i.test(e.subject) ? 'edge' : /opera/i.test(e.subject) ? 'opera' : /firefox/i.test(e.subject) ? 'firefox' : 'chrome'}` : `agent:${/win/i.test(e.platform || '') ? 'windows' : /darwin|mac/i.test(e.platform || '') ? 'macos' : 'linux'}`;
      out.push({
        key: `a:${e.id}`, group: `${source}|${e.kind}|${e.type}|${st.group}`, origin: 'activity', source, createdAt: e.createdAt, read: p.readEvents.has(e.id),
        kind: st.group === 'failed' ? 'error' : st.group === 'waiting' ? 'warning' : st.group === 'done' || e.kind === 'grant' ? 'success' : 'info',
        title: activityTitle(e, p.lang), status: st, duration: e.kind === 'grant' || e.kind === 'site' ? undefined : durationText(e, p.lang),
        facts: [
          [t('Джерело', 'Bron'), e.kind === 'site' ? styleOf(source, p.lang).label : `${sourceLabel(e.source, p.lang)}${e.kind === 'command' ? ` → ${e.subject}` : ''}`],
          [t('Стан', 'Status'), st.text],
          [t('Початок', 'Begin'), new Date(e.createdAt).toLocaleString(p.lang === 'uk' ? 'uk-UA' : 'nl-BE')],
          ...(e.finishedAt ? [[t('Завершення', 'Einde'), new Date(e.finishedAt).toLocaleString(p.lang === 'uk' ? 'uk-UA' : 'nl-BE')] as [string, string]] : []),
          ...(e.kind !== 'grant' && e.kind !== 'site' ? [[t('Тривалість', 'Duur'), durationText(e, p.lang)] as [string, string]] : []),
        ],
        link: activityLink(e, p.lang).href ? activityLink(e, p.lang) : undefined, markRead: () => p.onReadEvent(e.id),
      });
    }
    return out;
  }, [p.local, p.server, p.events, p.readEvents, p.lang]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = items.filter((i) => {
      if (section !== 'all' && styleOf(i.source, p.lang).section !== section) return false;
      if (filter === 'unread' && i.read) return false;
      if (filter === 'waiting' && i.status?.group !== 'waiting') return false;
      if (filter === 'problems' && !(i.kind === 'error' || i.kind === 'warning' || i.status?.group === 'failed' || i.status?.group === 'expired' || i.status?.group === 'rejected')) return false;
      if (q && !`${i.title} ${i.text || ''} ${styleOf(i.source, p.lang).label} ${i.status?.text || ''}`.toLowerCase().includes(q)) return false;
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
  }, [items, filter, section, sort, query, p.lang]);

  // Групи: перший (за поточним порядком) елемент групи — «головний»; решта ховається під «ще N».
  const groups = useMemo(() => {
    if (!grouped) return shown.map((i) => [i]);
    const map = new Map<string, Item[]>(); const order: string[] = [];
    for (const i of shown) { if (!map.has(i.group)) { map.set(i.group, []); order.push(i.group); } map.get(i.group)!.push(i); }
    return order.map((k) => map.get(k)!);
  }, [shown, grouped]);

  const counts = useMemo(() => ({
    unread: items.filter((i) => !i.read).length,
    waiting: items.filter((i) => i.status?.group === 'waiting').length,
    problems: items.filter((i) => i.kind === 'error' || i.status?.group === 'failed').length,
  }), [items]);
  const sections = useMemo(() => [...new Set(items.map((i) => styleOf(i.source, p.lang).section))], [items, p.lang]);

  const chip = (id: Filter, label: string, n?: number) => (
    <button key={id} type='button' className='cnc-chip' aria-pressed={filter === id} onClick={() => setFilter(id)}>{label}{n ? <span className='cnc-chip-n'>{n}</span> : null}</button>
  );

  const renderRow = (item: Item, opts: { nested?: boolean; extra?: number; groupKey?: string; unread?: number } = {}) => {
    const style = styleOf(item.source, p.lang);
    const Icon = style.Icon;
    const expandable = Boolean(item.details?.length || item.facts?.length || item.text);
    const isOpen = Boolean(open[item.key]);
    const groupOpen = opts.groupKey ? Boolean(expandedGroups[opts.groupKey]) : false;
    return (
      <article className={`cnc-row sec-${style.section} kind-${item.kind}${item.read ? ' is-read' : ' is-unread'}${item.status ? ` st-${item.status.group}` : ''}${opts.nested ? ' is-nested' : ''}`} data-origin={item.origin} data-section={style.section} onPointerDown={() => { if (!item.read) item.markRead(); }}>
        <span className='cnc-icon' aria-hidden='true' title={`${style.label}${style.providerLabel ? ` · ${style.providerLabel}` : ''}`}>
          <Icon aria-hidden='true' />
          {style.provider ? <span className='cnc-provider'><Logo kind={style.provider} size={14} label={style.providerLabel} /></span> : null}
        </span>
        <div className='cnc-main'>
          <strong>{item.title}</strong>
          <div className='cnc-meta'>
            <span className='cnc-cat'>{style.label}{style.providerLabel && style.providerLabel !== style.label ? ` · ${style.providerLabel}` : ''}</span>
            {item.status ? <span className={`cnc-status st-${item.status.group}`}><i aria-hidden='true' />{item.status.text}</span> : null}
            <span title={new Date(item.createdAt).toLocaleString(p.lang === 'uk' ? 'uk-UA' : 'nl-BE')}>{relative(item.createdAt, p.lang)}</span>
            {item.duration ? <span>{item.duration}</span> : null}
          </div>
          {item.link ? <a className='cnc-link' href={item.link.href} onClick={() => item.markRead()}>{item.link.label} →</a> : null}
          {opts.extra ? (
            <button type='button' className='cnc-more' aria-expanded={groupOpen} onClick={() => setExpandedGroups((c) => ({ ...c, [opts.groupKey!]: !c[opts.groupKey!] }))}>
              <Layers aria-hidden='true' />{groupOpen ? t('Сховати попередні', 'Eerdere verbergen') : t(`Ще ${opts.extra} схожих`, `Nog ${opts.extra} vergelijkbare`)}
              {opts.unread ? <span className='cnc-chip-n'>{opts.unread}</span> : null}
            </button>
          ) : null}
          {isOpen ? (
            <div className='cnc-details'>
              {item.text ? <p>{item.text}</p> : null}
              {item.facts ? <dl>{item.facts.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl> : null}
              {item.details?.map((block, si) => (
                <section key={si} className='canonical-notification-detail-section'>
                  <h4>{block.title}</h4>
                  <div>{block.items.map((d, di) => { const DIcon = p.detailIcons[d.icon] || Info; return <div key={di} className='canonical-notification-detail-row'><DIcon aria-hidden='true' /><span><small>{d.label}</small><strong className='canonical-notification-detail-value'>{d.value}</strong></span></div>; })}</div>
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
    );
  };

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
          <button type='button' className='cnc-chip' aria-pressed={grouped} onClick={toggleGroupMode} title={t('Однакові сповіщення зливаються в одну групу: видно останнє, решта розгортається', 'Gelijke meldingen worden samengevoegd: u ziet de laatste, de rest klapt uit')}><Layers aria-hidden='true' style={{ width: 14, height: 14 }} />{t('Групувати', 'Groeperen')}</button>
        </div>
        <div className='cnc-sections' role='group' aria-label={t('Розділ', 'Sectie')}>
          <button type='button' className='cnc-sec' aria-pressed={section === 'all'} onClick={() => setSection('all')}>{t('Усі розділи', 'Alle secties')}</button>
          {sections.map((s) => { const SIcon = styleOf(s, p.lang).Icon; return <button key={s} type='button' className={`cnc-sec sec-${s}`} aria-pressed={section === s} onClick={() => setSection(s)} title={sectionLabel(s, p.lang)}><SIcon aria-hidden='true' />{sectionLabel(s, p.lang)}</button>; })}
        </div>
        <div className='cnc-selects'>
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
        {!groups.length ? (
          <div className='canonical-notification-empty'><Bell /><strong>{items.length ? t('Нічого не знайдено', 'Niets gevonden') : t('Історія сповіщень порожня', 'Meldingsgeschiedenis is leeg')}</strong>
            <span>{items.length ? t('Змініть фільтр або пошук.', 'Pas het filter of de zoekopdracht aan.') : t('Тут з’являтиметься все, що роблять Claude, ваші пристрої, браузер, пошта й сайт.', 'Hier verschijnt alles wat Claude, uw apparaten, de browser, de mail en de site doen.')}</span></div>
        ) : null}
        {groups.map((group) => {
          const lead = group[0];
          const day = dayKey(lead.createdAt);
          const header = (sort === 'new' || sort === 'old') && day !== lastDay ? dayLabel(lead.createdAt, p.lang) : null;
          lastDay = day;
          const rest = group.slice(1);
          const gk = lead.group;
          return (
            <div key={lead.key} role='listitem' className={rest.length ? 'cnc-group' : undefined}>
              {header ? <div className='cnc-day'>{header}</div> : null}
              {renderRow(lead, { extra: rest.length, groupKey: gk, unread: rest.filter((r) => !r.read).length })}
              {rest.length && expandedGroups[gk] ? <div className='cnc-nested'>{rest.map((r) => <div key={r.key}>{renderRow(r, { nested: true })}</div>)}</div> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
