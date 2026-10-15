// Connector-integraties: grammatica van de gepubliceerde Nederlandse naam.
// Volle vorm: <essentie>_<agent>_<sub>_<bron>_tarasevych_com_<gebruiker|beheer>
// bron = externe aanbieder als die verschilt van het subdomein, anders `site`, en weggelaten als de aanbieder het subdomein al is.
// Boven 64 tekens verkort shared/connector-v2/afkorting.ts ALLEEN de essentie (STAM). Agent, sub, bron, tarasevych_com en de kant blijven heel.
import { V2_AGENTEN, type AgentSlug } from '../../shared/connector-v2/agenten';
import { V2_OPTIES, v2Optie } from '../../shared/connector-v2/catalogus';
import { STAM, kortEssentie } from '../../shared/connector-v2/afkorting';
import { MAX_NAAM, NAAM_RE, alleNamen, bronVan, idVanNaam, toolNaam } from '../../shared/connector-v2/namen';
import { factorVerplicht } from '../../shared/connector-v2/factor';
import { checker } from './hulp/nep-google';

const AGENTS: AgentSlug[] = ['claude', 'gpt', 'grok', 'gemini', 'copilot', 'cursor'];

export async function main(): Promise<number> {
  const { check, einde } = checker('connector-integraties');

  const botsingen: string[] = [];
  const teLang: string[] = [];
  const vorm: string[] = [];
  for (const a of V2_AGENTEN) {
    const rijen = alleNamen(a.slug);
    const namen = rijen.map((r) => r.naam);
    if (new Set(namen).size !== namen.length) botsingen.push(a.slug);
    for (const rij of rijen) {
      if (!NAAM_RE.test(rij.naam) || rij.naam.length > MAX_NAAM) teLang.push(`${rij.naam} (${rij.naam.length})`);
      if (!rij.naam.endsWith('_gebruiker') && !rij.naam.endsWith('_beheer')) vorm.push(rij.naam);
      if (!rij.naam.includes(`_${a.slug}_`) || !rij.naam.includes('_tarasevych_com_')) vorm.push(`mist agent/domein ${rij.naam}`);
      if (idVanNaam(rij.naam, a.slug) !== rij.key) vorm.push(`heen-en-weer ${rij.naam} → ${idVanNaam(rij.naam, a.slug)}`);
      const o = v2Optie(rij.key)!;
      const bron = bronVan(o);
      const staart = [a.slug, o.sub, ...(bron ? [bron] : []), 'tarasevych_com', o.kant].join('_');
      if (!rij.naam.endsWith(`_${staart}`) && rij.naam !== `${kortEssentie(o.essentie, MAX_NAAM)}_${staart}` && !rij.naam.endsWith(staart)) vorm.push(`staart ${rij.naam}`);
    }
  }
  check('elke gepubliceerde naam is uniek per agent', !botsingen.length, botsingen.join(','));
  check('elke naam voldoet aan ^[a-z0-9_]{1,64}$', !teLang.length, teLang.join(', '));
  check('elke naam eindigt op _gebruiker of _beheer, bevat de agent en tarasevych_com, en rondt terug naar één sleutel', !vorm.length, vorm.slice(0, 8).join(' | '));
  check('afkortingen zijn alleen a-z0-9 en korter dan het volle woord', Object.entries(STAM).every(([vol, stam]) => /^[a-z0-9]+$/.test(stam) && stam.length < vol.length && stam !== vol));

  const bestand = v2Optie('drive_create_file:gebruiker')!;
  const volGrok = ['creeren_nieuw_bestand', 'grok', 'cloud', 'gdrive', 'tarasevych_com', 'gebruiker'].join('_');
  check('creëren nieuw bestand voor grok past vol (cloud/gdrive, niet mail/gmail)', toolNaam(bestand, 'grok') === volGrok && volGrok.length <= 64, toolNaam(bestand, 'grok'));
  const copilot = toolNaam(bestand, 'copilot');
  const volCopilot = ['creeren_nieuw_bestand', 'copilot', 'cloud', 'gdrive', 'tarasevych_com', 'gebruiker'].join('_');
  check('copilot verkort alleen de essentie en blijft uniek terug te lezen', volCopilot.length > 64 && copilot.length <= 64 && copilot.includes('_copilot_cloud_gdrive_tarasevych_com_gebruiker') && idVanNaam(copilot, 'copilot') === bestand.key && copilot !== toolNaam(v2Optie('drive_upload_file:gebruiker')!, 'copilot'), copilot);

  const issue = toolNaam(v2Optie('github_create_issue:gebruiker')!, 'gpt');
  check('github valt niet dubbel en is niet `site`', issue === 'creeren_nieuw_issue_gpt_github_tarasevych_com_gebruiker' && !issue.includes('_site_'));
  const wie = toolNaam(v2Optie('v2_whoami:gebruiker')!, 'claude');
  check('geen externe dienst → bron `site`', wie === 'tonen_mijn_account_claude_ai_site_tarasevych_com_gebruiker');

  const gezien = new Map<string, string>();
  for (const a of AGENTS) for (const o of V2_OPTIES) {
    const n = toolNaam(o, a);
    const vorige = gezien.get(n);
    if (vorige && vorige !== `${a}:${o.key}`) botsingen.push(`${n} = ${vorige} én ${a}:${o.key}`);
    else gezien.set(n, `${a}:${o.key}`);
  }
  check('geen twee opties publiceren dezelfde naam', !botsingen.length, botsingen.slice(0, 6).join(' | '));

  check('tweede factor alleen als het account hem zelf aan heeft', !factorVerplicht({}) && !factorVerplicht(null) && factorVerplicht({ passkey: true }) && factorVerplicht({ email: true }) && !factorVerplicht({ passkey: false, totp: false }));
  return einde();
}
