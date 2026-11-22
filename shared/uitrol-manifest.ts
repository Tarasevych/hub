// UI-010 / BUG-004: gestructureerde, tweetalige release-metadata en gedetailleerde testuitslag in het uitrolpakket.
// Eén bron voor browser (src/platform/tar-lezen.ts), voorcontrole van de site (backend/uitrol-voorcontrole.ts) en /api/version
// (backend/uitgave-info.ts). Geen nieuwe validator: dit zijn extra regels binnen de bestaande controles.
//
// Bestanden in de bovenmap van het pakket (naast UITROL-VERSIE, AUTEUR, AGENT, SAMENVATTING, BRON-COMMIT):
//   UITROL-MANIFEST.json — schema 1, zie deploy/REGELS-UITROLPAKKET.md §5. Verplicht voor UITROL-VERSIE ≥ MANIFEST_VERPLICHT_VANAF.
//   TESTRESULTATEN       — JSON; vanaf formaat 2 met lijst falende testbestanden en vergelijking met de basisversie.
// Oude pakketten (vóór de grens, zonder manifest) blijven installeerbaar: dan tonen we SAMENVATTING met «мова оригіналу»
// en «деталі недоступні в цьому пакеті» — er wordt niets vertaald of verzonnen.

export const MANIFEST_BESTAND = 'UITROL-MANIFEST.json';
export const MANIFEST_MAX = 64_000;
export const TESTRESULTATEN_MAX = 64_000;
/** Pakketten met een nieuwere UITROL-VERSIE moeten een geldig manifest hebben (beleid voor verouderde formaten: daarvóór vrijwillig). */
export const MANIFEST_VERPLICHT_VANAF = '20261101-000000';

export type Taal = 'uk' | 'nl';
export type Beschrijving = { titel: string; samenvatting: string; wijzigingen: string[]; fixes: string[]; beperkingen: string[]; instructies: string };
export type Rol = 'ontwikkeling' | 'controle' | 'testen' | 'verpakken' | 'auteur';
export const ROLLEN: readonly Rol[] = ['ontwikkeling', 'controle', 'testen', 'verpakken', 'auteur'];
/** Herkomst van de model-id: door de omgeving bevestigd, door de auteur beweerd, of eerlijk onbekend. */
export type ModelBron = 'omgeving' | 'auteur' | 'onbekend';
export type Deelnemer = {
  soort: 'mens' | 'ai';
  naam: string;
  rollen: Rol[];
  platform?: string; tool?: string;
  model?: { id: string | null; versie: string | null; bron: ModelBron };
};
/**
 * BIJDRAGE-001: хто що зробив у цьому випуску (з обліку orchestratie/bijdragen/). Необов'язкове поле: старі пакети без нього лишаються дійсними.
 * Wie deed wat in deze release; optioneel, oudere pakketten blijven geldig.
 */
