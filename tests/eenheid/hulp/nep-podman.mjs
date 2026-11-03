#!/usr/bin/env node
// Nep-«podman» voor tests van apps.* in de agent: onthoudt containers in een JSON-bestand, «run» start echt een klein
// TCP/HTTP-proces op de gepubliceerde hostpoort (tenzij de app «kapot» heet), «rm -f» stopt het.
import { spawn } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
const dir = process.env.NEP_PODMAN_DIR;
const staatPad = `${dir}/staat.json`;
const staat = existsSync(staatPad) ? JSON.parse(readFileSync(staatPad, 'utf8')) : { containers: {}, images: [] };
const bewaar = () => writeFileSync(staatPad, JSON.stringify(staat));
const argv = process.argv.slice(2);
appendFileSync(`${dir}/log.txt`, JSON.stringify(argv) + '\n');
const [cmd] = argv;
const stop = (n) => { const c = staat.containers[n]; if (c?.pid) { try { process.kill(c.pid); } catch { /* al weg */ } } };
if (cmd === '--version') { console.log('podman version 5.0.0 (nep)'); }
else if (cmd === 'build') { const t = argv[argv.indexOf('-t') + 1]; staat.images.push(t); bewaar(); console.log(`STEP 1/1\nSuccessfully tagged ${t}`); }
else if (cmd === 'rm') { const n = argv[argv.length - 1]; stop(n); delete staat.containers[n]; bewaar(); }
else if (cmd === 'rmi') { const t = argv[argv.length - 1]; staat.images = staat.images.filter((x) => x !== t); bewaar(); }
else if (cmd === 'run') {
  const naam = argv[argv.indexOf('--name') + 1], p = argv[argv.indexOf('-p') + 1], image = argv[argv.length - 1];
  const host = Number(p.split(':')[1]);
  const envFile = argv.includes('--env-file') ? readFileSync(argv[argv.indexOf('--env-file') + 1], 'utf8') : '';
  let pid = 0;
  if (!naam.endsWith('kapot')) {
    const child = spawn(process.execPath, ['-e', `require('http').createServer((q,r)=>r.end('ok')).listen(${host},'127.0.0.1')`], { detached: true, stdio: 'ignore' });
    child.unref(); pid = child.pid;
  }
  staat.containers[naam] = { naam, image, pid, running: true, env: envFile, argv }; bewaar(); console.log('abc123');
}
else if (cmd === 'logs') { const n = argv[argv.length - 1]; const c = staat.containers[n]; console.log(`gestart ${c?.image}\nconfig ${c?.env.replace(/\n/g, ' ')}`); }
else if (cmd === 'ps') { for (const c of Object.values(staat.containers)) console.log(JSON.stringify({ Names: [c.naam], State: c.running ? 'running' : 'exited' })); }
else if (cmd === 'stats') { for (const c of Object.values(staat.containers)) if (c.running) console.log(JSON.stringify({ Name: c.naam, MemUsage: '12MiB / 512MiB', CPUPerc: '0.5%' })); }
else if (['stop', 'start', 'restart'].includes(cmd)) { const n = argv[1]; if (staat.containers[n]) { staat.containers[n].running = cmd !== 'stop'; bewaar(); } else { console.error('no such container'); process.exit(125); } }
else { console.error(`nep-podman: onbekend ${cmd}`); process.exit(2); }
