// De zes rechten van de PRIVÉRUIMTE die «у розробці» stonden, nu echt (21.10.2026; backend/dev-rechten-gebruiker.ts):
//   mail_send · drive_create_file · drive_upload_file · drive_share_file · photos_picked_media · icloud_list_events.
// Met de echte servercode tegen een wegwerp-PG en een nagebootste Google (tests/eenheid/hulp/nep-google.ts → nepGoogleApi) en een
// nagebootste iCloud-CalDAV (backend/agenda-caldav.ts → zetCaldavVerzoekerVoorTest). Er gaat niets naar buiten. Bewezen wordt:
//   • zonder bevestiging op de site wordt er NIETS verstuurd of gedeeld; na de bevestiging precies één keer, precies wat de mens zag;
//   • een ontbrekende Google-scope geeft een eerlijke fout (uk + nl) met de link «Надати доступ», en er gaat niets naar Google;
//   • Drive: maken (Docs/Sheets) in de gekozen map, uploaden met controle van type en grootte (multipart én hervatbaar), delen met
//     rollen, «iedereen met de link» alleen met een aparte keuze van de mens en nooit als «writer»;
//   • foto's: de mens opent de kiezer en kiest zelf; de AI krijgt alleen die keuze;
//   • iCloud: koppelen met een app-wachtwoord (principal op caldav.icloud.com, agenda's op een pNN-host van Apple) en lezen;
//   • tools/list (connector v2) toont een hulpmiddel ALLEEN als de mens de optie aanzette.
import { createCipheriv, createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { checker, nepGoogleApi } from './hulp/nep-google';
import { closePool, getPool } from '../../server/platform/pg';
import { db } from '../../server/platform';
import { V2_OPTIES, v2Optie } from '../../shared/connector-v2/catalogus';
import { alleNamen, toolNaam } from '../../shared/connector-v2/namen';
import { V2_AGENTEN } from '../../shared/connector-v2/agenten';
import { STANDAARD } from '../../shared/connector-v2/rechten';
import { scopeVoorTool } from '../../shared/ai-toegang';
import { hulpmiddelTekst } from '../../shared/hulpmiddel-teksten';
import { MET_BEVESTIGING } from '../../shared/ai-bevestiging';
import { caldavAbsoluut, isIcloudHost, ontleedCaldavAgendas } from '../../shared/agenda-caldav-model';
import { DEV_GEBRUIKER_MODUS, DEV_GEBRUIKER_NAMEN, DEV_GEBRUIKER_TOOLS } from '../../backend/dev-gebruiker-hulpmiddeldefinities';
import { ALLE_VASTE_TOOLDEFS, STATISCHE_TOOLNAMEN, defaultMode, groupOf, type ToolResult } from '../../backend/connectors-hulpmiddelen';
import { ALLEEN_UITDRUKKELIJK, sleutelsUitScopes } from '../../backend/connector-v2-erfenis';

const lees = (pad: string) => readFileSync(pad, 'utf8');
const NIEUW = ['mail_send', 'drive_create_file', 'drive_upload_file', 'drive_share_file', 'photos_picked_media', 'icloud_list_events'];
const S = {
  lezen: 'https://www.googleapis.com/auth/gmail.readonly', modify: 'https://www.googleapis.com/auth/gmail.modify', send: 'https://www.googleapis.com/auth/gmail.send',
  drive: 'https://www.googleapis.com/auth/drive', fotos: 'https://www.googleapis.com/auth/photospicker.mediaitems.readonly',
};
const CLIENT_REF = 'google_suite_web_oauth_client';
const GRANT_SLEUTEL = 'eenheidstest-dev-rechten-sleutel-32-tekens-minstens';
const envelop = (plat: string, ownerUserId: string, principalId: string, providerAccountId: string) => {
  const sleutel = createHash('sha256').update(GRANT_SLEUTEL, 'utf8').digest();
  const iv = Buffer.alloc(12, 5);
  const c = createCipheriv('aes-256-gcm', sleutel, iv);
  c.setAAD(Buffer.from(`google-oauth-grant-v1|${ownerUserId}|${principalId}|${providerAccountId}|${CLIENT_REF}`, 'utf8'));
  const ct = Buffer.concat([c.update(plat, 'utf8'), c.final()]);
  return { algorithm: 'AES-256-GCM' as const, keyVersion: 1 as const, ciphertext: ct.toString('base64'), iv: iv.toString('base64'), authTag: c.getAuthTag().toString('base64') };
};
const tekstVan = (r: ToolResult) => r.content.map((c) => (c as { text?: string }).text || '').join('\n');
const jsonVan = (r: ToolResult): any => { try { return JSON.parse(r.content[0]?.text || '{}'); } catch { return {}; } };
const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4c10000000049454e44ae426082', 'hex');

export async function main(): Promise<number> {
  const { check, einde } = checker('dev-rechten-gebruiker-20261021');

  // ================================================================ 1. puur: catalogus, namen, scopes, teksten
  const opties = NIEUW.map((n) => V2_OPTIES.find((o) => o.intern === n && o.kant === 'gebruiker'));
  check('catalogus: de zes rechten zijn ACTIEF (intern = echt hulpmiddel), alleen in de privéruimte, zonder «У розробці»',
    opties.every((o) => !!o && o.status === 'actief' && o.kant === 'gebruiker' && !/розробці|ontwikkeling/i.test([...o.uk, ...o.nl].join(' ')))
    && !V2_OPTIES.some((o) => NIEUW.includes(o.intern || '') && o.kant === 'beheer'), opties.map((o) => o?.key).join(','));
  check('catalogus: elk van de zes is een echt hulpmiddel van de server (STATISCHE_TOOLNAMEN, ALLE_VASTE_TOOLDEFS)',
    NIEUW.every((n) => STATISCHE_TOOLNAMEN().includes(n) && ALLE_VASTE_TOOLDEFS().some((t) => t.name === n)) && DEV_GEBRUIKER_TOOLS.length === 6 && NIEUW.every((n) => DEV_GEBRUIKER_NAMEN.has(n)));
  check('namen: voor elke agent a-z0-9_, hoogstens 64 tekens, uniek (bv. versturen_bericht_claude_mail_gmail_…_gebruiker)',
    V2_AGENTEN.every((a) => alleNamen(a.slug).every((n) => /^[a-z0-9_]{1,64}$/.test(n.naam)))
    && toolNaam(v2Optie('mail_send:gebruiker')!, 'claude') === 'versturen_bericht_claude_mail_gmail_tarasevych_com_gebruiker'
    && toolNaam(v2Optie('icloud_list_events:gebruiker')!, 'claude') !== toolNaam(v2Optie('calendar_list_events:gebruiker')!, 'claude'));
  check('standaard (nieuwe koppeling): geen van de zes staat vanzelf aan', !STANDAARD().some((k) => NIEUW.some((n) => k.startsWith(`${n}:`))));
  check('erfenis van het oude /mcp: de zes komen NOOIT vanzelf mee (alleen een uitdrukkelijk vinkje), ook niet met alle scopes',
    NIEUW.every((n) => ALLEEN_UITDRUKKELIJK.has(n)) && !sleutelsUitScopes(['gebruiker'], ['mail.send', 'mail.verzenden', 'files.write', 'photos.read', 'calendar.read']).some((k) => NIEUW.some((n) => k.startsWith(`${n}:`))));
  check('scopes van de oude laag: verzenden heeft een EIGEN scope (geen stille uitbreiding van «чернетки»); Drive = files.write; foto’s = photos.read; iCloud = calendar.read',
    scopeVoorTool('mail_send') === 'mail.verzenden' && scopeVoorTool('draft_email_reply') === 'mail.send' && ['drive_create_file', 'drive_upload_file', 'drive_share_file'].every((n) => scopeVoorTool(n) === 'files.write')
    && scopeVoorTool('photos_picked_media') === 'photos.read' && scopeVoorTool('icloud_list_events') === 'calendar.read');
  check('modus: verzenden, maken, uploaden en delen standaard «питати»; foto’s en iCloud «завжди»; groepen kloppen',
    defaultMode('mail_send') === 'ask' && defaultMode('drive_share_file') === 'ask' && defaultMode('drive_create_file') === 'ask' && defaultMode('drive_upload_file') === 'ask'
    && defaultMode('photos_picked_media') === 'always' && defaultMode('icloud_list_events') === 'always' && DEV_GEBRUIKER_MODUS.mail_send === 'ask'
    && groupOf('mail_send') === 'mail' && groupOf('drive_share_file') === 'drive' && groupOf('icloud_list_events') === 'calendar');
  check('teksten in tools/list: uk en nl uit de catalogus (nooit Engels), met de bevestiging in de uitleg van verzenden en delen',
    NIEUW.every((n) => { const t = hulpmiddelTekst(n); return !!t && /[А-Яа-яІіЇїЄє]/.test(t.titel.uk) && !/[А-Яа-яІіЇїЄє]/.test(t.titel.nl) && t.titel.uk !== t.titel.nl; })
    && /підтвердите/.test(hulpmiddelTekst('mail_send')!.uitleg.uk) && /bevestig/.test(hulpmiddelTekst('mail_send')!.uitleg.nl) && /підтвердження/.test(hulpmiddelTekst('drive_share_file')!.uitleg.uk));
  check('UI: de schakelaars zijn actief (geen «у розробці») en dragen de badge «кожна дія — з вашим підтвердженням на сайті»',
    MET_BEVESTIGING.mail_send === 'altijd' && /is-bevestiging/.test(lees('src/connector-v2/RechtenKiezer.tsx')) && /MET_BEVESTIGING/.test(lees('src/connector-v2/RechtenKiezer.tsx'))
    && /data-v2-met-bevestiging/.test(lees('src/connector-v2/KoppelWizard.tsx')) && /BevestigingenPaneel/.test(lees('src/agenten/AgentPagina.tsx')) && /BevestigingenPaneel/.test(lees('src/agenten/AgentenPagina.tsx')));
  const { snuif } = await import('../../backend/dev-rechten-gebruiker');
  check('upload: het type wordt aan de eerste bytes gecontroleerd (png, pdf, zip, tekst, json); html/svg en verkeerde types niet',
    snuif(png, 'image/png') && !snuif(png, 'image/jpeg') && snuif(Buffer.from('%PDF-1.7\n'), 'application/pdf') && snuif(Buffer.from([0x50, 0x4b, 3, 4, 0, 0]), 'application/zip')
    && snuif(Buffer.from('gewoon tekst'), 'text/plain') && !snuif(Buffer.from('<!doctype html><script>x</script>'), 'text/plain') && !snuif(Buffer.from('{kapot'), 'application/json')
    && snuif(Buffer.from('{"a":1}'), 'application/json') && !snuif(Buffer.from([0, 1, 2]), 'text/plain'));
  check('iCloud-hosts: de principal op caldav.icloud.com en de agenda’s op p<NN>-caldav.icloud.com mogen; elke andere host nog altijd niet',
    isIcloudHost('caldav.icloud.com') && isIcloudHost('p63-caldav.icloud.com') && !isIcloudHost('caldav.icloud.com.evil.example')
    && caldavAbsoluut('https://caldav.icloud.com/', 'https://p63-caldav.icloud.com:443/1/calendars/') === 'https://p63-caldav.icloud.com/1/calendars/'
    && caldavAbsoluut('https://caldav.icloud.com/', 'https://kwaad.example.net/x/') === '' && caldavAbsoluut('https://dav.example.org/', 'https://p63-caldav.icloud.com/x/') === '');

  if (!process.env.DATABASE_URL_SYSTEM && !process.env.DATABASE_URL) { console.log('OVERGESLAGEN dev-rechten-gebruiker (integratie): geen database'); return einde(); }

  // ================================================================ 2. met database en nagebootste Google
  const omgevingVoor = Object.fromEntries(['GOOGLE_SUITE_CLIENT_ID', 'GOOGLE_SUITE_CLIENT_SECRET', 'GOOGLE_OAUTH_GRANT_ENCRYPTION_KEY_V1', 'AGENDA_ABONNEMENT_SLEUTEL_V1'].map((n) => [n, process.env[n]]));
  process.env.GOOGLE_SUITE_CLIENT_ID = 'eenheidstest.apps.googleusercontent.com';
  process.env.GOOGLE_SUITE_CLIENT_SECRET = 'eenheidstest-client-secret-32-tekens-lang';
  process.env.GOOGLE_OAUTH_GRANT_ENCRYPTION_KEY_V1 = GRANT_SLEUTEL;
  process.env.AGENDA_ABONNEMENT_SLEUTEL_V1 = Buffer.alloc(32, 7).toString('base64');
  // Alles wat geen Google-API is (endpointcontroles, discovery …): nooit naar buiten, altijd «onbereikbaar».
  const echteFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response('{}', { status: 599 })) as typeof fetch;
  const nep = nepGoogleApi({ scopes: ['openid', 'email', 'profile', S.lezen, S.drive, S.fotos] });
  const dr = await import('../../backend/dev-rechten-gebruiker');
  const ab = await import('../../backend/ai-bevestiging');
  const { metNamens } = await import('../../backend/mcp-namens');
  const { metLade: cloudLade } = await import('../../backend/ruimte-cloud-agenda');
  const { metLade: mailLade } = await import('../../backend/mail-ruimte');
  const mailCompose = await import('../../backend/mail-opstel');
  const caldav = await import('../../backend/agenda-caldav');
  const v2 = await import('../../backend/connector-v2');
  const sys = getPool('systeem');
  const U = `dev-u-${randomUUID()}`;
  const email = `dev-${randomUUID().slice(0, 8)}@example.test`;
  const subject = `sub-${randomUUID()}`;
  const lade = { userId: U, ruimte: 'prive' as const };
  const ids: Record<string, string[]> = { provider_principals_v1: [], google_oauth_grant_v1: [], provider_service_tokens_v1: [], provider_service_grants_v1: [], cloud_provider_accounts_v1: [] };
  dr.zetWachtVoorTest(20_000);
  const roep = (name: string, args: Record<string, unknown>, modus: 'ask' | 'always' = 'ask') =>
    metNamens({ client: 'Claude', agent: 'claude', grantId: 'g-dev-test', ruimte: 'prive' }, () => dr.roepDevGebruikerTool(U, name, args, { modus }));
  /** Start de aanroep van de AI, wacht tot het verzoek op de site staat, laat de «mens» beslissen, en geef het resultaat terug. */
  const metMens = async (aanroep: Promise<ToolResult>, besluit: (item: Awaited<ReturnType<typeof ab.lijstVoorMens>>[number]) => Promise<void>) => {
    const voor = new Set((await ab.lijstVoorMens(U, 'prive', { ookAfgerond: true })).map((x) => x.id));
    let item: Awaited<ReturnType<typeof ab.lijstVoorMens>>[number] | undefined;
    for (let i = 0; i < 100 && !item; i++) { await new Promise((r) => setTimeout(r, 100)); item = (await ab.lijstVoorMens(U, 'prive')).find((x) => !voor.has(x.id) && x.status === 'wacht'); }
    const zonderBesluit = { verzonden: nep.verzonden.length, rechten: nep.rechten.length, bestanden: nep.bestanden.size };
    if (item) await besluit(item);
    return { item, res: await aanroep, zonderBesluit };
  };
  const bevestig = (stapOp = true, keuze: Record<string, unknown> = {}) => async (item: { id: string; hash: string }) => { await ab.bevestig({ userId: U, id: item.id, ruimte: 'prive', hash: item.hash, stapOp, keuze }); };

  try {
    await sys.query("INSERT INTO app.records (tbl,id,data) VALUES ('users',$1,$2)", [U, { email, role: 'member', status: 'approved' }]);
    const nu = Date.now();
    const [principalId] = await db.add('provider_principals_v1', [{ ownerUserId: U, provider: 'google', providerAccountId: subject, identityProviderAccountId: subject, email, displayName: 'Dev', picture: '', accountRole: 'primary', identityLinked: true, createdAt: nu, updatedAt: nu }]);
    ids.provider_principals_v1.push(String(principalId));
    const env = envelop('nep-refresh-token', U, String(principalId), subject);
    const grantRij = (scopes: string[]) => ({ ownerUserId: U, principalId, providerAccountId: subject, provider: 'google', clientRef: CLIENT_REF, tokenKind: 'refresh_token', ...env, grantedScopes: scopes, grantStatus: 'active', issuedAt: nu, lastVerifiedAt: nu, updatedAt: Date.now(), revokedAt: 0 });
    const [grantId] = await db.add('google_oauth_grant_v1', [grantRij(['openid', 'email', 'profile', S.lezen, S.drive, S.fotos])]);
    ids.google_oauth_grant_v1.push(String(grantId));
    for (const [service, req] of [['mail', [S.lezen]], ['drive', [S.drive]], ['photos', [S.fotos]]] as const) {
      const [h] = await db.add('provider_service_tokens_v1', [{ ownerUserId: U, principalId, provider: 'google', service, tokenName: `google_${service}_token`, tokenKind: 'logical_handle', oauthGrantId: grantId, requiredScopes: [...req], status: 'active', createdAt: nu, updatedAt: nu, revokedAt: 0 }]);
      const [g] = await db.add('provider_service_grants_v1', [{ ownerUserId: U, principalId, provider: 'google', service, tokenName: `google_${service}_token`, oauthClientName: CLIENT_REF, status: 'connected', accountId: principalId, grantedScopes: [...req], runtimeBinding: 'test', createdAt: nu, updatedAt: nu, disconnectedAt: 0 }]);
      ids.provider_service_tokens_v1.push(String(h)); ids.provider_service_grants_v1.push(String(g));
    }
    const [driveAcc] = await db.add('cloud_provider_accounts_v1', [{ ownerUserId: U, provider: 'google_drive', principalId, providerAccountId: subject, email, displayName: 'Dev', picture: '', accountRole: 'primary', status: 'connected', grantedScopes: [S.drive], scopeMode: 'full', tokenName: 'google_drive_token', service: 'drive', connectionStage: 'connected', lastErrorCode: '', createdAt: nu, updatedAt: nu, disconnectedAt: 0 }]);
    ids.cloud_provider_accounts_v1.push(String(driveAcc));

    // ---------------------------------------------------------------- mail_send zonder scope gmail.send
    nep.schoon();
    const geenScope = await roep('mail_send', { to: 'anna@example.org', subject: 'Hallo', body: 'Test' });
    const aantalVerzoeken = async () => Number((await sys.query('SELECT count(*)::int AS n FROM app.ai_bevestiging WHERE user_id = $1', [U])).rows[0].n);
    check('zonder scope gmail.send: eerlijke fout GOOGLE_TOEGANG_ONTBREEKT in uk + nl, met de link «Надати доступ»; geen verzoek, niets naar Gmail',
      geenScope.isError === true && /^GOOGLE_TOEGANG_ONTBREEKT: /.test(tekstVan(geenScope)) && /надсилати листи/.test(tekstVan(geenScope)) && /mail verzenden/.test(tekstVan(geenScope))
      && /google-toegang=mail/.test(tekstVan(geenScope)) && (await aantalVerzoeken()) === 0 && !nep.verzoeken.some((v) => v.pad.includes('/messages/send')), tekstVan(geenScope).slice(0, 200));
    // De mens breidt de toestemming uit (incrementeel): dezelfde grant, scopes erbij.
    await db.update('google_oauth_grant_v1', [{ id: String(grantId), record: grantRij(['openid', 'email', 'profile', S.lezen, S.modify, S.send, S.drive, S.fotos]) }]);
    nep.zetScopes(['openid', 'email', 'profile', S.lezen, S.modify, S.send, S.drive, S.fotos]);

    // ---------------------------------------------------------------- mail_send: nieuw bericht, alleen na bevestiging
    const m1 = await metMens(roep('mail_send', { to: 'Anna <anna@example.org>', cc: 'bob@example.org', subject: 'Offerte ✓', body: 'Beste Anna,\nhierbij de offerte.' }), bevestig(true));
    check('mail_send: het verzoek staat op de site (hoog risico, verse passkey) en er is NIETS verzonden vóór de bevestiging',
      !!m1.item && m1.item.risico === 'hoog' && m1.item.stapOp === true && m1.zonderBesluit.verzonden === 0 && m1.item.beschrijving?.details.some((d) => d.waarde.includes('anna@example.org')) === true);
    const u1 = jsonVan(m1.res);
    const mime1 = nep.verzonden[0]?.mime || '';
    check('mail_send: na de bevestiging precies één bericht via Gmail, van het eigen adres, met Aan/Cc/onderwerp zoals de mens zag; de AI krijgt messageId',
      u1.status === 'uitgevoerd' && nep.verzonden.length === 1 && new RegExp(`From: ${email.replace('.', '\\.')}`).test(mime1) && /To: "Anna" <anna@example\.org>/.test(mime1) && /Cc: bob@example\.org/.test(mime1)
      && /Subject: =\?UTF-8\?B\?/.test(mime1) && typeof u1.resultaat?.messageId === 'string', `${JSON.stringify(u1).slice(0, 200)} | ${mime1.slice(0, 200)}`);
    // later opvragen met alleen het id
    const laterOp = await roep('mail_send', { bevestiging_id: u1.bevestiging_id });
    check('stand opvragen met alleen bevestiging_id: dezelfde uitkomst, er wordt NIETS opnieuw verzonden', jsonVan(laterOp).status === 'uitgevoerd' && nep.verzonden.length === 1);

    // ---------------------------------------------------------------- mail_send: weigeren
    const m2 = await metMens(roep('mail_send', { to: 'carla@example.org', subject: 'Nee', body: 'Niet verzenden' }), async (item) => { await ab.weiger({ userId: U, id: item.id, ruimte: 'prive' }); });
    check('mail_send geweigerd door de mens: niets verzonden, de AI hoort «geweigerd» (fout, niet opnieuw proberen)', m2.res.isError === true && jsonVan(m2.res).status === 'geweigerd' && nep.verzonden.length === 1);

    // ---------------------------------------------------------------- mail_send: antwoord in dezelfde conversatie
    nep.berichten.set('orig12345', { 'Message-ID': '<orig@mail.example.org>', Subject: 'Vraag over Gent', From: 'Dirk <dirk@example.org>', threadId: 'draad-dirk' });
    const m3 = await metMens(roep('mail_send', { reply_to_message_id: 'orig12345', body: 'Ja, dat kan.' }), bevestig(true));
    const mime3 = nep.verzonden[1]?.mime || '';
    check('mail_send als antwoord: ontvanger en «Re:» uit het origineel, In-Reply-To/References, en in dezelfde Gmail-conversatie (threadId)',
      jsonVan(m3.res).status === 'uitgevoerd' && /To: "Dirk" <dirk@example\.org>|To: Dirk <dirk@example\.org>/.test(mime3) && /In-Reply-To: <orig@mail\.example\.org>/.test(mime3)
      && /Subject: Re: Vraag over Gent/.test(mime3) && nep.verzonden[1]?.threadId === 'draad-dirk' && m3.item?.beschrijving?.details.some((d) => /Vraag over Gent/.test(d.waarde)) === true, mime3.slice(0, 300));

    // ---------------------------------------------------------------- mail_send: een concept (draft_email_reply) — onveranderlijk
    const concept = await mailLade(lade, 'mail', () => cloudLade(lade, 'mail', () => mailCompose.saveDraft(U, { localId: `concept${randomUUID().slice(0, 8)}`, to: 'eva@example.org', subject: 'Concept', plainText: 'Versie 1', html: '<p>Versie 1</p>' })));
    const localId = 'draft' in concept ? concept.draft.localId : '';
    const m4 = await metMens(roep('mail_send', { draft_id: localId }), async (item) => {
      // Het concept verandert NA het verzoek (bv. de AI of de mens bewerkt het): dan niet verzenden.
      await mailLade(lade, 'mail', () => cloudLade(lade, 'mail', () => mailCompose.saveDraft(U, { localId, to: 'eva@example.org', subject: 'Concept', plainText: 'Versie 2', html: '<p>Versie 2</p>' })));
      await bevestig(true)(item);
    });
    check('concept gewijzigd na het verzoek → niet verzonden (MAIL_CONCEPT_GEWIJZIGD): de parameters zijn onveranderlijk',
      jsonVan(m4.res).status === 'mislukt' && jsonVan(m4.res).fout === 'MAIL_CONCEPT_GEWIJZIGD' && nep.verzonden.length === 2, JSON.stringify(jsonVan(m4.res)));
    const m5 = await metMens(roep('mail_send', { draft_id: localId }), bevestig(true));
    const nogConcept = await mailLade(lade, 'mail', () => cloudLade(lade, 'mail', () => mailCompose.getDraft(U, localId)));
    check('concept verzenden (zoals het nu is): verzonden met de inhoud van het concept, en het concept is daarna weg',
      jsonVan(m5.res).status === 'uitgevoerd' && nep.verzonden.length === 3 && /To: eva@example\.org/.test(nep.verzonden[2].mime) && !nogConcept, JSON.stringify(jsonVan(m5.res)));

    // ---------------------------------------------------------------- Drive: maken
    nep.bestanden.set('map-werk', { id: 'map-werk', name: 'Werk', mimeType: 'application/vnd.google-apps.folder', parents: ['root-id'] });
    const d1 = await metMens(roep('drive_create_file', { name: 'Notulen', kind: 'document', folder_id: 'map-werk', content: 'Punt 1' }), bevestig(false));
    const gemaakt = [...nep.bestanden.values()].find((f) => f.name === 'Notulen');
    check('drive_create_file (modus «питати»): eerst een verzoek (midden risico, geen passkey nodig), pas na bevestiging een Google-document in de gekozen map met de begintekst',
      !!d1.item && d1.item.risico === 'midden' && d1.zonderBesluit.bestanden === nep.bestanden.size - 1 && jsonVan(d1.res).status === 'uitgevoerd'
      && gemaakt?.mimeType === 'application/vnd.google-apps.document' && gemaakt.parents[0] === 'map-werk' && gemaakt.bytes?.toString() === 'Punt 1');
    const d2 = await roep('drive_create_file', { name: 'Budget', kind: 'spreadsheet' }, 'always');
    check('drive_create_file met modus «завжди» (keuze van de mens): meteen gemaakt, als rekenblad in de hoofdmap, zonder verzoek',
      !d2.isError && jsonVan(d2).data?.mimeType === 'application/vnd.google-apps.spreadsheet' && [...nep.bestanden.values()].some((f) => f.name === 'Budget' && f.parents[0] === 'root-id'));
    check('drive_create_file in een map die niet bestaat → DRIVE_MAP_ONBEKEND (uk + nl), niets gemaakt',
      /^DRIVE_MAP_ONBEKEND/.test(tekstVan(await roep('drive_create_file', { name: 'X', kind: 'document', folder_id: 'bestaatniet' }, 'always'))));

    // ---------------------------------------------------------------- Drive: uploaden
    const fout1 = await roep('drive_upload_file', { name: 'nep.png', mime_type: 'image/png', content_base64: Buffer.from('dit is geen png').toString('base64') }, 'always');
    check('upload met een verkeerd type (tekst als png) → DRIVE_TYPE_KLOPT_NIET, niets geüpload', fout1.isError === true && /^DRIVE_TYPE_KLOPT_NIET/.test(tekstVan(fout1)) && ![...nep.bestanden.values()].some((f) => f.name === 'nep.png'));
    const groot = Buffer.alloc(4 * 1024 * 1024 + 10, 0x41); groot.write('%PDF-1.7\n');
    check('upload groter dan 4 MB → DRIVE_TE_GROOT', /^DRIVE_TE_GROOT/.test(tekstVan(await roep('drive_upload_file', { name: 'groot.pdf', mime_type: 'application/pdf', content_base64: groot.toString('base64') }, 'always'))));
    const klein = await roep('drive_upload_file', { name: 'logo.png', mime_type: 'image/png', content_base64: png.toString('base64'), folder_id: 'map-werk' }, 'always');
    const kleinGemaakt = [...nep.bestanden.values()].find((f) => f.name === 'logo.png');
    check('upload ≤ 1 MB: multipart, de bytes komen ongeschonden aan in de gekozen map', !klein.isError && jsonVan(klein).data?.upload === 'multipart' && !!kleinGemaakt?.bytes?.equals(png) && kleinGemaakt.parents[0] === 'map-werk');
    const middel = Buffer.alloc(1_500_000, 0x20); middel.write('%PDF-1.7\n');
    const u2 = await metMens(roep('drive_upload_file', { name: 'rapport.pdf', mime_type: 'application/pdf', content_base64: middel.toString('base64') }), bevestig(false));
    const middelGemaakt = [...nep.bestanden.values()].find((f) => f.name === 'rapport.pdf');
    check('upload > 1 MB (modus «питати»): pas na bevestiging, als hervatbare upload (sessie + PUT), met grootte en SHA-256 in het verzoek',
      jsonVan(u2.res).status === 'uitgevoerd' && (jsonVan(u2.res).resultaat?.upload === 'resumable') && middelGemaakt?.bytes?.length === middel.length
      && nep.verzoeken.some((v) => v.methode === 'PUT' && v.url.includes('upload_id=')) && u2.item?.beschrijving?.details.some((d) => d.waarde === createHash('sha256').update(middel).digest('hex')) === true);

    // ---------------------------------------------------------------- Drive: delen
    nep.bestanden.set('deel-1', { id: 'deel-1', name: 'Contract.pdf', mimeType: 'application/pdf', parents: ['root-id'], capabilities: { canShare: true } });
    nep.bestanden.set('deel-nee', { id: 'deel-nee', name: 'Van een ander.pdf', mimeType: 'application/pdf', parents: ['root-id'], capabilities: { canShare: false } });
    check('delen van een bestand waarop Google delen verbiedt → DRIVE_DELEN_NIET_TOEGESTAAN, geen verzoek',
      /^DRIVE_DELEN_NIET_TOEGESTAAN/.test(tekstVan(await roep('drive_share_file', { file_id: 'deel-nee', emails: ['x@example.org'], role: 'reader' }))));
    check('«iedereen met de link» als «writer» wordt al door het hulpmiddel geweigerd (DRIVE_IEDEREEN_SCHRIJVEN)',
      /^DRIVE_IEDEREEN_SCHRIJVEN/.test(tekstVan(await roep('drive_share_file', { file_id: 'deel-1', role: 'writer', general_access: 'anyone_with_link' }))));
    let stapOpFout = '';
    const s1 = await metMens(roep('drive_share_file', { file_id: 'deel-1', emails: ['frank@example.org'], role: 'writer', notify: true, message: 'Graag nakijken' }), async (item) => {
      try { await ab.bevestig({ userId: U, id: item.id, ruimte: 'prive', hash: item.hash, stapOp: false }); } catch (e) { stapOpFout = (e as { code?: string }).code || ''; }
      await bevestig(true)(item);
    });
    const recht1 = nep.rechten.find((r) => r.bestand === 'deel-1');
    check('delen (hoog risico): zonder verse passkey geweigerd; met passkey precies één recht «writer» voor die ene persoon, met de e-mail van Google',
      stapOpFout === 'STEP_UP_STRONG_REQUIRED' && s1.zonderBesluit.rechten === 0 && jsonVan(s1.res).status === 'uitgevoerd' && nep.rechten.length === 1
      && recht1?.lichaam.type === 'user' && recht1.lichaam.role === 'writer' && recht1.lichaam.emailAddress === 'frank@example.org' && recht1.melden === 'true' && recht1.bericht === 'Graag nakijken');
    let keuzeFout = '';
    const s2 = await metMens(roep('drive_share_file', { file_id: 'deel-1', role: 'reader', general_access: 'anyone_with_link' }), async (item) => {
      try { await ab.bevestig({ userId: U, id: item.id, ruimte: 'prive', hash: item.hash, stapOp: true }); } catch (e) { keuzeFout = (e as { code?: string }).code || ''; }
      await bevestig(true, { iedereen: true })(item);
    });
    const iedereen = nep.rechten.find((r) => r.lichaam.type === 'anyone');
    check('«iedereen met de link»: kritiek risico, en ZONDER het aparte vinkje van de mens geweigerd (BEVESTIGING_KEUZE_VEREIST); met vinkje één recht «anyone» als lezer',
      s2.item?.risico === 'kritiek' && s2.item.beschrijving?.keuzes?.some((k) => k.id === 'iedereen' && k.verplicht) === true && keuzeFout === 'BEVESTIGING_KEUZE_VEREIST'
      && jsonVan(s2.res).status === 'uitgevoerd' && iedereen?.lichaam.role === 'reader' && iedereen.lichaam.allowFileDiscovery === false && nep.rechten.length === 2);

    // ---------------------------------------------------------------- foto's: de mens kiest zelf in de kiezer van Google
    const routes = dr.devRechtenGebruikerRoutes({ requireSession: async () => ({ user: { id: U, email, status: 'approved' }, service: 'mcp' }) as never });
    const route = async (pad: string, body: Record<string, unknown>) => {
      const r = await routes[pad][0]({ event: { headers: {} }, body: { service: 'mcp', ...body }, params: {} } as never) as { statusCode: number; body: string };
      let data: any = {}; try { data = JSON.parse(r.body); } catch { /* leeg */ }
      return { status: r.statusCode, data };
    };
    let sessieUri = '';
    const f1 = await metMens(roep('photos_picked_media', { reason: 'Voor het verslag', max_items: 3 }), async (item) => {
      const s = await route('POST /api/owner/ai-rechten/fotos/sessie', { bevestigingId: item.id });
      sessieUri = String(s.data.sessie?.pickerUri || '');
      const providerSessie = sessieUri.split('/picker/')[1]?.replace('/autoclose', '') || '';
      const nogNiet = await route('POST /api/owner/ai-rechten/fotos/stand', { sessieId: s.data.sessie?.id });
      nep.kies(providerSessie, 2);
      const klaar = await route('POST /api/owner/ai-rechten/fotos/stand', { sessieId: s.data.sessie?.id });
      check('foto’s: de kiezer opent op de site VOOR dit verzoek; eerst «selecting», na de keuze in Google «ready» met 2 foto’s',
        s.status === 200 && /^https:\/\/photos\.google\.com\/picker\//.test(sessieUri) && nogNiet.data.status === 'selecting' && klaar.data.status === 'ready' && klaar.data.items?.length === 2, JSON.stringify([s.data, klaar.data]).slice(0, 300));
      await ab.bevestig({ userId: U, id: item.id, ruimte: 'prive', hash: item.hash, stapOp: false, keuze: { sessie: s.data.sessie?.id } });
    });
    const fr = jsonVan(f1.res);
    check('foto’s: de AI krijgt alleen de gekozen items (metadata), niet de bibliotheek en niet de baseUrl',
      fr.status === 'uitgevoerd' && fr.resultaat?.items?.length === 2 && fr.resultaat.items.every((x: { filename?: string; baseUrl?: string }) => /^foto-\d\.png$/.test(String(x.filename)) && x.baseUrl === undefined) && !tekstVan(f1.res).includes('googleusercontent'), JSON.stringify(fr).slice(0, 300));
    const beelden = await roep('photos_picked_media', { bevestiging_id: fr.bevestiging_id, include_images: true });
    check('foto’s met include_images: kleine afbeeldingen als MCP-beeld (opgehaald door de server met het token, nooit de link)',
      beelden.content.filter((c) => (c as { type: string }).type === 'image').length === 2 && nep.verzoeken.some((v) => v.url.includes('nep-photos.googleusercontent.com') && v.url.endsWith('=w512-h512') && !!v.koppen.authorization));
    const andereSessie = await metMens(roep('photos_picked_media', {}), async (item) => {
      await ab.bevestig({ userId: U, id: item.id, ruimte: 'prive', hash: item.hash, stapOp: false, keuze: { sessie: 'sessie-van-elders-123' } }).catch(() => undefined);
      await ab.weiger({ userId: U, id: item.id, ruimte: 'prive' }).catch(() => undefined);
    });
    check('foto’s: een kiezersessie die niet voor DIT verzoek geopend werd, telt niet (FOTOS_SESSIE_ONBEKEND)',
      ['mislukt', 'geweigerd'].includes(jsonVan(andereSessie.res).status) && (jsonVan(andereSessie.res).status !== 'mislukt' || jsonVan(andereSessie.res).fout === 'FOTOS_SESSIE_ONBEKEND'));

    // ---------------------------------------------------------------- «Надати доступ» en de stand
    const stand = await route('POST /api/owner/ai-rechten/google-stand', {});
    check('stand per dienst voor het paneel: Gmail mag verzenden, Drive mag schrijven, foto’s mogen gekozen worden',
      stand.status === 200 && stand.data.google?.verzenden?.recht === true && stand.data.google?.drive?.recht === true && stand.data.google?.fotos?.recht === true, JSON.stringify(stand.data).slice(0, 300));
    const toegang = await route('POST /api/owner/ai-rechten/google-toegang', { dienst: 'mail', locale: 'nl' });
    check('«Надати доступ»: de route start de incrementele toestemming van de bestaande koppeling (of zegt eerlijk waarom niet)',
      (toegang.status === 200 && /^https:\/\/accounts\.google\.com\//.test(String(toegang.data.authUrl))) || (toegang.status === 409 && /^GOOGLE_SUITE_/.test(String(toegang.data.error))), JSON.stringify(toegang));
    check('«Надати доступ» voor een onbekende dienst → geweigerd', (await route('POST /api/owner/ai-rechten/google-toegang', { dienst: 'contacten' })).status === 409);

    // ---------------------------------------------------------------- iCloud: koppelen (nagebootst) en lezen
    const geenIcloud = await roep('icloud_list_events', {});
    check('iCloud niet gekoppeld → ICLOUD_NIET_GEKOPPELD (uk + nl) met de link naar de agenda (#icloud)', geenIcloud.isError === true && /^ICLOUD_NIET_GEKOPPELD/.test(tekstVan(geenIcloud)) && /agenda#icloud/.test(tekstVan(geenIcloud)));
    const morgen = new Date(Date.now() + 5 * 86400000);
    const stempel = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
    const dav: Array<{ methode: string; url: string; auth: string }> = [];
    caldav.zetCaldavVerzoekerVoorTest(async (v) => {
      dav.push({ methode: v.methode, url: v.url, auth: Buffer.from(`${v.gebruikersnaam}:${v.wachtwoord}`).toString('base64') });
      const ms = (xml: string) => new Response(`<?xml version="1.0"?><d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">${xml}</d:multistatus>`, { status: 207 });
      if (v.methode === 'PROPFIND' && v.url === 'https://caldav.icloud.com/') return ms('<d:response><d:href>/</d:href><d:propstat><d:prop><d:current-user-principal><d:href>/123456789/principal/</d:href></d:current-user-principal></d:prop></d:propstat></d:response>');
      if (v.methode === 'PROPFIND' && v.url === 'https://caldav.icloud.com/123456789/principal/') return ms('<d:response><d:href>/123456789/principal/</d:href><d:propstat><d:prop><c:calendar-home-set><d:href>https://p63-caldav.icloud.com:443/123456789/calendars/</d:href></c:calendar-home-set></d:prop></d:propstat></d:response>');
      if (v.methode === 'PROPFIND' && v.url === 'https://p63-caldav.icloud.com/123456789/calendars/') return ms('<d:response><d:href>/123456789/calendars/</d:href><d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop></d:propstat></d:response><d:response><d:href>/123456789/calendars/home/</d:href><d:propstat><d:prop><d:resourcetype><d:collection/><c:calendar/></d:resourcetype><d:displayname>Thuis</d:displayname></d:prop></d:propstat></d:response>');
      if (v.methode === 'REPORT' && v.url === 'https://p63-caldav.icloud.com/123456789/calendars/home/') {
        const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT', 'UID:icloud-1@example.org', `DTSTART:${stempel(morgen)}`, `DTEND:${stempel(new Date(morgen.getTime() + 3600000))}`, 'SUMMARY:Tandarts', 'LOCATION:Gent', 'END:VEVENT', 'END:VCALENDAR'].join('&#13;\n');
        return ms(`<d:response><d:href>/123456789/calendars/home/een.ics</d:href><d:propstat><d:prop><d:getetag>"e1"</d:getetag><c:calendar-data>${ics}</c:calendar-data></d:prop></d:propstat></d:response>`);
      }
      return new Response('', { status: 404 });
    });
    const koppel = await cloudLade(lade, 'agenda', () => caldav.caldavKoppelen(U, { adres: 'https://caldav.icloud.com/', gebruikersnaam: 'piet@icloud.com', wachtwoord: 'abcd-efgh-ijkl-mnop', naam: 'iCloud' }));
    check('iCloud koppelen met Apple ID + app-wachtwoord: principal op caldav.icloud.com, agenda’s op de partitiehost van Apple; het wachtwoord gaat alleen als Basic-aanmelding mee',
      koppel.ok === true && koppel.account.agendas[0]?.url === 'https://p63-caldav.icloud.com/123456789/calendars/home/' && koppel.account.agendas[0]?.naam === 'Thuis'
      && dav.every((d) => d.auth === Buffer.from('piet@icloud.com:abcd-efgh-ijkl-mnop').toString('base64')), JSON.stringify(koppel).slice(0, 300));
    const geheim = (await sys.query("SELECT geheim FROM app.agenda_abonnement WHERE user_id = $1 AND bron = 'caldav'", [U])).rows[0]?.geheim;
    check('het app-wachtwoord staat versleuteld in de database, nooit in platte tekst', /^(v1|dek1)\./.test(String(geheim)) && !String(geheim).includes('abcd-efgh'));
    const ev = await roep('icloud_list_events', { refresh: true });
    const evData = jsonVan(ev).data;
    check('icloud_list_events: de AI leest de afspraak uit iCloud (titel, plaats, agenda), als onbetrouwbare gegevens; vernieuwen ging via REPORT op de pNN-host',
      !ev.isError && evData?.count === 1 && evData.events[0].title === 'Tandarts' && evData.events[0].location === 'Gent' && evData.events[0].calendar === 'Thuis'
      && /untrusted/.test(tekstVan(ev)) && dav.some((d) => d.methode === 'REPORT' && d.url.startsWith('https://p63-caldav.icloud.com/')), tekstVan(ev).slice(0, 400));
    check('icloud_list_events met een zoekwoord dat niet past → geen afspraken', jsonVan(await roep('icloud_list_events', { query: 'bestaatniet' })).data?.count === 0);

    // ---------------------------------------------------------------- connector v2: tools/list alleen met de optie aan
    const who = { userId: U, clientName: 'Claude', tokenId: `tok-${randomUUID()}`, agent: 'claude' as const, limietSleutel: 'x', ruimte: 'prive' as const };
    const naam = (n: string) => toolNaam(v2Optie(`${n}:gebruiker`)!, 'claude');
    const zonder = (await v2.v2Lijst(who as never, { kanten: ['gebruiker'], sleutels: ['v2_whoami:gebruiker', 'drive_browse:gebruiker'] }, 'prive')).map((t) => t.name);
    const met = await v2.v2Lijst(who as never, { kanten: ['gebruiker'], sleutels: ['v2_whoami:gebruiker', ...NIEUW.map((n) => `${n}:gebruiker`)] }, 'prive');
    check('tools/list (connector v2): zonder de opties staat geen van de zes erin', NIEUW.every((n) => !zonder.includes(naam(n))), zonder.join(','));
    check('tools/list (connector v2): met de opties aan staan alle zes erin, met uk-titel en de zin over de bevestiging',
      NIEUW.every((n) => met.some((t) => t.name === naam(n))) && met.filter((t) => NIEUW.some((n) => t.name === naam(n))).every((t) => /[А-Яа-яІіЇїЄє]/.test(String(t.title)))
      && /підтвердження/.test(String(met.find((t) => t.name === naam('mail_send'))?.description)), met.map((t) => t.name).join(','));
    const niet = await v2.v2Roep(who as never, { kanten: ['gebruiker'], sleutels: ['v2_whoami:gebruiker'] }, naam('mail_send'), { to: 'x@example.org', body: 'x' }, 'prive');
    check('tools/call van een niet-gegeven optie → PERMISSION_OFF; er ontstaat geen verzoek en er gaat niets weg',
      niet.isError === true && /^PERMISSION_OFF/.test(tekstVan(niet as ToolResult)) && nep.verzonden.length === 3);
  } catch (e) {
    check('onverwachte fout', false, String((e as Error)?.stack || e));
  } finally {
    caldav.zetCaldavVerzoekerVoorTest(null);
    dr.zetWachtVoorTest(null);
    nep.herstel();
    globalThis.fetch = echteFetch;
    for (const [n, w] of Object.entries(omgevingVoor)) { if (w === undefined) delete process.env[n]; else process.env[n] = w; }
    await sys.query('DELETE FROM app.ai_bevestiging WHERE user_id = $1', [U]).catch(() => undefined);
    await sys.query('DELETE FROM app.agenda_externe_gebeurtenis WHERE user_id = $1', [U]).catch(() => undefined);
    await sys.query('DELETE FROM app.agenda_abonnement WHERE user_id = $1', [U]).catch(() => undefined);
    await sys.query('DELETE FROM app.mail_drafts WHERE user_id = $1', [U]).catch(() => undefined);
    await sys.query("DELETE FROM app.records WHERE (data->>'ownerUserId') = $1", [U]).catch(() => undefined);
    await sys.query("DELETE FROM app.records WHERE tbl = 'users' AND id = $1", [U]).catch(() => undefined);
  }
  await closePool();
  return einde();
}
