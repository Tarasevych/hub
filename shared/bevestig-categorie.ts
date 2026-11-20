// UPD-011: єдина візуальна система категорій підтверджень для сайту, захищеного вікна Telegram і PNG-карток бота.
// Eén visueel systeem van bevestigingscategorieën voor de site, het beveiligde Telegram-venster en de PNG-kaarten van de bot.

export type BevestigCategorieId =
  | 'aanmelden'
  | 'uitrol'
  | 'rechten'
  | 'verwijderen'
  | 'kluis'
  | 'ai'
  | 'server'
  | 'beveiliging'
  | 'gegevens'
  | 'algemeen';

export type BevestigCategorie = {
  id: BevestigCategorieId;
  /** Основний колір акценту (для PNG-картки й SVG-медальйона). */
  kleur: string;
  /** Темніший відтінок для контрасту й рамки. */
  donker: string;
  /** Коротка назва категорії українською та нідерландською. */
  uk: string;
  nl: string;
  /** Лаконічна мітка-бейдж (1–2 слова) для картки й заголовка. */
  badgeUk: string;
  badgeNl: string;
  /** Ознака підвищеного ризику дії. */
  hoogRisico: boolean;
  /** Чисті SVG-елементи у полі 24×24 для захищеного вікна без зовнішніх скриптів. */
  svgInhoud: string;
};

export const BEVESTIG_CATEGORIEEN: Record<BevestigCategorieId, BevestigCategorie> = {
  aanmelden: {
    id: 'aanmelden',
    kleur: '#1d77b5',
    donker: '#14517d',
    uk: 'Вхід у простір',
    nl: 'Aanmelden',
    badgeUk: 'ВХІД',
    badgeNl: 'AANMELDEN',
    hoogRisico: false,
    svgInhoud: '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/>',
  },
  uitrol: {
    id: 'uitrol',
    kleur: '#4f46e5',
    donker: '#3730a3',
    uk: 'Оновлення сервера',
    nl: 'Serverupdate',
    badgeUk: 'ОНОВЛЕННЯ',
    badgeNl: 'UPDATE',
    hoogRisico: true,
    svgInhoud: '<path d="M12 2L4 6.5v11L12 22l8-4.5v-11L12 2z"/><path d="M12 22V11"/><path d="M20 6.5L12 11 4 6.5"/><path d="M12 7v4"/><path d="M9 9l3-3 3 3"/>',
  },
  rechten: {
    id: 'rechten',
    kleur: '#0d9488',
    donker: '#0f766e',
    uk: 'Права та ключі доступу',
    nl: 'Rechten en sleutels',
    badgeUk: 'ПРАВА ТА КЛЮЧІ',
    badgeNl: 'RECHTEN',
    hoogRisico: true,
    svgInhoud: '<circle cx="8" cy="15" r="4"/><path d="M10.85 12.15L19 4"/><path d="M18 5l2 2"/><path d="M15 8l2 2"/>',
  },
  verwijderen: {
    id: 'verwijderen',
    kleur: '#dc2626',
    donker: '#991b1b',
    uk: 'Видалення або скидання',
    nl: 'Verwijderen of resetten',
    badgeUk: 'КРИТИЧНА ДІЯ',
    badgeNl: 'KRITIEK',
    hoogRisico: true,
    svgInhoud: '<path d="M3 6h18"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>',
  },
  kluis: {
    id: 'kluis',
    kleur: '#d97706',
    donker: '#92400e',
    uk: 'Сховище секретів і шифрування',
    nl: 'Geheimenkluis en versleuteling',
    badgeUk: 'СХОВИЩЕ',
    badgeNl: 'KLUIS',
    hoogRisico: true,
    svgInhoud: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/><circle cx="12" cy="16" r="1.5"/>',
  },
  ai: {
    id: 'ai',
    kleur: '#6366f1',
    donker: '#4338ca',
    uk: 'Штучний інтелект і з’єднувач',
    nl: 'AI en koppeling',
    badgeUk: 'ШІ · З’ЄДНУВАЧ',
    badgeNl: 'AI · KOPPELING',
    hoogRisico: true,
    svgInhoud: '<rect x="5" y="7" width="14" height="11" rx="3"/><path d="M12 3v4"/><circle cx="9.5" cy="12.5" r="1.2"/><circle cx="14.5" cy="12.5" r="1.2"/><path d="M9 16h6"/>',
  },
  server: {
    id: 'server',
    kleur: '#2563eb',
    donker: '#1e40af',
    uk: 'Сервер, термінал і захист',
    nl: 'Server, terminal en beveiliging',
    badgeUk: 'СЕРВЕР',
    badgeNl: 'SERVER',
    hoogRisico: true,
    svgInhoud: '<rect x="3" y="4" width="18" height="16" rx="2"/><polyline points="7 10 10 13 7 16"/><line x1="12" y1="16" x2="17" y2="16"/>',
  },
  beveiliging: {
    id: 'beveiliging',
    kleur: '#15803d',
    donker: '#166534',
    uk: 'Способи входу та сеанси',
    nl: 'Aanmeldmethoden en sessies',
    badgeUk: 'БЕЗПЕКА',
    badgeNl: 'BEVEILIGING',
    hoogRisico: false,
    svgInhoud: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
  },
  gegevens: {
    id: 'gegevens',
    kleur: '#0284c7',
    donker: '#0369a1',
    uk: 'Пошта, хмара та оселя',
    nl: 'Mail, cloud en woning',
    badgeUk: 'ПРОСТІР',
    badgeNl: 'RUIMTE',
    hoogRisico: false,
    svgInhoud: '<path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/>',
  },
  algemeen: {
    id: 'algemeen',
    kleur: '#1d77b5',
    donker: '#14517d',
    uk: 'Підтвердження дії',
    nl: 'Bevestiging van actie',
    badgeUk: 'ПІДТВЕРДЖЕННЯ',
    badgeNl: 'BEVESTIGING',
    hoogRisico: false,
    svgInhoud: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
  },
};

