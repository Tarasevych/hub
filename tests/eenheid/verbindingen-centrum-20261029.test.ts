// UI-003: pure logica van het verbindingencentrum (src/verbindingen/verbindingen-logica.ts) + vlagmigratie 0151.
// Runnercontract: zie tests/eenheid/hulp/node-test-main.ts. De oude «export async function main() { return 0; }» liet een falende
// test onder scripts/eenheidstests.mjs groen eindigen (05.11.2026).
import { nodeTestSuite } from './hulp/node-test-main.ts';
const { test, main } = nodeTestSuite();
export { main };
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { accountStand, isLevend, probleemUitleg, soortVan, wanneer } from '../../src/verbindingen/verbindingen-logica.ts';
import { CLOUD_VNEXT_AANBIEDERS } from '../../shared/cloud-vnext-model.ts';

const acc = (o: Record<string, unknown> = {}) => ({ id: 'a1', email: 'x@example.test', actief: true, status: 'connected', ...o }) as never;
const leeg = { google: { gekoppeld: false, accounts: [] }, photos: { gekoppeld: false }, m4: { stagingAan: false, aanbieders: [] }, zoekIndex: { cloud: true, drive: false } };
const A = (id: string) => CLOUD_VNEXT_AANBIEDERS.find((a) => a.id === id)!;

test('accountstand volgt de levende feiten', () => {
  assert.equal(accountStand(acc()), 'ok');
  assert.equal(accountStand(acc({ sync: { laatstGeluktOp: 1, laatstPogingOp: 2, foutCode: '', herstelNodig: false } })), 'ok');
  assert.equal(accountStand(acc({ status: 'reauth_required' })), 'aandacht');
  assert.equal(accountStand(acc({ status: 'revoked' })), 'aandacht');
  assert.equal(accountStand(acc({ status: 'pending' })), 'bezig');
  assert.equal(accountStand(acc({ status: 'disconnected' })), 'uit');
  assert.equal(accountStand(acc({ sync: { laatstGeluktOp: 1, laatstPogingOp: 2, foutCode: 'DRIVE_500', herstelNodig: false } })), 'aandacht');
  assert.equal(accountStand(acc({ sync: { laatstGeluktOp: 1, laatstPogingOp: 2, foutCode: '', herstelNodig: true } })), 'aandacht');
});
test('foutuitleg kiest de passende actie, zonder interne code in de tekst', () => {
  assert.equal(probleemUitleg('uk', acc()), null);
  assert.equal(probleemUitleg('uk', acc({ status: 'reauth_required' }))?.actie, 'opnieuw');
  const t = probleemUitleg('nl', acc({ sync: { laatstGeluktOp: 1, laatstPogingOp: 2, foutCode: 'TOKEN_EXPIRED', herstelNodig: false } }));
  assert.equal(t?.actie, 'opnieuw'); assert.ok(!t!.tekst.includes('TOKEN'));
  assert.equal(probleemUitleg('uk', acc({ sync: { laatstGeluktOp: 1, laatstPogingOp: 2, foutCode: 'DRIVE_500', herstelNodig: false } }))?.actie, 'wachten');
});
test('catalogussoort: niets «verbonden» zonder levende controle', () => {
  assert.equal(soortVan(A('google-drive'), null), 'beschikbaar');
  assert.equal(soortVan(A('google-drive'), { ...leeg, google: { gekoppeld: true, accounts: [] } } as never), 'verbonden');
  assert.equal(soortVan(A('onedrive'), leeg as never), 'beperkt');
  assert.equal(soortVan(A('icloud-drive'), leeg as never), 'onmogelijk');
  assert.equal(soortVan(A('nextcloud'), leeg as never), 'gepland');
  assert.equal(isLevend(A('onedrive'), { ...leeg, m4: { stagingAan: true, aanbieders: [{ id: 'onedrive', sleutelsAanwezig: true, accounts: [{ id: 'm', label: 'l', status: 'connected' }] }] } } as never), true);
  for (const a of CLOUD_VNEXT_AANBIEDERS) assert.notEqual(soortVan(a, leeg as never), 'verbonden', a.id);
});
test('relatieve tijd, 0 = nooit', () => {
  assert.equal(wanneer('uk', 0), 'ще не було');
  assert.equal(wanneer('nl', 0), 'nog nooit');
  const nu = Date.UTC(2026, 9, 29, 12); assert.match(wanneer('nl', nu - 5 * 60_000, nu), /5 minuten geleden/);
  assert.match(wanneer('uk', nu - 2 * 3600_000, nu), /2 год/);
});
test('migratie 0151 zet alleen de vlag, standaard UIT', () => {
  const sql = readFileSync('migrations/0151_verbindingen_centrum_v2.sql', 'utf8');
  assert.match(sql, /'verbindingen-centrum-v2'.*false, false\)/s);
  assert.doesNotMatch(sql, /CREATE|ALTER|DROP|DELETE|UPDATE/i);
});
