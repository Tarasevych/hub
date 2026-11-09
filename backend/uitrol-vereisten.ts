// UITROL-001 · Admin → «Оновлення»: перевірка вимог до встановлення ДО завантаження архіву.
// UITROL-001 · Vereistencontrole vóór de upload (zie shared/uitrol-vereisten.ts voor het waarom).
//
// Stroom: (1) de browser leest het .tar.gz lokaal (src/platform/tar-lezen.ts) en stuurt alleen de beschrijving: versie, commit,
// basis, metadata, het ontwikkeldossier, de SHA-256 en de NAMEN van alle migraties → vereistenStarten() beoordeelt alles wat zonder
// SQL kan en noemt de nieuwe migraties; (2) de browser stuurt alleen de SQL van die nieuwe migraties → proefAanvragen() legt één
// verzoek in /srv/mijn-ruimte/proef-inbox voor root (deploy/uitrol/mijn-ruimte-migratie-proef.sh: wegwerpkopie van het schema);
// (3) vereistenStand() leest de uitslag. Pas als er geen «fout» is, begint de upload. Root controleert bij de installatie alles opnieuw.
// Er draait hier nooit SQL uit het pakket; de site schrijft alleen het verzoekbestand en leest de uitslag.
import { randomUUID } from 'node:crypto';
import { constants as fsc } from 'node:fs';
import { access, readFile, rename, statfs, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getPool } from '../server/platform/pg';
import { auditToevoegen } from '../server/platform/audit';
import { pgVersie, pgVersieMelding } from '../server/pg-versie';
import { releaseInfo } from './uitgave-info';
import { leesOntwikkelArchief, ontwikkelArchiefVerplicht } from '../shared/ontwikkelarchief';
import { controleerOntwikkelArchiefOnline, type ArchiefControle } from './uitrol-ontwikkelarchief';
import { MIGRATIE_NAAM, PROEF_MAX_BYTES, PROEF_MAX_MIGRATIES, oorzaakUitProef, telVereisten, type ArchiefBeschrijving, type MigratieProefUitslag, type Vereiste, type VereisteLogRegel, type VereistenAntwoord } from '../shared/uitrol-vereisten';

const sys = () => getPool('systeem');
const statusDir = () => process.env.OPDRACHT_STATUS_DIR || '/var/lib/mijn-ruimte-uitrol-status';
const proefInbox = () => process.env.UITROL_PROEF_INBOX || '/srv/mijn-ruimte/proef-inbox';
const appRoot = () => process.env.UITROL_APP_ROOT || '/srv/mijn-ruimte';
const VERSIE = /^\d{8}-\d{6}$/;
const HEX40 = /^[0-9a-f]{40}$/;
const tekst = (v: unknown, n: number) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').slice(0, n);

export class VereistenFout extends Error { constructor(public code: string, public status = 400) { super(code); } }

type Sessie = { antwoord: VereistenAntwoord; eigenaar: string; gemaakt: number; sql: Map<string, string>; proefSinds: number };
const SESSIES = new Map<string, Sessie>();
const opruimen = () => { const grens = Date.now() - 3600_000; for (const [k, s] of SESSIES) if (s.gemaakt < grens) SESSIES.delete(k); };

/** Afhankelijkheden (testbaar zonder database, root of netwerk). */
export type VereistenOmgeving = {
  actief: () => { versie: string; commit: string };
  toegepast: () => Promise<Set<string> | null>;
  pg: () => Promise<{ tekst: string; melding: string | null } | null>;
  lopendeInstallatie: () => Promise<boolean>;
  vrijeSchijf: () => Promise<number | null>;
  rootLeeftijdSec: () => Promise<number | null>;
  passkeyKlaar: () => Promise<boolean>;
  proefBeschikbaar: () => Promise<boolean>;
  archiefOnline: (ref: NonNullable<ReturnType<typeof leesOntwikkelArchief>['ref']>, sha: string) => Promise<ArchiefControle>;
};

