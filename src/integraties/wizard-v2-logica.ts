// UI-013 етап 2 + CONSOL-001 (0324) — логіка майстра з шести кроків (без DOM). Перевіряється в tests/eenheid/integraties-fase2-20261029.test.ts.
// Повторне використання: вхід OAuth (Google/GitHub/MCP), IMAP і сховище ключів працюють у наявних потоках цільових сторінок.
// Для перехідників (WebDAV/S3/MQTT) майстер виконує живу перевірку і за явною дією людини запечатує секрет у просторі (прапорець integraties-adapter-opslaan-v1).
import type { Integratie } from '../../shared/integraties-catalogus';
import { groepVan, registerVan, type LevendeStand } from '../../shared/integraties-register';

export const ADAPTER_OPSLAAN_VLAG = 'integraties-adapter-opslaan-v1';

export const STAPPEN = [
  { id: 'kies', uk: 'Сервіс', nl: 'Dienst' },
  { id: 'wijze', uk: 'Спосіб', nl: 'Wijze' },
  { id: 'autorisatie', uk: 'Вхід', nl: 'Aanmelden' },
  { id: 'controle', uk: 'Перевірка', nl: 'Controle' },
  { id: 'rechten', uk: 'Дозволи', nl: 'Rechten' },
  { id: 'klaar', uk: 'Готово', nl: 'Klaar' },
] as const;
export type StapId = (typeof STAPPEN)[number]['id'];
export type AutorisatieSoort = 'adapter' | 'pagina' | 'directory' | 'geen';

export function autorisatieSoort(i: Integratie): AutorisatieSoort {
  const r = registerVan(i.id);
  if (r?.adapter) return 'adapter';
  if (i.doel?.soort === 'directory') return 'directory';
  if (i.doel?.soort === 'pagina' || (r?.uitvoering === 'werkend' && r.pagina)) return 'pagina';
  return 'geen';
}
/** Чи може майстер запропонувати цю службу: лише те, що має справжній потік входу або перехідник; «У розробці» показує план. */
export const wizardKan = (i: Integratie, l: LevendeStand): boolean => groepVan(i, l) !== 'ontwikkeling' && autorisatieSoort(i) !== 'geen';
/** Чи може /integraties/controleer прочитати живий стан служби (сховище ключів, агент ШІ); інакше чесно повертає «onbekend». */
export const serverControleerbaar = (i: Integratie): boolean => Boolean(i.levend && (i.levend.startsWith('agent:') || ['github', 'telegram', 'anthropic', 'home-assistant'].includes(i.levend)));

export function volgende(s: StapId): StapId { const i = STAPPEN.findIndex((x) => x.id === s); return STAPPEN[Math.min(i + 1, STAPPEN.length - 1)].id; }
export function vorige(s: StapId): StapId { const i = STAPPEN.findIndex((x) => x.id === s); return STAPPEN[Math.max(i - 1, 0)].id; }

/** Пояснення кодів помилок перевірки та збереження обома мовами. Невідомий код лишається видимим як є. */
export const CONTROLE_FOUT: Record<string, readonly [string, string]> = {
  WEBDAV_TOEGANG_GEWEIGERD: ['Сервер не прийняв ім’я входу або пароль застосунку.', 'De server weigerde de gebruikersnaam of het app-wachtwoord.'],
  WEBDAV_NIET_GEVONDEN: ['Теку не знайдено. Перевірте адресу (…/remote.php/dav/files/<ім’я>/).', 'Map niet gevonden. Controleer het adres (…/remote.php/dav/files/<naam>/).'],
  WEBDAV_ONBEREIKBAAR: ['Сервер недоступний.', 'De server is niet bereikbaar.'],
  WEBDAV_ADRES_ONGELDIG: ['Потрібна адреса https://… без імені входу в адресі.', 'Een https://-adres zonder aanmelding in het adres is nodig.'],
  WEBDAV_ANTWOORD_ONGELDIG: ['Це не схоже на сервер WebDAV.', 'Dit lijkt geen WebDAV-server.'],
  WEBDAV_GEGEVENS_ONTBREKEN: ['Заповніть адресу, ім’я користувача та пароль застосунку.', 'Vul het adres, de gebruikersnaam en het app-wachtwoord in.'],
  S3_TOEGANG_GEWEIGERD: ['Ключ доступу не прийнято.', 'De toegangssleutel werd geweigerd.'],
  S3_EMMER_NIET_GEVONDEN: ['Такого кошика сховища (S3) немає.', 'Deze opslagemmer bestaat niet.'],
  S3_ONBEREIKBAAR: ['Сховище недоступне.', 'De opslag is niet bereikbaar.'],
  S3_ADRES_ONGELDIG: ['Потрібна адреса https://…', 'Een https://-adres is nodig.'],
  S3_EMMER_ONGELDIG: ['Неправильна назва кошика сховища (S3).', 'Ongeldige naam van de opslagemmer.'],
  S3_GEGEVENS_ONTBREKEN: ['Заповніть адресу сховища, назву кошика та ключі доступу.', 'Vul het eindpunt, de opslagemmer en de toegangssleutels in.'],
  MQTT_TOEGANG_GEWEIGERD: ['Брокер не прийняв ім’я входу або пароль.', 'De broker weigerde de aanmelding.'],
  MQTT_ONBEREIKBAAR: ['Брокер недоступний (потрібен TLS, зазвичай порт 8883).', 'De broker is niet bereikbaar (TLS nodig, meestal poort 8883).'],
  MQTT_PRIVE_ADRES: ['Адреса в домашній мережі поки не дозволена з сервера.', 'Een adres in het thuisnetwerk is vanaf de server nog niet toegestaan.'],
  MQTT_TIJD_VERSTREKEN: ['Брокер не відповів вчасно.', 'De broker antwoordde niet op tijd.'],
  MQTT_GEGEVENS_ONTBREKEN: ['Заповніть адресу брокера та пароль.', 'Vul het brokeradres en het wachtwoord in.'],
  SLEUTELKLUIS_GESLOTEN: ['Сховище ключів зачинене. Відімкніть свій ключ у налаштуваннях безпеки й повторіть збереження.', 'De sleutelkluis is gesloten. Ontgrendel uw sleutel bij Beveiliging en probeer opnieuw te bewaren.'],
  ADAPTER_SLEUTEL_ONTBREEKT: ['Серверний ключ шифрування не налаштовано.', 'De versleutelingssleutel op de server ontbreekt.'],
  TE_VAAK: ['Забагато перевірок. Зачекайте хвилину.', 'Te veel controles. Wacht een minuut.'],
};
