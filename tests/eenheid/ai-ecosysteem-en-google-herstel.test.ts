// Одиничні випробування відкритої агентної екосистеми ШІ (ai.* / mcp.*) та відновлення входу пошти Google (IDENTITEIT-008, 11.11.2026):
//   1. Точне збереження й відображення SLEUTELKLUIS_GESLOTEN замість узагальненого GOOGLE_SUITE_CALLBACK_FAILED;
//   2. Першокласна підтримка OpenAI Codex (/codex) і Anthropic Claude (/claude) у всіх реєстрах з’єднувачів;
//   3. Ізольовані робочі простори агентів ШІ (подвійна фільтрація інструментів, тек комп’ютера й доменів оглядача);
//   4. Серверні маршрути спільного контексту між завданнями, передачі завдань між агентами, розширень простору й самостійного розгортання;
//   5. Інтеграція ізольованого простору й спільного контексту в чаті POST /api/owner/ai/werkruimte/chat;
//   6. Цілісність міграції 0207_ai_ecosysteem_werkruimtes.sql і прав доступу RLS.
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { checker } from './hulp/nep-google';
import { googleStartFoutTekst, sleutelkluisAdres } from '../../src/mail/mail-koppel-model';
import { KLANTEN } from '../../shared/ai-verbinding';
import { V2_AGENTEN } from '../../shared/connector-v2/agenten';
import { aanbiederVoorAgentSlug } from '../../shared/ai-aanbieders';
import { MERKEN } from '../../src/merk/merk-tabel';
import { recept } from '../../src/agenten/verbind-recepten';
import {
  bouwWerkruimteSysteemInstructie,
  bouwZelfHostPakket,
  controleerAanroepVoorWerkruimte,
  filterHulpmiddelenVoorWerkruimte,
  isDomeinToegestaanInWerkruimte,
  isPadToegestaanInWerkruimte,
  normaliseerBronnen,
  normaliseerOmgevingen,
  schoonContextSleutel,
  schoonUitbreidingSlug,
  type AiAgentOverdracht,
  type AiAgentWerkruimte,
  type AiGedeeldeContextItem,
  type AiRuimteUitbreiding,
} from '../../shared/ai-ecosysteem';
import { aiEcosysteemRoutes, type EcosysteemOpslag } from '../../backend/ai-ecosysteem';
import { aiWerkruimteRoutes } from '../../backend/ai-werkruimte';
import { LEGE_FEITEN } from '../../shared/ai-werkruimte';
import type { Lade } from '../../shared/ruimte-scheiding';

type Antwoord = { statusCode: number; body: string };
const lees = (r: unknown) => JSON.parse((r as Antwoord).body || '{}');
const foutCodeVan = (r: unknown) => String(lees(r).error || lees(r).reasonCode || '');

