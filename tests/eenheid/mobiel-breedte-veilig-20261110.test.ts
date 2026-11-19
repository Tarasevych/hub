// MOBIEL-BREEDTE-VEILIG v1 (vlag `mobiel-breedte-veilig-v1`, migratie 0302): statische controles op CSS, vlag en code.
import { readFileSync } from 'node:fs';
import { VLAG_UITLEG } from '../../shared/vlaggen';
import { checker } from './hulp/nep-google';

export async function main(): Promise<number> {
  const { check, einde } = checker('mobiel-breedte-veilig');
  const css = readFileSync('src/ontwerp/mobiel.css', 'utf8');
  const media = css.slice(css.indexOf('@media (max-width:700px)'));
  const breed = /:where\(div, section, article, header, footer, main, nav, aside, form, fieldset, ul, ol, dl, table, pre, figure\) \{ max-width:100%; \}/;
  const regels = media.split('\n').filter((l) => breed.test(l));
  check('de brede regel bestaat nog precies één keer (vlag uit = ongewijzigd gedrag)', regels.length === 1);
  check('de brede regel geldt alleen zonder het attribuut, binnen :where (specificiteit 0)', regels[0]?.trimStart().startsWith(':where(html:not([data-mobiel-breedte-veilig])) :where(.canonical-content, .venster-inhoud, .modal, .page, .auth-card, .mcp-consent-dialog)') === true);
  const vervanging = media.split('\n').filter((l) => l.includes(':where(html[data-mobiel-breedte-veilig])'));
  check('smalle vervanging: twee regels, alleen met het attribuut, specificiteit 0', vervanging.length === 2 && vervanging.every((l) => l.trimStart().startsWith(':where(html[data-mobiel-breedte-veilig]) :where(')));
  check('vervanging: directe kinderen (>) en pre/figure/fieldset — geen geneste div+section', vervanging.some((l) => /\) > :where\(div, section/.test(l)) && vervanging.some((l) => /:where\(pre, figure, fieldset\)/.test(l)) && !vervanging.some((l) => /\) :where\(div, section/.test(l)));
  const mig = readFileSync('migrations/0302_mobiel_breedte_veilig_vlag.sql', 'utf8');
  check('migratie 0302: vlag standaard UIT (aan=false, standaard=false) en herhaalbaar', /VALUES \('mobiel-breedte-veilig-v1',[\s\S]*false, false\)\s*ON CONFLICT \(sleutel\) DO NOTHING;/.test(mig));
  const oms = /'([^']+)',\s*false, false\)/.exec(mig)?.[1] || '';
  check('omschrijving ≤ 300 tekens (CHECK 0038)', oms.length > 0 && oms.length <= 300, String(oms.length));
  const u = VLAG_UITLEG['mobiel-breedte-veilig-v1'];
  check('uitleg in twee talen in VLAG_UITLEG', Boolean(u) && [u.naam, u.wat, u.wanneer, u.gevolg].every((p) => p[0].length > 5 && p[1].length > 5));
  const ukr = [u.naam[0], u.wat[0], u.wanneer[0], u.gevolg[0], oms.split(' | ')[0]].join(' ');
  check('Oekraïense tekst zonder ЁёЪъЫыЭэ en zonder Latijnse woorden (behalve #connectors)', !/[ЁёЪъЫыЭэ]/.test(ukr) && !/[A-Za-z]{2,}/.test(ukr.replace('#connectors', '')));
  const main_ = readFileSync('src/main.tsx', 'utf8');
  check('main.tsx: installeerMobielVeilig vóór de eerste weergave', main_.indexOf('installeerMobielVeilig();') > 0 && main_.indexOf('installeerMobielVeilig();') < main_.indexOf('createRoot(document.getElementById(\'root\')!).render(<App />)'));
  const plek = readFileSync('src/plaatsing/Plek.tsx', 'utf8');
  check('Plek.tsx: oude waarnemer blijft voor vlag uit, gefilterde voor vlag aan', plek.includes("} else mo?.observe(document.body, { childList: true, subtree: true });") && plek.includes('raaktOnderbalk(rec, gevolgd)'));
  const ag = readFileSync('src/agenten/AgentenPagina.tsx', 'utf8');
  check('AgentenPagina: oude scroll-luisteraar en 50-ms-zoektocht blijven voor vlag uit', ag.includes("window.addEventListener('scroll', kies, { capture: true, passive: true });") && ag.includes("}, 50);\n    return () => window.clearInterval(t);"));
  check('AgentenPagina: met vlag aan rAF en alleen bij echte wissel', ag.includes('requestAnimationFrame(() => { raf = 0; kies(); })') && ag.includes('if (gezien === laatstGezien.current) return;'));
  // de vlag-module mag in Node geladen worden zonder window (Plek.tsx-tests importeren hem)
  const m = await import('../../src/mobiel-veilig/vlag');
  check('vlag-module laadt zonder window; stand standaard uit', m.mobielVeiligAan() === false && m.MOBIEL_VEILIG_ATTR === 'data-mobiel-breedte-veilig');
  return einde();
}
