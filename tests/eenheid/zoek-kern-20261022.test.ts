// ZOEKKERN v2 (Z1, 22.10.2026) — MET DATABASE (PG16, migraties 0093/0094/0100). Contract: shared/zoek-model.ts (uitleg: docs/zoek/ZOEKEN.nl.md §4).
// Toetst: upsert zonder dubbels, overslaan van ongewijzigde versies, verwijderen, exact/voorvoegsel/vaag/synoniem/
// meertalig/surzhyk/transliteratie/deel van een naam/omschrijving, rangschikking (exacte titel > zwakke treffer),
// percent 0–100 monotoon, facets, paginering, suggesties ALLEEN uit eigen lade, C-locale (Харків), twee gebruikers met
// dezelfde titels (ook RLS via SET ROLE mijnruimte_app), prive ≠ technisch, en Precision@k / MRR op de evaluatieset.
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { checker } from './hulp/nep-google';
import { appRolActief, closePool, getPool } from '../../server/platform/pg';
import { SYNONIEM_GROEPEN, SYNONIEM_STATISTIEK, synoniemen } from '../../shared/zoek-synoniemen';
import { lichteStam, taalRaden, varianten, zoekNorm, zoekTokens } from '../../shared/zoek-normalisatie';
import { percentVan, trigramSimilariteit, woordSimilariteit } from '../../shared/zoek-rangschikking';
import { ZOEK_TALEN, type ZoekObject } from '../../shared/zoek-model';
import { aantalInLade, eigenSynoniemZetten, geheimenVerbergen, indexeer, standVanBron, standZetten, suggesties, verwijder, verwijderBron, zoek, zoekInLaden } from '../../backend/zoek-index';

type Eval = { corpus: Array<Omit<ZoekObject, 'rechten' | 'bijgewerktOp'> & { bijgewerktOp?: number }>; vragen: Array<{ q: string; relevant: string[]; soort: string }> };

