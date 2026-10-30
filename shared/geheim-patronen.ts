// GEHEIMEN HERKENNEN — één lijst voor de uitrol-voorcontrole (backend/uitrol-voorcontrole.ts, «geheimen») en de zoekindex
// (backend/zoek/bronnen.ts: een lijst, bestand of notitie waarin een token, sleutel of wachtwoord staat, komt NIET als
// doorzoekbare tekst in app.zoek_objecten; het geheim wordt vervangen door «[geheim]»). Puur: geen Node, geen DOM.
//
// Bewust alleen patronen met een hoge zekerheid (vaste voorvoegsels, PEM-koppen, «wachtwoord: …»-regels): een gewone
// zin met het woord «token» is geen geheim. Fout-positieven kosten alleen een stukje tekst in de index; fout-negatieven
// zetten een sleutel in een doorzoekbare tabel — daarom liever iets te streng bij regels met een expliciete sleutelnaam.

export type GeheimSoort = 'privésleutel' | 'GitHub-token' | 'AWS-sleutel' | 'Anthropic-sleutel' | 'Slack-token' | 'OpenAI-sleutel' | 'Google-API-sleutel'
  | 'Stripe-sleutel' | 'JWT' | 'Bearer-token' | 'wachtwoordregel' | 'sleutelregel' | 'verbindingsreeks' | 'app-wachtwoord';

/**
 * De STRIKTE lijst: vaste voorvoegsels en PEM-koppen, vrijwel nooit fout-positief. Dit is precies wat de uitrol-voorcontrole
 * al sinds 18.10.2026 over een heel bronpakket laat lopen (daar zou een breder patroon elke release een waarschuwing geven:
 * tests en documentatie bevatten «wachtwoord: …»-voorbeelden). [patroon, soort]; zonder g-vlag (geen lastIndex-geheugen).
 */
export const GEHEIM_PATRONEN_STRIKT: ReadonlyArray<readonly [RegExp, GeheimSoort]> = Object.freeze([
  [/-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/, 'privésleutel'],
  [/\bghp_[A-Za-z0-9]{36}\b/, 'GitHub-token'],
  [/\bAKIA[0-9A-Z]{16}\b/, 'AWS-sleutel'],
  [/\bsk-ant-[A-Za-z0-9_-]{20,}/, 'Anthropic-sleutel'],
  [/\bxox[abprs]-[A-Za-z0-9-]{10,}/, 'Slack-token'],
]);
/** De VOLLEDIGE lijst voor de zoekindex: de strikte patronen plus tokens, JWT's, verbindingsreeksen en wachtwoordregels. */
export const GEHEIM_PATRONEN: ReadonlyArray<readonly [RegExp, GeheimSoort]> = Object.freeze([
  // Een volledig PEM-blok (kop t/m voet) in één keer weg; de losse kop uit de strikte lijst vangt de rest.
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/, 'privésleutel'],
  ...GEHEIM_PATRONEN_STRIKT,
  [/\bgh[pousr]_[A-Za-z0-9]{36,}\b/, 'GitHub-token'],
  [/\bgithub_pat_[A-Za-z0-9_]{60,}\b/, 'GitHub-token'],
  [/\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b/, 'OpenAI-sleutel'],
  [/\bAIza[0-9A-Za-z_-]{35}\b/, 'Google-API-sleutel'],
  [/\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{16,}\b/, 'Stripe-sleutel'],
  [/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/, 'JWT'],
  [/\bBearer\s+[A-Za-z0-9._~+/=-]{20,}/i, 'Bearer-token'],
  [/\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp):\/\/[^\s:@/]+:[^\s@/]+@/i, 'verbindingsreeks'],
  // «wachtwoord: X», «password=X», «пароль: X», «app-wachtwoord: X» — alleen als er een waarde achter staat.
  // (?<![\p{L}\p{N}]) in plaats van \b: JavaScript's \b kent geen Cyrillische woordgrenzen.
  [/(?<![\p{L}\p{N}])(?:wachtwoord|password|passwd|pwd|пароль|app[- ]?wachtwoord|app[- ]?password)\s*[:=]\s*\S{6,}/iu, 'wachtwoordregel'],
  // «api_key=…», «secret: …», «token=…», «ключ: …» — met een waarde van tokenlengte (geen gewone zin).
  [/(?<![\p{L}\p{N}])(?:api[_-]?key|apikey|secret[_-]?key|client[_-]?secret|access[_-]?token|refresh[_-]?token|auth[_-]?token|private[_-]?key|секретний ключ|токен)\s*[:=]\s*["']?[A-Za-z0-9._~+/=-]{16,}/iu, 'sleutelregel'],
  // Generieke «naam: waarde»-regel in negen talen (uit de zoekkern, Z1): secret/geheim/token/bearer/parola/hasło/passwort/mot de passe.
  [/(?<![\p{L}\p{N}])(?:parola|hasło|haslo|passwort|mot de passe|secret|geheim|token|bearer)\s*[:=]\s*["']?[^\s"'<>]{6,}/iu, 'sleutelregel'],
  // Google-app-wachtwoord: 16 kleine letters in vier groepen.
  [/\b[a-z]{4} [a-z]{4} [a-z]{4} [a-z]{4}\b/, 'app-wachtwoord'],
]);

/** Welke soorten geheimen in de tekst staan (leeg = niets gevonden). Controleert hoogstens de eerste `max` tekens. */
export function geheimenIn(tekst: unknown, max = 400000): GeheimSoort[] {
  const t = String(tekst ?? '').slice(0, max);
  if (!t) return [];
  const uit: GeheimSoort[] = [];
  for (const [re, soort] of GEHEIM_PATRONEN) if (re.test(t) && !uit.includes(soort)) uit.push(soort);
  return uit;
}
export const lijktGeheim = (tekst: unknown): boolean => geheimenIn(tekst).length > 0;

export const GEHEIM_VERVANGING = '[geheim]';
/**
 * Dezelfde tekst, met elk herkend geheim vervangen door «[geheim]». Alleen de geheime waarde verdwijnt; de zin eromheen
 * blijft doorzoekbaar («wachtwoord: [geheim]» is nog te vinden op «wachtwoord»).
 */
export function maskeerGeheimen(tekst: unknown, max = 400000): { tekst: string; soorten: GeheimSoort[] } {
  let t = String(tekst ?? '').slice(0, max);
  const soorten: GeheimSoort[] = [];
  for (const [re, soort] of GEHEIM_PATRONEN) {
    const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
    if (!g.test(t)) continue;
    soorten.push(soort);
    g.lastIndex = 0;
    t = t.replace(g, (m) => {
      // Bij «naam: waarde» de naam laten staan.
      const k = /^([^:=]{0,40}[:=]\s*)/.exec(m);
      return k && /wachtwoord|password|passwd|pwd|пароль|key|secret|geheim|token|bearer|parola|has[łl]o|passwort|mot de passe|ключ|токен/i.test(k[1]) ? `${k[1]}${GEHEIM_VERVANGING}` : GEHEIM_VERVANGING;
    });
  }
  return { tekst: t, soorten };
}
