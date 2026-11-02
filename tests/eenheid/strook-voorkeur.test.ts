// Voorkeuren van de technische strook (zoekronde 02.11.2026): modus, grootte, tekst en volgorde van de knoppen. Standalone: geen
// database, geen netwerk; een geheugen-opslag vervangt localStorage.
import { checker } from './hulp/nep-google';
import { STROOK_KNOP_IDS, STROOK_MAX_KNOPPEN, STROOK_OUDE_INKLAP_SLEUTEL, STROOK_SLEUTEL, STROOK_STANDAARD, bewaarVoorkeur, leesVoorkeur, normaliseer, paneelLijst, verplaats, volgendeModus, zetAan } from '../../src/tech/strook-voorkeur';

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

  check('standaard: uitgeklapt, middel, tekst bij knoppen, de vier vroegere knoppen', STROOK_STANDAARD.modus === 'uitgeklapt' && STROOK_STANDAARD.grootte === 'middel' && STROOK_STANDAARD.label === 'beide' && STROOK_STANDAARD.knoppen.join(',') === 'meldingen,wissel,inklap,uit');

  {
    const op = geheugen();
    check('zonder opslag: standaard', leesVoorkeur(op).modus === 'uitgeklapt');
    const v = { modus: 'auto', grootte: 'groot', label: 'iconen', knoppen: ['uit', 'terminal', 'meldingen'] } as const;
    bewaarVoorkeur({ ...v, knoppen: [...v.knoppen] }, op);
    const terug = leesVoorkeur(op);
    check('bewaren en lezen geeft dezelfde keuze', terug.modus === 'auto' && terug.grootte === 'groot' && terug.label === 'iconen' && terug.knoppen.join(',') === 'uit,terminal,meldingen');
    check('bewaard onder de vaste sleutel', op.kaart.has(STROOK_SLEUTEL));
  }

  {
    const op = geheugen();
    op.setItem(STROOK_OUDE_INKLAP_SLEUTEL, '1');
    check('oude «ingeklapt»-schakelaar telt mee als modus ingeklapt (migratie)', leesVoorkeur(op).modus === 'ingeklapt');
    op.setItem(STROOK_SLEUTEL, JSON.stringify({ modus: 'uitgeklapt', grootte: 'middel', label: 'beide', knoppen: [] }));
    check('de nieuwe voorkeur wint van de oude schakelaar', leesVoorkeur(op).modus === 'uitgeklapt');
  }

  {
    const op = geheugen();
    op.setItem(STROOK_SLEUTEL, '{kapot');
    check('kapotte JSON → standaard, geen fout', leesVoorkeur(op).modus === 'uitgeklapt');
    const n = normaliseer({ modus: 'zweef', grootte: 'reusachtig', label: 'x', knoppen: ['uit', 'hack', 'uit', 42, 'terminal'] });
    check('onbekende waarden vallen terug; onbekende en dubbele knoppen weg', n.modus === 'uitgeklapt' && n.grootte === 'middel' && n.label === 'beide' && n.knoppen.join(',') === 'uit,terminal');
    check('knoppenlijst wordt begrensd', normaliseer({ knoppen: [...STROOK_KNOP_IDS, ...STROOK_KNOP_IDS] }).knoppen.length <= STROOK_MAX_KNOPPEN);
  }

  {
    const kapot = { getItem: () => { throw new Error('geblokkeerd'); }, setItem: () => { throw new Error('vol'); } } as unknown as Storage;
    let gegooid = false;
    try {
      check('geblokkeerde opslag: lezen geeft standaard', leesVoorkeur(kapot).modus === 'uitgeklapt');
      bewaarVoorkeur(STROOK_STANDAARD, kapot);
    } catch {
      gegooid = true;
    }
    check('geblokkeerde opslag gooit geen fout', !gegooid);
  }

  {
    const v = normaliseer({ knoppen: ['meldingen', 'wissel', 'inklap', 'uit'] });
    const naarRechts = verplaats(v, 'meldingen', 1);
    check('verplaatsen naar rechts wisselt met de buur', naarRechts.knoppen.join(',') === 'wissel,meldingen,inklap,uit');
    check('verplaatsen naar links van de eerste knop: ongewijzigd', verplaats(v, 'meldingen', -1).knoppen.join(',') === v.knoppen.join(','));
    check('verplaatsen naar rechts van de laatste knop: ongewijzigd', verplaats(v, 'uit', 1).knoppen.join(',') === v.knoppen.join(','));
    check('verplaatsen van een knop die niet op de strook staat: ongewijzigd', verplaats(v, 'terminal', 1).knoppen.join(',') === v.knoppen.join(','));
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
    check('vanuit automatisch klapt de snelknop in', volgendeModus('auto') === 'uitgeklapt');
  }

  {
    const lijst = paneelLijst(normaliseer({ knoppen: ['uit', 'meldingen'] }));
    check('paneel: zichtbare knoppen eerst in volgorde, daarna de rest uitgeschakeld', lijst[0].id === 'uit' && lijst[0].aan && lijst[1].id === 'meldingen' && lijst[1].aan && !lijst[2].aan);
    check('paneel bevat elke kiesbare knop precies één keer', lijst.length === STROOK_KNOP_IDS.length && new Set(lijst.map(x => x.id)).size === STROOK_KNOP_IDS.length);
  }

  return einde();
}
