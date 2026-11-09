// MAILBG-001 · Спільне рухоме тло входу та вибору поштової служби.
// Справжні кнопки й авторизація залишаються поза полотном і не змінюються.
import { useEffect, useRef, useState } from 'react';
import { Pause, Play, Settings2, X, ZoomIn } from 'lucide-react';
import { MAIL_AANBIEDERS } from '../../shared/mail-aanbieders';
import { officieelMerk, laadOfficieel } from '../merk/merk-register';
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
const STANDAARD: Voorkeuren = { stijl: 'tekens', beweging: 'golven', palet: 'poollicht', aantal: 1400, kracht: .65, vergroting: 4, pauze: false };
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
    };
  } catch { return STANDAARD; }
}

function maakDeeltjes(breedte: number, hoogte: number, aantal: number): Deeltje[] {
  const kolommen = Math.max(1, Math.ceil(Math.sqrt(aantal * breedte / Math.max(1, hoogte))));
  const rijen = Math.ceil(aantal / kolommen);
  return Array.from({ length: aantal }, (_, i) => {
    const band = i < aantal * .58;
    const laag = i % 3;
    const deel = Math.random();
    const basisX = band ? breedte * (.19 + deel * .94) : ((i % kolommen) + willekeurig(.2, .8)) / kolommen * breedte;
    const basisY = band
      ? hoogte * (.52 + Math.sin(deel * 10.4 + laag * 1.6) * .12) + willekeurig(-.09, .09) * hoogte
      : (Math.floor(i / kolommen) + willekeurig(.2, .8)) / rijen * hoogte;
    return {
      x: basisX, y: basisY, basisX, basisY, vx: 0, vy: 0,
      soort: i % Math.max(1, DIENSTEN.length), tint: (i + laag) % 6,
      grootte: band ? willekeurig(4.2, 8.4) : willekeurig(2.7, 5.8),
      fase: willekeurig(0, Math.PI * 2), doorzichtigheid: band ? willekeurig(.36, .76) : willekeurig(.16, .4),
    };
  });
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
  const [lens, zetLens] = useState(false);
  const doek = useRef<HTMLCanvasElement>(null);
  const voorkeurRef = useRef(voorkeuren);
  const lensRef = useRef(lens);
  const aanwijzer = useRef({ x: 0, y: 0, dx: 0, dy: 0, binnen: false });
  const t = (uk: string, nl: string) => lang === 'uk' ? uk : nl;

  useEffect(() => { voorkeurRef.current = voorkeuren; try { localStorage.setItem(SLEUTEL, JSON.stringify(voorkeuren)); } catch { /* Privémodus. */ } }, [voorkeuren]);
  useEffect(() => { lensRef.current = lens; }, [lens]);

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
      if (e.pointerType !== 'mouse') return;
      const r = houder.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      const p = aanwijzer.current;
      p.dx = begrens(x - p.x, -30, 30); p.dy = begrens(y - p.y, -30, 30);
      p.x = x; p.y = y; p.binnen = x >= 0 && x <= breedte && y >= 0 && y <= hoogte;
    };
    const uit = () => { aanwijzer.current.binnen = false; };
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
        for (const d of deeltjes) {
          const x = d.x - p.x, y = d.y - p.y;
          const driftX = Math.sin(d.basisY * .019 + tijd * .62 + d.fase) * 10;
          const driftY = Math.cos(d.basisX * .012 + tijd * .85 + d.fase) * 13;
          d.vx += (d.basisX + driftX - d.x) * .029;
          d.vy += (d.basisY + driftY - d.y) * .029;
          const afstand = Math.hypot(x, y);
          if (p.binnen && afstand > 1 && afstand < 165 && stand.kracht > 0) {
            const factor = (1 - afstand / 165) ** 2 * stand.kracht * 1.5;
            if (stand.beweging === 'wervel') { d.vx -= y / afstand * factor; d.vy += x / afstand * factor; }
            else if (stand.beweging === 'aantrekken') { d.vx -= x / afstand * factor; d.vy -= y / afstand * factor; }
            else { d.vx += x / afstand * factor + p.dx * factor * .025; d.vy += y / afstand * factor + p.dy * factor * .025; }
          }
          d.vx *= .9; d.vy *= .9;
          d.x += d.vx * stap / 17; d.y += d.vy * stap / 17;
        }
        p.dx *= .76; p.dy *= .76;
      }
      k.clearRect(0, 0, breedte, hoogte);
      const palet = PALETTEN[stand.palet];
      for (let i = 0; i < 3; i++) {
        const x = breedte * (.28 + i * .25 + Math.sin(tijd * .24 + i) * .035);
        const y = hoogte * (.4 + i * .1 + Math.cos(tijd * .19 + i) * .04);
        const radius = Math.max(breedte, hoogte) * .32;
        const g = k.createRadialGradient(x, y, 0, x, y, radius);
        g.addColorStop(0, `${palet[i]}24`); g.addColorStop(1, `${palet[i]}00`);
        k.fillStyle = g; k.fillRect(x - radius, y - radius, radius * 2, radius * 2);
      }
      const toon = (vergroting: number, middelpuntX = 0, middelpuntY = 0) => {
        if (stand.stijl === 'rust') return;
        for (const d of deeltjes) {
          const x = middelpuntX + (d.x - middelpuntX) * vergroting;
          const y = middelpuntY + (d.y - middelpuntY) * vergroting;
          if (x < -45 || x > breedte + 45 || y < -45 || y > hoogte + 45) continue;
          const maat = d.grootte * vergroting;
          k.globalAlpha = d.doorzichtigheid * (.86 + Math.sin(tijd * 1.4 + d.fase) * .14);
          if (stand.stijl === 'stippen') {
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
    houder.addEventListener('pointerleave', uit);
    houder.addEventListener('contextmenu', rechts);
    meet(); verzoek = requestAnimationFrame(teken);
    return () => {
      leeft = false;
      cancelAnimationFrame(verzoek); waarnemer.disconnect(); zichtwaarnemer.disconnect();
      houder.removeEventListener('pointermove', wijs); houder.removeEventListener('pointerleave', uit);
      houder.removeEventListener('contextmenu', rechts);
    };
  }, []);

  const verander = (waarde: Partial<Voorkeuren>) => zetVoorkeuren((vorig) => ({ ...vorig, ...waarde }));
  return (
    <div className={'mail-achtergrond mail-achtergrond-' + plaats} data-mail-achtergrond={plaats}>
      <canvas ref={doek} aria-hidden='true' className='mail-achtergrond-doek' />
      <div className='mail-achtergrond-bediening'>
        <button type='button' className='mail-achtergrond-tandwiel' aria-label={t('Налаштувати тло', 'Achtergrond instellen')}
          aria-expanded={instellingen} title={t('Налаштувати рухоме тло', 'Bewegende achtergrond instellen')}
          onClick={() => zetInstellingen((waarde) => !waarde)}><Settings2 size={18} aria-hidden='true' /></button>
        {instellingen ? (
          <div className='mail-achtergrond-instellingen' role='group' aria-label={t('Налаштування тла', 'Achtergrondinstellingen')}>
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
                <option value='golven'>{t('Хвилі', 'Golven')}</option><option value='wervel'>{t('Вир', 'Werveling')}</option>
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
            </div>
            <p>{t('Натисніть правою кнопкою на тлі, щоб увімкнути або вимкнути лінзу.', 'Klik met de rechtermuisknop op de achtergrond om de lens aan of uit te zetten.')}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
