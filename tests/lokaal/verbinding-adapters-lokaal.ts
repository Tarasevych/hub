// UI-013 fase 2 — ECHTE tests van de adapters tegen LOKALE servers (geen externe dienst, geen echte accounts).
// Vereist: WEBDAV_URL (bv. webdav-server of Nextcloud), S3_URL + S3_EMMER (bv. moto_server / MinIO), MQTT_POORT (bv. aedes / mosquitto),
// met gebruikers/wachtwoorden in de omgeving (testwaarden, geen geheimen). Uitvoeren: zie docs/integraties/ADAPTERS-LOKAAL-TESTEN.md.
import { webdavLijst } from '../../backend/verbinding-adapters/webdav';
import { s3Lijst } from '../../backend/verbinding-adapters/s3';
import { mqttControle } from '../../backend/verbinding-adapters/mqtt';

const e = process.env; let ok = 0, fout = 0;
const check = (naam: string, v: boolean, extra = '') => { if (v) ok++; else fout++; console.log(`${v ? 'OK  ' : 'FOUT'} ${naam}${extra ? ' — ' + extra : ''}`); };
const haal = (url: string, init: { method?: string; headers?: Record<string, string>; body?: string }) => fetch(url, init);

if (e.WEBDAV_URL) {
  const goed = await webdavLijst(haal, e.WEBDAV_URL, e.WEBDAV_GEBRUIKER || '', e.WEBDAV_WACHTWOORD || '', { toestaanHttp: true });
  check('WebDAV: PROPFIND met juiste gegevens geeft de maplijst', goed.ok && goed.waarde.items.some((i) => i.pad.endsWith('proef.txt')), JSON.stringify(goed).slice(0, 160));
  const slecht = await webdavLijst(haal, e.WEBDAV_URL, e.WEBDAV_GEBRUIKER || '', 'fout-wachtwoord', { toestaanHttp: true });
  check('WebDAV: verkeerd wachtwoord → WEBDAV_TOEGANG_GEWEIGERD', !slecht.ok && slecht.fout === 'WEBDAV_TOEGANG_GEWEIGERD', JSON.stringify(slecht));
  const weg = await webdavLijst(haal, 'http://127.0.0.1:1/', 'a', 'b', { toestaanHttp: true });
  check('WebDAV: onbereikbaar → WEBDAV_ONBEREIKBAAR', !weg.ok && weg.fout === 'WEBDAV_ONBEREIKBAAR');
}
if (e.S3_URL) {
  const sl = { toegangsId: e.S3_ID || '', geheim: e.S3_GEHEIM || '', regio: 'us-east-1' };
  const goed = await s3Lijst(haal, e.S3_URL, e.S3_EMMER || '', sl, { toestaanHttp: true });
  check('S3: ListObjectsV2 geeft het proefobject', goed.ok && goed.waarde.objecten.some((o) => o.sleutel === 'proef.txt'), JSON.stringify(goed).slice(0, 160));
  const geen = await s3Lijst(haal, e.S3_URL, 'bestaat-niet-ui013', sl, { toestaanHttp: true });
  check('S3: onbekende emmer → S3_EMMER_NIET_GEVONDEN', !geen.ok && geen.fout === 'S3_EMMER_NIET_GEVONDEN', JSON.stringify(geen));
}
if (e.MQTT_POORT) {
  const p = Number(e.MQTT_POORT);
  const goed = await mqttControle('127.0.0.1', p, { gebruiker: e.MQTT_GEBRUIKER, wachtwoord: e.MQTT_WACHTWOORD });
  check('MQTT: CONNECT met juiste gegevens → CONNACK 0', goed.ok, JSON.stringify(goed));
  const slecht = await mqttControle('127.0.0.1', p, { gebruiker: e.MQTT_GEBRUIKER, wachtwoord: 'fout' });
  check('MQTT: verkeerd wachtwoord → MQTT_TOEGANG_GEWEIGERD', !slecht.ok && slecht.fout === 'MQTT_TOEGANG_GEWEIGERD', JSON.stringify(slecht));
  const weg = await mqttControle('127.0.0.1', 1, { timeoutMs: 2000 });
  check('MQTT: geen broker → MQTT_ONBEREIKBAAR', !weg.ok && weg.fout === 'MQTT_ONBEREIKBAAR');
}
console.log(`${ok}/${ok + fout} geslaagd (verbinding-adapters-lokaal)`);
process.exit(fout ? 1 : 0);
