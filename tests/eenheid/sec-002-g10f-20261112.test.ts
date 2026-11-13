// SEC-002, groep g10f (12.11.2026): regressie- en bewijssuite voor de bevindingen van deze groep.
//   server-uitrol-06  root tekent een SSH-certificaat alleen met een passkey van de eigenaar over precies die sleutel
//   geheimen-03       SSH-CA-routes vragen de sterke bevestiging; één bevestiging = één certificaat
//   (de overige bevindingen volgen verderop in dit bestand; ai-mcp-04 en integraties-06 staan ook in
//    mcp-klant-stabiliteit-20261112.test.ts, integraties-10 in github-werkruimte-tak-20261112.test.ts,
//    integraties-13 in github-webhook-na-ontkoppelen-20261112.test.ts)
// Alle geheimen en sleutels hier zijn verzonnen.
import { spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { chmodSync, chownSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import * as kern from '../../deploy/goedkeuring/webauthn-kern.mjs';
import { bevestig, nieuwePasskey, registreer, type NepPasskey } from './hulp/nep-toegangssleutel';
import { checker } from './hulp/nep-google';

const lees = (pad: string) => readFileSync(pad, 'utf8');
const json = (pad: string) => { try { return JSON.parse(lees(pad)); } catch { return null; } };
const ALS_ROOT = process.getuid?.() === 0;
const NIEMAND = 65534;
const RP = 'tarasevych.com'; const ORIGIN = 'https://admin.tarasevych.com';

type Check = (naam: string, ok: boolean, info?: string) => void;

// ====================================================================================================================
// server-uitrol-06: het ECHTE root-script (als nobody, met testmappen) en de ECHTE passkey-hulp van root.
// SEC002_SSH_CA_SCRIPT=<pad> draait dezelfde proef tegen een andere versie van het script (bewijs «vóór de patch»).
// ====================================================================================================================
async function sshCaRoot(check: Check) {
  const BRON = resolve(process.env.SEC002_SSH_CA_SCRIPT || 'deploy/ssh-ca/mijn-ruimte-ssh-ca.sh');
  const HULP = resolve('deploy/goedkeuring/goedkeur-hulp.mjs');
  const w = mkdtempSync(join(tmpdir(), 'sec002-ssh-ca-'));
  const p = { ca: join(w, 'ca'), inbox: join(w, 'inbox'), werk: join(w, 'werk'), uit: join(w, 'uit'), status: join(w, 'status'), goed: join(w, 'goed'), rechten: join(w, 'rechten.json') };
  for (const d of [p.ca, p.inbox, p.werk, p.uit, p.status, p.goed, join(p.goed, 'staat')]) mkdirSync(d, { recursive: true });
  const sleutels = join(p.goed, 'goedkeur-passkeys.json');
  const passkey = join(w, 'passkey');
  writeFileSync(passkey, `#!/bin/bash\nexport GOEDKEUR_SLEUTELS="${sleutels}" GOEDKEUR_RECHTEN="${p.rechten}" GOEDKEUR_STAAT="${join(p.goed, 'staat')}" GOEDKEUR_INBOX="${p.goed}" GOEDKEUR_STATUS_DIR="${p.status}" GOEDKEUR_GROEP=nogroup\nexec "${process.execPath}" "${HULP}" "$@"\n`);
  chmodSync(passkey, 0o755);
  // Een kopie in de testmap: het script draait als nobody en moet het bestand kunnen lezen, waar het origineel ook staat.
  const SCRIPT = join(w, 'mijn-ruimte-ssh-ca.sh');
  writeFileSync(SCRIPT, lees(BRON));
  // De CA-sleutel hoeft voor deze proef niet echt te zijn: de passkey-controle komt vóór de handtekening.
  writeFileSync(join(p.ca, 'ca'), 'nep-ca-sleutel-voor-de-test\n');
  const eigen = (pad: string) => { if (ALS_ROOT) chownSync(pad, NIEMAND, NIEMAND); };
  if (ALS_ROOT) spawnSync('chown', ['-R', `${NIEMAND}:${NIEMAND}`, w]);
  const env = {
    ...process.env, MIJN_RUIMTE_SSH_CA_DIR: p.ca, MIJN_RUIMTE_SSH_CA_INBOX: p.inbox, MIJN_RUIMTE_SSH_CA_WERK: p.werk, MIJN_RUIMTE_SSH_CA_UIT: p.uit,
    MIJN_RUIMTE_SSH_CA_STATUS: p.status, MIJN_RUIMTE_SSH_CA_RECHTEN: p.rechten, MIJN_RUIMTE_SSH_CA_GROEP: 'nogroup',
    MIJN_RUIMTE_SSH_CA_PASSKEY: passkey, MIJN_RUIMTE_SSH_CA_SLEUTELS: sleutels,
  };
  const run = (...args: string[]) => spawnSync('bash', [SCRIPT, ...args], { encoding: 'utf8', env, ...(ALS_ROOT ? { uid: NIEMAND, gid: NIEMAND } : {}) });
  const zet = (pad: string, inhoud: string) => { writeFileSync(pad, inhoud); eigen(pad); };
  const rechten = (extra: Record<string, unknown> = {}) => zet(p.rechten, JSON.stringify({ 'ssh-ca': true, ...extra }));

  const eigenaar: NepPasskey = nieuwePasskey('es256', 1);
  const reg = kern.verifieerRegistratie({ ...registreer(eigenaar, 'c'), verwachteUitdaging: 'c', rpId: RP, origins: [ORIGIN] });
  if (!reg.ok) throw new Error('registratie');
  const sleutelRij = { credentialId: reg.credentialId, alg: reg.alg, jwk: reg.jwk, label: 'telefoon', vingerafdruk: reg.vingerafdruk, toegevoegd: new Date().toISOString(), door: 'test' };
  const sleutelbestand = (rijen: unknown[]) => zet(sleutels, JSON.stringify({ versie: 1, rpId: RP, origins: [ORIGIN], sleutels: rijen }));
  const pub = (teken: string) => `ssh-ed25519 ${teken.repeat(68)}`;
  /** Assertie zoals de browser van de eigenaar haar maakt voor (sleutel, principals, minuten). */
  const assertieVoor = (pk: NepPasskey, publiek: string, minuten: number, toegang = ['beheer']) => {
    const nonce = randomBytes(32).toString('base64url'); const verloopt = Date.now() + 240_000;
    const uitdaging = kern.uitdagingVoor('ssh-ca', { actie: kern.SSH_CA_TEKEN, sleutelHash: kern.sshCaSleutelHash(publiek), toegang, minuten, nonce, verloopt });
    return { nonce, verloopt, assertie: bevestig(pk, uitdaging) };
  };
  /** Verzoek zoals het in de inbox van de app ligt — door de site óf door een inbreker met de rechten van de app. */
  const teken = (body: Record<string, unknown>) => {
    const id = randomUUID();
    zet(join(p.inbox, `${id}.json`), JSON.stringify({ id, identiteit: 'eigenaar', ...body }));
    const r = run('tekenen', id);
    return { r, res: (json(join(p.uit, `${id}.json`)) || {}) as { ok?: boolean; code?: string }, id };
  };
  // Zonder /usr/bin/ssh-keygen op deze machine eindigt een toegelaten verzoek op SSH_CA_CONTROLE (de handtekening mislukt);
  // met ssh-keygen op SSH_CA_OK. In beide gevallen is het NIET bij de passkey-controle tegengehouden.
  const voorbijPasskey = (code?: string) => code === 'SSH_CA_OK' || code === 'SSH_CA_CONTROLE';

  try {
    sleutelbestand([sleutelRij]);
    rechten();
    const A = pub('A'), B = pub('B');

    // De aanval uit de bevinding: code met de rechten van de app legt zelf een verzoek in de inbox.
    const inbreker = teken({ publiek: B, minuten: 60, toegang: ['beheer'] });
    check('server-uitrol-06: een verzoek ZONDER passkey van de eigenaar wordt door root geweigerd (SSH_CA_PASSKEY), niet getekend',
      inbreker.res.ok === false && inbreker.res.code === 'SSH_CA_PASSKEY', `${inbreker.res.code} ${inbreker.r.stderr.slice(-200)}`);
    check('server-uitrol-06: de weigering staat in het root-journaal', /"code": ?"SSH_CA_PASSKEY"/.test(existsSync(join(p.status, 'gebeurtenissen.jsonl')) ? lees(join(p.status, 'gebeurtenissen.jsonl')) : ''));

    // De inbreker onderschept een echte bevestiging van de eigenaar (voor sleutel A) en hangt haar aan zijn eigen sleutel B.
    const voorA = assertieVoor(eigenaar, A, 15);
    const gekaapt = teken({ publiek: B, minuten: 15, toegang: ['beheer'], passkey: voorA });
    check('server-uitrol-06: een bevestiging voor sleutel A geeft geen certificaat voor sleutel B', gekaapt.res.code === 'SSH_CA_PASSKEY', String(gekaapt.res.code));
    const andereDuur = teken({ publiek: A, minuten: 60, toegang: ['beheer'], passkey: assertieVoor(eigenaar, A, 15) });
    check('server-uitrol-06: een bevestiging voor 15 minuten geeft geen certificaat van 60 minuten', andereDuur.res.code === 'SSH_CA_PASSKEY', String(andereDuur.res.code));
    const vreemd = teken({ publiek: A, minuten: 15, toegang: ['beheer'], passkey: assertieVoor(nieuwePasskey(), A, 15) });
    check('server-uitrol-06: een passkey die root niet kent telt niet', vreemd.res.code === 'SSH_CA_PASSKEY', String(vreemd.res.code));
    const beheerActie = (() => { const nonce = randomBytes(32).toString('base64url'); const verloopt = Date.now() + 240_000; return { nonce, verloopt, assertie: bevestig(eigenaar, kern.uitdagingVoor('ssh-ca', { actie: 'aan', nonce, verloopt })) }; })();
    const kruis = teken({ publiek: A, minuten: 15, toegang: ['beheer'], passkey: beheerActie });
    check('server-uitrol-06: een bevestiging voor «aan» (beheer) telt niet voor het tekenen', kruis.res.code === 'SSH_CA_PASSKEY', String(kruis.res.code));
    const zonderVelden = teken({ publiek: A, passkey: assertieVoor(eigenaar, A, 60) });
    check('server-uitrol-06: zonder expliciete duur en principals in het verzoek tekent root niet op standaardwaarden', zonderVelden.res.code === 'SSH_CA_PASSKEY', String(zonderVelden.res.code));

    // De echte weg: de eigenaar bevestigt precies deze sleutel en duur.
    const echt = assertieVoor(eigenaar, A, 15);
    const goed = teken({ publiek: A, minuten: 15, toegang: ['beheer'], passkey: echt });
    check('server-uitrol-06: met de passkey van de eigenaar over precies deze sleutel en duur gaat root door naar de handtekening',
      voorbijPasskey(goed.res.code), `${goed.res.code} ${goed.r.stderr.slice(-200)}`);
    const staat = json(join(p.goed, 'staat', 'staat.json')) as { nonces?: Record<string, number> } | null;
    check('server-uitrol-06: root heeft de nonce verbruikt', !!staat && Object.keys(staat.nonces || {}).length >= 1);
    const herhaal = teken({ publiek: A, minuten: 15, toegang: ['beheer'], passkey: echt });
    check('server-uitrol-06: dezelfde bevestiging werkt maar één keer (één bevestiging = één certificaat)', herhaal.res.code === 'SSH_CA_PASSKEY', String(herhaal.res.code));
    check('server-uitrol-06: het genormaliseerde controlebestand van root blijft niet achter', !readdirSync(p.werk).some((n) => n.endsWith('.passkey.json')), readdirSync(p.werk).join(','));

    // Site → root: de ECHTE site-functies (tekenUitdaging → passkey in de browser → uitgeven) leggen een verzoek in de inbox dat
    // het ECHTE root-script aanvaardt; met een assertie voor een andere sleutel weigert root. Zo rekenen site en root dezelfde challenge.
    {
      const ssh = await import('../../backend/ssh-ca');
      const metHost = { id: 'act-1', mogelijkheden: ['ssh.host'], rollen: ['eigenaar'] };
      const uitdagingen = new Map<string, { onderwerp: string; nonce: string; verloopt: number; gebruikt: boolean }>();
      let n = 0;
      const pkd = {
        sleutels: async () => ({ rpId: RP, origins: [ORIGIN], sleutels: [sleutelRij] }),
        maak: async (_u: string, onderwerp: string, velden: Record<string, unknown>) => {
          const id = `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`; const nonce = randomBytes(32).toString('base64url'); const verloopt = Date.now() + 240_000;
          uitdagingen.set(id, { onderwerp, nonce, verloopt, gebruikt: false });
          return { id, nonce, verloopt, uitdaging: kern.uitdagingVoor('ssh-ca', { ...velden, nonce, verloopt } as never) };
        },
        verbruik: async (_u: string, id: unknown) => { const c = uitdagingen.get(String(id)); if (!c || c.gebruikt) throw new Error('UITDAGING_ONGELDIG'); c.gebruikt = true; return c; },
        opties: (uitdaging: string) => ({ challenge: uitdaging }),
        assertie: (v: unknown) => v as never,
      };
      let laatste = '';
      const io = {
        schakelaar: async () => true, passkeyVereist: async () => true, wis: async () => undefined,
        schrijf: async (id: string, body: string) => { laatste = id; zet(join(p.inbox, `${id}.json`), body); },
        start: async () => { run('tekenen', laatste); },
        lees: async (id: string) => { try { return lees(join(p.uit, `${id}.json`)); } catch { return null; } },
      };
      const C = pub('C'), D = pub('D');
      const fout = async (f: () => Promise<unknown>) => { try { await f(); return 'OK'; } catch (e) { return String((e as { code?: string }).code || (e as Error).message); } };
      // Зауваження 1 (перевіряльник): op een ander subdomein (dev.*, terminal.*, mcp.*) slaagt de passkey in de browser wel, maar site
      // en root weigeren de assertie (ORIGIN_ONJUIST) — de challenge was dan al op en de mens zag alleen «Passkey не підтверджено».
      // Nu: vóór de challenge een duidelijke weigering SSH_CA_ORIGIN (geen challenge verbruikt), en de challenge noemt de origins.
      const vooraf = uitdagingen.size;
      const elders = await fout(() => (ssh.tekenUitdaging as (...a: unknown[]) => Promise<unknown>)({ id: 'u-eig' }, 'b'.repeat(48), C, 20, io, metHost, pkd, 'https://dev.tarasevych.com'));
      check('зауваження 1: aanvraag vanaf dev.* → SSH_CA_ORIGIN vóór de challenge (er wordt geen challenge aangemaakt of verbruikt)', elders === 'SSH_CA_ORIGIN' && uitdagingen.size === vooraf, `${elders} ${uitdagingen.size - vooraf}`);
      const opAdmin = await (ssh.tekenUitdaging as (...a: unknown[]) => Promise<{ origins?: string[] }>)({ id: 'u-eig' }, 'b'.repeat(48), C, 20, io, metHost, pkd, ORIGIN);
      check('зауваження 1: de challenge noemt de origins waar de passkey geldt (voor de browser)', JSON.stringify(opAdmin.origins) === JSON.stringify([ORIGIN]), JSON.stringify(opAdmin.origins));
      const devAssertie = bevestig(eigenaar, (opAdmin as unknown as { publicKey: { challenge: string } }).publicKey.challenge, { origin: 'https://dev.tarasevych.com' });
      const devUit = await fout(() => ssh.uitgeven({ id: 'u-eig' }, 'b'.repeat(48), C, io, metHost, { minuten: 20, wachtMs: 500, slaapMs: 50,
        passkey: (a) => ssh.tekenPasskeyUit({ id: 'u-eig' }, a, { uitdagingId: (opAdmin as unknown as { uitdagingId: string }).uitdagingId, assertie: devAssertie }, pkd as never) }));
      const certTekst = lees('src/ssh/SshCertificaat.tsx');
      check('зауваження 1: komt toch een assertie van een ander subdomein binnen, dan een eigen code met uitleg «alleen op admin/id» (geen algemene «Passkey не підтверджено»)',
        devUit === 'PASSKEY_ORIGIN_ONJUIST' && /PASSKEY_ORIGIN_ONJUIST: \[[^\]]*admin\.tarasevych\.com/.test(certTekst) && /SSH_CA_ORIGIN: \[[^\]]*admin\.tarasevych\.com/.test(certTekst), devUit);
      check('зауваження 1: de browser kijkt vóór de passkey zelf naar location.origin (ook voor SshBeheer via sshCertificaatAanvragen)',
        /c\.origins[\s\S]{0,120}location\.origin/.test(certTekst));
      const c = await ssh.tekenUitdaging({ id: 'u-eig', email: 'eigenaar@example.invalid' }, 'b'.repeat(48), C, 20, io, metHost, pkd as never);
      check('server-uitrol-06: de site vraagt de passkey (challenge voor deze sleutel en duur)', c.passkeyNodig === true && !!c.uitdagingId);
      const browser = bevestig(eigenaar, (c as { publicKey: { challenge: string } }).publicKey.challenge);
      const opRoot = await fout(() => ssh.uitgeven({ id: 'u-eig', email: 'eigenaar@example.invalid' }, 'b'.repeat(48), C, io, metHost, { minuten: 20, wachtMs: 3000, slaapMs: 50,
        passkey: (a) => ssh.tekenPasskeyUit({ id: 'u-eig' }, a, { uitdagingId: c.uitdagingId, assertie: browser }, pkd as never) }));
      check('server-uitrol-06: site → root met de passkey van de eigenaar: root komt voorbij de passkey-controle', opRoot === 'OK' || voorbijPasskey(opRoot), opRoot);
      const c2 = await ssh.tekenUitdaging({ id: 'u-eig' }, 'b'.repeat(48), C, 20, io, metHost, pkd as never);
      const anders = await fout(() => ssh.uitgeven({ id: 'u-eig' }, 'b'.repeat(48), D, io, metHost, { minuten: 20, wachtMs: 3000, slaapMs: 50,
        passkey: (a) => ssh.tekenPasskeyUit({ id: 'u-eig' }, a, { uitdagingId: c2.uitdagingId, assertie: bevestig(eigenaar, (c2 as { publicKey: { challenge: string } }).publicKey.challenge) }, pkd as never) }));
      check('server-uitrol-06: de site weigert zelf een bevestiging voor sleutel C bij een aanvraag voor sleutel D (niets naar root)', anders === 'UITDAGING_ONGELDIG', anders);
      const zonder = await fout(() => ssh.uitgeven({ id: 'u-eig' }, 'b'.repeat(48), D, io, metHost, { minuten: 20, wachtMs: 500, slaapMs: 50 }));
      check('server-uitrol-06: zonder passkey stuurt de site niets naar root (SSH_CA_PASSKEY_VEREIST)', zonder === 'SSH_CA_PASSKEY_VEREIST', zonder);
    }

    // De app mag passkeys laten intrekken (veilige richting): een leeg sleutelbestand zet de controle NIET uit.
    sleutelbestand([]);
    const leeg = teken({ publiek: A, minuten: 15, toegang: ['beheer'] });
    check('server-uitrol-06: zijn alle passkeys ingetrokken, dan weigert root (geen stille terugval op «zonder passkey»)', leeg.res.code === 'SSH_CA_PASSKEY', String(leeg.res.code));
    sleutelbestand([sleutelRij]);

    // De schakelaar van root: alleen exact false zet de controle uit; "false" (tekst), 0 of null niet.
    for (const waarde of ['false', 0, null]) {
      rechten({ 'ssh-ca-teken-passkey': waarde });
      const r = teken({ publiek: A, minuten: 15, toegang: ['beheer'] });
      check(`server-uitrol-06: "ssh-ca-teken-passkey": ${JSON.stringify(waarde)} is geen uit`, r.res.code === 'SSH_CA_PASSKEY', String(r.res.code));
    }
    rechten({ 'ssh-ca-teken-passkey': false });
    const bewustUit = teken({ publiek: A, minuten: 15, toegang: ['beheer'] });
    check('server-uitrol-06: alleen root kan de controle uitzetten ("ssh-ca-teken-passkey": false) — dan tekent hij als voorheen', voorbijPasskey(bewustUit.res.code), String(bewustUit.res.code));
    rmSync(sleutels, { force: true });
    rechten({ 'ssh-ca-teken-passkey': true });
    const altijd = teken({ publiek: A, minuten: 15, toegang: ['beheer'] });
    check('server-uitrol-06: "ssh-ca-teken-passkey": true eist de passkey ook zonder sleutelbestand', altijd.res.code === 'SSH_CA_PASSKEY', String(altijd.res.code));
    rechten();
    const zonderInfra = teken({ publiek: A, minuten: 15, toegang: ['beheer'] });
    check('server-uitrol-06: een installatie zonder passkey-infrastructuur (geen sleutelbestand) blijft werken als voorheen', voorbijPasskey(zonderInfra.res.code), String(zonderInfra.res.code));
    // De schakelaar ssh-ca zelf gaat nog steeds vóór alles.
    zet(p.rechten, JSON.stringify({ 'ssh-ca': false }));
    check('server-uitrol-06: schakelaar ssh-ca uit → SSH_CA_UIT, ook met een geldige passkey', teken({ publiek: A, minuten: 15, toegang: ['beheer'], passkey: assertieVoor(eigenaar, A, 15) }).res.code === 'SSH_CA_UIT');
  } finally {
    rmSync(w, { recursive: true, force: true });
  }

  // De kern: de challenge bindt sleutel, principals en duur; strikte typen.
  const basis = { actie: kern.SSH_CA_TEKEN, sleutelHash: kern.sshCaSleutelHash(pub('A')), toegang: ['beheer'], minuten: 15, nonce: 'n'.repeat(43), verloopt: Date.now() + 60_000 };
  const u = (v: Record<string, unknown>) => { try { return kern.uitdagingVoor('ssh-ca', { ...basis, ...v } as never); } catch (e) { return `FOUT:${(e as Error).message}`; } };
  check('server-uitrol-06: de challenge verschilt per sleutel, per duur en per principal',
    new Set([u({}), u({ sleutelHash: kern.sshCaSleutelHash(pub('B')) }), u({ minuten: 16 }), u({ toegang: ['beheer', 'gast'] }), kern.uitdagingVoor('ssh-ca', { actie: 'aan', nonce: basis.nonce, verloopt: basis.verloopt })]).size === 5
    && u({ toegang: ['gast', 'beheer'] }) === u({ toegang: ['beheer', 'gast'] }));
  check('server-uitrol-06: ongeldige velden geven geen challenge (tekst als minuten, vreemde principal, geen sleutel)',
    u({ minuten: '15' }).startsWith('FOUT:') && u({ minuten: 61 }).startsWith('FOUT:') && u({ toegang: ['root;id'] }).startsWith('FOUT:') && u({ toegang: [] }).startsWith('FOUT:')
    && u({ toegang: ['beheer', 'beheer'] }).startsWith('FOUT:') && u({ sleutelHash: 'x' }).startsWith('FOUT:'));
  let sleutelFout = '';
  try { kern.sshCaSleutelHash('ssh-ed25519 AAAA commentaar'); } catch (e) { sleutelFout = (e as Error).message; }
  check('server-uitrol-06: sshCaSleutelHash aanvaardt alleen de kale regel «ssh-ed25519 <68 tekens>»', sleutelFout === 'SLEUTEL_ONGELDIG' && /^[0-9a-f]{64}$/.test(kern.sshCaSleutelHash(pub('A'))));

  const bron = lees('deploy/ssh-ca/mijn-ruimte-ssh-ca.sh');
  const unit = lees('deploy/mijn-ruimte-ssh-ca.service');
  check('server-uitrol-06: het script controleert de passkey vóór serienummer en handtekening, op een eigen genormaliseerd bestand',
    bron.indexOf('teken_passkey_ok(d, pub, gevraagd, minuten)') > 0 && bron.indexOf('teken_passkey_ok(d, pub, gevraagd, minuten)') < bron.indexOf('volg = os.path.join(ca_dir, "volgende")')
    && /os\.O_EXCL \| os\.O_NOFOLLOW, 0o600/.test(bron) && /"verifieer-ssh-ca", pkpad, "teken"/.test(bron));
  check('server-uitrol-06: de unit mag de toestand van de passkey-hulp schrijven (nonces), verder niets nieuws', /ReadWritePaths=-\/var\/lib\/mijn-ruimte\/goedkeuring/.test(unit) && !/sshd_config/.test(unit.replace(/^#.*$/gm, '')));
}

// ====================================================================================================================
// geheimen-03: de routes van de SSH-CA vragen de STERKE bevestiging; de gewone (ook na alleen Google) is niet genoeg.
// ====================================================================================================================
async function sshCaRoutesSterk(check: Check) {
  const { sshCaRoutes } = await import('../../backend/ssh-ca-routes');
  const eigenaar = { id: 'u-eig', email: process.env.OWNER_EMAIL || 'eigenaar@example.invalid', role: 'owner', status: 'approved' };
  const sessie = async () => ({ user: eigenaar, service: 'admin' }) as never;
  const verbruikt: string[] = [];
  const gewoonOk = async () => null; // «vers aangemeld bij Google»: de gewone stap-op is geslaagd
  const sterkNee = async () => ({ statusCode: 403, headers: {}, body: JSON.stringify({ error: 'STEP_UP_STRONG_REQUIRED' }) });
  const roep = async (deps: Record<string, unknown>, route: string, body: Record<string, unknown>) => {
    const r = sshCaRoutes(sessie, deps as never);
    if (!r[route]) return { status: 404, fout: 'ROUTE_ONTBREEKT' };
    const res = await (r[route][0] as unknown as (ctx: unknown) => Promise<{ statusCode: number; body: string }>)({ event: {}, body });
    let fout = ''; try { const j = JSON.parse(res.body); fout = String(j.error || j.code || ''); } catch { /* */ }
    return { status: res.statusCode, fout };
  };
  const TAB = 'b'.repeat(48);
  const nepUitgifte = async () => ({ cert: 'x', minuten: 15 });
  const gevoelig = ['POST /api/ssh-ca/uitgifte/uitdaging', 'POST /api/ssh-ca/uitgifte', 'POST /api/ssh-ca/beheer/uitdaging', 'POST /api/ssh-ca/beheer', 'POST /api/ssh-ca/intrekken'];
  const alleenGewoon: string[] = [];
  for (const route of gevoelig) {
    const r = await roep({ stepUp: gewoonOk, uitgeven: nepUitgifte, verbruik: async () => { verbruikt.push(route); } }, route, { tabContext: TAB, publiek: 'x', actie: 'uit', series: [1] });
    if (!(r.status === 403 && r.fout === 'STEP_UP_STRONG_REQUIRED')) alleenGewoon.push(`${route}=${r.status}/${r.fout}`);
  }
  check('geheimen-03: met alleen de gewone bevestiging (bv. opnieuw aangemeld bij Google) geven uitgifte, challenge, beheer en intrekken 403 STEP_UP_STRONG_REQUIRED',
    alleenGewoon.length === 0, alleenGewoon.join(' '));
  const weiger = await roep({ stepUp: gewoonOk, sterkeStapOp: sterkNee, uitgeven: nepUitgifte }, 'POST /api/ssh-ca/uitgifte', { tabContext: TAB });
  check('geheimen-03: weigert de sterke bevestiging, dan geen certificaat (ook al slaagt de gewone)', weiger.status === 403 && weiger.fout === 'STEP_UP_STRONG_REQUIRED', JSON.stringify(weiger));
  verbruikt.length = 0;
  const ok = await roep({ sterkeStapOp: gewoonOk, uitgeven: nepUitgifte, verbruik: async () => { verbruikt.push('uitgifte'); } }, 'POST /api/ssh-ca/uitgifte', { tabContext: TAB });
  check('geheimen-03: na een geslaagde uitgifte is de bevestiging verbruikt (één bevestiging = één certificaat)', ok.status === 200 && verbruikt.join() === 'uitgifte', `${JSON.stringify(ok)} ${verbruikt.join()}`);
  verbruikt.length = 0;
  const mis = await roep({ sterkeStapOp: gewoonOk, verbruik: async () => { verbruikt.push('mis'); } }, 'POST /api/ssh-ca/uitgifte', { tabContext: 'kort' });
  check('geheimen-03: een geweigerde uitgifte (fout tabblad) kost de bevestiging niet', mis.status >= 400 && verbruikt.length === 0, `${JSON.stringify(mis)} ${verbruikt.join()}`);
  const lezen = await roep({}, 'POST /api/ssh-ca/lijst', { tabContext: 'kort' });
  check('geheimen-03: alleen lezen (lijst) vraagt geen bevestiging (wel nog eigenaar + ssh.host)', lezen.fout !== 'STEP_UP_STRONG_REQUIRED', JSON.stringify(lezen));
  const idx = lees('backend/index.ts');
  check('geheimen-03: backend/index.ts geeft de SSH-CA-routes de sterke bevestiging mee', /sshCaRoutes\([^)]*sterkeStapOp:\s*sterkeStapOpVereist/.test(idx));
}

// ====================================================================================================================
// autorisatie-05: het overzicht «Сесії» en het noodstopknop zien ALLE rijen, niet alleen de 100 oudste (echte routes + database).
// ====================================================================================================================
async function sessieOverzicht(check: Check) {
  if (!process.env.DATABASE_URL) { check('autorisatie-05: DATABASE_URL vereist', false); return; }
  const { nepGoogle } = await import('./hulp/nep-google');
  const { getPool } = await import('../../server/platform/pg');
  const T = Date.now().toString(36);
  const G = await nepGoogle({ ownerEmail: `sec002-g10f-eig-${T}@example.test` });
  const pool = getPool('systeem');
  try {
    const sub = `sec002-g10f-lijst-${T}`, email = `${sub}@example.test`;
    const slachtoffer = G.browser();
    await slachtoffer.aanmelden(sub, email, { intent: 'login', service: 'identity' });
    const id = (await pool.query("select id from app.records where tbl='users' and data->>'email'=$1", [email])).rows[0].id;
    await pool.query("update app.records set data = data || '{\"status\":\"approved\"}'::jsonb where tbl='users' and id=$1", [id]);
    const eigen = (await pool.query("select data from app.records where tbl='owner_service_sessions_v1' and data->>'userId'=$1 limit 1", [id])).rows[0].data;
    // 105 levende sessies van hetzelfde account (veel aanmeldingen / «onthouden browser» binnen 30 dagen).
    for (let i = 0; i < 105; i += 1) {
      await pool.query("insert into app.records (tbl, id, data) values ('owner_service_sessions_v1', $1, $2::jsonb)", [randomUUID(), JSON.stringify({ ...eigen, tokenHash: `nep-${T}-${i}`, previousTokenHash: '' })]);
    }
    const aanvaller = G.browser();
    await aanvaller.aanmelden(sub, email, { intent: 'login' });
    const nieuwste = (await pool.query("select id from app.records where tbl='owner_service_sessions_v1' and data->>'userId'=$1 order by seq desc limit 1", [id])).rows[0].id;
    const o = await slachtoffer.verzoek('id.tarasevych.com', '/api/owner/identity/security/overview', slachtoffer.ctxBody('identity'));
    const ids = new Set((o.data?.items || []).map((x: { id?: string }) => String(x.id || '')));
    check('autorisatie-05: bij meer dan 100 rijen staat de NIEUWSTE (vreemde) sessie in het overzicht', o.status === 200 && ids.has(nieuwste), `status=${o.status} items=${(o.data?.items || []).length}`);
    check('autorisatie-05: het overzicht geeft het totaal aantal actieve items mee', Number(o.data?.totaalActief) === (o.data?.items || []).length && Number(o.data?.totaalActief) >= 107, String(o.data?.totaalActief));
    // Зауваження 4: een PRIVÉ AI-token uitgeven/intrekken hoort in de PRIVÉ activiteitenstroom (echte route, echte sfeerfilter in SQL);
    // een token van de technische lade blijft in de technische.
    {
      const { auditToevoegen } = await import('../../server/platform/audit');
      // De activiteitenroute vraagt het API-recht (backend/api-recht.ts); de eigenaar geeft het in het echt per gebruiker.
      await pool.query(`update app.records set data = data || '{"entitlements":["api-platform"]}'::jsonb where tbl='users' and id=$1`, [id]);
      await auditToevoegen({ ownerId: id, actorId: id, action: 'mcp_console_token_issued', type: 'ai', result: 'ok', details: { tokenId: 't-prive', name: 'toets-prive', ruimte: 'prive' } });
      await auditToevoegen({ ownerId: id, actorId: id, action: 'mcp_console_token_revoked', type: 'ai', result: 'ok', details: { tokenId: 't-prive', name: 'toets-prive', prefix: 'x' } });
      await auditToevoegen({ ownerId: id, actorId: id, action: 'mcp_console_token_issued', type: 'ai', result: 'ok', details: { tokenId: 't-tech', name: 'toets-tech', ruimte: 'technisch' } });
      const act = await slachtoffer.verzoek('hub.tarasevych.com', '/api/owner/agents/activity', slachtoffer.ctxBody('hub'));
      const typen = (act.data?.events || []).filter((e: { kind?: string }) => e.kind === 'site').map((e: { type?: string }) => String(e.type));
      check('зауваження 4: uitgeven en intrekken van een privé AI-token staan in de privé activiteitenstroom (route /api/owner/agents/activity)',
        act.status === 200 && act.data?.sfeer === 'prive' && typen.includes('mcp_console_token_issued') && typen.includes('mcp_console_token_revoked'), `status=${act.status} sfeer=${act.data?.sfeer} typen=${typen.join(',')}`);
      check('зауваження 4: … maar een token van de technische lade niet (dat blijft technisch)', typen.filter((t: string) => t === 'mcp_console_token_issued').length === 1, typen.join(','));
      const { TECHNISCHE_ACTIE } = await import('../../shared/meldingen-soorten');
      check('зауваження 4: back-up, archief en de overige consolebeheer-acties blijven technisch', ['mcp_backup_gestart', 'mcp_archive_klaar', 'mcp_console_policy_gewijzigd'].every((a) => TECHNISCHE_ACTIE.test(a)));
    }
    const nood = await slachtoffer.verzoek('id.tarasevych.com', '/api/owner/identity/security/emergency-revoke', slachtoffer.ctxBody('identity'));
    const levend = (await pool.query("select count(*)::int n from app.records where tbl='owner_service_sessions_v1' and data->>'userId'=$1 and coalesce(data->>'revokedAt','') in ('', '0')", [id])).rows[0].n;
    const nieuwsteRij = (await pool.query("select data->>'revokedAt' r from app.records where tbl='owner_service_sessions_v1' and id=$1", [nieuwste])).rows[0]?.r;
    check('autorisatie-05: de noodstop markeert ALLE sessies als ingetrokken, ook die na de 100e (de vreemde)', nood.status === 200 && levend === 0 && !!nieuwsteRij, `status=${nood.status} levend=${levend}`);
  } finally {
    G.herstel();
  }
  const idx = lees('backend/index.ts');
  const del = idx.slice(idx.indexOf("'POST /api/owner/identity/account/delete'"));
  check('autorisatie-05: ook account/delete leest alle rijen (ownerAlleRijen) en sluit ook de tabbladen',
    /ownerAlleRijen<OwnerSession>\(OWNER_SESSION_TABLE[\s\S]{0,400}ownerAlleRijen<OwnerTabSession>/.test(del.slice(0, 4000)) && !/db\.list<Omit<OwnerSession/.test(del.slice(0, 4000)));
}

// ====================================================================================================================
// privacy-logboek-03: veiligheidskritieke acties komen in de activiteitenstroom én (als melding) in het centrum van de mens zelf.
// ====================================================================================================================
async function beveiligingsMeldingen(check: Check) {
  const { sourceOfAudit, siteEventsFromAudit } = await import('../../backend/site-activiteit');
  const acties = ['access.password.set', 'access.totp.disable', 'access.webauthn.remove', 'access.step-up.onthouden', 'access.policy.save', 'access.password.reset-door-beheer',
    'mcp_console_token_issued', 'mcp_console_token_revoked', 'sleutelkluis.herstelcode_vernieuwd', 'sleutelkluis.passkey_gekoppeld', 'agent.namens.aangemaakt', 'aanmeld.koppeling', 'ai_grant_added'];
  const weg = acties.filter((a) => !sourceOfAudit(a));
  check('privacy-logboek-03: elke veiligheidskritieke actie (access.*, sleutelkluis.*, agent.*, aanmeld.*, mcp_console_*, ai_*) krijgt een bron in de stroom',
    weg.length === 0, weg.join(' '));
  const ev = siteEventsFromAudit(acties.map((action, i) => ({ id: String(i), action, result: 'success', createdAt: i })));
  check('privacy-logboek-03: siteEventsFromAudit geeft voor elk ervan een gebeurtenis', ev.length === acties.length, `${ev.length}/${acties.length}`);
  check('privacy-logboek-03: ruis blijft ruis (sessierotatie, tabbladen, eigen leesacties)',
    ['owner.session.rotated', 'owner.tab.opened', 'owner.notifications.read', 'owner.ruimte.geweigerd'].every((a) => sourceOfAudit(a) === null));
  const { sfeerVanSoort, isGeregistreerdeSoort } = await import('../../shared/meldingen-soorten');
  check('privacy-logboek-03: de meldingen gebruiken de geregistreerde persoonlijke soort «security»', isGeregistreerdeSoort('security') && sfeerVanSoort('security') === 'prive');

  // Echte melder: wat komt er bij wie aan?
  const melder = await import('../../backend/melder');
  const ontvangen: Array<{ userId: string; kind: string; title: string; message: string }> = [];
  melder.registreerMelder(async (userId, _e, kind, title, message) => { ontvangen.push({ userId, kind, title, message }); });
  const { meldBeveiligingsWijziging } = await import('../../backend/beveiliging-meldingen');
  await meldBeveiligingsWijziging('u-1', 'totp-uit');
  await meldBeveiligingsWijziging('u-1', 'ai-token', { naam: 'claude <script>\u0000' });
  check('privacy-logboek-03: meldBeveiligingsWijziging stuurt een tweetalige melding «security» naar het account zelf, met «Це були не ви?»-advies',
    ontvangen.length === 2 && ontvangen.every((m) => m.userId === 'u-1' && m.kind === 'security' && m.title.includes(' / ')) && /не ви/.test(ontvangen[0].message) && !/[<>\u0000]/.test(ontvangen[1].message), JSON.stringify(ontvangen).slice(0, 300));
  ontvangen.length = 0;
  const { meldInzage } = await import('../../backend/beheer-diagnostiek');
  const t0 = 1_800_000_000_000;
  const a = await meldInzage({ id: 'beheerder-1', email: 'beheerder@example.test' }, 'gebruiker-2', 'account', t0);
  const b = await meldInzage({ id: 'beheerder-1', email: 'beheerder@example.test' }, 'gebruiker-2', 'account', t0 + 60_000);
  const c = await meldInzage({ id: 'gebruiker-2' }, 'gebruiker-2', 'account', t0 + 120_000);
  const d = await meldInzage({ id: 'beheerder-1', email: 'beheerder@example.test' }, 'gebruiker-2', 'account', t0 + 3_700_000);
  check('privacy-logboek-03: wie een ANDER account in de diagnose bekijkt, laat het die gebruiker weten (wie, wat); hooguit één keer per uur; eigen account geen melding',
    a && !b && !c && d && ontvangen.length === 2 && ontvangen[0].userId === 'gebruiker-2' && ontvangen[0].message.includes('beheerder@example.test'), JSON.stringify(ontvangen).slice(0, 300));
  melder.registreerMelder(null as never);

  // De routes roepen het aan (bronvorm: deze routes draaien alleen met de volledige app).
  const tl = lees('backend/toegangslaag.ts');
  const na = (actie: string, soort: string) => { const i = tl.indexOf(`'${actie}'`); return i > 0 && tl.slice(i, i + 400).includes(`meldBeveiligingsWijziging(`) && tl.slice(i, i + 400).includes(`'${soort}'`); };
  check('privacy-logboek-03: toegangslaag meldt wachtwoord gezet, TOTP uit, passkey weg en «onthouden» aan de mens zelf',
    na('access.password.set', 'wachtwoord-gezet') && na('access.totp.disable', 'totp-uit') && na('access.webauthn.remove', 'passkey-weg') && na('access.step-up.onthouden', 'stap-op-onthouden'));
  check('privacy-logboek-03: reset-password door een beheerder: regel in het logboek én melding van de DOELgebruiker',
    /deps\.audit\(ctx\.params\.id,'access\.password\.reset-door-beheer'[\s\S]{0,120}meldBeveiligingsWijziging\(ctx\.params\.id,'wachtwoord-door-beheer'\)/.test(tl));
  const mc = lees('backend/mcp-console.ts');
  check('privacy-logboek-03: een AI-token uitgeven en intrekken geeft een melding', /meldBeveiligingsWijziging\(auth\.user\.id, "ai-token"/.test(mc) && /meldBeveiligingsWijziging\(auth\.user\.id, "ai-token-ingetrokken"/.test(mc));
  const sk = lees('backend/sleutelkluis.ts');
  check('privacy-logboek-03: sleutelkluis (aan, herstelcode vernieuwd, geopend met herstelcode, passkey gekoppeld) meldt het', (sk.match(/meldBeveiligingsWijziging\(lade\.userId, 'kluis'/g) || []).length === 4);
  const bd = lees('backend/beheer-diagnostiek.ts');
  check('privacy-logboek-03: beide inzage-routes van de diagnose roepen meldInzage aan', (bd.match(/await meldInzage\(/g) || []).length === 2);
}

// ====================================================================================================================
// interface-03 / interface-04: «Усі інструменти → Завжди» raakt alleen leeshulpmiddelen; elk gevaarlijk hulpmiddel krijgt «!»,
// een tekst (of de vertaalde servertekst) en een bevestiging; elk riskant hulpmiddel heeft een eigen risicotekst.
// ====================================================================================================================
async function hulpmiddelenPaneel(check: Check) {
  const { bulkAltijdToegestaan, isGevaarlijk } = await import('../../shared/mcp-hulpmiddel-gevaar');
  const gevaarlijkeSite = ['mail_modify_message', 'github_create_issue', 'github_comment_issue', 'calendar_delete_event', 'calendar_update_event', 'calendar_move_event',
    'calendar_event_attendees', 'calendar_rsvp_event', 'delete_board_item', 'update_board_item', 'manage_hub_notes'];
  if (process.env.DATABASE_URL) {
    const { describeTools } = await import('../../backend/connectors-hulpmiddelen');
    const alle = await describeTools(`sec002-g10f-tools-${Date.now()}`);
    const opNaam = new Map(alle.map((t) => [t.name, t]));
    const aanwezig = gevaarlijkeSite.filter((n) => opNaam.has(n));
    const oudeRegelDoor = aanwezig.filter((n) => !opNaam.get(n)!.risky); // vroeger: alleen t.risky werd overgeslagen
    const nieuwDoor = aanwezig.filter((n) => bulkAltijdToegestaan(opNaam.get(n)!));
    check('interface-03: schrijvende site-hulpmiddelen (mail naar prullenbak, GitHub-issue/reactie, afspraken, bord) gaan NIET meer mee met «Усі → Завжди»',
      aanwezig.length >= 8 && nieuwDoor.length === 0, `aanwezig=${aanwezig.length}; vroeger mee=${oudeRegelDoor.length} (${oudeRegelDoor.join(',')}); nu mee=${nieuwDoor.join(',')}`);
    check('interface-03: … en ze krijgen allemaal «!» (isGevaarlijk)', aanwezig.every((n) => isGevaarlijk(opNaam.get(n)!)), aanwezig.filter((n) => !isGevaarlijk(opNaam.get(n)!)).join(','));
    const schrijvendDoor = alle.filter((t) => bulkAltijdToegestaan(t) && (t.kind === 'write' || t.kind === 'execute' || t.risky || t.destructive));
    const lezend = alle.filter((t) => bulkAltijdToegestaan(t));
    check('interface-03: «Завжди» in bulk raakt alleen lezen/navigeren (en dat blijft mogelijk)', schrijvendDoor.length === 0 && lezend.length > 5 && lezend.every((t) => t.kind === 'read' || t.kind === 'navigate'), `${schrijvendDoor.map((t) => t.name).join(',')} / lezend=${lezend.length}`);
    const risky = alle.filter((t) => t.risky);
    check('interface-04: elk riskant hulpmiddel is gevaarlijk (bevestiging vóór «Завжди»), ook browser_hover en browser_fill_form', risky.length > 5 && risky.every((t) => isGevaarlijk(t)) && ['browser_hover', 'browser_fill_form'].every((n) => opNaam.get(n)?.risky));
  }
  check('interface-03: onbekend of zonder soort telt als gevaarlijk en gaat niet mee in bulk', isGevaarlijk(null) && !bulkAltijdToegestaan({}) && !bulkAltijdToegestaan({ kind: 'write' }) && bulkAltijdToegestaan({ kind: 'read', risky: false }));
  const route = lees('backend/mcp-connector-routes.ts');
  check('interface-03: de server-route set-all past bulkAltijdToegestaan toe op «Завжди»', /body\.mode === 'always' && !bulkAltijdToegestaan\(t\)\) continue;/.test(route));
  const paneel = lees('src/McpHulpmiddelenPaneel.tsx');
  check('interface-03: de knop «Завжди» bij «Усі інструменти» vraagt eerst bevestiging met de lijst van wat stopt met vragen',
    /onClick=\{\(\) => setAllesAsk\(true\)\}/.test(paneel) && !/onClick=\{\(\) => void setAll\('always'\)\}/.test(paneel) && /bulkAltijdToegestaan\(t\) && t\.mode !== 'always'/.test(paneel));
  check('зауваження 5: de teksten van het paneel beloven niet meer «„!“ staat standaard uit» of «„Питати“ verandert „!“ niet» (klopt niet voor schrijvende site-hulpmiddelen)',
    !/показують приватне: вони вимкнені типово/.test(paneel) && !/tonen iets privés: ze staan standaard uit/.test(paneel) && !/не змінюються кнопками «Завжди» і «Питати»/.test(paneel)
    && /Запис на сайті типово «Питати»/.test(paneel) && /лише поодинці, з підтвердженням/.test(paneel));
  check('зауваження 5: in de bevestiging staat een spatie tussen de risicotekst en «Кожен підключений ШІ…»', /\{risico\}\{' '\}\{tr\('Кожен підключений ШІ/.test(paneel));
  check('interface-03: elke bulkwijziging gaat naar het meldingencentrum', /tools\/set-all'[\s\S]{0,600}emitCanonicalNotice\(/.test(paneel));
  check('interface-04: geen dode knop meer: de bevestiging hangt niet af van een lokale tekst; «!» volgt uit isGevaarlijk; servertekst als terugval',
    /\{riskAsk === x\.name \? \(/.test(paneel) && !/riskAsk === x\.name && text/.test(paneel) && /gevaar \? <Help tone='warn'/.test(paneel) && /textOf\(x\.name, lang\) \?\? \{ title: x\.title \|\| x\.name/.test(paneel)
    && /isGevaarlijk\(tool\) && mode === 'always'/.test(paneel));

  // De bouwcontrole: elk riskant hulpmiddel heeft een tekst met risico — nu wel, met de basisversie van de teksten niet.
  const { controleerToolTeksten } = await import('../../scripts/hulp-vraagtekens-controle.mjs' as string) as { controleerToolTeksten: (w: string) => string[] };
  const nu = controleerToolTeksten('.');
  const w = mkdtempSync(join(tmpdir(), 'sec002-teksten-'));
  let vroeger: string[] = [];
  try {
    mkdirSync(join(w, 'backend')); mkdirSync(join(w, 'src'));
    writeFileSync(join(w, 'backend/connectors-hulpmiddelen.ts'), lees('backend/connectors-hulpmiddelen.ts'));
    const basis = spawnSync('git', ['show', '11e0aad8b641b62412d2efcf1382d117339d251f:src/mcp-teksten.ts'], { encoding: 'utf8' });
    writeFileSync(join(w, 'src/mcp-teksten.ts'), basis.stdout || '');
    vroeger = controleerToolTeksten(w);
  } finally { rmSync(w, { recursive: true, force: true }); }
  check('interface-04: elk riskant hulpmiddel heeft nu een eigen tekst met risico (bouwcontrole leeg)', nu.length === 0, nu.join(' | '));
  check('interface-04: de bouwcontrole vangt het oude gat (basisversie: browser_hover, browser_fill_form zonder tekst)', vroeger.some((f) => f.includes('browser_hover')) && vroeger.some((f) => f.includes('browser_fill_form')), vroeger.join(' | '));
}

export async function main(): Promise<number> {
  const { check, einde } = checker('sec-002-g10f-20261112');
  await hulpmiddelenPaneel(check);
  await beveiligingsMeldingen(check);
  await sshCaRoot(check);
  await sshCaRoutesSterk(check);
  await sessieOverzicht(check);
  if (process.env.DATABASE_URL) await (await import('../../server/platform/pg')).closePool().catch(() => undefined);
  return einde();
}
