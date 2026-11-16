// GEHEIMEN HERKENNEN — één lijst voor de uitrol-voorcontrole (backend/uitrol-voorcontrole.ts, «geheimen») en de zoekindex
// (backend/zoek/bronnen.ts: een lijst, bestand of notitie waarin een token, sleutel of wachtwoord staat, komt NIET als
// doorzoekbare tekst in app.zoek_objecten; het geheim wordt vervangen door «[geheim]»). Puur: geen Node, geen DOM.
//
// Bewust alleen patronen met een hoge zekerheid (vaste voorvoegsels, PEM-koppen, «wachtwoord: …»-regels): een gewone
// zin met het woord «token» is geen geheim. Fout-positieven kosten alleen een stukje tekst in de index; fout-negatieven
// zetten een sleutel in een doorzoekbare tabel — daarom liever iets te streng bij regels met een expliciete sleutelnaam.

export type GeheimSoort = 'privésleutel' | 'GitHub-token' | 'AWS-sleutel' | 'Anthropic-sleutel' | 'Slack-token' | 'OpenAI-sleutel' | 'Google-API-sleutel'
  | 'Stripe-sleutel' | 'JWT' | 'Bearer-token' | 'wachtwoordregel' | 'sleutelregel' | 'verbindingsreeks' | 'app-wachtwoord'
  | 'age-sleutel' | 'Telegram-bottoken' | 'Google-OAuth-geheim' | 'Google-toegangstoken' | 'npm-token' | 'PyPI-token' | 'GitLab-token'
  | 'Docker-token' | 'Azure-sleutel' | 'Alibaba-sleutel' | 'DigitalOcean-token' | 'Heroku-sleutel' | 'Cloudflare-token'
  | 'HashiCorp-token' | 'Doppler-token' | 'Supabase-sleutel' | 'Firebase-sleutel' | 'Hugging-Face-token' | 'Groq-sleutel' | 'xAI-sleutel'
  | 'Replicate-token' | 'Perplexity-sleutel' | 'SendGrid-sleutel' | 'Mailgun-sleutel' | 'Mailchimp-sleutel' | 'Twilio-sleutel'
  | 'Shopify-token' | 'Square-token' | 'PayPal-token' | 'Mapbox-sleutel' | 'Atlassian-token' | 'Linear-sleutel' | 'Notion-token'
  | 'Figma-token' | 'Postman-sleutel' | 'Sentry-token' | 'Grafana-token' | 'New-Relic-sleutel' | 'Tailscale-sleutel'
  | 'webhook-adres' | 'WireGuard-sleutel' | 'PuTTY-sleutel' | 'npm-configuratie';

/**
 * De STRIKTE lijst: vaste voorvoegsels en PEM-koppen, vrijwel nooit fout-positief. Dit is precies wat de uitrol-voorcontrole
 * al sinds 18.10.2026 over een heel bronpakket laat lopen (daar zou een breder patroon elke release een waarschuwing geven:
 * tests en documentatie bevatten «wachtwoord: …»-voorbeelden). [patroon, soort]; zonder g-vlag (geen lastIndex-geheugen).
 *
 * SEC-PAKKET-001 (16.11.2026): uitgebreid tot alle gangbare sleutelsoorten met een vast, herkenbaar formaat (stand november
 * 2026: code-hosting, clouds, AI-diensten, betalingen, mail, samenwerking, monitoring, netwerk). Een treffer BLOKKEERT nu de
 * uitrol (niveau «fout»), dus alleen formaten die vrijwel nooit toevallig voorkomen. Sleutels zonder vast voorvoegsel
 * (bv. Mistral, Cohere, Datadog: 32 willekeurige tekens) zijn niet betrouwbaar te herkennen en staan hier bewust niet.
 * Розширено (16.11.2026) до всіх поширених видів ключів зі сталим форматом; знахідка тепер БЛОКУЄ встановлення. Тестові
 * зразки збирайте під час виконання (tests/eenheid/hulp/nep-geheim.ts), інакше падає сторож pakket-geheimen-20261116.
 * Новий вид ключа: додайте рядок сюди і зразок у той тест.
 */
