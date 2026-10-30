// /zoek — zuivere kern voor de pagina en het palet (Z4, 22.10.2026): veilige markering (posities van de server → stukken
// tekst, geen innerHTML), normalisatie voor de lokale markering, de echte URL van een route (shared/zoek-model.ts →
// ZoekRoute: host + pad binnen de site, nooit een vrije URL), en het opruimen van de OUDE localStorage-geschiedenis
// (mr.search.history.v1 stond zonder gebruiker/ruimte: die wordt gewist en nooit meer geschreven — de geschiedenis staat
// nu op de server, migratie 0103).
import type { ZoekBron, ZoekRoute, ZoekSoort } from '../../shared/zoek-model';
export type Lang = 'uk' | 'nl';
export type Range = [number, number];

export const norm = (s: string) => s.toLocaleLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}@._-]+/gu, ' ').trim();

/** Tekst + posities [start, eind) van de server → stukken {t, hit}. Overlappende/ongeldige posities worden samengevoegd of genegeerd. */
export function stukkenUitPosities(tekst: string, posities: readonly Range[]): Array<{ t: string; hit: boolean }> {
  if (!tekst) return [{ t: '', hit: false }];
  const geldig = posities.map(([a, b]) => [Math.max(0, Math.min(tekst.length, a)), Math.max(0, Math.min(tekst.length, b))] as Range).filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
  const samen: Range[] = [];
  for (const r of geldig) { const l = samen[samen.length - 1]; if (l && r[0] <= l[1]) l[1] = Math.max(l[1], r[1]); else samen.push([r[0], r[1]]); }
  const uit: Array<{ t: string; hit: boolean }> = []; let p = 0;
  for (const [a, b] of samen) { if (a > p) uit.push({ t: tekst.slice(p, a), hit: false }); uit.push({ t: tekst.slice(a, b), hit: true }); p = b; }
  if (p < tekst.length) uit.push({ t: tekst.slice(p), hit: false });
  return uit.length ? uit : [{ t: tekst, hit: false }];
}
/** Lokale terugval (geen posities van de server): markeer de zoektermen zelf. Alleen tekstknopen, nooit HTML. */
export function highlightParts(text: string, terms: readonly string[]): Array<{ t: string; hit: boolean }> {
  const ts = terms.map(norm).filter(x => x.length >= 2); if (!text || !ts.length) return [{ t: text, hit: false }];
  const esc = ts.map(x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return text.split(new RegExp(`(${esc.join('|')})`, 'giu')).filter(Boolean).map(t => ({ t, hit: ts.includes(norm(t)) }));
}

export function levenshtein(a: string, b: string, max = Infinity): number {
  a = norm(a); b = norm(b); if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]; let rowMin = i;
    for (let j = 1; j <= b.length; j++) { cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); rowMin = Math.min(rowMin, cur[j]); }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

// ---------------------------------------------------------------- routes → echte URL
// Eén leidende schuine streep (nooit «//host»), geen «..», alleen veilige tekens.
const PAD_OK = /^\/(?!\/)(?!.*\.\.)[A-Za-z0-9._~\-\/%]*$/;
const HOST_DIENST: Record<ZoekRoute['host'], string> = { hub: 'hub', mail: 'mail', cloud: 'cloud', id: 'identity', mcp: 'mcp', ai: 'ai', github: 'github' };
/** Hosts van de diensten uit public/canonical-service.js (lui gelezen: deze module laadt ook zonder browser, in tests). */
const dienstHosts = (): Record<string, string> => { try { return (globalThis as { window?: { __TSV_CANONICAL_SERVICE__?: { domains?: Record<string, string> } } }).window?.__TSV_CANONICAL_SERVICE__?.domains || {}; } catch { return {}; } };
/**
 * De URL van een route: host = dienst van de site (domains uit public/canonical-service.js), pad binnen die dienst
 * (alleen veilige tekens), params als zoekparameters (lang wordt altijd gezet), hash. Een route die niet past geeft ''.
 * `focus` (sleutel van data-hulp) → ?focus=<sleutel>: src/platform/focus-doel.ts scrolt, markeert en focust het element op de pagina.
 */
