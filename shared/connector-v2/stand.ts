// Connector v2 — de WAARHEID over «is deze AI verbonden?» (20.10.2026, klacht van de eigenaar: «Агенти досі не інтегровано?»).
//
// Tot nu toe telde de hub alleen de v2-koppelingen (app.mcp_oauth_tokens.agent = slug). Maar een mens kan dezelfde AI op drie
// wegen hebben verbonden, en alle drie WERKEN:
//   1. v2       — het eigen adres /<agent> (de weg die we aanbieden);
//   2. erfenis  — het oude gedeelde /mcp (agent IS NULL) van dezelfde AI-klant: backend/connector-v2-erfenis.ts laat zo'n token
//                 op /<agent> werken met de rechten van toen;
//   3. deur     — de serverdeur (deploy/mcp/server.mjs, poort 8091): de tunnelregel stuurde /claude daar nog heen, dus de eigenaar
//                 verbond Claude via de deur en de hub zei «не підключено». De deur is de OUDE weg: tonen, met de raad opnieuw te
//                 verbinden via het eigen adres.
// Puur (geen React, geen Node): de pagina van één agent, de connectorlijst, admin → Доступ ШІ en de tests rekenen hier allemaal
// met dezelfde regel.
import type { AiRuimte } from '../ai-ruimte';
import type { Kant } from './catalogus';
import { V2_OPTIES } from './catalogus';

export type VerbindingSoort = 'v2' | 'erfenis' | 'deur';
export type StandCode = 'v2' | 'erfenis' | 'deur' | 'wacht' | 'geen';

export type StandInvoer = {
  v2: number;
  erfenis: number;
  /** null = de deur is onbereikbaar of niet voor deze mens zichtbaar (onbekend, niet «nul»). */
  deur: number | null;
  wacht?: boolean;
};

export type Stand = {
  code: StandCode;
  /** Werkt deze AI nu ergens (langs welke weg dan ook)? */
  verbonden: boolean;
  /** Alleen de oude weg(en): de mens moet opnieuw verbinden via het eigen adres om bij v2 te horen. */
  alleenOud: boolean;
  totaal: number;
  uk: string;
  nl: string;
};

/** Eén regel voor «підключено / стара дорога / чекає / не підключено». */
export function standVan(i: StandInvoer): Stand {
  const v2 = Math.max(0, i.v2 | 0), erf = Math.max(0, i.erfenis | 0), deur = i.deur === null ? 0 : Math.max(0, i.deur | 0);
  const totaal = v2 + erf + deur;
  if (i.wacht) return { code: 'wacht', verbonden: totaal > 0, alleenOud: v2 === 0 && totaal > 0, totaal, uk: 'чекає перепідключення', nl: 'wacht op opnieuw verbinden' };
  if (v2 > 0) return { code: 'v2', verbonden: true, alleenOud: false, totaal, uk: `підключено: ${totaal}`, nl: `gekoppeld: ${totaal}` };
  if (erf > 0) return { code: 'erfenis', verbonden: true, alleenOud: true, totaal, uk: `підключено через стару спільну адресу: ${erf}`, nl: `gekoppeld via het oude gedeelde adres: ${erf}` };
  if (deur > 0) return { code: 'deur', verbonden: true, alleenOud: true, totaal, uk: `стара дорога (двері сервера): ${deur} — перепідключіть`, nl: `oude weg (serverdeur): ${deur} — verbind opnieuw` };
  return { code: 'geen', verbonden: false, alleenOud: false, totaal: 0, uk: 'не підключено', nl: 'niet gekoppeld' };
}

/** Uitleg per soort verbinding (voor het lijstje op de pagina van één agent). */
export const SOORT_TEKST: Readonly<Record<VerbindingSoort, { uk: string; nl: string; oud: boolean }>> = Object.freeze({
  v2: { uk: 'власна адреса', nl: 'eigen adres', oud: false },
  erfenis: { uk: 'стара спільна адреса /mcp — працює, права як тоді; перепідключіть через власну адресу', nl: 'oud gedeeld adres /mcp — werkt, rechten van toen; verbind opnieuw via het eigen adres', oud: true },
  deur: { uk: 'стара дорога: двері сервера — перепідключіть через власну адресу', nl: 'oude weg: serverdeur — verbind opnieuw via het eigen adres', oud: true },
});

/**
 * Welke sleutels (`${id}:${kant}`) bestaan NU voor deze mens: de privékant altijd, de beheerkant alleen in de technische ruimte
 * (dezelfde regel als backend/connector-v2.ts → v2Lijst, maar zonder de hulpmiddelen zelf op te halen). Alleen actieve opties.
 */
export function zichtbareSleutels(sleutels: readonly string[], kanten: readonly Kant[], ruimte: AiRuimte): string[] {
  const actief = new Set(V2_OPTIES.filter((o) => o.status === 'actief').map((o) => o.key));
  return sleutels.filter((k) => {
    if (!actief.has(k)) return false;
    const kant = k.slice(k.lastIndexOf(':') + 1) as Kant;
    if (!kanten.includes(kant)) return false;
    return kant === 'gebruiker' || ruimte === 'technisch';
  });
}

/** Welke kanten gelden NU (de beheerkant alleen zolang de technische ruimte leeft). */
export const levendeKanten = (kanten: readonly Kant[], ruimte: AiRuimte): Kant[] => kanten.filter((k) => k === 'gebruiker' || ruimte === 'technisch');
