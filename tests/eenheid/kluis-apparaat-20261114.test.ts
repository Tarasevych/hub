// KLUIS-APPARAAT-001 (14.11.2026) — «Розшифровувати пошту одразу на місці» · ontsleutelen op een bekend apparaat.
// Wens van de eigenaar: na opnieuw aanmelden of een serverupdate op HETZELFDE apparaat niet opnieuw ontsleutelen; op een nieuw
// apparaat één knop op de pagina zelf. Zonder het model van 0092 te verzwakken. Deze test bewijst:
//   1. onthouden kan alleen de sessie die de sleutel zelf open houdt; terug komt X = DEK ⊕ S, nooit de DEK of S;
//   2. op schijf staat alleen S verzegeld (geen DEK, geen X, geen S in platte vorm) — een databasekopie opent niets;
//   3. na uitloggen + opnieuw aanmelden én na een «herstart» (geheugen leeg) opent X de sleutel weer, zonder passkey;
//   4. een verkeerde X, een vreemde mens, een andere ruimte, een vergeten of verlopen apparaat: geweigerd;
//   5. «overal afmelden» vergeet elk apparaat; vergeten via de route werkt;
//   6. hoogstens 20 apparaten per lade; openWithEnvKey weigert een ingekorte GCM-tag;
//   7. de draden in de browser: client.ts wacht + herhaalt, de dienst controleert vooraf, agents komen niet aan de routes.
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { closePool, getPool } from '../../server/platform/pg';
import { openWithEnvKey, sealWithEnvKey } from '../../server/platform/beveiliging';
import { checker, nepGoogle } from './hulp/nep-google';
import { bevestig, nieuwePasskey, registreer } from './hulp/nep-toegangssleutel';

