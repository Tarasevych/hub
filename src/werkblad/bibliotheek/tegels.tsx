// Gedeelde stukjes voor ShortcutTegel / MapTegel: accentkleur en badge uit de bestaande menutellers.
import { ACCENT_KLEUREN, type Accent } from '../../../shared/menu-model';
import { useMenuTellers } from '../../menu-meldingen-opslag';

export const accentStijl = (accent: Accent | undefined, donker: boolean): React.CSSProperties | undefined =>
  accent ? ({ ['--bib-accent' as string]: ACCENT_KLEUREN[accent][donker ? 'donker' : 'licht'].hoofd } as React.CSSProperties) : undefined;

/** Badge uit de bestaande menu-tellerfeed (alleen e-mail heeft er nu een). Weggeklikt aantal telt mee, zoals in het menu. */
export function useRegisterBadge(itemId: string | undefined): number {
  const s = useMenuTellers();
  if (!itemId || !/^(svc:mail|pg:mail\/inbox|pg:mail\/unread)$/.test(itemId)) return 0;
  const n = s.tellers.mail?.ongelezen ?? 0;
  return n > (s.weg.mail ?? 0) ? n : 0;
}
