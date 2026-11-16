// MELDINGEN-UX-001 (15.11.2026): het spluitvenster (toast) in mensentaal — eigenaar: «як звіт нудного поліцейського».
// Zuivere hulpfuncties (getest in tests/eenheid/meldingen-ux-001-20261115.test.ts):
//  • menselijkeTitel: een interne code tussen haakjes («(AI_NIET_TOEGESTAAN)») gaat uit de titel naar de details;
//    een agentnaam vooraan («Claude: …») wordt het logo + bovenregel, de titel zelf begint met een hoofdletter.
//  • Het logo alleen als het merk ECHT bekend is (agentnaam in de titel, of de bron zegt het) — nooit gokken (vroeger «Google» bij elke mail).
// Людська подача спливного сповіщення: код — у подробиці, ім'я агента — логотип, заголовок — суть.
import type { LogoKind } from '../mcp-ui';

export type ToastTitel = { titel: string; code?: string; agent?: { naam: string; logo: LogoKind } };

const AGENTEN: Array<[RegExp, string, LogoKind]> = [
  [/^claude(?: code)?$/i, 'Claude', 'claude'], [/^(?:chatgpt|openai)$/i, 'ChatGPT', 'openai'], [/^codex$/i, 'Codex', 'codex'],
  [/^gemini$/i, 'Gemini', 'gemini'], [/^grok$/i, 'Grok', 'grok'], [/^(?:github )?copilot$/i, 'Copilot', 'copilot'],
  [/^cursor$/i, 'Cursor', 'cursor'], [/^antigravity$/i, 'Antigravity', 'antigravity'], [/^github$/i, 'GitHub', 'github'],
];
const CODE = /\s*[([]\s*([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+|[A-Z]{2,}[0-9]{2,})\s*[)\]]\s*/;

export function menselijkeTitel(tekst: string): ToastTitel {
  let titel = String(tekst || '').trim();
  let code: string | undefined;
  const m = titel.match(CODE);
  if (m) { code = m[1]; titel = (titel.slice(0, m.index) + ' ' + titel.slice((m.index || 0) + m[0].length)).replace(/\s{2,}/g, ' ').trim().replace(/[\s:–—-]+$/, ''); }
  let agent: ToastTitel['agent'];
  const a = titel.match(/^([A-Za-z][A-Za-z ]{1,20}?)\s*[:—–-]\s+(.+)$/);
  if (a) {
    const hit = AGENTEN.find(([re]) => re.test(a[1].trim()));
    if (hit) { agent = { naam: hit[1], logo: hit[2] }; titel = a[2].trim(); }
  }
  if (titel) titel = titel.charAt(0).toLocaleUpperCase() + titel.slice(1);
  return { titel: titel || String(tekst || '').trim(), ...(code ? { code } : {}), ...(agent ? { agent } : {}) };
}

/** Kleur van de tegel per onderdeel (zelfde zachte palet als «Як приходять сповіщення»). */
const KLEUR: Record<string, string> = {
  mail: 'blauw', calendar: 'oranje', cloud: 'hemel', identity: 'rood', github: 'grijs', ai: 'paars', claude: 'paars', huis: 'groen', browser: 'teal', site: 'grijs',
};
export const tegelKleur = (sectie: string): string => KLEUR[sectie] || 'blauw';
