// KLIMOP-014 / KLIMOP-015 / KLIMOP-016 / KLIMOP-017 (21.11.2026, Етапи 13–16 впровадження «Плюща» у платформу «Мій простір»):
// Визначення дев'яти технічних інструментів MCP екосистеми «Плющ» (kant 'beheer', технічний простір власника, З'єднувач v2).
// Чистий модуль без бази даних: використовується каталогом З'єднувача v2 та перевірками двомовності для всіх 14 ШІ-агентів.

import type { ToolDef } from './connectors-hulpmiddelen';
import { p } from '../shared/hulpmiddel-teksten';
import { KLIMOP_ELF_DIENSTEN } from '../shared/klimop/diensten';
import { KLIMOP_ZESTIEN_ONTWIKKELRICHTINGEN } from '../shared/klimop/zaden';
import {
  KLIMOP_GESIMULEERDE_AFWIJKINGEN,
  KLIMOP_GESIMULEERDE_ATTEST_FOUTEN,
  KLIMOP_GESIMULEERDE_DUBBEL_FOUTEN,
  KLIMOP_TOOL_NAMEN,
} from '../shared/klimop-overzicht-model';

export const KLIMOP_OVERZICHT = 'klimop_overzicht';
export const KLIMOP_ARCHITECTUUR_TOETS = 'klimop_architectuur_toets';
export const KLIMOP_SPIEGEL_CONTROLE = 'klimop_spiegel_controle';
export const KLIMOP_PASSIEVE_SPIEGEL = 'klimop_passieve_spiegel';
export const KLIMOP_SPIEGEL_LOGBOEK = 'klimop_spiegel_logboek';
export const KLIMOP_DUBBEL_SCHRIJVEN = 'klimop_dubbel_schrijven';
export const KLIMOP_DUBBEL_LOGBOEK = 'klimop_dubbel_logboek';
export const KLIMOP_QUORUM_ATTEST = 'klimop_quorum_attest';
export const KLIMOP_QUORUM_LOGBOEK = 'klimop_quorum_logboek';