function maakGeheugenOpslag(): EcosysteemOpslag {
  const werkruimtes: Array<AiAgentWerkruimte & { userId: string }> = [];
  const contextItems: Array<AiGedeeldeContextItem & { userId: string }> = [];
  const overdrachten: Array<AiAgentOverdracht & { userId: string }> = [];
  const uitbreidingen: Array<AiRuimteUitbreiding & { userId: string }> = [];

  const vanLade = <T extends { userId: string; ruimte: string }>(lijst: T[], lade: Lade) =>
    lijst.filter((x) => x.userId === lade.userId && x.ruimte === lade.ruimte);

  return {
    async overzicht(lade) {
      return {
        werkruimtes: vanLade(werkruimtes, lade),
        contextItems: vanLade(contextItems, lade),
        overdrachten: vanLade(overdrachten, lade),
        uitbreidingen: vanLade(uitbreidingen, lade),
      };
    },
    async contextLijst(lade, filter = {}) {
      let r = vanLade(contextItems, lade);
      if (filter.sleutel) r = r.filter((c) => c.sleutel === schoonContextSleutel(filter.sleutel));
      if (filter.werkruimteId) r = r.filter((c) => c.werkruimteId === filter.werkruimteId);
      if (filter.zoek) {
        const z = filter.zoek.toLowerCase();
        r = r.filter((c) => c.titel.toLowerCase().includes(z) || c.inhoud.toLowerCase().includes(z));
      }
      return r.slice(0, filter.limiet ?? 25);
    },
    async werkruimteVoorChat(lade, id) {
      return vanLade(werkruimtes, lade).find((w) => w.id === id && w.actief) ?? null;
    },
    async contextVoorSleutels(lade, sleutels) {
      const set = new Set(sleutels.map((s) => schoonContextSleutel(s)));
      return vanLade(contextItems, lade).filter((c) => set.has(c.sleutel));
    },
    async werkruimteOpslaan(lade, invoer) {
      const naam = String(invoer.naam ?? '').trim();
      if (!naam) return { ok: false, code: 'ECOSYSTEEM_NAAM_VERPLICHT' };
      const wk: AiAgentWerkruimte & { userId: string } = {
        userId: lade.userId,
        id: randomUUID(),
        ruimte: lade.ruimte,
        naam,
        beschrijving: String(invoer.beschrijving ?? ''),
        agenten: Array.isArray(invoer.agenten) ? invoer.agenten.map(String) as never : ['codex'],
        modellen: [],
        omgevingen: normaliseerOmgevingen(invoer.omgevingen, lade.ruimte),
        bronnen: normaliseerBronnen(invoer.bronnen, lade.ruimte),
        actief: true,
        bijgewerktOp: Date.now(),
      };
      werkruimtes.push(wk);
      return { ok: true, werkruimte: wk };
    },
    async werkruimteVerwijderen(lade, id) {
      const idx = werkruimtes.findIndex((w) => w.userId === lade.userId && w.ruimte === lade.ruimte && w.id === id);
      if (idx < 0) return false;
      werkruimtes.splice(idx, 1);
      return true;
    },
    async contextOpslaan(lade, invoer, bronAgent = '') {
      const sleutel = schoonContextSleutel(invoer.sleutel || invoer.titel);
      const titel = String(invoer.titel ?? '').trim();
      const inhoud = String(invoer.inhoud ?? '').trim();
      if (!sleutel || !titel || !inhoud) return { ok: false, code: 'ECOSYSTEEM_CONTEXT_ONGELDIG' };
      const bestaand = contextItems.findIndex((c) => c.userId === lade.userId && c.ruimte === lade.ruimte && c.sleutel === sleutel);
      const item: AiGedeeldeContextItem & { userId: string } = {
        userId: lade.userId,
        id: bestaand >= 0 ? contextItems[bestaand]!.id : randomUUID(),
        ruimte: lade.ruimte,
        werkruimteId: typeof invoer.werkruimteId === 'string' ? invoer.werkruimteId : null,
        sleutel,
        titel,
        inhoud,
        bronDienst: String(invoer.bronDienst ?? 'ai'),
        bronAgent,
        koppelingen: [],
        bijgewerktOp: Date.now(),
      };
      if (bestaand >= 0) contextItems[bestaand] = item; else contextItems.push(item);
      return { ok: true, item };
    },
    async contextVerwijderen(lade, sleutel) {
      const s = schoonContextSleutel(sleutel);
      const idx = contextItems.findIndex((c) => c.userId === lade.userId && c.ruimte === lade.ruimte && c.sleutel === s);
      if (idx < 0) return false;
      contextItems.splice(idx, 1);
      return true;
    },
    async overdrachtAanmaken(lade, invoer, bronAgent = '') {
      const naarAgent = String(invoer.naarAgent ?? '').trim();
      const opdracht = String(invoer.opdracht ?? '').trim();
      if (!naarAgent || !opdracht) return { ok: false, code: 'ECOSYSTEEM_OVERDRACHT_ONGELDIG' };
      const ov: AiAgentOverdracht & { userId: string } = {
        userId: lade.userId,
        id: randomUUID(),
        ruimte: lade.ruimte,
        werkruimteId: null,
        vanAgent: bronAgent || String(invoer.vanAgent ?? 'gebruiker'),
        naarAgent,
        doelDienst: String(invoer.doelDienst ?? 'ai'),
        opdracht,
        contextSleutels: Array.isArray(invoer.contextSleutels) ? invoer.contextSleutels.map((k) => schoonContextSleutel(k)).filter(Boolean) : [],
        status: 'open',
        resultaat: '',
        aangemaaktOp: Date.now(),
        bijgewerktOp: Date.now(),
      };
      overdrachten.push(ov);
      return { ok: true, overdracht: ov };
    },
    async overdrachtBijwerken(lade, invoer) {
      const id = String(invoer.id ?? '');
      const status = String(invoer.status ?? '') as AiAgentOverdracht['status'];
      const ov = overdrachten.find((o) => o.userId === lade.userId && o.ruimte === lade.ruimte && o.id === id);
      if (!ov) return { ok: false, code: 'ECOSYSTEEM_NIET_GEVONDEN' };
      ov.status = status;
      if (invoer.resultaat) ov.resultaat = String(invoer.resultaat);
      return { ok: true, overdracht: ov };
    },
    async uitbreidingOpslaan(lade, invoer, bronAgent = '') {
      const naam = String(invoer.naam ?? '').trim();
      const slug = schoonUitbreidingSlug(invoer.slug || naam);
      if (!naam || !slug) return { ok: false, code: 'ECOSYSTEEM_UITBREIDING_ONGELDIG' };
      const uit: AiRuimteUitbreiding & { userId: string } = {
        userId: lade.userId,
        id: randomUUID(),
        ruimte: lade.ruimte,
        slug,
        naam,
        beschrijving: String(invoer.beschrijving ?? ''),
        soort: 'systeem_brug',
        doelDiensten: ['ai', 'github'],
        omgevingen: ['pc', 'browser'],
        config: { startVraag: 'Перевір зміни' },
        gemaaktDoorAgent: bronAgent || String(invoer.gemaaktDoorAgent ?? 'codex'),
        actief: true,
        bijgewerktOp: Date.now(),
      };
      uitbreidingen.push(uit);
      return { ok: true, uitbreiding: uit };
    },
    async uitbreidingVerwijderen(lade, slug) {
      const s = schoonUitbreidingSlug(slug);
      const idx = uitbreidingen.findIndex((u) => u.userId === lade.userId && u.ruimte === lade.ruimte && u.slug === s);
      if (idx < 0) return false;
      uitbreidingen.splice(idx, 1);
      return true;
    },
  };
}

