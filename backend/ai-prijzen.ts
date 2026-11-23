// MAILAI-003 (16.11.2026): орієнтовні ціни рушіїв ШІ — автоматично, щоб власник не оновлював їх руками.
// Джерело: загальнодоступний перелік моделей OpenRouter (https://openrouter.ai/api/v1/models) — без ключа, без даних користувача:
// запит не містить нічого про людину чи лист. Офіційні сторінки цін постачальників не мають машинного формату (перевірено 16.11.2026),
// тому число тут ОРІЄНТОВНЕ, а поруч завжди посилання на офіційну сторінку. Раз на добу, у фоні; немає мережі = цін немає, решта працює.
// Richtprijzen uit de openbare modellenlijst van OpenRouter; één keer per dag, op de achtergrond; uit te zetten met de vlag.
import { getPool } from '../server/platform/pg';
import { AI_AANBIEDERS, type AiAanbiederId } from '../shared/ai-aanbieders';

export const PRIJZEN_BRON = 'https://openrouter.ai/api/v1/models';
export const PRIJZEN_VLAG = 'ai-prijzen-ophalen';
export type AanbiederPrijs = { model: string; invoerPerMln: number; uitvoerPerMln: number };
export type Prijzen = { opgehaaldOp: number; bron: string; perAanbieder: Partial<Record<AiAanbiederId, AanbiederPrijs>> };

const VOORVOEGSEL: Record<AiAanbiederId, string> = { anthropic: 'anthropic/', gemini: 'google/', openai: 'openai/', grok: 'x-ai/', autoclaw: 'z-ai/' };
const DAG = 24 * 3600_000;
const UUR = 3600_000;

const VLAG_GEHEUGEN_MS = 15_000;
let cache: Prijzen | null = null;
let vlagCache: { aan: boolean; tot: number } | null = null;
let laatstePoging = 0;
let bezig: Promise<void> | null = null;
let fetchFn: typeof fetch = (...a) => fetch(...a);

export const prijzenVlagCacheWissen = (): void => { vlagCache = null; };

const standaardVlagLezer = async (): Promise<boolean> => {
  if (vlagCache && vlagCache.tot > Date.now()) return vlagCache.aan;
  try {
    const { rows } = await getPool('systeem').query('SELECT aan FROM app.feature_flags WHERE sleutel = $1', [PRIJZEN_VLAG]);
    const aan = (rows[0] as { aan?: boolean } | undefined)?.aan === true; // немає рядка (міграцію не застосовано) = не звертатися назовні
    vlagCache = { aan, tot: Date.now() + VLAG_GEHEUGEN_MS };
    return aan;
  } catch {
    vlagCache = { aan: false, tot: Date.now() + VLAG_GEHEUGEN_MS };
    return false;
  }
};
let vlagLezer: () => Promise<boolean> = standaardVlagLezer;

/** Лише для тестів. */
export function setPrijzenDeps(d: { fetch?: typeof fetch; vlag?: () => Promise<boolean> } | null): void {
  fetchFn = d?.fetch ?? ((...a) => fetch(...a));
  vlagLezer = d?.vlag ?? standaardVlagLezer;
  cache = null; vlagCache = null; laatstePoging = 0; bezig = null;
}

/** «claude-haiku-4-5-20251001» → «claude-haiku-4.5»: без дати, версія через крапку — так моделі називає OpenRouter. */
export function modelSleutel(model: string): string {
  return model.toLowerCase().replace(/-20\d{6}$/, '').replace(/(\d)-(\d)(?!\d)/g, '$1.$2');
}

/** З переліку OpenRouter — ціна типової моделі перекладу кожного постачальника (точна назва, інакше найближча за початком). */
export function prijzenUitLijst(data: unknown): Prijzen['perAanbieder'] {
  const lijst = Array.isArray((data as { data?: unknown })?.data) ? (data as { data: unknown[] }).data : [];
  const perId = new Map<string, { prompt: number; completion: number }>();
  for (const m of lijst as Array<{ id?: unknown; pricing?: { prompt?: unknown; completion?: unknown } }>) {
    const id = typeof m?.id === 'string' ? m.id.toLowerCase() : '';
    const p = Number(m?.pricing?.prompt); const c = Number(m?.pricing?.completion);
    if (!id || id.includes(':') || !Number.isFinite(p) || !Number.isFinite(c) || p <= 0 || c <= 0 || p > 0.01 || c > 0.01) continue;
    perId.set(id, { prompt: p, completion: c });
  }
  const uit: Prijzen['perAanbieder'] = {};
  for (const a of AI_AANBIEDERS) {
    const doel = `${VOORVOEGSEL[a.id]}${modelSleutel(a.standaardVertaalModel)}`;
    let id = perId.has(doel) ? doel : '';
    if (!id) {
      // «glm-4.6-flash» може не бути в переліку: беремо найдовший збіг за початком назви (наприклад, «z-ai/glm-4.6»).
      let stam = doel;
      while (!id && stam.length > VOORVOEGSEL[a.id].length + 3) {
        stam = stam.slice(0, Math.max(stam.lastIndexOf('-'), stam.lastIndexOf('.')));
        if (perId.has(stam)) id = stam;
      }
    }
    if (!id) continue;
    const w = perId.get(id)!;
    const mln = (x: number) => Math.round(x * 1_000_000 * 1000) / 1000;
    uit[a.id] = { model: id, invoerPerMln: mln(w.prompt), uitvoerPerMln: mln(w.completion) };
  }
  return uit;
}

async function haalOp(): Promise<void> {
  laatstePoging = Date.now();
  if (!(await vlagLezer())) { cache = null; return; }
  try {
    const res = await fetchFn(PRIJZEN_BRON, { headers: { accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return;
    const perAanbieder = prijzenUitLijst(await res.json());
    if (Object.keys(perAanbieder).length) cache = { opgehaaldOp: Date.now(), bron: PRIJZEN_BRON, perAanbieder };
  } catch { /* немає мережі або інший формат: лишаємо попереднє */ }
}

/**
 * Ніколи не затримує відповідь: повертає те, що вже є, а оновлення йде у фоні (раз на добу; невдала спроба — не частіше ніж раз на годину).
 * Перший запит після запуску сервера цін ще не має.
 */
export function leesPrijzen(): Prijzen | null {
  const nu = Date.now();
  const verouderd = !cache || nu - cache.opgehaaldOp > DAG;
  if (verouderd && !bezig && nu - laatstePoging > UUR) bezig = haalOp().finally(() => { bezig = null; });
  return cache && nu - cache.opgehaaldOp < 7 * DAG ? cache : null;
}
/** Для тестів і сторінки власника: дочекатися поточного оновлення. */
export async function prijzenNu(): Promise<Prijzen | null> { leesPrijzen(); if (bezig) await bezig; return leesPrijzen(); }
