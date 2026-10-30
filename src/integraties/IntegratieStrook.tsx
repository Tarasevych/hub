// UI-013 fase 2 — gedeelde strook «Підключення» op de themapagina's (Пошта, Хмара, Фото, Агенда, ШІ, Будинок, GitHub).
// EÉN component, leest uit hetzelfde register als de globale catalogus (shared/integraties-register.ts): geen eigen kopie per dienst.
// Toont de technische gereedheid (adapter), NIET de stand van een account: die leest elke pagina zelf in haar eigen accountsblok.
// Achter de vlag `integraties-catalogus-v2`; UIT = niets.
import { INTEGRATIES } from '../../shared/integraties-catalogus';
import { GROEPEN, groepVan, registerVan, type DoelDienst } from '../../shared/integraties-register';
import { canonicalServiceUrl } from '../canoniek-dienst';
import Logo from '../merk/MerkLogo';
import { useCatalogusV2 } from './catalogus-vlag';
import { routeLang } from '../canoniek-navigatie';
import HulpVraag from '../hulp/HulpVraag';
import './integraties.css';

export function strookItems(dienst: DoelDienst) {
  const alle = INTEGRATIES.filter((i) => registerVan(i.id)?.doelDienst === dienst);
  const zichtbaar = alle.filter((i) => groepVan(i, null) !== 'ontwikkeling');
  return { zichtbaar, inOntwikkeling: alle.length - zichtbaar.length, totaal: alle.length };
}

export default function IntegratieStrook({ lang: taal, dienst }: { lang?: 'uk' | 'nl'; dienst: DoelDienst }) {
  const aan = useCatalogusV2() === true;
  const lang: 'uk' | 'nl' = taal ?? (routeLang() === 'nl' ? 'nl' : 'uk');
  if (!aan) return null;
  const tr = (uk: string, nl: string) => (lang === 'uk' ? uk : nl);
  const { zichtbaar, inOntwikkeling, totaal } = strookItems(dienst);
  if (!totaal) return null;
  let catalogus = ''; try { catalogus = canonicalServiceUrl('admin', 'directories', lang, true); } catch { catalogus = ''; }
  return (
    <section className='is2' data-integratie-strook={dienst} aria-label={tr('Підключення для цього розділу', 'Koppelingen voor dit onderdeel')}>
      <div className='is2-kop'>
        <h3>{tr('Що можна підключити тут', 'Wat u hier kunt koppelen')}</h3>
        <HulpVraag k='integraties.strook' lang={lang} />
        {catalogus ? <a className='ic2-knop' href={catalogus}>{tr('Увесь каталог', 'Hele catalogus')}</a> : null}
      </div>
      <ul className='is2-lijst'>
        {zichtbaar.map((i) => { const g = groepVan(i, null); return (
          <li key={i.id} data-groep={g} title={GROEPEN.find((x) => x.id === g)![lang]}><Logo id={i.id} naam={i.naam} logo={i.logo} /><span>{i.naam}</span><i aria-hidden /><span className='il-sr'>{GROEPEN.find((x) => x.id === g)![lang]}</span></li>
        ); })}
      </ul>
      {inOntwikkeling ? <p className='iw2-noot'>{tr(`Ще ${inOntwikkeling} у розробці — план є в каталозі.`, `Nog ${inOntwikkeling} in ontwikkeling — het plan staat in de catalogus.`)}</p> : null}
    </section>
  );
}
