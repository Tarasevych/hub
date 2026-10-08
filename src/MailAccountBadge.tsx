import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Check, Plus, Settings2 } from 'lucide-react';
import StableAvatar from './StableAvatar';
import { Logo, type LogoKind } from './mcp-ui';
import type { MailConnector } from './MailAccountSwitcher';
import './mail-account-badge.css';

type Lang = 'uk' | 'nl';
type Account = { id: string; email: string; displayName: string; picture: string; accountRole: 'primary' | 'additional' };
type Props = { lang: Lang; accounts: Account[]; activeAccountId: string; connectors: MailConnector[]; onSelect: (id: string) => void; onManage: () => void; onAdd: () => void };

const initialsOf = (a?: Account) => ((a?.displayName || a?.email || '?').trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join('') || '?').toUpperCase();
const kindOf = (provider: string): LogoKind => (provider === 'microsoft' ? 'microsoft' : 'google');

/**
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
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', key); };
  }, [open]);

  if (!active) return null;
  return (
    <div ref={root} className="mail-account-badge">
      <button ref={trigger} type="button" className="mail-account-badge-trigger" aria-haspopup="menu" aria-expanded={open}
        aria-label={`${t('Поштовий акаунт', 'Mailaccount')}: ${active.email}. ${t('Змінити', 'Wijzigen')}`} onClick={() => setOpen((v) => !v)}>
        <span className="mail-account-badge-photo"><StableAvatar src={active.picture} fallback={initialsOf(active)} alt="" /></span>
        <span className="mail-account-badge-logo"><Logo kind="google" size={14} /></span>
      </button>
      {open && place && (
        <div className="mail-account-badge-menu" role="menu" style={{ top: place.top, maxHeight: place.maxHeight }}>
          <header><strong>{t('Поштові скриньки', 'Mailboxen')}</strong><small>{t('Оберіть, яку пошту показувати', 'Kies welke mailbox wordt getoond')}</small></header>
          <div className="mail-account-badge-list">
            {accounts.map((a) => (
              <button key={`g:${a.id}`} type="button" role="menuitemradio" aria-checked={a.id === activeAccountId} className={a.id === activeAccountId ? 'active' : ''}
                onClick={() => { setOpen(false); if (a.id !== activeAccountId) onSelect(a.id); }}>
                <span className="mail-account-badge-photo small"><StableAvatar src={a.picture} fallback={initialsOf(a)} alt="" /><span className="mail-account-badge-logo"><Logo kind="google" size={12} /></span></span>
                <span><strong>{a.displayName || a.email}</strong><small>{a.email}{a.accountRole === 'primary' ? ` · ${t('основний', 'primair')}` : ''}</small></span>
                {a.id === activeAccountId ? <Check size={18} /> : null}
              </button>
            ))}
            {extra.map((c) => (
              <button key={`${c.provider}:${c.id}`} type="button" role="menuitem" onClick={() => { setOpen(false); onManage(); }}>
                <span className="mail-account-badge-photo small"><span className="mail-account-badge-initial">{(c.email[0] || '?').toUpperCase()}</span><span className="mail-account-badge-logo"><Logo kind={kindOf(c.provider)} size={12} /></span></span>
                <span><strong>{c.email}</strong><small>{c.provider === 'microsoft' ? 'Microsoft' : 'Google'} · {c.status === 'connected' ? t('підключено', 'gekoppeld') : t('потрібна дія', 'actie nodig')}</small></span>
                <Settings2 size={18} />
              </button>
            ))}
          </div>
          <footer><button type="button" role="menuitem" onClick={() => { setOpen(false); onAdd(); }}><Plus size={18} /><span>{t('Додати акаунт', 'Account toevoegen')}</span></button></footer>
        </div>
      )}
    </div>
  );
}
