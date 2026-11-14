// IDENTITEIT-014: стан сховища ключів для розділу «Відновлення» — той самий запит, що й у SleutelkluisSectie
// (POST /api/owner/sleutelkluis/stand через swrPost: паралельні читання зливаються, кеш спільний).
// undefined — ще читаємо; null — не вдалося. De stand van de sleutelkluis voor «Herstel»; zelfde verzoek als SleutelkluisSectie.
import { useEffect, useState } from 'react';
import { swrPost } from '../lees-cache';
import type { KluisKern } from './reserve';

export function useKluisKern(context: Record<string, unknown>): KluisKern | null | undefined {
  const [kluis, setKluis] = useState<KluisKern | null | undefined>(undefined);
  useEffect(() => {
    let actief = true;
    swrPost<KluisKern>('/api/owner/sleutelkluis/stand', context, (d) => {
      if (actief && d && typeof d === 'object' && typeof d.stand === 'string') setKluis(d);
    }).catch(() => { if (actief) setKluis((k) => (k === undefined ? null : k)); });
    return () => { actief = false; };
  }, [context]);
  return kluis;
}
