import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Archive, ArchiveRestore, Bell, Check, CheckCheck, ChevronDown, ChevronUp, Circle, CircleCheck, Layers, RotateCcw, Trash2, Undo2 } from 'lucide-react';
import { Logo } from './mcp-ui';
import { DEFAULT_NOTICE_POLICY, NOTICE_KINDS, NOTICE_SECONDS_CHOICES, type CanonicalNoticeKind, type NoticePolicy, type NoticeState, type StoredNotice } from './canonical-notifications';
import { styleOf } from './notification-style';
import './notification-panel.css';

export type Lang = 'uk' | 'nl';
export type TabId = 'important' | 'all' | 'unread' | 'resolved' | 'archive';
export type SortId = 'new' | 'old' | 'unread' | 'kind';
export const TAB_IDS: TabId[] = ['important', 'all', 'unread', 'resolved', 'archive'];

const TAB_LABEL: Record<TabId, [string, string]> = {
  important: ['Важливі', 'Belangrijk'],
  all: ['Усі', 'Alle'],
  unread: ['Непрочитані', 'Ongelezen'],
  resolved: ['Вирішені', 'Opgelost'],
  archive: ['Архів', 'Archief'],
};
const TAB_EMPTY: Record<TabId, { title: [string, string]; hint: [string, string] }> = {
  important: {
    title: ['Нічого, що потребує уваги', 'Niets om op te letten'],
    hint: ['Тут містяться помилки, попередження й дії, що чекають на ваше рішення. Вирішене зникає звідси саме.', 'Hier staan fouten, waarschuwingen en acties die op uw beslissing wachten. Wat is afgehandeld, verdwijnt hier vanzelf.'],
  },
  all: {
    title: ['Ще немає повідомлень', 'Nog geen meldingen'],
    hint: ['Тут з’являється все, що роблять Claude, ваші пристрої, браузер, пошта, хмара та сайт.', 'Hier verschijnt alles wat Claude, uw apparaten, de browser, de mail, de cloud en de site doen.'],
  },
  unread: {
    title: ['Усе прочитано', 'Alles is gelezen'],
    hint: ['Повідомлення вважається прочитаним, щойно ви побачили його на екрані: у спливаючому вікні або в цьому списку.', 'Een melding telt als gelezen zodra u die op het scherm hebt gezien: in een pop-up of in dit venster.'],
  },
  resolved: {
    title: ['Ще нічого не вирішено', 'Nog niets opgelost'],
    hint: ['Завершені та вирішені повідомлення. Позначте з галочкою, або повідомлення зникне саме, коли та сама дія пізніше вдалася.', 'Afgeronde en opgeloste meldingen. Markeer met het vinkje, of de melding verdwijnt vanzelf zodra dezelfde actie later wel lukt.'],
  },
  archive: {
    title: ['Архів порожній', 'Het archief is leeg'],
    hint: ['Заархівовані повідомлення. Старі потрапляють сюди самі: відкриті через 14 днів, вирішені через 30. Архів очищується через 60 днів.', 'Gearchiveerde meldingen. Oudere meldingen komen hier vanzelf: open na 14 dagen, opgelost na 30 dagen. Het archief wordt na 60 dagen leeggemaakt.'],
  },
};

export const tabLabel = (tab: TabId, lang: Lang) => (lang === 'uk' ? TAB_LABEL[tab][0] : TAB_LABEL[tab][1]);

/** Welke meldingen in welk tabblad horen. Gearchiveerd staat alleen in het archief. */
export function tabMatches(tab: TabId, row: StoredNotice): boolean {
  if (tab === 'archive') return row.state === 'archived';
  if (row.state === 'archived') return false;
  if (tab === 'all') return true;
  if (tab === 'unread') return !row.read;
  if (tab === 'resolved') return row.state === 'resolved';
  return row.state === 'open' && (row.kind === 'error' || row.kind === 'warning' || row.status === 'waiting');
}

export function countTabs(rows: StoredNotice[]): Record<TabId, number> {
  const out = { important: 0, all: 0, unread: 0, resolved: 0, archive: 0 } as Record<TabId, number>;
  for (const tab of TAB_IDS) out[tab] = rows.filter((row) => tabMatches(tab, row)).length;
  return out;
}

