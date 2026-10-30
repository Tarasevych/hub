// Cloud vNext — EERLIJKHEID VAN DE INTEGRATIECATALOGUS (29.10.2026). Geen databank nodig: alles is catalogus + brontekst.
// Draaien: node scripts/eenheidstests.mjs cloud-vnext-catalogus
//  A. 'sleutels-nodig' heeft ≥ 2 vereiste omgevingsnamen en ELKE naam wordt echt door servercode gelezen (verbatim in de
//     M4/M8/M10-modules, of als prefix+'_CLIENT_ID'/'_CLIENT_SECRET'-samenstelling in cloud-verbinding-m4-config.ts) —
//     de kaart belooft dus nooit een omgevingsvariabele die nergens bestaat.
//  B. 'gepland' en 'niet-mogelijk' hebben GEEN vereist-lijst (geen nep-checklist), een detail in beide talen (> 40 tekens)
//     en, als er een omweg staat, die ook in beide talen.
//  C. Alleen {google-drive, google-photos, gmail-bijlagen} heten 'werkt'; alleen google-drive heet 'lezen-en-schrijven'.
//  D. De cloudbundel importeert niets uit src/merk (monogrammen, geen merkafbeeldingen) en bevat geen demonstratienamen of
//     verzonnen cijfers van de referentiebeelden (Olena/Kovalenko/mijnruimte.cloud/1.24 TB).
//  E. De route bestaat en is geregistreerd: 'POST /api/owner/cloud/vnext/integraties' in backend/cloud-vnext-integraties.ts,
//     gespreid in backend/index.ts; de stagingvoorwaarde is dezelfde letterlijke controle als in cloud-verbinding-m4-routes.ts.
//  F. INDEX_BRONNEN (backend/zoek/bronnen.ts) kent 'cloud' en 'drive' — de zoekregels op de pagina zijn dus geen belofte.
//  G. Eigen afspraken van dit onderdeel: Integraties.tsx exporteert SleutelsChecklist; Bron.tsx importeert geen ../Laag of
//     ./Laag (de laag van een ander onderdeel); de eigen css gebruikt alleen cvi-klassen en geen position:fixed.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { CLOUD_VNEXT_AANBIEDERS } from '../../shared/cloud-vnext-model';
import { checker } from './hulp/nep-google';

const lees = (f: string) => readFileSync(f, 'utf8');
const bestandenIn = (map: string): string[] => readdirSync(map).flatMap((naam) => {
  const pad = join(map, naam);
  return statSync(pad).isDirectory() ? bestandenIn(pad) : [pad];
});