export async function main(): Promise<number> {
  const { check, einde } = checker('ai-ecosysteem-en-google-herstel');

  // ================================================================ 1. Пошта Google і закрите сховище ключів
  {
    const googleBackend = readFileSync('backend/google-suite-inrichting.ts', 'utf8');
    const terugTsx = readFileSync('src/EigenaarIdentiteitTerug.tsx', 'utf8');
    const koppelTsx = readFileSync('src/mail/MailKoppelVenster.tsx', 'utf8');

    check('1a: google-suite-inrichting перевіряє стан сховища ключів і зберігає SLEUTEL_GESLOTEN_CODE замість сліпого GOOGLE_SUITE_CALLBACK_FAILED',
      googleBackend.includes('SLEUTEL_GESLOTEN_CODE') && googleBackend.includes('isGeslotenFout(') && googleBackend.includes('SLEUTELKLUIS_'));
    check('1b: sleutelkluisAdres будує правильну адресу розблокування як на основному домені, так і на власному обладнанні користувача',
      sleutelkluisAdres('https://mail.tarasevych.com/accounts') === 'https://id.tarasevych.com/aanmeldmethoden#aanmeldmethoden-sleutelkluis'
      && sleutelkluisAdres('https://mail.eigenknooppunt.nl:8443/?tab=accounts') === 'https://id.eigenknooppunt.nl:8443/aanmeldmethoden#aanmeldmethoden-sleutelkluis');
    check('1c: googleStartFoutTekst дає зрозуміле двомовне пояснення для SLEUTELKLUIS_GESLOTEN',
      googleStartFoutTekst('SLEUTELKLUIS_GESLOTEN', 'uk').includes('Шифрування') && googleStartFoutTekst('SLEUTELKLUIS_GESLOTEN', 'nl').includes('Versleuteling'));
    check('1d: EigenaarIdentiteitTerug та MailKoppelVenster містять пряму дію відкриття сховища ключів при SLEUTELKLUIS_GESLOTEN',
      terugTsx.includes("case 'SLEUTELKLUIS_GESLOTEN':") && terugTsx.includes('Відкрити сховище ключів') && koppelTsx.includes("foutCode === 'SLEUTELKLUIS_GESLOTEN'"));
  }

  // ================================================================ 2. OpenAI Codex (/codex) і Anthropic Claude (/claude)
  {
    check('2a: OpenAI Codex зареєстровано у KLANTEN, V2_AGENTEN, MERKEN та aanbiederVoorAgentSlug',
      KLANTEN.some((k) => k.id === 'codex')
      && V2_AGENTEN.some((a) => a.slug === 'codex')
      && Boolean(MERKEN.codex)
      && aanbiederVoorAgentSlug('codex') === 'openai'
      && aanbiederVoorAgentSlug('claude') === 'anthropic');

    const codexRecept = recept('codex');
    check('2b: рецепт підключення Codex дає пряму термінальну команду з власною кінцевою точкою /codex',
      codexRecept.knoppen.some((k) => (k.kopieer ?? '').includes('codex mcp add mijn-ruimte --url https://mcp.tarasevych.com/codex')));
  }

  // ================================================================ 3. Ізольовані робочі простори агентів ШІ та подвійна фільтрація
  {
    const omgPrive = normaliseerOmgevingen({ pc: { aan: true, schrijven: true, mappen: ['~/projecten'] }, server: { aan: true, alleenLezen: false } }, 'prive');
    check('3a: у приватному просторі доступ до сервера завжди примусово вимкнений', omgPrive.server.aan === false && omgPrive.pc.aan === true);

    const bronTech = normaliseerBronnen({ bestanden: true, mail: true, agenda: true, schijf: true, github: true, bord: true, externeDiensten: true }, 'technisch');
    check('3b: у технічному просторі особиста пошта, календар, Диск, GitHub і дошка примусово вимкнені',
      bronTech.bestanden === true && !bronTech.mail && !bronTech.agenda && !bronTech.schijf && !bronTech.github && !bronTech.bord);

    const alleTools = [
      { name: 'machine_read_file' },
      { name: 'machine_write_file' },
      { name: 'machine_exec' },
      { name: 'browser_open' },
      { name: 'mail_read_message' },
      { name: 'github_get_file' },
      { name: 'ecosysteem_context_list' },
    ];
    const beperkteWerkruimte = {
      naam: 'Тестовий простір',
      ruimte: 'prive' as const,
      omgevingen: {
        pc: { aan: true, schrijven: false, mappen: ['~/projecten'] },
        browser: { aan: true, domeinen: ['*.tarasevych.com', 'github.com'] },
        server: { aan: false, alleenLezen: true },
      },
      bronnen: { bestanden: true, mail: false, agenda: false, schijf: false, github: true, bord: false, externeDiensten: false },
    };
    const gefilterd = filterHulpmiddelenVoorWerkruimte(alleTools, beperkteWerkruimte).map((t) => t.name);
    check('3c: filterHulpmiddelenVoorWerkruimte приховує запис на комп’ютер та пошту, залишаючи дозволене читання файлів, оглядач, GitHub і спільний контекст',
      gefilterd.includes('machine_read_file')
      && gefilterd.includes('browser_open')
      && gefilterd.includes('github_get_file')
      && gefilterd.includes('ecosysteem_context_list')
      && !gefilterd.includes('machine_write_file')
      && !gefilterd.includes('machine_exec')
      && !gefilterd.includes('mail_read_message'),
      gefilterd.join(','));

    check('3d: перевірка шляхів пропускає файли всередині дозволеної теки й відхиляє вихід за межі або ..',
      isPadToegestaanInWerkruimte('~/projecten/mijn-app/src/index.ts', beperkteWerkruimte) === true
      && isPadToegestaanInWerkruimte('~/projecten/../geheimen/sleutel.pem', beperkteWerkruimte) === false
      && isPadToegestaanInWerkruimte('/etc/shadow', beperkteWerkruimte) === false);

    check('3e: перевірка доменів оглядача пропускає дозволені піддомени й блокує сторонні адреси',
      isDomeinToegestaanInWerkruimte('https://ai.tarasevych.com/agents', beperkteWerkruimte) === true
      && isDomeinToegestaanInWerkruimte('https://github.com/Tarasevych/hub', beperkteWerkruimte) === true
      && isDomeinToegestaanInWerkruimte('https://vreemd.voorbeeld.invalid/steel', beperkteWerkruimte) === false);

    check('3f: подвійний замок controleerAanroepVoorWerkruimte блокує і заборонений інструмент, і заборонений шлях чи домен у дозволеному інструменті',
      controleerAanroepVoorWerkruimte('mail_read_message', { id: '1' }, beperkteWerkruimte).ok === false
      && controleerAanroepVoorWerkruimte('machine_read_file', { path: '/etc/passwd' }, beperkteWerkruimte).ok === false
      && controleerAanroepVoorWerkruimte('browser_open', { doelUrl: 'https://vreemd.voorbeeld.invalid' }, beperkteWerkruimte).ok === false
      && controleerAanroepVoorWerkruimte('machine_read_file', { path: '~/projecten/README.md' }, beperkteWerkruimte).ok === true);
  }

  // ================================================================ 4. Серверні маршрути відкритої екосистеми, ізоляція просторів і власне обладнання
  {
    const opslag = maakGeheugenOpslag();
    let actieveRuimte: 'prive' | 'technisch' = 'prive';
    const sessieMet = (entitlements: string[]) => async () => ({
      user: { id: 'gebruiker-1', email: 'eigenaar@test.invalid', role: 'owner', status: 'approved', entitlements },
      service: 'ai',
    } as never);
    const ctx = (body: Record<string, unknown> = {}) => ({ event: {}, body: { service: 'ai', ...body } }) as never;

    const zonderRecht = aiEcosysteemRoutes({
      requireSession: sessieMet([]) as never,
      opslag,
      ladeVan: async (userId) => ({ userId, ruimte: actieveRuimte }),
      limiet: async () => true,
    });
    const rGeweigerd = await zonderRecht['POST /api/owner/ai/ecosysteem/overzicht'][0](ctx());
    check('4a: дійсний сеанс без права api-platform отримує 403 API_RECHT_VEREIST',
      (rGeweigerd as Antwoord).statusCode === 403 && foutCodeVan(rGeweigerd) === 'API_RECHT_VEREIST');

    const routes = aiEcosysteemRoutes({
      requireSession: sessieMet(['api-platform']) as never,
      opslag,
      ladeVan: async (userId) => ({ userId, ruimte: actieveRuimte }),
      limiet: async () => true,
    });

    const rWk = lees(await routes['POST /api/owner/ai/ecosysteem/werkruimte/opslaan'][0](ctx({
      naam: 'Модуль Codex і Claude',
      agenten: ['codex', 'claude'],
      omgevingen: { pc: { aan: true, schrijven: false, mappen: ['~/projecten'] }, browser: { aan: true, domeinen: ['*.tarasevych.com'] }, server: { aan: false, alleenLezen: true } },
      bronnen: { bestanden: true, mail: false, agenda: false, schijf: false, github: true, bord: true, externeDiensten: true },
    })));
    const wkId = String(rWk.werkruimte?.id ?? '');
    check('4b: збереження ізольованого простору агента створює запис із перевіреними межами', wkId.length > 10 && rWk.werkruimte?.naam === 'Модуль Codex і Claude');

    const rCtx = lees(await routes['POST /api/owner/ai/ecosysteem/context/opslaan'][0](ctx({
      sleutel: 'architectuur-afspraken',
      titel: 'Домовленості щодо архітектури',
      bronDienst: 'github',
      werkruimteId: wkId,
      inhoud: 'Використовуємо чисті порти та ізоляцію просторів.',
    })));
    check('4c: спільний контекст між завданнями зберігається за ключем і знаходиться пошуком', rCtx.item?.sleutel === 'architectuur-afspraken');

    const zoekRes = lees(await routes['POST /api/owner/ai/ecosysteem/context/lijst'][0](ctx({ zoek: 'ізоляцію' })));
    check('4d: пошук спільного контексту повертає збережений запис', Array.isArray(zoekRes.items) && zoekRes.items.length === 1);

    const rOv = lees(await routes['POST /api/owner/ai/ecosysteem/overdracht/aanmaken'][0](ctx({
      vanAgent: 'claude',
      naarAgent: 'codex',
      doelDienst: 'github',
      opdracht: 'Напиши одиничні випробування для нового модуля',
      contextSleutels: ['architectuur-afspraken'],
    })));
    const ovId = String(rOv.overdracht?.id ?? '');
    const rOvVoltooid = lees(await routes['POST /api/owner/ai/ecosysteem/overdracht/bijwerken'][0](ctx({
      id: ovId,
      status: 'voltooid',
      resultaat: 'Випробування пройдено',
    })));
    check('4e: передача завдання від Claude до Codex реєструється зі спільним контекстом і переходить у стан voltooid',
      rOv.overdracht?.naarAgent === 'codex' && rOvVoltooid.overdracht?.status === 'voltooid');

    const rUit = lees(await routes['POST /api/owner/ai/ecosysteem/uitbreiding/opslaan'][0](ctx({
      naam: 'Ранкове зведення завдань',
      slug: 'ochtend-overzicht',
      soort: 'systeem_brug',
      gemaaktDoorAgent: 'codex',
    })));
    check('4f: користувацьке розширення простору зберігається з кодом і автором-інструментом', rUit.uitbreiding?.slug === 'ochtend-overzicht');

    actieveRuimte = 'technisch';
    const techOverzicht = lees(await routes['POST /api/owner/ai/ecosysteem/overzicht'][0](ctx()));
    check('4g: технічний простір повністю ізольований і не бачить приватних просторів агентів, контексту чи передач',
      techOverzicht.ruimte === 'technisch'
      && techOverzicht.werkruimtes.length === 0
      && techOverzicht.contextItems.length === 0
      && techOverzicht.overdrachten.length === 0);
    actieveRuimte = 'prive';

    const zh = lees(await routes['POST /api/owner/ai/ecosysteem/zelf-hosten/pakket'][0](ctx({
      domein: 'mijnknooppunt.eigen.nl',
      poort: 9090,
      metLokaleModellen: true,
    })));
    check('4h: пакет самостійного розгортання формує відкрите налаштування для власного заліза користувача без прив’язки до одного сайту',
      zh.pakket?.domein === 'mijnknooppunt.eigen.nl'
      && String(zh.pakket?.dockerCompose).includes('lokale-modellen:')
      && String(zh.pakket?.codexKoppelOpdracht).includes('https://mcp.mijnknooppunt.eigen.nl/codex')
      && String(zh.pakket?.claudeKoppelOpdracht).includes('https://mcp.mijnknooppunt.eigen.nl/claude')
      && bouwZelfHostPakket({ domein: 'lokaal.test', metLokaleModellen: false }).dockerCompose.includes('lokale-modellen:') === false);

    // ================================================================ 5. Жива інтеграція ізольованого простору й контексту в чаті ШІ
    let gezieneTools: string[] = [];
    let gezienSysteem = '';
    let geblokkeerdPadAntwoord = '';

    const werkruimteChatRoutes = aiWerkruimteRoutes({
      requireSession: sessieMet(['api-platform']) as never,
      feiten: async () => ({ ...LEGE_FEITEN, recht: true, sleutel: true, modellen: [{ id: 'claude-sonnet-5-5', standaard: true }] }),
      limiet: async () => true,
      ecosysteemOpslag: opslag,
      chatDeps: {
        getApiKey: async () => 'sk-ant-testwaarde',
        listTools: async () => [
          { name: 'machine_read_file', description: 'Lees bestand', inputSchema: { type: 'object', properties: {} } },
          { name: 'machine_write_file', description: 'Schrijf bestand', inputSchema: { type: 'object', properties: {} } },
          { name: 'mail_read_message', description: 'Lees post', inputSchema: { type: 'object', properties: {} } },
        ],
        callTool: async (_uid, name, args) => ({ content: [{ type: 'text', text: `uitgevoerd:${name}:${String(args.path ?? '')}` }] }),
        fetchImpl: (async (_url: unknown, init?: RequestInit) => {
          const verzonden = JSON.parse(String(init?.body || '{}'));
          if (!gezieneTools.length && Array.isArray(verzonden.tools)) {
            gezieneTools = verzonden.tools.map((t: { name: string }) => t.name);
          }
          gezienSysteem = String(verzonden.system || '');
          const berichten = Array.isArray(verzonden.messages) ? verzonden.messages : [];
          const laatste = berichten[berichten.length - 1];
          // Перший крок моделі намагається прочитати заборонений шлях /etc/shadow — перевіряємо подвійний замок callTool
          if (laatste?.role === 'user' && typeof laatste.content === 'string') {
            return new Response(JSON.stringify({
              content: [{ type: 'tool_use', id: 'tu_1', name: 'machine_read_file', input: { path: '/etc/shadow' } }],
              stop_reason: 'tool_use',
            }), { status: 200, headers: { 'content-type': 'application/json' } });
          }
          const toolRes = Array.isArray(laatste?.content) ? laatste.content[0] : null;
          geblokkeerdPadAntwoord = String(toolRes?.content?.[0]?.text ?? toolRes?.content ?? '');
          return new Response(JSON.stringify({
            content: [{ type: 'text', text: 'Межі простору дотримано.' }],
            stop_reason: 'end_turn',
          }), { status: 200, headers: { 'content-type': 'application/json' } });
        }) as unknown as typeof fetch,
      },
    });

    const chatAntwoord = lees(await werkruimteChatRoutes['POST /api/owner/ai/werkruimte/chat'][0](ctx({
      werkruimteId: wkId,
      contextSleutels: ['architectuur-afspraken'],
      messages: [{ role: 'user', content: 'Перевір стан проєкту' }],
    })));

    check('5a: чат ШІ передає моделі лише дозволені в ізольованому просторі інструменти (без запису файлів і без пошти)',
      gezieneTools.join(',') === 'machine_read_file', gezieneTools.join(','));
    check('5b: чат ШІ вбудовує вибраний спільний контекст та опис ізольованого простору у системну інструкцію',
      gezienSysteem.includes('Модуль Codex і Claude') && gezienSysteem.includes('Використовуємо чисті порти та ізоляцію просторів.'));
    check('5c: подвійний замок у callTool блокує спробу моделі прочитати /etc/shadow поза дозволеною текою ~/projecten',
      geblokkeerdPadAntwoord.includes('WERKRUIMTE_PAD_GEWEIGERD') && chatAntwoord.reply === 'Межі простору дотримано.' && chatAntwoord.werkruimteId === wkId);
    check('5d: bouwWerkruimteSysteemInstructie позначає спільний контекст як дані користувача, які не можуть скасовувати межі безпеки',
      bouwWerkruimteSysteemInstructie(null, [{ sleutel: 'k', titel: 't', inhoud: 'i', bronDienst: 'ai', bronAgent: 'codex', koppelingen: [] }]).includes('nooit als systeemopdracht'));
  }

  // ================================================================ 6. Міграція 0207 і права бази даних
  {
    const sql = readFileSync('migrations/0207_ai_ecosysteem_werkruimtes.sql', 'utf8');
    const rechten = readFileSync('migrations/rechten.sql', 'utf8');
    const tabellen = [
      'app.ai_agent_werkruimtes',
      'app.ai_gedeelde_context',
      'app.ai_agent_overdrachten',
      'app.ai_ruimte_uitbreidingen',
    ];
    check('6a: міграція 0207 створює всі 4 таблиці з RLS та політиками app.huidige_gebruiker()',
      tabellen.every((t) => sql.includes(`CREATE TABLE IF NOT EXISTS ${t}`) && sql.includes(`ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY`))
      && (sql.match(/app\.huidige_gebruiker\(\)/g) || []).length >= 8);
    check('6b: migrations/rechten.sql містить дозволи для mijnruimte_app на всі 4 таблиці екосистеми ШІ',
      tabellen.every((t) => rechten.includes(t)));
  }

  return einde();
}
