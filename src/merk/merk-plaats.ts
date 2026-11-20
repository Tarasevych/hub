// Браузерна частина бази знаків місць (PLAATS-TEKENS-001): індекс країни вантажиться лише тоді, коли треба підібрати знак
// (наприклад, у сповіщенні про вхід), і один раз за сеанс. Сам підбір — shared/plaats-teken.ts (той самий, що й на сервері).
// Browserdeel: laadt de index van één land pas als er een plaatsteken gekozen moet worden; de keuze zelf is gedeeld met de server.
import { useEffect, useState } from 'react';
import { landCode, landTekenSleutel, plaatsTekens, type PlaatsAntwoord, type PlaatsIndex, type PlaatsVraag } from '../../shared/plaats-teken';
import { PLAATS_LANDEN } from './plaats/plaats-gegenereerd';

const indexen = new Map<string, Promise<PlaatsIndex | null>>();

export function laadPlaatsIndex(land: string): Promise<PlaatsIndex | null> {
  const c = landCode(land);
  if (!c || !PLAATS_LANDEN.includes(c)) return Promise.resolve(null);
  if (!indexen.has(c)) {
    indexen.set(c, fetch(`/merk/plaats/${c.toLowerCase()}.json`, { credentials: 'same-origin' })
      .then((r) => (r.ok ? (r.json() as Promise<PlaatsIndex>) : null))
      .catch(() => { indexen.delete(c); return null; }));
  }
  return indexen.get(c)!;
}

/** Async: de keten van tekens voor een plaats (stad → regio → land). Zonder index: alleen de vlag. */
export async function zoekPlaatsTekens(vraag: PlaatsVraag): Promise<PlaatsAntwoord> {
  return plaatsTekens(vraag, await laadPlaatsIndex(String(vraag.land || '')));
}

/** React: meteen de vlag (die heeft geen index nodig), daarna de fijnere keten zodra de index binnen is. */
export function usePlaatsTekens(vraag: PlaatsVraag): PlaatsAntwoord {
  const sleutel = JSON.stringify([vraag.land, vraag.regioCode, vraag.regio, vraag.stad, vraag.geonamesId]);
  const vlag = landTekenSleutel(vraag.land);
  const leeg: PlaatsAntwoord = { teken: vlag ? { sleutel: vlag, soort: 'land' } : null, keten: vlag ? [{ sleutel: vlag, soort: 'land' }] : [], stad: null, regios: [], niveaus: vlag ? [{ soort: 'land', code: landCode(vraag.land), naam: null, vlag, wapen: null }] : [] };
  const [antwoord, setAntwoord] = useState<PlaatsAntwoord>(leeg);
  useEffect(() => {
    let weg = false;
    setAntwoord(leeg);
    void zoekPlaatsTekens(vraag).then((a) => { if (!weg) setAntwoord(a); });
    return () => { weg = true; };
  }, [sleutel]);
  return antwoord;
}
