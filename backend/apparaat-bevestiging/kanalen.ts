// APPARAAT-001 — welke «kanalen zonder sleutel op dit apparaat» het venster «Підтвердіть доступ» mag tonen: Telegram en/of een
// ander apparaat. Eén antwoord voor POST /api/owner/access/stap-op/methoden (backend/toegangslaag.ts), afgeleid van dezelfde
// bevestigingstabel die later de poort gebruikt: een kanaal staat alleen aan als het echt werkt ÉN in een alternatief van de eis
// voor «stap-op» voorkomt. Zo belooft het venster nooit iets dat de poort daarna weigert.
import type { StapOpAuth } from '../stap-op';
import { beschikbaarVoor, eisVoor } from '../telegram-aanmelden/beleid-poort';
import { vlagVoor as telegramVlag } from '../telegram-aanmelden/opslag';
import { vlagVoor as apparaatVlag } from './opslag';
import { beschikbaarheid } from './kern';
import { eisTekst, type Eis } from '../../shared/telegram-aanmelden/beleid';

export type Kanalen = { telegram: boolean; apparaat: boolean; apparaten: number; reden: string; eis: Eis; eisTekst: { uk: string; nl: string } };

export async function stapOpKanalen(auth: StapOpAuth & { user: { id: string; role?: string } }): Promise<Kanalen> {
  const leeg: Kanalen = { telegram: false, apparaat: false, apparaten: 0, reden: '', eis: [], eisTekst: { uk: '', nl: '' } };
  try {
    const [tgVlag, apVlag] = await Promise.all([telegramVlag(auth.user.id), apparaatVlag(auth.user.id)]);
    if (!tgVlag && !apVlag) return leeg;
    const e = await eisVoor(auth.user.id, 'stap-op');
    if (!e) return leeg;
    const beschikbaar = await beschikbaarVoor(auth.user.id, auth.user.role);
    const inEis = (m: string) => e.eis.some((alt) => alt.includes(m as never));
    const b = apVlag ? await beschikbaarheid(auth.user.id, auth.user.role, String(auth.session?.id || '')) : null;
    return {
      telegram: tgVlag && beschikbaar.has('telegram') && inEis('telegram'),
      apparaat: !!b?.ok && inEis('apparaat'),
      apparaten: b?.apparaten ?? 0,
      reden: b && !b.ok ? b.reden : '',
      eis: e.eis,
      eisTekst: { uk: eisTekst(e.eis, 'uk'), nl: eisTekst(e.eis, 'nl') },
    };
  } catch { return leeg; }
}