const SEVERITY: Record<CanonicalNoticeKind, number> = { error: 3, warning: 2, info: 1, success: 0 };
const dayKey = (value: number) => { const d = new Date(value); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };
function dayLabel(value: number, lang: Lang): string {
  const key = dayKey(value);
  if (key === dayKey(Date.now())) return lang === 'uk' ? 'Сьогодні' : 'Vandaag';
  if (key === dayKey(Date.now() - 86400000)) return lang === 'uk' ? 'Учора' : 'Gisteren';
  return new Date(value).toLocaleDateString(lang === 'uk' ? 'uk-UA' : 'nl-BE', { day: 'numeric', month: 'long' });
}
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

/** Knop met alleen een pictogram. De naam verschijnt als tooltip bij hover, en bij een lange druk (touch). */
export function IconButton({ label, onClick, children, tone, pressed, expanded }: { label: string; onClick?: () => void; children: ReactNode; tone?: 'danger'; pressed?: boolean; expanded?: boolean }) {
  const [held, setHeld] = useState(false);
  const timers = useRef({ press: 0, hide: 0 });
  const press = () => { window.clearTimeout(timers.current.press); timers.current.press = window.setTimeout(() => setHeld(true), 450); };
  const release = () => {
    window.clearTimeout(timers.current.press);
    if (held) { window.clearTimeout(timers.current.hide); timers.current.hide = window.setTimeout(() => setHeld(false), 1400); }
  };
  return (
    <button
      type='button'
      className={`cnc-ib${tone ? ` tone-${tone}` : ''}`}
      aria-label={label}
      data-tip={label}
      data-held={held ? 'true' : undefined}
      aria-pressed={pressed}
      aria-expanded={expanded}
      onPointerDown={press}
      onPointerUp={release}
      onPointerLeave={release}
      onPointerCancel={release}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export type BodyActions = {
  /** Markeert als gelezen (de gerelateerde pagina opent via de link zelf). */
  open: (id: string) => void;
  toggleRead: (id: string) => void;
  setState: (id: string, state: NoticeState) => void;
  remove: (id: string) => void;
  run: (id: string) => void;
  /** Het label van de knop van de melding, als die nog werkt; anders niets. */
  actionLabel: (id: string) => string | undefined;
};
export type BodyProps = { lang: Lang; rows: StoredNotice[]; tab: TabId; query: string; sort: SortId; grouped: boolean; actions: BodyActions };

/**
 * Lijst van het meldingencentrum. Elke melding toont wat er gebeurde, de oorzaak, en wat u kunt doen, met pictogramknoppen onderaan.
 * Gelijke meldingen (zelfde onderwerp) vormen één groep: de laatste is zichtbaar, de rest klapt uit.
 */
export default function NotificationPanelBody(p: BodyProps) {
  const t = (uk: string, nl: string) => (p.lang === 'uk' ? uk : nl);
  const [details, setDetails] = useState<Record<string, boolean>>({});
  const [groupsOpen, setGroupsOpen] = useState<Record<string, boolean>>({});

  const shown = useMemo(() => {
    const q = p.query.trim().toLowerCase();
    const list = p.rows.filter((row) => {
      if (!tabMatches(p.tab, row)) return false;
      if (!q) return true;
      const style = styleOf(row.source, p.lang);
      return `${row.text} ${row.explain || ''} ${style.label} ${style.providerLabel}`.toLowerCase().includes(q);
    });
    return [...list].sort((a, b) => {
      if (p.sort === 'old') return a.updatedAt - b.updatedAt;
      if (p.sort === 'unread') return Number(a.read) - Number(b.read) || b.updatedAt - a.updatedAt;
      if (p.sort === 'kind') return SEVERITY[b.kind] - SEVERITY[a.kind] || b.updatedAt - a.updatedAt;
      return b.updatedAt - a.updatedAt;
    });
  }, [p.rows, p.tab, p.query, p.sort, p.lang]);

  const groups = useMemo(() => {
    if (!p.grouped) return shown.map((row) => [row]);
    const map = new Map<string, StoredNotice[]>();
    for (const row of shown) {
      const key = row.topic || row.id;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(row);
    }
    return [...map.values()];
  }, [shown, p.grouped]);

  const fmt = (value: number) => new Date(value).toLocaleString(p.lang === 'uk' ? 'uk-UA' : 'nl-BE');
  let lastDay = '';

  const renderRow = (row: StoredNotice, nested: boolean): ReactNode => {
    const style = styleOf(row.source, p.lang);
    const Icon = style.Icon;
    const open = Boolean(details[row.id]);
    const label = p.actions.actionLabel(row.id);
    return (
      <article key={row.id} className={`cnc-row sec-${style.section} kind-${row.kind} st-${row.state}${row.read ? ' is-read' : ' is-unread'}${nested ? ' is-nested' : ''}`} data-state={row.state} data-origin={row.origin}>
        <span className='cnc-icon' aria-hidden='true' title={`${style.label}${style.providerLabel ? ` · ${style.providerLabel}` : ''}`}>
          <Icon aria-hidden='true' />
          {style.provider ? <span className='cnc-provider'><Logo kind={style.provider} size={14} label={style.providerLabel} /></span> : null}
        </span>
        <div className='cnc-main'>
          <strong className='cnc-title'>{row.text}</strong>
          {row.explain ? <p className='cnc-explain'>{row.explain}</p> : null}
          <div className='cnc-meta'>
            <span className='cnc-cat'>{style.label}{style.providerLabel && style.providerLabel !== style.label ? ` · ${style.providerLabel}` : ''}</span>
            <span title={fmt(row.updatedAt)}>{relative(row.updatedAt, p.lang)}</span>
            {row.count > 1 ? <span className='cnc-count' title={t('Та сама подія, об’єднано', 'Dezelfde gebeurtenis, samengevoegd')}>×{row.count}</span> : null}
            {row.state === 'resolved' ? <span className='cnc-pill is-resolved'>{t('Вирішено', 'Opgelost')}</span> : null}
            {row.state === 'archived' ? <span className='cnc-pill is-archived'>{row.auto ? t('Автоматично в архіві', 'Automatisch gearchiveerd') : t('В архіві', 'Gearchiveerd')}</span> : null}
          </div>
          {row.link ? <a className='cnc-link' href={row.link.href} onClick={() => p.actions.open(row.id)}>{row.link.label} →</a> : null}
          {open ? (
            <div className='cnc-details'>
              {row.details?.map((block, si) => (
                <section key={si} className='cnc-detail-block'>
                  <h4>{block.title}</h4>
                  {block.items.map((item, ii) => <div key={ii} className='cnc-detail-row'><span>{item.label}</span><strong>{item.value}</strong></div>)}
                </section>
              ))}
              <dl>
                <div><dt>{t('Перша поява', 'Eerste melding')}</dt><dd>{fmt(row.createdAt)}</dd></div>
                <div><dt>{t('Остання поява', 'Laatste melding')}</dt><dd>{fmt(row.updatedAt)}</dd></div>
                {row.count > 1 ? <div><dt>{t('Скільки разів', 'Aantal keer')}</dt><dd>{row.count}</dd></div> : null}
              </dl>
            </div>
          ) : null}
          <div className='cnc-row-actions'>
            {label ? <IconButton label={label} onClick={() => p.actions.run(row.id)}><Undo2 /></IconButton> : null}
            <IconButton label={row.read ? t('Позначити як непрочитане', 'Markeer als ongelezen') : t('Позначити як прочитане', 'Markeer als gelezen')} pressed={!row.read} onClick={() => p.actions.toggleRead(row.id)}>
              {row.read ? <Circle /> : <CircleCheck />}
            </IconButton>
            {row.state === 'open' ? <IconButton label={t('Позначити як вирішене', 'Markeer als opgelost')} onClick={() => p.actions.setState(row.id, 'resolved')}><CheckCheck /></IconButton> : null}
            {row.state === 'resolved' ? <IconButton label={t('Знову відкрити', 'Weer openen')} onClick={() => p.actions.setState(row.id, 'open')}><RotateCcw /></IconButton> : null}
            {row.state === 'archived'
              ? <IconButton label={t('Повернути з архіву', 'Terugzetten uit het archief')} onClick={() => p.actions.setState(row.id, 'resolved')}><ArchiveRestore /></IconButton>
              : <IconButton label={t('В архів', 'Archiveren')} onClick={() => p.actions.setState(row.id, 'archived')}><Archive /></IconButton>}
            {row.state === 'archived' && row.origin === 'local' ? <IconButton label={t('Видалити з історії', 'Uit de geschiedenis verwijderen')} tone='danger' onClick={() => p.actions.remove(row.id)}><Trash2 /></IconButton> : null}
            <IconButton label={open ? t('Менше деталей', 'Minder details') : t('Більше деталей', 'Meer details')} expanded={open} onClick={() => setDetails((c) => ({ ...c, [row.id]: !c[row.id] }))}>
              {open ? <ChevronUp /> : <ChevronDown />}
            </IconButton>
          </div>
        </div>
      </article>
    );
  };

  const emptyTitle = p.lang === 'uk' ? TAB_EMPTY[p.tab].title[0] : TAB_EMPTY[p.tab].title[1];
  const emptyHint = p.lang === 'uk' ? TAB_EMPTY[p.tab].hint[0] : TAB_EMPTY[p.tab].hint[1];

  return (
    <div className='cnc-list' role='list'>
      {!groups.length ? (
        <div className='cnc-empty'>
          {p.tab === 'important' ? <Check aria-hidden='true' /> : p.tab === 'archive' ? <Archive aria-hidden='true' /> : <Bell aria-hidden='true' />}
          <strong>{p.query.trim() ? t('Нічого не знайдено', 'Niets gevonden') : emptyTitle}</strong>
          <span>{p.query.trim() ? t('Змініть пошук.', 'Pas de zoekopdracht aan.') : emptyHint}</span>
        </div>
      ) : null}
      {groups.map((group) => {
        const lead = group[0];
        const rest = group.slice(1);
        const day = dayKey(lead.updatedAt);
        const header = (p.sort === 'new' || p.sort === 'old') && day !== lastDay ? dayLabel(lead.updatedAt, p.lang) : null;
        lastDay = day;
        const key = lead.topic || lead.id;
        const groupOpen = Boolean(groupsOpen[key]);
        const restUnread = rest.filter((row) => !row.read).length;
        return (
          <div key={lead.id} role='listitem' className={rest.length ? 'cnc-group' : 'cnc-group is-single'}>
            {header ? <div className='cnc-day'>{header}</div> : null}
            {renderRow(lead, false)}
            {rest.length ? (
              <button type='button' className='cnc-more' aria-expanded={groupOpen} onClick={() => setGroupsOpen((c) => ({ ...c, [key]: !c[key] }))}>
                <Layers aria-hidden='true' />
                {groupOpen ? t('Сховати попередні', 'Eerdere verbergen') : (p.lang === 'uk' ? `Ще ${rest.length} схожих` : `Nog ${rest.length} vergelijkbare`)}
                {restUnread ? <span className='cnc-chip-n'>{restUnread}</span> : null}
              </button>
            ) : null}
            {rest.length && groupOpen ? <div className='cnc-nested'>{rest.map((row) => renderRow(row, true))}</div> : null}
          </div>
        );
      })}
    </div>
  );
}

/** Instellingen per soort melding: pop-up, geluid, blijft staan en duur. */
export function NoticeSettings(props: { lang: Lang; policy: NoticePolicy; onChange: (next: NoticePolicy) => void; sound: boolean; onSound: (on: boolean) => void }) {
  const t = (uk: string, nl: string) => (props.lang === 'uk' ? uk : nl);
  const names: Record<CanonicalNoticeKind, [string, string]> = { error: ['Помилки', 'Fouten'], warning: ['Попередження', 'Waarschuwingen'], success: ['Успіх', 'Gelukt'], info: ['Інформація', 'Informatie'] };
  const set = (kind: CanonicalNoticeKind, patch: Partial<NoticePolicy[CanonicalNoticeKind]>) => props.onChange({ ...props.policy, [kind]: { ...props.policy[kind], ...patch } });
  return (
    <div className='cnc-settings'>
      <p className='cnc-settings-lead'>
        {t(
          'Спливаючі вікна зникають самі після вказаного часу. Наведіть мишу, щоб читати довше; смужка під вікном показує залишок часу. Кожне повідомлення лишається в історії.',
          'Pop-ups verdwijnen vanzelf na de ingestelde tijd. Houd de muis erop om te blijven lezen; de balk onder de pop-up toont de resterende tijd. Elke melding blijft in de geschiedenis.',
        )}
      </p>
      <label className='cnc-switch'>
        <input type='checkbox' checked={props.sound} onChange={(e) => props.onSound(e.target.checked)} />
        {t('Звук (головний перемикач)', 'Geluid (hoofdschakelaar)')}
      </label>
      <table className='cnc-settings-table'>
        <thead>
          <tr>
            <th scope='col'>{t('Тип', 'Soort')}</th>
            <th scope='col'>{t('Спливає', 'Pop-up')}</th>
            <th scope='col'>{t('Звук', 'Geluid')}</th>
            <th scope='col'>{t('Лишається', 'Blijft staan')}</th>
            <th scope='col'>{t('Тривалість', 'Duur')}</th>
          </tr>
        </thead>
        <tbody>
          {NOTICE_KINDS.map((kind) => {
            const row = props.policy[kind];
            const name = props.lang === 'uk' ? names[kind][0] : names[kind][1];
            return (
              <tr key={kind}>
                <th scope='row'><span className={`cnc-kind-dot kind-${kind}`} aria-hidden='true' />{name}</th>
                <td><input type='checkbox' aria-label={t(`${name}: спливає`, `${name}: pop-up`)} checked={row.toast} onChange={(e) => set(kind, { toast: e.target.checked })} /></td>
                <td><input type='checkbox' aria-label={t(`${name}: звук`, `${name}: geluid`)} checked={row.sound} onChange={(e) => set(kind, { sound: e.target.checked })} /></td>
                <td><input type='checkbox' aria-label={t(`${name}: лишається, доки не закрию`, `${name}: blijft staan tot ik sluit`)} checked={row.sticky} onChange={(e) => set(kind, { sticky: e.target.checked })} /></td>
                <td>
                  <select aria-label={t(`${name}: тривалість у секундах`, `${name}: duur in seconden`)} value={row.seconds} disabled={row.sticky} onChange={(e) => set(kind, { seconds: Number(e.target.value) })}>
                    {[...new Set([...NOTICE_SECONDS_CHOICES, row.seconds])].sort((a, b) => a - b).map((s) => <option key={s} value={s}>{s} c</option>)}
                  </select>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className='cnc-settings-foot'>
        <button type='button' className='cnc-text-btn' onClick={() => props.onChange({ ...DEFAULT_NOTICE_POLICY })}>
          <RotateCcw aria-hidden='true' />
          {t('Відновити стандартні', 'Standaard herstellen')}
        </button>
      </div>
    </div>
  );
}

export type DotItem = { id: string; text: string; count: number; onOpen?: () => void; onClear?: () => void };

/**
 * Stip bij een onderdeel van het menu, met uitleg: welk onderdeel het is en hoeveel er nieuw is. Hover of klik opent een venster met de items,
 * met knoppen om het onderdeel te openen of als gezien te markeren. Zonder nieuwe items verdwijnt de stip.
 */
export function NoticeDot({ lang, label, items, className }: { lang: Lang; label: string; items: DotItem[]; className?: string }) {
  const t = (uk: string, nl: string) => (lang === 'uk' ? uk : nl);
  const [hover, setHover] = useState(false);
  const [pinned, setPinned] = useState(false);
  const total = items.reduce((sum, item) => sum + item.count, 0);
  if (!total) return null;
  const open = hover || pinned;
  const close = () => { setPinned(false); setHover(false); };
  return (
    <span className={`cnc-dot-wrap${className ? ` ${className}` : ''}`} onPointerEnter={() => setHover(true)} onPointerLeave={() => setHover(false)}>
      <button
        type='button'
        className='cnc-dot'
        aria-expanded={open}
        aria-label={t(`${label}: ${total} нових`, `${label}: ${total} nieuw`)}
        data-tip={t('Що означає ця позначка: натисніть для деталей', 'Wat is dit: klik voor details')}
        onClick={() => setPinned((v) => !v)}
        onFocus={() => setHover(true)}
        onBlur={() => setHover(false)}
      />
      {open ? (
        <div className='cnc-dot-pop' role='dialog' aria-label={t(`Нове в розділі ${label}`, `Nieuw in ${label}`)}>
          <header>
            <strong>{t(`Нове в розділі «${label}»`, `Nieuw in «${label}»`)}</strong>
            <small>{t(`${total} нових з часу вашого останнього візиту`, `${total} nieuw sinds uw laatste bezoek`)}</small>
          </header>
          <p>{t('Ця позначка означає, що в розділі з’явилося щось нове. Відкрийте розділ, щоб це побачити, або позначте його як переглянуте.', 'Deze stip betekent dat er in dit onderdeel iets nieuws is. Open het onderdeel om het te zien, of markeer het als gezien.')}</p>
          <ul>
            {items.map((item) => (
              <li key={item.id}>
                <span>{item.text} <b>{item.count}</b></span>
                <span className='cnc-dot-actions'>
                  {item.onOpen ? <button type='button' onClick={() => { close(); item.onOpen?.(); }}>{t('Відкрити', 'Openen')}</button> : null}
                  {item.onClear ? <button type='button' onClick={() => item.onClear?.()}>{t('Переглянуто', 'Gezien')}</button> : null}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </span>
  );
}
