// Oude naam van de taalvlag. Sinds INTEG-001 is er één component: src/MoviPrapor.tsx (SVG-bestanden in src/taalvlaggen/).
// Dit bestand blijft staan omdat docs/kaart/bestandskaart.json het noemt en andere takken het nog kunnen importeren;
// het tekent zelf niets meer. Nieuwe code importeert MoviPrapor.
export { default, MoviPrapor, MOVA_NAAM, MOVA_VOLLEDIG } from './MoviPrapor';
