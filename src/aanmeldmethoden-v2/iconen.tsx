// Віха M2 (UI-015A, REESTR-LOGO-001): знаки брендів постачальників входу беруться виключно з єдиного реєстру src/merk/
// (без копій SVG у public/), а предметні способи захисту відображаються семантичними піктограмами lucide-react.
import { Fingerprint, KeyRound, LifeBuoy, LockKeyhole, ShieldCheck, Smartphone, Ticket } from 'lucide-react';
import MethodeMerk from '../merk/MethodeMerk';

const MERK_NAMEN: Record<string, string> = {
  google: 'Google',
  microsoft: 'Microsoft',
  apple: 'Apple',
  discord: 'Discord',
  telegram: 'Telegram',
  whatsapp: 'WhatsApp',
};

export function MethodeIcoon({ icoon, groot }: { icoon: string; groot?: boolean }) {
  const merkNaam = MERK_NAMEN[icoon];
  if (merkNaam) {
    return (
      <span className={`amv2-icoon logo${groot ? ' groot' : ''}`} aria-hidden='true'>
        <MethodeMerk merk={icoon} naam={merkNaam} maat={groot ? 28 : 24} />
      </span>
    );
  }
  const [tint, Comp] = (() => {
    switch (icoon) {
      case 'wachtwoord':
        return ['tint-blauw', KeyRound] as const;
      case 'passkey':
        return ['tint-violet', Fingerprint] as const;
      case 'totp':
        return ['tint-groen', Smartphone] as const;
      case 'herstel':
        return ['tint-amber', LifeBuoy] as const;
      case 'kluis':
        return ['tint-indigo', LockKeyhole] as const;
      case 'toegangscode':
        return ['tint-roze', Ticket] as const;
      default:
        return ['tint-blauw', ShieldCheck] as const;
    }
  })();
  return (
    <span className={`amv2-icoon ${tint}${groot ? ' groot' : ''}`} aria-hidden='true'>
      <Comp />
    </span>
  );
}
