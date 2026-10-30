// Beheerlogboek: pure regels (categorie, resultaat, doel/wijziging, CSV, demping, SQL-bouw) + tegen een wegwerp-Postgres:
// schrijven zonder geheimen, filteren, sorteren met cursor, statistiek, export en ketencontrole.
import { randomUUID } from 'node:crypto';
import { closePool, getPool } from '../../server/platform/pg';
import { auditControle } from '../../server/platform/audit';
import {
  ACTIE_LABELS, ALLE_CATEGORIEEN, CATEGORIEEN, actieLabel, agentVan, categorieSql, categorieVan, csvCel, doelVan, isRuis, redenVan, resultaatKlasse, resultaatSql, wijzigingTekst, wijzigingVan,
} from '../../shared/beheer-journaal';
import {
  EXPORT_MAX, _resetDemping, actiesVoorTekst, bouwWaar, eenKeerPer, journaalExport, journaalOud, journaalSchrijf, journaalStatistiek, journaalZoeken, ketenControleAlles, schoonDetails,
} from '../../backend/beheer-journaal';
import { filterUitBody } from '../../backend/beheer-journaal-routes';
import { schrijfBeheerAudit } from '../../backend/audit-gebeurtenis';

const resultaten: Array<{ naam: string; ok: boolean }> = [];
const check = (naam: string, ok: boolean, info = '') => { resultaten.push({ naam, ok }); console.log(`${ok ? 'OK  ' : 'FOUT'} ${naam}${info ? ` — ${info}` : ''}`); };

