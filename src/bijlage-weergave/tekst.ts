// Спільний перегляд вкладень, етап 3: текст відкритого вкладення для швидкої картки (15.2), пошуку (15.6)
// і порівняння версій (15.5). Виконавець: Claude Opus 5.5 (High) через Google Antigravity (antigravity),
// продовження роботи Grok (grok). Прапорець `bijlage-weergave-gedeeld-v1`, типово вимкнений.
//
// Правила:
//   • текст беремо лише з уже завантаженого файла (той самий Blob, що бачить людина), без нового запиту в мережу;
//   • src/mail/bijlage-tekst.ts (pdfjs і читач документів) підвантажуємо лише тоді, коли текст справді потрібен,
//     щоб не роздувати основний пакунок переглядача;
//   • результат зберігаємо в WeakMap за самим Blob: гортання туди й назад не читає той самий PDF удруге,
//     а коли Blob звільнено, запис зникає сам;
//   • зламаний чи захищений паролем файл — не помилка переглядача: повертаємо стан «fout» без тексту,
//     а оболонка просто не показує рядків картки (нічого не вигадуємо).
import { useEffect, useState } from 'react';

export type TekstStand =
  | { fase: 'geen' }
  | { fase: 'bezig' }
  | { fase: 'klaar'; tekst: string; paginas?: number; afgekapt: boolean }
  | { fase: 'fout'; code: string };

type Klaar = Extract<TekstStand, { fase: 'klaar' }>;

const GEHEUGEN = new WeakMap<Blob, Promise<Klaar>>();

/** Найбільший файл, текст якого читаємо в переглядачі (більший файл читає лише наявне вікно порівняння). */
export const TEKST_MAX_BLOB = 40 * 1024 * 1024;

/** Чи є сенс узагалі пробувати: PDF, звичайний текст, документи Word/ODT/RTF. Без завантаження модуля pdfjs. */
export function tekstMogelijk(naam: string, contentType: string): boolean {
  const ext = /\.([a-z0-9]{1,8})$/i.exec(String(naam || '').trim())?.[1]?.toLowerCase() || '';
  if (['pdf', 'txt', 'text', 'md', 'markdown', 'csv', 'tsv', 'docx', 'docm', 'dotx', 'dotm', 'odt', 'ott', 'rtf'].includes(ext)) return true;
  const type = String(contentType || '').toLowerCase().split(';')[0].trim();
  return type === 'application/pdf' || /^text\/(plain|markdown|csv|tab-separated-values)$/.test(type)
    || type.includes('wordprocessingml') || type.includes('opendocument.text') || /^(application|text)\/rtf$/.test(type);
}

/** Текст одного файла. Повторний виклик з тим самим Blob повертає ту саму обіцянку. */
export function leesTekst(blob: Blob, contentType: string, naam: string): Promise<Klaar> {
  const al = GEHEUGEN.get(blob);
  if (al) return al;
  const taak = import('../mail/bijlage-tekst')
    .then((m) => m.bijlageTekst(blob, contentType, naam))
    .then((r): Klaar => ({ fase: 'klaar', tekst: String(r.tekst || ''), paginas: r.paginas, afgekapt: Boolean(r.afgekapt) }));
  GEHEUGEN.set(blob, taak);
  // Невдалу спробу не тримаємо: людина може натиснути «Спробувати ще раз» в оболонці, і тоді читаємо знову.
  taak.catch(() => GEHEUGEN.delete(blob));
  return taak;
}

/**
 * Хук для оболонки. `actief` = false нічого не читає (наприклад, вид файла не рахунок і пошук закритий).
 * Повертає стан, який можна показати людині, без кидання помилок назовні.
 */
export function useBijlageTekst(blob: Blob | null | undefined, contentType: string, naam: string, actief: boolean): TekstStand {
  const [stand, setStand] = useState<TekstStand>({ fase: 'geen' });
  useEffect(() => {
    if (!actief || !blob || blob.size === 0 || blob.size > TEKST_MAX_BLOB || !tekstMogelijk(naam, contentType)) { setStand({ fase: 'geen' }); return; }
    let weg = false;
    setStand({ fase: 'bezig' });
    leesTekst(blob, contentType, naam)
      .then((r) => { if (!weg) setStand(r); })
      .catch((e: unknown) => { if (!weg) setStand({ fase: 'fout', code: e instanceof Error ? e.message : 'TEKST_ONLEESBAAR' }); });
    return () => { weg = true; };
  }, [blob, contentType, naam, actief]);
  return stand;
}
