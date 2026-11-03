// Meldingen v2 — één plek die van de bestaande bronnen + regels de groepen en tellers maakt (paneel én bel gebruiken dit).
import { useMemo } from 'react';
import type { ActivityEvent } from '../../connector-activiteit';
import type { LeverRegels } from '../../../shared/meldingen-v2/beleid';
import { groepeer, indeling, ontdubbelBronnen, tellers, type Tellers, type V2Groep, type V2Melding } from '../../../shared/meldingen-v2/groepering';
import { vanActiviteit, vanLokaal, vanServer, type LokaleRij, type ServerRij } from './omzetten';

export type Bronnen = { lang: 'uk' | 'nl'; local: LokaleRij[]; server: ServerRij[]; events: ActivityEvent[]; readEvents: Set<string> };
export function bouwMeldingen(b: Bronnen): V2Melding[] {
  // INTEG-001: dezelfde gebeurtenis uit de dienst (lokaal) én de server/activiteit telt één keer (ontdubbelBronnen).
  return ontdubbelBronnen([...b.local.map(vanLokaal), ...b.server.map(vanServer), ...b.events.map((e) => vanActiviteit(e, b.lang, b.readEvents.has(e.id)))]);
}
/** `bewerk` (UI-014 fase 2B, vlag meldingen-uitleg-v3): blijvende status toepassen vóór het groeperen (shared/meldingen-v2/status.ts). */
export function bouwModel(b: Bronnen, regels: LeverRegels, nu = Date.now(), bewerk?: (ms: V2Melding[]) => V2Melding[]): { meldingen: V2Melding[]; groepen: V2Groep[]; technisch: number; tellers: Tellers } {
  const alle = bewerk ? bewerk(bouwMeldingen(b)) : bouwMeldingen(b);
  const gewoon = alle.filter((m) => indeling(m) === 'gebruiker');
  const groepen = groepeer(gewoon, regels, nu);
  return { meldingen: gewoon, groepen, technisch: alle.length - gewoon.length, tellers: tellers(groepen) };
}
export const useModel = (b: Bronnen, regels: LeverRegels, actief: boolean) =>
  useMemo(() => (actief ? bouwModel(b, regels) : null), [actief, b.lang, b.local, b.server, b.events, b.readEvents, regels]);
