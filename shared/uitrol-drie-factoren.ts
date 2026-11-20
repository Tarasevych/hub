// UPD-011: 3-чинникова довіра для оновлень (GitHub ↔ MCP-з’єднувач ШІ ↔ Обліковий запис і права на сайті)
// та персональні відкличні ключі адміністраторів/делегованих осіб.
// Driefactorvertrouwen voor uitrollen en persoonlijke intrekbare beheersleutels.

export type HerkomstKanaal = 'github' | 'mcp' | 'site' | 'ssh' | 'gitops' | 'onbekend';
export type SleutelRol = 'eigenaar' | 'beheerder' | 'gedelegeerde' | 'agent';
export type SleutelToegang = 'uploaden' | 'installeren';

export type FactorStatus = {
  ok: boolean;
  bron: 'github' | 'mcp' | 'site';
  detailUk: string;
  detailNl: string;
  geverifieerdOp?: string;
};

export type DrieFactorenOordeel = {
  volledig: boolean;
  aantalOk: number;
  totaal: 3;
  niveau: 'volledig' | 'gedeeltelijk' | 'onvoldoende';
  github: FactorStatus;
  mcp: FactorStatus;
  site: FactorStatus;
  samenvattingUk: string;
  samenvattingNl: string;
};

export type DrieFactorenInvoer = {
  /** Чинник 1: GitHub-ключ/репозиторій + проходження TRACE-001. */
  githubKoppeling?: string;
  githubGeverifieerd?: boolean;
  githubGeverifieerdOp?: string;
  traceOk?: boolean;
  /** Чинник 2: Прив’язаний MCP-з’єднувач ШІ + чинні правила оркестрації. */
  mcpKoppelingId?: string;
  mcpAgentSlug?: string;
  mcpGeverifieerd?: boolean;
  mcpGeverifieerdOp?: string;
  regelsGeldig?: boolean;
  regelsVersie?: string;
  /** Чинник 3: Чинний обліковий запис, персональний невідкликаний ключ і права на сайті. */
  siteAccountActief?: boolean;
  siteGrantActief?: boolean;
  siteSleutelActief?: boolean;
  siteHandtekeningOk?: boolean;
  siteToegangNiveau?: SleutelToegang;
};

export const HERKOMST_KANALEN: readonly HerkomstKanaal[] = ['github', 'mcp', 'site', 'ssh', 'gitops', 'onbekend'];

export function normaliseerHerkomst(waarde: unknown): HerkomstKanaal {
  const s = String(waarde || '').trim().toLowerCase();
  return (HERKOMST_KANALEN as readonly string[]).includes(s) ? (s as HerkomstKanaal) : 'onbekend';
}

export function herkomstLabel(kanaal: HerkomstKanaal, taal: 'uk' | 'nl'): string {
  const labels: Record<HerkomstKanaal, readonly [string, string]> = {
    github: ['GitHub (реліз)', 'GitHub (release)'],
    mcp: ['MCP-з’єднувач ШІ', 'MCP AI-koppeling'],
    site: ['Сайт (панель)', 'Site (paneel)'],
    ssh: ['Сервер (SSH)', 'Server (SSH)'],
    gitops: ['Автоматичний GitOps', 'Automatische GitOps'],
    onbekend: ['Джерело не вказано', 'Bron onbekend'],
  };
  const paar = labels[kanaal] || labels.onbekend;
  return taal === 'nl' ? paar[1] : paar[0];
}

/**
 * Оцінює взаємну 3-чинникову довіру оновлення:
 * 1) GitHub-прив’язка + походження TRACE-001;
 * 2) MCP-з’єднувач ШІ + чинні правила;
 * 3) Активний обліковий запис, невідкликаний персональний ключ і чинний дозвіл на сайті.
 */
