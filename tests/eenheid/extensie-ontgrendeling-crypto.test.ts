// Ontgrendeling van de browserextensie (v2, 0.6): server en extensie ondertekenen/controleren EXACT dezelfde tekst.
// Vaste testvector: vaste sleutel + vaste ontgrendeling → vaste canonieke tekst → vaste HMAC-SHA256 (hex). Dezelfde vector gaat door
// shared/extensie-ontgrendeling.ts (ontgrendelTekst), backend/connectors-crypto.ts (signOntgrendeling) en extension/shared.js
// (ontgrendelTekst + verifyOntgrendeling). Wijzigt iemand één kant, dan faalt deze test. v2 = v1 + regel «ruimte» na userId.
import { createHmac } from 'node:crypto';
import { signOntgrendeling } from '../../backend/connectors-crypto';
import { MAX_DUUR_MS, ontgrendelTekst, PRIVE_HOSTS, type Ontgrendeling } from '../../shared/extensie-ontgrendeling';
import * as extShared from '../../extension/shared.js';
import { checker } from './hulp/nep-google';

const basis = { gid: '00000000-0000-4000-8000-000000000001', agentId: '11111111-1111-4111-8111-111111111111', userId: 'gebruiker-1', iat: 1760000000000, exp: 1760003600000, nonce: 'AAECAwQFBgcICQoLDA0ODw' };
export const VECTOR = Object.freeze({
  /** 32 bytes 0x01..0x20, base64url (zoals de commandKey van een slot in de extensie). */
  sleutel: 'AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyA',
  grant: Object.freeze({ v: 2, ...basis, ruimte: 'technisch', caps: ['browser.screenshot', 'browser.read'], domeinen: ['mcp.tarasevych.com', 'admin.tarasevych.com'], lokaal: false }) as unknown as Ontgrendeling,
  tekst: 'mr-ontgrendeling-v2\n00000000-0000-4000-8000-000000000001\n11111111-1111-4111-8111-111111111111\ngebruiker-1\ntechnisch\nbrowser.read,browser.screenshot\nadmin.tarasevych.com,mcp.tarasevych.com\n0\n1760000000000\n1760003600000\nAAECAwQFBgcICQoLDA0ODw',
  sig: '1283c532cdcb4fcfe26865253f5fef2007d096ba74d944941f6b4b1112177420',
  /** Zelfde, maar lokaal: true. */
  sigLokaal: '0e5c75debe0340bfd78c1f362da05484786184257041a8f101819f2f97149cb0',
  /** Privé-slot. */
  prive: Object.freeze({ v: 2, ...basis, ruimte: 'prive', caps: ['browser.read', 'browser.navigate'], domeinen: ['mail.tarasevych.com', 'hub.tarasevych.com'], lokaal: false }) as unknown as Ontgrendeling,
  tekstPrive: 'mr-ontgrendeling-v2\n00000000-0000-4000-8000-000000000001\n11111111-1111-4111-8111-111111111111\ngebruiker-1\nprive\nbrowser.navigate,browser.read\nhub.tarasevych.com,mail.tarasevych.com\n0\n1760000000000\n1760003600000\nAAECAwQFBgcICQoLDA0ODw',
  sigPrive: 'bd661413ad16cb37ed42e4e4a0b84f6a79fa4bfdf3afa2635a95c1fb930ac13e',
});

