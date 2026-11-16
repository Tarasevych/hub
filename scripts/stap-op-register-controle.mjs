#!/usr/bin/env node
// AGENTSCHEIDING-001 / «опис завжди» (16.11.2026). Bouwcontrole: elke route in backend/ die om een verse bevestiging vraagt
// («Підтвердіть доступ», 403 STEP_UP_REQUIRED / STEP_UP_STRONG_REQUIRED) moet een EIGEN regel hebben in het register
// shared/stap-op-beschrijving.ts (PER_PAD of PER_ACTIE). Zonder eigen regel bouwt de site niet — zo komt er geen uitgave met een
// knop waarvan het venster alleen de algemene tekst per gebied kan tonen.
//
// Збірка сайту зупиняється, якщо маршрут із підтвердженням доступу не має власного опису в реєстрі. Так нова кнопка не потрапить
// у випуск без зрозумілого опису у вікні «Підтвердіть доступ».
//
// Gebruik: node scripts/stap-op-register-controle.mjs [--stil]. Geen netwerk, geen database.
import { build } from 'esbuild';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const stil = process.argv.includes('--stil');
const wortel = resolve(import.meta.dirname, '..');
const map = mkdtempSync(join(tmpdir(), 'stap-op-register-'));
const uit = join(map, 'controle.mjs');
const invoer = `
import { routesMetStapOp, onopgelosteSjablonen } from ${JSON.stringify(join(wortel, 'tests/eenheid/hulp/stap-op-routes.ts'))};
import { actieVoorPad } from ${JSON.stringify(join(wortel, 'shared/stap-op-acties.ts'))};
import { beschrijfStapOp } from ${JSON.stringify(join(wortel, 'shared/stap-op-beschrijving.ts'))};
export { routesMetStapOp, onopgelosteSjablonen, actieVoorPad, beschrijfStapOp };
`;
await build({ stdin: { contents: invoer, resolveDir: wortel, loader: 'ts' }, bundle: true, platform: 'node', format: 'esm', outfile: uit, logLevel: 'silent' });
writeFileSync(join(map, 'package.json'), '{"type":"module"}');
const m = await import(pathToFileURL(uit).href);

const backend = join(wortel, 'backend');
/** Het mechanisme van de bevestiging zelf (opent nooit het venster) — dezelfde uitzonderingen als de test. */
const MECHANISME = [/\/api\/owner\/access\/stap-op(\/|$)/, /\/api\/owner\/identity\/transactions\//];
/** Routes waar een hulpfunctie de bevestiging vraagt die de zoektocht niet ziet. */
const EXTRA = [{ methode: 'POST', pad: '/api/impersonatie/toestaan', voorbeeld: '/api/impersonatie/toestaan', bestand: 'backend/impersonatie.ts' }];

const routes = [...m.routesMetStapOp(backend), ...EXTRA].filter((r) => !MECHANISME.some((re) => re.test(r.pad)));
const zonder = [];
for (const r of routes) {
  const b = m.beschrijfStapOp(m.actieVoorPad(r.voorbeeld), r.voorbeeld);
  if (!b.bekend || b.algemeen) zonder.push(`${r.methode} ${r.pad} (${r.bestand.replace(wortel + '/', '')})`);
}
const open = m.onopgelosteSjablonen(backend);

if (zonder.length || open.length || routes.length < 100) {
  console.error('[stap-op-register] Збірку зупинено / Bouw gestopt:');
  if (routes.length < 100) console.error(`  пошук знайшов лише ${routes.length} маршрутів із підтвердженням (очікується ≥ 100) — перевірте tests/eenheid/hulp/stap-op-routes.ts`);
  for (const z of zonder) console.error(`  без власного опису / zonder eigen beschrijving: ${z}`);
  for (const o of open) console.error(`  адресу маршруту не розібрано / routeadres niet opgelost: ${o}`);
  console.error('  Додайте рядок у PER_PAD або PER_ACTIE в shared/stap-op-beschrijving.ts (українською й нідерландською, з наслідком).');
  process.exit(1);
}
if (!stil) console.log(`[stap-op-register] ${routes.length} маршрутів із підтвердженням — кожен має власний опис.`);
