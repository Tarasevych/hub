// Uitleg «?» voor de terminal (backend/terminal.ts, deploy/agent/agent.mjs termArgs).
import type { HelpLagen } from './tech-rollen';
export const HELP_TERMINAL: HelpLagen = {
  wat: ['Командний рядок у тимчасовому контейнері на ВАШОМУ пристрої. Обрана тека видна як /werk.', 'Opdrachtregel in een tijdelijke container op UW apparaat. De gekozen map is /werk.'],
  gevolg: ['Без мережі; тека — лише читання, якщо не дозволити запис; закривається сама в кінці терміну. Вивід (не введення) записується; запис бачать Аудитор і Власник.', 'Geen netwerk; map alleen-lezen tenzij u schrijven toestaat; sluit vanzelf. Uitvoer (geen invoer) wordt opgenomen; Auditor en Eigenaar zien de opname.'],
  risico: ['Із дозволом на запис команди можуть змінювати чи видаляти файли в теці. Секретні місця (ключі, .env, .ssh) у контейнері приховано.', 'Met schrijven kunnen opdrachten bestanden in de map wijzigen of wissen. Geheime plekken (sleutels, .env, .ssh) zijn afgedekt.'],
  dev: ['Агент 0.6: podman run --rm --network none --cap-drop ALL --security-opt no-new-privileges --read-only --pids-limit 128 --memory 512m, -v <root>:/werk:ro|rw, секрети накрито tmpfs / /dev/null; псевдотермінал — script(1) усередині образу (агент без залежностей). Відкриття — лише підписана HMAC команда term.open від сайту, не через черги ШІ: ШІ термінал відкрити не може. Браузер ↔ сервер: WSS /terminal/ws з одноразовим квитком 30 с; сервер ↔ агент: наявний канал. Запис — asciicast v2 (gzip ≤ 4 МБ) в app.terminal_sessies. Альтернативи: оболонка напряму на пристрої (відкинуто: обходить усі обмеження агента), Teleport (ризик ліцензії), ttyd/gotty (окремий відкритий порт).', 'Agent 0.6: wegwerpcontainer zonder netwerk/capabilities, root op /werk, geheimen afgedekt; pty via script(1). Openen alleen met ondertekende term.open van de site, niet via AI-wachtrijen. WSS /terminal/ws met eenmalig ticket. Opname asciicast v2. Alternatieven: shell rechtstreeks (afgewezen), Teleport (licentie), ttyd/gotty (open poort).'],
};

/** Welke machine mag dit profiel openen. terminal.servers (Адміністратор, Власник) = elk eigen apparaat; terminal.test (Розробник) =
 *  alleen een apparaat dat zich met `terminal-config on --test` als testmachine meldt. Idee overgenomen uit het parallelle werk van 13.10. */
export function magApparaat(mogelijkheden: readonly string[], c: { terminal?: { test?: boolean } }): boolean {
  if (mogelijkheden.includes('terminal.servers')) return true;
  return mogelijkheden.includes('terminal.test') && c.terminal?.test === true;
}