export async function main(): Promise<number> {
  const { check, einde } = checker('cloud-vnext-catalogus');

  // ---- A: vereiste omgevingsnamen bestaan echt in servercode
  const m4Bronnen = ['backend/cloud-verbinding-m4.ts', 'backend/cloud-verbinding-m4-config.ts', 'backend/cloud-verbinding-m4-routes.ts', 'backend/cloud-verbinding-m4-providers.ts', 'backend/cloud-verbinding-m4-pg.ts', 'backend/cloud-verbinding-m4-token.ts', 'backend/cloud-m8-routes.ts', 'backend/cloud-m10-runtime.ts'].map(lees).join('\n');
  const envBestaat = (naam: string): boolean => {
    if (m4Bronnen.includes(naam)) return true;
    const deel = /^(CLOUD_[A-Z]+)(_CLIENT_(?:ID|SECRET))$/.exec(naam);
    return Boolean(deel && m4Bronnen.includes(`'${deel[1]}'`) && m4Bronnen.includes(`'${deel[2]}'`));
  };
  for (const a of CLOUD_VNEXT_AANBIEDERS.filter((x) => x.stand === 'sleutels-nodig')) {
    check(`A ${a.id}: vereist ≥ 2`, (a.vereist?.length || 0) >= 2, `kreeg ${a.vereist?.length || 0}`);
    for (const naam of a.vereist || []) check(`A ${a.id}: ${naam} wordt door servercode gelezen`, envBestaat(naam));
  }

  // ---- B: gepland / niet-mogelijk — geen checklist, wel eerlijk detail (en omweg) in beide talen
  for (const a of CLOUD_VNEXT_AANBIEDERS.filter((x) => x.stand === 'gepland' || x.stand === 'niet-mogelijk')) {
    check(`B ${a.id}: geen vereist-lijst`, !a.vereist);
    check(`B ${a.id}: detail uk+nl > 40 tekens`, a.detail[0].length > 40 && a.detail[1].length > 40, `${a.detail[0].length}/${a.detail[1].length}`);
    if (a.omweg) check(`B ${a.id}: omweg in beide talen`, a.omweg[0].length > 10 && a.omweg[1].length > 10);
    check(`B ${a.id}: geen levende controle beloofd`, !a.levend);
  }
  for (const a of CLOUD_VNEXT_AANBIEDERS) {
    check(`B ${a.id}: uitleg uk+nl`, a.uitleg[0].length > 0 && a.uitleg[1].length > 0);
    check(`B ${a.id}: monogram 1..4 tekens, site https`, a.monogram.length >= 1 && a.monogram.length <= 4 && a.site.startsWith('https://'));
  }

  // ---- C: wat 'werkt' heet en wat mag schrijven
  const werkt = CLOUD_VNEXT_AANBIEDERS.filter((a) => a.stand === 'werkt').map((a) => a.id).sort().join(',');
  check('C werkt = gmail-bijlagen,google-drive,google-photos', werkt === 'gmail-bijlagen,google-drive,google-photos', werkt);
  const schrijft = CLOUD_VNEXT_AANBIEDERS.filter((a) => a.richting === 'lezen-en-schrijven').map((a) => a.id).join(',');
  check('C lezen-en-schrijven alleen google-drive', schrijft === 'google-drive', schrijft);
  check('C elke werkt-kaart heeft een levende controle', CLOUD_VNEXT_AANBIEDERS.filter((a) => a.stand === 'werkt').every((a) => Boolean(a.levend)));

  // ---- D: geen merkimport en geen demonstratiegegevens in de cloudbundel
  const bundel = bestandenIn('src/cloud-vnext').filter((f) => /\.(tsx?|css)$/.test(f));
  check('D bundel gevonden (≥ 14 bestanden)', bundel.length >= 14, String(bundel.length));
  let merkImport = '', demo = '';
  for (const f of bundel) {
    const inhoud = lees(f);
    if (/from\s+['"][^'"]*\/merk\//.test(inhoud) || /from\s+['"][^'"]*\/merk['"]/.test(inhoud)) merkImport = f;
    if (/Olena|Kovalenko|mijnruimte\.cloud|1[.,]24\s?[TТ][BБ]/i.test(inhoud)) demo = f;
  }
  check('D geen import uit src/merk in src/cloud-vnext/**', !merkImport, merkImport);
  check('D geen demonstratienamen/-cijfers van de referentiebeelden', !demo, demo);

  // ---- E: route bestaat, is geregistreerd en gebruikt dezelfde stagingvoorwaarde als M4 zelf
  const routeBron = lees('backend/cloud-vnext-integraties.ts');
  check('E route POST /api/owner/cloud/vnext/integraties bestaat', routeBron.includes(`'POST /api/owner/cloud/vnext/integraties'`));
  check('E route is geen 501-geraamte meer', !routeBron.includes('NOG_NIET_GEBOUWD'));
  check('E route geeft google+photos+m4+zoekIndex terug', ['google', 'photos', 'm4', 'zoekIndex', 'stagingAan', 'sleutelsAanwezig'].every((sleutel) => routeBron.includes(sleutel)));
  const stagingControle = `process.env.CLOUD_M4_CONNECTIONS_STAGING === 'enabled'`;
  check('E stagingvoorwaarde is letterlijk dezelfde als in cloud-verbinding-m4-routes.ts', routeBron.includes(stagingControle) && lees('backend/cloud-verbinding-m4-routes.ts').replace(/\s/g, '').includes(stagingControle.replace(/\s/g, '')));
  check('E route is gespreid in backend/index.ts', /\.\.\.cloudVnextIntegratiesRoutes\(/.test(lees('backend/index.ts')));
  check('E route geeft nooit tokens terug (geen credential-velden in de uitvoer)', !/encrypted|refresh_token|accessToken|credentials/.test(routeBron));

  // ---- F: de zoekindex kent de cloudbronnen die de pagina noemt
  const bronnenRegel = /export const INDEX_BRONNEN[^=]*=\s*\[([^\]]*)\]/.exec(lees('backend/zoek/bronnen.ts'))?.[1] || '';
  check(`F INDEX_BRONNEN bevat 'cloud' en 'drive'`, bronnenRegel.includes(`'cloud'`) && bronnenRegel.includes(`'drive'`), bronnenRegel.trim());

  // ---- G: afspraken van dit onderdeel zelf
  const integratiesBron = lees('src/cloud-vnext/onderdelen/Integraties.tsx');
  check('G Integraties.tsx exporteert SleutelsChecklist', integratiesBron.includes('export function SleutelsChecklist'));
  check('G Integraties.tsx verzint geen koppelknop voor m4 (geen manager.start/OAuth-aanroep)', !/accounts\/start|integrations\/v1/.test(integratiesBron));
  const bronBron = lees('src/cloud-vnext/onderdelen/Bron.tsx');
  check('G Bron.tsx importeert geen laag van een ander onderdeel', !/from\s+['"]\.{1,2}\/(Laag|onderdelen\/Laag)['"]/.test(bronBron));
  check('G Bron.tsx gebruikt de bestaande leesroutes (driveBrowse/driveFile)', bronBron.includes('driveBrowse') && bronBron.includes('driveFile'));
  const css = lees('src/cloud-vnext/cloud-vnext-integraties.css');
  check('G css zonder position:fixed', !css.includes('position: fixed') && !css.includes('position:fixed'));
  const klassen = [...css.matchAll(/(^|[\s,}])\.([a-z-]+)/g)].map((m) => m[2]);
  const eigenKlas = (k: string) => k === 'cvi' || k.startsWith('cvi-') || k.startsWith('cvn-');
  check('G css-klassen beginnen met cvi (cvn-* alleen als bestaande bouwsteen)', klassen.every(eigenKlas), klassen.filter((k) => !eigenKlas(k)).join(','));
  check('G css zonder hex-kleuren (alleen tokens)', !/#[0-9a-f]{3,8}\b/i.test(css));

  return einde();
}
