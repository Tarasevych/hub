// Канонічна точка входу шапки спільного переглядача вкладень (CONSOL-001 / Віха M3).
// Перевиставляє WeergaveKop, пов'язані типи та перемикач 3 режимів подання без дублювання логіки Weergave.tsx.
// Canoniek ingangspunt voor de kop van de gedeelde bijlageviewer en de weergavewissel.

export {
  WeergaveKop,
  foutTekst,
  type ContextActie,
  type KopProps,
  type WeergaveBron,
  type WeergaveItem,
} from './Weergave';

export {
  BIJLAGE_MODUS_GEBEURTENIS,
  BIJLAGE_MODUS_LABELS,
  BIJLAGE_MODUS_SLEUTEL,
  actieveBijlageWeergaveModus,
  beschikbareBijlageModi,
  bewaarBijlageWeergaveKeuze,
  leesBijlageWeergaveKeuze,
  useBijlageWeergaveModus,
  type BijlageWeergaveModus,
  type BijlageWeergaveWissel,
} from './weergave-modus';
