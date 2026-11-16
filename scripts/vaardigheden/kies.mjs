// VAARD-001 / VAARD-002: metagegevens eerst, de volledige vaardigheid alleen op verzoek.
// Dit hulpmiddel kiest instructies; het verleent geen toegangsrechten.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BESTAND = fileURLToPath(import.meta.url);
const WORTEL = path.resolve(path.dirname(BESTAND), '../..');
const CATALOGUS = path.join(WORTEL, 'scripts/vaardigheden/catalogus.json');
const NAAM_PATROON = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PAD_PATROON = /^\.agents\/skills\/[a-z0-9-]+\/SKILL\.md$/;
const VOORBEELD_PATROON = /^\.agents\/skills\/[a-z0-9-]+\/VOORBEELD\.uk\.md$/;
const SEMVER_PATROON = /^\d+\.\d+\.\d+$/;
const HULPMIDDEL_PATROON = /^[a-z0-9][a-z0-9_.-]{1,79}(?::(?:gebruiker|beheer))?$/;
const CYRILLISCH = /[\u0400-\u04FF]/;
const LATIJNS = /[A-Za-z]/;

const schoon = (waarde) => String(waarde ?? '')
  .normalize('NFKC').toLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

export function heeftVereistHulpmiddel(zichtbaar, vereist) {
  if (zichtbaar.has(vereist)) return true;
  if (vereist.includes(':')) return false;
  const prefix = `${vereist}:`;
  for (const sleutel of zichtbaar) {
    if (sleutel.startsWith(prefix)) return true;
  }
  return false;
}

export function laadCatalogus(bestand = CATALOGUS) {
  const gegevens = JSON.parse(readFileSync(bestand, 'utf8'));
  if (gegevens?.schema !== 1 || !Array.isArray(gegevens.vaardigheden)) {
    throw new Error('VAARD_CATALOGUS_ONGELDIG');
  }
  const perNaam = new Map();
  for (const vaardigheid of gegevens.vaardigheden) {
    if (!NAAM_PATROON.test(vaardigheid.naam ?? '') ||
        vaardigheid.pad !== `.agents/skills/${vaardigheid.naam}/SKILL.md` ||
        !PAD_PATROON.test(vaardigheid.pad) ||
        typeof vaardigheid.versie !== 'string' ||
        !SEMVER_PATROON.test(vaardigheid.versie) ||
        !Array.isArray(vaardigheid.afhankelijkheden) ||
        !vaardigheid.afhankelijkheden.every((dep) => typeof dep === 'string' && NAAM_PATROON.test(dep)) ||
        typeof vaardigheid.samenvatting?.uk !== 'string' ||
        !vaardigheid.samenvatting.uk.trim() ||
        typeof vaardigheid.samenvatting?.nl !== 'string' ||
        !vaardigheid.samenvatting.nl.trim() ||
        !Array.isArray(vaardigheid.termen?.uk) ||
        !Array.isArray(vaardigheid.termen?.nl) ||
        !Array.isArray(vaardigheid.vereisteHulpmiddelen) ||
        !vaardigheid.vereisteHulpmiddelen.every((h) => typeof h === 'string' && HULPMIDDEL_PATROON.test(h)) ||
        perNaam.has(vaardigheid.naam)) {
      throw new Error('VAARD_CATALOGUS_ONGELDIG');
    }
    perNaam.set(vaardigheid.naam, vaardigheid);
  }
  // Controleer geldige verwijzingen en voorkom afhankelijkheidscycli (3-kleuren-DFS)
  const kleur = new Map(); // 0 = onbezocht, 1 = in verwerking, 2 = klaar
  const bezoek = (naam) => {
    const k = kleur.get(naam) ?? 0;
    if (k === 1) throw new Error('VAARD_CATALOGUS_ONGELDIG');
    if (k === 2) return;
    kleur.set(naam, 1);
    const v = perNaam.get(naam);
    for (const dep of v.afhankelijkheden) {
      if (dep === naam || !perNaam.has(dep)) {
        throw new Error('VAARD_CATALOGUS_ONGELDIG');
      }
      bezoek(dep);
    }
    kleur.set(naam, 2);
  };
  for (const naam of perNaam.keys()) {
    bezoek(naam);
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
      vaardigheid.vereisteHulpmiddelen.filter((naam) => !heeftVereistHulpmiddel(zichtbaar, naam));
    return {
      naam: vaardigheid.naam,
      pad: vaardigheid.pad,
      versie: vaardigheid.versie,
      afhankelijkheden: [...(vaardigheid.afhankelijkheden ?? [])],
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

export function leesVaardigheid(naam, catalogus = laadCatalogus(), wortel = WORTEL) {
  const vaardigheid = catalogus.vaardigheden.find((item) => item.naam === naam);
  if (!vaardigheid || !PAD_PATROON.test(vaardigheid.pad)) {
    throw new Error('VAARD_NIET_GEVONDEN');
  }
  const inhoud = readFileSync(path.join(wortel, vaardigheid.pad), 'utf8');
  if (Buffer.byteLength(inhoud, 'utf8') > 96000 || !inhoud.startsWith('---\n')) {
    throw new Error('VAARD_INHOUD_ONGELDIG');
  }
  const kop = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(inhoud);
  if (!kop) {
    throw new Error('VAARD_INHOUD_ONGELDIG');
  }
  const meta = {};
  for (const regel of kop[1].split('\n')) {
    const idx = regel.indexOf(':');
    if (idx <= 0) continue;
    meta[regel.slice(0, idx).trim().toLowerCase()] = regel.slice(idx + 1).trim();
  }
  if (meta.name !== naam ||
      typeof meta.description !== 'string' ||
      !CYRILLISCH.test(meta.description) ||
      !LATIJNS.test(meta.description) ||
      !kop[2].trim()) {
    throw new Error('VAARD_INHOUD_ONGELDIG');
  }
  return inhoud;
}

export function leesVoorbeeld(naam, catalogus = laadCatalogus(), wortel = WORTEL) {
  const vaardigheid = catalogus.vaardigheden.find((item) => item.naam === naam);
  if (!vaardigheid || !PAD_PATROON.test(vaardigheid.pad)) {
    throw new Error('VAARD_NIET_GEVONDEN');
  }
  const pad = `.agents/skills/${naam}/VOORBEELD.uk.md`;
  if (!VOORBEELD_PATROON.test(pad) || !existsSync(path.join(wortel, pad))) {
    throw new Error('VAARD_VOORBEELD_ONTBREEKT');
  }
  const inhoud = readFileSync(path.join(wortel, pad), 'utf8');
  if (Buffer.byteLength(inhoud, 'utf8') > 96000 || !inhoud.trim()) {
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
