// Ruimtes: dunne adapter voor de browserextensie en de MCP-klanten (docs/ontwerp/RUIMTES-COMPATIBILITEIT.md).
// Puur: geen database. Vertaalt het besluit van shared/ruimte-toegang.ts (ruimteToegang) naar wat een extensie- of
// MCP-aanroep nodig heeft: welke scope een hulpmiddel heeft, of de aanroep mag, en welke status + Oekraïense uitleg.
import { ruimteToegang, type Ruimte, type RuimteCtx, type Tweetalig } from '../shared/ruimte-toegang';

export type Antwoord = { status: 200 | 401 | 403; code: string; ontkoppelen: boolean; uitleg: Tweetalig | null };

const NIET_ACTIEF: Tweetalig = { uk: 'Основний акаунт не активний: увійдіть на сайті знову.', nl: 'Het hoofdaccount is niet actief: meld u opnieuw aan op de site.' };
const TECH_WEG: Tweetalig = { uk: 'Технічний простір зараз недоступний. Приватний простір працює як звичайно.', nl: 'De technische ruimte is nu niet beschikbaar. De privéruimte werkt gewoon.' };
const UITLEG: Record<string, Tweetalig> = {
  ACCOUNT_NIET_ACTIEF: { uk: 'Акаунт не активний. Розширення від\'єднано.', nl: 'Het account is niet actief. De extensie is ontkoppeld.' },
  SITE_SESSIE_WEG: NIET_ACTIEF,
  PAUZE: { uk: 'Технічний простір на паузі. Перемкніться на нього на сайті.', nl: 'De technische ruimte staat op pauze. Schakel erheen op de site.' },
  VERLOPEN: { uk: 'Термін технічного простору минув.', nl: 'De termijn van de technische ruimte is voorbij.' },
  GRENS_VOORBIJ: { uk: 'Термін технічного простору минув.', nl: 'De termijn van de technische ruimte is voorbij.' },
};

/** Besluitcode → HTTP-antwoord. Alleen 'ACCOUNT_NIET_ACTIEF' ontkoppelt; al het andere vergrendelt alleen de technische kant. */
export function antwoordVoorCode(code: string): Antwoord {
  if (code === 'PRIVE' || code === 'TECHNISCH') return { status: 200, code, ontkoppelen: false, uitleg: null };
  if (code === 'ACCOUNT_NIET_ACTIEF') return { status: 401, code, ontkoppelen: true, uitleg: UITLEG[code] };
  return { status: 403, code, ontkoppelen: false, uitleg: UITLEG[code] ?? TECH_WEG };
}

/** Scope van een MCP-hulpmiddel: beheerhulpmiddelen technisch, al het andere prive. Onbekend = prive (minste rechten). */
export function hulpmiddelScope(naam: string, beheerNamen: Iterable<string>): Ruimte {
  for (const b of beheerNamen) if (b === naam) return 'technisch';
  return 'prive';
}

/** Eén MCP-aanroep: scope van het hulpmiddel + besluit. Een prive-hulpmiddel draait ALTIJD in scope prive (geen menging). */
export function mcpAanroep(ctx: Omit<RuimteCtx, 'bron'>, naam: string, beheerNamen: Iterable<string>): Antwoord & { scope: Ruimte } {
  const scope = hulpmiddelScope(naam, beheerNamen);
  const b = ruimteToegang({ ...ctx, bron: 'mcp' }, scope);
  if (b.toegestaan) return { ...antwoordVoorCode(scope === 'prive' ? 'PRIVE' : 'TECHNISCH'), scope };
  return { ...antwoordVoorCode(b.code), scope };
}

/** Eén extensieopdracht via het slot `slot`. Een grant van een ander slot telt nooit. */
export function extensieOpdracht(ctx: Omit<RuimteCtx, 'bron'>, slot: Ruimte, grantRuimte: Ruimte | null): Antwoord & { scope: Ruimte } {
  if (grantRuimte !== null && grantRuimte !== slot) return { ...antwoordVoorCode('NIET_GEBONDEN'), scope: slot };
  const b = ruimteToegang({ ...ctx, bron: 'extensie' }, slot);
  return { ...antwoordVoorCode(b.toegestaan ? (slot === 'prive' ? 'PRIVE' : 'TECHNISCH') : b.code), scope: slot };
}

/** Uitloggen: één tabblad (met v2) houdt lange ontgrendelingen; de site of «вийти всюди» trekt alles in. Spiegel van naUitloggen. */
export const ontgrendelingenIntrekkenBijUitloggen = (soort: 'tabblad' | 'site' | 'overal', v2Aan: boolean): boolean =>
  !(soort === 'tabblad' && v2Aan);
