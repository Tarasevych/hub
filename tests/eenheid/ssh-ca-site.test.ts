// SSH-CA beheer, kant van de site (18.10.2026): rechten (niet-eigenaar / zonder ssh.host / zonder passkey / agent → 403),
// passkey-challenge met de actie erin (echte WebAuthn-handtekeningen via nep-passkey), wat er naar root gaat, intrekken,
// uitgifte met 5–60 min en principals per rol. Root zelf: ssh-ca-beheer.test.ts.
import { randomBytes } from 'node:crypto';
import * as kern from '../../deploy/goedkeuring/webauthn-kern.mjs';
import { bevestig, nieuwePasskey, registreer, type NepPasskey } from './hulp/nep-toegangssleutel';
import { checker } from './hulp/nep-google';

const RP = 'tarasevych.com'; const ORIGIN = 'https://admin.tarasevych.com';
const TAB = 'b'.repeat(48);

export async function main(): Promise<number> {
  const { check, einde } = checker('ssh-ca-site');
  const sb = await import('../../backend/ssh-ca-beheer');
  const { uitgeven, parseUitgifte } = await import('../../backend/ssh-ca');
  const { TechFout } = await import('../../backend/tech-profiel');
  const { sshCaRoutes } = await import('../../backend/ssh-ca-routes');
  const { agentRouteVerboden } = await import('../../backend/agent-namens');
  const { principalsVoor, minutenUit, SSH_CA_PRINCIPALS_PER_ROL } = await import('../../shared/ssh-ca');

  const eigenaarMail = process.env.OWNER_EMAIL || 'eigenaar@test.invalid';
  const eigenaar = { id: 'u-eig', email: eigenaarMail, role: 'owner' };
  const beheerder = { id: 'u-beh', email: 'beheerder@example.com', role: 'admin' };
  const metHost = { id: 'act-1', mogelijkheden: ['terminal.servers', 'ssh.host'], rollen: ['eigenaar'] };
  const zonderHost = { id: 'act-2', mogelijkheden: ['terminal.servers'], rollen: ['beheerder'] };

  const pk: NepPasskey = nieuwePasskey('es256', 1);
  const reg = kern.verifieerRegistratie({ ...registreer(pk, 'c'), verwachteUitdaging: 'c', rpId: RP, origins: [ORIGIN] });
  if (!reg.ok) throw new Error('registratie');
  const sleutel = { credentialId: reg.credentialId, alg: reg.alg, jwk: reg.jwk, label: 'telefoon', vingerafdruk: reg.vingerafdruk, toegevoegd: new Date().toISOString(), door: 'test' };
  const uitdagingen = new Map<string, { userId: string; onderwerp: string; nonce: string; verloopt: number; uitdaging: string; gebruikt: boolean }>();
  let teller = 0;
  const pkDeps = (sleutels: unknown[] = [sleutel]) => ({
    sleutels: async () => ({ rpId: RP, origins: [ORIGIN], sleutels }),
    maak: async (userId: string, onderwerp: string, velden: Record<string, unknown>) => {
      const id = `00000000-0000-4000-8000-${String(++teller).padStart(12, '0')}`;
      const nonce = randomBytes(32).toString('base64url'); const verloopt = Date.now() + 240_000;
      const uitdaging = kern.uitdagingVoor('ssh-ca', { ...velden, nonce, verloopt } as never);
      uitdagingen.set(id, { userId, onderwerp, nonce, verloopt, uitdaging, gebruikt: false });
      return { id, nonce, verloopt, uitdaging };
    },
    verbruik: async (userId: string, id: unknown) => {
      const u = uitdagingen.get(String(id));
      if (!u || u.gebruikt || u.userId !== userId) throw new Error('UITDAGING_ONGELDIG');
      u.gebruikt = true;
      return u;
    },
    opties: (uitdaging: string) => ({ challenge: uitdaging, rpId: RP, userVerification: 'required' }),
    assertie: (v: unknown) => { if (!v || typeof v !== 'object') throw new Error('ASSERTIE_ONGELDIG'); return v as never; },
  });
  const ioVan = (antwoord: (body: Record<string, unknown>) => Record<string, unknown> | null) => {
    const geschreven: Record<string, unknown>[] = []; const log: string[] = [];
    let laatste: Record<string, unknown> | null = null;
    return {
      geschreven, log,
      schrijf: async (_id: string, body: string) => { laatste = JSON.parse(body); geschreven.push(laatste!); },
      wis: async () => { log.push('wis'); },
      start: async () => { log.push('start'); },
      lees: async (naam: string) => {
        if (naam === 'beheer-status.json') return JSON.stringify({ ca: true, sshdVertrouwt: true, schakelaar: false, vinger: 'SHA256:' + 'A'.repeat(43), account: 'beheer', principals: ['beheer'] });
        if (!laatste || naam !== `beheer-${laatste.id}.json`) return null;
        const a = antwoord(laatste); return a ? JSON.stringify({ id: laatste.id, ...a }) : null;
      },
    };
  };
  const code = async (f: () => Promise<unknown>) => { try { await f(); return 'OK'; } catch (e) { return e instanceof TechFout ? `${e.code}:${e.status}` : `ANDERS:${(e as Error).message}`; } };
  const snel = { wachtMs: 300, slaapMs: 5 };
  const okIo = () => ioVan(() => ({ ok: true, code: 'OK', stand: { ca: true, sshdVertrouwt: true, schakelaar: true } }));

  // ------------------------------------------------------------------ rechten
  check('stand: niet-eigenaar → 403 OWNER_REQUIRED (ook met ssh.host in de activering)', await code(() => sb.stand(beheerder, metHost, okIo(), false)) === 'OWNER_REQUIRED:403');
  check('stand: eigenaar zonder ssh.host in dit tabblad → 403', await code(() => sb.stand(eigenaar, zonderHost, okIo(), false)) === 'TECH_SSH_CA_VEREIST:403');
  check('stand: eigenaar zonder actieve activering → 403', await code(() => sb.stand(eigenaar, null, okIo(), false)) === 'TECH_SSH_CA_VEREIST:403');
  const st = await sb.stand(eigenaar, metHost, okIo(), false);
  check('stand: eigenaar met ssh.host leest de stand van root', st.stand?.ca === true && st.stand.sshdVertrouwt === true && st.stand.schakelaar === false);

  check('uitdaging: niet-eigenaar → 403', await code(() => sb.uitdaging(beheerder, metHost, 'inrichten', pkDeps())) === 'OWNER_REQUIRED:403');
  check('uitdaging: alleen voor inrichten/aan (uit/ontmantelen hebben geen root-passkey nodig)', await code(() => sb.uitdaging(eigenaar, metHost, 'uit', pkDeps())) === 'SSH_CA_ACTIE:400');
  check('uitdaging: zonder passkey op de server → 409 GEEN_PASSKEY', await code(() => sb.uitdaging(eigenaar, metHost, 'inrichten', pkDeps([]))) === 'GEEN_PASSKEY:409');

  const io0 = okIo();
  check('inrichten zonder passkey → 403 SSH_CA_PASSKEY_VEREIST, niets naar root', await code(() => sb.beheer(eigenaar, metHost, { actie: 'inrichten' }, io0, pkDeps(), snel)) === 'SSH_CA_PASSKEY_VEREIST:403' && io0.geschreven.length === 0);
  const ioAan = okIo();
  check('aan zonder passkey → 403, niets naar root', await code(() => sb.beheer(eigenaar, metHost, { actie: 'aan' }, ioAan, pkDeps(), snel)) === 'SSH_CA_PASSKEY_VEREIST:403' && ioAan.geschreven.length === 0);
  check('beheer: niet-eigenaar → 403 (ook met passkey-velden)', await code(() => sb.beheer(beheerder, metHost, { actie: 'uit' }, okIo(), pkDeps(), snel)) === 'OWNER_REQUIRED:403');

  // Vreemde passkey (niet in het root-bestand).
  const c1 = await sb.uitdaging(eigenaar, metHost, 'inrichten', pkDeps());
  const io1 = okIo();
  const vreemd = nieuwePasskey();
  check('inrichten met een onbekende passkey → 403 PASSKEY_SLEUTEL_ONBEKEND, niets naar root', await code(() => sb.beheer(eigenaar, metHost, { actie: 'inrichten', uitdagingId: c1.uitdagingId, assertie: bevestig(vreemd, String((c1.publicKey as { challenge: string }).challenge)) }, io1, pkDeps(), snel)) === 'PASSKEY_SLEUTEL_ONBEKEND:403' && io1.geschreven.length === 0);
  // Challenge voor «aan» gebruikt voor «inrichten».
  const cAan = await sb.uitdaging(eigenaar, metHost, 'aan', pkDeps());
  check('challenge van «aan» telt niet voor «inrichten» → 403', await code(() => sb.beheer(eigenaar, metHost, { actie: 'inrichten', uitdagingId: cAan.uitdagingId, assertie: bevestig(pk, String((cAan.publicKey as { challenge: string }).challenge)) }, okIo(), pkDeps(), snel)) === 'UITDAGING_ONGELDIG:403');
  // Geldig.
  const c2 = await sb.uitdaging(eigenaar, metHost, 'inrichten', pkDeps());
  const io2 = okIo();
  const ok2 = await sb.beheer(eigenaar, metHost, { actie: 'inrichten', uitdagingId: c2.uitdagingId, assertie: bevestig(pk, String((c2.publicKey as { challenge: string }).challenge)) }, io2, pkDeps(), snel);
  const b2 = io2.geschreven[0] || {};
  check('inrichten met de passkey van de eigenaar: verzoek met doel ssh-ca, nonce, vervaltijd en assertie naar root; unit gestart', ok2.ok === true && b2.actie === 'inrichten' && b2.doel === 'ssh-ca' && typeof b2.nonce === 'string' && typeof b2.verloopt === 'number' && !!b2.assertie && io2.log.includes('start'));
  check('dezelfde challenge werkt maar één keer', await code(() => sb.beheer(eigenaar, metHost, { actie: 'inrichten', uitdagingId: c2.uitdagingId, assertie: bevestig(pk, String((c2.publicKey as { challenge: string }).challenge)) }, okIo(), pkDeps(), snel)) === 'UITDAGING_ONGELDIG:403');
  const ioUit = okIo();
  const uit = await sb.beheer(eigenaar, metHost, { actie: 'uit' }, ioUit, pkDeps(), snel);
  check('uit: zonder root-passkey (veilige richting), alleen {id, actie}', uit.ok === true && Object.keys(ioUit.geschreven[0]).sort().join(',') === 'actie,id');
  check('actie «status» of onbekend via beheer → SSH_CA_ACTIE', await code(() => sb.beheer(eigenaar, metHost, { actie: 'rm -rf /' }, okIo(), pkDeps(), snel)) === 'SSH_CA_ACTIE:400');
  const lieg = await sb.beheer(eigenaar, metHost, { actie: 'uit' }, ioVan(() => ({ ok: true, code: 'IETS_ANDERS' })), pkDeps(), snel);
  check('root-antwoord met onbekende code telt niet als gelukt', lieg.ok === false && lieg.code === 'SSH_CA_CONTROLE');
  const stil = ioVan(() => null);
  check('geen antwoord van root → 504 en verzoek teruggenomen', await code(() => sb.beheer(eigenaar, metHost, { actie: 'uit' }, stil, pkDeps(), { wachtMs: 30, slaapMs: 5 })) === 'SSH_CA_GEEN_ANTWOORD:504' && stil.log.includes('wis'));
  const fout = await sb.beheer(eigenaar, metHost, { actie: 'ontmantelen' }, ioVan(() => ({ ok: false, code: 'SSH_CA_SSHD_ONGELDIG', uk: 'sshd -t відхилив', nl: 'sshd -t keurde af', detail: 'line 1: Bad configuration option' })), pkDeps(), snel);
  check('sshd -t-weigering van root komt met tekst en detail terug', fout.ok === false && fout.code === 'SSH_CA_SSHD_ONGELDIG' && /sshd -t/.test(String(fout.uk)) && /Bad configuration/.test(String(fout.detail)));

  // ------------------------------------------------------------------ intrekken
  const gemarkeerd: number[][] = [];
  const db = { bekend: async (s: number[]) => s.filter((n) => n < 100), markeer: async (s: number[]) => { gemarkeerd.push(s); } };
  check('intrekken: ongeldige series → SSH_CA_SERIE', await code(() => sb.intrekken(eigenaar, metHost, { series: ['1; id'] }, okIo(), snel, db)) === 'SSH_CA_SERIE:400' && await code(() => sb.intrekken(eigenaar, metHost, { series: [] }, okIo(), snel, db)) === 'SSH_CA_SERIE:400');
  check('intrekken: serie die de site niet uitgaf → 404, niets naar root', await code(() => sb.intrekken(eigenaar, metHost, { series: [500] }, okIo(), snel, db)) === 'SSH_CA_SERIE_ONBEKEND:404');
  check('intrekken: niet-eigenaar → 403', await code(() => sb.intrekken(beheerder, metHost, { series: [3] }, okIo(), snel, db)) === 'OWNER_REQUIRED:403');
  const ioT = okIo();
  const t = await sb.intrekken(eigenaar, metHost, { series: [3, 3, 4], reden: 'laptop kwijt\n' }, ioT, snel, db);
  check('intrekken: series naar root (dubbel weg), daarna in de database gemarkeerd', t.ok && JSON.stringify(ioT.geschreven[0].series) === '[3,4]' && ioT.geschreven[0].actie === 'intrekken' && JSON.stringify(gemarkeerd[0]) === '[3,4]');

  // ------------------------------------------------------------------ uitgifte 5–60 min, principals per rol
  check('principals per rol: alleen eigenaar → beheer; andere rollen niets', JSON.stringify(principalsVoor(['eigenaar'])) === '["beheer"]' && principalsVoor(['beheerder', 'ontwikkelaar']).length === 0 && Object.keys(SSH_CA_PRINCIPALS_PER_ROL).join() === 'eigenaar');
  check('minuten: 5–60, standaard 60', minutenUit(undefined) === 60 && minutenUit(5) === 5 && minutenUit('30') === 30 && minutenUit(4) === null && minutenUit(61) === null && minutenUit(7.5) === null);
  const pubVast = 'ssh-ed25519 ' + 'A'.repeat(68);
  const cert = 'ssh-ed25519-cert-v01@openssh.com ' + 'B'.repeat(80);
  const vinger = 'SHA256:' + 'C'.repeat(43);
  const gezien: string[] = [];
  const tio = { schakelaar: async () => true, schrijf: async (_i: string, b: string) => { gezien.push(b); }, wis: async () => undefined, start: async () => undefined,
    lees: async () => JSON.stringify({ ok: true, code: 'SSH_CA_OK', cert, geldigTot: '2026-10-18T10:00:00', vinger, principal: 'beheer', principals: ['beheer'], minuten: 15, serie: 7 }) };
  const u15 = await uitgeven({ id: 'u1', email: eigenaarMail }, TAB, pubVast, tio, metHost, { wachtMs: 200, slaapMs: 5, minuten: 15 });
  const lb = JSON.parse(gezien[0]);
  check('uitgifte 15 min: verzoek met minuten en toegang [beheer]; antwoord met serie', u15.minuten === 15 && u15.serie === 7 && lb.minuten === 15 && JSON.stringify(lb.toegang) === '["beheer"]' && !('principal' in lb));
  check('uitgifte 61 min → SSH_CA_DUUR, niets naar root', await code(() => uitgeven({ id: 'u1' }, TAB, pubVast, { ...tio, schrijf: async () => { throw new Error('mag niet'); } }, metHost, { minuten: 61 })) === 'SSH_CA_DUUR:400');
  check('antwoord van root met meer principals of andere duur dan gevraagd → geweigerd', !parseUitgifte(JSON.stringify({ ok: true, code: 'SSH_CA_OK', cert, geldigTot: '2026-10-18T10:00:00', vinger, principal: 'beheer', principals: ['beheer', 'root'], minuten: 15 }), { minuten: 15, principals: ['beheer'] }).ok
    && !parseUitgifte(JSON.stringify({ ok: true, code: 'SSH_CA_OK', cert, geldigTot: '2026-10-18T10:00:00', vinger, principal: 'beheer', minuten: 60 }), { minuten: 15 }).ok);

  // ------------------------------------------------------------------ routes: agent, stap-op, niet-eigenaar
  const routes = Object.keys(sshCaRoutes(async () => ({ errorCode: 'X' }), {}));
  check('alle SSH-CA-routes zijn voor agents verboden (AGENT_VERBODEN)', routes.length >= 6 && routes.every((r) => agentRouteVerboden(r)), routes.join(', '));
  const roep = async (sessie: unknown, route: string, body: Record<string, unknown>, stepUp?: () => Promise<unknown>) => {
    const r = sshCaRoutes(async () => sessie as never, stepUp ? { stepUp: stepUp as never } : {});
    const res = await (r[route][0] as unknown as (ctx: unknown) => Promise<{ statusCode: number; body: string }>)({ event: {}, body });
    let foutcode = ''; try { const j = JSON.parse(res.body); foutcode = String(j.error || j.code || j.errorCode || ''); } catch { /* */ }
    return { status: res.statusCode, fout: foutcode };
  };
  const agent = await roep({ errorCode: 'AGENT_NIET_TOEGESTAAN' }, 'POST /api/ssh-ca/beheer', { actie: 'uit' });
  check('agent (namens-sessie) → 403 AGENT_NIET_TOEGESTAAN', agent.status === 403, JSON.stringify(agent));
  const zonderSu = await roep({ user: { ...eigenaar, status: 'approved' }, service: 'admin' }, 'POST /api/ssh-ca/beheer', { actie: 'uit', tabContext: TAB });
  check('zonder stap-op (verse bevestiging) → 403', zonderSu.status === 403 && /STEP_UP/.test(zonderSu.fout), JSON.stringify(zonderSu));
  const suWeiger = await roep({ user: { ...eigenaar, status: 'approved' }, service: 'admin' }, 'POST /api/ssh-ca/intrekken', { series: [1], tabContext: TAB }, async () => ({ statusCode: 403, headers: {}, body: JSON.stringify({ error: 'STEP_UP_REQUIRED' }) }));
  check('stap-op geweigerd → 403', suWeiger.status === 403);
  const nietEig = await roep({ user: { ...beheerder, status: 'approved' }, service: 'admin' }, 'POST /api/ssh-ca/stand', { tabContext: 'kort' });
  check('niet-eigenaar via de route → 403 OWNER_REQUIRED', nietEig.status === 403 && nietEig.fout === 'OWNER_REQUIRED', JSON.stringify(nietEig));
  const geenTab = await roep({ user: { ...eigenaar, status: 'approved' }, service: 'admin' }, 'POST /api/ssh-ca/lijst', { tabContext: 'kort' });
  check('eigenaar zonder geldige activering in dit tabblad → 403', geenTab.status === 403 && geenTab.fout === 'TECH_SSH_CA_VEREIST', JSON.stringify(geenTab));
  const nietAan = await roep({ errorCode: 'OWNER_SESSION_REQUIRED' }, 'POST /api/ssh-ca/stand', {});
  check('niet aangemeld → 401', nietAan.status === 401);

  // ------------------------------------------------------------------ database (0069): vastleggen → lijst → intrekken
  if (process.env.DATABASE_URL) {
    const { vastleggen } = await import('../../backend/ssh-ca');
    const { getPool, closePool } = await import('../../server/platform/pg');
    const serie = 900000000 + Math.floor(Math.random() * 1e6);
    try {
      await vastleggen({ id: 'u-eig', email: eigenaarMail }, { cert, geldigTot: '', vinger, principal: 'beheer', principals: ['beheer'], minuten: 15, serie }, 'act-1');
      const l1 = (await sb.lijst(eigenaar, metHost)).certificaten.find((c) => c.serie === serie);
      check('0069: uitgifte vastgelegd (serie, door, principals, 15 min, actief, geen certificaat)', !!l1 && l1.door === eigenaarMail && l1.minuten === 15 && l1.principals.join() === 'beheer' && l1.actief && Math.abs(Date.parse(l1.geldigTot) - Date.parse(l1.aangemaakt) - 15 * 60000) < 2000, JSON.stringify(l1));
      const kolommen = (await getPool('systeem').query(`SELECT column_name FROM information_schema.columns WHERE table_schema='app' AND table_name='ssh_ca_certificaten'`)).rows.map((r) => r.column_name);
      check('0069: geen kolom voor het certificaat zelf', !kolommen.some((k) => /cert/.test(k)), kolommen.join());
      const r = await sb.intrekken(eigenaar, metHost, { series: [serie], reden: 'test' }, okIo(), snel);
      const l2 = (await sb.lijst(eigenaar, metHost)).certificaten.find((c) => c.serie === serie);
      check('0069: intrekken markeert de rij (wanneer, door wie, reden), niet meer actief', r.ok && !!l2?.ingetrokken && l2.ingetrokkenDoor === eigenaarMail && l2.reden === 'test' && !l2.actief);
      check('0069: tweede keer intrekken → onbekend (al ingetrokken)', await code(() => sb.intrekken(eigenaar, metHost, { series: [serie] }, okIo(), snel)) === 'SSH_CA_SERIE_ONBEKEND:404');
      const doel = (await getPool('systeem').query(`SELECT pg_get_constraintdef(oid) d FROM pg_constraint WHERE conname = 'goedkeur_uitdagingen_doel_check'`)).rows[0]?.d || '';
      check("0069: goedkeur_uitdagingen accepteert doel 'ssh-ca'", /'ssh-ca'/.test(doel), doel);
    } finally {
      await getPool('systeem').query(`DELETE FROM app.ssh_ca_certificaten WHERE serie = $1`, [serie]).catch(() => undefined);
      await closePool().catch(() => undefined);
    }
  }
  return einde();
}
