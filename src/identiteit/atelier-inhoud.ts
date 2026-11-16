import { createContext } from 'react';

// Scheid de dertien echte handelingen zonder het oude accountscherm te wijzigen.
export const AtelierInhoud = createContext(false);

// ДУБЛІ-001: у «Макеті» вибір профілю (звичайний / технічний простір) стоїть у самій картці розділу — розділ «Ідентичності»
// тоді не показує його вдруге. In «Ontwerp» staat de profielkeuze al in de kaart zelf.
export const RuimtewisselElders = createContext(false);
