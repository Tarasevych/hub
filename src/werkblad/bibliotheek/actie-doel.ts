// Диспетчер безпечних швидких переходів ?actie=<actionId> із робочого столу Werkblad v3 (CONSOL-001 / M4).
//
// Правило безпеки («Плющ», §10.4): параметр ?actie= ніколи не виконує запису, надсилання чи видалення автоматично.
// Приймаються виключно відомі ідентифікатори з білого списку OPDRACHTEN; кожен із них лише відкриває відповідну
// порожню форму вводу або фокусує цільове поле на сторінці й одразу прибирає ?actie= з адресного рядка.
import { markeerEnFocus } from '../../platform/focus-doel';

export const ACTIE_PARAM = 'actie';

export const TOEGESTANE_ACTIES = [
  'notitie-maken',
  'taak-maken',
  'afspraak-toevoegen',
  'bericht-schrijven',
  'bestand-uploaden',
  'bord-openen',
  'zoeken',
] as const;

export type WerkbladActieId = (typeof TOEGESTANE_ACTIES)[number];

const ACTIE_SET: ReadonlySet<string> = new Set<string>(TOEGESTANE_ACTIES);

/** Чисте зчитування дозволеного параметра ?actie= з рядка запиту; невідоме значення відхиляється (''). */
export function actieUitUrl(search: string): WerkbladActieId | '' {
  const u = new URL(`https://hub.tarasevych.com/${search.startsWith('?') ? search : `?${search}`}`);
  const ruw = u.searchParams.get('actie') || '';
  return ACTIE_SET.has(ruw) ? (ruw as WerkbladActieId) : '';
}

function voerVeiligeActieUit(actie: WerkbladActieId): boolean {
  if (typeof document === 'undefined') return false;
  switch (actie) {
    case 'bericht-schrijven': {
      const openKnop = document.querySelector<HTMLButtonElement>('[data-mail-compose-open]:not(:disabled), .mail-new-message:not(:disabled)');
      if (openKnop) {
        openKnop.click();
        return true;
      }
      if (document.querySelector('.canonical-chrome[data-active-service="mail"]')) {
        window.dispatchEvent(new CustomEvent('mail:open-compose'));
        return true;
      }
      return false;
    }
    case 'afspraak-toevoegen': {
      const nieuwKnop = document.querySelector<HTMLButtonElement>('button[data-agenda-nieuw="1"]:not(:disabled)');
      if (nieuwKnop) {
        nieuwKnop.click();
        return true;
      }
      const agendaSectie = document.querySelector<HTMLElement>('[data-agenda-winkel], .agenda');
      if (agendaSectie) {
        markeerEnFocus(agendaSectie);
        return true;
      }
      return false;
    }
    case 'notitie-maken': {
      const veld = document.querySelector<HTMLElement>(
        '[data-hub-notes-new], [data-notitie-nieuw], .hub-notes input[type="text"], .hub-notes textarea, [data-hulp*="notitie"]',
      );
      if (veld) {
        if (veld instanceof HTMLButtonElement && !veld.disabled) veld.click();
        else markeerEnFocus(veld);
        return true;
      }
      return false;
    }
    case 'taak-maken': {
      const taakEl = document.querySelector<HTMLElement>(
        '[data-tasks-new], [data-taak-nieuw], .tasks-view input[type="text"], main input[type="text"]:not([type="search"])',
      );
      if (taakEl) {
        if (taakEl instanceof HTMLButtonElement && !taakEl.disabled) taakEl.click();
        else markeerEnFocus(taakEl);
        return true;
      }
      return false;
    }
    case 'bestand-uploaden': {
      const uploadEl = document.querySelector<HTMLElement>(
        '[data-cvn-vastleggen], [data-cloud-capture], .cvn-vastleggen button, main input[type="file"]',
      );
      if (uploadEl) {
        markeerEnFocus(uploadEl);
        return true;
      }
      return false;
    }
    case 'bord-openen': {
      const bordEl = document.querySelector<HTMLElement>('[data-mcp-tab="board"], .mcp-board, main h1, main h2');
      if (bordEl) {
        markeerEnFocus(bordEl);
        return true;
      }
      return false;
    }
    case 'zoeken': {
      const zoekVeld = document.querySelector<HTMLElement>(
        '.zk-pagina input[type="search"], .zk-veld input, main input[type="search"], input[type="search"]',
      );
      if (zoekVeld) {
        markeerEnFocus(zoekVeld);
        return true;
      }
      return false;
    }
  }
}

/** Зчитує ?actie= з поточного URL, очищає параметр із історії оглядача та безпечно фокусує/відкриває цільову форму. */
export function werkbladActieStarten(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  let url: URL;
  try {
    url = new URL(location.href);
  } catch {
    return;
  }
  const ruw = url.searchParams.get('actie') || '';
  if (!ACTIE_SET.has(ruw)) return;
  const actie = ruw as WerkbladActieId;
  url.searchParams.delete(ACTIE_PARAM);
  try {
    history.replaceState(history.state, '', `${url.pathname}${url.search}${url.hash}`);
  } catch {
    /* безпечне ігнорування у тестовому оточенні без history */
  }
  if (voerVeiligeActieUit(actie)) return;
  const mo = new MutationObserver(() => {
    if (voerVeiligeActieUit(actie)) {
      mo.disconnect();
      window.clearTimeout(klok);
    }
  });
  mo.observe(document.body, { childList: true, subtree: true });
  const klok = window.setTimeout(() => mo.disconnect(), 8000);
}
