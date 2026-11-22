import { createHash, randomUUID } from 'node:crypto';
import type { Contactmoment, Klant, Klantbewerking, Klantgegevens, Klantuitkomst, Vervolgtaak, Verkoopkans } from '../shared/klantrelatiebeheer';
import { alsGebruiker } from './ai-toestemmingen';
import { kenmerk, klantopdracht, Klantfout } from './klantrelatiebeheer-invoer';
import { kluisStand, ontzegelMetDek, sleutelOpen, verzegelMetDek, type KluisLade } from './sleutelkluis';

type Ontvangst = { afdruk: string; uitkomst: Klantuitkomst };
type Rijen = { klant: Klant; kans: Verkoopkans; contact: Contactmoment; taak: Vervolgtaak; ontvangst: Ontvangst };
type Soort = keyof Rijen;
type Vraag = Parameters<Parameters<typeof alsGebruiker>[1]>[0];
const TABEL = 'app.klantrelatieboek';
const binding = (lade: KluisLade, soort: Soort, id: string) => JSON.stringify([TABEL, lade.userId, lade.ruimte, soort, id]);
const eigenSleutel = (lade: KluisLade) => {
  const sleutel = sleutelOpen(lade);
  if (!sleutel) throw new Klantfout('SLEUTELKLUIS_GESLOTEN', 423);
  return sleutel;
};

