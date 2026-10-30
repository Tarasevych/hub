// «In welke ruimte zit ik nu, en waarom is dit leeg?» — één leesroute voor de post- en contactenschermen.
//
// Waarom een eigen route en niet een veld in elk antwoord: wordt post of contacten geweigerd (dienst uit, bevroren, nog
// niets gekozen), dan is er geen antwoord om een veld in te hangen. Deze route staat daarom BUITEN de poort
// (VRIJ_VAN_POORT in backend/mail-ruimte.ts) — precies zoals /api/owner/ruimte/overzicht in de kern — en geeft zelf NOOIT
// post of contacten terug: alleen de stand en de tweetalige uitleg. Zo kan het scherm zeggen wat er aan de hand is, in
// plaats van een lege lijst te tonen die er normaal uitziet.
import { error, json } from '../server/platform';
import type { RouterMiddleware } from '../server/platform/router';
import { DIENST_NAAM, STAND_NAAM, STAND_UITLEG, WEIGERING_UITLEG } from '../shared/ruimte-scheiding';
import { standVan } from './ruimte-scheiding';
import { ladeOmvang, ladeVoorVerzoek, technischeMailboxen } from './mail-ruimte';

type SessionOk = { user: { id: string; status?: string } };
type RequireSession = (event: Record<string, unknown>, body: unknown) => Promise<SessionOk | { errorCode: string }>;

export function mailRuimteRoutes(requireSession: RequireSession): Record<string, RouterMiddleware[]> {
  return {
    'POST /api/owner/mail/ruimte': [(async (raw) => {
      const ctx = raw as unknown as { event: Record<string, unknown>; body: unknown };
      const auth = await requireSession(ctx.event, ctx.body);
      if ('errorCode' in auth) return error(auth.errorCode, 401);
      if (auth.user.status !== 'approved') return error('ACCOUNT_NOT_APPROVED', 403);
      const id = String(auth.user.id || '');
      // Dezelfde poort, dezelfde herkomst: zo zegt dit scherm exact wat de echte routes zouden doen — niet iets anders.
      const [post, contacten] = await Promise.all([ladeVoorVerzoek(id, 'mail', ctx.body), ladeVoorVerzoek(id, 'contacten', ctx.body)]);
      const beeld = async (b: Awaited<ReturnType<typeof ladeVoorVerzoek>>, dienst: 'mail' | 'contacten') => (b.ok
        ? { ok: true as const, dienst, naam: DIENST_NAAM[dienst], ruimte: b.lade.ruimte, gedeeld: b.gedeeld, stand: b.stand,
            standNaam: STAND_NAAM[b.stand], uitleg: STAND_UITLEG[b.stand] }
        : { ok: false as const, dienst, naam: DIENST_NAAM[dienst], ruimte: 'technisch' as const, gedeeld: false,
            stand: await standVan(id, dienst), code: b.code, uitleg: b.uitleg ?? WEIGERING_UITLEG[b.code] });
      const mail = await beeld(post, 'mail'), con = await beeld(contacten, 'contacten');
      // De omvang van een BEVROREN lade helpt de servereigenaar beslissen (teruggeven / overnemen / verwijderen); staat zij
      // niet bevroren, dan hoort dat getal hier niet en wordt het ook niet opgevraagd.
      const bevroren = mail.stand === 'bevroren' || con.stand === 'bevroren';
      return json({
        ok: true, mail, contacten: con,
        technischeMailboxen: [...(await technischeMailboxen(id))],
        ...(bevroren ? { omvang: { mail: await ladeOmvang(id, 'mail'), contacten: await ladeOmvang(id, 'contacten') } } : {}),
      });
    }) as RouterMiddleware],
  };
}
