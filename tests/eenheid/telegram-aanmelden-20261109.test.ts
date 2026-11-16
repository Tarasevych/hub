// TELEGRAM-AANMELDEN v1 — eenheidstests zonder netwerk of database: beleid, wijzigingen, status, cryptografie, routes en bronnen.
import { readFileSync, readdirSync } from 'node:fs';
import { createHash, createHmac } from 'node:crypto';
import { checker } from './hulp/nep-google';
import { beoordeel, eisVan, INGEBOUWDE_ACTIES, keuzeToegestaan, KEUZE_IDS, voorinstellingToepassen, werkelijkeEis } from '../../shared/telegram-aanmelden/beleid';
import { antwoordVerwerken, ernstVan, verschillen, snelGenoegGeweigerd, verlopenVerwerken, type WijzigingToestand } from '../../shared/telegram-aanmelden/wijziging';
import { codeZwakte } from '../../shared/telegram-aanmelden/code-sterkte';
import { instellingenNormaliseren, isBotGebruikersnaam, STANDAARD_INSTELLINGEN } from '../../shared/telegram-aanmelden/model';
import { volgendeStand, LANG_NA_MS } from '../../backend/telegram-aanmelden/status';
import { widgetControle, knopSleutel, knopTekenen, knopLezen, knopHandtekeningKlopt, codeHashen, codeKlopt, KNOP_ACTIES } from '../../backend/telegram-aanmelden/cryptografie';
import { veiligEigenTerugAdres } from '../../backend/telegram-aanmelden/inloggen';
import { telegramRoutes, TELEGRAM_PUBLIEKE_ROUTES, WIDGET_CSP } from '../../backend/telegram-aanmelden/routes';
import { ALLEEN_SESSIE, BEWAAKT, OPENBAAR } from '../../backend/telegram-aanmelden/beleid-poort';
import { OPDRACHTEN, TEKST } from '../../shared/telegram-aanmelden/teksten';
import { PUBLIEKE_ROUTES } from '../../server/platform/auth-poort';

const lees = (p: string) => readFileSync(p, 'utf8');

