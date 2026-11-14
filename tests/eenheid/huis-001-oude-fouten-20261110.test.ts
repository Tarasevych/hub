// HUIS-001 (10.11.2026) — oude fouten in het onderdeel huis die bij het onderzoek voor «Живий дім / Levend huis» zijn gevonden
// en hersteld. Zuiver (geen database, geen browser): bronnen en gedeelde functies.
//   1. Tabbladen zonder naam in src/dienst-tab-labels.ts → een ander menu toonde het Engelse id («Rooms», «Energy», «Files»).
//   2. «Showroom» stond in beide talen hetzelfde (taalwet: een paar uk/nl mag niet gelijk zijn zonder eigennaam).
//   3. De vlagsleutel huis-vnext stond op twee plaatsen.
//   4. Tijdzone: vaste lijst van 7 in de browser en een regex op de server die «UTC» uit die eigen lijst weigerde.
//   5. Uitkomsten van huis gingen naar een eigen regel (hv-toost), niet naar het meldingencentrum.
//   6. HUIS_VERTROUWDE_TOESTELLEN stond in geen enkel document over omgevingsvariabelen.
import { readFileSync } from 'node:fs';
import { checker } from './hulp/nep-google';
import { HUIS_TABS, HUIS_TAB_LABEL, HUIS_VLAG, TIJDZONES_VAAK, alleTijdzones, geldigeTijdzone } from '../../shared/huis-model';
import { serviceTabLabel } from '../../src/dienst-tab-labels';

const lees = (pad: string) => readFileSync(pad, 'utf8');

