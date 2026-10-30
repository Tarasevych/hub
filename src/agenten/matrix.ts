// Matrix «Що через який спосіб» op het overzicht van de hub «Підключення ШІ» (contract EXT-06 §4). Puur (geen React/DOM): getest in
// tests/eenheid/ai-hub.test.ts. Rijen = methoden, kolommen = wat ze bereiken; per cel ✓ nu toegestaan / ○ mogelijk na toestemming /
// — nooit. Berekend uit echte gegevens: de ruimte van de hulpmiddelen (shared/ai-ruimte.ts: toolRuimte, de TECHNISCH-lijst), de
// actieve verbindingen/tokens/toestemmingen, de sloten van de extensie (ontgrendelingen) en het beleid uit extensie-status.
// Alleen wat bij dit account hoort: zonder technisch profiel bestaan de kolommen Адміністрування/Сервер en de rij «Розширення —
// технічний» niet (ook niet als «—»).
import { toolRuimte, type ToolRuimte } from '../../shared/ai-ruimte';
import { ADMIN_HOSTS_TOEGESTAAN, PRIVE_HOSTS } from '../../shared/extensie-ontgrendeling';

export type Cel = 'ja' | 'kan' | 'nooit';
export type MethodeId = 'connector' | 'ext-prive' | 'ext-technisch' | 'pc' | 'lokaal' | 'token';
export type DoelId = 'mail' | 'drive' | 'bord' | 'agenda' | 'github' | 'apparaten' | 'paginas' | 'beheer' | 'server';
type T2 = readonly [uk: string, nl: string];

export const METHODEN: ReadonlyArray<{ id: MethodeId; naam: T2; uitleg: T2; tab: string }> = [
  { id: 'connector', naam: ['Конектор ШІ', 'AI-connector'], uitleg: ['Claude, ChatGPT, Grok… через MCP/OAuth', 'Claude, ChatGPT, Grok… via MCP/OAuth'], tab: 'connectors' },
  { id: 'ext-prive', naam: ['Розширення — користувач', 'Extensie — gebruiker'], uitleg: ['ваші сторінки в цьому браузері', 'uw pagina’s in deze browser'], tab: 'extensie' },
  { id: 'ext-technisch', naam: ['Розширення — технічний', 'Extensie — technisch'], uitleg: ['адмін-сторінки, лише в технічному профілі', 'beheerpagina’s, alleen in het technisch profiel'], tab: 'extensie' },
  { id: 'pc', naam: ['Агент на ПК', 'Agent op pc'], uitleg: ['файли й команди на вашому ПК', 'bestanden en opdrachten op uw pc'], tab: 'apparaten' },
  { id: 'lokaal', naam: ['Локальний агент', 'Lokale agent'], uitleg: ['через розширення, лише читання', 'via de extensie, alleen lezen'], tab: 'extensie' },
  { id: 'token', naam: ['Токен', 'Token'], uitleg: ['MCP-токен для агента', 'MCP-token voor een agent'], tab: 'tokens' },
];

/** Per doel: een representatief hulpmiddel (ruimte via toolRuimte) en de hosts waarop de extensie het bereikt. */
export const DOELEN: ReadonlyArray<{ id: DoelId; naam: T2; tool: string; hosts: readonly string[]; tech?: true }> = [
  { id: 'mail', naam: ['Пошта', 'Mail'], tool: 'mail_search_messages', hosts: ['mail.tarasevych.com'] },
  { id: 'drive', naam: ['Диск', 'Drive'], tool: 'drive_read_file', hosts: ['cloud.tarasevych.com'] },
  { id: 'bord', naam: ['Дошка/нотатки', 'Bord/notities'], tool: 'mcp_board_list', hosts: ['hub.tarasevych.com'] },
  { id: 'agenda', naam: ['Календар', 'Agenda'], tool: 'calendar_list_events', hosts: ['hub.tarasevych.com'] },
  { id: 'github', naam: ['GitHub', 'GitHub'], tool: 'github_list_repos', hosts: ['github.tarasevych.com'] },
  { id: 'apparaten', naam: ['Пристрої', 'Apparaten'], tool: 'machine_exec', hosts: [] },
  { id: 'paginas', naam: ['Сторінки сайту', 'Pagina’s van de site'], tool: 'navigate_page', hosts: ['mcp.tarasevych.com', 'ai.tarasevych.com', 'id.tarasevych.com', 'huis.tarasevych.com'] },
  { id: 'beheer', naam: ['Адміністрування', 'Beheer'], tool: 'get_admin_view', hosts: ['admin.tarasevych.com'], tech: true },
  { id: 'server', naam: ['Сервер', 'Server'], tool: 'get_system_health', hosts: [], tech: true },
];

