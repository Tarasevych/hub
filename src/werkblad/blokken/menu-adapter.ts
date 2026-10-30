// Werkblad «Blokken» — adapter naar het hubmenu (stroom D). src/menu-slepen.ts wordt NIET gewijzigd.
// - Het menu houdt zijn eigen sleepregelaar (installeerSlepen) voor slepen binnen het menu.
// - Deze adapter laat de werkblad-sleepregelaar de menulijsten ([data-menu-lijst]) herkennen als plek 'menu:<lijst>',
//   met dezelfde invoegregel (vóór het eerste item waarvan het midden voorbij de aanwijzer ligt; data-menu-richting h|v).
// - Neerzetten in het menu = alleen een register-item als klein menu-item, via de bestaande menuvoorkeuren (callback).
import { installeerSlepen, type SleepDoel, type SleepOpties } from '../../menu-slepen';
import { maakPlek } from '../../../shared/werkblad-plekken';
import type { Plek } from '../../../shared/werkblad-blokken';
import type { ExternePlek } from './slepen';

export const MENU_PLEK_VOORVOEGSEL = 'menu:';
export const menuPlekId = (lijst: string) => `${MENU_PLEK_VOORVOEGSEL}${lijst}`;
export const menuLijstVan = (plekId: string) => (plekId.startsWith(MENU_PLEK_VOORVOEGSEL) ? plekId.slice(MENU_PLEK_VOORVOEGSEL.length) : null);

/** Menulijst → Plek (menu aanvaardt alleen losse onderdelen, alleen kleine maat). */
export const menuPlek = (lijst: string): Plek => maakPlek('menu', lijst);

export interface MenuAdapterOpties {
  menuWortel: HTMLElement;
  /** Zelfde regel als het menu: mag dit register-item in deze lijst? */
  magNaar?: (itemId: string, lijst: string) => boolean;
}

/** Externe plek voor installeerSleepregelaar({ extraPlekken: [menuAlsPlek(...)] }). */
export function menuAlsPlek(o: MenuAdapterOpties): ExternePlek {
  return {
    vind(el) {
      const l = el?.closest<HTMLElement>('[data-menu-lijst]') || null;
      if (!l || !o.menuWortel.contains(l)) return null;
      return { el: l, plekId: menuPlekId(l.dataset.menuLijst || '') };
    },
    voor(lijstEl, x, y) {
      const richting = (lijstEl.dataset.menuRichting || 'v') === 'h' ? 'h' : 'v';
      const kinderen = Array.from(lijstEl.children).filter((c): c is HTMLElement => c instanceof HTMLElement && c.hasAttribute('data-menu-sleutel'));
      const kop = (c: Element) => (c.querySelector(':scope > .canonical-service-main-row') || c).getBoundingClientRect();
      let voorEl: HTMLElement | null = null;
      for (const c of kinderen) {
        const r = kop(c);
        if (richting === 'h' ? (y < r.top || (y <= r.bottom && x < r.left + r.width / 2)) : y < r.top + r.height / 2) { voorEl = c; break; }
      }
      const ref = voorEl || kinderen[kinderen.length - 1];
      let lijn: DOMRect | null = null;
      if (ref) {
        const r = kop(ref);
        lijn = richting === 'h' ? new DOMRect(voorEl ? r.left - 3 : r.right + 1, r.top, 3, r.height) : new DOMRect(r.left, voorEl ? r.top - 3 : r.bottom + 1, r.width, 3);
      } else { const r = lijstEl.getBoundingClientRect(); lijn = new DOMRect(r.left, r.top, r.width, 3); }
      return { voor: voorEl?.dataset.menuSleutel || null, lijn, richting };
    },
  };
}

/** Menulijsten in het DOM als kiesbare plekken voor «Перемістити в…» (titel uit aria-label / data-menu-titel). */
export function menuPlekkenUitDom(menuWortel: HTMLElement): Array<{ plek: Plek; titel: string; kinderen: Array<{ id: string; titel: string }> }> {
  return Array.from(menuWortel.querySelectorAll<HTMLElement>('[data-menu-lijst]')).map((l) => ({
    plek: menuPlek(l.dataset.menuLijst || ''),
    titel: l.dataset.menuTitel || l.getAttribute('aria-label') || 'Меню',
    kinderen: Array.from(l.children).filter((c): c is HTMLElement => c instanceof HTMLElement && c.hasAttribute('data-menu-sleutel'))
      .map((c) => ({ id: c.dataset.menuSleutel || '', titel: (c.textContent || '').trim().slice(0, 60) })),
  }));
}

/** Omzetten van een geslaagde menu-neerzetting naar de doelvorm van menu-slepen (sleutel, doel, kopie). */
export function naarMenuDoel(plekId: string, voor: string | null): SleepDoel | null {
  const lijst = menuLijstVan(plekId);
  return lijst === null ? null : { lijst, voor };
}

/** Het bestaande menuslepen ongewijzigd installeren (hergebruik); werkblad-slepen loopt er los naast. */
export function installeerMenuSlepen(o: SleepOpties): () => void { return installeerSlepen(o); }
