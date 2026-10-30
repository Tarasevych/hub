// Catalogus van integraties (shared/integraties-catalogus.ts): volledig, uniek, eerlijk over wat werkt, en logo's aanwezig.
import { readFileSync } from 'node:fs';
import { CATEGORIEEN, INTEGRATIES, METHODE_LABEL, STATUS_LABEL, integratie } from '../../shared/integraties-catalogus';
import { LOGOS } from '../../src/merk/merk-logos';
import { merkDef } from '../../src/merk/merk-register';
import { MERKEN } from '../../src/merk/merk-tabel';
import { V2_AGENTEN } from '../../shared/connector-v2/agenten';
import { checker } from './hulp/nep-google';

export async function main(): Promise<number> {
  const { check, einde } = checker('integraties-catalogus');
  const ids = INTEGRATIES.map((i) => i.id);
  check('minstens 100 integraties', INTEGRATIES.length >= 100);
  check('id\'s uniek en kebab-case', new Set(ids).size === ids.length && ids.every((id) => /^[a-z0-9][a-z0-9-]*$/.test(id)));
  check('namen uniek per categorie', new Set(INTEGRATIES.map((i) => `${i.cat}|${i.naam.toLowerCase()}`)).size === INTEGRATIES.length);
  check('verplichte velden gevuld (naam, uk, nl, site, categorie, methode)', INTEGRATIES.every((i) => i.naam && i.uk.length > 8 && i.nl.length > 8 && /^https:\/\//.test(i.site) && i.methoden.length > 0));
  const cats = new Set(CATEGORIEEN.map((c) => c.id));
  check('elke categorie bestaat en heeft minstens 3 kaarten', INTEGRATIES.every((i) => cats.has(i.cat)) && CATEGORIEEN.every((c) => INTEGRATIES.filter((i) => i.cat === c.id).length >= 3 || c.id === 'support' || c.id === 'media'));
  check('methoden en statussen hebben labels', INTEGRATIES.every((i) => i.methoden.every((m) => METHODE_LABEL[m]) && STATUS_LABEL[i.status]));
  check('geen dubbele methoden per kaart', INTEGRATIES.every((i) => new Set(i.methoden).size === i.methoden.length));

  // Eerlijkheid: «klaar» en «instellen» hebben een doel dat bestaat; «binnenkort» heeft er geen.
  const klaar = INTEGRATIES.filter((i) => i.status === 'klaar'), instellen = INTEGRATIES.filter((i) => i.status === 'instellen'), soon = INTEGRATIES.filter((i) => i.status === 'binnenkort');
  check('klaar-kaarten hebben een pagina als doel', klaar.every((i) => i.doel?.soort === 'pagina'));
  check('instellen-kaarten wijzen naar het directory-blok', instellen.every((i) => i.doel?.soort === 'directory') && instellen.length === 2);
  check('binnenkort-kaarten hebben géén doel (geen schijnkoppeling)', soon.every((i) => !i.doel && !i.levend));
  check('meerderheid is eerlijk «binnenkort» (geen onbewezen beloftes)', soon.length > klaar.length);

  // De zes AI-agenten van connector-v2 zijn precies de klare AI-kaarten met een eigen MCP-adres.
  const agentLevend = klaar.filter((i) => i.levend?.startsWith('agent:')).map((i) => i.levend!.slice(6)).sort();
  check('elke connector-v2-agent heeft een klare kaart (en andersom)', agentLevend.join() === V2_AGENTEN.map((a) => a.slug).sort().join());

  // Doelen verwijzen naar tabs die bestaan (lijst uit public/canonical-service.js).
  const bron = readFileSync('public/canonical-service.js', 'utf8');
  const tabs = (dienst: string) => { const m = bron.match(new RegExp(`[,{]${dienst}:\\[([^\\]]*)\\]`)); return m ? m[1].split(',').map((x) => x.trim().replace(/'/g, '')) : []; };
  check('elk pagina-doel verwijst naar een bestaande dienst-tab', klaar.every((i) => i.doel?.soort === 'pagina' && tabs(i.doel.dienst).includes(i.doel.tab)));

  // Logo's: elke genoemde slug ontbreekt hoogstens als monogram; het merendeel heeft een echt logo, paden zijn klein en geldig.
  const metSlug = INTEGRATIES.filter((i) => i.logo);
  // Een embleem komt uit deze (grote, luie) tabel OF uit het ene merkregister van de site (src/merk/merk-tabel.ts), waar de
  // merken staan die de hele site gebruikt — en sinds 19.10.2026 ook de merken die hier eerder helemaal geen logo hadden.
  const zonder = metSlug.filter((i) => !LOGOS[i.logo] && !merkDef(i.logo));
  check('minstens 95% van de merken heeft een embleem', (metSlug.length - zonder.length) / INTEGRATIES.length >= 0.95);
  check('logo-paden geldig (begint met M/m, geen scripts) en kleur hex', Object.values(LOGOS).every(([p, h]) => /^[Mm][0-9. ,\-a-zA-Z]+$/.test(p) && /^[0-9A-Fa-f]{6}$/.test(h)));
  // Padstructuur: elk commando heeft een veelvoud van zijn argumenten (een eerdere afronding brak paden zonder dat de regex het zag),
  // en de vlaggen van een boog zijn 0 of 1. Daarnaast moet de bytegrootte per merk klein blijven.
  const ARG: Record<string, number> = { m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, q: 4, t: 2, a: 7, z: 0 };
  const padGeldig = (d: string) => {
    const delen = d.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:e[-+]?\d+)?/g) ?? [];
    if (delen.join('').length < d.replace(/[\s,]/g, '').replace(/(\d)-/g, '$1-').length - 2) return false; // onbekende tekens
    let cmd = '', args: number[] = [];
    const klaar = () => { const n = ARG[cmd.toLowerCase()]; if (n === undefined) return false; if (n === 0) return args.length === 0; if (args.length === 0 || args.length % n !== 0) return false; if (cmd.toLowerCase() === 'a') for (let k = 0; k < args.length; k += 7) if (![0, 1].includes(args[k + 3]) || ![0, 1].includes(args[k + 4])) return false; return true; };
    for (const t of delen) { if (/[a-zA-Z]/.test(t)) { if (cmd && !klaar()) return false; cmd = t; args = []; } else args.push(Number(t)); }
    return klaar() && delen[0].toLowerCase() === 'm';
  };
  check('logo-paden structureel geldig (argumenttelling, boogvlaggen)', Object.entries(LOGOS).every(([, [p]]) => padGeldig(p)));
  check('geen logo groter dan 5 kB', Object.values(LOGOS).every(([p]) => p.length < 5000));
  check('logobestand blijft licht (< 130 kB)', readFileSync('src/merk/merk-logos.ts').length < 130_000);
  check('logo-tabel bevat geen ongebruikte merken', Object.keys(LOGOS).every((k) => INTEGRATIES.some((i) => i.logo === k)));
  // Geen merk twee keer tekenen: wat in het register staat, hoort hier niet nog eens te staan (zie tests/eenheid/merk-register.test.ts).
  const dubbel = Object.keys(LOGOS).filter((k) => k in MERKEN);
  check('logo-tabel dubbelt het merkregister niet', dubbel.length === 0, dubbel.join());

  check('opzoeken per id', integratie('gmail')?.naam === 'Gmail' && integratie('bestaat-niet') === undefined);
  check('catalogus is bevroren', Object.isFrozen(INTEGRATIES));
  console.log(`  (klaar ${klaar.length}, instellen ${instellen.length}, binnenkort ${soon.length}, zonder logo: ${zonder.map((i) => i.id).join(', ')})`);
  return einde();
}
