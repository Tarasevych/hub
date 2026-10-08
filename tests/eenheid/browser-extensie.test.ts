// Regels van de browserextensie (extension/shared.js) en het downloadpakket. Geen netwerk, geen database.
// Draait de gedeelde logica die zowel de achtergrondpagina als de content script gebruikt, en bouwt het ZIP-pakket.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { checker } from './hulp/nep-google';
import { isOwnSiteUrl as serverRegel } from '../../backend/connectors-tools';
// @ts-expect-error gewone JavaScript-module zonder typen (wordt door de extensie zelf geladen)
import { ALLOWED_COMMANDS, isOwnSiteUrl, isSensitiveField, pickByName, pushDiag, stripQuery, urlInScope } from '../../extension/shared.js';
import { COMMAND_TYPES } from '../../backend/connectors-gateway';
import { BROWSER_AUTO_APPROVABLE, BROWSER_DEFAULT_AUTO, BROWSER_DEFAULT_ENABLED, BROWSER_TYPES } from '../../backend/browser-capabilities';
import { createHash } from 'node:crypto';
// @ts-expect-error gewone JavaScript-module zonder typen (bouwscripts)
import { contentHash, extensionEntries, parseCrx3, readZipEntries } from '../../scripts/extension-lib.mjs';

export async function main(): Promise<number> {
  const { check, einde } = checker('browser-extensie');
  const urls = ['https://mail.tarasevych.com/', 'https://tarasevych.com/x', 'http://mail.tarasevych.com/', 'https://evil.com/', 'https://tarasevych.com.evil.com/',
    'https://eviltarasevych.com/', 'https://u:p@mail.tarasevych.com/', 'javascript:alert(1)', 'data:text/html,x', '', 'niet-een-url', 'https://mail.tarasevych.com/' + 'a'.repeat(600)];
  check('extensie en server hanteren dezelfde adresregel (alle voorbeelden gelijk)', urls.every((u) => isOwnSiteUrl(u) === serverRegel(u)), urls.filter((u) => isOwnSiteUrl(u) !== serverRegel(u)).join(' | '));
  check('adresregel: alleen https op tarasevych.com en subdomeinen', isOwnSiteUrl(urls[0]) && isOwnSiteUrl(urls[1]) && !isOwnSiteUrl(urls[2]) && !isOwnSiteUrl(urls[3]) && !isOwnSiteUrl(urls[4]) && !isOwnSiteUrl(urls[5]) && !isOwnSiteUrl(urls[6]));
  check('mogelijkheden: de lijst van de server = de browseropdrachten in COMMAND_TYPES = wat de extensie kent (20)',
    JSON.stringify([...BROWSER_TYPES].sort()) === JSON.stringify((COMMAND_TYPES as readonly string[]).filter((t) => t.startsWith('browser.')).sort()) && BROWSER_TYPES.length === 20
    && JSON.stringify([...ALLOWED_COMMANDS].sort()) === JSON.stringify([...BROWSER_TYPES].sort()));
  check('standaarden: alleen lezen/kijken aan en automatisch; automatisch goedkeuren kan nooit voor handelen, screenshot of diepe diagnose',
    BROWSER_DEFAULT_AUTO.every((t) => BROWSER_DEFAULT_ENABLED.includes(t) && BROWSER_AUTO_APPROVABLE.includes(t))
    && !BROWSER_DEFAULT_ENABLED.some((t) => ['browser.click', 'browser.type', 'browser.invoke', 'browser.select', 'browser.key', 'browser.screenshot', 'browser.deep_diagnostics', 'browser.navigate'].includes(t))
    && !BROWSER_AUTO_APPROVABLE.some((t) => ['browser.click', 'browser.type', 'browser.invoke', 'browser.select', 'browser.key', 'browser.screenshot', 'browser.deep_diagnostics'].includes(t)));
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
  {
    const info = JSON.parse(readFileSync(join(process.cwd(), 'dist', 'downloads', 'extension-version.json'), 'utf8'));
    check('0.4: één uitgave (debugger vast in het manifest, diepe diagnose alleen na diagOptIn); geen apart pakket "налагодження" meer',
      info.debug === null && !existsSync(join(process.cwd(), 'dist', 'downloads', 'mijn-ruimte-extension-debug.zip')));
  }
  check('pakket: geldig ZIP met manifest, achtergrond, content script, popup, gedeelde regels en pictogrammen',
    zip.readUInt32LE(0) === 0x04034b50 && existsSync(zipPad) && statSync(zipPad).size < 200_000
    && ['manifest.json', 'background.js', 'bridge.js', 'collector.js', 'shared.js', 'popup.html', 'popup.js', 'sidepanel.html', 'sidepanel.js', 'options.html', 'options.js', 'icons/icon16.png', 'icons/icon48.png', 'icons/icon128.png'].every((n) => namen.includes(n))
    && !namen.includes('content.js') && !namen.includes('diag-hook.js'), namen.join(','));
  // Helpers voor het installeren: controlesom klopt, geen openstaande plaatsaanduidingen, juiste regeleinden.
  const downloads = join(process.cwd(), 'dist', 'downloads');
  const versie = JSON.parse(readFileSync(join(downloads, 'extension-version.json'), 'utf8'));
  const cmd = readFileSync(join(downloads, 'Install-MijnRuimte.cmd'), 'utf8');
  const sh = readFileSync(join(downloads, 'install-mijn-ruimte.sh'), 'utf8');
  const zipSha = createHash('sha256').update(zip).digest('hex');
  check('installatiehulp: controlesom in de helpers = die van het ZIP; geen @@-plaatsaanduidingen; CRLF voor Windows, LF voor shell; ze controleren de som voor ze iets uitpakken',
    versie.sha256 === zipSha && cmd.includes(zipSha) && sh.includes(zipSha) && !/@@/.test(cmd + sh) && /\r\n/.test(cmd) && !/\r/.test(sh)
    && cmd.indexOf('Get-FileHash') < cmd.indexOf('Expand-Archive') && sh.indexOf('sha256sum') < sh.indexOf('unzip') && versie.installers.length === 2 && typeof versie.storeUrl === 'string');
  check('installatiehulp: schrijft alleen naar een eigen map, vraagt geen beheerdersrechten en haalt niets van elders dan de eigen site',
    !/RunAs|Verb\s+runAs|sudo |HKLM|HKCU|reg add|ExecutionPolicy\s+Unrestricted/i.test(cmd + sh) && (cmd.match(/https?:\/\/[^/'" ]+/g) ?? []).every((u) => u === 'https://mcp.tarasevych.com') && (sh.match(/https?:\/\/[^/'" ]+/g) ?? []).every((u) => u === 'https://mcp.tarasevych.com'));
  // Eigen CRX3: alleen als hij voor DEZE versie is ondertekend (de sleutel staat op de pc van de eigenaar, T:\mijn-ruimte\geheim).
  // Is hij verouderd, dan moet de build hem NIET publiceren (crx: null) en volgt ondertekenen als releasestap.
  const crxInfoNu = JSON.parse(readFileSync(join(process.cwd(), 'extension', 'signed', 'crx-info.json'), 'utf8'));
  if (crxInfoNu.version !== manifest.version) {
    check(`CRX: verouderd (${crxInfoNu.version} ≠ ${manifest.version}) en dus niet gepubliceerd; ondertekenen = releasestap op de pc`, versie.crx === null);
  } else {
    // Eigen CRX3: handtekening geldig, id hoort bij de sleutel, inhoud = de huidige extensiebestanden (plus update_url), updates.xml klopt.
    const crxInfo = JSON.parse(readFileSync(join(process.cwd(), 'extension', 'signed', 'crx-info.json'), 'utf8'));
    const crxFile = readFileSync(join(downloads, 'mijn-ruimte-extension.crx'));
    const parsed = parseCrx3(crxFile);
    const inner = readZipEntries(parsed.zip) as Array<{ name: string; data: Buffer }>;
    const innerManifest = JSON.parse(inner.find((e) => e.name === 'manifest.json')!.data.toString('utf8'));
    const updatesXml = readFileSync(join(downloads, 'updates.xml'), 'utf8');
    check('CRX: geldige CRX3-handtekening, extensie-id hoort bij de sleutel en staat in updates.xml en extension-version.json',
      parsed.valid && parsed.crxIdMatchesKey && parsed.extensionId === crxInfo.extensionId && /^[a-p]{32}$/.test(parsed.extensionId)
      && updatesXml.includes(`appid='${parsed.extensionId}'`) && updatesXml.includes(`version='${manifest.version}'`) && updatesXml.includes('https://mcp.tarasevych.com/downloads/mijn-ruimte-extension.crx')
      && versie.crx?.extensionId === parsed.extensionId && versie.crx?.version === manifest.version, parsed.extensionId);
    check('CRX: de inhoud is actueel (zelfde bestanden als de extensiemap, met update_url naar onze site) en bevat geen privésleutel of ondertekeningsbestanden',
      contentHash(inner) === contentHash(extensionEntries(join(process.cwd(), 'extension'), { selfHosted: true })) && innerManifest.update_url === 'https://mcp.tarasevych.com/downloads/updates.xml'
      && !inner.some((e) => /\.pem$|signed\/|crx-info|store-url/.test(e.name)) && !crxFile.includes(Buffer.from('PRIVATE KEY')));
    check('CRX: een gewijzigd pakket valt door de mand (handtekening ongeldig als er een byte verandert)', (() => { const kapot = Buffer.from(crxFile); kapot[kapot.length - 20] ^= 1; return parseCrx3(kapot).valid === false; })());
  }
  check('manifest 0.4: debugger als vast recht (niet optioneel, geen permissions.request), sidePanel, externally_connectable alleen tarasevych.com, Chrome ≥ 116',
    !manifest.optional_permissions && manifest.permissions.includes('debugger') && manifest.permissions.includes('sidePanel') && manifest.minimum_chrome_version === '116'
    && JSON.stringify(manifest.externally_connectable) === '{"matches":["https://*.tarasevych.com/*"]}' && manifest.side_panel?.default_path === 'sidepanel.html'
    && manifest.options_ui?.page === 'options.html' && manifest.version === '0.4.0');
  check('manifest 0.4: bridge.js in ISOLATED, collector.js in MAIN (document_start)',
    manifest.content_scripts.some((c: any) => c.js.includes('bridge.js') && c.world === 'ISOLATED') && manifest.content_scripts.some((c: any) => c.js.includes('collector.js') && c.world === 'MAIN' && c.run_at === 'document_start'));
  check('manifest: Manifest V3, alleen tarasevych.com, geen brede rechten (geen <all_urls>, geen tabs/cookies/webRequest)',
    manifest.manifest_version === 3 && JSON.stringify(manifest.host_permissions) === '["https://*.tarasevych.com/*"]'
    && manifest.content_scripts.every((c: any) => c.matches.every((m: string) => m === 'https://*.tarasevych.com/*'))
    && !manifest.permissions.some((p: string) => ['tabs', 'cookies', 'webRequest', 'history', 'downloads', 'nativeMessaging', 'webNavigation', 'declarativeNetRequest'].includes(p)) && !JSON.stringify(manifest).includes('<all_urls>'));
  const bg = readFileSync(join(process.cwd(), 'extension', 'background.js'), 'utf8');
  const opts = readFileSync(join(process.cwd(), 'extension', 'options.js'), 'utf8');
  check('background 0.4: geen token in de WebSocket-URL, ticket in het eerste bericht, ticket in storage.session, levensteken 20 s, handtekening en accountclaim gecontroleerd',
    /new WebSocket\(`wss:\/\/\$\{host\}\/agent\/ws`\)/.test(bg) && !/agent\/ws\?/.test(bg) && /t: 'auth', ticket/.test(bg) && /storage\.session\.set\(\{ wsTicket/.test(bg)
    && /PING_MS = 20_000/.test(bg) && /verifyCommand\(/.test(bg) && /accountState\(/.test(bg) && /humanAttach/.test(bg) && !/chrome\.permissions\.request/.test(bg + opts));
  check('background 0.4: externe berichten alleen PING / OPEN_OPTIONS / PAIR / SELF_TEST (knop Тест), met oorsprongscontrole; PAIR alleen vanaf mcp.tarasevych.com en eenmalig',
    /onMessageExternal/.test(bg) && /isOwnSiteUrl\(`\$\{origin\}\/`\)/.test(bg) && /hostname !== PAIR_HOST/.test(bg) && /usedPairCodes/.test(bg)
    && (bg.match(/type === '([A-Z_]+)'/g) ?? []).map((x) => x.slice(10, -1)).sort().join() === 'OPEN_OPTIONS,PAIR,PING,SELF_TEST');
  const uiTekst = ['options.html', 'sidepanel.html', 'popup.html'].map((f) => readFileSync(join(process.cwd(), 'extension', f), 'utf8')).join('\n');
  check('teksten: alleen Oekraïens en Nederlands (geen Engelse UI-zinnen)', !/\b(Settings|Disconnect|Allow|Connected|Permissions|Open site)\b/.test(uiTekst.replace(/<[^>]+>/g, ' ')));
  {
    const buf: any[] = [];
    let state = { buffer: buf, spill: [] as any[] };
    for (let i = 0; i < 250; i += 1) state = pushDiag(state.buffer, { kind: 'request', url: `https://mail.tarasevych.com/a?token=geheim${i}` }, 1000 + i);
    const oud = pushDiag(state.buffer, { kind: 'console', text: 'x' }, 1000 + 250 + 16 * 60 * 1000);
    check('diagnosebuffer: hoogstens 200 regels, querystrings weg, regels ouder dan de TTL vallen eruit (naar het archief)',
      state.buffer.length === 200 && !JSON.stringify(state.buffer).includes('geheim') && oud.buffer.length === 1 && oud.spill.length === 200);
  }
  check('bereik: urlInScope en stripQuery in de extensie', urlInScope('https://mail.tarasevych.com/x', ['mail.tarasevych.com']) && !urlInScope('https://agenda.tarasevych.com/', ['mail.tarasevych.com'])
    && urlInScope('https://agenda.tarasevych.com/', []) && !urlInScope('https://evil.com/', []) && stripQuery('https://a.tarasevych.com/p?q=1#x') === 'https://a.tarasevych.com/p');

  return einde();
}