export type BijdrageSoort = 'begin' | 'nieuw' | 'herwerkt' | 'afgerond' | 'overname' | 'samenvoeging' | 'herstel' | 'controle' | 'correctie';
export const BIJDRAGE_SOORTEN: readonly BijdrageSoort[] = ['begin', 'nieuw', 'herwerkt', 'afgerond', 'overname', 'samenvoeging', 'herstel', 'controle', 'correctie'];
export type ManifestBijdrage = {
  taakId: string; tijd: string; soort: BijdrageSoort;
  wie: { soort: 'ai' | 'mens'; naam: string; model?: string | null; platform?: string | null };
  /** KLIMOP-018: первинний (помилковий) виконавець, якщо запис виправлено окремим записом «correctie». */
  eerderGeregistreerd?: { naam: string; model?: string | null };
  opdrachtgever?: { naam: string };
  wat: { uk: string; nl?: string }; waarom?: { uk: string; nl?: string };
  tak?: string | null; pr?: number | null;
};
export const MANIFEST_BIJDRAGEN_MAX = 200;
/** VERWIJZING-001: посилання з людською назвою, підсумком і станом (гілка, запит на злиття, коміт, міграція, задача). */
export const VERWIJZING_SOORTEN = ['pr', 'tak', 'commit', 'migratie', 'taak'] as const;
export type VerwijzingSoort = typeof VERWIJZING_SOORTEN[number];
export const VERWIJZING_STATEN = ['open', 'samengevoegd', 'gesloten', 'verwijderd', 'onbekend'] as const;
export type VerwijzingStaat = typeof VERWIJZING_STATEN[number];
export type ManifestVerwijzing = {
  soort: VerwijzingSoort; id: string | number; label: string; titel: { uk: string; nl?: string }; samenvatting?: { uk: string; nl?: string };
  staat?: VerwijzingStaat; tijd?: string; wie?: string; waarom?: { uk: string; nl?: string };
  /** Коміт злиття (або коміт, що додав міграцію). */ commit?: string;
  /** Останній коміт гілки: за ним гілку можна відкрити й відновити навіть після видалення. */ laatsteCommit?: string;
  /** Куди злито (гілка). */ in?: string; /** Куди ввійшла робота закритого запиту чи видаленої гілки («№139», «UPD-002»). */ opgenomenIn?: string;
  tak?: string; pr?: number; bestaat?: boolean; takWeg?: boolean; pad?: string; bron?: string; taken: string[];
};
export const MANIFEST_VERWIJZINGEN_MAX = 300;
export type Manifest = {
  schema: 1;
  versie: string;
  aangemaakt: string;
  herkomst: string;
  auteur: string;
  zonderAi: boolean;
  deelnemers: Deelnemer[];
  beschrijving: Record<Taal, Beschrijving>;
  bijdragen?: ManifestBijdrage[];
  verwijzingen?: ManifestVerwijzing[];
};
export type ManifestFout = { veld: string; uk: string; nl: string };

const str = (x: unknown, max = 4000) => (typeof x === 'string' ? x.replace(/\0/g, '').trim().slice(0, max) : '');
const lijst = (x: unknown) => (Array.isArray(x) ? x.map((y) => str(y, 1000)).filter(Boolean).slice(0, 60) : []);
/** «Claude», «Grok», «GPT», «AutoClaw» zijn platforms/families, geen model-id. */
const ALLEEN_FAMILIE = /^(claude|grok|gpt|gemini|cursor|copilot|autoclaw|openclaw|zhipu|llama|mistral|ai|llm|onbekend|unknown|невідомо)$/i;
/** З цієї версії заборонені псевдоніми («Власник», «Eigenaar») замість імені облікового запису та «onbekend»/null замість справжньої моделі ШІ. */
export const MANIFEST_STRIKT_VANAF = '20261106-000000';
export const GENERIEKE_AUTEUR = /^(власник|eigenaar|owner|admin|administrator|адміністратор|user|користувач|gebruiker|автор|auteur|author|невідомо|onbekend|unknown)$/i;

