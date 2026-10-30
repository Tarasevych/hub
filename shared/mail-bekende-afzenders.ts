// Gecureerde lijst bekende afzenders voor de pastille «перевірений відправник» in de mail (audit 18.10.2026, artefact-draad f252547a).
//
// Waarom zo (en niet «ziet er officieel uit»):
//  - Een domein in deze lijst maakt een afzender NOOIT op zichzelf «geverifieerd». Dat gebeurt alleen als het bericht ook de
//    DMARC-controle van de ontvangende server (Gmail, authserv-id mx.google.com) doorstond voor precies dat From-domein
//    (of DKIM slaagde met een handtekening van hetzelfde organisatiedomein). Zie shared/mail-afzenders.ts → classificeer().
//  - Alleen domeinen die de dienst zelf als afzender gebruikt en die we kunnen onderbouwen: het hoofddomein van het merk (de
//    afzender staat dan op het hoofddomein of een subdomein ervan) of een apart, door het merk zelf beheerd maildomein.
//    Bron per regel: de officiële website / helppagina van de dienst over «hoe herken je onze e-mails». Twijfel = niet opnemen;
//    de gebruiker kan elke andere afzender met de hand bevestigen.
//  - Gratis mailboxen (gmail.com, outlook.com, icloud.com …) staan er bewust NIET in: daar kan iedereen een adres aanmaken.
//    Ze staan in GRATIS_MAILBOXEN zodat een merknaam als weergavenaam daar als «verdacht» telt.
//  - Een merklabel op een onbekend TLD (paypal.xyz, ing.top) telt als «lijkt op merk» → verdacht; daarom staan de echte
//    landendomeinen van de grote merken erbij. Ontbreekt er een echt landendomein, dan kan de gebruiker het met de hand bevestigen.
//  - `subdomeinen: false` voor domeinen waarvan subdomeinen ook door klanten van die dienst gebruikt worden (amazonaws.com:
//    S3-buckets e.d.); daar telt alleen het domein zelf.

export type BekendeDienst = {
  id: string;
  /** Merknaam zoals die in een weergavenaam kan staan (voor de imitatie-controle). */
  merk: string;
  /** Woorden die in een weergavenaam op dit merk wijzen (kleine letters, na normalisatie; altijd hele woorden).
   *  «=WOORD» = hoofdlettergevoelig (ING: «Ing.» is ook de Belgisch/Nederlandse ingenieurstitel). Geen voornamen als merkwoord. */
  merkWoorden: string[];
  domeinen: Array<{ domein: string; subdomeinen?: boolean }>;
  /** Waar we het domein vandaan hebben (wordt in «Контакти й відправники» als bron van het bewijs getoond). */
  bron: string;
  /** Soort organisatie (voor de filter «Офіційні організації» en de uitleg). */
  soort?: OrganisatieSoort;
  /** false = het merklabel is een gewoon woord of komt in veel legitieme domeinen voor (gov, belgium, zoom, x): dan geen
   *  «lijkt op»-controle op dit merk (wel nog de controle op het echte domein en op de weergavenaam). */
  lijktOp?: false;
};
export type OrganisatieSoort = 'bank' | 'overheid' | 'betaling' | 'tech' | 'winkel' | 'post';
/** Datum van de laatste herziening van deze lijst (staat als tijdstip bij de bewijsregel «офіційний домен»). */
export const LIJST_HERZIEN = '2026-10-19';

