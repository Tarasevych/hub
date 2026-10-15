import { writeFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import RechtenKiezer from '../src/connector-v2/RechtenKiezer';
import { STANDAARD } from '../shared/connector-v2/rechten';

const tr = (uk: string) => uk;
const waarde = STANDAARD();
const dicht = ['gebruiker:mail', 'gebruiker:agenda', 'gebruiker:bestanden', 'gebruiker:bord', 'gebruiker:ruimte', 'gebruiker:apparaten', 'gebruiker:apps', 'gebruiker:browser', 'gebruiker:github', 'gebruiker:media', 'gebruiker:betalingen'];

const overzicht = renderToStaticMarkup(
  <RechtenKiezer tr={tr} agent='grok' kanten={['gebruiker']} waarde={waarde} onChange={() => undefined}
    startOpen={['cf.figma_whoami:gebruiker']} startDicht={dicht} />,
);
const bestand = renderToStaticMarkup(
  <RechtenKiezer tr={tr} agent='grok' kanten={['gebruiker']} waarde={waarde} onChange={() => undefined}
    startZoek='maken_schijf' startOpen={['cf.legacy_drive_create:gebruiker']} />,
);

const pagina = (body: string) => `<!doctype html><html lang="uk"><head><meta charset="utf-8"><title>Дозволи</title>
<link rel="stylesheet" href="file:///tmp/wt-connector-functies/src/connector-v2/connector-v2.css">
<style>body{margin:0;background:#f6f8fa;color:#1f2328;font-family:system-ui,sans-serif;--panel:#fff;--surface:#f6f8fa;--line:#d0d7de;--text:#1f2328;--muted:#656d76;--accent:#0969da} .blad{max-width:1100px;margin:0 auto;padding:16px}</style>
</head><body><div class="blad">${body}</div></body></html>`;

writeFileSync('/tmp/preview-cf/overzicht.html', pagina(overzicht));
writeFileSync('/tmp/preview-cf/bestand.html', pagina(bestand));
const verboden = /у розробці|in ontwikkeling|in-ontwikkeling|in development/i;
if (verboden.test(overzicht) || verboden.test(bestand)) throw new Error('ontwikkelstaat in de voorvertoning');
if (!overzicht.includes('wie_grok_ai_figma_tarasevych_com_gebruiker')) throw new Error('slug ontbreekt');
if (!overzicht.includes('aria-expanded="false"')) throw new Error('geen dichte groep');
if (!bestand.includes('maken_schijf_grok_cloud_gdrive_tarasevych_com_gebruiker')) throw new Error('bestandsslug ontbreekt');