/** Valideert het manifest. Geeft het genormaliseerde manifest en een lijst concrete fouten (veldnaam + hoe te herstellen). */
export function valideerManifest(ruw: string | null | undefined, versie: string): { manifest: Manifest | null; fouten: ManifestFout[] } {
  const fouten: ManifestFout[] = [];
  const f = (veld: string, uk: string, nl: string) => fouten.push({ veld, uk, nl });
  let j: Record<string, any>;
  try { j = JSON.parse(String(ruw ?? '')); } catch { f(MANIFEST_BESTAND, 'файл не є дійсним JSON — збережіть його як UTF-8 JSON', 'bestand is geen geldige JSON — sla het op als UTF-8 JSON'); return { manifest: null, fouten }; }
  if (!j || typeof j !== 'object' || Array.isArray(j)) { f(MANIFEST_BESTAND, 'очікується JSON-об\'єкт', 'een JSON-object verwacht'); return { manifest: null, fouten }; }
  if (j.schema !== 1) f('schema', 'має бути 1', 'moet 1 zijn');
  if (str(j.versie) !== versie) f('versie', `має дорівнювати UITROL-VERSIE (${versie || '—'})`, `moet gelijk zijn aan UITROL-VERSIE (${versie || '—'})`);
  const strikt = /^[0-9]{8}-[0-9]{6}$/.test(versie) && versie >= MANIFEST_STRIKT_VANAF;
  const aangemaakt = str(j.aangemaakt, 40);
  if (!aangemaakt || Number.isNaN(Date.parse(aangemaakt))) f('aangemaakt', 'дата створення у форматі ISO 8601, напр. 2026-10-29T19:00:00+01:00', 'aanmaakdatum in ISO 8601, bv. 2026-10-29T19:00:00+01:00');
  const herkomst = str(j.herkomst, 500);
  if (herkomst.length < 5) f('herkomst', 'звідки код (репозиторій/гілка/база), мінімум 5 символів', 'herkomst van de code (repo/branch/basis), minstens 5 tekens');
  const auteur = str(j.auteur, 200);
  if (auteur.length < 3) f('auteur', 'ім\'я автора випуску (мінімум 3 символи)', 'naam van de auteur (minstens 3 tekens)');
  else if (strikt && GENERIEKE_AUTEUR.test(auteur)) f('auteur', 'псевдоніми на кшталт «Власник» заборонені — вкажіть справжнє ім\'я або ел. пошту облікового запису власника', 'aliassen zoals «Власник» zijn verboden — geef de echte naam of het e-mailadres van het eigenaarsaccount');
  const zonderAi = j.zonderAi === true;
  const deelnemers: Deelnemer[] = [];
  const ruweD = Array.isArray(j.deelnemers) ? j.deelnemers.slice(0, 30) : [];
  if (!Array.isArray(j.deelnemers) || !ruweD.length) f('deelnemers', 'список учасників (людина й кожен ШІ-агент) з ролями', 'lijst deelnemers (mens en elke AI-agent) met rollen');
  ruweD.forEach((d: any, i: number) => {
    const p = `deelnemers[${i}]`;
    const soort = d?.soort === 'ai' ? 'ai' : d?.soort === 'mens' ? 'mens' : null;
    if (!soort) f(`${p}.soort`, 'має бути «ai» або «mens»', 'moet «ai» of «mens» zijn');
    const naam = str(d?.naam, 80);
    if (!naam) f(`${p}.naam`, 'назва агента чи ім\'я людини', 'naam van agent of persoon');
    else if (strikt && soort === 'mens' && GENERIEKE_AUTEUR.test(naam)) f(`${p}.naam`, 'псевдоніми на кшталт «Власник» заборонені — вкажіть справжнє ім\'я або ел. пошту облікового запису', 'aliassen zoals «Власник» zijn verboden — geef de echte naam of het e-mailadres van het account');
    const rollen = (Array.isArray(d?.rollen) ? d.rollen : []).filter((r: unknown) => ROLLEN.includes(r as Rol)) as Rol[];
    if (!rollen.length) f(`${p}.rollen`, `хоча б одна роль: ${ROLLEN.join(', ')}`, `minstens één rol: ${ROLLEN.join(', ')}`);
    const dn: Deelnemer = { soort: soort || 'mens', naam, rollen };
    if (soort === 'ai') {
      dn.platform = str(d?.platform, 80); dn.tool = str(d?.tool, 80);
      if (!dn.platform || (strikt && /^(onbekend|unknown|невідомо)$/i.test(dn.platform))) f(`${p}.platform`, 'платформа агента, напр. «Google Antigravity», «Cursor», «Claude Code» (не порожнє і не «невідомо»)', 'platform van de agent, bv. «Google Antigravity», «Cursor», «Claude Code» (niet leeg en niet «onbekend»)');
      if (!dn.tool || (strikt && /^(onbekend|unknown|невідомо)$/i.test(dn.tool))) f(`${p}.tool`, 'інструмент, через який агент працював (не порожнє і не «невідомо»)', 'tool waarmee de agent werkte (niet leeg en niet «onbekend»)');
      const m = d?.model ?? {}; const bron: ModelBron = m.bron === 'omgeving' || m.bron === 'auteur' ? m.bron : 'onbekend';
      const id = str(m.id, 120) || null; const mv = str(m.versie, 80) || null;
      if (strikt) {
        if (m.bron !== 'omgeving' && m.bron !== 'auteur') f(`${p}.model.bron`, 'вкажіть «omgeving» (підтверджено середовищем) або «auteur» (заявлено автором); «onbekend» заборонено', 'geef «omgeving» of «auteur»; «onbekend» is verboden');
        if (!id || ALLEEN_FAMILIE.test(id)) f(`${p}.model.id`, 'вкажіть справжній конкретний ідентифікатор моделі (напр. «claude-opus-4-6»); порожнє значення або «модель невідома» заборонені', 'geef een echte concrete model-id (bv. «claude-opus-4-6»); leeg of «model onbekend» is verboden');
      } else {
        if (m.bron !== 'omgeving' && m.bron !== 'auteur' && m.bron !== 'onbekend') f(`${p}.model.bron`, 'звідки відомо модель: «omgeving» (підтверджено середовищем), «auteur» (заявлено автором) або «onbekend»', 'bron van het model: «omgeving», «auteur» of «onbekend»');
        if (bron !== 'onbekend' && (!id || ALLEEN_FAMILIE.test(id))) f(`${p}.model.id`, 'конкретний ідентифікатор моделі (не лише «Claude»/«Grok»/«GPT»); якщо невідомо — bron «onbekend» і id null', 'concrete model-id (niet alleen «Claude»/«Grok»/«GPT»); onbekend → bron «onbekend» en id null');
        if (bron === 'onbekend' && id) f(`${p}.model.id`, 'при bron «onbekend» id має бути null — не вгадуйте модель', 'bij bron «onbekend» moet id null zijn — raad het model niet');
      }
      dn.model = { id: bron === 'onbekend' ? null : id, versie: bron === 'onbekend' ? null : mv, bron };
    }
    deelnemers.push(dn);
  });
  const ai = deelnemers.filter((d) => d.soort === 'ai');
  if (zonderAi && ai.length) f('zonderAi', 'zonderAi=true, але в списку є ШІ-агенти', 'zonderAi=true, maar er staan AI-agenten in de lijst');
  if (!zonderAi && !ai.length && ruweD.length) f('zonderAi', 'немає жодного ШІ-агента: для ручного випуску вкажіть явно "zonderAi": true', 'geen AI-agent: zet voor een handmatige release uitdrukkelijk "zonderAi": true');
  if (zonderAi && !deelnemers.some((d) => d.soort === 'mens' && d.rollen.includes('ontwikkeling'))) f('deelnemers', 'для випуску без ШІ потрібна людина з роллю «ontwikkeling»', 'voor een release zonder AI is een mens met rol «ontwikkeling» nodig');
  const beschrijving = {} as Record<Taal, Beschrijving>;
  for (const t of ['uk', 'nl'] as Taal[]) {
    const b = j.beschrijving?.[t];
    const be: Beschrijving = { titel: str(b?.titel, 200), samenvatting: str(b?.samenvatting, 4000), wijzigingen: lijst(b?.wijzigingen), fixes: lijst(b?.fixes), beperkingen: lijst(b?.beperkingen), instructies: str(b?.instructies, 4000) };
    if (be.titel.length < 3) f(`beschrijving.${t}.titel`, `назва випуску мовою ${t}`, `titel van de release in het ${t === 'uk' ? 'Oekraïens' : 'Nederlands'}`);
    if (be.samenvatting.length < 20) f(`beschrijving.${t}.samenvatting`, `короткий підсумок мовою ${t} (мінімум 20 символів)`, `korte samenvatting in het ${t === 'uk' ? 'Oekraïens' : 'Nederlands'} (minstens 20 tekens)`);
    if (t === 'uk' && be.samenvatting && !/[\u0400-\u04FF]/.test(be.samenvatting)) f('beschrijving.uk.samenvatting', 'український текст має містити кирилицю — схоже, тут інша мова', 'de Oekraïense tekst bevat geen Cyrillisch — lijkt een andere taal');
    beschrijving[t] = be;
  }
  const lengtes = (t: Taal) => [beschrijving[t].wijzigingen.length, beschrijving[t].fixes.length, beschrijving[t].beperkingen.length].join('/');
  if (lengtes('uk') !== lengtes('nl')) f('beschrijving', `переліки uk і nl мають містити однакову кількість пунктів (uk ${lengtes('uk')}, nl ${lengtes('nl')})`, `de lijsten uk en nl moeten evenveel punten hebben (uk ${lengtes('uk')}, nl ${lengtes('nl')})`);
  const bijdragen = leesManifestBijdragen(j.bijdragen, f);
  const verwijzingen = leesManifestVerwijzingen(j.verwijzingen);
  if (fouten.length) return { manifest: null, fouten };
  return { manifest: { schema: 1, versie, aangemaakt, herkomst, auteur, zonderAi, deelnemers, beschrijving, ...(bijdragen ? { bijdragen } : {}), ...(verwijzingen ? { verwijzingen } : {}) }, fouten };
}

