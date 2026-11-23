// CONSOL-001 / Віха M3 (23.11.2026): захищені серверні міжслужбові мости Пошти.
// Дозволяє користувачеві з відкритого листа або вкладення створити нотатку (notities-vnext), завдання простору / перехід до звірки
// (mcp_console_items / afstemming), подію календаря (agenda) або відкрити / створити картку клієнта (klantrelatiebeheer)
// без витоку приватного вмісту листа в рядок адреси та з суворою ізоляцією просторів prive / technisch під FORCE RLS.
// Beveiligde dienstbruggen vanuit Post met strikte ruimtescheiding, herhaalbestendigheid en zonder inhoud in URL's of logboeken.

import { createHash, randomUUID } from 'node:crypto';
import { error, json } from '../server/platform';
import { isAlleenLezen } from '../server/platform/context';
import { geldigeTijdzone, legeVorm, normaliseerVorm, vormFouten } from '../shared/agenda-model';
import { schoneInvoer, type NotitieSoort } from '../shared/notities-vnext-model';
import type { DeelbareDienst, Lade } from '../shared/ruimte-scheiding';
import { DIEPE_PARAMS, agendaItemId, bordDoel } from '../shared/zoek-diepe-link';
import { gebeurtenisAanmaken } from './agenda-google';
import { alsGebruiker } from './ai-toestemmingen';
import { journaalSchrijf } from './beheer-journaal';
import { SERVICE_HOSTS } from './deployment-identiteit';
import { Klantfout } from './klantrelatiebeheer-invoer';
import { leesKlantgegevens, schrijfKlantopdracht } from './klantrelatiebeheer-opslag';
import { huidigeLade, ladeVoorVerzoek } from './mail-ruimte';
import { notitieLezen, notitieMaken } from './notities-vnext';
import { SCHRIJFWACHT, denyMutation, rejectForeignOwnerUserId, type Permission } from './rbac';
import { metLade as metAgendaLade } from './ruimte-cloud-agenda';
import { gegevensLade } from './ruimte-scheiding';
import { kluisStand } from './sleutelkluis';

type User = { id: string; email?: string; role?: string; status: string; accessLevel?: string };
type AuthSuccess = { service: string; user: User };
type AuthFailure = { errorCode: string };
export type MailBrugAuthorize = (event: Record<string, unknown>, body: unknown) => Promise<AuthSuccess | AuthFailure>;
type Context = { event: Record<string, unknown>; body: unknown; params: Record<string, string> };

export type BrugBronSoort = 'bericht' | 'bijlage';
export type BrugDoelSoort = 'notitie' | 'taak' | 'afstemming' | 'agenda' | 'klant';

export type BrugKoppelingRij = {
  sleutel: string;
  bronSoort: BrugBronSoort;
  accountId: string;
  messageId: string;
  bijlageId: string;
  doelSoort: BrugDoelSoort;
  doelId: string;
  href: string;
  aangemaaktOp: string;
};

const bodyOf = (body: unknown): Record<string, unknown> =>
  body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : {};

const schoonVeld = (waarde: unknown, max = 1000): string =>
  String(waarde ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max);

const schoonTekstBlok = (waarde: unknown, max = 40_000): string =>
  String(waarde ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max);

const geldigAccountId = (waarde: string): boolean => /^[A-Za-z0-9._:@+-]{2,300}$/.test(waarde);
const geldigBerichtId = (waarde: string): boolean => /^[A-Za-z0-9._:@+=-]{2,300}$/.test(waarde);
const geldigBijlageId = (waarde: string): boolean => !waarde || /^[A-Za-z0-9._:@+=/%-]{1,300}$/.test(waarde);

const isTabelOntbreekt = (err: unknown): boolean =>
  Boolean(err && typeof err === 'object' && (err as { code?: string }).code === '42P01');

export function notitieBrugHref(id: string): string {
  return `https://${SERVICE_HOSTS.hub}/notities?${DIEPE_PARAMS.item}=${encodeURIComponent(id)}`;
}

