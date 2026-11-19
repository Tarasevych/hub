// UI-015 (vlag `aanmeldmethoden-v2`, standaard UIT): de nieuwe pagina «Способи входу» / «Aanmeldmethoden».
// ALLEEN weergave: de controller blijft src/ToegangslaagWeergave.tsx (één snapshot-call, dezelfde write/step-up/hervat-logica).
// Kaarten komen uit de pure mapper snapshotToMethodCards() (shared/aanmeldmethoden-model.ts); nooit «Підключено» zonder server.
// Deep-links: tab security/recovery en #aanmeldmethoden-google/-2fa/-herstel/-passkeys/-sleutelkluis → kaart oplichten (één keer
// scrollen, na het laden; geen dubbele 60/450 ms-sprong) en bij een #anker meteen de details openen.
import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, RefreshCw, ShieldAlert } from 'lucide-react';
import { InfoTip } from '../InfoTip';
import { ToegangWijziging, wijzigingUitUrl } from '../ToegangWijziging';
import { ANKER_NAAR_KAART, TAB_NAAR_KAART, filterKaarten, snapshotToMethodCards, weergaveGroep, type Categorie, type Fase, type KaartId, type MethodeKaart, type SnapshotInvoer, type Taal } from '../../shared/aanmeldmethoden-model';
import { IdentityMethodsHero } from './IdentityMethodsHero';
import { IdentityMethodsFilter } from './IdentityMethodsFilter';
import { IdentityMethodCard } from './IdentityMethodCard';
import { IdentityMethodDetails, type DetailsProps } from './IdentityMethodDetails';
import { IdentitySecurityExtras } from './IdentitySecurityExtras';
import './aanmeldmethoden-v2.css';

export type V2Props = Omit<DetailsProps, 'lockout' | 'mustChange' | 'totpEnrolled'> & {
  tab: string; fase: Fase; data: SnapshotInvoer; tempPassword: string;
};
type GroepId = 'verbonden' | 'beschikbaar' | 'extra' | 'anderen';
const INKLAP = 'amv2-ingeklapt';// alleen een UI-voorkeur (welke groepen dicht zijn), nooit iets over aanmelding
const leesInklap = (): GroepId[] => { try { const v = JSON.parse(localStorage.getItem(INKLAP) || '[]'); return Array.isArray(v) ? v.filter((x) => ['verbonden', 'beschikbaar', 'extra', 'anderen'].includes(x)) : []; } catch { return []; } };

