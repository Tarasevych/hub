// Weerspiegeling van de deur op de connector: lezen van de live release, bord (zoeken/status/wissen),
// kaart van diensten. Geen installatie, rollback, back-up of geheime waarden.
import { mkdir, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { mcpConsoleRoutes } from '../../backend/mcp-console';
import { BUITEN_BEREIK, callTool } from '../../backend/connectors-hulpmiddelen';
import { closePool } from '../../server/platform/pg';
import { checker } from './hulp/nep-google';

export async function main(): Promise<number> {
  const { check, einde } = checker('mcp-spiegel');
  const dir = path.join(process.cwd(), 'rapporten', `spiegel-${Date.now()}`);
  const release = path.join(dir, 'current');
  const releases = path.join(dir, 'releases', '20261014-120000');
  await mkdir(release, { recursive: true });
  await mkdir(releases, { recursive: true });
  await writeFile(path.join(release, 'UITROL-VERSIE'), '20261014-120000\n');
  await writeFile(path.join(release, 'package.json'), '{"name":"mijn-ruimte"}\n');
  await writeFile(path.join(release, '.env'), 'TOKEN=geheim\n');
  await writeFile(path.join(release, 'id_ed25519'), '-----KEY-----\n');
  // Sinds 18.10.2026 komt get_live_release uit één bron (backend/uitrol-bron.ts): «draait nu» = de map waar <app>/current naar wijst.
  // Daarom een echte app-wortel met current → releases/<map>, waar UITROL-VERSIE staat (en niet de geschiedenis in de gedeelde test-db).
  await writeFile(path.join(releases, 'UITROL-VERSIE'), '20261014-120000\n');
  const appWortel = path.join(dir, 'app'); await mkdir(appWortel, { recursive: true });
  await symlink(releases, path.join(appWortel, 'current'));
  const oud = { MCP_ROOT: process.env.MCP_ROOT, MCP_RELEASES_DIR: process.env.MCP_RELEASES_DIR, MCP_RECHTEN_PAD: process.env.MCP_RECHTEN_PAD, UITROL_APP_ROOT: process.env.UITROL_APP_ROOT, OWNER_EMAIL: process.env.OWNER_EMAIL };
  process.env.OWNER_EMAIL = 'o@x'; // eigenaar = rol owner + OWNER_EMAIL (isOwner); de test bepaalt dat zelf
  process.env.UITROL_APP_ROOT = appWortel;
  process.env.MCP_ROOT = release;
  process.env.MCP_RELEASES_DIR = path.join(dir, 'releases');
  process.env.MCP_RECHTEN_PAD = path.join(dir, 'mcp-rechten.json');
  await writeFile(process.env.MCP_RECHTEN_PAD, JSON.stringify({ read: true, opdracht: { status: false, backup: false, terugdraaien: false } }));

  const OWNER = `spiegel-owner-${randomUUID()}`;
  const USER = `spiegel-user-${randomUUID()}`;
  const users: Record<string, any> = {
    [OWNER]: { id: OWNER, role: 'owner', status: 'approved', email: 'o@x' },
    [USER]: { id: USER, role: 'user', status: 'approved', email: 'u@x' },
  };
  const routes = mcpConsoleRoutes(async (event: any) => ({ user: users[event.who], service: event.service ?? 'mcp' }));
  const call = async (route: string, who: string, body: Record<string, unknown> = {}) => {
    const res: any = await routes[route][0]({ event: { who, headers: {} }, body } as any);
    let data: any = null;
    try { data = JSON.parse(res.body); } catch { data = null; }
    return { status: res.statusCode, data };
  };

  try {
    check('buiten bereik: installeren, rollback, back-up, beleid en geheimen staan niet als connector-tool',
      ['server_backup', 'server_terugdraaien', 'deploy_release', 'policy_change', 'archive_download', 'read_secret', 'uitrol_voorstel_goedkeuren'].every((n) => BUITEN_BEREIK.has(n)));
    const verboden = await callTool(OWNER, 'deploy_rollback', {});
    check('aanroep van een verboden naam geeft OUT_OF_SCOPE en crasht niet', verboden.isError === true && /OUT_OF_SCOPE/.test(String(verboden.content[0].text)));

    const geenEigenaar = await call('POST /api/mcp/spiegel/release/live', USER);
    check('release lezen: alleen de eigenaar', geenEigenaar.status === 403);

    const live = await call('POST /api/mcp/spiegel/release/live', OWNER);
    check('get_live_release: versie uit UITROL-VERSIE', live.status === 200 && live.data.versie === '20261014-120000', JSON.stringify(live.data));
    const lijst = await call('POST /api/mcp/spiegel/release/list', OWNER);
    check('list_releases: namen van uitgaven en catalogus zonder .env',
      lijst.status === 200 && lijst.data.releases.includes('20261014-120000') && lijst.data.catalog.some((e: any) => e.name === 'package.json') && !lijst.data.catalog.some((e: any) => e.name === '.env'), JSON.stringify(lijst.data.catalog));
    const tekst = await call('POST /api/mcp/spiegel/release/file', OWNER, { path: 'package.json' });
    const geheim = await call('POST /api/mcp/spiegel/release/file', OWNER, { path: '.env' });
    const sleutel = await call('POST /api/mcp/spiegel/release/file', OWNER, { path: 'id_ed25519' });
    const buiten = await call('POST /api/mcp/spiegel/release/file', OWNER, { path: '../mcp-rechten.json' });
    check('read_release_file: tekst komt terug; geheim, sleutel en pad buiten de release zijn een weigering, geen crash',
      tekst.status === 200 && /mijn-ruimte/.test(tekst.data.text) && geheim.status === 400 && geheim.data.error === 'PATH_SECRET' && sleutel.status === 400 && sleutel.data.error === 'PATH_SECRET' && buiten.status === 400, JSON.stringify([geheim.data, sleutel.data, buiten.data]));

    const gezond = await call('POST /api/mcp/spiegel/health', OWNER);
    check('get_system_health: schakelaars en een geweigerde gepantserde lezing zonder te crashen',
      gezond.status === 200 && gezond.data.switches.read === true && gezond.data.switches['opdracht.backup'] === false && gezond.data.armored.available === false, JSON.stringify(gezond.data.armored));
    const diensten = await call('POST /api/mcp/spiegel/services', OWNER);
    const mail = await call('POST /api/mcp/spiegel/service', OWNER, { id: 'mail' });
    const hub = await call('POST /api/mcp/spiegel/hub', OWNER);
    const onbekend = await call('POST /api/mcp/spiegel/service', OWNER, { id: 'nope' });
    check('kaart: gestructureerde URL\'s, mail en hub, onbekende id geweigerd',
      diensten.status === 200 && diensten.data.services.some((s: any) => s.id === 'mail' && s.url === 'https://mail.tarasevych.com/inbox')
      && mail.data.url === 'https://mail.tarasevych.com/inbox' && hub.data.hub.url.startsWith('https://hub.tarasevych.com/') && onbekend.status === 404);

    const gemaakt = await call('POST /api/mcp/board', USER, { kind: 'task', title: 'Перевірити випуск', body: 'після passkey', tags: ['release'] });
    const id = gemaakt.data.task.id as string;
    const zoek = await call('POST /api/mcp/board/search', USER, { query: 'випуск', tag: 'release' });
    const status = await call('PATCH /api/mcp/board', USER, { kind: 'move', id, status: 'doing' });
    const slecht = await call('PATCH /api/mcp/board', USER, { kind: 'move', id, status: 'cancelled' });
    const recht = await call('PUT /api/mcp/board', USER, { kind: 'edit', id, body: 'в опрацюванні' });
    const weg = await call('PATCH /api/mcp/board', USER, { kind: 'delete', id });
    const nog = await call('POST /api/mcp/board/search', USER, { query: 'випуск' });
    check('bord: пошук знаходить запис, doing приймається, cancelled ні, правка і видалення свої',
      zoek.data.tasks.length === 1 && status.status === 200 && status.data.task.status === 'doing' && slecht.status === 400 && slecht.data.error === 'TASK_STATUS'
      && /опрацюванні/.test(recht.data.task.body) && weg.data.deleted === true && nog.data.tasks.length === 0, JSON.stringify([slecht.data, weg.data]));

    const notitie = await call('POST /api/mcp/board', USER, { kind: 'note', title: 'Хаб', body: 'окремо', tags: ['hub'] });
    const hubNotities = await call('POST /api/mcp/board/search', USER, { tag: 'hub', kind: 'note' });
    check('нотатки хаба: тег hub, окремо від завдань', hubNotities.data.notes.length === 1 && hubNotities.data.notes[0].id === notitie.data.note.id && hubNotities.data.tasks.length === 0);

    const stats = await call('POST /api/mcp/spiegel/stats', USER);
    check('лічильник: без значення токена', stats.status === 200 && Array.isArray(stats.data.tokens) && !/token_hash|ghp_|tvh_/.test(JSON.stringify(stats.data)));
  } catch (e) {
    check('onverwachte fout', false, String((e as Error)?.stack || e));
  } finally {
    for (const [k, v] of Object.entries(oud)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    await closePool().catch(() => undefined);
  }
  return einde();
}
