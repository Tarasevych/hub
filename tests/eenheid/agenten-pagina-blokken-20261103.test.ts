// INTEG-001 (03.11.2026) · agpag1 — de rand van mcp.* → agents («Підключення ШІ»).
// Klacht van de eigenaar: «сторінка виглядає як сира таблиця… багато порожніх проміжків, розділи не відділені один від одного,
// не зрозуміло, де початок і кінець. Потрібні сучасні зручні блоки, які не повторюються і чітко кажуть, що до чого і для чого.»
//
// Wat hier bewezen wordt (bron + echte render met react-dom/server, geen aanname):
//   1. het klassencontract staat in src/agenten/agenten-pagina.css (vaste namen voor de andere onderdelen) en volgt de regels
//      van het fundament: alleen tokens (geen hex), geen prefers-color-scheme, geen letter < 12 px, geen position:fixed;
//      op de telefoon 16 px aan elke kant;
//   2. ELK zichtbaar onderdeel van de pagina rendert als één kaart .ag-blok.ag-blok-hoofd met een kop (titel + één zin) en een
//      knop «Згорнути»; de skeletregel vervangt de lege vlakte van een nog niet gemount blok; een ingeklapt blok houdt geen hoogte;
//   3. de dubbels zijn weg: geen tweede rij van zes AI in «Огляд», geen eigen zes knoppen in «Підключені ШІ», geen tweede
//      «ШІ чекає вашого рішення», geen eigen kop/«Останні дії» in «Конектори» binnen de hub, geen tweede titel in «Зовнішні MCP»;
//   4. uk en nl: dezelfde render in beide talen, zonder de tekst van de andere taal.
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { checker } from './hulp/nep-google';
import { nepBrowser } from './hulp/nep-browser';

const lees = (p: string) => readFileSync(p, 'utf8');
const zc = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const tel = (s: string, naald: string) => s.split(naald).length - 1;
type Tr = (uk: string, nl: string) => string;
const UK: Tr = (uk) => uk;
const NL: Tr = (_uk, nl) => nl;

