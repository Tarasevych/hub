// DE STROOK DIE ZEGT IN WELKE GEGEVENSRUIMTE JE STAAT — en bij «uit» of «bevroren» WAAROM er niets is.
//
// Punt 6 van de opdracht: op de pagina's van taken, notities, het bureaublad en GitHub moet de mens zien welke lade zij open
// heeft, en een eerlijke uitleg krijgen in plaats van een lege lijst. Twee vormen, één bestand:
//   <RuimteStrook feiten={…} />    bovenaan een pagina die WEL gegevens heeft (alleen in de technische ruimte zichtbaar);
//   <RuimteGeslotenVlak gesloten={…} />  in plaats van de lijst, als de poort deze dienst niet opendeed.
// Alle teksten komen uit shared/ruimte-weergave.ts en shared/ruimte-scheiding.ts; hier staat geen tweede waarheid.
import { useEffect } from 'react';
import { Lock, ShieldCheck, Snowflake, Users } from 'lucide-react';
import { RUIMTE_NAAM, ruimteRegel, type RuimteFeiten, type RuimteGesloten } from '../shared/ruimte-weergave';
import { canonicalNavigationUrl } from './canoniek-navigatie';
import { publiceerPaginaSignaal, verwijderPaginaSignaal } from './canoniek-meldingen';

export type Taal = 'uk' | 'nl';
const tr = (lang: Taal, uk: string, nl: string) => (lang === 'uk' ? uk : nl);

export const RUIMTE_VERBIND_TAB = 'verbindingen';
export const ruimteVerbindAdres = (lang: Taal): string => {
  try { return canonicalNavigationUrl('ai', RUIMTE_VERBIND_TAB, lang); }
  catch { return `/${RUIMTE_VERBIND_TAB}`; }
};
/** Wat de knop zegt, per weigeringscode: nooit «Спробуйте ще раз», altijd de stap die werkelijk helpt. */
export const ruimteActieTekst = (code: string, lang: Taal): string =>
  code === 'KEUZE_ONTBREEKT'
    ? tr(lang, 'Зробити вибір для технічного простору', 'De keuze voor de technische ruimte maken')
    : code === 'BEVROREN'
      ? tr(lang, 'Відкрити рішення власника сервера', 'Het besluit van de servereigenaar openen')
      : tr(lang, 'Під’єднати цю службу', 'Deze dienst verbinden');

const stijl = {
  strook: { display: 'flex', alignItems: 'flex-start', gap: '.6rem', padding: '.55rem .75rem', borderRadius: '.6rem', border: '1px solid rgba(125,125,145,.35)', background: 'rgba(125,125,145,.10)', fontSize: '.85rem', lineHeight: 1.45, marginBottom: '.75rem' } as const,
  vlak: { display: 'flex', alignItems: 'flex-start', gap: '.7rem', padding: '1rem 1.1rem', borderRadius: '.75rem', border: '1px solid rgba(125,125,145,.35)', background: 'rgba(125,125,145,.08)', fontSize: '.92rem', lineHeight: 1.55 } as const,
  kop: { fontWeight: 600 } as const,
  uitleg: { opacity: .85, marginTop: '.2rem' } as const,
  actie: { display: 'inline-block', marginTop: '.6rem', padding: '.4rem .75rem', borderRadius: '.5rem', border: '1px solid rgba(125,125,145,.45)', fontSize: '.88rem', fontWeight: 600, textDecoration: 'none' } as const,
};