export async function main(): Promise<number> {
  const { check, einde } = checker('huis-001-oude-fouten-20261110');

  // ---- 1. elk tabblad van elke dienst heeft een naam
  const bron = lees('public/canonical-service.js');
  const m = /const tabs=(\{[^;]*?\})[,;]/.exec(bron);
  const tabs = m ? (new Function(`return ${m[1]}`)() as Record<string, string[]>) : {};
  const labels = lees('src/dienst-tab-labels.ts');
  const sleutels = new Set([...labels.matchAll(/(?:^|[\s,{])([a-z][a-z0-9]*): \[/g)].map((x) => x[1]));
  const zonder = Object.entries(tabs).flatMap(([dienst, lijst]) => lijst.filter((t) => !sleutels.has(t)).map((t) => `${dienst}/${t}`));
  check('elk tabblad uit canonical-service.js heeft een naam in dienst-tab-labels.ts', !!m && Object.keys(tabs).length >= 10 && zonder.length === 0, zonder.join(', '));
  check('de tabbladen van huis krijgen in een ander menu een Oekraïense naam, niet het Engelse id', HUIS_TABS.every((t) => /[А-ЩЬЮЯҐЄІЇа-щьюяґєії]/.test(serviceTabLabel(t, 'uk'))),
    HUIS_TABS.filter((t) => !/[А-ЩЬЮЯҐЄІЇа-щьюяґєії]/.test(serviceTabLabel(t, 'uk'))).join(', '));
  check('rooms/energy vallen niet meer terug op «Rooms»/«Energy»', serviceTabLabel('rooms', 'nl') === 'Kamers' && serviceTabLabel('energy', 'uk') === 'Енергія' && serviceTabLabel('files', 'nl') === 'Mijn bestanden');

  // ---- 2. geen paar uk = nl in de tabbladen van huis
  const gelijk = HUIS_TABS.filter((t) => HUIS_TAB_LABEL[t][0] === HUIS_TAB_LABEL[t][1]);
  check('HUIS_TAB_LABEL: geen enkel paar is in beide talen gelijk', gelijk.length === 0, gelijk.join(', '));
  check('de tabstrook van de dienst toont «Вітрина / Toonzaal», niet «Showroom» in beide talen', !/label:'Showroom'/.test(lees('src/VerenigdDienstApp.tsx')) && /\{id:'showroom',label:tr\('Вітрина','Toonzaal'\)\}/.test(lees('src/VerenigdDienstApp.tsx')));
  check('dienst-tab-labels en HUIS_TAB_LABEL geven dezelfde namen', HUIS_TABS.filter((t) => t !== 'activity' && t !== 'security' && t !== 'settings' && t !== 'devices' && t !== 'overview')
    .every((t) => serviceTabLabel(t, 'uk') === HUIS_TAB_LABEL[t][0] && serviceTabLabel(t, 'nl') === HUIS_TAB_LABEL[t][1]));

  // ---- 3. één bron voor de vlagsleutel
  const vlagBron = lees('src/huis/huis-vlag.ts');
  check('de vlagsleutel huis-vnext staat alleen in shared/huis-model.ts', HUIS_VLAG === 'huis-vnext' && !/=\s*'huis-vnext'/.test(vlagBron) && /import \{ HUIS_VLAG \} from '\.\.\/\.\.\/shared\/huis-model'/.test(vlagBron));

  // ---- 4. tijdzones
  check('geldigeTijdzone: UTC en gewone IANA-namen', ['UTC', 'Europe/Amsterdam', 'Europe/Kyiv', 'America/Argentina/Buenos_Aires'].every(geldigeTijdzone));
  check('geldigeTijdzone: onzin en invoer met vreemde tekens geweigerd', ![ '', 'Mars/Phobos', 'Europe/Amsterdam; DROP TABLE', ' Europe/Kyiv', '../etc/passwd', 123, null, undefined, 'x'.repeat(80) ].some(geldigeTijdzone));
  const alle = alleTijdzones();
  check('alleTijdzones: bevat de vaak gebruikte, gesorteerd en zonder dubbelen', TIJDZONES_VAAK.every((z) => alle.includes(z)) && new Set(alle).size === alle.length && alle.length >= TIJDZONES_VAAK.length
    && alle.every(geldigeTijdzone), `aantal ${alle.length}`);
  const server = lees('backend/huis-vnext.ts');
  check('de server gebruikt dezelfde regel (geen eigen regex meer)', !/\[A-Za-z_\]\+\\\/\[A-Za-z_\+-\]\+/.test(server) && (server.match(/geldigeTijdzone\(tijdzone\)/g) || []).length === 2);
  const inst = lees('src/huis/onderdelen/Instellingen.tsx');
  check('de instellingenpagina toont de volledige lijst, niet 7 vaste zones', !/const TIJDZONES = \[/.test(inst) && /alleTijdzones\(\)/.test(inst) && /optgroup/.test(inst));

  // ---- 5. meldingencentrum
  const pagina = lees('src/huis/HuisPagina.tsx');
  check('uitkomsten van huis gaan via emitCanonicalNotice (bron huis) naar het meldingencentrum', /emitCanonicalNotice\(\{[^}]*source: 'huis'/.test(pagina) && !/hv-toost/.test(pagina) && !/hv-toost/.test(lees('src/huis/huis.css')));
  const onderdelen = ['Apparaten', 'Assistent', 'Automatiseringen', 'Beveiliging', 'Energie', 'Gebeurtenissen', 'Instellingen', 'Integraties', 'Kamers', 'Overzicht', 'Scenes'].map((n) => lees(`src/huis/onderdelen/${n}.tsx`)).join('\n');
  check('een fout wordt als fout gemeld (rode pop-up), niet als geslaagd', !/toon\(foutTekst\(lang, [^()]*\)\)/.test(onderdelen) && (onderdelen.match(/toon\(foutTekst\(lang, [^()]*\), 'fout'\)/g) || []).length === 11);

  // ---- 6. documenten
  const docs = ['ЗМІННІ-СЕРЕДОВИЩА.uk.md', 'ЗМІННІ-СЕРЕДОВИЩА.md', 'OMGEVINGSVARIABELEN.nl.md', 'docs/hub/ЗМІННІ-СЕРЕДОВИЩА-ЦЕНТРУ.uk.md', 'docs/hub/OMGEVINGSVARIABELEN.nl.md'];
  check('HUIS_VERTROUWDE_TOESTELLEN staat in de documenten over omgevingsvariabelen (uk en nl)', docs.every((d) => /\| `HUIS_VERTROUWDE_TOESTELLEN` \|/.test(lees(d))), docs.filter((d) => !/HUIS_VERTROUWDE_TOESTELLEN/.test(lees(d))).join(', '));
  check('MR_BEHEERSUBNET staat ook in de hoofdlijst (uk en nl)', /\| `MR_BEHEERSUBNET` \|/.test(lees('ЗМІННІ-СЕРЕДОВИЩА.uk.md')) && /\| `MR_BEHEERSUBNET` \|/.test(lees('OMGEVINGSVARIABELEN.nl.md')));

  return einde();
}
