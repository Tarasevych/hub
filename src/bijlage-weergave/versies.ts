// ПОЧАТОК РОБОТИ, НЕ ПЕРЕВІРЕНО: чисті функції збирають вкладення однієї розмови
// у версії того самого документа й дають різницю текстів двох версій.
// Правило «той самий документ» не вигадуємо наново: беремо documentSleutel,
// bijlageVersies і versieVan з src/mail/gesprek-context.ts (ключ за нормалізованою
// назвою; однакове ім’я й розмір — не нова версія). Різницю текстів рахує
// vergelijkTeksten з src/mail/tekst-verschil.ts. Мережі немає, файли самі
// не завантажуємо. Інтерфейс не підключено, вікно VersieVergelijk не відкриваємо,
// тести не проганяли. Це початок, не готовий результат.
// Лишилося: прогнати скелет тесту; врізати дію в Weergave.tsx, лише коли є
// попередня версія; відкрити наявне вікно VersieVergelijk з vergelijkKeuze;
// подати текст через bijlageTekst; коротко перевірити типи.
// Спільний перегляд вкладень, етап 3, крок 2 (Grok: hub.tarasevych.com).
// Прапорець `bijlage-weergave-gedeeld-v1`, типово вимкнений. Без DOM, щоб можна було викликати з тестів.

import {
  bijlageVersies,
  documentSleutel,
  versieVan,
  type CtxBericht,
  type VersieGroep,
  type VersieItem,
} from '../mail/gesprek-context';
import { vergelijkTeksten, type VerschilUitkomst } from '../mail/tekst-verschil';

export { bijlageVersies, documentSleutel, versieVan };
export type { CtxBericht, VersieGroep, VersieItem, VerschilUitkomst };

/** Вкладення розмови, згруповані як версії того самого документа. Обгортка над bijlageVersies. */
export function versiesVanGesprek(berichten: CtxBericht[]): { groepen: VersieGroep[]; los: ReturnType<typeof bijlageVersies>['los'] } {
  return bijlageVersies(berichten);
}

/** Група, до якої входить відкритий файл, або null, якщо пар немає. */
export function groepVoor(berichten: CtxBericht[], berichtId: string, bijlageId: string): VersieGroep | null {
  const { groepen } = bijlageVersies(berichten);
  for (const groep of groepen) {
    if (groep.items.some((it) => it.berichtId === berichtId && it.bijlage.providerAttachmentId === bijlageId)) return groep;
  }
  return null;
}

/**
 * Унікальні версії групи за зростанням дати (номер 1 — найстаріша).
 * Однакове ім’я й розмір (переслана копія без змін) лишаються одним номером.
 */
export function versiesOpDatum(groep: VersieGroep): VersieItem[] {
  const per = new Map<number, VersieItem>();
  for (const it of groep.items) {
    const al = per.get(it.nummer);
    if (!al || it.wanneer < al.wanneer) per.set(it.nummer, it);
  }
  return [...per.values()].sort((a, b) => a.wanneer - b.wanneer || a.nummer - b.nummer);
}

/** Попередня (старіша) версія відкритого файла, або null. */
export function vorigeVersie(groep: VersieGroep, berichtId: string, bijlageId: string): VersieItem | null {
  const huidig = groep.items.find((it) => it.berichtId === berichtId && it.bijlage.providerAttachmentId === bijlageId);
  if (!huidig || huidig.nummer <= 1) return null;
  return versiesOpDatum(groep).find((it) => it.nummer === huidig.nummer - 1) ?? null;
}

/** Підпис дії для людини, або null, якщо попередньої версії немає — тоді кнопки не показуємо. */
export function actieBijschrift(taal: 'uk' | 'nl', vorige: VersieItem | null): string | null {
  if (!vorige) return null;
  return taal === 'nl' ? 'Vergelijken met de vorige versie' : 'Порівняти з попередньою версією';
}

/** Дані, з яких пізніше відкриємо наявне вікно VersieVergelijk: група й стара та нова версії. Без оболонки. */
export type VergelijkKeuze = {
  groep: VersieGroep;
  oud: VersieItem;
  nieuw: VersieItem;
};

export function vergelijkKeuze(groep: VersieGroep, berichtId: string, bijlageId: string): VergelijkKeuze | null {
  const nieuw = groep.items.find((it) => it.berichtId === berichtId && it.bijlage.providerAttachmentId === bijlageId);
  const oud = vorigeVersie(groep, berichtId, bijlageId);
  if (!nieuw || !oud) return null;
  return { groep, oud, nieuw };
}

/**
 * Різниця двох текстів через vergelijkTeksten. Мережі немає: тексти вже мають бути в пам’яті.
 * Якщо обидва боки порожні — null (нема чого порівнювати). Якщо текст завеликий,
 * vergelijkTeksten сам обрізає й ставить afgekapt.
 */
export function verschilVersies(oudTekst: string, nieuwTekst: string): VerschilUitkomst | null {
  const oud = String(oudTekst ?? '');
  const nieuw = String(nieuwTekst ?? '');
  if (!oud.trim() && !nieuw.trim()) return null;
  return vergelijkTeksten(oud, nieuw);
}
