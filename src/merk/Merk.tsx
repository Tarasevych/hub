// HET ENE merkcomponent van de site: tekent elk logo uit het register (src/merk/merk-register.ts) in de gevraagde maat en vorm.
// Vervangt vier eigen tekenblokken: <AgentLogo>, <Logo> van de koppelingen, de merkiconen van de sessiepagina en het
// `Logo`-blok van src/mcp-ui.tsx. Zie merk-register.ts voor het waarom.
//
// LET OP: width/height staan ook in `style` — src/index.css heeft een globale `svg { width: 1rem; height: 1rem }` die de
// attributen anders overschrijft. Zonder `maat` zet dit component géén maat: dan bepaalt de CSS-klasse de grootte
// (zo werkt bv. .sessie-icoon).
//
// Onbekend merk → monogram met een vaste kleurtoon, en de luie tabel wordt alsnog opgehaald; komt het merk daarna binnen, dan
// vervangt het logo het monogram vanzelf. Altijd decoratief (aria-hidden) tenzij `titel` is gezet: de naam staat meestal al
// ernaast.
import { useEffect, useId, useState, type ReactNode } from 'react';
import {
  databaseMerk, eigenMerk, laadMerken, laadOfficieel, merkDef, merkDomein, merkHelderheid, merkKleuren, merkKleurStijl, merkLaag, merkSleutel,
  merkTint, merkVulling, monogram, officieelMerk, opMerken,
  type MerkDef,
} from './merk-register';
import { eigenMerkenOphalen } from './merk-eigen-laden';
import { merkBeeldVragen } from './merk-beeld-laden';
import './merk.css';

/** tegel = afgerond vlak met het logo erin · rond = zelfde, maar rond · gliefje = alleen de vorm, zonder vlak. */
export type MerkVormSoort = 'tegel' | 'rond' | 'gliefje';

export type MerkProps = {
  /** Slug, naam of wat er ook over een merk bekend is; aliassen worden opgelost (zie MERK_ALIAS). */
  merk?: unknown;
  /** Al opgezocht merk (de koppelingenpagina heeft haar eigen, luie tabel). Gaat vóór `merk`. */
  def?: MerkDef | null;
  /** Naam voor het monogram en het tekstalternatief als het merk onbekend is. */
  naam?: string;
  /** Maat in px. Weg = de CSS-klasse bepaalt de maat. */
  maat?: number;
  vorm?: MerkVormSoort;
  /** Tekstalternatief; weg = decoratief (aria-hidden). */
  titel?: string;
  className?: string;
  /** Wat er staat zolang (of zolang als) het merk onbekend is; weg = een monogram. */
  terugval?: ReactNode;
};

/** Hoeveel van het vlak het gliefje inneemt (de rest is lucht rond het logo). */
const INZET = 0.64;

