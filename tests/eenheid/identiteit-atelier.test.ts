// IDENTITEIT-003: de eigenaar kan het nieuwe uiterlijk uitzetten zonder bestaande handelingen te verliezen.
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { evalueer, VLAG_UITLEG, type Vlag } from '../../shared/vlaggen';
import { IDENTITEIT_TABS } from '../../src/identiteit/identiteit-tabs';
import { AccessPlanePanels } from '../../src/toegangslaag-panelen';
import { checker } from './hulp/nep-google';

export async function main(): Promise<number> {
  const { check, einde } = checker('identiteit-atelier');
  const pagina = readFileSync('src/identiteit/IdentiteitAccountPagina.tsx', 'utf8');
  const atelier = readFileSync('src/identiteit/IdentiteitAtelierV49.tsx', 'utf8');
  const stijl = readFileSync('src/identiteit/atelier-v49-bron.css', 'utf8');
  const gegevens = JSON.parse(readFileSync('src/identiteit/atelier-v49-gegevens.json', 'utf8'));
  const migratie = readFileSync('migrations/0199_identiteit_account_atelier.sql', 'utf8');
  const toegang = readFileSync('src/toegangslaag-panelen.tsx', 'utf8');
  const toegangWeergave = readFileSync('src/ToegangslaagWeergave.tsx', 'utf8');
  const aanmeldWeergave = readFileSync('src/aanmeld-vnext/AanmeldVnextPanelen.tsx', 'utf8');
  const basisMigratie = readFileSync('migrations/0038_feature_flags.sql', 'utf8');
  const omschrijvingGrens = Number(basisMigratie.match(/CHECK\s*\(char_length\(omschrijving\)\s*<=\s*(\d+)\)/)?.[1]);
  const omschrijving = migratie.match(/VALUES\s*\(\s*'identiteit-account-atelier',\s*'((?:''|[^'])*)'\s*,\s*false,\s*false\s*\)/s)?.[1]?.replaceAll("''", "'");
  const sleutel = 'identiteit-account-atelier';
  const vlag: Vlag = { sleutel, omschrijving: '', aan: false, standaard: false, percentage: 0, gebruikers: [] };

  check('de nieuwe weergave heeft twaalf bestaande onderdelen', IDENTITEIT_TABS.length === 12);
  check('alle onderdelen hebben een eigen inhoudelijk symbool', IDENTITEIT_TABS.every((tab) => atelier.includes(`${tab.id === 'identity' ? 'identities' : tab.id}: `)));
  check('de oorspronkelijke twaalf illustraties zijn overgenomen', gegevens.secties.length === 12 && gegevens.secties.every((s: { art: { uk: string; nl: string } }) => s.art.uk.includes('class="art art-') && s.art.nl.includes('class="art art-')));
  check('de oorspronkelijke drieënveertig groepen behouden', Object.values(gegevens.groepen).flat().length === 43);
  check('de oorspronkelijke honderddrieënvijftig keuzen behouden', (Object.values(gegevens.groepen).flat() as { рядки: unknown[] }[]).reduce((a, g) => a + g.рядки.length, 0) === 153);
  check('de nieuwe weergave ontvangt de bestaande onderdelen en hun handelingen', pagina.includes('secties={secties}') && atelier.includes(': inhoud}'));
  check('het oude uiterlijk blijft ongewijzigd beschikbaar', pagina.includes("if (atelier) return <IdentiteitAtelierV49") && pagina.includes("<div className='ia-account'>"));
  check('de databasevlag staat aanvankelijk uit', /false, false\)\s*ON CONFLICT/.test(migratie));
  check('de vlagomschrijving past binnen de werkelijke databasegrens', Number.isInteger(omschrijvingGrens) && omschrijvingGrens > 0 && !!omschrijving && [...omschrijving].length <= omschrijvingGrens);
  check('een ontbrekende of uitgeschakelde vlag toont het oude uiterlijk', evalueer(sleutel, undefined, 'eigenaar').value === false && evalueer(sleutel, vlag, 'eigenaar').value === false);
  check('de eigenaar kan de nieuwe vorm alleen voor zichzelf inschakelen', evalueer(sleutel, { ...vlag, aan: true, gebruikers: ['eigenaar'] }, 'eigenaar').value === true && evalueer(sleutel, { ...vlag, aan: true, gebruikers: ['eigenaar'] }, 'ander').value === false);
  check('de schakelaar heeft uitleg in beide talen', !!VLAG_UITLEG[sleutel] && VLAG_UITLEG[sleutel].wat.every((x) => x.length > 20));
  check('de ontwikkelmogelijkheden zijn standaard ingeklapt', atelier.includes("<details className='ia-at-vooruitzicht'>") && !atelier.includes("<details open"));
  check('de toegangsmethode heeft een herkenbaar eigen teken', gegevens.secties.some((s: { id: string; art: { uk: string } }) => s.id === 'methods' && s.art.uk.includes('methods-art-brand')));
  check('de pictogrammen behouden hun contrasterende achtergrond', stijl.includes('.ia-at-v49 .anchor-rail .anchor-icon') && stijl.includes('background:'));
  check('de kleurrijke pictogrammen volgen de werkelijke menuvoorkeur in alle onderdelen', atelier.includes('useZijbalkVoorkeuren') && atelier.includes("zijbalk.icoonStijl === 'kleur'") && atelier.includes('data-jump={s.id}') && stijl.includes('.ia-at-v49.demo-colorful-icons .anchor-rail'));
  check('gesloten onderdelen verbergen hun inhoud volledig', stijl.includes('.ia-at-v49 .section-inline-settings[hidden]{display:none}'));
  check('verminderde beweging wordt gerespecteerd', stijl.includes('prefers-reduced-motion:reduce'));
  check('de nieuwe accountvorm scheidt de toegangsfuncties van het oude formulier',
    atelier.includes('<AtelierInhoud.Provider value={true}>') && toegangWeergave.includes('useContext(AtelierInhoud)') && toegangWeergave.includes('alleen={alleen}'));
  check('aanmelden bevat alleen de aanmeldmethoden en tijdelijke toegangscodes',
    toegang.includes("p.alleen==='methods'") && toegang.includes('{toonMethoden&&<Toegangscodes') && toegang.includes('{toonMethoden&&<section'));
  check('beveiliging bevat authenticator en sleutelkluis, niet de herstelcodes',
    toegang.includes("p.alleen==='security'") && toegang.includes('{toonBeveiliging&&<SleutelkluisSectie') && toegang.includes('{toonBeveiliging&&<section'));
  check('herstel toont herstelcodes en tijdelijke wachtwoorden precies één keer',
    toegang.includes("p.alleen==='recovery'") && toegang.includes('{toonHerstel&&<HerstelcodesSectie') && toegang.includes('{toonHerstel&&p.tempPassword'));
  check('een tweede aanmeldweergave toont geen beveiligings- of herstelkaarten in het atelier',
    aanmeldWeergave.includes("['google', 'password', 'passkey', 'guest-code'].includes(k.id)") && aanmeldWeergave.includes('!p.alleen&&<Hero') && aanmeldWeergave.includes("['alles', 'inloggen', 'passkey', 'delegatie']"));
  const basis = {
    tab: 'methods', lang: 'uk' as const,
    data: {
      architecture: 'access-plane-v1',
      contour: { clientId: '', redirectUri: '', credentialsConfigured: true, source: '', hasVaultOverride: false, hasPlatformSecret: false, missing: [], lockProtected: false, updatedAt: 0 },
      policy: { enabled: {}, mfa: 'optional' as const },
      methods: [{ id: 'google', enabled: true, configured: true, status: 'active' }],
      factors: [{ id: 'totp', enabled: true, enrolled: false, status: 'not_enrolled' }],
      bindings: [], usableCount: 1, lockout: { protected: false, reason: '' },
      password: { configured: false, mustChange: false }, totp: { enrolled: false },
    },
    busy: false, notice: '', password: '', setPassword: (_: string) => {},
    otpauth: '', secret: '', code: '', setCode: (_: string) => {},
    recovery: [], tempPassword: '', context: {},
    write: async () => {}, load: async () => {}, nieuweHerstelcodes: async () => {},
    totpUitschakelen: async () => {}, recoverySaved: async () => {},
  };
  const uitkomst = (alleen?: 'methods' | 'security' | 'recovery') => renderToStaticMarkup(createElement(AccessPlanePanels, { ...basis, tab: alleen || 'methods', alleen }));
  const verdeeld = { methods: uitkomst('methods'), security: uitkomst('security'), recovery: uitkomst('recovery'), legacy: uitkomst() };
  check('werkelijk gerenderde aanmeldpagina heeft enkel de aanmeldsectie',
    verdeeld.methods.includes('data-access-section="google"') && !verdeeld.methods.includes('data-access-section="2fa"') && !verdeeld.methods.includes('data-access-section="recovery"'));
  check('werkelijk gerenderde beveiligingspagina heeft geen Google of herstelcodes',
    verdeeld.security.includes('data-access-section="2fa"') && !verdeeld.security.includes('data-access-section="google"') && !verdeeld.security.includes('data-access-section="recovery"'));
  check('werkelijk gerenderde herstelpagina bevat de codes slechts één keer',
    verdeeld.recovery.includes('data-access-section="recovery"') && !verdeeld.recovery.includes('data-access-section="2fa"') && !verdeeld.recovery.includes('data-access-section="google"'));
  check('het oorspronkelijke paneel toont alle onderdelen bij uitgeschakelde nieuwe vorm',
    ['google', '2fa', 'recovery'].every(deel => verdeeld.legacy.includes(`data-access-section="${deel}"`)));
  return einde();
}
