// UI-015 — de NIEUWE presentatie van «Способи входу» (vlag aanmeldmethoden-vnext). De CONTROLLER
// (src/ToegangslaagWeergave.tsx) blijft ongewijzigd: dit paneel krijgt exact dezelfde props als de oude AccessPlanePanels
// en gebruikt dezelfde write/step-up/herstel-stromen. Opbouw naar het referentiebeeld: hero → zoek/chips → hoofdmethoden →
// extra bescherming → toegang voor anderen → sessieverwijzing → eerlijke aanbiederscatalogus. Regels: geen verzonnen
// standen of cijfers; geheimen alleen in het detailpaneel; ankers aanmeldmethoden-* blijven werken (dossier §8.5).
import { MonitorSmartphone, ShieldCheck } from 'lucide-react';
import type { ComponentProps } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AANMELD_ANKERS, type AanmeldGroep, type MethodeUi } from '../../shared/aanmeld-vnext-model';
import { ToegangWijziging, wijzigingUitUrl } from '../ToegangWijziging';
import type { AccessPlanePanels } from '../toegangslaag-panelen';
import type { Lang } from '../toegangslaag-teksten';
import './aanmeld-vnext.css';
import AanbiederCatalogus from './onderdelen/AanbiederCatalogus';
import Hero from './onderdelen/Hero';
import MethodeDetail from './onderdelen/MethodeDetail';
import MethodeFilter from './onderdelen/MethodeFilter';
import MethodeKaart from './onderdelen/MethodeKaart';
import { eersteInTeStellen, snapshotNaarKaarten, zoekFilter } from './snapshotNaarKaarten';

const tr = (lang: Lang, uk: string, nl: string) => (lang === 'nl' ? nl : uk);
export type PaneelProps = ComponentProps<typeof AccessPlanePanels>;

/** Kaart-id ↔ het bestaande deep-link-anker (dossier §8.5); de ankers staan als id op de kaarten zelf. */
const ANKER: Partial<Record<MethodeUi['id'], (typeof AANMELD_ANKERS)[number]>> = {
  google: 'aanmeldmethoden-google', totp: 'aanmeldmethoden-2fa', recovery: 'aanmeldmethoden-herstel',
  passkey: 'aanmeldmethoden-passkeys', vault: 'aanmeldmethoden-sleutelkluis',
};

const useSmal = (): boolean => {
  const [smal, setSmal] = useState(() => (typeof window === 'undefined' ? false : window.innerWidth <= 599));
  useEffect(() => { const f = () => setSmal(window.innerWidth <= 599); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f); }, []);
  return smal;
};