export default function AanmeldmethodenV2(p: V2Props) {
  const lang = p.lang as Taal;
  const tr = (uk: string, nl: string) => (lang === 'nl' ? nl : uk);
  const [categorie, setCategorie] = useState<'alle' | Categorie>('alle');
  const [zoek, setZoek] = useState('');
  const [open, setOpen] = useState<KaartId | null>(null);
  const [dicht, setDicht] = useState<GroepId[]>(leesInklap);
  const [wijziging] = useState(wijzigingUitUrl);
  const kaarten = useMemo(() => snapshotToMethodCards(p.fase, p.data), [p.fase, p.data]);
  const zichtbaar = useMemo(() => filterKaarten(kaarten, categorie, zoek), [kaarten, categorie, zoek]);
  const openKaart = open ? kaarten.find((k) => k.id === open) : undefined;
  const lockout = !!p.data.lockout?.protected;

  // Eén keer per tab: na het laden naar de juiste kaart (geen dubbele scroll).
  const gedaan = useRef('');
  useEffect(() => {
    if (p.fase === 'laden') return;
    const anker = (() => { try { return decodeURIComponent(location.hash.replace(/^#/, '')); } catch { return ''; } })();
    const sleutel = `${p.tab}|${anker}`;
    if (gedaan.current === sleutel) return;
    gedaan.current = sleutel;
    const doel = ANKER_NAAR_KAART[anker] || (p.tab !== 'methods' ? TAB_NAAR_KAART[p.tab] : undefined);
    if (!doel) return;
    const el = document.querySelector<HTMLElement>(`[data-kaart="${doel}"]`);
    if (!el) return;
    document.querySelectorAll('[data-access-actief]').forEach((x) => x.removeAttribute('data-access-actief'));
    el.setAttribute('data-access-actief', '1');
    try { el.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' }); } catch { /* geen scroll */ }
    if (ANKER_NAAR_KAART[anker] && p.fase === 'klaar') setOpen(doel);
  }, [p.fase, p.tab]);

  // Lopende eenmalige stromen horen in hun paneel: TOTP-sleutel net gemaakt, herstelcodes net gemaakt (ook na hervat via Google).
  useEffect(() => { if (p.otpauth) setOpen('totp'); }, [p.otpauth]);
  useEffect(() => { if (p.recovery.length) setOpen('recovery'); }, [p.recovery.length]);

  const wissel = (g: GroepId) => setDicht((oud) => { const n = oud.includes(g) ? oud.filter((x) => x !== g) : [...oud, g]; try { localStorage.setItem(INKLAP, JSON.stringify(n)); } catch { /* geen opslag */ } return n; });
  const start = () => {
    const doel = kaarten.find((k) => k.staat === 'ready' && (k.actie === 'setup' || k.actie === 'connect')) || kaarten.find((k) => k.actie === 'manage');
    setCategorie('alle');
    if (doel) setOpen(doel.id);
  };

  const groepen: Array<{ id: GroepId; titel: string; tip?: string; kaarten: MethodeKaart[] }> = [
    { id: 'verbonden', titel: p.fase === 'klaar' ? tr('Підключені', 'Gekoppeld') : tr('Основні способи', 'Hoofdmethoden'), kaarten: [] },
    { id: 'beschikbaar', titel: tr('Доступні', 'Beschikbaar'), tip: tr('Тут лише способи, які знає сервер. «Підключити» з’являється тільки тоді, коли сервер готовий; інакше видно причину.', 'Hier staan alleen methoden die de server kent. «Koppelen» verschijnt pas als de server klaar is; anders zie je de reden.'), kaarten: [] },
    { id: 'extra', titel: tr('Додатковий захист', 'Extra beveiliging'), kaarten: [] },
    { id: 'anderen', titel: tr('Доступ іншим', 'Toegang voor anderen'), kaarten: [] },
  ];
  for (const k of zichtbaar) {
    const g = p.fase === 'klaar' ? weergaveGroep(k) : (k.groep === 'hoofd' ? 'verbonden' : k.groep === 'beschikbaar' ? 'beschikbaar' : k.groep);
    groepen.find((x) => x.id === g)!.kaarten.push(k);
  }

  const details: DetailsProps = { ...p, lang, lockout, mustChange: !!p.data.password?.mustChange, totpEnrolled: !!p.data.totp?.enrolled || !!p.data.factors?.find((f) => f.id === 'totp')?.enrolled };

  return <div className='amv2' data-fase={p.fase} lang={lang}>
    {wijziging && <ToegangWijziging lang={lang} context={p.context} id={wijziging} onChange={() => void p.load()} />}
    <IdentityMethodsHero lang={lang} onStart={start} startUit={p.fase !== 'klaar'} />
    {p.fase === 'fout' && <div className='amv2-banner fout' role='alert'><ShieldAlert aria-hidden='true' /><span><strong>{tr('Стан не вдалося перевірити', 'Status kon niet worden gecontroleerd')}</strong><small>{tr('Сервер не відповів. Ми нічого не показуємо як «підключено», доки не перевіримо.', 'De server antwoordde niet. We tonen niets als «gekoppeld» tot het gecontroleerd is.')}</small></span><button type='button' className='amv2-knop' onClick={() => void p.load()}><RefreshCw aria-hidden='true' />{tr('Повторити', 'Opnieuw')}</button></div>}
    {p.fase === 'geen-toegang' && <div className='amv2-banner fout' role='alert'><ShieldAlert aria-hidden='true' /><span><strong>{tr('Немає доступу', 'Geen toegang')}</strong><small>{tr('Ця сторінка доступна лише власнику акаунта після входу.', 'Deze pagina is alleen voor de eigenaar van het account na aanmelden.')}</small></span></div>}
    {p.notice && !open && p.fase === 'klaar' && <p className='amv2-melding' role='status'>{p.notice}</p>}
    {p.fase !== 'geen-toegang' && <>
      <IdentityMethodsFilter lang={lang} categorie={categorie} onCategorie={setCategorie} onZoek={setZoek} />
      {!zichtbaar.length && <p className='amv2-leeg' role='status'>{tr('Нічого не знайдено. Змініть пошук або категорію.', 'Niets gevonden. Pas de zoekopdracht of categorie aan.')}</p>}
      {groepen.filter((g) => g.kaarten.length).map((g) => {
        const isDicht = dicht.includes(g.id);
        return <section key={g.id} className={`amv2-groep groep-${g.id}`} aria-labelledby={`amv2-g-${g.id}`}>
          <header className='amv2-groep-kop'>
            <h3 id={`amv2-g-${g.id}`}>{g.titel}<span className='amv2-teller' aria-label={tr(`кількість: ${g.kaarten.length}`, `aantal: ${g.kaarten.length}`)}>{g.kaarten.length}</span></h3>
            {g.tip && <InfoTip label={tr('Про доступні способи', 'Over beschikbare methoden')}><p>{g.tip}</p></InfoTip>}
            <button type='button' className='amv2-inklap' aria-expanded={!isDicht} aria-controls={`amv2-r-${g.id}`} onClick={() => wissel(g.id)} aria-label={isDicht ? tr(`Розгорнути «${g.titel}»`, `«${g.titel}» uitklappen`) : tr(`Згорнути «${g.titel}»`, `«${g.titel}» inklappen`)}><ChevronDown aria-hidden='true' /></button>
          </header>
          {/* Waarschuwingen (aandacht) blijven zichtbaar, ook als de groep dicht is. */}
          <div id={`amv2-r-${g.id}`} className={`amv2-raster${g.id === 'beschikbaar' ? ' tegels' : ''}`}>
            {g.kaarten.filter((k) => !isDicht || k.staat === 'attention').map((k) => <IdentityMethodCard key={k.id} k={k} lang={lang} compact={g.id === 'beschikbaar'} onOpen={(x) => setOpen(x.id)} onRetry={() => void p.load()} />)}
          </div>
        </section>;
      })}
      {(categorie === 'alle' || categorie === 'zakhyst') && !zoek && <section className='amv2-groep groep-extras' aria-labelledby='amv2-g-extras'>
        <header className='amv2-groep-kop'><h3 id='amv2-g-extras'>{tr('Сеанси та підтвердження', 'Sessies en bevestiging')}</h3></header>
        <IdentitySecurityExtras lang={lang} onSessies={p.onSessies} />
      </section>}
      {p.tempPassword && <div className='amv2-banner'><span><strong>{tr('Тимчасовий пароль', 'Tijdelijk wachtwoord')}</strong><code className='access-plane-mono'>{p.tempPassword}</code></span></div>}
    </>}
    {openKaart && <IdentityMethodDetails k={openKaart} p={details} onClose={() => setOpen(null)} />}
  </div>;
}