export const standaardOmgeving = (opties: { passkeyKlaar: () => Promise<boolean>; archiefToken?: () => Promise<string | undefined> }): VereistenOmgeving => ({
  actief: () => { const r = releaseInfo(); return { versie: String(r.versie || ''), commit: HEX40.test(String(r.commit || '')) ? String(r.commit) : '' }; },
  toegepast: async () => { try { return new Set((await sys().query('SELECT version FROM app.schema_migrations')).rows.map((r: { version: string }) => String(r.version))); } catch { return null; } },
  pg: async () => { try { const v = await pgVersie(sys()); return { tekst: v.tekst, melding: pgVersieMelding(v) }; } catch { return null; } },
  lopendeInstallatie: async () => { try { return Number((await sys().query(`SELECT count(*)::int AS n FROM app.uitrol_runs WHERE staat = 'bezig' AND bijgewerkt > now() - interval '45 minutes'`)).rows[0].n) > 0; } catch { return false; } },
  vrijeSchijf: async () => { try { const s = await statfs(appRoot()); return Number(s.bavail) * Number(s.bsize); } catch { return null; } },
  rootLeeftijdSec: async () => { try { const d = JSON.parse(await readFile(path.join(statusDir(), 'diagnose.json'), 'utf8')) as { tijd?: string }; const t = Date.parse(String(d.tijd)); return Number.isFinite(t) ? Math.max(0, Math.round((Date.now() - t) / 1000)) : null; } catch { return null; } },
  passkeyKlaar: opties.passkeyKlaar,
  proefBeschikbaar: async () => { try { await access(proefInbox(), fsc.W_OK); return true; } catch { return false; } },
  archiefOnline: async (ref, sha) => controleerOntwikkelArchiefOnline(ref, sha, { token: await opties.archiefToken?.().catch(() => undefined) }),
});

const mb = (b: number) => `${(b / 1048576).toFixed(1).replace('.', ',')} МБ`;
const mbNl = (b: number) => `${(b / 1048576).toFixed(1).replace('.', ',')} MB`;

