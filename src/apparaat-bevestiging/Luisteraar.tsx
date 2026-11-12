// APPARAAT-001 — de kant van het BEVESTIGENDE apparaat (B). Staat in de schil van elke aangemelde pagina (CanoniekOmlijsting):
// luistert naar de snelle stroom, vraagt daarnaast zelf om de paar seconden naar open verzoeken (de stroom is versnelling, geen
// voorwaarde) en toont per verzoek een ZWEVEND venster «Це ви?» in de gezamenlijke vensterlaag (src/platform/vensters.tsx):
// te verplaatsen, groter/kleiner, te minimaliseren naar het dok, te sluiten («пізніше»), niet modaal — de pagina blijft bruikbaar.
//
// Wat de gebruiker ziet: welk apparaat vraagt, waar (regio), wanneer, welke handeling; dezelfde symbolen als op het vragende
// apparaat (zonder aanwijzing welk het juiste is); een aftelling vóór de symbolen aanklikbaar zijn (door de server afgedwongen);
// «Ні, це не я» werkt altijd meteen. Een tik op een symbool vraagt eerst de toegangssleutel op DIT apparaat (of, als de beheerder
// én de gebruiker dat toestaan, een authenticator-code) en stuurt dan de keuze. Eén poging.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ShieldAlert, ShieldCheck, ShieldX } from 'lucide-react';
import { Venster } from '../platform/vensters';
import { ecosystemTabContext } from '../tab-context';
import Symbool from './Symbool';
import { abonneer, stroomVerbonden } from './stroom';
import { bekrachtigen, foutCode, metSleutel, open, weigeren, type Ctx } from './api';
import { useApparaatVlag } from './vlag';
import { foutTekst, tijd, tr, type Lang } from './teksten';
import type { VerzoekPubliek } from '../../shared/apparaat-bevestiging/model';
import './apparaat.css';

const SNEL_MS = 5_000, TRAAG_MS = 30_000;

/** Knop die pas na `tot` (ms-tijdstip) werkt; toont de resterende seconden in de knop zelf. */
export function AftelKnop({ tot, onClick, children, className = 'apb-knop', uit = false, lang, label }: { tot: number; onClick: () => void; children: ReactNode; className?: string; uit?: boolean; lang: Lang; label?: string }) {
  const [rest, setRest] = useState(() => Math.max(0, Math.ceil((tot - Date.now()) / 1000)));
  useEffect(() => { const t = window.setInterval(() => setRest(Math.max(0, Math.ceil((tot - Date.now()) / 1000))), 250); return () => window.clearInterval(t); }, [tot]);
  const dicht = rest > 0 || uit;
  return <button type='button' className={className} disabled={dicht} aria-disabled={dicht} aria-label={label} onClick={() => { if (!dicht) onClick(); }}>
    {children}{rest > 0 && <span className='apb-aftel' aria-live='polite'>{tr(lang, `${rest} с`, `${rest} s`)}</span>}
  </button>;
}

function piep() {
  try {
    const AC = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC(); const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = 880; g.gain.value = 0.04; o.connect(g); g.connect(ctx.destination);
    o.start(); o.stop(ctx.currentTime + 0.18); window.setTimeout(() => { void ctx.close(); }, 400);
  } catch { /* geen geluid mogelijk */ }
}

type Uitkomst = '' | 'bevestigd' | 'fout' | 'niet-ik' | 'verlopen' | 'elders';

