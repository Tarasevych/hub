// ЕМБЛЕМА «МЕРЕЖА» (PLAATS-TEKENS-001, 17.11.2026) — тип мережі запиту (backend/geo/netwerk.ts). Перевіряє справжню поведінку
// на синтетичних копіях справжніх форматів (torbulkexitlist, egress-ip-ranges.csv Apple, relays/all Mullvad, ip2asn):
//   1. списки: Tor, iCloud Private Relay, Mullvad (IPv4 і IPv6, CIDR, перекриття), без файлів — без помилок;
//   2. правила за номером мережі: VPN, ретранслятор, супутник, хостинг, мобільний, домашній провайдер; приватна адреса = «werk»;
//   3. ім'я адреси (rDNS): оптика, кабель, DSL, мобільна мережа, VPN;
//   4. часовий пояс — лише підозра, ніколи не «zeker»;
//   5. кожна служба з відповіді має логотип у реєстрі; пояснення є українською й нідерландською;
//   6. BYOS: модуль нікуди не звертається, крім системного резолвера (rDNS) і локальних файлів.
// NETWERKSOORT: lijsten, regels per netwerknummer, rDNS, tijdzone, logo's, «geen verzoek naar buiten».
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { checker } from './hulp/nep-google';
import { NETWERK_ASN, leesLijst, inBereik, netwerkSoort, netwerkVanVerzoek, verbindingUitRdns, tijdzoneVerschilt } from '../../backend/geo/netwerk';
import { OFFICIEEL_SLEUTELS } from '../../src/merk/officieel-sleutels';
import { merkDef } from '../../src/merk/merk-register';
import { LOGOS } from '../../src/merk/merk-logos';
import { MERKEN } from '../../src/merk/merk-tabel';

const TSV = [
  ['5.0.0.0', '5.0.255.255', '14593', 'US', 'SPACEX-STARLINK'],
  ['5.1.0.0', '5.1.255.255', '39351', 'SE', '31173 Services AB'],
  ['5.2.0.0', '5.2.255.255', '13335', 'US', 'CLOUDFLARENET'],
  ['5.3.0.0', '5.3.255.255', '14061', 'US', 'DIGITALOCEAN-ASN'],
  ['5.4.0.0', '5.4.255.255', '9009', 'GB', 'M247'],
  ['5.5.0.0', '5.5.255.255', '34058', 'UA', 'KSNET-AS lifecell'],
  ['5.6.0.0', '5.6.255.255', '15895', 'UA', 'KSNET-AS Kyivstar'],
  ['5.7.0.0', '5.7.255.255', '62371', 'CH', 'PROTON'],
  ['5.8.0.0', '5.8.255.255', '16509', 'US', 'AMAZON-02'],
  ['81.82.0.0', '81.83.255.255', '6848', 'BE', 'TELENET-AS Telenet BV'],
  ['91.183.0.0', '91.183.255.255', '5432', 'BE', 'PROXIMUS-ISP-AS'],
  ['193.0.0.0', '193.0.255.255', '3333', 'NL', 'RIPE-NCC-AS'],
].map((r) => r.join('\t')).join('\n') + '\n';