/** Stap 1: alles wat zonder SQL kan. Puur op de invoer + de omgeving; geeft ook de nieuwe migraties terug. */
export async function vereistenBeoordelen(invoer: ArchiefBeschrijving & { sha256?: string; ontwikkelArchief?: string | null }, omg: VereistenOmgeving): Promise<VereistenAntwoord> {
  const begin = Date.now();
  const log: VereisteLogRegel[] = [];
  const zeg = (niveau: VereisteLogRegel['niveau'], t: string) => log.push({ t: new Date().toISOString(), niveau, tekst: t });
  const v: Vereiste[] = [];
  const voeg = (x: Vereiste, t0: number) => { x.ms = Date.now() - t0; v.push(x); zeg(x.niveau === 'ok' ? 'ok' : x.niveau === 'fout' ? 'fout' : 'waarschuwing', `${x.niveau === 'ok' ? '✓' : x.niveau === 'fout' ? '✗' : '!'} ${x.nl}${x.waardeNl ? ` — ${x.waardeNl}` : ''}`); };
  const a = invoer;
  zeg('info', `vereisten: ${tekst(a.bestand, 120)} (${mbNl(a.bytes)}) lokaal gelezen in ${a.leesMs} ms`);
  const actief = omg.actief();
  let t = Date.now();

  // ---- archief
  const p = new Set(a.problemen || []);
  const structuurFout = ['GEEN_GZIP', 'TAR_ONGELDIG', 'MEER_MAPPEN', 'ONVEILIG_PAD', 'GEEN_GEWOON_BESTAND'].filter((c) => p.has(c));
  voeg({ id: 'structuur', groep: 'archief', niveau: structuurFout.length ? 'fout' : 'ok', uk: 'Формат і структура архіву', nl: 'Formaat en structuur van het archief',
    waardeUk: structuurFout.length ? structuurFout.join(', ') : `.tar.gz, одна тека, ${a.bestanden} файлів`, waardeNl: structuurFout.length ? structuurFout.join(', ') : `.tar.gz, één map, ${a.bestanden} bestanden`,
    waaromUk: 'Root розпаковує лише звичайні файли в одну теку. Посилання, пристрої чи шляхи поза текою — ризик перезапису системних файлів, тому такий архів відхиляється.',
    waaromNl: 'Root pakt alleen gewone bestanden in één map uit. Links, apparaten of paden buiten de map kunnen systeembestanden overschrijven; zo’n archief wordt geweigerd.' }, t);
  t = Date.now();
  const versieOk = VERSIE.test(a.versie);
  const nieuwer = versieOk && (!VERSIE.test(actief.versie) || a.versie > actief.versie);
  voeg({ id: 'versie', groep: 'archief', niveau: !versieOk || !nieuwer ? 'fout' : 'ok', uk: 'Версія новіша за встановлену', nl: 'Versie nieuwer dan de geïnstalleerde',
    waardeUk: versieOk ? `${a.versie} ${nieuwer ? '>' : '≤'} ${actief.versie || '—'}` : 'UITROL-VERSIE відсутня або хибна', waardeNl: versieOk ? `${a.versie} ${nieuwer ? '>' : '≤'} ${actief.versie || '—'}` : 'UITROL-VERSIE ontbreekt of is ongeldig',
    waaromUk: 'Root приймає лише новіші версії: так старий, навіть підписаний, пакет не може тихо повернути вразливий код. Відкат робиться окремою дією.',
    waaromNl: 'Root accepteert alleen nieuwere versies: zo kan een oud, ook ondertekend pakket niet stil kwetsbare code terugzetten. Terugdraaien is een aparte handeling.' }, t);
  t = Date.now();
  const metaFout: string[] = [];
  if (!a.auteur || a.auteur.length < 3) metaFout.push('AUTEUR');
  if (!/^[a-z][a-z0-9-]{1,31}$/.test(a.agent || '')) metaFout.push('AGENT');
  if ((a.samenvattingTekens || 0) < 20) metaFout.push('SAMENVATTING');
  voeg({ id: 'metadata', groep: 'archief', niveau: metaFout.length ? 'fout' : 'ok', uk: 'Автор, агент і опис змін', nl: 'Auteur, agent en beschrijving',
    waardeUk: metaFout.length ? `бракує: ${metaFout.join(', ')}` : `${tekst(a.auteur, 60)} · ${a.agent} · ${a.samenvattingTekens} знаків`, waardeNl: metaFout.length ? `ontbreekt: ${metaFout.join(', ')}` : `${tekst(a.auteur, 60)} · ${a.agent} · ${a.samenvattingTekens} tekens`,
    waaromUk: 'Без автора й опису не видно, хто і що змінює на сервері; root відхиляє такий пакет.', waaromNl: 'Zonder auteur en beschrijving is niet te zien wie wat wijzigt; root weigert zo’n pakket.' }, t);
  t = Date.now();
  voeg({ id: 'manifest', groep: 'archief', niveau: !a.manifest ? (a.manifestFouten ? 'fout' : 'waarschuwing') : 'ok', uk: 'Маніфест: опис uk + nl і учасники', nl: 'Manifest: beschrijving uk + nl en deelnemers',
    waardeUk: a.manifest ? 'є, коректний' : a.manifestFouten ? `${a.manifestFouten} помилок у полях` : 'відсутній (старий формат)', waardeNl: a.manifest ? 'aanwezig, geldig' : a.manifestFouten ? `${a.manifestFouten} fouten in velden` : 'ontbreekt (oud formaat)',
    waaromUk: 'Маніфест показує, які люди й ШІ-агенти (і моделі) брали участь — це фіксується в історії встановлень.', waaromNl: 'Het manifest toont welke mensen en AI-agenten (en modellen) meewerkten — dat blijft in de geschiedenis staan.' }, t);
  t = Date.now();
  voeg({ id: 'installer', groep: 'archief', niveau: a.installer ? 'ok' : 'fout', uk: 'Інсталятор deploy/installeer-app.sh', nl: 'Installer deploy/installeer-app.sh',
    waardeUk: a.installer ? 'є' : 'відсутній', waardeNl: a.installer ? 'aanwezig' : 'ontbreekt',
    waaromUk: 'Без інсталятора root не знає, як зібрати й увімкнути випуск.', waaromNl: 'Zonder installer weet root niet hoe de release gebouwd en geactiveerd wordt.' }, t);

  // ---- herkomst
  t = Date.now();
  const commitOk = HEX40.test(a.commit || '');
  voeg({ id: 'commit', groep: 'herkomst', niveau: commitOk ? 'ok' : /^zonder-git:/.test(a.commit || '') ? 'waarschuwing' : 'fout', uk: 'BRON-COMMIT (відтворюваність із git)', nl: 'BRON-COMMIT (herleidbaar tot git)',
    waardeUk: commitOk ? a.commit.slice(0, 12) : tekst(a.commit, 60) || 'відсутній', waardeNl: commitOk ? a.commit.slice(0, 12) : tekst(a.commit, 60) || 'ontbreekt',
    waaromUk: 'Коміт дозволяє будь-коли відтворити саме цей код і перевірити, що в ньому.', waaromNl: 'Met de commit is precies deze code altijd te herbouwen en te controleren.' }, t);
  t = Date.now();
  const sha = String(a.sha256 || '');
  voeg({ id: 'sha256', groep: 'herkomst', niveau: /^[0-9a-f]{64}$/.test(sha) ? 'ok' : 'fout', uk: 'SHA-256 архіву пораховано на пристрої', nl: 'SHA-256 van het archief op het apparaat berekend',
    waardeUk: sha ? `${sha.slice(0, 8)}…${sha.slice(-4)}` : '—', waardeNl: sha ? `${sha.slice(0, 8)}…${sha.slice(-4)}` : '—',
    waaromUk: 'Сервер звірить SHA-256 після завантаження, а root — перед установленням. Будь-яка зміна байта зупиняє встановлення.', waaromNl: 'De server vergelijkt de SHA-256 na het uploaden en root vóór het installeren. Eén gewijzigde byte stopt de installatie.' }, t);
  if (ontwikkelArchiefVerplicht(a.versie)) {
    t = Date.now();
    const ar = leesOntwikkelArchief(a.ontwikkelArchief ?? null, a.versie, commitOk ? a.commit : '');
    let r: ArchiefControle | null = null;
    if (ar.ref && !ar.fouten.length && /^[0-9a-f]{64}$/.test(sha)) { try { r = await omg.archiefOnline(ar.ref, sha); } catch (e) { r = { ok: false, code: 'GITHUB_NETWERK', reden: String((e as Error).message).slice(0, 120) }; } }
    const netwerk = r && !r.ok && /NETWERK|HTTP_5|TIMEOUT|abort/i.test(`${r.code} ${r.reden}`);
    voeg({ id: 'github', groep: 'herkomst', niveau: r?.ok ? 'ok' : netwerk ? 'waarschuwing' : 'fout', uk: 'GitHub підтверджує історію розробки й цей самий архів', nl: 'GitHub bevestigt het ontwikkeldossier en dit exacte archief',
      waardeUk: r?.ok ? `Release ${a.versie}, SHA-256 збігся` : !a.ontwikkelArchief ? 'ONTWIKKELARCHIEF.json відсутній' : ar.fouten.length ? ar.fouten.slice(0, 2).join('; ') : `${r?.code || 'не перевірено'}: ${tekst(r?.reden, 120)}`,
      waardeNl: r?.ok ? `Release ${a.versie}, SHA-256 komt overeen` : !a.ontwikkelArchief ? 'ONTWIKKELARCHIEF.json ontbreekt' : ar.fouten.length ? ar.fouten.slice(0, 2).join('; ') : `${r?.code || 'niet gecontroleerd'}: ${tekst(r?.reden, 120)}`,
      waaromUk: 'Встановлюється лише той архів, що опублікований на GitHub разом з історією розробки (TRACE-001). Підроблений чи змінений архів не пройде.',
      waaromNl: 'Alleen een archief dat met zijn ontwikkeldossier op GitHub staat wordt geïnstalleerd (TRACE-001). Een vervalst of gewijzigd archief komt er niet door.' }, t);
  }

  // ---- compatibiliteit
  t = Date.now();
  if (a.basis && VERSIE.test(a.basis.versie)) {
    const verouderd = VERSIE.test(actief.versie) && actief.versie > a.basis.versie;
    const andereCommit = !!actief.commit && HEX40.test(a.basis.commit) && actief.commit !== a.basis.commit && !verouderd && actief.versie !== a.basis.versie;
    voeg({ id: 'basis', groep: 'compatibiliteit', niveau: verouderd || andereCommit ? 'fout' : 'ok', uk: 'База випуску = встановлена версія', nl: 'Basis van de release = geïnstalleerde versie',
      waardeUk: `UITROL-BASIS ${a.basis.versie} · встановлено ${actief.versie || '—'}`, waardeNl: `UITROL-BASIS ${a.basis.versie} · geïnstalleerd ${actief.versie || '—'}`,
      waaromUk: 'Якщо між збіркою й установленням на сервер поставили новішу версію, цей пакет перезаписав би чужі зміни. Root такий пакет відхиляє (BASIS_VEROUDERD).',
      waaromNl: 'Als er tussen bouwen en installeren een nieuwere versie op de server kwam, zou dit pakket die wijzigingen overschrijven. Root weigert het (BASIS_VEROUDERD).' }, t);
  } else {
    voeg({ id: 'basis', groep: 'compatibiliteit', niveau: 'waarschuwing', uk: 'База випуску = встановлена версія', nl: 'Basis van de release = geïnstalleerde versie', waardeUk: 'UITROL-BASIS відсутній (старий формат)', waardeNl: 'UITROL-BASIS ontbreekt (oud formaat)',
      waaromUk: 'Без бази не видно, від якої встановленої версії зібрано пакет.', waaromNl: 'Zonder basis is niet te zien op welke geïnstalleerde versie het pakket is gebouwd.' }, t);
  }
  t = Date.now();
  const pg = await omg.pg();
  voeg({ id: 'postgres', groep: 'compatibiliteit', niveau: !pg ? 'waarschuwing' : pg.melding ? 'fout' : 'ok', uk: 'Версія PostgreSQL', nl: 'PostgreSQL-versie',
    waardeUk: pg ? pg.tekst : 'не вдалося прочитати', waardeNl: pg ? pg.tekst : 'niet te lezen',
    waaromUk: 'Міграції використовують синтаксис нових версій PostgreSQL; на старій версії встановлення впало б посеред міграцій.', waaromNl: 'Migraties gebruiken syntaxis van nieuwe PostgreSQL-versies; op een oude versie zou de installatie midden in de migraties stoppen.' }, t);
  t = Date.now();
  const namen = (a.migraties || []).map((m) => m.naam).filter((n) => n !== 'rechten');
  const slecht = namen.filter((n) => !MIGRATIE_NAAM.test(n));
  const nummers = new Map<string, number>(); for (const n of namen) nummers.set(n.slice(0, 4), (nummers.get(n.slice(0, 4)) || 0) + 1);
  const dubbel = [...nummers].filter(([, k]) => k > 1).map(([n]) => n);
  const toegepast = await omg.toegepast();
  const nieuw = toegepast ? namen.filter((n) => MIGRATIE_NAAM.test(n) && !toegepast.has(n)).sort() : [];
  const ontbreekt = toegepast ? [...toegepast].filter((n) => !namen.includes(n)) : [];
  voeg({ id: 'migratie-namen', groep: 'compatibiliteit', niveau: slecht.length || dubbel.length ? 'fout' : ontbreekt.length ? 'waarschuwing' : 'ok', uk: 'Нумерація міграцій', nl: 'Nummering van de migraties',
    waardeUk: slecht.length || dubbel.length ? `хибні назви: ${slecht.slice(0, 3).join(', ')}${dubbel.length ? `; дублікати: ${dubbel.join(', ')}` : ''}` : `${namen.length} файлів; нових: ${nieuw.length}${ontbreekt.length ? `; в архіві немає ${ontbreekt.length} уже застосованих` : ''}`,
    waardeNl: slecht.length || dubbel.length ? `ongeldige namen: ${slecht.slice(0, 3).join(', ')}${dubbel.length ? `; dubbel: ${dubbel.join(', ')}` : ''}` : `${namen.length} bestanden; nieuw: ${nieuw.length}${ontbreekt.length ? `; ${ontbreekt.length} toegepaste ontbreken in het archief` : ''}`,
    details: ontbreekt.slice(0, 12),
    waaromUk: 'Міграції виконуються за номером рівно один раз. Дубль або пропуск означає, що архів зібрано не від тієї бази.', waaromNl: 'Migraties draaien op nummer en precies één keer. Een dubbel of gat betekent dat het archief niet op deze basis is gebouwd.' }, t);
  const proefKan = await omg.proefBeschikbaar();
  v.push({ id: 'migratie-proef', groep: 'compatibiliteit', niveau: !nieuw.length ? 'ok' : !proefKan ? 'waarschuwing' : 'wacht', uk: 'Проба нових міграцій на копії схеми', nl: 'Nieuwe migraties geprobeerd op een kopie van het schema',
    waardeUk: !nieuw.length ? 'нових міграцій немає' : !proefKan ? 'служба проби ще не встановлена на сервері (зʼявиться після цього випуску)' : `${nieuw.length} нових: ${nieuw.slice(0, 4).join(', ')}`,
    waardeNl: !nieuw.length ? 'geen nieuwe migraties' : !proefKan ? 'proefdienst nog niet op de server (komt met deze release)' : `${nieuw.length} nieuw: ${nieuw.slice(0, 4).join(', ')}`,
    waaromUk: 'Обмеження бази (CHECK, UNIQUE, NOT NULL) існують лише в самій базі. Нові міграції проганяються на тимчасовій копії схеми, яку потім видаляють; робоча база не змінюється. Саме так виявляється помилка, через яку раніше встановлення падало після хвилин збірки.',
    waaromNl: 'Beperkingen (CHECK, UNIQUE, NOT NULL) bestaan alleen in de database. Nieuwe migraties draaien op een wegwerpkopie van het schema; productie blijft onaangeroerd. Zo komt de fout boven die vroeger pas na minuten bouwen opdook.', ms: null });

  // ---- server
  t = Date.now();
  const bezig = await omg.lopendeInstallatie();
  voeg({ id: 'geen-installatie', groep: 'server', niveau: bezig ? 'fout' : 'ok', uk: 'Інше встановлення зараз не триває', nl: 'Er loopt geen andere installatie',
    waardeUk: bezig ? 'триває інше встановлення' : 'вільно', waardeNl: bezig ? 'er loopt een andere installatie' : 'vrij',
    waaromUk: 'Одночасно може йти лише одне встановлення; друге чекало б у черзі або перезаписало б стан першого.', waaromNl: 'Er kan maar één installatie tegelijk lopen; een tweede zou wachten of de stand van de eerste overschrijven.' }, t);
  t = Date.now();
  const vrij = await omg.vrijeSchijf();
  const nodig = a.bytes * 4 + 2 * 1024 ** 3;
  voeg({ id: 'schijf', groep: 'server', niveau: vrij == null ? 'waarschuwing' : vrij < nodig ? 'fout' : 'ok', uk: 'Вільне місце на диску', nl: 'Vrije schijfruimte',
    waardeUk: vrij == null ? 'не вдалося прочитати' : `${mb(vrij)} вільно, потрібно ≥ ${mb(nodig)}`, waardeNl: vrij == null ? 'niet te lezen' : `${mbNl(vrij)} vrij, nodig ≥ ${mbNl(nodig)}`,
    waaromUk: 'Потрібне місце для архіву, розпакування, npm ci, збірки й резервної копії бази. Брак місця зупинив би встановлення посередині.', waaromNl: 'Ruimte voor archief, uitpakken, npm ci, bouwen en de databaseback-up. Te weinig ruimte stopt de installatie halverwege.' }, t);
  t = Date.now();
  const leeftijd = await omg.rootLeeftijdSec();
  voeg({ id: 'root', groep: 'server', niveau: leeftijd == null || leeftijd > 600 ? 'waarschuwing' : 'ok', uk: 'Root-служба на звʼязку', nl: 'Root-dienst bereikbaar',
    waardeUk: leeftijd == null ? 'знімка діагностики немає' : `останній знімок ${leeftijd} с тому`, waardeNl: leeftijd == null ? 'geen diagnosemomentopname' : `laatste momentopname ${leeftijd} s geleden`,
    waaromUk: 'Встановлює root. Якщо його знімок застарів, схвалений пакет може не підхопитися — див. «Діагностика».', waaromNl: 'Root installeert. Is zijn momentopname oud, dan wordt een goedgekeurd pakket mogelijk niet opgepakt — zie «Діагностика».' }, t);
  t = Date.now();
  const pk = await omg.passkeyKlaar().catch(() => false);
  voeg({ id: 'passkey', groep: 'server', niveau: pk ? 'ok' : 'waarschuwing', uk: 'Passkey для схвалення налаштовано', nl: 'Passkey voor goedkeuring ingesteld',
    waardeUk: pk ? 'готово' : 'не налаштовано — див. «Налаштування»', waardeNl: pk ? 'gereed' : 'niet ingesteld — zie «Instellingen»',
    waaromUk: 'Без passkey завантажений пакет чекатиме схвалення; root не встановлює нічого без підпису власника.', waaromNl: 'Zonder passkey wacht het geüploade pakket op goedkeuring; root installeert niets zonder handtekening van de eigenaar.' }, t);

  const proefStatus: VereistenAntwoord['proef']['status'] = !nieuw.length ? 'niet-nodig' : !proefKan ? 'niet-beschikbaar' : 'wacht-op-sql';
  const tel = telVereisten(v);
  return { id: randomUUID(), tijd: new Date().toISOString(), ok: !tel.blokkeert, klaar: proefStatus !== 'wacht-op-sql', ms: Date.now() - begin, vereisten: v, nieuweMigraties: proefStatus === 'wacht-op-sql' ? nieuw : [], proef: { status: proefStatus }, log };
}

