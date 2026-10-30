// Opties voor Node.js per systeem/architectuur en de installatiecommando's voor de extensie (zonder .cmd/.ps1-download: Smart App Control blokkeert die).
import { extensionInstallCommands, guessArch, nodeInstallMethods } from '../../src/installeer-opdrachten';
import { checker } from './hulp/nep-google';

export async function main(): Promise<number> {
  const { check, einde } = checker('installeer-opdrachten');
  const win = nodeInstallMethods('windows', 'x64'); const mac = nodeInstallMethods('macos', 'arm64'); const lin = nodeInstallMethods('linux', 'x64');
  check('Windows: msi (met waarschuwing over Tools for Native Modules), winget, fnm, nvm, choco, zip', ['msi', 'winget', 'fnm', 'nvm', 'choco', 'zip'].every((id) => win.some((m) => m.id === id)) && /7 ГБ/.test(win[0].note[0]) && /7 GB/.test(win[0].note[1]));
  check('macOS en Linux hebben eigen methoden (pkg/brew/fnm/nvm resp. fnm/nvm/tar/distro); geen winget op macOS', mac.some((m) => m.id === 'brew') && !mac.some((m) => m.id === 'winget') && lin.some((m) => m.id === 'tar') && !lin.some((m) => m.id === 'msi'));
  check('architectuur verandert de labels (ZIP ARM64 vs x64) en de gok uit de user-agent klopt', nodeInstallMethods('windows', 'arm64').some((m) => /ARM64/.test(m.label)) && guessArch('Mozilla/5.0 (Windows NT 10.0; ARM64)') === 'arm64' && guessArch('Mozilla/5.0 (Windows NT 10.0; Win64; x64)') === 'x64');
  const ps = extensionInstallCommands({ os: 'windows', shell: 'powershell', folder: 'C:\\Mijn map\\ext', sha256: 'ABCDEF0123', origin: 'https://mcp.tarasevych.com' })[0];
  check('Windows-commando: download, SHA-256-controle (kleine letters), uitpakken in de opgegeven map (omgevingsvariabelen worden uitgebreid), geen bestand om uit te voeren',
    /Invoke-WebRequest 'https:\/\/mcp\.tarasevych\.com\/downloads\/mijn-ruimte-extension\.zip'/.test(ps) && ps.includes("'abcdef0123'") && ps.includes("ExpandEnvironmentVariables('C:\\Mijn map\\ext')") && /Expand-Archive/.test(ps) && !/\.cmd|\.ps1/.test(ps), ps);
  const sh = extensionInstallCommands({ os: 'macos', shell: 'bash', folder: "~/it's", sha256: 'AB12', origin: 'https://mcp.tarasevych.com' })[0];
  check('macOS/Linux-commando: curl + shasum/sha256sum + unzip, tilde wordt "$HOME", enkele quotes veilig', /shasum -a 256 -c/.test(sh) && sh.includes('"$HOME"/\'it\'\\\'\'s\'') && /sha256sum -c/.test(extensionInstallCommands({ os: 'linux', shell: 'bash', folder: '~/x', sha256: 'ab', origin: 'https://a' })[0]), sh);
  const all = [ps, sh, extensionInstallCommands({ os: 'linux', shell: 'bash', folder: '/data/x', sha256: 'ab', origin: 'https://a' })[0]].join(' ');
  check('geen tijdelijke bestanden buiten de gekozen map (geen TEMP, geen /tmp, geen %USERPROFILE% als standaard)', !/TEMP|\/tmp|USERPROFILE/.test(all), all);
  return einde();
}
