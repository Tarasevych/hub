// Вибір вигляду центру облікового запису (IDENTITEIT-007): користувач сам обирає, як виглядає сторінка.
// Keuze van de weergave van het accountcentrum: alleen het uiterlijk wisselt, gegevens, handelingen en rechten blijven gelijk.
import { useEffect, useState } from 'react';

export type Vormgeving = 'studio' | 'klassiek';

/** Volgorde in de kiezer. Новий вигляд за макетом власника додається сюди, коли буде готовий. */
export const VORMGEVINGEN: readonly Vormgeving[] = ['studio', 'klassiek'];

export const VORMGEVING_TEKST: Record<Vormgeving, { uk: string; nl: string; ukUitleg: string; nlUitleg: string }> = {
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

export function leesVormgeving(): Vormgeving {
  try {
    const v = localStorage.getItem(sleutel);
    if (v && (VORMGEVINGEN as readonly string[]).includes(v)) return v as Vormgeving;
  } catch { /* Без сховища — типовий вигляд. Zonder opslag: standaard. */ }
  return 'studio';
}

export function bewaarVormgeving(v: Vormgeving) {
  try { localStorage.setItem(sleutel, v); } catch { /* Keuze geldt dan alleen voor deze sessie. */ }
  window.dispatchEvent(new CustomEvent(melding, { detail: v }));
}

/** Поточний вибір; оновлюється одразу в усіх відкритих частинах сторінки й інших вкладках. */
export function useVormgeving(): [Vormgeving, (v: Vormgeving) => void] {
  const [waarde, setWaarde] = useState<Vormgeving>(leesVormgeving);
  useEffect(() => {
    const opnieuw = () => setWaarde(leesVormgeving());
    const opslag = (e: StorageEvent) => { if (e.key === sleutel) opnieuw(); };
    window.addEventListener(melding, opnieuw);
    window.addEventListener('storage', opslag);
    return () => { window.removeEventListener(melding, opnieuw); window.removeEventListener('storage', opslag); };
  }, []);
  return [waarde, bewaarVormgeving];
}
