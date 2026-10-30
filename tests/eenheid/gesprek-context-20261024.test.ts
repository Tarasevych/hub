// Context van een gesprek — pure regels (pakket 2 «Adaptive Mail Canvas», 24.10.2026). Draaien: node scripts/eenheidstests.mjs gesprek-context
// Макет власника: «вкладення: група версій одного документа (v3/v2/v1)», «зв'язки: з причиною … і чесною позначкою «без ШІ»»,
// «хронологія: … листи гілки кольором відправника, «ви тут», майбутня подія», «перевірка відправника».
//  A. personen: naam, beginletters, adressen uit To/Cc (komma's in aanhalingstekens), «мені» apart.
//  B. versies: sleutel zonder status-/versiewoorden en datums (nl/en/uk), getallen blijven (factuur 12 ≠ 13), ongewijzigd doorgestuurd
//     bestand = dezelfde versie, groepen nieuwste eerst, etiket per bijlage.
//  C. verwante brieven: dezelfde afzender (niet ikzelf), hetzelfde onderwerp (≥ 2 woorden of één lang woord), niet uit dit gesprek,
//     één per gesprek, nieuwste eerst, max.
//  D. tijdlijn + .ics-tijd: volgorde, «ви тут», versies per brief, toekomstige afspraak.
//  E. afzendercontrole, «N eerdere brieven», contactkleur.
import { checker } from './hulp/nep-google';
import {
  adressenUit, afzenderControle, beginletters, bijlageVersies, contactKleur, documentSleutel, eerdereBrieven, icsTijd, isIcs, naamVan,
  onderwerpWoorden, ontvangers, tijdlijn, verwanteBrieven, versieVan, type CtxBericht,
} from '../../src/mail/gesprek-context';

const LOTTE = 'Lotte Vermeulen <lotte.vermeulen@immo-voorbeeld.example>', IK = 'Pavlo <pavlo@example.test>';
const dag = 864e5, NU = Date.UTC(2026, 9, 24, 9, 41);
const pdf = (id: string, filename: string, kb: number) => ({ providerAttachmentId: id, filename, contentType: 'application/pdf', sizeBytes: kb * 1024 });
const gesprek: CtxBericht[] = [
  { id: 'm1', threadId: 't1', from: LOTTE, to: IK, subject: 'Huurcontract Voorbeeldstraat 12 — concept', snippet: 'Goedemiddag Pavlo, in bijlage het concept', receivedAt: NU - 2 * dag, attachments: [pdf('a1', 'Huurcontract-concept.pdf', 1600)] },
  { id: 'm2', threadId: 't1', from: IK, to: LOTTE, subject: 'Re: Huurcontract Voorbeeldstraat 12 — concept', snippet: 'Dag Lotte, dank u.', receivedAt: NU - dag, attachments: [pdf('a2', 'Huurcontract-getekend.pdf', 1700)] },
  { id: 'm3', threadId: 't1', from: LOTTE, to: 'pavlo@example.test', cc: 'Bart Peeters <bart@immo-voorbeeld.example>, "Peeters, An" <an@immo-voorbeeld.example>', subject: 'Huurcontract Voorbeeldstraat 12 — ondertekende versie', snippet: 'Goedemorgen Pavlo, bedankt', receivedAt: NU,
    attachments: [pdf('a3', 'Huurcontract-ondertekend.pdf', 1800), { providerAttachmentId: 'a4', filename: 'grondplan-appartement.png', contentType: 'image/png', sizeBytes: 512 * 1024 }, { providerAttachmentId: 'a5', filename: 'uitnodiging-plaatsbeschrijving.ics', contentType: 'text/calendar', sizeBytes: 2048 }],
    details: { authentication: { spf: 'pass', dkim: 'pass', dmarc: 'pass' }, transport: { status: 'encrypted_observed' } } },
];