export function taakBrugHref(id: string): string {
  return `https://${SERVICE_HOSTS.mcp}/bord?${DIEPE_PARAMS.doel}=${encodeURIComponent(bordDoel(id))}`;
}

export function takenOverzichtHref(): string {
  return `https://${SERVICE_HOSTS.hub}/taken`;
}

export function afstemmingBrugHref(): string {
  return `https://${SERVICE_HOSTS.api}/afstemming`;
}

export function agendaBrugHref(itemId?: string): string {
  return itemId
    ? `https://${SERVICE_HOSTS.hub}/agenda?${DIEPE_PARAMS.afspraak}=${encodeURIComponent(itemId)}`
    : `https://${SERVICE_HOSTS.hub}/agenda`;
}

export function klantBrugHref(klantId?: string): string {
  return klantId
    ? `https://${SERVICE_HOSTS.crm}/klanten?klant=${encodeURIComponent(klantId)}`
    : `https://${SERVICE_HOSTS.crm}/klanten`;
}

export function sleutelkluisOntgrendelHref(): string {
  return `https://${SERVICE_HOSTS.identity}/methoden#sleutelkluis`;
}

function hrefVoorDoel(soort: BrugDoelSoort, doelId: string): string {
  if (soort === 'notitie') return notitieBrugHref(doelId);
  if (soort === 'taak') return taakBrugHref(doelId);
  if (soort === 'afstemming') return afstemmingBrugHref();
  if (soort === 'agenda') return agendaBrugHref(doelId);
  return klantBrugHref(doelId);
}

