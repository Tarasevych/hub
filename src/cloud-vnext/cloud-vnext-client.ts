// Оглядачевий клієнт для маршрутів /api/owner/cloud/vnext/webdav та /api/owner/cloud/vnext/automatiseringen
// (backend/cloud-vnext-webdav.ts, змонтовані у backend/cloud-vnext-integraties.ts).
// Спільні типи визначені у shared/cloud-vnext-model.ts.
// Browserclient voor beveiligde HTTPS-WebDAV-koppelingen en automatiseringsregels in Cloud vNext.

import { api, ApiError } from '../platform/client';
import { ecosystemTabContext } from '../tab-context';
import { sessieDienst } from '../canoniek-navigatie';
import { CloudFout } from './cloud-client';
import { foutTekst, tr, type Lang } from './tekst';
import type {
  CloudAutomatiseringRegel,
  CloudAutomatiseringRichting,
  CloudSoort,
  CloudWebdavAanbieder,
  CloudWebdavIngang,
  CloudWebdavKoppeling,
} from '../../shared/cloud-vnext-model';

const opbouwLichaam = (extra: Record<string, unknown> = {}) => ({
  service: sessieDienst(),
  tabContext: ecosystemTabContext(),
  sourceOrigin: location.origin,
  ...extra,
});

async function roep<T>(pad: string, data: Record<string, unknown> = {}): Promise<T> {
  try {
    const r = await api.post(pad, opbouwLichaam(data));
    return r.data as T;
  } catch (e) {
    if (e instanceof ApiError) throw new CloudFout(e.message || `HTTP_${e.status}`, e.status, e.response?.data);
    throw new CloudFout(String((e as Error)?.message || 'FOUT'), 0, null);
  }
}

export type WebdavKoppelInvoer = {
  aanbieder: CloudWebdavAanbieder;
  naam?: string;
  adres: string;
  gebruikersnaam: string;
  wachtwoord: string;
};

export type AutomatiseringInvoer = {
  id?: string;
  naam: string;
  actief?: boolean;
  richting: CloudAutomatiseringRichting;
  soortActie: 'kopie' | 'verplaats';
  filterSoort: CloudSoort | 'alle';
  bronMapId?: string | null;
  doelMapId?: string | null;
  driveAccountId: string;
};

export const cloudVnextUitbreidingClient = {
  webdavLijst: () =>
    roep<{ koppelingen: CloudWebdavKoppeling[] }>('/api/owner/cloud/vnext/webdav', { actie: 'lijst' }),
  webdavTesten: (invoer: WebdavKoppelInvoer | { id: string }) =>
    roep<{ ok: boolean; aantalIngangen: number; origin?: string; padVoorvoegsel?: string }>(
      '/api/owner/cloud/vnext/webdav',
      { actie: 'testen', ...invoer },
    ),
  webdavKoppelen: (invoer: WebdavKoppelInvoer) =>
    roep<{ ok: boolean; koppeling: CloudWebdavKoppeling }>('/api/owner/cloud/vnext/webdav', {
      actie: 'koppelen',
      ...invoer,
    }),
  webdavMappen: (id: string, pad = '/') =>
    roep<{ koppeling: CloudWebdavKoppeling; pad: string; ingangen: CloudWebdavIngang[] }>(
      '/api/owner/cloud/vnext/webdav',
      { actie: 'mappen', id, pad },
    ),
  webdavOntkoppelen: (id: string) =>
    roep<{ ok: boolean; id: string }>('/api/owner/cloud/vnext/webdav', {
      actie: 'ontkoppelen',
      id,
      bevestig: true,
    }),

  automatiseringLijst: () =>
    roep<{ regels: CloudAutomatiseringRegel[] }>('/api/owner/cloud/vnext/automatiseringen', { actie: 'lijst' }),
  automatiseringBewaren: (invoer: AutomatiseringInvoer) =>
    roep<{ regel: CloudAutomatiseringRegel }>('/api/owner/cloud/vnext/automatiseringen', {
      actie: 'bewaar',
      ...invoer,
    }),
  automatiseringSchakelen: (id: string, actief: boolean) =>
    roep<{ regel: CloudAutomatiseringRegel }>('/api/owner/cloud/vnext/automatiseringen', {
      actie: 'schakel',
      id,
      actief,
    }),
  automatiseringVerwijderen: (id: string) =>
    roep<{ ok: boolean; id: string }>('/api/owner/cloud/vnext/automatiseringen', {
      actie: 'verwijder',
      id,
    }),
  automatiseringUitvoeren: (id: string) =>
    roep<{ ok: boolean; aangemaakt: number; regel: CloudAutomatiseringRegel }>(
      '/api/owner/cloud/vnext/automatiseringen',
      { actie: 'uitvoeren', id },
    ),
};

