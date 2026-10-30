// Etap E (14.10.2026): journaal-context (профіль / від імені / простір) en export naar een eigen SIEM (bestand + Loki op loopback).
// Echte database; Loki is een lokale http-server op 127.0.0.1 in deze test.
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { getPool } from '../../server/platform/pg';
import { auditLijst, auditToevoegen, auditControle, zetAuditContextBron } from '../../server/platform/audit';
import { metVerzoek, zetGebruiker } from '../../server/platform/context';
import { siemConfig, siemRegel, siemRonde, siemStand } from '../../backend/siem';
import { checker } from './hulp/nep-google';

export async function main(): Promise<number> {
  const { check, einde } = checker('siem');
  const sys = getPool('systeem');

  // ---------------------------------------------------------------- configuratie
  check('uit zonder instellingen', siemConfig({}).aan === false);
  check('Loki op loopback toegestaan (127.0.0.1, localhost, [::1])', ['http://127.0.0.1:3100', 'http://localhost:3100/', 'http://[::1]:3100'].every((u) => siemConfig({ SIEM_LOKI_URL: u }).loki !== ''));
  check('Loki op een andere host geweigerd (geen export naar buiten)', ['http://10.0.0.5:3100', 'https://loki.example.com', 'http://127.0.0.1.evil.test:3100', 'http://user@127.0.0.1:3100', 'file:///etc/passwd'].every((u) => { const c = siemConfig({ SIEM_LOKI_URL: u }); return c.loki === '' && c.lokiGeweigerd && !c.aan; }));
  check('bestand alleen met absoluut pad', siemConfig({ SIEM_BESTAND: 'audit.ndjson' }).aan === false && siemConfig({ SIEM_BESTAND: '/var/log/mijn-ruimte/audit.ndjson' }).aan === true);
  check('interval begrensd 5–300 s', siemConfig({ SIEM_BESTAND: '/x', SIEM_INTERVAL_S: '1' }).intervalS === 5 && siemConfig({ SIEM_BESTAND: '/x', SIEM_INTERVAL_S: '9999' }).intervalS === 300);

  // ---------------------------------------------------------------- regel zonder geheimen
  const regel = siemRegel({ id: 7, owner_id: 'o', actor_id: 'a', action: 'x.y', type: 'beveiliging', result: 'success', ip_hash: 'h', device: 'Chrome/Linux', service: 'mcp', seq: 3, prev_hash: 'p', hash: 'q', ms: Date.UTC(2026, 9, 14),
    details: { naam: 'ok', token: 'GEHEIM1', nested: { password: 'GEHEIM2', apiKey: 'GEHEIM3', diep: { secret: 'GEHEIM4', blijft: 1 } }, tokenId: 'mag', _ctx: { profiel: 'tech-abcdef123456', namens: randomUUID() } } }, 'testhost');
  const tekst = JSON.stringify(regel);
  check('geheimen (ook genest) nooit in de export; tokenId wel', !/GEHEIM/.test(tekst) && /"tokenId":"mag"/.test(tekst) && /"blijft":1/.test(tekst), tekst.slice(0, 200));
  check('context als eigen velden, niet in details', regel.profiel === 'tech-abcdef123456' && !!regel.namens && !('_ctx' in (regel.details as object)));
  check('vaste velden: @timestamp, event.action/category/outcome, hash', regel['@timestamp'] === '2026-10-14T00:00:00.000Z' && regel.event.action === 'x.y' && regel.event.outcome === 'success' && regel.hash === 'q' && regel.host === 'testhost');

  // ---------------------------------------------------------------- context in het journaal
  const eig = `siem-${randomUUID()}`;
  const tab = 'a'.repeat(48);
  const act = randomUUID();
  let bronAanroepen = 0;
  zetAuditContextBron(async (c) => { bronAanroepen++; return c.actor === eig && c.tab === tab ? { profiel: 'tech-0123456789ab', activatie: act } : {}; });
  const vasteNamens = randomUUID();
  await metVerzoek('POST /api/test', async () => {
    zetGebruiker(eig, 'mcp', tab);
    await auditToevoegen({ ownerId: eig, action: 'siem.test.een', details: { a: 1 } });
    await auditToevoegen({ ownerId: eig, action: 'siem.test.twee', details: { workspaceId: 'ruimte-1', token: 'GEHEIM5' } });
  });
  await auditToevoegen({ ownerId: eig, actorId: eig, action: 'siem.test.namens', details: { _ctx: { namens: vasteNamens } } });
  await auditToevoegen({ ownerId: eig, actorId: eig, action: 'siem.test.zonder', details: { b: 2 } });
  const rijen = (await sys.query(`SELECT action, ctx_profiel, ctx_namens, ctx_ruimte, details FROM app.audit WHERE owner_id = $1 ORDER BY id`, [eig])).rows;
  const per = (a: string) => rijen.find((r) => r.action === a);
  check('actie in een technisch profiel: kolom ctx_profiel + activatie in details._ctx', per('siem.test.een')?.ctx_profiel === 'tech-0123456789ab' && per('siem.test.een')?.details._ctx.activatie === act);
  check('één opzoeking per verzoek (twee regels, één aanroep van de bron)', bronAanroepen === 1, String(bronAanroepen));
  check('werkruimte → ctx_ruimte', per('siem.test.twee')?.ctx_ruimte === 'ruimte-1');
  check('namens (ondersteuning) → ctx_namens', per('siem.test.namens')?.ctx_namens === vasteNamens);
  check('buiten een verzoek of tabblad: geen context', per('siem.test.zonder')?.ctx_profiel === null && !per('siem.test.zonder')?.details._ctx);
  check('hashketen blijft geldig met context', (await auditControle(eig)).geldig);
  const gefilterd = await auditLijst({ ownerId: eig, profiel: '*' });
  check('journaal filtert op «профіль» en geeft context mee', gefilterd.items.length === 2 && gefilterd.items.every((x) => x.context.profiel === 'tech-0123456789ab'));
  check('filter «від імені»', (await auditLijst({ ownerId: eig, namens: vasteNamens })).items.map((x) => x.action).join() === 'siem.test.namens');
  zetAuditContextBron(null);

  // ---------------------------------------------------------------- export
  const map = mkdtempSync(join(tmpdir(), 'siem-'));
  const bestand = join(map, 'audit.ndjson');
  let lokiStatus = 204;
  const ontvangen: any[] = [];
  const loki = createServer((req, res) => { let b = ''; req.on('data', (d) => { b += d; }); req.on('end', () => { if (lokiStatus < 300) ontvangen.push(JSON.parse(b)); res.writeHead(lokiStatus).end(); }); });
  await new Promise<void>((r) => loki.listen(0, '127.0.0.1', r));
  const cfg = siemConfig({ SIEM_BESTAND: bestand, SIEM_LOKI_URL: `http://127.0.0.1:${(loki.address() as AddressInfo).port}` });
  const voor = (await sys.query('SELECT * FROM app.siem_export')).rows;
  await sys.query('DELETE FROM app.siem_export');
  try {
    await siemRonde(cfg);
    check('eerste ronde: start bij NU (geen geschiedenis), niets geschreven', !existsSync(bestand) && ontvangen.length === 0 && (await sys.query('SELECT count(*) FROM app.siem_export')).rows[0].count === '2');
    await auditToevoegen({ ownerId: eig, actorId: eig, action: 'siem.export.een', details: { password: 'GEHEIM6', x: 1 } });
    await auditToevoegen({ ownerId: eig, actorId: eig, action: 'siem.export.twee', details: {} });
    const r1 = await siemRonde(cfg);
    const lijnen = readFileSync(bestand, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    check('bestand: NDJSON, nieuwe regels, zonder geheimen', r1.bestand === 2 && lijnen.map((l) => l.event.action).join() === 'siem.export.een,siem.export.twee' && !/GEHEIM/.test(readFileSync(bestand, 'utf8')));
    const waarden = ontvangen.flatMap((p) => p.streams.flatMap((s: any) => s.values));
    check('Loki: push met labels app/bron/categorie en tijd in ns', r1.loki === 2 && waarden.length === 2 && ontvangen[0].streams[0].stream.app === 'mijn-ruimte' && /^\d{19}$/.test(waarden[0][0]));
    lokiStatus = 500;
    await auditToevoegen({ ownerId: eig, actorId: eig, action: 'siem.export.drie', details: {} });
    const r2 = await siemRonde(cfg);
    const st = await siemStand(cfg);
    check('Loki weg: fout bewaard, cursor niet verder; bestand gaat gewoon door', typeof r2.loki === 'string' && r2.bestand === 1 && st.loki.fouten === 1 && /HTTP 500/.test(String(st.loki.laatsteFout)) && st.loki.achterstand === 1 && st.bestand.achterstand === 0);
    lokiStatus = 204;
    const r3 = await siemRonde(cfg);
    check('Loki terug: dezelfde regel alsnog, bestand niet dubbel', r3.loki === 1 && r3.bestand === 0 && readFileSync(bestand, 'utf8').trim().split('\n').length === 3 && (await siemStand(cfg)).loki.fouten === 0);
    check('stand: aan, bestemmingen, geen inhoud', st.aan && st.bestand.ingesteld && st.loki.ingesteld && !JSON.stringify(st).includes('siem.export'));
    const app = await getPool('app').query('SELECT * FROM app.siem_export').then(() => 'gelezen', (e) => String(e.code));
    check('app-rol kan de exportstand niet lezen', app === '42501', app);
    check('uit: geen ronde', JSON.stringify(await siemRonde(siemConfig({}))) === '{}');
  } catch (e) {
    check('onverwachte fout', false, String((e as Error)?.stack || e));
  } finally {
    loki.close();
    await sys.query('DELETE FROM app.siem_export').catch(() => undefined);
    for (const r of voor) await sys.query('INSERT INTO app.siem_export (bestemming, laatste_id, geexporteerd) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [r.bestemming, r.laatste_id, r.geexporteerd]).catch(() => undefined);
  }
  return einde();
}
