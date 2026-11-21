// KLIMOP-014 (21.11.2026, Етап 13 впровадження «Плюща» у платформу «Мій простір»):
// Визначення трьох технічних інструментів MCP екосистеми «Плющ» (kant 'beheer', технічний простір власника, З'єднувач v2).
// Чистий модуль без бази даних: використовується каталогом З'єднувача v2 та перевірками двомовності для всіх 14 ШІ-агентів.

import type { ToolDef } from './connectors-hulpmiddelen';
import { p } from '../shared/hulpmiddel-teksten';
import { KLIMOP_ELF_DIENSTEN } from '../shared/klimop/diensten';
import { KLIMOP_ZESTIEN_ONTWIKKELRICHTINGEN } from '../shared/klimop/zaden';
import { KLIMOP_TOOL_NAMEN } from '../shared/klimop-overzicht-model';

export const KLIMOP_OVERZICHT = 'klimop_overzicht';
export const KLIMOP_ARCHITECTUUR_TOETS = 'klimop_architectuur_toets';
export const KLIMOP_SPIEGEL_CONTROLE = 'klimop_spiegel_controle';

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
]);

export const KLIMOP_TOOL_SET: ReadonlySet<string> = new Set(KLIMOP_TOOL_NAMEN);

export const klimopToolNamenGelijk = (): boolean =>
  KLIMOP_TOOLS.length === KLIMOP_TOOL_NAMEN.length
  && KLIMOP_TOOLS.every((t) => KLIMOP_TOOL_SET.has(t.name));
