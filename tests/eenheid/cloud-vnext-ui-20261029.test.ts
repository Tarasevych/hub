// CLOUD vNEXT — UI «Огляд + Мої файли» (29.10.2026, uitvoerder B). Bestandsgerichte controles (geen DOM, geen DB):
//   1. Geen window.prompt/confirm/alert in de nieuwe onderdelen — bevestigingen gaan via de Laag.
//   2. De Laag is een echte dialoog: role=dialog, aria-modal, Esc, focus op [data-cvn-eerste], portaal naar <body>.
//   3. Het aangeplakte css-deel (vanaf «uitvoerder B») gebruikt geen hex-kleuren en geen position:fixed; in het hele
//      bestand blijven precies de twee geregistreerde fixed-elementen (.cvn-laag, .cvn-onderbalk) over.
//   4. Bestanden: sleepvlak (onDrop + dataTransfer), <input type='file' multiple>, verplaatsen bij neerzetten,
//      sessionstorage-overdrachten (cvn-open, cvn-ws-filter), paginering «Показати ще», eerlijke NOG_NIET_GEBOUWD-melding.
//   5. UploadBeheer: uploadBegin → uploadStuk → uploadKlaar met sha256Hex en naarB64, afbreken via uploadAfbreken.
//   6. De afgesproken data-cvn-*-haken staan erin; alle teksten lopen via tr( (uk/nl).
//   7. Vastleggen praat met de oude capture-route met de geverifieerde veldnamen (kind, fileName, mimeType, fileData);
//      Werkruimtes maakt aan via /api/owner/cloud/workspaces/create met dienst-envelop.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checker } from './hulp/nep-google';

const lees = (f: string) => readFileSync(join(process.cwd(), f), 'utf8');

