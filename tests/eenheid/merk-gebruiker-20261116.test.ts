// REESTR-LOGO-001 (16.11.2026): власний логотип користувача (міграція 0300, backend/merk-gebruiker.ts) на справжньому PostgreSQL.
// Eigen logo van de gebruiker: zetten, vervangen, wissen, scheiding tussen mensen en ruimtes, grens, kwaadaardige SVG, sleutelkluis
// (alleen onder de eigen sleutel; dicht → 423) en de routes zelf. Zonder DATABASE_URL alleen de pure delen.
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { checker } from './hulp/nep-google';
import { SLEUTELKLUIS_REGISTER } from '../../shared/sleutelkluis';

const SVG_A = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#e33"/></svg>';
const SVG_B = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" rx="6" fill="#3a3"/></svg>';
const SVG_KWAAD = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><script>alert(1)</script></svg>';
const SVG_HREF = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><image href="https://kwaad.example/x.png"/></svg>';

export async function main() {
  const { check, einde: klaar } = checker('merk-gebruiker-20261116');

  // ------------------------------------------------------------ 1. Bron: migratie, register, journaal, routes in index
  const mig = readFileSync('migrations/0300_merk_gebruiker.sql', 'utf8');
  const idx = readFileSync('backend/index.ts', 'utf8');
  const journaal = readFileSync('shared/beheer-journaal.ts', 'utf8');
  const reg = SLEUTELKLUIS_REGISTER.find((r) => r.tabel === 'app.merk_gebruiker');
  check('1: міграція 0300 має ключ (user_id, ruimte, sleutel), межу 200 КБ і рівно одне з data / data_versleuteld',
    /PRIMARY KEY\s*\(\s*user_id\s*,\s*ruimte\s*,\s*sleutel\s*\)/i.test(mig) && mig.includes('204800') && /dek1\./.test(mig)
    && /prive.*technisch/s.test(mig));
  check('1: маршрути підключено в backend/index.ts, журнал має підписи, Сховище ключів знає таблицю (stand dek)',
    idx.includes('merkGebruikerRoutes') && journaal.includes('owner.ui.merk.gezet') && journaal.includes('owner.ui.merk.gewist')
    && reg?.stand === 'dek');

  if (!process.env.DATABASE_URL) { check('2: PostgreSQL недоступний — перевірку бази пропущено (DATABASE_URL не задано)', true); return klaar(); }

  process.env.TOTP_ENCRYPTION_KEY_V1 = process.env.TOTP_ENCRYPTION_KEY_V1 || randomBytes(32).toString('base64');
  const { getPool } = await import('../../server/platform/pg');
  const m = await import('../../backend/merk-gebruiker');
  const sk = await import('../../backend/sleutelkluis');
  const sys = getPool('systeem');
  const a = `pg-merk-a-${randomUUID()}`, b = `pg-merk-b-${randomUUID()}`, c = `pg-merk-c-${randomUUID()}`;
  const aP = { userId: a, ruimte: 'prive' as const }, aT = { userId: a, ruimte: 'technisch' as const }, bP = { userId: b, ruimte: 'prive' as const };
  const cP = { userId: c, ruimte: 'prive' as const };
  const fout = async (f: () => Promise<unknown>) => { try { await f(); return ''; } catch (e) { return `${(e as { code?: string }).code || (e as Error).message}|${(e as { status?: number }).status || ''}`; } };

  // ------------------------------------------------------------ 2. Zetten / lijst / vervangen / wissen
  const z1 = await m.merkGebruikerZetten(aP, 'telegram', 'svg', Buffer.from(SVG_A));
  const l1 = await m.merkGebruikerLijst(aP);
  check('2: власний логотип збережено й повернено як data-URI SVG для цього ж простору',
    z1.sleutel === 'telegram' && l1.merken.length === 1 && l1.merken[0].sleutel === 'telegram'
    && l1.merken[0].data.startsWith('data:image/svg+xml;base64,')
    && Buffer.from(l1.merken[0].data.split(',')[1], 'base64').toString().includes('circle') && l1.gesloten === 0);

  await m.merkGebruikerZetten(aP, 'telegram', 'svg', Buffer.from(SVG_B));
  const l2 = await m.merkGebruikerLijst(aP);
  const rauw = (await sys.query(`SELECT count(*)::int AS n FROM app.merk_gebruiker WHERE user_id = $1`, [a])).rows[0].n;
  check('2: повторне «завантажити» замінює логотип (рядок один, вміст новий, hash інший)',
    rauw === 1 && l2.merken.length === 1 && Buffer.from(l2.merken[0].data.split(',')[1], 'base64').toString().includes('rect')
    && l2.merken[0].hash !== l1.merken[0].hash);

  // ------------------------------------------------------------ 3. Scheiding
  const lB = await m.merkGebruikerLijst(bP), lAT = await m.merkGebruikerLijst(aT);
  await m.merkGebruikerZetten(bP, 'telegram', 'svg', Buffer.from(SVG_A));
  const wistB = await m.merkGebruikerWissen(bP, 'telegram');
  const lA_naB = await m.merkGebruikerLijst(aP);
  check('3: інший користувач і технічний простір того ж користувача не бачать чужого логотипа; стирання в B не чіпає A',
    lB.merken.length === 0 && lAT.merken.length === 0 && wistB && lA_naB.merken.length === 1);
  check('3: мітка списку (scope) різна для людей і просторів, тож браузер скидає чужий список',
    m.scopeVan(aP) !== m.scopeVan(bP) && m.scopeVan(aP) !== m.scopeVan(aT) && m.scopeVan(aP) === m.scopeVan({ ...aP }));

  // ------------------------------------------------------------ 4. Weigeringen en grens
  const fScript = await fout(() => m.merkGebruikerZetten(aP, 'google', 'svg', Buffer.from(SVG_KWAAD)));
  const fHref = await fout(() => m.merkGebruikerZetten(aP, 'google', 'svg', Buffer.from(SVG_HREF)));
  const fSleutel = await fout(() => m.merkGebruikerZetten(aP, '../etc', 'svg', Buffer.from(SVG_A)));
  const fPng = await fout(() => m.merkGebruikerZetten(aP, 'google', 'png', Buffer.from('geen png')));
  check('4: SVG зі скриптом і з зовнішнім посиланням, хибний ключ і «PNG», що ним не є, — відхилено, нічого не збережено',
    fScript.startsWith('MERK_EIGEN_ELEMENT_SCRIPT') && fHref.startsWith('MERK_EIGEN_') && fSleutel.startsWith('MERK_EIGEN_SLEUTEL')
    && fPng.startsWith('MERK_EIGEN_') && (await m.merkGebruikerLijst(aP)).merken.length === 1);

  for (let i = 0; i < m.MERK_GEBRUIKER_MAX; i++) await m.merkGebruikerZetten(cP, `merk${i}`, 'svg', Buffer.from(SVG_A));
  const fMax = await fout(() => m.merkGebruikerZetten(cP, 'nog-een', 'svg', Buffer.from(SVG_A)));
  const vervangOpMax = await fout(() => m.merkGebruikerZetten(cP, 'merk0', 'svg', Buffer.from(SVG_B)));
  check(`4: межа ${m.MERK_GEBRUIKER_MAX} логотипів на простір: новий понад межу — MERK_EIGEN_TE_VEEL, заміна наявного — дозволена`,
    fMax.startsWith('MERK_EIGEN_TE_VEEL') && vervangOpMax === '');

  // ------------------------------------------------------------ 5. Sleutelkluis
  sk.zetHouderControle(async () => true);
  await sk.inschakelen(aP, { soort: 'sessie', id: 'merk-pg-s1' });
  const her = await sk.herversleutelen(aP);
  const naHer = (await sys.query(`SELECT data, data_versleuteld FROM app.merk_gebruiker WHERE user_id = $1 AND ruimte = 'prive' AND sleutel = 'telegram'`, [a])).rows[0];
  const lijstOpen = await m.merkGebruikerLijst(aP);
  await m.merkGebruikerZetten(aP, 'discord', 'svg', Buffer.from(SVG_A));
  const nieuwRauw = (await sys.query(`SELECT data, data_versleuteld FROM app.merk_gebruiker WHERE user_id = $1 AND sleutel = 'discord'`, [a])).rows[0];
  check('5: після вмикання Сховища ключів наявний логотип перешифровано (dek1., відкритих байтів немає), новий одразу зашифровано, список читається',
    her.voortgang.status === 'klaar' && naHer.data === null && String(naHer.data_versleuteld).startsWith('dek1.')
    && nieuwRauw.data === null && String(nieuwRauw.data_versleuteld).startsWith('dek1.')
    && !String(nieuwRauw.data_versleuteld).includes('circle')
    && lijstOpen.merken.length === 1 && Buffer.from(lijstOpen.merken[0].data.split(',')[1], 'base64').toString().includes('rect'));

  sk.sleutelVergrendelen(aP);
  const fDicht = await fout(() => m.merkGebruikerZetten(aP, 'whatsapp', 'svg', Buffer.from(SVG_A)));
  const lijstDicht = await m.merkGebruikerLijst(aP);
  const whatsappRij = (await sys.query(`SELECT 1 FROM app.merk_gebruiker WHERE user_id = $1 AND sleutel = 'whatsapp'`, [a])).rowCount;
  check('5: ключ закрито → збереження 423 SLEUTELKLUIS_GESLOTEN без запису, список чесно каже «2 зашифровані» і нічого не показує',
    fDicht === 'SLEUTELKLUIS_GESLOTEN|423' && whatsappRij === 0 && lijstDicht.merken.length === 0 && lijstDicht.gesloten === 2);

  // ------------------------------------------------------------ 6. Routes (sessie nagebootst, ruimte uit de database)
  const sessies: Record<string, { id: string; status: string }> = { tokB: { id: b, status: 'approved' }, tokX: { id: `pg-merk-x-${randomUUID()}`, status: 'pending' } };
  const routes = m.merkGebruikerRoutes({
    requireSession: async (event) => { const u = sessies[String((event as { tok?: string }).tok)]; return u ? { service: 'hub', user: u } : { errorCode: 'NO_SESSION' }; },
  });
  const roep = async (pad: string, tok: string, body: Record<string, unknown>) => {
    const r = await (routes[`POST /api/owner/merk-gebruiker/${pad}`][0] as unknown as (c: unknown) => Promise<{ statusCode: number; body: string }>)({ event: { tok }, body });
    return { status: r.statusCode, lijf: JSON.parse(r.body || '{}') as Record<string, unknown> };
  };
  const rZet = await roep('zetten', 'tokB', { sleutel: 'google', soort: 'svg', data: Buffer.from(SVG_A).toString('base64'), ruimte: 'technisch', userId: a });
  const rLijst = await roep('lijst', 'tokB', {});
  const rKwaad = await roep('zetten', 'tokB', { sleutel: 'google', soort: 'svg', data: Buffer.from(SVG_KWAAD).toString('base64') });
  const rGeen = await roep('lijst', 'tokZ', {});
  const rWacht = await roep('lijst', 'tokX', {});
  const rWis = await roep('wissen', 'tokB', { sleutel: 'google' });
  const aNaRoute = (await sys.query(`SELECT count(*)::int AS n FROM app.merk_gebruiker WHERE user_id = $1 AND sleutel = 'google'`, [a])).rows[0].n;
  const audit = (await sys.query(`SELECT count(*)::int AS n FROM app.audit WHERE action IN ('owner.ui.merk.gezet','owner.ui.merk.gewist') AND (actor_id = $1 OR owner_id = $1)`, [b])).rows[0].n;
  check('6: маршрут зберігає в простір із бази (поля ruimte/userId у запиті ігноруються), список повертає scope і межу',
    rZet.status === 200 && rLijst.status === 200 && (rLijst.lijf.merken as unknown[]).length === 1 && rLijst.lijf.ruimte === 'prive'
    && rLijst.lijf.scope === m.scopeVan(bP) && rLijst.lijf.max === m.MERK_GEBRUIKER_MAX && aNaRoute === 0);
  check('6: шкідливий SVG через маршрут → 400; без сесії й без схваленого облікового запису → 403; стирання повертає системний',
    rKwaad.status === 400 && rGeen.status === 403 && rWacht.status === 403 && rWis.status === 200 && rWis.lijf.gewist === true
    && (rWis.lijf.merken as unknown[]).length === 0);
  check('6: кожна дія записана в журнал облікового запису (без самого файла)', audit >= 3);

  await sys.query(`DELETE FROM app.merk_gebruiker WHERE user_id = ANY($1)`, [[a, b, c]]);
  return klaar();
}
