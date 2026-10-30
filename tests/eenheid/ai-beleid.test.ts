// AI-beleid met handtekening van de eigenaar (§13.12): kern (canoniek, hash, Ed25519 van de ceremonie), root-hulp (beleid-start via
// SSH, nieuwe versies alleen met een assertie van een root-passkey of de herstelsleutel), de app (lezen, beslissen, voorstel →
// ondertekenen → root) en het afdwingen in callTool (plafond, fail-closed, de eigenaar zelf valt erbuiten).
// De root-hulp draait als gewone gebruiker (nobody): als root negeert hij bewust de testpaden.
import { spawn, spawnSync } from 'node:child_process';
import { generateKeyPairSync, randomBytes, randomUUID, sign } from 'node:crypto';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import * as bk from '../../deploy/goedkeuring/ai-beleid-kern.mjs';
import * as kern from '../../deploy/goedkeuring/webauthn-kern.mjs';
import { checker } from './hulp/nep-google';
import { bevestig, nieuwePasskey, registreer } from './hulp/nep-toegangssleutel';
import { activiteit, agentVoor, beslissing, leesStand, ondertekenen, strengste, uitrolWeigering, vergeetCache, voorstel } from '../../backend/ai-beleid';
import { buildDraft } from '../../shared/ai-beleid/model';
import { metNamens } from '../../backend/mcp-namens';
import { callTool, listTools } from '../../backend/connectors-hulpmiddelen';
import { closePool, getPool } from '../../server/platform/pg';
import { auditToevoegen } from '../../server/platform/audit';
import type { Policy } from '../../shared/ai-beleid/model';

const HULP = resolve('deploy/goedkeuring/goedkeur-hulp.mjs');
const ORIGIN = 'https://admin.tarasevych.com';

