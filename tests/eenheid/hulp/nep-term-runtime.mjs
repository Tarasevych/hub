#!/usr/bin/env node
// Nep-«podman» voor de terminaltest: logt argv, «run» gedraagt zich als een kleine shell (echo / exit), «rm -f» slaagt.
import { appendFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

const dir = process.env.NEP_TERM_DIR;
const argv = process.argv.slice(2);
if (dir) appendFileSync(`${dir}/log.txt`, `${JSON.stringify(argv)}\n`);
const [cmd] = argv;
if (cmd === '--version') {
  console.log('podman version 5.0.0 (nep-term)');
  process.exit(0);
}
if (cmd === 'rm') process.exit(0);
if (cmd !== 'run') {
  console.error(`nep-term: onbekend ${cmd}`);
  process.exit(2);
}
if (dir) writeFileSync(`${dir}/run.json`, JSON.stringify({ argv }));
process.stdout.write('werk$ ');
const rl = createInterface({ input: process.stdin, terminal: false });
rl.on('line', (line) => {
  const t = line.replace(/\r$/, '').trim();
  if (t === 'exit') {
    console.log('bye');
    process.exit(0);
  }
  if (t.startsWith('echo ')) console.log(t.slice(5));
  else if (t) console.log(t);
  process.stdout.write('werk$ ');
});