/** Uitkomst van de root-proef in het antwoord verwerken (de vereiste «migratie-proef» + logregels). Puur. */
export function proefVerwerken(ant: VereistenAntwoord, u: MigratieProefUitslag, sqlVan?: (naam: string) => string | undefined): VereistenAntwoord {
  const vereisten = ant.vereisten.map((x) => {
    if (x.id !== 'migratie-proef') return x;
    const ms = u.stappen.reduce((s, st) => s + (st.ms || 0), 0) || null;
    if (u.status === 'bezig') return { ...x, niveau: 'bezig' as const };
    if (u.status === 'niet-beschikbaar' || u.status === 'fout') return { ...x, niveau: 'waarschuwing' as const, ms, waardeUk: `пробу не виконано (${u.code || u.status}); під час установлення root повторить її першим кроком`, waardeNl: `proef niet uitgevoerd (${u.code || u.status}); root herhaalt haar als eerste installatiestap`, details: (u.log || []).slice(-6) };
    if (u.ok) return { ...x, niveau: 'ok' as const, ms, waardeUk: `${u.migraties.length} нових, 0 помилок · ${u.migraties.map((m) => `${m.naam} ${m.ms} мс`).join(', ')}`.slice(0, 400), waardeNl: `${u.migraties.length} nieuw, 0 fouten · ${u.migraties.map((m) => `${m.naam} ${m.ms} ms`).join(', ')}`.slice(0, 400) };
    const o = oorzaakUitProef(u, sqlVan);
    return { ...x, niveau: 'fout' as const, ms, oorzaak: o, waardeUk: o ? `${o.migratie}${o.regel ? `, рядок ${o.regel}` : ''} — ${o.uitlegUk}` : 'міграція не пройшла', waardeNl: o ? `${o.migratie}${o.regel ? `, regel ${o.regel}` : ''} — ${o.uitlegNl}` : 'migratie mislukt' };
  });
  const log = [...ant.log];
  const stap = (id: string) => u.stappen.find((s) => s.id === id)?.ms;
  if (u.status !== 'bezig') {
    log.push({ t: new Date().toISOString(), niveau: 'info', tekst: `proef: kopie ${stap('kopie') ?? '—'} ms · schema ${stap('schema') ?? '—'} ms · migraties ${stap('migraties') ?? '—'} ms · opruimen ${stap('opruimen') ?? '—'} ms${u.pg ? ` · PostgreSQL ${u.pg}` : ''}` });
    for (const m of u.migraties) log.push({ t: new Date().toISOString(), niveau: m.ok ? 'ok' : 'fout', tekst: m.ok ? `✓ ${m.naam} (${m.ms} ms)` : `✗ ${m.naam}${m.fout?.regel ? ` regel ${m.fout.regel}` : ''}: ${m.fout?.code || ''} ${m.fout?.bericht || ''}${m.fout?.constraint ? ` · ${m.fout.constraint}` : ''}` });
  }
  const tel = telVereisten(vereisten);
  const klaar = u.status !== 'bezig';
  return { ...ant, vereisten, log, ok: !tel.blokkeert, klaar, proef: { status: klaar ? (u.status === 'klaar' || u.status === 'mislukt' ? 'klaar' : 'niet-beschikbaar') : 'bezig', uitslag: u } };
}