export function evalueerDrieFactoren(invoer: DrieFactorenInvoer): DrieFactorenOordeel {
  const githubOk = Boolean(invoer.githubKoppeling && (invoer.githubGeverifieerd || invoer.traceOk));
  const mcpOk = Boolean((invoer.mcpKoppelingId || invoer.mcpAgentSlug) && invoer.mcpGeverifieerd !== false && invoer.regelsGeldig !== false);
  const siteOk = Boolean(invoer.siteAccountActief !== false && invoer.siteGrantActief && invoer.siteSleutelActief !== false);

  const github: FactorStatus = {
    ok: githubOk,
    bron: 'github',
    geverifieerdOp: invoer.githubGeverifieerdOp,
    detailUk: githubOk
      ? `GitHub прив’язано (${invoer.githubKoppeling})${invoer.traceOk ? ' · TRACE-001 підтверджено' : ''}`
      : invoer.githubKoppeling
        ? 'Прив’язку GitHub ще не підтверджено або TRACE-001 не пройдено'
        : 'Немає прив’язки до ключа/репозиторію GitHub',
    detailNl: githubOk
      ? `GitHub gekoppeld (${invoer.githubKoppeling})${invoer.traceOk ? ' · TRACE-001 bevestigd' : ''}`
      : invoer.githubKoppeling
        ? 'GitHub-koppeling nog niet bevestigd of TRACE-001 ontbreekt'
        : 'Geen koppeling met GitHub-sleutel of repository',
  };

  const mcp: FactorStatus = {
    ok: mcpOk,
    bron: 'mcp',
    geverifieerdOp: invoer.mcpGeverifieerdOp,
    detailUk: mcpOk
      ? `MCP ШІ прив’язано (${invoer.mcpAgentSlug || invoer.mcpKoppelingId})${invoer.regelsVersie ? ` · правила ${invoer.regelsVersie}` : ''}`
      : invoer.regelsGeldig === false
        ? 'Правила оркестрації застаріли або не збігаються'
        : 'Немає підтвердженого MCP-з’єднувача ШІ',
    detailNl: mcpOk
      ? `MCP AI gekoppeld (${invoer.mcpAgentSlug || invoer.mcpKoppelingId})${invoer.regelsVersie ? ` · regels ${invoer.regelsVersie}` : ''}`
      : invoer.regelsGeldig === false
        ? 'Coördinatieregels verouderd of wijken af'
        : 'Geen bevestigde MCP AI-koppeling',
  };

  const site: FactorStatus = {
    ok: siteOk,
    bron: 'site',
    detailUk: siteOk
      ? `Обліковий запис, персональний ключ і права на сайті активні${invoer.siteHandtekeningOk ? ' · підпис чинний' : ''}`
      : invoer.siteSleutelActief === false
        ? 'Персональний ключ відкликано або не створено'
        : 'Немає чинного дозволу на сайті або обліковий запис неактивний',
    detailNl: siteOk
      ? `Account, persoonlijke sleutel en siterechten actief${invoer.siteHandtekeningOk ? ' · handtekening geldig' : ''}`
      : invoer.siteSleutelActief === false
        ? 'Persoonlijke sleutel ingetrokken of ontbreekt'
        : 'Geen geldige sitetoestemming of account niet actief',
  };

  const aantalOk = Number(github.ok) + Number(mcp.ok) + Number(site.ok);
  const volledig = aantalOk === 3;
  const niveau = volledig ? 'volledig' : aantalOk >= 2 ? 'gedeeltelijk' : 'onvoldoende';

  return {
    volledig,
    aantalOk,
    totaal: 3,
    niveau,
    github,
    mcp,
    site,
    samenvattingUk: volledig
      ? 'Усі 3 чинники довіри синхронізовано (GitHub ↔ MCP ШІ ↔ Сайт).'
      : `Підтверджено ${aantalOk} із 3 чинників довіри. Для повного делегованого встановлення потрібні всі 3.`,
    samenvattingNl: volledig
      ? 'Alle 3 vertrouwensfactoren zijn gesynchroniseerd (GitHub ↔ MCP AI ↔ Site).'
      : `${aantalOk} van 3 vertrouwensfactoren bevestigd. Voor gedelegeerde installatie zijn alle 3 vereist.`,
  };
}

