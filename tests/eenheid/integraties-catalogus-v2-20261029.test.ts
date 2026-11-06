// UI-013: register van alle 160 posities, groepen uit echte stand, bewaarde klaptoestand, zoeken, en de lichte Google-standroute.
import { existsSync, readFileSync } from 'node:fs';
import { INTEGRATIES } from '../../shared/integraties-catalogus';
import { REGISTER, groepVan, actieVan, registerVan } from '../../shared/integraties-register';
import { indelen, isOpen, leesVoorkeur, wissel, zoekt, VOORKEUR_LEEG } from '../../src/integraties/catalogus-v2-logica';
import { hulpVan } from '../../shared/hulp-register';
import { checker } from './hulp/nep-google';
import { imapLevend } from '../../backend/beheer-integraties';

export async function main(): Promise<number> {
  const { check, einde } = checker('integraties-catalogus-v2');
  check('register heeft precies één rij per catalogusitem (161)', REGISTER.length === INTEGRATIES.length && INTEGRATIES.length === 161 && INTEGRATIES.every((i) => REGISTER.filter((r) => r.id === i.id).length === 1));
  check('elk bewijsbestand bestaat echt', REGISTER.every((r) => r.bewijs.every((b) => existsSync(b))));
  check('werkend/basis heeft bewijs; geen heeft geen bewijs', REGISTER.every((r) => (r.uitvoering === 'geen') === (r.bewijs.length === 0)));
  check('elke rij heeft uk+nl voor vereist/operaties/nog te doen', REGISTER.every((r) => [r.vereist, r.operaties, r.nogTeDoen].every((t) => t[0] && t[1])));
  check('klaar in catalogus ⇒ werkend in register', INTEGRATIES.filter((i) => i.status === 'klaar').every((i) => registerVan(i.id)?.uitvoering === 'werkend'));
  check('IMAP is werkend met pagina (catalogus noemde haar «binnenkort»)', registerVan('imap')?.uitvoering === 'werkend' && registerVan('imap')?.pagina?.dienst === 'mail');
  const gm = INTEGRATIES.find((i) => i.id === 'gmail')!, slack = INTEGRATIES.find((i) => i.id === 'slack')!, imap = INTEGRATIES.find((i) => i.id === 'imap')!, entra = INTEGRATIES.find((i) => i.id === 'entra')!;
  check('groep: fout → aandacht → «Відновити»', groepVan(gm, 'fout') === 'aandacht' && actieVan('aandacht') === 'herstellen');
  check('groep: verbonden → verbonden → «Керувати»', groepVan(gm, 'verbonden') === 'verbonden' && actieVan('verbonden') === 'beheren');
  check('groep: niet gekoppeld + klaar → beschikbaar', groepVan(gm, 'niet') === 'beschikbaar' && groepVan(gm, null) === 'beschikbaar');
  check('groep: ingesteld (sleutel, niet gecontroleerd) → instellen, nooit verbonden', groepVan(gm, 'ingesteld') === 'instellen');
  check('groep: slack zonder code → ontwikkeling → «План»', groepVan(slack, null) === 'ontwikkeling' && actieVan('ontwikkeling') === 'plan');
  check('groep: imap werkend → beschikbaar; entra basis → instellen', groepVan(imap, null) === 'beschikbaar' && groepVan(entra, null) === 'instellen');
  // Klaptoestand
  let v = { ...VOORKEUR_LEEG };
  check('standaard: thema open, «У розробці» dicht', isOpen(v, 'mail') && !isOpen(v, 'mail:ontwikkeling') && isOpen(v, 'mail:verbonden'));
  v = wissel(wissel(v, 'mail'), 'mail:ontwikkeling');
  const terug = leesVoorkeur(JSON.stringify({ ...v, weergave: 'lijst', sorteer: 'naam', cat: 'ai', methode: 'oauth' }));
  check('klaptoestand, weergave, sortering, filters overleven opslaan/lezen', !isOpen(terug, 'mail') && isOpen(terug, 'mail:ontwikkeling') && terug.weergave === 'lijst' && terug.sorteer === 'naam' && terug.cat === 'ai' && terug.methode === 'oauth');
  check('kapotte opslag → standaard', leesVoorkeur('{kapot').weergave === 'raster' && leesVoorkeur(JSON.stringify({ cat: 'bestaat-niet', methode: 'x' })).cat === '');
  // Indeling
  const blokken = indelen(INTEGRATIES, (i) => (i.id === 'github' ? 'verbonden' : i.id === 'telegram' ? 'fout' : null), { sorteer: 'stand' }, 'uk');
  check('alle 161 kaarten staan in een blok (niets verborgen of weggelaten)', blokken.reduce((n, b) => n + b.groepen.reduce((m, g) => m + g.lijst.length, 0), 0) === 161);
  const code = blokken.find((b) => b.cat === 'code')!;
  check('verbonden staat boven niet-verbonden binnen een thema', code.groepen[0].id === 'verbonden' && code.groepen[0].lijst[0].id === 'github');
  check('thema’s met koppelingen eerst', blokken[0].verbonden > 0);
  // Zoeken
  check('zoeken op naam, thema, aanbieder/wijze', zoekt(imap, 'imap') && zoekt(gm, 'пошта') && zoekt(imap, 'RFC 9051') && !zoekt(slack, 'gmail'));
  // Hulp en route
  check('één «?» per blok heeft een registersleutel', Boolean(hulpVan('integraties.v2-catalogus')));
  const be = readFileSync('backend/beheer-integraties.ts', 'utf8');
  check('lichte Google-standroute bestaat, achter admin.read, zonder diagnostiek', /'POST \/api\/owner\/admin\/integraties\/google-stand': \[route\('admin\.read'/.test(be) && be.includes('googleSuiteOnboardingSnapshot'));
  const ui = readFileSync('src/integraties/Integraties.tsx', 'utf8');
  check('pagina gebruikt eerst google-stand, diagnostiek alleen als terugval', ui.indexOf('/integraties/google-stand') < ui.indexOf("'/api/owner/admin/diagnostics'"));
  check('tabbladen synchroniseren via BroadcastChannel', ui.includes("BroadcastChannel('mr-integraties-stand')"));
  check('oude catalogus blijft bij vlag UIT', ui.includes("weergave === 'catalogus' && !v2"));
  check('migratie 0180: vlag standaard UIT', /'integraties-catalogus-v2'.*false, false/s.test(readFileSync('migrations/0180_integraties_catalogus_v2_vlag.sql', 'utf8')));
  // IMAP-stand uit echte controlevelden
  const k = (aanbieder: string, adres: string, fout = '', op = 1000) => ({ id: adres, aanbieder, adres, actief: true, mappen: 3, smtpGoed: true, laatstGoedOp: op, fout, aangemaaktOp: 1 });
  const il = imapLevend([k('icloud', 'a@icloud.com'), k('ukrnet', 'b@ukr.net'), k('iua', 'c@i.ua', 'IMAP_AUTH_MISLUKT', 2000)]);
  check('IMAP: iCloud → icloud-mail verbonden met controletijd', il['icloud-mail']?.toestand === 'verbonden' && il['icloud-mail']?.gecontroleerdOp === 1000);
  check('IMAP: overige aanbieders → imap; één fout maakt de groep «fout»', il.imap?.toestand === 'fout' && il.imap?.n === 2 && il.imap.detail.includes('IMAP_AUTH_MISLUKT'));
  check('IMAP: geen koppelingen → niets (geen verzonnen stand)', Object.keys(imapLevend([])).length === 0);
  check('IMAP-stand zit in /integraties/stand', readFileSync('backend/beheer-integraties.ts', 'utf8').includes("imapLevend(await mailImapLijst(a.user.id, 'prive'))"));
  return einde();
}
