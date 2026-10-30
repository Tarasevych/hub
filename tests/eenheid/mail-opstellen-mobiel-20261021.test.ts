// «Новий лист» op de telefoon (eigenaar, 21.10.2026, 390 px): zes klachten —
//   1. menu's van de editorbalk («Ліво…», «Список», «⋯») verdwenen onder het werkvlak;
//   2. icoonknoppen werden ovalen (skrepka 19×36, «Введення»/«Видалити» zonder onderschrift smal en hoog);
//   3. de balk schuift zijwaarts zonder enig teken dat er meer is;
//   4. sjablonen onbereikbaar op de telefoon (ze stonden in het geknipte «⋯»);
//   5. Кому/Cc/Bcc nemen veel plaats en klappen niet dicht;
//   6. getypte tekst verdwijnt als de browser het tabblad herlaadt.
// Deze test legt de zuivere regels vast (plek van het menu, lokale conceptkopie, statusregel) en de bedrading in de bronnen.
import { readFileSync } from 'node:fs';
import { checker } from './hulp/nep-google';
import { menuPlaats, MENU_MARGE, MENU_MIN_HOOGTE } from '../../src/mail-opstel-menu-plaats';
import {
  CONCEPT_MAX_LEEFTIJD, CONCEPT_PREFIX, conceptScope, conceptSleutel, conceptStatusTekst, heeftInhoud, leesConcept, normaliseerConcept, schrijfConcept, wisConcept,
  type LokaalConcept, type Opslag,
} from '../../src/mail-concept-lokaal';

const lees = (p: string) => readFileSync(p, 'utf8');
const zonderCommentaar = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '');

