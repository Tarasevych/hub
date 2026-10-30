// «Пошук усюди» (oud paneel) → dunne schil over het nieuwe palet ⌘K (src/zoek/ZoekGlobaal.tsx, gemonteerd in CanonicalChrome).
// Z4 22.10.2026: het oude paneel zocht zelf (POST /api/owner/global-search) en dubbelde /zoek; nu opent `open` het palet met de
// beginvraag en meldt het zich meteen gesloten. Zelfde props als vroeger, zodat CloudFunctionalView en GoogleMailWorkspace niets anders
// hoeven dan deze import. Zonder gemonteerd palet (geen chrome) valt het terug op de zoekpagina hub.*/zoek?q=….
import { useEffect } from 'react';
import { openZoekPalet, zoekPaginaUrl } from './zoek/ZoekGlobaal';
import './globaal-zoek.css';
type Props = { lang: 'uk' | 'nl'; sourceOrigin?: string; tabContext?: string; service?: 'mail' | 'cloud'; tab?: string; open: boolean; initialQuery?: string; onClose: () => void };
export default function GlobalSearchPanel({ lang, service, open, initialQuery = '', onClose }: Props) {
  useEffect(() => {
    if (!open) return;
    if (document.querySelector('[data-zoek-trigger]')) openZoekPalet();
    else location.assign(zoekPaginaUrl(lang, initialQuery, { cat: service === 'mail' ? 'mail' : 'files' }));
    onClose();
  }, [open]);
  return null;
}
