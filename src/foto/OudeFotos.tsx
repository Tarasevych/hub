// UI-002: zonder de nieuwe fotodienst (alleen de menuvlag) toont «Мій простір → Фото» de weg naar de bestaande Google-fotokiezer.
// De kiezer zelf blijft op de cloudpagina (zijn serverroutes eisen een cloud-sessie); `?kiezer=1` slaat de doorverwijzing over.
import { Images } from 'lucide-react';
import { canonicalNavigationUrl } from '../canoniek-navigatie';
import type { Lang } from '../cloud-vnext/tekst';
import './foto.css';
import './foto-maquette.css';
export const kiezerUrl = (lang: Lang) => { const u = new URL(canonicalNavigationUrl('cloud', 'photos', lang)); u.searchParams.set('kiezer', '1'); return u.toString(); };
export default function OudeFotos({ lang }: { lang: Lang }) {
  const t = (uk: string, nl: string) => (lang === 'uk' ? uk : nl);
  return <section className='foto foto-leeg' data-foto-oud='true'><Images aria-hidden='true' /><h2>{t('Фото', 'Foto’s')}</h2><p>{t('Вибір фото з Google Фото відкривається у «Хмарному сховищі».', 'Foto’s kiezen uit Google Foto’s opent in «Cloudopslag».')}</p><a className='foto-knop is-hoofd' href={kiezerUrl(lang)}>{t('Відкрити Google Фото', 'Google Foto’s openen')}</a></section>;
}
