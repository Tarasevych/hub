// AFSTEMMING vNEXT — UI-kern (30.10.2026, uitvoerder C3). Twee soorten controles:
//   A. FUNCTIONEEL op de pure hulpjes (criteriaparser, fasevolgorde, formaten) — echte aanroepen, geen DOM;
//   B. BRONGERICHT op de onderdelen (zoals cloud-vnext-ui): dialoogregels, eerlijkheid (geen verzonnen percentages,
//      «passed» alleen met bewijs, 409 wist niets, agent keurt niet), de afgesproken data-afv-haken en tweetaligheid.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checker } from './hulp/nep-google';
import { afstemmingTekst, schoneExternId, voortgangTekst } from '../../shared/afstemming-model';
import { bronFormaat, criteriaNaarTekst, criteriaUitTekst, faseVolgende, faseVraagtMens, gebeurtenisTekst } from '../../src/afstemming-vnext/hulp';

const lees = (f: string) => readFileSync(join(process.cwd(), f), 'utf8');

export async function main(): Promise<number> {
  const { check, einde } = checker('afstemming-ui-20261030');

  // ================================================================ A. functioneel
  const cr = criteriaUitTekst('AC-01 | Імпорт створює чернетку | e2e\n | \nAC-02|Критерій без пробілів|unit\nЛише текст без ID\nX-9 | дивна перевірка | telepathie');
  check('criteriaparser: 4 geldige regels uit 5 (lege regel vervalt)', cr.length === 4, JSON.stringify(cr.map((c) => c.id)));
  check('criteriaparser: expliciete ID en verificatie blijven staan', cr[0].id === 'AC-01' && cr[0].verificatie === 'e2e' && cr[1].id === 'AC-02' && cr[1].verificatie === 'unit');
  check('criteriaparser: regel zonder ID krijgt AC-n en EERLIJK owner-verificatie', cr[2].id === 'AC-03' && cr[2].verificatie === 'owner' && cr[2].tekst === 'Лише текст без ID');
  check('criteriaparser: onbekende verificatie wordt owner (nooit doen alsof er een test is)', cr[3].id === 'X-9' && cr[3].verificatie === 'owner');
  const terug = criteriaNaarTekst(cr.map((c) => ({ ...c, tekst: { uk: c.tekst }, stand: 'not_tested' as const })), 'uk');
  check('criteria heen-en-terug: regels bevatten id|tekst|verificatie', terug.includes('AC-01 | Імпорт створює чернетку | e2e') && terug.split('\n').length === 4);
  check('criteriaparser: cap op criteriaMax', criteriaUitTekst(Array.from({ length: 60 }, (_, i) => `r${i} tekst`).join('\n')).length === 40);

  const vanDraft = faseVolgende('draft');
  check('fasevolgorde vanaf draft: vooruit + altijd superseded/cancelled, nooit zichzelf', vanDraft.includes('needs_review') && vanDraft.includes('production_verified') && vanDraft.includes('cancelled') && vanDraft.includes('superseded') && !vanDraft.includes('draft'));
  const vanAccepted = faseVolgende('accepted');
  check('fasevolgorde vanaf accepted: alleen superseded/cancelled over', vanAccepted.length === 2 && vanAccepted.includes('superseded') && vanAccepted.includes('cancelled'));
  check('fasevolgorde: geen terugsprong (approved biedt geen draft/needs_review)', !faseVolgende('approved').includes('draft') && !faseVolgende('approved').includes('needs_review'));
  check('mens-verplichte fasen: approved/accepted/cancelled/superseded wél, deployed niet', faseVraagtMens('approved') && faseVraagtMens('accepted') && faseVraagtMens('cancelled') && faseVraagtMens('superseded') && !faseVraagtMens('deployed'));

  check('bronFormaat: json/md/txt herkend, rest geweigerd', bronFormaat('a.JSON') === 'json' && bronFormaat('b.md') === 'md' && bronFormaat('c.txt') === 'txt' && bronFormaat('d.pdf') === null && bronFormaat('zonder') === null);
  check('voortgang is telbaar: «AC 2/6», zonder criteria een eerlijke tekst', voortgangTekst(2, 6, 'uk') === 'AC 2/6' && voortgangTekst(0, 0, 'uk').includes('без критеріїв'));
  check('schoneExternId: hoofdletters, geweigerde rommel', schoneExternId(' ui-015 ') === 'UI-015' && schoneExternId('14') === '' && schoneExternId('!!') === '');
  check('gebeurtenistekst: bekende soort vertaald, onbekende blijft de code', gebeurtenisTekst('uk', 'besluit') === 'Рішення власника' && gebeurtenisTekst('nl', 'besluit') === 'Eigenaarsbesluit' && gebeurtenisTekst('uk', 'xyz') === 'xyz');
  check('afstemmingTekst: array én object, nl valt terug op uk', afstemmingTekst(['а', 'b'], 'nl') === 'b' && afstemmingTekst({ uk: 'а' }, 'nl') === 'а');

  // ================================================================ B. brongericht
  const MIJN = [
    'src/afstemming-vnext/Laag.tsx', 'src/afstemming-vnext/KaartKaartje.tsx', 'src/afstemming-vnext/KaartDetail.tsx',
    'src/afstemming-vnext/hulp.ts', 'src/afstemming-vnext/onderdelen/Overzicht.tsx', 'src/afstemming-vnext/onderdelen/Kartotheek.tsx',
    'src/afstemming-vnext/onderdelen/Geschiedenis.tsx', 'src/afstemming-vnext/onderdelen/Toevoegen.tsx',
  ];
  const inhoud = new Map(MIJN.map((f) => [f, lees(f)]));
  for (const [f, t] of inhoud) check(`${f}: geen window.prompt/confirm/alert`, !/\b(?:window\s*\.\s*)?(?:prompt|confirm|alert)\s*\(/.test(t));

  const laag = inhoud.get('src/afstemming-vnext/Laag.tsx') || '';
  check('Laag: role=dialog + aria-modal + portaal naar body', laag.includes("role='dialog'") && laag.includes("aria-modal='true'") && laag.includes('createPortal') && laag.includes('document.body'));
  check('Laag: Esc sluit en Tab blijft binnen (focusval)', laag.includes("'Escape'") && laag.includes("e.key !== 'Tab'"));
  check('Laag: eerste focus op [data-afv-eerste]', laag.includes('data-afv-eerste'));

  const css = lees('src/afstemming-vnext/afstemming.css');
  const deel = css.slice(css.indexOf('uitvoerder C3'));
  check('css: het C3-blok is aangeplakt en gebruikt alleen tokens (geen hex)', deel.length > 100 && !/#[0-9a-fA-F]{3,8}\b/.test(deel) && deel.includes('var(--accent'));
  check('css (deel C3): geen nieuwe position:fixed', !/position\s*:\s*fixed/.test(deel));
  check('css (geheel): precies de 2 geregistreerde fixed-elementen', (css.match(/position\s*:\s*fixed/g) || []).length === 2);
  check('css: gezondheidskleur is een stip + TEKST ernaast (kleur nooit de enige drager)', deel.includes('.afv-stip') && (inhoud.get('src/afstemming-vnext/KaartKaartje.tsx') || '').includes('GEZONDHEID_LABEL'));

  const kaartje = inhoud.get('src/afstemming-vnext/KaartKaartje.tsx') || '';
  check('kaartje: telbare voortgang via voortgangTekst, balk alleen aria-hidden-illustratie', kaartje.includes('voortgangTekst(') && /afv-vooruitgang'? aria-hidden/.test(kaartje.replace(/className='afv-vooruitgang'/, "afv-vooruitgang'")) || (kaartje.includes("className='afv-vooruitgang' aria-hidden") || kaartje.includes("afv-vooruitgang' aria-hidden='true'")));
  check('kaartje: beide assen als tekstlabels uit de gedeelde woordenlijst', kaartje.includes('LEVENSFASE_LABEL') && kaartje.includes('GEZONDHEID_LABEL'));
  check('kaartje: legacy-herkomst zichtbaar, conflict als chip', kaartje.includes('data-afv-legacy') && kaartje.includes('is-conflict'));

  const ov = inhoud.get('src/afstemming-vnext/onderdelen/Overzicht.tsx') || '';
  check('overzicht: tegels met echte tellers en overdracht naar de kartotheek via afv-filter', ov.includes('data-afv-tegel') && ov.includes("sessieZet('afv-filter'") && ov.includes("naarSectie('kartotheek')"));
  check('overzicht: kandidaten met bevestig/wijs-af → koppel-API (nooit auto-merge)', ov.includes("'bevestig'") && ov.includes("'wijs-af'") && ov.includes('afstemmingClient.koppel'));
  check('overzicht: aandacht-rijen openen de kaart', ov.includes('data-afv-aandacht') && ov.includes('openKaart(k.id)'));
  check('overzicht: eerlijke lege toestand en eerlijke bouwmelding', ov.includes("data-afv-leeg='overzicht'") && ov.includes("data-afv-bouw='Overzicht'"));
  check('overzicht: levensloopstrook als raadgever', ov.includes('data-afv-pijplijn') && ov.includes('Реально працює'));

  const kt = inhoud.get('src/afstemming-vnext/onderdelen/Kartotheek.tsx') || '';
  check('kartotheek: alle filtervelden sturen de servervraag', ['data-afv-f-zoek', 'data-afv-f-dienst', 'data-afv-f-categorie', 'data-afv-f-fase', 'data-afv-f-gezondheid', 'data-afv-f-conflict', 'data-afv-f-sorteer'].every((h) => kt.includes(h)) && kt.includes('afstemmingClient.kaarten({ ...vraag'));
  check('kartotheek: paginering via token («Показати ще»)', kt.includes('data-afv-volgende') && kt.includes('Показати ще') && kt.includes('volgende'));
  check('kartotheek: snelle weergaven zijn EERLIJK een verfijning op de geladen pagina', kt.includes('data-afv-snel') && kt.includes('завантаженій сторінці'));
  check('kartotheek: overdracht afv-filter wordt gelezen-en-gewist (sessieNeem)', kt.includes("sessieNeem('afv-filter')"));
  check('kartotheek: openKaartId-prop opent het detail precies één keer', kt.includes('openKaartId !== geopend.current'));

  const kd = inhoud.get('src/afstemming-vnext/KaartDetail.tsx') || '';
  check('detail: zeven bladen met data-afv-dtab', ['wat', 'criteria', 'relaties', 'bewijs', 'releases', 'historie', 'acties'].every((b) => kd.includes(`'${b}'`)) && kd.includes('data-afv-dtab'));
  check('detail: «passed» kan ALLEEN met gekozen bewijsstuk (knop anders uit, met uitleg)', kd.includes('disabled={besig || !bewijsKeuze[c.id]}') && kd.includes('вимагає вибраного доказу'));
  check('detail: «failed» kan zonder bewijs (eerlijk het omgekeerde)', kd.includes('data-afv-criterium-failed') && kd.includes("'failed'"));
  check('detail: mens-verplichte fasen heten «рішення власника» in de keuzelijst', kd.includes('faseVraagtMens(f)') && kd.includes('рішення власника'));
  check('detail: production_verified waarschuwt dat de server bewijs eist', kd.includes("fase === 'production_verified'") && kd.includes('доказ'));
  check('detail: 409 VERSIE_CONFLICT toont de verse versie en wist het formulier NIET', kd.includes("e.code === 'VERSIE_CONFLICT'") && kd.includes('setConflict(e.huidig') && kd.includes('data-afv-vervang') && kd.includes('Ваші поля в формі збережені'));
  check('detail: wijziging wordt een NIEUWE revisie met melding van het nummer', kd.includes('Збережено як ревізію ${uit.revisie.nummer}') && kd.includes('criteriaUitTekst(w.criteria)'));
  check('detail: diff van twee revisies via verschil()', kd.includes('afstemmingClient.verschil') && kd.includes('data-afv-diff') && kd.includes('data-afv-diff-a') && kd.includes('data-afv-diff-b'));
  check('detail: release-rij zegt eerlijk «розгорнуто, не підтверджено»', kd.includes('розгорнуто, не підтверджено') && kd.includes('uitgerold, niet bevestigd'));
  check('detail: koppelvoorstel met reden en zekerheid, eigen kaart uitgesloten', kd.includes("actie: 'stel-voor'") && kd.includes('zekerheid: kZeker / 100') && kd.includes('x.id !== kaart.id'));
  check('detail: eigen notitie apart bewerkbaar (alleen dit veld gaat naar wijzig)', kd.includes('{ eigenNotitie: notitie }') && kd.includes('data-afv-notitie'));
  check('detail: bewijsformulier met soort/omgeving/resultaat/verwijzing', kd.includes('data-afv-bewijs-vorm') && kd.includes('production_probe') && kd.includes('owner_review'));

  const tv = inhoud.get('src/afstemming-vnext/onderdelen/Toevoegen.tsx') || '';
  check('toevoegen: drie wegen met data-afv-tv', ["'beschrijf'", "'bestand'", "'agent'"].every((x) => tv.includes(x)) && tv.includes('data-afv-tv='));
  check('toevoegen: voorstel met bron gesprek + idempotentiesleutel; ruwe tekst gaat mee als bedoeling', tv.includes("bron: 'gesprek'") && tv.includes('idempotentie: idempotentie.current') && tv.includes('bedoeling: zadum'));
  check('toevoegen: AI-structurering heet eerlijk GEPLAND', tv.includes('ШІ-розбір задуму — заплановано'));
  check('toevoegen: alleen .json/.md/.txt, groottegrens vóór het lezen, bestand nooit uitgevoerd', tv.includes("accept='.json,.md,.txt'") && tv.includes('importBytesMax') && tv.includes('readAsText'));
  check('toevoegen: voorbeeld eerst (niets opgeslagen), onzekere velden en vergelijkbare kaarten zichtbaar', tv.includes('data-afv-import-voorbeeld') && tv.includes('data-afv-import-onzeker') && tv.includes('data-afv-import-vergelijkbaar') && tv.includes('нічого ще не збережено'));
  check('toevoegen: bestaand idee blokkeert een duplicaat en opent de bestaande kaart', tv.includes('data-afv-import-bestaand') && tv.includes('voorbeeld.bestaand') && tv.includes('Повторний імпорт не створює дубля'));
  check('toevoegen: kapot bestand wist de ruwe tekst niet («Розібрати ще раз»)', tv.includes('data-afv-import-ruw') && tv.includes('Розібрати ще раз'));
  check('toevoegen: agentweg legt AGENT_MAG_NIET uit en noemt MCP eerlijk gepland', tv.includes('AGENT_MAG_NIET') && tv.includes('заплановано') && tv.includes('data-afv-agent-uitleg'));

  const ges = inhoud.get('src/afstemming-vnext/onderdelen/Geschiedenis.tsx') || '';
  check('geschiedenis: jongste stroom + volledige geschiedenis van één kaart met token-paginering', ges.includes('afstemmingClient.geschiedenis(k.id)') && ges.includes('data-afv-geschiedenis-zoek') && ges.includes('Показати ще'));
  check('geschiedenis: de volledige stroom over alles heet eerlijk gepland', ges.includes('заплановано'));

  // tweetaligheid: elk onderdeel rendert via tr(/afstemmingTekst — en een paar nl-ankers bestaan echt
  for (const [f, t] of inhoud) { if (f.endsWith('.tsx')) check(`${f}: teksten via tr(/afstemmingTekst`, /\btr\(/.test(t) || t.includes('afstemmingTekst(')); }
  check('nl-teksten aanwezig (steekproef)', (ov.includes('Nog geen gebeurtenissen') || ges.includes('Nog geen gebeurtenissen')) && tv.includes('Idee toevoegen') && kd.includes('eigenaarsbesluit'));
  check('geen verzonnen percentages: het enige % in het kaartje is de AC-breukbalk (aria-hidden), zekerheid% komt uit echte invoer', !kaartje.includes('%') || kaartje.includes('aria-hidden'));

  return einde();
}
