// Спільне чисте ядро для наскрізних задач та безперервного переходу між сесіями і 13 ШІ-агентами.
// Без Node, без DOM: використовується сервером, браузером, MCP-інструментами та тестами.
import type { AiRuimte } from '../ai-ruimte';
import {
  bevatGevoeligGeheim,
  filterGeheimePatronen,
  GEHEUGEN_FOUTEN,
  normaliseerGeheugenSleutel,
  type GeheugenSoort,
} from './model';
import type { BerichtSoort, BestandsVerwijzing, BezorgingStatus } from './bots';

export const TAAK_STATUSSEN = [
  'open',
  'bezig',
  'wacht_op_eigenaar',
  'klaar',
  'gepauzeerd',
  'geannuleerd',
] as const;
export type TaakStatus = typeof TAAK_STATUSSEN[number];

export const TAAK_PRIORITEITEN = ['laag', 'normaal', 'hoog', 'kritiek'] as const;
export type TaakPrioriteit = typeof TAAK_PRIORITEITEN[number];

export const TAAK_STAP_SOORTEN = [
  'aangemaakt',
  'voortgang',
  'overdracht',
  'besluit',
  'bewijs',
  'pauze',
  'afgerond',
] as const;
export type TaakStapSoort = typeof TAAK_STAP_SOORTEN[number];

export const TAAK_STATUS_META: Readonly<Record<TaakStatus, { uk: string; nl: string; kleur: 'neutraal' | 'actief' | 'waarschuwing' | 'succes' | 'uit' }>> = Object.freeze({
  open: { uk: 'Відкрита', nl: 'Open', kleur: 'neutraal' },
  bezig: { uk: 'У роботі', nl: 'In uitvoering', kleur: 'actief' },
  wacht_op_eigenaar: { uk: 'Чекає власника', nl: 'Wacht op eigenaar', kleur: 'waarschuwing' },
  klaar: { uk: 'Виконано', nl: 'Klaar', kleur: 'succes' },
  gepauzeerd: { uk: 'На паузі', nl: 'Gepauzeerd', kleur: 'uit' },
  geannuleerd: { uk: 'Скасовано', nl: 'Geannuleerd', kleur: 'uit' },
});

export const TAAK_PRIORITEIT_META: Readonly<Record<TaakPrioriteit, { uk: string; nl: string }>> = Object.freeze({
  laag: { uk: 'Низький', nl: 'Laag' },
  normaal: { uk: 'Звичайний', nl: 'Normaal' },
  hoog: { uk: 'Високий', nl: 'Hoog' },
  kritiek: { uk: 'Критичний', nl: 'Kritiek' },
});

export const TAAK_STAP_SOORT_META: Readonly<Record<TaakStapSoort, { uk: string; nl: string }>> = Object.freeze({
  aangemaakt: { uk: 'Створено задачу', nl: 'Taak aangemaakt' },
  voortgang: { uk: 'Крок виконання', nl: 'Voortgangsstap' },
  overdracht: { uk: 'Передача естафети', nl: 'Overdracht naar volgende agent/sessie' },
  besluit: { uk: 'Зафіксовано рішення', nl: 'Besluit vastgelegd' },
  bewijs: { uk: 'Додано доказ перевірки', nl: 'Verificatiebewijs toegevoegd' },
  pauze: { uk: 'Призупинено', nl: 'Gepauzeerd' },
  afgerond: { uk: 'Завершено', nl: 'Afgerond' },
});

export const TAAK_FOUTEN = {
  ...GEHEUGEN_FOUTEN,
  taakNietGevonden: 'TAAK_NIET_GEVONDEN',
  taakSleutelOngeldig: 'TAAK_SLEUTEL_ONGELDIG',
  titelVereist: 'TAAK_TITEL_VEREIST',
  samenvattingVereist: 'TAAK_SAMENVATTING_VEREIST',
  doelAgentVereist: 'TAAK_DOEL_AGENT_VEREIST',
  afstemmingNietGevonden: 'AFSTEMMING_KAART_NIET_GEVONDEN',
} as const;

