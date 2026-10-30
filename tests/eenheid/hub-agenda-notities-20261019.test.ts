// Punten 10 en 11 van de eigenaar (19.10.2026):
//   10. hub.tarasevych.com/agenda — een «magazine календарів»: elke aanbieder met een EERLIJKE stand, en wat er
//       na het koppelen werkelijk werkt. Niets doet alsof; voor wat niet bestaat staat er wat ontbreekt.
//   11. hub.tarasevych.com/notities — soorten notities (tekst, checklist, code, koppeling), kleur, vastzetten,
//       zoeken en etiketten, plus een catalogus van externe notitie-apps met dezelfde eerlijke stand.
// De etiketregels worden hier getoetst tegen de ECHTE grenzen van de server (backend/mcp-console.ts → schoneTags),
// zodat de browser nooit iets bewaart wat de server zou weigeren.
//
// BIJGEWERKT 20.10.2026: punt 10 is doorgebouwd — Google Calendar is nu tweerichtings (lezen én schrijven), en ICS
// en CalDAV lezen werkelijk. De eerlijkheidsREGEL is niet veranderd; de verwachte STAND wel. De diepe toetsing van
// die nieuwe stand staat in tests/eenheid/agenda-tweerichting-20261020.test.ts en
// tests/eenheid/agenda-ics-caldav-20261020.test.ts; hier blijft staan dat de regel zelf geldt.
import { readFileSync } from 'node:fs';
import {
  AGENDA_AANBIEDERS, AGENDA_RICHTING_LABEL, AGENDA_STAND_LABEL, agendaAanbieder, agendaBeschikbaar, agendaBinnenkort,
  agendaKaartStand, agendaKanVerbinden, agendaTekst,
} from '../../shared/agenda-catalogus';
import {
  ETIKET, HUB_ETIKET, KLEUREN, KLEUR_LABEL, MAX_ETIKETTEN, MAX_TEKST, MAX_TITEL, MAX_VRIJE_ETIKETTEN, NOTITIE_APPS,
  SOORTEN, SOORT_IDS, VAST_ETIKET, eersteKoppeling, etiketWolk, etikettenVoorServer, hubNotities, leegVorm, lijstAf,
  lijstUitTekst, notitieApp, notitieKanVerbinden, ordenNotities, schoonEtiket, tekstUitLijst, veiligeKoppeling,
  vormUitEtiketten, zoekNotities, type NotitieRij, type NotitieVorm,
} from '../../shared/notities-model';
import { checker } from './hulp/nep-google';

const lees = (pad: string) => readFileSync(pad, 'utf8');
/** De echte etiketcontrole van de server (backend/mcp-console.ts → schoneTags), hier nagebouwd om tegen te toetsen. */
const SERVER_TAG = /^[A-Za-z0-9:_-]{1,32}$/;
const serverAccepteert = (tags: readonly string[]) => tags.length <= 8 && tags.every((t) => SERVER_TAG.test(t));
const rij = (id: string, titel: string, tekst: string, tags: string[], op: string): NotitieRij =>
  ({ id, title: titel, body: tekst, tags, createdAt: op, updatedAt: op });