// ------------------------------------------------------------------------------------------------ routes-logica (eigenaar)
const sessie = (id: unknown, eigenaar: string) => { opruimen(); const s = SESSIES.get(String(id || '')); if (!s || s.eigenaar !== eigenaar) throw new VereistenFout('VEREISTEN_ONBEKEND', 404); return s; };

export async function vereistenStarten(eigenaar: string, invoer: Record<string, unknown>, omg: VereistenOmgeving): Promise<VereistenAntwoord> {
  const a = invoer.archief as ArchiefBeschrijving & { sha256?: string; ontwikkelArchief?: string | null } | undefined;
  if (!a || typeof a !== 'object' || !Array.isArray(a.migraties) || a.migraties.length > 5000) throw new VereistenFout('INVOER_ONGELDIG');
  const schoon = { ...a, bestand: tekst(a.bestand, 200), versie: tekst(a.versie, 32), commit: tekst(a.commit, 220), auteur: tekst(a.auteur, 200), agent: tekst(a.agent, 40),
    bytes: Math.max(0, Number(a.bytes) || 0), bestanden: Math.max(0, Number(a.bestanden) || 0), samenvattingTekens: Math.max(0, Number(a.samenvattingTekens) || 0), leesMs: Math.max(0, Number(a.leesMs) || 0),
    manifestFouten: Math.max(0, Number(a.manifestFouten) || 0), manifest: !!a.manifest, installer: !!a.installer, problemen: (a.problemen || []).slice(0, 30).map((p) => tekst(p, 40)),
    basis: a.basis ? { versie: tekst(a.basis.versie, 32), commit: tekst(a.basis.commit, 64) } : null, migraties: a.migraties.slice(0, 5000).map((m) => ({ naam: tekst(m.naam, 120), bytes: Math.max(0, Number(m.bytes) || 0) })),
    sha256: tekst(a.sha256, 64).toLowerCase(), ontwikkelArchief: a.ontwikkelArchief ? String(a.ontwikkelArchief).slice(0, 9000) : null };
  const ant = await vereistenBeoordelen(schoon as never, omg);
  SESSIES.set(ant.id, { antwoord: ant, eigenaar, gemaakt: Date.now(), sql: new Map(), proefSinds: 0 });
  await auditToevoegen({ ownerId: eigenaar, actorId: eigenaar, action: 'uitrol_vereisten_gecontroleerd', type: 'beveiliging', result: ant.ok ? 'ok' : 'denied', service: 'admin',
    details: { id: ant.id, versie: schoon.versie, fouten: ant.vereisten.filter((x) => x.niveau === 'fout').map((x) => x.id), nieuw: ant.nieuweMigraties.length } }).catch(() => undefined);
  return ant;
}

