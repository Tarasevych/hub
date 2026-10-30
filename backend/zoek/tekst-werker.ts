// ZOEKEN — WERKER-THREAD VOOR TEKSTEXTRACTIE (eigen ingang in de serverbundel: dist-server/zoek-werker.mjs).
//
// Draait tekst-kern.ts in een worker_thread met resourceLimits (geheugen) en een tijdslimiet die de hoofdthread bewaakt
// (tekst-extractie.ts): een kwaadaardige PDF of zip die het geheugen of de tijd opvreet, neemt alleen deze thread mee,
// niet de server. Berichten: { id, taak, bytes, mime, naam, opties, paginas?, pad? } → { id, ok, uitslag | fout }.
// Bytes gaan als ArrayBuffer over (transfer) en komen nooit in een logregel.
import { isMainThread, parentPort } from 'node:worker_threads';
import { onderdeelBytes, pdfPaginaAfbeeldingen, tekstKern, type KernOpties } from './tekst-kern';

export type WerkerTaak =
  | { id: number; taak: 'tekst'; bytes: ArrayBuffer; mime: string; naam: string; opties: KernOpties }
  | { id: number; taak: 'pdf_afbeeldingen'; bytes: ArrayBuffer; paginas: number[]; maxPerPagina?: number }
  | { id: number; taak: 'onderdeel'; bytes: ArrayBuffer; mime: string; naam: string; pad: string; opties: KernOpties };
export type WerkerAntwoord = { id: number; ok: true; uitslag: unknown } | { id: number; ok: false; fout: string };

export async function werkerTaakUitvoeren(t: WerkerTaak): Promise<unknown> {
  const bytes = new Uint8Array(t.bytes);
  if (t.taak === 'tekst') return tekstKern(bytes, t.mime, t.naam, t.opties);
  if (t.taak === 'pdf_afbeeldingen') return pdfPaginaAfbeeldingen(bytes, t.paginas, t.maxPerPagina);
  if (t.taak === 'onderdeel') { const r = await onderdeelBytes(bytes, t.mime, t.naam, t.pad, t.opties); return r ? { bytes: r.bytes.buffer.slice(r.bytes.byteOffset, r.bytes.byteOffset + r.bytes.byteLength), mime: r.mime, naam: r.naam } : null; }
  throw new Error('ONBEKENDE_TAAK');
}

if (!isMainThread && parentPort) {
  const poort = parentPort;
  poort.on('message', (t: WerkerTaak) => {
    werkerTaakUitvoeren(t)
      .then((uitslag) => {
        const antwoord: WerkerAntwoord = { id: t.id, ok: true, uitslag };
        const over: ArrayBuffer[] = [];
        if (t.taak === 'onderdeel' && uitslag && (uitslag as any).bytes instanceof ArrayBuffer) over.push((uitslag as any).bytes);
        poort.postMessage(antwoord, over);
      })
      .catch((e) => { const antwoord: WerkerAntwoord = { id: t.id, ok: false, fout: String(e instanceof Error ? (e as any).code || e.message : e).slice(0, 160) }; poort.postMessage(antwoord); });
  });
}