export const TAAK_FOUT_UITLEG: Readonly<Record<string, { uk: string; nl: string }>> = Object.freeze({
  [TAAK_FOUTEN.taakNietGevonden]: {
    uk: 'Задачу з таким ключем не знайдено в поточному просторі.',
    nl: 'Geen taak met deze sleutel gevonden in de huidige ruimte.',
  },
  [TAAK_FOUTEN.taakSleutelOngeldig]: {
    uk: 'Ключ задачі має містити 2–120 символів: літери, цифри, «.», «_», «:» або «-».',
    nl: 'De taaksleutel moet 2–120 tekens bevatten: letters, cijfers, «.», «_», «:» of «-».',
  },
  [TAAK_FOUTEN.titelVereist]: {
    uk: 'Назва задачі обов’язкова (1–240 символів).',
    nl: 'De titel van de taak is verplicht (1–240 tekens).',
  },
  [TAAK_FOUTEN.samenvattingVereist]: {
    uk: 'Короткий підсумок кроку чи передачі не може бути порожнім.',
    nl: 'De samenvatting van de stap of overdracht mag niet leeg zijn.',
  },
  [TAAK_FOUTEN.doelAgentVereist]: {
    uk: 'Укажіть код агента або нової сесії, якому передається задача.',
    nl: 'Geef de code op van de agent of nieuwe sessie waaraan de taak wordt overgedragen.',
  },
  [TAAK_FOUTEN.afstemmingNietGevonden]: {
    uk: 'Картку узгодження (afstemming) з таким ідентифікатором не знайдено для вашого облікового запису.',
    nl: 'Geen afstemmingskaart met dit ID gevonden voor uw account.',
  },
});

export interface GeheugenTaak {
  id: string;
  userId: string;
  ruimte: AiRuimte;
  taakSleutel: string;
  titel: string;
  doel: string;
  status: TaakStatus;
  prioriteit: TaakPrioriteit;
  huidigeAgent: string;
  laatsteKnoopId: string | null;
  laatsteBezorgingId: string | null;
  afstemmingKaartId: string;
  afstemmingExternId: string;
  geheugenSleutels: string[];
  eigenaarVereist: boolean;
  aangemaaktOp: number;
  bijgewerktOp: number;
}

export interface GeheugenTaakStap {
  id: string;
  userId: string;
  ruimte: AiRuimte;
  taakId: string;
  stapSoort: TaakStapSoort;
  vanAgent: string;
  naarAgent: string;
  samenvatting: string;
  knoopId: string | null;
  bezorgingId: string | null;
  bestandsVerwijzingen: BestandsVerwijzing[];
  aangemaaktOp: number;
}

export interface GeheugenKnoopVerwijzing {
  id: string;
  sleutel: string;
  soort: GeheugenSoort;
  titel: string;
  samenvatting: string;
  bronAgent: string;
  bijgewerktOp: number;
}

export interface TaakBezorgingVerwijzing {
  id: string;
  agentSlug: string;
  soortBericht: BerichtSoort;
  status: BezorgingStatus;
  titel: string;
  telegramBerichtId: number | null;
  aangemaaktOp: number;
}

export interface GeheugenTaakPakket {
  taak: GeheugenTaak;
  stappen: GeheugenTaakStap[];
  geheugenKnopen: GeheugenKnoopVerwijzing[];
  bezorgingen: TaakBezorgingVerwijzing[];
  overdrachtPromptUk: string;
  overdrachtPromptNl: string;
}

export interface TaakOpslaanInvoer {
  taakSleutel: string;
  titel: string;
  doel?: string;
  status?: TaakStatus;
  prioriteit?: TaakPrioriteit;
  huidigeAgent?: string;
  afstemmingKaartId?: string;
  afstemmingExternId?: string;
  geheugenSleutels?: string[];
  eigenaarVereist?: boolean;
  laatsteKnoopId?: string | null;
  eersteSamenvatting?: string;
}

export interface TaakStapToevoegenInvoer {
  taakSleutel: string;
  stapSoort?: TaakStapSoort;
  vanAgent?: string;
  naarAgent?: string;
  samenvatting: string;
  status?: TaakStatus;
  knoopId?: string | null;
  bezorgingId?: string | null;
  bestandsVerwijzingen?: BestandsVerwijzing[];
}