export const KLIMOP_TOOLS: readonly ToolDef[] = Object.freeze([
  {
    name: KLIMOP_OVERZICHT,
    title: 'Overzicht van ecosysteem Klimop',
    description:
      'Geeft de actuele integriteitsstaat van het ecosysteem Klimop: SHA-256-afdrukken van alle twaalf kernmodules, de Merkle-wortel van het Zaadpakket, de twaalf pijlers van hoofdstuk 46, het onderwerpdossier en de overdrachtsstatus van alle elf diensten zonder wijziging van de draaiende databank.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: KLIMOP_ARCHITECTUUR_TOETS,
    title: 'Architectuurvoorstel toetsen aan Klimop',
    description:
      'Toetst een voorgestelde wijziging aan de vijftien verplichte controlevragen van hoofdstuk 42, de veertien verboden vereenvoudigingen van hoofdstuk 43 en de grenzen voor AI-agenten uit hoofdstukken 33 en 34. Voert nooit zelf een wijziging door.',
    inputSchema: {
      type: 'object',
      properties: {
        naam: {
          type: 'string',
          description: p(
            'Коротка назва запропонованої зміни (до 200 знаків).',
            'Korte naam van de voorgestelde wijziging (hoogstens 200 tekens).',
          ),
        },
        fase: {
          type: 'integer',
          minimum: 0,
          maximum: 12,
          description: p(
            'Номер етапу від 0 до 12 за архітектурним маніфестом.',
            'Volgnummer van de fase van 0 tot 12 volgens het architectuurmanifest.',
          ),
        },
        richting: {
          type: 'string',
          enum: [...KLIMOP_ZESTIEN_ONTWIKKELRICHTINGEN],
          description: p(
            'Спеціалізований напрям розробки з шістнадцяти напрямів розділу 33.',
            'Gespecialiseerde ontwikkelrichting uit de zestien richtingen van hoofdstuk 33.',
          ),
        },
        raaktProductieDirectZonderGoedkeuring: {
          type: 'boolean',
          description: p(
            'Чи торкається пропозиція живої робочої інфраструктури без прямого дозволу власника.',
            'Of het voorstel de draaiende productieomgeving rechtstreeks raakt zonder eigenaarstoestemming.',
          ),
        },
        probeertZelfGoedTeKeurenOfUitTeRollen: {
          type: 'boolean',
          description: p(
            'Чи намагається агент самостійно схвалити або розгорнути зміну в обхід людини чи кворуму.',
            'Of de agent zelfstandig poogt goed te keuren of uit te rollen buiten mens of quorum om.',
          ),
        },
        gebruikStandaardBewijsVoorOntbrekendeVragen: {
          type: 'boolean',
          description: p(
            'Чи заповнити непередані з п’ятнадцяти питань типовим доказом базових модулів.',
            'Of ontbrekende van de vijftien controlevragen met het standaardbewijs van de kernmodules worden aangevuld.',
          ),
        },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: KLIMOP_SPIEGEL_CONTROLE,
    title: 'Spiegelverificatie van dienst testen',
    description:
      'Voert in geïsoleerd geheugen een risicoloze cryptografische spiegelverificatie (Stap 1 van hoofdstuk 35) uit voor een van de elf diensten: dienstpseudoniem, Reed-Solomon-herstel (4+2) na uitval van twee stroken, ondertekende samenvoeging en kruisdienstisolatie zonder aanraking van de databank.',
    inputSchema: {
      type: 'object',
      properties: {
        dienstId: {
          type: 'string',
          enum: [...KLIMOP_ELF_DIENSTEN],
          description: p(
            'Ідентифікатор однієї з одинадцяти служб платформи для дзеркальної криптографічної перевірки.',
            'Aanduiding van een van de elf diensten van het platform voor cryptografische spiegelverificatie.',
          ),
        },
      },
      required: ['dienstId'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: KLIMOP_PASSIEVE_SPIEGEL,
    title: 'Passieve spiegelverificatie van dienst uitvoeren',
    description:
      'Voert een meervoudige passieve leesproef van Stap 2 (hoofdstuk 35) uit voor een gekozen dienst, legt uitsluitend geanonimiseerde controle-afdrukken in het spiegellogboek vast en zet de dienst bij elke vastgestelde afwijking automatisch terug naar de bestaande basis.',
    inputSchema: {
      type: 'object',
      properties: {
        dienstId: {
          type: 'string',
          enum: [...KLIMOP_ELF_DIENSTEN],
          description: p(
            'Ідентифікатор однієї з одинадцяти служб платформи для пасивної багатоелементної звірки читання.',
            'Aanduiding van een van de elf platformdiensten voor de meervoudige passieve leesproef.',
          ),
        },
        steekproefGrootte: {
          type: 'integer',
          minimum: 2,
          maximum: 12,
          description: p(
            'Кількість штучних елементів вибірки від 2 до 12 для пасивної криптографічної звірки.',
            'Aantal kunstmatige proefelementen van 2 tot 12 voor de passieve cryptografische controle.',
          ),
        },
        simuleerAfwijking: {
          type: 'string',
          enum: [...KLIMOP_GESIMULEERDE_AFWIJKINGEN],
          description: p(
            'Необов’язковий вид штучної розбіжності для перевірки автоматичного повернення на чинну основу.',
            'Optioneel soort gesimuleerde afwijking om de automatische terugschakeling naar de basis te beproeven.',
          ),
        },
      },
      required: ['dienstId'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: KLIMOP_SPIEGEL_LOGBOEK,
    title: 'Spiegellogboek en overdrachtsschakelaars lezen',
    description:
      'Leest de actuele stand van de elf overdrachtsschakelaars, verifieert de volledige SHA-256-keten van het afwijkingslogboek en geeft de meest recente geanonimiseerde controleregels terug zonder de schakelstand te wijzigen.',
    inputSchema: {
      type: 'object',
      properties: {
        dienstId: {
          type: 'string',
          enum: [...KLIMOP_ELF_DIENSTEN],
          description: p(
            'Необов’язковий фільтр за однією з одинадцяти служб платформи.',
            'Optioneel filter op een van de elf diensten van het platform.',
          ),
        },
        limiet: {
          type: 'integer',
          minimum: 1,
          maximum: 200,
          description: p(
            'Найбільша кількість останніх записів журналу дзеркальної звірки від 1 до 200.',
            'Hoogste aantal recente regels uit het spiegellogboek van 1 tot 200.',
          ),
        },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: KLIMOP_DUBBEL_SCHRIJVEN,
    title: 'Gecontroleerd dubbel schrijven met leesverificatie testen',
    description:
      'Voert in een geïsoleerde proefomgeving gecontroleerd dubbel schrijven van Stap 3 (hoofdstuk 35) uit op drie onafhankelijke knooppunten met aanmaken, bijwerken en verwijdermarkeringen, toetst leesgelijkheid en zet de dienst bij elke fout automatisch terug naar de basis.',
    inputSchema: {
      type: 'object',
      properties: {
        dienstId: {
          type: 'string',
          enum: [...KLIMOP_ELF_DIENSTEN],
          description: p(
            'Ідентифікатор однієї з одинадцяти служб платформи для перевірки подвійного записування зі звіркою читання.',
            'Aanduiding van een van de elf platformdiensten voor de proef van dubbel schrijven met leesverificatie.',
          ),
        },
        operatiesAantal: {
          type: 'integer',
          minimum: 3,
          maximum: 12,
          description: p(
            'Кількість послідовних операцій створення, оновлення та видалення від 3 до 12.',
            'Aantal opeenvolgende bewerkingen voor aanmaken, bijwerken en wissen van 3 tot 12.',
          ),
        },
        simuleerFout: {
          type: 'string',
          enum: [...KLIMOP_GESIMULEERDE_DUBBEL_FOUTEN],
          description: p(
            'Необов’язковий вид штучного збою подвійного записування або звірки читання для перевірки автоповернення.',
            'Optioneel soort gesimuleerde schrijffout of leesafwijking om de automatische terugval te beproeven.',
          ),
        },
      },
      required: ['dienstId'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: KLIMOP_DUBBEL_LOGBOEK,
    title: 'Kwitantielogboek van dubbel schrijven lezen',
    description:
      'Leest de meest recente geanonimiseerde kwitanties van gecontroleerd dubbel schrijven (Stap 3), verifieert de SHA-256-keten en geeft de samenvatting terug zonder schakelrechten voor de AI.',
    inputSchema: {
      type: 'object',
      properties: {
        dienstId: {
          type: 'string',
          enum: [...KLIMOP_ELF_DIENSTEN],
          description: p(
            'Необов’язковий фільтр квитанцій подвійного записування за однією з одинадцяти служб.',
            'Optioneel filter voor kwitanties van dubbel schrijven op een van de elf diensten.',
          ),
        },
        limiet: {
          type: 'integer',
          minimum: 1,
          maximum: 200,
          description: p(
            'Найбільша кількість останніх квитанцій подвійного записування від 1 до 200.',
            'Hoogste aantal recente kwitanties van dubbel schrijven van 1 tot 200.',
          ),
        },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: KLIMOP_QUORUM_ATTEST,
    title: 'Quorumattest van gereedheid voor Stap 4 testen',
    description:
      'Stelt in een afgeschermde proefomgeving een cryptografisch quorumattest van Stap 4 (hoofdstuk 35) op over drie onafhankelijke knooppunten met twee-uit-drie drempelhandtekening en hybride postkwantumhandtekening zonder uitschakeling van de databank.',
    inputSchema: {
      type: 'object',
      properties: {
        dienstId: {
          type: 'string',
          enum: [...KLIMOP_ELF_DIENSTEN],
          description: p(
            'Ідентифікатор однієї з одинадцяти служб платформи для формування та перевірки кворумного атестата.',
            'Aanduiding van een van de elf platformdiensten voor opstelling en toetsing van het quorumattest.',
          ),
        },
        simuleerFout: {
          type: 'string',
          enum: [...KLIMOP_GESIMULEERDE_ATTEST_FOUTEN],
          description: p(
            'Необов’язковий вид штучного збою порогової частки, постквантового підпису або незалежності вузлів.',
            'Optioneel soort gesimuleerde fout van een drempeldeel, postkwantumhandtekening of knooppuntonafhankelijkheid.',
          ),
        },
      },
      required: ['dienstId'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: KLIMOP_QUORUM_LOGBOEK,
    title: 'Quorumattestlogboek en keten lezen',
    description:
      'Leest het logboek van quorumattesten van Stap 4, herverifieert de SHA-256-keten én beide cryptografische handtekeningen van elk geldig attest en geeft de samenvatting terug zonder schakelrechten.',
    inputSchema: {
      type: 'object',
      properties: {
        dienstId: {
          type: 'string',
          enum: [...KLIMOP_ELF_DIENSTEN],
          description: p(
            'Необов’язковий фільтр кворумних атестатів за однією з одинадцяти служб платформи.',
            'Optioneel filter voor quorumattesten op een van de elf diensten van het platform.',
          ),
        },
        limiet: {
          type: 'integer',
          minimum: 1,
          maximum: 200,
          description: p(
            'Найбільша кількість останніх кворумних атестатів від 1 до 200.',
            'Hoogste aantal recente quorumattesten van 1 tot 200.',
          ),
        },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
]);

export const KLIMOP_TOOL_SET: ReadonlySet<string> = new Set(KLIMOP_TOOL_NAMEN);

export const klimopToolNamenGelijk = (): boolean =>
  KLIMOP_TOOLS.length === KLIMOP_TOOL_NAMEN.length
  && KLIMOP_TOOLS.every((t) => KLIMOP_TOOL_SET.has(t.name));