export async function main(): Promise<number> {
  const { check, einde } = checker('zoek-kern-2');
  const A = `zk-a-${randomUUID()}`, B = `zk-b-${randomUUID()}`;
  const ladeA = { userId: A, ruimte: 'prive' as const }, ladeAT = { userId: A, ruimte: 'technisch' as const }, ladeB = { userId: B, ruimte: 'prive' as const };
  const evaluatie = JSON.parse(readFileSync('tests/eenheid/hulp/zoek-evaluatie-kern.json', 'utf8')) as Eval;
  const nu = Date.now();
  const obj = (lade: typeof ladeA, o: Eval['corpus'][number], i = 0): ZoekObject => ({ ...o, bijgewerktOp: o.bijgewerktOp || nu - i * 3600000, rechten: { userId: lade.userId, ruimte: lade.ruimte } } as ZoekObject);
  const sys = getPool('systeem');
  try {
    // ---- zuiver: normalisatie / talen / synoniemen ----
    check('C-locale onafhankelijk: Харків → kharkiv (Node, geen SQL)', zoekNorm('Харків') === 'kharkiv', zoekNorm('Харків'));
    check('geen fonetische vouw: Jan de Wijk blijft', zoekNorm('Jan de Wijk') === 'jan de wijk', zoekNorm('Jan de Wijk'));
    check('diacritica + extra letters', zoekNorm('Café Łódź Straße') === 'cafe lodz strasse', zoekNorm('Café Łódź Straße'));
    check('tokens zonder stopwoorden («де змінити мову» → zminyty movu)', zoekTokens('де змінити мову').join(',') === 'zminyty,movu', zoekTokens('де змінити мову').join(','));
    check('stopwoord alleen → blijft staan', zoekTokens('de').length === 1);
    check('varianten: kharkiv ↔ harkiv, kyiv ↔ kiiv', varianten('kharkiv').includes('harkiv') && varianten('kyiv').includes('kiiv'), varianten('kharkiv').join(','));
    check('lichte stam uk: kharkovi/kharkiv → khark', lichteStam('kharkovi') === 'khark' && lichteStam('kharkiv') === 'khark', `${lichteStam('kharkovi')}/${lichteStam('kharkiv')}`);
    check('lichte stam laat korte woorden met rust', lichteStam('mail') === 'mail' && lichteStam('taal') === 'taal');
    check('taalRaden: uk / bg / nl / en', taalRaden('Привіт, як справи? Їду до Києва') === 'uk' && taalRaden('Здравейте, това е новият документ, който има всичко') === 'bg' && taalRaden('Dit is een bericht van de gemeente voor u') === 'nl' && taalRaden('This is the message that you asked for') === 'en',
      [taalRaden('Привіт, як справи? Їду до Києва'), taalRaden('Здравейте, това е новият документ'), taalRaden('Dit is een bericht van de gemeente voor u'), taalRaden('This is the message that you asked for')].join('/'));
    const stat = SYNONIEM_STATISTIEK();
    check(`synoniemen: ≥ 120 groepen (${stat.groepen}, ${stat.leden} leden)`, stat.groepen >= 120);
    const dekt9 = SYNONIEM_GROEPEN.filter(g => g.synoniemen.length >= 9).length;
    check(`synoniemen: ≥ 120 groepen met ≥ 9 leden (alle talen) — ${dekt9}`, dekt9 >= 120);
    const mail = synoniemen(zoekNorm('пошта'));
    check('synoniem пошта → mail/e mail/poczta/поща (alle talen)', ['mail', 'e mail', 'poczta', 'courriel', 'nachricht', 'scrisoare', zoekNorm('поща')].every(w => mail.includes(w)), mail.join(','));
    check('spec: «де змінити мову» ↔ taal wijzigen ↔ change language in één groep', synoniemen('taal').includes('language') && synoniemen('taal').includes(zoekNorm('мова')));
    check('spec: знайти лист / zoek e-mail', synoniemen(zoekNorm('знайти')).includes('zoek') && synoniemen('lyst').includes('mail'));
    check('onbekend woord → alleen zichzelf', synoniemen('qwertyzz').length === 1);
    check('percent: monotoon, max = 100, min 1', percentVan(5, 5) === 100 && percentVan(2.5, 5) < 100 && percentVan(2.5, 5) > percentVan(1, 5) && percentVan(0.001, 5) >= 1);
    check('trigram identiek = 1; woordsimilariteit deelwoord hoog', trigramSimilariteit('kharkiv', 'Харків') === 1 && woordSimilariteit('factuur', 'factuur huur oktober') === 1);
    check('geheimen: wachtwoord/JWT/GitHub-token verborgen', !/geheim123|eyJhbGci|ghp_/.test(geheimenVerbergen('password: geheim123 token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijklmnopqrstuvwxyz ghp_' + 'abcdefghijklmnopqrstuvwxyz1234567890')), geheimenVerbergen('password: geheim123')); // ghp_ opgeknipt voor de geheimenscan van de uitrol

    // ---- index: upsert / overslaan / verwijderen ----
    const corpusA = evaluatie.corpus.map((o, i) => obj(ladeA, o, i));
    const r1 = await indexeer(ladeA, corpusA);
    check(`indexeer: ${corpusA.length} toegevoegd`, r1.toegevoegd === corpusA.length && r1.bijgewerkt === 0, JSON.stringify(r1));
    const r2 = await indexeer(ladeA, corpusA);
    check('indexeer opnieuw: alles overgeslagen (hash gelijk), geen dubbels', r2.overgeslagen === corpusA.length && r2.toegevoegd === 0 && (await aantalInLade(ladeA)) === corpusA.length, JSON.stringify(r2));
    const r3 = await indexeer(ladeA, [{ ...corpusA[9], tekst: `${corpusA[9].tekst} Aangepast.` }]);
    check('indexeer gewijzigd: 1 bijgewerkt', r3.bijgewerkt === 1 && r3.toegevoegd === 0, JSON.stringify(r3));
    let geweigerd = false; try { await indexeer(ladeA, [obj(ladeB, evaluatie.corpus[0])]); } catch (e) { geweigerd = String((e as Error).message) === 'ZOEK_LADE_MISMATCH'; }
    check('object buiten de lade → ZOEK_LADE_MISMATCH vóór de database', geweigerd);
    let bronFout = false; try { await indexeer(ladeA, [{ ...corpusA[0], bron: 'geheim' as never }]); } catch (e) { bronFout = String((e as Error).message) === 'ZOEK_BRON_ONBEKEND'; }
    check('onbekende bron → ZOEK_BRON_ONBEKEND', bronFout);
    // B en technisch: dezelfde titels
    await indexeer(ladeB, [obj(ladeB, evaluatie.corpus[9]), obj(ladeB, evaluatie.corpus[0])]);
    // 10 extra nieuwsbrieven (mail) + 2 bestanden met «nieuwsbrief» voor facets/filters/paginering (bijgewerktOp verspreid over uren)
    await indexeer(ladeA, [
      ...Array.from({ length: 10 }, (_, i) => obj(ladeA, { id: `nb${i}`, bron: 'mail', soort: 'bericht', titel: `Nieuwsbrief week ${i + 1}`, tekst: `Nieuwsbrief nummer ${i + 1} van de winkel.`, taal: 'nl' }, i + 1)),
      obj(ladeA, { id: 'nbf1', bron: 'cloud', soort: 'bestand', titel: 'nieuwsbrief-ontwerp.pdf', formaat: 'pdf', tekst: 'Ontwerp van de nieuwsbrief', taal: 'nl' }, 20),
      obj(ladeA, { id: 'nbf2', bron: 'drive', soort: 'bestand', titel: 'Nieuwsbrief adreslijst.xlsx', formaat: 'xlsx', tekst: 'adressen voor de nieuwsbrief', taal: 'nl' }, 30),
    ]);
    await indexeer(ladeAT, [obj(ladeAT, { ...evaluatie.corpus[9], id: 'tech-m1', titel: 'Factuur huur oktober (technisch)' })]);

    // ---- zoeken ----
    const top = async (q: string, lade = ladeA, extra: Record<string, unknown> = {}) => (await zoek(lade, { q, ...extra })).items;
    const ids = (items: Array<{ id: string }>) => items.map(i => i.id);
    const exact = await zoek(ladeA, { q: 'Factuur huur oktober' });
    check('exacte titel: m1 bovenaan, 100 %, uitleg exacte_titel', exact.items[0]?.id === 'm1' && exact.items[0].percent === 100 && exact.items[0].uitleg.some(u => u.code === 'exacte_titel'), JSON.stringify(ids(exact.items)));
    check('exacte titel > zwakke treffer (b1 heeft alleen «huur» + omschrijving)', ids(exact.items).indexOf('m1') < ids(exact.items).indexOf('b1'));
    check('percent 0–100, monotoon dalend in de lijst', exact.items.every((x, i, a) => x.percent >= 1 && x.percent <= 100 && (i === 0 || a[i - 1].percent >= x.percent)), JSON.stringify(exact.items.map(x => x.percent)));
    check('voorvoegsel: «факт» → m1 (prefix in tsquery)', ids(await top('факт'))[0] === 'm1' || ids(await top('fact'))[0] === 'm1', JSON.stringify(ids(await top('fact'))));
    const vaag = await top('faktuur hur');
    check('vaag/typefout: «faktuur hur» → m1 (variant c↔k + dekking ½)', vaag[0]?.id === 'm1', JSON.stringify(ids(vaag)));
    const syn = await zoek(ladeA, { q: 'invoice' });
    check('synoniem/vertaling en→nl/de/uk: invoice → m1, m3, m5', ['m1', 'm3', 'm5'].every(x => ids(syn.items).includes(x)) && syn.items.find(x => x.id === 'm1')?.uitleg.some(u => u.code === 'vertaling' || u.code === 'synoniem') === true, JSON.stringify(syn.items.map(x => [x.id, x.uitleg.map(u => u.code)])));
    const rah = ids(await top('рахунок'));
    check('meertalig uk→nl→en keten: рахунок vindt factuur/Rechnung/Квитанція', ['m1', 'm3', 'm5'].every(x => ids(syn.items).includes(x)) && ['m1', 'm3'].every(x => rah.includes(x)), JSON.stringify(rah));
    check('woordvorm: «Харкові» → m2', ids(await top('Харкові'))[0] === 'm2', JSON.stringify(ids(await top('Харкові'))));
    check('transliteratie: «Kharkiv» en «Zustrich u Kharkovi» → m2', ids(await top('Kharkiv'))[0] === 'm2' && ids(await top('Zustrich u Kharkovi'))[0] === 'm2');
    check('woordvorm (lichte stam): «Харків» vindt «Харкові»', ids(await top('Харків'))[0] === 'm2', JSON.stringify(ids(await top('Харків'))));
    const wijk = ids(await top('Wijk'));
    check('deel van een naam: «Wijk» → contact/mail/bijlage', ['k1', 'm1', 'b1'].every(x => wijk.includes(x)), JSON.stringify(wijk));
    check('omschrijving van een functie: «де змінити мову» → instelling taal', ids(await top('де змінити мову'))[0] === 'instellingen/taal', JSON.stringify(ids(await top('де змінити мову'))));
    check('handeling krijgt voorrang bij korte vraag: «пошта» → pagina mail/instellingen vóór losse brieven', ids(await top('пошта'))[0] === 'mail/instellingen', JSON.stringify(ids(await top('пошта'))));
    const frag = (await top('Kerkstraat'))[0];
    check('fragment met posities uit de bijlagetekst', frag?.id === 'b1' && frag.fragment.bron === 'tekst' && frag.fragment.posities.length === 1 && frag.fragment.tekst.slice(frag.fragment.posities[0][0], frag.fragment.posities[0][1]) === 'Kerkstraat', JSON.stringify(frag?.fragment));
    // facets / filters / paginering / sortering
    const alles = await zoek(ladeA, { q: 'nieuwsbrief', perPagina: 100 });
    const somBron = Object.values(alles.facets?.bron || {}).reduce((s, n) => s + n, 0);
    check('facets: som per bron = totaal (13); mail 11, cloud 1, drive 1; formaat pdf/xlsx; taal nl', somBron === alles.totaal && alles.totaal === 13 && alles.facets?.bron.mail === 11 && alles.facets?.bron.cloud === 1 && alles.facets?.formaat.pdf === 1 && alles.facets?.formaat.xlsx === 1 && alles.facets?.taal.nl === 13, JSON.stringify(alles.facets));
    const alleenMail = await zoek(ladeA, { q: 'nieuwsbrief', bronnen: ['mail'], perPagina: 100 });
    check('filter bronnen: alleen mail (11)', alleenMail.totaal === 11 && alleenMail.items.every(x => x.bron === 'mail'), String(alleenMail.totaal));
    const pdf = await zoek(ladeA, { q: 'pdf паспорт huur', formaten: ['pdf'] });
    check('filter formaat pdf', pdf.items.length > 0 && pdf.items.every(x => x.formaat === 'pdf'), JSON.stringify(ids(pdf.items)));
    const oud = await zoek(ladeA, { q: 'nieuwsbrief', sinds: nu - 2 * 3600000 - 1000, bronnen: ['mail'] });
    check('filter sinds (bijgewerktOp)', oud.items.length > 0 && oud.items.every(x => x.bijgewerktOp >= nu - 2 * 3600000 - 1000) && oud.totaal < alleenMail.totaal, `${oud.totaal} < ${alleenMail.totaal}`);
    const p1 = await zoek(ladeA, { q: 'nieuwsbrief', perPagina: 3, pagina: 1 }), p2 = await zoek(ladeA, { q: 'nieuwsbrief', perPagina: 3, pagina: 2 }), p3 = await zoek(ladeA, { q: 'nieuwsbrief', perPagina: 3, pagina: 3 });
    const samen = [...ids(p1.items), ...ids(p2.items), ...ids(p3.items)];
    check('paginering: 3+3+rest zonder dubbels, totaal gelijk', p1.items.length === 3 && p2.items.length === 3 && new Set(samen).size === samen.length && p1.totaal === alles.totaal && samen.length === Math.min(9, alles.totaal), `${samen.length}/${alles.totaal}`);
    const nieuwste = await zoek(ladeA, { q: 'nieuwsbrief', sorteer: 'nieuwste', perPagina: 100 });
    check('sortering nieuwste', nieuwste.items.every((x, i, a) => i === 0 || a[i - 1].bijgewerktOp >= x.bijgewerktOp));
    check('korte vraag < 2 tekens → leeg antwoord', (await zoek(ladeA, { q: 'a' })).items.length === 0);
    // correcties bij mager resultaat
    const corr = await zoek(ladeA, { q: 'factuurr' });
    check('correctie: «factuurr» → suggestie factuur uit eigen titels', corr.suggesties.some(s => s.soort === 'correctie' && s.tekst === 'factuur'), JSON.stringify(corr.suggesties));
    // eigen woordenboek
    await eigenSynoniemZetten(ladeA, { canoniek: 'kerkstraat', synoniemen: ['thuis', 'home'] });
    check('eigen synoniem (lade A): «thuis» → b1', ids(await top('thuis')).includes('b1'), JSON.stringify(ids(await top('thuis'))));
    check('eigen synoniem van A werkt NIET bij B', !(await zoek(ladeB, { q: 'thuis' })).items.length);

    // ---- isolatie ----
    const bA = await zoek(ladeA, { q: 'Factuur huur oktober' }), bB = await zoek(ladeB, { q: 'Factuur huur oktober' });
    check('twee gebruikers met dezelfde titel: elk ziet alleen eigen rij', bA.items.filter(x => x.id === 'm1').length === 1 && bB.items.filter(x => x.id === 'm1').length === 1 && bB.totaal === 1 && bA.totaal > 1, `${bA.totaal} / ${bB.totaal}`);
    const tech = await zoek(ladeAT, { q: 'factuur' });
    check('prive ≠ technisch: technische lade ziet alleen tech-m1', tech.items.length === 1 && tech.items[0].id === 'tech-m1', JSON.stringify(ids(tech.items)));
    const beide = await zoekInLaden([{ lade: ladeA, bronnen: ['mail', 'bijlage'] }, { lade: ladeAT, bronnen: ['mail'] }], { q: 'factuur' });
    check('zoekInLaden (gedeeld): prive-mail + technisch-mail in één antwoord, geen andere bronnen', ids(beide.items).includes('m1') && ids(beide.items).includes('tech-m1') && beide.items.every(x => ['mail', 'bijlage'].includes(x.bron)));
    let gemengd = false; try { await zoekInLaden([{ lade: ladeA, bronnen: ['mail'] }, { lade: ladeB, bronnen: ['mail'] }], { q: 'factuur' }); } catch (e) { gemengd = String((e as Error).message) === 'ZOEK_LADEN_MEERDERE_GEBRUIKERS'; }
    check('zoekInLaden weigert laden van twee gebruikers', gemengd);
    const sugA = await suggesties(ladeA, 'харк'), sugB = await suggesties(ladeB, 'харк');
    check('suggesties alleen uit eigen lade en in het ORIGINELE schrift: A ziet «Харкові» (niet «kharkovi»), B niet', sugA.some(s => s.soort === 'aanvulling' && s.tekst === 'Харкові') && !sugA.some(s => /kharkov/.test(s.tekst)) && !sugB.some(s => s.soort === 'aanvulling'), JSON.stringify([sugA.map(s => s.tekst), sugB.map(s => s.tekst)]));
    const sugF = await suggesties(ladeA, 'нала');
    check('suggesties: functie «Налаштування пошти» met route + categorieën', sugF.some(s => (s.soort === 'functie' || s.soort === 'pagina') && s.id === 'mail/instellingen' && s.route?.host === 'mail') && sugF.some(s => s.soort === 'categorie'), JSON.stringify(sugF));
    check('suggesties: synoniemen bij «mail»', (await suggesties(ladeA, 'mail')).some(s => s.soort === 'synoniem'));
    const corrCyr = await zoek(ladeA, { q: 'Харкив' });
    check('correctie in het schrift van de vraag: «Харкив» → «Харків»/«Харкові» (Cyrillisch, niet translit)', corrCyr.suggesties.some(s => s.soort === 'correctie' && /Харк/.test(s.tekst)), JSON.stringify(corrCyr.suggesties.map(s => s.tekst)));
    const trans = await zoek(ladeA, { q: 'Калнедар' });
    check('transpositie «Калнедар» → iets met календар/kalendar (typefout-kanaal) of niets zonder valse 100 %', trans.items.every(x => x.uitleg.some(u => u.code === 'vaag' || u.code === 'translit') || /kalendar|agenda/.test(zoekNorm(x.titel))), JSON.stringify(trans.items.map(x => [x.titel, x.uitleg.map(u => u.code)])));
    const verzwakt = await zoek(ladeA, { q: 'де подивитися хто входив у мій акаунт' });
    check('beschrijvende vraag: verzwakt (gedeeltelijk) i.p.v. leeg', verzwakt.items.length > 0 && verzwakt.items.some(x => x.id === 'instellingen/sessies'), JSON.stringify([verzwakt.verzwakt, ids(verzwakt.items)]));
    const dub = await zoek(ladeA, { q: 'mail' });
    check('pagina/instelling vóór knop bij gelijke titeltreffer', dub.items.findIndex(x => x.bron === 'pagina' || x.bron === 'instelling' || x.bron === 'ui') >= 0);
    // RLS: als mijnruimte_app (SET ROLE) met app.user_id = B ziet de app-rol NOOIT rijen van A, ook zonder WHERE user_id
    const appRol = (await sys.query("SELECT 1 FROM pg_roles WHERE rolname = 'mijnruimte_app'")).rowCount;
    if (appRol) {
      // Met DATABASE_URL_APP (run-test-rls.sh) rechtstreeks via de app-pool; anders als superuser met SET ROLE.
      const c = await (appRolActief() ? getPool('app') : sys).connect();
      try {
        await c.query('BEGIN'); if (!appRolActief()) await c.query('SET LOCAL ROLE mijnruimte_app'); await c.query("SELECT set_config('app.user_id', $1, true)", [B]);
        const zichtbaar = (await c.query('SELECT user_id FROM app.zoek_objecten WHERE user_id = ANY($1::text[])', [[A, B]])).rows.map(r => r.user_id);
        check('RLS 0094 als mijnruimte_app: alleen rijen van de ingestelde gebruiker', zichtbaar.length > 0 && zichtbaar.every(u => u === B), JSON.stringify([...new Set(zichtbaar)]));
        const synZicht = (await c.query('SELECT user_id FROM app.zoek_synoniemen_eigenaar WHERE user_id = ANY($1::text[])', [[A, B]])).rows;
        check('RLS 0100 woordenboek: A’s synoniemen onzichtbaar voor B', synZicht.length === 0);
        await c.query('ROLLBACK');
      } catch (e) { await c.query('ROLLBACK').catch(() => undefined); check('RLS-controle als mijnruimte_app', false, String((e as Error).message)); } finally { c.release(); }
    } else check('RLS-controle (rol mijnruimte_app ontbreekt → overgeslagen)', true);

    // ---- stand ----
    await standZetten(ladeA, 'mail', { stand: 'indexeert', voortgang: 40, laatstePoging: nu });
    const st = await standVanBron(ladeA, 'mail');
    check('stand per bron: geschreven stand + geteld aantal', st.stand === 'indexeert' && st.voortgang === 40 && st.aantal === 16 && st.laatstePoging > 0, JSON.stringify(st));
    check('stand zonder rij: klaar als er objecten zijn, anders niet_gekoppeld', (await standVanBron(ladeA, 'bord')).stand === 'klaar' && (await standVanBron(ladeA, 'apparaat')).stand === 'niet_gekoppeld');

    // ---- evaluatie P@1 / Hit@3 / MRR ----
    let pAt1 = 0, hit3 = 0, mrr = 0; const mis: string[] = [];
    for (const v of evaluatie.vragen) {
      const got = ids((await zoek(ladeA, { q: v.q, perPagina: 30, facets: false })).items).filter(id => !id.startsWith('nb'));   // de extra nieuwsbrieven horen niet bij de evaluatieset
      const rank = got.findIndex(id => v.relevant.includes(id));
      if (rank === 0) pAt1++; if (rank >= 0 && rank < 3) hit3++; if (rank >= 0) mrr += 1 / (rank + 1);
      if (rank < 0 || rank >= 3) mis.push(`${v.q} (${v.soort}) → ${got.slice(0, 3).join(',') || '—'}`);
    }
    const n = evaluatie.vragen.length;
    console.log(`evaluatie: n=${n} P@1=${(pAt1 / n).toFixed(3)} Hit@3=${(hit3 / n).toFixed(3)} MRR=${(mrr / n).toFixed(3)}${mis.length ? `\n  gemist/laat: ${mis.join(' | ')}` : ''}`);
    check(`evaluatie ≥ 40 vragen (${n})`, n >= 40);
    check(`P@1 ≥ 0.80 (${(pAt1 / n).toFixed(3)})`, pAt1 / n >= 0.8);
    check(`Hit@3 ≥ 0.90 (${(hit3 / n).toFixed(3)})`, hit3 / n >= 0.9);
    check(`MRR ≥ 0.85 (${(mrr / n).toFixed(3)})`, mrr / n >= 0.85);

    // ---- verwijderen ----
    check('verwijder: 2 ids', (await verwijder(ladeA, 'mail', ['m1', 'm6'])) === 2 && !(await zoek(ladeA, { q: 'nieuwsbrief oktober', perPagina: 100 })).items.some(x => x.id === 'm6' || x.id === 'm1'));
    check('verwijderBron: alle agenda-rijen weg', (await verwijderBron(ladeA, 'agenda')) === 2 && (await aantalInLade(ladeA, ['agenda'])) === 0);
  } finally {
    await sys.query('DELETE FROM app.zoek_objecten WHERE user_id = ANY($1::text[])', [[A, B]]);
    await sys.query('DELETE FROM app.zoek_bron_stand WHERE user_id = ANY($1::text[])', [[A, B]]);
    await sys.query('DELETE FROM app.zoek_synoniemen_eigenaar WHERE user_id = ANY($1::text[])', [[A, B]]);
    await closePool();
  }
  return einde();
}
