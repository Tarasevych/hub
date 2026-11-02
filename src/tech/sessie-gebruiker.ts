// Wie is aangemeld: doorgeven aan het technisch profiel (band) en aan de weergave (простий/розширений).
// Waarom hier en niet alleen in het accountmenu: op de telefoon staat het accountmenu in de zijlade en wordt het pas gemaakt als de lade
// opengaat. Dan kwam de band van het technisch profiel na het laden van een pagina niet terug (en gold de gekozen weergave niet) tot
// iemand het menu opende. Gevonden met tests/e2e/vlaggen.e2e.ts (14.10.2026). Dubbel aanroepen is onschuldig (de stores kijken of er
// iets veranderde).
import { useEffect } from 'react';
import { techGebruiker } from './tech-opslag';
import { weergaveGebruiker } from '../weergave/weergave-opslag';
import { zetZoekGebruiker } from '../zoek/zoek-recent';

/** undefined = nog onbekend (niets doen); null = niet aangemeld; anders de gebruikers-id. */
export function useSessieGebruiker(userId: string | null | undefined): void {
  useEffect(() => { if (userId !== undefined) { techGebruiker(userId); weergaveGebruiker(userId); zetZoekGebruiker(userId); } }, [userId]);
}
