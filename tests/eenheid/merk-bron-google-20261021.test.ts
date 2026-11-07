// «Якщо акаунти Google або інші видають фото відправника — вони також мають відображатися в нас на сервісі» (eigenaar, 21.10.2026).
//
// De HELE weg, door de echte router van de site (backend/index.ts → metMailRuimte → backend/merk-bron.ts) met een nagebootste
// Google (hulp/nep-google.ts + onderschepte fetch) en een nagebootste beeldserver (hulp/nep-merk-web.ts). Er gaat niets naar buiten.
//   1. Gmail koppelen ZONDER contacten: de mailkoppeling vraagt geen People-scopes (alleen wat Gmail nodig heeft);
//   2. «Фото з Google-контактів» aan → de server meldt eerlijk dat de toestemming ontbreekt (People API → 403 → scope-ontbreekt);
//   3. «Дозволити Google…» → incrementele toestemming op DEZELFDE koppeling: authUrl met contacts.readonly + contacts.other.readonly
//      bovenop de Gmail-scopes, include_granted_scopes=true, login_hint = de eigen mailbox;
//   4. vinkt de mens de contacten in het venster van Google uit, dan blijft Gmail gewoon werken (geen GOOGLE_SUITE_SCOPE_INCOMPLETE);
//   5. met de toestemming: People API (connections + otherContacts, personFields/readMask = emailAddresses,photos) → de foto van een
//      contact komt via de server als data-URI in de route; de standaardfoto van Google niet.
import { randomBytes } from 'node:crypto';
import { getPool } from '../../server/platform/pg';
import { checker, nepGoogle } from './hulp/nep-google';
import { jpeg, nepMerkWeb } from './hulp/nep-merk-web';
import { googleStartLichaam } from '../../src/mail/mail-koppel-model';

const MAIL_SCOPES = ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/gmail.modify', 'https://www.googleapis.com/auth/gmail.send', 'https://www.googleapis.com/auth/gmail.labels'];
const FOTO_SCOPES = ['https://www.googleapis.com/auth/contacts.readonly', 'https://www.googleapis.com/auth/contacts.other.readonly'];