export async function proefAanvragen(eigenaar: string, invoer: Record<string, unknown>): Promise<VereistenAntwoord> {
  const s = sessie(invoer.id, eigenaar);
  if (s.antwoord.proef.status !== 'wacht-op-sql') return s.antwoord;
  const lijst = Array.isArray(invoer.migraties) ? invoer.migraties as Array<{ naam?: unknown; sql?: unknown }> : [];
  const verwacht = new Set(s.antwoord.nieuweMigraties);
  const migraties: Array<{ naam: string; sql: string }> = []; let bytes = 0;
  for (const m of lijst.slice(0, PROEF_MAX_MIGRATIES)) {
    const naam = String(m.naam || ''); const sql = String(m.sql ?? '');
    if (!verwacht.has(naam)) continue;
    bytes += Buffer.byteLength(sql); if (bytes > PROEF_MAX_BYTES) throw new VereistenFout('PROEF_TE_GROOT', 413);
    migraties.push({ naam, sql }); s.sql.set(naam, sql);
  }
  if (migraties.length !== verwacht.size) throw new VereistenFout('PROEF_SQL_ONVOLLEDIG');
  const doel = path.join(proefInbox(), `proef-${s.antwoord.id}.json`);
  const tmp = path.join(proefInbox(), `.proef-${s.antwoord.id}.tmp`);
  await writeFile(tmp, JSON.stringify({ id: s.antwoord.id, versie: s.antwoord.vereisten.find((x) => x.id === 'versie')?.waardeNl?.split(' ')[0] || '', migraties }), { mode: 0o640 });
  await rename(tmp, doel);
  s.proefSinds = Date.now();
  s.antwoord = proefVerwerken({ ...s.antwoord, log: [...s.antwoord.log, { t: new Date().toISOString(), niveau: 'info', tekst: `proef: verzoek aan root (${migraties.length} migraties, ${bytes} bytes SQL)` }] }, { id: s.antwoord.id, ok: false, status: 'bezig', tijd: new Date().toISOString(), stappen: [], migraties: [] });
  return s.antwoord;
}

