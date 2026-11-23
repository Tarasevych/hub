// Віха M2 (Т-1, CONSOL-001): клієнтська дія швидкого захисту «Це був не я» / «Dit was ik niet»
// для підозрілих сеансів та непідтверджених нових пристроїв сайту.
import { api } from '../platform/client';
import { ecosystemTabContext } from '../tab-context';

export const NIET_IK_ROUTE = '/api/owner/identity/security/niet-ik';

export type NietIkOpties = {
  sessieId?: string;
  kind?: 'session' | 'tab';
  apparaatId?: string;
};

export type NietIkAntwoord = {
  ok?: boolean;
  revokedAt?: number;
  sessies?: number;
  tabs?: number;
  grants?: number;
  apparaatVerwijderd?: boolean;
  adviesPad?: string;
};

export const NIET_IK_TEKST = {
  knop: ['Це був не я', 'Dit was ik niet'] as const,
  vraagSessie: [
    'Позначити цей вхід як чужий («Це був не я»)? Сеанс, його вкладки та запам’ятований оглядач буде негайно заблоковано.',
    'Deze aanmelding als vreemd markeren («Dit was ik niet»)? De sessie, tabbladen en onthouden browser worden direct geblokkeerd.',
  ] as const,
  vraagApparaat: [
    'Позначити цей пристрій як чужий («Це був не я»)? Пристрій буде вилучено з відомих, а всі його відкриті сеанси негайно припинено.',
    'Dit apparaat als vreemd markeren («Dit was ik niet»)? Het apparaat verdwijnt uit de bekende en alle open sessies erop worden direct beëindigd.',
  ] as const,
  bevestigKnop: ['Заблокувати чужий вхід', 'Vreemde aanmelding blokkeren'] as const,
  adviesKop: ['Підозрілий вхід негайно припинено.', 'De verdachte aanmelding is onmiddellijk beëindigd.'] as const,
  adviesTekst: [
    'Рекомендуємо одразу перевірити способи входу, змінити пароль (якщо встановлено) та переглянути ключі доступу й коди відновлення.',
    'Controleer meteen uw aanmeldmethoden, wijzig uw wachtwoord (indien ingesteld) en kijk uw toegangssleutels en herstelcodes na.',
  ] as const,
  naarMethoden: ['Перевірити способи входу', 'Aanmeldmethoden controleren'] as const,
};

type PostFn = (url: string, body: unknown) => Promise<{ data: unknown }>;

export const NIET_IK_EVENT = 'mr:niet-ik-uitgevoerd';

export async function meldNietIk(
  opties: NietIkOpties,
  post: PostFn = (url, body) => api.post(url, body),
): Promise<NietIkAntwoord> {
  const r = await post(NIET_IK_ROUTE, {
    service: 'identity',
    tabContext: ecosystemTabContext(),
    sourceOrigin: typeof location !== 'undefined' ? location.origin : 'https://id.tarasevych.com',
    ...(opties.sessieId ? { sessieId: opties.sessieId, sessionId: opties.sessieId } : {}),
    ...(opties.kind ? { kind: opties.kind } : {}),
    ...(opties.apparaatId ? { apparaatId: opties.apparaatId } : {}),
    confirmation: 'DIT_WAS_IK_NIET',
  });
  try {
    if (typeof window !== 'undefined' && typeof CustomEvent === 'function') {
      window.dispatchEvent(new CustomEvent(NIET_IK_EVENT));
    }
  } catch {
    /* поза оглядачем */
  }
  return (r?.data && typeof r.data === 'object' ? r.data : {}) as NietIkAntwoord;
}