export async function main(): Promise<number> {
  const { check, einde } = checker('telegram-aanmelden');
  const S = (...m: string[]) => new Set(m as never[]);

  // ---------------------------------------------------------------- beleid
  const nieuwApparaat = INGEBOUWDE_ACTIES.find((a) => a.sleutel === 'nieuw-apparaat')!;
  check('standaard: nieuw apparaat vraagt Telegram én toegangssleutel', JSON.stringify(werkelijkeEis(nieuwApparaat, null)) === JSON.stringify([['telegram', 'passkey']]));
  check('elke gevoelige handeling vraagt altijd een toegangssleutel (ook bij keuze «telegram»)', INGEBOUWDE_ACTIES.filter((a) => a.gevoelig).every((a) => werkelijkeEis(a, 'telegram' as never).every((alt) => alt.includes('passkey'))));
  check('keuze zwakker dan het minimum wordt geweigerd', !keuzeToegestaan(INGEBOUWDE_ACTIES.find((a) => a.sleutel === 'koppelen')!, 'telegram'));
  check('keuze strenger dan het minimum mag', keuzeToegestaan(INGEBOUWDE_ACTIES.find((a) => a.sleutel === 'aanmelden')!, 'alles'));
  const b1 = beoordeel(eisVan('telegram-en-code-of-passkey'), S(), S('telegram', 'code'));
  check('beoordeel: goedkoopste haalbare weg (zonder toegangssleutel) → telegram+code ontbreekt', !b1.toegestaan && b1.ontbreekt.join() === 'telegram,code' && b1.onbeschikbaar.includes('passkey'));
  const b2 = beoordeel(eisVan('telegram'), S(), S('passkey'));
  check('beoordeel: Telegram in storing → METHODE_ONBESCHIKBAAR, eerlijk geblokkeerd', b2.geblokkeerd && b2.reden === 'METHODE_ONBESCHIKBAAR' && b2.onbeschikbaar.join() === 'telegram');
  check('beoordeel: voldaan → toegestaan', beoordeel(eisVan('telegram-of-passkey'), S('passkey'), S()).toegestaan);
  check('beoordeel: lege eis = ONBEKENDE_ACTIE (nooit stil toestaan)', beoordeel([], S('telegram'), S('telegram')).reden === 'ONBEKENDE_ACTIE');
  const veiligst = voorinstellingToepassen('veiligst', INGEBOUWDE_ACTIES);
  check('voorinstelling «veiligst» blijft overal ≥ minimum', INGEBOUWDE_ACTIES.every((a) => keuzeToegestaan(a, veiligst[a.sleutel])));
  const overal = voorinstellingToepassen('telegram-overal', INGEBOUWDE_ACTIES);
  check('voorinstelling «Telegram overal» respecteert het minimum (gevoelig blijft toegangssleutel)', INGEBOUWDE_ACTIES.every((a) => keuzeToegestaan(a, overal[a.sleutel])));
  check('alle keuzes hebben een eis', KEUZE_IDS.every((k) => eisVan(k).length > 0));

  // ---------------------------------------------------------------- wijzigingen
  const oud = { telegramId: '1', telefoon: '32470000001', gebruikersnaam: 'pavlo', voornaam: 'Pavlo', achternaam: 'T', fotoId: 'f1' };
  check('ander telegram-id = vervalsing', ernstVan(verschillen(oud, { ...oud, telegramId: '2' })) === 'vervalsing');
  check('ander telefoonnummer = ernstig', ernstVan(verschillen(oud, { ...oud, telefoon: '32470000002' })) === 'ernstig');
  check('andere gebruikersnaam = gewoon', ernstVan(verschillen(oud, { ...oud, gebruikersnaam: 'p2' })) === 'gewoon');
  check('niets anders = geen wijziging', ernstVan(verschillen(oud, { ...oud })) === null);
  const open: WijzigingToestand = { status: 'open', ernst: 'gewoon', telegramAntwoord: null, siteAntwoord: null, conflict: false };
  const tgJa = antwoordVerwerken(open, 'gepauzeerd', 'telegram', 'ja', false);
  check('«Так» in Telegram alleen = alleen «gezien» (Telegram kan gekaapt zijn)', tgJa.toestand.status === 'gezien' && tgJa.koppelStand === 'gepauzeerd');
  const siteJaZonder = antwoordVerwerken(tgJa.toestand, 'gepauzeerd', 'site', 'ja', false);
  check('«Так» op de site zonder verse toegangssleutel verandert niets', siteJaZonder.toestand.status === 'gezien' && siteJaZonder.koppelStand === 'gepauzeerd');
  const siteJa = antwoordVerwerken(tgJa.toestand, 'gepauzeerd', 'site', 'ja', true);
  check('«Так» op de site met toegangssleutel → bevestigd, koppeling weer actief', siteJa.toestand.status === 'bevestigd' && siteJa.koppelStand === 'actief');
  const daarnaNee = antwoordVerwerken(siteJa.toestand, 'actief', 'telegram', 'nee', false);
  check('«Ні» wint ALTIJD, ook na bevestiging: uit + sessies beëindigen + conflict', daarnaNee.toestand.status === 'geweigerd' && daarnaNee.koppelStand === 'uitgeschakeld' && daarnaNee.acties.includes('sessies-beeindigen') && daarnaNee.toestand.conflict);
  check('na «Ні» kan «Так» niets meer terugdraaien', antwoordVerwerken(daarnaNee.toestand, 'uitgeschakeld', 'site', 'ja', true).koppelStand === 'uitgeschakeld');
  const ernstig = antwoordVerwerken({ ...open, ernst: 'ernstig' }, 'geblokkeerd', 'site', 'ja', true);
  check('telefoon gewijzigd: toegangssleutel alleen is niet genoeg → opnieuw koppelen', ernstig.koppelStand === 'geblokkeerd' && ernstig.acties.includes('opnieuw-koppelen-vereist'));
  check('vervalsing kan nooit met «Так» bevestigd worden', antwoordVerwerken({ ...open, ernst: 'vervalsing' }, 'uitgeschakeld', 'site', 'ja', true).toestand.status === 'geweigerd');
  check('onbeantwoord na de termijn → uit', verlopenVerwerken(open, 25 * 3600_000, 0, 24)?.koppelStand === 'uitgeschakeld');
  check('te snel na het tonen bevestigd telt niet (server-side aftelling)', snelGenoegGeweigerd(1000, 3000, 5) && !snelGenoegGeweigerd(1000, 6500, 5) && snelGenoegGeweigerd(0, 99999, 5));

  // ---------------------------------------------------------------- geheime code
  check('code: te kort geweigerd', codeZwakte('12a', { min: 6, max: 32 }) !== null);
  check('code: 123456 / 111111 geweigerd', codeZwakte('123456', { min: 6, max: 32 }) !== null && codeZwakte('111111', { min: 6, max: 32 }) !== null);
  check('code: deel van het eigen telefoonnummer geweigerd', codeZwakte('70000001', { min: 6, max: 32, telefoon: '32470000001' }) !== null);
  check('code: sterke code aanvaard', codeZwakte('kers-Tuin-48', { min: 6, max: 32 }) === null);
  const h = codeHashen('kers-Tuin-48', 'peper');
  check('code-hash: juiste code klopt, andere niet, peper telt', codeKlopt('kers-Tuin-48', 'peper', h) && !codeKlopt('kers-Tuin-49', 'peper', h) && !codeKlopt('kers-Tuin-48', 'andere', h));

  // ---------------------------------------------------------------- instellingen
  check('standaardbot is @MijnRuimte_Bot', STANDAARD_INSTELLINGEN.botGebruikersnaam === 'MijnRuimte_Bot' && instellingenNormaliseren({}).botGebruikersnaam === 'MijnRuimte_Bot');
  check('botnaam moet op «bot» eindigen', isBotGebruikersnaam('MijnRuimte_Bot') && !isBotGebruikersnaam('MijnRuimte') && !isBotGebruikersnaam('abot'));
  check('ongeldige botnaam valt terug op de standaard', instellingenNormaliseren({ botGebruikersnaam: 'x y' }).botGebruikersnaam === 'MijnRuimte_Bot');
  check('telefoon delen blijft verplicht, ook als iemand false stuurt', instellingenNormaliseren({ telefoonVerplicht: false }).telefoonVerplicht === true);

  // ---------------------------------------------------------------- status
  const nul = { stand: 'werkt' as const, soort: '' as const, sinds: 0 };
  const s1 = volgendeStand(nul, { ok: false, duurMs: 0, fout: 'tijdelijk' }, 1000);
  check('eerste fout = tijdelijke storing', s1.stand === 'storing' && s1.soort === 'tijdelijk');
  check('storing > 10 min = lang', volgendeStand(s1, { ok: false, duurMs: 0, fout: 'tijdelijk' }, 1000 + LANG_NA_MS).soort === 'lang');
  check('ongeldige sleutel = vast (opnieuw proberen helpt niet)', volgendeStand(nul, { ok: false, duurMs: 0, fout: 'vast' }, 5).soort === 'vast');
  check('traag antwoord = traag, geen storing', volgendeStand(nul, { ok: true, duurMs: 5000 }, 5).stand === 'traag');
  check('geen sleutel = niet-ingesteld', volgendeStand(nul, { ok: false, duurMs: 0, fout: 'geen-sleutel' }, 5).stand === 'niet-ingesteld');

  // ---------------------------------------------------------------- cryptografie
  const token = '123456789:AAEexampleexampleexampleexample00';
  const nu = 1_800_000_000;
  const velden: Record<string, string> = { id: '42', first_name: 'Pavlo', username: 'pavlo', auth_date: String(nu - 10) };
  const data = Object.entries(velden).map(([k, v]) => `${k}=${v}`).sort().join('\n');
  const hash = createHmac('sha256', createHash('sha256').update(token).digest()).update(data).digest('hex');
  check('aanmeldvenster: juiste handtekening + vers = ok', widgetControle({ ...velden, hash }, token, nu).ok && widgetControle({ ...velden, hash }, token, nu).vers);
  check('aanmeldvenster: eigen routeparameters (verzoek/i/state/taal) verstoren de handtekening niet', widgetControle({ ...velden, hash, verzoek: 'abcdefghijkl', i: 'abcdefghijkl', state: 'st1', taal: 'uk' }, token, nu).ok);
  check('aanmeldvenster: gewijzigd veld = HANDTEKENING_ONGELDIG', widgetControle({ ...velden, id: '43', hash }, token, nu).reden === 'HANDTEKENING_ONGELDIG');
  check('aanmeldvenster: ouder dan 5 min = VERLOPEN', widgetControle({ ...velden, hash }, token, nu + 600).reden === 'VERLOPEN');
  check('aanmeldvenster: andere bot-sleutel = ongeldig', !widgetControle({ ...velden, hash }, '987654321:BBexampleexampleexampleexample00', nu).ok);
  check('terugkeeradres: eigen subdomeinen toegestaan, tg_inlog/tg_fout geschoond', veiligEigenTerugAdres('https://hub.tarasevych.com/postvak?tg_inlog=oud&tg_fout=X') === 'https://hub.tarasevych.com/postvak');
  check('terugkeeradres: vreemd domein, http of inloggegevens geweigerd', veiligEigenTerugAdres('https://boosdoener.voorbeeld/stelen') === 'https://id.tarasevych.com/' && veiligEigenTerugAdres('http://hub.tarasevych.com/') === 'https://id.tarasevych.com/' && veiligEigenTerugAdres('https://gebruiker:geheim@hub.tarasevych.com/') === 'https://id.tarasevych.com/');
  const ks = knopSleutel('geheim'.repeat(8));
  const kd = knopTekenen(ks, 'i', 'abcdefghijkl', '42', nu + 120);
  const kl = knopLezen(kd)!;
  const kz = knopTekenen(ks, 'z', 'abcdefghijkl', '42', nu + 120);
  check('knop: past in 64 bytes callback_data (ook sessie-intrekken «z»)', Buffer.byteLength(kd) <= 64 && Buffer.byteLength(kz) <= 64 && KNOP_ACTIES.z === 'sessie-intrekken' && knopLezen(kz)?.letter === 'z');
  check('knop: handtekening klopt alleen voor dezelfde Telegram-gebruiker', knopHandtekeningKlopt(ks, kl, '42', nu + 120) && !knopHandtekeningKlopt(ks, kl, '43', nu + 120));
  check('knop: vervalste letter wordt niet aanvaard', !knopHandtekeningKlopt(ks, { ...kl, letter: 'b' }, '42', nu + 120));

  // ---------------------------------------------------------------- routes
  const r = telegramRoutes({ requireSession: async () => ({ errorCode: 'X' }), aanmeldStart: async () => ({ fout: 'X' }), aanmeldVoltooien: async () => { throw new Error('x'); }, sessiesIntrekken: async () => 0, vlagAan: async () => false } as never);
  const soort = (m: unknown) => (m as Record<symbol, unknown>);
  const ongemarkeerd = Object.entries(r).filter(([, m]) => !soort(m)[BEWAAKT] && !soort(m)[ALLEEN_SESSIE] && !soort(m)[OPENBAAR]).map(([k]) => k);
  check('elke route is gemarkeerd (BEWAAKT / ALLEEN_SESSIE / OPENBAAR)', ongemarkeerd.length === 0, ongemarkeerd.join(', '));
  const openbaar = Object.entries(r).filter(([, m]) => soort(m)[OPENBAAR]).map(([k]) => k).sort();
  check('openbare routes = precies de lijst TELEGRAM_PUBLIEKE_ROUTES', JSON.stringify(openbaar) === JSON.stringify(Object.keys(TELEGRAM_PUBLIEKE_ROUTES).sort()));
  check('elke openbare route staat (met reden) in PUBLIEKE_ROUTES van de auth-poort', openbaar.every((k) => typeof PUBLIEKE_ROUTES[k] === 'string' && PUBLIEKE_ROUTES[k].length > 5));
  check('geen /api/owner-route is openbaar', !openbaar.some((k) => k.includes('/api/owner/')));
  const moetBewaakt = ['POST /api/owner/telegram/koppelen/bevestigen', 'POST /api/owner/telegram/ontkoppelen', 'POST /api/owner/telegram/koppeling', 'POST /api/owner/telegram/code/instellen', 'POST /api/owner/telegram/matrix', 'POST /api/owner/telegram/beheer/bot', 'POST /api/owner/telegram/beheer/instellingen', 'POST /api/owner/telegram/beheer/nood-aan', 'POST /api/owner/telegram/deblokkeren'];
  check('alles wat iets verandert loopt door de poort', moetBewaakt.every((k) => soort(r[k])[BEWAAKT]));
  check('noodschakelaar UIT kan altijd (alleen sessie + beheerder)', !!soort(r['POST /api/owner/telegram/beheer/nood-uit'])[ALLEEN_SESSIE]);
  check('aanmeldvenster-CSP: alleen telegram.org, geen frames van ons', WIDGET_CSP.includes('script-src https://telegram.org') && WIDGET_CSP.includes("frame-ancestors 'none'") && !WIDGET_CSP.includes('unsafe-eval'));

  // ---------------------------------------------------------------- bronnen
  const fe = readdirSync('src/telegram-aanmelden').map((f) => lees(`src/telegram-aanmelden/${f}`)).join('\n');
  check('frontend toont de botsleutel nooit (alleen een password-veld dat leeg wordt na opslaan)', !/\{\s*sleutel\s*\}\s*</.test(fe) && fe.includes("type='password' autoComplete='off' spellCheck={false} value={sleutel}") && fe.includes("setSleutel('')"));
  check('identiteit niet gemaskeerd (geen •••/*** rond telefoon)', !/telefoon[^\n]{0,80}(•|\*\*\*|slice\(-4\))/.test(fe));
  check('officieel Telegram-logo aanwezig', fe.includes("data-merk-officieel='telegram'") && fe.includes('#37aee2'));
  check('frontend kent STEP_UP_PASSKEY_REQUIRED en TELEGRAM_BEVESTIGING_NODIG', fe.includes('STEP_UP_PASSKEY_REQUIRED') && fe.includes('TELEGRAM_BEVESTIGING_NODIG'));
  check('alleen Oekraïens en Nederlands in de bot', !/['"]en['"]\s*:/.test(lees('shared/telegram-aanmelden/teksten.ts')));
  const routesSrc = lees('backend/telegram-aanmelden/routes.ts');
  check('officieel aanmeldvenster gebruikt de ingestelde botnaam (data-telegram-login) in omleidingsmodus', routesSrc.includes('data-telegram-login') && routesSrc.includes('data-auth-url') && !routesSrc.includes('data-onauth'));
  check('migraties 0201/0202 bestaan, vlag standaard UIT in 0201', /standaard[^\n]*false|false[^\n]*standaard|DEFAULT false|, false/.test(lees('migrations/0201_telegram_aanmelden_vlag.sql')));
  const mig0209 = lees('migrations/0209_telegram_aanmelden_context.sql');
  check('migratie 0209 breidt context + sessiebeheer uit en staat in het terugdraaiscript', ['ADD COLUMN IF NOT EXISTS onthouden', 'ADD COLUMN IF NOT EXISTS terug_adres', 'ADD COLUMN IF NOT EXISTS sessie_ingetrokken_op', 'ADD COLUMN IF NOT EXISTS gekoppeld_ip'].every((s) => mig0209.includes(s)) && lees('deploy/telegram-aanmelden-terugdraaien.sql').includes("'0209_telegram_aanmelden_context'"));
  check('botopdrachten bevatten /sessies en inlogtekst toont dienst, netwerk en onthouden', OPDRACHTEN.includes('sessies') && ['{dienst}', '{netwerk}', '{onthouden}'].every((s) => TEKST.inlogVraag.uk.includes(s) && TEKST.inlogVraag.nl.includes(s)));
  // Regressie (e2e 09.11): elke ingebouwde standaard moet zelf toegestaan zijn, anders toont de keuzelijst een lege waarde.
  check('elke ingebouwde standaard is minstens zo streng als het minimum', INGEBOUWDE_ACTIES.every((s) => keuzeToegestaan(s, s.standaard)), INGEBOUWDE_ACTIES.filter((s) => !keuzeToegestaan(s, s.standaard)).map((s) => s.sleutel).join(','));
  return einde();
}
