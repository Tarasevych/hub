// ZAVYSANNIA-001 (15.11.2026): тиха зміна теми на телефоні.
// Причина зависання: клас на <html> (theme-light/theme-dark/palet-…) перераховує стилі всього документа, а у вигляді «Макет»
// після цього одночасно стартують сотні переходів кольору й тла (transition на .mr-mq, кожній картці, рейці, панелях). Кожен їхній
// кадр перемальовує шари backdrop-filter — на слабкому GPU телефона сторінка перестає відповідати на дотики на кілька секунд.
// Тут: на час зміни теми <html> отримує клас `thema-wissel`, і правило в wissel-rust.css вимикає всі переходи й анімації.
// Клас знімається через два кадри — нова тема з'являється одразу, без «переливання» кольорів.
// Rustige themawissel: tijdens de wissel krijgt <html> `thema-wissel`, wissel-rust.css zet dan alle overgangen uit; na twee frames weg.

let kader = 0;

/** Позначає <html> як «тема змінюється» на два кадри. Безпечно викликати багато разів поспіль (один таймер на всіх). */
export function themaWisselRust(): void {
  if (typeof document === 'undefined' || typeof requestAnimationFrame !== 'function') return;
  const root = document.documentElement;
  if (!root.classList.contains('thema-wissel')) root.classList.add('thema-wissel');
  if (kader) cancelAnimationFrame(kader);
  kader = requestAnimationFrame(() => {
    kader = requestAnimationFrame(() => { kader = 0; root.classList.remove('thema-wissel'); });
  });
}