/** BIJDRAGE-001: перевірка поля bijdragen (необов'язкове). Повертає null, якщо поля немає. */
function leesManifestBijdragen(ruw: unknown, f: (veld: string, uk: string, nl: string) => void): ManifestBijdrage[] | null {
  if (ruw === undefined) return null;
  if (!Array.isArray(ruw) || ruw.length > MANIFEST_BIJDRAGEN_MAX) { f('bijdragen', `список до ${MANIFEST_BIJDRAGEN_MAX} записів «хто що зробив»`, `lijst van max. ${MANIFEST_BIJDRAGEN_MAX} bijdragen`); return null; }
  const uit: ManifestBijdrage[] = [];
  ruw.forEach((b: any, i: number) => {
    const p = `bijdragen[${i}]`;
    const taakId = str(b?.taakId, 20); const soort = b?.soort as BijdrageSoort; const wieSoort = b?.wie?.soort === 'ai' ? 'ai' : b?.wie?.soort === 'mens' ? 'mens' : null;
    const wieNaam = str(b?.wie?.naam, 80); const watUk = str(b?.wat?.uk, 1000); const tijd = str(b?.tijd, 40);
    if (!/^[A-Z][A-Z0-9]{1,9}-\d{3,5}$/.test(taakId)) { f(`${p}.taakId`, 'ідентифікатор задачі ABC-001', 'taak-id ABC-001'); return; }
    if (!BIJDRAGE_SOORTEN.includes(soort)) { f(`${p}.soort`, `одне з ${BIJDRAGE_SOORTEN.join(', ')}`, `een van ${BIJDRAGE_SOORTEN.join(', ')}`); return; }
    if (!wieSoort || !wieNaam) { f(`${p}.wie`, 'хто виконав: soort ai|mens і назва', 'wie: soort ai|mens en naam'); return; }
    if (wieSoort === 'ai' && (!str(b?.wie?.model, 120) || ALLEEN_FAMILIE.test(str(b?.wie?.model, 120)))) { f(`${p}.wie.model`, 'конкретна модель ШІ, не лише назва родини', 'concreet AI-model'); return; }
    if (watUk.length < 10 || !/[\u0400-\u04FF]/.test(watUk)) { f(`${p}.wat.uk`, 'що зроблено, українською (≥ 10 символів)', 'wat er gedaan is, in het Oekraïens'); return; }
    if (!tijd || Number.isNaN(Date.parse(tijd))) { f(`${p}.tijd`, 'дата й час ISO 8601', 'ISO 8601'); return; }
    const prRuw = b?.pr; const pr = Number.isInteger(prRuw) && prRuw > 0 ? prRuw : null;
    uit.push({
      taakId, tijd, soort,
      wie: { soort: wieSoort, naam: wieNaam, ...(wieSoort === 'ai' ? { model: str(b?.wie?.model, 120), platform: str(b?.wie?.platform, 80) || null } : {}) },
      ...(str(b?.eerderGeregistreerd?.naam, 80) ? { eerderGeregistreerd: { naam: str(b.eerderGeregistreerd.naam, 80), ...(str(b?.eerderGeregistreerd?.model, 120) ? { model: str(b.eerderGeregistreerd.model, 120) } : {}) } } : {}),
      ...(str(b?.opdrachtgever?.naam, 120) ? { opdrachtgever: { naam: str(b?.opdrachtgever?.naam, 120) } } : {}),
      wat: { uk: watUk, ...(str(b?.wat?.nl, 1000) ? { nl: str(b?.wat?.nl, 1000) } : {}) },
      ...(str(b?.waarom?.uk, 1000) ? { waarom: { uk: str(b?.waarom?.uk, 1000), ...(str(b?.waarom?.nl, 1000) ? { nl: str(b?.waarom?.nl, 1000) } : {}) } } : {}),
      tak: str(b?.tak, 200) || null, pr,
    });
  });
  return uit;
}

