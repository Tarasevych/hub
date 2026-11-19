// UI-015 (vlag aanmeldmethoden-v2): pure mapper snapshotToMethodCards() voor alle staten (loading, active, ready, not_configured,
// disabled, unknown), contract `aanbieders` (UI-015A ↔ UI-015B), filter/zoeken, vlag + migratie, en dat de oude weergave blijft.
import { readFileSync } from 'node:fs';
import { VLAG_UITLEG } from '../../shared/vlaggen';
import { AANBIEDER_IDS, filterKaarten, isAanbieder, isVeiligPad, snapshotToMethodCards, weergaveGroep, type MethodeKaart, type SnapshotInvoer } from '../../shared/aanmeldmethoden-model';
import { checker } from './hulp/nep-google';

const snap = (o: Partial<SnapshotInvoer> = {}): SnapshotInvoer => ({
  methods: [{ id: 'google', enabled: true, configured: true, bound: true, status: 'active' }, { id: 'password', enabled: true, configured: false, bound: false, status: 'not_configured' }],
  factors: [{ id: 'totp', enabled: true, enrolled: false, status: 'not_enrolled' }, { id: 'recovery', enabled: true, enrolled: true, status: 'active', remaining: 7 }, { id: 'passkey', enabled: true, enrolled: true, status: 'active', count: 2 }],
  bindings: [{ method: 'google', email: 'p@x.org', status: 'active' }],
  lockout: { protected: true }, password: { configured: false, mustChange: false }, totp: { enrolled: false }, ...o,
});
const vind = (l: MethodeKaart[], id: string) => l.find((k) => k.id === id)!;