export interface TaakOverdragenInvoer {
  taakSleutel: string;
  titel?: string;
  doel?: string;
  vanAgent?: string;
  naarAgent: string;
  samenvatting: string;
  status?: TaakStatus;
  prioriteit?: TaakPrioriteit;
  knoopId?: string | null;
  bewaarInStroom?: boolean;
  ookBezorgen?: boolean;
  geheugenSleutels?: string[];
  afstemmingKaartId?: string;
  afstemmingExternId?: string;
  bestandsVerwijzingen?: BestandsVerwijzing[];
  sessieId?: string;
}

const TAAK_SLEUTEL_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{1,119}$/;
const AGENT_CODE_RE = /^[a-z0-9][a-z0-9._:-]{1,47}$/;

export function schoonTaakSleutel(rauw: unknown): string {
  const s = String(rauw ?? '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^A-Za-z0-9._:-]+/g, '')
    .replace(/^[^A-Za-z0-9]+/, '')
    .slice(0, 120);
  return TAAK_SLEUTEL_RE.test(s) ? s : '';
}

export function schoonAgentCode(rauw: unknown): string {
  const s = String(rauw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._:-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return AGENT_CODE_RE.test(s) ? s : '';
}

export function schoonTaakStatus(rauw: unknown, standaard: TaakStatus = 'open'): TaakStatus {
  return (TAAK_STATUSSEN as readonly string[]).includes(String(rauw)) ? (rauw as TaakStatus) : standaard;
}

export function schoonTaakPrioriteit(rauw: unknown, standaard: TaakPrioriteit = 'normaal'): TaakPrioriteit {
  return (TAAK_PRIORITEITEN as readonly string[]).includes(String(rauw)) ? (rauw as TaakPrioriteit) : standaard;
}

export function schoonTaakStapSoort(rauw: unknown, standaard: TaakStapSoort = 'voortgang'): TaakStapSoort {
  return (TAAK_STAP_SOORTEN as readonly string[]).includes(String(rauw)) ? (rauw as TaakStapSoort) : standaard;
}

export function schoonGeheugenSleutelsLijst(rauw: unknown): string[] {
  if (!Array.isArray(rauw)) return [];
  const gezien = new Set<string>();
  const uit: string[] = [];
  for (const item of rauw) {
    const s = normaliseerGeheugenSleutel(String(item ?? ''));
    if (!s || gezien.has(s)) continue;
    gezien.add(s);
    uit.push(s);
    if (uit.length >= 64) break;
  }
  return uit;
}

export function schoonTaakBestanden(rauw: unknown): { ok: true; waarde: BestandsVerwijzing[] } | { ok: false; code: string } {
  if (!Array.isArray(rauw)) return { ok: true, waarde: [] };
  const uit: BestandsVerwijzing[] = [];
  for (const r of rauw.slice(0, 24)) {
    if (!r || typeof r !== 'object') continue;
    const obj = r as Record<string, unknown>;
    const naam = String(obj.naam ?? obj.pad ?? '').trim().slice(0, 140);
    const regel = Number.isFinite(Number(obj.regel)) && Number(obj.regel) > 0 ? Math.floor(Number(obj.regel)) : undefined;
    const toelichting = String(obj.toelichting ?? '').trim().slice(0, 200);
    const rawVerwijzing = String(obj.verwijzing ?? '').trim();
    const fallbackVerwijzing = [
      String(obj.pad ?? naam).trim(),
      regel ? `:${regel}` : '',
      toelichting ? ` (${toelichting})` : '',
    ].join('').trim();
    const verwijzing = (rawVerwijzing || fallbackVerwijzing).slice(0, 320);
    if (!naam || !verwijzing) continue;
    if (bevatGevoeligGeheim(naam) || bevatGevoeligGeheim(verwijzing) || bevatGevoeligGeheim(toelichting)) {
      return { ok: false, code: TAAK_FOUTEN.geheimGeweigerd };
    }
    const sha256 = typeof obj.sha256 === 'string' && /^[a-f0-9]{64}$/i.test(obj.sha256.trim())
      ? obj.sha256.trim().toLowerCase()
      : undefined;
    const grootte = Number.isFinite(Number(obj.grootte)) && Number(obj.grootte) >= 0
      ? Math.floor(Number(obj.grootte))
      : undefined;
    uit.push({
      naam,
      verwijzing,
      ...(sha256 ? { sha256 } : {}),
      ...(grootte !== undefined ? { grootte } : {}),
    });
  }
  return { ok: true, waarde: uit };
}

export function bouwTaakOverdrachtPrompt(
  pakket: Pick<GeheugenTaakPakket, 'taak' | 'stappen' | 'geheugenKnopen'>,
  taal: 'uk' | 'nl',
  doelAgent?: string,
): string {
  const { taak, stappen, geheugenKnopen } = pakket;
  const doelWie = doelAgent || taak.huidigeAgent || (taal === 'uk' ? 'наступний агент' : 'volgende agent');
  const statusTekst = TAAK_STATUS_META[taak.status][taal];
  const prioTekst = TAAK_PRIORITEIT_META[taak.prioriteit][taal];

  const regels: string[] = taal === 'uk'
    ? [
        `[Передача задачі Mijn Ruimte → ${doelWie}]`,
        `Ключ задачі: ${taak.taakSleutel} | Простір: ${taak.ruimte} | Статус: ${statusTekst} | Пріоритет: ${prioTekst}`,
        `Назва: ${taak.titel}`,
        taak.doel ? `Ціль: ${taak.doel}` : '',
        taak.afstemmingExternId || taak.afstemmingKaartId
          ? `Картка узгодження: ${taak.afstemmingExternId || taak.afstemmingKaartId}`
          : '',
      ]
    : [
        `[Taakoverdracht Mijn Ruimte → ${doelWie}]`,
        `Taaksleutel: ${taak.taakSleutel} | Ruimte: ${taak.ruimte} | Status: ${statusTekst} | Prioriteit: ${prioTekst}`,
        `Titel: ${taak.titel}`,
        taak.doel ? `Doel: ${taak.doel}` : '',
        taak.afstemmingExternId || taak.afstemmingKaartId
          ? `Afstemmingskaart: ${taak.afstemmingExternId || taak.afstemmingKaartId}`
          : '',
      ];

  if (stappen.length > 0) {
    regels.push(taal === 'uk' ? 'Останні кроки естафети:' : 'Recente overdrachtsstappen:');
    for (const st of stappen.slice(0, 5)) {
      const soortTxt = TAAK_STAP_SOORT_META[st.stapSoort][taal];
      const wie = [st.vanAgent, st.naarAgent].filter(Boolean).join(' → ');
      const bestanden = st.bestandsVerwijzingen.map((b) => (b.verwijzing && b.verwijzing !== b.naam ? `${b.naam} → ${b.verwijzing}` : b.naam)).join(', ');
      regels.push(
        `• [${soortTxt}${wie ? ` · ${wie}` : ''}] ${st.samenvatting}${bestanden ? ` (${bestanden})` : ''}`,
      );
    }
  }

  if (geheugenKnopen.length > 0) {
    regels.push(taal === 'uk' ? 'Пов’язані вузли Стріму пам’яті:' : 'Gekoppelde knopen in de Stroom van geheugen:');
    for (const k of geheugenKnopen.slice(0, 6)) {
      regels.push(`• ${k.sleutel} (${k.soort}): ${k.titel}${k.samenvatting ? ` — ${k.samenvatting}` : ''}`);
    }
  } else if (taak.geheugenSleutels.length > 0) {
    regels.push(
      taal === 'uk'
        ? `Ключі вузлів пам’яті: ${taak.geheugenSleutels.join(', ')}`
        : `Sleutels van geheugenknopen: ${taak.geheugenSleutels.join(', ')}`,
    );
  }

  regels.push(
    taal === 'uk'
      ? `Дія для продовження: викличте geheugen_taak_lezen(taak_sleutel="${taak.taakSleutel}") і geheugen_stroom_zoeken, щоб підхопити живий стан без повтору виконаного.`
      : `Vervolgactie: roep geheugen_taak_lezen(taak_sleutel="${taak.taakSleutel}") en geheugen_stroom_zoeken aan om zonder dubbel werk verder te gaan.`,
  );

  return filterGeheimePatronen(regels.filter(Boolean).join('\n'));
}
