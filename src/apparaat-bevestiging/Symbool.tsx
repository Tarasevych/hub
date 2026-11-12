// APPARAAT-001 — één symbool op het scherm: pictogram (lucide) met naam eronder, of een groot cijfer/letter. Op A en B exact
// dezelfde weergave; op A krijgt het uitgelichte symbool een ring en het woord «цей / deze».
import type { ComponentType } from 'react';
import { Anchor, Bike, Bird, Camera, Car, Cat, Cloud, Coffee, Dog, Fish, Flower2, Guitar, Heart, Leaf, Moon, Mountain, Plane, Rocket, Ship, Star, Sun, Tent, TreePine, Umbrella } from 'lucide-react';
import { symbool, type VasteSoort } from '../../shared/apparaat-bevestiging/symbolen';

type Icoon = ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' }>;
const ICONEN: Record<string, Icoon> = { Anchor, Bike, Bird, Camera, Car, Cat, Cloud, Coffee, Dog, Fish, Flower2, Guitar, Heart, Leaf, Moon, Mountain, Plane, Rocket, Ship, Star, Sun, Tent, TreePine, Umbrella };

export type SymboolProps = { soort: VasteSoort; index: number; lang: 'uk' | 'nl'; uitgelicht?: boolean; klein?: boolean };
/** Puur weergave (geen knop): de knop eromheen bepaalt wat een tik doet. */
export default function Symbool({ soort, index, lang, uitgelicht = false, klein = false }: SymboolProps) {
  const s = symbool(soort, index, lang);
  if (!s) return null;
  const I = s.icoon ? ICONEN[s.icoon] : null;
  return <span className={`apb-symbool${uitgelicht ? ' is-uitgelicht' : ''}${klein ? ' is-klein' : ''}`} data-soort={soort} data-index={index} aria-label={s.tekst}>
    {I ? <I className='apb-symbool-icoon' aria-hidden='true' /> : <span className='apb-symbool-teken' aria-hidden='true'>{s.tekst}</span>}
    {I ? <span className='apb-symbool-naam'>{s.tekst}</span> : null}
  </span>;
}
