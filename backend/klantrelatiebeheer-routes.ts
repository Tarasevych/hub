import { error, json } from '../server/platform/antwoord';
import type { RouterMiddleware, RouterRoutes } from '../server/platform/router';
import type { Klantbewerking } from '../shared/klantrelatiebeheer';
import { journaalSchrijf } from './beheer-journaal';
import { Klantfout } from './klantrelatiebeheer-invoer';
import { voerKlantkoppeling } from './klantrelatiebeheer-koppelingen';
import { leesKlantgegevens, schrijfKlantopdracht } from './klantrelatiebeheer-opslag';
import { klanttoegang, type Klantsessie } from './klantrelatiebeheer-toegang';
import { registreerHerversleutelaar } from './sleutelkluis';

// Вміст у app.klantrelatieboek записується виключно під відкритим ключем даних користувача (dek1.).
registreerHerversleutelaar('app.klantrelatieboek', async () => ({ gevonden: 0, herversleuteld: 0 }));

const bewerkingen: readonly Klantbewerking[] = ['klant', 'aanvraag', 'wijzig', 'wissen', 'kans', 'fase', 'contact', 'taak', 'afronden'];
type Handeling = Klantbewerking | 'overzicht' | 'afspraak' | 'bronnen' | 'koppelstand';

const ACTIE_CODE: Record<Klantbewerking, string> = {
  klant: 'owner.klantrelatie.klant',
  aanvraag: 'owner.klantrelatie.aanvraag',
  wijzig: 'owner.klantrelatie.wijzig',
  wissen: 'owner.klantrelatie.wissen',
  kans: 'owner.klantrelatie.kans',
  fase: 'owner.klantrelatie.fase',
  contact: 'owner.klantrelatie.contact',
  taak: 'owner.klantrelatie.taak',
  afronden: 'owner.klantrelatie.afronden',
};

export function klantrelatieRoutes(
  sessie: Klantsessie,
  opties: { vlagAan?: (u: { id: string }) => Promise<boolean> } = {},
): RouterRoutes {
  function afhandeling(soort: Handeling): RouterMiddleware {
    return async ctx => {
      const schrijven = !['overzicht', 'bronnen', 'koppelstand'].includes(soort);
      const toegang = await klanttoegang(sessie, ctx, schrijven);
      if ('weigering' in toegang) return toegang.weigering;
      if (opties.vlagAan && !(await opties.vlagAan(toegang.user))) return error('KLANT_DIENST_UIT', 404);
      if (!ctx.body || typeof ctx.body !== 'object' || Array.isArray(ctx.body)) return error('KLANT_INVOER_ONGELDIG', 400);
      const velden = ctx.body as Record<string, unknown>;
      try {
        if (soort === 'overzicht') return json({ ...await leesKlantgegevens(toegang.lade), magSchrijven: toegang.magSchrijven });
        if (soort === 'afspraak' || soort === 'bronnen' || soort === 'koppelstand') return await voerKlantkoppeling(soort, toegang, velden);
        const uitkomst = await schrijfKlantopdracht(toegang.lade, soort, velden);
        await journaalSchrijf({
          actie: ACTIE_CODE[soort],
          actor: toegang.user.id,
          doel: { soort: 'klant', id: uitkomst.id },
          details: { ruimte: toegang.lade.ruimte },
          service: 'crm',
        });
        return json(uitkomst);
      } catch (fout) {
        if (fout instanceof Klantfout) return error(fout.code, fout.status);
        throw fout;
      }
    };
  }
  const routes: RouterRoutes = {};
  for (const soort of [...bewerkingen, 'overzicht', 'afspraak', 'bronnen', 'koppelstand'] as const) {
    routes['POST /api/owner/klantrelatiebeheer/' + soort] = [afhandeling(soort)];
  }
  return routes;
}
