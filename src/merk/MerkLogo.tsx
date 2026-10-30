// 20.10.2026: dit bestand stond in src/integraties/ en viel daarmee onder TECH_MAPPEN (shared/tech-bundels.ts). Gevolg: de chunk
// met de grote merkentabel werd naar dist/assets/tech/ geschreven en die map serveert de server ALLEEN met een geldige technische
// cookie. Een gewone gebruiker kreeg 403 en zag dus geen enkel merklogo op «Акаунти» (klacht van de eigenaar 20.10: «немає
// поштових логотипів»). Merkvormen zijn niet technisch — ze horen bij src/merk/. Alleen de beheerpagina's blijven technisch.
// Merklogo in een tegel op de koppelingenpagina; bij een onbekend merk een monogram. Decoratief (de naam staat ernaast).
// Tekent niet meer zelf: dat doet het ene merkcomponent (src/merk/Merk.tsx). Hier blijft alleen het luie laden van de GROTE
// merkentabel (src/merk/merk-logos.ts, ±128 merken): die wordt pas opgehaald als er echt een logo nodig is. De merken die de rest van de site óók gebruikt (agents, browsers, Apple, Google, Docker, GitHub, en de merken
// die hier eerder helemaal geen embleem hadden) staan in het register en worden door <Merk> zelf opgehaald.
import { useEffect, useState } from 'react';
import Merk from './Merk';
import { laadMerken, merkDef, type MerkDef } from './merk-register';

type Tabel = Readonly<Record<string, readonly [string, string]>>;
let belofte: Promise<Tabel> | null = null;
/** De grote merkentabel (±43 kB gzip) wordt pas geladen als de pagina opent; één keer per sessie. */
const laadGroot = (): Promise<Tabel> => (belofte ??= import('./merk-logos').then((m) => m.LOGOS).catch(() => { belofte = null; return {} as Tabel; }));

export default function Logo({ id, naam, logo, maat = 44 }: { id: string; naam: string; logo: string; maat?: number }) {
  const [tabel, setTabel] = useState<Tabel | null>(null);
  useEffect(() => {
    void laadMerken();
    if (!logo) return;
    let leeft = true;
    void laadGroot().then((t) => { if (leeft) setTabel(t); });
    return () => { leeft = false; };
  }, [logo]);

  // Het register gaat vóór de grote tabel: zo wint de ene, gedeelde vorm van bv. Claude of Apple.
  let def: MerkDef | null = logo ? merkDef(logo) : null;
  const hit = !def && logo && tabel ? tabel[logo] : undefined;
  if (hit) def = { naam, kleur: `#${hit[1]}`, d: hit[0] };

  return <Merk def={def} merk={logo} naam={naam || id} maat={maat} />;
}
