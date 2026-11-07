// MAILMOB-001 · Één veilige route→actie-mapping voor de client EN de server.
// Een onbekende route kan nooit als «bevestigen» worden onthouden.
export const ACTIE_PER_PAD: ReadonlyArray<readonly [RegExp, string]> = [
  [/\/passkeys\/registreren/, 'passkey-toevoegen'], [/\/passkeys\/verwijderen/, 'passkey-verwijderen'],
  [/\/passkeys\/goedkeuring\/recht-intrekken/, 'goedkeur-recht-intrekken'], [/\/passkeys\/goedkeuring\/(aanvragen|bevestigen)/, 'goedkeur-recht-aanvragen'],
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
  [/\/(agents|connectors|mcp-connector|mcp)\b/, 'agenten'],
];
export function actieVoorPad(pad: string): string {
  const p = String(pad || '').split('?')[0];
  if (!p) return 'onbekend';
  for (const [re, actie] of ACTIE_PER_PAD) if (re.test(p)) return actie;
  return 'onbekend';
}
