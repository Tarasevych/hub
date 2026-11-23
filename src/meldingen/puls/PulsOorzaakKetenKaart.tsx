// Картка склеєного причинно-наслідкового ланцюжка «Першопричина» (MELDPANEEL-002).
// Замість 3–5 окремих тривожних помилок із різних розділів показує корінь проблеми та всі залежні служби
// з їхніми фірмовими логотипами (src/merk/Merk.tsx) і дозволяє відновити або відкласти весь ланцюжок в 1 дотик.

import { useState } from 'react';
import {
  Archive,
  CheckCheck,
  ChevronDown,
  Clock3,
  ExternalLink,
  Network,
  RefreshCw,
} from 'lucide-react';
import { veiligeMeldingUrl, type MeldingEcosysteemGebeurtenis, type MeldingGebeurtenisStatus } from '../../../shared/meldingen-ecosysteem';
import type { PulsOorzaakKeten, Taal, VoorwaardelijkUitstelSoort } from '../../../shared/meldingen-puls/kern';
import { groepeerOorzaakGevolgen, verrijkGebeurtenisVoorPuls } from '../../../shared/meldingen-puls/kern';
import { PulsBronTeken, PulsDienstChip, PulsKlimopZegel, PulsUitstelMenu } from './PulsVisueelAnker';

type Props = {
  lang: Taal;
  keten: PulsOorzaakKeten;
  geselecteerd?: boolean;
  onSelect: (wortel: MeldingEcosysteemGebeurtenis) => void;
  onHerstelKeten: (keten: PulsOorzaakKeten, status: MeldingGebeurtenisStatus, uitstelSoort?: VoorwaardelijkUitstelSoort) => void;
  renderLosseKaart: (geb: MeldingEcosysteemGebeurtenis) => React.ReactNode;
  alleGebeurtenissenMap: ReadonlyMap<string, MeldingEcosysteemGebeurtenis>;
};

export default function PulsOorzaakKetenKaart({
  lang,
  keten,
  geselecteerd = false,
  onSelect,
  onHerstelKeten,
  renderLosseKaart,
  alleGebeurtenissenMap,
}: Props) {
  const t = (uk: string, nl: string) => (lang === 'nl' ? nl : uk);
  const [toonAlleLeden, setToonAlleLeden] = useState(false);
  const [uitstelOpen, setUitstelOpen] = useState(false);
  const wortelVerrijkt = verrijkGebeurtenisVoorPuls(keten.wortel, lang);
  const gegroepeerdeGevolgen = groepeerOorzaakGevolgen(keten.gevolgen);
  const primaireHref =
    keten.wortel.acties.map((a) => veiligeMeldingUrl(a.href, 500)).find(Boolean) ||
    veiligeMeldingUrl(keten.wortel.meta?.link, 500) ||
    '';

  return (
    <div className='mel-veeg-houder puls-keten-houder' data-puls-keten={keten.sleutel}>
      <article
        className={`mel-kaart puls-kaart is-puls-oorzaak${geselecteerd ? ' is-geselecteerd' : ''}`}
        onClick={() => onSelect(keten.wortel)}
      >
        <div className='mel-kaart-kop'>
          <PulsBronTeken anker={wortelVerrijkt.anker} maat={36} />
          <div className='mel-kaart-hoofd'>
            <div className='mel-kaart-meta'>
              <span className='puls-oorzaak-badge'>
                <Network aria-hidden='true' />
                <span>{keten.samenvatting}</span>
              </span>
              {wortelVerrijkt.klimopKernZegel ? <PulsKlimopZegel lang={lang} /> : null}
            </div>

            <div className='puls-keten-titel-rij'>
              <strong>{keten.wortelTitel}</strong>
            </div>
          </div>
        </div>

        <div className='puls-keten-gevolgen' data-geen-veeg='1'>
          <span className='puls-keten-label'>{t('Автоматично розблокує:', 'Herstelt automatisch:')}</span>
          <div className='puls-keten-chips'>
            {gegroepeerdeGevolgen.map((gev) => (
              <PulsDienstChip
                key={gev.id}
                merkSleutel={gev.merkSleutel}
                icoon={gev.icoon}
                toon={gev.toon}
                label={gev.label}
                sub={gev.herstelTekst ? (gev.herstelTekst.startsWith('—') ? ` ${gev.herstelTekst}` : ` — ${gev.herstelTekst}`) : undefined}
              />
            ))}
          </div>
        </div>

        <div className='mel-kaart-acties puls-kaart-acties' data-geen-veeg='1'>
          <span className='puls-gevolg-hint'>
            {t('Одне підтвердження закриє всі пов’язані збої', 'Één bevestiging sluit alle verbonden meldingen')}
          </span>

          <div className='puls-actie-groep'>
            {primaireHref ? (
              <a
                href={primaireHref}
                className='mel-knop puls-knop-oorzaak'
                onClick={(e) => e.stopPropagation()}
              >
                <RefreshCw aria-hidden='true' />
                <span>{t('Відновити вхід', 'Toegang herstellen')}</span>
                <ExternalLink aria-hidden='true' />
              </a>
            ) : null}

            <div className='puls-uitstel-anker'>
              <button
                type='button'
                className='mel-knop mel-knop-zacht'
                aria-expanded={uitstelOpen}
                onClick={(e) => {
                  e.stopPropagation();
                  setUitstelOpen((v) => !v);
                }}
              >
                <Clock3 aria-hidden='true' />
                <span>{t('Умова', 'Voorwaarde')}</span>
              </button>
              {uitstelOpen ? (
                <PulsUitstelMenu
                  lang={lang}
                  doelSubdomein={keten.wortel.subdomein}
                  onKies={(soort) => {
                    setUitstelOpen(false);
                    onHerstelKeten(keten, 'uitgesteld', soort);
                  }}
                />
              ) : null}
            </div>

            <button
              type='button'
              className='mel-knop mel-knop-zacht'
              onClick={(e) => {
                e.stopPropagation();
                onHerstelKeten(keten, 'opgelost');
              }}
              title={t('Позначити весь ланцюжок вирішеним', 'Hele keten als opgelost markeren')}
            >
              <CheckCheck aria-hidden='true' />
              <span>{t('Вирішено', 'Opgelost')}</span>
            </button>

            <button
              type='button'
              className='mel-ikoon-knop'
              onClick={(e) => {
                e.stopPropagation();
                onHerstelKeten(keten, 'archief');
              }}
              aria-label={t('Архівувати ланцюжок', 'Keten archiveren')}
              title={t('Архівувати ланцюжок', 'Keten archiveren')}
            >
              <Archive aria-hidden='true' />
            </button>

            <button
              type='button'
              className='mel-knop mel-knop-zacht'
              aria-expanded={toonAlleLeden}
              onClick={(e) => {
                e.stopPropagation();
                setToonAlleLeden((v) => !v);
              }}
            >
              <ChevronDown className={`mel-pijl-klap${toonAlleLeden ? ' is-open' : ''}`} aria-hidden='true' />
              <span>{t(`Події (${keten.alleIds.length})`, `Items (${keten.alleIds.length})`)}</span>
            </button>
          </div>
        </div>

        {toonAlleLeden ? (
          <div className='puls-keten-leden' data-geen-veeg='1' onClick={(e) => e.stopPropagation()}>
            {keten.alleIds.map((lidId) => {
              const g = alleGebeurtenissenMap.get(lidId);
              return g ? <div key={lidId}>{renderLosseKaart(g)}</div> : null;
            })}
          </div>
        ) : null}
      </article>
    </div>
  );
}