export default function AanmeldVnextPanelen(p: PaneelProps) {
  const { lang, data, notice } = p;
  const smal = useSmal();
  const [groep, setGroep] = useState<AanmeldGroep>('alles');
  const [zoek, setZoek] = useState('');
  const [detail, setDetail] = useState<MethodeUi | null>(null);
  const [wijziging] = useState(wijzigingUitUrl);
  const kaarten = useMemo(() => snapshotNaarKaarten(data), [data]);
  const zichtbaar = useMemo(() => zoekFilter(kaarten, lang, zoek, groep).filter(k =>
    !p.alleen || ['google', 'password', 'passkey', 'guest-code'].includes(k.id)
  ), [kaarten, lang, zoek, groep, p.alleen]);
  const open = useCallback((k: MethodeUi) => setDetail(k), []);
  const geladen = data.factors.some((f) => f.status !== 'loading');

  // Ankerlink of ?wijziging: bij binnenkomst het juiste detail openen of naar de kaart scrollen — compatibel met de oude
  // secties (de kaarten DRAGEN de anker-id's). Bewust één keer, zonder de dubbele 60/450ms-sprongen van het oude formulier.
  const ankerGedaan = useRef(false);
  useEffect(() => {
    if (ankerGedaan.current || !geladen) return;
    ankerGedaan.current = true;
    const hash = (() => { try { return location.hash.replace(/^#/, ''); } catch { return ''; } })();
    const doelId = (Object.entries(ANKER).find(([, anker]) => anker === hash)?.[0] || '') as MethodeUi['id'] | '';
    if (doelId) {
      const k = kaarten.find((x) => x.id === doelId);
      if (k) { setDetail(k); return; }
    }
    try { document.getElementById('aanmeldmethoden-google')?.scrollIntoView({ block: 'start' }); } catch { /* geen scroll */ }
  }, [geladen, kaarten]);
  // Lopende stromen horen zichtbaar te blijven: een gestarte TOTP-setup of vers aangemaakte herstelcodes openen hun detail
  // vanzelf (de codes verschijnen uitsluitend in het geïsoleerde, bestaande één-keer-venster van HerstelcodesSectie).
  useEffect(() => { if (p.otpauth && !data.totp.enrolled) setDetail((d) => (d?.id === 'totp' ? d : kaarten.find((k) => k.id === 'totp') || d)); }, [p.otpauth, data.totp.enrolled, kaarten]);
  useEffect(() => { if (p.recovery.length) setDetail((d) => (d?.id === 'recovery' ? d : kaarten.find((k) => k.id === 'recovery') || d)); }, [p.recovery.length, kaarten]);

  const ctaDoel = useCallback(() => {
    const k = eersteInTeStellen(kaarten);
    if (k) { setDetail(k); return; }
    try { document.querySelector<HTMLElement>('[data-amv-kaart]')?.focus(); } catch { /* geen focus */ }
  }, [kaarten]);

  const sectie = (titelUk: string, titelNl: string, leden: MethodeUi[], extra?: React.ReactNode) => (leden.length || extra ? (
    <section className='amv-sectie'>
      <header className='amv-sectie-kop'><h3>{tr(lang, titelUk, titelNl)}</h3></header>
      <div className='amv-rooster' role='list'>
        {leden.map((k) => <MethodeKaart key={k.id} lang={lang} kaart={k} anker={ANKER[k.id]} onOpen={open} onRetry={() => void p.load()} />)}
        {extra}
      </div>
    </section>
  ) : null);

  const van = (ids: Array<MethodeUi['id']>) => zichtbaar.filter((k) => ids.includes(k.id));

  return (
    <div className='amv' data-amv-pagina=''>
      {notice ? <p className='amv-melding is-fout' role='alert'>{notice}</p> : null}
      {wijziging ? <ToegangWijziging lang={lang} context={p.context} id={wijziging} onChange={() => void p.load()} /> : null}
      {p.tempPassword ? <p className='amv-melding is-info'><strong>{tr(lang, 'Тимчасовий пароль', 'Tijdelijk wachtwoord')}</strong><code className='amv-geheim'>{p.tempPassword}</code></p> : null}

      {!p.alleen&&<Hero lang={lang} onCta={ctaDoel} />}
      <MethodeFilter lang={lang} groep={groep} groepen={p.alleen ? ['alles', 'inloggen', 'passkey', 'delegatie'] : undefined} onGroep={setGroep} onZoek={setZoek} />

      {sectie('Основні способи', 'Hoofdmethoden', van(['google', 'password', 'passkey', 'totp']))}
      {sectie('Додатковий захист', 'Extra bescherming', van(['recovery', 'vault']))}
      {sectie('Доступ іншим', 'Toegang voor anderen', van(['guest-code']))}
      {!zichtbaar.length ? <p className='amv-leeg' data-amv-leeg=''>{tr(lang, 'Нічого не знайдено за цим запитом чи фільтром.', 'Niets gevonden met deze zoekterm of dit filter.')}</p> : null}

      {!p.alleen&&<section className='amv-sectie'>
        <div className='amv-verwijzingen'>
          <a className='amv-verwijzing' data-amv-sessies='' href={`/sessies?lang=${lang}`}>
            <MonitorSmartphone aria-hidden='true' />
            <span><strong>{tr(lang, 'Активні сеанси й пристрої', 'Actieve sessies en apparaten')}</strong>
              <small>{tr(lang, 'Окремий розділ Identity — без дублювання тут.', 'Een eigen Identity-onderdeel — hier niet gedubbeld.')}</small></span>
          </a>
          <div className='amv-verwijzing is-stil'>
            <ShieldCheck aria-hidden='true' />
            <span><strong>{tr(lang, 'Підтвердження важливих дій', 'Bevestiging van belangrijke acties')}</strong>
              <small>{tr(lang, 'Passkey, код автентифікатора, код відновлення або повторний вхід у Google — як і раніше.', 'Passkey, authenticatorcode, herstelcode of opnieuw aanmelden bij Google — zoals altijd.')}</small></span>
          </div>
        </div>
      </section>}

      <AanbiederCatalogus lang={lang} context={p.context} />

      {detail ? <MethodeDetail lang={lang} kaart={kaarten.find((k) => k.id === detail.id) || detail} p={p} smal={smal} onSluit={() => setDetail(null)} /> : null}
    </div>
  );
}
