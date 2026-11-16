// Het officiële Telegram-logo (blauwe cirkel met het witte papieren vliegtuigje).
//
// REESTR-LOGO-001 (16.11.2026): tot nu toe tekende dit bestand een EIGEN kopie van het logo (eigen paden en verlopen), naast de
// vorm in de grote merkentabel, de serverpagina van de bevestiging en de nagetekende versie in «Макет». Nu komt het ene bestand uit
// het merkregister (src/merk/officieel/telegram.svg via shared/merk-direct.ts — @iconify-json/logos, CC0) en tekent <Merk> het.
// Zo volgt ook een EIGEN logo dat de gebruiker voor Telegram koos. De naam van dit component blijft, zodat de aanroepers niets
// hoeven te veranderen. Логотип Telegram тепер береться з єдиного реєстру; власний логотип користувача теж діє тут.
import Merk from '../merk/Merk';

export default function TelegramLogo({ maat = 24, titel }: { maat?: number; titel?: string }) {
  return <Merk merk='telegram' naam='Telegram' vorm='gliefje' maat={maat} titel={titel} className='tga-logo' />;
}
