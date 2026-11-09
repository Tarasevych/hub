// Het officiële Telegram-logo (telegram.org/img/t_logo.svg: blauwe cirkel met verloop en het witte papieren vliegtuigje),
// zodat gebruikers de methode meteen herkennen. Niet nagetekend of aangepast; alleen in maat gezet.
import { useId } from 'react';

export default function TelegramLogo({ maat = 24, titel }: { maat?: number; titel?: string }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  return (
    <svg viewBox='0 0 240 240' width={maat} height={maat} style={{ width: maat, height: maat, flex: 'none' }} role={titel ? 'img' : undefined} aria-hidden={titel ? undefined : true} aria-label={titel} data-merk-officieel='telegram'>
      <defs>
        <linearGradient id={`${id}a`} x1='.667' x2='.417' y1='.167' y2='.75'><stop offset='0' stopColor='#37aee2' /><stop offset='1' stopColor='#1e96c8' /></linearGradient>
        <linearGradient id={`${id}b`} x1='.66' x2='.851' y1='.437' y2='.802'><stop offset='0' stopColor='#eff7fc' /><stop offset='1' stopColor='#fff' /></linearGradient>
      </defs>
      <circle cx='120' cy='120' r='120' fill={`url(#${id}a)`} />
      <path fill='#c8daea' d='M98 175c-3.888 0-3.227-1.468-4.568-5.17L82 132.207 170 80' />
      <path fill='#a9c9dd' d='M98 175c3 0 4.325-1.372 6-3l16-15.558-19.958-12.035' />
      <path fill={`url(#${id}b)`} d='M100.04 144.41l48.36 35.729c5.519 3.045 9.501 1.468 10.876-5.123l19.685-92.763c2.015-8.08-3.08-11.746-8.36-9.349l-115.59 44.571c-7.89 3.165-7.843 7.567-1.438 9.528l29.663 9.259 68.673-43.325c3.242-1.966 6.218-.91 3.776 1.258' />
    </svg>
  );
}