export async function vereistenStand(eigenaar: string, invoer: Record<string, unknown>): Promise<VereistenAntwoord> {
  const s = sessie(invoer.id, eigenaar);
  if (s.antwoord.proef.status !== 'bezig') return s.antwoord;
  let u: MigratieProefUitslag | null = null;
  try { u = JSON.parse(await readFile(path.join(statusDir(), 'proef', `${s.antwoord.id}.json`), 'utf8')) as MigratieProefUitslag; } catch { u = null; }
  if (!u || u.status === 'bezig') {
    // Root pakt het verzoek niet op (path-unit uit, dienst hangt): na 3 minuten eerlijk «niet uitgevoerd», nooit eeuwig wachten.
    if (Date.now() - s.proefSinds > 180_000) s.antwoord = proefVerwerken(s.antwoord, { id: s.antwoord.id, ok: false, status: 'niet-beschikbaar', code: 'PROEF_GEEN_ANTWOORD', tijd: new Date().toISOString(), stappen: [], migraties: [], log: ['root reageerde niet binnen 3 minuten (mijn-ruimte-proef.path?)'] });
    return s.antwoord;
  }
  s.antwoord = proefVerwerken(s.antwoord, u, (n) => s.sql.get(n));
  await auditToevoegen({ ownerId: eigenaar, actorId: eigenaar, action: 'uitrol_migratieproef', type: 'beveiliging', result: u.ok ? 'ok' : 'denied', service: 'admin',
    details: { id: s.antwoord.id, status: u.status, migraties: u.migraties.map((m) => ({ naam: m.naam, ms: m.ms, ok: m.ok, code: m.fout?.code })) } }).catch(() => undefined);
  return s.antwoord;
}

/** Alleen voor tests. */
export const _sessies = SESSIES;