function VerzoekVenster({ v, ctx, lang, totp, onWeg }: { v: VerzoekPubliek; ctx: Ctx; lang: Lang; totp: boolean; onWeg: (id: string) => void }) {
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState('');
  const [uitkomst, setUitkomst] = useState<Uitkomst>(v.stand === 'wacht' ? '' : v.stand === 'bevestigd' || v.stand === 'gebruikt' ? 'elders' : v.stand === 'geweigerd' ? 'elders' : 'verlopen');
  const [rest, setRest] = useState(() => Math.max(0, Math.ceil((new Date(v.verlooptOp).getTime() - Date.now()) / 1000)));
  const aftelTot = useMemo(() => new Date(v.aangemaaktOp).getTime() + v.aftelSec * 1000, [v.aangemaaktOp, v.aftelSec]);
  useEffect(() => { const t = window.setInterval(() => { const r = Math.max(0, Math.ceil((new Date(v.verlooptOp).getTime() - Date.now()) / 1000)); setRest(r); if (r === 0 && !uitkomst) setUitkomst('verlopen'); }, 500); return () => window.clearInterval(t); }, [v.verlooptOp, uitkomst]);
  // Na een afloop sluit het venster vanzelf (succes 2,5 s, anders 5 s): niemand hoeft erachteraan te klikken.
  useEffect(() => { if (!uitkomst) return; const t = window.setTimeout(() => onWeg(v.id), uitkomst === 'bevestigd' ? 2500 : 5000); return () => window.clearTimeout(t); }, [uitkomst, onWeg, v.id]);
  useEffect(() => { if (v.stand !== 'wacht' && !uitkomst) setUitkomst(v.stand === 'bevestigd' || v.stand === 'gebruikt' || v.stand === 'geweigerd' ? 'elders' : 'verlopen'); }, [v.stand, uitkomst]);

  const kies = async (pos: number) => {
    if (bezig || uitkomst) return;
    setBezig(true); setFout('');
    try {
      const r = await metSleutel(ctx, () => bekrachtigen(ctx, v.id, pos), totp ? ['passkey', 'totp'] : ['passkey'], 'apparaat-bevestigen');
      if (r.ok) setUitkomst('bevestigd');
      else { setUitkomst('fout'); setFout(r.uitkomst === 'uit' ? tr(lang, 'Інший символ. Спосіб вимкнено після забагатьох помилок — відновіть його ключем доступу у «Способах входу».', 'Ander symbool. De manier staat uit na te veel fouten — herstel hem met uw toegangssleutel bij «Aanmeldmethoden».') : r.uitkomst === 'pauze' ? tr(lang, 'Інший символ. Забагато помилок поспіль — коротка пауза.', 'Ander symbool. Te veel fouten na elkaar — korte pauze.') : tr(lang, 'Інший символ — дію на тому пристрої скасовано.', 'Ander symbool — de handeling op dat apparaat is geannuleerd.')); }
    } catch (e) {
      const c = foutCode(e);
      if (c === 'PASSKEY_GEANNULEERD') { setFout(foutTekst(lang, c)); }
      else if (c === 'AL_AFGEROND' || c === 'VERLOPEN' || c === 'VERZOEK_ONBEKEND') setUitkomst(c === 'VERLOPEN' ? 'verlopen' : 'elders');
      else setFout(foutTekst(lang, c));
    } finally { setBezig(false); }
  };
  const nietIk = async () => {
    if (bezig) return;
    setBezig(true); setFout('');
    try { await weigeren(ctx, v.id); setUitkomst('niet-ik'); }
    catch (e) { const c = foutCode(e); if (c === 'AL_AFGEROND' || c === 'VERZOEK_ONBEKEND') setUitkomst('elders'); else setFout(foutTekst(lang, c)); }
    finally { setBezig(false); }
  };

  const naam = lang === 'nl' ? v.actieNaam[1] : v.actieNaam[0];
  const titel = tr(lang, 'Це ви?', 'Bent u het?');
  return <Venster id={`apparaat-${v.id}`} titel={titel} prioriteit='kritiek' modaal={false} breedte={400} lang={lang} onSluit={() => onWeg(v.id)} sluitenUit={bezig} labelledBy={`apb-titel-${v.id}`} className='apb-venster'>
    <div className='apb-inhoud' data-uitkomst={uitkomst || 'open'}>
      <header className='apb-kop'>
        {uitkomst === 'bevestigd' ? <ShieldCheck className='apb-kop-icoon is-ok' aria-hidden='true' /> : uitkomst === 'fout' || uitkomst === 'niet-ik' ? <ShieldX className='apb-kop-icoon is-fout' aria-hidden='true' /> : <ShieldAlert className='apb-kop-icoon' aria-hidden='true' />}
        <h2 id={`apb-titel-${v.id}`}>{titel}</h2>
      </header>
      <dl className='apb-context'>
        <div><dt>{tr(lang, 'Дія', 'Handeling')}</dt><dd><strong>{naam}</strong></dd></div>
        <div><dt>{tr(lang, 'Пристрій', 'Apparaat')}</dt><dd>{v.apparaatA || tr(lang, 'невідомий', 'onbekend')}{v.regioA ? ` · ${v.regioA}` : ''}</dd></div>
        <div><dt>{tr(lang, 'Коли', 'Wanneer')}</dt><dd>{tijd(v.aangemaaktOp, lang)}</dd></div>
      </dl>
      {!uitkomst && <>
        <p className='apb-uitleg'>{tr(lang, 'На тому екрані один символ виділено. Натисніть тут ТОЙ САМИЙ символ. Є лише одна спроба: інший символ скасує дію. Якщо це не ви — натисніть «Це не я».', 'Op dat scherm is één symbool uitgelicht. Tik hier HETZELFDE symbool. U hebt één poging: een ander symbool annuleert de handeling. Bent u het niet, tik «Dit ben ik niet».')}</p>
        <div className='apb-symbolen' role='group' aria-label={tr(lang, 'Виберіть символ', 'Kies een symbool')}>
          {v.kandidaten.map((k, pos) => <AftelKnop key={`${v.soort}-${k}`} tot={aftelTot} uit={bezig} lang={lang} className='apb-tegel apb-tegel-knop' onClick={() => void kies(pos)}>
            <Symbool soort={v.soort} index={k} lang={lang} />
          </AftelKnop>)}
        </div>
        <p className='apb-klein' aria-live='polite'>{rest > 0 ? tr(lang, `Запит дійсний ще ${rest} с.`, `Verzoek nog ${rest} s geldig.`) : ''}</p>
      </>}
      {uitkomst === 'bevestigd' && <p className='apb-ok' role='status'>{tr(lang, 'Підтверджено. На тому пристрої дія продовжиться сама.', 'Bevestigd. Op dat apparaat gaat de handeling vanzelf verder.')}</p>}
      {uitkomst === 'niet-ik' && <p className='apb-fout' role='status'>{tr(lang, 'Відхилено. Ми повідомили адміністратора. Перевірте сеанси й ключі доступу у «Способах входу».', 'Geweigerd. De beheerder is gewaarschuwd. Controleer uw sessies en toegangssleutels bij «Aanmeldmethoden».')}</p>}
      {uitkomst === 'elders' && <p className='apb-klein' role='status'>{tr(lang, 'Цей запит уже завершено з іншого місця.', 'Dit verzoek is al ergens anders afgerond.')}</p>}
      {uitkomst === 'verlopen' && <p className='apb-klein' role='status'>{tr(lang, 'Час запиту вийшов.', 'De tijd van het verzoek is om.')}</p>}
      {fout && <p className='apb-fout' role='alert'>{fout}</p>}
      <div className='apb-rij'>
        {!uitkomst && <button type='button' className='apb-knop apb-knop-gevaar' disabled={bezig} onClick={() => void nietIk()}>{tr(lang, 'Це не я', 'Dit ben ik niet')}</button>}
        <button type='button' className='apb-knop' disabled={bezig} onClick={() => onWeg(v.id)}>{uitkomst ? tr(lang, 'Закрити', 'Sluiten') : tr(lang, 'Пізніше', 'Later')}</button>
      </div>
    </div>
  </Venster>;
}

