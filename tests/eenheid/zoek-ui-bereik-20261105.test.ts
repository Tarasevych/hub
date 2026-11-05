// ZOEKEN — WAAR EEN ELEMENT VAN DE CATALOGUS ECHT TE ZIEN IS (ORCH-001, oude fouten, 05.11.2026). Zonder database.
//
// Een onafhankelijke controle van elk element dat de nieuwe generator verplaatste, vond plekken waar de zoeker heen stuurde terwijl
// het element daar niet staat. Deze test houdt de correcties vast:
//   1. kiesTabblad: meerdere mogelijke tabbladen zonder de bestandsregel erbij → het eerste mogelijke (vroeger: de bestandsregel,
//      bv. «Відкрити» en de Google-accounts van de cloud op «Огляд»); alleen doorsturende tabbladen → niet in de catalogus;
//   2. DOORSTUREND klopt met shared/ai-agent-bord.ts → mcpIngang: mcp/overview, connect en verbindingen sturen voor iedereen door
//      naar agents, elk ander tabblad van mcp toont zichzelf aan een technisch profiel;
//   3. bereikbaar(): alleen bestanden die vanaf src/main.tsx geïmporteerd worden; dode bestanden (AgentenPaneel, McpConnectorPaneel,
//      ExtensieTechAanbod, BeheerSleutelsWeergave, bureau/Bureau …) leveren geen knoppen meer;
//   4. bestandsregels: ServerKoppelen → mcp/apps, McpBackupsKaart → mcp/download, AgentStandLijst en NamensSessies → admin/ai,
//      de technische delen van de hub (RuimteScheiding, TechVerbindingen, SiteSchakelaars) alleen met technisch profiel;
//      overzicht/ (Dashboard van de beheerconsole) → admin/overview, TechMeldingen (alleen in de technische strook) → technisch;
//   5. de echte catalogus; geen element uit een technische module (shared/tech-bundels.ts) is breder zichtbaar dan «technisch».
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { checker } from './hulp/nep-google';
import { UI_ELEMENTEN } from '../../shared/zoek-ui-knoppen.generated';
import { mcpIngang } from '../../shared/ai-agent-bord';
import { MENU_PAGINAS } from '../../shared/menu-model';
import { isTechModule } from '../../shared/tech-bundels';

type El = { soort: string; uk: string; tabHint?: string; mogelijkeTabs?: string[] };

