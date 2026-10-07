// Auditlogboek -> meldingen: juiste sectie/dienst per actie, ruis eruit, mislukkingen herkenbaar.
import { siteEventsFromAudit, sourceOfAudit } from '../../backend/site-activity';
import { styleOf } from '../../src/notification-style';
import { checker } from './hulp/nep-google';

export async function main(): Promise<number> {
  const { check, einde } = checker('site-activity');
  check('acties krijgen de juiste sectie en dienst',
    sourceOfAudit('owner.mail.send.committed') === 'mail:google' && sourceOfAudit('owner.github.issue_create') === 'github' && sourceOfAudit('owner.mcp.grant.approved') === 'claude'
    && sourceOfAudit('owner.browser.grant.created') === 'browser' && sourceOfAudit('owner.admin.role.updated') === 'admin' && sourceOfAudit('owner.session.revoked.one') === 'identity' && sourceOfAudit('owner.agent.policy') === 'agent');
  check('ruis geeft geen melding (lezen, rotatie, menu, tabbladen, e-mail lezen)',
    ['owner.notifications.read', 'owner.session.rotated', 'owner.ui.menu.updated', 'owner.tab.account.replaced', 'owner.mail.item.updated', 'owner.mail.send.prepared', 'owner.admin.audit.viewed', 'owner.browser.grant.used', 'bestaat.niet'].every((a) => sourceOfAudit(a) === null));
  const ev = siteEventsFromAudit([
    { id: '1', action: 'owner.mail.send.committed', result: 'success', createdAt: 1000 },
    { id: '2', action: 'owner.github.issue_create', result: 'failure', createdAt: 2000 },
    { id: '3', action: 'owner.notifications.read', result: 'success', createdAt: 3000 },
  ]);
  check('gebeurtenissen: ruis weggelaten, status uit result, id-voorvoegsel audit:', ev.length === 2 && ev[0].id === 'audit:1' && ev[0].status === 'succeeded' && ev[1].status === 'failed' && ev.every((e) => e.kind === 'site'));
  check('de bronnen vertalen naar het juiste pictogram en logo in het meldingencentrum',
    styleOf('mail:google', 'uk').section === 'mail' && styleOf('mail:google', 'uk').provider === 'google' && styleOf('github', 'uk').section === 'github' && styleOf('identity', 'nl').section === 'identity' && styleOf('claude', 'uk').section === 'claude');
  return einde();
}
