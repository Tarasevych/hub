// TELEGRAM-004 (0299): місце пристрою під час входу будь-яким способом. Plaats van het toestel bij aanmelden.
// Обліковий запис може вимагати місце пристрою для вибраних способів входу («Способи входу» → «Вимагати місце пристрою»).
// Сторінка входу ще не знає, чий це обліковий запис, тому правило одне для всіх:
//   — якщо людина ВЖЕ дозволила цьому сайту доступ до місця, воно додається до запиту на вхід без жодного нового запитання;
//   — якщо не дозволяла, нічого не питаємо; сервер відмовить лише тоді, коли обліковий запис цього вимагає (PLAATS_NODIG),
//     і тоді людина бачить пояснення та кнопку «Надати місце пристрою» — запит дозволу показує сам оглядач.
// Сервер округлює точку до ≈ 1 км і зберігає її лише в самій спробі входу.
export type AanmeldPlaats = { lat: number; lon: number; nauwkeurig: number };
export type PlaatsUitkomst = AanmeldPlaats | 'geweigerd' | 'mislukt';
const SLEUTEL = 'mr-aanmeld-plaats-gedeeld'; // «1» = людина вже раз свідомо надала місце на цій сторінці входу
const VERS_MS = 5 * 60 * 1000;
let laatste: { p: AanmeldPlaats; op: number } | null = null;

const gemerkt = (): boolean => { try { return localStorage.getItem(SLEUTEL) === '1'; } catch { return false; } };
const merk = (aan: boolean) => { try { if (aan) localStorage.setItem(SLEUTEL, '1'); else localStorage.removeItem(SLEUTEL); } catch { /* zonder opslag */ } };

/** Стан дозволу без запитання людині: 'granted' | 'denied' | 'prompt' | '' (оглядач не повідомляє). */
export async function plaatsToestemming(): Promise<string> {
  try {
    const p = (navigator as Navigator & { permissions?: { query: (d: { name: string }) => Promise<{ state: string }> } }).permissions;
    if (!p?.query) return '';
    return (await p.query({ name: 'geolocation' })).state;
  } catch { return ''; }
}

const vraag = (timeout: number): Promise<PlaatsUitkomst> => new Promise((klaar) => {
  if (typeof navigator === 'undefined' || !('geolocation' in navigator)) { klaar('mislukt'); return; }
  try {
    navigator.geolocation.getCurrentPosition(
      (p) => { const punt = { lat: p.coords.latitude, lon: p.coords.longitude, nauwkeurig: p.coords.accuracy }; laatste = { p: punt, op: Date.now() }; klaar(punt); },
      (e) => klaar(e.code === e.PERMISSION_DENIED ? 'geweigerd' : 'mislukt'),
      { enableHighAccuracy: false, timeout, maximumAge: 300000 });
  } catch { klaar('mislukt'); }
});

/** Свідома дія людини (кнопка): оглядач за потреби покаже власний запит дозволу. */
export async function plaatsVragen(): Promise<PlaatsUitkomst> {
  const u = await vraag(15000);
  merk(typeof u === 'object');
  return u;
}

/** Для запиту «почати вхід»: місце лише тоді, коли це не викличе нового запитання. Ніколи не блокує вхід довше ніж ~4 с. */
export async function plaatsVoorStart(): Promise<{ plaats?: AanmeldPlaats }> {
  if (laatste && Date.now() - laatste.op < VERS_MS) return { plaats: laatste.p };
  const stand = await plaatsToestemming();
  if (stand === 'denied' || stand === 'prompt') return {};
  if (stand !== 'granted' && !gemerkt()) return {};
  const u = await vraag(4000);
  return typeof u === 'object' ? { plaats: u } : {};
}
