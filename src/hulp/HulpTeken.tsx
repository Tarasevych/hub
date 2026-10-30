// Het teken «?» in de hulpknop (29.10.2026). Was een letter «?» in een rand: de letter heeft een eigen boven- en onderruimte per
// lettertype, dus het teken stond naast/onder het midden van de cirkel (schermafbeelding van de eigenaar, admin.*/toegang).
// Nu een getekend teken in een vierkant van 24×24 waarvan de inktvlakken exact rond (12,12) liggen → altijd in het midden,
// in elk lettertype en thema. Kleur = currentColor. Alleen decoratief: de knop zelf heeft de aria-label.
export default function HulpTeken() {
  return <svg className='hulp-teken' viewBox='0 0 24 24' width='14' height='14' aria-hidden='true' focusable='false'
    fill='none' stroke='currentColor' strokeWidth='2.6' strokeLinecap='round' strokeLinejoin='round'>
    <path d='M8.6 8.6a3.4 3.4 0 0 1 6.6 1.1c0 2.3-3.2 2.9-3.2 4.7' />
    <circle cx='12' cy='18.4' r='0.6' fill='currentColor' />
  </svg>;
}
