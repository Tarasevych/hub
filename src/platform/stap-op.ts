// Audit-fix 5/7 (minimale UI): de server antwoordt 403 STEP_UP_REQUIRED bij gevoelige acties (account
// verwijderen, TOTP vervangen, methode herstellen, beheeracties, export). Zonder eigen dialoog vragen we hier
// met een eenvoudige, tweetalige melding (Oekraïens, dan Nederlands) om een TOTP-code; leeg laten = opnieuw
// aanmelden bij Google (prompt=login). Na een geslaagde TOTP-bevestiging herhaalt client.ts het verzoek één keer.

const TEKST = {
  vraag:
    'Для цієї дії потрібне додаткове підтвердження (останні 5 хвилин).\n' +
    'Введіть 6-значний код із застосунку-автентифікатора й натисніть OK.\n' +
    'Залиште поле порожнім і натисніть OK, щоб підтвердити повторним входом у Google.\n\n' +
    'Voor deze actie is extra bevestiging nodig (laatste 5 minuten).\n' +
    'Voer de 6-cijferige code uit je authenticator-app in en kies OK.\n' +
    'Laat het veld leeg en kies OK om te bevestigen door opnieuw bij Google in te loggen.',
  fout:
    'Підтвердження не вдалося. Спробуйте ще раз.\nBevestigen is mislukt. Probeer het opnieuw.',
  geenContext:
    'Для цієї дії потрібне додаткове підтвердження. Оновіть сторінку й спробуйте ще раз.\n' +
    'Voor deze actie is extra bevestiging nodig. Vernieuw de pagina en probeer het opnieuw.',
  google:
    'Зараз відкриється вхід у Google. Після повернення повторіть дію.\n' +
    'Je gaat nu opnieuw inloggen bij Google. Herhaal daarna de actie.',
};

const SERVICES = new Set(['hub', 'ai', 'mail', 'cloud', 'github', 'huis', 'identity', 'api', 'admin', 'mcp']);

/** Leesbare uitleg voor een STEP_UP_REQUIRED-fout (voor meldingen in de app). */
export const stapOpUitleg = () => TEKST.geenContext;

/**
 * Vraag de gebruiker om step-up. true = bevestigd (verzoek mag één keer opnieuw); false = afgebroken of
 * doorgestuurd naar Google (de pagina navigeert dan weg).
 */
export async function stapOpVragen(body: unknown, post: (url: string, data: unknown) => Promise<unknown>): Promise<boolean> {
  if (typeof window === 'undefined' || typeof window.prompt !== 'function') return false;
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const service = String(b.service || ''), tabContext = String(b.tabContext || '');
  if (!SERVICES.has(service) || !tabContext) { window.alert(TEKST.geenContext); return false; }
  const invoer = window.prompt(TEKST.vraag, '');
  if (invoer === null) return false;
  const code = invoer.replace(/\s+/g, '');
  if (code) {
    try { await post('/api/owner/access/stap-op', { service, tabContext, code }); return true; }
    catch { window.alert(TEKST.fout); return false; }
  }
  window.alert(TEKST.google);
  try {
    const { startPrimaryRedirectLogin } = await import('../redirect-login');
    await startPrimaryRedirectLogin({ service: service as never, tabContext, sourceOrigin: location.origin, locale: 'uk', intent: 'step-up', remember: false });
  } catch { window.alert(TEKST.fout); }
  return false;
}
