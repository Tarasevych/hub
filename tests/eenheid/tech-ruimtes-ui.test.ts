// Eenheidstests voor de pure hulpfuncties van de twee ruimtes (src/tech/ruimtes/teksten.ts, vlag tech-ruimtes-v2). Geen DB nodig.
// Draaien: node scripts/eenheidstests.mjs tech-ruimtes-ui
import { checker } from './hulp/nep-google';
import { ms, naarRegels, normaliseerStatus, vlagDienst } from '../../src/tech/ruimtes-contract';
import { andere, AI_TERMIJNEN, eersteBeschikbare, restTekst, standTekst, tabVanRegel, TABBLADEN, termijnNaam, termijnUitleg, termijnenVolledig, UITLOG_KEUZES, uurMinuut, VKLADKA_REGEL, WOORDEN } from '../../src/tech/ruimtes/teksten';

export async function main(): Promise<number> {
  const { check, einde } = checker('tech-ruimtes-ui');
  const eind = new Date(2026, 9, 27, 18, 40).getTime();
  check('termijn tijd UA exact «На час (до 18:40)»', termijnNaam('tijd', 'uk', eind) === 'На час (до 18:40)', termijnNaam('tijd', 'uk', eind));
  check('termijn tijd NL «Voor een tijd (tot 18:40)»', termijnNaam('tijd', 'nl', eind) === 'Voor een tijd (tot 18:40)');
  check('termijn tot-technisch-einde UA exact', termijnNaam('tot-technisch-einde', 'uk') === 'До завершення технічного сеансу');
  check('termijn tot-site-uitloggen UA exact', termijnNaam('tot-site-uitloggen', 'uk') === 'До виходу з акаунта на сайті');
  check('NL-namen aanwezig', termijnNaam('tot-technisch-einde', 'nl').startsWith('Tot het einde') && termijnNaam('tot-site-uitloggen', 'nl').includes('site'));
  check('uitleg tijd noemt eindtijd en «вхід на сайт лишається»', termijnUitleg('tijd', 'uk', eind).includes('18:40') && termijnUitleg('tijd', 'uk', eind).includes('вхід на сайт лишається'));
  check('uitleg tot-site-uitloggen: pauze ≠ einde', termijnUitleg('tot-site-uitloggen', 'uk').includes('паузу'));
  check('uurMinuut 24-uurs', uurMinuut(new Date(2026, 0, 1, 7, 5).getTime(), 'nl') === '07:05');
  const nu = eind - 65 * 60000;
  check('restTekst «ще 1 год 5 хв»', restTekst(eind, nu, 'uk') === 'ще 1 год 5 хв', String(restTekst(eind, nu, 'uk')));
  check('restTekst NL «nog 1 u 5 min»', restTekst(eind, nu, 'nl') === 'nog 1 u 5 min');
  check('restTekst zonder eind → null', restTekst(null, nu, 'uk') === null);
  const sessie = { id: 's', modus: 'tijd' as const, eindTijd: eind, gestartOp: nu };
  check('standTekst pauze', standTekst({ actief: 'prive', pauze: true, sessie, technischToegestaan: true }, nu, 'uk') === 'пауза · ще 1 год 5 хв');
  check('standTekst actief', standTekst({ actief: 'technisch', pauze: false, sessie, technischToegestaan: true }, nu, 'uk') === 'ще 1 год 5 хв');
  check('standTekst geen recht', standTekst({ actief: 'prive', pauze: false, sessie: null, technischToegestaan: false }, nu, 'uk') === 'немає доступу');
  check('standTekst niet gestart', standTekst({ actief: 'prive', pauze: false, sessie: null, technischToegestaan: true }, nu, 'nl') === 'niet gestart');
  const vol = termijnenVolledig([{ modus: 'tijd', minuten: 60, label: { uk: '', nl: '' }, beschikbaar: true }], 'uk');
  check('termijnenVolledig: ontbrekende open termijnen toch getoond, uitgegrijsd met reden', vol.length === 3 && vol.filter((x) => !x.beschikbaar).every((x) => !!x.reden?.uk));
  check('eersteBeschikbare', eersteBeschikbare(vol)?.minuten === 60 && eersteBeschikbare([]) === null);
  check('drie uitlogkeuzes met gevolg', UITLOG_KEUZES.map((k) => k.id).join() === 'technisch,site,overal' && UITLOG_KEUZES.every((k) => k.gevolg.uk && k.gevolg.nl));
  check('technisch verlaten: extensie-ontgrendelingen blijven', UITLOG_KEUZES[0].gevolg.uk.includes('не змінюються'));
  check('afmelden site: extensie-ontgrendelingen vervallen', UITLOG_KEUZES[1].gevolg.uk.includes('знімаються'));
  check('tabblad sluiten: niets weg (t330u)', VKLADKA_REGEL.uk.includes('не знімає'));
  check('geen dubbelzinnige woorden', !Object.values(WOORDEN).some((w) => /^До виходу$|Подовжити|до виходу з профілю/.test(w.uk)));
  check('zes tabbladen', TABBLADEN.length === 6 && TABBLADEN[0].naam.uk === 'Мій технічний доступ');
  check('tabVanRegel', tabVanRegel({ soort: 'ai' }) === 'ai' && tabVanRegel({ soort: 'gast' }) === 'codes' && tabVanRegel({ soort: 'x', tabblad: 'vlaggen' }) === 'vlaggen' && tabVanRegel({ soort: 'onbekend' }) === 'eigen');
  check('één AI-termijnenset (5 keuzes, eerste = alleen gewone ruimte)', AI_TERMIJNEN.length === 5 && AI_TERMIJNEN[0].label.uk === 'Лише звичайний простір');
  check('andere()', andere('prive') === 'technisch' && andere('technisch') === 'prive');
  check('vlagDienst: op hub.* nooit «ai» (401 → vlag stil uit, integratiefix)', vlagDienst('ai', 'hub') === 'hub' && vlagDienst('mail', 'mail') === 'mail' && vlagDienst('ai', 'ai') === 'ai' && vlagDienst('hub', 'hub') === 'hub');
  // Integratiefix: klik vóór het laden van TechLaag ging verloren → laatste vraag 10 s bewaard, alleen met vlag aan overgenomen
  // (module trekt de canonieke runtime mee en laadt niet zonder browser: broncontrole; gedrag zelf zit in de echte E2E).
  {
    const { readFileSync } = await import('node:fs');
    const opslag = readFileSync('src/tech/tech-opslag.ts', 'utf8'), laag = readFileSync('src/tech/TechLaag.tsx', 'utf8');
    check('opgespaard venster: 10 s, één keer overgenomen', /opgespaard = \{ v, t: Date\.now\(\) \}/.test(opslag) && /opgespaard = null; return x && nu - x\.t <= 10_000/.test(opslag));
    check('TechLaag neemt het opgespaarde venster alleen met vlag tech-ruimtes-v2 (vlag uit = oud gedrag)', /if \(ruimtesV2Nu\(\)\) \{ const v = neemOpgespaardVenster\(\); if \(v\) setVenster\(v\); \}/.test(laag));
  }
  // Contract (ISO-tijden, aparte lijsten) → weergavemodel
  check('ms(): ISO → getal, null blijft null', ms('2026-10-27T17:40:00.000Z') === Date.UTC(2026, 9, 27, 17, 40) && ms(null) === null && ms(5) === 5 && ms('onzin') === null);
  const st = normaliseerStatus({ aan: true, actief: 'technisch', technischToegestaan: true, pauze: false, sessie: { id: 'x', modus: 'tijd', eindTijd: '2026-10-27T17:40:00.000Z', gestartOp: '2026-10-27T16:40:00.000Z', grensTijd: '2026-10-28T00:00:00Z' }, termijnen: [], maxMinuten: 60, rollen: [] });
  check('normaliseerStatus: eindTijd/gestartOp als ms', st.sessie?.eindTijd === Date.UTC(2026, 9, 27, 17, 40) && st.sessie?.gestartOp === Date.UTC(2026, 9, 27, 16, 40));
  check('normaliseerStatus: onbekend → veilig (prive, geen recht)', (() => { const x = normaliseerStatus({}); return x.actief === 'prive' && !x.technischToegestaan && !x.aan && x.sessie === null && x.termijnen.length === 0; })());
  const t = naarRegels({ magBeheren: false, mensen: [], sessies: [{ id: 's1', modus: 'tot-site-uitloggen', eindTijd: null, gestartOp: '2026-10-27T16:00:00Z', actief: false, dezeSessie: true }],
    ai: [{ verbindingId: 'v1', naam: 'Claude', agent: null, ruimtes: ['prive', 'technisch', 'raar'], termijn: 'tot-technisch-einde', eindTijd: null, tokenTot: null, bron: 'mcp-oauth' }],
    extensie: [{ id: 'e', agentId: 'a', ruimte: 'prive', eindeSoort: 'tot-site-uitloggen', eindTijd: null, overleeftTabUitloggen: true }],
    codes: [{ id: 'c', naam: 'g', scopes: [], verlooptOp: null }], vlagTests: [{ sleutel: 'k', waarde: true, tot: '2026-10-28T02:00:00Z' }], fouten: ['codes'] });
  check('naarRegels: één rij per ding, juiste tabbladen', t.regels.map((r) => tabVanRegel(r)).join() === 'eigen,ai,invoer,codes,vlaggen', t.regels.map((r) => tabVanRegel(r)).join());
  check('naarRegels: AI-ruimtes gefilterd, termijn behouden', JSON.stringify(t.regels[1].ruimtes) === '["prive","technisch"]' && t.regels[1].termijn?.modus === 'tot-technisch-einde');
  check('naarRegels: code zonder einde → «tot intrekken», fouten doorgegeven', t.regels[3].termijn?.modus === 'tot-intrekken' && t.fouten[0] === 'codes' && t.magBeheren === false);
  check('AI-set gebruikt alleen contracttermijnen', AI_TERMIJNEN.every((a) => ['tijd', 'tot-technisch-einde', 'tot-site-uitloggen'].includes(a.termijn)));
  return einde();
}