export const BEKENDE_DIENSTEN: readonly BekendeDienst[] = Object.freeze([
  { id: 'google', soort: 'tech', merk: 'Google', merkWoorden: ['google', 'gmail', 'youtube'], domeinen: [{ domein: 'google.com', subdomeinen: true }, { domein: 'youtube.com', subdomeinen: true }],
    bron: 'support.google.com/mail/answer/8253 — beveiligingsmeldingen komen van no-reply@accounts.google.com; YouTube van @youtube.com' },
  { id: 'amazon', soort: 'winkel', merk: 'Amazon', merkWoorden: ['amazon'], domeinen: [{ domein: 'amazon.com', subdomeinen: true }, { domein: 'amazon.de', subdomeinen: true }, { domein: 'amazon.nl', subdomeinen: true }, { domein: 'amazon.com.be', subdomeinen: true }, { domein: 'amazon.fr', subdomeinen: true }, { domein: 'amazon.co.uk', subdomeinen: true }, { domein: 'amazon.it', subdomeinen: true }, { domein: 'amazon.es', subdomeinen: true }, { domein: 'amazon.pl', subdomeinen: true }, { domein: 'amazon.se', subdomeinen: true }, { domein: 'amazon.ca', subdomeinen: true }, { domein: 'amazon.co.jp', subdomeinen: true }, { domein: 'amazon.com.au', subdomeinen: true }, { domein: 'amazon.com.tr', subdomeinen: true }],
    bron: 'amazon.com/gp/help/customer/display.html?nodeId=GPHHHNP3XFUAAB2Y — echte e-mails komen van amazon.<land>' },
  { id: 'aws', soort: 'tech', merk: 'Amazon Web Services', merkWoorden: ['aws', 'amazon web services'], domeinen: [{ domein: 'amazonaws.com', subdomeinen: false }, { domein: 'aws.amazon.com', subdomeinen: true }, { domein: 'aws.com', subdomeinen: true }],
    bron: 'AWS-facturatie en accountmeldingen: no-reply@amazonaws.com, aws-marketing-email@amazon.com (aws.amazon.com/support)' },
  { id: 'apple', soort: 'tech', merk: 'Apple', merkWoorden: ['apple', 'icloud', 'app store'], domeinen: [{ domein: 'apple.com', subdomeinen: true }],
    bron: 'support.apple.com/102568 — echte Apple-mails komen van apple.com, id.apple.com, email.apple.com' },
  { id: 'microsoft', soort: 'tech', merk: 'Microsoft', merkWoorden: ['microsoft', 'outlook team', 'office 365', 'microsoft 365', 'onedrive', 'xbox'], domeinen: [{ domein: 'microsoft.com', subdomeinen: true }],
    bron: 'support.microsoft.com — accountmeldingen van account-security-noreply@accountprotection.microsoft.com' },
  { id: 'github', soort: 'tech', merk: 'GitHub', merkWoorden: ['github'], domeinen: [{ domein: 'github.com', subdomeinen: true }],
    bron: 'docs.github.com — meldingen van notifications@github.com en noreply@github.com' },
  { id: 'paypal', soort: 'betaling', merk: 'PayPal', merkWoorden: ['paypal'], domeinen: [{ domein: 'paypal.com', subdomeinen: true }, { domein: 'paypal.be', subdomeinen: true }, { domein: 'paypal.nl', subdomeinen: true }, { domein: 'paypal.de', subdomeinen: true }, { domein: 'paypal.fr', subdomeinen: true }, { domein: 'paypal.co.uk', subdomeinen: true }, { domein: 'paypal.it', subdomeinen: true }, { domein: 'paypal.es', subdomeinen: true }],
    bron: 'paypal.com/be/security/learn-about-fake-messages — echte mails van @paypal.<land>, altijd met naam aanspreken' },
  { id: 'cloudflare', soort: 'tech', merk: 'Cloudflare', merkWoorden: ['cloudflare'], domeinen: [{ domein: 'cloudflare.com', subdomeinen: true }],
    bron: 'developers.cloudflare.com — meldingen van noreply@notify.cloudflare.com' },
  { id: 'anthropic', soort: 'tech', merk: 'Anthropic', merkWoorden: ['anthropic'], domeinen: [{ domein: 'anthropic.com', subdomeinen: true }],
    bron: 'anthropic.com — accountmeldingen van @mail.anthropic.com' },
  { id: 'openai', soort: 'tech', merk: 'OpenAI', merkWoorden: ['openai', 'chatgpt'], domeinen: [{ domein: 'openai.com', subdomeinen: true }],
    bron: 'help.openai.com — accountmeldingen van noreply@tm.openai.com' },
  // Banken België (hoofddomein van de bank; zie de veiligheidspagina «phishing» van elke bank).
  { id: 'kbc', soort: 'bank', merk: 'KBC', merkWoorden: ['kbc'], domeinen: [{ domein: 'kbc.be', subdomeinen: true }, { domein: 'kbc.com', subdomeinen: true }], bron: 'kbc.be/particulieren/nl/veilig-bankieren.html' },
  { id: 'belfius', soort: 'bank', merk: 'Belfius', merkWoorden: ['belfius'], domeinen: [{ domein: 'belfius.be', subdomeinen: true }], bron: 'belfius.be/veiligheid' },
  { id: 'bnp', soort: 'bank', merk: 'BNP Paribas Fortis', merkWoorden: ['bnp paribas', 'bnp', 'fortis'], domeinen: [{ domein: 'bnpparibasfortis.be', subdomeinen: true }, { domein: 'bnpparibasfortis.com', subdomeinen: true }, { domein: 'bnpparibas.com', subdomeinen: true }, { domein: 'bnpparibas.fr', subdomeinen: true }, { domein: 'bnpparibas.be', subdomeinen: true }], bron: 'bnpparibasfortis.be/nl/public/particulieren/veilig-bankieren' },
  { id: 'ing', soort: 'bank', merk: 'ING', merkWoorden: ['=ING'], domeinen: [{ domein: 'ing.be', subdomeinen: true }, { domein: 'ing.nl', subdomeinen: true }, { domein: 'ing.com', subdomeinen: true }, { domein: 'ing.de', subdomeinen: true }], bron: 'ing.be/nl/particulieren/veilig-bankieren; ing.nl/de-ing/veilig-bankieren' },
  { id: 'argenta', soort: 'bank', merk: 'Argenta', merkWoorden: ['argenta'], domeinen: [{ domein: 'argenta.be', subdomeinen: true }], bron: 'argenta.be/nl/veilig-bankieren' },
  // Banken Nederland.
  { id: 'rabobank', soort: 'bank', merk: 'Rabobank', merkWoorden: ['rabobank', 'rabo'], domeinen: [{ domein: 'rabobank.nl', subdomeinen: true }, { domein: 'rabobank.com', subdomeinen: true }], bron: 'rabobank.nl/particulieren/veilig-bankieren' },
  { id: 'abnamro', soort: 'bank', merk: 'ABN AMRO', merkWoorden: ['abn amro', 'abnamro'], domeinen: [{ domein: 'abnamro.nl', subdomeinen: true }, { domein: 'abnamro.com', subdomeinen: true }], bron: 'abnamro.nl/nl/prive/veilig-bankieren' },
  // Banken Oekraïne.
  { id: 'privatbank', soort: 'bank', merk: 'ПриватБанк', merkWoorden: ['privatbank', 'приватбанк', 'privat24', 'приват24'], domeinen: [{ domein: 'privatbank.ua', subdomeinen: true }], bron: 'privatbank.ua — офіційний домен банку' },
  { id: 'monobank', soort: 'bank', merk: 'monobank', merkWoorden: ['monobank', 'монобанк'], domeinen: [{ domein: 'monobank.ua', subdomeinen: true }], bron: 'monobank.ua — офіційний домен банку' },
  // Overheid België (itsme / MyGov komen vaak in phishing voor).
  { id: 'itsme', soort: 'overheid', merk: 'itsme', merkWoorden: ['itsme'], domeinen: [{ domein: 'itsme.be', subdomeinen: true }, { domein: 'itsme-id.com', subdomeinen: true }], bron: 'itsme-id.com/nl-BE/security' },
  // ---- uitbreiding 19.10.2026 («Контакти й відправники»). Alleen het hoofddomein / de eigen maildomeinen van de organisatie
  //      zelf; bij twijfel niet opgenomen (de gebruiker kan elk ander adres zelf bevestigen).
  // Banken en betalen Nederland / internationaal.
  { id: 'sns', soort: 'bank', lijktOp: false, merk: 'SNS', merkWoorden: ['=SNS', 'sns bank'], domeinen: [{ domein: 'snsbank.nl', subdomeinen: true }, { domein: 'sns.nl', subdomeinen: true }], bron: 'officieel domein van SNS (de Volksbank) — sns.nl' },
  { id: 'asn', soort: 'bank', merk: 'ASN Bank', merkWoorden: ['asn bank'], domeinen: [{ domein: 'asnbank.nl', subdomeinen: true }], bron: 'officieel domein van ASN Bank (de Volksbank) — asnbank.nl' },
  { id: 'regiobank', soort: 'bank', merk: 'RegioBank', merkWoorden: ['regiobank'], domeinen: [{ domein: 'regiobank.nl', subdomeinen: true }], bron: 'officieel domein van RegioBank (de Volksbank) — regiobank.nl' },
  { id: 'triodos', soort: 'bank', merk: 'Triodos Bank', merkWoorden: ['triodos'], domeinen: [{ domein: 'triodos.nl', subdomeinen: true }, { domein: 'triodos.be', subdomeinen: true }, { domein: 'triodos.com', subdomeinen: true }, { domein: 'triodos.de', subdomeinen: true }, { domein: 'triodos.co.uk', subdomeinen: true }, { domein: 'triodos.es', subdomeinen: true }], bron: 'officiële landendomeinen van Triodos Bank — triodos.com' },
  { id: 'knab', soort: 'bank', merk: 'Knab', merkWoorden: ['=Knab'], domeinen: [{ domein: 'knab.nl', subdomeinen: true }], bron: 'officieel domein van Knab — knab.nl' },
  { id: 'bunq', soort: 'bank', merk: 'bunq', merkWoorden: ['bunq'], domeinen: [{ domein: 'bunq.com', subdomeinen: true }], bron: 'officieel domein van bunq — bunq.com' },
  { id: 'revolut', soort: 'bank', merk: 'Revolut', merkWoorden: ['revolut'], domeinen: [{ domein: 'revolut.com', subdomeinen: true }], bron: 'officieel domein van Revolut — revolut.com' },
  { id: 'wise', soort: 'betaling', merk: 'Wise', merkWoorden: [], lijktOp: false, domeinen: [{ domein: 'wise.com', subdomeinen: true }], bron: 'officieel domein van Wise (voorheen TransferWise) — wise.com' },
  { id: 'stripe', soort: 'betaling', merk: 'Stripe', merkWoorden: ['=Stripe'], domeinen: [{ domein: 'stripe.com', subdomeinen: true }], bron: 'officieel domein van Stripe — stripe.com' },
  { id: 'mollie', soort: 'betaling', merk: 'Mollie', merkWoorden: [], domeinen: [{ domein: 'mollie.com', subdomeinen: true }], bron: 'officieel domein van Mollie — mollie.com (geen merkwoord: ook een voornaam)' },
  { id: 'adyen', soort: 'betaling', merk: 'Adyen', merkWoorden: ['adyen'], domeinen: [{ domein: 'adyen.com', subdomeinen: true }], bron: 'officieel domein van Adyen — adyen.com' },
  // Banken Oekraïne.
  { id: 'oschadbank', soort: 'bank', merk: 'Ощадбанк', merkWoorden: ['oschadbank', 'ощадбанк'], domeinen: [{ domein: 'oschadbank.ua', subdomeinen: true }], bron: 'oschadbank.ua — офіційний домен банку' },
  { id: 'pumb', soort: 'bank', merk: 'ПУМБ', merkWoorden: ['=ПУМБ', '=PUMB'], domeinen: [{ domein: 'pumb.ua', subdomeinen: true }], bron: 'pumb.ua — офіційний домен банку' },
  { id: 'ukrsibbank', soort: 'bank', merk: 'UKRSIBBANK', merkWoorden: ['ukrsibbank', 'укрсиббанк'], domeinen: [{ domein: 'ukrsibbank.com', subdomeinen: true }], bron: 'ukrsibbank.com — офіційний домен банку' },
  { id: 'ukrgasbank', soort: 'bank', merk: 'Укргазбанк', merkWoorden: ['ukrgasbank', 'укргазбанк'], domeinen: [{ domein: 'ukrgasbank.com', subdomeinen: true }], bron: 'ukrgasbank.com — офіційний домен банку' },
  { id: 'sensebank', soort: 'bank', merk: 'Sense Bank', merkWoorden: ['sense bank', 'сенс банк'], domeinen: [{ domein: 'sensebank.com.ua', subdomeinen: true }], bron: 'sensebank.com.ua — офіційний домен банку' },
  // Overheid Oekraïne: gov.ua is voorbehouden aan overheidsorganen (elk subdomein is een overheidsorgaan).
  { id: 'diia', soort: 'overheid', merk: 'Дія', merkWoorden: ['diia'], domeinen: [{ domein: 'diia.gov.ua', subdomeinen: true }], bron: 'diia.gov.ua — портал «Дія» Мінцифри' },
  { id: 'gov-ua', soort: 'overheid', merk: 'Державний орган України', merkWoorden: [], lijktOp: false, domeinen: [{ domein: 'gov.ua', subdomeinen: true }], bron: 'домен gov.ua — лише для органів державної влади України (правила домену gov.ua)' },
  { id: 'novaposhta', soort: 'post', merk: 'Нова пошта', merkWoorden: ['нова пошта', 'nova poshta', 'novaposhta', 'nova post'], domeinen: [{ domein: 'novaposhta.ua', subdomeinen: true }, { domein: 'novapost.com', subdomeinen: true }], bron: 'novaposhta.ua, novapost.com — офіційні домени «Нової пошти»' },
  { id: 'ukrposhta', soort: 'post', merk: 'Укрпошта', merkWoorden: ['укрпошта', 'ukrposhta'], domeinen: [{ domein: 'ukrposhta.ua', subdomeinen: true }], bron: 'ukrposhta.ua — офіційний домен АТ «Укрпошта»' },
  { id: 'rozetka', soort: 'winkel', merk: 'Rozetka', merkWoorden: ['rozetka', 'розетка'], domeinen: [{ domein: 'rozetka.com.ua', subdomeinen: true }], bron: 'rozetka.com.ua — офіційний домен' },
  // Overheid Nederland.
  { id: 'belastingdienst', soort: 'overheid', merk: 'Belastingdienst', merkWoorden: ['belastingdienst', 'dienst toeslagen'], domeinen: [{ domein: 'belastingdienst.nl', subdomeinen: true }, { domein: 'toeslagen.nl', subdomeinen: true }], bron: 'belastingdienst.nl — officieel domein van de Belastingdienst / Dienst Toeslagen' },
  { id: 'digid', soort: 'overheid', merk: 'DigiD', merkWoorden: ['digid'], domeinen: [{ domein: 'digid.nl', subdomeinen: true }], bron: 'digid.nl — officieel domein van DigiD (Logius)' },
  { id: 'mijnoverheid', soort: 'overheid', merk: 'MijnOverheid', merkWoorden: ['mijnoverheid', 'mijn overheid'], domeinen: [{ domein: 'mijnoverheid.nl', subdomeinen: true }], bron: 'mijnoverheid.nl — officieel domein van MijnOverheid (Logius)' },
  { id: 'rijksoverheid', soort: 'overheid', merk: 'Rijksoverheid', merkWoorden: ['rijksoverheid'], domeinen: [{ domein: 'rijksoverheid.nl', subdomeinen: true }, { domein: 'overheid.nl', subdomeinen: true }], bron: 'rijksoverheid.nl, overheid.nl — officiële domeinen van de Nederlandse overheid' },
  { id: 'uwv', soort: 'overheid', merk: 'UWV', merkWoorden: ['=UWV'], domeinen: [{ domein: 'uwv.nl', subdomeinen: true }], bron: 'uwv.nl — officieel domein van UWV' },
  { id: 'svb', soort: 'overheid', lijktOp: false, merk: 'SVB', merkWoorden: ['=SVB', 'sociale verzekeringsbank'], domeinen: [{ domein: 'svb.nl', subdomeinen: true }], bron: 'svb.nl — officieel domein van de Sociale Verzekeringsbank' },
  { id: 'duo', soort: 'overheid', lijktOp: false, merk: 'DUO', merkWoorden: ['=DUO'], domeinen: [{ domein: 'duo.nl', subdomeinen: true }], bron: 'duo.nl — officieel domein van Dienst Uitvoering Onderwijs' },
  { id: 'cjib', soort: 'overheid', merk: 'CJIB', merkWoorden: ['=CJIB'], domeinen: [{ domein: 'cjib.nl', subdomeinen: true }], bron: 'cjib.nl — officieel domein van het Centraal Justitieel Incassobureau' },
  { id: 'rdw', soort: 'overheid', lijktOp: false, merk: 'RDW', merkWoorden: ['=RDW'], domeinen: [{ domein: 'rdw.nl', subdomeinen: true }], bron: 'rdw.nl — officieel domein van de RDW' },
  { id: 'kvk', soort: 'overheid', lijktOp: false, merk: 'KVK', merkWoorden: ['=KVK', '=KvK', 'kamer van koophandel'], domeinen: [{ domein: 'kvk.nl', subdomeinen: true }], bron: 'kvk.nl — officieel domein van de Kamer van Koophandel' },
  { id: 'postnl', soort: 'post', merk: 'PostNL', merkWoorden: ['postnl'], domeinen: [{ domein: 'postnl.nl', subdomeinen: true }], bron: 'postnl.nl — officieel domein van PostNL' },
  { id: 'bol', soort: 'winkel', lijktOp: false, merk: 'bol', merkWoorden: ['bol com'], domeinen: [{ domein: 'bol.com', subdomeinen: true }], bron: 'bol.com — officieel domein' },
  { id: 'coolblue', soort: 'winkel', merk: 'Coolblue', merkWoorden: ['coolblue'], domeinen: [{ domein: 'coolblue.nl', subdomeinen: true }, { domein: 'coolblue.be', subdomeinen: true }, { domein: 'coolblue.de', subdomeinen: true }], bron: 'coolblue.nl/.be/.de — officiële domeinen van Coolblue' },
  // Overheid België (federaal: fgov.be en belgium.be).
  { id: 'fgov', soort: 'overheid', merk: 'Federale overheid België', merkWoorden: ['fod financien', 'spf finances', 'myminfin'], domeinen: [{ domein: 'fgov.be', subdomeinen: true }], bron: 'fgov.be — domein van de federale overheidsdiensten (o.a. minfin.fgov.be)' },
  { id: 'belgium', soort: 'overheid', merk: 'belgium.be', merkWoorden: ['mygov be'], lijktOp: false, domeinen: [{ domein: 'belgium.be', subdomeinen: true }, { domein: 'mypension.be', subdomeinen: true }, { domein: 'socialsecurity.be', subdomeinen: true }], bron: 'belgium.be, mypension.be, socialsecurity.be — officiële portalen van de Belgische overheid' },
  { id: 'bpost', soort: 'post', merk: 'bpost', merkWoorden: ['bpost'], domeinen: [{ domein: 'bpost.be', subdomeinen: true }], bron: 'bpost.be — officieel domein van bpost' },
  // Techdiensten (vaak in phishing nagebootst).
  { id: 'dropbox', soort: 'tech', merk: 'Dropbox', merkWoorden: ['dropbox'], domeinen: [{ domein: 'dropbox.com', subdomeinen: true }, { domein: 'dropboxmail.com', subdomeinen: true }], bron: 'dropbox.com — meldingen van no-reply@dropbox.com / dropboxmail.com' },
  { id: 'linkedin', soort: 'tech', merk: 'LinkedIn', merkWoorden: ['linkedin'], domeinen: [{ domein: 'linkedin.com', subdomeinen: true }], bron: 'linkedin.com — meldingen van @linkedin.com' },
  { id: 'facebook', soort: 'tech', merk: 'Facebook', merkWoorden: ['facebook', 'instagram'], domeinen: [{ domein: 'facebook.com', subdomeinen: true }, { domein: 'facebookmail.com', subdomeinen: true }, { domein: 'instagram.com', subdomeinen: true }], bron: 'Meta: meldingen van @facebookmail.com en @mail.instagram.com' },
  { id: 'netflix', soort: 'tech', merk: 'Netflix', merkWoorden: ['netflix'], domeinen: [{ domein: 'netflix.com', subdomeinen: true }], bron: 'netflix.com — meldingen van info@account.netflix.com' },
  { id: 'spotify', soort: 'tech', merk: 'Spotify', merkWoorden: ['spotify'], domeinen: [{ domein: 'spotify.com', subdomeinen: true }], bron: 'spotify.com — officieel domein' },
  { id: 'docusign', soort: 'tech', merk: 'DocuSign', merkWoorden: ['docusign'], domeinen: [{ domein: 'docusign.net', subdomeinen: true }, { domein: 'docusign.com', subdomeinen: true }], bron: 'docusign.com — envelopmeldingen komen van @docusign.net' },
  { id: 'zoom', soort: 'tech', merk: 'Zoom', merkWoorden: [], lijktOp: false, domeinen: [{ domein: 'zoom.us', subdomeinen: true }, { domein: 'zoom.com', subdomeinen: true }], bron: 'zoom.us, zoom.com — officiële domeinen van Zoom (geen merkwoord: gewoon woord)' },
  { id: 'slack', soort: 'tech', merk: 'Slack', merkWoorden: [], lijktOp: false, domeinen: [{ domein: 'slack.com', subdomeinen: true }], bron: 'slack.com — meldingen van @slack.com (geen merkwoord: gewoon woord)' },
  { id: 'x', soort: 'tech', merk: 'X (Twitter)', merkWoorden: ['twitter'], lijktOp: false, domeinen: [{ domein: 'x.com', subdomeinen: true }, { domein: 'twitter.com', subdomeinen: true }], bron: 'x.com, twitter.com — officiële domeinen van X' },
  { id: 'booking', soort: 'winkel', lijktOp: false, merk: 'Booking.com', merkWoorden: ['booking com'], domeinen: [{ domein: 'booking.com', subdomeinen: true }], bron: 'booking.com — officieel domein' },
  { id: 'airbnb', soort: 'winkel', merk: 'Airbnb', merkWoorden: ['airbnb'], domeinen: [{ domein: 'airbnb.com', subdomeinen: true }], bron: 'airbnb.com — officieel domein' },
  { id: 'hetzner', soort: 'tech', merk: 'Hetzner', merkWoorden: ['hetzner'], domeinen: [{ domein: 'hetzner.com', subdomeinen: true }, { domein: 'hetzner.de', subdomeinen: true }], bron: 'hetzner.com, hetzner.de — officiële domeinen van Hetzner Online' },
]);

/** Gratis mailboxen: iedereen kan er een adres aanmaken; nooit een «bekende dienst». */
export const GRATIS_MAILBOXEN: readonly string[] = Object.freeze([
  'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com', 'msn.com', 'icloud.com', 'me.com', 'mac.com', 'yahoo.com', 'ymail.com',
  'aol.com', 'gmx.com', 'gmx.de', 'gmx.net', 'web.de', 'proton.me', 'protonmail.com', 'mail.com', 'yandex.ru', 'ukr.net', 'i.ua', 'meta.ua', 'telenet.be', 'skynet.be', 'proximus.be',
]);

/** Ontvangende servers waarvan we de Authentication-Results vertrouwen (de bovenste regel, toegevoegd door de eigen mailbox). */
export const VERTROUWDE_AUTHSERV: readonly string[] = Object.freeze(['mx.google.com']);
