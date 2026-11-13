// Kleine hulpjes van de cloud-vNext-UI (uitvoerder B): base64 → bytes, een blob laten bewaren als download,
// het lucide-icoon per bestandssoort en de eerlijke fouttekst die NOG_NIET_GEBOUWD apart benoemt.
import { File, FileArchive, FileAudio2, FileCode2, FileImage, FileSpreadsheet, FileText, FileType2, FileVideo2, Link2, NotebookPen, Presentation } from 'lucide-react';
import type { CloudSoort } from '../../shared/cloud-vnext-model';
import { CloudFout } from './cloud-client';
import { foutTekst, tr, type Lang } from './tekst';

/** base64 → bytes (tegenhanger van naarB64 in cloud-client). */
export function vanB64(data: string): Uint8Array {
  const bin = atob(data); const uit = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) uit[i] = bin.charCodeAt(i);
  return uit;
}

/** Blob als download aan de gebruiker geven (a[download], geen navigatie). */
export function bewaarBlob(naam: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = naam || 'bestand'; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export const SOORT_ICOON: Record<CloudSoort, typeof File> = {
  afbeelding: FileImage, video: FileVideo2, audio: FileAudio2, document: FileText, werkblad: FileSpreadsheet,
  presentatie: Presentation, pdf: FileType2, archief: FileArchive, code: FileCode2, tekst: FileText,
  notitie: NotebookPen, link: Link2, overig: File,
};

/** Is dit de eerlijke «de serverkant is nog in aanbouw»-fout van het vNext-geraamte? */
export const isBouwFout = (e: unknown): boolean => e instanceof CloudFout && e.code === 'NOG_NIET_GEBOUWD';
/** Fouttekst met NOG_NIET_GEBOUWD apart benoemd (staat niet in tekst.ts omdat het geen blijvende code is). */
export function cloudFoutTekst(lang: Lang, e: unknown): string {
  if (isBouwFout(e)) return tr(lang, 'Серверна частина цього розділу ще збирається.', 'De serverkant van dit onderdeel is nog in aanbouw.');
  const code = e instanceof CloudFout ? e.code : String((e as Error)?.message || 'FOUT');
  // SEC-002: het antwoordlichaam gaat mee (quota-getallen, incidentnummer van een interne fout).
  return foutTekst(lang, code, e instanceof CloudFout ? e.data : undefined);
}

/** Lees-en-wis van een sessiesleutel (overdracht tussen tabbladen zoals 'cvn-open'). */
export function sessieNeem(sleutel: string): string {
  try { const w = sessionStorage.getItem(sleutel) || ''; sessionStorage.removeItem(sleutel); return w; } catch { return ''; }
}
export function sessieLees(sleutel: string): string { try { return sessionStorage.getItem(sleutel) || ''; } catch { return ''; } }
export function sessieZet(sleutel: string, waarde: string): void { try { if (waarde) sessionStorage.setItem(sleutel, waarde); else sessionStorage.removeItem(sleutel); } catch { /* privémodus: geen overdracht, geen crash */ } }
