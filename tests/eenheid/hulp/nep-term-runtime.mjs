#!/usr/bin/env node
// Nep-«podman» voor terminaltests: «run» schrijft de argumenten naar $NEP_TERM_DIR/run.json en gedraagt zich als een eenvoudige
// shell: elke regel invoer komt terug als «$ <regel>» + bij «echo X» de uitvoer X; «exit» stopt. «rm -f» en «--version» doen niets.
import { appendFileSync, writeFileSync } from 'node:fs';
const dir = process.env.NEP_TERM_DIR || '/tmp';
const argv = process.argv.slice(2);
appendFileSync(`${dir}/log.txt`, JSON.stringify(argv) + '\n');
if (argv[0] === '--version') { console.log('podman version 5.0.0 (nep-term)'); process.exit(0); }
if (argv[0] === 'rm') process.exit(0);
if (argv[0] === 'run') {
  writeFileSync(`${dir}/run.json`, JSON.stringify(argv));
  process.stdout.write('werk$ ');
  let buf = '';
  process.stdin.on('data', (d) => {
    buf += d.toString();
    let i;
    while ((i = buf.search(/[\r\n]/)) >= 0) {
      const regel = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!regel) continue;
      process.stdout.write(`\r\n`);
      if (regel === 'exit') { process.stdout.write('bye\r\n'); process.exit(0); }
      const m = /^echo (.*)$/.exec(regel);
      process.stdout.write(m ? `${m[1]}\r\n` : `nep: ${regel}\r\n`);
      process.stdout.write('werk$ ');
    }
  });
  process.stdin.on('end', () => process.exit(0));
}
