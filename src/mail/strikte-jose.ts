// POSTA-VENSTERS-HERSTEL v1 (Grok: hub.tarasevych.com) — strengere herkenning van compacte JOSE (JWS/JWT/JWE).
// De oude test telde alleen stukken tussen punten: een zip, een onbekend binair bestand of gewone tekst met twee of vier punten
// werd dan «JWK · application/jose». Met de vlag aan moet elk deel base64url zijn en moet de kop een echte JSON-kop zijn
// (JWS: «alg»; JWE: «alg» en «enc»). De schakelaar staat op moduleniveau; GoogleMailWerkruimte zet hem volgens de vlag.
let strikt = false;
export const zetStrikteJose = (aan: boolean) => { strikt = aan; };
export const strikteJoseAan = () => strikt;

const B64U = /^[A-Za-z0-9_-]+$/;
const MAX_TEKENS = 256 * 1024;

const kopLezen = (deel: string): Record<string, unknown> | null => {
  try {
    const b64 = deel.replace(/-/g, '+').replace(/_/g, '/');
    const binair = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
    const bytes = Uint8Array.from(binair, (c) => c.charCodeAt(0));
    const waarde = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    return waarde && typeof waarde === 'object' && !Array.isArray(waarde) ? (waarde as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};

/** true alleen voor echte compacte JWS/JWT (3 delen) of JWE (5 delen). */
export function strikteCompacteJose(bron: string): boolean {
  const tekst = String(bron || '').trim();
  if (!tekst || tekst.length > MAX_TEKENS) return false;
  const delen = tekst.split('.');
  if (delen.length !== 3 && delen.length !== 5) return false;
  const leegOfB64 = (d: string) => d === '' || B64U.test(d);
  if (!B64U.test(delen[0])) return false;
  const kop = kopLezen(delen[0]);
  if (!kop || typeof kop.alg !== 'string' || !kop.alg) return false;
  if (delen.length === 3) {
    if (!leegOfB64(delen[1])) return false;
    if (delen[2] === '') return kop.alg === 'none';
    return B64U.test(delen[2]);
  }
  if (typeof kop.enc !== 'string' || !kop.enc) return false;
  return leegOfB64(delen[1]) && B64U.test(delen[2]) && B64U.test(delen[3]) && B64U.test(delen[4]);
}
