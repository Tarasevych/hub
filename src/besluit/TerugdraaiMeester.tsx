// «Відкат» — покроковий майстер на mcp.*/dashboard (29.10.2026, за зразком «Нове оновлення» на admin.*/updates).
// Було (22.10): одна кнопка «Підписати passkey й відкотити», після підпису — лише вертушка до 16 хв, без пояснень (власник: «я підписав,
// і з цього моменту не відбулося нічого»). Стало: два джерела (5 останніх версій на сервері або .tar.gz з пристрою), п'ять кроків
// 1 Файл → 2 Перевірка → 3 Завантаження → 4 Схвалення → 5 Встановлення, термінал наживо, прогрес, результат завжди видно.
// Якщо служба сервера не забрала рішення за 60 с — чітке повідомлення з командами для перевірки (лише читання).
// Той самий шлях, що й раніше: besluit-inbox + passkey власника (RUNBOOK §15); що робить root, не змінено.
// Навмисно НЕ технічний модуль (src/besluit/): сторінка відкату відкривається, навіть коли технічні модулі не завантажуються.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, CircleDashed, ClipboardCopy, Fingerprint, FolderArchive, HardDrive, Loader2, PackageCheck, Rocket, Server, UploadCloud, Undo2, X, XCircle, type LucideIcon } from 'lucide-react';
import HulpVraag from '../hulp/HulpVraag';
import { kanPasskey } from '../platform/webauthn';
import { leesPakket, type PakketInfo } from '../platform/tar-lezen';
import { besluitCodeTekst, type BesluitUit } from '../../shared/eigenaar-besluit';
import BesluitStand, { type LeefStand } from './BesluitStand';
import { besluitFoutCode, besluitOndertekenen, besluitOverzicht, besluitStarten, besluitVolgen, type BesluitContext, type Gestart, type Overzicht, type RootRegel, type StatusAntwoord } from './besluit-client';
import { kiesUitPakket, nietOpgepakt, regelsSamenvoegen, vijfLaatste, WACHT_OPPAKKEN_S, type Keuze, type TermRegel } from './terugdraai-logica';
import './besluit.css';

type Tr = (uk: string, nl: string) => string;
type Props = { tr: Tr; ctx: BesluitContext; open: boolean; onSluit: () => void; /** Після виконаного відкату — перечитати стан сервера в картці. */ onKlaar?: () => void };
type StapId = 'bestand' | 'controle' | 'upload' | 'goedkeuren' | 'installeren';
const STAPPEN: Array<{ id: StapId; Icoon: LucideIcon; uk: string; nl: string }> = [
  { id: 'bestand', Icoon: FolderArchive, uk: 'Файл', nl: 'Bestand' },
  { id: 'controle', Icoon: PackageCheck, uk: 'Перевірка', nl: 'Controle' },
  { id: 'upload', Icoon: UploadCloud, uk: 'Завантаження', nl: 'Uploaden' },
  { id: 'goedkeuren', Icoon: Fingerprint, uk: 'Схвалення', nl: 'Goedkeuren' },
  { id: 'installeren', Icoon: Rocket, uk: 'Встановлення', nl: 'Installeren' },
];
const DIAGNOSE = ['systemctl status mijn-ruimte-besluit.path mijn-ruimte-besluit.service', 'sudo journalctl -u mijn-ruimte-besluit -n 100', 'sudo ls -l /srv/mijn-ruimte/besluit-inbox'];
const versieDatum = (v: string) => { const m = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})$/.exec(v); return m ? `${m[3]}.${m[2]}.${m[1]} ${m[4]}:${m[5]}` : v; };
const nuIso = () => new Date().toISOString();
const tijdKort = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' }); };

