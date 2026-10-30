// Bijlageviewer v2 (vlag bijlage-viewer-v2) + BUG-003 (29.10.2026): vlag, migratie, voorkeuren, poort en UFW-grens.
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { VLAG_UITLEG } from '../../shared/vlaggen';
import { BIJLAGE_V2_VLAG } from '../../src/bijlage-v2/vlag';
import { checker } from './hulp/nep-google';

export async function main(): Promise<number> {
  const { check, einde } = checker('bijlage-viewer-v2-20261029');
  const u = VLAG_UITLEG[BIJLAGE_V2_VLAG];
  check('vlag: uitleg in uk en nl', !!u && u.naam.length === 2 && u.wat.every(Boolean) && u.gevolg.every(Boolean));
  const mig = readFileSync('migrations/0134_bijlage_viewer_v2_vlag.sql', 'utf8');
  check('vlag: migratie 0134 zet hem standaard UIT en is idempotent', /'bijlage-viewer-v2'/.test(mig) && /false,\s*false/.test(mig) && /ON CONFLICT \(sleutel\) DO NOTHING/.test(mig));
  // voorkeuren: ongeldige waarden vallen terug op «breedte, 100%»
  const opslag = new Map<string, string>();
  (globalThis as any).localStorage = { getItem: (k: string) => opslag.get(k) ?? null, setItem: (k: string, v: string) => opslag.set(k, v) };
  const { leesVoorkeur, schrijfVoorkeur } = await import('../../src/bijlage-v2/vlag');
  check('voorkeur: leeg → breedte/1/niet ingeklapt', JSON.stringify(leesVoorkeur()) === JSON.stringify({ fit: 'width', zoom: 1, balkIngeklapt: false }));
  opslag.set('mr-bijlage-v2-weergave', '{"fit":"evil","zoom":99,"balkIngeklapt":"ja"}');
  check('voorkeur: ongeldige waarden worden genegeerd', JSON.stringify(leesVoorkeur()) === JSON.stringify({ fit: 'width', zoom: 1, balkIngeklapt: false }));
  opslag.clear(); schrijfVoorkeur({ fit: 'page' }); schrijfVoorkeur({ zoom: 1.5 });
  check('voorkeur: deelupdates worden samengevoegd', leesVoorkeur().fit === 'page' && leesVoorkeur().zoom === 1.5);
  opslag.set('mr-bijlage-v2-weergave', '{kapot'); check('voorkeur: kapotte JSON breekt niets', leesVoorkeur().fit === 'width');
  // poort in de werkruimte: oude kop blijft als «oud» volledig aanwezig, vlag via useVlag
  const gmw = readFileSync('src/GoogleMailWerkruimte.tsx', 'utf8');
  check('poort: oude kop ongewijzigd binnen <BijlageV2Kop oud={…}>', /<BijlageV2Kop oud=\{<header><div className='mail-workbench-title'>/.test(gmw) && /<span>\{t\('Закрити','Sluiten'\)\}<\/span><\/button><\/div><\/header>\}/.test(gmw));
  check('poort: stage in BijlageV2Omhulsel', /<BijlageV2Omhulsel><section className='mail-viewer-stage'>/.test(gmw));
  const poort = readFileSync('src/bijlage-v2/Poort.tsx', 'utf8');
  check('poort: useBijlageV2Vlag (OFREP), zonder vlag de oude kop', /useBijlageV2Vlag\(\)/.test(poort) && !/vlaggen-api/.test(poort) && /if \(!aan\) return <>\{oud\}<\/>/.test(poort));
  const pdf = readFileSync('src/MailPdfVoorbeeld.tsx', 'utf8');
  check('PDF: oude balk alleen zonder v2, nieuwe alleen met v2', /\{!v2&&!miniature&&pdf&&renderedCount>0&&<nav className='mail-pdf-controls'/.test(pdf) && /\{v2&&pdf&&renderedCount>0&&<PdfWerkbalk/.test(pdf) && /v2=useBijlageV2\(\)&&!miniature/.test(pdf));
  // BUG-003: één scroller in de werkbank
  const fix = readFileSync('src/bijlage-v2/bijlage-scroll-fix.css', 'utf8');
  check('BUG-003: .mail-pdf-preview in de werkbank is geen eigen scroller', /\.google-mail-attachment-preview \.mail-viewer-scaled-content \.mail-pdf-preview:not\(\.mail-pdf-preview-miniature\)\{height:auto;overflow:visible;overscroll-behavior:auto\}/.test(fix) && /import'\.\/bijlage-v2\/bijlage-scroll-fix\.css'/.test(pdf));
  // UFW-bestanden van de andere agent: byte-identiek aan 20261028-144748 (indien die referentie op deze machine staat)
  const ref = '/workspace/nieuw-andere/mijn-ruimte-20261028-144748';
  if (existsSync(ref)) for (const f of ['src/MailBijlageVensters.tsx', 'src/MailBijlageVoorbeeld.tsx', 'src/DriveBrowser.tsx']) {
    const h = (p: string) => createHash('sha256').update(readFileSync(p)).digest('hex');
    check(`UFW: ${f} byte-identiek`, h(f) === h(`${ref}/${f}`));
  }
  return einde();
}
