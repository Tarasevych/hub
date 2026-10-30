// Опції встановлення за зразком nodejs.org/download: система, архітектура, спосіб; відповідно змінюються команди й підказки.
// Свідомо без файлів .cmd/.ps1/.js для завантаження: «Захист Windows (Smart App Control)» блокує їх без можливості обійти. Команди вставляються в термінал.
import type { Os } from './agent-opdrachten';

export type Arch = 'x64' | 'arm64';
export type NodeMethod = { id: string; label: string; official: boolean; commands: string[]; link?: { href: string; label: string }; note: [string, string] };

/** Архітектура з підказок браузера (достатньо для вибору за замовчуванням; користувач може змінити). */
export function guessArch(ua: string, platform = ''): Arch { return /arm64|aarch64|\barm\b/i.test(`${ua} ${platform}`) ? 'arm64' : 'x64'; }

export function nodeInstallMethods(os: Os, arch: Arch): NodeMethod[] {
  const dl = { href: 'https://nodejs.org/en/download', label: 'nodejs.org/download' };
  if (os === 'windows') return [
    { id: 'msi', label: 'Інсталятор (.msi)', official: true, commands: [], link: dl, note: ['Офіційний підписаний інсталятор; Windows спитає дозвіл (видавець OpenJS Foundation) — відповідайте «Так». На кроці «Tools for Native Modules» НЕ ставте позначку: вона завантажує понад 7 ГБ зайвого (Python, Visual Studio Build Tools, Chocolatey), агентові це не потрібно.', 'Officieel ondertekend installatieprogramma; Windows vraagt toestemming (uitgever OpenJS Foundation): kies "Ja". Vink bij "Tools for Native Modules" NIETS aan: dat haalt ruim 7 GB onnodige software binnen (Python, Visual Studio Build Tools, Chocolatey); de agent heeft dat niet nodig.'] },
    { id: 'winget', label: 'winget', official: false, commands: ['winget install OpenJS.NodeJS.LTS'], note: ['Вбудований у Windows 11 менеджер пакетів; без графічних вікон. Після встановлення відкрийте новий термінал.', 'Ingebouwde pakketbeheerder van Windows 11; zonder vensters. Open na afloop een nieuwe terminal.'] },
    { id: 'fnm', label: 'fnm', official: true, commands: ['winget install Schniz.fnm', 'fnm install 24', 'fnm default 24'], note: ['Керування кількома версіями Node.js.', 'Beheer van meerdere Node.js-versies.'] },
    { id: 'nvm', label: 'nvm-windows', official: true, commands: ['winget install CoreyButler.NVMforWindows', 'nvm install lts', 'nvm use lts'], note: ['Керування кількома версіями; потрібно відкрити новий термінал.', 'Beheer van meerdere versies; open een nieuwe terminal.'] },
    { id: 'choco', label: 'Chocolatey', official: false, commands: ['choco install nodejs-lts -y'], note: ['Лише якщо Chocolatey у вас уже встановлений; потрібен термінал від імені адміністратора.', 'Alleen als Chocolatey al is geïnstalleerd; vereist een terminal als beheerder.'] },
    { id: 'zip', label: arch === 'arm64' ? 'ZIP (ARM64)' : 'ZIP (x64)', official: true, commands: [], link: dl, note: ['Автономний архів без встановлення: розпакуйте й додайте папку в PATH.', 'Zelfstandig archief zonder installatie: uitpakken en de map aan PATH toevoegen.'] },
  ];
  if (os === 'macos') return [
    { id: 'pkg', label: 'Інсталятор (.pkg)', official: true, commands: [], link: dl, note: [`Офіційний інсталятор для macOS (${arch === 'arm64' ? 'Apple Silicon / ARM64' : 'Intel / x64'}).`, `Officieel installatieprogramma voor macOS (${arch === 'arm64' ? 'Apple Silicon / ARM64' : 'Intel / x64'}).`] },
    { id: 'brew', label: 'Homebrew', official: false, commands: ['brew install node@24'], note: ['Якщо Homebrew встановлений.', 'Als Homebrew is geïnstalleerd.'] },
    { id: 'fnm', label: 'fnm', official: true, commands: ['curl -fsSL https://fnm.vercel.app/install | bash', 'fnm install 24'], note: ['Після першої команди відкрийте новий термінал.', 'Open na het eerste commando een nieuwe terminal.'] },
    { id: 'nvm', label: 'nvm', official: true, commands: ['curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash', 'nvm install 24'], note: ['Після першої команди відкрийте новий термінал.', 'Open na het eerste commando een nieuwe terminal.'] },
  ];
  return [
    { id: 'fnm', label: 'fnm', official: true, commands: ['curl -fsSL https://fnm.vercel.app/install | bash', 'fnm install 24'], note: ['Працює без прав адміністратора; відкрийте новий термінал після першої команди.', 'Werkt zonder beheerdersrechten; open na het eerste commando een nieuwe terminal.'] },
    { id: 'nvm', label: 'nvm', official: true, commands: ['curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash', 'nvm install 24'], note: ['Відкрийте новий термінал після першої команди.', 'Open na het eerste commando een nieuwe terminal.'] },
    { id: 'tar', label: arch === 'arm64' ? 'Архів (ARM64)' : 'Архів (x64)', official: true, commands: [], link: dl, note: ['Офіційний архів .tar.xz: розпакуйте й додайте bin у PATH.', 'Officieel .tar.xz-archief: uitpakken en bin aan PATH toevoegen.'] },
    { id: 'distro', label: 'Пакети дистрибутива', official: false, commands: ['sudo apt install nodejs npm'], note: ['Версія в дистрибутиві часто стара (потрібна 22+). Перевірте командою node -v; якщо менше, оберіть fnm чи nvm.', 'De versie in de distributie is vaak oud (22+ nodig). Controleer met node -v; is het lager, kies fnm of nvm.'] },
  ];
}

