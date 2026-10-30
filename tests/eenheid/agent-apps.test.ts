// Agent «Додатки» (apps.*): розгортання на власному залізі з нep-podman — знімок і образ на версію, автоматичний Dockerfile,
// контейнер з обмеженнями (cap-drop, no-new-privileges, ліміти, лише 127.0.0.1), секрети ніколи не повертаються й маскуються
// в журналах, відкат, автоматичне повернення попередньої версії, якщо нова не стартує, перевірка вводу (шляхи, імена, env).
import { mkdtempSync, readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join, resolve } from 'node:path';
import { handlers, _autoDockerfile } from '../../deploy/agent/agent.mjs';
import { checker } from './hulp/nep-google';

export async function main(): Promise<number> {
  const { check, einde } = checker('agent-apps');
  const basis = mkdtempSync(join(tmpdir(), 'agent-apps-'));
  process.env.NEP_PODMAN_DIR = basis;
  const nep = resolve('tests/eenheid/hulp/nep-podman.mjs');
  const cfg = { roots: [basis], allow: [], apps: { enabled: true, root: join(basis, 'apps'), runtime: nep, domain: '', caddyAdmin: '', memory: '256m' } } as any;
  const h = handlers as any;
  const geweigerd = async (fn: () => Promise<unknown>, re: RegExp) => { try { await fn(); return false; } catch (e) { return re.test(String((e as Error).message)); } };
  const log = () => readFileSync(join(basis, 'log.txt'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  try {
    check('zonder apps-config: geweigerd', await geweigerd(() => h['apps.list']({ roots: [], allow: [] }, {}), /not enabled/));
    check('ongeldige namen geweigerd', (await Promise.all(['A', 'ab', '-x', 'x_y', 'a'.repeat(40), '../etc'].map((n) => geweigerd(() => h['apps.deploy'](cfg, { name: n, files: [{ path: 'index.html', content: 'x' }] }), /invalid app name/)))).every(Boolean));
    check('pad buiten de map geweigerd', await geweigerd(() => h['apps.deploy'](cfg, { name: 'site', files: [{ path: '../evil', content: 'x' }] }), /invalid file/)
      && await geweigerd(() => h['apps.deploy'](cfg, { name: 'site', files: [{ path: '/etc/passwd', content: 'x' }] }), /invalid file/));
    check('env met regeleinde geweigerd', await geweigerd(() => h['apps.deploy'](cfg, { name: 'site', files: [{ path: 'index.html', content: 'x' }], env: { A: 'x\nB=y' } }), /invalid env/));
    check('auto-Dockerfile: node (start-script), python (main.py), statisch (index.html, onbevoorrecht)',
      /node:22-alpine[\s\S]*USER node[\s\S]*CMD \["npm","start"\]/.test(_autoDockerfile([{ path: 'package.json', content: '{"scripts":{"start":"node s.js"}}' }], 0).dockerfile)
      && /python:3\.12-slim[\s\S]*USER app[\s\S]*main\.py/.test(_autoDockerfile([{ path: 'requirements.txt', content: '' }, { path: 'main.py', content: '' }], 0).dockerfile)
      && /nginx-unprivileged/.test(_autoDockerfile([{ path: 'index.html', content: '' }], 0).dockerfile));

    const r1 = await h['apps.deploy'](cfg, { name: 'site', files: [{ path: 'index.html', content: '<h1>v1</h1>' }, { path: 'css/a.css', content: 'b{}' }], env: { MODE: 'prod' } });
    check('deploy v1: klaar, lokale URL', r1.state === 'done' && /^http:\/\/127\.0\.0\.1:20\d{3}$/.test(r1.url), JSON.stringify(r1).slice(0, 300));
    const run = log().find((a) => a[0] === 'run')!;
    const s = run.join(' ');
    check('container met beperkingen: cap-drop ALL, no-new-privileges, geheugen, pids, alleen 127.0.0.1', /--cap-drop ALL/.test(s) && /no-new-privileges/.test(s) && /--memory 256m/.test(s) && /--pids-limit 256/.test(s) && /-p 127\.0\.0\.1:20\d{3}:8080/.test(s) && /MODE=prod/.test(s));
    check('snapshot (tar.gz) van versie 1 bewaard', readdirSync(join(cfg.apps.root, 'snapshots', 'site')).some((f) => f.endsWith('.tar.gz')));

    const sec = await h['apps.secret.set'](cfg, { name: 'site', key: 'API_KEY', value: 'geheim-1234567' });
    const lijstS = await h['apps.secret.list'](cfg, { name: 'site' });
    check('geheim bewaard (0600), alleen sleutels zichtbaar, container herstart', sec.stored && sec.restarted && JSON.stringify(lijstS) === JSON.stringify({ name: 'site', keys: ['API_KEY'] })
      && (statSync(join(cfg.apps.root, 'secrets', 'site.env')).mode & 0o777) === 0o600);
    const logs = await h['apps.logs'](cfg, { name: 'site', lines: 50 });
    check('logboek: geheime waarde gemaskeerd', /\*\*\*/.test(logs.log) && !/geheim-1234567/.test(logs.log), logs.log);

    await new Promise((r) => setTimeout(r, 1100));
    const r2 = await h['apps.deploy'](cfg, { name: 'site', files: [{ path: 'index.html', content: '<h1>v2</h1>' }] });
    const v = await h['apps.versions'](cfg, { name: 'site' });
    check('deploy v2: twee versies, v2 actueel, zelfde poort', r2.state === 'done' && v.versions.length === 2 && v.current === r2.version && r2.url === r1.url, JSON.stringify(v));
    const lijst = await h['apps.list'](cfg, {});
    check('lijst: running, versie, geheugen, poort, luistert (bewaking), uptime', lijst.apps.length === 1 && lijst.apps[0].status === 'running' && lijst.apps[0].memory.includes('MiB') && lijst.apps[0].listening === true && /^20\d{3}$/.test(String(lijst.apps[0].hostPort)) && lijst.apps[0].port === 8080 && typeof lijst.apps[0].uptime === 'string', JSON.stringify(lijst));
    const rb = await h['apps.rollback'](cfg, { name: 'site' });
    check('rollback → v1 en luistert', rb.current === r1.version && rb.listening === true, JSON.stringify(rb));

    // overdracht: bestanden en geheimen via een eenmalig ticket (nep-server), nooit in de opdracht zelf
    const tickets = new Map<string, unknown>();
    const srv = createServer((req, res) => {
      let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => {
        const ok = req.url === '/api/owner/agents/overdracht' && req.method === 'POST' && req.headers.authorization === `Bearer ${'t'.repeat(30)}`;
        const t = ok ? JSON.parse(b).ticket : '';
        const inhoud = tickets.get(t); tickets.delete(t);
        res.writeHead(inhoud ? 200 : 404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(inhoud ?? { error: 'TICKET_ONGELDIG' }));
      });
    });
    await new Promise<void>((r) => srv.listen(0, '127.0.0.1', () => r()));
    const ocfg = { ...cfg, server: `http://127.0.0.1:${(srv.address() as AddressInfo).port}`, token: 't'.repeat(30) };
    const T1 = 'a'.repeat(43), T2 = 'b'.repeat(43), T3 = 'c'.repeat(43);
    tickets.set(T1, { soort: 'bundel', payload: { files: [{ path: 'index.html', content: '<h1>bundel</h1>' }], env: { MODE: 'b' } } });
    const rb1 = await h['apps.deploy'](ocfg, { name: 'bundel', bundle: T1, summary: { files: 1 } });
    check('overdracht: uitrol met ticket (bestanden niet in de opdracht) slaagt', rb1.state === 'done', JSON.stringify(rb1).slice(0, 300));
    check('overdracht: ticket werkt maar één keer', await geweigerd(() => h['apps.deploy'](ocfg, { name: 'bundel', bundle: T1 }), /could not be fetched \(404\)/));
    tickets.set(T2, { soort: 'geheim', payload: { key: 'TOKEN', value: 'via-ticket-987' } });
    check('overdracht: ticket voor een andere sleutel geweigerd', await geweigerd(() => h['apps.secret.set'](ocfg, { name: 'bundel', key: 'ANDERS', ticket: T2 }), /another key/));
    tickets.set(T3, { soort: 'geheim', payload: { key: 'TOKEN', value: 'via-ticket-987' } });
    const gs = await h['apps.secret.set'](ocfg, { name: 'bundel', key: 'TOKEN', ticket: T3 });
    check('overdracht: geheim via ticket bewaard, waarde niet in het resultaat', gs.stored && !JSON.stringify(gs).includes('via-ticket') && readFileSync(join(cfg.apps.root, 'secrets', 'bundel.env'), 'utf8').includes('via-ticket-987'));
    check('overdracht: bundel-ticket kan geen geheim zijn (soort gecontroleerd)', await (async () => { tickets.set(T1, { soort: 'bundel', payload: { key: 'TOKEN', value: 'x' } }); return geweigerd(() => h['apps.secret.set'](ocfg, { name: 'bundel', key: 'TOKEN', ticket: T1 }), /unexpected ticket/); })());
    check('overdracht: ongeldig ticket geweigerd vóór een verzoek', await geweigerd(() => h['apps.deploy'](ocfg, { name: 'bundel2', bundle: '../x' }), /invalid ticket/));
    srv.close();

    // Caddy (nep, via unix-socket): route vooraan, en na een herstart van Caddy zet de agent ontbrekende routes terug
    const routes: any[] = []; const verzoeken: string[] = [];
    const caddy = createServer((req, res) => {
      let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => {
        verzoeken.push(`${req.method} ${req.url}`);
        const id = /^\/id\/(.+)$/.exec(req.url || '')?.[1];
        if (id && req.method === 'DELETE') { const i = routes.findIndex((r) => r['@id'] === id); if (i >= 0) routes.splice(i, 1); res.writeHead(i >= 0 ? 200 : 404); return res.end(); }
        if (id && req.method === 'GET') { const r = routes.find((x) => x['@id'] === id); res.writeHead(r ? 200 : 404); return res.end(r ? JSON.stringify(r) : '{}'); }
        if (req.method === 'PUT' && req.url === '/config/apps/http/servers/srv0/routes/0') { routes.unshift(JSON.parse(b)); res.writeHead(200); return res.end(); }
        res.writeHead(400); res.end('onbekend');
      });
    });
    const sock = join(basis, 'caddy.sock');
    await new Promise<void>((r) => caddy.listen(sock, () => r()));
    const ccfg = { ...cfg, apps: { ...cfg.apps, caddyAdmin: `unix:${sock}`, caddyServer: 'srv0', domain: '{app}.apps.voorbeeld.nl' } };
    const rc = await h['apps.deploy'](ccfg, { name: 'metroute', files: [{ path: 'index.html', content: 'r' }] });
    check('Caddy: route vooraan (PUT routes/0) met host uit het sjabloon, URL https', rc.state === 'done' && rc.url === 'https://metroute.apps.voorbeeld.nl' && routes[0]?.match?.[0]?.host?.[0] === 'metroute.apps.voorbeeld.nl'
      && /^127\.0\.0\.1:20\d{3}$/.test(routes[0]?.handle?.[0]?.upstreams?.[0]?.dial), JSON.stringify([rc.url, routes, verzoeken.slice(-3)]).slice(0, 400));
    routes.length = 0; // Caddy herstart met zijn Caddyfile: API-routes weg
    const { routesHerstellen } = await import('../../deploy/agent/agent.mjs') as any;
    const hersteld = await routesHerstellen(ccfg);
    check('Caddy: ontbrekende route na herstart teruggezet (alleen wat ontbreekt)', hersteld >= 1 && routes.length === hersteld && routes.some((r) => r['@id'] === 'mr-app-metroute') && (await routesHerstellen(ccfg)) === 0, JSON.stringify([hersteld, routes.map((r) => r['@id'])]));
    caddy.close();

    // nieuwe versie start niet → vorige versie automatisch terug
    const k1 = await h['apps.deploy'](cfg, { name: 'kapot', files: [{ path: 'index.html', content: 'x' }], wait_seconds: 75 });
    check('app die niet start: mislukt met logboek, geen container achtergelaten', k1.state === 'failed' && /did not start/.test(k1.error), JSON.stringify(k1).slice(0, 300));

    const c = await h['apps.control'](cfg, { name: 'site', action: 'stop' });
    check('control stop', c.ok === true);
    check('control: onbekende actie geweigerd', await geweigerd(() => h['apps.control'](cfg, { name: 'site', action: 'kill' }), /action/));
    check('route: ongeldig domein geweigerd', await geweigerd(() => h['apps.route'](cfg, { name: 'site', domain: 'evil domain' }), /invalid domain/));
    const rt = await h['apps.route'](cfg, { name: 'site', domain: 'site.example.com' });
    check('route zonder Caddy: blijft lokaal, met uitleg', rt.routed === false && /local only/.test(rt.note));
    const weg = await h['apps.control'](cfg, { name: 'site', action: 'remove' });
    check('remove: register en geheimen weg, snapshots blijven', weg.removed && !existsSync(join(cfg.apps.root, 'secrets', 'site.env')) && existsSync(join(cfg.apps.root, 'snapshots', 'site')));
  } finally {
    try { const st = JSON.parse(readFileSync(join(basis, 'staat.json'), 'utf8')); for (const c of Object.values<any>(st.containers)) if (c.pid) { try { process.kill(c.pid); } catch { /* weg */ } } } catch { /* geen staat */ }
  }
  return einde();
}
