// Вибір вигляду центру облікового запису (IDENTITEIT-007): користувач сам обирає, як виглядає сторінка.
// Keuze van de weergave van het accountcentrum: alleen het uiterlijk wisselt, gegevens, handelingen en rechten blijven gelijk.
// IDENTITEIT-015 (етап 2.1): вибір зберігається в ОБЛІКОВОМУ ЗАПИСІ (поле vormgeving у shared/uiterlijk.ts → POST /api/owner/ui/weergave/save,
// той самий шлях, що й тема), localStorage лишається лише кешем першого кадру. Тому старі прямі посилання (/sessions, /methods, …)
// і повернення до «Класичного» на будь-якому пристрої відкривають той самий вигляд і ті самі дані.
// De keuze staat nu in het ACCOUNT (zelfde weg als het thema); localStorage is alleen nog een cache voor het eerste beeld.
import { useEffect, useState } from 'react';
import { useVlag } from '../functievlag-lezen';
import { readSharedPreferences, watchSharedPreferences, writeSharedPreferences } from '../gedeelde-voorkeuren';

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

/** Вибір з облікового запису (спільні уподобання, які синхронізує сервер). Keuze uit het account. */
export function vormgevingVanAccount(): Vormgeving | undefined {
  try { return readSharedPreferences().vormgeving; } catch { return undefined; }
}
const geldig = (v: unknown, beschikbaar: readonly Vormgeving[]): v is Vormgeving => typeof v === 'string' && (beschikbaar as readonly string[]).includes(v);

/** Збережений вибір, якщо він серед доступних: спершу обліковий запис, потім кеш пристрою; інакше перший доступний
 *  (макет із прапорцем, без нього — «Студія»). Eerst het account, dan de cache van dit apparaat, anders de standaard. */
export function leesVormgeving(beschikbaar: readonly Vormgeving[] = VORMGEVINGEN): Vormgeving {
  const account = vormgevingVanAccount();
  if (geldig(account, beschikbaar)) return account;
  try {
    const v = localStorage.getItem(sleutel);
    if (geldig(v, beschikbaar)) return v;
  } catch { /* Без сховища — типовий вигляд. Zonder opslag: standaard. */ }
  return beschikbaar[0] ?? 'studio';
}

/** Доступні вигляди за прапорцем «Макет». */
export function useBeschikbareVormgevingen(): readonly Vormgeving[] {
  const maquette = useVlag(VLAG_MAQUETTE, false);
  return maquette ? VORMGEVINGEN : VORMGEVINGEN.filter((v) => v !== 'maquette');
}

/** Вибір людини: в обліковий запис (сервер отримає його разом із рештою вигляду, з пакуванням 350 мс) і в кеш пристрою.
 *  Повторне натискання того самого — без змін. Naar het account en de cache van dit apparaat; dezelfde keuze opnieuw verandert niets. */
export function bewaarVormgeving(v: Vormgeving) {
  try { localStorage.setItem(sleutel, v); } catch { /* Keuze geldt dan alleen voor deze sessie. */ }
  try { if (vormgevingVanAccount() !== v) writeSharedPreferences({ vormgeving: v }); } catch { /* geen opslag: alleen deze sessie */ }
  window.dispatchEvent(new CustomEvent(melding, { detail: v }));
}

/** Поточний вибір; оновлюється одразу в усіх відкритих частинах сторінки й інших вкладках. */
export function useVormgeving(): [Vormgeving, (v: Vormgeving) => void] {
  const beschikbaar = useBeschikbareVormgevingen();
  const [waarde, setWaarde] = useState<Vormgeving>(() => leesVormgeving(beschikbaar));
  useEffect(() => {
    const opnieuw = () => {
      const nieuw = leesVormgeving(beschikbaar);
      setWaarde(nieuw);
      // Кеш пристрою наздоганяє обліковий запис (вибір з іншого пристрою). De cache volgt het account.
      const account = vormgevingVanAccount();
      if (geldig(account, beschikbaar)) { try { if (localStorage.getItem(sleutel) !== account) localStorage.setItem(sleutel, account); } catch { /* geen opslag */ } }
    };
    opnieuw();
    // Старий вибір лише цього пристрою (до IDENTITEIT-015) один раз переходить в обліковий запис, якщо там ще нічого немає.
    // Een oude keuze van alleen dit apparaat gaat één keer naar het account als daar nog niets staat.
    // Лише один раз на пристрій (позначка): інший обліковий запис у цьому браузері не успадковує чужий вибір.
    // Eén keer per apparaat (markering): een ander account in deze browser erft de keuze niet.
    try {
      const oud = localStorage.getItem(sleutel);
      if (!localStorage.getItem(sleutel + '-gemigreerd') && !vormgevingVanAccount() && geldig(oud, VORMGEVINGEN)) writeSharedPreferences({ vormgeving: oud });
      localStorage.setItem(sleutel + '-gemigreerd', '1');
    } catch { /* geen opslag */ }
    const opslag = (e: StorageEvent) => { if (e.key === sleutel) opnieuw(); };
    window.addEventListener(melding, opnieuw);
    window.addEventListener('storage', opslag);
    const af = watchSharedPreferences(() => opnieuw());
    return () => { window.removeEventListener(melding, opnieuw); window.removeEventListener('storage', opslag); af(); };
  }, [beschikbaar.length]);
  return [waarde, bewaarVormgeving];
}
