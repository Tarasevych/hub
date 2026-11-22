// KLIMOP-018 (21.11.2026, Хвиля 1 виправлень за незалежною перевіркою «Плюща»):
// Чистий перелік 11 служб «Мого простору» без жодних серверних залежностей (без node:crypto, node:fs тощо).
// Його безпечно імпортують і переглядач (src/agenten/KlimopPaneel.tsx), і сервер (shared/klimop/diensten.ts повторно
// його експортує). Незалежна перевірка виявила, що панель брала перелік напряму з shared/klimop/diensten.ts, який тягне
// createHash із shared/klimop/kern.ts та обчислення генератора Педерсена з shared/klimop/drempelsleutels.ts у клієнтський
// пакунок Vite, через що чисте клієнтське складання завершувалося з кодом 1.
// Межу стереже випробування tests/eenheid/klimop-018-klientbouw-zoek-taalvaardigheid-20261121.test.ts: жоден модуль,
// досяжний з src/ звичайним (не типовим) імпортом, не може імпортувати вбудовані модулі Node.js.
//
// KLIMOP-018 · Zuivere lijst van de 11 diensten zonder serverafhankelijkheden, veilig voor browser en server.

export const KLIMOP_ELF_DIENSTEN = Object.freeze([
  'werkblad',            // 1. Головний робочий простір (нотатки, завдання, огляд)
  'postvak',             // 2. Електронна пошта та повідомлення
  'identiteit',          // 3. Облікові записи та самосуверенна ідентичність
  'wolkopslag',          // 4. Хмарне сховище зашифрованих файлів
  'agenda',              // 5. Календар і події
  'ai_ruimte',           // 6. ШІ-простір
  'mcp_poort',           // 7. Шлюз протоколу контексту моделі (14 ШІ-агентів)
  'ontwikkelmiddelen',   // 8. Засоби розробки та інтеграції сховищ коду
  'slimwoon',            // 9. Розумний дім і спільна оселя
  'verbinders',          // 10. Програмні з'єднувачі зовнішніх служб
  'beheer_en_diagnose',  // 11. Адміністрування та діагностика стану вузлів
] as const);

export type KlimopDienstId = (typeof KLIMOP_ELF_DIENSTEN)[number];

/** Перевірка належності значення до переліку 11 служб без серверних залежностей. */
export function isKlimopDienstId(x: unknown): x is KlimopDienstId {
  return typeof x === 'string' && (KLIMOP_ELF_DIENSTEN as readonly string[]).includes(x);
}
