// Спільне ядро художньої системи «Макет» (MAQUETTE-001).
// Об'єднує таблиці змінних, студійні поверхні та перевикористовувані компоненти для всіх піддоменів «Мій простір».
// Gemeenschappelijke kern van het «Maquette»-ontwerpstelsel voor alle subdomeinen van Mijn Ruimte.

import './maquette-tokens.css';
import './maquette-oppervlakken.css';
import './maquette-klassiek.css';

export { useIsKlassiekMaquette } from './klassiek-hulp';

export {
  MaquetteKunst,
  type MaquetteKunstSoort,
  type MaquetteKunstProps,
} from './MaquetteKunst';

export {
  MaquetteHeld,
  type MaquetteHeldActie,
  type MaquetteHeldStatistiek,
  type MaquetteHeldProps,
} from './MaquetteHeld';

export {
  MaquetteAnkerRail,
  type MaquetteRailZijde,
  type MaquetteAnkerItem,
  type MaquetteAnkerRailProps,
} from './MaquetteAnkerRail';

export {
  MaquetteSectieKaart,
  MaquetteGroepKop,
  MaquetteIntermezzo,
  type MaquetteKaartAccent,
  type MaquetteDetailItem,
  type MaquetteSectieKaartProps,
  type MaquetteGroepKopProps,
  type MaquetteIntermezzoProps,
} from './MaquetteSectieKaart';

export {
  MaquetteSnelNaar,
  type MaquetteSnelNaarItem,
  type MaquetteSnelNaarProps,
} from './MaquetteSnelNaar';

export {
  MaquetteVoet,
  type MaquetteVoetProps,
} from './MaquetteVoet';
