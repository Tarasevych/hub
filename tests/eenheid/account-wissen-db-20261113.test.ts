// SEC-002 (slot-z, 13.11.2026): справжнє стирання облікового запису в базі для таблиць, яких реєстр раніше не покривав
// (стара вада приватності, була й в основі 11e0aad8): app.cloud_deel_koppelingen (0210) і app.huis_uitnodigingen (0212);
// продовження: gegevens.userId у журналі чужої оселі (app.huis_gebeurtenissen, 0128) і адресний список app.feature_flags.gebruikers.
// Echte wissing in de database: de rijen van A gaan weg (of worden losgekoppeld), de rijen van B en C blijven ongemoeid.
import { randomBytes } from 'node:crypto';
import { checker } from './hulp/nep-google';
import { accountMeteenWissen, accountWisTelling } from '../../backend/account-wissen';
import { getPool } from '../../server/platform/pg';

export async function main(): Promise<number> {
  const { check, einde } = checker('account-wissen-db-20261113');
  if (!process.env.DATABASE_URL_SYSTEM && !process.env.DATABASE_URL) { console.log('OVERGESLAGEN account-wissen-db (integratie): geen database'); return einde(); }
  const sys = getPool('systeem');
  const sfx = randomBytes(5).toString('hex');
  const A = `wis-a-${sfx}`; // wordt gewist / стирається
  const B = `wis-b-${sfx}`; // ander account / інший обліковий запис
  const C = `wis-c-${sfx}`; // derde: ontvanger en genodigde van B / третій: одержувач і запрошений B
  const mail = (x: string) => `${x}@test.invalid`;
  const hash = () => randomBytes(32).toString('hex');
  const ids = [A, B, C];
  try {
    for (const u of ids) {
      await sys.query("INSERT INTO app.records (tbl, id, data) VALUES ('users', $1, $2::jsonb)", [u, JSON.stringify({ email: mail(u), role: 'member', status: 'approved', name: `Naam ${u}` })]);
    }
    // Oselі: W_A належить A (з запрошенням для B), W_B належить B (запрошення для A — відхилене, для C, і «сирота» від A).
    const wA = (await sys.query("INSERT INTO app.huis_woningen (user_id, naam) VALUES ($1, 'Woning A') RETURNING id", [A])).rows[0].id as string;
    const wB = (await sys.query("INSERT INTO app.huis_woningen (user_id, naam) VALUES ($1, 'Woning B') RETURNING id", [B])).rows[0].id as string;
    const uitn = async (woning: string, email: string, userId: string | null, door: string, extra = '') =>
      (await sys.query(`INSERT INTO app.huis_uitnodigingen (woning_id, email, user_id, door_user_id${extra ? ', afgewezen_op, gemeld_op' : ''}) VALUES ($1, $2, $3, $4${extra ? ', now(), now()' : ''}) RETURNING id`, [woning, email, userId, door])).rows[0].id as string;
    const uAnaarB = await uitn(wA, mail(B), B, A);
    const uBnaarA = await uitn(wB, mail(A), A, B, 'afgewezen');
    const uBnaarC = await uitn(wB, mail(C), C, B);
    const uWees = await uitn(wB, `oud-${sfx}@test.invalid`, null, A); // від A, але оселя вже не його / van A, woning niet meer van A

    // Посилання: A — своє (з подією); B — для облікових записів [A, C], doel_id навмисно = id A (doel_id не про людину!).
    const deel = async (eigenaar: string, doelId: string, ontvangers: Array<{ email: string; userId?: string; naam?: string; geregistreerd: boolean }>) =>
      (await sys.query(`INSERT INTO app.cloud_deel_koppelingen (user_id, code_hash, naam, doel_soort, doel_id, modus, ontvangers, ontvanger_emails)
        VALUES ($1, $2, 'proef', 'bestand', $3, $4, $5::jsonb, $6::text[]) RETURNING id`,
        [eigenaar, hash(), doelId, ontvangers.length ? 'accounts' : 'link', JSON.stringify(ontvangers), ontvangers.map((o) => o.email)])).rows[0].id as string;
    const dA = await deel(A, 'bestand-1', []);
    await sys.query("INSERT INTO app.cloud_deel_gebeurtenissen (koppeling_id, user_id, soort) VALUES ($1, $2, 'weergave')", [dA, A]);
    const dB = await deel(B, A, [{ email: mail(A), userId: A, naam: `Naam ${A}`, geregistreerd: true }, { email: mail(C), userId: C, naam: `Naam ${C}`, geregistreerd: true }]);
    await sys.query("INSERT INTO app.cloud_deel_gebeurtenissen (koppeling_id, user_id, soort, ontvanger_email) VALUES ($1, $2, 'weergave', $3)", [dB, B, mail(C)]);

    // SEC-002 (slot-z, продовження): журнал оселі B (0128) — події з gegevens.userId (як у backend/huis-vnext.ts: учасника
    // прибрано / додано). Подія про A має лишитися, але без id, імені й адреси A; подія про C і подія без людини — без змін.
    // Logboek van woning B: de gebeurtenis over A blijft, zonder id/naam/adres van A; die over C en de neutrale blijven gelijk.
    const geb = async (woning: string, bericht: string, gegevens: Record<string, unknown>) =>
      (await sys.query("INSERT INTO app.huis_gebeurtenissen (woning_id, soort, ernst, bericht, gegevens) VALUES ($1, 'leden', 'belangrijk', $2, $3::jsonb) RETURNING id", [woning, bericht, JSON.stringify(gegevens)])).rows[0].id as string;
    const gBoverA = await geb(wB, 'Учасника прибрано (учасник) / Lid weggehaald (lid)', { userId: A, naam: `Naam ${A}`, email: mail(A), rol: 'lid' });
    const gBoverC = await geb(wB, 'Uitnodiging aanvaard: nieuw lid (lid)', { userId: C });
    const gBneutraal = await geb(wB, 'Uitnodiging vastgelegd', { uitnodigingId: uBnaarC });
    const gAeigen = await geb(wA, 'Lid toegevoegd (lid)', { userId: B });
    // Спільний прапорець функції з адресним списком [B, A, C] — лишається, з масиву зникає лише A.
    const vlag = `wis-proef-${sfx}`;
    await sys.query("INSERT INTO app.feature_flags (sleutel, omschrijving, aan, gebruikers, gewijzigd_door) VALUES ($1, 'proef account-wissen', true, $2::text[], $3)", [vlag, [B, A, C], B]);

    // «Сухий» підрахунок рахує й відв’язування: у C немає своїх рядків, лише запрошення від B, місце одержувача в посиланні B,
    // подія в журналі оселі B і місце в адресному списку прапорця.
    const telC = await accountWisTelling(C);
    check('droog: accountWisTelling telt ook het loskoppelen (C: uitnodiging + deellink + gebeurtenis woning B + vlag = 4)', telC.rijen === 4, `rijen=${telC.rijen}`);
    const telA = await accountWisTelling(A);

    const r = await accountMeteenWissen(A, mail(A));
    // droog telt ook rijen die bij het echte wissen al via ON DELETE CASCADE verdwenen (woning → uitnodigingen), dus droog ≥ echt.
    check('accountMeteenWissen(A) slaagt in één transactie', r.opdrachten > 0 && r.rijen >= 4 && telA.rijen >= r.rijen, `opdrachten=${r.opdrachten} rijen=${r.rijen} droog=${telA.rijen}`);

    const een = async (sql: string, p: unknown[]) => (await sys.query(sql, p)).rows;
    // huis
    check('huis: woning van A en de uitnodiging daarin (cascade) zijn weg', (await een('SELECT 1 FROM app.huis_woningen WHERE id = $1', [wA])).length === 0 && (await een('SELECT 1 FROM app.huis_uitnodigingen WHERE id = $1', [uAnaarB])).length === 0);
    check('huis: «verweesde» uitnodiging VAN A (door_user_id) is weg', (await een('SELECT 1 FROM app.huis_uitnodigingen WHERE id = $1', [uWees])).length === 0);
    const bA = (await een('SELECT user_id, door_user_id, email, afgewezen_op, gemeld_op, stand FROM app.huis_uitnodigingen WHERE id = $1', [uBnaarA]))[0];
    check('huis: uitnodiging van B AAN A blijft (B ziet geen verschil), maar zonder A: user_id/afwijzing/meldtijd NULL',
      Boolean(bA) && bA.user_id === null && bA.afgewezen_op === null && bA.gemeld_op === null && bA.door_user_id === B && bA.email === mail(A) && bA.stand === 'uitgenodigd');
    const bC = (await een('SELECT user_id, door_user_id FROM app.huis_uitnodigingen WHERE id = $1', [uBnaarC]))[0];
    check('huis: uitnodiging van B aan C en woning van B ongemoeid', Boolean(bC) && bC.user_id === C && bC.door_user_id === B && (await een('SELECT 1 FROM app.huis_woningen WHERE id = $1 AND user_id = $2', [wB, B])).length === 1);
    // cloud
    check('cloud: deellink van A en haar gebeurtenissen zijn weg', (await een('SELECT 1 FROM app.cloud_deel_koppelingen WHERE id = $1', [dA])).length === 0 && (await een('SELECT 1 FROM app.cloud_deel_gebeurtenissen WHERE koppeling_id = $1', [dA])).length === 0);
    const kB = (await een('SELECT doel_id, ontvangers, ontvanger_emails FROM app.cloud_deel_koppelingen WHERE id = $1', [dB]))[0] as { doel_id: string; ontvangers: Array<Record<string, unknown>>; ontvanger_emails: string[] } | undefined;
    check('cloud: deellink van B blijft — doel_id (= toevallig id van A) NIET als account behandeld', Boolean(kB) && kB!.doel_id === A);
    const oA = kB?.ontvangers.find((o) => o.email === mail(A));
    const oC = kB?.ontvangers.find((o) => o.email === mail(C));
    check('cloud: in de deellink van B is A ontvanger zonder id en naam (adres blijft), C ongewijzigd, volgorde behouden',
      Boolean(oA) && !('userId' in oA!) && !('naam' in oA!) && oA!.geregistreerd === false
      && Boolean(oC) && oC!.userId === C && oC!.naam === `Naam ${C}` && oC!.geregistreerd === true
      && kB!.ontvangers[0]?.email === mail(A) && kB!.ontvanger_emails.length === 2 && !kB!.ontvangers.some((o) => o.userId === A || o.naam === `Naam ${A}`));
    check('cloud: gebeurtenis in de deellink van B blijft', (await een('SELECT 1 FROM app.cloud_deel_gebeurtenissen WHERE koppeling_id = $1', [dB])).length === 1);
    // huis-logboek (стара вада: gegevens.userId у журналі чужої оселі лишався після стирання)
    const gebVan = async (id: string) => (await een('SELECT woning_id, soort, bericht, gegevens FROM app.huis_gebeurtenissen WHERE id = $1', [id]))[0] as { woning_id: string; soort: string; bericht: string; gegevens: Record<string, unknown> } | undefined;
    const gA = await gebVan(gBoverA);
    check('huis-logboek: gebeurtenis in woning B over A BLIJFT (zelfde woning, soort, bericht)',
      Boolean(gA) && gA!.woning_id === wB && gA!.soort === 'leden' && gA!.bericht === 'Учасника прибрано (учасник) / Lid weggehaald (lid)');
    check('huis-logboek: in gegevens geen id, naam of adres van A meer; overige velden blijven',
      Boolean(gA) && !('userId' in gA!.gegevens) && !('naam' in gA!.gegevens) && !('email' in gA!.gegevens) && gA!.gegevens.rol === 'lid'
      && !JSON.stringify(gA!.gegevens).includes(A), JSON.stringify(gA?.gegevens));
    const gC = await gebVan(gBoverC);
    const gN = await gebVan(gBneutraal);
    check('huis-logboek: gebeurtenis over C en neutrale gebeurtenis in woning B ongewijzigd',
      gC?.gegevens.userId === C && Object.keys(gC.gegevens).length === 1 && gN?.gegevens.uitnodigingId === uBnaarC);
    check('huis-logboek: gebeurtenissen van de eigen woning van A gaan mee met de woning (cascade)', !(await gebVan(gAeigen)));
    check('huis-logboek: nergens in de huis-gebeurtenissen nog het id van A', (await een("SELECT 1 FROM app.huis_gebeurtenissen WHERE gegevens->>'userId' = $1 OR gegevens::text LIKE '%' || $1 || '%'", [A])).length === 0);
    // vlag
    const v = (await een('SELECT aan, gebruikers, gewijzigd_door FROM app.feature_flags WHERE sleutel = $1', [vlag]))[0] as { aan: boolean; gebruikers: string[]; gewijzigd_door: string } | undefined;
    check('vlag blijft; uit gebruikers alleen A weg (B en C in dezelfde volgorde)',
      Boolean(v) && v!.aan === true && v!.gewijzigd_door === B && JSON.stringify(v!.gebruikers) === JSON.stringify([B, C]), JSON.stringify(v?.gebruikers));
    const telNa = await accountWisTelling(A);
    check('na het wissen telt het plan voor A niets meer', telNa.rijen === 0, `rijen=${telNa.rijen}`);
    const gebruikerB = (await een("SELECT data->>'status' AS s FROM app.records WHERE tbl = 'users' AND id = $1", [B]))[0];
    check('account B ongemoeid', gebruikerB?.s === 'approved');
  } finally {
    await sys.query('DELETE FROM app.feature_flags WHERE sleutel = $1', [`wis-proef-${sfx}`]).catch(() => undefined);
    await sys.query('DELETE FROM app.huis_woningen WHERE user_id = ANY($1::text[])', [ids]).catch(() => undefined);
    await sys.query('DELETE FROM app.cloud_deel_koppelingen WHERE user_id = ANY($1::text[])', [ids]).catch(() => undefined);
    await sys.query("DELETE FROM app.records WHERE tbl = 'users' AND id = ANY($1::text[])", [ids]).catch(() => undefined);
  }
  return einde();
}
