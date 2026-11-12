// APPARAAT-001 — de snelle stroom in de browser: één EventSource per tabblad naar GET /api/owner/stroom (SSE), met een eerlijke
// terugval: lukt de stroom niet (oude server, tunnel die SSE knijpt, vlag uit), dan merkt niemand dat — de luisteraar vraagt dan
// zelf om de paar seconden (open-verzoeken). De stroom is versnelling, geen voorwaarde.
import type { StroomGebeurtenis } from '../../shared/apparaat-bevestiging/model';

type Luisteraar = (g: StroomGebeurtenis) => void;
type Verbinding = { bron: EventSource; luisteraars: Set<Luisteraar>; sleutel: string; verbonden: boolean; pogingen: number; timer: number };
let verbinding: Verbinding | null = null;

const MAX_POGINGEN = 6;

/** Luister naar gebeurtenissen voor dit account; geeft een afmeldfunctie. Meerdere luisteraars delen één verbinding. */
export function abonneer(ctx: { service: string; tabContext: string }, fn: Luisteraar): () => void {
  if (typeof window === 'undefined' || typeof EventSource === 'undefined') return () => undefined;
  const sleutel = `${ctx.service}|${ctx.tabContext}`;
  if (!verbinding || verbinding.sleutel !== sleutel) { verbinding?.bron.close(); verbinding = openen(sleutel, ctx); }
  verbinding.luisteraars.add(fn);
  return () => { verbinding?.luisteraars.delete(fn); if (verbinding && !verbinding.luisteraars.size) { verbinding.bron.close(); window.clearTimeout(verbinding.timer); verbinding = null; } };
}
/** Is de snelle stroom nu verbonden? (de luisteraar vertraagt dan zijn eigen navraag) */
export const stroomVerbonden = (): boolean => !!verbinding?.verbonden;

function openen(sleutel: string, ctx: { service: string; tabContext: string }): Verbinding {
  const url = `/api/owner/stroom?service=${encodeURIComponent(ctx.service)}&tabContext=${encodeURIComponent(ctx.tabContext)}`;
  const v: Verbinding = { bron: new EventSource(url), luisteraars: new Set(), sleutel, verbonden: false, pogingen: 0, timer: 0 };
  const koppel = (bron: EventSource) => {
    bron.onopen = () => { v.verbonden = true; v.pogingen = 0; };
    bron.onerror = () => {
      v.verbonden = false;
      bron.close();
      // Zelf opnieuw verbinden met oplopende wachttijd; na MAX_POGINGEN alleen nog de langzame navraag (geen eindeloze pogingen).
      if (v.pogingen >= MAX_POGINGEN) return;
      v.pogingen++;
      v.timer = window.setTimeout(() => { if (verbinding === v) { v.bron = new EventSource(url); koppel(v.bron); } }, Math.min(30_000, 1000 * 2 ** v.pogingen));
    };
    for (const soort of ['apparaat.verzoek', 'apparaat.afgerond'] as const) {
      bron.addEventListener(soort, (e) => {
        try { const g = JSON.parse((e as MessageEvent).data) as StroomGebeurtenis; for (const l of v.luisteraars) l(g); } catch { /* onleesbaar: negeren */ }
      });
    }
  };
  koppel(v.bron);
  return v;
}
