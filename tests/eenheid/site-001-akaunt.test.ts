// SITE-001 (рішення власника 26.11.2026): в інтерфейсі, повідомленнях сервера й словниках пошуку — лише «обліковий запис»,
// жодного англіцизму «акаунт» у жодній формі (абсолютний мовний закон).
// nl: in de interface, servermeldingen en zoekwoordenboeken alleen «обліковий запис», nooit het anglicisme «акаунт».
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { checker } from './hulp/nep-google';

async function bestanden(map: string): Promise<string[]> {
  const uit: string[] = [];
  for (const e of await readdir(map, { withFileTypes: true })) {
    if (e.name === 'node_modules') continue;
    const p = join(map, e.name);
    if (e.isDirectory()) uit.push(...(await bestanden(p)));
    else if (/\.(tsx?|js|mjs|json|html|css|sh|ps1)$/.test(e.name)) uit.push(p);
  }
  return uit;
}

export async function main(): Promise<number> {
  const { check, einde } = checker('site-001-akaunt');
  // Корінь слова складено з частин, щоб цей тест сам не потрапив до власного пошуку.
  const verboden = new RegExp('[Аа]' + 'каунт', 'g');
  for (const map of ['src', 'shared', 'backend', 'server', 'public', 'deploy']) {
    const treffers: string[] = [];
    for (const f of await bestanden(map)) {
      const bron = await readFile(f, 'utf8');
      const n = bron.match(verboden)?.length ?? 0;
      if (n) treffers.push(`${f} (${n})`);
    }
    check(`${map}/: geen «${'а' + 'каунт'}»`, treffers.length === 0, treffers.slice(0, 10).join(', '));
  }
  const html = await readFile('index.html', 'utf8');
  check(`index.html: geen «${'а' + 'каунт'}»`, !verboden.test(html));
  const syn = await readFile('shared/zoek-synoniemen.ts', 'utf8');
  check('zoekwoordenboek: «обліковий запис» blijft vindbaar', syn.includes("'обліковий запис'") && syn.includes("'видалити обліковий запис'"));
  return einde();
}
