// Вибір вигляду центру облікового запису (IDENTITEIT-007): користувач сам обирає, як виглядає сторінка.
// Keuze van de weergave van het accountcentrum: alleen het uiterlijk wisselt, gegevens, handelingen en rechten blijven gelijk.
import { useEffect, useState } from 'react';
import { useVlag } from '../functievlag-lezen';
import { leesKeuze } from '../thema/kern';
import { useThemaStand } from '../thema/useThema';

/** Прапорець вигляду «Макет» (IDENTITEIT-007). Zonder deze vlag blijven alleen de Studio en de klassieke weergave over. */
export const VLAG_MAQUETTE = 'identiteit-account-maquette';

/** Подія вікна від вигляду «Макет»: кнопка смуги сервісів просить застосунок перейти до сервісу сайту (detail — id пункту меню). */
export const GA_NAAR_DIENST = 'mijn-ruimte:ga-naar-dienst';

export type Vormgeving = 'maquette' | 'studio' | 'klassiek';

/** Volgorde in de kiezer: eerst het ontwerp van de eigenaar (standaard), dan de Studio, dan de klassieke lange pagina. */
export const VORMGEVINGEN: readonly Vormgeving[] = ['maquette', 'studio', 'klassiek'];

export const VORMGEVING_TEKST: Record<Vormgeving, { uk: string; nl: string; ukUitleg: string; nlUitleg: string }> = {
  maquette: {
    uk: 'Макет', nl: 'Ontwerp',
    ukUitleg: 'Дизайн власника: герой, картки чотирьох груп, якірне меню, яке можна закріпити з будь-якого краю, пошук Ctrl+K. Налаштування й дані ті самі, лише подання інше.',
    nlUitleg: 'Het ontwerp van de eigenaar: hero, kaarten in vier groepen, een ankermenu dat aan elke rand kan, zoeken met Ctrl+K. Instellingen en gegevens blijven gelijk, alleen de weergave wisselt.',
  },
  studio: {
    uk: 'Студія', nl: 'Studio',
    ukUitleg: 'Один розділ на екрані, огляд груп і пошук Ctrl+K. Налаштування й дані не змінюються, лише їх подання.',
    nlUitleg: 'Eén onderdeel per scherm, groepsoverzicht en zoeken met Ctrl+K. Instellingen en gegevens blijven gelijk, alleen de weergave wisselt.',
  },
  klassiek: {
    uk: 'Класичний', nl: 'Klassiek',
    ukUitleg: 'Усі дванадцять розділів однією довгою сторінкою зі змістом, як було раніше. Підходить, якщо звикли до старого вигляду.',
    nlUitleg: 'Alle twaalf onderdelen op één lange pagina met inhoudsopgave, zoals vroeger. Handig als u aan de oude weergave gewend bent.',
  },
};

const sleutel = 'identiteit-account-vormgeving';
const melding = 'identiteit-vormgeving-gewijzigd';

/** Збережений вибір, якщо він серед доступних; інакше перший доступний (макет із прапорцем, без нього — «Студія»). */
export function leesVormgeving(beschikbaar: readonly Vormgeving[] = VORMGEVINGEN): Vormgeving {
  try {
    const v = localStorage.getItem(sleutel);
    if (v && (beschikbaar as readonly string[]).includes(v)) return v as Vormgeving;
  } catch { /* Без сховища — типовий вигляд. Zonder opslag: standaard. */ }
  return beschikbaar[0] ?? 'studio';
}

/** Доступні вигляди за прапорцем «Макет» або загальносайтовою палітрою «Макет». */
export function useBeschikbareVormgevingen(): readonly Vormgeving[] {
  const maquette = useVlag(VLAG_MAQUETTE, false);
  const stand = useThemaStand();
  const isThemaMaquette = (leesKeuze(stand.theme, stand.palet).palet as string) === 'maquette';
  return maquette || isThemaMaquette ? VORMGEVINGEN : VORMGEVINGEN.filter((v) => v !== 'maquette');
}

export function bewaarVormgeving(v: Vormgeving) {
  try { localStorage.setItem(sleutel, v); } catch { /* Keuze geldt dan alleen voor deze sessie. */ }
  window.dispatchEvent(new CustomEvent(melding, { detail: v }));
}

/** Поточний вибір; оновлюється одразу в усіх відкритих частинах сторінки й інших вкладках. */
export function useVormgeving(): [Vormgeving, (v: Vormgeving) => void] {
  const beschikbaar = useBeschikbareVormgevingen();
  const stand = useThemaStand();
  const [waarde, setWaarde] = useState<Vormgeving>(() => leesVormgeving(beschikbaar));
  useEffect(() => {
    const opnieuw = () => setWaarde(leesVormgeving(beschikbaar));
    opnieuw();
    const opslag = (e: StorageEvent) => { if (e.key === sleutel) opnieuw(); };
    window.addEventListener(melding, opnieuw);
    window.addEventListener('storage', opslag);
    return () => { window.removeEventListener(melding, opnieuw); window.removeEventListener('storage', opslag); };
  }, [beschikbaar.length, stand.palet]);
  return [waarde, bewaarVormgeving];
}