export async function main(): Promise<number> {
  const { check, einde } = checker('gesprek-context-20261024');

  // ------------------------------------------------------------------ A. personen
  check('A naam en beginletters: «Lotte Vermeulen» → LV, alleen adres «info@bank.be» → IB, één woord → P',
    naamVan(LOTTE) === 'Lotte Vermeulen' && beginletters(LOTTE) === 'LV' && beginletters('info@bank.be') === 'IB' && beginletters(IK) === 'P' && beginletters('') === '?');
  const cc = adressenUit(gesprek[2].cc);
  check('A adressen uit Cc: komma binnen aanhalingstekens splitst niet, namen zonder aanhalingstekens, adres in kleine letters',
    cc.length === 2 && cc[0].naam === 'Bart Peeters' && cc[0].adres === 'bart@immo-voorbeeld.example' && cc[1].naam === 'Peeters, An' && cc[1].adres === 'an@immo-voorbeeld.example'
    && adressenUit('A <A@X.BE>; b@y.be, kapot').map((x) => x.adres).join() === 'a@x.be,b@y.be', JSON.stringify(cc));
  const o = ontvangers(gesprek[2], ['Pavlo@Example.test']);
  check('A ontvangers: «кому: мені» (eigen adres, hoofdletters maken niet uit), cc met namen', o.aan.length === 1 && o.aan[0].ik && o.cc.length === 2 && !o.cc[0].ik, JSON.stringify(o));

  // ------------------------------------------------------------------ B. versies van bijlagen
  check('B sleutel: concept / getekend / ondertekend / ondertekende versie / final / v2 / (1) / datum → hetzelfde document',
    ['Huurcontract-concept.pdf', 'Huurcontract-getekend.pdf', 'Huurcontract ondertekend.pdf', 'huurcontract_v2.pdf', 'Huurcontract (1).pdf', 'Huurcontract 2026-10-24 final.pdf', 'Huurcontract versie 3.PDF'].every((f) => documentSleutel(f) === 'huurcontract.pdf'),
    ['Huurcontract-concept.pdf', 'huurcontract_v2.pdf', 'Huurcontract versie 3.PDF'].map(documentSleutel).join());
  check('B getallen blijven deel van het document: factuur 12 ≠ factuur 13; andere extensie = ander document; alleen een datum → geen groep',
    documentSleutel('Factuur-12.pdf') !== documentSleutel('Factuur-13.pdf') && documentSleutel('plan.pdf') !== documentSleutel('plan.png') && documentSleutel('20261024.pdf') === '' && documentSleutel('v2.pdf') === '');
  const v = bijlageVersies(gesprek);
  check('B gesprek: één groep «Huurcontract» met 3 versies (nieuwste eerst: v3 · остання), plan en .ics los',
    v.groepen.length === 1 && v.groepen[0].titel === 'Huurcontract' && v.groepen[0].totaal === 3 && v.groepen[0].items.map((i) => `${i.nummer}${i.laatste ? '*' : ''}`).join() === '3*,2,1'
    && v.los.map((l) => l.bijlage.providerAttachmentId).join() === 'a4,a5', JSON.stringify(v.groepen[0]?.items.map((i) => [i.bijlage.filename, i.nummer])));
  check('B etiket per bijlage: a3 → 3/3 laatste, a1 → 1/3, plan → geen', JSON.stringify(versieVan(v.groepen, 'm3', 'a3')) === '{"nummer":3,"totaal":3,"laatste":true}' && versieVan(v.groepen, 'm1', 'a1')?.nummer === 1 && versieVan(v.groepen, 'm3', 'a4') === null);
  const doorgestuurd = bijlageVersies([
    { ...gesprek[0], attachments: [pdf('x1', 'image001.png', 3)] }, { ...gesprek[1], attachments: [pdf('x2', 'image001.png', 3)] }, { ...gesprek[2], attachments: [pdf('x3', 'image001.png', 3)] },
  ]);
  check('B hetzelfde bestand in elke brief (logo in de handtekening, zelfde grootte) is géén versiegroep', doorgestuurd.groepen.length === 0 && doorgestuurd.los.length === 3);
  const kopie = bijlageVersies([{ ...gesprek[0], attachments: [pdf('k1', 'Offerte.pdf', 10)] }, { ...gesprek[1], attachments: [pdf('k2', 'Offerte.pdf', 10)] }, { ...gesprek[2], attachments: [pdf('k3', 'Offerte-v2.pdf', 11)] }]);
  check('B ongewijzigd doorgestuurd = dezelfde versie: Offerte, Offerte (zelfde), Offerte-v2 → v1, v1, v2 (2 versies)', kopie.groepen.length === 1 && kopie.groepen[0].totaal === 2 && kopie.groepen[0].items.map((i) => i.nummer).join() === '2,1,1');

  // ------------------------------------------------------------------ C. verwante brieven
  const kandidaten = [
    { id: 'r1', threadId: 'rt1', subject: 'Huurwaarborg — bevestiging', from: LOTTE, receivedAt: NU - 4 * dag },
    { id: 'r2', threadId: 'rt2', subject: 'Bezichtiging appartement', from: 'Lotte <LOTTE.VERMEULEN@immo-voorbeeld.example>', receivedAt: NU - 10 * dag },
    { id: 'r2b', threadId: 'rt2', subject: 'Re: Bezichtiging appartement', from: LOTTE, receivedAt: NU - 9 * dag },
    { id: 'r3', threadId: 'rt3', subject: 'Uw nieuwsbrief van oktober', from: 'nieuws@winkel.example', receivedAt: NU - dag },
    { id: 'r4', threadId: 'rt4', subject: 'Vraag over Voorbeeldstraat 12: huurcontract en sleutels', from: 'Syndicus <syndicus@example.be>', receivedAt: NU - 3 * dag },
    { id: 'r5', threadId: 'rt5', subject: 'Re: Re: Fwd: mijn eigen brief', from: IK, receivedAt: NU - dag },
    { id: 'm2', threadId: 't1', subject: 'Re: Huurcontract', from: IK, receivedAt: NU - dag },
  ];
  const ver = verwanteBrieven({ thread: gesprek, kandidaten, mijnAdressen: ['pavlo@example.test'] });
  check('C verwant: Lotte (afzender, ook met andere schrijfwijze), Syndicus (onderwerp: voorbeeldstraat + huurcontract); niet: nieuwsbrief, ikzelf, het gesprek zelf',
    ver.map((x) => `${x.id}:${x.reden}`).join() === 'r4:onderwerp,r1:afzender,r2b:afzender', ver.map((x) => `${x.id}:${x.reden}`).join());
  check('C één per gesprek (de nieuwste: r2b i.p.v. r2), max 2 geeft de twee nieuwste', !ver.some((x) => x.id === 'r2') && verwanteBrieven({ thread: gesprek, kandidaten, mijnAdressen: ['pavlo@example.test'], max: 2 }).map((x) => x.id).join() === 'r4,r1');
  check('C onderwerpwoorden zonder Re:/Fwd:/Відп: en zonder stopwoorden', JSON.stringify(onderwerpWoorden('Re: Fwd: Відп: Vraag over de huurwaarborg voor Voorbeeldstraat 12')) === '["huurwaarborg","voorbeeldstraat"]', JSON.stringify(onderwerpWoorden('Re: Fwd: Відп: Vraag over de huurwaarborg voor Voorbeeldstraat 12')));

  // ------------------------------------------------------------------ D. tijdlijn en .ics
  const start = icsTijd('20261028T090000Z');
  check('D .ics-tijd: met Z = UTC, zonder Z plaatselijk, alleen datum = middernacht, onleesbaar = 0',
    start === Date.UTC(2026, 9, 28, 9, 0, 0) && icsTijd('20261028T100000') === new Date(2026, 9, 28, 10, 0, 0).getTime() && icsTijd('20261028') === new Date(2026, 9, 28).getTime() && icsTijd('morgen') === 0);
  check('D .ics herkend aan type of extensie', isIcs({ filename: 'x.bin', contentType: 'text/calendar; method=REQUEST' }) && isIcs({ filename: 'Uitnodiging.ICS', contentType: 'application/octet-stream' }) && !isIcs({ filename: 'plan.png', contentType: 'image/png' }));
  const tl = tijdlijn({ thread: gesprek, openId: 'm3', verwant: ver, gebeurtenissen: [{ titel: 'Plaatsbeschrijving', start, berichtId: 'm3', providerAttachmentId: 'a5' }], groepen: v.groepen, nu: NU });
  check('D tijdlijn oudste boven: 2 verwante (stippel), 3 brieven, dan de afspraak in de toekomst; «ви тут» alleen bij m3; versies per brief',
    tl.map((x) => x.soort[0]).join('') === 'vvvbbbg' && tl.filter((x) => x.hier).map((x) => x.id).join() === 'm3' && tl.find((x) => x.id === 'm1')?.versies.join() === '1' && tl.find((x) => x.id === 'm3')?.versies.join() === '3' && tl[tl.length - 1].toekomst === true,
    tl.map((x) => `${x.soort}:${x.id}`).join(' '));
  check('D tijdlijn: titel van een brief = begin van de tekst (niet steeds hetzelfde onderwerp)', tl.find((x) => x.id === 'm2')?.titel === 'Dag Lotte, dank u.');

  // ------------------------------------------------------------------ E. afzender, eerdere brieven, kleur
  check('E afzendercontrole: DMARC pass → ok; SPF+DKIM pass → ok; één pass → deels; DMARC fail → mislukt (ook als SPF en DKIM slagen: die kunnen voor een ander domein gelden); niets → onbekend',
    afzenderControle(gesprek[2].details) === 'ok' && afzenderControle({ authentication: { spf: 'pass', dkim: 'pass', dmarc: '' } }) === 'ok' && afzenderControle({ authentication: { spf: 'pass', dkim: 'none', dmarc: 'none' } }) === 'deels'
    && afzenderControle({ authentication: { spf: 'pass', dkim: 'pass', dmarc: 'fail' } }) === 'mislukt' && afzenderControle({ authentication: { spf: 'fail', dkim: 'fail', dmarc: 'none' } }) === 'mislukt' && afzenderControle({ authentication: { dmarc: 'fail' } }) === 'mislukt' && afzenderControle(undefined) === 'onbekend');
  const eerder = eerdereBrieven(gesprek);
  check('E «2 попередні листи»: vanaf een gesprek van 3, met de afzenders (zonder dubbel) en van–tot; korter gesprek → geen regel',
    !!eerder && eerder.aantal === 2 && eerder.ids.join() === 'm1,m2' && eerder.afzenders.map((a) => a.naam).join() === 'Lotte Vermeulen,Pavlo' && eerder.van === NU - 2 * dag && eerder.tot === NU - dag && eerdereBrieven(gesprek.slice(0, 2)) === null);
  check('E contactkleur uit de afzenderregels van de Post (alleen geldige #rrggbb), anders leeg', contactKleur([{ email: 'LOTTE.vermeulen@immo-voorbeeld.example', color: '#16a766' }], LOTTE) === '#16a766' && contactKleur([{ email: 'x@y.be', color: 'red' }], 'x@y.be') === '' && contactKleur([], LOTTE) === '');

  return einde();
}
