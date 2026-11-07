> 🌐 **Taal / Мова:** [🇺🇦 **Українська версія**](./WINDOWS-POWERSHELL.uk.md) · **🇳🇱 Nederlands** ([origineel](./WINDOWS-POWERSHELL.md)) · [🏠 Hoofdpagina (NL)](../../LEESMIJ.md) · [🏠 Головна (UK)](../../README.md) · [📚 Documentatie-index](../../docs/INDEX.nl.md)

# PowerShell op een Windows-pc via de «Terminal» van de site

Agent 0.8.0 (`deploy/agent/agent.mjs`) draait ook op Windows onder Node.js. In de modus `--powershell` wordt elke regel die in de «Terminal»
van het technisch profiel wordt ingevoerd, op de pc uitgevoerd als **één** vast programma: `powershell.exe -NoProfile -NonInteractive -Command <tekst>`
(zonder `cmd.exe`, zonder `shell:true`; de hele regel is één argument). Binnen PowerShell is de tekst vrij, daarom vraagt de site **voor elke
opdracht om bevestiging** vóór uitvoering; de uitvoer wordt opgenomen (`app.terminal_opdrachten`). Dezelfde route geldt voor AI via de connector
(`uitvoeren_opdracht` → `machine_exec` met `command: "powershell"`): dezelfde ingebouwde opdracht en dezelfde bevestiging op de site —
altijd, zelfs als voor dit apparaat de AI-toestemming «altijd» aanstaat (de server laat PowerShell nooit door zonder uw klik).

## 1. Node.js op Windows
Installeer Node.js **22 LTS of nieuwer** (nodejs.org, .msi); controleer met `node -v`.

## 2. Agent
1. Site: **mcp.\<uw domein\> → Agenten → Apparaten → «Apparaat koppelen»**, technisch profiel aan, ruimte **«Technisch»** (dan staat de pc
   in de «Terminal» van de technische band, naast de server). De site toont een eenmalige code (5 min).
2. Map `C:\mijn-ruimte-agent` met `agent.mjs` (uit de release: `deploy/agent/agent.mjs`).
3. In PowerShell in die map:
   ```powershell
   node agent.mjs pair --server https://mcp.<uw-domein> --code <CODE> --name "Mijn pc" --root "C:\Users\<u>\Projecten" --allow git
   node agent.mjs terminal-config on --powershell --geen-container
   node agent.mjs run
   ```
   `--root` = de enige mappen voor opdrachten; `--readonly-root` = alleen lezen; `--allow` = gewone programma’s naast PowerShell
   (mag leeg: dan is elke regel PowerShell); `.cmd`-scripts (npm) als PowerShell-regel: `npm ls`.
4. Site: technisch profiel → ⋯ → **Terminal** → apparaat «PowerShell op Mijn pc»; statusregel «verbonden als \<gebruiker\>@\<pc\>, map …,
   bevestiging: elke opdracht (PowerShell: altijd)».

## 3. Als Windows-dienst (zonder programma’s of npm-pakketten van derden)
**Waarom niet `sc.exe`:** `sc.exe create` registreert alleen een echte Windows-dienst, een programma dat de dienstenbeheerder (SCM)
antwoordt. `node.exe` en `powershell.exe` doen dat niet: Windows stopt zo’n «dienst» na ongeveer 30 s (fout 1053). Zonder wrappers van
derden (NSSM, WinSW) is de **Taakplanner** de juiste weg: start bij het opstarten van Windows, herstart na een fout en draait als **uw**
gebruiker (niet als SYSTEM of beheerder).

Variant A — **bij het opstarten, zonder aanmelden, zonder venster** (aanbevolen). PowerShell «als administrator» is alleen nodig om de taak
te registreren; de taak zelf draait als uw gebruiker met beperkte rechten (S4U: geen opgeslagen wachtwoord, geen venster):
```powershell
$node = (Get-Command node).Source
$act  = New-ScheduledTaskAction -Execute $node -Argument '"C:\mijn-ruimte-agent\agent.mjs" run' -WorkingDirectory 'C:\mijn-ruimte-agent'
$trig = New-ScheduledTaskTrigger -AtStartup
$wie  = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType S4U -RunLevel Limited
$set  = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName 'MijnRuimteAgent' -Action $act -Trigger $trig -Principal $wie -Settings $set
Start-ScheduledTask -TaskName 'MijnRuimteAgent'
```
S4U heeft geen Windows-netwerkreferenties (gedeelde mappen), maar de uitgaande HTTPS-verbinding met de site werkt — meer heeft de agent niet nodig.

Variant B — **alleen zolang u aangemeld bent**, met verborgen venster (`-WindowStyle Hidden`; de console kan bij het aanmelden even knipperen):
```powershell
$node = (Get-Command node).Source
$act  = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -WindowStyle Hidden -Command `"& '$node' 'C:\mijn-ruimte-agent\agent.mjs' run`"" -WorkingDirectory 'C:\mijn-ruimte-agent'
$trig = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
$set  = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName 'MijnRuimteAgent' -Action $act -Trigger $trig -Settings $set -RunLevel Limited
```
Controleren: `Get-ScheduledTask MijnRuimteAgent | Get-ScheduledTaskInfo` (LastTaskResult 267009 = draait) en op de site «verbonden».
Stoppen/weghalen: `Stop-ScheduledTask -TaskName MijnRuimteAgent`, `Unregister-ScheduledTask -TaskName MijnRuimteAgent -Confirm:$false`.
Nooit `-RunLevel Highest` en nooit als SYSTEM: dan heeft elke PowerShell-opdracht beheerdersrechten.

## 4. Wat mag en wat niet
- Alleen programma’s uit `--allow` (geen shell, argumenten letterlijk) en PowerShell als één vast programma
  (`powershell.exe -NoProfile -NonInteractive -Command <tekst>`, `shell:false`, nooit `cmd.exe`).
- `cmd`, `bash`, `wsl`, `runas`, `sudo`, `node -e`, `python -c`: nooit, ook niet via `--allow`.
- Werkmap altijd binnen `--root`; geheime plekken (`.ssh`, `.env`, `*.pem`, `.hub-agent`, …) nooit.
- PowerShell zelf is ongeremd: daarom elke opdracht bevestigen op de site, uitvoer opgenomen, journaal (`owner.terminal.opdracht`).
  Ook een AI (`uitvoeren_opdracht` met `command: "powershell"`) wacht altijd op uw klik, zelfs met een «altijd»-toestemming.
  De agent draait met de rechten van uw Windows-gebruiker — start hem niet «als administrator».
- Agenttoken: `%USERPROFILE%\.hub-agent\config.json`; intrekken op de site (Apparaten → Loskoppelen) of opnieuw `pair`.