export async function main(): Promise<number> {
  const { check, einde } = checker('merk-bron-google-20261021');
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  // Eigen pepper voor de persoonlijke laag (adresHash): zonder AFZENDER_BEELD_PEPPER/AUDIT_IP_PEPPER uit de omgeving bleef die laag
  // uit en faalden 3 checks (05.11.2026). Na afloop hersteld, zoals de sleutel van de grants.
  const omgevingVoor = Object.fromEntries(['GOOGLE_OAUTH_GRANT_ENCRYPTION_KEY_V1', 'AFZENDER_BEELD_PEPPER'].map((n) => [n, process.env[n]]));
  const eigenaar = `mbg-eig-${T}@example.test`, sub = `sub-mbg-${T}`;
  const G = await nepGoogle({ ownerEmail: eigenaar });
  process.env.GOOGLE_OAUTH_GRANT_ENCRYPTION_KEY_V1 = `eenheidstest-merk-bron-google-${T}-32-tekens-minstens`;
  process.env.AFZENDER_BEELD_PEPPER = `eenheidstest-merk-bron-google-pepper-${randomBytes(16).toString('hex')}`;
  const mb = await import('../../backend/merk-bron');
  const FOTO = jpeg('contact-anna');
  const web = await nepMerkWeb(['lh3.googleusercontent.com'], { 'lh3.googleusercontent.com': (pad) => (pad === '/foto-anna' ? { body: FOTO } : null) });
  mb._zetMerkNet({
    txt: async () => { throw Object.assign(new Error('nx'), { code: 'ENOTFOUND' }); },
    adressen: async (h) => { if (h === 'lh3.googleusercontent.com') return [{ address: '203.0.113.50', family: 4 }]; throw Object.assign(new Error('nx'), { code: 'ENOTFOUND' }); },
    verbindMet: (adres, poort) => (adres === '203.0.113.50' ? { adres: '127.0.0.1', poort: web.poort } : { adres, poort }),
    ca: web.ca,
  });
  mb._merkBronVergeten();

  // Nagebootste Google: per autorisatiecode de scopes die de mens in het venster aanvinkte; het refresh-token draagt ze mee.
  const scopesPerCode = new Map<string, string[]>();
  const profielen = new Map<string, { sub: string; email: string }>();
  const people: string[] = [];
  const nepFetch = globalThis.fetch;
  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    if (url === 'https://id.tarasevych.com/') return new Response('<!doctype html><title>id</title>', { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
    if (url === 'https://oauth2.googleapis.com/token') {
      const p = new URLSearchParams(String(init?.body || ''));
      const code = p.get('code') || '', rt = p.get('refresh_token') || '';
      if (code.startsWith('suite-')) {
        if (!p.get('code_verifier')) return new Response('{"error":"invalid_request"}', { status: 400 });
        return new Response(JSON.stringify({ access_token: `at-${code}`, refresh_token: `rt-${code}`, scope: ['openid', 'email', 'profile', ...(scopesPerCode.get(code) || MAIL_SCOPES)].join(' '), expires_in: 3600, token_type: 'Bearer' }), { status: 200 });
      }
      if (p.get('grant_type') === 'refresh_token' && rt.startsWith('rt-suite-')) {
        const c = rt.slice(3);
        return new Response(JSON.stringify({ access_token: `at-${c}`, scope: ['openid', 'email', 'profile', ...(scopesPerCode.get(c) || MAIL_SCOPES)].join(' '), expires_in: 3600, token_type: 'Bearer' }), { status: 200 });
      }
    }
    if (url === 'https://openidconnect.googleapis.com/v1/userinfo') {
      const tok = String((init?.headers as Record<string, string> | undefined)?.Authorization || '').replace(/^Bearer at-/, '');
      const pr = profielen.get(tok);
      if (pr) return new Response(JSON.stringify({ sub: pr.sub, email: pr.email, email_verified: true, name: pr.email, picture: '' }), { status: 200 });
    }
    if (url.startsWith('https://people.googleapis.com/')) {
      people.push(url);
      const c = String((init?.headers as Record<string, string> | undefined)?.Authorization || '').replace(/^Bearer at-/, '');
      const s = scopesPerCode.get(c) || [];
      const soort = url.includes('/otherContacts') ? 'otherContacts' : 'connections';
      if (!s.includes(soort === 'connections' ? FOTO_SCOPES[0] : FOTO_SCOPES[1])) return new Response(JSON.stringify({ error: { code: 403, status: 'PERMISSION_DENIED', message: 'Request had insufficient authentication scopes.', errors: [{ reason: 'insufficientPermissions' }] } }), { status: 403 });
      if (soort === 'connections') return new Response(JSON.stringify({ connections: [
        { emailAddresses: [{ value: 'anna@contact-bedrijf.test' }], photos: [{ url: 'https://lh3.googleusercontent.com/foto-anna', metadata: { primary: true } }] },
        { emailAddresses: [{ value: 'bob@contact-bedrijf.test' }], photos: [{ url: 'https://lh3.googleusercontent.com/standaard-bob', default: true }] },
      ] }), { status: 200 });
      return new Response(JSON.stringify({ otherContacts: [] }), { status: 200 });
    }
    if (url.startsWith('https://oauth2.googleapis.com/revoke')) return new Response('{}', { status: 200 });
    return nepFetch(input as never, init);
  }) as typeof fetch;

  const B = G.browser();
  const pool = getPool('systeem');
  const MAIL = 'mail.tarasevych.com';
  const post = (pad: string, extra: Record<string, unknown> = {}) => B.verzoek(MAIL, pad, B.ctxBody('mail', extra));
  const googleAntwoord = async (authUrl: string, scopes: string[]) => {
    const code = `suite-${randomBytes(6).toString('hex')}`; profielen.set(code, { sub, email: eigenaar }); scopesPerCode.set(code, scopes);
    return B.verzoek('id.tarasevych.com', '/api/owner/google-suite/callback', { state: new URL(authUrl).searchParams.get('state'), code });
  };
  let uid = '';
  try {
    const login = await B.aanmelden(sub, eigenaar, { service: 'mail', authTime: Math.floor(Date.now() / 1000) - 3600 });
    check('aanmelden als eigenaar op mail (nep-Google)', login.cb.data.ok === true);
    uid = String((await pool.query("select id from app.records where tbl='users' and data->>'email'=$1", [eigenaar])).rows[0]?.id || '');

    // ---------------------------------------------------------------- 1. Gmail koppelen zonder contacten
    const start = await post('/api/owner/mail/google-suite/onboarding/start', googleStartLichaam({ taal: 'uk', returnTo: `https://${MAIL}/accounts`, sourceOrigin: `https://${MAIL}`, tabContext: B.tab, rol: 'primary' }));
    const mailUrl = new URL(String(start.data.authUrl || 'https://x.invalid/'));
    check('de gewone Gmail-koppeling vraagt GEEN contacten (People-scopes zijn optioneel)', start.status === 200 && FOTO_SCOPES.every((s) => !(mailUrl.searchParams.get('scope') || '').includes(s)) && MAIL_SCOPES.every((s) => (mailUrl.searchParams.get('scope') || '').includes(s)));
    const cb = await googleAntwoord(String(start.data.authUrl), MAIL_SCOPES);
    check('Gmail gekoppeld', cb.data.ok === true, cb.body.slice(0, 160));

    // ---------------------------------------------------------------- 2. aan, maar zonder toestemming
    const v0 = await post('/api/owner/mail/afzender-beelden/voorkeur');
    check('voorkeuren: standaard Gravatar UIT en Google-contacten UIT; Google gekoppeld maar zonder contacten-toestemming', v0.status === 200 && v0.data.voorkeur.gravatar === false && v0.data.voorkeur.googleContacten === false && v0.data.google.gekoppeld === true && v0.data.google.lezen === false && v0.data.google.ontbreekt.length === 2, v0.body.slice(0, 200));
    const v1 = await post('/api/owner/mail/afzender-beelden/voorkeur', { googleContacten: true });
    check('«Фото з Google-контактів» aan (route door de ruimtepoort van de post)', v1.status === 200 && v1.data.voorkeur.googleContacten === true);
    await post('/api/owner/mail/afzender-beelden', { adressen: ['anna@contact-bedrijf.test'] });
    await mb.wachtrijLeeg();
    const v2 = await post('/api/owner/mail/afzender-beelden/voorkeur');
    check('zonder toestemming: People API → 403 → eerlijke stand «scope-ontbreekt», geen foto', v2.data.voorkeur.googleStand === 'scope-ontbreekt' && people.length >= 1, `${v2.data.voorkeur.googleStand} ${people.length}`);

    // ---------------------------------------------------------------- 3. incrementele toestemming
    const t1 = await post('/api/owner/mail/afzender-beelden/google-toestemming', { returnTo: `https://${MAIL}/settings`, locale: 'uk' });
    const u1 = new URL(String(t1.data.authUrl || 'https://x.invalid/'));
    const scope = (u1.searchParams.get('scope') || '').split(' ');
    check('toestemming: authUrl met contacts.readonly + contacts.other.readonly BOVENOP de Gmail-scopes, include_granted_scopes, login_hint', t1.status === 200 && u1.hostname === 'accounts.google.com'
      && FOTO_SCOPES.every((s) => scope.includes(s)) && MAIL_SCOPES.every((s) => scope.includes(s)) && u1.searchParams.get('include_granted_scopes') === 'true' && u1.searchParams.get('login_hint') === eigenaar && /^gsuite\.v2\.uk\.mail\.p\./.test(u1.searchParams.get('state') || ''), t1.body.slice(0, 200));
    // 4. de mens vinkt de contacten uit
    const cbZonder = await googleAntwoord(String(t1.data.authUrl), MAIL_SCOPES);
    const v3 = await post('/api/owner/mail/afzender-beelden/voorkeur');
    check('contacten uitgevinkt in het venster van Google: Gmail blijft gekoppeld (geen SCOPE_INCOMPLETE), toestemming nog altijd niet', cbZonder.data.ok === true && v3.data.google.lezen === false, cbZonder.body.slice(0, 160));
    // 5. nu wel
    const t2 = await post('/api/owner/mail/afzender-beelden/google-toestemming', { returnTo: `https://${MAIL}/settings`, locale: 'nl' });
    const cbMet = await googleAntwoord(String(t2.data.authUrl), [...MAIL_SCOPES, ...FOTO_SCOPES]);
    const v4 = await post('/api/owner/mail/afzender-beelden/voorkeur');
    check('met toestemming: de grant heeft nu beide People-scopes (vereniging met Gmail)', cbMet.data.ok === true && v4.data.google.lezen === true && v4.data.google.ontbreekt.length === 0, v4.body.slice(0, 200));
    const r1 = await post('/api/owner/mail/afzender-beelden', { adressen: ['anna@contact-bedrijf.test', 'bob@contact-bedrijf.test'] });
    await mb.wachtrijLeeg();
    const r2 = await post('/api/owner/mail/afzender-beelden', { adressen: ['anna@contact-bedrijf.test', 'bob@contact-bedrijf.test'] });
    const anna = (r2.data.beelden as Array<{ adres: string; soort: string; bron?: string; data?: string }>).find((b) => b.adres === 'anna@contact-bedrijf.test');
    const bob = (r2.data.beelden as Array<{ adres: string; soort: string }>).find((b) => b.adres === 'bob@contact-bedrijf.test');
    check('de foto van een contact komt via de server als data-URI (bron google-contact)', r1.status === 200 && anna?.soort === 'persoon' && anna.bron === 'google-contact' && anna.data === `data:image/jpeg;base64,${FOTO.toString('base64')}`, JSON.stringify(r2.data).slice(0, 200));
    check('de standaardfoto van Google (default: true) niet', bob?.soort !== 'persoon' && !web.verzoeken.some((v) => v.pad === '/standaard-bob'));
    const conn = people.find((u) => u.includes('/people/me/connections') && u.includes('pageSize=1000')), other = people.find((u) => u.includes('/otherContacts'));
    check('People API: connections met personFields, otherContacts met readMask — alleen emailAddresses,photos', !!conn && new URL(conn).searchParams.get('personFields') === 'emailAddresses,photos' && !!other && new URL(other).searchParams.get('readMask') === 'emailAddresses,photos');
    const v5 = await post('/api/owner/mail/afzender-beelden/voorkeur', { googleContacten: false });
    const rest = (await pool.query(`SELECT count(*)::int AS n FROM app.afzender_beeld WHERE user_id = $1 AND bron = 'google-contact'`, [uid])).rows[0].n;
    check('uitzetten wist de foto\'s uit de contacten meteen', v5.data.voorkeur.googleContacten === false && rest === 0);
  } finally {
    await mb.wachtrijLeeg();
    globalThis.fetch = nepFetch;
    mb._zetMerkNet(null);
    mb._merkBronVergeten();
    if (uid) {
      await pool.query('DELETE FROM app.afzender_beeld WHERE user_id = $1', [uid]).catch(() => undefined);
      await pool.query('DELETE FROM app.afzender_beeld_voorkeur WHERE user_id = $1', [uid]).catch(() => undefined);
    }
    await pool.query(`DELETE FROM app.merk_beeld WHERE sleutel LIKE '%contact-bedrijf.test'`).catch(() => undefined);
    await web.sluit();
    G.herstel();
    for (const [n, w] of Object.entries(omgevingVoor)) { if (w === undefined) delete process.env[n]; else process.env[n] = w; }
  }
  return einde();
}
