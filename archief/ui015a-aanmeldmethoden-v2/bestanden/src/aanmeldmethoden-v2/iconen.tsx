// UI-015: logo's van aanbieders (eigen SVG-bestanden in public/aanmeldmethoden/, officiële merkkleuren, NIET getint door het thema:
// ze staan altijd op een witte tegel) en semantische iconen voor passkey/TOTP/herstel/kluis/toegangscodes.
import { Fingerprint, KeyRound, LifeBuoy, LockKeyhole, Smartphone, Ticket, ShieldCheck } from 'lucide-react';

const LOGO: Record<string, string> = {
  google: '/aanmeldmethoden/google.svg', microsoft: '/aanmeldmethoden/microsoft.svg', apple: '/aanmeldmethoden/apple.svg',
  discord: '/aanmeldmethoden/discord.svg', telegram: '/aanmeldmethoden/telegram.svg',
};
const SEMANTISCH: Record<string, { el: typeof KeyRound; tint: string }> = {
  wachtwoord: { el: KeyRound, tint: 'amber' }, passkey: { el: Fingerprint, tint: 'violet' }, totp: { el: Smartphone, tint: 'blauw' },
  herstel: { el: LifeBuoy, tint: 'groen' }, kluis: { el: LockKeyhole, tint: 'indigo' }, toegangscode: { el: Ticket, tint: 'roze' },
};

export function MethodeIcoon({ icoon, groot = false }: { icoon: string; groot?: boolean }) {
  const logo = LOGO[icoon];
  const cls = `amv2-icoon${groot ? ' groot' : ''}`;
  if (logo) return <span className={`${cls} logo`} aria-hidden='true'><img src={logo} alt='' width={28} height={28} draggable={false} /></span>;
  const s = SEMANTISCH[icoon] || { el: ShieldCheck, tint: 'blauw' };
  const El = s.el;
  return <span className={`${cls} tint-${s.tint}`} aria-hidden='true'><El /></span>;
}
