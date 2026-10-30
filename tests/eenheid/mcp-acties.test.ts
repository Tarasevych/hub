// Acties van een AI in gewone taal en als werksessies (shared/mcp-acties.ts): soorten, veilige doelen zonder geheimen of
// zoektermen, meervoud uk/nl, groeperen per AI-verbinding met een pauze van 10 minuten, herhalingen samengevoegd.
import { actieDoel, actieSoort, actieZin, groepeerWerk, telling, veiligeUrl, verberg } from '../../shared/mcp-acties';
import { checker } from './hulp/nep-google';

export async function main(): Promise<number> {
  const { check, einde } = checker('mcp-acties');
  check('soorten: interne en DevTools-namen, site- en uitrolhulpmiddelen', actieSoort('browser_click') === 'invoer' && actieSoort('click') === 'invoer' && actieSoort('machine_read_file') === 'lezen'
    && actieSoort('mcp_services_health') === 'server' && actieSoort('uitrol_voorstel_klaar') === 'uitrol' && actieSoort('mcp__mijn-ruimte__machine_exec') === 'commando' && actieSoort('iets_nieuws') === 'onbekend');
  check('doel: pad van een bestand, url alleen host+pad (geen query met codes)', actieDoel('machine_read_file', { path: 'T:\\notes\\a.md' }) === 'T:\\notes\\a.md'
    && actieDoel('navigate_page', { url: 'https://mail.tarasevych.com/inbox?code=GEHEIM#x' }) === 'mail.tarasevych.com/inbox' && veiligeUrl('javascript:alert(1)') === undefined);
  check('doel: commando zonder tokens of wachtwoorden', actieDoel('machine_exec', { command: 'git', args: ['push', 'https://x', '--password', 'hunter2', 'ghp_abcdefghijklmnopqrstuvwxyz0123456789AB'] }) === 'git push https://x --password=… …');
  check('doel: zoektermen, ingevulde velden en briefinhoud nooit', actieDoel('mail_search_messages', { query: 'medisch dossier' }) === undefined && actieDoel('fill', { value: 'mijn wachtwoord' }) === undefined && actieDoel('github_search', { q: 'x' }) === undefined);
  check('doel: repo alleen als eigenaar/naam', actieDoel('github_list_commits', { repo: 'Tarasevych/hub' }) === 'Tarasevych/hub' && actieDoel('github_list_commits', { repo: '../../etc' }) === undefined);
  check('verberg: Bearer, sleutel=waarde, JWT', verberg('Authorization: Bearer abcdefghijkl123') === 'Authorization=…' && verberg('api_key=123 x') === 'api_key=… x' && !verberg('t eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijk').includes('eyJ'));
  check('zin uk/nl, met doel; onbekend hulpmiddel eerlijk bij naam (nooit «mcp tool»)', actieZin('machine_read_file', 'T:\\a.md', 'uk') === 'Прочитав файл: T:\\a.md' && actieZin('browser_click', undefined, 'nl') === 'Klikte op een element'
    && actieZin('rm_rf', undefined, 'uk') === 'Викликав інструмент «rm_rf»' && !/mcp tool/i.test(actieZin('x', undefined, 'nl')));
  check('meervoud uk 1/2–4/5+/11–14 en nl', telling(1, 'lezen', 'uk') === '1 читання файлу чи теки' && telling(3, 'commando', 'uk') === '3 команди' && telling(5, 'commando', 'uk') === '5 команд'
    && telling(12, 'commando', 'uk') === '12 команд' && telling(22, 'commando', 'uk') === '22 команди' && telling(2, 'commando', 'nl') === "2 commando's" && telling(1, 'commando', 'nl') === '1 commando');
  const m = 60_000, t0 = 1_800_000_000_000;
  const actie = (id: string, at: number, tool: string, grantId = 'g1', client = 'Claude', doel?: string, resultaat = 'success') => ({ id, at, actie: 'owner.mcp.tool', resultaat, details: { tool, grantId, client, soort: actieSoort(tool), ...(doel ? { doel } : {}) } });
  const items = [
    actie('1', t0, 'machine_list'), actie('2', t0 + 1 * m, 'machine_read_file', 'g1', 'Claude', 'a.md'), actie('3', t0 + 2 * m, 'machine_read_file', 'g1', 'Claude', 'a.md'),
    actie('4', t0 + 3 * m, 'machine_read_file', 'g1', 'Claude', 'b.md', 'failure'), actie('5', t0 + 4 * m, 'click', 'g2', 'Grok'), actie('6', t0 + 5 * m, 'machine_exec', 'g1', 'Claude', 'git status'),
    { id: '7', at: t0 + 6 * m, actie: 'owner.agent.paired', resultaat: 'success', details: {} },
    actie('8', t0 + 40 * m, 'machine_list'),
  ];
  const r = groepeerWerk(items);
  const sessies = r.filter((x) => x.soort === 'sessie') as any[];
  check('groeperen: per verbinding; Grok ertussen breekt de sessie van Claude niet; pauze > 10 min = nieuwe sessie', sessies.length === 3 && sessies[0].items.length === 1 && sessies.find((x) => x.sleutel === 'g2').items.length === 1
    && sessies.find((x) => x.sleutel === 'g1' && x.items.length === 5) !== undefined, JSON.stringify(sessies.map((x) => [x.sleutel, x.items.length])));
  const claude = sessies.find((x) => x.sleutel === 'g1' && x.items.length === 5);
  check('sessie: van/tot, tellingen (grootste eerst), herhaling samengevoegd ×2, mislukt geteld', claude.van === t0 && claude.tot === t0 + 5 * m && claude.tellingen[0].soort === 'lezen' && claude.tellingen[0].aantal === 3
    && claude.stappen.length === 4 && claude.stappen[1].keer === 2 && claude.mislukt === 1, JSON.stringify(claude.stappen.map((x: any) => [x.item.id, x.keer])));
  check('volgorde: nieuwste eerst; losse gebeurtenis blijft los op haar plek', r[0].soort === 'sessie' && (r[0] as any).items[0].id === '8' && r[1].soort === 'los' && (r[1] as any).item.id === '7');
  check('zonder grantId: groeperen op client-naam', groepeerWerk([{ id: 'a', at: 2, actie: 'owner.mcp.tool', details: { client: 'X', tool: 'click' } }, { id: 'b', at: 1, actie: 'owner.mcp.tool', details: { client: 'X', tool: 'click' } }]).length === 1);
  return einde();
}