export async function main(): Promise<number> {
  const { check, einde } = checker('kluis-apparaat-20261114');
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  process.env.SLEUTELKLUIS_SLEUTEL_V1 = randomBytes(32).toString('base64');
  const eigenaar = `ka-eig-${T}@example.test`;
  const G = await nepGoogle({ ownerEmail: eigenaar });
  const pool = getPool();
  const sk = await import('../../backend/sleutelkluis');
  const bron = (f: string) => readFileSync(f, 'utf8');
  const xor = (a: string, b: string) => { const x = Buffer.from(a, 'hex'), y = Buffer.from(b, 'hex'); return Buffer.from(x.map((v, i) => v ^ y[i])).toString('hex'); };
  const geheimen: string[] = [];

  try {
    // ------------------------------------------------------------------ 6. kleine bouwstenen
    const env = 'SLEUTELKLUIS_SLEUTEL_V1';
    const goed = sealWithEnvKey(env, 'hallo', 'aad');
    const [v, iv, ct, tag] = goed.split('.');
    const kort = [v, iv, ct, Buffer.from(tag, 'base64url').subarray(0, 4).toString('base64url')].join('.');
    let kortGeweigerd = false; try { openWithEnvKey(env, kort, 'aad'); } catch { kortGeweigerd = true; }
    check('openWithEnvKey: geldige envelop gaat open, een ingekorte GCM-tag (4 bytes) wordt geweigerd', openWithEnvKey(env, goed, 'aad') === 'hallo' && kortGeweigerd);
    check('apparaatLabel: alleen browser + systeem, nooit de volledige User-Agent',
      sk.apparaatLabel('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36') === 'Chrome · Windows'
      && sk.apparaatLabel('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1') === 'Safari · iOS');

    // ------------------------------------------------------------------ voorbereiding: mens met kluis aan (zelfde weg als 0092-test)
    const oudTijd = Math.floor(Date.now() / 1000) - 3600;
    const A = G.browser(); const aMail = `ka-a-${T}@example.test`; await A.aanmelden(`sub-a-${T}`, aMail, { authTime: oudTijd });
    const aId = (await pool.query("select id from app.records where tbl='users' and data->>'email'=$1", [aMail])).rows[0]?.id as string;
    await pool.query("update app.records set data = data || '{\"status\":\"approved\"}'::jsonb where tbl='users' and id = $1", [aId]);
    const id = (b: ReturnType<typeof G.browser>, pad: string, extra: Record<string, unknown> = {}) => b.verzoek('id.tarasevych.com', pad, b.ctxBody('identity', extra));
    const mail = (b: ReturnType<typeof G.browser>, pad: string, extra: Record<string, unknown> = {}) => b.verzoek('mail.tarasevych.com', pad, b.ctxBody('mail', extra));
    const P = '/api/owner/sleutelkluis';
    await A.aanmelden(`sub-a-${T}`, aMail, { intent: 'step-up' });
    const pk = nieuwePasskey('es256');
    const opt = await id(A, '/api/owner/access/passkeys/registreren/opties');
    await id(A, '/api/owner/access/passkeys/registreren', { uitdagingId: opt.data.uitdagingId, naam: 'Telefoon', transports: ['internal'], ...registreer(pk, opt.data.publicKey.challenge, { origin: 'https://id.tarasevych.com' }) });
    const so = await id(A, '/api/owner/access/stap-op/passkey/opties');
    await id(A, '/api/owner/access/stap-op/passkey', { uitdagingId: so.data.uitdagingId, assertie: bevestig(pk, so.data.publicKey.challenge, { origin: 'https://id.tarasevych.com' }) });
    const aan = await id(A, `${P}/inschakelen`);
    check('voorbereiding: kluis aan, sleutel open', aan.status === 200 && (await id(A, `${P}/stand`)).data.stand === 'open', `${aan.status} ${aan.body.slice(0, 120)}`);
    const lade = { userId: aId, ruimte: 'prive' as const };
    const dekHex = Buffer.from(sk.sleutelOpen(lade)!).toString('hex');
    geheimen.push(dekHex, normaliseer(String(aan.data.herstelcode || '')));

    // ------------------------------------------------------------------ 1. onthouden
    const onth = await mail(A, `${P}/apparaat/onthouden`);
    const X = String(onth.data.deel || '');
    check('onthouden (op de maildienst, waar het probleem zat): id + X (64 hex) + verlooptOp, nooit de DEK zelf',
      onth.status === 200 && /^[0-9a-f-]{36}$/.test(onth.data.apparaatId) && /^[0-9a-f]{64}$/.test(X) && X !== dekHex && Number(onth.data.verlooptOp) > Date.now(), `${onth.status} ${onth.body.slice(0, 160)}`);
    geheimen.push(X);
    const rij = (await pool.query('SELECT deel_verzegeld, label FROM app.sleutelkluis_apparaat WHERE id = $1::uuid', [onth.data.apparaatId])).rows[0];
    const S = openWithEnvKey(env, rij.deel_verzegeld, `sleutelkluis-apparaat|${aId}|prive|${onth.data.apparaatId}`);
    geheimen.push(S);
    check('wiskunde: X ⊕ S = DEK (de server bewaart S verzegeld, de browser X)', xor(X, S) === dekHex);
    const st1 = await id(A, `${P}/stand`);
    check('stand toont het onthouden apparaat (id, label, verloopt) zonder geheimen', st1.data.omslagen?.apparaten?.length === 1 && st1.data.omslagen.apparaten[0].id === onth.data.apparaatId && !JSON.stringify(st1.data).includes(X) && !JSON.stringify(st1.data).includes(S));

    // ------------------------------------------------------------------ 3. uitloggen + opnieuw aanmelden: X opent zonder passkey
    await id(A, '/api/owner/session/logout-current');
    await A.aanmelden(`sub-a-${T}`, aMail, { authTime: oudTijd });
    check('na uitloggen + opnieuw aanmelden: sleutel dicht', (await mail(A, `${P}/stand`)).data.stand === 'gesloten');
    const zonderHouder = await mail(A, `${P}/apparaat/onthouden`);
    check('een sessie die de sleutel NIET open houdt kan geen nieuw apparaat onthouden (423 SLEUTELKLUIS_GESLOTEN)', zonderHouder.status === 423 && zonderHouder.data.error === 'SLEUTELKLUIS_GESLOTEN', `${zonderHouder.status} ${zonderHouder.body.slice(0, 80)}`);
    const fout = await mail(A, `${P}/apparaat/ontgrendelen`, { apparaatId: onth.data.apparaatId, deel: randomBytes(32).toString('hex') });
    check('een verkeerde X → 403 SLEUTELKLUIS_DEK_ONGELDIG, sleutel blijft dicht', fout.status === 403 && fout.data.error === 'SLEUTELKLUIS_DEK_ONGELDIG' && (await mail(A, `${P}/stand`)).data.stand === 'gesloten', `${fout.status} ${fout.body.slice(0, 80)}`);
    const open1 = await mail(A, `${P}/apparaat/ontgrendelen`, { apparaatId: onth.data.apparaatId, deel: X });
    check('X van dit apparaat → open, zonder passkey of code', open1.status === 200 && (await mail(A, `${P}/stand`)).data.stand === 'open', `${open1.status} ${open1.body.slice(0, 80)}`);

    // «Herstart van de server na een update»: het geheugen is leeg, de sessie leeft nog.
    sk.geheugenLeeg();
    check('herstart (geheugen leeg): sessie leeft, sleutel dicht', (await mail(A, `${P}/stand`)).data.stand === 'gesloten');
    const open2 = await mail(A, `${P}/apparaat/ontgrendelen`, { apparaatId: onth.data.apparaatId, deel: X });
    check('na de herstart opent hetzelfde apparaat de sleutel weer zelf', open2.status === 200 && (await mail(A, `${P}/stand`)).data.stand === 'open');
    const gebruikt = (await pool.query('SELECT laatst_gebruikt_op FROM app.sleutelkluis_apparaat WHERE id = $1::uuid', [onth.data.apparaatId])).rows[0];
    check('laatst gebruikt wordt bijgehouden (30 dagen zonder gebruik = vergeten)', !!gebruikt?.laatst_gebruikt_op);
    const audit = (await pool.query(`SELECT action, details::text AS d FROM app.audit WHERE owner_id = $1 AND action LIKE 'sleutelkluis.%' ORDER BY seq`, [aId])).rows as Array<{ action: string; d: string }>;
    check('audit: onthouden en ontgrendelen met methode «apparaat» staan in het journaal', audit.some((r) => r.action === 'sleutelkluis.apparaat_onthouden') && audit.some((r) => r.action === 'sleutelkluis.ontgrendeld' && r.d.includes('"apparaat"')));

    // ------------------------------------------------------------------ 4. vreemde mens, andere ruimte, vergeten, verlopen
    const B = G.browser(); const bMail = `ka-b-${T}@example.test`; await B.aanmelden(`sub-b-${T}`, bMail, { authTime: oudTijd });
    const bId = (await pool.query("select id from app.records where tbl='users' and data->>'email'=$1", [bMail])).rows[0]?.id as string;
    await pool.query("update app.records set data = data || '{\"status\":\"approved\"}'::jsonb where tbl='users' and id = $1", [bId]);
    const vreemd = await mail(B, `${P}/apparaat/ontgrendelen`, { apparaatId: onth.data.apparaatId, deel: X });
    check('een ANDERE mens met dezelfde X en id: geweigerd (zijn kluis staat uit of het apparaat is onbekend)', vreemd.status >= 400 && vreemd.status < 500 && sk.sleutelOpen({ userId: bId, ruimte: 'prive' }) === null, `${vreemd.status} ${vreemd.body.slice(0, 80)}`);
    const tech = await sk.ontgrendelMetApparaat({ userId: aId, ruimte: 'technisch' }, onth.data.apparaatId, X, { soort: 'sessie', id: 'x' }).then(() => 'open', (e) => e.code);
    check('dezelfde X voor de TECHNISCHE ruimte: geweigerd (andere lade)', tech !== 'open', tech);

    // verlopen: 31 dagen niet gebruikt
    sk.zetHouderControle(async () => true);
    await sk.sleutelOpenen(lade, Buffer.from(dekHex, 'hex'), { soort: 'sessie', id: 'oud' });
    const oud = await sk.apparaatOnthouden(lade, { soort: 'sessie', id: 'oud' }, 'Oud');
    await pool.query(`UPDATE app.sleutelkluis_apparaat SET laatst_gebruikt_op = now() - interval '31 days', aangemaakt_op = now() - interval '31 days' WHERE id = $1::uuid`, [oud.apparaatId]);
    const verlopen = await sk.ontgrendelMetApparaat(lade, oud.apparaatId, oud.deel, { soort: 'sessie', id: 'oud' }).then(() => 'open', (e) => e.code);
    const nogDaar = (await pool.query('SELECT 1 FROM app.sleutelkluis_apparaat WHERE id = $1::uuid', [oud.apparaatId])).rowCount;
    check('31 dagen niet gebruikt → SLEUTELKLUIS_APPARAAT_VERLOPEN en de serverhelft is gewist', verlopen === 'SLEUTELKLUIS_APPARAAT_VERLOPEN' && nogDaar === 0, verlopen);
    const lijst = await sk.apparatenVan(lade);
    check('een verlopen apparaat staat niet meer in de lijst', !lijst.some((d) => d.id === oud.apparaatId));

    // vergeten via de route
    const vergeten = await id(A, `${P}/apparaat/vergeten`, { apparaatId: onth.data.apparaatId });
    sk.geheugenLeeg();
    const naVergeten = await mail(A, `${P}/apparaat/ontgrendelen`, { apparaatId: onth.data.apparaatId, deel: X });
    check('vergeten via de route → dezelfde X opent niets meer (404 SLEUTELKLUIS_APPARAAT_ONBEKEND)', vergeten.status === 200 && vergeten.data.ok === true && naVergeten.status === 404 && naVergeten.data.error === 'SLEUTELKLUIS_APPARAAT_ONBEKEND', `${naVergeten.status} ${naVergeten.body.slice(0, 80)}`);

    // hoogstens 20 per lade
    await sk.sleutelOpenen(lade, Buffer.from(dekHex, 'hex'), { soort: 'sessie', id: 'oud' });
    for (let i = 0; i < 22; i++) await sk.apparaatOnthouden(lade, { soort: 'sessie', id: 'oud' }, `Toestel ${i}`);
    check('hoogstens 20 onthouden apparaten per lade (de oudste valt weg)', (await sk.apparatenVan(lade)).length === 20);

    // ------------------------------------------------------------------ 5. «overal afmelden» vergeet alles
    check('voor «overal afmelden»: er zijn nog onthouden apparaten', (await sk.apparatenVan(lade)).length > 0);
    await sk.apparatenVergetenVoorGebruiker(aId);
    check('apparatenVergetenVoorGebruiker: alle apparaten van de mens weg', (await sk.apparatenVan(lade)).length === 0);
    check('de hook zit in «overal afmelden» (ownerAllesIntrekken)', /async function ownerAllesIntrekken[^]{0,400}apparatenVergetenVoorGebruiker\(userId\)/.test(bron('backend/index.ts')));

    // ------------------------------------------------------------------ 2. niets geheims op schijf
    const dump = [
      ...(await pool.query(`SELECT row_to_json(r)::text AS t FROM app.sleutelkluis_apparaat r`)).rows,
      ...(await pool.query(`SELECT row_to_json(r)::text AS t FROM app.sleutelkluis_omslag r WHERE user_id = $1`, [aId])).rows,
      ...(await pool.query(`SELECT details::text AS t FROM app.audit WHERE owner_id = $1`, [aId])).rows,
    ].map((r) => String(r.t)).join('\n');
    const lek = geheimen.filter((g) => g.length >= 20 && dump.includes(g));
    check('op schijf: geen DEK, geen X, geen S in platte vorm, geen herstelcode (apparaten, omslagen, audit)', lek.length === 0, lek.map((l) => l.slice(0, 6)).join());

    // ------------------------------------------------------------------ 7. de draden in de browser
    const client = bron('src/platform/client.ts'), poort = bron('src/platform/kluis-poort.tsx'), app = bron('src/VerenigdDienstApp.tsx'), apparaat = bron('src/platform/kluis-apparaat.ts');
    check('client.ts: SLEUTELKLUIS_GESLOTEN → wachten op kluis-poort en het verzoek één keer herhalen (nooit voor de kluisroutes zelf)',
      /fout\.message === 'SLEUTELKLUIS_GESLOTEN' && !opnieuw[^]{0,200}!url\.startsWith\('\/api\/owner\/sleutelkluis\/'\)[^]{0,200}kluisGesloten\([^]{0,120}if \(open\) return request\(method, url, data, true, opties\)/.test(client));
    check('client.ts: ook «dicht» in een gewoon antwoord ({fout}) toont de kaart', client.includes("(parsed as { fout?: unknown }).fout === 'SLEUTELKLUIS_GESLOTEN'") && client.includes('kluisGeslotenGezien'));
    check('VerenigdDienstApp: bij het openen van een dienst vooraf controleren (stil op een bekend apparaat)', app.includes("import('./platform/kluis-poort').then(m=>m.kluisVoorbereiden({service,tabContext:tabContext(),sourceOrigin}))"));
    check('kluis-poort: eerst stil met het apparaat, dan de kaart; passkey meteen gevraagd; herstelcode → nieuwe code tonen', poort.includes('stilMetApparaat(s)') && poort.includes('zetAutoGevraagd()') && poort.includes('data-kluis-nieuwe-code') && poort.includes('/apparaat/onthouden'));
    check('kluis-poort: na de herstelcode bevestigt pas «Готово» de nieuwe code (SEC-002 geheimen-04: de oude blijft geldig tot dan)', /naBevestigen[^]{0,200}herstelcode\/bevestigen/.test(poort) && poort.includes('naBevestigen(sluiten)') && poort.includes('naBevestigen(() => location.reload())'));
    check('kluis-apparaat: de browsersleutel is NIET exporteerbaar (generateKey extractable=false)', /generateKey\(\{ name: 'AES-GCM', length: 256 \}, false,/.test(apparaat) && !/exportKey/.test(apparaat));
    check('kluis-poort: elke tekst in beide talen (geen Engelse UI-zinnen)', (poort.match(/tr\('/g) || []).length >= 30 && !/>\s*(Decrypt|Remember|Later|Unlock)\b/.test(poort));
    check('agents komen niet aan de kluisroutes (agent-namens.ts)', /sleutelkluis\|codewoord/.test(bron('backend/agent-namens.ts')));
    check('migratie 0277: tabel met RLS, alleen S verzegeld (v1-envelop), cascade bij het wissen van de kluis', /deel_verzegeld[^]{0,80}\^v1/.test(bron('migrations/0277_sleutelkluis_apparaat.sql')) && /ON DELETE CASCADE/.test(bron('migrations/0277_sleutelkluis_apparaat.sql')) && /ENABLE ROW LEVEL SECURITY/.test(bron('migrations/0277_sleutelkluis_apparaat.sql')));
  } finally {
    sk.geheugenLeeg();
    await closePool().catch(() => undefined);
  }
  return einde();
}
const normaliseer = (c: string) => c.toUpperCase().replace(/[^A-Z2-9]/g, '');