const SHA = /^[0-9a-f]{7,40}$/;
const TAK = /^(?!-)(?!.*\.\.)[A-Za-z0-9._\/-]{1,200}$/;
const PAD = /^(?!\/)(?!.*\.\.)[A-Za-z0-9._\/-]{1,300}$/;
const tekst2 = (x: any, max: number) => (str(x?.uk, max) ? { uk: str(x.uk, max), ...(str(x?.nl, max) ? { nl: str(x.nl, max) } : {}) } : null);

/**
 * VERWIJZING-001: перевірка поля verwijzingen (необов'язкове). Посилання лише довідкові, тому хибний запис мовчки відкидається
 * і не блокує встановлення; null, якщо поля немає. Verwijzingen zijn informatief: ongeldige items vallen weg zonder de installatie te blokkeren.
 */
function leesManifestVerwijzingen(ruw: unknown): ManifestVerwijzing[] | null {
  if (ruw === undefined) return null;
  if (!Array.isArray(ruw)) return null;
  const uit: ManifestVerwijzing[] = [];
  ruw.slice(0, MANIFEST_VERWIJZINGEN_MAX).forEach((v: any) => {
    const soort = v?.soort as VerwijzingSoort;
    if (!VERWIJZING_SOORTEN.includes(soort)) return;
    const id = soort === 'pr' ? (Number.isInteger(v?.id) && v.id > 0 ? v.id : null) : str(v?.id, 200) || null;
    const titel = tekst2(v?.titel, 140);
    if (id === null || !titel || !str(v?.label, 200)) return;
    if (soort === 'tak' && !TAK.test(String(id))) return;
    const staat = VERWIJZING_STATEN.includes(v?.staat) ? (v.staat as VerwijzingStaat) : undefined;
    const sha = (x: unknown) => (typeof x === 'string' && SHA.test(x) ? x : undefined);
    const taken = Array.isArray(v?.taken) ? v.taken.map((t: unknown) => str(t, 20)).filter((t: string) => /^[A-Z][A-Z0-9]{1,9}-\d{3,5}$/.test(t)).slice(0, 20) : [];
    const r: ManifestVerwijzing = { soort, id, label: str(v.label, 200), titel, taken };
    const sv = tekst2(v?.samenvatting, 400); if (sv) r.samenvatting = sv;
    if (staat) r.staat = staat;
    const tijd = str(v?.tijd, 40); if (tijd && !Number.isNaN(Date.parse(tijd))) r.tijd = tijd;
    const wie = str(v?.wie, 120); if (wie) r.wie = wie;
    const waarom = tekst2(v?.waarom, 600); if (waarom) r.waarom = waarom;
    const c = sha(v?.commit); if (c) r.commit = c;
    const lc = sha(v?.laatsteCommit); if (lc) r.laatsteCommit = lc;
    const bron = sha(v?.bron); if (bron) r.bron = bron;
    const inTak = str(v?.in, 200); if (inTak && TAK.test(inTak)) r.in = inTak;
    const tak = str(v?.tak, 200); if (tak && TAK.test(tak)) r.tak = tak;
    const opg = str(v?.opgenomenIn, 120); if (opg) r.opgenomenIn = opg;
    if (Number.isInteger(v?.pr) && v.pr > 0) r.pr = v.pr;
    const pad = str(v?.pad, 300); if (pad && PAD.test(pad)) r.pad = pad;
    if (v?.bestaat === true) r.bestaat = true;
    if (v?.takWeg === true) r.takWeg = true;
    uit.push(r);
  });
  return uit;
}

