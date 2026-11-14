// Keuze «Зберегти цей акаунт для наступних сесій» / «Dit account bewaren voor volgende sessies» — PER APPARAAT.
//
// WAT HIER FOUT WAS (audit 20.10.2026): het vinkje op het aanmeldscherm leefde alleen in de React-toestand van ÉÉN tabblad
// (useState(true)). Elke keer dat het scherm opnieuw werd opgebouwd — nieuw tabblad, F5, ander subdomein, na afmelden —
// stond het weer aan, ook als de gebruiker het bewust had uitgezet. De keuze was dus niet te maken, alleen te zien.
//
// HOE HET NU WERKT: de keuze staat in localStorage (per apparaat, niet per tabblad en niet in een cookie: de server hoeft
// hem niet bij elk verzoek te krijgen). Hij gaat mee naar de aanmelding (redirect-login → `remember`), en de SERVER is daarna
// de bron van waarheid: de bootstrap meldt `rememberedBrowser` (bestaat er een grant voor deze browser?) en daarmee wordt
// deze waarde weer gelijkgezet. Dat bepaalt ook of de privé-mailcache na afmelden wordt gewist (src/mail-bijlage-cache.ts).
// IDENTITEIT-013: een bewust lokaal «uit» gaat vóór — de server kan het onthouden alleen UITzetten, nooit weer aan; en uitzetten
// in «Сесії» trekt meteen de grant van deze browser in (SessiesOverzicht → security/items/:id/revoke, kind grant).
const SLEUTEL = 'tsv-aanmelden-onthouden-v1';
/** Standaard AAN: dat was het gedrag van het vinkje; alleen een bewust «uit» wordt bewaard. */
export const leesAanmeldenOnthouden = (): boolean => {
  try {
    return localStorage.getItem(SLEUTEL) !== '0';
  } catch {
    return true;
  }
};
export const zetAanmeldenOnthouden = (waarde: boolean): boolean => {
  try {
    localStorage.setItem(SLEUTEL, waarde ? '1' : '0');
  } catch {
    /* privémodus: dan geldt de keuze alleen voor dit beeld */
  }
  return waarde;
};
/**
 * IDENTITEIT-015 (етап 1.7): «увімкнено — діятиме з наступного входу». Якщо людина вмикає збереження, коли поточний вхід уже
 * почався БЕЗ запам'ятовування (грант цього браузера відкликано чи вхід був без «Зберегти»), сервер НЕ видає новий грант
 * посеред сеансу: так викрадена cookie сеансу не перетворюється на довготривалий «запам'ятований браузер». Вибір чекає на
 * наступний вхід (redirect-login бере remember=true) і більше не скидається в «вимкнено» під час bootstrap.
 * Значення 'volgende' читається як «увімкнено» (leesAanmeldenOnthouden), а після входу із запам'ятовуванням стає '1'.
 * Aan vanaf de volgende aanmelding: de server geeft midden in een sessie geen nieuwe grant (veiliger).
 */
export const leesOnthoudenVanafVolgende = (): boolean => {
  try {
    return localStorage.getItem(SLEUTEL) === 'volgende';
  } catch {
    return false;
  }
};
export const zetOnthoudenVanafVolgende = (): boolean => {
  try {
    localStorage.setItem(SLEUTEL, 'volgende');
  } catch {
    /* privémodus: dan geldt de keuze alleen voor dit beeld */
  }
  return true;
};
export { SLEUTEL as AANMELDEN_ONTHOUDEN_SLEUTEL };