async function boek(lade: KluisLade) {
  const stand = await kluisStand(lade);
  if (stand === 'uit') throw new Klantfout('KLANT_SLEUTELKLUIS_NODIG', 423);
  if (stand === 'gesloten') throw new Klantfout('SLEUTELKLUIS_GESLOTEN', 423);
  return {
    pak<S extends Soort>(soort: S, id: string, rij: Rijen[S]) {
      const aad = binding(lade, soort, id);
      const inhoud = JSON.stringify(rij);
      return verzegelMetDek(eigenSleutel(lade), inhoud, aad);
    },
    open<S extends Soort>(soort: S, id: string, zegel: string): Rijen[S] {
      const aad = binding(lade, soort, id);
      const inhoud = ontzegelMetDek(eigenSleutel(lade), zegel, aad);
      return JSON.parse(inhoud) as Rijen[S];
    },
  };
}
async function inRuimte<T>(lade: KluisLade, werk: (q: Vraag) => Promise<T>) {
  return alsGebruiker(lade.userId, async q => {
    await q("SELECT set_config('app.ruimte', $1, true)", [lade.ruimte]);
    return werk(q);
  });
}
async function inhoudVan(q: Vraag, lade: KluisLade, soort: Soort, id: string): Promise<{ inhoud: string | null } | undefined> {
  const { rows } = await q('SELECT inhoud FROM app.klantrelatieboek WHERE gebruiker=$1 AND ruimte=$2 AND soort=$3 AND id=$4',
    [lade.userId, lade.ruimte, soort, id]);
  return rows[0];
}
async function schrijfgrendel(q: Vraag, lade: KluisLade) {
  // Dezelfde grendel voor schrijven en wissen, ook bij twee serverprocessen.
  await q('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [JSON.stringify([TABEL, lade.userId, lade.ruimte])]);
}

export async function leesKlant(lade: KluisLade, id: string): Promise<Klant> {
  const klantId = kenmerk(id);
  const zegel = await boek(lade);
  const rij = await inRuimte(lade, q => inhoudVan(q, lade, 'klant', klantId));
  if (!rij?.inhoud) throw new Klantfout('KLANT_NIET_GEVONDEN', 404);
  return zegel.open('klant', klantId, rij.inhoud);
}

export async function leesKlantgegevens(lade: KluisLade): Promise<Klantgegevens> {
  const zegel = await boek(lade);
  const { rows } = await inRuimte(lade, q => q(
    "SELECT id, soort, inhoud FROM app.klantrelatieboek WHERE gebruiker=$1 AND ruimte=$2 AND soort <> 'ontvangst'", [lade.userId, lade.ruimte]));
  const gegevens: Klantgegevens = { klanten: [], kansen: [], momenten: [], taken: [] };
  for (const rij of rows) {
    switch (rij.soort) {
      case 'klant': gegevens.klanten.push(zegel.open('klant', rij.id, rij.inhoud)); break;
      case 'kans': gegevens.kansen.push(zegel.open('kans', rij.id, rij.inhoud)); break;
      case 'contact': gegevens.momenten.push(zegel.open('contact', rij.id, rij.inhoud)); break;
      case 'taak': gegevens.taken.push(zegel.open('taak', rij.id, rij.inhoud)); break;
    }
  }
  for (const rijen of Object.values(gegevens)) rijen.sort((a, b) => b.aangemaakt - a.aangemaakt || a.id.localeCompare(b.id));
  return gegevens;
}

export async function schrijfKlantopdracht(lade: KluisLade, bewerking: Klantbewerking, velden: Record<string, unknown>): Promise<Klantuitkomst> {
  const opdracht = klantopdracht(bewerking, velden);
  const afdruk = createHash('sha256').update(JSON.stringify(opdracht)).digest('hex');
  const zegel = await boek(lade);
  return inRuimte(lade, async q => {
    await schrijfgrendel(q, lade);
    const ontvangst = await inhoudVan(q, lade, 'ontvangst', opdracht.sleutel);
    if (ontvangst) {
      if (!ontvangst.inhoud) throw new Klantfout('KLANT_DOSSIER_GEWIST', 410);
      const eerder = zegel.open('ontvangst', opdracht.sleutel, ontvangst.inhoud);
      if (eerder.afdruk !== afdruk) throw new Klantfout('KLANT_SLEUTEL_HERGEBRUIKT', 409);
      return eerder.uitkomst;
    }
    async function vind<S extends Soort>(soort: S, id: string): Promise<Rijen[S]> {
      const rij = await inhoudVan(q, lade, soort, id);
      if (!rij?.inhoud) throw new Klantfout('KLANT_NIET_GEVONDEN', 404);
      return zegel.open(soort, id, rij.inhoud);
    }
    async function bewaar<S extends Soort>(soort: S, id: string, klantId: string | null, rij: Rijen[S]) {
      await q(`INSERT INTO app.klantrelatieboek (gebruiker, ruimte, soort, id, klant_id, inhoud) VALUES ($1,$2,$3,$4,$5,$6)
        ON CONFLICT (gebruiker, ruimte, id, soort) DO UPDATE SET inhoud = EXCLUDED.inhoud`,
      [lade.userId, lade.ruimte, soort, id, klantId, zegel.pak(soort, id, rij)]);
    }
    const aangemaakt = Date.now();
    let klantId: string;
    let uitkomst: Klantuitkomst;
    switch (opdracht.soort) {
      case 'klant':
      case 'aanvraag': {
        klantId = randomUUID();
        await bewaar('klant', klantId, klantId, { id: klantId, aangemaakt, versie: 1, ...opdracht.persoon });
        uitkomst = { id: klantId };
        if (opdracht.soort === 'aanvraag') {
          const contactId = randomUUID(), taakId = randomUUID();
          await bewaar('contact', contactId, klantId, { id: contactId, klantId, aangemaakt, kansId: '', kanaal: opdracht.kanaal, richting: 'in', tekst: opdracht.tekst, minuten: 0 });
          await bewaar('taak', taakId, klantId, { id: taakId, klantId, aangemaakt, kansId: '', titel: opdracht.titel, datum: opdracht.datum, klaar: false });
          uitkomst = { id: klantId, contactId, taakId };
        }
        break;
      }
      case 'wijzig':
      case 'wissen': {
        klantId = opdracht.klantId;
        const klant = await vind('klant', klantId);
        if ((klant.versie ?? 1) !== opdracht.versie) throw new Klantfout('KLANT_GEWIJZIGD', 409);
        if (opdracht.soort === 'wijzig') {
          await bewaar('klant', klantId, klantId, { ...klant, ...opdracht.persoon, versie: opdracht.versie + 1 });
        } else {
          await q("DELETE FROM app.klantrelatieboek WHERE gebruiker=$1 AND ruimte=$2 AND klant_id=$3 AND soort <> 'ontvangst'", [lade.userId, lade.ruimte, klantId]);
          await q("UPDATE app.klantrelatieboek SET inhoud=NULL, klant_id=NULL WHERE gebruiker=$1 AND ruimte=$2 AND klant_id=$3 AND soort='ontvangst'", [lade.userId, lade.ruimte, klantId]);
        }
        uitkomst = { id: klantId };
        break;
      }
      case 'kans':
      case 'contact':
      case 'taak': {
        klantId = opdracht.klantId;
        await vind('klant', klantId);
        if (opdracht.soort !== 'kans' && opdracht.kansId && (await vind('kans', opdracht.kansId)).klantId !== klantId) throw new Klantfout('KLANT_VERBAND_ONGELDIG', 409);
        const id = randomUUID();
        if (opdracht.soort === 'kans') {
          await bewaar('kans', id, klantId, { id, aangemaakt, klantId, titel: opdracht.titel, centen: opdracht.centen, fase: opdracht.fase });
        } else if (opdracht.soort === 'contact') {
          const { soort, sleutel, ...velden } = opdracht;
          await bewaar('contact', id, klantId, { ...velden, id, aangemaakt });
        } else {
          await bewaar('taak', id, klantId, { id, aangemaakt, klantId, kansId: opdracht.kansId, titel: opdracht.titel, datum: opdracht.datum, klaar: false });
        }
        uitkomst = { id };
        break;
      }
      case 'fase': {
        const kans = await vind('kans', opdracht.kansId);
        klantId = kans.klantId;
        if (kans.fase !== opdracht.vorigeFase) throw new Klantfout('KLANT_FASE_GEWIJZIGD', 409);
        await bewaar('kans', kans.id, klantId, { ...kans, fase: opdracht.fase });
        uitkomst = { id: kans.id };
        break;
      }
      case 'afronden': {
        const taak = await vind('taak', opdracht.taakId);
        klantId = taak.klantId;
        if (!taak.klaar) await bewaar('taak', taak.id, klantId, { ...taak, klaar: true });
        uitkomst = { id: taak.id };
        break;
      }
    }
    await bewaar('ontvangst', opdracht.sleutel, opdracht.soort === 'wissen' ? null : klantId, { afdruk, uitkomst });
    return uitkomst;
  });
}
