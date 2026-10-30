// Audit M2: versturen, inplannen, opslaan, verwijderen en annuleren vragen het recht mail.write; een kijker mag alleen lezen.
import { createMailComposeRoutes } from '../../backend/mail-opstel';
import { checker } from './hulp/nep-google';
import { _zonderPoortIsPrive } from '../../backend/mail-ruimte';

export async function main(): Promise<number> {
  // Deze test bouwt de compose-routes zelf, dus zonder de ruimtepoort die backend/index.ts ervoor hangt (migratie 0083).
  // «Geen lade» betekent hier de persoonlijke lade — wat deze test altijd bedoelde; de scheiding zelf staat in
  // tests/eenheid/ruimte-mail-20261020.test.ts.
  _zonderPoortIsPrive(true);
  const { check, einde } = checker('mail-schrijfrecht-m2');
  let user: Record<string, unknown> = {};
  const routes = createMailComposeRoutes({ requireSession: async () => ({ user, service: 'mail' }) as never, audit: async () => undefined }) as Record<string, any[]>;
  const call = async (r: string) => { const res = await routes[r][0]({ event: { headers: {} }, body: {} }); return { status: res.statusCode as number, error: JSON.parse(res.body || '{}').error }; };
  const schrijf = ['draft/save', 'draft/delete', 'send', 'schedule', 'scheduled/cancel'].map((x) => `POST /api/owner/mail/compose/${x}`);
  user = { id: 'm2-kijker', email: 'kijker@test.invalid', role: 'viewer', status: 'approved', accessLevel: 'limited' };
  const kijker = await Promise.all(schrijf.map(call));
  check('kijker: alle schrijvende mailroutes 403 RBAC_FORBIDDEN', kijker.every((r) => r.status === 403 && r.error === 'RBAC_FORBIDDEN'));
  user = { id: 'm2-lid', email: 'lid@test.invalid', role: 'member', status: 'approved', accessLevel: 'full' };
  const lid = await Promise.all(schrijf.map(call));
  check('lid: geen RBAC-weigering (de route zelf beslist verder)', lid.every((r) => r.error !== 'RBAC_FORBIDDEN'));
  return einde();
}
