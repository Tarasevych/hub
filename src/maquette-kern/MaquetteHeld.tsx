// Універсальна студійна вітрина піддомену «Макет» (MAQUETTE-001).
// Підтримує повний художній режим із тривимірною композицією та камерну компактну смугу (~68px) із збереженням розгорнутості у sessionStorage.
// Universele studio-etalage voor elk subdomein in volledige of compacte uitvoering.

import { useState, type ReactNode } from 'react';
import { MaquetteKunst, type MaquetteKunstSoort } from './MaquetteKunst';

export interface MaquetteHeldActie {
  label: string;
  onClick: () => void;
  icoon?: string;
}

export interface MaquetteHeldStatistiek {
  waarde: string | number;
  label: string;
}

export interface MaquetteHeldProps {
  id?: string;
  lang: 'uk' | 'nl';
  dienst: MaquetteKunstSoort;
  bovenregel: string;
  titelVoor: string;
  titelCursief: string;
  titelNa?: string;
  beschrijving: string;
  primair?: MaquetteHeldActie;
  secundair?: { label: string; onClick: () => void };
  statistieken?: ReadonlyArray<MaquetteHeldStatistiek>;
  modus?: 'volledig' | 'compact';
  opslagSleutel?: string;
  extraActies?: ReactNode;
  titelKlas?: string;
  className?: string;
}

function leesSessieUitgeklapt(sleutel: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.sessionStorage.getItem(sleutel) === '1';
  } catch {
    return false;
  }
}

function schrijfSessieUitgeklapt(sleutel: string, waarde: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    if (waarde) {
      window.sessionStorage.setItem(sleutel, '1');
    } else {
      window.sessionStorage.removeItem(sleutel);
    }
  } catch {
    // Ігноруємо обмеження сховища оглядача у приватному вікні
  }
}

export function MaquetteHeld({
  id,
  lang,
  dienst,
  bovenregel,
  titelVoor,
  titelCursief,
  titelNa,
  beschrijving,
  primair,
  secundair,
  statistieken,
  modus = 'volledig',
  opslagSleutel,
  extraActies,
  titelKlas,
  className = '',
}: MaquetteHeldProps) {
  const taal = lang === 'nl' ? 'nl' : 'uk';
  const sessieSleutel = `mr-mq-held:${opslagSleutel || dienst}`;
  const [uitgeklapt, setUitgeklapt] = useState<boolean>(() =>
    modus === 'compact' ? leesSessieUitgeklapt(sessieSleutel) : true,
  );

  const toonCompact = modus === 'compact' && !uitgeklapt;
  const heeftStatistieken = Boolean(statistieken && statistieken.length > 0);
  const kopKlassen = ['mq-held-titel', titelKlas].filter(Boolean).join(' ');

  const wisselUitgeklapt = () => {
    const volgende = !uitgeklapt;
    setUitgeklapt(volgende);
    schrijfSessieUitgeklapt(sessieSleutel, volgende);
  };

  const uitklapLabel = taal === 'nl' ? 'Etalage uitklappen' : 'Розгорнути вітрину';
  const inklapLabel = taal === 'nl' ? 'Etalage inklappen' : 'Згорнути вітрину';
  const breekNaVoor = titelVoor.trim().endsWith('.');

  if (toonCompact) {
    const compactKlassen = ['mq-held', 'is-compact', className].filter(Boolean).join(' ');
    return (
      <section id={id} className={compactKlassen} data-mq-dienst={dienst}>
        <div className="mq-held-compact-links">
          <div className="mq-held-mini-bol" aria-hidden="true">
            <span>✦</span>
          </div>
          <div className="mq-held-compact-kop">
            <span className="mq-held-compact-boven">{bovenregel}</span>
            <h1 className={kopKlassen}>
              {titelVoor}{' '}
              <em>{titelCursief}</em>
              {titelNa ? ` ${titelNa}` : ''}
            </h1>
          </div>
        </div>

        {heeftStatistieken ? (
          <div className="mq-held-compact-stats">
            {statistieken!.map((stat, idx) => (
              <span key={`${stat.label}-${idx}`} className="mq-held-stat-pil">
                <b>{stat.waarde}</b>
                <span>{stat.label}</span>
              </span>
            ))}
          </div>
        ) : null}

        <div className="mq-held-compact-acties">
          {primair ? (
            <button type="button" className="mq-knop-primair" onClick={primair.onClick}>
              <span>{primair.label}</span>
              <span aria-hidden="true">{primair.icoon ?? '↗'}</span>
            </button>
          ) : null}
          {secundair ? (
            <button type="button" className="mq-knop-secundair" onClick={secundair.onClick}>
              <span>{secundair.label}</span>
            </button>
          ) : null}
          {extraActies}
          <button
            type="button"
            className="mq-held-wissel"
            aria-expanded={false}
            onClick={wisselUitgeklapt}
          >
            <span>{uitklapLabel}</span>
            <span aria-hidden="true">▾</span>
          </button>
        </div>
      </section>
    );
  }

  const volledigKlassen = [
    'mq-held',
    !heeftStatistieken ? 'zonder-voet' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <section id={id} className={volledigKlassen} data-mq-dienst={dienst}>
      <div className="mq-held-tekstvak">
        <div className="mq-held-koprij">
          <div className="mq-held-bovenregel">
            <span className="mq-held-lijn" aria-hidden="true" />
            <span>{bovenregel}</span>
            <span className="mq-held-lijn" aria-hidden="true" />
          </div>
          {modus === 'compact' ? (
            <button
              type="button"
              className="mq-held-wissel"
              aria-expanded={true}
              onClick={wisselUitgeklapt}
            >
              <span>{inklapLabel}</span>
              <span aria-hidden="true">▴</span>
            </button>
          ) : null}
        </div>

        <h1 className={kopKlassen}>
          {titelVoor}
          {breekNaVoor ? <br /> : ' '}
          <em>{titelCursief}</em>
          {titelNa ? ` ${titelNa}` : ''}
        </h1>

        <p className="mq-held-beschrijving">{beschrijving}</p>

        {primair || secundair || extraActies ? (
          <div className="mq-held-acties">
            {primair ? (
              <button type="button" className="mq-knop-primair" onClick={primair.onClick}>
                <span>{primair.label}</span>
                <span aria-hidden="true">{primair.icoon ?? '↗'}</span>
              </button>
            ) : null}
            {secundair ? (
              <button type="button" className="mq-knop-secundair" onClick={secundair.onClick}>
                <span>{secundair.label}</span>
              </button>
            ) : null}
            {extraActies}
          </div>
        ) : null}
      </div>

      <div className="mq-held-kunstvak">
        <MaquetteKunst soort={dienst} lang={taal} variant="held" />
      </div>

      {heeftStatistieken ? (
        <div className="mq-held-voet">
          {statistieken!.map((stat, idx) => (
            <span key={`${stat.label}-${idx}`} className="mq-held-stat-groep" style={{ display: 'inline-flex', alignItems: 'center', gap: '18px' }}>
              {idx > 0 ? <i className="mq-held-scheiding" aria-hidden="true" /> : null}
              <span className="mq-held-stat">
                <b>{stat.waarde}</b>
                <span>{stat.label}</span>
              </span>
            </span>
          ))}
        </div>
      ) : null}
    </section>
  );
}
