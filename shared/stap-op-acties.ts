// MAILMOB-001 · Één veilige route→actie-mapping voor de client EN de server.
// Een onbekende route kan nooit als «bevestigen» worden onthouden.
export const ACTIE_PER_PAD: ReadonlyArray<readonly [RegExp, string]> = [
  // IDENTITEIT-015: псевдоадреса вікна воріт «другий чинник обов'язковий» (src/geheim/TweedeFactorPoort.tsx); такий маршрут не змінює даних.
  [/\/access\/tweede-factor$/, 'tweede-factor'],
  [/\/passkeys\/registreren/, 'passkey-toevoegen'], [/\/passkeys\/verwijderen/, 'passkey-verwijderen'],
  // IDENTITEIT-015 (sleutels-gasten): довіра до ключа — дати й відкликати (обидва шляхи — одна дія; сервер вимагає посиленого підтвердження).
  [/\/passkeys\/vertrouwen(-intrekken)?$/, 'passkey-vertrouwen'],
  [/\/passkeys\/goedkeuring\/recht-intrekken/, 'goedkeur-recht-intrekken'], [/\/passkeys\/goedkeuring\/(aanvragen|bevestigen)/, 'goedkeur-recht-aanvragen'],
  // IDENTITEIT-014: iemand «beheerder» van een gedeelde ruimte maken (e-mail, koppeling, rol wijzigen). Alleen deze drie paden; /link/revoke niet.
  [/\/api\/share\/(email|link|role)$/, 'deel-beheerder'],
  // IDENTITEIT-015 (profiel-blokken): простір передати іншому учасникові — той отримає повне керування.
  [/\/api\/owner\/identity\/workspaces\/[^/]+\/overdragen$/, 'werkruimte-overdragen'],
  // IDENTITEIT-015 (apparaten-uitvoer): попередження про новий пристрій вимкнути (сервер просить лише для «Вимкнено») і забути пристрій.
  [/\/api\/owner\/identity\/apparaten\/melding$/, 'apparaat-melding-uit'], [/\/api\/owner\/identity\/apparaten\/vergeten$/, 'apparaat-vergeten'],
  [/\/recovery\/rotate/, 'herstelcodes-nieuw'], [/\/recovery\/intrekken/, 'herstelcodes-intrekken'],
  [/\/toegangscodes\/maken/, 'toegangscode-maken'], [/\/toegangscodes\/wijzigen/, 'toegangscode-verlengen'],
  [/\/ruimte\/keuze/, 'ruimte-keuze'], [/\/ruimte\/besluit/, 'ruimte-besluit'], [/\/ruimte\/dienst/, 'ruimte-verbinden'],
  [/\/toegang\/wijziging\/terugdraaien/, 'wijziging-terugdraaien'], [/\/uitrol\/voorbereiders/, 'voorbereider'], [/\/uitrol\//, 'uitrol-goedkeuren'],
  [/\/totp\/(disable|uitschakelen)/, 'totp-uitschakelen'], [/\/totp\//, 'totp-wijzigen'], [/\/(password|codewoord)\b/, 'wachtwoord'],
  [/export/, 'export'], [/(account|user)s?\/(delete|verwijder)/, 'account-verwijderen'], [/\/admin\b|\/beheer\b/, 'beheer'],
  [/\/(geheim|geheimen|secret|secrets|vault|sleutel|sleutels|sleutelkluis)\b/, 'onbekend'],
  [/\/(verwijderen|verwijder|delete|intrekken|revoke|wissen)\b/, 'onbekend'],
  [/\/(ssh|ssh-ca|terminal|impersonatie|ondersteuning|tech-ruimtes|remote|bureaublad|ontgrendel|ontgrendeling)\b/, 'onbekend'],
  [/\/tech\/activeren\b/, 'bevestigen'],
  // SEC-002 extensie-02 (12.11.2026): wat een AI zelf rechten of uitvoering geeft, wordt NOOIT onthouden — een opdracht of aanroep
  // goedkeuren, een browser voor AI aanzetten, het beleid «zonder klik», een koppelcode voor een nieuw apparaat en de modus van een
  // hulpmiddel. Met «Запам'ятати цей браузер» (12 uur) kon een AI met «Клік і введення» deze knoppen anders zelf indrukken zonder dat
  // er nog één keer om een passkey of code werd gevraagd. (`/mcp-connector/consent` staat hier bewust nog NIET: de bestaande test
  // mailmob-001 legt vast dat die onthouden mag worden — zie het verslag van SEC-002 g10a, «відкладено».)
  [/\/(approve|browser-enabled|policy|pairing-code)$/, 'onbekend'], [/\/mcp-connector\/tools\/set(-all)?$/, 'onbekend'],
  [/\/(agents|connectors|mcp-connector|mcp)\b/, 'agenten'],
];
export function actieVoorPad(pad: string): string {
  const p = String(pad || '').split('?')[0];
  if (!p) return 'onbekend';
  for (const [re, actie] of ACTIE_PER_PAD) if (re.test(p)) return actie;
  return 'onbekend';
}

// STAPOP-OMSCHR-001 (15.11.2026): voor de tekst van het venster «Підтвердіть доступ» (shared/stap-op-beschrijving.ts). Hier, en niet
// daar, zodat src/platform/stap-op.ts (hoofdbundel) het register met alle teksten niet hoeft mee te laden.
/** Відомі поля запиту, з яких складається опис (не весь запит: у ньому можуть бути секрети, напр. значення ключа). */
export type VerzoekKern = { actie?: string; agent?: string; termijn?: string; minuten?: number; unblock?: boolean; aan?: boolean; verbinding?: boolean; alleVerbindingen?: boolean; eindOp?: boolean };

/** Vist uit het verzoek alleen de velden die het venster nodig heeft; vrije tekst wordt niet doorgegeven. */
export function verzoekKern(body: unknown): VerzoekKern {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const uit: VerzoekKern = {};
  if (typeof b.actie === 'string' && /^[a-z][a-z-]{1,30}$/.test(b.actie)) uit.actie = b.actie;
  if (typeof b.agent === 'string' && /^[a-z][a-z0-9-]{1,30}$/.test(b.agent)) uit.agent = b.agent;
  if (typeof b.termijn === 'string' && /^[a-z][a-z-]{1,30}$/.test(b.termijn)) uit.termijn = b.termijn;
  const m = Number(b.minuten);
  if (b.minuten !== undefined && b.minuten !== null && Number.isFinite(m) && m > 0 && m <= 100_000) uit.minuten = Math.round(m);
  if (b.unblock === true) uit.unblock = true;
  if (typeof b.aan === 'boolean') uit.aan = b.aan;
  // Alleen OF er een bepaalde koppeling (token) genoemd is. '*' en 'agent:<slug>' zijn geen koppeling: de server neemt dan de regel
  // van de agent (AGENTSCHEIDING-001); «alle AI's» alleen via het expliciete alleVerbindingen === true.
  if (typeof b.verbindingId === 'string' && b.verbindingId.trim() && b.verbindingId.trim() !== '*' && !b.verbindingId.trim().startsWith('agent:')) uit.verbinding = true;
  if (b.alleVerbindingen === true) uit.alleVerbindingen = true;
  if (b.eindOp !== undefined && b.eindOp !== null && b.eindOp !== '') uit.eindOp = true;
  return uit;
}

