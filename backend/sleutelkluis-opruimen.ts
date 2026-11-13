// SEC-002 geheimen-05 (12.11.2026) — omslagen van de gegevenssleutel opruimen waar de sleutelkluis het zelf niet deed.
//
// De belofte in de kop van backend/sleutelkluis.ts: «intrekken of verlopen = dicht, en de omslagen worden verwijderd». Dat gold
// alleen voor de wegen die grantSluiten() aanroepen (mcp-connector.ts, connector-v2-opslag.ts). De noodstop, het blokkeren van een
// gebruiker, het bevriezen/overdragen/verwijderen van de technische ruimte en het vanzelf verlopen van een verbinding zetten
// `revoked_at` rechtstreeks of deden niets: de 'grant'-omslagen bleven in de database (back-up + pepper + oud token = DEK) en de
// verbinding bleef tot de luie controle houder van de open sleutel in het geheugen. Een verwijderde passkey liet zijn omslag achter.
//
// Deze module is bewust een eigen bestand (sleutelkluis.ts wordt door meer mensen tegelijk bewerkt) en gebruikt alleen wat die
// module al exporteert. Niets hier leest of logt een sleutel; er wordt alleen verwijderd.
import { getPool } from '../server/platform/pg';
import type { AiRuimte } from '../shared/ai-ruimte';
import { sleutelSluitenVoorHouder } from './sleutelkluis';

const sys = () => getPool('systeem');

/**
 * Na een massale intrekking (noodstop, blokkeren, technische ruimte bevroren, lade overgedragen/verwijderd): elke verbinding van
 * deze mens die niet meer leeft, verliest haar plaats als houder (geheugen) én haar omslagen (database). `ruimte` zegt alleen
 * welke intrekking de aanleiding was; opgeruimd wordt ELKE dode verbinding van deze mens (dood is dood, in welke ruimte ook — zo
 * kan een omslag nooit achterblijven doordat de ruimte van de omslag en die van het token uiteenlopen). Een levende verbinding (niet ingetrokken, refresh-token nog geldig) blijft ongemoeid. Geeft het aantal
 * verwijderde omslagen terug. Faalt nooit hard: de intrekking zelf is dan al gebeurd.
 */
export async function grantsSluitenVoorGebruiker(userId: string, _ruimte?: AiRuimte | null): Promise<number> {
  try {
    const r = await sys().query(
      `DELETE FROM app.sleutelkluis_omslag o
        WHERE o.user_id = $1 AND o.soort = 'grant'
          AND NOT EXISTS (SELECT 1 FROM app.mcp_oauth_tokens t WHERE t.id::text = o.houder AND t.revoked_at IS NULL AND t.refresh_expires_at > now())
        RETURNING o.houder`, [userId]);
    const houders = new Set<string>(r.rows.map((x: { houder: unknown }) => String(x.houder)));
    // Ook verbindingen ZONDER omslag kunnen houder zijn (uitgegeven terwijl de sleutel open stond, omslag al eerder weg).
    const dood = await sys().query(
      `SELECT id::text AS id FROM app.mcp_oauth_tokens
        WHERE user_id = $1 AND (revoked_at IS NOT NULL OR refresh_expires_at <= now())
        ORDER BY created_at DESC LIMIT 500`, [userId]).catch(() => ({ rows: [] as Array<{ id: string }> }));
    for (const x of dood.rows as Array<{ id: string }>) houders.add(String(x.id));
    for (const id of houders) sleutelSluitenVoorHouder('grant', id);
    return r.rowCount ?? 0;
  } catch (err) {
    console.error('[sleutelkluis] omslagen van ingetrokken verbindingen opruimen mislukt:', (err as Error).message);
    return 0;
  }
}

/** Een verwijderde passkey kan de gegevenssleutel niet meer openen: zijn omslagen in BEIDE ruimtes weg. */
export async function passkeyOmslagenWeg(userId: string, passkeyId: string): Promise<number> {
  try {
    const r = await sys().query(`DELETE FROM app.sleutelkluis_omslag WHERE user_id = $1 AND soort = 'passkey' AND houder = $2`, [userId, String(passkeyId)]);
    return r.rowCount ?? 0;
  } catch (err) {
    console.error('[sleutelkluis] passkey-omslag opruimen mislukt:', (err as Error).message);
    return 0;
  }
}

/**
 * Periodieke ronde (server/start.ts), onafhankelijk van welke sleutels open staan:
 *   • 'grant'-omslagen zonder levende rij in app.mcp_oauth_tokens (ingetrokken, verlopen of verwijderd);
 *   • 'passkey'-omslagen zonder rij in app.passkeys.
 * De 'herstelcode'-omslag wordt hier NOOIT aangeraakt: dat is de enige weg terug voor de mens.
 */
export async function omslagenOpruimen(): Promise<{ grant: number; passkey: number }> {
  const uit = { grant: 0, passkey: 0 };
  try {
    const g = await sys().query(
      `DELETE FROM app.sleutelkluis_omslag o
        WHERE o.soort = 'grant'
          AND NOT EXISTS (SELECT 1 FROM app.mcp_oauth_tokens t WHERE t.id::text = o.houder AND t.revoked_at IS NULL AND t.refresh_expires_at > now())
        RETURNING o.houder`);
    uit.grant = g.rowCount ?? 0;
    for (const id of new Set<string>(g.rows.map((x: { houder: unknown }) => String(x.houder)))) sleutelSluitenVoorHouder('grant', id);
    const p = await sys().query(
      `DELETE FROM app.sleutelkluis_omslag o
        WHERE o.soort = 'passkey' AND NOT EXISTS (SELECT 1 FROM app.passkeys p WHERE p.id::text = o.houder AND p.user_id = o.user_id)`);
    uit.passkey = p.rowCount ?? 0;
  } catch (err) {
    console.error('[sleutelkluis] periodiek opruimen van omslagen mislukt:', (err as Error).message);
  }
  return uit;
}