export function routeUrl(route: ZoekRoute | null | undefined, lang: Lang): string {
  if (!route) return '';
  const dienst = HOST_DIENST[route.host]; const host = dienst ? dienstHosts()[dienst] || '' : '';
  if (!host) return '';
  const pad = route.pad && PAD_OK.test(route.pad) ? route.pad : '/';
  const u = new URL(`https://${host}${pad}`);
  for (const [k, v] of Object.entries(route.params || {})) if (k !== 'lang' && v) u.searchParams.set(k, v);
  u.searchParams.set('lang', lang);
  if (route.hash) u.hash = route.hash.replace(/^#/, '').replace(/[^A-Za-z0-9._~\-\/%:]/g, '');
  return u.toString();
}
/** Externe GitHub-link uit extra.url: alleen https://github.com/… (anders ''). */
export const githubUrl = (extra: Record<string, unknown>): string => { try { const x = new URL(String(extra?.url || '')); return x.protocol === 'https:' && x.hostname === 'github.com' ? x.toString() : ''; } catch { return ''; } };

/** De actie op de kaart: wat gebeurt er als je klikt (tekst per soort). */
export const ACTIE_LABEL: Readonly<Record<'open' | 'mail' | 'doc' | 'pagina' | 'instelling' | 'knop' | 'agenda' | 'extern', { uk: string; nl: string }>> = Object.freeze({
  open: { uk: 'Відкрити', nl: 'Openen' }, mail: { uk: 'Відкрити лист', nl: 'E-mail openen' }, doc: { uk: 'Відкрити документ', nl: 'Document openen' },
  pagina: { uk: 'Перейти на сторінку', nl: 'Naar de pagina' }, instelling: { uk: 'Відкрити налаштування', nl: 'Instelling openen' }, knop: { uk: 'Показати на сторінці', nl: 'Op de pagina tonen' },
  agenda: { uk: 'Відкрити подію', nl: 'Afspraak openen' }, extern: { uk: 'Відкрити на GitHub', nl: 'Openen op GitHub' },
});
export function actieVoor(soort: ZoekSoort, bron: ZoekBron, extern: boolean): keyof typeof ACTIE_LABEL {
  if (extern) return 'extern';
  if (bron === 'mail' || soort === 'bericht') return 'mail';
  if (soort === 'bijlage' || soort === 'bestand' || bron === 'bijlage' || bron === 'cloud' || bron === 'drive') return 'doc';
  if (soort === 'pagina' || soort === 'hulp') return 'pagina';
  if (soort === 'instelling' || soort === 'integratie') return 'instelling';
  if (soort === 'knop' || soort === 'menu' || soort === 'actie' || soort === 'veld' || soort === 'dialoog') return 'knop';
  if (soort === 'afspraak') return 'agenda';
  return 'open';
}

// ---------------------------------------------------------------- relatieve tijd («2 год тому», «вчора») voor «Останні пошуки»
/** Zuiver: ms → korte relatieve tijd in uk/nl; toekomst of 0 → ''. Boven 7 dagen: de datum zelf (aanroeper kiest fmtDatum). */
export function relatiefTijd(ms: number, lang: Lang, now = Date.now()): string {
  if (!ms || ms > now + 60_000) return '';
  const d = now - ms, min = Math.floor(d / 60_000), uur = Math.floor(min / 60), dag = Math.floor(uur / 24);
  const uk = lang === 'uk';
  if (min < 1) return uk ? 'щойно' : 'zojuist';
  if (min < 60) return uk ? `${min} хв тому` : `${min} min geleden`;
  if (uur < 24) return uk ? `${uur} год тому` : `${uur} uur geleden`;
  if (dag === 1) return uk ? 'вчора' : 'gisteren';
  if (dag < 7) return uk ? `${dag} ${dag < 5 ? 'дні' : 'днів'} тому` : `${dag} dagen geleden`;
  return '';
}

// ---------------------------------------------------------------- oude geschiedenis (localStorage) wissen
export const OUDE_GESCHIEDENIS_SLEUTEL = 'mr.search.history.v1';
/** Eenmalig: de oude, niet-geïsoleerde geschiedenis uit localStorage verwijderen. Geeft true als er iets stond. */
export function oudeGeschiedenisOpruimen(opslag: Pick<Storage, 'getItem' | 'removeItem'> | null = typeof localStorage !== 'undefined' ? localStorage : null): boolean {
  try { if (!opslag || opslag.getItem(OUDE_GESCHIEDENIS_SLEUTEL) == null) return false; opslag.removeItem(OUDE_GESCHIEDENIS_SLEUTEL); return true; } catch { return false; }
}
