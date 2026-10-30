/** Поріг дзвоника для однієї скриньки (блок 2, п. 2.4). Доставки нових листів ще немає. */
export const MAIL_MELDING_NIVEAUS = ['all', 'info', 'waiting', 'action', 'none'] as const;
export type MailMeldingNiveau = (typeof MAIL_MELDING_NIVEAUS)[number];
export type MailTriageNiveau = 'action' | 'waiting' | 'info' | 'later';

const RANG: Record<MailTriageNiveau, number> = { later: 0, info: 1, waiting: 2, action: 3 };

export function isMailMeldingNiveau(value: unknown): value is MailMeldingNiveau {
  return MAIL_MELDING_NIVEAUS.includes(value as MailMeldingNiveau);
}

/** `google:<id>` | `microsoft:<id>` | `imap:<id>` — той самий ключ, що на картці акаунта. */
export const MAIL_MELDING_SLEUTEL = /^(google|microsoft|imap):[A-Za-z0-9_.:@-]{1,160}$/;

export function mailMeldingSleutelGeldig(value: string): boolean {
  return MAIL_MELDING_SLEUTEL.test(value);
}

export function mailShouldNotify(triage: MailTriageNiveau, minimum: MailMeldingNiveau): boolean {
  if (minimum === 'none') return false;
  if (minimum === 'all') return true;
  return RANG[triage] >= (minimum === 'info' ? 1 : minimum === 'waiting' ? 2 : 3);
}

const NAMEN: Record<MailMeldingNiveau, [string, string]> = {
  all: ['Усі листи', 'Alle berichten'],
  info: ['Інфо, Чекаю та Дія', 'Info, Wachten en Actie'],
  waiting: ['Чекаю та Дія', 'Wachten en Actie'],
  action: ['Лише Дія — рекомендовано', 'Alleen Actie — aanbevolen'],
  none: ['Не показувати', 'Niet tonen'],
};

export function mailMeldingNiveauNaam(niveau: MailMeldingNiveau, taal: 'uk' | 'nl'): string {
  const [uk, nl] = NAMEN[niveau];
  return taal === 'uk' ? uk : nl;
}
