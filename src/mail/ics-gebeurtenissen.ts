// Afspraken uit .ics-bijlagen van een gesprek (pakket 2 «Adaptive Mail Canvas», 24.10.2026): elk bestand wordt één keer gelezen
// (via de gewone bijlage-lader met zijn cache) en gedeeld door de kaart in de brief (MailGesprekInhoud) en het contextpaneel
// (ContextPaneel: tijdlijn, «Завдання й події»). Alleen lezen, nooit uitvoeren — parseIcsEvents in src/mail-agenda-contact.ts.
import { useEffect, useMemo, useState } from 'react';
import { loadMailAttachmentBlob } from '../mail-bijlage-lader';
import { parseIcsEvents } from '../mail-agenda-contact';
import type { MailAttachment } from '../MailBijlageVoorbeeld';
import { icsHeleDag, icsTijd, isIcs } from './gesprek-context';

export type IcsBron = { context: Record<string, string>; accountId: string; cacheAccountId: string };
export type IcsGebeurtenis = {
  berichtId: string; providerAttachmentId: string; filename: string;
  titel: string; start: number; einde: number; heleDag: boolean; plaats: string; organisator: string; beschrijving: string;
  /** zoals in het bestand («2026-10-28 10:00 UTC») — voor wie de omgerekende tijd wil narekenen */
  startTekst: string; tz: string;
};
/** Grotere .ics-bestanden lezen we hier niet (een uitnodiging is enkele kB); het bestand zelf blijft te openen. */
export const ICS_MAX_BYTES = 512 * 1024;

const CACHE = new Map<string, Promise<IcsGebeurtenis[]>>();
export function laadIcs(bron: IcsBron, berichtId: string, item: MailAttachment): Promise<IcsGebeurtenis[]> {
  const sleutel = `${bron.cacheAccountId || bron.accountId}\u001f${berichtId}\u001f${item.providerAttachmentId}`;
  const al = CACHE.get(sleutel);
  if (al) return al;
  const taak = loadMailAttachmentBlob({ context: bron.context, accountId: bron.accountId, cacheAccountId: bron.cacheAccountId, messageId: berichtId, item, maxBytes: ICS_MAX_BYTES })
    .then(async (r) => parseIcsEvents(await r.blob.text()).map((e): IcsGebeurtenis => {
      const tz = e.tz || '', start = icsTijd(e.startRuw || '', tz), heleDag = icsHeleDag(e.startRuw || '');
      let einde = icsTijd(e.eindeRuw || '', tz);
      if (!(einde > start)) einde = start + (heleDag ? 86_400_000 : 3_600_000);
      return {
        berichtId, providerAttachmentId: item.providerAttachmentId, filename: item.filename,
        titel: e.summary || item.filename, start, einde, heleDag, plaats: e.location, organisator: e.organizer, beschrijving: e.description,
        startTekst: e.start, tz,
      };
    }).filter((g) => g.start > 0));
  CACHE.set(sleutel, taak);
  taak.catch(() => CACHE.delete(sleutel));
  return taak;
}

/** «ср, 28 жовт., 10:00–11:00» / «wo 28 okt., 10:00–11:00»; een hele dag zonder uren; over meer dagen van … tot … */
export function afspraakTijd(g: Pick<IcsGebeurtenis, 'start' | 'einde' | 'heleDag'>, lang: 'uk' | 'nl'): string {
  const taal = lang === 'uk' ? 'uk-UA' : 'nl-BE';
  const dag = (ms: number) => new Date(ms).toLocaleDateString(taal, { weekday: 'short', day: 'numeric', month: 'short', ...(new Date(ms).getFullYear() === new Date().getFullYear() ? {} : { year: 'numeric' }) });
  const uur = (ms: number) => new Date(ms).toLocaleTimeString(taal, { hour: '2-digit', minute: '2-digit' });
  if (g.heleDag) { const laatste = g.einde - 1; return new Date(g.start).toDateString() === new Date(laatste).toDateString() ? dag(g.start) : `${dag(g.start)} – ${dag(laatste)}`; }
  return new Date(g.start).toDateString() === new Date(g.einde).toDateString() ? `${dag(g.start)}, ${uur(g.start)}–${uur(g.einde)}` : `${dag(g.start)}, ${uur(g.start)} – ${dag(g.einde)}, ${uur(g.einde)}`;
}

/** Alle afspraken uit de .ics-bijlagen van deze brieven; `aan` = false leest niets (paneel dicht, brief ingeklapt). */
export function useIcsGebeurtenissen(bron: IcsBron, brieven: Array<{ id: string; attachments: MailAttachment[] }>, aan = true): { items: IcsGebeurtenis[]; laden: boolean; fout: boolean } {
  const bijlagen = useMemo(() => brieven.flatMap((b) => (b.attachments || []).filter(isIcs).map((a) => ({ berichtId: b.id, a }))), [brieven]);
  const handtekening = bijlagen.map((x) => `${x.berichtId}:${x.a.providerAttachmentId}`).join('|');
  const [stand, setStand] = useState<{ sleutel: string; items: IcsGebeurtenis[]; laden: boolean; fout: boolean }>({ sleutel: '', items: [], laden: false, fout: false });
  useEffect(() => {
    if (!aan || !bijlagen.length) { setStand((s) => (s.sleutel === handtekening && !s.items.length && !s.laden && !s.fout ? s : { sleutel: handtekening, items: [], laden: false, fout: false })); return; }
    let levend = true;
    setStand((s) => ({ ...s, sleutel: handtekening, laden: true }));
    void Promise.allSettled(bijlagen.map((x) => laadIcs(bron, x.berichtId, x.a))).then((uit) => {
      if (!levend) return;
      const items = uit.flatMap((r) => (r.status === 'fulfilled' ? r.value : [])).sort((a, b) => a.start - b.start);
      setStand({ sleutel: handtekening, items, laden: false, fout: uit.some((r) => r.status === 'rejected') });
    });
    return () => { levend = false; };
  }, [handtekening, aan, bron.accountId, bron.cacheAccountId]);
  return stand.sleutel === handtekening ? stand : { items: [], laden: aan && bijlagen.length > 0, fout: false };
}
