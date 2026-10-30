// Блок 5.1: фон робочого столу живе на оболонці (main.canonical-chrome.schil-achtergrond::before),
// тож лишається на пошті й інших сторінках, а не лише поки змонтований «Робочий стіл».
const GELDIG = new Set(['geen', 'nacht', 'zee', 'woud', 'avond', 'eigen']);

export function pasPaginaAchtergrondToe(voorkeur?: { achtergrond?: string; achtergrondEigen?: string }): void {
  if (typeof document === 'undefined') return;
  const chrome = document.querySelector<HTMLElement>('.canonical-chrome');
  if (!chrome) return;
  let achtergrond = voorkeur?.achtergrond;
  let eigen = voorkeur?.achtergrondEigen || '';
  if (!achtergrond && typeof localStorage !== 'undefined') {
    let bestOp = -1;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const sleutel = localStorage.key(i);
        if (!sleutel || !sleutel.startsWith('tsv:werkblad-v2:')) continue;
        const raw = JSON.parse(localStorage.getItem(sleutel) || 'null') as { op?: number; indeling?: { achtergrond?: string }; achtergrondEigen?: string } | null;
        const op = Number(raw?.op || 0);
        const kandidaat = raw?.indeling?.achtergrond;
        if (typeof kandidaat === 'string' && GELDIG.has(kandidaat) && op >= bestOp) {
          bestOp = op;
          achtergrond = kandidaat;
          eigen = typeof raw?.achtergrondEigen === 'string' ? raw.achtergrondEigen : '';
        }
      }
    } catch { /* приватний режим */ }
  }
  if (!achtergrond || !GELDIG.has(achtergrond)) return;
  chrome.dataset.achtergrond = achtergrond;
  if (achtergrond === 'eigen' && eigen) chrome.style.setProperty('--pagina-beeld', `url("${eigen.replace(/["\\)]/g, '')}")`);
  else chrome.style.removeProperty('--pagina-beeld');
}

function houdPaginaAchtergrond(): void {
  if (typeof window === 'undefined') return;
  const later = () => pasPaginaAchtergrondToe();
  later();
  window.addEventListener('storage', later);
  // Оболонка зʼявляється після цього модуля. Кілька секунд дочитуємо кеш, якщо атрибута ще немає.
  const timer = window.setInterval(() => {
    const chrome = document.querySelector('.canonical-chrome');
    if (chrome && !chrome.getAttribute('data-achtergrond')) pasPaginaAchtergrondToe();
  }, 500);
  window.setTimeout(() => window.clearInterval(timer), 8000);
}

houdPaginaAchtergrond();
