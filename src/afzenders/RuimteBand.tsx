// De band boven post en contacten: IN WELKE RUIMTE ZIT IK, en als er niets te zien is: WAAROM NIET.
//
// De opdracht van de eigenaar (20.10.2026) is hier heel concreet: «на сторінках пошти й контактів має бути видно, у якому
// просторі людина зараз, і чесне пояснення, якщо сервіс вимкнено чи заморожено, — а не порожній список». Daarom:
//   • in de PERSOONLIJKE ruimte met eigen gegevens zegt de band niets — daar is niets veranderd en een extra balk zou alleen
//     maar in de weg staan;
//   • in de TECHNISCHE ruimte staat er altijd welke lade open is: «власні дані» of «спільне з особистим» (dat tweede is geen
//     detail: wat je hier doet, raakt dan je persoonlijke post);
//   • staat de dienst UIT, is hij BEVROREN of is er nog niets gekozen, dan staat hier de uitleg van de server (tweetalig,
//     uit shared/ruimte-scheiding.ts) in plaats van een lege lijst. De tekst komt van de server zodat scherm en poort nooit
//     iets anders zeggen.
import { Lock, Snowflake, Users } from 'lucide-react';
import { useRuimteStand, type RuimteDienstStand } from './api';
import './ruimte-band.css';

type Lang = 'uk' | 'nl';
const tr = (lang: Lang, uk: string, nl: string) => (lang === 'uk' ? uk : nl);
const I = { width: 16, height: 16 } as const;

export function RuimteBand({ lang, dienst }: { lang: Lang; dienst: 'mail' | 'contacten' }) {
  const stand = useRuimteStand();
  if (!stand) return null;
  const d: RuimteDienstStand = dienst === 'mail' ? stand.mail : stand.contacten;
  if (!d) return null;
  // Persoonlijke ruimte met eigen gegevens: niets te melden.
  if (d.ok && d.ruimte === 'prive' && !d.gedeeld) return null;
  const soort = !d.ok ? (d.stand === 'bevroren' ? 'bevroren' : 'dicht') : d.gedeeld ? 'gedeeld' : 'eigen';
  const titel = soort === 'bevroren'
    ? tr(lang, 'Заморожено', 'Bevroren')
    : soort === 'dicht'
      ? tr(lang, 'Тут нічого немає — і ось чому', 'Hier is niets — en dit is waarom')
      : soort === 'gedeeld'
        ? tr(lang, 'Технічний простір: ви користуєтеся ОСОБИСТИМИ даними', 'Technische ruimte: u gebruikt uw PERSOONLIJKE gegevens')
        : tr(lang, 'Технічний простір: власні дані', 'Technische ruimte: eigen gegevens');
  const tekst = d.ok ? (d.standNaam ? d.uitleg[lang] : '') : d.uitleg[lang];
  const Ikoon = soort === 'bevroren' ? Snowflake : soort === 'gedeeld' ? Users : Lock;
  return (
    <div className={`ruimte-band ruimte-band--${soort}`} role="status" aria-live="polite">
      <Ikoon {...I} aria-hidden="true" />
      <div className="ruimte-band__tekst">
        <strong>{titel}</strong>
        {tekst ? <span>{tekst}</span> : null}
        {soort === 'eigen' || soort === 'gedeeld'
          ? <span className="ruimte-band__dienst">{d.naam[lang]}</span>
          : null}
      </div>
    </div>
  );
}
export default RuimteBand;
