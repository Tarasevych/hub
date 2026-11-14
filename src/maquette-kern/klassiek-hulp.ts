// Допоміжний визначник класичних монохромних тем («Біла класика» та «Чорна класика») для ядра макета (KLASSIEK-001).
// Працює потокобезпечно як через спільне сховище теми, так і через ознаки кореневого елемента документа у випробуваннях.
// Hulpfunctie om te bepalen of een van de klassieke monochrome thema's («Klassiek wit» of «Klassiek zwart») actief is.

import { leesKeuze } from '../thema/kern';
import { useThemaStand } from '../thema/useThema';

export function useIsKlassiekMaquette(): boolean {
  const s = useThemaStand();
  const rauwPalet = typeof s.palet === 'string' ? s.palet : '';
  if (rauwPalet === 'klassiek-wit' || rauwPalet === 'klassiek-zwart') {
    return true;
  }
  const gekozenPalet = String(leesKeuze(s.theme, s.palet).palet);
  if (gekozenPalet === 'klassiek-wit' || gekozenPalet === 'klassiek-zwart') {
    return true;
  }
  if (typeof document !== 'undefined') {
    const wortel = document.documentElement;
    return (
      wortel.dataset.maquetteStijl === 'klassiek' ||
      wortel.classList.contains('palet-klassiek-wit') ||
      wortel.classList.contains('palet-klassiek-zwart')
    );
  }
  return false;
}
