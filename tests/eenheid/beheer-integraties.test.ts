// Admin → /mappen «Інтеграції»: detailgegevens (eerlijk), populair/nieuw, beleid voor gebruikers, statuscontrole, loskoppelen, toegang en logboek.
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { closePool, getPool } from '../../server/platform/pg';
import { INTEGRATIES, integratie } from '../../shared/integraties-catalogus';
import { CODE_TEKST, NIEUW, POPULAIR, codeTekst, detailVan } from '../../shared/integraties-detail';
import { adminIntegratieRoutes, standUitLevend, zetBeleid, type AdminGate } from '../../backend/beheer-integraties';
import { checker } from './hulp/nep-google';

type Res = { statusCode: number; body: string };
const lees = (r: unknown) => { const x = r as Res; let b: Record<string, unknown> = {}; try { b = JSON.parse(x.body); } catch { /* geen json */ } return { status: x.statusCode, b }; };

export async function main(): Promise<number> {
  const { check, einde } = checker('beheer-integraties');
  const sys = getPool('systeem');
  const ADMIN = `ai-${randomUUID()}`;
  try {
    // ---- detailgegevens
    const klaar = INTEGRATIES.filter((i) => i.status !== 'binnenkort');
    const soon = INTEGRATIES.filter((i) => i.status === 'binnenkort');
    check('detail: elke bestaande koppeling heeft eigen rechten, stappen en https-documentatie', klaar.every((i) => { const d = detailVan(i); return d.rechten.length > 0 && d.stappen.length > 0 && /^https:\/\//.test(d.docs) && d.rechten[0][0].length > 20 && d.rechten[0][1].length > 20; }));
    check('detail: «binnenkort» krijgt geen verzonnen scopes of stappen (geen koppelknop)', soon.every((i) => { const d = detailVan(i); return /ще не|nog niet|немає|Nog geen|Поки/.test(d.rechten[0].join(' ')) && !d.kluis && !d.loskoppelbaar; }));
    check('detail: loskoppelbaar alleen voor sleutels in de kluis (die een levende toestand hebben)', klaar.filter((i) => detailVan(i).loskoppelbaar).every((i) => ['github', 'telegram', 'anthropic', 'home-assistant'].includes(i.levend || '')));
    check('populair/nieuw: ids bestaan in de catalogus', [...POPULAIR, ...NIEUW].every((id) => integratie(id)));
    check('populair: minstens 20; nieuw: de zes agenten + eigen client', POPULAIR.size >= 20 && NIEUW.size === 7 && [...NIEUW].every((id) => integratie(id)?.status === 'klaar'));

    // ---- standUitLevend: eerlijk, geen verzonnen «ok»
    const gh = integratie('github')!, slack = integratie('slack')!, claude = integratie('claude')!;
    check('stand: binnenkort → onbekend/NIET_GEBOUWD', standUitLevend(slack, null).stand === 'onbekend' && standUitLevend(slack, null).code === 'NIET_GEBOUWD');
    check('stand: bestaand maar niet te lezen → onbekend', standUitLevend(gh, null).stand === 'onbekend');
    check('stand: sleutel in kluis → let-op (niet geverifieerd), nooit «ok»', standUitLevend(gh, { toestand: 'ingesteld', code: 'X', detail: 'x' }).stand === 'let-op');
    check('stand: actieve agent → ok; geen koppeling → let-op; fout → fout', standUitLevend(claude, { toestand: 'verbonden', code: 'X', detail: 'x' }).stand === 'ok' && standUitLevend(claude, { toestand: 'niet', code: 'X', detail: 'x' }).stand === 'let-op' && standUitLevend(gh, { toestand: 'fout', code: 'X', detail: 'x' }).stand === 'fout');

    // ---- codes → tekst in beide talen (de server stuurt codes)
    const codes = ['AGENT_ACTIEF', 'AGENT_GEEN', 'VAULT_FOUT', 'VAULT_INGETROKKEN', 'VAULT_SLEUTEL', 'VAULT_GEEN', 'NIET_GEBOUWD', 'GEEN_LEVENDE_STATUS', 'MELDT_FOUT', 'VERBONDEN', 'NIET_GEVERIFIEERD', 'NIET_GEKOPPELD'];
    check('codes: elke servercode heeft uk- en nl-tekst', codes.every((c) => CODE_TEKST[c] && CODE_TEKST[c][0].length > 5 && CODE_TEKST[c][1].length > 5));
    check('codes: {n} wordt ingevuld, onbekende code valt terug op de meegegeven tekst', codeTekst('AGENT_ACTIEF', 'uk', 3).includes('3') && !codeTekst('AGENT_ACTIEF', 'nl', 2).includes('{n}') && codeTekst('ONBEKEND', 'uk', 0, 'terug') === 'terug');
    check('codes: ukrainse tekst bevat geen Nederlands (geen «sleutel»/«koppeling»)', codes.every((c) => !/sleutel|koppeling|kluis|dienst/i.test(CODE_TEKST[c][0])));

    // ---- beleid (database)
    const r1 = await zetBeleid('claude', true, ADMIN);
    check('beleid: aanzetten voor een bestaande koppeling', r1.na === true);
    const r2 = await zetBeleid('claude', false, ADMIN);
    check('beleid: uitzetten geeft voor=true, na=false', r2.voor === true && r2.na === false);
    const geweigerd = await zetBeleid('slack', true, ADMIN).then(() => 'ok', (e: { code?: string }) => e.code);
    check('beleid: «binnenkort» wordt geweigerd (NIET_BESCHIKBAAR)', geweigerd === 'NIET_BESCHIKBAAR');
    const onbekend = await zetBeleid('bestaat-niet', true, ADMIN).then(() => 'ok', (e: { code?: string }) => e.code);
    check('beleid: onbekend id → INTEGRATIE_ONBEKEND', onbekend === 'INTEGRATIE_ONBEKEND');
    const rij = (await sys.query("SELECT voor_gebruikers, bijgewerkt_door FROM app.integratie_beleid WHERE integratie = 'slack'")).rows[0];
    check('beleid: geweigerde wijziging laat niets achter', !rij);

    // ---- routes met een nep-poort
    let rol: 'admin' | 'geen' | 'lezer' = 'admin';
    const gate: AdminGate = async (_c, cap) => {
      if (rol === 'geen') return { errorCode: 'OWNER_ADMIN_REQUIRED' };
      if (rol === 'lezer' && cap !== 'admin.read') return { errorCode: 'OWNER_ADMIN_REQUIRED' };
      return { user: { id: ADMIN, email: `${ADMIN}@example.test` }, capabilities: ['admin.read'] };
    };
    const sessie = async (_e: Record<string, unknown>, _b: unknown) => ({ user: { id: ADMIN, status: 'approved', role: 'member' }, service: 'hub' });
    const R = adminIntegratieRoutes(gate, sessie as never);
    const roep = async (pad: string, body: Record<string, unknown>) => lees(await (R[`POST /api/owner/${pad}`][0] as (c: unknown) => Promise<unknown>)({ event: {}, body }));

    rol = 'geen';
    check('routes: zonder beheerrol overal 403', (await roep('admin/integraties/stand', {})).status === 403 && (await roep('admin/integraties/beleid', { id: 'claude', voorGebruikers: true })).status === 403 && (await roep('admin/integraties/controleer', { id: 'claude' })).status === 403);
    rol = 'lezer';
    check('routes: alleen-lezen beheerder mag het beleid niet wijzigen of loskoppelen (apps.manage)', (await roep('admin/integraties/beleid', { id: 'claude', voorGebruikers: true })).status === 403 && (await roep('admin/integraties/loskoppelen', { id: 'github', bevestig: true })).status === 403);
    rol = 'admin';
    const stand = await roep('admin/integraties/stand', {});
    check('stand: antwoord met levend, beleid en controles', stand.status === 200 && typeof stand.b.levend === 'object' && typeof stand.b.beleid === 'object' && typeof stand.b.controles === 'object');
    const b1 = await roep('admin/integraties/beleid', { id: 'gitea', voorGebruikers: true });
    check('beleid-route: «binnenkort» geeft 400 NIET_BESCHIKBAAR', b1.status === 400 && b1.b.error === 'NIET_BESCHIKBAAR');
    const b2 = await roep('admin/integraties/beleid', { id: 'claude', voorGebruikers: true });
    check('beleid-route: bestaande koppeling aanzetten', b2.status === 200 && b2.b.voorGebruikers === true && b2.b.gewijzigd === true);
    const b3 = await roep('admin/integraties/beleid', { id: 'claude', voorGebruikers: true });
    check('beleid-route: herhalen is een no-op (gewijzigd=false)', b3.status === 200 && b3.b.gewijzigd === false);
    const beschikbaar = lees(await (R['POST /api/owner/integraties/beschikbaar'][0] as (c: unknown) => Promise<unknown>)({ event: {}, body: {} }));
    check('beschikbaar: gebruiker ziet alleen de ids die de beheerder opende', beschikbaar.status === 200 && JSON.stringify(beschikbaar.b.ids).includes('claude') && !JSON.stringify(beschikbaar.b).includes('door'));
    const bx = await roep('admin/integraties/beleid', { id: 'claude', voorGebruikers: false });
    check('beleid-route: weer uitzetten', bx.status === 200 && bx.b.voorGebruikers === false);

    const c1 = await roep('admin/integraties/controleer', { id: 'slack' });
    check('controleer: binnenkort → onbekend, wordt bewaard', c1.status === 200 && c1.b.stand === 'onbekend' && c1.b.code === 'NIET_GEBOUWD');
    const c2 = await roep('admin/integraties/controleer', { id: 'telegram' });
    check('controleer: bestaande sleutelkoppeling geeft een eerlijke stand (nooit ok zonder verificatie)', c2.status === 200 && ['let-op', 'onbekend', 'fout'].includes(String(c2.b.stand)));
    const hist = (await sys.query("SELECT count(*)::int AS n FROM app.integratie_controles WHERE integratie IN ('slack','telegram') AND door = $1", [ADMIN])).rows[0];
    check('controleer: geschiedenis opgeslagen (2 regels)', hist.n === 2);
    check('controleer: onbekend id → 404', (await roep('admin/integraties/controleer', { id: 'bestaat-niet' })).status === 404);

    const l1 = await roep('admin/integraties/loskoppelen', { id: 'github' });
    check('loskoppelen: zonder bevestiging geweigerd', l1.status === 400 && l1.b.error === 'BEVESTIGING_VEREIST');
    const l2 = await roep('admin/integraties/loskoppelen', { id: 'gmail', bevestig: true });
    check('loskoppelen: Google-koppelingen kunnen hier niet los (LOSKOPPELEN_NIET_MOGELIJK)', l2.status === 400 && l2.b.error === 'LOSKOPPELEN_NIET_MOGELIJK');
    const l3 = await roep('admin/integraties/loskoppelen', { id: 'slack', bevestig: true });
    check('loskoppelen: «binnenkort» kan niet los', l3.status === 400);

    // ---- logboek: elke wijziging/controle staat erin
    const logs = (await sys.query("SELECT action FROM app.audit WHERE action LIKE 'integration.%' AND (details::text LIKE '%' || $1 || '%' OR actor_id = $1 OR owner_id = $1) ORDER BY created_at", [ADMIN]).catch(() => ({ rows: [] as Array<{ action: string }> }))).rows.map((x) => x.action);
    check('logboek: beleid aan/uit, geweigerd en test zijn gelogd', ['integration.beleid.aan', 'integration.beleid.uit', 'integration.beleid.geweigerd', 'integration.test'].every((a) => logs.includes(a)));
  } finally {
    await sys.query("DELETE FROM app.integratie_beleid WHERE integratie IN ('claude','slack','gitea')").catch(() => undefined);
    await sys.query('DELETE FROM app.integratie_controles WHERE door = $1', [ADMIN]).catch(() => undefined);
    await closePool().catch(() => undefined);
  }
  // Audit 19.10.2026: een al gekoppelde dienst toont «Налаштувати» in plaats van nog eens «Підключити» (kaart én detail).
  const il = readFileSync('src/integraties/Integraties.tsx', 'utf8'); const dt = readFileSync('src/integraties/Detail.tsx', 'utf8');
  check('gekoppelde kaart: «Налаштувати» (data-il-actie=instellen) i.p.v. «Підключити»', /levend\(i\) === 'verbonden' \? tr\('Налаштувати', 'Instellen'\) : tr\('Підключити', 'Koppelen'\)/.test(il) && /levend === 'verbonden' \? tr\('Налаштувати', 'Instellen'\) : tr\('Підключити', 'Koppelen'\)/.test(dt));
  return einde();
}
