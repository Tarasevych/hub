// Дошка ШІ: адміністратор вимикає — приватний шлях відмовляє; технічні інструменти на дошку не потрапляють;
// вкладка MCP є лише там, де каталог клієнта її підтримує.
import { checker } from './hulp/nep-google';
import {
  BORD_AGENTEN, MCP_URL, PRIVE_CAPS, SITE_REGEL, STANDAARD_STAAT, connectGeweigerd, mcpIngang, staatVanRijen, tabsVoor, toolGeweigerd,
} from '../../shared/ai-agent-bord';

export async function main(): Promise<number> {
  const { check, einde } = checker('ai-agent-bord');
  const uit = { agent: {}, methode: {}, cap: { 'mail.read': false } };
  const claudeUit = { agent: { claude: false as const }, methode: {}, cap: {} };

  check('вимкнена адміном можливість відмовляється на приватному шляху інструмента',
    toolGeweigerd(uit, { ruimte: 'prive', tool: 'mail_search_messages', klant: 'claude' })?.code === 'CAP_UIT');
  check('той самий перемикач не ріже технічний простір',
    toolGeweigerd(uit, { ruimte: 'technisch', tool: 'mail_search_messages', klant: 'claude' }) === null);
  check('технічний інструмент приватному підключенню не віддається',
    toolGeweigerd(STANDAARD_STAAT, { ruimte: 'prive', tool: 'get_live_release', klant: 'claude' })?.code === 'CAP_TECHNISCH'
    && toolGeweigerd(STANDAARD_STAAT, { ruimte: 'prive', tool: 'uitrol_voorstel_begin', klant: 'grok' })?.code === 'CAP_TECHNISCH');
  check('власне вимкнення можливості для цього ШІ теж відмовляє',
    toolGeweigerd(STANDAARD_STAAT, { ruimte: 'prive', tool: 'drive_read_file', klant: 'cursor', gebruiker: { 'drive.read': false } })?.code === 'CAP_GEBRUIKER');
  check('стеля сайту сильніша за особисте «увімкнено»',
    toolGeweigerd(uit, { ruimte: 'prive', tool: 'mail_search_messages', klant: 'claude', gebruiker: { 'mail.read': true } })?.code === 'CAP_UIT');

  check('вимкнений агент не отримує приватне підключення MCP',
    connectGeweigerd(claudeUit, { ruimte: 'prive', klant: 'claude', methode: 'mcp' })?.code === 'AGENT_UIT');
  check('вимкнений спосіб токена відмовляє навіть дозволеному агенту',
    connectGeweigerd({ agent: {}, methode: { token: false }, cap: {} }, { ruimte: 'prive', klant: 'cursor', methode: 'token' })?.code === 'METHODE_UIT');
  check('двері сервера з приватного шляху заборонені',
    connectGeweigerd(STANDAARD_STAAT, { ruimte: 'prive', klant: 'grok', methode: 'deur' })?.code === 'DEUR_VERBODEN');
  check('технічне підключення не блокується вимикачем агента',
    connectGeweigerd(claudeUit, { ruimte: 'technisch', klant: 'claude', methode: 'mcp' }) === null);
  check('Gemini не має способу токена — видача відмовляється',
    connectGeweigerd(STANDAARD_STAAT, { ruimte: 'prive', klant: 'gemini', methode: 'token' })?.code === 'METHODE_NIET'
    && connectGeweigerd(STANDAARD_STAAT, { ruimte: 'prive', klant: 'gemini', methode: 'mcp' })?.code === 'METHODE_NIET');

  const tekst = JSON.stringify(BORD_AGENTEN);
  check('дошка не виставляє двері й технічні інструменти',
    !tekst.includes('/Grok') && !tekst.includes('mcp.tarasevych.com/claude') && !tekst.includes('uitrol_') && !tekst.includes('get_live_release') && !tekst.includes('"deur"'));
  check('можливості дошки не містять керування сайтом',
    PRIVE_CAPS.every((c) => !['server.read', 'deploy.status', 'deploy.release', 'policy.change'].includes(c.id)) && PRIVE_CAPS.some((c) => c.id === 'mail.read'));
  check('вкладка MCP береться з каталогу: є в Claude, немає в Gemini',
    tabsVoor('claude').includes('mcp') && tabsVoor('claude').includes('token') && tabsVoor('claude')[0] === 'kaart'
    && !tabsVoor('gemini').includes('mcp') && !tabsVoor('gemini').includes('token') && tabsVoor('gemini').includes('kaart') && tabsVoor('gemini').includes('umovy'));
  check('адміністратор вимкнув MCP — вкладка зникає навіть у Claude',
    !tabsVoor('claude', { agent: {}, methode: { mcp: false }, cap: {} }).includes('mcp') && tabsVoor('claude', { agent: {}, methode: { mcp: false }, cap: {} }).includes('token'));
  check('вимкнений агент лишає лише візитну картку', tabsVoor('claude', claudeUit).join() === 'kaart');
  check('невідомий ключ перемикача не стає станом',
    Object.keys(staatVanRijen([{ sleutel: 'cap:server.read', aan: false }, { sleutel: 'deur:Grok', aan: false }, { sleutel: 'cap:mail.read', aan: false }]).cap).join() === 'mail.read');

  check('приватна закладка mcp/agents веде на дошку ШІ', JSON.stringify(mcpIngang('agents', false)) === JSON.stringify({ service: 'ai', tab: 'verbindingen' }));
  check('вікно дозволу OAuth на agents лишається', mcpIngang('agents', false, true) === null);
  check('технічний профіль з огляду потрапляє на технічні підключення, сторінка управління лишається',
    JSON.stringify(mcpIngang('overview', true)) === JSON.stringify({ service: 'mcp', tab: 'verbindingen' }) && mcpIngang('verbindingen', true) === null && mcpIngang('dashboard', false) === null);
  check('конектор лишається адресою протоколу, не сторінкою', MCP_URL === 'https://mcp.tarasevych.com/mcp' && /жоден користувач/.test(SITE_REGEL.uk));

  return einde();
}
