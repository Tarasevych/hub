import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Check, Plus, Settings2 } from 'lucide-react';
import StableAvatar from './StabielAvatar';
import { Logo, type LogoKind } from './mcp-ui';
import type { MailConnector } from './MailAccountWisselaar';
import './mail-account-badge.css';
import { focusTerug, focusVerloren, menuToets } from './platform/toegankelijk';

type Lang = 'uk' | 'nl';
type Account = { id: string; email: string; displayName: string; picture: string; accountRole: 'primary' | 'additional' };
type Props = { lang: Lang; accounts: Account[]; activeAccountId: string; connectors: MailConnector[]; onSelect: (id: string) => void; onManage: () => void; onAdd: () => void };

const initialsOf = (a?: Account) => ((a?.displayName || a?.email || '?').trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join('') || '?').toUpperCase();
const kindOf = (provider: string): LogoKind => (provider === 'microsoft' ? 'microsoft' : 'google');

/**
 * 21.10: клас «small» на фото в меню перейменовано на «is-klein» — глобальний модифікатор кнопки .small (index.css: padding .4rem .7rem,
 * min-height 44px) стискав фото до 17,6×40 (овал замість кола). Ініціали — у власному span, щоб логотип не ставав «першою дитиною».
 * Круглий аватар ПОШТОВОГО акаунта (не всього сервісу) у правому куті, з логотипом сервісу (Google/Microsoft) на краю: одразу видно, яка пошта
 * зараз відкрита. Дотик відкриває список підключених скриньок для швидкого перемикання. Показується лише на вузьких екранах (на широких є перемикач у контекстній панелі).
 */
export default function MailAccountBadge({ lang, accounts, activeAccountId, connectors, onSelect, onManage, onAdd }: Props) {
  const t = (uk: string, nl: string) => (lang === 'uk' ? uk : nl);
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState<{ top: number; maxHeight: number } | null>(null);
  const root = useRef<HTMLDivElement | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const active = accounts.find((a) => a.id === activeAccountId) || accounts[0];
  const extra = useMemo(() => {
    const keys = new Set(accounts.map((a) => `google:${a.email.toLowerCase()}`));
    return connectors.filter((c) => !['revoked', 'disconnected'].includes(c.status) && !keys.has(`${c.provider}:${c.email.toLowerCase()}`));
  }, [accounts, connectors]);

  useLayoutEffect(() => {
    if (!open || !trigger.current) return;
    const rect = trigger.current.getBoundingClientRect();
    const vv = window.visualViewport;
    const height = vv ? vv.height : window.innerHeight;
    setPlace({ top: Math.round(rect.bottom + 8), maxHeight: Math.max(160, Math.round(height - rect.bottom - 16)) });
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: Event) => { if (root.current && !root.current.contains(event.target as Node)) setOpen(false); };
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); trigger.current?.focus(); } };
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', key); };
  }, [open]);

  // Toegankelijkheid 21.10 (WAI-ARIA menu): open → focus op de gekozen mailbox (of het eerste item); ↑/↓/Home/End; Esc/Tab sluiten;
  // dicht → focus terug op de avatar (tenzij een actie de focus elders zette).
  const menuRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open || !place) return;
    const r = requestAnimationFrame(() => { const m = menuRef.current; (m?.querySelector<HTMLElement>('[role=menuitemradio][aria-checked=true]') || m?.querySelector<HTMLElement>('[role^=menuitem]'))?.focus(); });
    return () => cancelAnimationFrame(r);
  }, [open, place]);
  useEffect(() => { if (!open) return; return () => { requestAnimationFrame(() => { if (focusVerloren()) focusTerug(trigger.current); }); }; }, [open]);
  const menuToetsen = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const items = [...(menuRef.current?.querySelectorAll<HTMLElement>('[role^=menuitem]') || [])];
    if (menuToets(e, items)) return;
    if (e.key === 'Tab') { setOpen(false); trigger.current?.focus(); }
  };
  if (!active) return null;
  return (
    <div ref={root} className="mail-account-badge">
      <button ref={trigger} type="button" className="mail-account-badge-trigger" aria-haspopup="menu" aria-expanded={open}
        aria-label={`${t('Поштовий акаунт', 'Mailaccount')}: ${active.email}. ${t('Змінити', 'Wijzigen')}`} onClick={() => setOpen((v) => !v)}>
        <span className="mail-account-badge-photo"><StableAvatar src={active.picture} fallback={initialsOf(active)} alt="" /></span>
        <span className="mail-account-badge-logo" aria-hidden="true"><Logo kind="google" size={14} /></span>
      </button>
      {open && place && (
        <div ref={menuRef} className="mail-account-badge-menu" role="menu" aria-label={t('Поштові скриньки', 'Mailboxen')} onKeyDown={menuToetsen} style={{ top: place.top, maxHeight: place.maxHeight }}>
          <header role="none"><strong>{t('Поштові скриньки', 'Mailboxen')}</strong><small>{t('Оберіть, яку пошту показувати', 'Kies welke mailbox wordt getoond')}</small></header>
          <div className="mail-account-badge-list">
            {accounts.map((a) => (
              <button key={`g:${a.id}`} type="button" role="menuitemradio" aria-checked={a.id === activeAccountId} className={a.id === activeAccountId ? 'active' : ''}
                onClick={() => { setOpen(false); if (a.id !== activeAccountId) onSelect(a.id); }}>
                <span className="mail-account-badge-photo is-klein" aria-hidden="true"><StableAvatar src={a.picture} fallback={<span className="mail-account-badge-initial">{initialsOf(a)}</span>} alt="" /><span className="mail-account-badge-logo"><Logo kind="google" size={12} /></span></span>
                <span><strong>{a.displayName || a.email}</strong><small>{a.email}{a.accountRole === 'primary' ? ` · ${t('основний', 'primair')}` : ''}</small></span>
                {a.id === activeAccountId ? <Check size={18} /> : null}
              </button>
            ))}
            {extra.map((c) => (
              <button key={`${c.provider}:${c.id}`} type="button" role="menuitem" onClick={() => { setOpen(false); onManage(); }}>
                <span className="mail-account-badge-photo is-klein" aria-hidden="true"><span className="mail-account-badge-initial">{(c.email[0] || '?').toUpperCase()}</span><span className="mail-account-badge-logo"><Logo kind={kindOf(c.provider)} size={12} /></span></span>
                <span><strong>{c.email}</strong><small>{c.provider === 'microsoft' ? 'Microsoft' : 'Google'} · {c.status === 'connected' ? t('підключено', 'gekoppeld') : t('потрібна дія', 'actie nodig')}</small></span>
                <Settings2 size={18} />
              </button>
            ))}
          </div>
          <footer role="none"><button type="button" role="menuitem" onClick={() => { setOpen(false); onAdd(); }}><Plus size={18} /><span>{t('Додати акаунт', 'Account toevoegen')}</span></button></footer>
        </div>
      )}
    </div>
  );
}
