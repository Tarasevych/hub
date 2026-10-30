// DE LAAG DIE ONTHOUDEN VENSTERS TERUGBRENGT. Staat in CanonicalChrome en dus op ELK subdomein (hub, mail, cloud …).
//
// De klacht van de eigenaar (20.10.2026): «згорнуті вікна в одному просторі втрачаються, якщо я переходжу на інший
// піддомен». Dat kwam doordat het vensterbeheer zijn lijst in het geheugen van het tabblad houdt. Nu staat die lijst op de
// server (per account en per ruimte) en bouwt deze laag de vensters op elk subdomein opnieuw op:
//   • bij het eerste beeld uit de cache (localStorage), daarna uit de server (vensterStandOphalen);
//   • een venster dat geminimaliseerd was, wordt ook geminimaliseerd geregistreerd — het staat dus meteen in het dok
//     rechtsonder en is met één klik terug, net als vóór de navigatie;
//   • minimaliseert of herstelt de mens iets, dan gaat dat terug de lade in (het dok van vensters.tsx weet van niets:
//     deze laag kijkt naar de echte stand via useVensters en bewaart elke verandering);
//   • meerdere vensters naast elkaar is de normale toestand (VENSTER_MAX = 8).
// Nieuwe soorten vensters krijgen hieronder één regel in `teken()` — niet een tweede, eigen herstelmechaniek.
import { useEffect, useRef } from 'react';
import { useVensters, vensterBeheer } from './vensters';
import { onthoudenVensters, useOnthoudenVensters, vensterKleinOnthouden, vensterOnthouden, vensterStandOphalen, vensterVergeten } from './vensters-onthouden';
import MailKoppelVenster from '../mail/MailKoppelVenster';
import type { OnthoudenVenster, VensterStap } from '../../shared/vensters-onthouden-model';

type Props = { lang: 'uk' | 'nl'; dienst: string };

export default function VensterHerstel({ lang, dienst }: Props) {
  const stand = useOnthoudenVensters();
  const open = useVensters();

  // Eén keer per pagina de serverstand erbij halen (zonder sessie mislukt dit stil en blijft de cache gelden).
  useEffect(() => { void vensterStandOphalen(dienst); }, [dienst]);

  // Eén effect, in deze volgorde (21.10.2026). Vroeger waren het er twee in dezelfde commit: «terug de lade in» schreef
  // klein=false, en «geminimaliseerd beginnen» las nog de OUDE lade (klein=true) en minimaliseerde opnieuw — een venster was via het
  // dok dus niet terug te halen (stand venster-dok-slepen: «gekozen venster staat niet bovenaan»). Nu onthoudt `gezien` per venster
  // wat de lade het laatst zei:
  //   1. eerste keer gezien, of de lade veranderde van buitenaf (server, ander subdomein) naar «geminimaliseerd» → zo beginnen;
  //   2. anders: wat de mens in het dok doet (minimaliseren/terughalen), gaat terug de lade in.
  const gezien = useRef(new Map<string, boolean>());
  useEffect(() => {
    for (const venster of stand.vensters) {
      const levend = open.find((x) => x.id === venster.id);
      if (!levend) continue;
      const vorig = gezien.current.get(venster.id);
      gezien.current.set(venster.id, venster.klein);
      if (vorig !== venster.klein && venster.klein && !levend.klein) { vensterBeheer.minimaliseer(venster.id); continue; }
      if (vorig === undefined) continue;
      if (levend.klein !== venster.klein) { gezien.current.set(venster.id, levend.klein); vensterKleinOnthouden(venster.id, levend.klein); }
    }
  }, [open, stand.vensters]);

  const bewaarStap = (venster: OnthoudenVenster) => (stap: VensterStap, adres: string) =>
    vensterOnthouden({ ...venster, stap, adres, dienst });

  const teken = (venster: OnthoudenVenster) => {
    const levend = open.find((x) => x.id === venster.id);
    const klein = levend ? levend.klein : venster.klein;
    if (venster.soort === 'mail-koppelen') {
      return (
        <MailKoppelVenster key={venster.id} lang={lang} id={venster.id} aanbieder={venster.aanbieder}
          adres={venster.adres} stap={venster.stap} klein={klein}
          onStap={bewaarStap(venster)} onSluit={() => vensterVergeten(venster.id)} huidigeDienst={dienst} />
      );
    }
    return null;
  };

  return <>{stand.vensters.map(teken)}</>;
}

/**
 * Eén plek om een koppelvenster te openen (of naar voren te halen) — vanaf elke pagina. Bestond het venster al (ook
 * geminimaliseerd, ook op een ander subdomein), dan blijft de stap en het ingevulde adres staan: nog een klik op de tegel
 * mag het werk van de mens niet terugzetten.
 */
export function mailKoppelenOpenen(aanbieder: string, titel: string, dienst: string, adres?: string): void {
  const id = `mail-koppelen:${aanbieder}`;
  const al = onthoudenVensters().vensters.find((v) => v.id === id);
  // `adres` (21.10.2026): «Перепідключити» van een bestaande IMAP-koppeling opent het venster met DAT adres ingevuld.
  const nieuwAdres = adres !== undefined && adres !== (al?.adres ?? '');
  vensterOnthouden({
    id, soort: 'mail-koppelen', titel, aanbieder, dienst, klein: false,
    stap: nieuwAdres ? 'adres' : al?.stap ?? 'adres', adres: adres ?? al?.adres ?? '',
  });
  vensterBeheer.naarVoren(id);
}
