// POSTA-VENSTERS (21.11.2026, migratie 0308, Grok: hub.tarasevych.com): bijlageviewer en zwevend leesvenster.
// De vlag posta-vensters-herstel-v1 staat standaard UIT; deze tests controleren beide standen.
import { readFileSync } from 'node:fs';
import { VLAG_UITLEG } from '../../shared/vlaggen';
import { checker } from './hulp/nep-google';
import { strikteCompacteJose, strikteJoseAan, zetStrikteJose } from '../../src/mail/strikte-jose';
import { BIJLAGE_STAP, POSTA_VENSTERS_ATTR, POSTA_VENSTERS_VLAG, bijlageStapBoven, bijlageStapInstalleren, metBijlageStap } from '../../src/mail/posta-vensters';

const VERBODEN = /[\u0401\u0451\u042A\u044A\u042B\u044B\u042D\u044D]/;
const DEELWOORD = /[а-яіїєґ]+(уч|юч|ач|яч)(ий|а|е|і|ого|ої|им|их|ому|ій|у)\b/iu;
const b64u = (s: string) => Buffer.from(s, 'utf8').toString('base64url');

/** Nepgeschiedenis met popstate, zoals de browser (pushState vult aan, back haalt de bovenste stap weg en meldt popstate). */
function nepGeschiedenis(begin: Record<string, unknown> | null) {
  const stapels: (Record<string, unknown> | null)[] = [begin];
  const luisteraars = new Set<() => void>();
  const h = {
    get state() { return stapels[stapels.length - 1]; },
    pushState(s: Record<string, unknown>) { stapels.push(s); },
    back() { if (stapels.length > 1) { stapels.pop(); luisteraars.forEach((f) => f()); } },
  } as unknown as History;
  const w = { addEventListener: (_: string, f: () => void) => luisteraars.add(f), removeEventListener: (_: string, f: () => void) => luisteraars.delete(f) } as unknown as Window;
  return { h, w, stapels, luisteraars };
}