export async function main(): Promise<number> {
  const { check, einde } = checker('ai-beleid');
  const basis = mkdtempSync(join(tmpdir(), 'ai-beleid-'));
  const d = (n: string) => { const p = join(basis, n); mkdirSync(p, { recursive: true }); chmodSync(p, 0o777); return p; };
  const dirs = { beleid: d('beleid'), inbox: d('inbox'), status: d('status'), staat: d('staat') };
  const sleutelsPad = join(basis, 'goedkeur-passkeys.json');
  chmodSync(basis, 0o777);
  const oud = { AI_BELEID_DIR: process.env.AI_BELEID_DIR, GOEDKEUR_INBOX: process.env.GOEDKEUR_INBOX, OPDRACHT_STATUS_DIR: process.env.OPDRACHT_STATUS_DIR, GOEDKEUR_SLEUTELS: process.env.GOEDKEUR_SLEUTELS };
  Object.assign(process.env, { AI_BELEID_DIR: dirs.beleid, GOEDKEUR_INBOX: dirs.inbox, OPDRACHT_STATUS_DIR: dirs.status, GOEDKEUR_SLEUTELS: sleutelsPad });
  const env = { ...process.env, AI_BELEID_DIR: dirs.beleid, GOEDKEUR_INBOX: dirs.inbox, GOEDKEUR_STATUS_DIR: dirs.status, GOEDKEUR_STAAT: dirs.staat, GOEDKEUR_SLEUTELS: sleutelsPad, GOEDKEUR_RECHTEN: join(basis, 'rechten.json'), GOEDKEUR_GROEP: 'nogroup' };
  const alsNobody = typeof process.getuid === 'function' && process.getuid() === 0 ? { uid: 65534, gid: 65534 } : {};
  const hulp = (...args: string[]) => spawnSync(process.execPath, [HULP, ...args], { env, encoding: 'utf8', ...alsNobody });
  const hulpAsync = (...args: string[]) => new Promise<number | null>((res) => { const c = spawn(process.execPath, [HULP, ...args], { env, stdio: 'ignore', ...alsNobody }); c.on('close', res); });
  const sys = getPool('systeem');
  const EIGENAAR = `ai-beleid-${randomUUID()}`;

  try {
    // ------------------------------------------------------------------ kern + genesis zoals scripts/ceremony.ts die maakt
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    const spki = publicKey.export({ type: 'spki', format: 'der' }).toString('base64url');
    const fp = bk.sleutelVingerafdruk(spki);
    const agent = (name: string) => ({ name, enabled: true, defaultMode: { kind: 'ask' }, capabilities: {} });
    const genesis: Policy = { v: 1, seq: 0, prevHash: null, issuedAt: Date.now() - 3 * 86_400_000, ownerKeys: [{ id: 'recovery-1', type: 'ed25519', publicKey: spki, label: 'Офлайн-ключ', addedAt: Date.now() - 3 * 86_400_000 }], approvalSignature: 'risky', agents: { claude: agent('Claude'), grok: agent('Grok') } as Policy['agents'] };
    const genSig = sign(null, bk.ed25519Bericht(genesis), privateKey).toString('base64url');
    check('kern: canonieke JSON onafhankelijk van sleutelvolgorde; hash 64 hex', bk.canoniek({ b: 1, a: [2, { d: 1, c: 0 }] }) === '{"a":[2,{"c":0,"d":1}],"b":1}' && /^[0-9a-f]{64}$/.test(bk.beleidHash(genesis)));
    check('kern: Ed25519 van de herstelsleutel geldig; gewijzigd beleid of andere sleutel niet',
      bk.controleerEd25519(genesis, { keyId: 'recovery-1', signature: genSig }, genesis.ownerKeys).ok
      && !bk.controleerEd25519({ ...genesis, approvalSignature: 'never' }, { keyId: 'recovery-1', signature: genSig }, genesis.ownerKeys).ok
      && !bk.controleerEd25519(genesis, { keyId: 'ander', signature: genSig }, genesis.ownerKeys).ok);
    check('kern: policy.change aan een agent geven = ongeldig', bk.beleidFout({ ...genesis, agents: { claude: { ...agent('Claude'), capabilities: { 'policy.change': { kind: 'always' } } } } }) === 'BELEID_EIGENAAR_ALLEEN');

    // ------------------------------------------------------------------ zonder beleid: niets verandert
    check('app: zonder keten «niet ingesteld» en geen beperking', (await leesStand()).staat === 'niet-ingesteld' && (await beslissing({ client: 'Claude' }, 'machine_read_file')).mode === 'always');

    // ------------------------------------------------------------------ root: beleid-start (SSH)
    const genPad = join(basis, 'genesis.signed.json');
    writeFileSync(genPad, JSON.stringify({ policy: genesis, signature: { type: 'ed25519', keyId: 'recovery-1', signature: genSig } })); chmodSync(genPad, 0o644);
    const fout1 = hulp('beleid-start', genPad, 'f'.repeat(16));
    check('root: beleid-start met een verkeerde vingerafdruk geweigerd', fout1.status !== 0 && /vingerafdruk past niet/.test(fout1.stderr), fout1.stderr.slice(0, 200));
    const start = hulp('beleid-start', genPad, fp.slice(0, 20));
    check('root: beleid-start met de vingerafdruk van de herstelsleutel installeert versie 0', start.status === 0 && /versie 0, 2 agents/.test(start.stdout), start.stderr.slice(0, 300));
    check('root: tweede beleid-start geweigerd (wijzigen alleen met handtekening)', hulp('beleid-start', genPad, fp.slice(0, 20)).status !== 0);
    vergeetCache();
    const s0 = await leesStand();
    check('app: keten gelezen, versie 0, geldig', s0.staat === 'geldig' && s0.beleid.seq === 0);
    check('app: agent op naam of id (hoofdletters, «Claude Code» → claude); onbekend → null',
      s0.staat === 'geldig' && agentVoor(s0.beleid, 'Claude') === 'claude' && agentVoor(s0.beleid, 'claude code') === 'claude' && agentVoor(s0.beleid, 'GROK') === 'grok' && agentVoor(s0.beleid, 'Gemini') === null);
    check('app: v2-adres (slug) gaat voor de clientnaam; onbekende slug valt terug op de clientnaam',
      s0.staat === 'geldig' && agentVoor(s0.beleid, 'ChatGPT', 'claude') === 'claude' && agentVoor(s0.beleid, 'Gemini', 'grok') === 'grok' && agentVoor(s0.beleid, 'Claude', 'onbekend') === 'claude' && agentVoor(s0.beleid, 'Gemini', 'onbekend') === null);
    const bSlug = await beslissing({ client: 'ChatGPT', agent: 'claude' }, 'machine_read_file');
    check('app: beslissing via slug (clientnaam ChatGPT, adres /ai/claude) vindt de agent in het beleid', bSlug.agentId === 'claude' && bSlug.code !== 'agent_unknown', JSON.stringify([bSlug.agentId, bSlug.code]));
    if (s0.staat === 'geldig') {
      const nu = Date.now();
      await auditToevoegen({ ownerId: EIGENAAR, actorId: EIGENAAR, action: 'owner.mcp.tool', result: 'success', details: { tool: 'uitrol_voorstel_status', client: 'Claude' } });
      await auditToevoegen({ ownerId: EIGENAAR, actorId: EIGENAAR, action: 'owner.mcp.tool', result: 'denied', details: { tool: 'machine_exec', client: 'ChatGPT', agent: 'claude' } });
      await auditToevoegen({ ownerId: EIGENAAR, actorId: EIGENAAR, action: 'owner.mcp.tool', result: 'success', details: { tool: 'x', client: 'Onbekende AI' } });
      const act = await activiteit(EIGENAAR, s0.beleid);
      check('activiteit: acties per beleid-agent gebundeld (clientnaam én slug), onbekende AI niet', Object.keys(act).join() === 'claude' && act.claude.n24 === 2 && act.claude.geweigerd24 === 1 && act.claude.laatst >= nu - 60_000 && act.claude.laatst <= Date.now() + 1000, JSON.stringify(act));
      check('activiteit: zonder beleid leeg', Object.keys(await activiteit(EIGENAAR, null)).length === 0);
    }
    const b0 = await beslissing({ client: 'Claude' }, 'machine_read_file');
    const bOnb = await beslissing({ client: 'Gemini' }, 'machine_read_file');
    const bGeen = await beslissing(undefined, 'machine_read_file');
    check('app: standaard «питати щоразу»; onbekende AI en aanroep zonder AI-verbinding: dicht', b0.mode === 'ask' && bOnb.mode === 'off' && bOnb.code === 'agent_unknown' && bGeen.mode === 'off', JSON.stringify([b0.code, bOnb.code, bGeen.code]));
    check('strengste: plafond (always < ask < off)', strengste('always', 'ask') === 'ask' && strengste('off', 'always') === 'off' && strengste('ask', 'ask') === 'ask');

    // ------------------------------------------------------------------ passkey van de eigenaar in het root-bestand
    const pk = nieuwePasskey('es256', 1);
    const reg = kern.verifieerRegistratie({ ...registreer(pk, 'r'), verwachteUitdaging: 'r', rpId: 'tarasevych.com', origins: [ORIGIN] });
    if (!reg.ok) throw new Error('registratie');
    writeFileSync(sleutelsPad, JSON.stringify({ versie: 1, rpId: 'tarasevych.com', origins: [ORIGIN, 'https://id.tarasevych.com'], sleutels: [{ credentialId: reg.credentialId, alg: reg.alg, jwk: reg.jwk, label: 'Телефон', vingerafdruk: reg.vingerafdruk, toegevoegd: new Date().toISOString(), door: 'ssh' }] }));
    chmodSync(sleutelsPad, 0o644);

    // ------------------------------------------------------------------ voorstel → ondertekenen → root
    const e = { id: EIGENAAR, email: 'eigenaar@example.test' };
    const ops = [{ op: 'grant', agent: 'claude', capabilities: ['device.read'], spec: { type: 'preset', preset: '2h', after: 'ask' } }];
    const v1 = await voorstel(e, ops);
    check('voorstel: ontwerp seq 1, diff met «Claude», challenge = kern(ai-beleid, hash van precies dit ontwerp)',
      v1.ontwerp.seq === 1 && v1.diff.some((l: { text: string }) => /Claude/.test(l.text)) && v1.publicKey.challenge === kern.uitdagingVoor('ai-beleid', { beleidHash: bk.beleidHash(v1.ontwerp), nonce: v1.nonce, verloopt: v1.verloopt })
      && v1.publicKey.allowCredentials[0].id === reg.credentialId);
    // Gewijzigd ontwerp met de handtekening van het origineel: geweigerd, en de challenge is daarna op.
    const vals = { ...v1.ontwerp, agents: { ...v1.ontwerp.agents, claude: { ...v1.ontwerp.agents.claude, capabilities: { 'device.exec': { kind: 'always' } } } } };
    const geweigerd = await ondertekenen(e, { uitdagingId: v1.uitdagingId, ontwerp: vals, assertie: bevestig(pk, v1.publicKey.challenge) }, { wachtMs: 100 }).then(() => 'geen fout', (err) => String(err.code));
    check('ondertekenen: ander ontwerp dan getekend → ONTWERP_GEWIJZIGD', geweigerd === 'ONTWERP_GEWIJZIGD', geweigerd);
    const v2 = await voorstel(e, ops);
    const assertie = bevestig(pk, v2.publicKey.challenge);
    // De app (hier root, in productie mijnruimte) schrijft 0640; de hulp draait in deze test als nobody: leesbaar maken.
    const rootKlaar = (async () => { await new Promise((r) => setTimeout(r, 400)); for (const f of readdirSync(dirs.inbox)) chmodSync(join(dirs.inbox, f), 0o644); return hulpAsync('verwerk'); })();
    const o2 = await ondertekenen(e, { uitdagingId: v2.uitdagingId, ontwerp: v2.ontwerp, assertie }, { wachtMs: 10_000 });
    await rootKlaar;
    vergeetCache();
    const s1 = await leesStand();
    check('root: assertie van de root-passkey → versie 1 in de keten (app leest het terug)', o2.resultaat === 'klaar' && s1.staat === 'geldig' && s1.beleid.seq === 1 && s1.versies[1]?.ondertekend.soort === 'passkey', JSON.stringify(o2));
    const nu = Date.now();
    const b1 = await beslissing({ client: 'Claude' }, 'machine_read_file', nu);
    const bExec = await beslissing({ client: 'Claude' }, 'machine_exec', nu);
    const bNa = await beslissing({ client: 'Claude' }, 'machine_read_file', nu + 2 * 3_600_000 + 1000);
    check('timer: binnen 2 uur «дозволено» (met resterende tijd), andere mogelijkheid blijft «питати»; daarna «питати» (after: ask)',
      b1.mode === 'always' && (b1.besluit?.remainingMs ?? 0) > 7_000_000 && bExec.mode === 'ask' && bNa.mode === 'ask' && bNa.code === 'expired_ask', JSON.stringify([b1.code, bExec.code, bNa.code]));
    // tools/list met een geldig beleid: het BELEID bepaalt wat de AI ziet (niet de oude schakelaars, waar app_deploy standaard «uit» staat).
    const lijstClaude = (await metNamens({ client: 'Claude' }, () => listTools(randomUUID(), { alwaysMachine: true }))).map((t) => t.name);
    const lijstOnbekend = (await metNamens({ client: 'Gemini' }, () => listTools(randomUUID(), { alwaysMachine: true }))).map((t) => t.name);
    check('tools/list volgt het ondertekende beleid: Claude («питати») ziet ook app_deploy en machine_exec; een AI buiten het beleid ziet niets',
      lijstClaude.includes('app_deploy') && lijstClaude.includes('machine_exec') && lijstClaude.includes('app_secret_request') && lijstOnbekend.length === 0, `${lijstClaude.length}/${lijstOnbekend.length}`);
    // Hergebruik van dezelfde assertie (opnieuw in de inbox): root weigert.
    writeFileSync(join(dirs.inbox, `ai-beleid-${randomBytes(8).toString('hex')}.json`), JSON.stringify({ doel: 'ai-beleid', ontwerp: v2.ontwerp, nonce: v2.nonce, verloopt: v2.verloopt, assertie }));
    hulp('verwerk');
    vergeetCache();
    const herhaald = readdirSync(dirs.status).filter((n) => n.startsWith('ai-beleid-')).map((n) => JSON.parse(readFileSync(join(dirs.status, n), 'utf8'))).filter((x) => x.code === 'HERGEBRUIKT' || x.code === 'VERSIE_VERSCHILT_BELEID');
    check('root: dezelfde handtekening nog eens → geweigerd (al gebruikt / versie bestaat), keten ongewijzigd', (await leesStand() as any).beleid.seq === 1 && herhaald.length === 1, JSON.stringify(herhaald));

    // ------------------------------------------------------------------ herstelsleutel (offline) via de inbox
    const s1b = (await leesStand()) as Extract<Awaited<ReturnType<typeof leesStand>>, { staat: 'geldig' }>;
    const viaHerstel: Policy = { ...s1b.beleid, seq: 2, prevHash: s1b.hash, issuedAt: Date.now(), agents: { ...s1b.beleid.agents, claude: { ...s1b.beleid.agents.claude, enabled: false } } };
    const id3 = randomBytes(8).toString('hex');
    writeFileSync(join(dirs.inbox, `ai-beleid-${id3}.json`), JSON.stringify({ doel: 'ai-beleid', ontwerp: viaHerstel, ed25519: { keyId: 'recovery-1', signature: sign(null, bk.ed25519Bericht(viaHerstel), privateKey).toString('base64url') } }));
    hulp('verwerk');
    vergeetCache();
    const s2 = await leesStand();
    check('root: herstelsleutel (Ed25519) mag ook tekenen; Claude uitgeschakeld → dicht', s2.staat === 'geldig' && s2.beleid.seq === 2 && (await beslissing({ client: 'Claude' }, 'machine_read_file')).code === 'agent_disabled');
    const nep: Policy = { ...(s2 as any).beleid, seq: 3, prevHash: (s2 as any).hash, issuedAt: Date.now(), agents: { ...(s2 as any).beleid.agents, claude: { ...(s2 as any).beleid.agents.claude, enabled: true, defaultMode: { kind: 'always' } } } };
    const { privateKey: anderPriv } = generateKeyPairSync('ed25519');
    const id4 = randomBytes(8).toString('hex');
    writeFileSync(join(dirs.inbox, `ai-beleid-${id4}.json`), JSON.stringify({ doel: 'ai-beleid', ontwerp: nep, ed25519: { keyId: 'recovery-1', signature: sign(null, bk.ed25519Bericht(nep), anderPriv).toString('base64url') } }));
    hulp('verwerk');
    vergeetCache();
    const st4 = JSON.parse(readFileSync(join(dirs.status, `ai-beleid-${id4}.json`), 'utf8'));
    check('root: handtekening met een andere sleutel (zelfde keyId) → HANDTEKENING_ONGELDIG, keten ongewijzigd', st4.code === 'HANDTEKENING_ONGELDIG' && (await leesStand() as any).beleid.seq === 2, JSON.stringify(st4));

    // ------------------------------------------------------------------ afdwingen in callTool
    const geweigerdTool = await metNamens({ client: 'Claude' }, () => callTool(EIGENAAR, 'machine_list', {}));
    const eigenaarZelf = await callTool(EIGENAAR, 'machine_list', {}, { eigenaarZelf: true });
    check('callTool: Claude uitgeschakeld in het beleid → weigering met uitleg; de eigenaar zelf (Пісочниця) niet', geweigerdTool.isError === true && /signed AI policy/.test(geweigerdTool.content[0].text) && !eigenaarZelf.isError, `${geweigerdTool.content[0].text.slice(0, 120)} | ${eigenaarZelf.content[0].text.slice(0, 80)}`);

    // ------------------------------------------------------------------ schakelaar «Розгортання для всіх агентів»
    check('uitrol: Grok (standaard питати) mag een voorstel voorbereiden (de passkey van de eigenaar beslist); Claude (uit) niet',
      (await uitrolWeigering({ client: 'Grok' }, 'uitrol_voorstel_begin')) === null && /signed AI policy/.test(String(await uitrolWeigering({ client: 'Claude' }, 'uitrol_voorstel_begin'))));
    const s3 = (await leesStand()) as Extract<Awaited<ReturnType<typeof leesStand>>, { staat: 'geldig' }>;
    const allesUit = buildDraft(s3.beleid, s3.hash, [{ op: 'grant', agent: '*', capabilities: ['deploy.release'], spec: { type: 'off' } }], Date.now());
    const id5 = randomBytes(8).toString('hex');
    writeFileSync(join(dirs.inbox, `ai-beleid-${id5}.json`), JSON.stringify({ doel: 'ai-beleid', ontwerp: allesUit, ed25519: { keyId: 'recovery-1', signature: sign(null, bk.ed25519Bericht(allesUit), privateKey).toString('base64url') } }));
    hulp('verwerk');
    vergeetCache();
    const grokUitrol = await uitrolWeigering({ client: 'Grok' }, 'uitrol_voorstel_begin');
    const grokStatus = await uitrolWeigering({ client: 'Grok' }, 'uitrol_voorstel_status');
    const grokLees = await beslissing({ client: 'Grok' }, 'machine_list');
    check('uitrol: «Вимкнути всім» (agent *, deploy.release) → Grok kan niets meer voorbereiden; status bekijken en andere rechten blijven',
      (await leesStand() as any).beleid.seq === 3 && /signed AI policy/.test(String(grokUitrol)) && grokStatus === null && grokLees.mode === 'ask', JSON.stringify([grokUitrol?.slice(0, 80), grokStatus, grokLees.code]));

    // ------------------------------------------------------------------ beleid → «Хто готує оновлення» (backend/uitrol-beleid-sync.ts)
    {
      const { synchroniseerGrants } = await import('../../backend/uitrol-beleid-sync');
      const rij = async (slug: string) => (await sys.query("SELECT id, bron, onbepaald, ingetrokken_op, verloopt_op FROM app.uitrol_voorbereiders WHERE soort = 'agent' AND onderwerp = $1 AND account_id = $2 ORDER BY gegeven_op DESC", [slug, EIGENAAR])).rows;
      const auditN = async (actie: string) => Number((await sys.query("SELECT count(*)::int AS n FROM app.audit WHERE owner_id = $1 AND action = $2", [EIGENAAR, actie]).catch(() => ({ rows: [{ n: -1 }] }))).rows[0].n);
      const ondertekenViaHerstel = (ops: Parameters<typeof buildDraft>[2], id: string) => {
        return (async () => {
          const st = (await leesStand()) as Extract<Awaited<ReturnType<typeof leesStand>>, { staat: 'geldig' }>;
          const ontwerp = buildDraft(st.beleid, st.hash, ops, Date.now());
          writeFileSync(join(dirs.inbox, `ai-beleid-${id}.json`), JSON.stringify({ doel: 'ai-beleid', ontwerp, ed25519: { keyId: 'recovery-1', signature: sign(null, bk.ed25519Bericht(ontwerp), privateKey).toString('base64url') } }));
          hulp('verwerk'); vergeetCache();
        })();
      };
      // handmatig recht voor gpt: blijft altijd staan, ook als het beleid «Вимкнено» zegt
      const man = await sys.query("INSERT INTO app.uitrol_voorbereiders (soort, onderwerp, account_id, label, gegeven_door, verloopt_op, onbepaald, bron) VALUES ('agent','gpt',$1,'ChatGPT','test', now() + interval '7 days', false, 'handmatig') RETURNING id", [EIGENAAR]);
      const u0 = await synchroniseerGrants(e, 'test: alles uit');
      check('beleid-sync: «Вимкнути всім» ⇒ geen automatisch recht; handmatig recht (gpt) blijft', u0.gegeven.length === 0 && (await rij('grok')).length === 0 && (await rij('gpt')).filter((r) => !r.ingetrokken_op).length === 1, JSON.stringify(u0));
      await ondertekenViaHerstel([{ op: 'grant', agent: 'grok', capabilities: ['deploy.release'], spec: { type: 'always' } }], randomBytes(8).toString('hex'));
      const u1 = await synchroniseerGrants(e, 'test: grok aan');
      const r1 = await rij('grok');
      check('beleid-sync: «Розгортати сайт» voor Grok uitdrukkelijk aan ⇒ recht (soort agent, tot intrekking, bron ai-beleid), exact één rij', u1.gegeven.join() === 'grok' && r1.length === 1 && r1[0].onbepaald === true && r1[0].bron === 'ai-beleid' && !r1[0].ingetrokken_op, JSON.stringify([u1, r1]));
      const u1b = await synchroniseerGrants(e, 'test: nog eens');
      check('beleid-sync: idempotent (tweede keer geen nieuwe rij, geen extra journaalregel)', u1b.gegeven.length === 0 && (await rij('grok')).length === 1);
      await ondertekenViaHerstel([{ op: 'grant', agent: 'grok', capabilities: ['deploy.release'], spec: { type: 'off' } }], randomBytes(8).toString('hex'));
      const u2 = await synchroniseerGrants(e, 'test: grok uit');
      const r2 = await rij('grok');
      check('beleid-sync: weer «Вимкнено» ⇒ alleen het automatische recht wordt ingetrokken (rij blijft als geschiedenis)', u2.ingetrokken.join() === 'grok' && r2.length === 1 && !!r2[0].ingetrokken_op && (await rij('gpt')).filter((r) => !r.ingetrokken_op).length === 1, JSON.stringify([u2, r2.length]));
      const nGegeven = await auditN('agent.grant.auto_gegeven'), nIngetr = await auditN('agent.grant.auto_ingetrokken');
      check('beleid-sync: elke automatische wijziging staat in het journaal (auto_gegeven, auto_ingetrokken)', nGegeven === 1 && nIngetr === 1, `${nGegeven}/${nIngetr}`);
      await sys.query('DELETE FROM app.uitrol_voorbereiders WHERE account_id = $1', [EIGENAAR]).catch(() => undefined);
      void man;
    }

    // ------------------------------------------------------------------ geknoeid in de keten → alles dicht
    const ketenPad = join(dirs.beleid, 'keten.json');
    const keten = JSON.parse(readFileSync(ketenPad, 'utf8'));
    keten.versies[2].beleid.agents.claude.enabled = true; // zonder handtekening «terugzetten»
    writeFileSync(ketenPad, JSON.stringify(keten));
    vergeetCache();
    const kapot = await leesStand();
    const dicht = await beslissing({ client: 'Grok' }, 'mcp_services_health');
    check('fail-closed: gewijzigde versie breekt de hashketen → beleid ongeldig, alle AI dicht', kapot.staat === 'ongeldig' && dicht.mode === 'off' && /beleid_ongeldig/.test(dicht.code), JSON.stringify([kapot.staat, dicht.code]));
  } catch (err) {
    check('onverwachte fout', false, String((err as Error)?.stack || err).slice(0, 600));
  } finally {
    await sys.query("DELETE FROM app.goedkeur_uitdagingen WHERE user_id = $1", [EIGENAAR]).catch(() => undefined);
    for (const [k, v] of Object.entries(oud)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    rmSync(basis, { recursive: true, force: true });
    await closePool();
  }
  // Audit 19.10.2026 (A3): de pagina benoemt welk deelverzoek faalde en de laadfout verdwijnt zodra het overzicht weer slaagt.
  const ui = readFileSync('src/BeheerAiBeleidWeergave.tsx', 'utf8');
  check('A3: laadfout van /overzicht heeft bron «laden» en wordt bij succes gewist', /deelFoutTekst\(lang, 'overzicht'/.test(ui) && /bron: 'laden'/.test(ui) && /setMelding\(\(m\) => \(m\?\.bron === 'laden' \? null : m\)\)/.test(ui));
  check('A3: voorstel en ondertekenen benoemen hun eigen deelverzoek; 5xx krijgt de herstarttekst', /deelFoutTekst\(lang, 'voorstel'/.test(ui) && /deelFoutTekst\(lang, 'ondertekenen'/.test(ui) && /isHerstart\(code\)\) return herstartTekst/.test(ui));
  return einde();
}
