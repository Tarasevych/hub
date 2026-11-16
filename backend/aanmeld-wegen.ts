// IDENTITEIT-015 (крок «aanmelden»): спільний реєстр «якими шляхами ця людина СПРАВДІ може увійти» — без циклу імпортів.
// Gedeeld register «langs welke wegen kan deze persoon ECHT aanmelden» — zonder importcyclus tussen de modules.
//
// Навіщо: захист від блокування (останній спосіб входу не можна прибрати) мусить знати про нові шляхи входу — ключ доступу,
// пароль, прив'язаний Microsoft/Discord/Apple. Вони вмикаються прапорцями (лише backend/index.ts читає прапорці — правило
// tests/eenheid/vlaggen.test.ts) і живуть у різних модулях. Тому:
//   • backend/index.ts реєструє читання прапорця (registreerAanmeldVlag);
//   • backend/aanmelden-methoden.ts реєструє додаткові робочі шляхи людини (registreerExtraWegen);
//   • backend/toegangslaag.ts реєструє перевірку «чи лишиться хоч один шлях» (registreerLaatsteWegControle);
//   • backend/toegangssleutels.ts і backend/aanmeld-koppel.ts питають laatsteWegFout перед вилученням ключа чи відв'язкою.
// Без реєстрації: прапорець = вимкнено, додаткових шляхів немає, перевірка нічого не забороняє (стара поведінка).

type Gebruiker = { id: string; email?: string; role?: string };
let vlag: ((userId: string, sleutel: string) => Promise<boolean>) | null = null;
let extra: ((userId: string, zonder?: string) => Promise<string[]>) | null = null;
let controle: ((user: Gebruiker, zonder: string) => Promise<string>) | null = null;

export function registreerAanmeldVlag(fn: (userId: string, sleutel: string) => Promise<boolean>): void { vlag = fn; }
export function registreerExtraWegen(fn: (userId: string, zonder?: string) => Promise<string[]>): void { extra = fn; }
export function registreerLaatsteWegControle(fn: (user: Gebruiker, zonder: string) => Promise<string>): void { controle = fn; }

/** Прапорець для цієї людини (без реєстрації або з помилкою — «вимкнено»: безпечний бік). */
export async function aanmeldVlagVoor(userId: string, sleutel: string): Promise<boolean> {
  if (!vlag || !userId) return false;
  try { return (await vlag(userId, sleutel)) === true; } catch { return false; }
}
/** Додаткові робочі шляхи (passkey, microsoft, discord, apple), без `zonder`. */
export async function extraAanmeldWegen(userId: string, zonder?: string): Promise<string[]> {
  if (!extra || !userId) return [];
  try { return await extra(userId, zonder); } catch { return []; }
}
/** '' — можна; інакше код відмови (LAST_LOGIN_METHOD_PROTECTED). */
export async function laatsteWegFout(user: Gebruiker, zonder: string): Promise<string> {
  if (!controle || !user?.id) return '';
  // IDENTITEIT-015 (herstel): помилка перевірки (БД, контур Google…) — «не можна» (безпечний бік, як aanmeldVlagVoor), а не «можна».
  try { return await controle(user, zonder); } catch { return 'LAST_LOGIN_METHOD_PROTECTED'; }
}