export const GEHEIM_PATRONEN_STRIKT: ReadonlyArray<readonly [RegExp, GeheimSoort]> = Object.freeze([
  // Приватні ключі (PEM, OpenSSH, PGP, PuTTY, WireGuard) · privésleutels
  [/-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED |SSH2 )?PRIVATE KEY(?: BLOCK)?-----/, 'privésleutel'],
  [/\bPuTTY-User-Key-File-\d+:/, 'PuTTY-sleutel'],
  [/\bPrivateKey\s*=\s*[A-Za-z0-9+/]{42,43}=/, 'WireGuard-sleutel'],
  [/\bAGE-SECRET-KEY-1[0-9A-Z]{50,}/, 'age-sleutel'],
  // Хостинг коду й пакетів · code-hosting en pakketregisters
  [/\bgh[pousr]_[A-Za-z0-9]{36,}\b/, 'GitHub-token'],
  [/\bgithub_pat_[A-Za-z0-9_]{60,}\b/, 'GitHub-token'],
  [/\bgl(?:pat|dt|rt|ptt|cbt|oas|soat|ffct|imt|agent)-[A-Za-z0-9_-]{20,}/, 'GitLab-token'],
  [/\bnpm_[A-Za-z0-9]{36}\b/, 'npm-token'],
  [/\/\/[^\s'"`]+\/:_authToken\s*=\s*(?!\$\{)[A-Za-z0-9._-]{20,}/, 'npm-configuratie'],
  [/\bpypi-AgEIcHlwaS5vcmc[A-Za-z0-9_-]{50,}/, 'PyPI-token'],
  [/\bdckr_pat_[A-Za-z0-9_-]{27,}/, 'Docker-token'],
  // Хмари · clouds
  [/\b(?:AKIA|ASIA|ABIA|ACCA)[0-9A-Z]{16}\b/, 'AWS-sleutel'],
  [/\bAccountKey=[A-Za-z0-9+/]{86}==/, 'Azure-sleutel'],
  [/\b[A-Za-z0-9_~.]{3}\dQ~[A-Za-z0-9_~.-]{31,34}\b/, 'Azure-sleutel'],
  [/\bAIza[0-9A-Za-z_-]{35}\b/, 'Google-API-sleutel'],
  [/\bGOCSPX-[A-Za-z0-9_-]{20,}/, 'Google-OAuth-geheim'],
  [/\bya29\.[A-Za-z0-9_-]{50,}/, 'Google-toegangstoken'],
  [/\b1\/\/0[A-Za-z0-9_-]{40,}/, 'Google-toegangstoken'],
  [/\bAAAA[A-Za-z0-9_-]{7}:[A-Za-z0-9_-]{140}/, 'Firebase-sleutel'],
  [/\bLTAI[A-Za-z0-9]{20}\b/, 'Alibaba-sleutel'],
  [/\bdo[por]_v1_[a-f0-9]{64}\b/, 'DigitalOcean-token'],
  [/\bHRKU-[A-Za-z0-9_-]{60,}/, 'Heroku-sleutel'],
  [/\bv1\.0-[a-f0-9]{24}-[a-f0-9]{146}\b/, 'Cloudflare-token'],
  [/\bhv[sb]\.[A-Za-z0-9_-]{90,}/, 'HashiCorp-token'],
  [/\b[A-Za-z0-9]{14}\.atlasv1\.[A-Za-z0-9_=-]{60,}/, 'HashiCorp-token'],
  [/\bdp\.(?:pt|st|sa|ct|scim|audit)\.[A-Za-z0-9]{40,}/, 'Doppler-token'],
  [/\bsbp_[a-f0-9]{40}\b/, 'Supabase-sleutel'],
  [/\bsb_secret_[A-Za-z0-9_-]{30,}/, 'Supabase-sleutel'],
  [/\btskey-(?:auth|api|client|webhook)-[A-Za-z0-9]{10,}-[A-Za-z0-9]{20,}/, 'Tailscale-sleutel'],
  // ШІ-сервіси · AI-diensten
  [/\bsk-ant-[A-Za-z0-9_-]{20,}/, 'Anthropic-sleutel'],
  [/\bsk-(?:proj|svcacct|admin)-[A-Za-z0-9_-]{40,}/, 'OpenAI-sleutel'],
  [/\bsk-[A-Za-z0-9]{20}T3BlbkFJ[A-Za-z0-9]{20}\b/, 'OpenAI-sleutel'],
  [/\bgsk_[A-Za-z0-9]{52}\b/, 'Groq-sleutel'],
  [/\bxai-[A-Za-z0-9]{70,}/, 'xAI-sleutel'],
  [/\bhf_[A-Za-z0-9]{34,}\b/, 'Hugging-Face-token'],
  [/\br8_[A-Za-z0-9]{37}\b/, 'Replicate-token'],
  [/\bpplx-[A-Za-z0-9]{48}\b/, 'Perplexity-sleutel'],
  // Повідомлення й пошта · berichten en mail
  [/\bxox[abprse]-[A-Za-z0-9-]{10,}/, 'Slack-token'],
  [/\bhttps:\/\/hooks\.slack\.com\/(?:services|workflows|triggers)\/[A-Za-z0-9/]{30,}/, 'webhook-adres'],
  [/\bhttps:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/api\/webhooks\/\d{15,}\/[A-Za-z0-9_-]{60,}/, 'webhook-adres'],
  [/\b\d{8,10}:AA[A-Za-z0-9_-]{33}\b/, 'Telegram-bottoken'],
  [/\bSG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}\b/, 'SendGrid-sleutel'],
  [/\bkey-[0-9a-f]{32}\b/, 'Mailgun-sleutel'],
  [/\b[0-9a-f]{32}-us\d{1,2}\b/, 'Mailchimp-sleutel'],
  [/\bSK[0-9a-f]{32}\b/, 'Twilio-sleutel'],
  // Платежі й торгівля · betalingen
  [/\b(?:sk|rk)_live_[A-Za-z0-9]{16,}\b/, 'Stripe-sleutel'],
  [/\bwhsec_[A-Za-z0-9]{32,}\b/, 'Stripe-sleutel'],
  [/\bshp(?:at|ca|pa|ss)_[a-fA-F0-9]{32}\b/, 'Shopify-token'],
  [/\b(?:EAAA[A-Za-z0-9_-]{60}|sq0csp-[A-Za-z0-9_-]{43})\b/, 'Square-token'],
  [/\baccess_token\$production\$[a-z0-9]{16}\$[a-f0-9]{32}\b/, 'PayPal-token'],
  // Співпраця, карти, моніторинг · samenwerking, kaarten, monitoring
  [/\bsk\.eyJ[A-Za-z0-9_-]{50,}\.[A-Za-z0-9_-]{20,}/, 'Mapbox-sleutel'],
  [/\bATATT3[A-Za-z0-9_=-]{180,}/, 'Atlassian-token'],
  [/\blin_api_[A-Za-z0-9]{40}\b/, 'Linear-sleutel'],
  [/\b(?:secret_[A-Za-z0-9]{43}|ntn_\d{11}[A-Za-z0-9]{35})\b/, 'Notion-token'],
  [/\bfigd_[A-Za-z0-9_-]{40,}/, 'Figma-token'],
  [/\bPMAK-[a-f0-9]{24}-[a-f0-9]{34}\b/, 'Postman-sleutel'],
  [/\bsntry[su]_[A-Za-z0-9+/=_]{50,}/, 'Sentry-token'],
  [/\b(?:glsa_[A-Za-z0-9]{32}_[a-f0-9]{8}|glc_[A-Za-z0-9+/=]{32,})/, 'Grafana-token'],
  [/\bNRAK-[A-Z0-9]{27}\b/, 'New-Relic-sleutel'],
  // Рядок підключення з паролем до НЕлокального сервера (127.0.0.1, localhost, *.test, *.example, змінні — дозволено)
  [/\b(?:postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|redis|rediss|amqps?):\/\/[^\s:@/'"`$]+:(?![$<{*x]{1,3}[@}])[^\s@/'"`$<>{}]{8,}@(?!(?:127\.0\.0\.1|localhost|\[?::1\]?|0\.0\.0\.0|db|postgres|host|server)(?:[:/'"`\s]|$))(?![^\s/:'"`]*\.(?:test|example|invalid|local|localhost)(?:[:/'"`\s]|$))(?!example\.)[A-Za-z0-9.-]+\.[A-Za-z]{2,}/i, 'verbindingsreeks'],
]);

/**
 * Bestandsnaam in een uitrolpakket die zelf al op een geheim wijst (.env, sleutelbestand). Één bron voor
 * backend/uitrol-voorcontrole.ts en de bewaker tests/eenheid/pakket-geheimen-20261116.test.ts. null = niets.
 * Назва файла в пакеті, що сама вказує на секрет. .env.example/.sample/.dist — зразки, не секрети.
 */
export function pakketGeheimNaam(pad: string): string | null {
  const n = pad.replace(/\\/g, '/');
  if (/(^|\/)\.env(\.|$)/.test(n) && !/\.(example|sample|dist)$/.test(n)) return '.env-bestand';
  if (/\.(pem|key|p12|pfx|p8|ppk|jks|keystore|kdbx|ovpn)$/i.test(n) && !/^tests?\//.test(n)) return 'sleutelbestand';
  // SSH-sleutels zonder extensie en bestanden met opgeslagen inloggegevens · SSH-ключі та файли з обліковими даними
  if (/(^|\/)id_(rsa|dsa|ecdsa|ed25519)(_sk)?$/.test(n)) return 'sleutelbestand';
  if (/(^|\/)(\.git-credentials|\.netrc|_netrc|\.pgpass|\.htpasswd|\.npmrc|\.pypirc|credentials\.json|service-account[^/]*\.json|client_secret[^/]*\.json|terraform\.tfstate(\.backup)?|\.tfvars)$/i.test(n) && !/^tests?\//.test(n)) return 'inloggegevens';
  return null;
}
/** Welke tekstbestanden de voorcontrole op inhoud doorzoekt (zelfde filter als backend/uitrol-voorcontrole.ts). */
export const pakketTekstBestand = (pad: string): boolean =>
  /\.(ts|tsx|js|cjs|mjs|json|sh|ps1|py|md|txt|ya?ml|toml|ini|conf|cfg|env|sql|html|css|xml|properties)$/i.test(pad) && !/(^|\/)package-lock\.json$/.test(pad);
/** Eerste strikte treffer in de tekst (alleen de soort, nooit de waarde). null = niets. */
export function pakketGeheimInhoud(tekst: string): GeheimSoort | null {
  for (const [re, soort] of GEHEIM_PATRONEN_STRIKT) if (re.test(tekst)) return soort;
  return null;
}
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
