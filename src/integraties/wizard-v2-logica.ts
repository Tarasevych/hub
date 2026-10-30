// UI-013 fase 2 — logica van de wizard met zes stappen (geen DOM). Getest in tests/eenheid/integraties-fase2-20261029.test.ts.
// Hergebruik: OAuth (Google/GitHub/MCP), IMAP en de kluis gebeuren in hun BESTAANDE stromen op de doelpagina (state/PKCE, scopes en
// versleuteling zitten daar). De wizard opent die stroom en controleert daarna via /integraties/controleer. Alleen voor de nieuwe
// adapters (WebDAV/S3/MQTT) doet de wizard zelf de controle, met het wachtwoord in een geheim veld en zonder iets te bewaren.
import type { Integratie } from '../../shared/integraties-catalogus';
import { groepVan, registerVan, type LevendeStand } from '../../shared/integraties-register';

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
/** Mag de wizard deze dienst aanbieden? Alleen wat een echte stroom of controle heeft; «У розробці» niet (die toont het plan). */
export const wizardKan = (i: Integratie, l: LevendeStand): boolean => groepVan(i, l) !== 'ontwikkeling' && autorisatieSoort(i) !== 'geen';
/** Kan /integraties/controleer de stand van deze dienst echt lezen (kluis, AI-agent)? Anders zegt de controle eerlijk «onbekend». */
export const serverControleerbaar = (i: Integratie): boolean => Boolean(i.levend && (i.levend.startsWith('agent:') || ['github', 'telegram', 'anthropic', 'home-assistant'].includes(i.levend)));

export function volgende(s: StapId): StapId { const i = STAPPEN.findIndex((x) => x.id === s); return STAPPEN[Math.min(i + 1, STAPPEN.length - 1)].id; }
export function vorige(s: StapId): StapId { const i = STAPPEN.findIndex((x) => x.id === s); return STAPPEN[Math.max(i - 1, 0)].id; }

/** Uitleg van foutcodes van de controle, in beide talen. Onbekende code: de code zelf blijft zichtbaar. */
export const CONTROLE_FOUT: Record<string, readonly [string, string]> = {
  WEBDAV_TOEGANG_GEWEIGERD: ['Сервер не прийняв логін або пароль застосунку.', 'De server weigerde de gebruikersnaam of het app-wachtwoord.'],
  WEBDAV_NIET_GEVONDEN: ['Теку не знайдено. Перевірте адресу (…/remote.php/dav/files/<ім’я>/).', 'Map niet gevonden. Controleer het adres (…/remote.php/dav/files/<naam>/).'],
  WEBDAV_ONBEREIKBAAR: ['Сервер недоступний.', 'De server is niet bereikbaar.'],
  WEBDAV_ADRES_ONGELDIG: ['Потрібна адреса https://… без логіна в адресі.', 'Een https://-adres zonder aanmelding in het adres is nodig.'],
  WEBDAV_ANTWOORD_ONGELDIG: ['Це не схоже на сервер WebDAV.', 'Dit lijkt geen WebDAV-server.'],
  S3_TOEGANG_GEWEIGERD: ['Ключ доступу не прийнято.', 'De toegangssleutel werd geweigerd.'],
  S3_EMMER_NIET_GEVONDEN: ['Такого bucket немає.', 'Deze bucket bestaat niet.'],
  S3_ONBEREIKBAAR: ['Сховище недоступне.', 'De opslag is niet bereikbaar.'],
  S3_ADRES_ONGELDIG: ['Потрібна адреса https://…', 'Een https://-adres is nodig.'],
  S3_EMMER_ONGELDIG: ['Неправильна назва bucket.', 'Ongeldige bucketnaam.'],
  MQTT_TOEGANG_GEWEIGERD: ['Брокер не прийняв логін.', 'De broker weigerde de aanmelding.'],
  MQTT_ONBEREIKBAAR: ['Брокер недоступний (потрібен TLS, зазвичай порт 8883).', 'De broker is niet bereikbaar (TLS nodig, meestal poort 8883).'],
  MQTT_PRIVE_ADRES: ['Адреса в домашній мережі поки не дозволена з сервера.', 'Een adres in het thuisnetwerk is vanaf de server nog niet toegestaan.'],
  MQTT_TIJD_VERSTREKEN: ['Брокер не відповів вчасно.', 'De broker antwoordde niet op tijd.'],
  TE_VAAK: ['Забагато перевірок. Зачекайте хвилину.', 'Te veel controles. Wacht een minuut.'],
};
