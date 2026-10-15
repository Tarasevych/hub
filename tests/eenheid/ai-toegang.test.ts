// Gedetailleerde AI-toegang (shared/ai-toegang.ts, backend/ai-toegang.ts): één catalogus voor de tab
// «Доступ ШІ» en de backend; default-deny per scope; gevoelig (mail, foto's) nooit technisch;
// bestuur-uit wint van een oude grantrij; de tab tekent alleen ondersteunde scopes.
import { checker } from './hulp/nep-google';
import {
  AI_TOEGANG_SCOPES, STANDAARD_SCOPES, TOEGANG_GESCHEIDEN, isToegangScope,
  scopeVoorTool, zichtbareScopes,
} from '../../shared/ai-toegang';
import { beoordeel, onderwerpVanGrantId } from '../../backend/ai-toegang';

export async function main(): Promise<number> {
  const { check, einde } = checker('ai-toegang');

  check('catalogus: elke scope heeft groep, uk-lijn, tools en agents; ids uniek',
    AI_TOEGANG_SCOPES.length >= 14 && new Set(AI_TOEGANG_SCOPES.map((s) => s.id)).size === AI_TOEGANG_SCOPES.length
    && AI_TOEGANG_SCOPES.every((s) => !!s.groep && !!s.uk && !!s.omschrijvingUk && Array.isArray(s.tools) && Array.isArray(s.agents)));

  check('catalogus: mail en foto\'s zijn gevoelig; kalender-lezen niet; onbekende scope is geen scope',
    AI_TOEGANG_SCOPES.find((s) => s.id === 'mail.read')?.gevoelig === true
    && AI_TOEGANG_SCOPES.find((s) => s.id === 'mail.send')?.gevoelig === true
    && AI_TOEGANG_SCOPES.find((s) => s.id === 'photos.read')?.gevoelig === true
    && AI_TOEGANG_SCOPES.find((s) => s.id === 'calendar.read')?.gevoelig === false
    && !isToegangScope('mail.verwijder') && isToegangScope('board.write'));

  check('catalogus: standaard voor nieuwe verbindingen = niet-gevoelig (geen mail/foto\'s)',
    STANDAARD_SCOPES.includes('board.read') && STANDAARD_SCOPES.includes('devices.read')
    && !STANDAARD_SCOPES.includes('mail.read') && !STANDAARD_SCOPES.includes('mail.send') && !STANDAARD_SCOPES.includes('photos.read'));

  check('catalogus: instrument → scope (mail, agenda, schijf, bord, notities, apparaten, github, site)',
    scopeVoorTool('mail_search_messages') === 'mail.read' && scopeVoorTool('mail_read_message') === 'mail.read'
    && scopeVoorTool('draft_email_reply') === 'mail.send' && scopeVoorTool('mail_modify_message') === 'mail.send'
    && scopeVoorTool('calendar_list_events') === 'calendar.read' && scopeVoorTool('draft_calendar_event') === 'calendar.write'
    && scopeVoorTool('drive_read_file') === 'files.read'
    && scopeVoorTool('search_board') === 'board.read' && scopeVoorTool('create_task') === 'board.write'
    && scopeVoorTool('list_notes') === 'notes.read' && scopeVoorTool('upsert_note') === 'notes.write'
    && scopeVoorTool('machine_read_file') === 'devices.read' && scopeVoorTool('machine_exec') === 'devices.write'
    && scopeVoorTool('browser_snapshot') === 'devices.read' && scopeVoorTool('browser_click') === 'devices.write'
    && scopeVoorTool('github_get') === 'github.read' && scopeVoorTool('github_create_issue') === 'github.write'
    && scopeVoorTool('site_search') === 'site.read' && scopeVoorTool('list_services') === 'site.read'
    && scopeVoorTool('iets_nieuws') === undefined && scopeVoorTool('') === undefined);

  check('onderwerp: uuid = mcp-koppeling, «token:uuid» = agenttoken, rommel = null',
    onderwerpVanGrantId('123e4567-e89b-12d3-a456-426614174000')?.soort === 'mcp-koppeling'
    && onderwerpVanGrantId('token:123e4567-e89b-12d3-a456-426614174000')?.soort === 'agenttoken'
    && onderwerpVanGrantId('token:123e4567-e89b-12d3-a456-426614174000')?.id === '123e4567-e89b-12d3-a456-426614174000'
    && onderwerpVanGrantId(undefined) === null && onderwerpVanGrantId('') === null
    && onderwerpVanGrantId('../../etc') === null && onderwerpVanGrantId('token:') === null);

  // default-deny: zonder grant niets
  const denyMail = beoordeel('mail_search_messages', 'prive', [], []);
  check('default-deny: zonder verleende scope geen mail (geen-grant)',
    denyMail.ok === false && denyMail.reden === 'geen-grant' && denyMail.scope === 'mail.read');

  const denyOnbekend = beoordeel('iets_nieuws', 'prive', ['board.read'], []);
  check('default-deny: onbekend instrument wordt geweigerd (onbekend-instrument)',
    !denyOnbekend.ok && denyOnbekend.reden === 'onbekend-instrument');

  // grant → allow; intrekken (weg uit de lijst) → refuse
  const allowMail = beoordeel('mail_read_message', 'prive', ['mail.read'], []);
  check('grant → allow: verleende mail.read opent het lezen van post',
    allowMail.ok === true && allowMail.scope === 'mail.read');
  const naIntrekken = beoordeel('mail_read_message', 'prive', ['board.read'], []);
  check('revoke → refuse: na intrekken is dezelfde aanroep weer geen-grant',
    !naIntrekken.ok && naIntrekken.reden === 'geen-grant');

  // gevoelig nooit technisch, ook met grant
  const technischMail = beoordeel('mail_read_message', 'technisch', ['mail.read', 'board.read'], []);
  check('gevoelig-technisch: mail met grant toch dicht voor een technische verbinding',
    !technischMail.ok && technischMail.reden === 'gevoelig-technisch');
  const technischBord = beoordeel('search_board', 'technisch', ['board.read'], []);
  check('niet-gevoelig technisch: board.read met grant mag wel (de ruimtepoort beslist over de rest)',
    technischBord.ok === true);

  // bestuur-uit wint van een oude grantrij
  const beheerUit = beoordeel('create_task', 'prive', ['board.write'], ['board.write']);
  check('beheer-uit: uitgeschakelde scope geweigerd ondanks grantrij',
    !beheerUit.ok && beheerUit.reden === 'beheer-uit' && beheerUit.scope === 'board.write');
  const beheerAan = beoordeel('create_task', 'prive', ['board.write'], []);
  check('beheer-aan: zonder «uit» beslist alleen de grant',
    beheerAan.ok === true);

  // de tab tekent uit de catalogus: niet-ondersteund wordt niet getekend
  const claudeZichtbaar = zichtbareScopes('claude').map((s) => s.id);
  check('tab uit catalogus: claude ziet mail/board/devices en files.write (Диск), maar geen photos.read (nog geen instrument)',
    claudeZichtbaar.includes('mail.read') && claudeZichtbaar.includes('board.write') && claudeZichtbaar.includes('devices.read')
    && claudeZichtbaar.includes('files.write') && !claudeZichtbaar.includes('photos.read'));

  const tekst = TOEGANG_GESCHEIDEN('Claude', 'mail_read_message', 'mail.read');
  check('weigering: begint met TOEGANG_GESCHEIDEN, noemt instrument en scope, verwijst naar «Доступ ШІ», zegt «niet anders proberen»',
    /^TOEGANG_GESCHEIDEN: /.test(tekst) && /mail_read_message/.test(tekst) && /mail\.read/.test(tekst)
    && /Доступ ШІ/.test(tekst) && /Do not try another way/.test(tekst));

  check('grens: server/kamer-instrumenten staan niet in de catalogus (eigen poorten houden hun foutcodes)',
    scopeVoorTool('server_backup') === undefined && scopeVoorTool('server_status') === undefined
    && scopeVoorTool('uitrol_voorstel_status') === undefined && scopeVoorTool('install_release') === undefined
    && scopeVoorTool('list_tasks') === 'board.read');

  return einde();
}