/**
 * Правило допуску за рівнем прав:
 * - `uploaden` (лише завантаження в чергу): достатньо чинного сайту + (GitHub або MCP), але встановлення все одно за власником із passkey;
 * - `installeren` (делеговане встановлення): вимагає СУВОРО всіх 3 чинників (GitHub + MCP + Сайт) і невідкликаного персонального ключа.
 */
export function drieFactorenToegangToegestaan(
  oordeel: DrieFactorenOordeel,
  niveau: SleutelToegang,
): { toegestaan: boolean; code: string; redenUk: string; redenNl: string } {
  if (!oordeel.site.ok) {
    return {
      toegestaan: false,
      code: 'SLEUTEL_INGETROKKEN',
      redenUk: 'Персональний ключ або дозвіл на сайті відкликано чи неактивний.',
      redenNl: 'De persoonlijke sleutel of sitetoestemming is ingetrokken of niet actief.',
    };
  }
  if (niveau === 'installeren') {
    if (!oordeel.volledig) {
      return {
        toegestaan: false,
        code: 'DRIE_FACTOREN_ONVOLLEDIG',
        redenUk: 'Для права «Завантаження + встановлення» потрібна взаємна прив’язка всіх 3 чинників: GitHub ↔ MCP ШІ ↔ Сайт.',
        redenNl: 'Voor het recht «Uploaden + installeren» is wederzijdse koppeling van alle 3 factoren vereist: GitHub ↔ MCP AI ↔ Site.',
      };
    }
    return {
      toegestaan: true,
      code: 'OK',
      redenUk: 'Усі 3 чинники підтверджено.',
      redenNl: 'Alle 3 factoren zijn bevestigd.',
    };
  }
  // Для «лише завантаження» сайт активний і перевіряє кожне завантаження, але встановлення залишається за власником.
  return {
    toegestaan: true,
    code: 'OK',
    redenUk: 'Завантаження дозволено в чергу на перевірку та схвалення власником.',
    redenNl: 'Uploaden naar de wachtrij voor controle en goedkeuring door de eigenaar is toegestaan.',
  };
}

export type UitwisselPakket = {
  versie: 1;
  sleutelId: string;
  prefix: string;
  githubKoppeling: string;
  mcpAgentSlug: string;
  regelsVersie: string;
  verlooptOp: string;
  siteHost: string;
  instructieUk: string;
  instructieNl: string;
};

/** Формує очищений (без таємного ключа в описі) паспорт обміну для прив’язки GitHub і MCP-з’єднувача ШІ. */
export function maakUitwisselPakket(invoer: {
  sleutelId: string;
  prefix: string;
  githubKoppeling: string;
  mcpAgentSlug: string;
  regelsVersie: string;
  verlooptOp: string;
  siteHost?: string;
}): UitwisselPakket {
  const siteHost = invoer.siteHost || 'admin.tarasevych.com';
  return {
    versie: 1,
    sleutelId: invoer.sleutelId,
    prefix: invoer.prefix,
    githubKoppeling: invoer.githubKoppeling,
    mcpAgentSlug: invoer.mcpAgentSlug,
    regelsVersie: invoer.regelsVersie,
    verlooptOp: invoer.verlooptOp,
    siteHost,
    instructieUk: `Збережіть одноразовий ключ ${invoer.prefix}… у секретах GitHub (${invoer.githubKoppeling || 'репозиторій'}) та у профілі MCP-з’єднувача ШІ, після чого натисніть «Підтвердити синхронізацію» на сайті.`,
    instructieNl: `Bewaar de eenmalige sleutel ${invoer.prefix}… in de GitHub-geheimen (${invoer.githubKoppeling || 'repository'}) en in het profiel van de MCP AI-koppeling, en tik daarna «Synchronisatie bevestigen» op de site.`,
  };
}
