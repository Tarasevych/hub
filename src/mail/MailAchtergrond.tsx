// MAILBG-001 · Спільне рухоме тло входу та вибору поштової служби.
// Справжні кнопки й авторизація залишаються поза полотном і не змінюються.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Pause, PenLine, Play, Settings2, X, ZoomIn } from 'lucide-react';
import { MAIL_AANBIEDERS } from '../../shared/mail-aanbieders';
import { officieelMerk, laadOfficieel } from '../merk/merk-register';
import { dagSleutel, golfImpuls, schrijfDoel, vloeibaarDoel, type LogoPunt, type VloeiPunt } from './mail-vloeistof';
import './mail-achtergrond.css';

type Taal = 'uk' | 'nl';
type Beweging = 'golven' | 'wervel' | 'aantrekken' | 'uit';
type Stijl = 'tekens' | 'stippen' | 'rust';
type Palet = 'poollicht' | 'zomer' | 'oceaan';
type Voorkeuren = {
  stijl: Stijl;
  beweging: Beweging;
  palet: Palet;
  aantal: number;
  kracht: number;
  vergroting: number;
  pauze: boolean;
  tekenen: boolean;
};
type Deeltje = {
  x: number; y: number; basisX: number; basisY: number; vx: number; vy: number;
  soort: number; tint: number; grootte: number; fase: number; doorzichtigheid: number;
};

const SLEUTEL = 'mijn-ruimte-mail-achtergrond-v1';
const PALETTEN: Record<Palet, readonly string[]> = {
  poollicht: ['#18b9b3', '#438ed8', '#9167d6', '#d68dd7', '#d3a951', '#42a8c7'],
  zomer: ['#d38b39', '#e66d6b', '#d54c93', '#8f6dd6', '#dc9a46', '#c49f68'],
  oceaan: ['#1a9cbd', '#398bd1', '#587cce', '#479ccc', '#29a9a1', '#658bd4'],
};
const STANDAARD: Voorkeuren = { stijl: 'tekens', beweging: 'golven', palet: 'poollicht', aantal: 1400, kracht: .65, vergroting: 4, pauze: false, tekenen: false };
const DIENSTEN = MAIL_AANBIEDERS.slice(0, 12);
const begrens = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const willekeurig = (min: number, max: number) => min + Math.random() * (max - min);
const geldigeKeuze = <T extends string>(waarde: unknown, keuzen: readonly T[], standaard: T): T =>
  typeof waarde === 'string' && keuzen.includes(waarde as T) ? waarde as T : standaard;

function leesVoorkeuren(): Voorkeuren {
  try {
    const bewaard = JSON.parse(localStorage.getItem(SLEUTEL) || '{}') as Partial<Voorkeuren>;
    return {
      stijl: geldigeKeuze(bewaard.stijl, ['tekens', 'stippen', 'rust'], STANDAARD.stijl),
      beweging: geldigeKeuze(bewaard.beweging, ['golven', 'wervel', 'aantrekken', 'uit'], STANDAARD.beweging),
      palet: geldigeKeuze(bewaard.palet, ['poollicht', 'zomer', 'oceaan'], STANDAARD.palet),
      aantal: Number.isFinite(bewaard.aantal) ? begrens(Number(bewaard.aantal), 300, 2600) : STANDAARD.aantal,
      kracht: Number.isFinite(bewaard.kracht) ? begrens(Number(bewaard.kracht), 0, 1) : STANDAARD.kracht,
      vergroting: Number.isFinite(bewaard.vergroting) ? begrens(Number(bewaard.vergroting), 2, 6) : STANDAARD.vergroting,
      pauze: typeof bewaard.pauze === 'boolean' ? bewaard.pauze : matchMedia('(prefers-reduced-motion: reduce)').matches,
      tekenen: bewaard.tekenen === true,
    };
  } catch { return STANDAARD; }
}

function maakDeeltjes(breedte: number, hoogte: number, aantal: number): Deeltje[] {
  return Array.from({ length: aantal }, (_, i) => {
    const start = vloeibaarDoel(i, aantal, Math.random() * 16, breedte, hoogte);
    return {
      x: start.x, y: start.y, basisX: start.x, basisY: start.y, vx: 0, vy: 0,
      soort: i % Math.max(1, DIENSTEN.length), tint: i % 6,
      grootte: willekeurig(3.5, 7.5),
      fase: willekeurig(0, Math.PI * 2), doorzichtigheid: willekeurig(.48, .86),
    };
  });
}