export async function main(): Promise<number> {
  const { check, einde } = checker('extensie-ontgrendeling-crypto');
  const g = VECTOR.grant;
  check('shared ontgrendelTekst v2: vaste canonieke tekst (eerste regel mr-ontgrendeling-v2, ruimte na userId)', ontgrendelTekst(g) === VECTOR.tekst, JSON.stringify(ontgrendelTekst(g)));
  check('shared ontgrendelTekst: volgorde van caps/domeinen maakt niet uit', ontgrendelTekst({ ...g, caps: [...g.caps].reverse(), domeinen: [...g.domeinen].reverse() }) === VECTOR.tekst);
  check('signOntgrendeling (server): vaste hex van 64 tekens', signOntgrendeling(VECTOR.sleutel, g) === VECTOR.sig, signOntgrendeling(VECTOR.sleutel, g));
  check('signOntgrendeling = HMAC-SHA256(base64url-gedecodeerde sleutel, tekst)', createHmac('sha256', Buffer.from(VECTOR.sleutel, 'base64url')).update(VECTOR.tekst).digest('hex') === VECTOR.sig);
  check('lokaal maakt deel uit van de handtekening', signOntgrendeling(VECTOR.sleutel, { ...g, lokaal: true }) === VECTOR.sigLokaal && VECTOR.sigLokaal !== VECTOR.sig);
  check('prive-vector: vaste tekst en handtekening', ontgrendelTekst(VECTOR.prive) === VECTOR.tekstPrive && signOntgrendeling(VECTOR.sleutel, VECTOR.prive) === VECTOR.sigPrive);
  check('ruimte telt: zelfde grant met ruimte prive → andere handtekening', signOntgrendeling(VECTOR.sleutel, { ...g, ruimte: 'prive' }) !== VECTOR.sig);
  check('elk veld telt: ander gid/agent/gebruiker/exp/nonce/caps/domein/ruimte → andere handtekening',
    [{ gid: '00000000-0000-4000-8000-000000000002' }, { agentId: 'x' }, { userId: 'y' }, { exp: g.exp + 1 }, { iat: g.iat + 1 }, { nonce: 'AAECAwQFBgcICQoLDA0ODx' },
      { caps: ['browser.read'] }, { domeinen: ['mcp.tarasevych.com'] }, { ruimte: 'prive' }].every((d) => signOntgrendeling(VECTOR.sleutel, { ...g, ...d } as Ontgrendeling) !== VECTOR.sig));
  // 0.7.0 (zone E): beide ruimtes tot 366 dagen — de termijn is een keuze van de eigenaar (shared/extensie-matrix.ts).
  check('grenzen: technisch en prive ≤ 366 dagen (0.7.0); PRIVE_HOSTS zonder admin/api', MAX_DUUR_MS.technisch === 366 * 86_400_000 && MAX_DUUR_MS.prive === 366 * 86_400_000
    && !PRIVE_HOSTS.includes('admin.tarasevych.com') && !PRIVE_HOSTS.includes('api.tarasevych.com') && PRIVE_HOSTS.length === 8);

  // ---- extensie (extension/shared.js, agent X1): zelfde tekst en dezelfde controle
  const ext = extShared as unknown as {
    ontgrendelTekst?: (g: unknown) => string;
    verifyOntgrendeling?: (k: string, g: unknown, sig: string, eigen: { agentId: string; userId: string; ruimte?: string }, now?: number) => Promise<{ ok: boolean; code?: string }>;
  };
  if (typeof ext.ontgrendelTekst !== 'function' || typeof ext.verifyOntgrendeling !== 'function') {
    console.log('WAARSCHUWING extensie-ontgrendeling-crypto: extension/shared.js exporteert ontgrendelTekst/verifyOntgrendeling niet — extensiekant NIET gecontroleerd');
    return einde();
  }
  if (!ext.ontgrendelTekst(g).startsWith('mr-ontgrendeling-v2\n')) {
    console.log(`WAARSCHUWING extensie-ontgrendeling-crypto: extension/shared.js kent v2 nog niet (eerste regel: ${JSON.stringify(ext.ontgrendelTekst(g).split('\n')[0])}) — extensiekant NIET gecontroleerd`);
    return einde();
  }
  const eigen = { agentId: g.agentId, userId: g.userId, ruimte: 'technisch' };
  const nu = g.iat + 60_000;
  check('extensie ontgrendelTekst = shared ontgrendelTekst (vaste vector, technisch en prive)', ext.ontgrendelTekst(g) === VECTOR.tekst && ext.ontgrendelTekst(VECTOR.prive) === VECTOR.tekstPrive, JSON.stringify(ext.ontgrendelTekst(g)));
  const ok = await ext.verifyOntgrendeling(VECTOR.sleutel, g, VECTOR.sig, eigen, nu);
  check('extensie verifyOntgrendeling aanvaardt de handtekening van de server (technisch slot)', ok.ok === true, JSON.stringify(ok));
  const okPrive = await ext.verifyOntgrendeling(VECTOR.sleutel, VECTOR.prive, VECTOR.sigPrive, { ...eigen, ruimte: 'prive' }, nu);
  check('extensie verifyOntgrendeling aanvaardt de prive-handtekening (prive slot)', okPrive.ok === true, JSON.stringify(okPrive));
  const verkeerdSlot = await ext.verifyOntgrendeling(VECTOR.sleutel, VECTOR.prive, VECTOR.sigPrive, eigen, nu);
  check('extensie: prive-grant in het technische slot → geweigerd', verkeerdSlot.ok === false, JSON.stringify(verkeerdSlot));
  const v1 = await ext.verifyOntgrendeling(VECTOR.sleutel, { ...g, v: 1 }, VECTOR.sig, eigen, nu);
  check('extensie: v1 → geweigerd', v1.ok === false, JSON.stringify(v1));
  const vals = await ext.verifyOntgrendeling(VECTOR.sleutel, { ...g, caps: ['browser.read', 'browser.debug'] }, VECTOR.sig, eigen, nu);
  check('extensie: gewijzigde caps met de oude handtekening → geweigerd', vals.ok === false, JSON.stringify(vals));
  const anderAgent = await ext.verifyOntgrendeling(VECTOR.sleutel, g, VECTOR.sig, { ...eigen, agentId: '22222222-2222-4222-8222-222222222222' }, nu);
  check('extensie: ontgrendeling voor een andere koppeling → geweigerd', anderAgent.ok === false, JSON.stringify(anderAgent));
  const verlopen = await ext.verifyOntgrendeling(VECTOR.sleutel, g, VECTOR.sig, eigen, g.exp + 1);
  check('extensie: na exp → geweigerd', verlopen.ok === false, JSON.stringify(verlopen));
  const andereSleutel = await ext.verifyOntgrendeling(Buffer.alloc(32, 7).toString('base64url'), g, VECTOR.sig, eigen, nu);
  check('extensie: andere opdrachtsleutel → geweigerd', andereSleutel.ok === false, JSON.stringify(andereSleutel));
  // prive met admin.* (zelf ondertekend met de juiste sleutel): de extensie weigert op domein
  const priveAdmin = { ...VECTOR.prive, domeinen: ['admin.tarasevych.com'] } as Ontgrendeling;
  const pa = await ext.verifyOntgrendeling(VECTOR.sleutel, priveAdmin, signOntgrendeling(VECTOR.sleutel, priveAdmin), { ...eigen, ruimte: 'prive' }, nu);
  check('extensie: prive-grant met admin.tarasevych.com (geldig ondertekend) → geweigerd', pa.ok === false, JSON.stringify(pa));
  return einde();
}