export const manifestVerplicht = (versie: string) => /^[0-9]{8}-[0-9]{6}$/.test(versie) && versie >= MANIFEST_VERPLICHT_VANAF;

// ---------------------------------------------------------------- TESTRESULTATEN
export type FalendeTest = { bestand: string; aantal: number | null; ookOpBasis: boolean | null; reden?: string };
export type TestUitslag = {
  geslaagd: number | null; mislukt: number | null; samenvatting: string;
  /** null = formaat 1 (alleen getallen): «деталі недоступні в цьому пакеті». */
  falend: FalendeTest[] | null;
  basis: { versie: string; geslaagd: number | null; mislukt: number | null } | null;
  uitleg: { uk: string; nl: string } | null;
};
const getal = (x: unknown) => (x !== null && x !== '' && Number.isInteger(Number(x)) && Number(x) >= 0 && Number(x) < 1e7 ? Number(x) : null);

/** Leest TESTRESULTATEN (formaat 1 of 2). null als het bestand ontbreekt/kapot is of geen getallen heeft. */
export function leesTestresultaten(ruw: string | null | undefined): TestUitslag | null {
  let tr: any; try { tr = JSON.parse(String(ruw || 'null')); } catch { return null; }
  if (!tr || typeof tr !== 'object') return null;
  const g = getal(tr.geslaagd ?? tr.passed), m = getal(tr.mislukt ?? tr.failed);
  if (g == null && m == null) return null;
  const falend = Array.isArray(tr.falend) ? tr.falend.slice(0, 300).map((x: any): FalendeTest => ({
    bestand: str(typeof x === 'string' ? x : x?.bestand, 300), aantal: getal(x?.aantal), ookOpBasis: typeof x?.ookOpBasis === 'boolean' ? x.ookOpBasis : null, ...(str(x?.reden, 300) ? { reden: str(x?.reden, 300) } : {}),
  })).filter((x: FalendeTest) => x.bestand) : null;
  const b = tr.basis && typeof tr.basis === 'object' ? { versie: str(tr.basis.versie, 40), geslaagd: getal(tr.basis.geslaagd), mislukt: getal(tr.basis.mislukt) } : null;
  const u = tr.uitleg && typeof tr.uitleg === 'object' && (str(tr.uitleg.uk) || str(tr.uitleg.nl)) ? { uk: str(tr.uitleg.uk, 2000), nl: str(tr.uitleg.nl, 2000) } : null;
  return { geslaagd: g, mislukt: m, samenvatting: str(tr.samenvatting ?? tr.summary, 2000), falend, basis: b, uitleg: u };
}

