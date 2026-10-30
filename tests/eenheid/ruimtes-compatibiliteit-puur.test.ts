// Ruimtes: compatibiliteit extensie/MCP — pure adapter (backend/ruimtes-compatibiliteit.ts) en extensiemeldingen (extension/ruimte-fouten.js).
import { antwoordVoorCode, extensieOpdracht, hulpmiddelScope, mcpAanroep, ontgrendelingenIntrekkenBijUitloggen } from '../../backend/ruimtes-compatibiliteit';
import { ruimteFout, sluitFout } from '../../extension/ruimte-fouten.js';
import type { RuimteCtx } from '../../shared/ruimte-toegang';
import { checker } from './hulp/nep-google';

export async function main(): Promise<number> {
  const { check, einde } = checker('ruimtes-compatibiliteit-puur');
  const beheer = ['beheer_journaal_lezen'];
  const ctx: Omit<RuimteCtx, 'bron'> = { nu: 1000, eigenaar: true, accountActief: true, profiel: { rollen: ['tester'], ingetrokken: false }, aiToegestaan: true,
    sessie: { id: 's', rollen: ['tester'], modus: 'tot-site-uitloggen', actief: 'technisch', eind: null, grens: 9000, beeindigd: false, siteSessieLeeft: true, gebonden: true } };
  const zonder = (w: Partial<NonNullable<RuimteCtx['sessie']>>) => ({ ...ctx, sessie: { ...ctx.sessie!, ...w } });

  check('scope: beheerhulpmiddel technisch, ander prive, onbekend prive', hulpmiddelScope('beheer_journaal_lezen', beheer) === 'technisch' && hulpmiddelScope('mail_lezen', beheer) === 'prive' && hulpmiddelScope('', beheer) === 'prive');
  check('MCP: technisch hulpmiddel met levende sessie → 200 scope technisch', (() => { const a = mcpAanroep(ctx, 'beheer_journaal_lezen', beheer); return a.status === 200 && a.scope === 'technisch'; })());
  check('MCP: prive hulpmiddel draait in scope prive ook als technisch actief is', mcpAanroep(ctx, 'mail_lezen', beheer).scope === 'prive' && mcpAanroep(ctx, 'mail_lezen', beheer).status === 200);
  const weg = mcpAanroep(zonder({ siteSessieLeeft: false }), 'beheer_journaal_lezen', beheer);
  check('MCP: hoofdsessie weg → 403 SITE_SESSIE_WEG, Oekraïense uitleg, niet ontkoppelen', weg.status === 403 && weg.code === 'SITE_SESSIE_WEG' && weg.uitleg?.uk.includes('Основний акаунт не активний') === true && !weg.ontkoppelen);
  check('MCP: hoofdsessie weg → prive hulpmiddel werkt nog', mcpAanroep(zonder({ siteSessieLeeft: false }), 'mail_lezen', beheer).status === 200);
  check('MCP: zonder AI-instelling → 403 AI_NIET_TOEGESTAAN', mcpAanroep({ ...ctx, aiToegestaan: false }, 'beheer_journaal_lezen', beheer).code === 'AI_NIET_TOEGESTAAN');
  const dood = mcpAanroep({ ...ctx, accountActief: false }, 'mail_lezen', beheer);
  check('MCP: account niet actief → 401 en ontkoppelen (ook prive)', dood.status === 401 && dood.ontkoppelen);
  check('MCP: pauze → 403 PAUZE', mcpAanroep(zonder({ actief: 'prive' }), 'beheer_journaal_lezen', beheer).code === 'PAUZE');
  check('extensie: technisch slot gebonden → 200', extensieOpdracht(ctx, 'technisch', 'technisch').status === 200);
  check('extensie: grant van ander slot telt nooit → 403', extensieOpdracht(ctx, 'technisch', 'prive').status === 403 && extensieOpdracht(ctx, 'prive', 'technisch').status === 403);
  check('extensie: niet gebonden tabblad → 403 NIET_GEBONDEN', extensieOpdracht(zonder({ gebonden: false }), 'technisch', 'technisch').code === 'NIET_GEBONDEN');
  check('extensie: hoofdsessie weg → technisch 403, prive 200', extensieOpdracht(zonder({ siteSessieLeeft: false }), 'technisch', 'technisch').status === 403 && extensieOpdracht(zonder({ siteSessieLeeft: false }), 'prive', 'prive').status === 200);
  check('uitloggen: één tabblad (v2) houdt, site/overal trekt in, vlag uit trekt in', !ontgrendelingenIntrekkenBijUitloggen('tabblad', true) && ontgrendelingenIntrekkenBijUitloggen('site', true) && ontgrendelingenIntrekkenBijUitloggen('overal', true) && ontgrendelingenIntrekkenBijUitloggen('tabblad', false));
  check('codes: onbekend → 403 met algemene uitleg', antwoordVoorCode('IETS').status === 403 && !!antwoordVoorCode('IETS').uitleg?.uk);
  check('extensie-melding: 403 SITE_SESSIE_WEG → Oekraïens, niet ontkoppelen', ruimteFout(403, 'SITE_SESSIE_WEG')?.melding.includes('Основний акаунт не активний') === true && ruimteFout(403, 'SITE_SESSIE_WEG')?.ontkoppelen === false);
  check('extensie-melding: 401 → ontkoppelen; 500 → niets', ruimteFout(401, '')?.ontkoppelen === true && ruimteFout(500, '') === null);
  check('extensie-sluitcode: 4401 vergrendelt, 4403 ontkoppelt, 1000 niets', sluitFout(4401)?.ontkoppelen === false && sluitFout(4403)?.ontkoppelen === true && sluitFout(1000) === null);
  const alle = ['ACCOUNT_NIET_ACTIEF', 'SITE_SESSIE_WEG', 'PAUZE', 'VERLOPEN', 'GRENS_VOORBIJ', 'GEEN_TECH_SESSIE', 'NIET_GEBONDEN', 'AI_NIET_TOEGESTAAN', 'GEEN_ROLLEN', 'GEEN_TECH_PROFIEL'];
  check('elke weigercode heeft uk+nl uitleg zonder Engelse woorden', alle.every((c) => { const u = antwoordVoorCode(c).uitleg; return !!u?.uk && !!u?.nl && !/[a-z]{4,}/i.test(u.uk); }));
  return einde();
}