/** Детермінований UUID із довільного рядка, сумісний із перевіркою kenmerk() у klantrelatiebeheer-invoer.ts. */
export function deterministischeUuid(zaad: string): string {
  const hex = createHash('sha256').update(zaad).digest('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `4${hex.slice(13, 16)}`,
    `${((parseInt(hex.slice(16, 17), 16) & 0x3) | 0x8).toString(16)}${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join('-');
}

function normaliseerBrugSleutel(ruw: unknown, terugvalDelen: readonly string[]): string {
  const tekst = schoonVeld(ruw, 160).replace(/[^A-Za-z0-9._:-]/g, '');
  if (tekst.length >= 8 && tekst.length <= 160) return tekst;
  return `brug-${createHash('sha256').update(JSON.stringify(terugvalDelen)).digest('hex').slice(0, 40)}`;
}

async function leesBrugRij(
  lade: Lade,
  sleutel: string,
): Promise<{ doelSoort: BrugDoelSoort; doelId: string } | null> {
  return alsGebruiker(lade.userId, async (q) => {
    await q("SELECT set_config('app.ruimte', $1, true)", [lade.ruimte]);
    await q('SAVEPOINT mail_brug_lees');
    try {
      const { rows } = await q(
        `SELECT doel_soort, doel_id
           FROM app.mail_dienstbruggen
          WHERE gebruiker_id = $1 AND ruimte = $2 AND sleutel = $3`,
        [lade.userId, lade.ruimte, sleutel],
      );
      await q('RELEASE SAVEPOINT mail_brug_lees');
      if (!rows[0]) return null;
      return {
        doelSoort: String(rows[0].doel_soort) as BrugDoelSoort,
        doelId: String(rows[0].doel_id),
      };
    } catch (err) {
      await q('ROLLBACK TO SAVEPOINT mail_brug_lees');
      if (isTabelOntbreekt(err)) return null;
      throw err;
    }
  });
}

async function bewaarBrugRij(
  lade: Lade,
  rij: {
    sleutel: string;
    bronSoort: BrugBronSoort;
    accountId: string;
    messageId: string;
    bijlageId: string;
    doelSoort: BrugDoelSoort;
    doelId: string;
  },
): Promise<void> {
  await alsGebruiker(lade.userId, async (q) => {
    await q("SELECT set_config('app.ruimte', $1, true)", [lade.ruimte]);
    await q('SAVEPOINT mail_brug_schrijf');
    try {
      await q(
        `INSERT INTO app.mail_dienstbruggen
           (gebruiker_id, ruimte, sleutel, bron_soort, account_id, message_id, bijlage_id, doel_soort, doel_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (gebruiker_id, ruimte, sleutel) DO NOTHING`,
        [
          lade.userId,
          lade.ruimte,
          rij.sleutel,
          rij.bronSoort,
          rij.accountId,
          rij.messageId,
          rij.bijlageId,
          rij.doelSoort,
          rij.doelId,
        ],
      );
      await q('RELEASE SAVEPOINT mail_brug_schrijf');
    } catch (err) {
      await q('ROLLBACK TO SAVEPOINT mail_brug_schrijf');
      if (!isTabelOntbreekt(err)) throw err;
    }
  });
}

async function lijstBruggenVoorBericht(
  lade: Lade,
  accountId: string,
  messageId: string,
): Promise<BrugKoppelingRij[]> {
  return alsGebruiker(lade.userId, async (q) => {
    await q("SELECT set_config('app.ruimte', $1, true)", [lade.ruimte]);
    await q('SAVEPOINT mail_brug_lijst');
    try {
      const { rows } = await q(
        `SELECT sleutel, bron_soort, account_id, message_id, bijlage_id, doel_soort, doel_id, aangemaakt_op
           FROM app.mail_dienstbruggen
          WHERE gebruiker_id = $1 AND ruimte = $2 AND account_id = $3 AND message_id = $4
          ORDER BY aangemaakt_op DESC
          LIMIT 30`,
        [lade.userId, lade.ruimte, accountId, messageId],
      );
      await q('RELEASE SAVEPOINT mail_brug_lijst');
      return rows.map((r: Record<string, unknown>) => {
        const doelSoort = String(r.doel_soort) as BrugDoelSoort;
        const doelId = String(r.doel_id);
        return {
          sleutel: String(r.sleutel),
          bronSoort: String(r.bron_soort) as BrugBronSoort,
          accountId: String(r.account_id),
          messageId: String(r.message_id),
          bijlageId: String(r.bijlage_id || ''),
          doelSoort,
          doelId,
          href: hrefVoorDoel(doelSoort, doelId),
          aangemaaktOp: r.aangemaakt_op ? new Date(String(r.aangemaakt_op)).toISOString() : '',
        };
      });
    } catch (err) {
      await q('ROLLBACK TO SAVEPOINT mail_brug_lijst');
      if (isTabelOntbreekt(err)) return [];
      throw err;
    }
  });
}

type ToegangOk = { auth: AuthSuccess; lade: Lade; body: Record<string, unknown> };
type ToegangWeigering = { weigering: ReturnType<typeof error> };

async function controleerBrugToegang(
  authorize: MailBrugAuthorize,
  ctx: Context,
  vereistRecht?: Permission,
  extraRecht?: Permission,
): Promise<ToegangOk | ToegangWeigering> {
  const auth = await authorize(ctx.event, ctx.body);
  if (!auth || 'errorCode' in auth || auth.service !== 'mail' || auth.user.status !== 'approved') {
    return { weigering: error('OWNER_MAIL_SESSION_REQUIRED', 403) };
  }
  const vreemd = rejectForeignOwnerUserId(auth.user, ctx.body);
  if (vreemd) return { weigering: vreemd };
  if (vereistRecht) {
    if (isAlleenLezen()) return { weigering: error('ALLEEN_LEZEN', 403) };
    const geweigerd = denyMutation(auth.user, vereistRecht);
    if (geweigerd) return { weigering: geweigerd };
    if (extraRecht) {
      const extraGeweigerd = denyMutation(auth.user, extraRecht);
      if (extraGeweigerd) return { weigering: extraGeweigerd };
    }
  }
  const body = bodyOf(ctx.body);
  const gebonden = huidigeLade(auth.user.id);
  if (gebonden) return { auth, lade: gebonden, body };
  const besluit = await ladeVoorVerzoek(auth.user.id, 'mail', ctx.body);
  if (!besluit.ok) {
    return {
      weigering: {
        statusCode: 403,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ error: besluit.code, dienst: 'mail', uitleg: besluit.uitleg }),
      },
    };
  }
  return { auth, lade: besluit.lade, body };
}

async function controleerDoelDienstRuimte(
  userId: string,
  mailLade: Lade,
  doelDienst: DeelbareDienst,
  body: Record<string, unknown>,
): Promise<{ ok: true } | { ok: false; antwoord: ReturnType<typeof error> }> {
  const tab = schoonVeld(body.tabContext, 120);
  const besluit = await gegevensLade({ userId, tabContext: tab || null, dienst: doelDienst });
  if (!besluit.ok) {
    return {
      ok: false,
      antwoord: {
        statusCode: 403,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ error: besluit.code, dienst: doelDienst, uitleg: besluit.uitleg }),
      },
    };
  }
  if (besluit.lade.ruimte !== mailLade.ruimte) {
    return {
      ok: false,
      antwoord: {
        statusCode: 403,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({
          error: 'MAIL_BRUG_RUIMTE_AFGESCHERMD',
          dienst: doelDienst,
          uitleg: {
            uk: 'Пошта та цільова служба наразі працюють у різних ізольованих просторах даних, тому перенесення зупинено задля захисту приватності.',
            nl: 'Post en de doeldienst werken momenteel in verschillende geïsoleerde gegevensruimten; overdracht is geblokkeerd ter bescherming van uw privacy.',
          },
        }),
      },
    };
  }
  return { ok: true };
}

function metSchrijfMerk<T extends (ctx: Context) => Promise<unknown>>(fn: T, perm: Permission): T {
  (fn as unknown as Record<symbol, Permission>)[SCHRIJFWACHT] = perm;
  return fn;
}

export function createMailBruggenRoutes(authorize: MailBrugAuthorize) {
  return {
    'POST /api/owner/mail/bruggen/lijst': [
      async (ctx: Context) => {
        const toegang = await controleerBrugToegang(authorize, ctx);
        if ('weigering' in toegang) return toegang.weigering;
        const { lade, body } = toegang;
        const accountId = schoonVeld(body.accountId, 300);
        const messageId = schoonVeld(body.messageId, 300);
        if (!geldigAccountId(accountId) || !geldigBerichtId(messageId)) {
          return error('MAIL_BRUG_INVOER_ONGELDIG', 400);
        }
        const koppelingen = await lijstBruggenVoorBericht(lade, accountId, messageId);
        return json({ ok: true, ruimte: lade.ruimte, koppelingen });
      },
    ],

    'POST /api/owner/mail/bruggen/notitie': [
      metSchrijfMerk(async (ctx: Context) => {
        const toegang = await controleerBrugToegang(authorize, ctx, 'workspace.write');
        if ('weigering' in toegang) return toegang.weigering;
        const { auth, lade, body } = toegang;

        const ruimteCheck = await controleerDoelDienstRuimte(auth.user.id, lade, 'bord', body);
        if (!ruimteCheck.ok) return ruimteCheck.antwoord;

        const accountId = schoonVeld(body.accountId, 300);
        const messageId = schoonVeld(body.messageId, 300);
        const bijlageId = schoonVeld(body.bijlageId, 300);
        const bronSoort: BrugBronSoort = body.bronSoort === 'bijlage' ? 'bijlage' : 'bericht';
        if (!geldigAccountId(accountId) || !geldigBerichtId(messageId) || !geldigBijlageId(bijlageId)) {
          return error('MAIL_BRUG_INVOER_ONGELDIG', 400);
        }

        const titel = schoonVeld(body.titel, 300);
        const inhoud = schoonTekstBlok(body.inhoud, 120_000);
        if (!titel && !inhoud) return error('MAIL_BRUG_NOTITIE_LEEG', 400);

        const sleutel = normaliseerBrugSleutel(body.sleutel, ['notitie', bronSoort, accountId, messageId, bijlageId, titel]);
        const eerder = await leesBrugRij(lade, sleutel);
        if (eerder && eerder.doelSoort === 'notitie') {
          const bestaande = await notitieLezen(lade, eerder.doelId).catch(() => null);
          if (bestaande && !bestaande.verwijderdOp) {
            return json({
              ok: true,
              id: bestaande.id,
              al: true,
              ruimte: lade.ruimte,
              href: notitieBrugHref(bestaande.id),
            });
          }
        }

        const soort: NotitieSoort = body.soort === 'lijst' || body.soort === 'koppeling' ? body.soort : 'tekst';
        const ruweEtiketten = Array.isArray(body.etiketten) ? body.etiketten : (bronSoort === 'bijlage' ? ['пошта', 'вкладення'] : ['пошта']);
        const schoon = schoneInvoer({
          titel: titel || (bronSoort === 'bijlage' ? 'Нотатка з вкладення' : 'Нотатка з листа'),
          inhoud,
          soort,
          kleur: body.kleur,
          etiketten: ruweEtiketten,
          vast: Boolean(body.vast),
        });
        if (!schoon.ok) return error(schoon.fout || 'MAIL_BRUG_NOTITIE_ONGELDIG', 400);

        const gemaakt = await notitieMaken(lade, schoon.invoer, {
          auteur: 'mail',
          herkomst: {
            bron: 'mail',
            bronSoort,
            accountId,
            messageId,
            ...(bijlageId ? { bijlageId } : {}),
          },
        });
        if ('fout' in gemaakt) return error(gemaakt.fout, 400);

        await bewaarBrugRij(lade, {
          sleutel,
          bronSoort,
          accountId,
          messageId,
          bijlageId,
          doelSoort: 'notitie',
          doelId: gemaakt.id,
        });
        await journaalSchrijf({
          actie: 'notitie.aangemaakt',
          actor: auth.user.id,
          doel: { soort: 'notitie', id: gemaakt.id },
          details: { herkomst: 'mail.brug', ruimte: lade.ruimte, bronSoort },
          service: 'mail',
        });

        return json({
          ok: true,
          id: gemaakt.id,
          al: false,
          ruimte: lade.ruimte,
          href: notitieBrugHref(gemaakt.id),
        });
      }, 'workspace.write'),
    ],

    'POST /api/owner/mail/bruggen/taak': [
      metSchrijfMerk(async (ctx: Context) => {
        const toegang = await controleerBrugToegang(authorize, ctx, 'workspace.write');
        if ('weigering' in toegang) return toegang.weigering;
        const { auth, lade, body } = toegang;

        const accountId = schoonVeld(body.accountId, 300);
        const messageId = schoonVeld(body.messageId, 300);
        if (!geldigAccountId(accountId) || !geldigBerichtId(messageId)) {
          return error('MAIL_BRUG_INVOER_ONGELDIG', 400);
        }

        const doel: 'taak' | 'afstemming' = body.doel === 'afstemming' ? 'afstemming' : 'taak';
        if (doel === 'afstemming') {
          const sleutel = normaliseerBrugSleutel(body.sleutel, ['afstemming', accountId, messageId]);
          await bewaarBrugRij(lade, {
            sleutel,
            bronSoort: 'bericht',
            accountId,
            messageId,
            bijlageId: '',
            doelSoort: 'afstemming',
            doelId: messageId,
          });
          await journaalSchrijf({
            actie: 'service_handoff_created',
            actor: auth.user.id,
            doel: { soort: 'afstemming', id: messageId },
            details: { herkomst: 'mail.brug', ruimte: lade.ruimte, doel: 'afstemming' },
            service: 'mail',
          });
          return json({
            ok: true,
            doel: 'afstemming',
            ruimte: lade.ruimte,
            href: afstemmingBrugHref(),
            takenHref: takenOverzichtHref(),
          });
        }

        const ruimteCheck = await controleerDoelDienstRuimte(auth.user.id, lade, 'bord', body);
        if (!ruimteCheck.ok) return ruimteCheck.antwoord;

        const titel = schoonVeld(body.titel, 160);
        if (!titel) return error('MAIL_BRUG_TAAK_TITEL_VEREIST', 400);
        const beschrijving = schoonTekstBlok(body.beschrijving, 3800);
        const termijn = schoonVeld(body.termijn, 40);
        const sleutel = normaliseerBrugSleutel(body.sleutel, ['taak', accountId, messageId, titel]);

        const eerder = await leesBrugRij(lade, sleutel);
        if (eerder && eerder.doelSoort === 'taak') {
          return json({
            ok: true,
            doel: 'taak',
            id: eerder.doelId,
            al: true,
            ruimte: lade.ruimte,
            href: taakBrugHref(eerder.doelId),
            takenHref: takenOverzichtHref(),
            afstemmingHref: afstemmingBrugHref(),
          });
        }

        const taakId = randomUUID();
        const tags = ['mail', ...(termijn && /^\d{4}-\d{2}-\d{2}$/.test(termijn) ? [`termijn:${termijn}`] : [])];
        await alsGebruiker(lade.userId, async (q) => {
          await q(
            `INSERT INTO app.mcp_console_items (id, user_id, kind, title, body, status, author, tags, ruimte, created_at, updated_at)
             VALUES ($1, $2, 'task', $3, $4, 'open', 'mail', $5, $6, now(), now())`,
            [taakId, lade.userId, titel, beschrijving, tags, lade.ruimte],
          );
        });

        await bewaarBrugRij(lade, {
          sleutel,
          bronSoort: 'bericht',
          accountId,
          messageId,
          bijlageId: '',
          doelSoort: 'taak',
          doelId: taakId,
        });
        await journaalSchrijf({
          actie: 'service_handoff_created',
          actor: auth.user.id,
          doel: { soort: 'taak', id: taakId },
          details: { herkomst: 'mail.brug', ruimte: lade.ruimte, doel: 'taak' },
          service: 'mail',
        });

        return json({
          ok: true,
          doel: 'taak',
          id: taakId,
          al: false,
          ruimte: lade.ruimte,
          href: taakBrugHref(taakId),
          takenHref: takenOverzichtHref(),
          afstemmingHref: afstemmingBrugHref(),
        });
      }, 'workspace.write'),
    ],

    'POST /api/owner/mail/bruggen/agenda': [
      metSchrijfMerk(async (ctx: Context) => {
        const toegang = await controleerBrugToegang(authorize, ctx, 'calendar.write', 'workspace.write');
        if ('weigering' in toegang) return toegang.weigering;
        const { auth, lade, body } = toegang;

        const ruimteCheck = await controleerDoelDienstRuimte(auth.user.id, lade, 'agenda', body);
        if (!ruimteCheck.ok) return ruimteCheck.antwoord;

        const accountId = schoonVeld(body.accountId, 300);
        const messageId = schoonVeld(body.messageId, 300);
        if (!geldigAccountId(accountId) || !geldigBerichtId(messageId)) {
          return error('MAIL_BRUG_INVOER_ONGELDIG', 400);
        }

        const titel = schoonVeld(body.titel, 240);
        if (!titel) return error('MAIL_BRUG_AGENDA_TITEL_VEREIST', 400);

        const tijdzone = geldigeTijdzone(body.tijdzone, 'Europe/Brussels');
        const ruweDatum = schoonVeld(body.datum, 10);
        const datum = /^\d{4}-\d{2}-\d{2}$/.test(ruweDatum) ? ruweDatum : new Date().toISOString().slice(0, 10);
        const beginTijd = schoonVeld(body.beginTijd, 5);
        const eindTijd = schoonVeld(body.eindTijd, 5);
        const heeftTijd = /^\d{2}:\d{2}$/.test(beginTijd);
        const heleDag = body.heleDag === true || !heeftTijd;

        const basis = legeVorm(tijdzone);
        const vorm = normaliseerVorm({
          ...basis,
          agendaId: schoonVeld(body.agendaId, 200) || 'primary',
          titel,
          locatie: schoonVeld(body.plaats ?? body.locatie, 400),
          beschrijving: schoonTekstBlok(body.beschrijving, 4000),
          heleDag,
          begin: heleDag ? datum : `${datum}T${beginTijd}`,
          einde: heleDag
            ? datum
            : `${datum}T${/^\d{2}:\d{2}$/.test(eindTijd) ? eindTijd : beginTijd}`,
          tijdzone,
        });
        if (!heleDag && vorm.einde <= vorm.begin) {
          const [uurStr, minStr] = beginTijd.split(':');
          const volgendeUur = Math.min(23, Number(uurStr) + 1);
          const eindMin = Number(uurStr) >= 23 ? '59' : minStr;
          vorm.einde = `${datum}T${String(volgendeUur).padStart(2, '0')}:${eindMin}`;
        }
        const fouten = vormFouten(vorm);
        if (fouten.length) return error(fouten[0], 400);

        const sleutel = normaliseerBrugSleutel(body.sleutel, ['agenda', accountId, messageId, titel, vorm.begin]);
        const eerder = await leesBrugRij(lade, sleutel);
        if (eerder && eerder.doelSoort === 'agenda') {
          return json({
            ok: true,
            id: eerder.doelId,
            al: true,
            ruimte: lade.ruimte,
            href: agendaBrugHref(eerder.doelId),
          });
        }

        const uit = await metAgendaLade(lade, 'agenda', () =>
          gebeurtenisAanmaken(
            { ownerUserId: auth.user.id, email: String(auth.user.email || '') },
            { sleutel: deterministischeUuid(`agenda|${lade.userId}|${lade.ruimte}|${sleutel}`), vorm, meldDeelnemers: 'none' },
          ),
        );

        if (!uit.ok || !uit.gebeurtenisId) {
          const uitbreidingNodig = Boolean(uit.uitbreiding?.nodig || uit.uitslag === 'geen-recht');
          return json({
            ok: false,
            reden: uit.fout || 'AGENDA_NIET_BESCHIKBAAR',
            uitbreidingNodig,
            ruimte: lade.ruimte,
            agendaHref: agendaBrugHref(),
            uitlegUk: uitbreidingNodig
              ? 'Для запису події з листа надайте право запису до Календаря або відкрийте Календар.'
              : 'Підключення Google Calendar із правом запису наразі не активне. Відкрийте Календар для керування подіями.',
            uitlegNl: uitbreidingNodig
              ? 'Verleen schrijftoegang tot de Agenda om een afspraak vanuit dit bericht op te slaan, of open de Agenda.'
              : 'Een actieve Google Calendar-koppeling met schrijfrecht ontbreekt. Open de Agenda om afspraken te beheren.',
          });
        }

        const itemSleutel = agendaItemId(uit.agendaId || 'primary', uit.gebeurtenisId);
        await bewaarBrugRij(lade, {
          sleutel,
          bronSoort: 'bericht',
          accountId,
          messageId,
          bijlageId: '',
          doelSoort: 'agenda',
          doelId: itemSleutel,
        });
        await journaalSchrijf({
          actie: 'service_handoff_created',
          actor: auth.user.id,
          doel: { soort: 'agenda', id: itemSleutel },
          details: { herkomst: 'mail.brug', ruimte: lade.ruimte, doel: 'agenda' },
          service: 'mail',
        });

        return json({
          ok: true,
          id: itemSleutel,
          gebeurtenisId: uit.gebeurtenisId,
          agendaId: uit.agendaId || 'primary',
          al: uit.uitslag === 'herhaald',
          ruimte: lade.ruimte,
          href: agendaBrugHref(itemSleutel),
        });
      }, 'calendar.write'),
    ],

    'POST /api/owner/mail/bruggen/klantkaart': [
      metSchrijfMerk(async (ctx: Context) => {
        const toegang = await controleerBrugToegang(authorize, ctx, 'workspace.write');
        if ('weigering' in toegang) return toegang.weigering;
        const { auth, lade, body } = toegang;

        const accountId = schoonVeld(body.accountId, 300);
        const messageId = schoonVeld(body.messageId, 300);
        if (!geldigAccountId(accountId) || !geldigBerichtId(messageId)) {
          return error('MAIL_BRUG_INVOER_ONGELDIG', 400);
        }

        const stand = await kluisStand(lade);
        if (stand === 'uit' || stand === 'gesloten') {
          return {
            statusCode: 423,
            headers: { 'Content-Type': 'application/json; charset=utf-8' },
            body: JSON.stringify({
              ok: false,
              error: stand === 'uit' ? 'KLANT_SLEUTELKLUIS_NODIG' : 'SLEUTELKLUIS_GESLOTEN',
              kluisStand: stand,
              ruimte: lade.ruimte,
              ontgrendelHref: sleutelkluisOntgrendelHref(),
              overzichtHref: klantBrugHref(),
              uitlegUk: stand === 'uit'
                ? 'Увімкніть шифрування власних даних у «Способи входу», щоб зберігати зашифровані картки клієнтів.'
                : 'Сховище ключів ваших даних зараз зачинене. Розблокуйте його або відкрийте розділ клієнтів.',
              uitlegNl: stand === 'uit'
                ? 'Schakel gegevensversleuteling in bij «Aanmeldmethoden» om versleutelde klantkaarten op te slaan.'
                : 'Uw gegevenssleutelkluis is momenteel gesloten. Ontgrendel deze of open het klantenoverzicht.',
            }),
          };
        }

        const ruweMail = schoonVeld(body.mail, 254).toLowerCase();
        const mail = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(ruweMail) ? ruweMail : '';
        const naam = schoonVeld(body.naam, 180) || (mail ? mail.split('@')[0] : '');
        if (!naam) return error('MAIL_BRUG_KLANT_NAAM_VEREIST', 400);
        const organisatie = schoonVeld(body.organisatie, 200);
        const telefoon = schoonVeld(body.telefoon, 80);
        const onderwerp = schoonVeld(body.onderwerp, 220) || 'Звернення з пошти';
        const notitieTekst = schoonTekstBlok(body.notitieTekst, 6000) || onderwerp;

        const sleutel = normaliseerBrugSleutel(body.sleutel, ['klant', accountId, messageId, mail || naam]);
        const eerder = await leesBrugRij(lade, sleutel);
        if (eerder && eerder.doelSoort === 'klant') {
          return json({
            ok: true,
            id: eerder.doelId,
            bestaand: true,
            al: true,
            ruimte: lade.ruimte,
            href: klantBrugHref(eerder.doelId),
          });
        }

        try {
          const gegevens = await leesKlantgegevens(lade);
          const gevonden = mail
            ? gegevens.klanten.find((k) => String(k.mail || '').trim().toLowerCase() === mail)
            : gegevens.klanten.find((k) => k.naam.trim().toLowerCase() === naam.toLowerCase());

          const opdrachtSleutel = deterministischeUuid(`klant|${lade.userId}|${lade.ruimte}|${sleutel}`);
          let klantId: string;
          let bestaand = false;

          if (gevonden) {
            klantId = gevonden.id;
            bestaand = true;
            await schrijfKlantopdracht(lade, 'contact', {
              sleutel: opdrachtSleutel,
              klantId: gevonden.id,
              kanaal: 'post',
              richting: 'in',
              tekst: notitieTekst,
              minuten: 0,
            });
          } else {
            const uitkomst = await schrijfKlantopdracht(lade, 'aanvraag', {
              sleutel: opdrachtSleutel,
              naam,
              organisatie,
              mail,
              telefoon,
              kanaal: 'post',
              titel: onderwerp,
              tekst: notitieTekst,
              datum: '',
            });
            klantId = uitkomst.id;
          }

          await bewaarBrugRij(lade, {
            sleutel,
            bronSoort: 'bericht',
            accountId,
            messageId,
            bijlageId: '',
            doelSoort: 'klant',
            doelId: klantId,
          });
          await journaalSchrijf({
            actie: bestaand ? 'owner.klantrelatie.contact' : 'owner.klantrelatie.aanvraag',
            actor: auth.user.id,
            doel: { soort: 'klant', id: klantId },
            details: { herkomst: 'mail.brug', ruimte: lade.ruimte, bestaand },
            service: 'mail',
          });

          return json({
            ok: true,
            id: klantId,
            bestaand,
            al: false,
            ruimte: lade.ruimte,
            href: klantBrugHref(klantId),
          });
        } catch (err) {
          if (err instanceof Klantfout) return error(err.code, err.status);
          throw err;
        }
      }, 'workspace.write'),
    ],
  };
}
