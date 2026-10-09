export type Lang = 'uk' | 'nl';

type Row = { uk: string; nl: string };

const COPY: Record<string, Row> = {
  t13: {
    uk: 'Не вдалося завантажити способи входу.',
    nl: 'Aanmeldmethoden konden niet worden geladen.'
  },
  t14: {
    uk: 'Це останній спосіб входу — його не можна вимкнути.',
    nl: 'Dit is de laatste aanmeldmethode — deze kan niet worden uitgeschakeld.'
  },
  t15: {
    uk: 'Останній Google-секрет захищено від видалення.',
    nl: 'Het laatste Google-geheim is beschermd tegen verwijderen.'
  },
  t16: {
    uk: 'Не вдалося зберегти зміну. Спробуйте ще раз.',
    nl: 'De wijziging kon niet worden opgeslagen. Probeer opnieuw.'
  },
  t17: {
    uk: 'Цей браузер не підтримує passkey.',
    nl: 'Deze browser ondersteunt geen passkey.'
  },
  t18: {
    uk: 'Passkey',
    nl: 'Passkey'
  },
  t19: {
    uk: 'Passkey не підтверджено. Спробуйте ще раз або введіть код.',
    nl: 'Passkey niet bevestigd. Probeer opnieuw of voer de code in.'
  },
  t20: {
    uk: 'Код не підходить. Перевірте застосунок-автентифікатор і спробуйте ще раз.',
    nl: 'De code klopt niet. Controleer de authenticator-app en probeer opnieuw.'
  },
  t21: {
    uk: 'Забагато спроб. Зачекайте кілька хвилин.',
    nl: 'Te veel pogingen. Wacht een paar minuten.'
  }
};

export const t = (lang: Lang, key: string): string => {
  const row = COPY[key];
  if (!row) return key;
  return lang === 'nl' ? row.nl : row.uk;
};