/**
 * Визначає візуальну категорію дії за кодом дії, маршрутом або заголовком.
 * Bepaalt de visuele categorie aan de hand van actiecode, pad of titel.
 */
export function categorieVoorActie(actie?: string, pad?: string, titel?: string): BevestigCategorie {
  const bron = `${actie || ''} ${pad || ''} ${titel || ''}`.toLowerCase();

  if (/\b(inloggen|inlog|aanmelden|aanmeld|login|signin)\b|запит на вхід|вхід на сайт|aanmeldverzoek/.test(bron) && !/aanmeldmethode|спосіб входу|способів входу|policy|ontkoppel|unbind/.test(bron)) {
    return BEVESTIG_CATEGORIEEN.aanmelden;
  }
  if (/uitrol\/(sleutels|voorbereiders)|\/rechten\b|\/toevoegen\b|\/termijn\b|\/toekennen\b|права|ключ.*адмін|делегуван/.test(bron)) {
    return BEVESTIG_CATEGORIEEN.rechten;
  }
  if (/uitrol|release|випуск|оновлен|розгортан|terugdraai|відклик|selectief/.test(bron)) {
    return BEVESTIG_CATEGORIEEN.uitrol;
  }
  if (/verwijder|wissen|delete|purge|reset-password|revoke-all|видален|стерт|скинут|вийт.*усіх/.test(bron)) {
    return BEVESTIG_CATEGORIEEN.verwijderen;
  }
  if (/sleutelkluis|kluis|geheim|vault|herversleutel|шифруван|сховищ|секрет/.test(bron)) {
    return BEVESTIG_CATEGORIEEN.kluis;
  }
  if (/connector-v2|mcp|agent|ai-|\/ai\/|extensie|browser-enabled|штучн|агент|з’єднувач|розширен/.test(bron)) {
    return BEVESTIG_CATEGORIEEN.ai;
  }
  if (/terminal|ssh-ca|remote|beveiliging\/|tech\/ruimtes|orch\/|термінал|сервер|технічн/.test(bron)) {
    return BEVESTIG_CATEGORIEEN.server;
  }
  if (/passkey|totp|herstel|codewoord|telegram|apparaat|aanmeld\/vnext|access\/|security|спосіб входу|код.*відновлен|ключ.*доступу|сеанс/.test(bron)) {
    return BEVESTIG_CATEGORIEEN.beveiliging;
  }
  if (/mail|cloud|huis|agenda|share|пошт|хмар|осел/.test(bron)) {
    return BEVESTIG_CATEGORIEEN.gegevens;
  }
  return BEVESTIG_CATEGORIEEN.algemeen;
}

/** Побудова готового SVG-значка категорії для вбудовування в захищене вікно Telegram. */
export function categorieSvg(cat: BevestigCategorie, maat = 24): string {
  return `<svg viewBox="0 0 24 24" width="${maat}" height="${maat}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${cat.svgInhoud}</svg>`;
}
