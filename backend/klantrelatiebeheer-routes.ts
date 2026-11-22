import { error, json } from '../server/platform/antwoord';
import type { RouterMiddleware, RouterRoutes } from '../server/platform/router';
import type { Klantbewerking } from '../shared/klantrelatiebeheer';
import { Klantfout } from './klantrelatiebeheer-invoer';
import { voerKlantkoppeling } from './klantrelatiebeheer-koppelingen';
import { leesKlantgegevens, schrijfKlantopdracht } from './klantrelatiebeheer-opslag';
import { klanttoegang, type Klantsessie } from './klantrelatiebeheer-toegang';

const bewerkingen: readonly Klantbewerking[] = ['klant', 'aanvraag', 'wijzig', 'wissen', 'kans', 'fase', 'contact', 'taak', 'afronden'];
type Handeling = Klantbewerking | 'overzicht' | 'afspraak' | 'bronnen' | 'koppelstand';

export function klantrelatieRoutes(sessie: Klantsessie): RouterRoutes {
  function afhandeling(soort: Handeling): RouterMiddleware {
    return async ctx => {
      const schrijven = !['overzicht', 'bronnen', 'koppelstand'].includes(soort);
      const toegang = await klanttoegang(sessie, ctx, schrijven);
      if ('weigering' in toegang) return toegang.weigering;
      if (!ctx.body || typeof ctx.body !== 'object' || Array.isArray(ctx.body)) return error('KLANT_INVOER_ONGELDIG', 400);
      const velden = ctx.body as Record<string, unknown>;
      try {
        if (soort === 'overzicht') return json({ ...await leesKlantgegevens(toegang.lade), magSchrijven: toegang.magSchrijven });
        if (soort === 'afspraak' || soort === 'bronnen' || soort === 'koppelstand') return await voerKlantkoppeling(soort, toegang, velden);
        return json(await schrijfKlantopdracht(toegang.lade, soort, velden));
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
