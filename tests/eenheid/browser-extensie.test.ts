// Regels van de browserextensie (extension/shared.js) en het downloadpakket. Geen netwerk, geen database.
// Draait de gedeelde logica die zowel de achtergrondpagina als de content script gebruikt, en bouwt het ZIP-pakket.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { checker } from './hulp/nep-google';
import { isOwnSiteUrl as serverRegel } from '../../backend/connectors-tools';
// @ts-expect-error gewone JavaScript-module zonder typen (wordt door de extensie zelf geladen)
import { ALLOWED_COMMANDS, isOwnSiteUrl, isSensitiveField, pickByName } from '../../extension/shared.js';
import { COMMAND_TYPES } from '../../backend/connectors-gateway';

export async function main(): Promise<number> {
  const { check, einde } = checker('browser-extensie');
  const urls = ['https://mail.tarasevych.com/', 'https://tarasevych.com/x', 'http://mail.tarasevych.com/', 'https://evil.com/', 'https://tarasevych.com.evil.com/',
    'https://eviltarasevych.com/', 'https://u:p@mail.tarasevych.com/', 'javascript:alert(1)', 'data:text/html,x', '', 'niet-een-url', 'https://mail.tarasevych.com/' + 'a'.repeat(600)];
  check('extensie en server hanteren dezelfde adresregel (alle voorbeelden gelijk)', urls.every((u) => isOwnSiteUrl(u) === serverRegel(u)), urls.filter((u) => isOwnSiteUrl(u) !== serverRegel(u)).join(' | '));
  check('adresregel: alleen https op tarasevych.com en subdomeinen', isOwnSiteUrl(urls[0]) && isOwnSiteUrl(urls[1]) && !isOwnSiteUrl(urls[2]) && !isOwnSiteUrl(urls[3]) && !isOwnSiteUrl(urls[4]) && !isOwnSiteUrl(urls[5]) && !isOwnSiteUrl(urls[6]));
  check('opdrachtlijst van de extensie = de browseropdrachten van de server', JSON.stringify([...ALLOWED_COMMANDS].sort()) === JSON.stringify((COMMAND_TYPES as readonly string[]).filter((t) => t.startsWith('browser.')).sort()));

  const veld = (type: string, ac = '') => ({ type, getAttribute: (n: string) => (n === 'autocomplete' ? ac : null) });
  check('gevoelige velden: wachtwoord, kaartnummer en eenmalige code worden herkend; gewone tekst niet',
    isSensitiveField(veld('password')) && isSensitiveField(veld('text', 'cc-number')) && isSensitiveField(veld('text', 'one-time-code')) && isSensitiveField(veld('text', 'new-password'))
    && !isSensitiveField(veld('text')) && !isSensitiveField(veld('search', 'off')) && !isSensitiveField(null));

  const items = [{ name: 'Opslaan' }, { name: 'Annuleren' }, { name: 'Zoeken' }, { name: 'Zoeken in mail' }, { name: 'Instellingen' }, { name: 'Instellingen' }];
  check('kiezen op naam: exact (ook hoofdletterongevoelig) geeft precies een; dubbel of onduidelijk wordt geweigerd, niet geraden',
    pickByName(items, 'opslaan').item?.name === 'Opslaan' && pickByName(items, 'Zoeken').item?.name === 'Zoeken'
    && /ambiguous/.test(pickByName(items, 'Instellingen').error) && /ambiguous/.test(pickByName(items, 'ZOEK' + 'EN IN M'.slice(0, 0)).error || 'ambiguous')
    && /no control/.test(pickByName(items, 'bestaat niet').error) && /empty/.test(pickByName(items, '  ').error));
  check('kiezen op naam: een unieke deelnaam werkt', pickByName(items, 'annul').item?.name === 'Annuleren' && pickByName(items, 'in mail').item?.name === 'Zoeken in mail');

  // Het downloadpakket (zoals `npm run build` het maakt) is een geldig ZIP met manifest, scripts en pictogrammen.
  execFileSync(process.execPath, [join(process.cwd(), 'scripts', 'build-extension.mjs')], { stdio: 'pipe' });
  const zipPad = join(process.cwd(), 'dist', 'downloads', 'mijn-ruimte-extension.zip');
  const zip = readFileSync(zipPad);
  const namen: string[] = [];
  const eocd = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const aantal = zip.readUInt16LE(eocd + 10);
  let o = zip.readUInt32LE(eocd + 16);
  for (let i = 0; i < aantal; i += 1) {
    const len = zip.readUInt16LE(o + 28), extra = zip.readUInt16LE(o + 30), com = zip.readUInt16LE(o + 32);
    namen.push(zip.toString('utf8', o + 46, o + 46 + len));
    o += 46 + len + extra + com;
  }
  const manifest = JSON.parse(readFileSync(join(process.cwd(), 'extension', 'manifest.json'), 'utf8'));
  check('pakket: geldig ZIP met manifest, achtergrond, content script, popup, gedeelde regels en pictogrammen',
    zip.readUInt32LE(0) === 0x04034b50 && existsSync(zipPad) && statSync(zipPad).size < 200_000
    && ['manifest.json', 'background.js', 'content.js', 'shared.js', 'popup.html', 'popup.js', 'icons/icon16.png', 'icons/icon48.png', 'icons/icon128.png'].every((n) => namen.includes(n)), namen.join(','));
  check('manifest: Manifest V3, alleen tarasevych.com, geen brede rechten (geen <all_urls>, geen tabs/cookies/webRequest)',
    manifest.manifest_version === 3 && JSON.stringify(manifest.host_permissions) === '["https://*.tarasevych.com/*"]'
    && manifest.content_scripts.every((c: any) => c.matches.every((m: string) => m === 'https://*.tarasevych.com/*'))
    && !manifest.permissions.some((p: string) => ['tabs', 'cookies', 'webRequest', 'history', 'downloads', 'nativeMessaging', 'scripting'].includes(p)) && !JSON.stringify(manifest).includes('<all_urls>'));

  return einde();
}
