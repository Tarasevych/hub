// Картка склеєного причинно-наслідкового ланцюжка «Першопричина» (MELDPANEEL-002).
// Замість 3–5 окремих тривожних помилок із різних розділів показує корінь проблеми та всі залежні служби
// з їхніми фірмовими логотипами (src/merk/Merk.tsx) і дозволяє відновити або відкласти весь ланцюжок в 1 дотик.

import { useState } from 'react';
import {
  Archive,
  CheckCheck,
  ChevronDown,
  Clock3,
  Network,
  RefreshCw,
} from 'lucide-react';
import { veiligeMeldingUrl, type MeldingEcosysteemGebeurtenis, type MeldingGebeurtenisStatus } from '../../../shared/meldingen-ecosysteem';
import type { PulsOorzaakKeten, Taal, VoorwaardelijkUitstelSoort } from '../../../shared/meldingen-puls/kern';
import { groepeerOorzaakGevolgen, verrijkGebeurtenisVoorPuls } from '../../../shared/meldingen-puls/kern';
import IcoonActieKnop from '../IcoonActieKnop';
import { PulsBronTeken, PulsDienstChip, PulsKlimopZegel, PulsUitstelMenu } from './PulsVisueelAnker';

function schoonKetenTitel(titel: string): string {
  const schoon = titel
    .replace(/^(?:[\u2705\u26A0\u26D4\u2757\u{1F6A8}\u{1F4CD}\u{1F5BC}\u{1F514}\u{1F512}\u{1F511}]\uFE0F?\s*)+/u, '')
    .trim();
  return schoon || titel;
}

type Props = {
  lang: Taal;
  keten: PulsOorzaakKeten & { herstelActieLabel?: string };
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
  const nDiensten = gegroepeerdeGevolgen.length;
  const kortOorzaakLabel =
    lang === 'nl'
      ? `Oorzaak · ${nDiensten} ${nDiensten === 1 ? 'onderdeel' : 'onderdelen'}`
      : `Першопричина · ${nDiensten} ${
          nDiensten % 100 >= 11 && nDiensten % 100 <= 14
            ? 'служб'
            : nDiensten % 10 === 1
              ? 'служба'
              : nDiensten % 10 >= 2 && nDiensten % 10 <= 4
                ? 'служби'
                : 'служб'
        }`;
  const primaireHref =
    keten.wortel.acties.map((a) => veiligeMeldingUrl(a.href, 500)).find(Boolean) ||
    veiligeMeldingUrl(keten.wortel.meta?.link, 500) ||
    '';
  const herstelLabel = keten.herstelActieLabel || t('Відновити вхід', 'Aanmelding herstellen');

  return (
    <div className='mel-veeg-houder puls-keten-houder' data-puls-keten={keten.sleutel}>
      <article
        className={`mel-kaart puls-kaart is-puls-oorzaak${geselecteerd ? ' is-geselecteerd' : ''}`}
        onClick={() => onSelect(keten.wortel)}
      >
        <div className='mel-kaart-kop'>
          <PulsBronTeken anker={wortelVerrijkt.anker} maat={34} />
          <div className='mel-kaart-hoofd'>
            <div className='mel-kaart-meta puls-meta-slank'>
              <span className='puls-oorzaak-badge' title={keten.samenvatting}>
                <Network aria-hidden='true' />
                <span>{kortOorzaakLabel}</span>
              </span>
              <span className='puls-meta-rechts'>
                {wortelVerrijkt.klimopKernZegel ? <PulsKlimopZegel lang={lang} compact /> : null}
              </span>
            </div>

            <div className='puls-keten-titel-rij'>
              <strong>{schoonKetenTitel(keten.wortelTitel)}</strong>
            </div>
          </div>
        </div>

        <div className='puls-keten-gevolgen' data-geen-veeg='1'>
          <span className='puls-keten-label'>{t('Розблокує:', 'Herstelt mee:')}</span>
          <div className='puls-keten-chips'>
            {gegroepeerdeGevolgen.map((gev) => (
              <PulsDienstChip
                key={gev.id}
                merkSleutel={gev.merkSleutel}
                icoon={gev.icoon}
                toon={gev.toon}
                label={gev.label}
                toonIcoon={Boolean(gev.merkSleutel && gev.merkSleutel !== wortelVerrijkt.anker.merkSleutel)}
                titelHint={gev.herstelTekst}
              />
            ))}
          </div>
        </div>

        <div className='mel-kaart-acties puls-kaart-acties' data-geen-veeg='1'>
          <div className='puls-actie-groep puls-keten-acties'>
            <IcoonActieKnop
              href={primaireHref || undefined}
              toon='primair-let'
              icoon={<RefreshCw aria-hidden='true' />}
              label={herstelLabel}
              stopPropagatie
              data-qa-id='puls-keten-herstel'
              onClick={
                primaireHref
                  ? undefined
                  : () => {
                      onSelect(keten.wortel);
                      setToonAlleLeden(true);
                    }
              }
            />

            <div className='puls-uitstel-anker'>
              <IcoonActieKnop
                toon={uitstelOpen ? 'actief' : 'standaard'}
                icoon={<Clock3 aria-hidden='true' />}
                label={t('Відкласти до відновлення (умова)', 'Uitstellen op voorwaarde')}
                aria-expanded={uitstelOpen}
                stopPropagatie
                data-qa-id='puls-keten-uitstel'
                onClick={() => setUitstelOpen((v) => !v)}
              />
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

            <IcoonActieKnop
              icoon={<CheckCheck aria-hidden='true' />}
              label={t('Позначити весь ланцюг вирішеним', 'Hele keten als opgelost markeren')}
              stopPropagatie
              data-qa-id='puls-keten-opgelost'
              onClick={() => onHerstelKeten(keten, 'opgelost')}
            />

            <IcoonActieKnop
              icoon={<Archive aria-hidden='true' />}
              label={t('Перенести ланцюг в архів', 'Keten archiveren')}
              stopPropagatie
              data-qa-id='puls-keten-archief'
              onClick={() => onHerstelKeten(keten, 'archief')}
            />

            <IcoonActieKnop
              className='puls-keten-rechts'
              toon={toonAlleLeden ? 'actief' : 'standaard'}
              icoon={<ChevronDown className={`mel-pijl-klap${toonAlleLeden ? ' is-open' : ''}`} aria-hidden='true' />}
              teller={keten.alleIds.length}
              label={
                toonAlleLeden
                  ? t(`Сховати пов’язані події (${keten.alleIds.length})`, `Gekoppelde gebeurtenissen verbergen (${keten.alleIds.length})`)
                  : t(`Показати пов’язані події (${keten.alleIds.length})`, `Gekoppelde gebeurtenissen tonen (${keten.alleIds.length})`)
              }
              aria-expanded={toonAlleLeden}
              stopPropagatie
              data-qa-id='puls-keten-leden-knop'
              onClick={() => setToonAlleLeden((v) => !v)}
            />
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
