// Блок 5 (3.1–3.5), 26.10: черга відновлюється, тихі збої не губляться, samenvoegen знімає лише автоматичне
// «ім’я контакту» при підписі власним доменом, безкоштовна пошта — не одна організація, збереження додає контакт,
// історія фото ≤ 5, чужий хост не запитується. Без бази й без Gmail.
import { AFZENDER_REGELS_VERSIE, magContactnaamOpheffen } from '../../shared/afzender-regels';
import { dnsVolgende, herhaalVerdacht, legeWachtrij, startOfHervat, verwerkPagina, type Wachtrij } from '../../shared/afzender-wachtrij';
import { classificeer, GEEN_AUTH, parseAuthResults } from '../../shared/mail-afzenders';
import { probeToegestaan, vcardFoto } from '../../shared/merk-bron';
import { kiesBeeld, voegBeeldStap } from '../../shared/beeld-geschiedenis';
import { bewaarInContacten, herbeoordeelUitBewijs, samenvoegen, type AfzenderRij } from '../../backend/mail-afzenders';

const resultaten: Array<{ naam: string; ok: boolean }> = [];
const check = (naam: string, ok: boolean, extra = '') => { resultaten.push({ naam, ok }); console.log(`${ok ? 'OK  ' : 'FOUT'} ${naam}${extra && !ok ? ` — ${extra}` : ''}`); };
const passVoor = (d: string) => parseAuthResults([`mx.google.com; dkim=pass header.i=@${d} header.s=x header.b=y; spf=pass smtp.mailfrom=bounce@${d}; dmarc=pass header.from=${d}`]);

function rij(over: Partial<AfzenderRij> = {}): AfzenderRij {
  return {
    adres: 'ander@gmail.com', naam: 'Jan Peeters', domein: 'gmail.com', status: 'verdacht', bron: null,
    reden: 'NAAM_VAN_CONTACT_ANDER_ADRES', merk: '', bewijs: {}, eersteOp: null, laatsteOp: null, aantal: 1,
    notitie: '', historie: [], geverifieerdOp: null, geverifieerdDoor: null, bijgewerktOp: '', inContacten: false,
    ...over,
  };
}
const waarneem = (r: AfzenderRij, klass: AfzenderRij extends never ? never : { status: AfzenderRij['status']; bron: AfzenderRij['bron']; reden: string; merk: string }, auth = GEEN_AUTH) =>
  ({ adres: r.adres, naam: r.naam, domein: r.domein, klass, auth, tijd: 1_700_000_000_000, telt: false });

