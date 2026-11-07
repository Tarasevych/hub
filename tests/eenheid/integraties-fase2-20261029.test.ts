// UI-013 fase 2: adapters (SigV4-referentievector van AWS, WebDAV-multistatus, MQTT-CONNECT-bytes), wizardlogica, tempo,
// registerrijen met adapter, en cloud-vnext → register. Echte netwerktests staan apart in tests/lokaal/verbinding-adapters-lokaal.ts.
import { readFileSync } from 'node:fs';
import { checker } from './hulp/nep-google';
import { s3Onderteken } from '../../backend/verbinding-adapters/s3';
import { ontleedMultistatus } from '../../backend/verbinding-adapters/webdav';
import { mqttConnectPakket } from '../../backend/verbinding-adapters/mqtt';
import { alleenHttps } from '../../backend/verbinding-adapters/gemeen';
import { adapterTempo, PERIODIEK_MIN_MS } from '../../backend/beheer-integraties';
import { INTEGRATIES } from '../../shared/integraties-catalogus';
import { REGISTER, officieelTekst, registerVan } from '../../shared/integraties-register';
import { STAPPEN, autorisatieSoort, wizardKan, volgende, vorige } from '../../src/integraties/wizard-v2-logica';
import { CLOUD_NAAR_REGISTER, registerGroep } from '../../src/cloud-vnext/register-koppeling';
import { CLOUD_VNEXT_AANBIEDERS } from '../../shared/cloud-vnext-model';

export async function main(): Promise<number> {
  const { check, einde } = checker('integraties-fase2');
  const h = s3Onderteken(new URL('https://examplebucket.s3.amazonaws.com/?max-keys=2&prefix=J'), { toegangsId: ['AKIA', 'IOSFODNN7EXAMPLE'].join(''), geheim: ['wJalrXUtnFEMI', 'K7MDENG', 'bPxRfiCYEXAMPLEKEY'].join('/'), regio: 'us-east-1' }, new Date('2013-05-24T00:00:00Z'));
  const auth = Object.entries(h).find(([k]) => k.toLowerCase() === 'authorization')?.[1] ?? '';
  check('SigV4: AWS-referentievector', auth.endsWith('Signature=34b48302e7b5fa45bde8084f4b7868a86f0a534bc59db6670ed5711ef69dc6f7'));
  const xml = `<?xml version="1.0"?><d:multistatus xmlns:d="DAV:"><d:response><d:href>/map/</d:href><d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop></d:propstat></d:response><d:response><d:href>/map/a.txt</d:href><d:propstat><d:prop><d:resourcetype/><d:getcontentlength>5</d:getcontentlength></d:prop></d:propstat></d:response></d:multistatus>`;
  const it = ontleedMultistatus(xml);
  check('WebDAV: multistatus → map + bestand met grootte', it.length === 2 && it[0].map && !it[1].map && it[1].grootte === 5);
  const p = mqttConnectPakket('mr', 'u', 'w');
  check('MQTT: CONNECT 3.1.1 (type 0x10, «MQTT», niveau 4, gebruiker+wachtwoord-vlag)', p[0] === 0x10 && p.subarray(4, 8).toString() === 'MQTT' && p[8] === 4 && (p[9] & 0xc0) === 0xc0);
  check('alleen https tenzij uitdrukkelijk toegestaan', alleenHttps('http://x.test') === null && alleenHttps('https://x.test') !== null);
  let n = 0; for (let i = 0; i < 12; i++) if (adapterTempo('proef-tempo', 1000)) n++;
  check('tempo: hoogstens 10 adaptercontroles per minuut', n === 10 && adapterTempo('proef-tempo', 1000 + 61_000));
  check('periodiek hoogstens elke 30 min', PERIODIEK_MIN_MS === 30 * 60_000);
  check('wizard heeft precies zes stappen', STAPPEN.length === 6 && volgende('kies') === 'wijze' && vorige('kies') === 'kies' && volgende('klaar') === 'klaar');
  const nc = INTEGRATIES.find((i) => i.id === 'nextcloud')!;
  check('nextcloud: adapter webdav, wizard kan, NIET werkend', registerVan('nextcloud')?.adapter === 'webdav' && autorisatieSoort(nc) === 'adapter' && wizardKan(nc, null) && registerVan('nextcloud')?.uitvoering !== 'werkend');
  check('s3 adapter s3, mqtt adapter mqtt, geen van beide werkend', registerVan('s3')?.adapter === 's3' && registerVan('mqtt')?.adapter === 'mqtt' && registerVan('s3')?.uitvoering !== 'werkend' && registerVan('mqtt')?.uitvoering !== 'werkend');
  check('outlook blijft eerlijk: geen adapter, noemt sleutels van de eigenaar', !registerVan('outlook-mail')?.adapter && /ключ/.test(registerVan('outlook-mail')?.nogTeDoen[0] ?? ''));
  check('register nog steeds één rij per catalogusitem', REGISTER.length === INTEGRATIES.length);
  check('elke themadienst van de strook heeft registerrijen', (['mail', 'cloud', 'foto', 'agenda', 'ai', 'huis', 'github'] as const).every((d) => REGISTER.some((r) => r.doelDienst === d)));
  check('cloud-vnext: elke aanbieder staat in de koppeltabel', CLOUD_VNEXT_AANBIEDERS.every((a) => a.id in CLOUD_NAAR_REGISTER));
  check('cloud-vnext: gekoppelde ids bestaan in het register', Object.values(CLOUD_NAAR_REGISTER).every((v) => v === null || !!registerVan(v)) && registerGroep('nextcloud')?.adapter === 'webdav');
  const be = readFileSync('backend/beheer-integraties.ts', 'utf8');
  check('routes adapter-controle en controleer-alle bestaan', be.includes('/integraties/adapter-controle') && be.includes('/integraties/controleer-alle'));
  const ncRij = registerVan('nextcloud');
  check('koppelwijze tweetalig: Nextcloud uk zonder «app-wachtwoord», nl ongewijzigd', officieelTekst(ncRij, 'uk') === 'WebDAV + Login Flow v2 (пароль застосунку)' && officieelTekst(ncRij, 'nl') === 'WebDAV + Login Flow v2 (app-wachtwoord)');
  check('koppelwijze uk: geen Nederlandse woorden meer (met/of/wachtwoord/sleutel/gebruiker/lokale/via)', REGISTER.every((r) => !/\b(met|of|wachtwoord|app-wachtwoord|sleutel|toegangssleutel|gebruiker|lokale|Via|publicatie)\b/.test(officieelTekst(r, 'uk'))), REGISTER.map((r) => officieelTekst(r, 'uk')).filter((t) => /wachtwoord|sleutel| met | of /.test(t)).join(' | '));
  return einde();
}
