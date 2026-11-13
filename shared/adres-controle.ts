/**
 * SEC-002 (aanv-gat-c-02): één lineaire controle van e-mailadressen voor server en browser.
 * Спільна лінійна перевірка адрес електронної пошти для сервера й оглядача.
 *
 * Vroeger stond overal /^[^\s@]+@[^\s@]+\.[^\s@]+$/ (of een variant), en de lengte werd pas NA de expressie getoetst
 * (rechts van «||») of helemaal niet. Twee naburige klassen die allebei een punt aannemen maken die expressie kwadratisch:
 * «a@» + 200 000 punten + «@» hield de enige Node-thread minutenlang bezig. Hier:
 *  1. de lengte gaat EERST (geen expressie op een lange tekenreeks);
 *  2. het domein bestaat uit labels zonder punt, gescheiden door één punt — elke positie hoort bij precies één deel, dus
 *     de expressie zoekt niet terug (lineair).
 * Раніше довжину перевіряли ПІСЛЯ виразу або взагалі ні, а сам вираз квадратичний. Тепер довжина — першою, вираз лінійний.
 */

/* toets-g11 №3: geen aparte grens op het lokale deel (VERP-/meldingsadressen van 65–80 tekens bestaan); de grens op de
   hele tekenreeks komt eerst en het lokale deel bevat nooit @, dus de expressie blijft lineair. / Без межі 64 на локальну частину. */
const ADRES = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;
/** Variant voor ontvangers in een te verzenden mail: ook geen < > , ; (scheidingstekens van adreslijsten). */
const ONTVANGER = /^[^\s<>@,;]+@[^\s<>@,;.]+(?:\.[^\s<>@,;.]+)+$/;

/** Geldig e-mailadres van hoogstens `max` tekens (standaard 254, RFC 5321). / Коректна адреса до `max` знаків. */
export function isEmailAdres(waarde: unknown, max = 254): boolean {
  return typeof waarde === 'string' && waarde.length > 0 && waarde.length <= max && ADRES.test(waarde);
}

/** Zoals isEmailAdres, maar strenger voor ontvangers (geen < > , ;). / Як isEmailAdres, суворіше для одержувачів. */
export function isOntvangerAdres(waarde: unknown, max = 254): boolean {
  return typeof waarde === 'string' && waarde.length > 0 && waarde.length <= max && ONTVANGER.test(waarde);
}