/** Команда, що завантажує розширення в папку, перевіряє SHA-256 і розпаковує: усе в терміналі, без завантаження виконуваного файлу (Smart App Control блокує .cmd/.ps1/.js). */
export function extensionInstallCommands(opts: { os: Os; shell: 'powershell' | 'cmd' | 'bash'; folder: string; sha256: string; origin: string; file?: string }): string[] {
  const url = `${opts.origin}/downloads/${opts.file || 'mijn-ruimte-extension.zip'}`;
  if (opts.os === 'windows') {
    const folder = opts.folder.replace(/"/g, '').replace(/'/g, "''");
    return [`$d=[Environment]::ExpandEnvironmentVariables('${folder}'); New-Item -ItemType Directory -Force -Path $d | Out-Null; $z=Join-Path $d 'mijn-ruimte-extension.zip'; Invoke-WebRequest '${url}' -OutFile $z; if ((Get-FileHash $z -Algorithm SHA256).Hash.ToLower() -ne '${opts.sha256.toLowerCase()}') { throw 'Контрольна сума не збігається' }; Expand-Archive -Path $z -DestinationPath $d -Force; Remove-Item $z; Write-Host "Готово: $d"`];
  }
  // een tilde binnen enkele aanhalingstekens wordt niet uitgebreid: "$HOME" ervoor zetten
  const quote = (v: string) => `'${v.replace(/'/g, `'\\''`)}'`;
  const folder = opts.folder.startsWith('~/') ? `"$HOME"/${quote(opts.folder.slice(2))}` : quote(opts.folder);
  return [`mkdir -p ${folder} && curl -fsSL ${url} -o ${folder}/mijn-ruimte-extension.zip && cd ${folder} && echo "${opts.sha256.toLowerCase()}  mijn-ruimte-extension.zip" | ${opts.os === 'macos' ? 'shasum -a 256 -c -' : 'sha256sum -c -'} && unzip -o mijn-ruimte-extension.zip && rm mijn-ruimte-extension.zip && echo "Готово: $PWD"`];
}
