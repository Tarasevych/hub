// SEC-002 (g10i, privacy-logboek-05): export en ketencontrole van het beheerjournaal zijn begrensd (per uur) en vragen een verse
// bevestiging van de aanmelding. Een weigering kreeg vroeger dezelfde tekst als een echte fout («Експорт не вдався»), dus de mens
// probeerde meteen opnieuw. Deze zuivere functie zegt wat er aan de hand is en wanneer het weer kan; geen bekende weigering → ''.
type Lang = 'uk' | 'nl';
type Soort = 'export' | 'keten';

export function journaalWeigeringTekst(lang: Lang, e: unknown, soort: Soort): string {
  const f = (e ?? {}) as { message?: unknown; status?: unknown; retryAfter?: unknown; response?: { data?: { retryAfter?: unknown } } };
  const code = String(f.message ?? '');
  const tr = (uk: string, nl: string) => (lang === 'uk' ? uk : nl);
  if (code === 'RATE_LIMITED' || Number(f.status) === 429) {
    const sec = Number(f.retryAfter) > 0 ? Number(f.retryAfter) : Number(f.response?.data?.retryAfter) || 0;
    const min = sec > 0 ? Math.max(1, Math.ceil(sec / 60)) : 0;
    const wanneerUk = min ? `Спробуйте через ~${min} хв.` : 'Спробуйте пізніше.';
    const wanneerNl = min ? `Probeer het over ~${min} min. opnieuw.` : 'Probeer het later opnieuw.';
    return soort === 'export'
      ? tr(`Забагато експортів журналу за годину — нічого не експортовано. ${wanneerUk}`, `Te veel exports van het journaal dit uur — er is niets geëxporteerd. ${wanneerNl}`)
      : tr(`Забагато перевірок ланцюжка за годину — перевірку не виконано. ${wanneerUk}`, `Te veel ketencontroles dit uur — de controle is niet uitgevoerd. ${wanneerNl}`);
  }
  if (code === 'STAP_OP_NIET_BESCHIKBAAR') {
    // SEC-002 (slot «u», interface п.5): de ketencontrole krijgt haar eigen naam, niet «Експорт».
    return soort === 'export'
      ? tr('Експорт тимчасово недоступний: сервер не може попросити повторне підтвердження входу. Повідомте власника сайту.',
        'Exporteren is tijdelijk niet beschikbaar: de server kan niet om een nieuwe bevestiging van de aanmelding vragen. Meld het aan de eigenaar van de site.')
      : tr('Перевірка ланцюжка тимчасово недоступна: сервер не може попросити повторне підтвердження входу. Повідомте власника сайту.',
        'De ketencontrole is tijdelijk niet beschikbaar: de server kan niet om een nieuwe bevestiging van de aanmelding vragen. Meld het aan de eigenaar van de site.');
  }
  if (code === 'STEP_UP_REQUIRED' || code === 'STEP_UP_STRONG_REQUIRED' || code === 'STAP_OP_VENSTER_FOUT') {
    return tr('Дію не виконано: вхід не підтверджено (вікно «Підтвердіть доступ» закрито). Спробуйте ще раз і підтвердіть вхід.',
      'Niet uitgevoerd: de aanmelding is niet bevestigd (venster «Toegang bevestigen» gesloten). Probeer het opnieuw en bevestig de aanmelding.');
  }
  return '';
}
