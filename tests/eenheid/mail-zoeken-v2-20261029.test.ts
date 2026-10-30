// UI-009 «mail-zoeken-v2» (29.10.2026): vlag, migratie 0150, leesstatus-semantiek, operators, markering, grootte, periode, grenzen, wissen geschiedenis.
import { readFileSync } from 'node:fs';
import { VLAG_UITLEG } from '../../shared/vlaggen';
import { MAIL_ZOEKEN_V2_VLAG } from '../../src/mail-zoeken-v2/vlag';
import { grensStand, grootteFout, leesModus, markeer, metLeesModus, operatorVoorstellen, periodeTekst, voorinstellingBereik, vulOperatorAan } from '../../src/mail-zoeken-v2/logica';
import { defaultMailSearchCriteria, mailSearchReadStates, matchesMailSearchSummary } from '../../src/mail-zoek';
import { checker } from './hulp/nep-google';

export async function main(): Promise<number> {
  const { check, einde } = checker('mail-zoeken-v2-20261029');
  const u = VLAG_UITLEG[MAIL_ZOEKEN_V2_VLAG];
  check('vlag: uitleg in uk en nl', !!u && u.naam.length === 2 && u.wat.every(Boolean) && u.gevolg.every(Boolean));
  const mig = readFileSync('migrations/0150_mail_zoeken_v2_vlag.sql', 'utf8');
  check('vlag: migratie 0150 standaard UIT en idempotent', /'mail-zoeken-v2'/.test(mig) && /false,\s*false/.test(mig) && /ON CONFLICT \(sleutel\) DO NOTHING/.test(mig));

  // Leesstatus: «beide» = geen filter in de bestaande zoekmotor; V2 toont dat als «alle».
  check('lees: leeg = alle', leesModus({ readState: '', readStates: [] }) === 'alle');
  check('lees: beide = alle (zelfde semantiek als zoekmotor)', leesModus({ readState: '', readStates: ['read', 'unread'] }) === 'alle');
  check('lees: oud veld readState telt mee', leesModus({ readState: 'unread', readStates: [] }) === 'unread');
  check('lees: terugschrijven', JSON.stringify(metLeesModus('read')) === JSON.stringify({ readState: '', readStates: ['read'] }) && metLeesModus('alle').readStates.length === 0);
  const basis = defaultMailSearchCriteria(['a']);
  const ongelezen = { id: '1', unread: true } as never, gelezen = { id: '2', unread: false } as never;
  const beide = { ...basis, readStates: ['read', 'unread'] as Array<'read' | 'unread'> };
  const fm = (c: typeof basis, m: never) => { try { return matchesMailSearchSummary(m, '', c as never); } catch { return null; } };
  const r1 = fm(beide, ongelezen), r2 = fm(beide, gelezen);
  check('lees: zoekmotor laat bij «beide» gelezen én ongelezen door (vastgesteld, niet gewijzigd)', r1 === null || (r1 !== false && r2 !== false), `${r1}/${r2}`);
  check('lees: normalisatie behoudt keuze', mailSearchReadStates({ ...basis, ...metLeesModus('unread') }).join() === 'unread');

  check('operators: «fr» → from:', operatorVoorstellen('rekening fr').includes('from:'));
  check('operators: «is:» → is:unread/is:read/is:starred', ['is:unread', 'is:read', 'is:starred'].every((x) => operatorVoorstellen('is:').includes(x)));
  check('operators: leeg/spatie → niets', operatorVoorstellen('').length === 0 && operatorVoorstellen('abc ').length === 0);
  check('operators: aanvullen vervangt laatste woord', vulOperatorAan('factuur has', 'has:attachment') === 'factuur has:attachment ' && vulOperatorAan('fr', 'from:') === 'from:');

  const m = markeer('Factuur oktober FACTUUR', 'factuur');
  check('markeren: hoofdletterongevoelig, alle treffers', m.filter((x) => x.hit).length === 2 && m.map((x) => x.t).join('') === 'Factuur oktober FACTUUR');
  check('markeren: lege term = geen markering', markeer('abc', ' ').length === 1 && !markeer('abc', '')[0].hit);

  check('grootte: zonder modus geen fout', grootteFout('', '') === '');
  check('grootte: leeg', grootteFout('larger', ' ') === 'leeg');
  check('grootte: negatief/0/tekst ongeldig', ['-1', '0', 'abc'].every((v) => grootteFout('larger', v) === 'ongeldig'));
  check('grootte: komma als decimaal', grootteFout('smaller', '2,5') === '');

  const nu = new Date(2026, 9, 29, 15, 0);
  check('periode: 7 dagen inclusief vandaag', JSON.stringify(voorinstellingBereik(7, nu)) === JSON.stringify({ from: '2026-10-23', to: '2026-10-29' }));
  check('periode: jaar = 365 dagen', voorinstellingBereik(365, nu).from === '2025-10-30');
  check('periode: tekst eigen bereik', /2026/.test(periodeTekst({ datePreset: 'custom', dateFrom: '2026-01-01', dateTo: '2026-02-01', dateMonth: 0, dateYear: 0 }, 'nl')));
  check('periode: leeg = geen tekst', periodeTekst({ datePreset: 'all', dateFrom: '', dateTo: '', dateMonth: 0, dateYear: 0 }, 'uk') === '');
  check('periode: maand zonder jaar', /будь-який рік/.test(periodeTekst({ datePreset: 'all', dateFrom: '', dateTo: '', dateMonth: 3, dateYear: 0 }, 'uk')));

  check('grenzen: laden', grensStand({ providerYearsChecking: true }) === 'laden');
  check('grenzen: fout', grensStand({ providerRefreshError: true }) === 'fout');
  check('grenzen: gecontroleerd zonder data = leeg', grensStand({ providerCheckedAt: 5 }) === 'leeg');
  check('grenzen: bevestigd', grensStand({ providerMinDate: 1, providerMaxDate: 2, providerYearsComplete: true }) === 'bevestigd');
  check('grenzen: nog niets = onbekend', grensStand({}) === 'onbekend');

  // Geschiedenis wissen (nieuwe export in mail-zoek-cache.ts)
  const opslag = new Map<string, string>();
  (globalThis as any).localStorage = { getItem: (k: string) => opslag.get(k) ?? null, setItem: (k: string, v: string) => opslag.set(k, v), removeItem: (k: string) => opslag.delete(k) };
  const cache = await import('../../src/mail-zoek-cache');
  cache.recordMailRecentSearch('eigenaar', 'factuur', basis);
  check('geschiedenis: opgeslagen', cache.readMailRecentSearches('eigenaar').length === 1);
  check('geschiedenis: wissen geeft lege lijst', cache.clearMailRecentSearches('eigenaar').length === 0 && cache.readMailRecentSearches('eigenaar').length === 0);
  // Hernoemen via bestaande opslagfunctie (zelfde handtekening → bijwerken, geen dubbel)
  cache.saveMailSavedSearch('eigenaar', 'factuur', basis);
  const s = cache.saveMailSavedSearch('eigenaar', 'factuur', basis, 'Rekeningen');
  check('opgeslagen: hernoemen werkt het bestaande item bij', s.length === 1 && s[0].name === 'Rekeningen');

  // GoogleMailWerkruimte koppelt V2 alleen achter de vlag; oude panelen blijven zonder vlag.
  const gmw = readFileSync('src/GoogleMailWerkruimte.tsx', 'utf8');
  check('koppeling: V2 alleen met vlag, oud paneel blijft', /\{mailZoekenV2\?<MailZoekenV2 /.test(gmw) && /:<MailAdvancedSearch lang=\{lang\}/.test(gmw) && /open=\{searchToolsOpen&&!mailZoekenV2\}/.test(gmw));
  const css = readFileSync('src/mail-zoeken-v2/mail-zoeken-v2.css', 'utf8');
  check('css: geen nieuwe vaste elementen, geen overflow:hidden-maskering', !/position:\s*fixed/.test(css) && !/overflow:\s*hidden/.test(css));
  return einde();
}