/** Regels voor de details van de voorcontrole: per falend bestand «bekend» of «NIEUW». */
export function testDetails(t: TestUitslag): string[] {
  if (!t.falend) return [];
  return t.falend.map((x) => `${x.ookOpBasis === true ? '[ook op basis] ' : x.ookOpBasis === false ? '[NIEUW] ' : '[?] '}${x.bestand}${x.aantal != null ? ` (${x.aantal})` : ''}${x.reden ? ` — ${x.reden}` : ''}`);
}

/** Taalkeuze met eerlijke terugval: geeft tekst + de taal waarin hij werkelijk staat. */
export function kiesBeschrijving(m: Pick<Manifest, 'beschrijving'> | null | undefined, taal: Taal, oud: string | null): { tekst: Beschrijving | null; oud: string | null; taal: Taal | 'origineel' } {
  if (m?.beschrijving?.[taal]?.samenvatting) return { tekst: m.beschrijving[taal], oud: null, taal };
  const ander: Taal = taal === 'uk' ? 'nl' : 'uk';
  if (m?.beschrijving?.[ander]?.samenvatting) return { tekst: m.beschrijving[ander], oud: null, taal: ander };
  return { tekst: null, oud, taal: 'origineel' };
}
/** Raadt NIET de taal; alleen zichtbaar of een oude SAMENVATTING Cyrillisch bevat (dan uk), anders «оригінал (латиниця)». */
export const oudeTaal = (s: string | null | undefined): Taal | null => (!s ? null : /[\u0400-\u04FF]/.test(s) ? 'uk' : null);

/** Foto van een account voor uitroloverzicht en deelnemers: https-adres of data-afbeelding uit het persoonlijke kabinet (tot 360 KB base64). */
export function fotoVeilig(waarde: unknown): string {
  const raw = String(waarde || '').trim();
  if (!raw) return '';
  if (/^data:image\/(?:jpeg|png|webp|svg\+xml|x-icon|vnd\.microsoft\.icon);base64,[A-Za-z0-9+/=]+$/.test(raw)) return raw.length <= 360_000 ? raw : '';
  try {
    const u = new URL(raw); const host = u.hostname.toLowerCase();
    if (u.protocol !== 'https:' || u.username || u.password || !(host === 'googleusercontent.com' || host.endsWith('.googleusercontent.com') || host === 'avatars.githubusercontent.com' || host.endsWith('.githubusercontent.com'))) return '';
    u.hash = ''; return u.toString().slice(0, 2048);
  } catch { return ''; }
}

/** Kiest de eerste geldige profielfoto uit een gebruikersrecord (customPhoto, customPicture, picture, providerPicture). */
export function kiesAccountFoto(r: Record<string, unknown> | null | undefined): string {
  if (!r) return '';
  for (const v of [r.customPhoto, typeof r.customPicture === 'string' ? r.customPicture : '', r.picture, r.providerPicture]) {
    const veilig = fotoVeilig(v);
    if (veilig) return veilig;
  }
  return '';
}

