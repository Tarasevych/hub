// IDENTITEIT-013 (давня вада, знайдена e2e-тестом menu-v2-snelheid): синхронізація «прочитано» та стану сповіщень надсилала
// порожнє тіло `{}`. Сервер (ownerRequireAnchor) без `service` відповідає 401 OWNER_SESSION_CONTEXT_REQUIRED, тож стан сповіщень
// ніколи не потрапляв на сервер і не синхронізувався між вкладками, піддоменами й пристроями. Тепер кожен запит несе контекст
// сервісу й вкладки — так само, як це вже робить імперсонація (src/impersonatie/Impersonatie.tsx).
// Meldingen-synchronisatie stuurde een leeg lichaam → altijd 401; nu met dienst- en tabbladcontext.
// IDENTITEIT-015 (приймання menu, давня вада з кроку delen): поки бутстрап ще не віддав контекст (одразу після завантаження hub),
// запасним був serviceFromLocation(), який на hub.* повертає «ai» (для вигляду), і сервер відповідав 401 OWNER_SESSION_CONTEXT_REQUIRED
// на /api/owner/meldingen/(status|gelezen). Для тіла сесії потрібна служба самого хоста — sessieDienst() («hub» на hub.*).
// Terugval: de dienst van deze host zelf (sessieDienst), niet de weergavedienst ('ai' op hub.*).
import { sessieDienst } from '../canoniek-navigatie';
import { ecosystemTabContext } from '../tab-context';
import { zijbalkServerDienst } from '../zijbalk-voorkeuren';

/** Тіло запиту до /api/owner/meldingen/* з контекстом сесії; додаткові поля — поверх. */
export function meldingLichaam<T extends Record<string, unknown>>(extra?: T): T & { service: string; tabContext: string } {
  return { ...(extra || ({} as T)), service: zijbalkServerDienst() || sessieDienst(), tabContext: ecosystemTabContext() };
}
