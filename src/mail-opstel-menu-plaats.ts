// Waar een uitklapmenu van de editorbalk («Стиль», «Список», «⋯») op het scherm komt — zuiver, met tests
// (tests/eenheid/mail-opstellen-mobiel-20261021.test.ts).
//
// De klacht (telefoon, 21.10.2026): het menu «ховається під робочу поверхню». Oorzaak: het menu stond `position:absolute` in de
// balk, en die balk scrolt op de telefoon horizontaal (`overflow-x:auto` ⇒ ook `overflow-y` knipt), binnen een editor en een
// venster met `overflow:hidden`. Wat buiten de balk viel, was weg. Nu rendert het menu in een portal onder <body>
// (`position:fixed`, eigen laag boven het venster) en rekent deze functie de plek uit: onder de knop, of erboven als daar
// meer ruimte is; altijd binnen het zichtbare deel van het scherm (ook met het schermtoetsenbord open: visualViewport).

export type Rechthoek = { left: number; top: number; right: number; bottom: number };
export type Zichtbaar = { x: number; y: number; w: number; h: number };
export type MenuPlek = { left: number; top: number; maxHoogte: number; boven: boolean };

export const MENU_MARGE = 8;
export const MENU_AFSTAND = 6;
/** Kleiner dan dit wordt een menu onbruikbaar; dan liever over de knop heen dan nog kleiner. */
export const MENU_MIN_HOOGTE = 140;

export function menuPlaats(knop: Rechthoek, menu: { w: number; h: number }, vp: Zichtbaar, uitlijning: 'links' | 'rechts' = 'links'): MenuPlek {
  const m = MENU_MARGE, g = MENU_AFSTAND;
  const links = vp.x + m, rechts = vp.x + vp.w - m, boven = vp.y + m, onder = vp.y + vp.h - m;
  const breedte = Math.min(menu.w, rechts - links);
  let left = uitlijning === 'rechts' ? knop.right - breedte : knop.left;
  left = Math.max(links, Math.min(left, rechts - breedte));
  const ruimteOnder = onder - (knop.bottom + g), ruimteBoven = (knop.top - g) - boven;
  const naarBoven = menu.h > ruimteOnder && ruimteBoven > ruimteOnder;
  let maxHoogte = Math.max(MENU_MIN_HOOGTE, Math.floor(naarBoven ? ruimteBoven : ruimteOnder));
  maxHoogte = Math.min(maxHoogte, onder - boven);
  const hoogte = Math.min(menu.h, maxHoogte);
  let top = naarBoven ? knop.top - g - hoogte : knop.bottom + g;
  top = Math.max(boven, Math.min(top, onder - hoogte));
  return { left: Math.round(left), top: Math.round(top), maxHoogte, boven: naarBoven };
}

/**
 * De laag van het venster waarin de knop staat (+5), zodat het menu er altijd boven ligt — nooit lager dan 1300.
 * +5 en niet +10: vensters van de gezamenlijke stapel (src/platform/vensters.tsx) liggen 10 uit elkaar; met +10 kwam het menu
 * op exact de laag van het volgende venster en besliste de DOM-volgorde (21.10.2026, злитий стенд).
 */
export function laagBoven(el: Element | null): number {
  let z = 0;
  for (let n: Element | null = el; n && n !== document.documentElement; n = n.parentElement) {
    const v = Number.parseInt(getComputedStyle(n).zIndex, 10);
    if (Number.isFinite(v) && v > z) z = v;
  }
  // Ook boven het dok van de vensters (VENSTER_BASIS + n·10 + 5): op de telefoon lag het dok over de onderste menu-items.
  const dok = document.querySelector('.venster-dok');
  const dz = dok ? Number.parseInt(getComputedStyle(dok).zIndex, 10) : Number.NaN;
  return Math.max(1300, z + 5, Number.isFinite(dz) ? dz + 1 : 0);
}
