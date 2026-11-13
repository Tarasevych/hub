// IDENTITEIT-012: перевірка введення для блоків (віджетів) робочого простору — одна функція для сервера й інтерфейсу.
// Посилання блоку бачать усі учасники спільного простору, тож сервер приймає лише https без облікових даних і з межами довжини.
// Invoercontrole voor werkruimteblokken (widgets): alleen https zonder inloggegevens, met lengtegrenzen; voor server én interface.

export const BLOK_GRENZEN = { titel: 120, omschrijving: 500, url: 2048 } as const;

export type BlokInvoerFout = 'BLOK_URL_ONGELDIG' | 'BLOK_TITEL_TE_LANG' | 'BLOK_OMSCHRIJVING_TE_LANG';

/** Порожнє посилання дозволене (внутрішній блок); інакше лише https:, без user:pass@, без пробілів і керівних символів. */
export function veiligeBlokUrl(waarde: unknown): { ok: true; url: string } | { ok: false; fout: BlokInvoerFout } {
  const tekst = typeof waarde === 'string' ? waarde.trim() : '';
  if (!tekst) return { ok: true, url: '' };
  if (tekst.length > BLOK_GRENZEN.url || /[\u0000-\u001f\u007f\s]/.test(tekst)) return { ok: false, fout: 'BLOK_URL_ONGELDIG' };
  let adres: URL;
  try { adres = new URL(tekst); } catch { return { ok: false, fout: 'BLOK_URL_ONGELDIG' }; }
  if (adres.protocol !== 'https:' || adres.username || adres.password || !adres.hostname) return { ok: false, fout: 'BLOK_URL_ONGELDIG' };
  return { ok: true, url: adres.href };
}

/** Перевіряє назву, опис і посилання блоку. Повертає перший код помилки або null. */
export function blokInvoerFout(invoer: { title?: unknown; description?: unknown; url?: unknown }): BlokInvoerFout | null {
  if (typeof invoer.title === 'string' && invoer.title.trim().length > BLOK_GRENZEN.titel) return 'BLOK_TITEL_TE_LANG';
  if (typeof invoer.description === 'string' && invoer.description.trim().length > BLOK_GRENZEN.omschrijving) return 'BLOK_OMSCHRIJVING_TE_LANG';
  if (invoer.url !== undefined && invoer.url !== null) { const u = veiligeBlokUrl(invoer.url); if (!u.ok) return u.fout; }
  return null;
}
