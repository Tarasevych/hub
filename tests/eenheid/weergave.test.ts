// Etap 3 (13.10.2026): «простий/розширений» режим en de twee richtingen van ШІ. Regels (shared/weergave.ts), opslag op de server
// (backend/weergave.ts, app.ui_weergave onder RLS) en de namen in het menu.
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { getPool } from '../../server/platform/pg';
import { HELP_MODUS, MCP_EENVOUDIG, MCP_EXPERT, RICHTING, isExpertTab, isModus, standaardModus, zichtbaar } from '../../shared/weergave';
import { modusVan, modusZetten } from '../../backend/weergave';
import { checker } from './hulp/nep-google';

export async function main(): Promise<number> {
  const { check, einde } = checker('weergave');

  // ---------------------------------------------------------------- regels
  const app = readFileSync('src/UnifiedServiceApp.tsx', 'utf8');
  const mcpTabs = [...(/mcp:\[(.*?)\]/.exec(app)?.[1] ?? '').matchAll(/id:'([a-z]+)'/g)].map((m) => m[1]);
  const ingedeeld = [...MCP_EENVOUDIG, ...MCP_EXPERT] as string[];
  check('elk tabblad van mcp.* is ingedeeld (простий of розширений), geen dubbelen', mcpTabs.length === 12 && mcpTabs.every((t) => ingedeeld.includes(t)) && new Set(ingedeeld).size === ingedeeld.length && ingedeeld.length === mcpTabs.length, mcpTabs.join(','));
  check('простий: alleen overview, agents, connect, apps', MCP_EENVOUDIG.join() === 'overview,agents,connect,apps' && mcpTabs.filter((t) => zichtbaar('mcp', t, 'eenvoudig')).length === 4);
  check('розширений: alles zichtbaar; andere diensten nooit verborgen', mcpTabs.every((t) => zichtbaar('mcp', t, 'expert')) && zichtbaar('mail', 'dashboard', 'eenvoudig') && !isExpertTab('ai', 'tools'));
  check('standaard: eigenaar розширений, anderen простий', standaardModus(true) === 'expert' && standaardModus(false) === 'eenvoudig');
  check('isModus weigert onzin', isModus('expert') && !isModus('admin') && !isModus(undefined) && !isModus(''));
  check('richtingen: ai = «ШІ для вас», mcp = «Міст ШІ → сайт», wijzen naar elkaar', RICHTING.ai.naam[0] === 'ШІ для вас' && RICHTING.mcp.naam[0] === 'Міст ШІ → сайт' && RICHTING.ai.ander === 'mcp' && RICHTING.mcp.ander === 'ai');
  check('uitleg «?» met laag voor ontwikkelaars (richtingen en modus)', !!(RICHTING.ai.help.dev && RICHTING.mcp.help.dev && HELP_MODUS.dev) && /не є межею безпеки/i.test(HELP_MODUS.dev![0]));
  const menu = readFileSync('src/menu-preferences.tsx', 'utf8');
  check('menu en kop gebruiken dezelfde namen', menu.includes("uk:'ШІ для вас'") && menu.includes("uk:'Міст ШІ → сайт'") && app.includes("ai:tr('ШІ для вас'") && app.includes("mcp:tr('Міст ШІ → сайт'") && !/ШІ Робочий простір|міст до ШІ/.test(menu + app));
  check('tabbladen worden gefilterd met de modus (UnifiedServiceApp)', /zichtbaar\(service,item\.id,modus\)/.test(app));

  // ---------------------------------------------------------------- server
  const sys = getPool('systeem');
  const a = { id: randomUUID(), email: `w-${Date.now()}@eenheid.test`, role: 'user', status: 'approved' };
  const eigenaar = { id: randomUUID(), email: String(process.env.OWNER_EMAIL || 'eigenaar@eenheid.test'), role: 'owner', status: 'approved' };
  try {
    const v = await modusVan(a);
    check('zonder keuze: gewone gebruiker простий (niet gekozen)', v.modus === 'eenvoudig' && !v.gekozen && v.standaard === 'eenvoudig');
    const e = await modusVan(eigenaar);
    check('zonder keuze: eigenaar розширений', e.modus === 'expert' && !e.gekozen);
    check('ongeldige modus geweigerd', (await modusZetten(a, 'root')) === null);
    const z = await modusZetten(a, 'expert');
    check('keuze bewaard en teruggegeven', z?.modus === 'expert' && z.gekozen && (await modusVan(a)).modus === 'expert');
    await modusZetten(a, 'eenvoudig');
    check('opnieuw wijzigen werkt (één rij per account)', (await modusVan(a)).modus === 'eenvoudig' && (await sys.query('SELECT count(*)::int AS n FROM app.ui_weergave WHERE user_id=$1', [a.id])).rows[0].n === 1);
    const schrijf = await getPool('app').query(`UPDATE app.ui_weergave SET modus='expert' WHERE user_id=$1`, [a.id]).then(() => 'ok', (err) => String(err.code));
    check('app-rol kan niet schrijven in ui_weergave', schrijf === '42501', schrijf);
    const db = await sys.query(`INSERT INTO app.ui_weergave (user_id, modus) VALUES ($1, 'admin')`, [randomUUID()]).then(() => 'ok', (err) => String(err.code));
    check('database weigert een onbekende modus', db === '23514', db);
  } catch (err) {
    check('onverwachte fout', false, String((err as Error)?.stack || err));
  } finally {
    await sys.query('DELETE FROM app.ui_weergave WHERE user_id = ANY($1)', [[a.id, eigenaar.id]]).catch(() => undefined);
  }
  return einde();
}
