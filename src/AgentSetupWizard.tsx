import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Copy, Download, FileDown, LoaderCircle, Plug, ShieldCheck } from 'lucide-react';
import { api } from './platform/client';
import { emitCanonicalNotice } from './canonical-notifications';
import { Logo, type Tr } from './mcp-ui';
import { sessionBody, type Agent } from './agents-data';
import { buildAgentCommands, buildRunnerScript, looksLikePlaceholder, type Os, type Shell } from './agent-commands';
import { guessArch, nodeInstallMethods, type Arch } from './install-commands';
import './extension-wizard.css';

const ALLOW_CHOICES = ['git', 'node', 'npm', 'python', 'docker'];

const detectOs = (): Os => {
  const p = `${(navigator as unknown as { userAgentData?: { platform?: string } }).userAgentData?.platform || ''} ${navigator.platform || ''} ${navigator.userAgent}`;
  return /Win/i.test(p) ? 'windows' : /Mac/i.test(p) ? 'macos' : 'linux';
};

/** Покроковий майстер підключення ПК чи віртуальної машини: перевірка Node.js, завантаження agent.mjs, папка й дозволені команди, готові команди для вашої оболонки або готовий файл запуску, і справжній стан підключення. */
export function PairCard({ tr, reload, agents }: { tr: Tr; reload: () => Promise<void>; agents?: Agent[] }) {
  const [os, setOs] = useState<Os>(detectOs);
  const [shell, setShell] = useState<Shell>(() => (detectOs() === 'windows' ? 'powershell' : 'bash'));
  const [name, setName] = useState(() => tr('Мій ПК', 'Mijn pc'));
  const [rootsText, setRootsText] = useState('');
  const [allow, setAllow] = useState<string[]>([]); // audit H3: standaard niets; de gebruiker kiest zelf (node en python mogen nooit code als tekst uitvoeren, zie agent.mjs)
  const [pairing, setPairing] = useState<{ code: string; expiresAt: number } | null>(null);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [copied, setCopied] = useState('');
  const [agentInfo, setAgentInfo] = useState<{ file: string; sha256: string } | null>(null);
  const [open, setOpen] = useState('');
  const [arch, setArch] = useState<Arch>(() => guessArch(navigator.userAgent, navigator.platform));
  const [nodeMethod, setNodeMethod] = useState('');
  const baseline = useRef<Set<string> | null>(null);

  useEffect(() => { fetch('/downloads/extension-version.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : {})).then((j) => setAgentInfo((j as { agent?: { file: string; sha256: string } }).agent ?? null)).catch(() => undefined); }, []);
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(t); }, []);

  const nodeMethods = useMemo(() => nodeInstallMethods(os, arch), [os, arch]);
  const activeNode = nodeMethods.find((m) => m.id === nodeMethod) ?? nodeMethods[0];
  const roots = rootsText.split(/\r?\n/).map((r) => r.trim()).filter(Boolean);
  const rootProblem = !roots.length ? tr('Вкажіть хоча б одну папку, до якої агент матиме доступ.', 'Geef minstens één map op waartoe de agent toegang krijgt.')
    : roots.some(looksLikePlaceholder) ? tr('У шляху не повинно бути символів < > " | ? * і слів-підказок. Напишіть справжній шлях, наприклад T:\\ або C:\\Projects.', 'Het pad mag geen tekens < > " | ? * of voorbeeldwoorden bevatten. Schrijf een echt pad, bijvoorbeeld T:\\ of C:\\Projects.') : '';
  const cleanName = name.replace(/["\r\n]/g, '').trim().slice(0, 60) || tr('Мій ПК', 'Mijn pc');
  const left = pairing ? Math.max(0, Math.round((pairing.expiresAt - now) / 1000)) : 0;
  const expired = !!pairing && left === 0;

  const commands = useMemo(() => (pairing && !rootProblem ? buildAgentCommands({ shell, server: location.origin, code: pairing.code, name: cleanName, roots, allow }) : []), [pairing, rootProblem, shell, cleanName, rootsText, allow]);

  // Справжній стан: щойно в списку з’являється новий агент у мережі, повідомляємо про успіх.
  useEffect(() => {
    if (!agents) return;
    if (baseline.current === null) { baseline.current = new Set(agents.map((a) => a.id)); return; }
    const fresh = agents.find((a) => a.platform !== 'browser' && !baseline.current!.has(a.id));
    if (fresh) {
      baseline.current = new Set(agents.map((a) => a.id));
      emitCanonicalNotice({ text: tr(`Пристрій «${fresh.name}» підключено`, `Apparaat «${fresh.name}» is gekoppeld`), kind: 'success', source: 'mcp', link: { href: `https://mcp.tarasevych.com/agents#dev:${fresh.id}`, label: tr('Відкрити пристрій', 'Apparaat openen') } });
      setPairing(null);
    }
  }, [agents]);

  const createCode = async () => {
    setBusy(true); setNotice('');
    try { const res = await api.post('/api/owner/agents/pairing-code', sessionBody()); setPairing({ code: String(res.data.code), expiresAt: Number(res.data.expiresAt) }); await reload(); }
    catch { setNotice(tr('Не вдалося створити код (ліміт: 5 за 10 хвилин).', 'Code aanmaken mislukt (limiet: 5 per 10 minuten).')); }
    setBusy(false);
  };
  const copy = async (id: string, text: string) => { try { await navigator.clipboard?.writeText(text); setCopied(id); window.setTimeout(() => setCopied(''), 1800); } catch { /* geen klembord */ } };
  const download = () => {
    const runner = buildRunnerScript(os, commands);
    const blob = new Blob([runner.text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = runner.file; document.body.append(a); a.click(); a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  const checkCmd = shell === 'bash' ? `shasum -a 256 agent.mjs` : shell === 'cmd' ? 'certutil -hashfile agent.mjs SHA256' : 'Get-FileHash agent.mjs -Algorithm SHA256';
  const section = (id: string, n: number, title: string, done: boolean, body: React.ReactNode) => {
    const isOpen = open === id || (open === '' && ((id === 'node') || (id === 'code' && !!pairing)));
    return (
      <li className={`wiz-step ${done ? 'done' : 'later'}`} data-step={id}>
        <button type='button' className='wiz-step-head' aria-expanded={isOpen} onClick={() => setOpen(isOpen ? `closed-${id}` : id)}>
          <span className='wiz-num' aria-hidden='true'>{done ? <Check /> : n}</span><span className='wiz-title'>{title}</span><ChevronDown className='wiz-chev' aria-hidden='true' />
        </button>
        {isOpen && !open.startsWith('closed-') ? <div className='wiz-step-body'>{body}</div> : null}
        {open === `closed-${id}` ? null : null}
      </li>
    );
  };

  return (
    <div className='wiz' data-agents-pairing={pairing ? 'true' : undefined}>
      <div className='wiz-head'>
        <span className='wiz-badge'><Plug aria-hidden='true' />{tr('Підключення ПК чи віртуальної машини', 'Pc of virtuele machine koppelen')}</span>
        <h3>{tr('Агент на вашому комп’ютері: покроково', 'De agent op uw computer: stap voor stap')}</h3>
        <p>{tr('Агент — маленька програма (один файл agent.mjs). Вона сама підключається до сайту (відкривати порти не треба) і бачить лише папки та команди, які ви тут дозволите.', 'De agent is een klein programma (één bestand agent.mjs). Hij verbindt zelf met de site (geen poorten openzetten) en ziet alleen de mappen en commando\'s die u hier toestaat.')}</p>
      </div>
      <div className='wiz-os' role='group' aria-label={tr('Ваша система й оболонка', 'Uw systeem en shell')}>
        {([['windows', 'Windows'], ['macos', 'macOS'], ['linux', 'Linux']] as Array<[Os, string]>).map(([k, label]) => (
          <button key={k} type='button' aria-pressed={os === k} onClick={() => { setOs(k); setShell(k === 'windows' ? 'powershell' : 'bash'); }}><Logo kind={k === 'windows' ? 'windows' : k === 'macos' ? 'macos' : 'linux'} size={18} label={label} />{label}</button>
        ))}
        <span aria-hidden='true' style={{ width: 8 }} />
        {(os === 'windows' ? [['powershell', 'PowerShell'], ['cmd', tr('Командний рядок', 'Opdrachtprompt')]] : [['bash', 'Terminal (bash/zsh)']]).map(([k, label]) => (
          <button key={k} type='button' aria-pressed={shell === k} onClick={() => setShell(k as Shell)}>{label}</button>
        ))}
      </div>
      <ol className='wiz-steps'>
        {section('node', 1, tr('Встановіть Node.js 22 або новіший', 'Installeer Node.js 22 of nieuwer'), false, (
          <>
            <p>{tr('Оберіть архітектуру й спосіб, як на nodejs.org: команди й підказки змінюються. Уже встановлено? Перевірте командою нижче: вона має показати v22 або більше.', 'Kies architectuur en methode, zoals op nodejs.org: de commando\'s en tips veranderen mee. Al geïnstalleerd? Controleer met het commando hieronder: het moet v22 of hoger tonen.')}</p>
            <div className='wiz-os' role='group' aria-label={tr('Архітектура', 'Architectuur')}>
              {(['x64', 'arm64'] as Arch[]).map((k) => <button key={k} type='button' aria-pressed={arch === k} onClick={() => { setArch(k); setNodeMethod(''); }}>{k === 'x64' ? 'x64 (Intel/AMD)' : 'ARM64'}</button>)}
            </div>
            <div className='wiz-tabs' role='tablist' aria-label={tr('Спосіб встановлення Node.js', 'Installatiemethode van Node.js')}>
              {nodeMethods.map((m) => <button key={m.id} type='button' role='tab' aria-selected={activeNode.id === m.id} onClick={() => setNodeMethod(m.id)}>{m.label}{m.official ? '' : ' *'}</button>)}
            </div>
            <p className='wiz-note'>{tr(activeNode.note[0], activeNode.note[1])}</p>
            {activeNode.commands.map((c, i) => (
              <div key={i} className='wiz-copy'><b>{i + 1}.</b><code>{c}</code><button type='button' onClick={() => void copy(`n${i}`, c)}>{copied === `n${i}` ? <Check aria-hidden='true' /> : <Copy aria-hidden='true' />}{tr('Копіювати', 'Kopiëren')}</button></div>
            ))}
            {activeNode.link ? <a className='wiz-primary' href={activeNode.link.href} target='_blank' rel='noopener noreferrer'><Download aria-hidden='true' />{tr(`Відкрити ${activeNode.link.label}`, `Open ${activeNode.link.label}`)}</a> : null}
            <div className='wiz-copy'><code>node -v</code><button type='button' onClick={() => void copy('nodev', 'node -v')}>{copied === 'nodev' ? <Check aria-hidden='true' /> : <Copy aria-hidden='true' />}{tr('Копіювати', 'Kopiëren')}</button></div>
            <p className='wiz-note'>{tr('* неофіційний спосіб. Після встановлення відкрийте новий термінал.', '* niet-officiële methode. Open na de installatie een nieuwe terminal.')}</p>
          </>
        ))}
        {section('file', 2, tr('Завантажте agent.mjs', 'Download agent.mjs'), false, (
          <>
            <p>{tr('Покладіть файл в окрему папку, наприклад Документи\\MijnRuimte-agent. Агент запускається саме звідти.', 'Zet het bestand in een eigen map, bijvoorbeeld Documenten\\MijnRuimte-agent. De agent wordt vanuit die map gestart.')}</p>
            <a className='wiz-primary' href='/downloads/agent.mjs' download><Download aria-hidden='true' />{tr('Завантажити agent.mjs', 'Download agent.mjs')}</a>
            {agentInfo ? <p className='wiz-note'>{tr('Перевірте файл (за бажанням): ця команда має показати суму', 'Controleer het bestand (optioneel): dit commando moet de som tonen')} <code>{agentInfo.sha256}</code> · <code>{checkCmd}</code></p> : null}
          </>
        ))}
        {section('folder', 3, tr('Оберіть папки й дозволені команди', 'Kies mappen en toegestane commando\'s'), !rootProblem, (
          <>
            <label className='wiz-field'>{tr('Назва пристрою', 'Naam van het apparaat')}<input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} /></label>
            <label className='wiz-field'>{tr('Папки, до яких агент матиме доступ (по одній у рядок)', 'Mappen waartoe de agent toegang krijgt (één per regel)')}
              <textarea rows={3} value={rootsText} onChange={(e) => setRootsText(e.target.value)} placeholder={os === 'windows' ? 'T:\\\nC:\\Projects' : '/home/ik/projecten'} spellCheck={false} />
            </label>
            {rootProblem && rootsText ? <p className='wiz-note' role='alert' style={{ color: '#b45309' }}>{rootProblem}</p> : null}
            <fieldset className='wiz-allow'><legend>{tr('Команди, які агент може запускати (без оболонки, лише ці програми)', 'Commando\'s die de agent mag starten (zonder shell, alleen deze programma\'s)')}</legend>
              {ALLOW_CHOICES.map((c) => <label key={c}><input type='checkbox' checked={allow.includes(c)} onChange={(e) => setAllow(e.target.checked ? [...allow, c] : allow.filter((x) => x !== c))} />{c}</label>)}
            </fieldset>
            <p className='wiz-note'>{tr('Запис файлів і запуск команд завжди чекають вашого «Дозволити» на сайті, незалежно від цих налаштувань.', 'Bestanden schrijven en commando\'s starten wachten altijd op uw "Toestaan" op de site, ongeacht deze instellingen.')}</p>
          </>
        ))}
        {section('code', 4, tr('Отримайте код і запустіть', 'Haal de code op en start'), false, (
          <>
            {!pairing || expired ? (
              <>
                <p>{expired ? tr('Код прострочено. Створіть новий.', 'De code is verlopen. Maak een nieuwe.') : tr('Код одноразовий і діє 10 хвилин. Створюйте його, коли вже готові вставити команди.', 'De code werkt één keer en 10 minuten. Maak hem pas als u klaar bent om de commando\'s te plakken.')}</p>
                <button type='button' className='wiz-primary' disabled={busy || !!rootProblem} onClick={() => void createCode()}><Plug aria-hidden='true' />{tr('Створити код підключення', 'Koppelcode maken')}</button>
                {rootProblem ? <p className='wiz-note'>{tr('Спершу заповніть крок 3.', 'Vul eerst stap 3 in.')}</p> : null}
              </>
            ) : (
              <>
                <p>{tr(`Відкрийте термінал у папці з agent.mjs і вставте по черзі (код діє ще ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}):`, `Open een terminal in de map met agent.mjs en plak na elkaar (de code werkt nog ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}):`)}</p>
                {commands.map((c, i) => (
                  <div key={i} className='wiz-copy'><b>{i + 1}.</b><code>{c}</code><button type='button' onClick={() => void copy(`c${i}`, c)}>{copied === `c${i}` ? <Check aria-hidden='true' /> : <Copy aria-hidden='true' />}{tr('Копіювати', 'Kopiëren')}</button></div>
                ))}
                <p className='wiz-note'>{tr('Перша команда з’єднує агента з вашим акаунтом, друга запускає його (вікно термінала має лишатися відкритим).', 'Het eerste commando koppelt de agent aan uw account, het tweede start hem (laat het terminalvenster open).')}</p>
                {os === 'windows' ? <p className='wiz-note' role='status'>{tr('Готовий файл запуску (.cmd) для Windows 11 із «Захистом смарт-програм» блокується без можливості дозволити, тому тут лише команди для вставки в термінал.', 'Een kant-en-klaar startbestand (.cmd) wordt op Windows 11 met "Smart App Control" geblokkeerd zonder optie om het toe te staan; daarom hier alleen commando\'s om in de terminal te plakken.')}</p> : <button type='button' className='wiz-primary' onClick={download}><FileDown aria-hidden='true' />{tr(`Або завантажте готовий файл запуску (.sh)`, `Of download een kant-en-klaar startbestand (.sh)`)}</button>}
                <p className='wiz-note'>{tr(`Покладіть його поруч з agent.mjs і двічі клацніть' (спершу: chmod +x mijn-ruimte-agent.sh)': файл сам виконає обидві команди.`, `Zet het naast agent.mjs en dubbelklik' (eerst: chmod +x mijn-ruimte-agent.sh)': het bestand voert beide commando's zelf uit.`)}</p>
                <p className='wiz-wait'><LoaderCircle className='wiz-spin' aria-hidden='true' />{tr('Чекаємо на підключення пристрою… Щойно він зʼявиться, ви побачите сповіщення, а пристрій — у списку зліва.', 'Wachten tot het apparaat verbindt… Zodra het verschijnt, ziet u een melding en staat het apparaat in de lijst links.')}</p>
              </>
            )}
          </>
        ))}
      </ol>
      {notice ? <p className='wiz-note' role='status'>{notice}</p> : null}
      <p className='wiz-foot'><ShieldCheck aria-hidden='true' />{tr('Код ми не зберігаємо в файлі довше, ніж потрібно: він одноразовий. Токен агента лежить лише на вашому комп’ютері (~/.hub-agent/config.json). Відключити пристрій можна в його картці.', 'We bewaren de code nergens langer dan nodig: hij werkt één keer. Het agenttoken staat alleen op uw computer (~/.hub-agent/config.json). U koppelt het apparaat los op zijn kaart.')}</p>
    </div>
  );
}