const PAKKET_FOUT: Record<string, [string, string]> = {
  PAKKET_KAPOT: ['Файл не є правильним пакетом Mijn Ruimte (немає версії або вміст пошкоджено).', 'Het bestand is geen geldig Mijn Ruimte-pakket (geen versie of beschadigde inhoud).'],
  NIET_OP_SERVER: ['Цієї версії немає на сервері. Відкотитися можна лише на версію, що вже лежить на сервері: старіший пакет сервер не встановлює. Новіший пакет ставиться через «Оновлення сервера» на admin.', 'Deze versie staat niet op de server. Terugdraaien kan alleen naar een versie die al op de server staat: een ouder pakket installeert de server niet. Een nieuwer pakket gaat via «Serverupdates» op admin.'],
  IS_ACTIEF: ['Ця версія вже працює зараз — відкочувати нема на що.', 'Deze versie draait nu al — er is niets terug te draaien.'],
  ONVOLLEDIG: ['Ця версія на сервері неповна (немає зібраного коду). Оберіть іншу.', 'Deze versie op de server is onvolledig (geen gebouwde code). Kies een andere.'],
  COMMIT_VERSCHILT: ['Номер версії збігається, але код у файлі інший, ніж на сервері (інший BRON-COMMIT). Відкат зупинено для безпеки.', 'Het versienummer klopt, maar de code in het bestand verschilt van die op de server (andere BRON-COMMIT). Terugdraaien gestopt voor de veiligheid.'],
};