export async function main(): Promise<number> {
  const { check, einde } = checker('agenten-pagina-blokken-20261103');

  // ---------------------------------------------------------------- 1. contract en fundament (bron)
  const css = lees('src/agenten/agenten-pagina.css');
  const kaal = zc(css);
  const contract = ['.ag-pagina', '.ag-blok', '.ag-blok-kop', '.ag-blok-titel', '.ag-blok-uitleg', '.ag-rij', '.ag-leeg', '.ag-knoppen'];
  check('contract: alle acht vaste klassen hebben regels in agenten-pagina.css', contract.every((k) => new RegExp(`\\${k}(?![\\w-])`).test(kaal)), contract.filter((k) => !new RegExp(`\\${k}(?![\\w-])`).test(kaal)).join(', '));
  check('contract: de opmaak staat als voorbeeld in de kop van het bestand (voor de andere onderdelen)', css.includes('<section class="ag-blok">') && css.includes('<header class="ag-blok-kop">') && css.includes('<p class="ag-leeg">'));
  check('fundament: geen hex, geen prefers-color-scheme, geen !important, geen position:fixed', !/#[0-9a-fA-F]{3,8}\b/.test(kaal) && !/prefers-color-scheme/.test(kaal) && !/!important/.test(kaal) && !/position\s*:\s*fixed/.test(kaal));
  const kleineLetters = [...kaal.matchAll(/font-size\s*:\s*(\d+(?:\.\d+)?)px/g)].filter((m) => Number(m[1]) < 12);
  check('fundament: geen letter kleiner dan 12 px', kleineLetters.length === 0, kleineLetters.map((m) => m[0]).join(', '));
  check('fundament: geen wit op een accent- of statusvlak', !/(?<![-\w])color\s*:\s*(?:#fff(?:fff)?|white)\b/i.test(kaal));
  check('telefoon: 12 px werkruimte (mobiel-ux.css) + 4 px = 16 px aan elke kant, binnen @media (max-width:700px)',
    /@media \(max-width:700px\)\{[\s\S]*?\.ag-pagina\{padding-inline:4px\}/.test(kaal) && lees('src/mobiel-ux.css').includes('.canonical-workspace{padding-left:12px!important;padding-right:12px!important}'));
  check('geen horizontaal scrollen: blokken en koppen krimpen (min-width:0) en lange woorden breken', /\.ag-blok\{[^}]*min-width:0/.test(kaal) && /\.ag-blok-titel\{[^}]*overflow-wrap:anywhere/.test(kaal) && /\.ag-blok-uitleg\{[^}]*overflow-wrap:anywhere/.test(kaal));
  check('een ingeklapt lui blok houdt geen 18rem hoogte vast', /\.ag-pagina \.ag-sectie\.ag-blok-hoofd\[data-ag-dicht='1'\]\{min-height:0\}/.test(kaal) && /\.ag-blok-inhoud\[hidden\]\{display:none\}/.test(kaal));
  const pagina = lees('src/agenten/AgentenPagina.tsx');
  check('AgentenPagina laadt agenten-pagina.css NA agenten.css (de rand heeft het laatste woord)', pagina.indexOf("import './agenten.css';") > 0 && pagina.indexOf("import './agenten-pagina.css';") > pagina.indexOf("import './agenten.css';"));
  check('geen <style>-tag in de rand en de onderdelen van agpag1 (CSP style-src \'self\')',
    ['src/agenten/AgentenPagina.tsx', 'src/agenten/TabAi.tsx', 'src/agenten/TabExternMcp.tsx', 'src/agenten/TabOrch.tsx', 'src/agenten/HubMatrix.tsx', 'src/connector-v2/ConnectorsTab.tsx'].every((p) => !/<style[\s>]/.test(lees(p))));
  check('lui blok mount al vóór het in beeld komt (eigen IntersectionObserver op de echte scrollcontainer, 480 px vooruit)',
    pagina.includes("rootMargin: '0px 0px 480px 0px'") && pagina.includes('root: scrollOuder(el)') && pagina.includes('function BlokSkelet'));

  // ---------------------------------------------------------------- 2. render van de hele pagina (uk en nl)
  nepBrowser('https://mcp.tarasevych.com');
  const { default: AgentenPagina, zichtbareTabs } = await import('../../src/agenten/AgentenPagina');
  const aantal = zichtbareTabs(false).length;
  const html = renderToStaticMarkup(createElement(AgentenPagina, { tr: UK }));
  check('render: de pagina heeft de klasse ag-pagina (en ag voor bestaande e2e-selectors)', html.startsWith('<div class="ag ag-pagina"'));
  check(`render: elk zichtbaar onderdeel (${aantal}) is één kaart .ag-blok.ag-blok-hoofd`, tel(html, 'class="ag-sectie ag-blok ag-blok-hoofd"') === aantal, String(tel(html, 'class="ag-sectie ag-blok ag-blok-hoofd"')));
  check('render: elke kaart heeft één kop met titel (h2) en één zin uitleg', tel(html, '<h2 class="ag-blok-titel" id="ag-blok-titel-') === aantal && tel(html, '<div class="ag-blok-tekst"><h2') === aantal
    && zichtbareTabs(false).every((t) => new RegExp(`id="ag-blok-titel-${t}">[^<]+(?:<span[^>]*>\\d+</span>)?</h2><p class="ag-blok-uitleg">[^<]{20,}</p>`).test(html)));
  check('render: elke kaart is ingang-label van zichzelf (aria-labelledby → de eigen titel)', zichtbareTabs(false).every((t) => html.includes(`aria-labelledby="ag-blok-titel-${t}"`)));
  check('render: elke kaart heeft een knop «Згорнути» (open, aria-controls naar de inhoud)', tel(html, 'class="ag-knop ag-blok-klap" aria-expanded="true"') === aantal && zichtbareTabs(false).every((t) => html.includes(`aria-controls="ag-blok-inhoud-${t}"`)));
  check('render: het overzicht is gemount (vier cijfers, laatste gebeurtenissen, matrix als blok)', tel(html, 'data-stat="') === 4 && html.includes('data-recent="1"') && html.includes('class="ag-blok ag-matrix"') && html.includes('Що через який спосіб'));
  check('render: nog niet gemounte blokken tonen een skelet met uitleg, geen lege vlakte', html.includes('class="ag-lui-plaats ag-blok-skelet"') && html.includes('Розділ завантажиться, щойно ви до нього дійдете…'));
  check('dubbel weg: «Огляд» herhaalt de zes AI van «Конектори» niet (geen data-agent-ingang)', !html.includes('data-agent-ingang') && !html.includes('Керування окремим ШІ'));
  check('render uk: geen Nederlandse tekst van de rand', !/Inklappen|Uitklappen|Kort de stand|Dit onderdeel laadt/.test(html));
  check('geen <style> in de render', !/<style[\s>]/.test(html));

  const htmlNl = renderToStaticMarkup(createElement(AgentenPagina, { tr: NL }));
  check('render nl: titels, uitleg en knop in het Nederlands', htmlNl.includes('>Overzicht<') && htmlNl.includes('Kort de stand') && htmlNl.includes('<span>Inklappen</span>') && htmlNl.includes('Dit onderdeel laadt zodra u er bent…'));
  check('render nl: geen Oekraïense tekst van de rand', !/Згорнути|Розгорнути|Коротко про стан|Розділ завантажиться/.test(htmlNl));

  // Ingeklapt blok (gemak per browser): alleen de kop, de inhoud verborgen, niets gemount.
  localStorage.setItem('mr.agenten.blokken-dicht', JSON.stringify(['journaal', 'onzin']));
  const dicht = renderToStaticMarkup(createElement(AgentenPagina, { tr: UK }));
  localStorage.removeItem('mr.agenten.blokken-dicht');
  const journaal = dicht.slice(dicht.indexOf('id="ag-sectie-journaal"'));
  check('ingeklapt: data-ag-dicht, knop «Розгорнути» (aria-expanded=false), inhoud hidden en leeg', journaal.includes('data-ag-dicht="1"') && journaal.includes('aria-expanded="false"') && journaal.includes('<span>Розгорнути</span>') && /id="ag-blok-inhoud-journaal" class="ag-blok-inhoud" hidden=""><\/div>/.test(journaal));
  check('ingeklapt: alleen dat ene blok; een onbekende naam in de opslag doet niets', tel(dicht, 'data-ag-dicht="1"') === 1);

  // ---------------------------------------------------------------- 3. de onderdelen van agpag1 (render)
  const { default: TabAi } = await import('../../src/agenten/TabAi');
  const call = { id: 'c1', tool: 'mail_send', args: {}, status: 'pending_approval', createdAt: Date.now(), preview: '' };
  const ai = renderToStaticMarkup(createElement(TabAi, { tr: UK, overzicht: null, tokens: null, naActie: async () => undefined, item: '', kies: () => undefined, calls: [call] }));
  check('«Підключені ШІ»: wachtende AI-verzoeken = één regel met de weg naar «Огляд», geen tweede lijst', ai.includes('data-ai-wacht="1"') && ai.includes('href="#overzicht"') && !ai.includes('ШІ чекає вашого рішення</h3>'));
  check('«Підключені ШІ»: geen eigen zes knoppen; het bord zit ingebed (zonder eigen h1) in «Підключити новий ШІ»',
    !ai.includes('data-ai-agent-ingangen') && ai.includes('id="ag-ai-verbinden"') && ai.includes('data-agent-bord="1" data-ingebed="1"') && !ai.slice(ai.indexOf('id="ag-ai-verbinden"')).includes('<h1>'));
  check('«Підключені ШІ»: blok «Підключити новий ШІ» met kop en één zin; e2e-ankers blijven (#ag-ai-hulpmiddelen, .ag-lijstkop-tekst)',
    /id="ag-ai-verbinden"[^>]*><header class="ag-blok-kop"><h3 class="ag-blok-titel">/.test(ai) && ai.includes('data-hub-section="ag-ai-hulpmiddelen"') && ai.includes('class="ag-lijstkop-tekst"'));

  const { default: ConnectorsTab } = await import('../../src/connector-v2/ConnectorsTab');
  const conIn = renderToStaticMarkup(createElement(ConnectorsTab, { tr: UK, ingebed: true }));
  const conLos = renderToStaticMarkup(createElement(ConnectorsTab, { tr: UK }));
  check('«Конектори» in de hub: geen eigen kop (die staat in de rand) en geen paneel «Останні дії» (dubbel met «Останні події»/«Журнал»)',
    !conIn.includes('v2b-hoofd') && !conIn.includes('data-v2-laatste') && conIn.includes('data-ingebed="1"') && conIn.includes('data-v2-massa'));
  check('«Конектори» elders (ai.* → verbindingen): kop en «Останні дії» blijven', conLos.includes('v2b-hoofd') && conLos.includes('data-v2-laatste'));

  const { default: TabExternMcp } = await import('../../src/agenten/TabExternMcp');
  const ext = renderToStaticMarkup(createElement(TabExternMcp, { tr: UK }));
  check('«Зовнішні MCP»: geen tweede titel «Зовнішні MCP-сервери»; blokken lijst → toevoegen → uitleg (ingeklapt)',
    !ext.includes('>Зовнішні MCP-сервери<') && ext.indexOf('data-extern-lijst="1"') >= 0 && ext.indexOf('data-extern-lijst="1"') < ext.indexOf('data-extern-toevoegen="1"') && ext.indexOf('data-extern-toevoegen="1"') < ext.indexOf('data-extern-uitleg="1"') && /<details class="ag-blok ag-blok-uitklap" data-extern-uitleg="1">/.test(ext));
  check('«Зовнішні MCP»: formulier als raster, adres en token over de volle breedte', ext.includes('class="ag-formraster"') && tel(ext, 'class="ag-veld ag-veld-vol"') === 2);

  const { default: TabOrch } = await import('../../src/agenten/TabOrch');
  const orch = renderToStaticMarkup(createElement(TabOrch, { tr: UK }));
  check('«Координація»: eerste blok heet «Стан зараз» (niet nog eens de naam van het tabblad), de zin noemt «Координація агентів»',
    /^<div class="ag-tab" data-orch="[^"]*">/.test(orch) && orch.includes('Стан зараз') && orch.includes('Координація агентів: одна пам’ять') && orch.includes('<header class="ag-blok-kop">'));

  const { default: HubMatrix } = await import('../../src/agenten/HubMatrix');
  const mx = renderToStaticMarkup(createElement(HubMatrix, { tr: NL, ga: () => undefined, invoer: { techProfiel: false, connector: { prive: 1, technisch: 0 }, tokens: { prive: 0, technisch: 0 }, pc: { totaal: 0, metToestemming: 0 }, extPrive: { gekoppeld: false, open: null, toegestaan: [], uit: false }, extTech: null, lokaal: { open: null, mag: true } } }));
  check('matrix: blok met kop en één zin (nl), cellen met data-waarde', mx.startsWith('<section class="ag-blok ag-matrix"') && mx.includes('Wat via welke weg') && mx.includes('Welke manier van koppelen nu waartoe toegang geeft') && mx.includes('data-waarde="ja"'));

  return einde();
}