export function webdavFoutTekst(lang: Lang, err: unknown): string {
  const code = err instanceof CloudFout ? err.code : 'FOUT';
  const eigen: Record<string, [string, string]> = {
    WEBDAV_ADRES_LEEG: ['Вкажіть адресу сервера https://.', 'Geef een https://-serveradres op.'],
    WEBDAV_ADRES_ONGELDIG: ['Некоректна адреса сервера WebDAV.', 'Ongeldig WebDAV-serveradres.'],
    WEBDAV_SCHEMA_NIET_TOEGESTAAN: ['Дозволено лише захищене з’єднання https://.', 'Alleen een beveiligde https://-verbinding is toegestaan.'],
    WEBDAV_ADRES_MET_GEHEIM: ['Не вставляйте пароль або ім’я користувача в адресу — введіть їх в окремі поля.', 'Zet geen gebruikersnaam of wachtwoord in het adres — gebruik de aparte velden.'],
    WEBDAV_ADRES_MET_PARAMETERS: ['Адреса не повинна містити запитових параметрів (?) або якоря (#).', 'Het adres mag geen zoekparameters (?) of anker (#) bevatten.'],
    WEBDAV_POORT_NIET_TOEGESTAAN: ['Цей мережевий порт не дозволений для підключення WebDAV (дозволені 443, 5006, 8443).', 'Deze netwerkpoort is niet toegestaan voor WebDAV (toegestaan: 443, 5006, 8443).'],
    WEBDAV_ADRES_INTERN_GEWEIGERD: ['Локальні та внутрішні адреси заблоковано з міркувань безпеки.', 'Lokale en interne adressen zijn om veiligheidsredenen geweigerd.'],
    SSRF_ADRES_GEWEIGERD: ['Внутрішні, петльові та службові IP-адреси заблоковано захистом мережі.', 'Interne, lus- en metadata-IP-adressen zijn door de netwerkbeveiliging geweigerd.'],
    WEBDAV_PAD_ONGELDIG: ['Шлях теки містить недопустимі символи.', 'Het mappad bevat ongeldige tekens.'],
    WEBDAV_GEBRUIKER_ONGELDIG: ['Вкажіть коректне ім’я користувача (без символів шляху).', 'Geef een geldige gebruikersnaam op (zonder padtekens).'],
    WEBDAV_WACHTWOORD_ONGELDIG: ['Вкажіть пароль застосунку (від 4 символів).', 'Geef een toepassingswachtwoord op (minstens 4 tekens).'],
    WEBDAV_TOEGANG_GEWEIGERD: ['Сервер відхилив облікові дані (401/403). Перевірте ім’я та пароль застосунку.', 'De server weigerde de aanmeldgegevens (401/403). Controleer gebruikersnaam en toepassingswachtwoord.'],
    WEBDAV_PAD_NIET_GEVONDEN: ['Теку WebDAV за цією адресою не знайдено (404).', 'De WebDAV-map op dit adres is niet gevonden (404).'],
    WEBDAV_OMLEIDING_GEWEIGERD: ['Сервер повернув перенаправлення — з міркувань безпеки вкажіть кінцеву адресу https:// напряму.', 'De server stuurde een omleiding — geef om veiligheidsredenen het uiteindelijke https://-adres rechtstreeks op.'],
    WEBDAV_TIJDSLIMIET: ['Сервер WebDAV не відповів вчасно.', 'De WebDAV-server antwoordde niet op tijd.'],
    WEBDAV_NIET_BEREIKBAAR: ['Не вдалося з’єднатися із сервером WebDAV.', 'Kon geen verbinding maken met de WebDAV-server.'],
    SLEUTELKLUIS_GESLOTEN: ['Ваше сховище ключів заблоковане в цьому сеансі — розблокуйте його ключем входу або кодом відновлення.', 'Uw sleutelkluis is in deze sessie gesloten — ontgrendel haar met uw toegangssleutel of herstelcode.'],
    WEBDAV_BEVESTIGING_VEREIST: ['Підтвердіть від’єднання сховища.', 'Bevestig het loskoppelen van de opslag.'],
    DOEL_NIET_GEKOPPELD: ['Спершу підключіть обліковий запис Google Диску в розділі «Підключені».', 'Koppel eerst een Google Drive-account onder «Gekoppeld».'],
  };
  const paar = eigen[code];
  if (paar) return tr(lang, paar[0], paar[1]);
  return foutTekst(lang, code, err instanceof CloudFout ? err.data : undefined);
}
