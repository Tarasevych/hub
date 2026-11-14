// IDENTITEIT-013: безпечне копіювання в буфер обміну. Браузер може відмовити (немає дозволу, незахищена сторінка, вкладка у фоні) —
// тоді пробуємо запасний шлях через тимчасове поле, а якщо й він не вдається, повертаємо false, щоб екран показав зрозуміле повідомлення.
// Veilig kopiëren naar het klembord: bij weigering een reserveweg, anders false zodat het scherm een duidelijke melding toont.
export async function kopieerTekst(tekst: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) { await navigator.clipboard.writeText(tekst); return true; }
  } catch { /* hieronder de reserveweg */ }
  try {
    if (typeof document === 'undefined') return false;
    const veld = document.createElement('textarea');
    veld.value = tekst; veld.setAttribute('readonly', ''); veld.style.position = 'absolute'; veld.style.left = '-9999px';
    document.body.appendChild(veld); veld.select();
    const ok = document.execCommand('copy');
    veld.remove();
    return ok;
  } catch { return false; }
}

/** Двомовний текст для невдалого копіювання. */
export const KOPIEER_MISLUKT = ['Не вдалося скопіювати — виділіть текст і скопіюйте вручну.', 'Kopiëren lukte niet — selecteer de tekst en kopieer hem zelf.'] as const;
