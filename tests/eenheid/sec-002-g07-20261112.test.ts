process.env.MR_BEHEERSUBNET = '203.0.113.0/24';
// SEC-002, groep g07 (12.11.2026) — drie bevindingen, elk eerst aangetoond (deze test faalde vóór de patch) en daarna gedicht.
//
// aanmelden-06 — «Подивитися як користувач» з правом дій:
//   A1. Wat de beheerder NOOIT mag, ook niet met recht op acties: blijvende toegang geven (/api/share/*, leden van een woning),
//       account (verwijderen/herstellen), sessie en codewoord, AI-rechten, koppelen/ontkoppelen van accounts en diensten,
//       terminal, extern bureaublad, SSH, uitrol, MCP-machinerie, webhooks, OAuth-callbacks (ook met GET).
//   A2. De vaste verbodslijst vangt nu ook routes op het bovenste niveau (/api/export, /api/logout, /api/account/delete …).
//   A3. Gewone handelingen in mail, bestanden, agenda, bord, notities en weergave blijven werken; alleen-lezen is ongewijzigd.
//   A4. Hek 2 werkt op het routepatroon (met :id).
//   A5. Step-up: een gedelegeerde pseudo-sessie ('mcp-gedelegeerd:<userId>') kan nooit een bevestiging krijgen of gebruiken.
//   A6. Van begin tot eind via de echte router: codewoord → «sterke» bevestiging → account verwijderen lukt niet meer.
// interface-05 — window.name is geen bron van weergavemodellen:
//   B1. Een ondergeschoven «view:» in window.name wordt niet gelezen, niet in localStorage bewaard en uit window.name gehaald.
//   B2. Echte modellen reizen niet meer mee in window.name; de eigen opslag van deze origin blijft de bron (ook in een nieuw tabblad).
//   B3. Rijen met een tijdstip uit de toekomst of een verkeerde sleutel tellen niet.
//   B4. Het inline script van index.html (vóór React) volgt dezelfde regels.
// server-uitrol-11 — minimale rechten van vier root-diensten (systemd): de richtlijnen staan in de unit-bestanden.
// Alle geheimen in dit bestand zijn verzonnen.
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { checker } from './hulp/nep-google';
import { IMPERSONATIE_ZICHTBAAR, isLeesRoute, routeOordeel } from '../../shared/impersonatie';
import {
  STAP_OP_TABEL, codewoordStapOpVastleggen, googleStapOpVastleggen, onthoudGeldig, onthoudVastleggen, passkeyStapOpGeldig,
  passkeyStapOpVastleggen, stapOpGeldig, stapOpSessieId, stapOpVoorSessieVastleggen, sterkeStapOpGeldig, totpStapOpVastleggen, type StapOpAuth,
} from '../../backend/stap-op';
import { codewoordZetten } from '../../backend/codewoord';
import { roepAlsImpersonatie } from '../../backend/site-aanroep';
import { closePool, getPool } from '../../server/platform/pg';
import { db } from '../../server/platform/db';

const lees = (f: string) => readFileSync(join(process.cwd(), f), 'utf8');
const opslag = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, String(v)); }, removeItem: (k: string) => { m.delete(k); }, clear: () => m.clear(), key: (i: number) => [...m.keys()][i] ?? null, get length() { return m.size; } };
};