export async function main() {
  // ---------------------------------------------------------------------------------------------- categorie
  const cat: Array<[string, string]> = [
    ['uitrol_voorstel_goedgekeurd', 'uitrol'], ['uitrol_voorbereider_gegeven', 'uitrol'], ['owner.uitrol.diagnose.uitgevoerd', 'uitrol'], ['owner.tech.toegekend', 'tech'], ['owner.flags.gewijzigd', 'tech'],
    ['owner.api.vault.revealed', 'geheimen'], ['access.google-contour.reveal', 'geheimen'], ['ai_grant_added', 'ai'], ['owner.mcp.grant.revoked', 'ai'], ['owner.connector.v2.gewijzigd', 'ai'],
    ['owner.terminal.geopend', 'apparaten'], ['owner.admin.diagnostics.read', 'diagnose'], ['owner.admin.role.updated', 'beheer'], ['owner.admin.audit.exported', 'beheer'], ['access.totp.disable', 'toegang'],
    ['passkey_toegevoegd', 'toegang'], ['owner.session.revoked.one', 'sessie'], ['GOOGLE_CALLBACK', 'sessie'], ['owner.mail.send.committed', 'mail'], ['owner.privacy.export', 'privacy'], ['iets.onbekends', 'overig'],
  ];
  // nieuwe prefixen van de andere onderdelen + vaste vorm van agent-audit (target / before / after)
  const nieuwCat: Array<[string, string]> = [['beheer.agent.rechten.gewijzigd', 'ai'], ['agent.grant.gegeven', 'ai'], ['secret.onthuld', 'geheimen'], ['integration.verbonden', 'integraties'], ['diag.test.uitgevoerd', 'diagnose'], ['admin_user_access_changed', 'beheer'], ['sign_in_refused_blocked', 'sessie']];
  check('categorieVan: beheer.agent.*, agent.*, secret.*, integration.*, diag.* en admin_*/sign_in', nieuwCat.every(([a, c]) => categorieVan(a) === c), nieuwCat.filter(([a, c]) => categorieVan(a) !== c).join('; '));
  const agentDetails = { actor: { id: 'x' }, target: { type: 'agent', id: 'claude', label: 'Claude' }, agent: 'claude', before: '7 dagen', after: 'onbepaald', reason: 'test' };
  const dv = doelVan(agentDetails), wv = wijzigingVan(agentDetails);
  check('doelVan/wijzigingVan lezen de vaste vorm van agent-audit (target, before → after)', dv?.soort === 'agent' && dv?.id === 'claude' && dv?.naam === 'Claude' && wv?.van === '7 dagen' && wv?.naar === 'onbepaald' && redenVan(agentDetails) === 'test');
  check('actieLabel: agent.grant.gegeven heeft een eigen vertaling (uk en nl)', actieLabel('agent.grant.gegeven', 'uk') !== actieLabel('agent.grant.gegeven', 'nl') && !/grant/i.test(actieLabel('agent.grant.gegeven', 'nl')));
  const fouten = cat.filter(([a, c]) => categorieVan(a) !== c).map(([a, c]) => `${a}→${categorieVan(a)} (wil ${c})`);
  check('categorieVan: acties landen in de goede categorie (diagnose vóór beheer, uitrol vóór ai, geheimen vóór ai)', fouten.length === 0, fouten.join('; '));
  check('categorieën: unieke id\'s, elk met uk+nl naam, patronen compileren', new Set(ALLE_CATEGORIEEN.map((c) => c.id)).size === ALLE_CATEGORIEEN.length && ALLE_CATEGORIEEN.every((c) => c.uk && c.nl) && CATEGORIEEN.every((c) => { try { new RegExp(c.patroon); return true; } catch { return false; } }));
  check('isRuis: bootstrap en aanmeldstappen zijn ruis, echte beheeracties niet', isRuis('owner.admin.bootstrap') && isRuis('GOOGLE_REDIRECT') && isRuis('TRANSACTION_REDEEM') && !isRuis('owner.admin.role.updated') && !isRuis('uitrol_voorstel_goedgekeurd') && !isRuis('owner.api.vault.revealed'));
  check('resultaatKlasse: success/ok → ok, denied/geweigerd → geweigerd, failure → fout, rest → info',
    resultaatKlasse('success') === 'ok' && resultaatKlasse('OK') === 'ok' && resultaatKlasse('denied') === 'geweigerd' && resultaatKlasse('geweigerd') === 'geweigerd' && resultaatKlasse('failure') === 'fout' && resultaatKlasse('detected') === 'info' && resultaatKlasse('') === 'info');

  // ---------------------------------------------------------------------------------------------- labels
  const leeg = Object.entries(ACTIE_LABELS).filter(([, [uk, nl]]) => !uk.trim() || !nl.trim());
  check('ACTIE_LABELS: elk label heeft uk én nl', leeg.length === 0 && Object.keys(ACTIE_LABELS).length > 100, `${Object.keys(ACTIE_LABELS).length} labels`);
  check('actieLabel: bekend → vertaling; onbekend → leesbaar (nooit leeg, nooit rauwe «owner.»)', actieLabel('owner.admin.role.updated', 'uk').includes('роль') && actieLabel('owner.nieuw.ding_gedaan', 'nl').length > 3 && !actieLabel('owner.nieuw.ding_gedaan', 'nl').startsWith('owner') && actieLabel('', 'uk') === '—');
  check('actiesVoorTekst: zoekt ook op vertaald label en code', actiesVoorTekst('секрет').includes('owner.api.vault.revealed') && actiesVoorTekst('vault').length > 3 && actiesVoorTekst('x').length === 0);

  // ---------------------------------------------------------------------------------------------- doel en wijziging
  const d1 = doelVan({ doel: { soort: 'agent', id: 'claude', naam: 'Claude' } });
  const d2 = doelVan({ agent: 'claude', dagen: 30 });
  const d3 = doelVan({ onderwerp: 'u1', label: 'Pavlo' });
  check('doelVan: vast veld, anders oude veldnamen, anders null', d1?.soort === 'agent' && d1.id === 'claude' && d2?.soort === 'agent' && d2.naam === 'claude' && d3?.naam === 'Pavlo' && doelVan({ x: 1 }) === null && doelVan(null) === null);
  const w1 = wijzigingVan({ wijziging: { van: 'aan', naar: 'uit' } }); const w2 = wijzigingVan({ aan: true }); const w3 = wijzigingVan({ dagen: 30 });
  check('wijzigingVan/wijzigingTekst: voor→na, schakelaar, dagen', wijzigingTekst(w1) === 'aan → uit' && wijzigingTekst(w2) === '→ aan' && wijzigingTekst(w3) === '→ 30 d' && wijzigingVan({}) === null && wijzigingTekst(null) === '');
  check('redenVan/agentVan', redenVan({ reden: 'test' }) === 'test' && redenVan({ reason: 'x' }) === 'x' && agentVan({ agent: 'gpt' }) === 'gpt' && agentVan({ clientName: 'Claude Desktop' }) === 'Claude Desktop' && agentVan({ klant: 'mijn-script' }) === '');

  // ---------------------------------------------------------------------------------------------- csv
  check('csvCel: komma/aanhaling gequote; formules (=, +, -, @) onschadelijk gemaakt', csvCel('a,b') === '"a,b"' && csvCel('say "hi"') === '"say ""hi"""' && csvCel('=SUM(A1)') === "'=SUM(A1)" && csvCel('+1') === "'+1" && csvCel('@x') === "'@x" && csvCel(null) === '' && csvCel({ a: 1 }) === '{"a":1}'.replace(/"/g, '""').replace(/^/, '"').replace(/$/, '"'));

  // ---------------------------------------------------------------------------------------------- schoon + demping + sql-bouw
  const sch = schoonDetails({ ok: 'x', token: 'T', nested: { password: 'p', apiKey: 'k', fine: 1 }, lang: 'a'.repeat(1000), lijst: Array.from({ length: 100 }, (_, i) => i) }) as Record<string, any>;
  check('schoonDetails: geheimen weg (ook geneste), lange tekst/lijsten afgekapt', sch.token === undefined && sch.nested.password === undefined && sch.nested.apiKey === undefined && sch.nested.fine === 1 && sch.lang.length <= 401 && sch.lijst.length === 40 && sch.ok === 'x');
  _resetDemping();
  check('eenKeerPer: eerste keer true, daarna binnen 10 min false, daarna weer true; andere sleutel onafhankelijk', eenKeerPer('a', 1000, 0) && !eenKeerPer('a', 1000, 500) && eenKeerPer('a', 1000, 1500) && eenKeerPer('b', 1000, 100));
  const bw = bouwWaar({ q: 'abc', categorieen: ['ai', 'bestaatniet'], resultaten: ['ok', 'x' as never], actorId: 'u1', doelId: 'u2', actie: 'owner.*', van: 5, tot: 9, verbergRuis: true, cursor: '12', volgorde: 'nieuw' }, { gebruikerIds: ['u3'] });
  const hoogste = Math.max(0, ...[...bw.waar.matchAll(/\$(\d+)/g)].map((m) => Number(m[1])));
  check('bouwWaar: elk $n heeft een parameter, geen onbekende categorie/resultaat, cursor alleen mét metCursor', hoogste === bw.p.length && !JSON.stringify(bw.p).includes('bestaatniet') && bw.waar.includes('id < $') && !bouwWaar({ cursor: '12' }, {}, false).waar.includes('id <'));
  check('bouwWaar: lege filter → geen WHERE; oplopende volgorde gebruikt id >', bouwWaar({}).waar === '' && bouwWaar({ cursor: '5', volgorde: 'oud' }).waar.includes('id > $'));
  const fb = filterUitBody({ q: ' tekst ', categorieen: ['ai', 7], resultaten: 'geen-lijst', bron: 'raar', verbergRuis: false, limiet: 9999, volgorde: 'oud' });
  check('filterUitBody: schoont invoer (lijsten, bron, limiet ≤ 200, verbergRuis standaard aan)', fb.q === 'tekst' && fb.categorieen?.length === 2 && fb.resultaten?.length === 0 && fb.bron === 'nieuw' && fb.limiet === 200 && fb.verbergRuis === false && fb.volgorde === 'oud' && filterUitBody({}).verbergRuis === true);
  // Audit fase 2 (L-01): het sessieveld `service` (altijd 'admin', vereist door adminContext) is GEEN rijfilter; het rijfilter heet `dienst`.
  const fbSessie = filterUitBody({ service: 'admin' }), fbDienst = filterUitBody({ service: 'admin', dienst: 'mcp' });
  check('L-01: body {service:\'admin\'} zonder dienst → geen service-filter in filterUitBody/bouwWaar', fbDienst.dienst === 'mcp' && !('service' in fbSessie) && fbSessie.dienst === undefined && !bouwWaar(fbSessie).waar.includes('service') && !bouwWaar({ service: 'admin' } as never).waar.includes('service'));
  const bwDienst = bouwWaar(fbDienst);
  check('L-01: met dienst:\'mcp\' → wel service = $n met parameter mcp', bwDienst.waar.includes('service = $') && bwDienst.p.includes('mcp'));

  // ---------------------------------------------------------------------------------------------- database
  if (!process.env.DATABASE_URL && !process.env.DATABASE_URL_SYSTEM) { console.log('OVERGESLAGEN beheer-journaal (db): geen DATABASE_URL'); return resultaten.some((r) => !r.ok) ? 1 : 0; }
  const sys = getPool('systeem');
  const tabelOk = await sys.query("SELECT to_regclass('app.audit') AS t").then((r) => !!r.rows[0]?.t).catch(() => false);
  if (!tabelOk) { console.log('OVERGESLAGEN beheer-journaal (db): app.audit ontbreekt'); return resultaten.some((r) => !r.ok) ? 1 : 0; }
  const eigenaar = randomUUID(), ander = randomUUID(), doelAccount = randomUUID(), tag = `jt${Date.now().toString(36)}`;
  try {
    // SQL-indeling == JS-indeling
    const sqlCat = await sys.query(`SELECT a AS actie, ${categorieSql('a')} AS c, ${resultaatSql('r')} AS k FROM unnest($1::text[], $2::text[]) AS t(a, r)`, [cat.map(([a]) => a), cat.map(() => 'success')]);
    check('categorieSql == categorieVan voor alle voorbeeldacties; resultaatSql == resultaatKlasse', sqlCat.rows.every((r) => r.c === categorieVan(r.actie) && r.k === 'ok')
      && (await sys.query(`SELECT ${resultaatSql('r')} AS k FROM unnest($1::text[]) AS t(r)`, [['denied', 'FAILURE', 'detected', '']])).rows.map((r) => r.k).join() === 'geweigerd,fout,info,info');

    const r1 = await journaalSchrijf({ actie: 'owner.admin.role.updated', actor: eigenaar, eigenaar: doelAccount, doel: { soort: 'account', id: doelAccount, naam: 'Ann' }, wijziging: { van: 'geen', naar: 'apps_admin' }, reden: `${tag} reden`, details: { token: 'GEHEIM', rol: 'apps_admin' } });
    const r2 = await journaalSchrijf({ actie: 'owner.api.vault.revealed', actor: eigenaar, doel: { soort: 'geheim', naam: `${tag}-sleutel` }, resultaat: 'denied' });
    const r3 = await journaalSchrijf({ actie: 'ai_grant_added', actor: ander, eigenaar: ander, agent: 'claude', doel: { soort: 'agent', id: 'claude', naam: 'Claude' }, details: { dagen: 30, zoek: tag }, service: 'mcp' });
    const r4 = await journaalSchrijf({ actie: 'owner.admin.bootstrap', actor: eigenaar, details: { zoek: tag } });
    const r5 = await journaalSchrijf({ actie: 'uitrol_voorbereider_gegeven', actor: eigenaar, doel: { soort: 'agent', id: 'gpt' }, resultaat: 'failure', details: { zoek: tag } });
    check('journaalSchrijf: geeft id/seq/hash terug voor alle vijf', [r1, r2, r3, r4, r5].every((r) => r && r.hash.length === 64 && r.seq >= 1));

    const rij1 = (await sys.query('SELECT type, details, actor_id, owner_id, service FROM app.audit WHERE id = $1', [r1!.id])).rows[0];
    check('rij: type = categorie, doel/wijziging/reden bewaard, geheim NIET bewaard, actor ≠ account, dienst admin',
      rij1.type === 'beheer' && rij1.details.doel.id === doelAccount && rij1.details.wijziging.naar === 'apps_admin' && rij1.details.reden === `${tag} reden` && rij1.details.token === undefined && rij1.details.rol === 'apps_admin' && rij1.actor_id === eigenaar && rij1.owner_id === doelAccount && rij1.service === 'admin');
    const sleutelRij = (await sys.query("SELECT 1 FROM app.audit WHERE details::text LIKE '%GEHEIM%' AND (owner_id = $1 OR actor_id = $2)", [doelAccount, eigenaar])).rows.length;
    check('geheim komt nergens in de tabel voor', sleutelRij === 0);

    const alle = await journaalZoeken({ q: tag, verbergRuis: false, limiet: 50 });
    check('q zoekt in details, doel en reden (4 regels met de tag + bootstrap zichtbaar zonder ruisfilter)', alle.items.length === 5, `${alle.items.length}`);
    const zonderRuis = await journaalZoeken({ q: tag, verbergRuis: true, limiet: 50 });
    check('verbergRuis verbergt owner.admin.bootstrap', zonderRuis.items.length === 4 && !zonderRuis.items.some((r) => r.action === 'owner.admin.bootstrap'));
    const perCat = await journaalZoeken({ q: tag, categorieen: ['ai'], verbergRuis: false });
    check('filter categorie ai → alleen ai_grant_added', perCat.items.length === 1 && perCat.items[0].action === 'ai_grant_added' && perCat.items[0].categorie === 'ai' && perCat.items[0].agent === 'claude');
    const perRes = await journaalZoeken({ q: tag, resultaten: ['geweigerd', 'fout'], verbergRuis: false });
    check('filter resultaat geweigerd+fout → vault denied en uitrol failure', perRes.items.map((r) => r.action).sort().join() === 'owner.api.vault.revealed,uitrol_voorbereider_gegeven');
    const perActor = await journaalZoeken({ q: tag, actorId: ander, verbergRuis: false });
    check('filter actor → alleen regels van die persoon', perActor.items.length === 1 && perActor.items[0].actorId === ander);
    const perDoel = await journaalZoeken({ doelId: doelAccount, verbergRuis: false });
    check('filter doel/account (owner_id of details.doel.id) vindt de rolwijziging met doel+wijziging afgeleid', perDoel.items.length === 1 && perDoel.items[0].doel?.naam === 'Ann' && wijzigingTekst(perDoel.items[0].wijziging) === 'geen → apps_admin');
    const perDoelAgent = await journaalZoeken({ doelId: 'gpt', q: tag, verbergRuis: false });
    check('filter doel op agent-id (details.doel.id)', perDoelAgent.items.length === 1 && perDoelAgent.items[0].action === 'uitrol_voorbereider_gegeven');
    // L-01: het admin-journaal (body met sessieveld service:'admin') toont ook regels die op mcp/hub/mail zijn geschreven; `dienst` filtert wél.
    const viaSessie = await journaalZoeken(filterUitBody({ service: 'admin', q: tag, verbergRuis: false, limiet: 50 }));
    const viaDienst = await journaalZoeken(filterUitBody({ service: 'admin', dienst: 'mcp', q: tag, verbergRuis: false, limiet: 50 }));
    check('L-01: zoeken met sessieveld service:admin vindt ook de mcp-regel (5); dienst:mcp vindt alleen die (1)', viaSessie.items.length === 5 && viaSessie.items.some((r) => r.service === 'mcp') && viaDienst.items.length === 1 && viaDienst.items[0].id === r3!.id);
    const perActie = await journaalZoeken({ actie: 'uitrol_*', q: tag, verbergRuis: false });
    check('filter actie met * (voorvoegsel)', perActie.items.length === 1);
    const perLabel = await journaalZoeken({ q: 'секрет', verbergRuis: false, limiet: 200 });
    check('zoeken op vertaald label («секрет») vindt owner.api.vault.revealed', perLabel.items.some((r) => r.id === r2!.id));
    const nu = Date.now();
    const bereik = await journaalZoeken({ q: tag, van: nu - 60_000, tot: nu + 60_000, verbergRuis: false });
    const buiten = await journaalZoeken({ q: tag, van: nu + 3_600_000, verbergRuis: false });
    check('datumbereik: binnen vindt 5, in de toekomst 0', bereik.items.length === 5 && buiten.items.length === 0);

    // sorteren en cursor
    const p1 = await journaalZoeken({ q: tag, verbergRuis: false, limiet: 2, volgorde: 'nieuw' });
    const p2 = await journaalZoeken({ q: tag, verbergRuis: false, limiet: 2, volgorde: 'nieuw', cursor: p1.nextCursor });
    const p3 = await journaalZoeken({ q: tag, verbergRuis: false, limiet: 2, volgorde: 'nieuw', cursor: p2.nextCursor });
    const ids = [...p1.items, ...p2.items, ...p3.items].map((r) => Number(r.id));
    check('cursor (nieuwste eerst): 2+2+1, geen dubbelen, aflopend, laatste pagina zonder nextCursor', ids.length === 5 && new Set(ids).size === 5 && ids.every((v, i) => i === 0 || v < ids[i - 1]) && !!p1.nextCursor && !!p2.nextCursor && !p3.nextCursor);
    const o1 = await journaalZoeken({ q: tag, verbergRuis: false, limiet: 3, volgorde: 'oud' });
    const o2 = await journaalZoeken({ q: tag, verbergRuis: false, limiet: 3, volgorde: 'oud', cursor: o1.nextCursor });
    const oi = [...o1.items, ...o2.items].map((r) => Number(r.id));
    check('cursor (oudste eerst): oplopend en volledig', oi.length === 5 && oi.every((v, i) => i === 0 || v > oi[i - 1]) && !o2.nextCursor);

    // statistiek
    const st = await journaalStatistiek({ q: tag, verbergRuis: false });
    const somCat = st.perCategorie.reduce((a, c) => a + c.n, 0), somRes = st.perResultaat.reduce((a, c) => a + c.n, 0);
    check('statistiek: totaal 5 = som per categorie = som per resultaat; actoren en dagen gevuld', st.totaal === 5 && somCat === 5 && somRes === 5 && st.actoren.length === 2 && st.perDag.length >= 1 && st.acties.length === 5 && st.laatste >= st.eerste);
    const stDienst = await journaalStatistiek({ q: tag, verbergRuis: false, dienst: 'mcp' });
    check('statistiek: perDienst telt admin 4 + mcp 1 en blijft volledig mét dienstfilter (totaal dan 1)', st.perDienst.find((d) => d.id === 'mcp')?.n === 1 && st.perDienst.find((d) => d.id === 'admin')?.n === 4 && stDienst.totaal === 1 && stDienst.perDienst.length === 2);
    const stRuis = await journaalStatistiek({ q: tag, verbergRuis: true });
    check('statistiek houdt rekening met verbergRuis', stRuis.totaal === 4);

    // export
    const personen = async () => new Map([[eigenaar, { id: eigenaar, email: 'eig@test.invalid', naam: 'Eigenaar' }]]);
    const csv = await journaalExport({ q: tag, verbergRuis: false }, {}, personen, 'csv');
    const regels = csv.inhoud.replace(/^﻿/, '').trim().split('\r\n');
    check('export CSV: BOM, kop + 5 regels, e-mail i.p.v. id, bestandsnaam .csv', csv.inhoud.startsWith('﻿') && regels.length === 6 && regels[0].startsWith('tijd,categorie,actie_code') && csv.inhoud.includes('eig@test.invalid') && csv.aantal === 5 && !csv.afgekapt && csv.bestandsnaam.endsWith('.csv'));
    const js = await journaalExport({ q: tag, verbergRuis: false }, {}, personen, 'json');
    const parsed = JSON.parse(js.inhoud);
    check('export JSON: parseerbaar met 5 items en hashes', parsed.aantal === 5 && parsed.items.length === 5 && parsed.items.every((i: { hash: string }) => i.hash.length === 64) && js.bestandsnaam.endsWith('.json') && EXPORT_MAX === 5000);

    // schrijfBeheerAudit (hulp voor de andere onderdelen): doel, voor→na, reden en agent komen terecht; geheimen niet
    const hulpTag = `hulp-${tag}`;
    const hr = await schrijfBeheerAudit({ actor: { id: eigenaar, email: 'eig@test.invalid' }, doel: { soort: 'agent', id: 'claude', naam: 'Claude' }, actie: 'beheer.agent.test', voor: '1 dag', na: 'onbepaald', reden: hulpTag, agent: 'claude', details: { token: 'GEHEIM-HULP-123' } });
    const hz = await journaalZoeken({ q: hulpTag, verbergRuis: false, limiet: 5 }, {});
    const h0 = hz.items[0];
    check('schrijfBeheerAudit: regel in categorie ai met doel, voor→na, reden, agent; geheim eruit', !!hr && hz.items.length === 1 && h0.categorie === 'ai' && h0.doel?.id === 'claude' && h0.reden === hulpTag && h0.agent === 'claude' && wijzigingTekst(h0.wijziging) === '1 dag → onbepaald' && !JSON.stringify(h0.details).includes('GEHEIM-HULP'));
    const hd = await journaalZoeken({ doelId: 'claude', q: hulpTag, verbergRuis: false, limiet: 5 }, {});
    check('filter doelId vindt ook regels met details.target.id (agent-audit)', hd.items.length === 1);

    // oud archief
    const oud = await journaalOud({ q: tag, limiet: 10 });
    check('oud archief: leesbaar en leeg voor deze tag (geen fout)', Array.isArray(oud.items) && oud.items.length === 0);

    // ketencontrole
    const keten = await ketenControleAlles();
    const eigen = await auditControle(eigenaar);
    check('ketencontrole: alle ketens doorlopen, onze ketens zonder fouten', keten.gecontroleerd >= 3 && eigen.geldig && eigen.totaal >= 3 && !keten.ongeldig.some((o) => [eigenaar, ander, doelAccount].includes(o.eigenaar)), `${keten.gecontroleerd} ketens, ${keten.totaal} regels, ${keten.duurMs} ms`);
    check('ketencontrole: tweede aanroep is stabiel (geen schrijven)', (await ketenControleAlles()).totaal >= keten.totaal);
  } finally {
    await closePool();
  }
  const fout = resultaten.filter((r) => !r.ok).length;
  console.log(`\nbeheer-journaal: ${resultaten.length - fout}/${resultaten.length} geslaagd`);
  return fout ? 1 : 0;
}