export async function main(): Promise<number> {
  const { check, einde } = checker('aanmeldmethoden-v2-20261030');
  // loading
  const laden = snapshotToMethodCards('laden');
  check('loading: elke kaart skelet, geen actie', laden.every((k) => k.staat === 'loading' && k.actie === 'none'));
  check('loading: geen wachtwoordkaart (niet bewezen)', !laden.some((k) => k.id === 'password'));
  // fout / 403
  const fout = snapshotToMethodCards('fout');
  check('fout: nergens active/«Підключено»', fout.every((k) => k.staat !== 'active'));
  check('fout: «Стан не вдалося перевірити» + Повторити', vind(fout, 'google').staat === 'unknown' && vind(fout, 'google').reden?.uk === 'Стан не вдалося перевірити' && vind(fout, 'google').actie === 'retry');
  const geen = snapshotToMethodCards('geen-toegang');
  check('403: «Немає доступу», geen actie', geen.every((k) => k.staat === 'unavailable' && k.reden?.uk === 'Немає доступу' && k.actie === 'none'));
  check('klaar zonder snapshot = fout', snapshotToMethodCards('klaar').every((k) => k.staat !== 'active'));
  // active
  const s = snapshotToMethodCards('klaar', snap());
  const g = vind(s, 'google');
  check('active: Google gekoppeld met e-mail van de server', g.staat === 'active' && g.accountLabel === 'p@x.org' && g.actie === 'manage');
  check('active: lockout → beschermd + reden', g.beschermd === true && g.reden?.nl.includes('Enige'));
  check('active: passkey met aantal', vind(s, 'passkey').staat === 'active' && vind(s, 'passkey').feit?.uk === 'Ключів: 2');
  check('active: herstelcodes met echt aantal', vind(s, 'recovery').staat === 'active' && vind(s, 'recovery').feit?.nl === 'Codes over: 7');
  // ready
  check('ready: TOTP niet ingesteld → Налаштувати', vind(s, 'totp').staat === 'ready' && vind(s, 'totp').actie === 'setup');
  const s0 = snapshotToMethodCards('klaar', snap({ factors: [{ id: 'totp', enabled: true, enrolled: false, status: 'not_enrolled' }, { id: 'recovery', enabled: true, enrolled: false, status: 'not_enrolled', remaining: 0 }, { id: 'passkey', enabled: true, enrolled: false, status: 'not_enrolled', count: 0 }] }));
  check('ready: passkey 0 → setup', vind(s0, 'passkey').staat === 'ready' && vind(s0, 'passkey').actie === 'setup');
  check('ready: geen herstelcodes → setup (geen verzonnen 10)', vind(s0, 'recovery').staat === 'ready' && !vind(s0, 'recovery').feit);
  const weinig = snapshotToMethodCards('klaar', snap({ factors: [{ id: 'recovery', enabled: true, enrolled: true, status: 'active', remaining: 1 }] }));
  check('attention: 1 herstelcode over', vind(weinig, 'recovery').staat === 'attention');
  check('unknown: recovery zonder aantal → «Не вдалося визначити»', vind(snapshotToMethodCards('klaar', snap({ factors: [{ id: 'recovery', enabled: true, enrolled: true, status: 'active' }] })), 'recovery').reden?.uk === 'Не вдалося визначити');
  check('unknown: factor ontbreekt → niet gecontroleerd', vind(snapshotToMethodCards('klaar', snap({ factors: [] })), 'totp').staat === 'unknown');
  // not_configured / disabled
  const nc = snapshotToMethodCards('klaar', snap({ methods: [{ id: 'google', enabled: true, configured: false, bound: false, status: 'not_configured' }], bindings: [] }));
  check('not_configured: Google zonder sleutels', vind(nc, 'google').staat === 'not-configured' && vind(nc, 'google').actie !== 'connect');
  const dis = snapshotToMethodCards('klaar', snap({ methods: [{ id: 'google', enabled: false, configured: true, bound: false, status: 'disabled' }], factors: [{ id: 'totp', enabled: false, enrolled: false, status: 'not_enrolled' }] }));
  check('disabled: Google uit → unavailable', vind(dis, 'google').staat === 'unavailable');
  check('disabled: TOTP uit → unavailable', vind(dis, 'totp').staat === 'unavailable');
  // wachtwoord alleen als het bestaat
  check('wachtwoord: geen kaart als niet ingesteld', !s.some((k) => k.id === 'password'));
  const pw = snapshotToMethodCards('klaar', snap({ methods: [{ id: 'google', enabled: true, bound: true, status: 'active' }, { id: 'password', enabled: true, bound: true, status: 'active' }], password: { configured: true, mustChange: true } }));
  check('wachtwoord: tijdelijk → aandacht', vind(pw, 'password').staat === 'attention');
  // kluis/toegangscodes: geen bewering
  check('kluis/codes: neutraal + Переглянути', ['vault', 'guest-code'].every((id) => vind(s, id).staat === 'neutral' && vind(s, id).actie === 'view'));
  // aanbieders: veld ontbreekt
  check('aanbieders: veld ontbreekt → 4 kaarten «server ondersteunt nog niet», geen knop', AANBIEDER_IDS.every((id) => { const k = vind(s, `aanbieder:${id}`); return k.staat === 'unavailable' && k.actie === 'none' && k.reden?.uk.includes('ще не підтримує'); }));
  const a = snapshotToMethodCards('klaar', snap({ aanbieders: [
    { id: 'microsoft', status: 'gereed-om-te-koppelen', actieKoppelUrl: '/api/owner/access/aanbieder/microsoft/start', kanLosmaken: true },
    { id: 'apple', status: 'niet-geconfigureerd', kanLosmaken: true },
    { id: 'discord', status: 'actief', accountLabel: 'pavlo#1', gekoppeldOp: '2026-10-30T09:00:00Z', kanLosmaken: false, losmaakUrl: '/x' },
    { id: 'whatsapp', status: 'actief', kanLosmaken: true },
    { id: 'telegram', status: 'gereed-om-te-koppelen', actieKoppelUrl: 'https://evil.example/', kanLosmaken: true },
    { id: 'kapot' },
  ] }));
  check('aanbieder gereed → Підключити met same-origin pad', vind(a, 'aanbieder:microsoft').actie === 'connect' && vind(a, 'aanbieder:microsoft').koppelUrl === '/api/owner/access/aanbieder/microsoft/start');
  check('aanbieder niet-geconfigureerd → «Потрібні ключі провайдера», geen knop', vind(a, 'aanbieder:apple').staat === 'not-configured' && vind(a, 'aanbieder:apple').actie === 'none' && vind(a, 'aanbieder:apple').reden?.uk === 'Потрібні ключі провайдера');
  check('aanbieder actief → gekoppeld, beschermd, geen losmaak-url', vind(a, 'aanbieder:discord').staat === 'active' && vind(a, 'aanbieder:discord').beschermd === true && !vind(a, 'aanbieder:discord').losmaakUrl);
  check('aanbieder met extern adres → nooit een knop', vind(a, 'aanbieder:telegram').actie === 'none' && vind(a, 'aanbieder:telegram').staat === 'unknown');
  check('onbekende aanbieder (whatsapp) genegeerd', !a.some((k) => k.id === 'aanbieder:whatsapp'));
  check('actieve aanbieder → groep «Підключені»', weergaveGroep(vind(a, 'aanbieder:discord')) === 'verbonden' && weergaveGroep(vind(a, 'aanbieder:apple')) === 'beschikbaar');
  check('ontbrekende bekende id in lijst → onbekend', snapshotToMethodCards('klaar', snap({ aanbieders: [] })).filter((k) => k.id.startsWith('aanbieder:')).every((k) => k.staat === 'unknown'));
  check('isAanbieder/isVeiligPad', isAanbieder({ id: 'x', status: 'actief', kanLosmaken: true }) && !isAanbieder({ id: 'x', status: 'ja', kanLosmaken: true }) && isVeiligPad('/a/b') && !isVeiligPad('//evil') && !isVeiligPad('https://x') && !isVeiligPad('/\\evil'));
  // nooit geheimen
  check('geen geheimen in kaarten', !JSON.stringify(a).match(/secret|token|otpauth/i));
  // filter + zoeken
  check('filter Passkey', filterKaarten(s, 'passkey', '').map((k) => k.id).join() === 'passkey');
  check('filter Доступ іншим', filterKaarten(s, 'dostup', '').map((k) => k.id).join() === 'guest-code');
  check('zoeken uk + nl + hoofdletters', filterKaarten(s, 'alle', 'АВТЕНТИФІКАТОР').some((k) => k.id === 'totp') && filterKaarten(s, 'alle', 'herstel').some((k) => k.id === 'recovery'));
  check('zoeken met categorie behouden', filterKaarten(s, 'vhod', 'herstel').length === 0);
  // vlag + migratie + poort
  const u = VLAG_UITLEG['aanmeldmethoden-v2'];
  check('vlag: uitleg uk + nl', !!u && u.naam.length === 2 && u.wat.every(Boolean) && u.gevolg.every(Boolean));
  const mig = readFileSync('migrations/0200_aanmeldmethoden_v2_vlag.sql', 'utf8');
  check('migratie 0200: standaard UIT, idempotent', /'aanmeldmethoden-v2'/.test(mig) && /false,\s*false\)/.test(mig) && /ON CONFLICT \(sleutel\) DO NOTHING/.test(mig));
  const w = readFileSync('src/ToegangslaagWeergave.tsx', 'utf8');
  check('poort: v2 alleen met vlag, oude weergave blijft', /if\(v2\)return <AanmeldmethodenV2/.test(w) && /return <AccessPlanePanels tab/.test(w));
  check('één snapshot-call (v2 roept zelf geen snapshot aan)', !/access\/snapshot/.test(readFileSync('src/aanmeldmethoden-v2/AanmeldmethodenV2.tsx', 'utf8')) && !/access\/snapshot/.test(readFileSync('src/aanmeldmethoden-v2/IdentityMethodDetails.tsx', 'utf8')));
  const v2 = readFileSync('src/aanmeldmethoden-v2/AanmeldmethodenV2.tsx', 'utf8');
  check('geen dubbele 60/450 ms-scroll in v2', !/setTimeout/.test(v2) && /gedaan\.current===sleutel|gedaan\.current === sleutel/.test(v2));
  check('localStorage alleen voor ingeklapte groepen', (v2.match(/localStorage/g) || []).length === 2 && /amv2-ingeklapt/.test(v2));
  return einde();
}
