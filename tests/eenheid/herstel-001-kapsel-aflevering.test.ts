// Модульне випробування HERSTEL-001 (Пункт 9):
// 1. Компактні згорнуті капсули за замовчуванням без візуального шуму кнопок і змах обома сторонами в архів.
// 2. Головний 2-рядковий акцент лише для сповіщень з обов’язковим підтвердженням власника («Це не я / Це мій вхід», мандат ШІ, першопричина).
// 3. Кольорове підсвічування й ідеально пряма бічна лінія без вигину лише у непрочитаних сповіщеннях (is-ongelezen проти is-gelezen).
// 4. Галочки месенджера: ⏳ очікує доставки в панель ('wacht'), ✓ доставлено без перегляду ('afgeleverd'), ✓✓ доставлено й прочитано ('gelezen'),
//    зокрема для сповіщень, які одразу заархівувалися за правилами фільтрів, та контроль доставки для адміністратора.
// 5. Кнопка «Розгорнути всі / Згорнути всі» (puls-alles-uitklappen) та налаштування стану за замовчуванням (standaardUitgeklapt).

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ACTIE_LABELS } from '../../shared/beheer-journaal';
import { bouwMeldingRegisterOverzicht } from '../../shared/meldingen-register-overzicht';
import { VLAG_UITLEG } from '../../shared/vlaggen';
import {
  bepaalKapselTellerStaat,
  bepaalMeldingType,
  bepaalOntvangstStaat,
  isMeldingMetGeluid,
  isMeldingOngelezen,
  MELDING_KAPSEL_AFLEVERING_VLAG,
  normaliseerGebeurtenis,
  normaliseerProfiel,
  standaardProfiel,
  type MeldingEcosysteemGebeurtenis,
} from '../../shared/meldingen-ecosysteem';
import {
  bevestigOntvangstEnLezing,
  leesAfleveringOverzichtVoorBeheer,
  slaGebeurtenisOp,
} from '../../backend/meldingen-ecosysteem';
import { RuimteFout } from '../../backend/ruimte-scheiding';
import { SITE_RUIS } from '../../backend/site-activiteit';
import { nepBrowser } from './hulp/nep-browser';
import { checker } from './hulp/nep-google';

const VERBODEN_LETTERS = /[\u0401\u0451\u042a\u044a\u042b\u044b\u042d\u044d]/;
const lees = (pad: string) => readFileSync(resolve(pad), 'utf8');

function maakGeb(
  id: string,
  velden: Partial<MeldingEcosysteemGebeurtenis> & { titel: string },
): MeldingEcosysteemGebeurtenis {
  const nu = 1_763_960_000_000;
  return normaliseerGebeurtenis(
    {
      id,
      externeSleutel: velden.externeSleutel ?? `ext:${id}`,
      ruimte: velden.ruimte ?? 'prive',
      kanaal: velden.kanaal ?? 'app',
      subdomein: velden.subdomein ?? 'hub',
      bron: velden.bron ?? 'systeem',
      prioriteit: velden.prioriteit ?? 'normaal',
      status: velden.status ?? 'nieuw',
      titel: velden.titel,
      bericht: velden.bericht ?? '',
      uitleg: velden.uitleg ?? '',
      contextLabel: velden.contextLabel ?? '',
      herhalingen: velden.herhalingen ?? 1,
      afgeleverdOp: velden.afgeleverdOp ?? null,
      gelezenOp: velden.gelezenOp ?? null,
      autoGearchiveerd: velden.autoGearchiveerd ?? false,
      bijlagen: velden.bijlagen ?? [],
      acties: velden.acties ?? [],
      meta: velden.meta ?? {},
      aangemaaktOp: velden.aangemaaktOp ?? nu - 60_000,
      bijgewerktOp: velden.bijgewerktOp ?? nu,
    },
    velden.ruimte ?? 'prive',
  )!;
}

