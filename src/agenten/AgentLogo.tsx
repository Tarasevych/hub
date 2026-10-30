// Eén logo voor elke AI-agent op de hele site (Хто готує оновлення, Додати агента, Доступ ШІ, журнал, …).
// De vormen zelf staan NIET meer hier: ze komen uit het ene merkregister (src/merk/merk-register.ts + merk-tabel.ts), samen
// met de browsers, de besturingssystemen en de merken van de koppelingenpagina. Dit bestand is alleen nog de agent-specifieke
// laag: «welke tekst betekent welke agent» en de maatvoering die de agentpagina's gewend zijn.
// Onbekende agent → monogram (dat doet <Merk> zelf).
import { agentSlugUitNaam } from '../../shared/markering-agenten';
import Merk from '../merk/Merk';
import { laadMerken } from '../merk/merk-register';

// Zodra een pagina met agentlogo's geladen wordt, halen we de merkentabel op; het monogram staat dan nauwelijks merkbaar kort.
void laadMerken();

/**
 * Alles wat een agent kan heten (slug, klant-id van het journaal, clientnaam van een OAuth-registratie) → AgentSlug, of null.
 * ÉÉN regel voor de hele site ÉN voor de extensie: hij staat in shared/markering-agenten.ts, omdat de markering in het
 * tabblad met dezelfde namen moet uitkomen als deze logo's (extension/markering-agenten.js is daar de kopie van).
 */
export const agentSlugVan = agentSlugUitNaam;

export type AgentLogoProps = { agent: unknown; naam?: string; size?: number; titel?: string; className?: string };

export default function AgentLogo({ agent, naam, size = 40, titel, className }: AgentLogoProps) {
  const slug = agentSlugVan(agent);
  return (
    <Merk merk={slug} naam={naam || String(agent || '?')} maat={size} titel={titel}
      className={`agent-logo${className ? ` ${className}` : ''}`} />
  );
}
