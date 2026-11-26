// SITE-001 (пункт 19): знеособлена аналітика на сервері — без згоди нічого не рахується, огляд для адміністратора
// повертає лише день, назву розділу й кількість. Потрібна база PostgreSQL (DATABASE_URL), інакше перевірка пропускається.
// nl: anonieme analyse op de server — zonder toestemming niets geteld; het beheerdersoverzicht bevat alleen dag, naam en aantal.
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { checker } from './hulp/nep-google';
import { closePool, getPool } from '../../server/platform/pg';
import { ANALYTICS_TABEL, PRIVACY_TABEL, analyseOverzicht, analyticsTellen, zetAnalyticsToestemming } from '../../backend/privacy';

export async function main(): Promise<number> {
  const { check, einde } = checker('site-001-analyse');
  const index = await readFile('backend/index.ts', 'utf8');
  const route = index.split('\n').find((r) => r.includes("'POST /api/owner/admin/analyse-overzicht'")) || '';
  check('route bestaat en vraagt admin.read', route.includes("adminContext(ctx.event,ctx.body,'admin.read')") && route.includes('error(auth.errorCode as string,403)'));
  const tab = await readFile('src/diagnostiek/Diagnostiek.tsx', 'utf8');
  check('tabblad «Відвідування» in de diagnostiek', tab.includes("id: 'bezoek'") && tab.includes("<BezoekTab"));

  if (!process.env.DATABASE_URL) { console.log('— geen DATABASE_URL: databasecontroles overgeslagen'); return einde(); }
  const merk = `site001-${randomUUID().slice(0, 8)}`;
  const gebruiker = `test-${merk}`;
  const naam = `bezoek.${merk}`;
  try {
    check('zonder toestemming niets geteld', (await analyticsTellen(gebruiker, naam)) === 'geen-toestemming');
    await zetAnalyticsToestemming(gebruiker, true);
    check('ongeldige naam geweigerd', (await analyticsTellen(gebruiker, 'Bezoek /pad?x=1')) === 'ongeldig');
    check('met toestemming geteld (1)', (await analyticsTellen(gebruiker, naam)) === 'geteld');
    check('met toestemming geteld (2)', (await analyticsTellen(gebruiker, naam)) === 'geteld');
    const o = await analyseOverzicht(7);
    const rij = o.perNaam.find((x) => x.naam === naam);
    check('overzicht telt 2 bezoeken voor vandaag', rij?.aantal === 2 && o.rijen.some((x) => x.naam === naam && x.dag === o.tot && x.aantal === 2));
    check('periode 7 dagen', o.dagen === 7 && o.vanaf <= o.tot);
    const velden = new Set(o.rijen.flatMap((x) => Object.keys(x)));
    check('alleen dag, naam en aantal (geen account, IP of apparaat)', [...velden].sort().join(',') === 'aantal,dag,naam');
    check('geen gebruikers-id in het overzicht', !JSON.stringify(o).includes(gebruiker));
    check('periode wordt begrensd', (await analyseOverzicht(99999)).dagen === 366 && (await analyseOverzicht('x')).dagen === 30);
    await zetAnalyticsToestemming(gebruiker, false);
    check('na intrekken niets meer geteld', (await analyticsTellen(gebruiker, naam)) === 'geen-toestemming');
  } finally {
    await getPool().query('DELETE FROM app.records WHERE tbl = $1 AND data->>\'naam\' = $2', [ANALYTICS_TABEL, naam]).catch(() => undefined);
    await getPool().query('DELETE FROM app.records WHERE tbl = $1 AND id = $2', [PRIVACY_TABEL, `privacy:${gebruiker}`]).catch(() => undefined);
    await closePool().catch(() => undefined);
  }
  return einde();
}
