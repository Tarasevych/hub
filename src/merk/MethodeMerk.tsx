// TELEGRAM-004 (16.11.2026): знак способу входу — один компонент для сторінки входу й для налаштувань.
// Logo van een aanmeldmethode (Google, Microsoft, Apple, Discord, Telegram …).
//
// REESTR-LOGO-001 (16.11.2026): Discord stond alleen in de grote tabel (src/merk/merk-logos.ts, ±43 kB gzip), en dit component
// haalde die hele tabel op voor ÉÉN logo. Nu heeft Discord — net als Telegram — een officieel bestand in het register
// (src/merk/officieel/discord.svg) en tekent <Merk> het zelf; de aparte laadweg en de tweede kopie zijn weg. Ook een EIGEN logo
// dat de gebruiker voor zo'n merk koos, verschijnt hier. Знак способу входу тепер повністю з єдиного реєстру.
import type { ReactNode } from 'react';
import Merk from './Merk';

export default function MethodeMerk({ merk, naam, maat = 24, terugval }: { merk: string; naam: string; maat?: number; terugval?: ReactNode }) {
  return <Merk merk={merk} naam={naam} vorm='gliefje' maat={maat} {...(terugval !== undefined ? { terugval } : {})} />;
}
