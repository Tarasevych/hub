// Namen en uitleg voor de beleidsdienst (OPA) in schaduw (backend/beleid.ts, deploy/opa/beleid/toegang.rego).
import type { HelpLagen, Tekst } from './tech-rollen';

export const BEHEER_ACTIE_NAAM: Record<string, Tekst> = {
  'admin:admin.read': ['Перегляд адмін-консолі', 'Beheerconsole bekijken'],
  'admin:users.manage': ['Керування користувачами', 'Gebruikers beheren'],
  'admin:apps.manage': ['Керування застосунками', 'Apps beheren'],
  'admin:devices.read': ['Перегляд пристроїв', 'Apparaten bekijken'],
  'admin:audit.read': ['Читання журналу', 'Logboek lezen'],
  'admin:sso.manage': ['Налаштування входу (SSO)', 'Aanmelding (SSO) beheren'],
  'admin:directories.manage': ['Каталоги користувачів', 'Gebruikersmappen beheren'],
  'admin:roles.manage': ['Призначення ролей', 'Rollen toekennen'],
};

export const HELP_BELEID: HelpLagen = {
  wat: ['Окрема служба правил (OPA) на сервері ще раз «вирішує» кожну адмін-дію — поки лише для порівняння, нічого не блокує.', 'Een aparte regeldienst (OPA) op de server beslist elke beheeractie nog eens — voorlopig alleen om te vergelijken, blokkeert niets.'],
  gevolg: ['Видно, чи правила збігаються з сайтом, і скільки адмін-дій заборонив би майбутній перемикач «адмін-права лише в технічному профілі».', 'Zichtbaar of de regels met de site overeenkomen en hoeveel beheeracties de toekomstige schakelaar «beheerrechten alleen in technisch profiel» zou weigeren.'],
  dev: ['OPA 1.20.2 (Apache-2.0, версія й SHA-256 закріплені), лише 127.0.0.1:8181, DynamicUser, без мережі назовні й телеметрії. Політика deploy/opa/beleid/toegang.rego: «huidig» дзеркалить adminContext + ADMIN_CAPABILITIES, «doel» = huidig І активний технічний профіль із відповідною можливістю. Тіньовий виклик після рішення застосунку, тайм-аут 300 мс, лічильники app.beleid_schaduw. Увімкнення (fail-closed) — лише коли «розбіжність» = 0 тривалий час. Альтернативи: Cedar у процесі Node (швидше, але без окремої служби/аудиту), Casbin, власний рушій (ще один код, що може помилятися).', 'OPA 1.20.2 (Apache-2.0, versie en SHA-256 vast), alleen 127.0.0.1:8181, DynamicUser, geen netwerk naar buiten of telemetrie. Beleid toegang.rego: «huidig» spiegelt adminContext, «doel» = huidig ÉN actief technisch profiel met passende mogelijkheid. Schaduwaanroep na het besluit, 300 ms, tellers in app.beleid_schaduw. Afdwingen (fail-closed) pas bij langdurig «verschil» = 0. Alternatieven: Cedar in Node, Casbin, eigen motor.'],
};
