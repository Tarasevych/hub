// Aanvullende connector-acties: echte intern-namen (geen «in ontwikkeling»), Nederlandse namen ≤64,
// default-deny-scopes, uitrolstatus zonder geheimen, GitHub-bestand via de bestaande client (token blijft op de server).
import { ACTIE_AL_ECHT, ACTIE_INTERN, ACTIE_MAX_NAAM, actieNamenBinnenGrens, actieNamenVoor, actiePubliekeNaam } from '../../shared/connector-acties';
import { ACTIE_ROUTES, ACTIE_SITE_TOOLS, sanitiseerUitrolStatus } from '../../backend/connector-acties';
import { TOEGESTANE_ROUTES } from '../../backend/site-dispatch';
import { SITE_TOOLS } from '../../backend/site-tools';
import { V2_OPTIES } from '../../shared/connector-v2/catalogus';
import { scopeVoorTool } from '../../shared/ai-toegang';
import { capabilityForTool } from '../../shared/ai-beleid/catalog';
import { ghReadFile, setGithubDeps } from '../../backend/github-platform';
import { checker } from './hulp/nep-google';

const byName = (n: string) => ACTIE_SITE_TOOLS.find((s) => s.tool.name === n)!;

export async function main(): Promise<number> {
  const { check, einde } = checker('connector-acties');

  check('acht nieuwe intern-namen, uniek, a-z0-9_ en ≤64',
    ACTIE_INTERN.length === 8 && new Set(ACTIE_INTERN).size === 8 && ACTIE_INTERN.every((n) => /^[a-z0-9_]{1,64}$/.test(n)));

  check('elke nieuwe intern-naam is een echte SITE_TOOL (geen in-ontwikkeling, geen no-op)',
    ACTIE_INTERN.every((n) => SITE_TOOLS.some((s) => s.tool.name === n))
    && V2_OPTIES.filter((o) => ACTIE_INTERN.includes(o.intern as typeof ACTIE_INTERN[number])).every((o) => o.status === 'actief' && o.intern === o.id));

  check('bestaande intern-namen (whoami, uitrol-status, bord-CRUD, github issues) niet gedupliceerd',
    ACTIE_AL_ECHT.every((n) => !ACTIE_INTERN.includes(n as typeof ACTIE_INTERN[number]))
    && ACTIE_AL_ECHT.filter((n) => n !== 'v2_whoami').every((n) => V2_OPTIES.some((o) => o.intern === n && o.status === 'actief')));

  check('Nederlandse namen voor copilot (langste slug) blijven ≤64 en a-z0-9_',
    ACTIE_INTERN.every((n) => actieNamenBinnenGrens(n))
    && actieNamenVoor('mail_send', 'copilot').length <= ACTIE_MAX_NAAM
    && actiePubliekeNaam('zetten_afspraak', 'copilot', 'hub', 'gebruiker', 'gcal') === 'zetten_afspraak_copilot_hub_gcal_tarasevych_com_gebruiker'
    && actieNamenVoor('mail_send', 'copilot') === 'verzenden_brief_copilot_mail_gmail_tarasevych_com_gebruiker'
    && actieNamenVoor('drive_upload', 'copilot') === 'opladen_bestand_copilot_cloud_gdrive_tarasevych_com_gebruiker');

  check('schrijven = ask (write: true); zoeken en GitHub-bestand = lezen',
    ['mail_send', 'drive_create', 'drive_upload', 'calendar_create_event', 'calendar_update_event', 'comment_board_item'].every((n) => byName(n).write === true && byName(n).tool.annotations?.readOnlyHint === false)
    && byName('github_read_file').write === false && byName('zoeken_mail_bord_schijf').write === false);

  check('elke route van de acties staat in TOEGESTANE_ROUTES',
    ACTIE_ROUTES.every((r) => TOEGESTANE_ROUTES.has(r))
    && ACTIE_SITE_TOOLS.every((s) => {
      const args: Record<string, unknown> = {};
      const schema = s.tool.inputSchema as { required?: string[]; properties: Record<string, { enum?: string[]; type?: string }> };
      for (const k of schema.required ?? []) {
        const p = schema.properties[k];
        args[k] = p.enum ? p.enum[0] : p.type === 'string' ? 'abc123' : 1;
      }
      return TOEGESTANE_ROUTES.has(s.request(args).route);
    }));

  check('mail_send: weigert geen ontvanger; request_id is een hash (geen body in de id, idempotent)',
    byName('mail_send').validate({ to: 'niet-email', subject: 'x', body: 'hoi' }) !== null
    && byName('mail_send').validate({ to: 'jan@example.nl', subject: 'Hallo daar', body: 'tekst van de brief' }) === null
    && (() => {
      const r = byName('mail_send').request({ to: 'jan@example.nl', subject: 'Hallo daar', body: 'geheim-lichaam' });
      return r.route.endsWith('/compose/send') && typeof r.body.requestId === 'string' && (r.body.requestId as string).length === 64
        && !String(r.body.requestId).includes('geheim') && r.body.plainText === 'geheim-lichaam';
    })());

  check('Drive/agenda/commentaar: ongeldige invoer vóór de site geweigerd',
    byName('drive_create').validate({ name: '../x', kind: 'document' }) !== null
    && byName('drive_upload').validate({ name: 'a.pdf', data: '??' }) !== null
    && byName('calendar_create_event').validate({ title: 'x', start: 'morgen' }) !== null
    && byName('calendar_update_event').validate({ event_id: 'evt-12345' }) !== null
    && byName('comment_board_item').validate({ item_id: 'kort', body: 'x' }) !== null
    && byName('comment_board_item').validate({ item_id: 'aaaaaaaa', body: 'ok commentaar' }) === null
    && byName('comment_board_item').request({ item_id: 'aaaaaaaa', body: 'ok' }).body.tags as string[]
    && JSON.stringify(byName('comment_board_item').request({ item_id: 'aaaaaaaa', body: 'ok' }).body.tags) === JSON.stringify(['hub', 'comment']));

  check('zoeken en github-bestand: pad zonder ..; query te kort geweigerd',
    byName('zoeken_mail_bord_schijf').validate({ query: 'a' }) !== null
    && byName('zoeken_mail_bord_schijf').validate({ query: 'factuur oktober' }) === null
    && byName('github_read_file').validate({ repo: 'o/a', path: '../secrets.env' }) !== null
    && byName('github_read_file').validate({ repo: 'Tarasevych/hub', path: 'README.md' }) === null);

  check('default-deny: elke actie valt onder een scope; signed policy is het plafond',
    scopeVoorTool('mail_send') === 'mail.send' && scopeVoorTool('drive_create') === 'files.write' && scopeVoorTool('drive_upload') === 'files.write'
    && scopeVoorTool('calendar_create_event') === 'calendar.write' && scopeVoorTool('calendar_update_event') === 'calendar.write'
    && scopeVoorTool('comment_board_item') === 'board.write' && scopeVoorTool('github_read_file') === 'github.read'
    && scopeVoorTool('zoeken_mail_bord_schijf') === 'site.read'
    && capabilityForTool('mail_send') === 'mail.modify' && capabilityForTool('drive_create') === 'drive.write'
    && capabilityForTool('calendar_create_event') === 'calendar.write' && capabilityForTool('github_read_file') === 'github.read');

  const vuil = { id: 'u1', status: 'wacht-op-goedkeuring', sha256: 'abc', voorbereiderId: 'uid', passkey: 'x', token: 't', rollback: true, versie: '1.2.3' };
  const schoon = sanitiseerUitrolStatus(vuil) as Record<string, unknown>;
  check('uitrolstatus: geen sha256, voorbereiderId, passkey, token of rollback; wel versie/status',
    schoon.versie === '1.2.3' && schoon.status === 'wacht-op-goedkeuring' && schoon.sha256 === undefined
    && schoon.voorbereiderId === undefined && schoon.passkey === undefined && schoon.token === undefined && schoon.rollback === undefined);

  try {
    const calls: Array<{ url: string; auth?: string }> = [];
    const fn = (async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), auth: (init?.headers as Record<string, string>)?.Authorization });
      const body = { name: 'README.md', path: 'README.md', sha: 'deadbeef', encoding: 'base64', content: Buffer.from('# titel\n').toString('base64'), html_url: 'https://github.com/o/a/blob/main/README.md', download_url: 'https://raw.x/README.md?token=LEK' };
      return new Response(JSON.stringify(body), { status: 200 });
    }) as unknown as typeof fetch;
    setGithubDeps({ fetch: fn, token: async () => 'ghp_supergeheim_niet_tonen_1234567890' });
    const out: any = await ghReadFile('u1', 'o/a', 'README.md');
    const dumped = JSON.stringify(out);
    check('GitHub-bestand: leest via api.github.com; token alleen in Authorization, nooit in het antwoord',
      out.ok && out.data.text.includes('# titel') && calls[0].url.startsWith('https://api.github.com/repos/o/a/contents/README.md')
      && calls[0].auth === 'Bearer ghp_supergeheim_niet_tonen_1234567890' && !dumped.includes('ghp_') && !dumped.includes('LEK'));
    setGithubDeps({ fetch: fn, token: async () => 'ghp_x' });
    const slecht: any = await ghReadFile('u1', 'o/a', '../etc/passwd');
    check('GitHub-bestand: pad met .. geweigerd zonder fetch', slecht.error === 'GITHUB_PATH_INVALID' && calls.length === 1);
  } finally { setGithubDeps(null); }

  return einde();
}