export async function main(): Promise<number> {
  const { check, einde } = checker('sec-002-g07-20261112');

  // ================================================================ aanmelden-06 — routeregel (puur)
  {
    const V = 'IMPERSONATIE_VERBODEN';
    // A1. Uit de bevinding (auditor) + naburige varianten van dezelfde fout. Allemaal bestaande routes.
    const nooitMetActies = [
      // blijvende toegang tot de ruimte van de gebruiker
      'POST /api/share/email', 'POST /api/share/link', 'POST /api/share/role', 'POST /api/share/members', 'POST /api/share/revoke', 'POST /api/share/join', 'POST /api/share/link/revoke',
      'POST /api/huis/leden', 'POST /api/access/request',
      // account
      'POST /api/account/delete', 'POST /api/account/recover', 'POST /api/account/workspaces/:id/restore', 'POST /api/owner/profile/photo',
      // sessie, codewoord, overdracht, aanmelden
      'POST /api/owner/session/codewoord', 'POST /api/owner/session/handoff/create', 'POST /api/owner/session/handoff/redeem', 'POST /api/owner/session/refresh',
      'POST /api/owner/session/replace-tab-remembered', 'POST /api/browser/accounts/select', 'POST /api/service-handoff/create', 'POST /api/ecosystem/handoff/exchange',
      'POST /api/auth/exchange', 'POST /api/auth/google/code', 'POST /api/owner/auth/password/login', 'POST /api/aanmelden/telegram/voltooien', 'POST /api/ecosystem/auth/start',
      'POST /api/gast/sessie', 'POST /api/gast/inwisselen',
      // bevestigingskanalen en Telegram (aanmeldmethode)
      'POST /api/owner/telegram/koppelen/start', 'POST /api/owner/telegram/koppelen/bevestigen', 'POST /api/owner/telegram/bevestiging/code', 'POST /api/owner/telegram/ontkoppelen',
      'POST /api/owner/telegram/matrix', 'POST /api/owner/bevestiging/apparaat/aanvragen', 'POST /api/owner/bevestiging/apparaat/bekrachtigen', 'POST /api/owner/bevestiging/apparaat/weigeren',
      'POST /api/meldingen/apparaat-bekend',
      // rechten van AI-klanten en agenten
      'POST /api/owner/ai-toegang/zet', 'POST /api/owner/ai-rechten/google-toegang', 'POST /api/owner/ai-rechten/fotos/sessie', 'POST /api/owner/ai-site-schakelaars/zet',
      'POST /api/owner/ai-bevestiging/bevestigen', 'POST /api/owner/ai-bord/modus', 'POST /api/owner/ai/grants/add', 'POST /api/owner/ai/grants/preset', 'POST /api/owner/ai/settings',
      'POST /api/owner/externe-mcp/toevoegen', 'POST /api/owner/externe-mcp/schakelen', 'POST /api/mcp/call', 'POST /api/mcp/agent', 'POST /api/mcp/permissions',
      'POST /api/mcp/archive/link', 'POST /api/mcp/backups/link', 'POST /api/mcp-connector/register', 'POST /api/mcp-connector/rpc', 'DELETE /api/connector-v2/:agent/rpc',
      // koppelen en ontkoppelen van accounts en diensten
      'POST /api/owner/mail/imap/koppelen', 'POST /api/owner/mail/imap/ontkoppelen', 'POST /api/owner/mail/imap/controleren', 'POST /api/owner/mail/accounts/link',
      'POST /api/owner/mail/accounts/:id/connect/start', 'POST /api/owner/mail/accounts/:id/disconnect', 'POST /api/owner/mail/google-suite/connect/start',
      'POST /api/owner/mail/google-suite/account/disconnect', 'POST /api/owner/mail/google-suite/account/select', 'POST /api/owner/mail/google/accounts/:id/disconnect',
      'POST /api/owner/mail/google-suite/onboarding/start', 'POST /api/owner/mail/afzender-beelden/google-toestemming',
      'POST /api/owner/github/oauth/start', 'POST /api/owner/github/oauth/vernieuwen', 'POST /api/owner/github/device/start', 'POST /api/owner/github/device/poll',
      'POST /api/owner/github/eenklik/start', 'POST /api/owner/github/app/verbinden', 'POST /api/owner/github/koppeling', 'POST /api/owner/github/ontkoppelen', 'POST /api/owner/github/spiegel/webhook',
      'POST /api/owner/agenda/toegang/uitbreiden', 'POST /api/owner/agenda/caldav/koppelen', 'POST /api/owner/agenda/caldav/verwijderen',
      'POST /api/owner/cloud/providers/google/connect/start', 'POST /api/owner/cloud/providers/google/disconnect', 'POST /api/owner/cloud/providers/google/account/select',
      'POST /api/owner/cloud/integrations/v1/accounts/start', 'POST /api/owner/cloud/integrations/v1/accounts/:id/disconnect', 'POST /api/owner/cloud/google-suite/onboarding/start',
      'POST /api/owner/cloud/vnext/integraties', 'POST /api/huis/integraties/instellen', 'POST /api/huis/integraties/schrijven', 'POST /api/huis/integraties/verwijderen',
      'POST /api/owner/google-suite/callback',
      // toestemming namens de gebruiker, gegevensruimtes
      'POST /api/owner/privacy/toestemming', 'POST /api/owner/ruimte/besluit', 'POST /api/owner/ruimte/keuze', 'POST /api/owner/ruimte/dienst',
      // server en apparaten
      'POST /api/terminal/openen', 'POST /api/terminal/opdracht', 'POST /api/terminal/instelling', 'POST /api/ssh-ca/uitgifte', 'POST /api/ssh-ca/intrekken',
      'POST /api/owner/remote/openen', 'POST /api/owner/remote/hosts/opslaan', 'POST /api/owner/beveiliging/uitzetten', 'POST /api/uitrol/voorstel/begin', 'POST /api/uitrol/voorstel/klaar',
      // machine-eindpunten
      'POST /api/telegram/webhook', 'POST /api/github/webhook/:sleutel', 'POST /api/owner/mail/google/pubsub/push', 'POST /api/owner/mail/microsoft/webhook',
    ];
    // A1b (nieuwe basis 20261112-192752, CLOUD-001): openbare deellinks voor bestanden (backend/bestanden-delen.ts) vallen binnen
    // de toegelaten familie /api/owner/cloud/ — en geven precies wat het toestemmingsvenster uitsluit: toegang voor anderen.
    nooitMetActies.push('POST /api/owner/cloud/vnext/delen/nieuw', 'POST /api/owner/cloud/vnext/delen/voorbereiden', 'POST /api/owner/cloud/vnext/delen/bijwerken',
      'POST /api/owner/cloud/vnext/delen/intrekken', 'POST /api/owner/cloud/vnext/delen/statistiek', 'POST /api/owner/tech/delen');
    const lek = nooitMetActies.filter((r) => routeOordeel(r.replace(/:[A-Za-z]+/g, 'x1'), true) !== V || routeOordeel(r, true) !== V);
    check(`aanmelden-06 A1: ${nooitMetActies.length} routes zijn «з правом дій» verboden (concreet pad én routepatroon)`, lek.length === 0, lek.slice(0, 12).join(', '));

    // A2. De vaste lijst ving alleen routes MET een tussensegment (/api/<iets>/export); het bovenste niveau glipte erdoor.
    const bovenste = ['POST /api/account/delete', 'POST /api/export', 'GET /api/export', 'POST /api/secrets', 'GET /api/tokens', 'POST /api/logout', 'POST /api/logout-all',
      'POST /api/billing', 'GET /api/totp', 'POST /api/passkeys', 'POST /api/delete-account', 'POST /api/vault/reveal'];
    const lek2 = bovenste.filter((r) => routeOordeel(r, true) !== V || routeOordeel(r, false) !== V);
    check('aanmelden-06 A2: vaste verbodslijst geldt ook voor routes op het bovenste niveau (lezen én acties)', lek2.length === 0, lek2.join(', '));
    // OAuth-callbacks zijn GET («lezen»), maar ronden een koppeling af: altijd verboden.
    const terug = ['GET /api/owner/github/oauth/callback', 'GET /api/owner/cloud/oauth/m4/callback', 'GET /api/owner/github/eenklik/callback', 'GET /api/owner/auth/google/callback'];
    const lek3 = terug.filter((r) => routeOordeel(r, true) !== V || routeOordeel(r, false) !== V);
    check('aanmelden-06 A2: OAuth-callbacks (GET) zijn in beide standen verboden', lek3.length === 0, lek3.join(', '));

    // A3. Wat «з правом дій» belooft, blijft werken.
    const magMetActies = [
      'POST /api/owner/weergave/zet', 'POST /api/owner/ui/preferences/save', 'POST /api/owner/ui/sidebar/save', 'POST /api/owner/vensters/opslaan', 'POST /api/owner/menu/tellers/zet',
      'POST /api/owner/notifications/read', 'POST /api/notifications/read', 'POST /api/owner/meldingen/gelezen', 'POST /api/owner/meldingen/gelezen/toevoegen',
      'POST /api/owner/mail/accounts/:id/send', 'POST /api/owner/mail/accounts/:id/send/confirm', 'POST /api/owner/mail/accounts/:id/labels/modify', 'POST /api/owner/mail/compose/draft/save',
      'POST /api/owner/mail/compose/send', 'POST /api/owner/mail/google-suite/message/modify', 'POST /api/owner/mail/google-suite/reply', 'POST /api/owner/mail/snooze/set',
      'POST /api/owner/mail/view-preferences/save', 'POST /api/owner/mail/afzenders/bijwerken',
      'POST /api/owner/cloud/vnext/upload', 'POST /api/owner/cloud/vnext/map', 'POST /api/owner/cloud/google-suite/drive/upload', 'DELETE /api/owner/cloud/items/x1',
      'POST /api/owner/cloud/integrations/v1/directory/batch', 'POST /api/owner/cloud/integrations/v1/transfer/plan',
      'POST /api/owner/agenda/gebeurtenis/aanmaken', 'POST /api/owner/agenda/gebeurtenis/wijzigen', 'POST /api/owner/agenda/gebeurtenis/verwijderen', 'POST /api/owner/agenda/ics/toevoegen',
      'POST /api/owner/github/issue/create', 'POST /api/owner/github/file/save', 'POST /api/owner/github/pull/merge',
      'POST /api/mcp/board', 'PATCH /api/mcp/board', 'PUT /api/mcp/board', 'POST /api/blocks/add', 'POST /api/blocks/:id/update', 'POST /api/workspaces/:id/blocks/reset',
      'POST /api/notities/nieuw', 'POST /api/notities/wijzig', 'POST /api/owner/hub/layouts/save', 'POST /api/owner/hub/werkblad/v3/bewaren', 'POST /api/owner/zoek/geschiedenis/bewaren',
      'POST /api/huis/opdrachten/nieuw', 'POST /api/huis/apparaten/wijzig', 'POST /api/huis/scenes',
    ];
    const geweigerd = magMetActies.filter((r) => routeOordeel(r, true) !== '' || routeOordeel(r.replace(/:[A-Za-z]+/g, 'x1'), true) !== '');
    check(`aanmelden-06 A3: ${magMetActies.length} gewone handelingen (mail, bestanden, agenda, bord, notities, weergave) blijven toegestaan`, geweigerd.length === 0, geweigerd.join(', '));
    const leesRoutes = ['POST /api/owner/weergave', 'POST /api/owner/session/bootstrap', 'POST /api/owner/session/accounts', 'GET /api/owner/session/who', 'POST /api/bootstrap', 'POST /api/workspace/load',
      'POST /api/owner/mail/google-suite/messages', 'POST /api/owner/cloud/google-suite/drive/browse', 'POST /api/owner/agenda/overzicht', 'POST /api/mcp/board/list', 'POST /api/flags',
      'POST /api/owner/ai-toegang/overzicht', 'POST /api/owner/telegram/koppelen/status', 'POST /api/account/overview', 'POST /api/huis/overzicht', 'POST /api/notities/lijst'];
    check('aanmelden-06 A3: lezen is ongewijzigd (beide standen)', leesRoutes.every((r) => isLeesRoute(r) && routeOordeel(r, false) === '' && routeOordeel(r, true) === ''),
      leesRoutes.filter((r) => routeOordeel(r, false) !== '' || routeOordeel(r, true) !== '').join(', '));
    check('aanmelden-06 A3: zonder recht op acties blijft schrijven «alleen lezen» (zelfde code als vroeger)',
      ['POST /api/owner/weergave/zet', 'POST /api/mcp/board', 'DELETE /api/owner/cloud/items/1', 'POST /api/share/email', 'POST /api/owner/session/codewoord', 'POST /api/owner/mail/imap/koppelen']
        .every((r) => routeOordeel(r, false) === 'IMPERSONATIE_ALLEEN_LEZEN'));
    // Onbekende (toekomstige) families zijn «з правом дій» dicht tot ze uitdrukkelijk zijn toegelaten.
    check('aanmelden-06 A3: een nieuwe, onbekende schrijfroute is standaard verboden (toelatingslijst, geen verbodslijst)',
      routeOordeel('POST /api/owner/nieuw-onderdeel/instellen', true) === V && routeOordeel('POST /api/nieuw/maak', true) === V && routeOordeel('POST /api/owner/nieuw-onderdeel/overzicht', true) === '');
    const z = IMPERSONATIE_ZICHTBAAR;
    check('aanmelden-06: het toestemmingsvenster noemt wat acties wel en niet omvatten (uk + nl)',
      /пошт/.test(z.uk.acties) && /доступ/.test(z.uk.acties) && /mail/.test(z.nl.acties) && /toegang/.test(z.nl.acties));
  }

  // ================================================================ server-uitrol-11 — systemd-units
  {
    const unit = (naam: string) => {
      const regels = lees(`deploy/${naam}`).split('\n').map((r) => r.trim()).filter((r) => r && !r.startsWith('#'));
      const heeft = (sleutel: string, waarde?: string) => regels.some((r) => r.startsWith(`${sleutel}=`) && (waarde === undefined || r.slice(sleutel.length + 1) === waarde));
      const waarden = (sleutel: string) => regels.filter((r) => r.startsWith(`${sleutel}=`)).flatMap((r) => r.slice(sleutel.length + 1).split(/\s+/)).map((p) => p.replace(/^-/, ''));
      return { heeft, waarden, regels };
    };
    const d = unit('mijn-ruimte-diagnose.service');
    check('server-uitrol-11: diagnose — NoNewPrivileges, ProtectSystem=strict, schrijven alleen in de statusmap',
      d.heeft('NoNewPrivileges', 'yes') && d.heeft('ProtectSystem', 'strict') && JSON.stringify(d.waarden('ReadWritePaths')) === JSON.stringify(['/var/lib/mijn-ruimte-uitrol-status'])
      && d.heeft('PrivateDevices', 'yes') && d.heeft('ProtectKernelTunables', 'yes') && d.heeft('ProtectKernelModules', 'yes') && d.heeft('ProtectControlGroups', 'yes')
      && d.heeft('RestrictAddressFamilies', 'AF_UNIX') && d.heeft('PrivateTmp', 'yes') && d.heeft('ProtectHome', 'yes'), d.regels.join(' | '));
    const o = unit('mijn-ruimte-opdracht@.service');
    check('server-uitrol-11: opdracht@ — NoNewPrivileges, ProtectSystem=full (alleen de unit-map schrijfbaar voor terugdraaien), kernbescherming',
      o.heeft('NoNewPrivileges', 'yes') && o.heeft('ProtectSystem', 'full') && JSON.stringify(o.waarden('ReadWritePaths')) === JSON.stringify(['/etc/systemd/system'])
      && o.heeft('ProtectKernelTunables', 'yes') && o.heeft('ProtectKernelModules', 'yes') && o.heeft('ProtectControlGroups', 'yes') && o.heeft('PrivateTmp', 'yes') && o.heeft('ProtectHome', 'yes')
      && o.heeft('ExecStart', '/usr/local/sbin/mijn-ruimte-opdracht %i') && o.heeft('StandardInput', 'null'), o.regels.join(' | '));
    const p = unit('mijn-ruimte-proef.service');
    const proefPaden = p.waarden('ReadWritePaths').sort();
    check('server-uitrol-11: proef — ProtectSystem=strict met precies de vier werkmappen, NoNewPrivileges, kernbescherming',
      p.heeft('ProtectSystem', 'strict') && p.heeft('NoNewPrivileges', 'yes')
      && JSON.stringify(proefPaden) === JSON.stringify(['/run/lock', '/srv/mijn-ruimte/proef-inbox', '/var/lib/mijn-ruimte-proef', '/var/lib/mijn-ruimte-uitrol-status'])
      && p.heeft('ProtectKernelTunables', 'yes') && p.heeft('ProtectKernelModules', 'yes') && p.heeft('ProtectControlGroups', 'yes') && p.heeft('PrivateTmp', 'yes') && p.heeft('ProtectHome', 'yes'), p.regels.join(' | '));
    // Het proefscript schrijft nergens anders: werkmap, uitslagmap, inbox en het slot.
    const proefScript = lees('deploy/uitrol/mijn-ruimte-migratie-proef.sh');
    check('server-uitrol-11: de paden van de proef-unit dekken de vaste paden van het script',
      proefScript.includes('${PROEF_INBOX:-/srv/mijn-ruimte/proef-inbox}') && proefScript.includes('${PROEF_STATUS_DIR:-/var/lib/mijn-ruimte-uitrol-status}/proef')
      && proefScript.includes('${PROEF_WERK:-/var/lib/mijn-ruimte-proef}') && proefScript.includes('/run/lock/mijn-ruimte-migratie-proef.lock'));
    const n = unit('mijn-ruimte-nazorg.service');
    check('server-uitrol-11: nazorg — niet langer zonder enige beperking (NoNewPrivileges, PrivateTmp, ProtectHome, kernbescherming)',
      n.heeft('NoNewPrivileges', 'yes') && n.heeft('PrivateTmp', 'yes') && n.heeft('ProtectHome', 'yes') && n.heeft('ProtectKernelTunables', 'yes') && n.heeft('ProtectKernelModules', 'yes')
      && n.heeft('ProtectControlGroups', 'yes') && n.heeft('ExecStart', '/usr/local/sbin/mijn-ruimte-nazorg') && n.heeft('TimeoutStartSec', '900'), n.regels.join(' | '));
    // De dode-mansschakelaar moet kunnen terugdraaien (symlink in /srv, unit van de MCP-deur in /etc): geen ProtectSystem hier.
    check('server-uitrol-11: nazorg houdt schrijftoegang voor terugdraaien (geen ProtectSystem=strict/full)', !n.heeft('ProtectSystem', 'strict') && !n.heeft('ProtectSystem', 'full'));
    // Geen enkele unit mag een richtlijn bevatten die systemd niet kent (tikfout = stil genegeerd).
    const bekend = new Set(['Description', 'Documentation', 'After', 'ConditionPathExists', 'Type', 'ExecStart', 'StandardInput', 'PrivateTmp', 'ProtectHome', 'Nice', 'TimeoutStartSec',
      'NoNewPrivileges', 'ProtectSystem', 'ReadWritePaths', 'PrivateDevices', 'ProtectKernelTunables', 'ProtectKernelModules', 'ProtectControlGroups', 'RestrictAddressFamilies']);
    const onbekend = [d, o, p, n].flatMap((u) => u.regels.filter((r) => !r.startsWith('[') && !bekend.has(r.split('=')[0])));
    check('server-uitrol-11: alleen bekende richtlijnen in de vier units', onbekend.length === 0, onbekend.join(' | '));
  }

  // ================================================================ aanmelden-06 — step-up en de echte router (database)
  if (!process.env.DATABASE_URL_SYSTEM && !process.env.DATABASE_URL) {
    console.log('OVERGESLAGEN (DB-deel aanmelden-06): geen database');
  } else {
    const sys = getPool('systeem');
    const sfx = randomBytes(4).toString('hex');
    const lidId = `sec002g07-lid-${sfx}`, lidMail = `lid-${sfx}@g07.test.invalid`;
    const behId = `sec002g07-beh-${sfx}`;
    const tab = randomBytes(24).toString('hex');
    const woord = `Verzonnen-${randomBytes(6).toString('hex')}-Ж7!`;   // verzonnen codewoord, alleen voor deze test
    const pseudo = `mcp-gedelegeerd:${lidId}`;
    const delegatie = (): StapOpAuth => ({ user: { id: lidId }, session: { id: pseudo, createdAt: Date.now(), userId: lidId }, tabSession: null });
    const gewoon = (): StapOpAuth => ({ user: { id: lidId }, session: { id: `sessie-${sfx}`, createdAt: Date.now(), userId: lidId }, tabSession: null });
    const record = async () => ((await db.list<Record<string, Record<string, number>>>(STAP_OP_TABEL, { filter: { userId: lidId }, limit: 1 })).items[0] || {}) as Record<string, Record<string, number> | undefined>;
    const sleutels = async () => { const r = await record(); return ['sessies', 'sterkSessies', 'passkeySessies', 'onthoudSessies', 'methodes'].flatMap((v) => Object.keys(r[v] || {})); };
    const status = async () => String((await sys.query("SELECT data->>'status' AS s FROM app.records WHERE tbl = 'users' AND id = $1", [lidId])).rows[0]?.s || '');
    const stapOpUitVoor = process.env.STAP_OP_UIT;
    delete process.env.STAP_OP_UIT;
    try {
      for (const [id, mail] of [[lidId, lidMail], [behId, `beh-${sfx}@g07.test.invalid`]])
        await sys.query('INSERT INTO app.records (tbl, id, data) VALUES ($1, $2, $3::jsonb)', ['users', id, JSON.stringify({ email: mail, role: 'member', status: 'approved' })]);

      // A5. Elke manier om een bevestiging vast te leggen, op de pseudo-sessie van een gedelegeerde aanroep.
      await codewoordStapOpVastleggen(delegatie());
      await totpStapOpVastleggen(delegatie());
      const pk = await passkeyStapOpVastleggen(delegatie());
      const viaApparaat = await stapOpVoorSessieVastleggen(lidId, pseudo, 'apparaat', { sterk: true });
      const viaGoogle = await googleStapOpVastleggen(lidId, [pseudo], Date.now() - 1000);
      const onthoudTot = await onthoudVastleggen(delegatie());
      const na = await sleutels();
      check('aanmelden-06 A5: geen enkele step-up wordt vastgelegd voor een gedelegeerde pseudo-sessie',
        pk === false && viaApparaat === false && viaGoogle === false && onthoudTot === 0 && !na.some((k) => k.startsWith('mcp-gedelegeerd:')), `pk=${pk} apparaat=${viaApparaat} google=${viaGoogle} onthoud=${onthoudTot} sleutels=${na.join(',')}`);
      check('aanmelden-06 A5: …en ze geldt daar ook nooit (gewoon, sterk, passkey, onthouden, sessie-id leeg)',
        !(await sterkeStapOpGeldig(delegatie())) && !(await stapOpGeldig(delegatie())) && !(await passkeyStapOpGeldig(delegatie())) && !(await onthoudGeldig(delegatie())) && stapOpSessieId(delegatie()) === '');
      // Een rij die er vóór de patch al stond (of er langs een andere weg kwam) telt evenmin.
      const nu = Date.now();
      const bestaand = (await db.list<Record<string, unknown>>(STAP_OP_TABEL, { filter: { userId: lidId }, limit: 1 })).items[0] as (Record<string, unknown> & { id: string }) | undefined;
      const oud = { userId: lidId, sessies: { [pseudo]: nu }, sterkSessies: { [pseudo]: nu }, passkeySessies: { [pseudo]: nu }, onthoudSessies: { [pseudo]: nu }, methodes: { [pseudo]: 'codewoord' }, updatedAt: nu };
      if (bestaand) await db.update(STAP_OP_TABEL, [{ id: bestaand.id, record: oud }]); else await db.add(STAP_OP_TABEL, [oud]);
      check('aanmelden-06 A5: een oude rij op de pseudo-sessie (van vóór de patch) geeft geen bevestiging',
        !(await sterkeStapOpGeldig(delegatie())) && !(await stapOpGeldig(delegatie())) && !(await passkeyStapOpGeldig(delegatie())) && !(await onthoudGeldig(delegatie())));
      // Tegenproef: een gewone sessie werkt zoals altijd.
      await totpStapOpVastleggen(gewoon());
      check('aanmelden-06 A5: tegenproef — een gewone sessie krijgt en houdt haar bevestiging', (await sterkeStapOpGeldig(gewoon())) && (await stapOpGeldig(gewoon())) && stapOpSessieId(gewoon()) === `sessie-${sfx}`);
      await sys.query('DELETE FROM app.records WHERE tbl = $1 AND data->>\'userId\' = $2', [STAP_OP_TABEL, lidId]);

      // A6. De hele keten uit de bevinding via de echte router (hek 2), zonder hek 1: codewoord → sterke bevestiging → account weg.
      check('aanmelden-06 A6: voorbereiding — de gebruiker heeft een codewoord', (await codewoordZetten(lidId, woord, lidMail)) === 'OK');
      const imp = { id: randomUUID(), beheerderId: behId, beheerderEmail: `beh-${sfx}@g07.test.invalid`, metActies: true };
      const cw = await roepAlsImpersonatie(lidId, 'hub', 'POST /api/owner/session/codewoord', { service: 'hub', tabContext: tab, woord }, imp);
      check('aanmelden-06 A6: codewoord raden/invoeren via impersonatie → geweigerd (IMPERSONATIE_VERBODEN)', cw.status >= 400 && cw.data?.error === 'IMPERSONATIE_VERBODEN', `${cw.status} ${JSON.stringify(cw.data).slice(0, 160)}`);
      check('aanmelden-06 A6: …en er is geen «sterke» bevestiging op de pseudo-sessie ontstaan', !(await sterkeStapOpGeldig(delegatie())) && !(await sleutels()).some((k) => k.startsWith('mcp-gedelegeerd:')));
      const weg = await roepAlsImpersonatie(lidId, 'hub', 'POST /api/account/delete', { service: 'hub', tabContext: tab, confirmEmail: lidMail, codewoord: woord }, imp);
      check('aanmelden-06 A6: POST /api/account/delete via impersonatie → geweigerd, het account blijft bestaan', weg.status >= 400 && weg.data?.ok !== true && (await status()) === 'approved', `${weg.status} ${JSON.stringify(weg.data).slice(0, 160)} status=${await status()}`);
      const deel = await roepAlsImpersonatie(lidId, 'hub', 'POST /api/share/email', { service: 'hub', tabContext: tab, workspaceId: 'x', email: 'aanvaller@example.invalid', workspaceRole: 'admin' }, imp);
      const leden = (await sys.query("SELECT count(*)::int AS n FROM app.records WHERE tbl = 'workspace_members' AND data->>'email' = 'aanvaller@example.invalid'")).rows[0].n;
      // «Approval required» = de route kreeg geen sessie (hek 2); vóór de patch kwam ze tot de werkruimtecontrole («Share access required»).
      check('aanmelden-06 A6: POST /api/share/email via impersonatie → geen sessie voor de route, geen uitnodiging', deel.status === 403 && deel.data?.error === 'Approval required' && leden === 0, `${deel.status} ${JSON.stringify(deel.data).slice(0, 160)}`);
      // Tegenproef: een toegestane handeling loopt nog steeds door hek 2 (de route zelf beslist verder).
      const lezen = await roepAlsImpersonatie(lidId, 'hub', 'POST /api/owner/session/codewoord', { service: 'hub', tabContext: tab, woord: 'fout' }, { ...imp, metActies: false });
      check('aanmelden-06 A6: zonder recht op acties blijft dezelfde route «alleen lezen»', lezen.status >= 400 && lezen.data?.error === 'IMPERSONATIE_ALLEEN_LEZEN', JSON.stringify(lezen.data).slice(0, 120));
    } finally {
      if (stapOpUitVoor === undefined) delete process.env.STAP_OP_UIT; else process.env.STAP_OP_UIT = stapOpUitVoor;
      const ids = [lidId, behId];
      await sys.query("DELETE FROM app.records WHERE tbl <> 'users' AND (data->>'userId' = ANY($1::text[]) OR owner_id = ANY($1::text[]))", [ids]).catch(() => undefined);
      await sys.query('DELETE FROM app.records WHERE id = ANY($1::text[]) OR id LIKE $2', [ids, `%${lidId}%`]).catch(() => undefined);
      await closePool().catch(() => undefined);
    }
  }

  // ================================================================ interface-05 — window.name (browserkant, nagebootst)
  {
    const ORIGIN = 'https://hub.tarasevych.com';
    const g = globalThis as Record<string, unknown>;
    const u = new URL(`${ORIGIN}/overview`);
    let sessie = opslag();
    const lokaal = opslag();
    g.location = { href: u.href, origin: u.origin, host: u.host, hostname: u.hostname, pathname: u.pathname, search: '', hash: '', protocol: u.protocol, assign: () => undefined, replace: () => undefined, reload: () => undefined };
    g.localStorage = lokaal;
    g.sessionStorage = sessie;
    g.document = { cookie: '', hidden: false, title: '', addEventListener: () => undefined, removeEventListener: () => undefined, querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, head: { appendChild: () => undefined }, createElement: () => ({ rel: '', href: '', type: '', dataset: {}, setAttribute: () => undefined, getAttribute: () => null, getContext: () => null, toDataURL: () => 'data:,' }), documentElement: { dataset: {}, style: { setProperty: () => undefined }, classList: { add: () => undefined, remove: () => undefined, contains: () => false } } };
    g.window = Object.assign(g, { name: '', addEventListener: () => undefined, removeEventListener: () => undefined, dispatchEvent: () => true, setTimeout, clearTimeout, setInterval, clearInterval, matchMedia: () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }) });
    const venster = g as { name: string };
    const nieuwTabblad = (naam = '') => { sessie = opslag(); g.sessionStorage = sessie; venster.name = naam; };
    runInNewContext(lees('public/canonical-service.js'), { window: g, location: g.location, document: g.document, addEventListener: () => undefined, Date, Math, Number, String, Object, Array, JSON, URLSearchParams, URL });

    const tc = await import('../../src/tab-context');
    const dvc = await import('../../src/domein-weergave-cache');
    const SLEUTEL = dvc.DOMAIN_VIEW_CACHE_KEY;
    const slachtoffer = `gebruiker-${randomBytes(4).toString('hex')}`;
    const adres = { accountKey: slachtoffer, service: 'hub' as const, path: '/overview', locale: 'uk' as const };
    const anderAdres = { accountKey: slachtoffer, service: 'mail' as const, path: '/inbox', locale: 'uk' as const };
    const k1 = dvc.makeViewCacheKey(adres), k2 = dvc.makeViewCacheKey(anderAdres);
    const NEP = 'МОДЕЛЬ-НАПАДНИКА';
    const nepModel = (k: string, t = Date.now() + 5000) => ({ key: k, signature: 'x:1', model: { state: 'authorized', user: { id: slachtoffer, name: NEP }, notificationItems: [{ title: NEP }] }, timestamp: t });
    const tabId = randomBytes(24).toString('hex');
    const aanvalNaam = (entries: Record<string, unknown>) => `tarasevych-tab:${tabId}|session:known|sidebar:closed|view:${encodeURIComponent(JSON.stringify({ version: 1, entries }))}`;

    // B1. De aanval uit de bevinding: de pagina opent in een venster met een voorbereide naam.
    nieuwTabblad(aanvalNaam({ [k1]: nepModel(k1), [k2]: nepModel(k2) }));
    const gelezen = dvc.readCachedViewModel<{ user?: { name?: string } }>(adres);
    check('interface-05 B1: een model uit window.name wordt NIET als weergave gebruikt', gelezen === null, JSON.stringify(gelezen)?.slice(0, 120));
    check('interface-05 B1: de tab-id uit window.name blijft bruikbaar (geen regressie voor de tabcontext)', tc.ecosystemTabContext() === tabId);
    check('interface-05 B1: het «view:»-deel is uit window.name gehaald', !venster.name.includes('view:') && !venster.name.includes(encodeURIComponent(NEP)) && venster.name.startsWith(`tarasevych-tab:${tabId}`), venster.name.slice(0, 160));
    const echt = { state: 'authorized', user: { id: slachtoffer, name: 'Echte Gebruiker' }, notificationItems: [{ title: 'PRIVE-MELDING-7731' }] };
    dvc.writeCachedViewModel(adres, echt);
    const duurzaam = String(lokaal.getItem(SLEUTEL) || ''), inSessie = String(sessie.getItem(SLEUTEL) || '');
    check('interface-05 B1: na het eerste antwoord van de server staat er niets van de aanvaller in localStorage of sessionStorage',
      !duurzaam.includes(NEP) && !inSessie.includes(NEP) && !duurzaam.includes(k2) && duurzaam.includes('Echte Gebruiker'), duurzaam.slice(0, 200));
    // B2. Echte modellen reizen niet in window.name (lek naar een andere site bij navigatie in hetzelfde tabblad).
    check('interface-05 B2: het echte model staat NIET in window.name', !venster.name.includes('view:') && !venster.name.includes('PRIVE-MELDING-7731') && !venster.name.includes(encodeURIComponent('PRIVE-MELDING-7731')), venster.name.slice(0, 200));
    check('interface-05 B2: dezelfde origin leest het echte model terug (sessie)', dvc.readCachedViewModel<typeof echt>(adres)?.model?.user?.name === 'Echte Gebruiker');
    nieuwTabblad('');
    check('interface-05 B2: een nieuw tabblad (lege window.name en sessionStorage) krijgt het model uit localStorage', dvc.readCachedViewModel<typeof echt>(adres)?.model?.user?.name === 'Echte Gebruiker');
    nieuwTabblad(aanvalNaam({ [k1]: nepModel(k1, Date.now() + 10 * 365 * 24 * 3600 * 1000) }));
    check('interface-05 B2: ook een later tabblad met een «nieuwer» model in window.name toont het eigen model', dvc.readCachedViewModel<typeof echt>(adres)?.model?.user?.name === 'Echte Gebruiker');
    dvc.clearDomainViewCache();
    check('interface-05 B2: wissen laat geen «view:» achter', !venster.name.includes('view:') && lokaal.getItem(SLEUTEL) === null);

    // B3. Rijen die al in de opslag van deze origin staan (bv. ondergeschoven vóór de patch): toekomst en verkeerde sleutel tellen niet.
    nieuwTabblad('');
    lokaal.setItem(SLEUTEL, JSON.stringify({ version: 1, entries: { [k1]: nepModel(k1, Date.now() + 3600_000), [k2]: { ...nepModel(k1, Date.now() - 1000), key: k1 } } }));
    check('interface-05 B3: een rij met een tijdstip uit de toekomst (> 60 s) telt niet', dvc.readCachedViewModel(adres) === null);
    check('interface-05 B3: een rij waarvan de eigen sleutel niet bij haar plaats past, telt niet (en verdringt niets)', dvc.readCachedViewModel(anderAdres) === null);
    lokaal.setItem(SLEUTEL, JSON.stringify({ version: 1, entries: { [k1]: null, x: 7, [k2]: nepModel(k2, Date.now() - 1000) } }));
    const kapot = (() => { try { return [dvc.readCachedViewModel(adres), dvc.readCachedViewModel<{ user?: { name?: string } }>(anderAdres)?.model?.user?.name] as const; } catch (e) { return ['UITZONDERING', (e as Error).message] as const; } })();
    check('interface-05 B3: kapotte rijen breken het lezen niet; een geldige rij van deze origin blijft leesbaar', kapot[0] === null && kapot[1] === NEP, String(kapot[1]));
    lokaal.removeItem(SLEUTEL);

    // B4. Het inline script van index.html (vóór React).
    const html = lees('index.html');
    const begin = html.indexOf('<script id="presentation-init">') + '<script id="presentation-init">'.length;
    const script = html.slice(begin, html.indexOf('</script>', begin));
    const eersteBeeld = (naam: string, ls: Record<string, string>, ss: Record<string, string>) => {
      const klassen = new Set<string>();
      const sOpslag = opslag(), lOpslag = opslag();
      for (const [k, v] of Object.entries(ss)) sOpslag.setItem(k, v);
      for (const [k, v] of Object.entries(ls)) lOpslag.setItem(k, v);
      const uu = new URL(`${ORIGIN}/`);
      const loc = { href: uu.href, origin: uu.origin, host: uu.host, hostname: uu.hostname, pathname: '/', search: '', hash: '', replace: () => undefined };
      const wortel = { lang: 'uk', dataset: {} as Record<string, string>, style: {} as Record<string, string>, classList: { contains: (k: string) => klassen.has(k), add: (...k: string[]) => k.forEach((x) => klassen.add(x)), remove: (...k: string[]) => k.forEach((x) => klassen.delete(x)) } };
      const doc = { cookie: '', title: '', documentElement: wortel, head: { appendChild: () => undefined }, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], createElement: () => ({ setAttribute: () => undefined, dataset: {}, getContext: () => null, style: {} }), addEventListener: () => undefined };
      const w: Record<string, unknown> = { name: naam, addEventListener: () => undefined, location: loc, document: doc, sessionStorage: sOpslag, localStorage: lOpslag, navigator: { language: 'uk-UA' }, matchMedia: () => ({ matches: false }) };
      const ctx = { window: w, location: loc, document: doc, sessionStorage: sOpslag, localStorage: lOpslag, navigator: w.navigator, matchMedia: w.matchMedia, addEventListener: () => undefined, Date, Math, Number, String, Object, Array, JSON, URLSearchParams, URL };
      runInNewContext(lees('public/canonical-service.js'), ctx);
      runInNewContext(script, ctx);
      return { naam: String(w.name), p: (w.__TSV_PRESENTATION__ || {}) as Record<string, any> };
    };
    const leeg = eersteBeeld('', {}, {});
    const anonSleutel = `anon|${leeg.p.route?.service}|${encodeURIComponent(`/${leeg.p.route?.tab}`)}|${leeg.p.lang}`;
    const aanval = eersteBeeld(aanvalNaam({ [anonSleutel]: nepModel(anonSleutel) }), {}, {});
    check('interface-05 B4: index.html neemt geen model uit window.name (sleutel «anon», elke site kan die naam zetten)', leeg.p.domainEntry === null && aanval.p.domainEntry === null, JSON.stringify(aanval.p.domainEntry)?.slice(0, 120));
    check('interface-05 B4: index.html haalt het «view:»-deel uit window.name en houdt de rest', !aanval.naam.includes('view:') && aanval.naam.startsWith(`tarasevych-tab:${tabId}`) && aanval.p.session === 'known', aanval.naam.slice(0, 120));
    const eigen = JSON.stringify({ version: 1, entries: { [anonSleutel]: { key: anonSleutel, signature: 's:1', model: { state: 'anonymous', merk: 'EIGEN' }, timestamp: Date.now() - 5000 } } });
    check('interface-05 B4: het eerste beeld komt uit de eigen opslag van deze origin (sessionStorage, anders localStorage)',
      eersteBeeld('', {}, { [SLEUTEL]: eigen }).p.domainEntry?.model?.merk === 'EIGEN' && eersteBeeld('', { [SLEUTEL]: eigen }, {}).p.domainEntry?.model?.merk === 'EIGEN'
      && eersteBeeld(aanvalNaam({ [anonSleutel]: nepModel(anonSleutel) }), { [SLEUTEL]: eigen }, {}).p.domainEntry?.model?.merk === 'EIGEN');
    const toekomst = JSON.stringify({ version: 1, entries: { [anonSleutel]: { key: anonSleutel, signature: 's:1', model: { merk: 'TOEKOMST' }, timestamp: Date.now() + 3600_000 } } });
    check('interface-05 B4: ook hier telt een rij uit de toekomst niet', eersteBeeld('', { [SLEUTEL]: toekomst }, {}).p.domainEntry === null);
    let parseerbaar = true;
    try { new Function(script); } catch { parseerbaar = false; }
    check('interface-05 B4: presentation-init blijft parseerbaar en leest «view:» nergens meer uit window.name', parseerbaar && !/startsWith\('view:'\)\)\|\|''\)\.slice\(5\)/.test(script) && !script.includes('windowStore'));
    // De bron: geen lees- of schrijfpad voor modellen via window.name.
    const tcBron = lees('src/tab-context.ts'), dvcBron = lees('src/domein-weergave-cache.ts');
    check('interface-05: bron — tab-context schrijft geen «view:» en domein-weergave-cache gebruikt window.name niet',
      !/parts\.push\(`view:/.test(tcBron) && !dvcBron.includes('ecosystemTabViewCache') && !dvcBron.includes('setEcosystemTabViewCache'));
  }

  // ================================================================ aanv-gat-a-04 — noodschakelaar STAP_OP_UIT niet meer stil
  {
    const nu = Date.parse('2026-11-12T12:00:00Z');
    const so = await import('../../backend/stap-op') as Record<string, unknown>;
    const stand = so.stapOpUitStand as undefined | ((n: number, e: Record<string, string | undefined>) => { uit: boolean; bron: string; tot: number; fout: string });
    check('aanv-gat-a-04 C1: er is een tijdgebonden vorm (stapOpUitStand + STAP_OP_UIT_TOT)', typeof stand === 'function');
    if (stand) {
      const iso = (ms: number) => new Date(nu + ms).toISOString();
      check('aanv-gat-a-04 C1: STAP_OP_UIT_TOT binnen 24 uur → uit tot dat tijdstip', stand(nu, { STAP_OP_UIT_TOT: iso(3_600_000) }).uit && stand(nu, { STAP_OP_UIT_TOT: iso(3_600_000) }).tot === nu + 3_600_000);
      check('aanv-gat-a-04 C1: …en na dat tijdstip vanzelf weer aan (zonder herstart)', !stand(nu + 3_600_001, { STAP_OP_UIT_TOT: iso(3_600_000) }).uit && stand(nu + 3_600_001, { STAP_OP_UIT_TOT: iso(3_600_000) }).fout === 'VERLOPEN');
      check('aanv-gat-a-04 C1: meer dan 24 uur vooruit, ongeldig of een los getal → bevestiging blijft AAN',
        [{ STAP_OP_UIT_TOT: iso(25 * 3_600_000) }, { STAP_OP_UIT_TOT: 'morgen' }, { STAP_OP_UIT_TOT: '1' }, { STAP_OP_UIT_TOT: '2026' }].every((e) => !stand(nu, e).uit && stand(nu, e).fout !== ''));
      // g07-toets-1: een te ver tijdstip mag later niet «vanzelf» geldig worden (de 24 uur tellen vanaf de eerste keer dat de waarde
      // gezien is, niet vanaf «nu» bij elke controle) — anders gaat de bevestiging uren later stil uit.
      const ver = { STAP_OP_UIT_TOT: iso(30 * 3_600_000 + 1234) };
      const eerst = stand(nu, ver), later = stand(nu + 6.01 * 3_600_000, ver), nogLater = stand(nu + 29 * 3_600_000, ver);
      check('aanv-gat-a-04 C1 (g07-toets-1): een te ver STAP_OP_UIT_TOT blijft ongeldig, ook 6 en 29 uur later (geen stille omslag)',
        !eerst.uit && eerst.fout === 'TE_LANG' && !later.uit && later.fout === 'TE_LANG' && !nogLater.uit && nogLater.fout === 'TE_LANG',
        JSON.stringify({ eerst, later, nogLater }));
      check('aanv-gat-a-04 C1: een mislukte tijdgrens valt niet terug op STAP_OP_UIT=1 ernaast', !stand(nu, { STAP_OP_UIT_TOT: iso(-1000), STAP_OP_UIT: '1' }).uit);
      check('aanv-gat-a-04 C1: oude vorm STAP_OP_UIT=1 werkt nog (geen breuk voor bestaande installaties en tests), zonder einde',
        stand(nu, { STAP_OP_UIT: '1' }).uit && stand(nu, { STAP_OP_UIT: '1' }).tot === 0 && !stand(nu, {}).uit && !stand(nu, { STAP_OP_UIT: '0' }).uit);
      const voor = { uit: process.env.STAP_OP_UIT, tot: process.env.STAP_OP_UIT_TOT };
      try {
        delete process.env.STAP_OP_UIT; process.env.STAP_OP_UIT_TOT = new Date(Date.now() + 600_000).toISOString();
        const a = await (so.stapOpGeldig as (x: StapOpAuth) => Promise<boolean>)({ user: { id: 'x' }, session: null });
        process.env.STAP_OP_UIT_TOT = new Date(Date.now() - 600_000).toISOString();
        let b = true;
        try { b = await (so.stapOpGeldig as (x: StapOpAuth) => Promise<boolean>)({ user: { id: 'x' }, session: null }); } catch { b = false; }
        check('aanv-gat-a-04 C1: stapOpGeldig volgt de tijdgrens (binnen: door; verlopen: geen bewijs → nee)', a === true && b === false);
      } finally {
        if (voor.uit === undefined) delete process.env.STAP_OP_UIT; else process.env.STAP_OP_UIT = voor.uit;
        if (voor.tot === undefined) delete process.env.STAP_OP_UIT_TOT; else process.env.STAP_OP_UIT_TOT = voor.tot;
      }
    }
    // C2. Melden: logboek + journaal + eigenaar, ook voor de oude vorm; niets als de schakelaar uit is.
    let mod: Record<string, unknown> | null = null;
    try { mod = await import('../../backend/stap-op-noodschakelaar') as Record<string, unknown>; } catch { mod = null; }
    check('aanv-gat-a-04 C2: er is een bewaker van de noodschakelaar (backend/stap-op-noodschakelaar.ts)', !!mod && typeof mod.stapOpUitMelden === 'function' && typeof mod.stapOpUitBewaken === 'function');
    if (mod) {
      const melden = mod.stapOpUitMelden as (n: number, e: Record<string, string | undefined>, d: Record<string, unknown>) => Promise<string>;
      const proef = async (env: Record<string, string | undefined>) => {
        const log: string[] = [], audit: Array<Record<string, unknown>> = [], meldingen: Array<[string, string, string]> = [];
        const uit = await melden(nu, env, { log: (r: string) => log.push(r), audit: async (i: Record<string, unknown>) => { audit.push(i); }, eigenaarId: async () => 'eigenaar-1', melden: async (u: string, t: string, x: string) => { meldingen.push([u, t, x]); } });
        return { uit, log, audit, meldingen };
      };
      const oud = await proef({ STAP_OP_UIT: '1' });
      check('aanv-gat-a-04 C2: STAP_OP_UIT=1 → waarschuwing in het logboek, journaalregel en melding aan de eigenaar',
        oud.uit === 'rood' && oud.log.some((r) => r.includes('STAP_OP_UIT=1')) && oud.audit.length === 1 && oud.audit[0].actie === 'admin.beveiliging.uit'
        && oud.meldingen.length === 1 && oud.meldingen[0][0] === 'eigenaar-1' && /ВИМКНЕНО/.test(oud.meldingen[0][2]) && /UIT/.test(oud.meldingen[0][2]), JSON.stringify(oud).slice(0, 300));
      const tijd = await proef({ STAP_OP_UIT_TOT: new Date(nu + 7_200_000).toISOString() });
      check('aanv-gat-a-04 C2: STAP_OP_UIT_TOT → melding noemt het einde', tijd.uit === 'rood' && tijd.meldingen[0]?.[2].includes(new Date(nu + 7_200_000).toISOString()));
      const kapot = await proef({ STAP_OP_UIT_TOT: 'volgende week' });
      check('aanv-gat-a-04 C2: ongeldige tijdgrens → oranje melding (bevestiging staat aan), geen journaalregel «uit»', kapot.uit === 'oranje' && kapot.audit.length === 0 && kapot.meldingen.length === 1);
      const niets = await proef({});
      check('aanv-gat-a-04 C2: schakelaar uit → geen logboekregel, geen journaal, geen melding', niets.uit === '' && !niets.log.length && !niets.audit.length && !niets.meldingen.length);
      const stuk = await melden(nu, { STAP_OP_UIT: '1' }, { log: () => undefined, audit: async () => { throw new Error('db weg'); }, eigenaarId: async () => { throw new Error('db weg'); }, melden: async () => undefined });
      check('aanv-gat-a-04 C2: een databasefout breekt de bewaker niet', stuk === 'rood');
      const kaart = (mod.stapOpUitKaart as (n: number, e: Record<string, string | undefined>) => { ernst: string; tekst: [string, string] })(nu, { STAP_OP_UIT: '1' });
      check('aanv-gat-a-04 C2: tekst uk + nl met «!» en het gevolg', kaart.ernst === 'rood' && kaart.tekst[0].startsWith('!') && kaart.tekst[1].startsWith('!') && /секрети/.test(kaart.tekst[0]) && /geheimen/.test(kaart.tekst[1]));
    }
    // C3. Zichtbaar waar de beheerder kijkt: start, «Захист», diepe controle; instructies wijzen naar de tijdgebonden vorm.
    const start = lees('server/start.ts'), schak = lees('backend/beveiliging-schakelaars.ts'), diep = lees('backend/diepe-gezondheid.ts');
    check('aanv-gat-a-04 C3: server/start.ts zet de bewaker aan bij de start', /stapOpUitBewaken\(\)/.test(start));
    check('aanv-gat-a-04 C3: «Захист» (beveiliging/stand) geeft de stand van de noodschakelaar mee', /stapOp:\s*stapOpUitKaart\(\)/.test(schak));
    check('aanv-gat-a-04 C3: de diepe gezondheidscontrole meldt het als waarschuwing (zonder 503, dus geen automatisch terugdraaien)', /waarschuwingen/.test(diep) && /stapOpUitKaart/.test(diep));
    const boeken = ['deploy/DRAAIBOEK-AUDITHERSTEL.nl.md', 'deploy/DRAAIBOEK-FASE-2-3.nl.md'].map(lees);
    check('aanv-gat-a-04 C3: de draaiboeken raden STAP_OP_UIT_TOT aan in plaats van STAP_OP_UIT=1', boeken.every((t) => t.includes('STAP_OP_UIT_TOT=') && !/echo 'STAP_OP_UIT=1'|Noodschakelaar als dit iets dringends blokkeert: `STAP_OP_UIT=1`/.test(t)));
  }

  return einde();
}
