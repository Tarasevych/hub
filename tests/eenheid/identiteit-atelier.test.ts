// IDENTITEIT-003: de eigenaar kan het nieuwe uiterlijk uitzetten zonder bestaande handelingen te verliezen.
import { readFileSync } from 'node:fs';
import { evalueer, VLAG_UITLEG, type Vlag } from '../../shared/vlaggen';
import { IDENTITEIT_TABS } from '../../src/identiteit/identiteit-tabs';
import { checker } from './hulp/nep-google';

export async function main(): Promise<number> {
  const { check, einde } = checker('identiteit-atelier');
  const pagina = readFileSync('src/identiteit/IdentiteitAccountPagina.tsx', 'utf8');
  const atelier = readFileSync('src/identiteit/IdentiteitAtelierPagina.tsx', 'utf8');
  const stijl = readFileSync('src/identiteit/identiteit-atelier.css', 'utf8');
  const migratie = readFileSync('migrations/0199_identiteit_account_atelier.sql', 'utf8');
  const sleutel = 'identiteit-account-atelier';
  const vlag: Vlag = { sleutel, omschrijving: '', aan: false, standaard: false, percentage: 0, gebruikers: [] };

  check('de nieuwe weergave heeft twaalf bestaande onderdelen', IDENTITEIT_TABS.length === 12);
  check('alle onderdelen hebben een eigen inhoudelijk symbool', IDENTITEIT_TABS.every((tab) => new RegExp(`^  ${tab.id}: \\{ symbool: `, 'm').test(atelier)));
  check('de nieuwe weergave ontvangt de bestaande onderdelen en hun handelingen', pagina.includes('secties={secties}') && atelier.includes('{sectie.inhoud as ReactNode}'));
  check('het oude uiterlijk blijft ongewijzigd beschikbaar', pagina.includes("if (atelier) return <IdentiteitAtelierPagina") && pagina.includes("<div className='ia-account'>"));
  check('de databasevlag staat aanvankelijk uit', /false, false\)\s*ON CONFLICT/.test(migratie));
  check('een ontbrekende of uitgeschakelde vlag toont het oude uiterlijk', evalueer(sleutel, undefined, 'eigenaar').value === false && evalueer(sleutel, vlag, 'eigenaar').value === false);
  check('de eigenaar kan de nieuwe vorm alleen voor zichzelf inschakelen', evalueer(sleutel, { ...vlag, aan: true, gebruikers: ['eigenaar'] }, 'eigenaar').value === true && evalueer(sleutel, { ...vlag, aan: true, gebruikers: ['eigenaar'] }, 'ander').value === false);
  check('de schakelaar heeft uitleg in beide talen', !!VLAG_UITLEG[sleutel] && VLAG_UITLEG[sleutel].wat.every((x) => x.length > 20));
  check('de ontwikkelmogelijkheden zijn standaard ingeklapt', atelier.includes("<details className='ia-at-vooruitzicht'>") && !atelier.includes("<details open"));
  check('de illustratie gebruikt het officiële Google-beeld', atelier.includes('GOOGLE_G_DATA_URI'));
  check('de pictogrammen hebben een eigen contrasterende achtergrond', stijl.includes('.ia-at-nav-symbool') && stijl.includes('background: color-mix('));
  check('gesloten onderdelen verbergen hun inhoud volledig', stijl.includes('.ia-at-inhoud[hidden] { display: none; }'));
  check('verminderde beweging wordt gerespecteerd', stijl.includes('prefers-reduced-motion: reduce'));
  return einde();
}
