// IDENTITEIT-015 (gastcodes e2e): позначка «ця сторінка — повернення з Google» (src/App.tsx → EigenaarIdentiteitTerug). Поки callback
// не завершено, вкладка ще не має чинної сесії (сервер відповідає OWNER_TAB_SIGNED_OUT), тож фонові запити (прапорець tech-ruimtes-v2)
// давали 401 у консолі після кожного посиленого підтвердження через Google. Сторінка коротка: після callback — location.replace.
// Markering «dit is de terugkeer van Google»: achtergrondverzoeken wachten tot de volgende pagina (geen 401 tijdens de callback).
const SLEUTEL = '__TSV_OAUTH_TERUG__';
type MetMarkering = { [SLEUTEL]?: boolean };

export function markeerOauthTerug(): void {
  try { (window as unknown as MetMarkering)[SLEUTEL] = true; } catch { /* поза оглядачем */ }
}
export const oauthTerugBezig = (): boolean => typeof window !== 'undefined' && (window as unknown as MetMarkering)[SLEUTEL] === true;
