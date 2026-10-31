// ORCH-001 етап 3 (31.10.2026) · Клієнт координації агентів для mcp.*/agenten → «Координація» (src/agenten/TabOrch.tsx).
// Лише виклики /api/owner/orch/* (shared/orch-model.ts ORCH_ROUTES) і завантаження пакета фрагментами по 512 КіБ із SHA-256 у
// браузері — сервер проганяє пакет через ТОЙ САМИЙ конвеєр, що й node scripts/orch.mjs inleveren. Правила: пропозиція → рішення
// власника «orch-regels» (src/besluit/besluit-client.ts, passkey) → застосування (гілка в git).
import { api } from '../platform/client';
import { foutCode } from '../platform/webauthn';
import { ORCH_LIMIETEN, ORCH_ROUTES, orchCodeTekst, type OrchOverzicht, type OrchRegelsOverzicht, type OrchUpload, type OrchVoorstel, type OrchZaak } from '../../shared/orch-model';

export type OrchContext = Record<string, unknown>;
export type InleverUitkomst = { upload: OrchUpload; record: { id: string; uitkomst: 'aanvaard' | 'geweigerd'; taakId: string | null; agent: string | null; tak: string | null; commit: string | null; bestanden: string[]; zaken: OrchZaak[]; tests: { overgeslagen?: boolean; geslaagd: number; mislukt: number; reden?: string } | null; conflicten: string[] }; registratie: { recordPad: string; taakBijgewerkt: boolean; wachtrij: unknown } | null; staatCommit: string | null };
export type ToepassenUitkomst = { voorstel: OrchVoorstel; tak: string; commit: string; gepusht: boolean; prUrl: string | null; controleer: string[]; pushDetail: string };

export const orchOverzicht = async (ctx: OrchContext) => (await api.post(ORCH_ROUTES.overzicht, ctx)).data as OrchOverzicht;
export const orchContext = async (ctx: OrchContext) => (await api.post(ORCH_ROUTES.context, ctx)).data as { bestand: string; tekst: string; regelsVersie: string; hash: string };
export const orchRegels = async (ctx: OrchContext) => (await api.post(ORCH_ROUTES.regelsOverzicht, ctx)).data as OrchRegelsOverzicht;
export const orchVoorstelMaken = async (ctx: OrchContext, bestanden: Record<string, string>) => (await api.post(ORCH_ROUTES.regelsVoorstel, { ...ctx, bestanden })).data as { voorstel: OrchVoorstel; zaken: OrchZaak[] };
export const orchVoorstelIntrekken = async (ctx: OrchContext, id: string) => (await api.post(ORCH_ROUTES.regelsIntrekken, { ...ctx, id })).data as OrchVoorstel;
export const orchToepassen = async (ctx: OrchContext, id: string, besluit: string) => (await api.post(ORCH_ROUTES.regelsToepassen, { ...ctx, id, besluit })).data as ToepassenUitkomst;
export const orchTaakStart = async (ctx: OrchContext, taak: { id: string; agent: string; tak: string; basisCommit: string; omschrijving: string }) => (await api.post(ORCH_ROUTES.taakStart, { ...ctx, ...taak })).data as { taak: { id: string }; zaken: OrchZaak[] };

/** SHA-256 (hex) van een bestand in de browser — de server vergelijkt na het laatste stuk (UPLOAD_SHA_VERSCHILT bij een verschil). */
export async function sha256Hex(bestand: Blob): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', await bestand.arrayBuffer());
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
const naarBase64 = (bytes: Uint8Array) => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); };

/**
 * Een pakket inleveren: begin (naam, grootte, sha256, taakId) → stukken van 512 KiB met offset → klaar (pijplijn). `onVoortgang`
 * krijgt de ontvangen bytes. Het antwoord van «klaar» is het record: uitkomst aanvaard/geweigerd met zaken — géén uitzondering.
 */
export async function orchInleveren(ctx: OrchContext, bestand: File, o: { taakId?: string; zonderTests?: string; onVoortgang?: (ontvangen: number, totaal: number) => void; signal?: AbortSignal } = {}): Promise<InleverUitkomst> {
  const sha256 = await sha256Hex(bestand);
  const u = (await api.post(ORCH_ROUTES.inleveringBegin, { ...ctx, naam: bestand.name, grootte: bestand.size, sha256, taakId: o.taakId || undefined })).data as OrchUpload;
  let offset = 0;
  try {
    while (offset < bestand.size) {
      if (o.signal?.aborted) throw Object.assign(new Error('AbortError'), { name: 'AbortError' });
      const stuk = new Uint8Array(await bestand.slice(offset, offset + ORCH_LIMIETEN.stukMaxBytes).arrayBuffer());
      const r = (await api.post(ORCH_ROUTES.inleveringStuk, { ...ctx, id: u.id, offset, data: naarBase64(stuk) })).data as OrchUpload;
      offset = r.ontvangen; o.onVoortgang?.(offset, bestand.size);
    }
    return (await api.post(ORCH_ROUTES.inleveringKlaar, { ...ctx, id: u.id, zonderTests: o.zonderTests || undefined })).data as InleverUitkomst;
  } catch (e) {
    try { await api.post(ORCH_ROUTES.inleveringAnnuleren, { ...ctx, id: u.id }); } catch { /* al weg */ }
    throw e;
  }
}

/** Foutcode van een orch-aanroep → tekst in de taal van de pagina (shared/orch-model.ts), met de zaken van kern/inleveren erbij. */
export function orchFoutTekst(e: unknown, lang: 'uk' | 'nl'): string {
  const code = foutCode(e);
  const data = (e as { response?: { data?: { zaken?: OrchZaak[]; detail?: string } } })?.response?.data;
  const zaken = (data?.zaken ?? []).filter((z) => z.ernst === 'fout').map((z) => `${z.code}: ${lang === 'uk' ? z.uk : z.nl}`);
  return [orchCodeTekst(lang, code), ...zaken, data?.detail ? data.detail : ''].filter(Boolean).join(' · ');
}
