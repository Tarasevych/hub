// GEMINI-004 (17.11.2026): спільне групове меню якорів (MaquetteAnkerRail) для сторінки mcp.tarasevych.com/agenten
// за тим самим принципом, що й id.tarasevych.com/account (UNIF-ANKER-001), у всіх палітрах (звичайних, класичних і «Макет»).
// Перевіряє джерельний код без потреби в базі даних чи браузері.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { checker } from './hulp/nep-google';

const lees = (relPad: string) => readFileSync(resolve(relPad), 'utf8');

export async function main(): Promise<number> {
  const { check, einde } = checker('gemini-004-agenten-ankers-20261117');
  const mcp = lees('src/McpDienstWeergave.tsx');
  const pagina = lees('src/agenten/AgentenPagina.tsx');
  const hub = lees('src/agenten/VerbindingenHub.tsx');
  const css = lees('src/mcp-domein.css');
  const e2e = lees('tests/e2e/agenten.e2e.ts');

  check(
    '1 McpDienstWeergave показує спільне меню якорів у всіх палітрах лише додатково на section === "agents" (поза «Макетом» не на /apps чи інших секціях)',
    mcp.includes('const toonAnkerRail = isMaquette || section === "agents";') &&
      mcp.includes('if (!toonAnkerRail || typeof document === "undefined")') &&
      mcp.includes('toonAnkerRail && !verborgen && !consent && !laagOpen ? (') &&
      mcp.includes('className={isMaquette ? "mcp-estate mq-schil mcp-maquette-wikkel" : section === "agents" ? "mcp-estate mq-schil" : "mcp-estate"}'),
  );

  check(
    '2 MaquetteAnkerRail розташовано перед вмістом сторінки (після RichtingBand, перед ExpertMelding), щоб мобільна підсмуга прилипала вгорі',
    mcp.indexOf('<MaquetteAnkerRail') > mcp.indexOf('<RichtingBand') &&
      mcp.indexOf('<MaquetteAnkerRail') < mcp.indexOf('{verborgen ? <ExpertMelding'),
  );

  check(
    '3 розділи /agenten згруповані у 4 розкривні змістові групи з діапазонами (soort: "groep", kiesbaar: false) плюс "Швидкі дії"',
    mcp.includes('const AGENT_GROEP_OVERZICHT = new Set(["overzicht", "connectors", "ai", "extern"]);') &&
      mcp.includes('const AGENT_GROEP_OMGEVING = new Set(["extensie", "browser", "apparaten"]);') &&
      mcp.includes('const AGENT_GROEP_BEHEER = new Set(["orch", "tokens", "toegang"]);') &&
      mcp.includes('maakGroep("ag-groep-overzicht", "Огляд і підключення", "Overzicht en AI"') &&
      mcp.includes('maakGroep("ag-groep-omgeving", "Середовища та пристрої", "Omgeving en apparaten"') &&
      mcp.includes('maakGroep("ag-groep-beheer", "Координація й безпека", "Coördinatie en rechten"') &&
      mcp.includes('maakGroep(\n          "ag-groep-systeem",\n          "Система та журнал",\n          "Systeem en logboek"') &&
      /id:\s*"mcp-groep-acties"[\s\S]{0,180}soort:\s*"groep" as const,\s*kiesbaar:\s*false/.test(mcp) &&
      mcp.includes('agentAnkers.onderdelen.map(') &&
      !mcp.includes('"ag-tab-journaal"'),
  );

  check(
    '4 при відсутності прав (geenRecht) джерело якорів порожнє, а MaquetteAnkerRail на /agents повертає порожній масив (жодної рейки на стіні без прав)',
    pagina.includes('const geenRecht = isRechtFout(ov.fout) || isRechtFout(tok.fout) || isRechtFout(agentsFout);') &&
      /onderdelen:\s*geenRecht\s*\?\s*\[\]/.test(pagina) &&
      mcp.includes('if (agentAnkers.onderdelen.length === 0) return [];'),
  );

  check(
    '5 верхня горизонтальна смуга вкладок прибрана з AgentenPagina.tsx, збережені банер блокування та перехід на #agent/<slug>',
    !pagina.includes('<TabsRij') &&
      !pagina.includes('data-ag-ankers') &&
      !pagina.includes('useIsMaquette') &&
      pagina.includes('ag-blokkade-banner') &&
      pagina.includes("ga('agent', a.slug)") &&
      pagina.includes("'.mq-anker-onderbalk'") &&
      pagina.includes("'.mq-anker-rail[data-zijde=\"boven\"]:not([data-ingeklapt=\"ja\"])'"),
  );

  check(
    '6 сусідні панелі (VerbindingenHub.tsx) зберігають власний TabsRij',
    hub.includes('<TabsRij') && hub.includes("navKlasse='ag-tabs'"),
  );

  check(
    '7 src/mcp-domein.css забезпечує центрування й відступи для всіх 4 країв та мобільний scroll-margin-top на /agents поза «Макетом»',
    css.includes('html:not(.palet-maquette) .canonical-chrome:not(#_mq):not(#_kolom) .mcp-estate.mq-schil[data-mcp-tab="agents"] .ag-pagina{width:100%;max-width:none;margin-inline:0}') &&
      css.includes('[data-mq-rail-zijde="rechts"]{padding-right:max(var(--mcp-rail)') &&
      css.includes('[data-mq-rail-zijde="links"]{padding-left:max(var(--mcp-rail)') &&
      css.includes('[data-mq-rail-zijde="boven"]{padding-top:92px}') &&
      css.includes('[data-mq-rail-zijde="onder"]{padding-bottom:104px}') &&
      /@media \(max-width:960px\)\{[\s\S]*data-mcp-tab="agents"[\s\S]*scroll-margin-top:76px/.test(css),
  );

  check(
    '8 e2e-тест agenten.e2e.ts перевіряє групове меню .mq-anker-rail замість [role=tab]',
    e2e.includes('.mq-anker-rail') &&
      e2e.includes('Огляд і підключення') &&
      e2e.includes('Швидкі дії') &&
      !e2e.includes('[role=tab][data-tab='),
  );

  check(
    '9 відсутні символи забороненої кирилиці у змінених файлах',
    [mcp, pagina, css, e2e, lees('tests/eenheid/gemini-004-agenten-ankers-20261117.test.ts')].every(
      (inhoud) => !/[\u0401\u0451\u042a\u044a\u042b\u044b\u042d\u044d]/.test(inhoud),
    ),
  );

  return einde();
}
