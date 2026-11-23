// Єдині ворота перевірки прапорців хмарних модулів (П-1..П-7, WebDAV) із збереженням
// зворотної сумісності зі змінними середовища для наявних модульних випробувань.
// Використовує лінивий імпорт ./vlaggen, щоб не створювати статичних циклів імпорту.
// Centrale poort voor cloudfunctievlaggen met behoud van omgevingsvariabelen voor eenheidstests.

export async function cloudVlagAan(sleutel: string, userId?: string): Promise<boolean> {
  try {
    const { berekenen } = await import('./vlaggen');
    const id = typeof userId === 'string' && userId.trim() ? userId.trim() : '__cloud_poort__';
    const rijen = await berekenen({ id } as never, [sleutel]);
    return rijen[0]?.value === true;
  } catch {
    return false;
  }
}

export async function cloudModuleActief(envNaam: string, vlagSleutel: string, userId?: string): Promise<boolean> {
  if (process.env[envNaam] === 'enabled') return true;
  return cloudVlagAan(vlagSleutel, userId);
}