export async function main(): Promise<number> {
  const { check, einde } = checker('zoek-ui-bereik-20261105');
  const wortel = process.cwd();
  const gen = await import(pathToFileURL(join(wortel, 'scripts/zoek-ui-catalogus.mjs')).href);
  const kies = gen.kiesTabblad as (el: El, standaard: string, dood?: readonly string[]) => string | null;

  // 1. kiesTabblad
  const k = (mogelijkeTabs: string[] | undefined, standaard = 'overview', dood: string[] = [], tabHint = '') => kies({ soort: 'knop', uk: 'x', tabHint, mogelijkeTabs }, standaard, dood);
  check('1a de bron vernauwt niet → bestandsregel; één mogelijk → dat', k(undefined) === 'overview' && k(undefined, 'overview', [], 'vault') === 'vault' && k(['vault']) === 'vault');
  check('1b meerdere mogelijk, bestandsregel niet erbij → het eerste (menuvolgorde): accounts / workspaces', k(['accounts', 'google', 'onedrive', 'dropbox']) === 'accounts' && k(['workspaces', 'search', 'recent']) === 'workspaces');
  check('1c meerdere mogelijk mét de bestandsregel → de bestandsregel', k(['inbox', 'overview']) === 'overview');
  check('1d alleen doorsturende tabbladen → null (niet in de catalogus); doorsturend tabblad eraf → de rest', k(['overview', 'connect'], 'dashboard', ['overview', 'connect']) === null && k(['overview', 'services'], 'dashboard', ['overview']) === 'services' && k(undefined, 'dashboard', ['connect'], 'connect') === 'dashboard');
  check('1e geen enkel tabblad mogelijk (alleen onbekende genoemd) → voorzichtig de bestandsregel', k([]) === 'overview');
  const TABS = ['overview', 'accounts', 'google', 'search'];
  const els = gen.elementenUit(`export function P({tab}){return <div>{(tab==='google'||tab==='accounts') && <button>{tr('Кнопка акаунтів','Accountknop')}</button>}<button>{tr('Скрізь','Overal')}</button></div>;}`, 'src/Proef.tsx', TABS) as El[];
  const a = els.find((e) => e.uk === 'Кнопка акаунтів'), b = els.find((e) => e.uk === 'Скрізь');
  check('1f elementenUit geeft de mogelijke tabbladen in menuvolgorde (alleen als de bron ze vernauwt)', JSON.stringify(a?.mogelijkeTabs) === '["accounts","google"]' && a?.tabHint === '' && !b?.mogelijkeTabs, `${JSON.stringify(a)}|${JSON.stringify(b)}`);

  // 2. DOORSTUREND tegen mcpIngang zelf
  const dood: readonly string[] = gen.DOORSTUREND.mcp;
  const naarHub = (t: string, tech: boolean) => mcpIngang(t, tech)?.tab === 'agents';
  check('2a mcp: overview, connect en verbindingen sturen ALTIJD door naar agents (met en zonder technisch profiel)', dood.length === 3 && dood.every((t) => naarHub(t, true) && naarHub(t, false)), dood.join(','));
  const rest = MENU_PAGINAS.mcp.filter((t) => !dood.includes(t));
  check('2b elk ander tabblad van mcp toont zichzelf aan een technisch profiel (de lijst is volledig)', rest.length >= 9 && rest.every((t) => mcpIngang(t, true) === null), rest.filter((t) => mcpIngang(t, true) !== null).join(',') || rest.join(','));

  // 3. bereikbaar
  const geladen = gen.bereikbaar(wortel) as Set<string>;
  const is = (f: string) => geladen.has(join(wortel, f));
  check('3a vanaf src/main.tsx bereikbaar: App, McpDienstWeergave, de hub (AgentenPagina), lazy geladen IdentiteitBeheerWeergave', ['src/main.tsx', 'src/App.tsx', 'src/McpDienstWeergave.tsx', 'src/agenten/AgentenPagina.tsx', 'src/IdentiteitBeheerWeergave.tsx'].every(is));
  const DOOD = ['src/AgentenPaneel.tsx', 'src/McpConnectorPaneel.tsx', 'src/agenten/ExtensieTechAanbod.tsx', 'src/BeheerSleutelsWeergave.tsx', 'src/bureau/Bureau.tsx', 'src/agenten/VerbindingenHub.tsx'];
  check('3b dode bestanden (geen enkele import) zijn niet bereikbaar', DOOD.every((f) => !is(f)), DOOD.filter(is).join(','));
  check('3c en ze leveren geen enkel element aan de catalogus', !UI_ELEMENTEN.some((e) => DOOD.includes(e.bestand)), UI_ELEMENTEN.filter((e) => DOOD.includes(e.bestand)).map((e) => `${e.bestand}:${e.uk}`).join(', '));

  // 4. bestandsregels
  const van = (f: string) => UI_ELEMENTEN.filter((e) => e.bestand === f);
  const allemaal = (f: string, plek: string, toegang?: string) => { const l = van(f); return l.length > 0 && l.every((e) => `${e.dienst}/${e.tab}` === plek && (!toegang || e.toegang === toegang)); };
  check('4a ServerKoppelen («Підключити цей сервер») → mcp/apps, niet mcp/connect (stuurt door)', allemaal('src/ServerKoppelen.tsx', 'mcp/apps', 'technisch'));
  check('4b McpBackupsKaart («Нічні копії сервера») → mcp/download', allemaal('src/McpBackupsKaart.tsx', 'mcp/download', 'technisch'));
  check('4c AgentStandLijst en NamensSessies → admin/ai (technisch), niet de hub', allemaal('src/agenten/AgentStandLijst.tsx', 'admin/ai', 'technisch') && allemaal('src/agenten/NamensSessies.tsx', 'admin/ai', 'technisch'));
  check('4d technische delen van de hub → mcp/agents, alleen technisch profiel', ['src/agenten/RuimteScheiding.tsx', 'src/agenten/TechVerbindingen.tsx', 'src/agenten/SiteSchakelaars.tsx'].every((f) => allemaal(f, 'mcp/agents', 'technisch')));
  const OVERZICHT = ['src/overzicht/Dashboard.tsx', 'src/overzicht/GebruikerKaart.tsx', 'src/overzicht/widgets.tsx', 'src/overzicht/grafieken.tsx'];
  check('4e overzicht/ (Dashboard van BeheerOverzichtWeergave) → admin/overview, technisch — niet de persoonlijke hub', OVERZICHT.every((f) => allemaal(f, 'admin/overview', 'technisch')), OVERZICHT.map((f) => `${f}:${van(f).map((e) => `${e.dienst}/${e.tab}/${e.toegang}`).join('|')}`).join(' '));
  check('4f TechMeldingen (knop alleen in de actieve technische strook) → technisch', allemaal('src/meldingen/TechMeldingen.tsx', 'hub/overview', 'technisch'));
  check('4g de gewone meldingen blijven voor iedereen (geen te brede regel)', allemaal('src/meldingen/v2/MeldingenV2.tsx', 'hub/overview', 'iedereen'));

  // 5. de echte catalogus
  check('5a geen enkel element op een doorsturend tabblad van mcp', !UI_ELEMENTEN.some((e) => e.dienst === 'mcp' && dood.includes(e.tab)), UI_ELEMENTEN.filter((e) => e.dienst === 'mcp' && dood.includes(e.tab)).map((e) => `${e.tab}:${e.uk}`).join(', '));
  const MCP = van('src/McpDienstWeergave.tsx');
  check('5b «Перевірити хости» → mcp/dashboard en mcp/services (de kopie in de tak overview is nooit te zien)', JSON.stringify(MCP.filter((e) => e.uk === 'Перевірити хости').map((e) => e.tab).sort()) === '["dashboard","services"]');
  const CL = van('src/CloudFunctioneelWeergave.tsx');
  const op = (uk: string) => CL.filter((e) => e.uk === uk).map((e) => e.tab).sort().join(',');
  check('5c cloud: «Відкрити» niet op overview (wel inbox, accounts, workspaces); Google-accounts («Додати акаунт», «Відключити») → accounts',
    !op('Відкрити').split(',').includes('overview') && op('Відкрити') === 'accounts,inbox,workspaces' && op('Додати акаунт') === 'accounts' && op('Відключити') === 'accounts', `${op('Відкрити')}|${op('Додати акаунт')}|${op('Відключити')}`);
  const lees = (f: string) => readFileSync(join(wortel, f), 'utf8');
  const techBreed = UI_ELEMENTEN.filter((e) => isTechModule(e.bestand, '', lees) && e.toegang !== 'technisch');
  const techAantal = UI_ELEMENTEN.filter((e) => isTechModule(e.bestand, '', lees)).length;
  check('5d geen element uit een technische module (TECH_MAPPEN, TECH_BESTANDEN, // @tech-asset) is breder zichtbaar dan technisch', techAantal > 100 && techBreed.length === 0, `${techAantal} technisch; te breed: ${techBreed.map((e) => `${e.bestand}:${e.uk}:${e.toegang}`).join(', ')}`);
  return einde();
}
