// Koppelopdrachten voor de agent: correct gequoot per shell, geen punthaken, drive-root met backslash, startbestanden.
// Plus de zelftest van agent.mjs zelf (mappen, geheime plekken, alleen-lezen roots, commando's) in een wegwerpmap.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildAgentCommands, buildRunnerScript, looksLikePlaceholder, posixQuote, winQuote } from '../../src/agent-opdrachten';
import { checker } from './hulp/nep-google';

export async function main(): Promise<number> {
  const { check, einde } = checker('agent-opdrachten');
  check('Windows-quote: drive-root T:\\ krijgt een verdubbelde backslash vóór de sluitende aanhalingsteken (anders eet het teken de quote op)', winQuote('T:\\') === '"T:\\\\"' && winQuote('C:\\Projects') === '"C:\\Projects"' && winQuote('C:\\Mijn map\\') === '"C:\\Mijn map\\\\"');
  check('Windows-quote: aanhalingstekens in de invoer verdwijnen (geen uitbreken uit het argument)', winQuote('x" --root "/etc') === '"x --root /etc"');
  check('POSIX-quote: enkele aanhalingstekens veilig, spaties en $ blijven letterlijk', posixQuote("it's $HOME") === `'it'\\''s $HOME'`);
  check('placeholder-detectie: <T:\\> en <ДОЗВОЛЕНА_ПАПКА> zijn fout, T:\\ en /home/ik zijn goed', looksLikePlaceholder('<T:\\>') && looksLikePlaceholder('<ДОЗВОЛЕНА_ПАПКА>') && !looksLikePlaceholder('T:\\') && !looksLikePlaceholder('/home/ik/projecten'));
  const ps = buildAgentCommands({ shell: 'powershell', server: 'https://mcp.tarasevych.com', code: 'GMH4NF3H', name: 'Мій ПК', roots: ['T:\\', 'C:\\Projects'], allow: ['git', 'node'] });
  check('PowerShell-opdracht: twee regels, geen punthaken, beide roots gequoot, allow-lijst, en een aparte regel voor "run" (niet aan elkaar geplakt)',
    ps.length === 2 && !/[<>]/.test(ps.join('')) && ps[0] === 'node agent.mjs pair --server https://mcp.tarasevych.com --code GMH4NF3H --name "Мій ПК" --root "T:\\\\" --root "C:\\Projects" --allow git,node' && ps[1] === 'node agent.mjs run', ps[0]);
  const sh = buildAgentCommands({ shell: 'bash', server: 'https://mcp.tarasevych.com', code: 'ABCD2345', name: "Jan's pc", roots: ['/home/jan/projecten'], allow: [] });
  check('bash-opdracht: enkele quotes, geen --allow als niets gekozen', sh[0] === `node agent.mjs pair --server https://mcp.tarasevych.com --code ABCD2345 --name 'Jan'\\''s pc' --root '/home/jan/projecten'` , sh[0]);
  const cmd = buildRunnerScript('windows', ps);
  const unix = buildRunnerScript('linux', sh);
  check('startbestand Windows: CRLF, UTF-8-codepagina, gaat naar zijn eigen map, voert beide regels uit en pauzeert', cmd.file === 'Mijn-Ruimte-agent.cmd' && cmd.text.includes('\r\ncd /d "%~dp0"\r\n') && cmd.text.includes(ps[0]) && cmd.text.includes('node agent.mjs run') && cmd.text.trimEnd().endsWith('pause'));
  check('startbestand macOS/Linux: shebang, gaat naar de eigen map, LF', unix.file === 'mijn-ruimte-agent.sh' && unix.text.startsWith('#!/bin/sh\ncd "$(dirname "$0")"') && !unix.text.includes('\r'));
  const ro = buildAgentCommands({ shell: 'powershell', server: 'https://mcp.tarasevych.com', code: 'GMH4NF3H', name: 'Мій ПК', roots: ['T:\\'], readonlyRoots: ['R:\\'], allow: [] });
  check('alleen-lezen roots: --readonly-root na de gewone roots, ook met de verdubbelde backslash', ro[0] === 'node agent.mjs pair --server https://mcp.tarasevych.com --code GMH4NF3H --name "Мій ПК" --root "T:\\\\" --readonly-root "R:\\\\"', ro[0]);
  const map = mkdtempSync(join(tmpdir(), 'agent-zelftest-'));
  try {
    const r = spawnSync(process.execPath, ['deploy/agent/agent.mjs', 'selftest', '--root', map], { encoding: 'utf8', timeout: 120_000 });
    const fouten = (r.stdout || '').split('\n').filter((l) => l.startsWith('FOUT'));
    check('agent.mjs selftest: alles OK (schijfwortel, geheime plekken, alleen-lezen, commando\'s, handtekening)', r.status === 0 && /alles OK/.test(r.stdout || ''), fouten.join(' | ') || (r.stderr || '').slice(0, 300));
  } finally { rmSync(map, { recursive: true, force: true }); }
  return einde();
}