export async function main(): Promise<number> {
  const { check, einde } = checker('cloud-vnext-ui-20261029');

  const MIJN_TSX = [
    'src/cloud-vnext/Laag.tsx', 'src/cloud-vnext/BestandKaart.tsx', 'src/cloud-vnext/DetailPaneel.tsx',
    'src/cloud-vnext/UploadBeheer.tsx', 'src/cloud-vnext/MapKiezer.tsx',
    'src/cloud-vnext/onderdelen/Overzicht.tsx', 'src/cloud-vnext/onderdelen/Bestanden.tsx',
    'src/cloud-vnext/onderdelen/Recent.tsx', 'src/cloud-vnext/onderdelen/Werkruimtes.tsx',
    'src/cloud-vnext/onderdelen/Vastleggen.tsx', 'src/cloud-vnext/onderdelen/PostvakIn.tsx',
  ];
  const inhoud = new Map(MIJN_TSX.map((f) => [f, lees(f)]));

  // ---- 1. nooit browser-popups: bevestigen en benoemen gebeurt in de Laag
  for (const [f, t] of inhoud) {
    check(`${f}: geen window.prompt/confirm/alert`, !/\b(?:window\s*\.\s*)?(?:prompt|confirm|alert)\s*\(/.test(t));
  }

  // ---- 2. de Laag is een echte dialoog
  const laag = inhoud.get('src/cloud-vnext/Laag.tsx') || '';
  check('Laag: role=dialog + aria-modal', laag.includes("role='dialog'") && laag.includes("aria-modal='true'"));
  check('Laag: Esc sluit (venstervanger + lokale toets)', laag.includes("'Escape'") && laag.includes('keydown'));
  check('Laag: focus eerst op [data-cvn-eerste]', laag.includes('data-cvn-eerste'));
  check('Laag: portaal naar document.body met cvn-laag-klassen', laag.includes('createPortal') && laag.includes('cvn-laag-vak') && laag.includes('document.body'));
  check('Laag: Tab blijft binnen (focusval)', laag.includes("e.key !== 'Tab'") || laag.includes("e.key === 'Tab'"));

  // ---- 3. css: het deel van uitvoerder B zonder hex en zonder fixed; het hele bestand houdt precies 2 fixed
  const css = lees('src/cloud-vnext/cloud-vnext.css');
  const markering = css.indexOf('uitvoerder B');
  check('css: het blok van uitvoerder B is aangeplakt (markering aanwezig)', markering > 0);
  const mijnCss = markering > 0 ? css.slice(markering) : '';
  check('css (deel B): geen hex-kleuren — alleen ontwerp-tokens', !/#[0-9a-fA-F]{3,8}\b/.test(mijnCss) && mijnCss.includes('var(--accent'));
  check('css (deel B): geen position:fixed', !/position\s*:\s*fixed/.test(mijnCss));
  check('css (geheel): precies 2 geregistreerde fixed-elementen (.cvn-laag, .cvn-onderbalk)', (css.match(/position\s*:\s*fixed/g) || []).length === 2);
  check('css (deel B): contextmenu is absoluut gepositioneerd binnen .cvn-bestanden', /\.cvn-ctx\s*\{[^}]*position:\s*absolute/.test(mijnCss) && /\.cvn-bestanden\s*\{[^}]*position:\s*relative/.test(mijnCss));

  // ---- 4. Bestanden: sleepvlak, upload-invoer, verplaatsen, overdrachten, paginering, eerlijke bouwmelding
  const best = inhoud.get('src/cloud-vnext/onderdelen/Bestanden.tsx') || '';
  check('Bestanden: sleepvlak met onDrop + dataTransfer.files → uploadwachtrij', best.includes('onDrop') && best.includes('dataTransfer.files') && best.includes('voegToe'));
  check('Bestanden: <input type=file multiple> voor de uploadknop', /type='file'\s+multiple/.test(best));
  check('Bestanden: kaart-drop op map/kruimel → bestandVerplaats', best.includes('bestandVerplaats') && best.includes("getData('text/plain')"));
  check('Bestanden: leest de overdrachten cvn-open en cvn-ws-filter', best.includes("'cvn-open'") && best.includes("'cvn-ws-filter'"));
  check('Bestanden: paginering via volgende («Показати ще»)', best.includes('volgende') && best.includes('Показати ще'));
  check('Bestanden: eerlijke melding zolang de server 501 NOG_NIET_GEBOUWD geeft', best.includes('isBouwFout') && best.includes('ще збирається'));
  check('Bestanden: prullenbak met herstel en definitief (bevestiging in een Laag)', best.includes('herstel') && best.includes('definitiefWeg') && best.includes("t: 'definitief'"));
  check('Bestanden: meerkeuze met Shift-reeks', best.includes('metShift') && best.includes('anker'));
  check('Bestanden: raster én lijst met dezelfde gegevens', best.includes('BestandKaart') && best.includes('BestandRij') && best.includes('cvn-tabel'));

  // ---- 5. het overdrachtenpaneel + het stukkenprotocol (sinds 29.10 in overdracht-beheer.ts, buiten React)
  const up = inhoud.get('src/cloud-vnext/UploadBeheer.tsx') || '';
  const beheer = lees('src/cloud-vnext/overdracht-beheer.ts');
  for (const naam of ['begin', 'stuk', 'status', 'zoek', 'klaar', 'afbreken']) {
    check(`overdracht-beheer: vervoer kent ${naam}`, new RegExp(`\\b${naam}\\s*[:(]`).test(beheer));
  }
  check('overdracht-beheer: stromende sha256 zonder het hele bestand in RAM', beheer.includes('Sha256Stroom') && beheer.includes('shaVanBron'));
  check('UploadBeheer: voortgang per rij (progressbar)', up.includes("role='progressbar'") && up.includes('klaarBytes'));
  check('overdracht-beheer: respecteert stukMax van de server', beheer.includes('b.stukMax') && beheer.includes('stukMaxBytes'));
  check('UploadBeheer: pauze/verder/stop en de hervat-rij', up.includes('data-cvn-ov-pauze') && up.includes('data-cvn-ov-verder') && up.includes('data-cvn-ov-stop') && up.includes('data-cvn-ov-hervat'));

  // ---- 6. de afgesproken data-cvn-haken en tweetaligheid
  const alles = [...inhoud.values()].join('\n');
  for (const haak of ['data-cvn-kaart', 'data-cvn-map', 'data-cvn-crumb', 'data-cvn-nieuwe-map', 'data-cvn-upload', 'data-cvn-zoek',
    'data-cvn-soort', 'data-cvn-tag', 'data-cvn-selectie', 'data-cvn-acties', 'data-cvn-ctx', 'data-cvn-detail', 'data-cvn-prullenbak',
    'data-cvn-herstel', 'data-cvn-definitief', 'data-cvn-versies', 'data-cvn-favoriet', 'data-cvn-meer', 'data-cvn-ws-filter', 'data-cvn-leeg']) {
    check(`haak ${haak} aanwezig`, alles.includes(haak));
  }
  for (const [f, t] of inhoud) {
    check(`${f}: teksten lopen via tr( (uk/nl)`, /\btr\(/.test(t));
  }
  check('DetailPaneel: voorbeeld via de bestaande motor (MailBijlageVoorbeeld), lui geladen', (inhoud.get('src/cloud-vnext/DetailPaneel.tsx') || '').includes("import('../MailBijlageVoorbeeld')"));
  check('DetailPaneel: eerlijk over TE_GROOT (geen voorbeeld boven de downloadgrens)', (inhoud.get('src/cloud-vnext/DetailPaneel.tsx') || '').includes('TE_GROOT') && (inhoud.get('src/cloud-vnext/DetailPaneel.tsx') || '').includes('downloadMaxBytes'));

  // ---- 7. de oude routes met geverifieerde veldnamen
  const vast = inhoud.get('src/cloud-vnext/onderdelen/Vastleggen.tsx') || '';
  check('Vastleggen: capture met kind/fileName/mimeType/fileData en 6MB-grens', vast.includes('cloudClient.capture') && vast.includes('fileName') && vast.includes('mimeType') && vast.includes('fileData') && vast.includes('6 * 1024 * 1024'));
  const ws = inhoud.get('src/cloud-vnext/onderdelen/Werkruimtes.tsx') || '';
  check('Werkruimtes: maakt aan via /api/owner/cloud/workspaces/create met dienst-envelop', ws.includes('/api/owner/cloud/workspaces/create') && ws.includes('sessieDienst') && ws.includes('ecosystemTabContext') && ws.includes('sourceOrigin'));
  check('Werkruimtes: raakt cloud-client.ts niet aan (eigen envelop, api uit platform/client)', ws.includes("from '../../platform/client'"));

  return einde();
}
