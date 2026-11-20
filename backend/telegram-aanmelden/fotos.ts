// TELEGRAM-002 — geschiedenis van de profielfoto van Telegram (eis van de eigenaar 14.11.2026):
//   • bij elke interactie (bericht of knop in de bot, het beveiligde venster) kijken we of de foto veranderd is;
//   • een nieuwe foto wordt bewaard (klein voorbeeld) in app.tg_fotos; vorige foto's worden NOOIT verwijderd, ook niet bij ontkoppelen;
//   • de koppeling krijgt de nieuwe foto_id, met een regel in app.tg_vingerafdruk_historie (veld fotoId) en een melding op de site.
// Een nieuwe foto zet de koppeling NIET op pauze (anders dan naam/nummer): een foto zegt weinig over overname, en de eigenaar wil
// het verloop kunnen volgen, niet geblokkeerd worden. Hoogstens één controle per Telegram per 10 minuten (geen spervuur op de API).
import { botAanroep, botBestand } from './bot-api';
import { botSleutel } from './sleutels';
import { koppelingenVanTelegram, sql } from './opslag';
import { audit, siteMelding } from './meldingen';

const ELKE_MS = 10 * 60_000;
const laatst = new Map<string, number>();
export const fotoCacheWissen = (): void => laatst.clear();

type Foto = { file_id: string; file_unique_id: string; width: number; file_size?: number };

/** Kijkt (gedempt) of de profielfoto veranderd is en legt een nieuwe vast. Fouten blijven binnen: dit mag nooit iets breken. */
export async function fotoBijwerken(telegramId: string, opties: { nu?: boolean } = {}): Promise<'zelfde' | 'nieuw' | 'geen' | 'overgeslagen'> {
  if (!/^[0-9]{1,20}$/.test(telegramId)) return 'overgeslagen';
  const t = Date.now();
  if (!opties.nu && (laatst.get(telegramId) ?? 0) > t - ELKE_MS) return 'overgeslagen';
  laatst.set(telegramId, t);
  if (laatst.size > 5000) for (const [k, v] of laatst) if (v < t - ELKE_MS) laatst.delete(k);
  try {
    const sleutel = await botSleutel();
    if (!sleutel) return 'overgeslagen';
    const r = await botAanroep<{ photos: Foto[][] }>(sleutel, 'getUserProfilePhotos', { user_id: Number(telegramId), limit: 1 });
    const maten = r.photos?.[0];
    if (!maten?.length) return 'geen';
    const klein = maten.slice().sort((a, b) => a.width - b.width)[0];
    const uniek = String(maten[0].file_unique_id || klein.file_unique_id || '').slice(0, 128);
    if (!uniek) return 'geen';
    const [al] = await sql<{ id: string }>('UPDATE app.tg_fotos SET laatst_gezien = now() WHERE telegram_id = $1 AND uniek = $2 RETURNING id', [telegramId, uniek]);
    if (!al) {
      let beeld: Buffer | null = null;
      try {
        const f = await botAanroep<{ file_path?: string }>(sleutel, 'getFile', { file_id: klein.file_id });
        beeld = f.file_path ? await botBestand(sleutel, f.file_path) : null;
      } catch { beeld = null; }
      if (beeld && beeld.length > 65536) beeld = null; // alleen het kleine voorbeeld; groter bewaren we niet
      await sql('INSERT INTO app.tg_fotos (telegram_id, uniek, beeld) VALUES ($1,$2,$3) ON CONFLICT (telegram_id, uniek) DO UPDATE SET laatst_gezien = now()', [telegramId, uniek, beeld]);
    }
    let nieuw = false;
    for (const k of await koppelingenVanTelegram(telegramId)) {
      if (k.foto_id === uniek) continue;
      nieuw = true;
      await sql('UPDATE app.tg_koppelingen SET foto_id = $2 WHERE id = $1', [k.id, uniek]);
      await sql("INSERT INTO app.tg_vingerafdruk_historie (koppeling_id, veld, oud, nieuw, uitkomst) VALUES ($1,'fotoId',$2,$3,'informatief')", [k.id, k.foto_id, uniek]);
      await audit(k.user_id, 'telegram.foto-gewijzigd', 'success', { koppeling: k.id });
      if (k.foto_id) await siteMelding(k.user_id, { uk: '🖼️ Нове фото профілю Telegram', nl: '🖼️ Nieuwe Telegram-profielfoto' },
        { uk: `У прив’язаному Telegram «${k.naam || k.gebruikersnaam || k.telegram_id}» змінилося фото профілю. Попереднє фото збережено в історії прив’язки.`,
          nl: `De profielfoto van de gekoppelde Telegram «${k.naam || k.gebruikersnaam || k.telegram_id}» is gewijzigd. De vorige foto blijft bewaard in de geschiedenis van de koppeling.` });
    }
    return nieuw || !al ? 'nieuw' : 'zelfde';
  } catch { return 'overgeslagen'; }
}

export type FotoItem = { foto: string; eerstGezien: string; laatstGezien: string; huidig: boolean };
/** Alle foto's die ooit bij deze Telegram hoorden, nieuwste eerst (alleen voor de eigenaar van de koppeling, zie routes.ts). */
export async function fotoGeschiedenis(telegramId: string, huidigeUniek: string): Promise<FotoItem[]> {
  const rijen = await sql<{ uniek: string; beeld: Buffer | null; type: string; eerst_gezien: Date; laatst_gezien: Date }>(
    'SELECT uniek, beeld, type, eerst_gezien, laatst_gezien FROM app.tg_fotos WHERE telegram_id = $1 ORDER BY laatst_gezien DESC LIMIT 50', [telegramId]);
  return rijen.map((r) => ({ foto: r.beeld ? `data:${r.type};base64,${Buffer.from(r.beeld).toString('base64')}` : '', eerstGezien: new Date(r.eerst_gezien).toISOString(),
    laatstGezien: new Date(r.laatst_gezien).toISOString(), huidig: r.uniek === huidigeUniek }));
}