export async function main(): Promise<number> {
  const gepauzeerd: Wachtrij = { ...legeWachtrij('onbekend'), staat: 'gepauzeerd', cursor: 'm@b.example', dnsCursor: 'b.example', verwerkt: 10, gewijzigd: 2, stil: ['acc|stil-1'], poging: 1 };
  const hervat = startOfHervat(gepauzeerd, 'onbekend');
  check('черга: пауза тримає курсор, лічильник і тихі збої', hervat.staat === 'bezig' && hervat.cursor === 'm@b.example' && hervat.dnsCursor === 'b.example' && hervat.verwerkt === 10 && hervat.gewijzigd === 2 && hervat.stil[0] === 'acc|stil-1' && hervat.poging === 2);
  const opnieuw = startOfHervat({ ...gepauzeerd, staat: 'klaar' }, 'onbekend');
  check('черга: після «klaar» адреси спочатку, тихі збої лишаються', opnieuw.cursor === '' && opnieuw.verwerkt === 0 && opnieuw.dnsCursor === '' && opnieuw.stil.join(',') === 'acc|stil-1' && opnieuw.staat === 'bezig');
  const bezig = startOfHervat(hervat, 'onbekend');
  check('черга: «bezig» не скидається повторним стартом', bezig.cursor === hervat.cursor && bezig.poging === hervat.poging && bezig.staat === 'bezig');

  const pagina = verwerkPagina(legeWachtrij('verdacht'), [{ id: 'acc|1', ok: false }, { id: 'acc|2', ok: true }, { id: '', ok: false }], 'c2');
  check('сторінка: невдача лишається в stil, успіх — ні', pagina.stil.join(',') === 'acc|1' && pagina.cursor === 'c2' && pagina.verwerkt === 3);
  const nog = herhaalVerdacht(['acc|1', 'acc|9', 'acc|stil'], [{ id: 'acc|1', ok: false }]);
  check('повторити підозрілі: невдача лишається, тихий збій поза партією не зникає', nog.includes('acc|1') && nog.includes('acc|9') && nog.includes('acc|stil') && nog.length === 3);
  const weg = herhaalVerdacht(nog, [{ id: 'acc|1', ok: true }]);
  check('повторити підозрілі: успіх прибирає лише цей id', !weg.includes('acc|1') && weg.includes('acc|9') && weg.includes('acc|stil'));

  const dns1 = dnsVolgende(['b.example', 'a.example', 'a.example', ' '], '', 1);
  const dns2 = dnsVolgende(['b.example', 'a.example', 'c.example'], dns1.cursor, 2000);
  check('DNS: за алфавітом і курсором, решта не губиться', dns1.deel.join(',') === 'a.example' && dns1.meer && dns1.cursor === 'a.example' && dns2.deel.join(',') === 'b.example,c.example' && !dns2.meer);

  const gmail = new Map<string, readonly string[]>([['jan peeters', ['jan@gmail.com']]]);
  const zelfdeNaam = classificeer({ naam: 'Jan Peeters', adres: 'ander@gmail.com', domein: 'gmail.com', contacten: gmail });
  const metHandtekening = classificeer({ naam: 'Jan Peeters', adres: 'ander@gmail.com', domein: 'gmail.com', auth: passVoor('gmail.com'), contacten: gmail });
  const org = classificeer({ naam: 'Jan Peeters', adres: 'jan@nieuws.peeters.be', domein: 'nieuws.peeters.be', contacten: new Map([['jan peeters', ['jan@peeters.be']]]) });
  check('безкоштовна пошта — не одна організація', zelfdeNaam.status === 'verdacht' && zelfdeNaam.reden === 'NAAM_VAN_CONTACT_ANDER_ADRES');
  check('підпис власним доменом знімає правило імені контакту, але не робить gmail перевіреним', metHandtekening.status === 'onbekend' && metHandtekening.reden === 'GRATIS_MAILBOX');
  check('той самий організаційний домен (не безкоштовний) лишається не імітацією', org.reden !== 'NAAM_VAN_CONTACT_ANDER_ADRES' && org.status === 'onbekend');

  const gewist = samenvoegen(rij(), waarneem(rij(), { status: 'onbekend', bron: null, reden: 'GRATIS_MAILBOX', merk: '' }, passVoor('gmail.com')));
  const zonder = samenvoegen(rij(), waarneem(rij(), { status: 'onbekend', bron: null, reden: 'NIET_BEVESTIGD', merk: '' }));
  const hand = samenvoegen(rij({ reden: 'HANDMATIG_VERDACHT', domein: 'paypal.com', adres: 'x@paypal.com' }), waarneem(rij({ domein: 'paypal.com', adres: 'x@paypal.com' }), { status: 'geverifieerd', bron: 'bekende-dienst', reden: 'BEKENDE_DIENST_DMARC', merk: 'PayPal' }, passVoor('paypal.com')));
  const look = samenvoegen(rij({ reden: 'DOMEIN_LIJKT_OP_MERK', domein: 'paypa1.com', adres: 'a@paypa1.com' }), waarneem(rij({ domein: 'paypa1.com', adres: 'a@paypa1.com' }), { status: 'onbekend', bron: null, reden: 'NIET_BEVESTIGD', merk: '' }, passVoor('paypa1.com')));
  check('samenvoegen знімає лише автоматичне ім’я контакту при підписі власним доменом', gewist.status === 'onbekend' && gewist.reden === 'GRATIS_MAILBOX' && zonder.status === 'verdacht' && zonder.reden === 'NAAM_VAN_CONTACT_ANDER_ADRES');
  check('ручна підозра і схожий домен не знімаються', hand.status === 'verdacht' && hand.reden === 'HANDMATIG_VERDACHT' && look.status === 'verdacht' && look.reden === 'DOMEIN_LIJKT_OP_MERK');
  check('правило імені контакту вужче за загальне перезаписування', magContactnaamOpheffen('NAAM_VAN_CONTACT_ANDER_ADRES', true) && !magContactnaamOpheffen('NAAM_VAN_CONTACT_ANDER_ADRES', false) && !magContactnaamOpheffen('HANDMATIG_VERDACHT', true) && !magContactnaamOpheffen('DOMEIN_LIJKT_OP_MERK', true));

  const laatste = { spf: 'pass', dkim: 'pass:gmail.com', dmarc: 'pass', authserv: 'mx.google.com', dkimDomein: 'gmail.com', dmarcDomein: 'gmail.com', tijd: 5 };
  const herzien = herbeoordeelUitBewijs(rij({ bewijs: { laatste } }), 9);
  const nogEens = herbeoordeelUitBewijs(herzien, 10);
  const handHerzien = herbeoordeelUitBewijs(rij({ reden: 'HANDMATIG_VERDACHT', bewijs: { laatste: { ...laatste, dkimDomein: 'paypal.com', dmarcDomein: 'paypal.com' } } }), 9);
  check('одноразовий перегляд старого автоматичного вердикту', herzien.status === 'onbekend' && herzien.reden === 'GRATIS_MAILBOX' && herzien.bewijs.regelVersie === AFZENDER_REGELS_VERSIE && nogEens.status === 'onbekend' && nogEens.bewijs.regelVersie === AFZENDER_REGELS_VERSIE);
  check('перегляд не знімає ручну підозру, але ставить версію', handHerzien.status === 'verdacht' && handHerzien.reden === 'HANDMATIG_VERDACHT' && handHerzien.bewijs.regelVersie === AFZENDER_REGELS_VERSIE);

  const bewaard = bewaarInContacten(rij({ status: 'onbekend', reden: 'NIET_BEVESTIGD' }), 'user-1', 'Jan', 'нотатка', 1_700_000_000_000);
  const al = bewaarInContacten(bewaard, 'user-1', 'Jan', undefined, 1_700_000_000_100);
  check('збереження додає в «Мої контакти»', bewaard.inContacten === true && bewaard.status === 'geverifieerd' && bewaard.bron === 'handmatig' && bewaard.reden === 'HANDMATIG' && bewaard.notitie === 'нотатка' && bewaard.historie.some((h) => h.op === 'in-contacten') && bewaard.historie.some((h) => h.op === 'handmatig-bevestigd'));
  check('повторне збереження не дублює «in-contacten»', al.historie.filter((h) => h.op === 'in-contacten').length === 1 && al.inContacten === true);

  const stappen = [1, 2, 3, 4, 5, 6].reduce((h, n) => voegBeeldStap(h, { bron: `b${n}`, data: `data:image/png;base64,${'A'.repeat(20)}${n}`, tijd: n }), [] as ReturnType<typeof voegBeeldStap>);
  const gekozen = voegBeeldStap(stappen, { bron: 'b2', data: `data:image/png;base64,${'B'.repeat(24)}`, tijd: 9 });
  check('історія фото: щонайбільше 5, новіша зверху, той самий джерело замінює', stappen.length === 5 && stappen[0].bron === 'b6' && !stappen.some((s) => s.bron === 'b1') && gekozen[0].bron === 'b2' && gekozen.length === 5 && kiesBeeld(gekozen, 'b4')?.bron === 'b4');
  check('історія не приймає чужий URL', !voegBeeldStap(stappen, { bron: 'x', data: 'https://127.0.0.1/a.png' }).some((s) => s.data.startsWith('http')));

  const vreemd = probeToegestaan('https://evil.example/logo.svg');
  const privé = probeToegestaan('https://127.0.0.1/geheim');
  const http = probeToegestaan('http://gravatar.com/a');
  const login = probeToegestaan('https://user:pw@gravatar.com/a');
  const gra = probeToegestaan('https://gravatar.com/avatar/x');
  const google = probeToegestaan('https://lh3.googleusercontent.com/a');
  const eigen = probeToegestaan('https://cdn.voorbeeld.test/logo.svg', ['voorbeeld.test']);
  const suffix = probeToegestaan('https://nietvoorbeeld.test/logo.svg', ['voorbeeld.test']);
  const vcfUrl = vcardFoto('BEGIN:VCARD\r\nPHOTO:https://127.0.0.1/a.jpg\r\nEND:VCARD\r\n');
  check('чужий хост не дозволений', !vreemd.ok && vreemd.reden === 'NIET_TOEGESTAAN');
  check('внутрішня адреса і не-https відхилені', !privé.ok && privé.reden === 'PRIVE_ADRES' && !http.ok && http.reden === 'URL_ONGELDIG' && !login.ok && login.reden === 'URL_ONGELDIG');
  check('дозволені лише відомі служби або власний домен', gra.ok === true && google.ok === true && eigen.ok === true && !suffix.ok && suffix.reden === 'NIET_TOEGESTAAN');
  check('vCard з URL фото не дає байтів', vcfUrl === null);

  const mis = resultaten.filter((r) => !r.ok);
  if (mis.length) console.log(`MISLUKT ${mis.length}/${resultaten.length}`);
  return mis.length ? 1 : 0;
}