export default function TerugdraaiMeester({ tr, ctx, open, onSluit, onKlaar }: Props) {
  const lang = tr('uk', 'nl') as 'uk' | 'nl';
  const trRef = useRef(tr); trRef.current = tr;
  const klaarRef = useRef(onKlaar); klaarRef.current = onKlaar;
  const [ov, setOv] = useState<Overzicht | null>(null);
  const [laadFout, setLaadFout] = useState('');
  const [bron, setBron] = useState<'server' | 'apparaat'>('server');
  const [keuze, setKeuze] = useState<Keuze | null>(null);
  const [bestand, setBestand] = useState<{ naam: string; grootte: number; info: PakketInfo; sha256: string } | null>(null);
  const [pakketFout, setPakketFout] = useState('');
  const [leest, setLeest] = useState(false);
  const [bezig, setBezig] = useState<'' | 'starten' | 'passkey' | 'volgen'>('');
  const [fout, setFout] = useState('');
  const [gestart, setGestart] = useState<Gestart | null>(null);
  const [leef, setLeef] = useState<LeefStand>({ besluit: null });
  const [laatste, setLaatste] = useState<StatusAntwoord | null>(null);
  const [lokaal, setLokaal] = useState<TermRegel[]>([]);
  const [geenAntwoord, setGeenAntwoord] = useState(false);
  const [gekopieerd, setGekopieerd] = useState(false);
  const weg = useRef<AbortController | null>(null);
  const termBak = useRef<HTMLDivElement>(null);
  const log = useCallback((niveau: TermRegel['niveau'], uk: string, nl: string) => setLokaal((l) => [...l, { tijd: nuIso(), niveau, tekst: trRef.current(uk, nl), bron: 'site' }]), []);

  const laden = useCallback(async () => {
    setLaadFout('');
    try { const d = await besluitOverzicht(ctx); setOv(d); const v = vijfLaatste(d.stand.releases); setKeuze((k) => k || v.find((x) => x.vorige) || v[0] || null); }
    catch { setLaadFout(trRef.current('Не вдалося завантажити список версій із сервера. Оновіть сторінку; якщо не допоможе — сервер не відповідає.', 'De lijst met versies kon niet van de server worden geladen. Vernieuw de pagina; helpt dat niet, dan antwoordt de server niet.')); }
  }, [ctx]);
  const opnieuw = useCallback(() => { weg.current?.abort(); setGestart(null); setLeef({ besluit: null }); setLaatste(null); setFout(''); setBezig(''); setLokaal([]); setGeenAntwoord(false); }, []);
  useEffect(() => { if (open) { void laden(); } else { opnieuw(); setBestand(null); setPakketFout(''); setKeuze(null); setBron('server'); } }, [open, laden, opnieuw]);
  useEffect(() => () => weg.current?.abort(), []);

  const serverRegels = useMemo<TermRegel[]>(() => (laatste?.gebeurtenissen || []).map((g: RootRegel) => ({ tijd: g.tijd, niveau: g.niveau === 'error' ? 'error' : g.niveau === 'warn' ? 'warn' : g.code === 'TERUG_OK' ? 'ok' : 'info', tekst: `${g.code ? `[${g.code}] ` : ''}${lang === 'uk' ? g.uk : g.nl}`, bron: 'server' })), [laatste, lang]);
  const regels = useMemo(() => regelsSamenvoegen(lokaal, serverRegels), [lokaal, serverRegels]);
  useEffect(() => { const el = termBak.current; if (el) el.scrollTop = el.scrollHeight; }, [regels.length]);

  const volg = useCallback(async (id: string) => {
    setBezig('volgen');
    const ac = new AbortController(); weg.current = ac;
    let vorigeStaat = '', pauzeGemeld = false, wachtGemeld = false, opgepaktGemeld = false;
    const eind = await besluitVolgen(ctx, id, (s) => {
      if ('pauze' in s) {
        setLeef((l) => ({ ...l, pauze: s.fout }));
        if (!pauzeGemeld) { pauzeGemeld = true; log('warn', 'Сайт не відповідає — найімовірніше, служба перезапускається на іншу версію. Чекаю…', 'De site antwoordt niet — waarschijnlijk herstart de dienst op de andere versie. Ik wacht…'); }
        return;
      }
      if (pauzeGemeld) { pauzeGemeld = false; log('info', 'Сайт знову відповідає.', 'De site antwoordt weer.'); }
      setLeef({ besluit: s.besluit, pauze: '' }); setLaatste(s);
      const v = s.verwerking;
      if (v && !v.inInbox && !opgepaktGemeld && s.besluit.staat === 'ondertekend') { opgepaktGemeld = true; log('info', 'Служба сервера забрала рішення й перевіряє підпис.', 'De dienst op de server haalde het besluit op en controleert de handtekening.'); }
      if (nietOpgepakt(v) && !wachtGemeld) { wachtGemeld = true; log('error', `Служба сервера не забрала рішення за ${WACHT_OPPAKKEN_S} с. Перевірте її командами нижче.`, `De dienst op de server haalde het besluit niet op binnen ${WACHT_OPPAKKEN_S} s. Kijk haar na met de opdrachten hieronder.`); }
      if (s.besluit.staat !== vorigeStaat) {
        vorigeStaat = s.besluit.staat;
        const t = lang === 'uk' ? s.besluit.uitkomst?.uk : s.besluit.uitkomst?.nl;
        if (s.besluit.staat === 'klaar') log('ok', `Відкат виконано. Активна версія: ${s.stand.actief || '—'}.`, `Terugdraaien uitgevoerd. Actieve versie: ${s.stand.actief || '—'}.`);
        else if (s.besluit.staat !== 'ondertekend') log('error', `${t || besluitCodeTekst('uk', s.besluit.code)} (${s.besluit.code})`, `${t || besluitCodeTekst('nl', s.besluit.code)} (${s.besluit.code})`);
        if (s.nacontrole) log(s.nacontrole.ok ? 'ok' : 'error', s.nacontrole.ok ? 'Перевірка після відкату: технічний простір і технічні сторінки відкриваються.' : 'Перевірка після відкату: технічні сторінки НЕ відкриваються.', s.nacontrole.ok ? 'Controle na het terugdraaien: technische ruimte en technische pagina’s openen.' : 'Controle na het terugdraaien: technische pagina’s openen NIET.');
      }
    }, { signal: ac.signal });
    setBezig('');
    if (!eind && !ac.signal.aborted) { setGeenAntwoord(true); log('error', 'За 16 хвилин сервер так і не відповів. Нічого не змінено або результат невідомий — перевірте командами нижче.', 'In 16 minuten antwoordde de server niet. Niets gewijzigd of uitkomst onbekend — kijk na met de opdrachten hieronder.'); }
    if (eind?.besluit.staat === 'klaar') klaarRef.current?.();
  }, [ctx, lang, log]);

  const onderteken = useCallback(async (g: Gestart) => {
    setFout(''); setBezig('passkey');
    log('info', 'Крок 4: чекаю підтвердження passkey на телефоні або ключі…', 'Stap 4: wacht op de passkey-bevestiging op telefoon of sleutel…');
    try {
      const b: BesluitUit = await besluitOndertekenen(ctx, g);
      log('ok', 'Підпис прийнято. Рішення покладено в папку для служби сервера.', 'Handtekening aanvaard. Het besluit ligt in de map voor de dienst op de server.');
      setLeef({ besluit: b });
      log('info', 'Крок 5: сервер перевіряє підпис і перемикає версію…', 'Stap 5: de server controleert de handtekening en wisselt de versie…');
      if (b.staat === 'ondertekend') await volg(b.id); else { setBezig(''); if (b.staat === 'klaar') klaarRef.current?.(); }
    } catch (e) {
      const code = besluitFoutCode(e);
      setBezig('');
      if (code === 'PASSKEY_GEANNULEERD') { setFout(trRef.current('Підпис скасовано або не вдався. Натисніть «Підтвердити passkey ще раз».', 'De handtekening is geannuleerd of mislukt. Klik op «Passkey opnieuw bevestigen».')); log('warn', 'Підпис скасовано.', 'Handtekening geannuleerd.'); }
      else { setGestart(null); const t = besluitCodeTekst(lang, code) || code; setFout(t); log('error', `${t} (${code})`, `${t} (${code})`); }
    }
  }, [ctx, lang, log, volg]);

  const voorbereiden = useCallback(async () => {
    if (!ov?.stand.actief || !keuze) return;
    setFout(''); setBezig('starten'); setLeef({ besluit: null }); setLokaal([]); setGeenAntwoord(false);
    log('info', `Крок 3: готую рішення ${ov.stand.actief} → ${keuze.naam}…`, `Stap 3: besluit voorbereiden ${ov.stand.actief} → ${keuze.naam}…`);
    try {
      const g = await besluitStarten(ctx, 'terugdraaien', { van: ov.stand.actief, naar: keuze.naam });
      setGestart(g); setBezig('');
      log('ok', `Рішення готове (відбиток ${g.hash.slice(0, 16)}…). Код версії вже на сервері — завантажувати нічого не треба.`, `Besluit klaar (vingerafdruk ${g.hash.slice(0, 16)}…). De code van de versie staat al op de server — er hoeft niets te worden geüpload.`);
    } catch (e) { setBezig(''); const c = besluitFoutCode(e); const t = besluitCodeTekst(lang, c) || c; setFout(t); log('error', `${t} (${c})`, `${t} (${c})`); }
  }, [ctx, keuze, lang, log, ov]);

  const kiesBestand = useCallback(async (f: File | null | undefined) => {
    setBestand(null); setPakketFout(''); if (!f || !ov) return;
    setLeest(true);
    try {
      const { info, sha256 } = await leesPakket(f);
      setBestand({ naam: f.name, grootte: f.size, info, sha256 });
      const u = kiesUitPakket(info, ov.stand.releases);
      if (u.ok) setKeuze(u.keuze); else { setKeuze(null); setPakketFout(trRef.current(...PAKKET_FOUT[u.code])); }
    } catch { setPakketFout(trRef.current('Файл не вдалося прочитати на цьому пристрої. Спробуйте ще раз або оберіть версію з сервера.', 'Het bestand kon op dit apparaat niet worden gelezen. Probeer opnieuw of kies een versie van de server.')); }
    finally { setLeest(false); }
  }, [ov]);

  if (!open) return null;
  const s = ov?.stand;
  const keuzes = s ? vijfLaatste(s.releases) : [];
  const blok = !s ? '' : !s.schakelaars.terugdraaienPasskey ? besluitCodeTekst(lang, 'BESLUIT_UIT')
    : !(ov?.passkeys.length) ? besluitCodeTekst(lang, 'GEEN_PASSKEY')
    // 29.10.2026: proefschrijven in besluit-inbox; vroeger merkte niemand dat de app er niet in mocht (EROFS) — de handtekening ging verloren.
    : ov?.inbox && !ov.inbox.schrijfbaar ? `${besluitCodeTekst(lang, ov.inbox.code || 'INBOX_SCHRIJFFOUT')} (${ov.inbox.detail})`
    : !kanPasskey() ? tr('Відкрийте цю сторінку в браузері з підтримкою passkey.', 'Open deze pagina in een browser die passkeys ondersteunt.')
    : !keuzes.length ? tr('На сервері немає іншої повної версії, на яку можна повернутися.', 'Er staat geen andere volledige versie op de server om naar terug te gaan.') : '';
  const b = leef.besluit;
  const eind = !!b && ['klaar', 'geweigerd', 'mislukt', 'verlopen'].includes(b.staat);
  const controleOk = !!keuze && !blok && (bron === 'server' || (!!bestand && !pakketFout));
  const huidig: StapId = b || bezig === 'volgen' ? 'installeren' : gestart || bezig === 'passkey' ? 'goedkeuren' : bezig === 'starten' ? 'upload' : controleOk ? 'upload' : keuze || bestand ? 'controle' : 'bestand';
  const idx = STAPPEN.findIndex((x) => x.id === huidig);
  const standVan = (i: number): 'ok' | 'bezig' | 'fout' | 'wacht' => {
    if (i < idx) return 'ok';
    if (i > idx) return 'wacht';
    if (huidig === 'installeren' && b?.staat === 'klaar') return 'ok';
    if (huidig === 'installeren' && eind) return 'fout';
    if (fout) return 'fout';
    return 'bezig';
  };
  const pct = b?.staat === 'klaar' ? 100 : eind ? 100 : Math.round(((idx + (bezig ? 0.5 : 0)) / STAPPEN.length) * 100);
  const wachtMelding = nietOpgepakt(laatste?.verwerking) || geenAntwoord || (b?.staat === 'verlopen' && b.code === 'GEEN_UITKOMST');
  const kopieer = async () => { try { await navigator.clipboard.writeText(DIAGNOSE.join('\n')); setGekopieerd(true); window.setTimeout(() => setGekopieerd(false), 1800); } catch { /* klembord niet beschikbaar */ } };
  const vastgezet = !!gestart || !!b || !!bezig;

  return <div className='bsl-schaduw bsl-schaduw-pagina'>
    <section className='bsl-meester bsl-pagina' role='dialog' aria-modal='true' aria-labelledby='bsl-terug-titel' data-besluit-meester='terugdraaien' data-stap={huidig}>
      <header className='bsl-kop'>
        <h2 id='bsl-terug-titel'><Undo2 size={18} aria-hidden='true' />{tr('Відкат на іншу версію', 'Terugdraaien naar een andere versie')}</h2>
        <button type='button' className='bsl-x' onClick={onSluit} disabled={bezig === 'passkey'} aria-label={tr('Закрити', 'Sluiten')}><X size={18} aria-hidden='true' /></button>
      </header>
      <p className='bsl-lead'>{tr('Оберіть версію — сайт сам проведе вас крок за кроком: перевірить її, підготує рішення, попросить підпис passkey і покаже, що робить сервер.', 'Kies een versie — de site leidt u stap voor stap: controleert ze, bereidt het besluit voor, vraagt de passkey-handtekening en toont wat de server doet.')}</p>

      <ol className='bsl-stappen' aria-label={tr('Кроки', 'Stappen')}>
        {STAPPEN.map((st, i) => { const stand = standVan(i); const I = stand === 'ok' ? CheckCircle2 : stand === 'fout' ? XCircle : stand === 'bezig' ? st.Icoon : CircleDashed;
          return <li key={st.id} data-stand={stand} aria-current={i === idx ? 'step' : undefined}><span className='bsl-stap-nr'><I size={16} aria-hidden='true' /></span><span className='bsl-stap-naam'>{i + 1}. {tr(st.uk, st.nl)}</span></li>; })}
      </ol>
      <div className='bsl-balk' role='progressbar' aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={tr('Перебіг', 'Voortgang')}><i style={{ width: `${pct}%` }} data-stand={b?.staat === 'klaar' ? 'ok' : eind || fout ? 'fout' : 'bezig'} /></div>

      {laadFout && <p className='bsl-fout' role='alert'>{laadFout} <button type='button' className='bsl-knop' onClick={() => void laden()}>{tr('Спробувати ще раз', 'Opnieuw proberen')}</button></p>}
      {!s && !laadFout && <p className='bsl-stil' role='status'><Loader2 size={14} className='bsl-spin' aria-hidden='true' /> {tr('Завантажую версії з сервера…', 'Versies van de server laden…')}</p>}

      {s && <>
        <section className='bsl-blok' data-blok='bron' aria-disabled={vastgezet}>
          <h3>1. {tr('Звідки взяти версію', 'Waar de versie vandaan komt')} <HulpVraag k='besluit.terugdraaien-bron' meer={[['besluit.terugdraaien-naar', 'На яку версію повернути', 'Naar welke versie terug']]} lang={lang} /></h3>
          <div className='bsl-seg' role='radiogroup' aria-label={tr('Джерело', 'Bron')}>
            <button type='button' role='radio' aria-checked={bron === 'server'} disabled={vastgezet} data-hulp='besluit.terugdraaien-bron' onClick={() => { setBron('server'); setBestand(null); setPakketFout(''); setKeuze(keuzes.find((x) => x.vorige) || keuzes[0] || null); }} data-bron='server'><Server size={16} aria-hidden='true' />{tr('5 останніх на сервері', '5 laatste op de server')}</button>
            <button type='button' role='radio' aria-checked={bron === 'apparaat'} disabled={vastgezet} data-hulp='besluit.terugdraaien-bron' onClick={() => { setBron('apparaat'); setKeuze(null); }} data-bron='apparaat'><HardDrive size={16} aria-hidden='true' />{tr('Файл з пристрою', 'Bestand van dit apparaat')}</button>
          </div>
          {bron === 'server' ? <><p className='bsl-stil'>{tr('На яку версію повернути', 'Naar welke versie terug')}</p><ul className='bsl-keuzes' role='radiogroup' aria-label={tr('Версія', 'Versie')}>
            {keuzes.map((k) => <li key={k.naam}><label className='bsl-keuze' data-gekozen={keuze?.naam === k.naam}>
              <input type='radio' name='bsl-naar' value={k.naam} checked={keuze?.naam === k.naam} disabled={vastgezet} onChange={() => setKeuze(k)} data-hulp='besluit.terugdraaien-naar' />
              <span><b className='bsl-mono'>{versieDatum(k.versie || k.naam)}</b>{k.vorige && <em className='bsl-label'>{tr('попередня', 'vorige')}</em>}
                <small>{[k.auteur, k.agent].filter(Boolean).join(' · ') || tr('автор невідомий', 'auteur onbekend')} · {k.bronCommit ? (k.bronCommit.startsWith('zonder-git:') ? tr('поза git', 'buiten git') : k.bronCommit.slice(0, 10)) : tr('коміт невідомий', 'commit onbekend')}</small>
                {k.samenvatting && <small className='bsl-samenvatting'>{k.samenvatting.slice(0, 160)}{k.samenvatting.length > 160 ? '…' : ''}</small>}</span>
            </label></li>)}
          </ul></> : <div className='bsl-bestand'>
            <label className='bsl-knop bsl-bestand-kies'><FolderArchive size={16} aria-hidden='true' />{leest ? tr('Читаю файл…', 'Bestand lezen…') : tr('Обрати .tar.gz', 'Kies .tar.gz')}
              <input type='file' accept='.tar.gz,.tgz,application/gzip' disabled={vastgezet || leest} onChange={(e) => void kiesBestand(e.target.files?.[0])} data-hulp-vrij='bestand' /></label>
            {bestand && <p className='bsl-stil bsl-mono'>{bestand.naam} · {(bestand.grootte / 1048576).toFixed(1)} MB · sha256 {bestand.sha256.slice(0, 16)}…</p>}
          </div>}
        </section>

        <section className='bsl-blok' data-blok='controle'>
          <h3>2. {tr('Перевірка', 'Controle')}</h3>
          <ul className='bsl-controles'>
            <li data-ok={!!s.actief}><b>{tr('Зараз працює', 'Draait nu')}:</b> <span className='bsl-mono'>{s.actief || '—'}</span></li>
            <li data-ok={!!keuze}><b>{tr('Повернути на', 'Terug naar')}:</b> <span className='bsl-mono'>{keuze ? keuze.naam : '—'}</span></li>
            {bron === 'apparaat' && bestand && <li data-ok={!pakketFout}><b>{tr('Файл', 'Bestand')}:</b> {tr('версія', 'versie')} {bestand.info.versie || '—'} · {[bestand.info.auteur, bestand.info.agent].filter(Boolean).join(' · ') || '—'}{!pakketFout && keuze ? ` · ${tr('збігається з версією на сервері', 'komt overeen met de versie op de server')}` : ''}</li>}
            <li data-ok={!!s.schakelaars.terugdraaienPasskey && !!ov?.passkeys.length}><b>Passkey:</b> {ov?.passkeys.length ? ov.passkeys.map((p) => p.label || 'passkey').join(', ') : tr('немає', 'geen')}</li>
          </ul>
          {pakketFout && <p className='bsl-fout' role='alert' data-pakket-fout>{pakketFout}</p>}
          {blok && <p className='bsl-fout' role='alert' data-besluit-blok>{blok}</p>}
          {keuze?.samenvatting && <details className='bsl-stand-detail'><summary>{tr('Що в цій версії (опис з пакета)', 'Wat er in deze versie zit (beschrijving uit het pakket)')}</summary><pre>{keuze.samenvatting}</pre></details>}
          <p className='bsl-waarschuwing'><AlertTriangle size={16} aria-hidden='true' /><span>{tr('База даних не повертається назад: старіша версія може не знати нових полів. Служба перезапуститься, сторінки кілька секунд не відповідатимуть. Не частіше ніж раз на 10 хвилин.', 'De database gaat niet terug: een oudere versie kent nieuwe velden misschien niet. De dienst herstart; pagina’s antwoorden enkele seconden niet. Hoogstens één keer per 10 minuten.')}</span></p>
        </section>

        <div className='bsl-acties'>
          {!gestart && !b && <button type='button' className='bsl-knop bsl-knop-primair' disabled={!controleOk || !!bezig} onClick={() => void voorbereiden()} data-besluit-knop='voorbereiden'>
            {bezig === 'starten' ? <><Loader2 size={16} className='bsl-spin' aria-hidden='true' />{tr('Готую рішення…', 'Besluit voorbereiden…')}</> : <><UploadCloud size={16} aria-hidden='true' />{tr('3. Підготувати рішення', '3. Besluit voorbereiden')}</>}</button>}
          {gestart && !b && <button type='button' className='bsl-knop bsl-knop-primair' disabled={!!bezig} onClick={() => void onderteken(gestart)} data-besluit-knop='ondertekenen'>
            {bezig === 'passkey' ? <><Loader2 size={16} className='bsl-spin' aria-hidden='true' />{tr('Підтвердіть на телефоні або ключі…', 'Bevestig op uw telefoon of sleutel…')}</> : <><Fingerprint size={16} aria-hidden='true' />{fout ? tr('Підтвердити passkey ще раз', 'Passkey opnieuw bevestigen') : tr('4. Підписати passkey й відкотити', '4. Ondertekenen met passkey en terugdraaien')}</>}</button>}
          {!b && <button type='button' className='bsl-knop' onClick={onSluit} disabled={bezig === 'passkey'}>{tr('Скасувати', 'Annuleren')}</button>}
        </div>
        {fout && <p className='bsl-fout' role='alert' data-besluit-fout>{fout}</p>}

        {(lokaal.length > 0 || b) && <section className='bsl-blok' data-blok='installeren'>
          <h3>5. {tr('Встановлення', 'Installeren')} <HulpVraag k='besluit.terugdraaien-wacht' lang={lang} /></h3>
          <BesluitStand tr={tr} stand={leef} />
          {laatste?.verwerking && b?.staat === 'ondertekend' && <p className='bsl-stil' data-verwerking={laatste.verwerking.inInbox ? 'wacht' : 'opgepakt'}>{laatste.verwerking.inInbox
            ? tr(`Рішення чекає на службу сервера: ${laatste.verwerking.seconden} с з ${WACHT_OPPAKKEN_S}.`, `Het besluit wacht op de dienst van de server: ${laatste.verwerking.seconden} s van ${WACHT_OPPAKKEN_S}.`)
            : tr(`Служба сервера працює над рішенням (${laatste.verwerking.seconden} с).`, `De dienst van de server werkt aan het besluit (${laatste.verwerking.seconden} s).`)}</p>}
          {wachtMelding && <div className='bsl-diagnose' role='alert' data-besluit-diagnose>
            <p><AlertTriangle size={16} aria-hidden='true' /><b>{tr('Служба сервера не забрала рішення.', 'De dienst van de server haalde het besluit niet op.')}</b> {tr('Нічого не змінено. Виконайте на сервері ці команди (вони лише читають стан) і надішліть результат:', 'Er is niets gewijzigd. Voer op de server deze opdrachten uit (ze lezen alleen de toestand) en stuur het resultaat door:')}</p>
            <pre className='bsl-mono'>{DIAGNOSE.join('\n')}</pre>
            <button type='button' className='bsl-knop' onClick={() => void kopieer()}><ClipboardCopy size={16} aria-hidden='true' />{gekopieerd ? tr('Скопійовано', 'Gekopieerd') : tr('Копіювати команди', 'Opdrachten kopiëren')}</button>
          </div>}
          <div className='bsl-terminal' data-live={bezig === 'volgen'}>
            <div className='bsl-terminal-balk'><span>{tr('Термінал відкату', 'Terugdraaiterminal')}{bezig === 'volgen' && <b>{tr('наживо', 'live')}</b>}</span></div>
            <div className='bsl-terminal-bak' ref={termBak} role='log' aria-live='polite' tabIndex={0}>
              {regels.map((r, i) => <div key={i} className='bsl-regel' data-niveau={r.niveau}><span className='bsl-regel-tijd'>{tijdKort(r.tijd)}</span><span className='bsl-regel-bron'>{r.bron === 'server' ? tr('сервер', 'server') : tr('сайт', 'site')}</span><span>{r.tekst}</span></div>)}
              {bezig === 'volgen' && <div className='bsl-regel bsl-cursor' aria-hidden='true'>▍</div>}
            </div>
          </div>
          {laatste?.nacontrole && <p className={laatste.nacontrole.ok ? 'bsl-stil' : 'bsl-fout'} data-nacontrole={laatste.nacontrole.ok ? 'ok' : 'fout'}>{laatste.nacontrole.ok ? <CheckCircle2 size={14} aria-hidden='true' /> : <XCircle size={14} aria-hidden='true' />} {laatste.nacontrole.ok ? tr('Перевірка після відкату пройдена.', 'Controle na het terugdraaien geslaagd.') : tr('Перевірка після відкату не пройдена: технічні сторінки не відкриваються.', 'Controle na het terugdraaien mislukt: technische pagina’s openen niet.')}</p>}
          {(eind || geenAntwoord) && <div className='bsl-acties'>
            <button type='button' className='bsl-knop bsl-knop-primair' onClick={onSluit} data-besluit-knop='sluiten'>{tr('Закрити', 'Sluiten')}</button>
            {b?.staat !== 'klaar' && <button type='button' className='bsl-knop' onClick={() => { opnieuw(); void laden(); }} data-besluit-knop='nogmaals'>{tr('Спробувати ще раз', 'Opnieuw proberen')}</button>}
          </div>}
        </section>}
      </>}
    </section>
  </div>;
}