export type DeelnemerAccount = { id?: string; naam?: string; email?: string; label?: string; foto?: string | null };

/** Повертає справжнє ім'я або ел. пошту облікового запису власника замість загальних псевдонімів на кшталт «Власник». */
export function mensWeergaveNaam(naam: string | null | undefined, account?: DeelnemerAccount | null): string {
  const schoon = (naam || '').trim();
  const accNaam = (account?.naam || '').trim();
  const accEmail = (account?.email || '').trim();
  const accVol = accNaam && accEmail ? `${accNaam} (${accEmail})` : accNaam || accEmail;
  if ((!schoon || GENERIEKE_AUTEUR.test(schoon)) && accVol) return accVol;
  return schoon || accVol || '';
}

const EMAIL_RE = /[^\s()<>,;]+@[^\s()<>,;]+\.[^\s()<>,;]+/g;
const kleine = (s?: string | null) => (s || '').trim().toLowerCase();
/** Ел. адреси, згадані в імені учасника («Павло Тарасевич (pavlo@…)»). · E-mailadressen in de naam van een deelnemer. */
export const emailsInNaam = (naam: string | null | undefined): string[] => [...(naam || '').matchAll(EMAIL_RE)].map((m) => kleine(m[0]));
/** Ім'я без ел. адреси в дужках, для порівняння імен. · Naam zonder het e-mailadres tussen haakjes. */
const kaleNaam = (naam: string | null | undefined) => kleine((naam || '').replace(/\([^)]*@[^)]*\)/g, '').replace(EMAIL_RE, '')).replace(/\s+/g, ' ');

/**
 * Чи учасник-людина — це той, хто зараз дивиться сторінку (`account` = data.ik): за ел. адресою, за точним ім'ям або загальним псевдонімом.
 * Is deze menselijke deelnemer de kijker zelf: op e-mailadres, exacte naam of een generieke alias («Власник»).
 */
export function isEigenAccount(naam: string | null | undefined, account?: DeelnemerAccount | null): boolean {
  if (!account) return false;
  const mails = emailsInNaam(naam); const eigen = kleine(account.email);
  if (mails.length) return !!eigen && mails.includes(eigen);
  const kaal = kaleNaam(naam);
  return !kaal || GENERIEKE_AUTEUR.test(kaal) || (!!kleine(account.naam) && kaal === kaleNaam(account.naam));
}

/**
 * Фото профілю учасника-людини. Порядок (15.11.2026, скарга власника «чуже фото в авторі»):
 *  1) обліковий запис із ТІЄЮ САМОЮ ел. адресою, що в імені автора; 2) сам глядач (data.ik), якщо це він;
 *  3) за ім'ям — лише якщо рівно ОДИН обліковий запис має точно таке ім'я. Інакше — без фото (ініціали).
 * Раніше бралося перше входження підрядка: обліковий запис «Павло Тарасевич» (інша адреса, старе фото Google) збігався
 * з «Павло Тарасевич (pavlo@…)» раніше за справжній, бо список відсортовано за адресою.
 * Foto van een menselijke deelnemer: eerst exact e-mailadres, dan de kijker zelf, dan een unieke exacte naam; nooit een deeltekst.
 */
export function mensFotoUitAccount(naam: string | null | undefined, account?: DeelnemerAccount | null, accounts?: readonly DeelnemerAccount[]): string {
  const lijst = accounts || [];
  const mails = emailsInNaam(naam);
  if (mails.length) {
    if (account && mails.includes(kleine(account.email))) return fotoVeilig(account.foto);
    const opMail = lijst.find((a) => mails.includes(kleine(a.email || (a.label?.includes('@') ? a.label : ''))));
    return opMail ? fotoVeilig(opMail.foto) : '';
  }
  if (isEigenAccount(naam, account)) return fotoVeilig(account?.foto);
  const kaal = kaleNaam(naam);
  if (!kaal) return '';
  const opNaam = lijst.filter((a) => kaleNaam(a.naam) === kaal);
  return opNaam.length === 1 ? fotoVeilig(opNaam[0].foto) : '';
}