class NepOpslag implements Opslag {
  m = new Map<string, string>();
  kapot = false;
  vol = false;
  getItem(k: string) { if (this.kapot) throw new Error('SecurityError'); return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { if (this.kapot) throw new Error('SecurityError'); if (this.vol) throw new Error('QuotaExceededError'); this.m.set(k, v); }
  removeItem(k: string) { if (this.kapot) throw new Error('SecurityError'); this.m.delete(k); }
}
const concept = (extra: Partial<LokaalConcept> = {}): LokaalConcept => ({ id: 'concept-0001-abcd', to: 'olena@example.test', cc: '', bcc: '', subject: 'Тема', body: '<p>Текст листа</p>', open: true, op: Date.now(), serverOp: 0, ...extra });

export async function main(): Promise<number> {
  const { check, einde } = checker('mail-opstellen-mobiel-20261021');

  // ------------------------------------------------------------------ 1. menu boven alles, binnen het scherm
  const vp = { x: 0, y: 0, w: 390, h: 844 };
  const knop = { left: 300, top: 200, right: 344, bottom: 244 };
  const p1 = menuPlaats(knop, { w: 340, h: 500 }, vp, 'rechts');
  check('1: «⋯» rechts uitgelijnd, onder de knop, helemaal binnen 390 px', p1.left >= MENU_MARGE && p1.left + 340 <= 390 - MENU_MARGE + 0.5 && p1.top >= 244 && !p1.boven, JSON.stringify(p1));
  check('1: hoogte begrensd tot de ruimte onder de knop (scrolt binnen het menu)', p1.maxHoogte <= 844 - 244 - MENU_MARGE && p1.top + Math.min(500, p1.maxHoogte) <= 844 - MENU_MARGE + 0.5, JSON.stringify(p1));
  const p2 = menuPlaats({ left: 20, top: 760, right: 120, bottom: 804 }, { w: 200, h: 300 }, vp, 'links');
  check('1: knop onderaan (toetsenbord/footer) → menu klapt naar BOVEN', p2.boven && p2.top + 300 <= 760 && p2.top >= MENU_MARGE, JSON.stringify(p2));
  const p3 = menuPlaats({ left: 370, top: 100, right: 390, bottom: 140 }, { w: 300, h: 100 }, vp, 'links');
  check('1: menu dat rechts buiten beeld zou vallen, schuift naar links (binnen de marge)', p3.left + 300 <= 390 - MENU_MARGE && p3.left >= MENU_MARGE, JSON.stringify(p3));
  const p4 = menuPlaats({ left: 10, top: 300, right: 60, bottom: 340 }, { w: 200, h: 400 }, { x: 0, y: 120, w: 390, h: 320 }, 'links');
  check('1: zichtbaar deel (visualViewport, toetsenbord open) wordt gerespecteerd', p4.top >= 120 + MENU_MARGE - 0.5 && p4.top + Math.min(400, p4.maxHoogte) <= 120 + 320 - MENU_MARGE + 0.5 && p4.maxHoogte >= MENU_MIN_HOOGTE - 0.5, JSON.stringify(p4));
  const p5 = menuPlaats(knop, { w: 900, h: 100 }, vp, 'links');
  check('1: breder dan het scherm → links op de marge (CSS begrenst de breedte)', p5.left === MENU_MARGE, JSON.stringify(p5));

  const ed = lees('src/MailOpstelBewerker.tsx');
  check('1: keuzelijst rendert het menu in een PORTAL onder <body> (niet meer absolute in de geknipte balk)', /createPortal\(<div ref=\{menu\} className='mail-compose-dropdown-menu mail-compose-zwevend'/.test(ed));
  check('1: «⋯» ook in een portal', /createPortal\(<div ref=\{menu\} className='mail-compose-more-menu mail-compose-zwevend'/.test(ed));
  check('1: plek via menuPlaats + laag boven het venster (laagBoven), ook bij resize/scroll/visualViewport', ed.includes('menuPlaats(r,') && ed.includes('zIndex:laagBoven(k)') && ed.includes("vv?.addEventListener('resize',zet)") && ed.includes("document.addEventListener('scroll',zet,true)"));
  check('1: klik ín het geportaalde menu sluit het niet (buiten = buiten knop én menu)', ed.includes('useBuitenSluit(open,setOpen,[root,menu])') && (ed.match(/useBuitenSluit\(open,setOpen,\[root,menu\]\)/g) || []).length === 2);
  const dlg = lees('src/MailNieuwBerichtDialoog.tsx');
  check('1: Esc met open menu sluit eerst het menu, niet het venster', dlg.includes('.mail-compose-dropdown-menu, .mail-compose-more-menu'));
  const edCss = lees('src/mail-opstel-bewerker.css');
  check('1: zwevend menu zet right/bottom uit (anders rekt position:fixed + right:0 het menu uit)', /\.mail-compose-zwevend\{[^}]*right:auto!important;bottom:auto!important/.test(edCss));

  // ------------------------------------------------------------------ 2. geen ovalen
  const nmCss = lees('src/mail-nieuw-bericht.css');
  const blok21 = nmCss.slice(nmCss.indexOf('---- 21.10.2026 (телефон, «кнопки овальні»)'));
  check('2: skrepka en Диск: vierkant var(--tik-hoogte), wint van «footer > * { width:auto !important }»', /footer > button\.mail-nm-bijlage-knop,[\s\S]*?width:var\(--tik-hoogte\) !important;[^}]*aspect-ratio:1/.test(blok21));
  check('2: «Введення»/«Видалити» zonder onderschrift (≤720) = vierkant', /@media \(max-width:720px\)[\s\S]*?:is\(button\.mail-nm-hulpen, button\.mail-nm-wis\) \{ width:var\(--tik-hoogte\) !important;[^}]*aspect-ratio:1/.test(blok21));
  check('2: tekstknoppen (ШІ, Пізніше, Надіслати) even hoog, geen pil (straal-m)', /:is\(\.mail-ai-trigger, \.mail-sched-trigger, \.mail-nm-hulpen, \.mail-nm-wis, \.mail-nm-wis-vraag > button, button\.primary\) \{[^}]*height:var\(--tik-hoogte\);[^}]*border-radius:var\(--straal-m\)/.test(blok21));
  check('2: vensterknoppen _ × vierkant var(--tik-hoogte)', /\.mail-nm-venster-knoppen > button \{[^}]*width:var\(--tik-hoogte\); height:var\(--tik-hoogte\)/.test(blok21));
  const blokEd = edCss.slice(edCss.indexOf('---- 21.10.2026 (телефон 390 px'));
  check('2: balk: icoonknoppen vierkant var(--tik-hoogte), keuzelijsten even hoog', /\.mail-compose-ribbon-group>button,[^{]*\{[^}]*width:var\(--tik-hoogte\);[^}]*height:var\(--tik-hoogte\);[^}]*aspect-ratio:1/.test(blokEd) && /\.mail-compose-dropdown-trigger\{[^}]*height:var\(--tik-hoogte\)!important/.test(blokEd));
  for (const [naam, css] of [['mail-opstel-bewerker.css (21.10-blok)', blokEd], ['mail-nieuw-bericht.css (21.10-blokken)', blok21]] as const) {
    const c = zonderCommentaar(css);
    check(`ontwerp: ${naam} — geen hex-kleuren, geen prefers-color-scheme`, !/#[0-9a-f]{3,8}\b/i.test(c) && !/prefers-color-scheme/.test(c));
    const px = [...c.replace(/@(media|container)[^{]*\{/g, '{').matchAll(/(?:^|[^-])(?:width|min-width|max-width)\s*:\s*(?:min\()?(\d+)px/g)].map((m) => Number(m[1])).filter((n) => n > 360);
    check(`ontwerp: ${naam} — geen px-breedte > 360`, px.length === 0, px.join(','));
    const fs = [...c.matchAll(/font-size\s*:\s*(\d+(?:\.\d+)?)px/g)].map((m) => Number(m[1])).filter((n) => n < 12);
    check(`ontwerp: ${naam} — geen lettergrootte < 12 px`, fs.length === 0, fs.join(','));
  }

  // ------------------------------------------------------------------ 3. scrolhint + rare acties in «⋯»
  const tabs = lees('src/ontwerp/TabsRij.tsx');
  check('3: balk = TabsRij (schaduw + pijlen als er meer is), zonder vanzelf te schuiven op aria-pressed', ed.includes("<TabsRij label={t('Кнопки форматування','Opmaakknoppen')}") && ed.includes('volgActief={false}') && tabs.includes('if (!n || !volgActief) return;'));
  check('3: TabsRij blijft standaard het actieve tabblad volgen (andere pagina\'s ongewijzigd)', tabs.includes("rol = 'tablist', volgActief = true }"));
  check('3: «⋯» staat NAAST de schuifrij (altijd zichtbaar), niet erin', /<\/TabsRij><ToolbarMore /.test(ed));
  check('3: smal (< 560 px): stijl/lettertype/grootte/uitlijning/doorhalen uit de balk, in «⋯»', ed.includes("{!smal&&<ToolbarDropdown label={blockOptions") && /\{id:'tekst',uk:'Текст',nl:'Tekst',inhoud:<>\{smal&&<><div className='mm-groep'>/.test(ed) && ed.includes("className='mm-stijlen'") && ed.includes("className='mm-rij'") && ed.includes("className='mail-compose-menu-keuze'") && ed.includes("{!smal&&<ToolbarDropdown label={currentAlign"));
  check('3: midden (< 760 px, gewoon venster op de computer): lettertype/grootte in «⋯», lijsten als knoppen — de balk past zonder over elkaar te schuiven', ed.includes("{vol&&<><ToolbarDropdown label={fontOptions") && ed.includes("...(breedte!=='vol'?[{id:'tekst'") && ed.includes("<div className='mm-groep'>{keuzes}</div>") && ed.includes("{!vol&&<>{tool(t('Маркований список'") && ed.includes("setBreedte(b<560?'smal':b<760?'midden':'vol')"));
  check('3: keuzelijsten krimpen niet in de schuifrij (anders overlap «Звичайний»/«Arial»/«16px»)', /\.mail-compose-ribbon>\.mail-compose-dropdown\{flex:0 0 auto;min-width:auto\}/.test(edCss));

  // ------------------------------------------------------------------ 4. sjablonen op de telefoon
  // 29.10.2026: «⋯» heeft tabbladen (src/editor/MeerTabs.tsx) — sjablonen staan op elk scherm in hun eigen tabblad «Шаблони».
  check('4: sjablonen: eigen tabblad «Шаблони» in «⋯» (alle breedtes), één plek voor de sjabloonknoppen', ed.includes("{id:'sjablonen',uk:'Шаблони',nl:'Sjablonen'") && (ed.match(/className='mail-sjabloon-item'/g) || []).length === 1 && ed.includes('<SjabloonKiezer lang={lang} knopTekst='));

  // ------------------------------------------------------------------ 5. Cc/Bcc
  check('5: Cc/Bcc-velden alleen bij showCc; knop «Cc/Bcc» en «згорнути»', dlg.includes('{showCc && (\n          <div id="mail-nm-cc-velden"') && dlg.includes('data-nm-kopie aria-expanded={false}') && dlg.includes('data-nm-kopie-dicht aria-expanded={true}'));
  check('5: dichtgeklapt mét adressen → één compacte regel «Cc: … · Bcc: …»', dlg.includes('!showCc && (cc.trim() || bcc.trim()) ?') && dlg.includes('data-nm-cc-kort'));
  check('5: telefoon begint dicht, ook na herstel (smalScherm)', dlg.includes('Boolean((begin?.cc || begin?.bcc) && !smalScherm())') && dlg.includes('setShowCc(Boolean((d.cc || d.bcc) && !smalScherm()))'));

  // ------------------------------------------------------------------ 6. concept overleeft herladen
  const o = new NepOpslag();
  const A = conceptScope('pavlo@example.test', 'prive'), B = conceptScope('olena@example.test', 'prive'), AT = conceptScope('pavlo@example.test', 'technisch');
  check('6: scope = account|ruimte (zelfde als de vensterlade)', A === 'pavlo@example.test|prive' && AT === 'pavlo@example.test|technisch' && conceptSleutel(A) === `${CONCEPT_PREFIX}${A}`);
  check('6: schrijven + lezen', schrijfConcept(A, concept(), o) && leesConcept(A, o)?.body === '<p>Текст листа</p>' && leesConcept(A, o)?.open === true);
  check('6: ander account en andere ruimte zien het concept NIET', leesConcept(B, o) === null && leesConcept(AT, o) === null);
  schrijfConcept(A, { ...concept(), bijlagen: [{ data: 'JVBERi0x' }], password: 'geheim', token: 'x' } as unknown as LokaalConcept, o);
  const ruw = o.m.get(conceptSleutel(A)) || '';
  check('6: nooit bijlagen, wachtwoord of token in de lokale kopie (alleen Кому/Cc/Bcc/Тема/tekst + stand)', !/bijlagen|JVBERi0x|password|geheim|token/.test(ruw) && Object.keys(JSON.parse(ruw)).sort().join(',') === 'bcc,body,cc,id,op,open,serverOp,subject,to', ruw.slice(0, 160));
  check('6: leeg concept = sleutel weg', schrijfConcept(A, concept({ to: '', subject: '', body: '<p></p>' }), o) && !o.m.has(conceptSleutel(A)));
  check('6: heeftInhoud negeert lege HTML', !heeftInhoud({ body: '<p><br></p>' }) && heeftInhoud({ body: '<p>a</p>' }) && heeftInhoud({ to: 'x' }));
  check('6: ouder dan 30 dagen = vergeten', normaliseerConcept(concept({ op: Date.now() - CONCEPT_MAX_LEEFTIJD - 1000 })) === null);
  check('6: ongeldige id (injectie in de sleutel/route) wordt niet bewaard', normaliseerConcept(concept({ id: '../../x' })) === null);
  schrijfConcept(A, concept({ id: 'concept-van-a-1234' }), o);
  wisConcept(A, 'ander-concept-9999', o);
  check('6: wisConcept met een ANDERE id laat het actieve concept staan (tweede tabblad)', leesConcept(A, o)?.id === 'concept-van-a-1234');
  wisConcept(A, 'concept-van-a-1234', o);
  check('6: wisConcept (verzonden / «Видалити чернетку») → weg', leesConcept(A, o) === null);
  const oud = new NepOpslag();
  oud.setItem('mail-draft-active-id', 'oud-concept-123456');
  oud.setItem('mail-draft-oud-concept-123456', JSON.stringify({ to: 'jan@example.test', cc: '', bcc: '', subject: 'Oud', body: '<p>oude tekst</p>', savedAt: Date.now() - 1000 }));
  const m = leesConcept(A, oud);
  check('6: oud formaat (mail-draft-active-id) wordt één keer overgenomen in de scope en daarna opgeruimd', m?.subject === 'Oud' && m.open === false && oud.getItem('mail-draft-active-id') === null && oud.getItem('mail-draft-oud-concept-123456') === null && leesConcept(A, oud)?.subject === 'Oud');
  const kapot = new NepOpslag(); kapot.kapot = true;
  let gooit = false;
  try { check('6: opslag geblokkeerd (privévenster/beleid): stil false/null, geen uitzondering', schrijfConcept(A, concept(), kapot) === false && leesConcept(A, kapot) === null); wisConcept(A, 'x', kapot); } catch { gooit = true; }
  check('6: … en wisConcept gooit ook niet', !gooit);
  const vol = new NepOpslag(); vol.vol = true;
  check('6: quota vol → false (statusregel zegt «Локальна копія вимкнена»), geen uitzondering', schrijfConcept(A, concept(), vol) === false);
  check('6: geen opslag (null) → false/null', schrijfConcept(A, concept(), null) === false && leesConcept(A, null) === null);

  const tijd = new Date(2026, 9, 21, 7, 12).getTime();
  const s1 = conceptStatusTekst('uk', { lokaal: 'ja', server: 'ok', serverOp: tijd });
  check('6: statusregel «Збережено локально · на сервері о HH:MM»', /^Збережено локально · на сервері о 07:12$/.test(s1), s1);
  const s2 = conceptStatusTekst('nl', { lokaal: 'ja', server: 'ok', serverOp: tijd });
  check('6: nl: «Lokaal bewaard · op de server om 07:12»', s2 === 'Lokaal bewaard · op de server om 07:12', s2);
  check('6: tijdens bewaren springt de tekst niet (zelfde tekst, alleen het pictogram draait)', conceptStatusTekst('uk', { lokaal: 'ja', server: 'bezig', serverOp: tijd }) === s1);
  check('6: server weg → eerlijk «сервер недоступний — повторимо»', conceptStatusTekst('uk', { lokaal: 'ja', server: 'fout', serverOp: 0 }) === 'Збережено локально · сервер недоступний — повторимо');
  check('6: geen lokale opslag maar wel server → «Локальна копія вимкнена · на сервері о …»', conceptStatusTekst('uk', { lokaal: 'uit', server: 'ok', serverOp: tijd }) === 'Локальна копія вимкнена · на сервері о 07:12');
  check('6: niets getypt → «Чернетка»', conceptStatusTekst('uk', { lokaal: 'nee', server: 'idle', serverOp: 0 }) === 'Чернетка');

  check('6: wegschrijven ook bij visibilitychange (hidden), pagehide, beforeunload en freeze', dlg.includes("document.addEventListener('visibilitychange', verborgen)") && dlg.includes("window.addEventListener('pagehide', nu)") && dlg.includes("document.addEventListener('freeze', nu)") && dlg.includes("document.visibilityState === 'hidden'"));
  check('6: stond het venster open → na herladen meteen weer open als HERSTEL (niet als nieuw, leeg bericht)', dlg.includes('if (begin?.open && conceptHeeftInhoud(begin) && onOpen) { herstelRef.current = true; onOpen(); }'));
  check('6: terughalen uit het dok = herstel (de oorzaak van «tekst weg» na het tikken was «opnieuw openen als nieuw bericht»)', dlg.includes('if (open || !nu || nu.klein || !onOpen) return;\n    herstelRef.current = true; setVerborgen(false); onOpen();'));

  // ------------------------------------------------------------------ 7. één stapel met de andere vensters (злитий стенд 21.10)
  check('7: «Новий лист» staat in de gezamenlijke vensterstapel (registreer, niet-modaal voor de anderen), laag = zIndexVan', dlg.includes("vensterBeheer.registreer(NIEUW_BERICHT_VENSTER, { titel, modaal: false })") && dlg.includes('style={{ zIndex: zIndexVan(NIEUW_BERICHT_VENSTER) }}') && !/z-index:\s*1200/.test(dlg));
  check('7: openen en klikken in de brief halen hem bovenaan (naarVoren)', dlg.includes('if (!was) vensterBeheer.naarVoren(NIEUW_BERICHT_VENSTER);') && dlg.includes('onPointerDownCapture={() => { if (stapelBoven(vensters)?.id !== NIEUW_BERICHT_VENSTER) vensterBeheer.naarVoren(NIEUW_BERICHT_VENSTER); }}'));
  check('7: klik op de achtergrond boven een ánder venster haalt dát venster naar voren (brief blijft open); lege pagina = minimaliseren', dlg.includes("el.closest('.venster[data-venster]')") && dlg.includes('if (id) { vensterBeheer.naarVoren(id); return; }\n        close();'));
  check('7: geminimaliseerd = in het gezamenlijke dok (minimaliseer), geen eigen plashka of aparte stapel meer', dlg.includes('vensterBeheer.minimaliseer(NIEUW_BERICHT_VENSTER)') && !dlg.includes('data-concept-dok') && !dlg.includes('registreerZwevend'));
  check('7: Esc hoort bij het bovenste venster: staat een ander venster boven de brief, dan sluit Esc de brief niet', dlg.includes('if (stapelBoven(vensterBeheer.lijst())?.id !== NIEUW_BERICHT_VENSTER) return;'));
  check('7: menu-laag = laag van het eigen venster + 5 (tussen twee stapellagen) en boven het vensterdok', lees('src/mail-opstel-menu-plaats.ts').includes('return Math.max(1300, z + 5, Number.isFinite(dz) ? dz + 1 : 0);'));
  check('6: velden starten meteen uit de lokale kopie (geen leeg eerste beeld)', dlg.includes("useState(() => begin?.body ?? '')") && dlg.includes("useState(() => begin?.to ?? '')"));
  check('6: verzenden/plannen en «Видалити чернетку» wissen de lokale kopie', (dlg.match(/wisConcept\(scopeRef\.current, (finishedId|id|oudId)\)/g) || []).length >= 3);
  check('6: × gesloten én door de server bevestigd → geen lokale kopie (staat in «Чернетки»)', dlg.includes('if (!openRef.current && verborgenRef.current && bewaardRef.current === handtekening(f)) { wisConcept(scope, id);'));
  check('6: server mislukt → opnieuw met uitstel (5 s … 60 s) en bij `online`', dlg.includes('Math.min(60_000, 5000 * 2 ** Math.min(4, foutTeller.current++))') && dlg.includes("window.addEventListener('online', online)"));
  check('6: oude, niet-gescoopte sleutels worden niet meer geschreven', !/localStorage\.setItem\('mail-draft-active-id'/.test(dlg) && !/mail-draft-\$\{/.test(dlg));
  check('6: statusregel toont lokaal + servertijd (data-concept-lokaal / data-concept-server-op)', dlg.includes('data-concept-lokaal={lokaal}') && dlg.includes('conceptStatusTekst(lang,'));
  check('6: venster_stand (versleutelde vensterlade) blijft ongemoeid: geen briefinhoud in het vensterlade-model', !/body|subject|html/.test(lees('shared/vensters-onthouden-model.ts').match(/export type OnthoudenVenster = \{[\s\S]*?\n\};/)?.[0] || 'body'));

  return einde();
}