export async function main(): Promise<number> {
  const { check, einde } = checker('posta-vensters');

  // 1) strenge JOSE-test
  const kop = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const jwt = `${kop}.${b64u('{"sub":"1"}')}.${b64u('handtekening')}`;
  const jwe = `${b64u(JSON.stringify({ alg: 'RSA-OAEP', enc: 'A256GCM' }))}.${b64u('sleutel')}.${b64u('iv')}.${b64u('cijfer')}.${b64u('tag')}`;
  check('standaard: strenge JOSE-test uit', strikteJoseAan() === false);
  check('echte JWT herkend', strikteCompacteJose(jwt));
  check('echte JWE herkend', strikteCompacteJose(jwe));
  check('JWS met losse inhoud (leeg middendeel) herkend', strikteCompacteJose(`${kop}..${b64u('h')}`));
  check('alg none zonder handtekening herkend, met HS256 niet', strikteCompacteJose(`${b64u('{"alg":"none"}')}.${b64u('{}')}.`) && !strikteCompacteJose(`${kop}.${b64u('{}')}.`));
  check('zip-achtige tekst met twee punten: geen JOSE', !strikteCompacteJose('PK\u0003\u0004mimetype.application/zip.\u0000\u0001'));
  check('gewone zin met twee punten: geen JOSE', !strikteCompacteJose('Dit is een zin. En nog een. Klaar'));
  check('base64url-delen zonder JSON-kop: geen JOSE', !strikteCompacteJose('abc.def.ghi'));
  check('kop zonder alg: geen JOSE', !strikteCompacteJose(`${b64u('{"typ":"JWT"}')}.${b64u('{}')}.${b64u('h')}`));
  check('vijf delen zonder enc: geen JWE', !strikteCompacteJose(`${kop}.a.b.c.d`));
  check('vier delen: geen JOSE', !strikteCompacteJose(`${kop}.a.b.c`));
  zetStrikteJose(true); check('schakelaar aan', strikteJoseAan() === true); zetStrikteJose(false); check('schakelaar weer uit', strikteJoseAan() === false);
  const bev = readFileSync('src/mail-beveiliging-inhoud.ts', 'utf8');
  check('detectie: vlag uit = oude test, vlag aan = strenge test', bev.includes("if(strikteJoseAan()?strikteCompacteJose(trim):compactJoseEvidence(trim))return'application/x-mail-security-jose'"));

  // 2) eigen geschiedenisstap van de viewer
  check('stap vult de staat van de brief aan', JSON.stringify(metBijlageStap({ mrLezer: 'm0' })) === JSON.stringify({ mrLezer: 'm0', [BIJLAGE_STAP]: '1' }) && bijlageStapBoven(metBijlageStap(null)) && !bijlageStapBoven({ mrLezer: 'm0' }));
  {
    const g = nepGeschiedenis({ mrLezer: 'm0' }); let gesloten = 0;
    const weg = bijlageStapInstalleren(() => { gesloten += 1; }, g.h, g.w);
    check('openen: één stap erbij, brief eronder bewaard', g.stapels.length === 2 && bijlageStapBoven(g.h.state as never) && (g.h.state as Record<string, unknown>).mrLezer === 'm0');
    g.h.back();
    check('«Назад»: viewer dicht, brief blijft (staat van de brief boven)', gesloten === 1 && g.stapels.length === 1 && (g.h.state as Record<string, unknown>).mrLezer === 'm0');
    weg();
    check('opruimen na «Назад»: geen tweede stap terug', g.stapels.length === 1 && g.luisteraars.size === 0);
  }
  {
    const g = nepGeschiedenis({ mrLezer: 'm0' }); let gesloten = 0;
    const weg = bijlageStapInstalleren(() => { gesloten += 1; }, g.h, g.w);
    weg();
    check('sluiten via knop of Escape: eigen stap weg, sluit niet nog eens', gesloten === 0 && g.stapels.length === 1 && (g.h.state as Record<string, unknown>).mrLezer === 'm0');
  }

  // 3) bedrading in de werkruimte en CSS achter het attribuut
  const gmw = readFileSync('src/GoogleMailWerkruimte.tsx', 'utf8');
  check('vlag standaard uit in de client', gmw.includes('useVlag(POSTA_VENSTERS_VLAG,false)') && POSTA_VENSTERS_VLAG === 'posta-vensters-herstel-v1');
  check('attribuut en strenge JOSE alleen met vlag aan, bij uit weer weg', gmw.includes('html.setAttribute(POSTA_VENSTERS_ATTR,\'\');zetStrikteJose(true)') && gmw.includes('html.removeAttribute(POSTA_VENSTERS_ATTR);zetStrikteJose(false)') && gmw.includes('if(!vensterHerstel)return;const html'));
  check('geschiedenisstap alleen met vlag aan (herstel of gedeelde weergave) en open, niet geminimaliseerde viewer', gmw.includes('if(!(vensterHerstel||gedeeldeWeergave)||!attachmentPreview||attachmentMinimized)return;return bijlageStapInstalleren('));
  const css = readFileSync('src/mail/posta-vensters.css', 'utf8');
  const regels = css.replace(/\/\*[\s\S]*?\*\//g, '').split('}').map((r) => r.trim()).filter((r) => r.includes('{'));
  const selectors = regels.map((r) => r.replace(/@media[^{]*\{/, '')).map((r) => r.slice(0, r.indexOf('{')).trim()).filter(Boolean);
  check('elke CSS-regel hangt aan het vlagattribuut', selectors.length >= 14 && selectors.every((s) => s.split(',').every((d) => d.includes(`html[${POSTA_VENSTERS_ATTR}]`))));
  check('telefoon: viewer schermvullend', /max-width: 720px[\s\S]*\.google-mail-attachment-backdrop \{[\s\S]*left: 0 !important/.test(css));
  check('zwevend venster: taalstrook op een eigen regel', css.includes(".mail-reader-kop-opties {\n  order: 99; flex: 1 0 100%"));

  // 4) migratie en uitleg
  const mig = readFileSync('migrations/0309_posta_vensters_herstel.sql', 'utf8');
  const oms = /VALUES \('posta-vensters-herstel-v1',\s*'([^']*)',\s*false, false\)\s*ON CONFLICT \(sleutel\) DO NOTHING;/.exec(mig);
  check('migratie 0309: vlag uit, standaard uit, ON CONFLICT DO NOTHING', Boolean(oms));
  check('omschrijving ≤ 300 tekens', Boolean(oms) && oms![1].length <= 300);
  const u = VLAG_UITLEG['posta-vensters-herstel-v1'];
  check('uitleg aanwezig (naam, wat, wanneer, gevolg)', Boolean(u && u.naam && u.wat && u.wanneer && u.gevolg));
  const teksten = [mig, css, readFileSync('src/mail/posta-vensters.ts', 'utf8'), readFileSync('src/mail/strikte-jose.ts', 'utf8'), ...(u ? [u.naam, u.wat, u.wanneer, u.gevolg].flat() : [])].join('\n');
  check('taalwet: geen verboden letters', !VERBODEN.test(teksten));
  check('taalwet: geen deelwoorden op -учий/-ючий/-ачий/-ячий', !DEELWOORD.test(teksten));
  return einde();
}
