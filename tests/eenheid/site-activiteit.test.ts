// Auditlogboek -> meldingen: juiste sectie/dienst per actie, ruis eruit, mislukkingen herkenbaar.
import { reasonOfAudit, siteEventsFromAudit, sourceOfAudit } from '../../backend/site-activiteit';
import { styleOf } from '../../src/melding-stijl';
import { checker } from './hulp/nep-google';
import { foutCodeUit, foutUitleg, meldingMetOorzaak, siteToolOorzaak, siteToolStatus, siteToolTitel } from '../../shared/mcp-acties';

export async function main(): Promise<number> {
  const { check, einde } = checker('site-activiteit');
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
  // Kern van de melding: welk hulpmiddel, welk doel, en WAAROM het mislukte (niet alleen «помилка»).
  check('foutCodeUit: SPIEGEL_FOUT, SITE_CAP, JSON-vormen; vrije tekst nooit',
    foutCodeUit('SPIEGEL_FOUT') === 'SPIEGEL_FOUT' && foutCodeUit('SITE_CAP: AI_UIT. This private connection …') === 'AI_UIT' && foutCodeUit('{"ok":false,"error":"SPIEGEL_FOUT"}') === 'SPIEGEL_FOUT'
    && foutCodeUit('{"error":{"code":"PATH_NIET_GEVONDEN"}}') === 'PATH_NIET_GEVONDEN' && foutCodeUit('Mijn Ruimte reported: SPIEGEL_FOUT') === 'SPIEGEL_FOUT' && foutCodeUit('The release file could not be read (PATH_INVALID). This is a refusal, not a crash.') === 'PATH_INVALID'
    && foutCodeUit('The connector refused this release file because it looks like a secret (environment file)') === 'PATH_SECRET' && foutCodeUit('The user rejected this action.') === 'DOOR_EIGENAAR_GEWEIGERD'
    && foutCodeUit('Помилка: wachtwoord=hunter2') === undefined && foutCodeUit('HTTP 404 not found') === undefined && foutCodeUit('file not found') === undefined && foutCodeUit('') === undefined && foutCodeUit(42) === undefined);
  const mislukt = siteEventsFromAudit([
    { id: '9', action: 'owner.mcp.tool', result: 'failure', createdAt: 5000, details: { tool: 'read_release_file', client: 'Claude', doel: 'src/AdminUitrolModern.tsx', fout: 'SPIEGEL_FOUT', ruimte: 'technisch' } },
    { id: '10', action: 'owner.mcp.tool', result: 'denied', createdAt: 6000, details: { tool: 'machine_exec', client: 'Claude', reden: 'ruimte' } },
    { id: '11', action: 'owner.mcp.tool', result: 'failure', createdAt: 7000, details: { tool: 'x', fout: 'geheim wachtwoord=1' } },
  ]);
  check('AI-actie: hulpmiddel, doel, client en foutcode komen in de gebeurtenis; ongeldige code niet; geweigerd apart',
    mislukt[0].tool === 'read_release_file' && mislukt[0].doel === 'src/AdminUitrolModern.tsx' && mislukt[0].code === 'SPIEGEL_FOUT' && mislukt[0].client === 'Claude' && !mislukt[0].geweigerd
    && mislukt[1].geweigerd === true && mislukt[1].reden === 'ruimte' && mislukt[2].code === undefined);
  // Oorzaak: alleen een code uit het journaal, nooit vrije tekst (ook niet als reden van een AI-actie).
  const oorzaak = siteEventsFromAudit([
    { id: '20', action: 'owner.github.issue_create', result: 'failure', createdAt: 8000, details: { code: 'GITHUB_RATE_LIMITED' } },
    { id: '21', action: 'owner.github.issue_create', result: 'failure', createdAt: 9000, details: { error: 'token gelekt in een zin' } },
    { id: '22', action: 'owner.mcp.tool', result: 'denied', createdAt: 9500, details: { tool: 'x', reden: 'vrije tekst met spaties' } },
  ]);
  check('oorzaak: een foutcode uit het journaal wordt de code van de melding; vrije tekst nooit (ook niet als reden van een AI-actie)',
    reasonOfAudit({ code: 'GITHUB_RATE_LIMITED' }) === 'GITHUB_RATE_LIMITED' && reasonOfAudit({ error: 'een zin met spaties' }) === '' && reasonOfAudit(undefined) === ''
    && oorzaak[0].code === 'GITHUB_RATE_LIMITED' && oorzaak[0].status === 'failed' && oorzaak[1].code === undefined && oorzaak[2].reden === undefined && oorzaak[2].geweigerd === true);
  const uk = siteToolTitel(mislukt[0], 'uk');
  check('titel noemt de actie en het doel, niet het algemene «mcp tool»', !/mcp tool/i.test(uk) && uk.includes('src/AdminUitrolModern.tsx') && uk.startsWith('Claude: '));
  check('oorzaak: SPIEGEL_FOUT wordt «файл не знайдено …»; geweigerd door ruimte krijgt eigen uitleg en status «відхилено»',
    /не знайдено/.test(siteToolOorzaak(mislukt[0], 'uk')) && /bestand niet gevonden/.test(siteToolOorzaak(mislukt[0], 'nl'))
    && /простор/.test(siteToolOorzaak(mislukt[1], 'uk')) && siteToolStatus(mislukt[1], 'uk') === 'відхилено' && siteToolStatus(mislukt[0], 'uk') === 'не вдалося');
  check('zonder bekende reden zegt de melding eerlijk dat de server geen reden gaf, en een onbekende code blijft zichtbaar',
    /не повідомив/.test(siteToolOorzaak(mislukt[2], 'uk')) && foutUitleg('IETS_NIEUWS', 'uk') === 'код IETS_NIEUWS');
  check('meldingMetOorzaak: succes zonder oorzaak, mislukking met oorzaak',
    meldingMetOorzaak({ tool: 'read_release_file', doel: 'a.ts', uitkomst: 'succeeded' }, 'uk').oorzaak === undefined && /не знайдено/.test(meldingMetOorzaak({ tool: 'read_release_file', doel: 'a.ts', uitkomst: 'failed', code: 'SPIEGEL_FOUT' }, 'uk').oorzaak ?? ''));
  return einde();
}
