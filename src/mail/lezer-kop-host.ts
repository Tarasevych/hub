// UPD-010: пошук центрального слота у верхній панелі переглядача листа ([data-mail-reader-opties-host]).
// У браузері переносить смугу перекладу та компактні розгортувані піктограми («Що від вас потрібно?», зовнішні зображення)
// у порожню частину верхньої панелі; при SSR повертає null, зберігаючи зворотну сумісність із сервісним рендерингом.
import { useLayoutEffect, useState, type RefObject } from 'react';

export const KOP_OPTIES_ATTR = 'data-mail-reader-opties-host';

export function useKopOptiesHost(anchorRef: RefObject<HTMLElement | null>): HTMLElement | null {
  const [host, setHost] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    const node = anchorRef.current;
    const reader = node?.closest<HTMLElement>('.google-mail-reader');
    if (!reader) {
      setHost(null);
      return;
    }
    const sync = () => {
      const found = reader.querySelector<HTMLElement>(`[${KOP_OPTIES_ATTR}]`);
      setHost((cur) => (cur === found ? cur : found));
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(reader, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [anchorRef]);

  return host;
}
