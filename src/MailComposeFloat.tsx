import { MailPlus } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { registerZone, queueRecompute, bindAvoidanceListeners } from './floating-avoidance';
import { useExternalRectGetter } from './use-external-rect';
import MailNewMessageDialog from './MailNewMessageDialog';

type Props = {
  lang: 'uk' | 'nl';
  sourceOrigin: string;
  tabContext: string;
  ownerUserId: string;
  sessionReady: boolean;
};

export default function MailComposeFloat(p: Props) {
  const t = (uk: string, nl: string) => (p.lang === 'uk' ? uk : nl);
  const [accountId, setAccountId] = useState('');
  const [composeOpen, setComposeOpen] = useState(false);
  const [floatPos, setFloatPos] = useState({ x: 0.94, y: 0.975 });
  const [userPos, setUserPos] = useState<{ x: number; y: number } | null>(() => {
    try {
      const raw = localStorage.getItem('tsv:mail-compose-float-pos-v2');
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return Number.isFinite(parsed?.x) && Number.isFinite(parsed?.y)
        ? { x: Math.max(4, Math.min(window.innerWidth - 48, parsed.x)), y: Math.max(4, Math.min(window.innerHeight - 48, parsed.y)) }
        : null;
    } catch {
      return null;
    }
  });
  const [dragging, setDragging] = useState(false);
  const [avoidOffset, setAvoidOffset] = useState<{ x: number; y: number } | null>(null);
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ offsetX: number; offsetY: number; startX: number; startY: number; moved: boolean; pointerId: number } | null>(null);
  const justDraggedRef = useRef(false);
  const longPressRef = useRef<number | undefined>(undefined);
  const composeRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const composeRectGetter = useCallback(() => composeRef.current?.getBoundingClientRect() || null, []);
  const bellRectGetter = useExternalRectGetter("[data-qa-id='canonical-notification-bell']");

  const context = { service: 'mail', sourceOrigin: p.sourceOrigin, tabContext: p.tabContext };

  const clampPos = (x: number, y: number) => ({
    x: Math.max(4, Math.min(window.innerWidth - 48, x)),
    y: Math.max(4, Math.min(window.innerHeight - 48, y)),
  });

  const startDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.button !== undefined && event.button !== 0 && event.pointerType === 'mouse') return;
    const rect = composeRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragRef.current = { offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top, startX: event.clientX, startY: event.clientY, moved: false, pointerId: event.pointerId };
    justDraggedRef.current = false;
  };

  const onDragMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current;
    if (!d) return;
    if (!d.moved) {
      if (Math.hypot(event.clientX - d.startX, event.clientY - d.startY) <= 8) return;
      d.moved = true;
      setDragging(true);
      try { event.currentTarget.setPointerCapture(d.pointerId); } catch {}
    }
    window.clearTimeout(longPressRef.current);
    const next = clampPos(event.clientX - d.offsetX, event.clientY - d.offsetY);
    setUserPos(next);
  };

  const endDrag = (_event: React.PointerEvent<HTMLButtonElement>) => {
    window.clearTimeout(longPressRef.current);
    const d = dragRef.current;
    if (!d?.moved) { dragRef.current = null; return; }
    justDraggedRef.current = true;
    setDragging(false);
    dragRef.current = null;
    setUserPos(current => {
      if (current) try { localStorage.setItem('tsv:mail-compose-float-pos-v2', JSON.stringify(current)); } catch {}
      return current;
    });
  };

  const openMenu = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setMenuAt({ x: event.clientX, y: event.clientY });
  };

  const resetPosition = () => {
    setUserPos(null);
    setMenuAt(null);
    try { localStorage.removeItem('tsv:mail-compose-float-pos-v2'); } catch {}
  };

  // Load active account
  useEffect(() => {
    if (!p.sessionReady) return;
    let cancelled = false;
    (async () => {
      try {
        const { api } = await import('./platform/client');
        const response = await api.post('/api/owner/mail/google-suite/accounts', context);
        if (!cancelled) {
          const id = String(response.data.activeAccountId || response.data.account?.id || response.data.accounts?.[0]?.id || '');
          setAccountId(id);
        }
      } catch {}
    })();
    const onAccount = () => {
      // re-fetch on account change
      (async () => {
        try {
          const { api } = await import('./platform/client');
          const response = await api.post('/api/owner/mail/google-suite/accounts', context);
          if (!cancelled) setAccountId(String(response.data.activeAccountId || response.data.account?.id || response.data.accounts?.[0]?.id || ''));
        } catch {}
      })();
    };
    window.addEventListener('tsv:mail-account-changed', onAccount);
    return () => { cancelled = true; window.removeEventListener('tsv:mail-account-changed', onAccount); };
  }, [p.sessionReady, p.sourceOrigin, p.tabContext]);

  // Listen for open-compose from sidebar pill
  useEffect(() => {
    const open = () => setComposeOpen(true);
    window.addEventListener('mail:open-compose', open);
    return () => window.removeEventListener('mail:open-compose', open);
  }, []);

  // Position relative to bell (default left of bell, same height)
  useEffect(() => {
    if (!accountId || userPos) return;
    const place = () => {
      const bell = bellRectGetter();
      if (!bell) return;
      const width = 44;
      const maxX = Math.max(4, window.innerWidth - width);
      const maxY = Math.max(4, window.innerHeight - width);
      const x = Math.max(4, Math.min(maxX, bell.left - width - 22));
      const y = Math.max(4, Math.min(maxY, bell.top + (bell.height - width) / 2));
      setFloatPos({ x: x / Math.max(window.innerWidth - width, 1), y: y / Math.max(window.innerHeight - width, 1) });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [accountId, bellRectGetter, userPos]);

  useLayoutEffect(() => {
    if (!menuAt || !menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const margin = 8;
    const x = Math.max(margin, Math.min(menuAt.x, window.innerWidth - rect.width - margin));
    const y = Math.max(margin, Math.min(menuAt.y, window.innerHeight - rect.height - margin));
    if (x !== menuAt.x || y !== menuAt.y) setMenuAt({ x, y });
  }, [menuAt]);

  useEffect(() => {
    if (!accountId) return;
    const unbindListeners = bindAvoidanceListeners();
    const unregisterBell = registerZone({ id: 'mail-bell-passive', priority: 100, kind: 'float', getRect: bellRectGetter, fallbacks: [] });
    const unregisterButton = registerZone({
      id: 'mail-compose-float',
      priority: 40,
      kind: 'float',
      getRect: composeRectGetter,
      fallbacks: [{ x: 1, y: 0.88 }, { x: 1, y: 0.78 }, { x: 1, y: 0.68 }, { x: 0.5, y: 1 }],
      applyFallback: point => setAvoidOffset(point ? { x: point.x * (window.innerWidth - 44), y: point.y * (window.innerHeight - 44) } : null),
    });
    queueRecompute();
    return () => { unbindListeners(); unregisterBell(); unregisterButton(); };
  }, [accountId, bellRectGetter, composeRectGetter]);

  if (!p.sessionReady || !accountId) return null;

  return (
    <>
      {createPortal(
        <>
          <button
            type="button"
            ref={composeRef}
            className={`mail-compose-float${dragging ? ' dragging' : ''}${userPos ? ' has-user-position' : ''}`}
            disabled={!accountId}
            aria-label={t('Написати новий лист. Затисніть і перетягніть, щоб перемістити', 'Nieuw bericht schrijven. Houd ingedrukt en sleep om te verplaatsen')}
            style={
              avoidOffset
                ? { left: Math.round(avoidOffset.x) + 'px', top: Math.round(avoidOffset.y) + 'px' }
                : userPos
                  ? { left: userPos.x + 'px', top: userPos.y + 'px' }
                  : { left: Math.round(floatPos.x * (window.innerWidth - 44)) + 'px', top: Math.round(floatPos.y * (window.innerHeight - 44)) + 'px' }
            }
            onPointerDown={startDrag}
            onPointerMove={onDragMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onContextMenu={openMenu}
            onClick={() => {
              if (justDraggedRef.current) { justDraggedRef.current = false; return; }
              setComposeOpen(true);
            }}
          >
            <MailPlus />
          </button>
          {menuAt && (
            <>
              <div className="mail-compose-menu-backdrop" onClick={() => setMenuAt(null)} />
              <div ref={menuRef} className="mail-compose-context-menu" style={{ left: menuAt.x + 'px', top: menuAt.y + 'px' }}>
                <button type="button" onClick={resetPosition}>{t('Скинути до типового положення', 'Terugzetten naar standaardpositie')}</button>
              </div>
            </>
          )}
        </>,
        document.body
      )}
      {createPortal(
        <MailNewMessageDialog
          lang={p.lang}
          open={composeOpen}
          accountId={accountId}
          context={context}
          onClose={() => setComposeOpen(false)}
          onOpen={() => setComposeOpen(true)}
          onSent={() => {}}
        />,
        (typeof document !== 'undefined' && document.querySelector<HTMLElement>('.canonical-chrome')) || document.body
      )}
    </>
  );
}