/** Een slot van de extensie: gekoppeld, open ontgrendeling (domeinen) en wat het beleid toelaat. */
export type SlotInvoer = { gekoppeld: boolean; open: string[] | null; toegestaan: readonly string[]; uit: boolean };
export type MatrixInvoer = {
  techProfiel: boolean;
  connector: { prive: number; technisch: number };
  tokens: { prive: number; technisch: number };
  pc: { totaal: number; metToestemming: number };
  extPrive: SlotInvoer;
  extTech: SlotInvoer | null;
  /** Lokale agent: open = domeinen van een ontgrendeling met lokaal=true; mag = beleid staat het toe. */
  lokaal: { open: string[] | null; mag: boolean };
};
export type Matrix = { kolommen: DoelId[]; rijen: Array<{ methode: MethodeId; cellen: Record<DoelId, Cel> }> };

const ruimteVan = (d: DoelId): ToolRuimte => toolRuimte(DOELEN.find((x) => x.id === d)!.tool);
const raakt = (hosts: readonly string[], lijst: readonly string[] | null) => !!lijst && hosts.some((h) => lijst.includes(h));

function viaVerbinding(d: DoelId, n: { prive: number; technisch: number }, m: MatrixInvoer): Cel {
  const r = ruimteVan(d);
  if (r === 'technisch') return n.technisch > 0 ? 'ja' : 'kan';
  if (d === 'apparaten') return n.prive > 0 && m.pc.metToestemming > 0 ? 'ja' : 'kan';
  // Browserhulpmiddelen (navigate_page …) werken via het slot «як користувач» van de extensie.
  if (d === 'paginas') return n.prive > 0 && raakt(DOELEN.find((x) => x.id === d)!.hosts, m.extPrive.open) ? 'ja' : 'kan';
  return n.prive > 0 ? 'ja' : 'kan';
}
function viaSlot(d: DoelId, slot: SlotInvoer, grens: readonly string[]): Cel {
  const hosts = DOELEN.find((x) => x.id === d)!.hosts.filter((h) => grens.includes(h));
  if (!hosts.length || slot.uit) return 'nooit';
  if (raakt(hosts, slot.open)) return 'ja';
  return hosts.some((h) => slot.toegestaan.includes(h)) ? 'kan' : 'nooit';
}

export function berekenMatrix(m: MatrixInvoer): Matrix {
  const kolommen = DOELEN.filter((d) => m.techProfiel || !d.tech).map((d) => d.id);
  const methoden = METHODEN.filter((x) => x.id !== 'ext-technisch' || (m.techProfiel && m.extTech)).map((x) => x.id);
  const rijen = methoden.map((methode) => {
    const cellen = {} as Record<DoelId, Cel>;
    for (const d of kolommen) {
      cellen[d] = methode === 'connector' ? viaVerbinding(d, m.connector, m)
        : methode === 'token' ? viaVerbinding(d, m.tokens, m)
        : methode === 'pc' ? (d === 'apparaten' ? (m.pc.metToestemming > 0 ? 'ja' : 'kan') : 'nooit')
        : methode === 'ext-prive' ? viaSlot(d, m.extPrive, PRIVE_HOSTS)
        : methode === 'ext-technisch' ? (m.extTech ? viaSlot(d, m.extTech, ADMIN_HOSTS_TOEGESTAAN) : 'nooit')
        : /* lokaal */ (() => {
          const hosts = DOELEN.find((x) => x.id === d)!.hosts;
          if (!hosts.length || !m.lokaal.mag) return 'nooit';
          const grens = m.techProfiel ? ADMIN_HOSTS_TOEGESTAAN : PRIVE_HOSTS;
          if (!hosts.some((h) => grens.includes(h))) return 'nooit';
          return raakt(hosts, m.lokaal.open) ? 'ja' : 'kan';
        })();
    }
    return { methode, cellen };
  });
  return { kolommen, rijen };
}

export const CEL_TEKEN: Readonly<Record<Cel, string>> = { ja: '✓', kan: '○', nooit: '—' };
export const CEL_TEKST: Readonly<Record<Cel, T2>> = {
  ja: ['дозволено зараз', 'nu toegestaan'], kan: ['можливо після дозволу', 'mogelijk na toestemming'], nooit: ['ніколи', 'nooit'],
};
