// Voorkeuren van de technische strook (zoekronde 02.11.2026): modus, grootte, tekst en volgorde van de knoppen. Standalone: geen
// database, geen netwerk; een geheugen-opslag vervangt localStorage.
//
// Bijgewerkt na de BESLISSING VAN DE EIGENAAR van 03.11.2026 («Смуга зараз постійно видна … має … згортатися в тонку смужку … і
// розгортатися, коли наводжу на верхню область вікна»):
//  • standaard is nu «auto» (was «uitgeklapt») — de controles «standaard … uitgeklapt» zijn daarom «… auto» geworden;
//  • in- en uitklappen is een VASTE knop van de strook (net als «⋯» en ⚙, ook in de dunne strook nodig): de kiesbare knop «inklap» is
//    vervallen; de standaardknoppen zijn nu meldingen, wissel, uit; een bewaarde lijst verliest «inklap» stil (aparte controle);
//  • nieuw: willekeurige plaats (zetOp, slepen via dropPlek), laatsteInklap, en de woorden van de eigenaar voor de vorm van de knoppen.
import { checker } from './hulp/nep-google';
import { LABEL_NAMEN, STROOK_KNOP_IDS, STROOK_MAX_KNOPPEN, STROOK_OUDE_INKLAP_SLEUTEL, STROOK_SLEUTEL, STROOK_STANDAARD, bewaarVoorkeur, dropPlek, leesVoorkeur, metModus, normaliseer, paneelLijst, verplaats, volgendeModus, zetAan, zetOp } from '../../src/tech/strook-voorkeur';

function geheugen(): Storage & { kaart: Map<string, string> } {
  const kaart = new Map<string, string>();
  return {
    kaart,
    getItem: (k: string) => (kaart.has(k) ? kaart.get(k)! : null),
    setItem: (k: string, v: string) => { kaart.set(k, String(v)); },
    removeItem: (k: string) => { kaart.delete(k); },
    clear: () => kaart.clear(),
    key: () => null,
    get length() { return kaart.size; },
  } as Storage & { kaart: Map<string, string> };
}

