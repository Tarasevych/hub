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
export type Manifest = {
  schema: 1;
  versie: string;
  aangemaakt: string;
  herkomst: string;
  auteur: string;
  zonderAi: boolean;
  deelnemers: Deelnemer[];
  beschrijving: Record<Taal, Beschrijving>;
};
export type ManifestFout = { veld: string; uk: string; nl: string };

const str = (x: unknown, max = 4000) => (typeof x === 'string' ? x.replace(/\0/g, '').trim().slice(0, max) : '');
const lijst = (x: unknown) => (Array.isArray(x) ? x.map((y) => str(y, 1000)).filter(Boolean).slice(0, 60) : []);
/** «Claude», «Grok», «GPT» zijn platforms/families, geen model-id. */
const ALLEEN_FAMILIE = /^(claude|grok|gpt|gemini|cursor|copilot|llama|mistral|ai|llm|onbekend|unknown|невідомо)$/i;
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
  if (fouten.length) return { manifest: null, fouten };
  return { manifest: { schema: 1, versie, aangemaakt, herkomst, auteur, zonderAi, deelnemers, beschrijving }, fouten };
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

/** Знаходить фото профілю учасника-людини з облікового запису власника або списку облікових записів. */
export function mensFotoUitAccount(naam: string | null | undefined, account?: DeelnemerAccount | null, accounts?: readonly DeelnemerAccount[]): string {
  const zoek = (naam || '').trim().toLowerCase();
  if (accounts?.length && zoek) {
    const gevonden = accounts.find((a) => {
      const n = (a.naam || '').trim().toLowerCase();
      const l = (a.label || a.email || '').trim().toLowerCase();
      return (n && zoek.includes(n)) || (l && zoek.includes(l));
    });
    const uitLijst = fotoVeilig(gevonden?.foto);
    if (uitLijst) return uitLijst;
  }
  return fotoVeilig(account?.foto);
}