/** De luisteraar in de schil: één per tabblad. Toont niets zolang de vlag uit is of er geen open verzoeken zijn. */
export default function ApparaatLuisteraar({ lang, service }: { lang: Lang; service: string }) {
  const vlag = useApparaatVlag();
  const ctx = useMemo<Ctx>(() => ({ service, tabContext: ecosystemTabContext() }), [service]);
  const [verzoeken, setVerzoeken] = useState<VerzoekPubliek[]>([]);
  const [totp, setTotp] = useState(false);
  const [geluid, setGeluid] = useState(false);
  const [toonAls, setToonAls] = useState<'venster' | 'melding'>('venster');
  const [weg, setWeg] = useState<Set<string>>(() => new Set());
  const gezien = useRef<Set<string>>(new Set());

  const laad = useCallback(async () => {
    try {
      const r = await open(ctx);
      if (!r || !Array.isArray(r.verzoeken)) return;
      const lijst = r.verzoeken;
      setTotp(Boolean(r.totp)); setGeluid(Boolean(r.geluid)); setToonAls(r.toonAls === 'melding' ? 'melding' : 'venster');
      setVerzoeken((oud) => {
        // Nieuwe verzoeken: geluid (als gewenst). Afgeronde die we nog tonen, houden we even met hun eindstand.
        for (const v of lijst) if (!gezien.current.has(v.id)) { gezien.current.add(v.id); if (r.geluid) piep(); }
        const nieuw = new Map(lijst.map((v) => [v.id, v] as const));
        for (const o of oud) if (!nieuw.has(o.id) && o.stand === 'wacht') nieuw.set(o.id, { ...o, stand: 'verlopen' });
        return [...nieuw.values()];
      });
    } catch { /* geen sessie of vlag uit: niets tonen */ }
  }, [ctx]);

  useEffect(() => {
    if (!vlag) return;
    let t = 0; let actief = true;
    const plan = () => { window.clearTimeout(t); t = window.setTimeout(ronde, stroomVerbonden() ? TRAAG_MS : document.visibilityState === 'visible' ? SNEL_MS : TRAAG_MS); };
    const ronde = async () => { if (!actief) return; await laad(); plan(); };
    const zicht = () => { if (document.visibilityState === 'visible') void ronde(); };
    document.addEventListener('visibilitychange', zicht);
    void ronde();
    const af = abonneer(ctx, (g) => {
      if (g.soort === 'apparaat.verzoek') {
        setVerzoeken((oud) => (oud.some((x) => x.id === g.verzoek.id) ? oud : [g.verzoek, ...oud]));
        if (!gezien.current.has(g.verzoek.id)) { gezien.current.add(g.verzoek.id); if (geluid) piep(); }
        void laad();
      } else if (g.soort === 'apparaat.afgerond') {
        setVerzoeken((oud) => oud.map((x) => (x.id === g.id ? { ...x, stand: g.stand } : x)));
      }
    });
    return () => { actief = false; window.clearTimeout(t); document.removeEventListener('visibilitychange', zicht); af(); };
  }, [vlag, ctx, laad, geluid]);

  const verberg = useCallback((id: string) => { setWeg((s) => new Set(s).add(id)); setVerzoeken((oud) => oud.filter((x) => x.id !== id)); }, []);
  if (!vlag) return null;
  // Voorkeur «alleen een melding»: geen venster uit zichzelf; alleen het verzoek dat de gebruiker zelf opende via de link in de melding
  // (…?bevestiging=<id>) krijgt zijn venster.
  const gevraagd = (() => { try { return new URLSearchParams(window.location.search).get('bevestiging') || ''; } catch { return ''; } })();
  const zichtbaar = verzoeken.filter((v) => !weg.has(v.id) && (toonAls === 'venster' || v.id === gevraagd));
  return <>{zichtbaar.map((v) => <VerzoekVenster key={v.id} v={v} ctx={ctx} lang={lang} totp={totp} onWeg={verberg} />)}</>;
}