export async function main(): Promise<number> {
  const { check, einde } = checker('strook-voorkeur');

  // 03.11.2026: standaard automatisch (eigenaar), in-/uitklappen is een vaste knop → niet meer in de kiesbare lijst.
  check('standaard: automatisch, middel, pictogrammen met tekst, meldingen/wissel/uit (in-/uitklappen = vaste knop)', STROOK_STANDAARD.modus === 'auto' && STROOK_STANDAARD.grootte === 'middel' && STROOK_STANDAARD.label === 'beide' && STROOK_STANDAARD.knoppen.join(',') === 'meldingen,wissel,uit' && STROOK_STANDAARD.laatsteInklap === 'auto' && !STROOK_KNOP_IDS.includes('inklap'));

  {
    const op = geheugen();
    check('zonder opslag: standaard (automatisch)', leesVoorkeur(op).modus === 'auto');
    const v = { modus: 'uitgeklapt', grootte: 'groot', label: 'iconen', knoppen: ['uit', 'terminal', 'meldingen'], laatsteInklap: 'ingeklapt' } as const;
    bewaarVoorkeur({ ...v, knoppen: [...v.knoppen] }, op);
    const terug = leesVoorkeur(op);
    check('bewaren en lezen geeft dezelfde keuze', terug.modus === 'uitgeklapt' && terug.grootte === 'groot' && terug.label === 'iconen' && terug.knoppen.join(',') === 'uit,terminal,meldingen' && terug.laatsteInklap === 'ingeklapt');
    check('bewaard onder de vaste sleutel', op.kaart.has(STROOK_SLEUTEL));
    const oudeLijst = normaliseer({ modus: 'uitgeklapt', knoppen: ['meldingen', 'wissel', 'inklap', 'uit'] });
    check('bewaarde lijst van 02.11 met «inklap»: die valt stil weg (vaste knop), de rest blijft in volgorde', oudeLijst.knoppen.join(',') === 'meldingen,wissel,uit');
    check('bewaarde keuze van vóór 03.11 zonder laatsteInklap: uitgeklapt blijft uitgeklapt, inklappen gaat naar automatisch', oudeLijst.modus === 'uitgeklapt' && oudeLijst.laatsteInklap === 'auto');
  }

  {
    const op = geheugen();
    op.setItem(STROOK_OUDE_INKLAP_SLEUTEL, '1');
    check('oude «ingeklapt»-schakelaar telt mee als modus ingeklapt (migratie)', leesVoorkeur(op).modus === 'ingeklapt' && leesVoorkeur(op).laatsteInklap === 'ingeklapt');
    op.setItem(STROOK_SLEUTEL, JSON.stringify({ modus: 'uitgeklapt', grootte: 'middel', label: 'beide', knoppen: [] }));
    check('de nieuwe voorkeur wint van de oude schakelaar', leesVoorkeur(op).modus === 'uitgeklapt');
  }

  {
    const op = geheugen();
    op.setItem(STROOK_SLEUTEL, '{kapot');
    check('kapotte JSON → standaard, geen fout', leesVoorkeur(op).modus === STROOK_STANDAARD.modus);
    const n = normaliseer({ modus: 'zweef', grootte: 'reusachtig', label: 'x', knoppen: ['uit', 'hack', 'uit', 42, 'terminal'], laatsteInklap: 'uitgeklapt' });
    check('onbekende waarden vallen terug; onbekende en dubbele knoppen weg', n.modus === STROOK_STANDAARD.modus && n.grootte === 'middel' && n.label === 'beide' && n.knoppen.join(',') === 'uit,terminal' && n.laatsteInklap === 'auto');
    check('knoppenlijst wordt begrensd', normaliseer({ knoppen: [...STROOK_KNOP_IDS, ...STROOK_KNOP_IDS] }).knoppen.length <= STROOK_MAX_KNOPPEN);
  }

  {
    const kapot = { getItem: () => { throw new Error('geblokkeerd'); }, setItem: () => { throw new Error('vol'); } } as unknown as Storage;
    let gegooid = false;
    try {
      check('geblokkeerde opslag: lezen geeft standaard', leesVoorkeur(kapot).modus === STROOK_STANDAARD.modus);
      bewaarVoorkeur(STROOK_STANDAARD, kapot);
    } catch {
      gegooid = true;
    }
    check('geblokkeerde opslag gooit geen fout', !gegooid);
  }

  {
    // 03.11.2026: «inklap» is geen kiesbare knop meer; dezelfde controle met een andere vierde knop.
    const v = normaliseer({ knoppen: ['meldingen', 'wissel', 'terminal', 'uit'] });
    const naarRechts = verplaats(v, 'meldingen', 1);
    check('verplaatsen naar rechts wisselt met de buur', naarRechts.knoppen.join(',') === 'wissel,meldingen,terminal,uit');
    check('verplaatsen naar links van de eerste knop: ongewijzigd', verplaats(v, 'meldingen', -1).knoppen.join(',') === v.knoppen.join(','));
    check('verplaatsen naar rechts van de laatste knop: ongewijzigd', verplaats(v, 'uit', 1).knoppen.join(',') === v.knoppen.join(','));
    check('verplaatsen van een knop die niet op de strook staat: ongewijzigd', verplaats(v, 'api', 1).knoppen.join(',') === v.knoppen.join(','));
    check('verplaatsen verandert het origineel niet', v.knoppen[0] === 'meldingen');
  }

  {
    const v = normaliseer({ knoppen: ['uit'] });
    const aan = zetAan(v, 'terminal', true);
    check('knop toevoegen komt achteraan', aan.knoppen.join(',') === 'uit,terminal');
    check('dubbel toevoegen doet niets', zetAan(aan, 'terminal', true).knoppen.length === 2);
    check('knop verbergen haalt hem eraf', zetAan(aan, 'uit', false).knoppen.join(',') === 'terminal');
    check('onbekende knop wordt niet toegevoegd', zetAan(v, 'hack', true).knoppen.join(',') === 'uit');
    const vol = normaliseer({ knoppen: [...STROOK_KNOP_IDS].slice(0, STROOK_MAX_KNOPPEN) });
    check('niet meer dan het maximum op de strook', zetAan(vol, 'band', true).knoppen.length === STROOK_MAX_KNOPPEN || vol.knoppen.includes('band'));
  }

  {
    check('snelknop wisselt uitgeklapt en ingeklapt', volgendeModus('uitgeklapt') === 'ingeklapt' && volgendeModus('ingeklapt') === 'uitgeklapt');
    // De oude naam «klapt in» klopte niet met wat de controle al eiste: vanuit automatisch zet de knop de strook VAST (uitgeklapt).
    check('vanuit automatisch zet de snelknop de strook vast (uitgeklapt, «Закріпити»)', volgendeModus('auto') === 'uitgeklapt');
    check('«Згорнути» vanuit uitgeklapt gaat naar de laatst gebruikte ingeklapte modus', volgendeModus('uitgeklapt', 'auto') === 'auto' && volgendeModus('uitgeklapt', 'ingeklapt') === 'ingeklapt');
    const b = normaliseer({ modus: 'uitgeklapt' });
    check('metModus: een ingeklapte modus wordt onthouden, uitgeklapt laat de vorige staan', metModus(b, 'ingeklapt').laatsteInklap === 'ingeklapt' && metModus(metModus(b, 'ingeklapt'), 'uitgeklapt').laatsteInklap === 'ingeklapt' && metModus(b, 'auto').modus === 'auto');
  }

  {
    // Willekeurige volgorde (eigenaar: «кнопки можна переставляти в довільному порядку»): slepen en «На початок / У кінець».
    const v = normaliseer({ knoppen: ['meldingen', 'wissel', 'terminal', 'uit'] });
    check('zetOp: naar voren', zetOp(v, 'uit', 0).knoppen.join(',') === 'uit,meldingen,wissel,terminal');
    check('zetOp: naar achteren (ook voorbij het einde begrensd)', zetOp(v, 'meldingen', 99).knoppen.join(',') === 'wissel,terminal,uit,meldingen' && zetOp(v, 'meldingen', -5).knoppen.join(',') === v.knoppen.join(','));
    check('zetOp: knop die er nog niet op staat komt erbij op die plek', zetOp(v, 'api', 1).knoppen.join(',') === 'meldingen,api,wissel,terminal,uit');
    check('zetOp: onbekende knop of zelfde plek: ongewijzigd (zelfde object)', zetOp(v, 'hack', 0) === v && zetOp(v, 'meldingen', 0) === v);
    const vol = normaliseer({ knoppen: [...STROOK_KNOP_IDS] });
    check('zetOp: volle strook neemt geen nieuwe knop, verplaatsen kan wel', zetOp(vol, 'meldingen', vol.knoppen.length).knoppen[vol.knoppen.length - 1] === 'meldingen' && vol.knoppen.length === STROOK_KNOP_IDS.length);
    const k = v.knoppen;
    check('dropPlek: op de tweede helft van een knop rechts ervan, op de eerste helft links ervan', zetOp(v, 'meldingen', dropPlek(k, 'meldingen', 'terminal', true)!).knoppen.join(',') === 'wissel,terminal,meldingen,uit' && zetOp(v, 'uit', dropPlek(k, 'uit', 'wissel', false)!).knoppen.join(',') === 'meldingen,uit,wissel,terminal');
    check('dropPlek: op zichzelf of op een onbekende knop → niets', dropPlek(k, 'wissel', 'wissel', true) === null && dropPlek(k, 'wissel', 'hack', false) === null);
    check('dropPlek: knop van buiten de strook op een knop van de strook → erbij op die plek', zetOp(v, 'api', dropPlek(k, 'api', 'wissel', false)!).knoppen.join(',') === 'meldingen,api,wissel,terminal,uit');
  }

  check('vorm van de knoppen in de woorden van de eigenaar (uk) en in het Nederlands', LABEL_NAMEN.iconen.uk === 'Лише піктограми' && LABEL_NAMEN.beide.uk === 'Піктограми з написами' && LABEL_NAMEN.tekst.uk === 'Лише написи' && LABEL_NAMEN.tekst.nl === 'Alleen tekst');

  {
    const lijst = paneelLijst(normaliseer({ knoppen: ['uit', 'meldingen'] }));
    check('paneel: zichtbare knoppen eerst in volgorde, daarna de rest uitgeschakeld', lijst[0].id === 'uit' && lijst[0].aan && lijst[1].id === 'meldingen' && lijst[1].aan && !lijst[2].aan);
    check('paneel bevat elke kiesbare knop precies één keer', lijst.length === STROOK_KNOP_IDS.length && new Set(lijst.map(x => x.id)).size === STROOK_KNOP_IDS.length);
  }

  return einde();
}