export async function main(): Promise<number> {
  const { check, einde } = checker('hub-agenda-notities-20261019');

  // ================================================================ 10. магазин календарів
  const ids = AGENDA_AANBIEDERS.map((a) => a.id);
  check('agenda: catalogus bevroren, id\'s uniek en kebab-case',
    Object.isFrozen(AGENDA_AANBIEDERS) && new Set(ids).size === ids.length && ids.every((id) => /^[a-z][a-z0-9-]*$/.test(id)));
  check('agenda: de zes aanbieders die de eigenaar noemde staan erin (Google, Microsoft/Outlook, CalDAV/iCloud, Proton, Fastmail, ICS)',
    ['google-calendar', 'microsoft-outlook', 'caldav', 'proton-calendar', 'fastmail', 'ics-abonnement'].every((id) => agendaAanbieder(id)));
  check('agenda: ELKE kaart heeft een stand, een richting en uitleg in beide talen',
    AGENDA_AANBIEDERS.every((a) => AGENDA_STAND_LABEL[a.stand] && AGENDA_RICHTING_LABEL[a.richting] && a.uitleg[0].length > 8 && a.uitleg[1].length > 8 && /^https:\/\//.test(a.site)));

  // ---- de eerlijkheidsregel
  const beschikbaar = agendaBeschikbaar();
  const binnenkort = agendaBinnenkort();
  check('agenda: «beschikbaar» heeft een doel dat de koppeling werkelijk uitvoert en een richting die niet «geen» is',
    beschikbaar.length > 0 && beschikbaar.every((a) => a.doel && a.doel.tab && a.richting !== 'geen'));
  check('agenda: «binnenkort» heeft GEEN doel, richting «geen», en zegt in beide talen wat op de server ontbreekt',
    binnenkort.length > 0 && binnenkort.every((a) => !a.doel && !a.levend && a.richting === 'geen' && a.ontbreekt && a.ontbreekt[0].length > 30 && a.ontbreekt[1].length > 30));
  check('agenda: een «binnenkort»-kaart kan nooit een koppelknop tonen',
    binnenkort.every((a) => !agendaKanVerbinden(a)) && beschikbaar.every((a) => agendaKanVerbinden(a)));
  // 20.10.2026: er zijn nu meer «beschikbaar» dan «binnenkort» — dat mag, zolang ELKE «beschikbaar» een doel heeft
  // en een richting die klopt (dat wordt hierboven getoetst). Wat nog ontbreekt, blijft eerlijk «binnenkort».
  check('agenda: «binnenkort» bestaat nog en is nooit leeg gemaakt om de winkel mooier te laten lijken',
    binnenkort.length >= 2 && ['microsoft-outlook', 'proton-calendar'].every((id) => agendaAanbieder(id)!.stand === 'binnenkort'));
  // 29.10.2026: de telefoonkaarten (Samsung, HONOR) zijn BRUGGEN over dezelfde, bewezen Google-koppeling — tweeweg mag daar
  // alleen staan omdat het doel en de levende controle die van Google zelf zijn, en de beperking dat er eerlijk bij zegt.
  check('agenda: tweewegkoppeling alleen bij Google zelf of een brug die aantoonbaar over die Google-koppeling loopt',
    AGENDA_AANBIEDERS.filter((a) => a.richting === 'lezen-en-schrijven').every((a) =>
      a.id === 'google-calendar' || (a.methode === 'bridge' && a.doel?.dienst === 'cloud' && a.doel?.tab === 'google' && a.levend === 'calendar' && Boolean(a.beperking) && /Google/.test(a.beperking![0])))
    && AGENDA_AANBIEDERS.some((a) => a.id === 'google-calendar' && a.richting === 'lezen-en-schrijven'));
  check('agenda: toestelkaarten aanwezig en eerlijk — Samsung/HONOR als brug via Google, iPhone via iCloud (lezen), Huawei «binnenkort» met reden',
    agendaAanbieder('samsung-calendar')!.methode === 'bridge' && agendaAanbieder('honor-calendar')!.methode === 'bridge'
    && agendaAanbieder('apple-icloud')!.stand === 'beschikbaar' && agendaAanbieder('apple-icloud')!.richting === 'lezen' && agendaAanbieder('apple-icloud')!.levend === 'caldav'
    && agendaAanbieder('huawei-calendar')!.stand === 'binnenkort' && /API/.test(agendaAanbieder('huawei-calendar')!.ontbreekt![0]));

  // ---- Google Calendar: koppelen kan, maar alleen lezen — en dat staat op de kaart
  const google = agendaAanbieder('google-calendar')!;
  check('agenda: Google Calendar is «beschikbaar», leest ÉN schrijft, en noemt zelf wat nog niet kan',
    google.stand === 'beschikbaar' && google.richting === 'lezen-en-schrijven' && google.levend === 'calendar'
    && google.doel?.dienst === 'cloud' && google.doel?.tab === 'google'
    && Boolean(google.beperking) && /Meet/.test(google.beperking![1]));
  // Die bewering wordt getoetst aan de code: de scopes zijn er werkelijk en de schrijfroutes bestaan echt.
  const onboarding = lees('backend/google-suite-inrichting.ts');
  const agendaRoutes = lees('backend/agenda-routes.ts');
  check('agenda: de bewering klopt — de server vraagt calendar.readonly ÉN calendar.events en heeft echte schrijfroutes',
    /auth\/calendar\.readonly/.test(onboarding) && /auth\/calendar\.events/.test(onboarding)
    && ['aanmaken', 'wijzigen', 'verplaatsen', 'verwijderen', 'deelnemers', 'antwoord']
      .every((a) => agendaRoutes.includes(`/api/owner/agenda/gebeurtenis/${a}`)));
  const microsoft = agendaAanbieder('microsoft-outlook')!;
  check('agenda: Outlook is «binnenkort» en dat klopt — de Microsoft-aanmelding vraagt alleen mailscopes',
    microsoft.stand === 'binnenkort' && /Mail\.Read/.test(lees('backend/mail-microsoft.ts')) && !/Calendars\./.test(lees('backend/mail-microsoft.ts')));
  check('agenda: CalDAV, Fastmail en ICS zijn nu «beschikbaar» en dat klopt — de cliënt en de ophaler bestaan echt',
    ['caldav', 'fastmail', 'ics-abonnement'].every((id) => agendaAanbieder(id)!.stand === 'beschikbaar' && agendaAanbieder(id)!.richting === 'lezen')
    && /caldav/i.test(lees('backend/index.ts')) && /PROPFIND/.test(lees('backend/agenda-caldav.ts'))
    && /pinnedFetch/.test(lees('backend/agenda-ics.ts')));
  check('agenda: maar ze beloven geen schrijven — de kaart zegt per stuk wat daarvoor ontbreekt',
    ['caldav', 'fastmail'].every((id) => /If-Match/.test(agendaAanbieder(id)!.beperking![1]))
    && /eenrichting/.test(agendaAanbieder('ics-abonnement')!.beperking![1]));

  // ---- de levende stand komt van de server, niet uit de catalogus
  check('agenda: zonder servercontrole is Google «beschikbaar», met gekoppeld=true «verbonden», en nooit iets anders',
    agendaKaartStand(google) === 'beschikbaar'
    && agendaKaartStand(google, { calendar: null }) === 'beschikbaar'
    && agendaKaartStand(google, { calendar: false }) === 'beschikbaar'
    && agendaKaartStand(google, { calendar: true }) === 'verbonden');
  check('agenda: een «binnenkort»-kaart wordt nooit «verbonden», wat de server ook zegt',
    binnenkort.every((a) => agendaKaartStand(a, { calendar: true }) === 'binnenkort'));
  check('agenda: tweetalig kiezen werkt', agendaTekst(google.uitleg, 'uk') === google.uitleg[0] && agendaTekst(google.uitleg, 'nl') === google.uitleg[1]);

  // ---- de pagina
  const pagina = lees('src/agenda/Agenda.tsx');
  check('agenda: de pagina leest de levende stand bij de server (nu de eigen agenda-route) en toont de groepen apart',
    pagina.includes('laadOverzicht') && pagina.includes('toegang') && pagina.includes('agendaKaartStand')
    && pagina.includes("data-agenda-stand=") && pagina.includes('data-agenda-ontbreekt=') && pagina.includes('data-agenda-beperking=')
    && lees('src/agenda/agenda-client.ts').includes('/api/owner/agenda/overzicht'));
  check('agenda: de koppelknop bestaat alleen waar koppelen echt kan',
    /agendaKanVerbinden\(aanbieder\)/.test(pagina) && /data-agenda-verbinden=/.test(pagina) && /canonicalNavigationUrl\(a\.doel\.dienst, a\.doel\.tab, lang\)/.test(pagina));
  check('agenda: niets verzonnen op de pagina (geen voorbeelddata, geen willekeur)',
    !/Math\.random/.test(pagina) && !/voorbeeld|demo|dummy|lorem/i.test(pagina));
  // De grote merkentabel (src/merk/merk-logos.ts, ±128 merken) hoort bij de beheerpagina en mag niet in de hub-bundel
  // belanden; de kaarten gebruiken een monogram. Alleen de IMPORTS tellen (een verwijzing in een commentaar mag).
  const agendaImports = [...pagina.matchAll(/^import .*$/gm)].map((m) => m[0]).join('\n');
  check('agenda: de pagina hangt niet aan de grote merkentabel van de beheerpagina',
    !/integraties\/(Logo|logos)/.test(agendaImports) && pagina.includes('agenda-monogram'));
  const app = lees('src/App.tsx');
  check('agenda: het onderdeel staat op het tabblad «Календар»',
    app.includes("{hubTab==='calendar'&&state==='authorized'&&<Agenda lang={lang} ownerUserId={user?.id||''}/>}"));

  // ================================================================ 11. нотатки
  check('notities: de vier soorten die de eigenaar vroeg bestaan, met uitleg in beide talen',
    SOORT_IDS.join(',') === 'tekst,lijst,code,koppeling'
    && SOORTEN.every((s) => s.titel[0] && s.titel[1] && s.uitleg[0].length > 8 && s.uitleg[1].length > 8));
  check('notities: kleuren hebben labels en «geen» is de rust-stand',
    KLEUREN[0] === 'geen' && KLEUREN.every((k) => KLEUR_LABEL[k] && KLEUR_LABEL[k][0] && KLEUR_LABEL[k][1]));
  check('notities: de grenzen zijn die van de server (8 etiketten, titel 160, tekst 4000)',
    MAX_ETIKETTEN === 8 && MAX_TITEL === 160 && MAX_TEKST === 4000 && MAX_VRIJE_ETIKETTEN === 4
    && /raw\.length > 8/.test(lees('backend/mcp-console.ts'))
    && /title\.slice\(0, 160\)/.test(lees('backend/mcp-console.ts')) && /body\.slice\(0, 4000\)/.test(lees('backend/mcp-console.ts')));

  // ---- etiketten: alles wat we opslaan moet de server accepteren
  const vol: NotitieVorm = { titel: 'x', tekst: '', soort: 'code', kleur: 'roze', vast: true, etiketten: ['werk', 'thuis', 'idee', 'later', 'teveel', 'nogmeer'] };
  const tags = etikettenVoorServer(vol);
  check('notities: soort, kleur en «vast» zitten in de etiketten (geen nieuwe tabel nodig)',
    tags.includes(HUB_ETIKET) && tags.includes('soort:code') && tags.includes('kleur:roze') && tags.includes(VAST_ETIKET));
  check('notities: nooit meer dan 8 etiketten, en de server accepteert ze allemaal',
    tags.length === MAX_ETIKETTEN && serverAccepteert(tags) && tags.every((t) => ETIKET.test(t)));
  check('notities: «tekst» en «geen kleur» kosten geen etiket (de rust-stand is stil)',
    etikettenVoorServer(leegVorm()).join(',') === HUB_ETIKET);
  check('notities: een vrij etiket wordt opgeschoond; onzin en systeem-etiketten worden geweigerd',
    schoonEtiket(' Mijn Idee ') === 'mijn-idee' && schoonEtiket('ПРОЄКТ') === '' && schoonEtiket('hub') === ''
    && schoonEtiket('soort:code') === '' && schoonEtiket('kleur:geel') === '' && schoonEtiket('vast') === ''
    && schoonEtiket('--x') === 'x' && schoonEtiket('') === '' && schoonEtiket(null) === ''
    && schoonEtiket('a'.repeat(50)).length === 32);
  check('notities: een opgeschoond etiket wordt altijd door de server geaccepteerd',
    ['Mijn Idee', 'werk/2026', 'a_b-c:d', 'x'.repeat(40)].every((ruw) => { const e = schoonEtiket(ruw); return !e || SERVER_TAG.test(e); }));
  check('notities: dubbele vrije etiketten komen er maar één keer in',
    etikettenVoorServer({ ...leegVorm(), etiketten: ['werk', 'werk', 'Werk'] }).filter((t) => t === 'werk').length === 1);

  // ---- terug uit de etiketten: wat is deze notitie werkelijk
  const terug = vormUitEtiketten('Titel', 'tekst', tags);
  check('notities: soort, kleur, «vast» en de vrije etiketten komen correct terug',
    terug.soort === 'code' && terug.kleur === 'roze' && terug.vast === true && terug.etiketten.length === 4 && !terug.etiketten.includes(HUB_ETIKET));
  check('notities: onbekende of ontbrekende waarden vallen terug op het veilige (tekst, geen kleur, niet vast)',
    (() => { const v = vormUitEtiketten('t', 'b', ['hub', 'soort:bestaat-niet', 'kleur:paars']); return v.soort === 'tekst' && v.kleur === 'geen' && !v.vast; })()
    && (() => { const v = vormUitEtiketten(null, undefined, null); return v.soort === 'tekst' && v.kleur === 'geen' && v.titel === '' && v.tekst === ''; })());
  check('notities: heen en terug verandert niets (soort/kleur/vast blijven gelijk)',
    (() => { const heen = etikettenVoorServer(vol); const v = vormUitEtiketten(vol.titel, vol.tekst, heen); return v.soort === vol.soort && v.kleur === vol.kleur && v.vast === vol.vast; })());
  check('notities: te lange titel en tekst worden afgekapt op de grens van de server',
    vormUitEtiketten('t'.repeat(400), 'b'.repeat(9000), ['hub']).titel.length === MAX_TITEL
    && vormUitEtiketten('t', 'b'.repeat(9000), ['hub']).tekst.length === MAX_TEKST);

  // ---- контрольний список
  const regels = lijstUitTekst('- [ ] melk\n- [x] brood\ngewone regel\n\n   - [X] kaas  ');
  check('checklist: afgestreepte en open regels worden gelezen, ook met hoofdletter X en losse regels',
    regels.length === 4 && regels[0].af === false && regels[0].tekst === 'melk' && regels[1].af === true
    && regels[2].tekst === 'gewone regel' && regels[2].af === false && regels[3].af === true && regels[3].tekst === 'kaas');
  check('checklist: lege regels verdwijnen en de telling klopt', lijstAf(regels) === 2 && lijstUitTekst('\n\n  \n').length === 0);
  check('checklist: heen en terug geeft dezelfde regels (en een nette tekst)',
    tekstUitLijst(regels) === '- [ ] melk\n- [x] brood\n- [ ] gewone regel\n- [x] kaas'
    && JSON.stringify(lijstUitTekst(tekstUitLijst(regels))) === JSON.stringify(regels));
  check('checklist: de tekst blijft binnen de grens van de server', tekstUitLijst(Array.from({ length: 900 }, () => ({ af: false, tekst: 'x'.repeat(20) }))).length <= MAX_TEKST);

  // ---- посилання
  check('koppeling: alleen https; javascript:, data: en http: zijn geen koppeling',
    veiligeKoppeling('https://hub.tarasevych.com/notities') === 'https://hub.tarasevych.com/notities'
    && veiligeKoppeling('http://x.nl') === '' && veiligeKoppeling('javascript:alert(1)') === ''
    && veiligeKoppeling('data:text/html,<b>x') === '' && veiligeKoppeling('geen url') === '' && veiligeKoppeling(null) === '');
  check('koppeling: de eerste https in de tekst wordt gevonden',
    eersteKoppeling('zie ook https://example.org/a en http://x.nl') === 'https://example.org/a' && eersteKoppeling('niets hier') === '');

  // ---- zoeken, etiketten en ordenen
  const lijst: NotitieRij[] = [
    rij('1', 'Boodschappen', '- [ ] melk', ['hub', 'soort:lijst', 'thuis'], '2026-10-01T10:00:00Z'),
    rij('2', 'Niet van de hub', 'x', ['werk'], '2026-10-05T10:00:00Z'),
    rij('3', 'Déploy script', 'ssh beheer@…', ['hub', 'soort:code', 'werk'], '2026-10-02T10:00:00Z'),
    rij('4', 'Vastgezet idee', 'later uitwerken', ['hub', VAST_ETIKET, 'idee'], '2026-10-03T10:00:00Z'),
  ];
  const hub = hubNotities(lijst);
  check('zoeken: alleen notities van dit tabblad (etiket hub)', hub.length === 3 && !hub.some((n) => n.id === '2'));
  check('ordenen: vastgezet bovenaan, daarbinnen de nieuwste eerst', ordenNotities(hub).map((n) => n.id).join(',') === '4,3,1');
  check('zoeken: op woorden in titel, tekst en etiketten; accenten en hoofdletters doen niet mee',
    zoekNotities(hub, 'deploy').map((n) => n.id).join(',') === '3'
    && zoekNotities(hub, 'MELK').map((n) => n.id).join(',') === '1'
    && zoekNotities(hub, 'thuis').map((n) => n.id).join(',') === '1'
    && zoekNotities(hub, 'later uitwerken').map((n) => n.id).join(',') === '4');
  check('zoeken: alle woorden moeten voorkomen, en een leeg filter geeft alles',
    zoekNotities(hub, 'deploy melk').length === 0 && zoekNotities(hub, '   ').length === 3 && zoekNotities(hub, '').length === 3);
  check('zoeken: filter op etiket en op soort, los en samen',
    zoekNotities(hub, '', 'werk').map((n) => n.id).join(',') === '3'
    && zoekNotities(hub, '', '', 'lijst').map((n) => n.id).join(',') === '1'
    && zoekNotities(hub, '', '', 'code').map((n) => n.id).join(',') === '3'
    && zoekNotities(hub, 'idee', 'idee').map((n) => n.id).join(',') === '4'
    && zoekNotities(hub, '', 'werk', 'lijst').length === 0);
  check('zoeken: een onbekend of onzin-etiket als filter laat niets door, maar laat de lijst heel',
    zoekNotities(hub, '', 'bestaat-niet').length === 0 && zoekNotities(hub, '', 'ПРОЄКТ').length === 3);
  const wolk = etiketWolk(hub);
  check('etiketten: de wolk bevat alleen vrije etiketten, met hun aantal, meest gebruikte eerst',
    wolk.map((x) => x.etiket).sort().join(',') === 'idee,thuis,werk'
    && !wolk.some((x) => x.etiket === HUB_ETIKET || x.etiket === VAST_ETIKET || x.etiket.startsWith('soort:')));
  check('etiketten: een lege lijst geeft een lege wolk', etiketWolk([]).length === 0);

  // ---- catalogus van notitie-apps
  const appIds = NOTITIE_APPS.map((a) => a.id);
  check('apps: de vijf apps die de eigenaar noemde staan erin, bevroren en met unieke id\'s',
    Object.isFrozen(NOTITIE_APPS) && new Set(appIds).size === appIds.length
    && ['google-keep', 'notion', 'obsidian', 'apple-notes', 'markdown-invoer'].every((id) => notitieApp(id)));
  check('apps: ELKE app heeft een stand, een richting en uitleg in beide talen',
    NOTITIE_APPS.every((a) => ['beschikbaar', 'binnenkort'].includes(a.stand) && a.richting && a.uitleg[0].length > 8 && a.uitleg[1].length > 8 && /^https:\/\//.test(a.site)));
  check('apps: elke nog niet gebouwde app zegt in beide talen wat ontbreekt en heeft géén doel of koppelknop',
    NOTITIE_APPS.filter((a) => a.stand === 'binnenkort').every((a) => !a.doel && a.richting === 'geen' && a.ontbreekt && a.ontbreekt[0].length > 30 && a.ontbreekt[1].length > 30 && !notitieKanVerbinden(a)));
  check('apps: vandaag is er nog geen enkele koppeling — en de catalogus zegt dat ook zo',
    NOTITIE_APPS.every((a) => a.stand === 'binnenkort'));

  // ---- de pagina
  const notes = lees('src/HubNotities.tsx');
  check('notities: de pagina gebruikt het gedeelde model en geen eigen, tweede set regels',
    notes.includes("from '../shared/notities-model'") && notes.includes('etikettenVoorServer(') && notes.includes('vormUitEtiketten(')
    && notes.includes('zoekNotities(') && notes.includes('ordenNotities('));
  check('notities: de vier soorten, kleur en «vast» zijn in te stellen',
    /data-hub-notes-soort=/.test(notes) && /hub-notes-kleur/.test(notes) && /hub-notes-vast/.test(notes)
    && /data-hub-note-soort=/.test(notes) && /data-hub-note-vast=/.test(notes));
  check('notities: zoeken, soortfilter en de etikettenwolk staan op de pagina',
    /role='search'/.test(notes) && /hub-notes-wolk/.test(notes) && /setSoortFilter/.test(notes) && /data-hub-notes-geen-treffer='1'/.test(notes));
  check('notities: de checklist is af te strepen en dat wordt bewaard',
    /hub-notes-checklist/.test(notes) && /tekstUitLijst\(/.test(notes) && /bewaarDirect\(/.test(notes));
  check('notities: de catalogus van apps staat op de pagina, met de stand per app',
    /data-hub-notes-apps-paneel='1'/.test(notes) && /data-hub-notes-app-stand=/.test(notes) && /notitieKanVerbinden\(app\)/.test(notes));
  check('notities: de bestaande, zuivere lijst-functie blijft bestaan (andere plekken gebruiken haar)',
    notes.includes('export const hubNotities') && notes.includes("export type HubNotitie"));
  check('notities: niets verzonnen (geen voorbeelddata, geen willekeur)', !/Math\.random/.test(notes) && !/lorem/i.test(notes));
  check('notities: het tabblad blijft het bestaande onderdeel gebruiken', app.includes("hubTab==='notes'&&<HubNotes lang={lang}/>"));

  // ================================================================ punt 5: de twee grote knoppen
  check('punt 5: «Поділитися» en «Налаштувати поверхню» staan niet meer als grote knoppen in de zijbalk',
    !/workspace-sidebar-actions'[^;]*<button type='button' onClick=\{\(\)=>void openShare\(\)\}/.test(app)
    && app.includes("const sidebarActions=state==='authorized'&&spaces.length>1?")
    && app.includes('sidebarActions={alleenModaal?null:sidebarActions}'));
  check('punt 5: ze zijn nu gewone acties in het «⋯»-menu van het onderdeel',
    app.includes("className='hub-sectie-menu'") && app.includes("role='menu'")
    && (app.match(/role='menuitem'/g) || []).length === 4
    && app.includes("data-hub-share-action='true'") && app.includes("void openIdentity('personalization')"));
  check('punt 5: het menu sluit met Escape en met een klik ernaast',
    /event\.key==='Escape'\)setSectieMenu\(false\)/.test(app) && /closest\?\.\('\.hub-sectie-menu'\)/.test(app));
  const hubCss = lees('src/hub-functioneel-blokken.css');
  check('punt 5: de kop van het onderdeel heeft nu opmaak en het menu is onopvallend',
    /\.hub-workspace-head\{/.test(hubCss) && /\.hub-sectie-menu-knop\{/.test(hubCss) && /background:transparent/.test(hubCss)
    && /\.hub-sectie-menu-knop:focus-visible\{outline/.test(hubCss));

  return einde();
}
