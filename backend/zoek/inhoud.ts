// ZOEKEN — INHOUD VAN ÉÉN BESTAND NAAR TEKST (compatibiliteitslaag over tekst-extractie.ts).
//
// Sinds 22.10.2026 is backend/zoek/tekst-extractie.ts (`tekstUit`, `ocrPlan`, `ocrUitvoeren`) de echte ingang: alle
// formaten (txt/csv/json/pdf/docx/xlsx/pptx/odf/html/eml/afbeelding/zip/tar/gz), werker-thread met geheugen- en
// tijdslimiet, OCR-plan en OCR-cache per gebruiker/ruimte. Deze functie blijft bestaan voor bestaande aanroepers
// (backend/zoek/bronnen.ts) en geeft dezelfde vorm terug: één deel per bestand, bij archieven één deel per onderdeel.
// LET OP: OCR wordt hier NIET meer direct gedraaid (de `deps.engine` wordt genegeerd): een scan krijgt status
// 'ocr_nodig' (engine aanwezig) of 'ocr_niet_beschikbaar'; de aanroeper plant OCR via ocrUitvoeren() in de wachtrij.
import type { ArchiefGrenzen, ArchiefProbleem } from './archief';
import type { TekstDeps } from './ocr';
import { tekstUit, type TekstUitslag } from './tekst-extractie';

export type InhoudDeel = { pad: string; naam: string; sha256: string; tekst: string; status: TekstUitslag['status']; herkomst: TekstUitslag['herkomst']; paginas?: TekstUitslag['paginas']; ocrPaginas?: number[] };
export type InhoudUitslag = { sha256: string; delen: InhoudDeel[]; problemen: ArchiefProbleem[]; archief: boolean; ocrNietBeschikbaar: boolean; ocrNodig: boolean; status: TekstUitslag['status']; fout?: string };

export async function inhoudNaarTekst(bytes: Uint8Array, mimeType: string, naam: string, _deps?: TekstDeps | null, grenzen: Partial<ArchiefGrenzen> = {}): Promise<InhoudUitslag> {
  const r = await tekstUit({ bytes, mime: mimeType, naam, archief: grenzen, ocr: 'plan' });
  const archief = r.herkomst === 'archief';
  const delen: InhoudDeel[] = archief
    ? (r.onderdelen || []).map((d) => ({ pad: d.pad, naam: d.naam, sha256: d.sha256, tekst: d.tekst, status: d.status, herkomst: d.herkomst, paginas: d.paginas, ocrPaginas: d.ocrPlan?.nodig ? d.ocrPlan.paginas : undefined }))
    : [{ pad: '', naam, sha256: r.sha256, tekst: r.tekst, status: r.status, herkomst: r.herkomst, paginas: r.paginas, ocrPaginas: r.ocrPlan?.nodig ? r.ocrPlan.paginas : undefined }];
  // E-mailbijlagen (eml) komen óók als losse delen mee, zodat een bijlage in een .eml vindbaar is.
  if (!archief && r.onderdelen?.length) for (const d of r.onderdelen) delen.push({ pad: d.pad, naam: d.naam, sha256: d.sha256, tekst: d.tekst, status: d.status, herkomst: d.herkomst, paginas: d.paginas, ocrPaginas: d.ocrPlan?.nodig ? d.ocrPlan.paginas : undefined });
  const alle = [r.status, ...delen.map((d) => d.status)];
  return { sha256: r.sha256, delen, problemen: (r.problemen || []) as ArchiefProbleem[], archief, ocrNietBeschikbaar: alle.includes('ocr_niet_beschikbaar'), ocrNodig: alle.includes('ocr_nodig'), status: r.status, fout: r.fout };
}
