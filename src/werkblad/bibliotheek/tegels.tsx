// Gedeelde stukjes voor ShortcutTegel / MapTegel: accentkleur (met de tekst daarop, tegel-kleur.ts) en badge uit de bestaande menutellers.
import { useMenuTellers } from '../../menu-meldingen-opslag';

export { accentStijl } from './tegel-kleur';

/** Badge uit de bestaande menu-tellerfeed (alleen e-mail heeft er nu een). Weggeklikt aantal telt mee, zoals in het menu. */
export function useRegisterBadge(itemId: string | undefined): number {
  const s = useMenuTellers();
  if (!itemId || !/^(svc:mail|pg:mail\/inbox|pg:mail\/unread)$/.test(itemId)) return 0;
  const n = s.tellers.mail?.ongelezen ?? 0;
  return n > (s.weg.mail ?? 0) ? n : 0;
}
