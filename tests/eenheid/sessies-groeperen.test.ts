// Sessies per fysiek apparaat: zelfde UA + netwerk = één apparaat; IPv4 + IPv6 van één dual-stack toestel samen; vreemde toestellen apart.
import { groepeerPerApparaat, intrekbaarOpApparaat, ipFamilie, landCode, netwerk } from '../../src/sessies/groeperen';
import type { SecuritySession } from '../../src/SecuritySessionsPanel';
import { checker } from './hulp/nep-google';

export async function main(): Promise<number> {
  const { check, einde } = checker('sessies-groeperen');
  const NU = Date.now();
  const WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
  const IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';
  let n = 0;
  const s = (o: Partial<SecuritySession>): SecuritySession => ({ id: `s${++n}`, fingerprint: `f${n}`, kind: 'service', service: 'mail', createdAt: NU - 3600e3, lastSeenAt: NU - 60e3, expiresAt: NU + 86400e3, ip: '81.82.1.10', userAgent: WIN, deviceLabel: '', browser: 'Chrome', browserVersion: '141', os: 'Windows 11', osVersion: '', deviceType: 'Desktop', approximateLocation: { city: 'Antwerpen', country: 'BE' }, authMethod: 'google', current: false, ...o });

  check('IP-familie: v4, v6, v4-in-v6, onbekend', ipFamilie('81.82.1.10') === 'v4' && ipFamilie('2a02:1810:1:2::5') === 'v6' && ipFamilie('::ffff:10.0.0.1') === 'v4' && ipFamilie('unknown') === 'onbekend');
  check('IPv6 /64: wisselend einde → hetzelfde netwerk', netwerk('2a02:1810:a:b:1111:2222:3333:4444') === netwerk('2a02:1810:a:b::9'));
  check('landcode: XX/T1/onzin → leeg', landCode('be') === 'BE' && landCode('XX') === '' && landCode('T1') === '' && landCode('Belgium') === '');

  const groepen = groepeerPerApparaat([
    s({ service: 'mail', current: true }),
    s({ service: 'identity', kind: 'tab', authMethod: 'passkey' }),
    s({ service: 'mcp', ip: '2a02:1810:a:b:1111:2222:3333:4444', authMethod: 'passkey', lastSeenAt: NU - 120e3 }), // zelfde pc via IPv6
    s({ kind: 'remembered', service: 'identity' }),
    s({ userAgent: IOS, browser: 'Safari', os: 'iOS', deviceType: 'Mobile', ip: '2a02:a000::1', approximateLocation: { city: 'Gent', country: 'BE' } }),
    s({ ip: '203.0.113.7', approximateLocation: { city: 'Kyiv', country: 'UA' }, lastSeenAt: NU - 5 * 86400e3 }), // zelfde UA, ander land: vreemd → apart
  ]);
  check('drie apparaten (pc dual-stack, iPhone, pc in Kyiv apart)', groepen.length === 3, groepen.map((g) => `${g.os}@${g.ipv4.join('/')}|${g.ipv6.join('/')}`).join(' ; '));
  const pc = groepen[0];
  check('dit apparaat bovenaan, met IPv4 én IPv6', pc.huidig && pc.ipv4.join() === '81.82.1.10' && pc.ipv6.length === 1, JSON.stringify({ v4: pc.ipv4, v6: pc.ipv6 }));
  check('diensten en methoden verzameld (tab telt niet als aanmeldmethode)', pc.diensten.sort().join() === 'identity,mail,mcp' && pc.methoden.sort().join() === 'google,passkey', JSON.stringify(pc.methoden));
  check('«Завершити всі на цьому пристрої»: de huidige sessie blijft', intrekbaarOpApparaat(pc).length === pc.sessies.length - 1 && intrekbaarOpApparaat(pc).every((x) => !x.current));
  check('apparaat in Kyiv staat apart (vreemd toestel niet verstopt)', groepen.some((g) => g.plaats?.country === 'UA' && !g.huidig && g.sessies.length === 1));

  // twee v6-kandidaten → niet raden, niet samenvoegen
  const dubbel = groepeerPerApparaat([s({ ip: '81.82.1.10' }), s({ ip: '2a02:1::1' }), s({ ip: '2a02:2::1' })]);
  check('twijfel (twee IPv6-netwerken) → niets samengevoegd', dubbel.length === 3);
  check('lege lijst → geen apparaten', groepeerPerApparaat([]).length === 0);
  return einde();
}
