// Toestandsmachine van de extensie op de site: elke toestand heeft alleen acties die daar werken (geen dode knoppen),
// 'Тест' zodra de extensie er is, 'Стоп' zodra er een verbinding is; teksten uk + nl voor elke toestand en reden.
import { deriveExtState, EXT_TEXT, versionAtLeast, type ExtInputs } from '../../src/extensie-toestand';
import { checker } from './hulp/nep-google';

export async function main(): Promise<number> {
  const { check, einde } = checker('extensie-toestand');
  const ok: ExtInputs = { presence: 'present', version: '0.4.0', minVersion: '0.4.0', paired: true, online: true, account: 'ok', blocked: false, activeGrants: 2, browserEnabled: true, armed: true };
  const v = (p: Partial<ExtInputs>) => deriveExtState({ ...ok, ...p });
  check('versievergelijking', versionAtLeast('0.4.0', '0.4.0') && versionAtLeast('0.10.0', '0.4.0') && !versionAtLeast('0.3.9', '0.4.0') && !versionAtLeast(undefined, '0.4.0'));
  check('niet geïnstalleerd: alleen installeren', JSON.stringify(v({ presence: 'absent' })) === JSON.stringify({ state: 'not_installed', actions: ['install'] }));
  check('controleren: geen knoppen', v({ presence: 'checking' }).actions.length === 0);
  check('oude versie (0.3): bijwerken + test, geen koppelknop', v({ version: '0.3.2' }).reason === 'outdated' && !v({ version: '0.3.2' }).actions.includes('pair'));
  check('geïnstalleerd, niet gekoppeld: koppelen + test, geen Стоп', v({ paired: false }).state === 'installed' && v({ paired: false }).actions.includes('pair') && !v({ paired: false }).actions.includes('stop'));
  check('gekoppeld, offline: opnieuw koppelen + test', v({ online: false }).state === 'paired' && v({ online: false }).actions.includes('repair'));
  check('geblokkeerd: geen toestaan/aanzetten (zou toch geweigerd worden)', v({ blocked: true }).reason === 'blocked' && !v({ blocked: true }).actions.some((a) => ['grant', 'enable', 'stop'].includes(a)));
  check('ander account op het tabblad: reden account_mismatch', v({ account: 'mismatch' }).reason === 'account_mismatch' && v({ account: 'mismatch' }).actions.includes('relogin'));
  check('hoofdschakelaar uit: aanzetten', v({ browserEnabled: false }).reason === 'browser_off' && v({ browserEnabled: false }).actions[0] === 'enable');
  check('geen grants: toestaan', v({ activeGrants: 0 }).reason === 'no_grants' && v({ activeGrants: 0 }).actions[0] === 'grant');
  check('niet aangemeld: opnieuw aanmelden', v({ armed: false }).reason === 'not_armed');
  check('alles goed: enabled met test en Стоп', v({}).state === 'enabled' && v({}).actions.includes('test') && v({}).actions.includes('stop'));
  const all: ExtInputs[] = [];
  for (const presence of ['checking', 'present', 'absent'] as const) for (const paired of [true, false]) for (const online of [true, false]) for (const account of ['ok', 'mismatch', 'unknown'] as const)
    for (const blocked of [true, false]) for (const activeGrants of [0, 1]) for (const browserEnabled of [true, false]) for (const armed of [true, false]) for (const version of ['0.3.0', '0.4.0'])
      all.push({ presence, paired, online, account, blocked, activeGrants, browserEnabled, armed, version, minVersion: '0.4.0' });
  const views = all.map(deriveExtState);
  check(`alle ${all.length} combinaties: tekst uk + nl aanwezig, geen dubbele acties`, views.every((x) => EXT_TEXT[x.reason ?? x.state]?.every((t) => t.length > 5) && new Set(x.actions).size === x.actions.length));
  check('Стоп alleen met verbinding en niet geblokkeerd; pair alleen zonder koppeling', views.every((x, i) => (!x.actions.includes('stop') || (all[i].online && all[i].paired && !all[i].blocked)) && (!x.actions.includes('pair') || !all[i].paired)));
  return einde();
}