/** Кольори й обриси беруться тільки з наявного реєстру емблем, без вигаданого зображення. */
async function logoPunten(merk: string, vormen: Readonly<Record<string, readonly [string, string]>>): Promise<LogoPunt[]> {
  const masker = document.createElement('canvas'); masker.width = 100; masker.height = 100;
  const ctx = masker.getContext('2d', { willReadFrequently: true });
  if (!ctx) return [];
  const officieel = officieelMerk(merk);
  if (officieel) {
    const beeld = new Image();
    try {
      await new Promise<void>((klaar, mis) => { beeld.onload = () => klaar(); beeld.onerror = () => mis(new Error('GEEN_EMBLEEM')); beeld.src = officieel.data; });
      const verhouding = Math.min(80 / Math.max(1, beeld.naturalWidth), 80 / Math.max(1, beeld.naturalHeight));
      const w = beeld.naturalWidth * verhouding, h = beeld.naturalHeight * verhouding;
      ctx.drawImage(beeld, (100 - w) / 2, (100 - h) / 2, w, h);
    } catch { return []; }
  } else if (vormen[merk]) {
    try {
      const [pad, kleur] = vormen[merk];
      ctx.save(); ctx.translate(14, 14); ctx.scale(3, 3);
      ctx.fillStyle = `#${kleur}`; ctx.fill(new Path2D(pad)); ctx.restore();
    } catch { return []; }
  } else return [];
  const gegevens = ctx.getImageData(0, 0, 100, 100).data;
  const uit: LogoPunt[] = [];
  for (let y = 3; y < 98; y += 2) for (let x = 3; x < 98; x += 2) {
    const i = (y * 100 + x) * 4;
    if (gegevens[i + 3] < 120) continue;
    const r = gegevens[i], g = gegevens[i + 1], b = gegevens[i + 2];
    if (r > 245 && g > 245 && b > 245) continue;
    uit.push({ x: (x - 50) / 50, y: (y - 50) / 50, kleur: `rgb(${r} ${g} ${b})` });
  }
  return uit;
}

/** Лише відомі форми емблем; за відсутності підтвердженої форми — нейтральна позначка. */
function maakTekens(palet: Palet, vormen: Readonly<Record<string, readonly [string, string]>> = {}): HTMLCanvasElement[][] {
  return PALETTEN[palet].map((kleur) => DIENSTEN.map((dienst) => {
    const doek = document.createElement('canvas');
    doek.width = 64; doek.height = 64;
    const k = doek.getContext('2d');
    if (!k) return doek;
    k.fillStyle = kleur;
    k.beginPath(); k.roundRect(4, 4, 56, 56, 15); k.fill();
    k.fillStyle = '#ffffff';
    k.beginPath(); k.roundRect(9, 9, 46, 46, 10); k.fill();
    const officieel = officieelMerk(dienst.merk);
    if (officieel) {
      const beeld = new Image();
      beeld.onload = () => { k.drawImage(beeld, 14, 14, 36, 36); };
      beeld.src = officieel.data;
      return doek;
    }
    const vorm = vormen[dienst.merk];
    if (vorm) {
      try {
        const pad = new Path2D(vorm[0]);
        k.save(); k.translate(13, 13); k.scale(1.58, 1.58);
        k.fillStyle = `#${vorm[1]}`; k.fill(pad); k.restore();
        return doek;
      } catch { /* Відсутня придатна векторна форма — нейтральна позначка. */ }
    }
    const letters = dienst.naam.split(/[ .!]+/).filter(Boolean).map((woord) => woord[0]).join('').slice(0, 2).toLocaleUpperCase('uk');
    k.fillStyle = kleur;
    k.font = `700 ${letters.length > 1 ? 24 : 33}px system-ui`;
    k.textAlign = 'center'; k.textBaseline = 'middle'; k.fillText(letters, 32, 33);
    return doek;
  }));
}

