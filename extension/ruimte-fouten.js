// Ruimtes (28.10.2026): duidelijke Oekraïense meldingen voor 401/403 van de server (docs/ontwerp/RUIMTES-COMPATIBILITEIT.md §4).
export const RUIMTE_MELDINGEN = Object.freeze({
  ACCOUNT_NIET_ACTIEF: 'Акаунт не активний. Розширення від\'єднано.',
  SITE_SESSIE_WEG: 'Основний акаунт не активний: увійдіть на сайті знову.',
  PAUZE: 'Технічний простір на паузі. Перемкніться на нього на сайті.',
  VERLOPEN: 'Термін технічного простору минув.',
  GRENS_VOORBIJ: 'Термін технічного простору минув.',
});
const ALGEMEEN = 'Технічний простір зараз недоступний. Приватний простір працює як звичайно.';
/** status + code → { melding, ontkoppelen }. Alleen 401 ontkoppelt; 403 vergrendelt alleen de technische kant. */
export function ruimteFout(status, code) {
  if (status === 401) return { melding: RUIMTE_MELDINGEN.ACCOUNT_NIET_ACTIEF, ontkoppelen: true };
  if (status === 403) return { melding: RUIMTE_MELDINGEN[code] || ALGEMEEN, ontkoppelen: false };
  return null;
}
/** WebSocket-sluitcode: 4403 ingetrokken (ontkoppelen), 4401 sitesessie weg (alleen vergrendelen). */
export function sluitFout(code) {
  if (code === 4403) return { melding: RUIMTE_MELDINGEN.ACCOUNT_NIET_ACTIEF, ontkoppelen: true };
  if (code === 4401) return { melding: RUIMTE_MELDINGEN.SITE_SESSIE_WEG, ontkoppelen: false };
  return null;
}