export async function main() {
  const { check, einde } = checker('netwerk-soort-20261117');
  const oud = process.env.MIJN_RUIMTE_GEO_MAP;
  const map = mkdtempSync(join(tmpdir(), 'netwerk-'));
  try {
    process.env.MIJN_RUIMTE_GEO_MAP = map;

    // ------------------------------------------------------------ 0. zonder enige basis
    const niets = netwerkSoort('81.82.0.1');
    check('0: geen basis, geen lijsten → «onbekend», geen fout', niets.soort === 'onbekend' && niets.asn === null && niets.bewijs.uk.length > 10);
    check('0: onzin-adres → «onbekend»', netwerkSoort('onzin').soort === 'onbekend' && netwerkSoort(undefined).soort === 'onbekend');
    check('0: privé-adres = eigen netwerk («werk», zeker)', ['192.168.1.5', '10.1.2.3', '::1', '::ffff:192.168.0.9'].every((ip) => { const a = netwerkSoort(ip); return a.soort === 'werk' && a.zekerheid === 'zeker'; }));

    // ------------------------------------------------------------ 1. lijsten
    const l = leesLijst('# commentaar\n1.2.3.4\n10.0.0.0/8\n10.5.0.0/16\n2001:db8::/32\n');
    check('1: lijst: los IP, CIDR, overlap samengevoegd, IPv6', l.n === 3);
    writeFileSync(join(map, 'ip2asn-v4.tsv.gz'), gzipSync(Buffer.from(TSV)));
    writeFileSync(join(map, 'tor-exit.txt'), '185.220.101.7\n185.220.101.8\n2a0b:f4c2::1\n');
    writeFileSync(join(map, 'apple-relay.csv'), '172.224.226.0/27,NL,NL-NH,Amsterdam,\n2a02:26f7:b3c0:4000::/64,BE,BE-VOV,Ghent,\n');
    writeFileSync(join(map, 'mullvad.json.gz'), gzipSync(Buffer.from(JSON.stringify([{ ipv4_addr_in: '193.32.127.66', ipv6_addr_in: '2a03:1b20:3:f011::a01f' }, { ipv4_addr_in: '5.1.0.9' }]))));
    const tor = netwerkSoort('185.220.101.8');
    check('1: Tor-uitgang → tor, zeker, logo «tor», datum van de lijst in de uitleg', tor.soort === 'tor' && tor.zekerheid === 'zeker' && tor.dienst === 'tor' && /\d{4}-\d{2}-\d{2}/.test(tor.bewijs.uk));
    check('1: Tor IPv6 (per /64: hetzelfde knooppunt)', netwerkSoort('2a0b:f4c2::1').soort === 'tor' && netwerkSoort('2a0b:f4c2:0:1::1').soort !== 'tor');
    check('1: buurman van een Tor-uitgang is géén Tor', netwerkSoort('185.220.101.9').soort !== 'tor');
    const apple = netwerkSoort('172.224.226.17');
    check('1: iCloud Private Relay (CIDR /27) → relay, logo «icloud»', apple.soort === 'relay' && apple.dienst === 'icloud' && apple.zekerheid === 'zeker');
    check('1: buiten de /27 → geen Private Relay', netwerkSoort('172.224.226.33').dienst !== 'icloud');
    check('1: iCloud Private Relay IPv6 (/64)', netwerkSoort('2a02:26f7:b3c0:4000::abcd').dienst === 'icloud');
    const mul = netwerkSoort('193.32.127.66');
    check('1: Mullvad uit de serverlijst (.gz) → vpn, zeker', mul.soort === 'vpn' && mul.dienst === 'mullvad' && mul.zekerheid === 'zeker');
    check('1: Mullvad IPv6', netwerkSoort('2a03:1b20:3:f011::a01f').dienst === 'mullvad');
    check('1: lijst wint van netwerknummer (5.1.0.9 staat in de lijst → zeker; 5.1.0.10 alleen ASN → bijna)', netwerkSoort('5.1.0.9').zekerheid === 'zeker' && netwerkSoort('5.1.0.10').zekerheid === 'bijna' && netwerkSoort('5.1.0.10').dienst === 'mullvad');
    writeFileSync(join(map, 'tor-exit.txt'), '{kapot');
    check('1: kapotte lijst → gewoon geen treffer', netwerkSoort('185.220.101.8').soort !== 'tor');

    // ------------------------------------------------------------ 2. netwerknummers
    const soort = (ip: string) => { const a = netwerkSoort(ip); return `${a.soort}/${a.dienst}/${a.zekerheid}`; };
    check('2: Starlink → satelliet', soort('5.0.1.1') === 'satelliet/starlink/zeker', soort('5.0.1.1'));
    check('2: Cloudflare → relay (WARP), waarschijnlijk', soort('5.2.0.1') === 'relay/cloudflare/waarschijnlijk', soort('5.2.0.1'));
    check('2: DigitalOcean, M247, AWS → datacenter', soort('5.3.0.1').startsWith('datacenter/digitalocean') && soort('5.4.0.1').startsWith('datacenter/') && soort('5.8.0.1').startsWith('datacenter/aws'), `${soort('5.3.0.1')} ${soort('5.4.0.1')} ${soort('5.8.0.1')}`);
    check('2: lifecell → mobiel', soort('5.5.0.1').startsWith('mobiel/lifecell'), soort('5.5.0.1'));
    check('2: Proton → vpn', soort('5.7.0.1').startsWith('vpn/protonvpn'), soort('5.7.0.1'));
    const kyiv = netwerkSoort('5.6.0.1');
    check('2: Київстар zonder rDNS → thuis, maar alleen vermoeden (vast én mobiel)', kyiv.soort === 'thuis' && kyiv.zekerheid === 'vermoeden' && kyiv.dienst === 'kyivstar');
    const tel = netwerkSoort('81.82.0.1');
    check('2: Telenet → thuis, logo telenet, AS6848 in de uitleg', tel.soort === 'thuis' && tel.dienst === 'telenet' && tel.asn === 6848 && tel.bewijs.nl.includes('AS6848'));
    const ripe = netwerkSoort('193.0.6.139');
    check('2: onbekend netwerk → onbekend met naam uit de basis, vermoeden', ripe.soort === 'onbekend' && ripe.zekerheid === 'vermoeden' && ripe.bewijs.uk.includes('RIPE'));

    // ------------------------------------------------------------ 3. rDNS
    check('3: glasvezel/kabel/DSL uit de adresnaam', verbindingUitRdns('ip-91-183.static.ftth.proximus.be').verbinding === 'glas'
      && verbindingUitRdns('d51520001.access.telenet.be').verbinding === 'kabel' && verbindingUitRdns('host-1.adsl.ukrtel.net').verbinding === 'dsl'
      && verbindingUitRdns('vdsl-81-1.dyn.edpnet.net').verbinding === 'dsl');
    check('3: mobiel en VPN uit de adresnaam', verbindingUitRdns('mobile-46-211.kyivstar.net').mobiel && verbindingUitRdns('nl-ams-vpn-03.example.net').vpn && !verbindingUitRdns('mail.google.com').mobiel);
    check('3: geen naam → niets', verbindingUitRdns(null).verbinding === null && verbindingUitRdns('').mobiel === false);
    const prox = netwerkSoort('91.183.0.1', { rdns: 'ip-91-183.static.ftth.proximus.be' });
    check('3: Proximus + ftth → thuis, glas, bijna; uitleg noemt glasvezel', prox.soort === 'thuis' && prox.verbinding === 'glas' && prox.zekerheid === 'bijna' && prox.bewijs.nl.includes('glasvezel') && prox.bewijs.uk.includes('оптика'));
    const kyivMob = netwerkSoort('5.6.0.1', { rdns: 'mobile-5-6-0-1.kyivstar.net' });
    check('3: Київстар + mobiele naam → mobiel, bijna', kyivMob.soort === 'mobiel' && kyivMob.zekerheid === 'bijna' && kyivMob.dienst === 'kyivstar');
    const vpnNaam = netwerkSoort('193.0.6.139', { rdns: 'exit-node.vpn.example' });
    check('3: VPN-achtige naam op onbekend netwerk → vpn, maar slechts vermoeden', vpnNaam.soort === 'vpn' && vpnNaam.zekerheid === 'vermoeden');
    const metNaam = await netwerkVanVerzoek('81.82.0.1', { rdns: 'd51520001.access.telenet.be' });
    check('3: netwerkVanVerzoek gebruikt een meegegeven naam (geen DNS nodig)', metNaam.verbinding === 'kabel' && metNaam.zekerheid === 'bijna');
    const priveDns = await netwerkVanVerzoek('10.0.0.1');
    check('3: privé-adres → geen DNS-vraag, meteen «werk»', priveDns.soort === 'werk');

    // ------------------------------------------------------------ 4. tijdzone
    check('4: tijdzone ↔ land', tijdzoneVerschilt('Asia/Tokyo', 'BE') && !tijdzoneVerschilt('Europe/Brussels', 'BE') && !tijdzoneVerschilt('America/Onbekend', 'BE') && !tijdzoneVerschilt('Europe/Kyiv', null));
    const tz = netwerkSoort('81.82.0.1', { tijdzone: 'Asia/Tokyo' });
    check('4: andere tijdzone → alleen een vlag + uitleg, soort blijft thuis, nooit «zeker»', tz.tijdzoneVerschil === true && tz.soort === 'thuis' && tz.zekerheid !== 'zeker' && tz.bewijs.nl.includes('tijdzone'));
    check('4: dezelfde tijdzone → geen vlag', netwerkSoort('81.82.0.1', { tijdzone: 'Europe/Brussels' }).tijdzoneVerschil === undefined);
    const tzOnb = netwerkSoort('203.0.113.9', { tijdzone: 'Asia/Tokyo', land: 'BE' });
    check('4: alleen tijdzone, netwerk onbekend → vermoeden', tzOnb.zekerheid === 'vermoeden' && tzOnb.tijdzoneVerschil === true);

    // ------------------------------------------------------------ 5. logo's en teksten
    const heeftLogo = (k: string) => OFFICIEEL_SLEUTELS.has(k) || !!merkDef(k) || k in LOGOS || k in MERKEN;
    const diensten = [...new Set([...NETWERK_ASN.values()].map((r) => r.dienst).filter((d): d is string => !!d)), 'tor', 'icloud', 'mullvad'];
    const zonder = diensten.filter((d) => !heeftLogo(d));
    // Zonder logo (sites weigeren automatisch ophalen): monogram, net als bij de providers.
    check('5: elke dienst heeft een logo in het register (uitgezonderd bekende gaten)', zonder.every((d) => ['kyivstar', 'lifecell', 'm247', 'datacamp', 'leaseweb', 'microsoft'].includes(d)), zonder.join(', '));
    check('5: VPN-, Tor-, relay- en Starlink-logo\'s zijn er echt', ['mullvad', 'nordvpn', 'protonvpn', 'tor', 'icloud', 'cloudflare', 'starlink', 'digitalocean', 'aws', 'hetzner', 'ovh'].every(heeftLogo), ['mullvad', 'nordvpn', 'protonvpn', 'tor', 'icloud', 'cloudflare', 'starlink', 'digitalocean', 'aws', 'hetzner', 'ovh'].filter((d) => !heeftLogo(d)).join(', '));
    const alle = [tor, apple, mul, kyiv, tel, ripe, prox, kyivMob, vpnNaam, tz, niets];
    check('5: elke uitleg in het Oekraïens én Nederlands, zonder Engelse standaardzinnen', alle.every((a) => /[а-яіїєґ]/i.test(a.bewijs.uk) && a.bewijs.nl.length > 5 && !/\b(the|address|network is)\b/i.test(a.bewijs.nl + a.bewijs.uk)));

    // ------------------------------------------------------------ 6. BYOS
    const bron = readFileSync('backend/geo/netwerk.ts', 'utf8').replace(/\/\/.*$/gm, '');
    check('6: geen fetch/http naar buiten; alleen lokale bestanden en de resolver van de server', !/fetch\(|https?:\/\/|from ['"]node:https?['"]/.test(bron));
  } finally {
    if (oud === undefined) delete process.env.MIJN_RUIMTE_GEO_MAP; else process.env.MIJN_RUIMTE_GEO_MAP = oud;
    rmSync(map, { recursive: true, force: true });
  }
  return einde();
}