export default function Merk({ merk, def, naam, maat, vorm = 'tegel', titel, className, terugval }: MerkProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const [, hertel] = useState(0);
  const gevonden = def ?? merkDef(merk);
  // Het OFFICIËLE bestand dat de beheerder zelf neerlegde (src/merk/merk-register.ts → eigenMerk) gaat vóór elke ingebouwde vorm.
  const sleutel = merkSleutel(merk) || merkSleutel(def?.naam);
  const eigen = sleutel ? eigenMerk(sleutel) : null;

  // Nog niet bekend? Haal de tabel op en teken opnieuw zodra ze binnen is. De eigen logo's: één keer per sessie, ook als het
  // merk al bekend is (een eigen bestand vervangt dan de ingebouwde vorm of de neutrale plaat).
  useEffect(() => {
    const af = opMerken(() => hertel((n) => n + 1));
    eigenMerkenOphalen();
    if (!gevonden) void laadMerken();
    // Geen vorm met herkomst (neutrale plaat) of nog onbekend: eerst het OFFICIËLE logo uit de ingebouwde basis; is dat er niet,
    // dan vraagt de site het logo uit de merkendatabase van de eigen server (die het van de website/BIMI van het domein haalde).
    if (sleutel && (!gevonden || gevonden.neutraal)) {
      void laadOfficieel().then(() => { const d = merkDomein(sleutel); if (d && !officieelMerk(sleutel) && !eigenMerk(sleutel)) merkBeeldVragen(d); });
    }
    return af;
  }, [gevonden, sleutel]);

  const label = titel || (gevonden?.naam ?? undefined);
  const a11y = titel ? { role: 'img' as const, 'aria-label': label } : { 'aria-hidden': true as const };
  const klasse = `merk${vorm === 'gliefje' ? ' merk-gliefje' : ' merk-vlak'}${className ? ` ${className}` : ''}`;
  const maatStijl = maat ? { width: maat, height: maat, flex: 'none' as const } : undefined;
  // Ook als attribuut: zo staat de maat al goed vóórdat de stylesheet binnen is (en `style` houdt de globale svg-regel tegen).
  const maatAttr = maat ? { width: maat, height: maat } : null;

  if (eigen) {
    // Eigen bestand als <img> (een SVG in <img> voert nooit script uit; de server ontsmette het bovendien al).
    const r = maat ? Math.round(maat * (vorm === 'rond' ? 0.5 : 0.28)) : undefined;
    return (
      <span {...a11y} className={`${klasse} merk-eigen`} data-merk={gevonden?.naam || naam || sleutel} data-merk-eigen={sleutel}
        style={{ ...maatStijl, borderRadius: r }}>
        <img src={eigen.data} alt='' draggable={false} />
      </span>
    );
  }

  // Officieel logo (ingebouwd, src/merk/officieel) of logo uit de merkendatabase (app.merk_beeld): het BESTAND van het merk zelf,
  // als <img> (een SVG in <img> voert nooit script uit), nooit vervormd. Op een lichte plaat — zo zijn merklogo's ontworpen; als los
  // gliefje alleen als het logo donkere delen heeft (HERKOMST.json → ondergrond). Zelfde maat als de neutrale plaat: geen sprong.
  const laag = merkLaag(sleutel, gevonden);
  if (laag === 'officieel' || laag === 'database') {
    const o = laag === 'officieel' ? officieelMerk(sleutel) : null;
    const db = laag === 'database' ? databaseMerk(sleutel) : null;
    const plaat = vorm !== 'gliefje' || (o ? o.ondergrond === 'licht' : true);
    const r = maat ? Math.round(maat * (vorm === 'rond' ? 0.5 : 0.28)) : undefined;
    return (
      <span {...a11y} className={`${klasse} merk-beeld merk-${laag}${plaat ? ' merk-plaat' : ''}`} data-merk={gevonden?.naam || naam || sleutel}
        data-merk-laag={laag} data-merk-officieel={o ? sleutel : undefined} data-merk-database={db ? db.domein : undefined} data-merk-bron={db ? db.bron : undefined}
        style={{ ...maatStijl, borderRadius: r }}>
        <img src={(o || db)!.data} alt='' draggable={false} decoding='async' />
      </span>
    );
  }

  if (gevonden?.neutraal) {
    // NEUTRALE PLAAT: geen nagetekend logo maar de beginletters van de naam op de merktoon — voor elk zulk merk dezelfde vorm.
    // Doos 48 (niet 24): zo is de lettergrootte in de eigen eenheden ≥ 12 en leest geen enkele meting «te kleine letter» uit het attribuut.
    const rx = vorm === 'rond' ? 24 : 13;
    const letter = String(gevonden.letter || monogram(gevonden.naam).slice(0, 1)).slice(0, 2);
    return (
      <svg {...a11y} {...maatAttr} focusable='false' className={`${klasse} merk-neutraal`} data-merk='neutraal' data-merk-naam={gevonden.naam}
        viewBox='0 0 48 48' xmlns='http://www.w3.org/2000/svg' style={maatStijl}>
        <rect width='48' height='48' rx={rx} fill={gevonden.vlak || 'var(--surface)'} />
        <text x='24' y='25.2' textAnchor='middle' dominantBaseline='middle' fill={gevonden.kleur} fontSize={letter.length > 1 ? 22 : 26} fontWeight={700}
          fontFamily='system-ui, -apple-system, Segoe UI, sans-serif' letterSpacing={letter.length > 1 ? '-.02em' : undefined}>{letter}</text>
      </svg>
    );
  }

  if (!gevonden) {
    if (terugval !== undefined) return <>{terugval}</>;
    const n = String(naam || merk || '?').trim() || '?';
    const h = merkTint(n);
    return (
      <span {...a11y} className={`${klasse} merk-mono`} data-merk='onbekend'
        style={{ ...maatStijl, ['--merk-kleur' as string]: `hsl(${h} 55% 42%)`, fontSize: maat ? Math.round(maat * 0.36) : undefined, borderRadius: maat ? Math.round(maat * (vorm === 'rond' ? 0.5 : 0.28)) : undefined }}>
        {monogram(n)}
      </span>
    );
  }

  const m = gevonden;
  const g = `merk-${uid}`;
  // ÉÉN regel voor de kleur van elk gliefje (src/merk/merk-register.ts → merkKleuren): valt de merkkleur in een modus weg
  // (< 3:1 tegen een van de 26 paletten), dan wordt een monochroom merk daar de tekstkleur en een gekleurd merk dezelfde toon,
  // lichter of donkerder tot 3:1. Categorie-iconen (lijn) altijd in de tekstkleur.
  const kleuren = merkKleuren(m, vorm);
  const vulling = m.verloop ? `url(#${g})` : merkVulling(m.kleur, kleuren);
  // Een tegel zonder eigen merkvlak krijgt een zachte tint van de merkkleur (zo zag de koppelingenpagina er al uit);
  // een categorie-icoon een tint van het accent.
  const vlak = vorm === 'gliefje' ? '' : m.vlak || '';
  const getint = vorm !== 'gliefje' && !m.vlak;
  const tintKleur = m.lijn ? 'var(--accent)' : m.kleur;
  // Een bijna zwart merkvlak (Grok, Cursor …) krijgt in het donker een randje in de lijnkleur, anders verdwijnt de tegel.
  const donkerVlak = !!vlak && merkHelderheid(vlak) < 0.16;
  const rx = vorm === 'rond' ? 12 : 6.5;
  const schaal = vorm === 'gliefje' || m.vol ? 1 : INZET;
  const verschuif = (24 - 24 * schaal) / 2;

  return (
    <svg {...a11y} {...maatAttr} focusable='false' className={klasse} data-merk={m.naam} viewBox='0 0 24 24' xmlns='http://www.w3.org/2000/svg'
      data-merk-kleur={kleuren.aangepast ? `${kleuren.licht === m.kleur ? '' : 'licht '}${kleuren.donker === m.kleur ? '' : 'donker'}`.trim() || undefined : undefined}
      style={{ ...maatStijl, ...(getint ? { ['--merk-kleur' as string]: tintKleur } : null), ...merkKleurStijl(kleuren) }}>
      {m.verloop && (
        <defs>
          <linearGradient id={g} x1='4' y1='20' x2='20' y2='4' gradientUnits='userSpaceOnUse'>
            <stop stopColor={m.verloop[0]} /><stop offset='.5' stopColor={m.verloop[1]} /><stop offset='1' stopColor={m.verloop[2]} />
          </linearGradient>
        </defs>
      )}
      {vlak && <rect width='24' height='24' rx={rx} fill={vlak} />}
      {/* Een wit merkvlak heeft een randje nodig, anders verdwijnt de tegel in een lichte pagina. */}
      {vlak && merkHelderheid(vlak) > 0.93 && <rect x='.5' y='.5' width='23' height='23' rx={rx - 0.5} fill='none' stroke='#000' strokeOpacity='.12' />}
      {donkerVlak && <rect className='merk-rand-donker' x='.5' y='.5' width='23' height='23' rx={rx - 0.5} fill='none' />}
      {getint && <rect className='merk-tint' width='24' height='24' rx={rx} />}
      <g transform={schaal === 1 ? undefined : `translate(${verschuif} ${verschuif}) scale(${schaal})`}>
        {m.lijn
          ? <path d={m.d} fill='none' style={{ stroke: vulling }} strokeWidth={2} strokeLinecap='round' strokeLinejoin='round' />
          : m.paden
            ? m.paden.map((p, i) => (
              // `style` en niet het attribuut: alleen zo werkt var() (met terugval op de merkkleur) in de vulling.
              <path key={i} d={p.d} style={{ fill: p.vul && p.vul !== 'geen' ? p.vul : p.vul === 'geen' ? 'none' : vulling }} fillRule={p.regel ?? m.regel ?? 'nonzero'}
                stroke={p.streek} strokeWidth={p.dikte} opacity={p.dekking} />
            ))
            : <path d={m.d} style={{ fill: vulling }} fillRule={m.regel ?? 'nonzero'} />}
      </g>
    </svg>
  );
}
