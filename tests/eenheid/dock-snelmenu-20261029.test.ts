// UI-001 dock-snelmenu (29.10.2026). Draaien: node scripts/eenheidstests.mjs dock-snelmenu-20261029
//  A. toetsen: Shift+F10, ContextMenu, pijl omlaag openen; Enter/Shift+pijl/Ctrl+pijl/Alt+pijl (Alt+pijl = verplaatsen in bewerkmodus) niet.
//  B. bron: CanoniekOmlijsting hergebruikt dockOpen/dockAnker (geen nieuw paneel), haakt alleen in bij horizontaal && !bewerken,
//     aria-haspopup alleen in het dock buiten de bewerkmodus; native contextmenu alleen op .canonical-service-button.has-submenu.
import { readFileSync } from 'node:fs';
import { checker } from './hulp/nep-google';
import { isSnelmenuToets, LANG_DRUKKEN_MS, DRUK_DREMPEL, SNELMENU_KNOP } from '../../src/dock-snelmenu';

export async function main(): Promise<number> {
  const { check, einde } = checker('dock-snelmenu (UI-001)');
  const k = (key: string, m: Partial<{ shiftKey: boolean; altKey: boolean; ctrlKey: boolean; metaKey: boolean }> = {}) => isSnelmenuToets({ key, shiftKey: false, ...m });
  check('Shift+F10 opent', k('F10', { shiftKey: true }));
  check('F10 zonder Shift niet', !k('F10'));
  check('ContextMenu-toets opent', k('ContextMenu'));
  check('pijl omlaag opent', k('ArrowDown'));
  check('Alt+pijl omlaag (verplaatsen) niet', !k('ArrowDown', { altKey: true }));
  check('Ctrl/⌘/Shift+pijl omlaag niet', !k('ArrowDown', { ctrlKey: true }) && !k('ArrowDown', { metaKey: true }) && !k('ArrowDown', { shiftKey: true }));
  check('Enter/Spatie niet (gewone klik blijft)', !k('Enter') && !k(' '));
  check('lang drukken 500 ms, drempel 8 px (sleep-drempel bewerkmodus: 450 ms/8 px, maar daar staat dit uit)', LANG_DRUKKEN_MS === 500 && DRUK_DREMPEL === 8);
  check('alleen diensten met submenu in het menu', SNELMENU_KNOP === '.canonical-sidebar .canonical-service-button.has-submenu');
  const bron = readFileSync('src/CanoniekOmlijsting.tsx', 'utf8');
  check('haak alleen in het dock en buiten de bewerkmodus', /useDockSnelmenu\(\{aan:horizontaal&&!bewerken,open:dockOpen,/.test(bron));
  check('hergebruikt setDockAnker/setDockOpen (geen nieuw paneel)', /zet:\(id,knop\)=>\{[^}]*setDockAnker\([^;]*;setDockOpen\(id\)\}/.test(bron) && (bron.match(/className=\{`dock-paneel/g) || []).length === 1);
  check('aria-haspopup alleen horizontaal, met submenu, buiten bewerkmodus', bron.includes("aria-haspopup={horizontaal&&item.hasSubmenu&&!bewerken?'true':undefined}"));
  return einde();
}