export async function main(): Promise<number> {
  const { check, einde } = checker('herstel-001-kapsel-aflevering');

  // 1. Модель профілю: згорнуті капсули за замовчуванням, автопрочитання при появі на очах, змах обома сторонами в архів
  const std = standaardProfiel('prive');
  check(
    '1a standaardProfiel за замовчуванням згортає сповіщення в капсули, вмикає автопрочитання при появі на очах і змах обома сторонами в архів',
    std.versie === 2 &&
      std.standaardUitgeklapt === false &&
      std.autoGelezenBijZicht === true &&
      std.veeg.links === 'archief' &&
      std.veeg.rechts === 'archief',
  );

  const oudProfielV1 = normaliseerProfiel(
    { versie: 1, veeg: { actief: true, drempelPx: 72, links: 'archief', rechts: 'gelezen', trilling: true } },
    'prive',
  );
  const aangepastProfiel = normaliseerProfiel(
    { versie: 2, standaardUitgeklapt: true, autoGelezenBijZicht: false, veeg: { links: 'archief', rechts: 'uitstellen' } },
    'prive',
  );
  check(
    '1b normaliseerProfiel оновлює старе типове veeg.rechts=gelezen (v1) на archief і зберігає власні налаштування користувача (v2)',
    oudProfielV1.veeg.rechts === 'archief' &&
      aangepastProfiel.standaardUitgeklapt === true &&
      aangepastProfiel.autoGelezenBijZicht === false &&
      aangepastProfiel.veeg.rechts === 'uitstellen',
  );

  // 2. Квитанції месенджера (⏳ wacht, ✓ afgeleverd, ✓✓ gelezen) та індикатор непрочитаності
  const nogNietInPaneel = maakGeb('g-wacht', { titel: 'Створено на сервері', status: 'nieuw', afgeleverdOp: null, gelezenOp: null });
  const afgeleverdOngelezen = maakGeb('g-afg', { titel: 'Доставлено в панель', status: 'nieuw', afgeleverdOp: 1000, gelezenOp: null });
  const autoArchiefOngelezen = maakGeb('g-auto-1', {
    titel: 'Автоархів за фільтром без перегляду',
    status: 'archief',
    autoGearchiveerd: true,
    afgeleverdOp: 1200,
    gelezenOp: null,
  });
  const autoArchiefGelezen = maakGeb('g-auto-2', {
    titel: 'Автоархів за фільтром після перегляду в архіві',
    status: 'archief',
    autoGearchiveerd: true,
    afgeleverdOp: 1200,
    gelezenOp: 1800,
  });
  const gewoonGelezen = maakGeb('g-gel', { titel: 'Прочитане сповіщення', status: 'gelezen', afgeleverdOp: 1000, gelezenOp: 1500 });

  check(
    '2a bepaalOntvangstStaat розрізняє ⏳ очікування доставки, ✓ доставку в панель без перегляду та ✓✓ прочитане (зокрема для автоархіву фільтрів)',
    bepaalOntvangstStaat(nogNietInPaneel) === 'wacht' &&
      bepaalOntvangstStaat(afgeleverdOngelezen) === 'afgeleverd' &&
      bepaalOntvangstStaat(autoArchiefOngelezen) === 'afgeleverd' &&
      bepaalOntvangstStaat(autoArchiefGelezen) === 'gelezen' &&
      bepaalOntvangstStaat(gewoonGelezen) === 'gelezen',
  );

  check(
    '2b isMeldingOngelezen повертає true виключно для непрочитаних (status=nieuw), а прочитані й архівні не мають кольорового підсвічування',
    isMeldingOngelezen(nogNietInPaneel) === true &&
      isMeldingOngelezen(afgeleverdOngelezen) === true &&
      isMeldingOngelezen(gewoonGelezen) === false &&
      isMeldingOngelezen(autoArchiefOngelezen) === false &&
      isMeldingOngelezen(autoArchiefGelezen) === false,
  );

  // 3. Серверні функції: автоархів за фільтром каналу, квитанції ontvangst та контроль доставки для адміністратора
  const oudeDbUrl = process.env.DATABASE_URL;
  const origConnect = pg.Pool.prototype.connect;
  const origPoolQuery = pg.Pool.prototype.query;
  const opgeslagenRijen: Array<Record<string, unknown>> = [];
  const auditActies: string[] = [];

  try {
    process.env.DATABASE_URL = 'postgres://proef-gebruiker:proef@127.0.0.1:5432/mijnruimte_proef';
    (pg.Pool.prototype as unknown as { connect: () => Promise<unknown> }).connect = async () => ({
      query: async (sql: string, params: unknown[] = []) => {
        if (/SELECT instellingen[\s\S]*FROM app\.melding_ecosysteem_profiel/i.test(sql)) {
          return {
            rows: [
              {
                instellingen: {
                  versie: 2,
                  kanalen: {
                    cloud: { actief: false, popUp: false, geluid: false, drempelPrioriteit: 'normaal' },
                    beveiliging: { actief: true, popUp: true, geluid: true, drempelPrioriteit: 'laag' },
                  },
                },
                bijgewerkt: 1_763_960_000_000,
              },
            ],
            rowCount: 1,
          };
        }
        if (/INSERT INTO app\.melding_ecosysteem_gebeurtenissen/i.test(sql)) {
          const heeftSleutel = sql.includes('ON CONFLICT');
          const rij: Record<string, unknown> = heeftSleutel
            ? {
                id: `00000000-0000-4000-8000-00000000000${opgeslagenRijen.length + 1}`,
                user_id: params[0],
                ruimte: params[1],
                externe_sleutel: params[2],
                kanaal: params[3],
                subdomein: params[4],
                bron: params[5],
                prioriteit: params[6],
                status: params[7],
                titel: params[8],
                bericht: params[9],
                uitleg: params[10],
                context_label: params[11],
                herhalingen: params[12],
                bijlagen: JSON.parse(String(params[13] || '[]')),
                acties: JSON.parse(String(params[14] || '[]')),
                meta: JSON.parse(String(params[15] || '{}')),
                auto_gearchiveerd: Boolean(params[16]),
                afgeleverd_op: null,
                gelezen_op: null,
                aangemaakt_op: 1_763_960_000_000,
                bijgewerkt_op: 1_763_960_000_000,
              }
            : {};
          opgeslagenRijen.push(rij);
          return { rows: [rij], rowCount: 1 };
        }
        if (/UPDATE app\.melding_ecosysteem_gebeurtenissen[\s\S]*SET afgeleverd_op = COALESCE/i.test(sql)) {
          const isGelezenUpdate = /gelezen_op = COALESCE/i.test(sql);
          const uuids = (params[2] as string[]) || [];
          const sleutels = (params[3] as string[]) || [];
          let count = 0;
          for (const r of opgeslagenRijen) {
            if (uuids.includes(String(r.id)) || sleutels.includes(String(r.externe_sleutel))) {
              if (!r.afgeleverd_op) r.afgeleverd_op = 1_763_960_005_000;
              if (isGelezenUpdate) {
                r.gelezen_op = 1_763_960_010_000;
                if (r.status === 'nieuw') r.status = 'gelezen';
              }
              count += 1;
            }
          }
          return { rows: [], rowCount: count };
        }
        if (/COUNT\(\*\)::int AS totaal/i.test(sql)) {
          const wacht = opgeslagenRijen.filter((r) => !r.afgeleverd_op && !r.gelezen_op && r.status !== 'gelezen').length;
          const afg = opgeslagenRijen.filter((r) => r.afgeleverd_op && !r.gelezen_op && r.status !== 'gelezen').length;
          const gel = opgeslagenRijen.filter((r) => r.gelezen_op || r.status === 'gelezen').length;
          const auto = opgeslagenRijen.filter((r) => r.auto_gearchiveerd && !r.gelezen_op && r.status !== 'gelezen').length;
          return {
            rows: [{ totaal: opgeslagenRijen.length, wacht, afgeleverd_ongelezen: afg, gelezen: gel, auto_archief_ongelezen: auto, laatste_aflevering: 1_763_960_005_000 }],
            rowCount: 1,
          };
        }
        if (/SELECT[\s\S]*FROM app\.melding_ecosysteem_gebeurtenissen/i.test(sql)) {
          return { rows: opgeslagenRijen, rowCount: opgeslagenRijen.length };
        }
        return { rows: [], rowCount: 0 };
      },
      release: () => undefined,
    });
    (pg.Pool.prototype as unknown as { query: (sql: string, params?: unknown[]) => Promise<unknown> }).query = async (
      sql: string,
      params: unknown[] = [],
    ) => {
      if (/audit_toevoegen/i.test(sql) && typeof params[2] === 'string') {
        auditActies.push(params[2]);
      }
      return { rows: [], rowCount: 1 };
    };

    const gefilterdCloud = await slaGebeurtenisOp(
      { userId: 'gebruiker-1', ruimte: 'prive' },
      {
        externeSleutel: 'cloud:sync:1',
        kanaal: 'cloud',
        subdomein: 'cloud',
        titel: 'Фонова синхронізація теки',
      },
    );
    const kritiekBev = await slaGebeurtenisOp(
      { userId: 'gebruiker-1', ruimte: 'prive' },
      {
        externeSleutel: 'bev:login:1',
        kanaal: 'beveiliging',
        subdomein: 'id',
        prioriteit: 'kritiek',
        titel: 'Вхід із нового пристрою',
      },
    );

    check(
      '3a вимкнений у профілі некритичний канал одразу зберігається в archief (autoGearchiveerd=true, ⏳ wacht), а безпека залишається активною (nieuw)',
      gefilterdCloud.status === 'archief' &&
        gefilterdCloud.autoGearchiveerd === true &&
        bepaalOntvangstStaat(gefilterdCloud) === 'wacht' &&
        kritiekBev.status === 'nieuw' &&
        kritiekBev.autoGearchiveerd === false,
    );

    const ontRes1 = await bevestigOntvangstEnLezing(
      { userId: 'gebruiker-1', ruimte: 'prive' },
      { afgeleverdIds: ['cloud:sync:1', 'bev:login:1'], gelezenIds: [] },
    );
    const ontRes2 = await bevestigOntvangstEnLezing(
      { userId: 'gebruiker-1', ruimte: 'prive' },
      { afgeleverdIds: [], gelezenIds: ['bev:login:1'] },
    );

    check(
      '3b bevestigOntvangstEnLezing фіксує спершу доставку в панель (✓), потім прочитання (✓✓) і пише аудит owner.meldingen.ecosysteem.ontvangst',
      ontRes1.afgeleverdBijgewerkt === 2 &&
        ontRes2.gelezenBijgewerkt === 1 &&
        opgeslagenRijen[0].status === 'archief' &&
        Boolean(opgeslagenRijen[0].afgeleverd_op) &&
        !opgeslagenRijen[0].gelezen_op &&
        opgeslagenRijen[1].status === 'gelezen' &&
        Boolean(opgeslagenRijen[1].gelezen_op) &&
        auditActies.includes('owner.meldingen.ecosysteem.ontvangst'),
    );

    let geweigerdVoorNietAdmin = false;
    try {
      await leesAfleveringOverzichtVoorBeheer('gewone-gebruiker-zonder-tech', {});
    } catch (e) {
      geweigerdVoorNietAdmin = e instanceof RuimteFout && e.status === 403;
    }
    check(
      '3c адміністративний огляд доставки leesAfleveringOverzichtVoorBeheer суворо блокує не-адміністраторів (403 TECHNISCHE_RUIMTE_VEREIST)',
      geweigerdVoorNietAdmin,
    );
  } finally {
    pg.Pool.prototype.connect = origConnect;
    pg.Pool.prototype.query = origPoolQuery;
    if (oudeDbUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = oudeDbUrl;
  }

  // 4. Візуальне відмальовування компактних капсул, прямих бічних ліній, галочок месенджера та кнопки Розгорнути всі
  nepBrowser('https://hub.tarasevych.com', 'uk');
  const { default: MeldingVeegKaart } = await import('../../src/meldingen/ecosysteem/MeldingVeegKaart');
  const { default: MeldingenPortaal } = await import('../../src/meldingen/ecosysteem/MeldingenPortaal');
  const { default: MeldingAfleveringControle } = await import('../../src/meldingen/ecosysteem/MeldingAfleveringControle');

  const gewoneOngelezenHtml = renderToStaticMarkup(
    createElement(MeldingVeegKaart, {
      lang: 'uk',
      gebeurtenis: afgeleverdOngelezen,
      profiel: std,
      bijlageVoorkeur: std.bijlageWeergave,
      onStatus: () => undefined,
      onOntleden: async () => ({
        aanbieder: 'intern-lokaal',
        modus: 'intern',
        samenvatting: 'Огляд',
        watGebeurde: 'Подія',
        waaromBelangrijk: 'Важливо',
        aanbevolenStappen: [],
        veiligheidsOpmerking: '',
        gegenereerdOp: Date.now(),
      }),
      onOpenBijlageModaal: () => undefined,
    }),
  );

  const gewoneGelezenHtml = renderToStaticMarkup(
    createElement(MeldingVeegKaart, {
      lang: 'uk',
      gebeurtenis: gewoonGelezen,
      profiel: std,
      bijlageVoorkeur: std.bijlageWeergave,
      onStatus: () => undefined,
      onOntleden: async () => ({
        aanbieder: 'intern-lokaal',
        modus: 'intern',
        samenvatting: 'Огляд',
        watGebeurde: 'Подія',
        waaromBelangrijk: 'Важливо',
        aanbevolenStappen: [],
        veiligheidsOpmerking: '',
        gegenereerdOp: Date.now(),
      }),
      onOpenBijlageModaal: () => undefined,
    }),
  );

  const gevaarGeb = maakGeb('bev-gevaar', {
    kanaal: 'beveiliging',
    subdomein: 'id',
    bron: 'beveiliging.nieuw_apparaat',
    prioriteit: 'kritiek',
    status: 'nieuw',
    titel: 'Новий вхід у систему з незнайомого пристрою',
    bericht: 'Перевірте, чи це ваш пристрій.',
    afgeleverdOp: 1500,
  });

  const gevaarKapselHtml = renderToStaticMarkup(
    createElement(MeldingVeegKaart, {
      lang: 'uk',
      gebeurtenis: gevaarGeb,
      profiel: std,
      bijlageVoorkeur: std.bijlageWeergave,
      onStatus: () => undefined,
      onOntleden: async () => ({
        aanbieder: 'intern-lokaal',
        modus: 'intern',
        samenvatting: 'Безпека',
        watGebeurde: 'Вхід',
        waaromBelangrijk: 'Критично',
        aanbevolenStappen: [],
        veiligheidsOpmerking: '',
        gegenereerdOp: Date.now(),
      }),
      onOpenBijlageModaal: () => undefined,
    }),
  );

  const bijlageGeb = maakGeb('claude-bestand', {
    kanaal: 'ai',
    subdomein: 'github',
    bron: 'claude.controle',
    prioriteit: 'normaal',
    status: 'nieuw',
    titel: 'Claude підготував звіт перевірки',
    bijlagen: [
      {
        id: 'b1',
        naam: 'perevirka.xlsx',
        mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        grootteBytes: 4096,
      },
    ],
    meta: { link: 'https://mcp.tarasevych.com' },
    afgeleverdOp: 1600,
  });

  const bijlageKapselHtml = renderToStaticMarkup(
    createElement(MeldingVeegKaart, {
      lang: 'uk',
      gebeurtenis: bijlageGeb,
      profiel: std,
      bijlageVoorkeur: std.bijlageWeergave,
      onStatus: () => undefined,
      onOntleden: async () => ({
        aanbieder: 'intern-lokaal',
        modus: 'intern',
        samenvatting: 'Звіт',
        watGebeurde: 'Файл',
        waaromBelangrijk: 'Готово',
        aanbevolenStappen: [],
        veiligheidsOpmerking: '',
        gegenereerdOp: Date.now(),
      }),
      onOpenBijlageModaal: () => undefined,
    }),
  );

  check(
    '4a звичайна непрочитана капсула згорнута в 1 рядок (data-kapsel-open="0", details hidden, без нижнього ряду кнопок), має is-ongelezen та одну галочку ✓ (afgeleverd)',
    gewoneOngelezenHtml.includes('is-kapsel') &&
      gewoneOngelezenHtml.includes('is-ingeklapt') &&
      gewoneOngelezenHtml.includes('is-ongelezen') &&
      gewoneOngelezenHtml.includes('data-kapsel-open="0"') &&
      gewoneOngelezenHtml.includes('data-ontvangst="afgeleverd"') &&
      /<div class="mel-kaart-details"[^>]*\bhidden\b/.test(gewoneOngelezenHtml) &&
      !gewoneOngelezenHtml.includes('puls-kapsel-onder-rij'),
  );

  check(
    '4b прочитана капсула НЕ має кольорової ознаки is-ongelezen (має is-gelezen, data-kapsel-ongelezen="0") і показує подвійну галочку ✓✓ (gelezen)',
    gewoneGelezenHtml.includes('is-gelezen') &&
      !gewoneGelezenHtml.includes('is-ongelezen') &&
      gewoneGelezenHtml.includes('data-kapsel-ongelezen="0"') &&
      gewoneGelezenHtml.includes('data-ontvangst="gelezen"'),
  );

  check(
    '4c сповіщення безпеки та сповіщення з файлом мають прив’язаний знизу однорядковий блок круглих капсул (puls-kapsel-onder-rij + puls-kapsel-koppeling + heeft-onder-kapsels)',
    gevaarKapselHtml.includes('heeft-onder-kapsels') &&
      gevaarKapselHtml.includes('puls-kapsel-onder-rij') &&
      gevaarKapselHtml.includes('puls-kapsel-koppeling') &&
      gevaarKapselHtml.includes('Це не я') &&
      gevaarKapselHtml.includes('Це я') &&
      bijlageKapselHtml.includes('heeft-onder-kapsels') &&
      bijlageKapselHtml.includes('puls-kapsel-onder-rij') &&
      bijlageKapselHtml.includes('perevirka.xlsx') &&
      bijlageKapselHtml.includes('Відкрити'),
  );

  const profielAutoUitgeklapt = { ...std, standaardUitgeklapt: true };
  const portaalAutoOpenNl = renderToStaticMarkup(
    createElement(MeldingenPortaal, {
      lang: 'nl',
      open: true,
      compactBijBel: true,
      ruimte: 'prive',
      subdomeinNu: 'hub',
      profiel: profielAutoUitgeklapt,
      stroom: [afgeleverdOngelezen, autoArchiefOngelezen],
      laden: false,
      sound: true,
      techTypen: true,
      onSluiten: () => undefined,
      onOpenen: () => undefined,
      onToggleSound: () => undefined,
      onVervers: () => undefined,
      onSlaGeometrieOp: () => undefined,
      onStatusWijzigen: async () => undefined,
      onOntleden: async () => ({
        aanbieder: 'intern-lokaal',
        modus: 'intern',
        samenvatting: 'Samenvatting',
        watGebeurde: 'Gebeurtenis',
        waaromBelangrijk: 'Belang',
        aanbevolenStappen: [],
        veiligheidsOpmerking: '',
        gegenereerdOp: Date.now(),
      }),
      onMarkAll: () => undefined,
      onSwitchToClassic: () => undefined,
    }),
  );

  const controleHtmlUk = renderToStaticMarkup(
    createElement(MeldingAfleveringControle, {
      lang: 'uk',
      ruimte: 'technisch',
      fallbackStroom: [nogNietInPaneel, autoArchiefOngelezen, gewoonGelezen],
    }),
  );

  check(
    '4d MeldingenPortaal містить кнопку «Розгорнути всі / Згорнути всі» (puls-alles-uitklappen) і поважає standaardUitgeklapt=true',
    portaalAutoOpenNl.includes('data-qa-id="puls-alles-uitklappen"') &&
      portaalAutoOpenNl.includes('Alle meldingen inklappen tot capsules') &&
      portaalAutoOpenNl.includes('data-kapsel-open="1"'),
  );

  check(
    '4e MeldingAfleveringControle показує адміністраторові лічильники недоставлених (⏳), доставлених непрочитаних (✓), автоархіву фільтра та прочитаних (✓✓)',
    controleHtmlUk.includes('data-qa-id="puls-aflevering-controle"') &&
      controleHtmlUk.includes('data-teller="wacht"') &&
      controleHtmlUk.includes('data-teller="afgeleverd"') &&
      controleHtmlUk.includes('data-teller="auto-archief"') &&
      controleHtmlUk.includes('data-teller="gelezen"') &&
      controleHtmlUk.includes('автоархів за фільтром'),
  );

  // 5. Кругла форма капсул (border-radius: 999px), однорядкова прив’язка знизу та тонесенька розділювальна смужечка в CSS
  const ecoCss = lees('src/meldingen/ecosysteem/meldingen-ecosysteem.css');
  check(
    '5a CSS капсул задає півкруглі торці border-radius: 999px, пряму внутрішню смужку непрочитаного без гострих кутів, однорядкову прив’язку puls-kapsel-onder-rij (flex-wrap: nowrap) і тонесеньку розділювальну смужечку 1px без !important',
    !ecoCss.includes('!important') &&
      ecoCss.includes('.mel-veeg-kapsel-baan') &&
      ecoCss.includes('.puls-kaart.is-kapsel.is-ongelezen') &&
      ecoCss.includes('.puls-kaart.is-kapsel.is-ongelezen::before') &&
      ecoCss.includes('.puls-kaart.is-kapsel.is-gelezen') &&
      ecoCss.includes('.mel-veeg-houder.heeft-onder-kapsels:not(:last-child)') &&
      ecoCss.includes('.puls-kapsel-onder-rij') &&
      ecoCss.includes('.puls-kapsel-koppeling') &&
      ecoCss.includes('border-radius: 999px;'),
  );

  const vlagMeta = VLAG_UITLEG[MELDING_KAPSEL_AFLEVERING_VLAG];
  const m0340 = lees('migrations/0340_melding_kapsel_aflevering_vlag.sql');
  const m0341 = lees('migrations/0341_melding_kapsel_aflevering_aan.sql');
  const regOverzicht = bouwMeldingRegisterOverzicht('uk');
  check(
    '5b прапорець melding-kapsel-aflevering-v1 (0340+0341) відповідає VLAG-001, коди квитанцій є в ACTIE_LABELS і SITE_RUIS, а onbekendOverig === 0',
    Boolean(vlagMeta) &&
      (['naam', 'wat', 'wanneer', 'gevolg'] as const).every(
        (veld) => vlagMeta[veld][0].length > 0 && vlagMeta[veld][0].length <= 300 && vlagMeta[veld][1].length > 0 && vlagMeta[veld][1].length <= 300,
      ) &&
      /false,\s*false/i.test(m0340) &&
      /ON CONFLICT\s*\(sleutel\)\s*DO NOTHING/i.test(m0340) &&
      /SET\s+aan\s*=\s*true/i.test(m0341) &&
      Boolean(ACTIE_LABELS['owner.meldingen.ecosysteem.ontvangst']) &&
      Boolean(ACTIE_LABELS['owner.meldingen.ecosysteem.aflevering_overzicht']) &&
      SITE_RUIS.test('owner.meldingen.ecosysteem.ontvangst') &&
      SITE_RUIS.test('owner.meldingen.ecosysteem.aflevering_overzicht') &&
      regOverzicht.statistiek.onbekendOverig === 0,
  );

  for (const pad of [
    'shared/meldingen-ecosysteem/model.ts',
    'backend/meldingen-ecosysteem.ts',
    'src/meldingen/puls/PulsVisueelAnker.tsx',
    'src/meldingen/puls/PulsOorzaakKetenKaart.tsx',
    'src/meldingen/ecosysteem/MeldingVeegKaart.tsx',
    'src/meldingen/ecosysteem/MeldingAfleveringControle.tsx',
    'src/meldingen/ecosysteem/MeldingenPortaal.tsx',
    'src/identiteit/melding/MeldingEcosysteemPagina.tsx',
    'migrations/0339_melding_kapsel_aflevering_kolommen.sql',
    'migrations/0340_melding_kapsel_aflevering_vlag.sql',
    'migrations/0341_melding_kapsel_aflevering_aan.sql',
  ]) {
    const inhoud = lees(pad);
    check(`5c мовна чистота (${pad}): відсутні заборонені не-українські літери`, !VERBODEN_LETTERS.test(inhoud));
  }

  // 6. Пропорційна мініатюрна капсула кількості сповіщень (без «×», 18px, 999px): зі звуком / без звуку / прочитане без цифри
  const mailMetHerhaling = maakGeb('g-mail-2', {
    kanaal: 'mail',
    subdomein: 'mail',
    bron: 'mail.inbox',
    status: 'nieuw',
    herhalingen: 2,
    afgeleverdOp: 1500,
  });
  const cloudStilHerhaling = maakGeb('g-cloud-4', {
    kanaal: 'cloud',
    subdomein: 'cloud',
    bron: 'cloud.sync',
    status: 'nieuw',
    herhalingen: 4,
    afgeleverdOp: 1500,
  });
  const aiHerhaling = maakGeb('g-ai-5', {
    kanaal: 'ai',
    subdomein: 'ai',
    bron: 'claude.controle',
    status: 'nieuw',
    herhalingen: 5,
    afgeleverdOp: 1500,
  });
  const gelezenHerhaling = maakGeb('g-gel-3', {
    kanaal: 'mail',
    subdomein: 'mail',
    bron: 'mail.digest',
    status: 'gelezen',
    herhalingen: 3,
    afgeleverdOp: 1200,
    gelezenOp: 1800,
  });

  const nachtDatum = new Date(2026, 10, 24, 1, 15);
  const profielMetStilleUren = {
    ...std,
    stilleUren: { actief: true, van: '23:00', tot: '07:30', kritiekStilOmzeilen: true },
  };
  const typeAiStil = {
    ai: { geluid: false, opduiken: true, tonen: true, vast: false, seconden: 0 },
  };

  check(
    '6a bepaalKapselTellerStaat і isMeldingMetGeluid розрізняють звук каналу, звук типу, режим тиші, загальний звук і ховають цифру на прочитаних',
    bepaalMeldingType(mailMetHerhaling) === 'post' &&
      bepaalMeldingType(aiHerhaling) === 'ai' &&
      bepaalKapselTellerStaat(mailMetHerhaling, { profiel: std, geluidGlobaal: true }).toon === 'geluid' &&
      bepaalKapselTellerStaat(mailMetHerhaling, { profiel: std, geluidGlobaal: true }).aantal === 2 &&
      bepaalKapselTellerStaat(cloudStilHerhaling, { profiel: std, geluidGlobaal: true }).toon === 'stil' &&
      bepaalKapselTellerStaat(aiHerhaling, { profiel: std, geluidGlobaal: true, typeVoorkeuren: typeAiStil }).toon === 'stil' &&
      bepaalKapselTellerStaat(mailMetHerhaling, { profiel: std, geluidGlobaal: false }).toon === 'stil' &&
      bepaalKapselTellerStaat(mailMetHerhaling, { profiel: std, geluidGlobaal: true, nietStorenActief: true }).toon === 'stil' &&
      bepaalKapselTellerStaat(mailMetHerhaling, { profiel: profielMetStilleUren, geluidGlobaal: true, nu: nachtDatum }).toon === 'stil' &&
      isMeldingMetGeluid(gevaarGeb, { profiel: profielMetStilleUren, geluidGlobaal: true, nu: nachtDatum }) === true &&
      bepaalKapselTellerStaat(gelezenHerhaling, { profiel: std, geluidGlobaal: true }).zichtbaar === false,
  );

  const mailGeluidHtml = renderToStaticMarkup(
    createElement(MeldingVeegKaart, {
      lang: 'uk',
      gebeurtenis: mailMetHerhaling,
      profiel: std,
      geluidContext: { profiel: std, geluidGlobaal: true },
      bijlageVoorkeur: std.bijlageWeergave,
      onStatus: () => undefined,
      onOntleden: async () => ({
        bron: 'intern',
        samenvatting: 'Огляд',
        oorzaak: '',
        advies: '',
        aanbevolenActies: [],
        risico: 'normaal',
        opgesteldOp: Date.now(),
        geschoond: true,
      }),
      onOpenBijlageModaal: () => undefined,
    }),
  );

  const aiStilHtml = renderToStaticMarkup(
    createElement(MeldingVeegKaart, {
      lang: 'nl',
      gebeurtenis: aiHerhaling,
      profiel: std,
      geluidContext: { profiel: std, geluidGlobaal: true, typeVoorkeuren: typeAiStil },
      bijlageVoorkeur: std.bijlageWeergave,
      onStatus: () => undefined,
      onOntleden: async () => ({
        bron: 'intern',
        samenvatting: 'Overzicht',
        oorzaak: '',
        advies: '',
        aanbevolenActies: [],
        risico: 'normaal',
        opgesteldOp: Date.now(),
        geschoond: true,
      }),
      onOpenBijlageModaal: () => undefined,
    }),
  );

  const gelezenHerhalingHtml = renderToStaticMarkup(
    createElement(MeldingVeegKaart, {
      lang: 'uk',
      gebeurtenis: gelezenHerhaling,
      profiel: std,
      geluidContext: { profiel: std, geluidGlobaal: true },
      bijlageVoorkeur: std.bijlageWeergave,
      onStatus: () => undefined,
      onOntleden: async () => ({
        bron: 'intern',
        samenvatting: 'Огляд',
        oorzaak: '',
        advies: '',
        aanbevolenActies: [],
        risico: 'normaal',
        opgesteldOp: Date.now(),
        geschoond: true,
      }),
      onOpenBijlageModaal: () => undefined,
    }),
  );

  check(
    '6b MeldingVeegKaart замінює «×N» (.mel-herhaling) на мініатюрну капсулу puls-aantal-kapsel без «×»: кольорову зі звуком, сіру без звуку й без капсули на прочитаних',
    mailGeluidHtml.includes('puls-aantal-kapsel is-met-geluid') &&
      mailGeluidHtml.includes('data-puls-aantal="2"') &&
      mailGeluidHtml.includes('data-puls-geluid="1"') &&
      mailGeluidHtml.includes('>2</span>') &&
      !mailGeluidHtml.includes('mel-herhaling') &&
      !mailGeluidHtml.includes('×2') &&
      aiStilHtml.includes('puls-aantal-kapsel is-stil') &&
      aiStilHtml.includes('data-puls-aantal="5"') &&
      aiStilHtml.includes('data-puls-geluid="0"') &&
      aiStilHtml.includes('>5</span>') &&
      !aiStilHtml.includes('mel-herhaling') &&
      !gelezenHerhalingHtml.includes('puls-aantal-kapsel') &&
      !gelezenHerhalingHtml.includes('mel-herhaling'),
  );

  const { default: PulsOorzaakKetenKaart } = await import('../../src/meldingen/puls/PulsOorzaakKetenKaart');
  const ketenStil1 = maakGeb('k-1', { kanaal: 'cloud', subdomein: 'cloud', bron: 'cloud.oauth', status: 'nieuw', titel: 'Google Диск' });
  const ketenStil2 = maakGeb('k-2', { kanaal: 'github', subdomein: 'github', bron: 'github.oauth', status: 'nieuw', titel: 'GitHub' });
  const ketenGel1 = maakGeb('k-g1', { kanaal: 'mail', subdomein: 'mail', bron: 'gmail.oauth', status: 'gelezen', gelezenOp: 2000, titel: 'Пошта' });
  const ketenGel2 = maakGeb('k-g2', { kanaal: 'cloud', subdomein: 'cloud', bron: 'drive.oauth', status: 'gelezen', gelezenOp: 2000, titel: 'Диск' });

  const ketenStilHtml = renderToStaticMarkup(
    createElement(PulsOorzaakKetenKaart, {
      lang: 'uk',
      keten: {
        sleutel: 'aanbieder:google',
        wortel: ketenStil1,
        wortelTitel: 'Потрібне відновлення входу Google',
        samenvatting: '2 служби',
        gevolgen: [],
        alleIds: ['k-1', 'k-2'],
      },
      geluidContext: { profiel: std, geluidGlobaal: true },
      onSelect: () => undefined,
      onHerstelKeten: () => undefined,
      renderLosseKaart: () => null,
      alleGebeurtenissenMap: new Map([
        ['k-1', ketenStil1],
        ['k-2', ketenStil2],
      ]),
    }),
  );

  const ketenGelezenHtml = renderToStaticMarkup(
    createElement(PulsOorzaakKetenKaart, {
      lang: 'uk',
      keten: {
        sleutel: 'aanbieder:google',
        wortel: ketenGel1,
        wortelTitel: 'Вхід Google уже відновлено',
        samenvatting: '2 служби',
        gevolgen: [],
        alleIds: ['k-g1', 'k-g2'],
      },
      geluidContext: { profiel: std, geluidGlobaal: true },
      onSelect: () => undefined,
      onHerstelKeten: () => undefined,
      renderLosseKaart: () => null,
      alleGebeurtenissenMap: new Map([
        ['k-g1', ketenGel1],
        ['k-g2', ketenGel2],
      ]),
    }),
  );

  check(
    '6c PulsOorzaakKetenKaart показує мініатюрну капсулу кількості без «×» (сіру для тихого ланцюжка) і прибирає її для прочитаного ланцюжка',
    ketenStilHtml.includes('puls-aantal-kapsel is-stil') &&
      ketenStilHtml.includes('data-puls-aantal="2"') &&
      ketenStilHtml.includes('>2</span>') &&
      !ketenStilHtml.includes('mel-herhaling') &&
      !ketenStilHtml.includes('×2') &&
      !ketenGelezenHtml.includes('puls-aantal-kapsel') &&
      !ketenGelezenHtml.includes('mel-herhaling'),
  );

  check(
    '6d CSS .puls-aantal-kapsel задає висоту 18px, border-radius 999px та оформлення .is-met-geluid і .is-stil без !important',
    !ecoCss.includes('!important') &&
      ecoCss.includes('.puls-aantal-kapsel {') &&
      ecoCss.includes('height: 18px;') &&
      ecoCss.includes('.puls-aantal-kapsel.is-met-geluid') &&
      ecoCss.includes('.puls-aantal-kapsel.is-stil'),
  );

  return einde();
}
