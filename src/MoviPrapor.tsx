// MoviPrapor — de ENE taalvlag van de site (INTEG-001, wens van de eigenaar: «справжній прапор (піктограма SVG), не емодзі»).
// Windows toont emoji-vlaggen als de letters «UA» en «NL»; daarom komt de vlag uit een echt SVG-bestand van het project:
//   src/taalvlaggen/oekraine.svg  (Oekraïens: blauw boven, geel onder)
//   src/taalvlaggen/belgie.svg    (Nederlands, wens van de eigenaar: België — zwart, geel, rood, verticaal)
// Gebruikers: het accountmenu (v6 en v2, ook het afgemelde), het instellingencentrum, de gastpagina en het aanmeldscherm.
// Eén component, één bron: wie een taalvlag nodig heeft, importeert deze (`import MoviPrapor from './MoviPrapor'`) en tekent
// nooit zelf een vlag (geen emoji, geen CSS-verloop, geen tweede SVG-kopie).
//
//   <MoviPrapor taal='uk' />          (ook `lang='uk'`: zelfde naam als de rest van de UI; `taal` wint als beide staan)
//
// Het bestand wordt als <img> getekend (decoratief: de naam staat ernaast als tekst, dus alt='' en aria-hidden). Vite zet zo'n
// klein bestand als data-URI in de bundel (CSP img-src 'self' data:), dus er komt geen extra verzoek en geen knipperen bij.
import './taal-vlag.css';

export type MoviPraporTaal = 'uk' | 'nl';

/** Adres van het SVG-bestand per taal (new URL(…, import.meta.url): Vite verwerkt het als asset, esbuild laat het staan). */
export const PRAPOR_BRON: Record<MoviPraporTaal, string> = {
  uk: new URL('./taalvlaggen/oekraine.svg', import.meta.url).href,
  nl: new URL('./taalvlaggen/belgie.svg', import.meta.url).href,
};

/**
 * Korte naam van de taal naast de vlag. Eigenaar: «замість UA має бути укр.» — dus nooit «UA»; het Nederlands blijft «NL».
 * Eén plek, zodat menu, gastpagina en aanmeldscherm hetzelfde tonen.
 */
export const MOVA_NAAM: Record<MoviPraporTaal, string> = { uk: 'укр.', nl: 'NL' };

/** Volledige naam (tooltip en aria-label), in de taal zelf. */
export const MOVA_VOLLEDIG: Record<MoviPraporTaal, string> = { uk: 'Українська', nl: 'Nederlands' };

type Props = { taal?: MoviPraporTaal; lang?: MoviPraporTaal; className?: string };

export function MoviPrapor({ taal, lang, className }: Props) {
  const t: MoviPraporTaal = (taal || lang) === 'nl' ? 'nl' : 'uk';
  // De klassen taal-vlag-* zijn de eigen haken; language-flag(-*) blijven staan omdat instellingencentrum.css de vlag in de taalkeuze daarop afstemt.
  const klasse = `taal-vlag taal-vlag-${t} language-flag language-flag-${t}${className ? ` ${className}` : ''}`;
  return <img className={klasse} src={PRAPOR_BRON[t]} alt='' aria-hidden='true' width={24} height={16} draggable={false} decoding='async' data-movi-prapor={t} />;
}

export default MoviPrapor;