/** Alleen zichtbaar in de TECHNISCHE ruimte: in de persoonlijke verandert er voor niemand iets. */
export function RuimteStrook({ feiten, lang }: { feiten: RuimteFeiten | null; lang: Taal }) {
  useEffect(() => {
    if (!feiten?.tonen) {
      verwijderPaginaSignaal('band:ruimte-actief');
      return;
    }
    publiceerPaginaSignaal({
      id: 'band:ruimte-actief',
      bron: 'ruimte-strook',
      kanaal: 'pagina',
      subdomein: 'admin',
      soort: 'info',
      ernst: 'info',
      titelUk: `${ruimteRegel(feiten, 'uk')} · ${feiten.naam.uk}`,
      titelNl: `${ruimteRegel(feiten, 'nl')} · ${feiten.naam.nl}`,
      berichtUk: feiten.uitleg.uk,
      berichtNl: feiten.uitleg.nl,
      contextLabel: RUIMTE_NAAM[feiten.ruimte][lang],
      link: ruimteVerbindAdres(lang),
    });
    return () => verwijderPaginaSignaal('band:ruimte-actief');
  }, [feiten, lang]);

  if (!feiten?.tonen) return null;
  const Icoon = feiten.gedeeld ? Users : ShieldCheck;
  return (
    <div style={stijl.strook} role="note" aria-label={RUIMTE_NAAM[feiten.ruimte][lang]}>
      <Icoon size={16} style={{ flexShrink: 0, marginTop: '.15rem' }} aria-hidden />
      <div>
        <div style={stijl.kop}>{ruimteRegel(feiten, lang)} · {feiten.naam[lang]}</div>
        <div style={stijl.uitleg}>{feiten.uitleg[lang]}</div>
      </div>
    </div>
  );
}

/**
 * In plaats van een lege lijst. De code bepaalt het icoon: bevroren is iets anders dan «nog niet gekozen», en dat verschil
 * mag de mens zien zonder de uitleg te hoeven lezen.
 */
export function RuimteGeslotenVlak({ gesloten, lang, actie = true }: { gesloten: RuimteGesloten; lang: Taal; actie?: boolean }) {
  const href = ruimteVerbindAdres(lang);
  useEffect(() => {
    const id = `band:ruimte-gesloten:${gesloten.dienstNaam.nl}`;
    const kUk = gesloten.code === 'BEVROREN' ? 'Заморожено' : gesloten.code === 'KEUZE_ONTBREEKT' ? 'Технічний простір ще порожній' : 'Служба вимкнена в технічному просторі';
    const kNl = gesloten.code === 'BEVROREN' ? 'Bevroren' : gesloten.code === 'KEUZE_ONTBREEKT' ? 'De technische ruimte is nog leeg' : 'Deze dienst staat uit in de technische ruimte';
    publiceerPaginaSignaal({
      id,
      bron: 'ruimte-gesloten',
      kanaal: 'pagina',
      subdomein: 'ai',
      soort: 'waarschuwing',
      ernst: 'hoog',
      titelUk: `${kUk} — ${gesloten.dienstNaam.uk}`,
      titelNl: `${kNl} — ${gesloten.dienstNaam.nl}`,
      berichtUk: gesloten.uitleg.uk,
      berichtNl: gesloten.uitleg.nl,
      contextLabel: gesloten.code,
      link: href,
      acties: [{ id: 'verbind', labelUk: ruimteActieTekst(gesloten.code, 'uk'), labelNl: ruimteActieTekst(gesloten.code, 'nl'), primair: true, href }],
    });
    return () => verwijderPaginaSignaal(id);
  }, [gesloten, href]);

  const Icoon = gesloten.code === 'BEVROREN' ? Snowflake : Lock;
  const kop = gesloten.code === 'BEVROREN'
    ? tr(lang, 'Заморожено', 'Bevroren')
    : gesloten.code === 'KEUZE_ONTBREEKT'
      ? tr(lang, 'Технічний простір ще порожній', 'De technische ruimte is nog leeg')
      : tr(lang, 'Служба вимкнена в технічному просторі', 'Deze dienst staat uit in de technische ruimte');
  return (
    <div style={stijl.vlak} role="status" data-ruimte-gesloten={gesloten.code}>
      <Icoon size={18} style={{ flexShrink: 0, marginTop: '.15rem' }} aria-hidden />
      <div>
        <div style={stijl.kop}>{kop} — {gesloten.dienstNaam[lang]}</div>
        <div style={stijl.uitleg}>{gesloten.uitleg[lang]}</div>
        {actie ? (
          <a style={stijl.actie} href={href} data-ruimte-actie={gesloten.code}>
            {ruimteActieTekst(gesloten.code, lang)}
          </a>
        ) : null}
      </div>
    </div>
  );
}
