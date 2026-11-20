// UPD-006 (19.11.2026) — усі 96/96 кольорових векторних піктограм у вікні підтвердження з іншого пристрою (Варіант А)
// та узгодження ощадливого каркаса завантаження Grok MOBIEL-002 з оформленням «Макет». Без оглядача й бази даних.
// NL: alle 96/96 kleurige vectorpictogrammen in het apparaatbevestigingsvenster (Variant A) en Maquette-aanpassing voor MOBIEL-002.
import { readFileSync } from 'node:fs';
import { PICTOGRAMMEN, pictogramTegel, tegelContrast } from '../../shared/apparaat-bevestiging/symbolen';
import { checker } from './hulp/nep-google';

const lees = (p: string) => readFileSync(p, 'utf8');

export async function main(): Promise<number> {
  const { check, einde } = checker('apparaat-symbool-96-20261119');

  // 1. Усі 96 із 96 піктограм мають векторну форму, контрастний колір і перекладені назви.
  check('каталог містить щонайменше 96 піктограм', PICTOGRAMMEN.length >= 96, `кількість=${PICTOGRAMMEN.length}`);
  const ontbreektVorm: string[] = [];
  const laagContrast: string[] = [];
  const legeNaam: string[] = [];
  for (let i = 0; i < PICTOGRAMMEN.length; i += 1) {
    const uk = pictogramTegel(i, 'uk');
    const nl = pictogramTegel(i, 'nl');
    if (!uk || !nl || !Array.isArray(uk.vorm) || uk.vorm.length === 0) ontbreektVorm.push(`${i}:${PICTOGRAMMEN[i].id}`);
    if (!uk?.naam?.trim() || !nl?.naam?.trim()) legeNaam.push(`${i}:${PICTOGRAMMEN[i].id}`);
    if (uk && tegelContrast(uk.kleur) < 4.5) laagContrast.push(`${i}:${uk.id}:${tegelContrast(uk.kleur).toFixed(2)}`);
  }
  check('усі 96 із 96 піктограм мають векторні форми в pictogramTegel (зокрема Футболка, Барабан, Пазл)', ontbreektVorm.length === 0, ontbreektVorm.join(', '));
  check('усі 96 піктограм мають непорожні назви uk і nl', legeNaam.length === 0, legeNaam.join(', '));
  check('усі 96 кольорових плиток мають контраст >= 4.5', laagContrast.length === 0, laagContrast.join(', '));

  // 2. Symbool.tsx і всі три місця показу використовують pictogramTegel + Варіант А без обрізаного словника Lucide.
  const symboolTsx = lees('src/apparaat-bevestiging/Symbool.tsx');
  const stapTsx = lees('src/apparaat-bevestiging/StapOpKanaal.tsx');
  const luistTsx = lees('src/apparaat-bevestiging/Luisteraar.tsx');
  const instTsx = lees('src/apparaat-bevestiging/InstellingenSectie.tsx');
  const apparaatCss = lees('src/apparaat-bevestiging/apparaat.css');

  check('Symbool.tsx відмальовує усі 96 векторних піктограм через pictogramTegel і не містить обрізаного словника ICONEN із 24 значків',
    symboolTsx.includes('pictogramTegel(index, lang)') && !symboolTsx.includes('lucide-react') && symboolTsx.includes('export function tegelKleurStijl'));
  check('StapOpKanaal.tsx, Luisteraar.tsx та InstellingenSectie.tsx застосовують кольорові плитки (Варіант А)',
    stapTsx.includes('tegelKleurStijl(') && luistTsx.includes('tegelKleurStijl(') && instTsx.includes('tegelKleurStijl('));
  check('apparaat.css оформлює .apb-tegel.is-kleur і захищає вузькі плитки через repeat(3,minmax(0,1fr)) та overflow-wrap:break-word',
    apparaatCss.includes('.apb-tegel.is-kleur{background:var(--apb-tegel-kleur)')
    && apparaatCss.includes('grid-template-columns:repeat(3,minmax(0,1fr))')
    && apparaatCss.includes('overflow-wrap:break-word'));

  // 3. Підлаштування Grok MOBIEL-002 для «Макета» у agenten-kern-maquette.css.
  const maquetteAgentenCss = lees('src/agenten/agenten-kern-maquette.css');
  check('agenten-kern-maquette.css узгоджує .ag-skelet-regel при data-mobiel-breedte-veilig, щоб не перебивати ощадливу анімацію Grok',
    maquetteAgentenCss.includes('html.palet-maquette[data-mobiel-breedte-veilig] .ag-skelet-regel')
    && maquetteAgentenCss.includes('html.palet-maquette[data-mobiel-breedte-veilig] .ag-skelet-regel::after'));

  return einde();
}
