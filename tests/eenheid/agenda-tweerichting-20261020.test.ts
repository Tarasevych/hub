// Opdracht van de eigenaar (20.10.2026): «досить кнопок-пустушок» — de agenda moet ECHT tweerichtings zijn.
// Deze test toetst dat met de werkelijke servercode tegen een nagebootste Google Calendar
// (tests/eenheid/hulp/nep-kalender.ts): er gaat niets naar buiten, maar de regels zijn die van Google.
//
// Wat hier bewezen wordt:
//   1. de scopes en het DOORGROEIEN van de toestemming (incrementele autorisatie, geen nieuwe koppeling);
//   2. aanmaken, wijzigen, verplaatsen, verwijderen, deelnemers en RSVP;
//   3. een versieconflict (etag / If-Match → 412): er wordt NIETS overschreven en de Google-versie komt terug;
//   4. incrementele synchronisatie met syncToken en herstel na 410 GONE;
//   5. idempotentie: dezelfde sleutel twee keer verandert niets twee keer;
//   6. de catalogus en de pagina zeggen hetzelfde als de code (eerlijkheid).
import { createCipheriv, createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { db } from '../../server/platform';
import {
  AGENDA_FOUT, GOOGLE_GEBEURTENIS_ID, IDEMPOTENTIE_SLEUTEL, WAARHEIDSBRON, gebeurtenisIdUitDigest,
  herhalingUitRrule, herhalingUitleg, herhalingUitRrule as uitRrule, isoDag, maandRaster, naarGoogleLichaam,
  normaliseerDeelnemers, normaliseerHerhaling, normaliseerHerinneringen, opDag, rruleUitHerhaling, schrijfUitslag,
  uitGoogleGebeurtenis, vormFouten, weekBegin, weekDagen,
} from '../../shared/agenda-model';
import { AGENDA_AANBIEDERS, agendaAanbieder, agendaKaartStand } from '../../shared/agenda-catalogus';
import { checker } from './hulp/nep-google';
import { nepKalender } from './hulp/nep-kalender';

const lees = (pad: string) => readFileSync(pad, 'utf8');
const LEES = 'https://www.googleapis.com/auth/calendar.readonly';
const SCHRIJF = 'https://www.googleapis.com/auth/calendar.events';
const CLIENT_REF = 'google_suite_web_oauth_client';
const GRANT_SLEUTEL = 'eenheidstest-agenda-sleutel-32-tekens-minstens';

/** Dezelfde envelop die backend/google-suite-inrichting.ts maakt (AES-256-GCM met de rij als AAD). */
const envelop = (plat: string, ownerUserId: string, principalId: string, providerAccountId: string) => {
  const sleutel = createHash('sha256').update(GRANT_SLEUTEL, 'utf8').digest();
  const iv = Buffer.alloc(12, 7);
  const cipher = createCipheriv('aes-256-gcm', sleutel, iv);
  cipher.setAAD(Buffer.from(`google-oauth-grant-v1|${ownerUserId}|${principalId}|${providerAccountId}|${CLIENT_REF}`, 'utf8'));
  const ct = Buffer.concat([cipher.update(plat, 'utf8'), cipher.final()]);
  return { algorithm: 'AES-256-GCM' as const, keyVersion: 1 as const, ciphertext: ct.toString('base64'), iv: iv.toString('base64'), authTag: cipher.getAuthTag().toString('base64') };
};

export async function main(): Promise<number> {
  const { check, einde } = checker('agenda-tweerichting-20261020');
  // Alle testbestanden lopen in ÉÉN node-proces: wat deze test aan fetch of aan de omgeving verandert, moet
  // daarna weer precies zijn zoals het was. Anders breekt deze test een andere, en dat is onvindbaar.
  const echteFetchVoor = globalThis.fetch;
  const omgevingVoor = Object.fromEntries(['GOOGLE_SUITE_CLIENT_ID', 'GOOGLE_SUITE_CLIENT_SECRET', 'GOOGLE_OAUTH_GRANT_ENCRYPTION_KEY_V1']
    .map((naam) => [naam, process.env[naam]]));
  const omgevingTerug = () => { for (const [naam, waarde] of Object.entries(omgevingVoor)) { if (waarde === undefined) delete process.env[naam]; else process.env[naam] = waarde; } };

  // ================================================================ 1. zuivere regels (geen database nodig)
  check('model: de waarheidsbron staat vast in de code — Google wint bij een conflict, lokaal alleen tot de eerste insert',
    WAARHEIDSBRON.google.includes('etag') && WAARHEIDSBRON.lokaal.includes('insert') && WAARHEIDSBRON.extern.includes('alleen_lezen'));
  check('model: een HTTP-antwoord van Google wordt juist gelezen (412 = conflict, 404/410 = weg, 409 = bestaat, 403 = geen recht)',
    schrijfUitslag(200) === 'ok' && schrijfUitslag(204) === 'ok' && schrijfUitslag(412) === 'conflict'
    && schrijfUitslag(404) === 'weg' && schrijfUitslag(410) === 'weg' && schrijfUitslag(409) === 'bestaat'
    && schrijfUitslag(403) === 'geen-recht' && schrijfUitslag(500) === 'fout');
  check('idempotentie: de sleutel heeft een vaste vorm en het afgeleide Google-id is geldig base32hex',
    IDEMPOTENTIE_SLEUTEL.test('abc12345') && !IDEMPOTENTIE_SLEUTEL.test('te-kort') && !IDEMPOTENTIE_SLEUTEL.test('met spatie 123')
    && GOOGLE_GEBEURTENIS_ID.test(gebeurtenisIdUitDigest('a'.repeat(64)))
    && gebeurtenisIdUitDigest('a'.repeat(64)) === gebeurtenisIdUitDigest('a'.repeat(64))
    && gebeurtenisIdUitDigest('ZZZ') === '' && gebeurtenisIdUitDigest('') === '');
  check('idempotentie: het afgeleide id bevat alleen tekens die events.insert toestaat (a–v, 0–9)',
    /^[0-9a-v]+$/.test(gebeurtenisIdUitDigest('f'.repeat(64))));

  // ---- de vorm van een afspraak
  const getimed = { titel: 'Overleg', begin: '2026-11-03T09:00', einde: '2026-11-03T10:00', tijdzone: 'Europe/Brussels', agendaId: 'primary' };
  const lichaam = naarGoogleLichaam(getimed) as Record<string, any>;
  check('vorm → Google: een afspraak met tijd krijgt dateTime met zone en standaardherinneringen',
    lichaam.start.dateTime === '2026-11-03T09:00:00' && lichaam.start.timeZone === 'Europe/Brussels'
    && lichaam.end.dateTime === '2026-11-03T10:00:00' && lichaam.reminders.useDefault === true && lichaam.summary === 'Overleg');
  const heelDag = naarGoogleLichaam({ titel: 'Vakantie', heleDag: true, begin: '2026-12-24', einde: '2026-12-26' }) as Record<string, any>;
  check('vorm → Google: een hele-dag-afspraak krijgt `date` en een EXCLUSIEF einde (24–26 wordt 24 t/m 27)',
    heelDag.start.date === '2026-12-24' && heelDag.end.date === '2026-12-27' && heelDag.start.dateTime === undefined);
  const metAlles = naarGoogleLichaam({
    titel: 'Standup', begin: '2026-11-03T09:00', einde: '2026-11-03T09:15', tijdzone: 'Europe/Brussels',
    deelnemers: [{ email: 'a@example.org', naam: 'A' }, { email: 'b@example.org', optioneel: true }, { email: 'kapot' }],
    herhaling: { frequentie: 'wekelijks', interval: 1, aantal: 10, dagen: ['MO', 'WE'] },
    standaardHerinneringen: false, herinneringen: [{ methode: 'popup', minuten: 10 }, { methode: 'email', minuten: 1440 }],
  }) as Record<string, any>;
  check('vorm → Google: deelnemers (ongeldige adressen vallen weg), RRULE en eigen herinneringen gaan mee',
    metAlles.attendees.length === 2 && metAlles.attendees[1].optional === true
    && metAlles.recurrence[0] === 'RRULE:FREQ=WEEKLY;COUNT=10;BYDAY=MO,WE'
    && metAlles.reminders.useDefault === false && metAlles.reminders.overrides.length === 2
    && metAlles.reminders.overrides[1].method === 'email' && metAlles.reminders.overrides[1].minutes === 1440);
  check('vorm: wat de server weigert, weigert de browser ook — titel, begin, einde en de orde',
    vormFouten({}).includes(AGENDA_FOUT ? 'AGENDA_TITEL_VEREIST' : '')
    && vormFouten({ titel: 'x', begin: '2026-11-03T10:00', einde: '2026-11-03T09:00' }).includes('AGENDA_EINDE_VOOR_BEGIN')
    && vormFouten({ titel: 'x', heleDag: true, begin: '2026-11-03', einde: '2026-11-03' }).length === 0
    && vormFouten(getimed).length === 0);
  check('herhaling: RRULE heen en terug levert hetzelfde op (en onbekende onderdelen worden niet verzonnen)',
    rruleUitHerhaling(normaliseerHerhaling({ frequentie: 'dagelijks', interval: 3, tot: '2026-12-31' })) === 'RRULE:FREQ=DAILY;INTERVAL=3;UNTIL=20261231T235959Z'
    && uitRrule('RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,TH').frequentie === 'wekelijks'
    && uitRrule('RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,TH').dagen.join(',') === 'TU,TH'
    && herhalingUitRrule('RRULE:FREQ=MONTHLY;BYSETPOS=-1;BYDAY=FR').frequentie === 'maandelijks'
    && herhalingUitRrule('onzin').frequentie === 'geen' && rruleUitHerhaling({ frequentie: 'geen' }) === '');
  check('herhaling: COUNT en UNTIL sluiten elkaar uit, en de uitleg is tweetalig',
    normaliseerHerhaling({ frequentie: 'dagelijks', aantal: 5, tot: '2026-12-31' }).tot === ''
    && herhalingUitleg(normaliseerHerhaling({ frequentie: 'wekelijks', dagen: ['MO'], aantal: 3 }), 'uk').includes('раз')
    && herhalingUitleg(normaliseerHerhaling({ frequentie: 'wekelijks', dagen: ['MO'], aantal: 3 }), 'nl').includes('keer'));
  check('herinneringen en deelnemers worden begrensd en ontdubbeld',
    normaliseerHerinneringen([{ methode: 'popup', minuten: 10 }, { methode: 'popup', minuten: 10 }]).length === 1
    && normaliseerHerinneringen(Array.from({ length: 9 }, (_, i) => ({ methode: 'popup', minuten: i }))).length === 5
    && normaliseerHerinneringen([{ methode: 'popup', minuten: 999999 }]).length === 0
    && normaliseerDeelnemers([{ email: 'A@Example.org' }, { email: 'a@example.org' }]).length === 1
    && normaliseerDeelnemers([{ email: 'geen-adres' }]).length === 0);
  const terug = uitGoogleGebeurtenis({
    id: 'abc12345', etag: '"v1"', summary: 'Heen en terug', start: { dateTime: '2026-11-03T09:00:00+01:00', timeZone: 'Europe/Brussels' },
    end: { dateTime: '2026-11-03T10:00:00+01:00', timeZone: 'Europe/Brussels' }, recurrence: ['RRULE:FREQ=DAILY;COUNT=2'],
    attendees: [{ email: 'zelf@example.org', self: true, responseStatus: 'accepted' }], reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 15 }] },
  }, 'primary');
  check('Google → vorm: id, etag, tijd, zone, herhaling, deelnemer «zelf» en herinneringen komen terug',
    terug.gebeurtenisId === 'abc12345' && terug.etag === '"v1"' && terug.begin === '2026-11-03T09:00'
    && terug.tijdzone === 'Europe/Brussels' && terug.herhaling.frequentie === 'dagelijks' && terug.herhaling.aantal === 2
    && terug.deelnemers[0].zelf === true && terug.deelnemers[0].antwoord === 'accepted'
    && terug.standaardHerinneringen === false && terug.herinneringen[0].minuten === 15);
  const heleDagTerug = uitGoogleGebeurtenis({ id: 'd1', summary: 'x', start: { date: '2026-12-24' }, end: { date: '2026-12-27' } });
  check('Google → vorm: een hele-dag-afspraak krijgt een INCLUSIEF einde terug (27 wordt 26)',
    heleDagTerug.heleDag === true && heleDagTerug.begin === '2026-12-24' && heleDagTerug.einde === '2026-12-26');
  check('raster: zes volle weken, maandag eerst, en «valt op deze dag» werkt ook over meerdere dagen',
    maandRaster(2026, 11).length === 6 && maandRaster(2026, 11)[0].length === 7
    && weekBegin('2026-11-04') === '2026-11-02' && weekDagen('2026-11-04')[0] === '2026-11-02'
    && opDag({ begin: '2026-11-03', einde: '2026-11-05', heleDag: true }, '2026-11-04')
    && !opDag({ begin: '2026-11-03', einde: '2026-11-05', heleDag: true }, '2026-11-06')
    && isoDag(new Date('2026-11-04T23:00:00Z')) === '2026-11-04');

  // ================================================================ 2. de scopes en de uitbreiding van de toestemming
  const onboarding = lees('backend/google-suite-inrichting.ts');
  check('scopes: de server vraagt nu ÉN calendar.readonly ÉN calendar.events',
    /auth\/calendar\.readonly/.test(onboarding) && /auth\/calendar\.events/.test(onboarding)
    && /AGENDA_SCHRIJF_SCOPE = 'https:\/\/www\.googleapis\.com\/auth\/calendar\.events'/.test(onboarding));
  const { googleSuitePolicySelfTest } = await import('../../backend/google-suite-inrichting');
  const zelftest = googleSuitePolicySelfTest();
  const zelf = (id: string) => zelftest.find((t) => t.id === id)?.passed === true;
  check('toestemming: de URL vraagt beide agenda-scopes, met include_granted_scopes (incrementele autorisatie) en PKCE S256',
    zelf('suite-calendar-readonly-scope') && zelf('suite-calendar-write-scope') && zelf('suite-incremental-authorization') && zelf('suite-pkce-s256'));
  check('uitbreiding: er is een APARTE stap die alleen de toestemming uitbreidt, niet opnieuw koppelt',
    /googleSuiteStartAgendaUitbreiding/.test(onboarding) && /forceConsent: true/.test(onboarding)
    && /googleSuiteAgendaScopeStatus/.test(onboarding)
    && /uitbreidingNodig: lezen && !schrijven/.test(onboarding));

  // ================================================================ 3. werkelijk schrijven (database + nep-Google)
  process.env.GOOGLE_SUITE_CLIENT_ID = 'eenheidstest.apps.googleusercontent.com';
  process.env.GOOGLE_SUITE_CLIENT_SECRET = 'eenheidstest-client-secret-32-tekens-lang';
  process.env.GOOGLE_OAUTH_GRANT_ENCRYPTION_KEY_V1 = GRANT_SLEUTEL;
  const nep = nepKalender({ scopes: ['openid', 'email', 'profile', LEES] });
  const ownerUserId = `eigenaar-${randomUUID()}`;
  const subject = `sub-${randomUUID()}`;
  const email = `agenda-${randomUUID()}@example.test`;
  try {
    const nu = Date.now();
    const [principalId] = await db.add('provider_principals_v1', [{
      ownerUserId, provider: 'google', providerAccountId: subject, identityProviderAccountId: subject,
      email, displayName: 'Eenheidstest', picture: '', accountRole: 'primary', identityLinked: true, createdAt: nu, updatedAt: nu,
    }]);
    const env = envelop('nep-refresh-token', ownerUserId, String(principalId), subject);
    const [grantId] = await db.add('google_oauth_grant_v1', [{
      ownerUserId, principalId, providerAccountId: subject, provider: 'google', clientRef: CLIENT_REF,
      tokenKind: 'refresh_token', ...env, grantedScopes: ['openid', 'email', 'profile', LEES],
      grantStatus: 'active', issuedAt: nu, lastVerifiedAt: nu, updatedAt: nu, revokedAt: 0,
    }]);
    const [handleId] = await db.add('provider_service_tokens_v1', [{
      ownerUserId, principalId, provider: 'google', service: 'calendar', tokenName: 'google_calendar_token',
      tokenKind: 'logical_handle', oauthGrantId: grantId, requiredScopes: [LEES], status: 'active', createdAt: nu, updatedAt: nu, revokedAt: 0,
    }]);
    await db.add('provider_service_grants_v1', [{
      ownerUserId, principalId, provider: 'google', service: 'calendar', tokenName: 'google_calendar_token',
      oauthClientName: CLIENT_REF, status: 'connected', accountId: principalId, grantedScopes: [LEES],
      runtimeBinding: 'calendar_tweerichting_lezen_en_schrijven', createdAt: nu, updatedAt: nu, disconnectedAt: 0,
    }]);

    const { googleSuiteAgendaScopeStatusVoorEmail } = await import('../../backend/google-suite-inrichting');
    const google = await import('../../backend/agenda-google');
    const spiegel = await import('../../backend/agenda-spiegel');
    const ctx = { ownerUserId, email };

    // ---- 3a. alleen-lezen: de stand is eerlijk en schrijven wordt geweigerd MET de uitbreidingsstap
    const standVoor = await googleSuiteAgendaScopeStatusVoorEmail(ownerUserId, email);
    check('stand: wie alleen-lezen koppelde, leest wel, schrijft niet, en krijgt te zien dat uitbreiden nodig is',
      standVoor.lezen === true && standVoor.schrijven === false && standVoor.uitbreidingNodig === true
      && standVoor.toevoegen.join(',') === SCHRIJF);
    nep.schoon();
    const geweigerd = await google.gebeurtenisAanmaken(ctx, { sleutel: `zonderrecht${randomUUID().slice(0, 8)}`, vorm: { ...getimed } });
    check('zonder schrijfrecht: aanmaken wordt geweigerd, er gaat GEEN verzoek naar de agenda, en de uitbreiding wordt aangeboden',
      geweigerd.ok === false && geweigerd.fout === AGENDA_FOUT.recht && geweigerd.uitbreiding?.scope === SCHRIJF
      && nep.verzoeken.filter((v) => v.pad.includes('/events')).length === 0);

    // ---- 3b. de toestemming uitbreiden: zelfde koppeling, één scope erbij
    await db.update('google_oauth_grant_v1', [{ id: String(grantId), record: {
      ownerUserId, principalId, providerAccountId: subject, provider: 'google', clientRef: CLIENT_REF,
      tokenKind: 'refresh_token', ...env, grantedScopes: ['openid', 'email', 'profile', LEES, SCHRIJF],
      grantStatus: 'active', issuedAt: nu, lastVerifiedAt: nu, updatedAt: Date.now(), revokedAt: 0 } }]);
    await db.update('provider_service_tokens_v1', [{ id: String(handleId), record: {
      ownerUserId, principalId, provider: 'google', service: 'calendar', tokenName: 'google_calendar_token',
      tokenKind: 'logical_handle', oauthGrantId: grantId, requiredScopes: [LEES, SCHRIJF], status: 'active',
      createdAt: nu, updatedAt: Date.now(), revokedAt: 0 } }]);
    nep.zetScopes(['openid', 'email', 'profile', LEES, SCHRIJF]);
    const standNa = await googleSuiteAgendaScopeStatusVoorEmail(ownerUserId, email);
    check('na de uitbreiding: dezelfde koppeling mag nu schrijven, zonder dat er iets anders verloren ging',
      standNa.lezen === true && standNa.schrijven === true && standNa.uitbreidingNodig === false
      && standNa.grantedScopes.includes('email'));

    // ---- 3c. aanmaken, met een eigen id uit de sleutel (dat IS de idempotentie)
    const sleutelA = `maak${randomUUID().replace(/-/g, '')}`.slice(0, 60);
    nep.schoon();
    const gemaakt = await google.gebeurtenisAanmaken(ctx, { sleutel: sleutelA, vorm: { ...getimed, titel: 'Eerste afspraak' } });
    const insert = nep.verzoeken.find((v) => v.methode === 'POST' && v.pad === '/calendar/v3/calendars/primary/events');
    const verwachtId = google.gebeurtenisIdVoor(ownerUserId, sleutelA);
    check('aanmaken: de afspraak staat werkelijk in de agenda, met het id dat uit de sleutel volgt',
      gemaakt.ok === true && gemaakt.gebeurtenisId === verwachtId && Boolean(gemaakt.etag)
      && String(insert?.lichaam?.id) === verwachtId && Boolean(nep.lees('primary', verwachtId)));
    const inSpiegel = await spiegel.spiegelZoek(ownerUserId, 'primary', verwachtId);
    check('aanmaken: de spiegel wordt meteen bijgewerkt (write-through), met de etag voor de volgende wijziging',
      inSpiegel?.summary === 'Eerste afspraak' && inSpiegel?.etag === gemaakt.etag && inSpiegel?.lokaalId === sleutelA);
    const koppeling = await spiegel.koppelLees(ownerUserId, sleutelA);
    check('aanmaken: de koppeling lokaal ↔ Google is vastgelegd en Google is nu de waarheidsbron',
      koppeling?.staat === 'klaar' && koppeling?.providerGebeurtenisId === verwachtId && koppeling?.waarheidsbron === 'google');

    nep.schoon();
    const nogEens = await google.gebeurtenisAanmaken(ctx, { sleutel: sleutelA, vorm: { ...getimed, titel: 'Tweede poging' } });
    check('idempotentie: dezelfde sleutel nog eens maakt GEEN tweede afspraak en stuurt niets naar Google',
      nogEens.ok === true && nogEens.uitslag === 'herhaald' && nogEens.gebeurtenisId === verwachtId
      && nep.verzoeken.filter((v) => v.pad.includes('/events')).length === 0
      && nep.agendas.get('primary')!.size === 1);

    // Twee verzoeken met dezelfde sleutel die tegelijk aankomen: de database kiest één winnaar, de ander stuurt
    // niets. Dat is de echte wedloop, niet een nagespeelde.
    const gelijk = `gelijk${randomUUID().replace(/-/g, '')}`.slice(0, 60);
    nep.schoon();
    const beide = await Promise.all([
      google.gebeurtenisAanmaken(ctx, { sleutel: gelijk, vorm: { ...getimed, titel: 'Tegelijk A' } }),
      google.gebeurtenisAanmaken(ctx, { sleutel: gelijk, vorm: { ...getimed, titel: 'Tegelijk B' } }),
    ]);
    check('idempotentie: twee gelijktijdige verzoeken met dezelfde sleutel leveren ÉÉN afspraak, één insert en twee gelijke antwoorden',
      beide.every((r) => r.ok === true) && new Set(beide.map((r) => r.gebeurtenisId)).size === 1
      && beide.filter((r) => r.uitslag === 'herhaald').length === 1
      && nep.verzoeken.filter((v) => v.methode === 'POST' && v.pad === '/calendar/v3/calendars/primary/events').length === 1
      && nep.agendas.get('primary')!.size === 2, JSON.stringify(beide.map((r) => r.uitslag)));

    // ---- 3d. wijzigen met versiecontrole
    nep.schoon();
    const gewijzigd = await google.gebeurtenisWijzigen(ctx, {
      sleutel: `wijzig${randomUUID().replace(/-/g, '')}`.slice(0, 60), agendaId: 'primary', gebeurtenisId: verwachtId,
      vorm: { ...getimed, titel: 'Bijgewerkt', gebeurtenisId: verwachtId },
    });
    const put = nep.verzoeken.find((v) => v.methode === 'PUT');
    check('wijzigen: de bekende etag gaat als If-Match mee, en de wijziging staat erna in de agenda',
      gewijzigd.ok === true && put?.koppen['if-match'] === inSpiegel?.etag
      && String(nep.lees('primary', verwachtId)?.summary) === 'Bijgewerkt' && gewijzigd.etag !== inSpiegel?.etag);

    // ---- 3e. het conflict: iemand wijzigt de afspraak in Google
    nep.wijzigBuitenOm('primary', verwachtId, { summary: 'In Google veranderd' });
    nep.schoon();
    const conflict = await google.gebeurtenisWijzigen(ctx, {
      sleutel: `conflict${randomUUID().replace(/-/g, '')}`.slice(0, 60), agendaId: 'primary', gebeurtenisId: verwachtId,
      etag: String(gewijzigd.etag), vorm: { ...getimed, titel: 'Mijn versie', gebeurtenisId: verwachtId },
    });
    check('conflict: een oude etag levert 412 — NIETS wordt overschreven en de verse Google-versie komt terug',
      conflict.ok === false && conflict.uitslag === 'conflict' && conflict.fout === AGENDA_FOUT.conflict
      && conflict.google?.titel === 'In Google veranderd'
      && String(nep.lees('primary', verwachtId)?.summary) === 'In Google veranderd');
    const naConflict = await spiegel.spiegelZoek(ownerUserId, 'primary', verwachtId);
    check('conflict: de spiegel krijgt meteen de ECHTE versie, zodat de volgende poging niet weer op dezelfde etag stuit',
      naConflict?.summary === 'In Google veranderd' && naConflict?.etag === nep.lees('primary', verwachtId)?.etag);
    nep.schoon();
    const bewust = await google.gebeurtenisWijzigen(ctx, {
      sleutel: `negeer${randomUUID().replace(/-/g, '')}`.slice(0, 60), agendaId: 'primary', gebeurtenisId: verwachtId,
      negeerVersie: true, vorm: { ...getimed, titel: 'Toch mijn versie', gebeurtenisId: verwachtId },
    });
    check('bewust overschrijven: alleen met negeerVersie gaat er GEEN If-Match mee — nooit stilzwijgend',
      bewust.ok === true && nep.verzoeken.find((v) => v.methode === 'PUT')?.koppen['if-match'] === undefined
      && String(nep.lees('primary', verwachtId)?.summary) === 'Toch mijn versie');

    // ---- 3f. deelnemers en RSVP
    const metGasten = nep.zet('primary', {
      id: 'gasten0001', summary: 'Met gasten', start: { dateTime: '2026-11-10T09:00:00', timeZone: 'Europe/Brussels' },
      end: { dateTime: '2026-11-10T10:00:00', timeZone: 'Europe/Brussels' },
      attendees: [{ email, self: true, responseStatus: 'needsAction' }, { email: 'ander@example.org', responseStatus: 'accepted' }],
    });
    nep.schoon();
    const gasten = await google.gebeurtenisDeelnemers(ctx, {
      sleutel: `gast${randomUUID().replace(/-/g, '')}`.slice(0, 60), agendaId: 'primary', gebeurtenisId: 'gasten0001',
      etag: metGasten.etag, toevoegen: [{ email: 'nieuw@example.org' }], verwijderen: [{ email: 'ander@example.org' }],
    });
    const gastenLijst = (nep.lees('primary', 'gasten0001')?.attendees || []) as Array<{ email: string }>;
    check('deelnemers: toevoegen en verwijderen in één keer, zonder de rest van de afspraak aan te raken',
      gasten.ok === true && gastenLijst.length === 2
      && gastenLijst.some((d) => d.email === 'nieuw@example.org') && !gastenLijst.some((d) => d.email === 'ander@example.org')
      && gastenLijst.some((d) => d.email === email));
    const rsvpEtag = String(nep.lees('primary', 'gasten0001')?.etag || '');
    nep.schoon();
    const rsvp = await google.gebeurtenisAntwoord(ctx, {
      sleutel: `rsvp${randomUUID().replace(/-/g, '')}`.slice(0, 60), agendaId: 'primary', gebeurtenisId: 'gasten0001',
      antwoord: 'declined', etag: rsvpEtag,
    });
    const patch = nep.verzoeken.find((v) => v.methode === 'PATCH');
    const naRsvp = (nep.lees('primary', 'gasten0001')?.attendees || []) as Array<{ email: string; responseStatus: string }>;
    check('RSVP: alleen het EIGEN antwoord verandert (patch met attendees), met If-Match en met de andere gasten intact',
      rsvp.ok === true && patch?.koppen['if-match'] === rsvpEtag && Object.keys(patch?.lichaam || {}).join(',') === 'attendees'
      && naRsvp.find((d) => d.email === email)?.responseStatus === 'declined'
      && naRsvp.find((d) => d.email === 'nieuw@example.org')?.responseStatus === 'needsAction');

    // ---- 3g. verplaatsen naar een andere agenda, met versiecontrole
    const teVerplaatsen = nep.zet('primary', { id: 'verplaats01', summary: 'Verhuist', start: { date: '2026-11-20' }, end: { date: '2026-11-21' } });
    nep.schoon();
    const misVerplaats = await google.gebeurtenisVerplaatsen(ctx, {
      sleutel: `mv1${randomUUID().replace(/-/g, '')}`.slice(0, 60), agendaId: 'primary', gebeurtenisId: 'verplaats01',
      naarAgendaId: 'werk@example.org', etag: '"oude-versie"',
    });
    check('verplaatsen: events.move kent geen If-Match, dus de etag wordt zelf nagekeken — bij verschil géén verplaatsing',
      misVerplaats.ok === false && misVerplaats.uitslag === 'conflict'
      && nep.verzoeken.every((v) => !v.pad.endsWith('/move')) && Boolean(nep.lees('primary', 'verplaats01')));
    nep.schoon();
    const verplaatst = await google.gebeurtenisVerplaatsen(ctx, {
      sleutel: `mv2${randomUUID().replace(/-/g, '')}`.slice(0, 60), agendaId: 'primary', gebeurtenisId: 'verplaats01',
      naarAgendaId: 'werk@example.org', etag: teVerplaatsen.etag,
    });
    check('verplaatsen: met de juiste versie verhuist de afspraak werkelijk naar de andere agenda',
      verplaatst.ok === true && verplaatst.agendaId === 'werk@example.org'
      && !nep.lees('primary', 'verplaats01') && Boolean(nep.lees('werk@example.org', 'verplaats01')));

    // ---- 3h. verwijderen
    const teWissen = nep.zet('primary', { id: 'wissen0001', summary: 'Weg', start: { date: '2026-11-25' }, end: { date: '2026-11-26' } });
    await spiegel.spiegelLeg(ownerUserId, spiegel.spiegelRijUitGoogle(ownerUserId, String(principalId), 'primary', teWissen));
    nep.schoon();
    const gewist = await google.gebeurtenisVerwijderen(ctx, {
      sleutel: `wis${randomUUID().replace(/-/g, '')}`.slice(0, 60), agendaId: 'primary', gebeurtenisId: 'wissen0001',
    });
    check('verwijderen: met If-Match van de bekende versie, en daarna is de afspraak weg uit Google én uit de spiegel',
      gewist.ok === true && nep.verzoeken.find((v) => v.methode === 'DELETE')?.koppen['if-match'] === teWissen.etag
      && !nep.lees('primary', 'wissen0001') && !(await spiegel.spiegelZoek(ownerUserId, 'primary', 'wissen0001')));
    nep.schoon();
    const alWeg = await google.gebeurtenisVerwijderen(ctx, {
      sleutel: `wis2${randomUUID().replace(/-/g, '')}`.slice(0, 60), agendaId: 'primary', gebeurtenisId: 'bestaat-niet-001',
    });
    check('verwijderen: een afspraak die al weg is, telt als gelukt (de bedoeling is bereikt)', alWeg.ok === true && alWeg.uitslag === 'ok');

    // ---- 3i. incrementele synchronisatie: syncToken en 410 GONE
    const sync = await import('../../backend/google-suite-agenda-sync');
    const principal = { id: String(principalId), ownerUserId, accountRole: 'primary' };
    nep.planLijst([{ items: [{ id: 'sync0001', etag: '"s1"', status: 'confirmed', summary: 'Uit Google', start: { dateTime: '2026-12-01T09:00:00' }, end: { dateTime: '2026-12-01T10:00:00' }, updated: new Date().toISOString() }], nextSyncToken: 'token-1' }]);
    nep.schoon();
    const eerste = await sync.synchroniseerAgendaVoorPrincipal(principal);
    const eersteVraag = nep.verzoeken.find((v) => v.methode === 'GET' && v.pad === '/calendar/v3/calendars/primary/events');
    check('synchronisatie: de eerste ronde vraagt ZONDER syncToken, met showDeleted=true, en bewaart het token',
      eerste.recht === true && !new URL(String(eersteVraag?.url)).searchParams.get('syncToken')
      && new URL(String(eersteVraag?.url)).searchParams.get('showDeleted') === 'true'
      && Boolean(await spiegel.spiegelZoek(ownerUserId, 'primary', 'sync0001')));
    check('synchronisatie: de vraag bevat geen parameter die Google samen met syncToken verbiedt (orderBy, q, timeMin, timeMax, updatedMin)',
      ['orderBy', 'q', 'timeMin', 'timeMax', 'updatedMin', 'iCalUID'].every((p) => !new URL(String(eersteVraag?.url)).searchParams.get(p)));
    nep.planLijst([{ items: [{ id: 'sync0001', etag: '"s2"', status: 'cancelled' }], nextSyncToken: 'token-2' }]);
    nep.schoon();
    await sync.synchroniseerAgendaVoorPrincipal(principal);
    const tweedeVraag = nep.verzoeken.find((v) => v.methode === 'GET' && v.pad === '/calendar/v3/calendars/primary/events');
    check('synchronisatie: de tweede ronde gebruikt het bewaarde syncToken en haalt een gewiste afspraak uit de spiegel',
      new URL(String(tweedeVraag?.url)).searchParams.get('syncToken') === 'token-1'
      && !(await spiegel.spiegelZoek(ownerUserId, 'primary', 'sync0001')));
    nep.planLijst([{ items: [{ id: 'blijft01', etag: '"b1"', status: 'confirmed', summary: 'Blijft', start: { date: '2026-12-05' }, end: { date: '2026-12-06' } }], nextSyncToken: 'token-3' }]);
    await sync.synchroniseerAgendaVoorPrincipal(principal);
    nep.planLijst([{ status: 410 }, { items: [{ id: 'nanieuw01', etag: '"n1"', status: 'confirmed', summary: 'Na herstel', start: { date: '2026-12-07' }, end: { date: '2026-12-08' } }], nextSyncToken: 'token-4' }]);
    const gone = await sync.synchroniseerAgendaVoorPrincipal(principal);
    const herstel = (gone.resultaten as Array<Record<string, unknown>>)[0];
    check('synchronisatie: 410 GONE → de spiegel van die agenda wordt leeggegooid en er volgt een VOLLEDIGE hersynchronisatie',
      herstel?.herstel === true && !(await spiegel.spiegelZoek(ownerUserId, 'primary', 'blijft01')));
    nep.schoon();
    await sync.synchroniseerAgendaVoorPrincipal(principal);
    const naHerstel = nep.verzoeken.find((v) => v.methode === 'GET' && v.pad === '/calendar/v3/calendars/primary/events');
    check('synchronisatie: na het herstel gaat er weer géén syncToken mee, en de nieuwe afspraak komt binnen',
      !new URL(String(naHerstel?.url)).searchParams.get('syncToken')
      && Boolean(await spiegel.spiegelZoek(ownerUserId, 'primary', 'nanieuw01')));

    // ---- 3j. de agendalijst zegt eerlijk wat beschrijfbaar is
    const lijst = await google.agendaLijst(ctx);
    check('agenda\'s: de lijst zegt per agenda of ER WERKELIJK in geschreven kan worden (rol van Google × ons recht)',
      !('fout' in lijst) && lijst.schrijven === true && lijst.agendas[0].schrijfbaar === true && lijst.agendas[0].primair === true);
  } finally {
    nep.herstel();
    omgevingTerug();
  }
  check('testhulp: fetch en de omgeving staan weer zoals ze waren (geen lek naar de andere testbestanden)',
    globalThis.fetch === echteFetchVoor && process.env.GOOGLE_SUITE_CLIENT_ID === omgevingVoor.GOOGLE_SUITE_CLIENT_ID
    && process.env.GOOGLE_OAUTH_GRANT_ENCRYPTION_KEY_V1 === omgevingVoor.GOOGLE_OAUTH_GRANT_ENCRYPTION_KEY_V1);

  // ================================================================ 4. eerlijkheid: catalogus, routes en pagina
  const catalogus = lees('shared/agenda-catalogus.ts');
  const googleKaart = agendaAanbieder('google-calendar')!;
  check('catalogus: Google Calendar staat nu op «lezen en schrijven», met wat er nog NIET kan',
    googleKaart.stand === 'beschikbaar' && googleKaart.richting === 'lezen-en-schrijven'
    && Boolean(googleKaart.beperking) && /Meet/.test(googleKaart.beperking![1]) && /free\/busy/.test(googleKaart.beperking![1]));
  check('catalogus: elke kaart met «binnenkort» heeft nog steeds geen koppelknop en zegt wat ontbreekt',
    AGENDA_AANBIEDERS.filter((a) => a.stand === 'binnenkort').every((a) => !a.doel && !a.levend && a.richting === 'geen' && a.ontbreekt && a.ontbreekt[0].length > 30 && a.ontbreekt[1].length > 30)
    && AGENDA_AANBIEDERS.filter((a) => a.stand === 'beschikbaar').every((a) => Boolean(a.doel) && a.richting !== 'geen'));
  check('catalogus: de levende stand komt van de server, nooit uit het bestand',
    agendaKaartStand(googleKaart) === 'beschikbaar' && agendaKaartStand(googleKaart, { calendar: true }) === 'verbonden'
    && agendaKaartStand(agendaAanbieder('microsoft-outlook')!, { calendar: true }) === 'binnenkort'
    && /sources|server/.test(catalogus));
  const routes = lees('backend/agenda-routes.ts');
  check('routes: er is voor ELKE schrijfactie een route, en elke route eist een idempotentiesleutel',
    ['aanmaken', 'wijzigen', 'verplaatsen', 'verwijderen', 'deelnemers', 'antwoord'].every((a) => routes.includes(`/api/owner/agenda/gebeurtenis/${a}`))
    && (routes.match(/sleutelVan\(body\)/g) || []).length >= 6 && routes.includes('AGENDA_FOUT.sleutel'));
  check('routes: schrijven gaat ook door de rolcontrole (een alleen-lezen-rol komt er niet bij)',
    routes.includes('denyMutation') && routes.includes("'calendar.write'") && (routes.match(/mutatieGeweigerd\(gebruiker, ctx\.body\)/g) || []).length >= 6);
  const dispatch = lees('backend/site-aanroep.ts');
  const siteTools = lees('backend/site-hulpmiddelen.ts');
  check('AI: de hulpmiddelen om te schrijven bestaan, staan op «vragen» (write: true) en hun routes zijn toegestaan',
    ['calendar_create_event', 'calendar_update_event', 'calendar_move_event', 'calendar_delete_event', 'calendar_event_attendees', 'calendar_rsvp_event'].every((n) => siteTools.includes(n))
    && ['aanmaken', 'wijzigen', 'verplaatsen', 'verwijderen', 'deelnemers', 'antwoord'].every((a) => dispatch.includes(`POST /api/owner/agenda/gebeurtenis/${a}`))
    && /idempotency_key/.test(siteTools) && /ignore_version/.test(siteTools));
  const pagina = lees('src/agenda/Agenda.tsx');
  const venster = lees('src/agenda/AgendaVenster.tsx');
  check('pagina: maand, week, dag en porządek denny bestaan, met een knop «nieuwe afspraak» en synchroniseren',
    /data-agenda-weergave=/.test(pagina) && /data-agenda-maand=/.test(pagina) && /data-agenda-week=/.test(pagina)
    && /data-agenda-lijst='1'/.test(pagina) && /data-agenda-nieuw='1'/.test(pagina) && /data-agenda-sync='1'/.test(pagina));
  check('pagina: de uitbreidingsstap staat erop en laat zien WELKE scope erbij komt en waarom',
    /data-agenda-uitbreiding='1'/.test(pagina) && /data-agenda-uitbreiding-scope=/.test(pagina) && /data-agenda-uitbreiden='1'/.test(pagina));
  check('venster: titel, tijd, tijdzone, agenda, gasten, herhaling, herinneringen en RSVP zijn in te stellen',
    ["data-agenda-veld='titel'", "data-agenda-veld='begin'", "data-agenda-veld='tijdzone'", "data-agenda-veld='agenda'",
      "data-agenda-veld='gast'", "data-agenda-veld='herhaling'", 'data-agenda-weekdag=', "data-agenda-rsvp='1'",
      "data-agenda-verwijderen='1'", "data-agenda-verplaatsen='1'"].every((merk) => venster.includes(merk)));
  check('venster: een conflict wordt GETOOND met de Google-versie ernaast; overschrijven is een aparte, bewuste knop',
    /data-agenda-conflict='1'/.test(venster) && /data-agenda-conflict-google='1'/.test(venster)
    && /data-agenda-conflict-overnemen='1'/.test(venster) && /data-agenda-conflict-overschrijven='1'/.test(venster));
  check('pagina en venster: niets verzonnen (geen voorbeelddata, geen Math.random)',
    !/Math\.random/.test(pagina) && !/Math\.random/.test(venster) && !/voorbeeld|demo|dummy|lorem/i.test(pagina));
  const clientBestand = lees('src/agenda/agenda-client.ts');
  check('pagina: elke schrijfactie krijgt in de browser een eigen sleutel (crypto.randomUUID, geen Math.random)',
    /crypto\.randomUUID/.test(clientBestand) && !/Math\.random\(/.test(clientBestand) && /nieuweSleutel\(\)/.test(pagina));

  return einde();
}