export default function MailAchtergrond({ lang, plaats }: { lang: Taal; plaats: 'aanmelden' | 'accounts' }) {
  const [voorkeuren, zetVoorkeuren] = useState<Voorkeuren>(leesVoorkeuren);
  const [instellingen, zetInstellingen] = useState(false);
  const [instellingenTop, zetInstellingenTop] = useState(60);
  const tandwiel = useRef<HTMLButtonElement>(null);
  const [lens, zetLens] = useState(false);
  const doek = useRef<HTMLCanvasElement>(null);
  const voorkeurRef = useRef(voorkeuren);
  const lensRef = useRef(lens);
  const aanwijzer = useRef({ x: 0, y: 0, dx: 0, dy: 0, binnen: false });
  const t = (uk: string, nl: string) => lang === 'uk' ? uk : nl;

  useEffect(() => {
    if (!instellingen) return;
    const plaatsPaneel = () => {
      const onder = tandwiel.current?.getBoundingClientRect().bottom ?? 48;
      zetInstellingenTop(Math.max(8, Math.min(onder + 8, window.innerHeight - 110)));
    };
    plaatsPaneel();
    window.addEventListener('resize', plaatsPaneel);
    window.addEventListener('scroll', plaatsPaneel, true);
    return () => { window.removeEventListener('resize', plaatsPaneel); window.removeEventListener('scroll', plaatsPaneel, true); };
  }, [instellingen]);

  useEffect(() => { voorkeurRef.current = voorkeuren; try { localStorage.setItem(SLEUTEL, JSON.stringify(voorkeuren)); } catch { /* Privémodus. */ } }, [voorkeuren]);
  useEffect(() => {
    lensRef.current = lens;
    if (!lens || aanwijzer.current.binnen) return;
    const houder = doek.current?.parentElement?.parentElement;
    if (!houder) return;
    const rect = houder.getBoundingClientRect();
    aanwijzer.current = { x: rect.width / 2, y: rect.height / 2, dx: 0, dy: 0, binnen: true };
  }, [lens]);

  useEffect(() => {
    const canvas = doek.current;
    const houder = canvas?.parentElement?.parentElement;
    const k = canvas?.getContext('2d', { alpha: true });
    if (!canvas || !houder || !k) return;
    let breedte = 1; let hoogte = 1; let tijd = 0; let vorig = 0; let verzoek = 0;
    let zichtbaar = true;
    let leeft = true;
    let deeltjes: Deeltje[] = [];
    let vormen: Readonly<Record<string, readonly [string, string]>> = {};
    let tekens = maakTekens(voorkeurRef.current.palet);
    let vorigAantal = 0; let vorigPalet = voorkeurRef.current.palet;
    let schrijft = false, laatsteStreek = -10, lijn: VloeiPunt[] = [];
    let logo: { start: number; duur: number; punten: LogoPunt[]; grootte: number; dichtheid: number } | null = null;
    let logoAangevraagd = false;
    const logoNa = willekeurig(28, 75);
    const DAG = 'mijn-ruimte-mail-embleem-dag-v1', LAATSTE = 'mijn-ruimte-mail-embleem-vorig-v1';
    void Promise.all([import('../merk/merk-logos'), laadOfficieel()]).then(([module]) => {
      if (!leeft) return;
      vormen = module.LOGOS;
      tekens = maakTekens(voorkeurRef.current.palet, vormen);
    }).catch(() => { /* Нейтральні позначки залишаються доступними без додаткових зображень. */ });
    const meet = () => {
      const rect = houder.getBoundingClientRect();
      const nieuwBreed = Math.max(1, rect.width), nieuwHoog = Math.max(1, rect.height);
      if (Math.abs(breedte - nieuwBreed) < 1 && Math.abs(hoogte - nieuwHoog) < 1) return;
      breedte = nieuwBreed; hoogte = nieuwHoog;
      const verhouding = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(breedte * verhouding);
      canvas.height = Math.round(hoogte * verhouding);
      k.setTransform(verhouding, 0, 0, verhouding, 0, 0);
      deeltjes = maakDeeltjes(breedte, hoogte, effectiefAantal());
      vorigAantal = deeltjes.length;
    };
    const effectiefAantal = () => Math.round(voorkeurRef.current.aantal * (breedte < 700 ? .38 : 1));
    const wijs = (e: PointerEvent) => {
      if (e.target instanceof Element &&
        e.target.closest('button,a,input,textarea,select,summary,[role="button"],[contenteditable="true"]')) return;
      const r = houder.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      const p = aanwijzer.current;
      p.dx = begrens(x - p.x, -30, 30); p.dy = begrens(y - p.y, -30, 30);
      p.x = x; p.y = y; p.binnen = x >= 0 && x <= breedte && y >= 0 && y <= hoogte;
      if (schrijft && p.binnen && (lijn.length === 0 || Math.hypot(x - lijn[0].x, y - lijn[0].y) >= 4)) {
        lijn.unshift({ x, y });
        if (lijn.length > 220) lijn.pop();
        laatsteStreek = tijd;
      }
    };
    const druk = (e: PointerEvent) => {
      if (e.button !== 0) return;
      if (e.target instanceof Element && e.target.closest('button,a,input,textarea,select,summary,[role="button"],[contenteditable="true"]')) return;
      wijs(e);
      const plek = { x: aanwijzer.current.x, y: aanwijzer.current.y };
      for (const d of deeltjes) { const golf = golfImpuls(d, plek); d.vx += golf.x; d.vy += golf.y; }
      schrijft = e.pointerType !== 'touch' || voorkeurRef.current.tekenen;
      if (schrijft) { lijn = [{ ...plek }]; laatsteStreek = tijd; }
    };
    const laatLos = (e: PointerEvent) => { schrijft = false; laatsteStreek = tijd; if (e.pointerType !== 'mouse') aanwijzer.current.binnen = false; };
    const uit = (e: PointerEvent) => { if (e.pointerType === 'mouse' && !schrijft) aanwijzer.current.binnen = false; };
    const rechts = (e: MouseEvent) => {
      if (e.button !== 2 || voorkeurRef.current.beweging === 'uit') return;
      const doel = e.target;
      if (doel instanceof Element && doel.closest('button,a,input,textarea,select,summary,[role="button"],[contenteditable="true"],.mail-achtergrond-instellingen')) return;
      e.preventDefault();
      const r = houder.getBoundingClientRect();
      aanwijzer.current.x = e.clientX - r.left;
      aanwijzer.current.y = e.clientY - r.top;
      aanwijzer.current.binnen = true;
      zetLens((waarde) => !waarde);
    };
    const teken = (nu: number) => {
      verzoek = requestAnimationFrame(teken);
      if (!zichtbaar || document.hidden || nu - vorig < 28) return;
      const stap = Math.min(36, nu - (vorig || nu)); vorig = nu;
      const stand = voorkeurRef.current;
      if (stand.beweging === 'uit') { k.clearRect(0, 0, breedte, hoogte); return; }
      if (vorigAantal !== effectiefAantal()) {
        deeltjes = maakDeeltjes(breedte, hoogte, effectiefAantal()); vorigAantal = deeltjes.length;
      }
      if (vorigPalet !== stand.palet) { tekens = maakTekens(stand.palet, vormen); vorigPalet = stand.palet; }
      const p = aanwijzer.current;
      if (!stand.pauze) {
        tijd += stap * .001;
        // Емблема виникає лише раз на місцеву добу; наступного дня вибираємо іншу, із новою щільністю й величиною.
        if (!logoAangevraagd && tijd >= logoNa && Object.keys(vormen).length) {
          logoAangevraagd = true;
          const vandaag = dagSleutel(new Date());
          let getoond = ''; let vorigMerk = '';
          try { getoond = localStorage.getItem(DAG) || ''; vorigMerk = localStorage.getItem(LAATSTE) || ''; } catch { /* Тимчасові дані недоступні. */ }
          if (getoond !== vandaag) {
            const mogelijk = DIENSTEN.filter((dienst) => (officieelMerk(dienst.merk) || vormen[dienst.merk]) && dienst.merk !== vorigMerk);
            const keuzes = mogelijk.length ? mogelijk : DIENSTEN.filter((dienst) => officieelMerk(dienst.merk) || vormen[dienst.merk]);
            const dienst = keuzes[Math.floor(Math.random() * keuzes.length)];
            if (dienst) void logoPunten(dienst.merk, vormen).then((punten) => {
              if (!leeft || punten.length < 18) return;
              logo = { start: tijd, duur: willekeurig(9, 14), punten, grootte: willekeurig(.7, 1.2), dichtheid: willekeurig(.7, 1) };
              try { localStorage.setItem(DAG, vandaag); localStorage.setItem(LAATSTE, dienst.merk); } catch { /* Необов'язкове сховище. */ }
            }).catch(() => undefined);
          }
        }
        const logoFase = logo ? (tijd - logo.start) / logo.duur : 2;
        const logoMeng = logo && logoFase >= 0 && logoFase <= 1 ? Math.sin(Math.PI * logoFase) ** .65 : 0;
        if (logo && logoFase > 1) logo = null;
        const schrijfMeng = lijn.length >= 2 ? begrens(schrijft ? 1 : (2.8 - (tijd - laatsteStreek)) / 2.8, 0, 1) : 0;
        if (!schrijft && schrijfMeng === 0 && lijn.length) lijn = [];
        for (let i = 0; i < deeltjes.length; i++) {
          const d = deeltjes[i];
          const doel = vloeibaarDoel(i, deeltjes.length, tijd, breedte, hoogte, d.fase);
          if (logoMeng && logo) {
            const punt = logo.punten[Math.floor((i * 137.31) % logo.punten.length)];
            const schaal = Math.min(breedte * .32, hoogte * .32, 240) * logo.grootte;
            doel.x += (breedte * .5 + punt.x * schaal - doel.x) * logoMeng;
            doel.y += (hoogte * .54 + punt.y * schaal - doel.y) * logoMeng;
          }
          if (schrijfMeng) {
            const streep = schrijfDoel(i, deeltjes.length, lijn, breedte);
            if (streep) { doel.x += (streep.x - doel.x) * schrijfMeng; doel.y += (streep.y - doel.y) * schrijfMeng; }
          }
          const x = d.x - p.x, y = d.y - p.y;
          d.vx += (doel.x - d.x) * (schrijfMeng ? .068 : .025);
          d.vy += (doel.y - d.y) * (schrijfMeng ? .068 : .025);
          const afstand = Math.hypot(x, y);
          if (p.binnen && afstand > 1 && afstand < 195 && stand.kracht > 0) {
            const factor = (1 - afstand / 195) ** 2 * stand.kracht * 3.2;
            if (stand.beweging === 'wervel') { d.vx -= y / afstand * factor; d.vy += x / afstand * factor; }
            else { d.vx -= x / afstand * factor + p.dx * factor * .05; d.vy -= y / afstand * factor + p.dy * factor * .05; }
          }
          d.vx *= .85; d.vy *= .85;
          d.x += d.vx * stap / 17; d.y += d.vy * stap / 17;
        }
        p.dx *= .76; p.dy *= .76;
      }
      k.clearRect(0, 0, breedte, hoogte);
      const palet = PALETTEN[stand.palet];
      for (let i = 0; i < 3; i++) {
        const d = deeltjes[Math.floor(i * deeltjes.length / 3)];
        const x = d?.x ?? breedte * .5;
        const y = d?.y ?? hoogte * .5;
        const radius = Math.max(breedte, hoogte) * .32;
        const g = k.createRadialGradient(x, y, 0, x, y, radius);
        g.addColorStop(0, `${palet[i]}24`); g.addColorStop(1, `${palet[i]}00`);
        k.fillStyle = g; k.fillRect(x - radius, y - radius, radius * 2, radius * 2);
      }
      const toon = (vergroting: number, middelpuntX = 0, middelpuntY = 0) => {
        if (stand.stijl === 'rust') return;
        for (let i = 0; i < deeltjes.length; i++) {
          const d = deeltjes[i];
          const x = middelpuntX + (d.x - middelpuntX) * vergroting;
          const y = middelpuntY + (d.y - middelpuntY) * vergroting;
          if (x < -45 || x > breedte + 45 || y < -45 || y > hoogte + 45) continue;
          const maat = d.grootte * vergroting;
          k.globalAlpha = d.doorzichtigheid * (.86 + Math.sin(tijd * 1.4 + d.fase) * .14);
          const logoFase = logo ? (tijd - logo.start) / logo.duur : 2;
          const logoMeng = logo && logoFase >= 0 && logoFase <= 1 ? Math.sin(Math.PI * logoFase) ** .65 : 0;
          const logoPunt = logoMeng && logo ? logo.punten[Math.floor((i * 137.31) % logo.punten.length)] : null;
          if (logoPunt && logoMeng > .25 && i % 10 < 10 * (logo?.dichtheid || 0)) {
            k.fillStyle = logoPunt.kleur;
            k.beginPath(); k.roundRect(x - maat / 2, y - maat / 2, maat, maat, Math.max(1, maat * .3)); k.fill();
            if (stand.stijl === 'tekens' && maat >= 4) { k.globalAlpha *= .35; k.drawImage(tekens[d.tint][d.soort], x - maat / 2, y - maat / 2, maat, maat); }
          } else if (stand.stijl === 'stippen') {
            k.fillStyle = palet[d.tint]; k.beginPath(); k.arc(x, y, maat * .32, 0, Math.PI * 2); k.fill();
          } else k.drawImage(tekens[d.tint][d.soort], x - maat / 2, y - maat / 2, maat, maat);
        }
        k.globalAlpha = 1;
      };
      toon(1);
      if (lensRef.current && p.binnen) {
        const radius = breedte < 600 ? 64 : 100;
        k.save();
        k.beginPath(); k.arc(p.x, p.y, radius, 0, 2 * Math.PI); k.clip();
        k.fillStyle = 'rgba(15,28,46,.9)'; k.fillRect(p.x - radius, p.y - radius, radius * 2, radius * 2);
        toon(stand.vergroting, p.x, p.y);
        k.restore();
        k.beginPath(); k.arc(p.x, p.y, radius, 0, 2 * Math.PI);
        k.strokeStyle = palet[0]; k.lineWidth = 2; k.stroke();
        k.beginPath(); k.arc(p.x, p.y, radius + 4, 0, 2 * Math.PI);
        k.strokeStyle = `${palet[1]}70`; k.lineWidth = 5; k.stroke();
      }
    };
    const waarnemer = new ResizeObserver(meet);
    waarnemer.observe(houder);
    const zichtwaarnemer = new IntersectionObserver(([waarde]) => { zichtbaar = waarde.isIntersecting; });
    zichtwaarnemer.observe(houder);
    houder.addEventListener('pointermove', wijs, { passive: true });
    houder.addEventListener('pointerdown', druk, { passive: true });
    houder.addEventListener('pointerup', laatLos);
    houder.addEventListener('pointercancel', laatLos);
    houder.addEventListener('pointerleave', uit);
    houder.addEventListener('contextmenu', rechts);
    meet(); verzoek = requestAnimationFrame(teken);
    return () => {
      leeft = false;
      cancelAnimationFrame(verzoek); waarnemer.disconnect(); zichtwaarnemer.disconnect();
      houder.removeEventListener('pointermove', wijs); houder.removeEventListener('pointerdown', druk);
      houder.removeEventListener('pointerup', laatLos); houder.removeEventListener('pointercancel', laatLos);
      houder.removeEventListener('pointerleave', uit);
      houder.removeEventListener('contextmenu', rechts);
    };
  }, []);

  const verander = (waarde: Partial<Voorkeuren>) => zetVoorkeuren((vorig) => ({ ...vorig, ...waarde }));
  return (
    <div className={'mail-achtergrond mail-achtergrond-' + plaats} data-mail-achtergrond={plaats} data-tekenen={voorkeuren.tekenen ? 'ja' : 'nee'}>
      <canvas ref={doek} aria-hidden='true' className='mail-achtergrond-doek' />
      <div className='mail-achtergrond-bediening'>
        <button type='button' ref={tandwiel} className='mail-achtergrond-tandwiel' aria-label={t('Налаштувати тло', 'Achtergrond instellen')}
          aria-expanded={instellingen} title={t('Налаштувати рухоме тло', 'Bewegende achtergrond instellen')}
          onClick={() => zetInstellingen((waarde) => !waarde)}><Settings2 size={18} aria-hidden='true' /></button>
        {instellingen ? createPortal(
          <div className='mail-achtergrond-instellingen mail-achtergrond-instellingen-portaal' style={{ top: instellingenTop, maxHeight: `calc(100dvh - ${instellingenTop + 12}px)` }} role='group' aria-label={t('Налаштування тла', 'Achtergrondinstellingen')}>
            <div className='mail-achtergrond-kop'><strong>{t('Живе тло', 'Levende achtergrond')}</strong>
              <button type='button' onClick={() => zetInstellingen(false)} aria-label={t('Закрити налаштування', 'Instellingen sluiten')}><X size={17} /></button></div>
            <label>{t('Вигляд тла', 'Achtergrondstijl')}
              <select value={voorkeuren.stijl} onChange={(e) => verander({ stijl: e.target.value as Stijl })}>
                <option value='tekens'>{t('Океан емблем', 'Oceaan van emblemen')}</option>
                <option value='stippen'>{t('Кольорові крапки', 'Gekleurde stippen')}</option>
                <option value='rust'>{t('М’яке сяйво', 'Zachte gloed')}</option>
              </select>
            </label>
            <label>{t('Рух', 'Beweging')}
              <select value={voorkeuren.beweging} onChange={(e) => verander({ beweging: e.target.value as Beweging })}>
                <option value='golven'>{t('Рідинні зграї', 'Vloeiende zwermen')}</option><option value='wervel'>{t('Вир', 'Werveling')}</option>
                <option value='aantrekken'>{t('Тяжіння', 'Aantrekking')}</option><option value='uit'>{t('Без анімації', 'Zonder animatie')}</option>
              </select>
            </label>
            <label>{t('Кольори', 'Kleuren')}
              <select value={voorkeuren.palet} onChange={(e) => verander({ palet: e.target.value as Palet })}>
                <option value='poollicht'>{t('Полярне сяйво', 'Poollicht')}</option><option value='zomer'>{t('Теплий захід', 'Warme zonsondergang')}</option>
                <option value='oceaan'>{t('Океан', 'Oceaan')}</option>
              </select>
            </label>
            <label>{t('Кількість позначок', 'Aantal tekens')} <output>{voorkeuren.aantal.toLocaleString(lang === 'uk' ? 'uk-UA' : 'nl-BE')}</output>
              <input type='range' min='300' max='2600' step='100' value={voorkeuren.aantal} onChange={(e) => verander({ aantal: Number(e.target.value) })} />
            </label>
            <label>{t('Сила взаємодії', 'Sterkte van de wisselwerking')} <output>{Math.round(voorkeuren.kracht * 100)}%</output>
              <input type='range' min='0' max='1' step='.05' value={voorkeuren.kracht} onChange={(e) => verander({ kracht: Number(e.target.value) })} />
            </label>
            <label>{t('Збільшення лінзи', 'Vergroting van de lens')} <output>×{voorkeuren.vergroting}</output>
              <input type='range' min='2' max='6' step='1' value={voorkeuren.vergroting} onChange={(e) => verander({ vergroting: Number(e.target.value) })} />
            </label>
            <div className='mail-achtergrond-acties'>
              <button type='button' onClick={() => verander({ pauze: !voorkeuren.pauze })}>
                {voorkeuren.pauze ? <Play size={16} /> : <Pause size={16} />}
                {voorkeuren.pauze ? t('Відновити рух', 'Beweging hervatten') : t('Призупинити', 'Pauzeren')}
              </button>
              <button type='button' aria-pressed={lens} onClick={() => zetLens((waarde) => !waarde)}><ZoomIn size={16} />{t('Лінза', 'Lens')}</button>
              <button type='button' aria-pressed={voorkeuren.tekenen} onClick={() => verander({ tekenen: !voorkeuren.tekenen })}><PenLine size={16} />{t('Малювання пальцем', 'Tekenen met de vinger')}</button>
            </div>
            <p>{t('Зграї утворюють мінливі рідинні форми. Дотик розсіює значки, рух пальця їх притягує. Утримуйте кнопку миші, щоб писати значками. Малювання пальцем можна ввімкнути тут; під час нього прокручування сторінки призупиняється. Зрідка, але не частіше разу на день, зграя набуває обрисів емблеми поштової служби. Права кнопка миші вмикає лінзу.', 'Zwermen vormen steeds veranderende vloeibare figuren. Een tik verspreidt tekens, een beweging trekt ze aan. Houd de muisknop vast om met tekens te schrijven. Tekenen met de vinger schakelt u hier in; tijdens het tekenen wordt het bladeren onderbroken. Hoogstens eenmaal per dag vormt de zwerm kort een embleem van een maildienst. De rechtermuisknop opent de lens.')}</p>
          </div>, document.body
        ) : null}
      </div>
    </div>
  );
}
