// VAARD-001: metagegevens eerst, de volledige vaardigheid alleen op verzoek.
// Dit hulpmiddel kiest instructies; het verleent geen toegangsrechten.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BESTAND = fileURLToPath(import.meta.url);
const WORTEL = path.resolve(path.dirname(BESTAND), '../..');
const CATALOGUS = path.join(WORTEL, 'scripts/vaardigheden/catalogus.json');
const PAD_PATROON = /^\.agents\/skills\/[a-z0-9-]+\/SKILL\.md$/;

const schoon = (waarde) => String(waarde ?? '')
  .normalize('NFKC').toLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

export function laadCatalogus(bestand = CATALOGUS) {
  const gegevens = JSON.parse(readFileSync(bestand, 'utf8'));
  if (gegevens?.schema !== 1 || !Array.isArray(gegevens.vaardigheden)) {
    throw new Error('VAARD_CATALOGUS_ONGELDIG');
  }
  const namen = new Set();
  for (const vaardigheid of gegevens.vaardigheden) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(vaardigheid.naam ?? '') ||
        vaardigheid.pad !== `.agents/skills/${vaardigheid.naam}/SKILL.md` ||
        !PAD_PATROON.test(vaardigheid.pad) ||
        !Array.isArray(vaardigheid.termen?.uk) ||
        !Array.isArray(vaardigheid.termen?.nl) ||
        !Array.isArray(vaardigheid.vereisteHulpmiddelen) ||
        namen.has(vaardigheid.naam)) {
      throw new Error('VAARD_CATALOGUS_ONGELDIG');
    }
    namen.add(vaardigheid.naam);
  }
  return gegevens;
}

function punten(vraag, termen) {
  const tekst = ` ${schoon(vraag)} `;
  if (!tekst.trim()) return 0;
  const woorden = schoon(vraag).split(' ');
  let totaal = 0;
  for (const waarde of termen) {
    const term = schoon(waarde);
    if (!term) continue;
    if (tekst.includes(` ${term} `)) {
      totaal += term.includes(' ') ? 5 : 3;
    } else if (!term.includes(' ') && term.length >= 5 &&
        woorden.some((woord) => woord.startsWith(term))) {
      totaal += 2;
    }
  }
  return totaal;
}

/**
 * zichtbareHulpmiddelen komt later uitsluitend uit de bestaande MCP-toegangspoort.
 * Een plaatselijke aanroep met deze optie is een proef, nooit een machtiging.
 */
export function kiesVaardigheden(vraag, opties = {}) {
  if (typeof vraag !== 'string' || !vraag.trim()) return [];
  const catalogus = opties.catalogus ?? laadCatalogus();
  const zichtbaar = Array.isArray(opties.zichtbareHulpmiddelen)
    ? new Set(opties.zichtbareHulpmiddelen) : null;
  const maximum = Number.isInteger(opties.maximum)
    ? Math.max(1, Math.min(10, opties.maximum)) : 3;
  return catalogus.vaardigheden.map((vaardigheid) => {
    const trefwoorden = [...vaardigheid.termen.uk, ...vaardigheid.termen.nl];
    const score = punten(vraag, trefwoorden);
    const ontbrekend = zichtbaar === null ? [] :
      vaardigheid.vereisteHulpmiddelen.filter((naam) => !zichtbaar.has(naam));
    return {
      naam: vaardigheid.naam,
      pad: vaardigheid.pad,
      samenvatting: vaardigheid.samenvatting,
      score,
      aansluiting: zichtbaar === null ? 'onbekend' :
        ontbrekend.length ? 'hulpmiddelen_ontbreken' : 'hulpmiddelen_aanwezig',
      ontbrekendeHulpmiddelen: ontbrekend,
    };
  }).filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.naam.localeCompare(b.naam, 'nl'))
    .slice(0, maximum);
}

export function leesVaardigheid(naam, catalogus = laadCatalogus()) {
  const vaardigheid = catalogus.vaardigheden.find((item) => item.naam === naam);
  if (!vaardigheid || !PAD_PATROON.test(vaardigheid.pad)) {
    throw new Error('VAARD_NIET_GEVONDEN');
  }
  const inhoud = readFileSync(path.join(WORTEL, vaardigheid.pad), 'utf8');
  if (Buffer.byteLength(inhoud, 'utf8') > 96000 ||
      !inhoud.startsWith(`---\nname: ${naam}\n`) ||
      !/^---\nname: [^\n]+\ndescription: [^\n]+\n---\n/.test(inhoud)) {
    throw new Error('VAARD_INHOUD_ONGELDIG');
  }
  return inhoud;
}

if (process.argv[1] && path.resolve(process.argv[1]) === BESTAND) {
  const invoer = process.argv.slice(2);
  const lees = invoer.includes('--lees');
  const middelen = invoer.find((deel) => deel.startsWith('--hulpmiddelen='));
  const zichtbareHulpmiddelen = middelen
    ? middelen.slice('--hulpmiddelen='.length).split(',').filter(Boolean)
    : null;
  const vraag = invoer.filter((deel) => !deel.startsWith('--')).join(' ').trim();
  const gekozen = kiesVaardigheden(vraag, { zichtbareHulpmiddelen });
  const antwoord = { vraag, voorstellen: gekozen };
  if (lees && gekozen.length) {
    antwoord.inhoud = leesVaardigheid(gekozen[0].naam);
  }
  process.stdout.write(JSON.stringify(antwoord, null, 2) + '\n');
}
