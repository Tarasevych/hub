// Студійна картка розділу, надрядковий заголовок групи та поетична перебивка системи «Макет» (MAQUETTE-001).
// Поєднує оглядову частину у дусі ательє власника з триколонковою сіткою деталей і живим робочим вмістом.
// Studiokaart voor secties, groepskop en poëtisch intermezzo van het «Maquette»-stelsel.

import type { ReactNode } from 'react';
import { MaquetteKunst, type MaquetteKunstSoort } from './MaquetteKunst';

export type MaquetteKaartAccent =
  | 'violet'
  | 'cyan'
  | 'pink'
  | 'mint'
  | 'amber'
  | 'blue'
  | 'emerald'
  | 'coral';

export interface MaquetteDetailItem {
  id?: string;
  icoon?: ReactNode;
  titel: string;
  waarde: string;
  onClick?: () => void;
}

export interface MaquetteSectieKaartProps {
  id?: string;
  lang?: 'uk' | 'nl';
  index?: string;
  groep?: string;
  symbool?: ReactNode;
  titel: string;
  beschrijving: string;
  accent?: MaquetteKaartAccent;
  actie?: { label: string; onClick: () => void };
  kunstSoort?: MaquetteKunstSoort;
  kunst?: ReactNode;
  details?: ReadonlyArray<MaquetteDetailItem>;
  children?: ReactNode;
  className?: string;
}

export interface MaquetteGroepKopProps {
  id?: string;
  index: string;
  titel: string;
  className?: string;
}

export interface MaquetteIntermezzoProps {
  voor: string;
  cursief: string;
  na?: string;
  nummer?: string;
  symbool?: string;
  className?: string;
}

export function MaquetteGroepKop({ id, index, titel, className = '' }: MaquetteGroepKopProps) {
  const klassen = ['mq-sectie-kop', className].filter(Boolean).join(' ');
  return (
    <div id={id} className={klassen}>
      <span className="mq-sectie-kop-index">{index}</span>
      <span className="mq-sectie-kop-tekst">{titel}</span>
      <span className="mq-sectie-kop-lijn" aria-hidden="true" />
    </div>
  );
}

export function MaquetteIntermezzo({
  voor,
  cursief,
  na,
  nummer,
  symbool = '✳',
  className = '',
}: MaquetteIntermezzoProps) {
  const klassen = ['mq-intermezzo', className].filter(Boolean).join(' ');
  return (
    <aside className={klassen}>
      <div className="mq-intermezzo-tekst">
        <span className="mq-intermezzo-ster" aria-hidden="true">
          {symbool}
        </span>
        <p>
          {voor} <em>{cursief}</em>
          {na ? ` ${na}` : ''}
        </p>
      </div>
      {nummer ? <span className="mq-intermezzo-nummer">{nummer}</span> : null}
    </aside>
  );
}

export function MaquetteSectieKaart({
  id,
  lang = 'uk',
  index,
  groep,
  symbool,
  titel,
  beschrijving,
  accent,
  actie,
  kunstSoort,
  kunst,
  details,
  children,
  className = '',
}: MaquetteSectieKaartProps) {
  const heeftKunst = Boolean(kunst || kunstSoort);
  const heeftDetails = Boolean(details && details.length > 0);
  const heeftOnder = heeftDetails || Boolean(children);

  const kaartKlassen = [
    'mq-kaart',
    accent ? `mq-accent-${accent}` : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <article id={id} className={kaartKlassen}>
      <div
        className="mq-kaart-paar"
        style={!heeftKunst ? { gridTemplateColumns: 'minmax(0, 1fr)', minHeight: 'auto' } : undefined}
      >
        <div className="mq-kaart-hoofd">
          {index || groep ? (
            <div className="mq-kaart-bovenlijn">
              {index ? <span className="mq-kaart-index">{index}</span> : null}
              {index && groep ? <span className="mq-kaart-streep" aria-hidden="true" /> : null}
              {groep ? <span>{groep}</span> : null}
            </div>
          ) : null}

          {symbool ? (
            <div className="mq-kaart-symbool" aria-hidden="true">
              {symbool}
            </div>
          ) : null}

          <h2>{titel}</h2>
          <p>{beschrijving}</p>

          {actie ? (
            <button type="button" className="mq-tekst-koppeling" onClick={actie.onClick}>
              <span>{actie.label}</span>
              <span aria-hidden="true">↗</span>
            </button>
          ) : null}
        </div>

        {heeftKunst ? (
          <div className="mq-kaart-kunst">
            {kunst ?? <MaquetteKunst soort={kunstSoort!} lang={lang} variant="kaart" />}
          </div>
        ) : null}
      </div>

      {heeftOnder ? (
        <div className="mq-kaart-onder">
          {heeftDetails ? (
            <div className="mq-detail-raster">
              {details!.map((d, idx) => {
                const sleutel = d.id ?? `${d.titel}-${idx}`;
                const inhoud = (
                  <>
                    {d.icoon ? (
                      <span className="mq-detail-icoon" aria-hidden="true">
                        {d.icoon}
                      </span>
                    ) : null}
                    <span className="mq-detail-tekst">
                      <strong>{d.titel}</strong>
                      <small>{d.waarde}</small>
                    </span>
                    {d.onClick ? (
                      <span className="mq-detail-pijl" aria-hidden="true">
                        ↗
                      </span>
                    ) : null}
                  </>
                );

                if (d.onClick) {
                  return (
                    <button
                      key={sleutel}
                      type="button"
                      className="mq-detail-item"
                      onClick={d.onClick}
                    >
                      {inhoud}
                    </button>
                  );
                }

                return (
                  <div key={sleutel} className="mq-detail-item">
                    {inhoud}
                  </div>
                );
              })}
            </div>
          ) : null}

          {children ? (
            <div
              className="mq-kaart-inhoud"
              style={heeftDetails ? { marginTop: '18px' } : undefined}
            >
              {children}
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
