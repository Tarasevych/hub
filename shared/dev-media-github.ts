// De zeven hulpmiddelen die op 21.10.2026 uit «in ontwikkeling» kwamen in de groepen GitHub, Ontwerp en media, Betalingen en Apps
// (besluit van de eigenaar: «дозволи, які ще у розробці … включити в розробку і передбачити для них функціонал»).
//
// Ze bestaan ALLEEN via connector v2 (/<agent>), met uitdrukkelijke toestemming per hulpmiddel:
//   • het oude /mcp ziet ze niet in tools/list en weigert een aanroep met hun interne naam (backend/mcp-connector.ts);
//   • de erfenis van het oude /mcp geeft ze nooit vanzelf (backend/connector-v2-erfenis.ts → ALLEEN_UITDRUKKELIJK).
// Puur: één lijst voor server en tests.
export const DEV_MG_TOOLS = Object.freeze([
  'github_pr', 'github_ci_logs', 'app_domain', 'image_generate', 'diagram_generate', 'screenshot_design', 'payments_list',
] as const);
export type DevMgTool = typeof DEV_MG_TOOLS[number];
export const DEV_MG_SET: ReadonlySet<string> = new Set<string>(DEV_MG_TOOLS);
export const isDevMgTool = (n: unknown): boolean => typeof n === 'string' && DEV_MG_SET.has(n);
/** Weigering op het oude /mcp (Engels, zoals alle instructies aan het model). */
export const DEV_MG_ALLEEN_V2 = (tool: string) =>
  `V2_ONLY: "${tool}" exists only on the per-AI connector address (https://mcp.<site>/<agent>) with an explicit permission for this tool. The legacy /mcp connection does not offer it. Ask the user to connect this AI on its own address and switch the permission on; do not try another way.`;

/**
 * Foutcodes van deze hulpmiddelen met een eerlijke uitleg in beide talen. De AI krijgt «CODE: uk / nl» en geeft dat door; het
 * scherm toont de taal van de mens. `{wizard}` = het adres van de koppelwizard op deze installatie.
 */
export const DEV_MG_FOUTEN: Readonly<Record<string, readonly [string, string]>> = Object.freeze({
  STRIPE_NIET_GEKOPPELD: ['Stripe не підключено. Створіть у Stripe обмежений ключ лише для читання (Developers → API keys → Create restricted key: Charges, Invoices, Payouts — Read) і збережіть його у сховищі через майстер підключень: {wizard} → «Майстер підключень» → Stripe.', 'Stripe is niet gekoppeld. Maak in Stripe een beperkte sleutel met alleen leesrechten (Developers → API keys → Create restricted key: Charges, Invoices, Payouts — Read) en zet hem via de koppelwizard in de kluis: {wizard} → «Koppelwizard» → Stripe.'],
  STRIPE_SLEUTEL_TE_RUIM: ['У сховищі лежить повний секретний ключ Stripe (sk_…). Для читання платежів потрібен лише обмежений ключ (rk_…): замініть його через майстер підключень і відкличте повний ключ у Stripe.', 'In de kluis staat een volledige geheime Stripe-sleutel (sk_…). Voor het lezen van betalingen is alleen een beperkte sleutel (rk_…) nodig: vervang hem via de koppelwizard en trek de volledige sleutel in bij Stripe.'],
  STRIPE_SLEUTEL_VORM: ['Значення у сховищі (призначення «stripe») — не обмежений ключ Stripe (rk_live_… або rk_test_…).', 'De waarde in de kluis (doel «stripe») is geen beperkte Stripe-sleutel (rk_live_… of rk_test_…).'],
  STRIPE_SLEUTEL_ONGELDIG: ['Stripe відхилив ключ (недійсний або відкликаний). Створіть новий обмежений ключ і замініть його через майстер підключень.', 'Stripe wees de sleutel af (ongeldig of ingetrokken). Maak een nieuwe beperkte sleutel en vervang hem via de koppelwizard.'],
  STRIPE_RECHT_ONTBREEKT: ['Обмежений ключ не має права читати цей список. Увімкніть у Stripe для ключа «Read» на Charges, Invoices і Payouts.', 'De beperkte sleutel mag deze lijst niet lezen. Zet in Stripe voor de sleutel «Read» aan bij Charges, Invoices en Payouts.'],
  STRIPE_RATE: ['Stripe тимчасово обмежив кількість запитів; спробуйте за хвилину.', 'Stripe beperkte tijdelijk het aantal verzoeken; probeer het over een minuut.'],
  STRIPE_ONBEREIKBAAR: ['Stripe не відповів (мережа або тайм-аут).', 'Stripe antwoordde niet (netwerk of time-out).'],
  STRIPE_OK: ['Stripe прийняв обмежений ключ; читання дозволено для {n} з 3 списків (платежі, рахунки, виплати).', 'Stripe nam de beperkte sleutel aan; lezen mag voor {n} van de 3 lijsten (betalingen, facturen, uitbetalingen).'],
  APP_DOMEIN_GEEN_APPARAAT: ['У технічному просторі немає сервера з увімкненими «Додатками», який зараз онлайн.', 'In de technische ruimte is geen server met «Apps» aan die nu online is.'],
  APP_DOMEIN_APPARAAT_KIEZEN: ['Підходить кілька пристроїв: укажіть «machine».', 'Er passen meerdere apparaten: geef «machine» op.'],
  APP_DOMEIN_APPARAAT_OFFLINE: ['Цей сервер зараз не в мережі.', 'Deze server is nu niet online.'],
  APP_DOMEIN_APPS_UIT: ['На цьому пристрої «Додатки» не ввімкнено.', 'Op dit apparaat staan «Apps» niet aan.'],
  APP_DOMEIN_IN_GEBRUIK: ['Цей домен уже має інший додаток.', 'Dit domein hoort al bij een andere app.'],
  APP_DOMEIN_ONGELDIG: ['Домен більше не проходить перевірку (адреса сайту або під доменом сайту).', 'Het domein haalt de controle niet meer (adres van de site of onder het domein van de site).'],
  APP_DOMEIN_APPARAAT_BEZIG: ['Сервер ще виконує зміну маршруту; перевірте стан додатка за хвилину.', 'De server is de route nog aan het wijzigen; bekijk de stand van de app over een minuut.'],
  APP_DOMEIN_APPARAAT_FOUT: ['Сервер не зміг задати маршрут (Caddy або реєстр додатків); подробиці в журналі пристрою.', 'De server kon de route niet zetten (Caddy of het register van apps); details in het logboek van het apparaat.'],
  MEDIA_GENERATOR_DRUK: ['Генератор уже зайнятий (до 2 завдань на людину, до 4 на сервері). Спробуйте трохи згодом.', 'De generator is al bezig (hoogstens 2 opdrachten per persoon, 4 op de server). Probeer het straks opnieuw.'],
  MEDIA_OPDRACHT_ONBEKEND: ['Такого завдання немає (або воно завершилося понад годину тому, або не ваше).', 'Deze opdracht bestaat niet (of is meer dan een uur geleden klaar, of is niet van u).'],
});
export const devMgFoutTekst = (code: string, taal: 'uk' | 'nl', vars: Record<string, string | number> = {}): string | null => {
  const t = DEV_MG_FOUTEN[code];
  if (!t) return null;
  return Object.entries(vars).reduce((s, [k, v]) => s.split(`{${k}}`).join(String(v)), t[taal === 'uk' ? 0 : 1]);
};
