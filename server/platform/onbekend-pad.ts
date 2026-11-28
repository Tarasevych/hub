// SITE-001 (пункт 15) · справжня відповідь 404 для адрес, яких застосунок не знає.
//
// Раніше сервер на будь-який шлях без розширення віддавав index.html з кодом 200 («м'яка 404»): людина бачила сторінку
// «Сторінку не знайдено», а пошукові системи й перевірки посилань — успішну сторінку. Тепер сервер ставить той самий висновок,
// що й оглядач, і для невідомої адреси відповідає кодом 404 (тіло те саме — index.html, сторінку малює src/NietGevonden.tsx).
//
// Єдине джерело правди — `canonical-service.js` зі складання (public/canonical-service.js → dist/): ми не повторюємо список
// вкладок у другому місці, а виконуємо ту саму функцію `resolve` в ізольованому `vm`-контексті (без доступу до процесу, мережі,
// файлів). Будь-яка вада тут — це НЕ 404: повертаємо `false`, і сервер поводиться як раніше (200). Оглядач однаково покаже сторінку.
//
// nl: SITE-001 punt 15 — echte 404 voor adressen die de app niet kent. Eén bron: dezelfde `resolve` uit canonical-service.js,
// uitgevoerd in een afgeschermde vm-context. Bij elke fout geen 404 (oud gedrag, 200).
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { SITE_TERUG_PAD } from '../../shared/ai-verbinding';

type Ontleed = { onbekend?: boolean; service?: string };
type Uitvoering = { resolve: (loc: { hostname: string; pathname: string; search: string }) => Ontleed };

let bewaard: { bestand: string; stempel: number; gecontroleerd: number; uitvoering: Uitvoering | null } | null = null;

/** Laadt `resolve` з `<root>/canonical-service.js`; перечитує лише після нового складання (змінився час файла). */
function laad(root: string): Uitvoering | null {
  const bestand = path.join(root, 'canonical-service.js');
  // Час файла перевіряємо не частіше ніж раз на 5 с — без зайвого звертання до диска на кожен запит.
  if (bewaard && bewaard.bestand === bestand && Date.now() - bewaard.gecontroleerd < 5000) return bewaard.uitvoering;
  let stempel = 0;
  try { stempel = statSync(bestand).mtimeMs; } catch { return null; }
  if (bewaard && bewaard.bestand === bestand && bewaard.stempel === stempel) { bewaard.gecontroleerd = Date.now(); return bewaard.uitvoering; }
  let uitvoering: Uitvoering | null = null;
  try {
    const opgeslagen: Record<string | symbol, unknown> = {};
    // Сценарій під час завантаження торкається document (значок вкладки). Тут — нейтральна порожня заглушка: будь-яка властивість
    // чи виклик повертає ту саму заглушку, перелік порожній. Справжніх об'єктів оглядача й процесу в контексті немає.
    const leeg: unknown = new Proxy(function leegDoel() { /* заглушка */ }, {
      get: (_d, k) => (k === Symbol.iterator ? function* () { /* порожньо */ } : k === Symbol.toPrimitive ? () => '' : k === 'then' ? undefined : leeg),
      apply: () => leeg,
      construct: () => leeg as object,
      set: () => true,
    });
    // window: те, що сценарій записав (window.__TSV_CANONICAL_SERVICE__), повертається; решта (addEventListener тощо) — заглушка.
    const venster = new Proxy(opgeslagen, { get: (o, k) => (k in o ? o[k] : leeg), set: (o, k, v) => { o[k] = v; return true; } });
    const context = vm.createContext({ window: venster, URL, URLSearchParams, document: leeg, navigator: leeg, sessionStorage: leeg, localStorage: leeg, matchMedia: leeg, location: { hostname: '', pathname: '/', search: '' } });
    new vm.Script(readFileSync(bestand, 'utf8'), { filename: 'canonical-service.js' }).runInContext(context, { timeout: 200 });
    const r = opgeslagen.__TSV_CANONICAL_SERVICE__ as Partial<Uitvoering> | undefined;
    uitvoering = typeof r?.resolve === 'function' ? (r as Uitvoering) : null;
  } catch { uitvoering = null; }
  bewaard = { bestand, stempel, gecontroleerd: Date.now(), uitvoering };
  return uitvoering;
}

/** Шляхи, які застосунок обробляє ДО перевірки вкладок (src/main.tsx): гостьовий доступ на id.* і повернення з OAuth. */
const OSOBLYVI = (service: string, pad: string) => pad === SITE_TERUG_PAD || (service === 'identity' && pad === '/toegang');

/** `true` — застосунок покаже сторінку «не знайдено», тож сервер відповідає кодом 404. */
export function onbekendAppPad(root: string, host: string, url: URL): boolean {
  const uitvoering = laad(root);
  if (!uitvoering) return false;
  try {
    const hostname = host.split(':')[0].toLowerCase();
    const r = uitvoering.resolve({ hostname, pathname: url.pathname, search: url.search });
    if (r?.onbekend !== true) return false;
    return !OSOBLYVI(String(r.service || ''), url.pathname);
  } catch { return false; }
}
