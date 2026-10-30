import { useCallback, useEffect, useRef, useState } from 'react';
import { BookOpen, CheckCircle2, ExternalLink, Info, Power, RefreshCw, ShieldCheck, TriangleAlert, Users, X } from 'lucide-react';
import { api } from '../platform/client';
import { CATEGORIEEN, METHODE_LABEL, STATUS_LABEL, type Integratie } from '../../shared/integraties-catalogus';
import { codeTekst, detailVan } from '../../shared/integraties-detail';
import Logo from '../merk/MerkLogo';
import HulpVraag from '../hulp/HulpVraag';

export type ServerLevend = { toestand: 'verbonden' | 'ingesteld' | 'niet' | 'fout' | 'onbekend'; code?: string; n?: number; detail: string; tot?: number; laatstGebruikt?: number | null; gecontroleerdOp?: number };
export type ServerControle = { stand: 'ok' | 'let-op' | 'fout' | 'onbekend'; code: string; detail: string; op: number; door: string };
export interface ServerStand {
  levend: Record<string, ServerLevend>;
  beleid: Record<string, { voorGebruikers: boolean; door: string; op: number }>;
  controles: Record<string, ServerControle>;
}
type Lang = 'uk' | 'nl';

interface Props {
  i: Integratie;
  lang: Lang;
  context: Record<string, unknown>;
  stand: ServerStand | null;
  levend: 'verbonden' | 'niet' | 'ingesteld' | 'fout' | null;
  href: string;
  onClose: () => void;
  onVernieuw: () => void;
  onMappen: () => void;
}

const FOUTEN: Record<string, readonly [string, string]> = {
  NIET_BESCHIKBAAR: ['Ця інтеграція ще не існує, тож її не можна відкрити користувачам.', 'Deze integratie bestaat nog niet en kan dus niet voor gebruikers worden opengezet.'],
  OWNER_ADMIN_REQUIRED: ['Потрібні права адміністратора.', 'Beheerdersrechten zijn nodig.'],
  BEVESTIGING_VEREIST: ['Потрібне підтвердження.', 'Bevestiging is vereist.'],
  LOSKOPPELEN_NIET_MOGELIJK: ['Цю інтеграцію не можна відключити звідси.', 'Deze integratie kan hier niet worden losgekoppeld.'],
};
const STAND_TEKST: Record<string, readonly [string, string]> = {
  ok: ['Усе гаразд', 'In orde'], 'let-op': ['Потрібна увага', 'Let op'], fout: ['Помилка', 'Fout'], onbekend: ['Невідомо', 'Onbekend'],
};
const datum = (ms: number, lang: Lang) => new Date(ms).toLocaleString(lang === 'uk' ? 'uk-UA' : 'nl-BE', { dateStyle: 'medium', timeStyle: 'short' });

/** Detailvenster van één integratie: rechten, stappen, documentatie, controle, loskoppelen en beschikbaarheid voor gebruikers. */
export default function Detail({ i, lang, context, stand, levend, href, onClose, onVernieuw, onMappen }: Props) {
  const tr = (uk: string, nl: string) => (lang === 'uk' ? uk : nl);
  const t = (x: readonly [string, string]) => x[lang === 'uk' ? 0 : 1];
  const d = detailVan(i);
  const cat = CATEGORIEEN.find((c) => c.id === i.cat)!;
  const [bezig, setBezig] = useState<'' | 'test' | 'los' | 'beleid'>('');
  const [bericht, setBericht] = useState<{ soort: 'ok' | 'fout'; tekst: string } | null>(null);
  const [controle, setControle] = useState<ServerControle | null>(stand?.controles?.[i.id] ?? null);
  const [voorGebruikers, setVoorGebruikers] = useState<boolean>(Boolean(stand?.beleid?.[i.id]?.voorGebruikers));
  const sluitRef = useRef<HTMLButtonElement>(null);
  const vorige = useRef<Element | null>(null);
  const dialoogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    vorige.current = document.activeElement;
    sluitRef.current?.focus();
    const vorigeOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = vorigeOverflow; (vorige.current as HTMLElement | null)?.focus?.(); };
  }, []);

  // Escape werkt ook als de focus op <body> staat (bv. nadat een bedieningselement tijdens een actie even uitgeschakeld was).
  useEffect(() => {
    const f = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); onClose(); } };
    document.addEventListener('keydown', f);
    return () => document.removeEventListener('keydown', f);
  }, [onClose]);
  // Na een actie de focus in het venster houden (een uitgeschakelde knop of schakelaar verliest haar).
  useEffect(() => {
    if (!bezig && dialoogRef.current && (!document.activeElement || document.activeElement === document.body)) dialoogRef.current.focus();
  }, [bezig]);

  const toets = useCallback((e: React.KeyboardEvent) => {
    if (e.key !== 'Tab' || !dialoogRef.current) return;
    const lijst = [...dialoogRef.current.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input,[tabindex]:not([tabindex="-1"])')].filter((x) => x.offsetParent !== null);
    if (!lijst.length) return;
    const eerste = lijst[0], laatste = lijst[lijst.length - 1];
    if (e.shiftKey && document.activeElement === eerste) { e.preventDefault(); laatste.focus(); }
    else if (!e.shiftKey && document.activeElement === laatste) { e.preventDefault(); eerste.focus(); }
  }, []);

  const fout = (e: unknown) => {
    const code = String((e as Error)?.message || '');
    return FOUTEN[code] ? t(FOUTEN[code]) : tr('Не вдалося виконати дію. Спробуйте ще раз.', 'De actie is niet gelukt. Probeer het opnieuw.');
  };
  const post = (pad: string, extra: Record<string, unknown> = {}) => api.post(`/api/owner/admin/integraties/${pad}`, { ...context, id: i.id, ...extra });

  const controleer = async () => {
    setBezig('test'); setBericht(null);
    try {
      const r = (await post('controleer')).data as { stand: ServerControle['stand']; code: string; detail: string; op: number };
      setControle({ stand: r.stand, code: r.code, detail: r.detail, op: r.op, door: '' });
      onVernieuw();
    } catch (e) { setBericht({ soort: 'fout', tekst: fout(e) }); }
    setBezig('');
  };
  const loskoppelen = async () => {
    if (!window.confirm(tr(`Відключити «${i.naam}»? Дію буде записано в журнал.`, `«${i.naam}» loskoppelen? De actie komt in het logboek.`))) return;
    setBezig('los'); setBericht(null);
    try {
      await post('loskoppelen', { bevestig: true });
      setBericht({ soort: 'ok', tekst: tr('Відключено. Запис додано до журналу.', 'Losgekoppeld. Een regel is aan het logboek toegevoegd.') });
      onVernieuw();
    } catch (e) { setBericht({ soort: 'fout', tekst: fout(e) }); }
    setBezig('');
  };
  const wisselBeleid = async () => {
    const nieuw = !voorGebruikers;
    setBezig('beleid'); setBericht(null);
    try {
      await post('beleid', { voorGebruikers: nieuw });
      setVoorGebruikers(nieuw);
      setBericht({ soort: 'ok', tekst: nieuw ? tr('Тепер інтеграція доступна користувачам. Запис додано до журналу.', 'De integratie is nu beschikbaar voor gebruikers. Een regel is aan het logboek toegevoegd.') : tr('Інтеграцію закрито для користувачів. Запис додано до журналу.', 'De integratie is niet meer beschikbaar voor gebruikers. Een regel is aan het logboek toegevoegd.') });
      onVernieuw();
    } catch (e) { setBericht({ soort: 'fout', tekst: fout(e) }); }
    setBezig('');
  };

  const echt = i.status !== 'binnenkort';
  const sl = stand?.levend?.[i.id];
  const kanLos = echt && (Boolean(d.loskoppelbaar) || (i.levend?.startsWith('agent:') ?? false)) && (levend === 'verbonden' || levend === 'ingesteld');
  const levendTekst = levend === 'verbonden' ? tr('Підключено', 'Gekoppeld') : levend === 'ingesteld' ? tr('Налаштовано, не перевірено', 'Ingesteld, niet geverifieerd') : levend === 'fout' ? tr('Помилка підключення', 'Fout in koppeling') : levend === 'niet' ? tr('Не підключено', 'Niet gekoppeld') : '';

  return (
    <div className='il-modal' role='presentation' onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={dialoogRef} tabIndex={-1} className='il-dialoog' role='dialog' aria-modal='true' aria-labelledby='il-d-titel' onKeyDown={toets} data-integratie-detail={i.id}>
        <header className='il-d-kop'>
          <Logo id={i.id} naam={i.naam} logo={i.logo} maat={52} />
          <div className='il-d-titel'>
            <h3 id='il-d-titel'>{i.naam}</h3>
            <span>{cat[lang]} · {i.methoden.map((m) => t(METHODE_LABEL[m])).join(', ')}</span>
          </div>
          <button ref={sluitRef} type='button' className='il-sluit' onClick={onClose} aria-label={tr('Закрити', 'Sluiten')}><X aria-hidden /></button>
        </header>

        <div className='il-d-body'>
          <p className='il-d-uitleg'>{i[lang]}</p>
          <div className='il-chips'>
            <span className='il-status' data-status={i.status}>{i.status === 'klaar' ? <CheckCircle2 aria-hidden /> : <Info aria-hidden />}{t(STATUS_LABEL[i.status])}</span>
            {levendTekst ? <span className='il-levend' data-levend={levend}><i aria-hidden />{levendTekst}</span> : null}
          </div>
          {sl ? <p className='il-d-noot'>{codeTekst(sl.code, lang, sl.n, sl.detail)}{sl.tot ? ` ${tr('Діє до', 'Geldig tot')} ${datum(sl.tot, lang)}.` : ''}{sl.laatstGebruikt ? ` ${tr('Востаннє використано', 'Laatst gebruikt')} ${datum(sl.laatstGebruikt, lang)}.` : ''}</p> : null}
          {echt ? <p className='il-d-noot'>{tr('Стан показано для вашого облікового запису.', 'De status geldt voor uw eigen account.')}</p> : null}

          <section className='il-d-sectie'>
            <h4><ShieldCheck aria-hidden />{tr('Які права потрібні', 'Welke rechten nodig zijn')}</h4>
            <ul>{d.rechten.map((r, n) => <li key={n}>{t(r)}</li>)}</ul>
          </section>
          <section className='il-d-sectie'>
            <h4><BookOpen aria-hidden />{tr('Як підключити', 'Hoe te koppelen')}</h4>
            <ol>{d.stappen.map((r, n) => <li key={n}>{t(r)}</li>)}</ol>
          </section>

          {echt ? (
            <section className='il-d-sectie'>
              <h4><Users aria-hidden />{tr('Для користувачів сайту', 'Voor gebruikers van de site')} <HulpVraag k='integraties.voor-gebruikers' /></h4>
              <label className='il-schakel'>
                <input data-hulp='integraties.voor-gebruikers' type='checkbox' role='switch' checked={voorGebruikers} disabled={bezig === 'beleid'} onChange={() => void wisselBeleid()} />
                <span><strong>{voorGebruikers ? tr('Відкрито користувачам', 'Open voor gebruikers') : tr('Лише для адміністратора', 'Alleen voor de beheerder')}</strong>
                  <small>{tr('Щоб користувачі могли бачити й підключати цю інтеграцію, увімкніть перемикач. Кожна зміна потрапляє в журнал.', 'Zet de schakelaar aan zodat gebruikers deze integratie kunnen zien en koppelen. Elke wijziging komt in het logboek.')}</small></span>
              </label>
            </section>
          ) : null}

          <section className='il-d-sectie'>
            <h4><RefreshCw aria-hidden />{tr('Остання перевірка', 'Laatste controle')}</h4>
            {controle ? (
              <p className='il-d-controle' data-stand={controle.stand}><b>{t(STAND_TEKST[controle.stand] ?? STAND_TEKST.onbekend)}</b> · {datum(controle.op, lang)}<br />{codeTekst(controle.code, lang, undefined, controle.detail)}</p>
            ) : <p className='il-d-noot'>{echt ? tr('Ще не перевіряли.', 'Nog niet gecontroleerd.') : tr('Перевірка недоступна: підключення ще не існує.', 'Controleren kan niet: de koppeling bestaat nog niet.')}</p>}
            {echt ? <p className='il-d-noot'>{tr('Це перевірка конфігурації на сайті — до зовнішнього сервісу запит не надсилається.', 'Dit is een controle van de configuratie op de site; er gaat geen verzoek naar de externe dienst.')}</p> : null}
          </section>

          {bericht ? <p className='il-d-bericht' data-soort={bericht.soort} role='status'>{bericht.soort === 'fout' ? <TriangleAlert aria-hidden /> : <CheckCircle2 aria-hidden />}{bericht.tekst}</p> : null}
        </div>

        <footer className='il-d-voet'>
          {i.status === 'klaar' && href ? <a className={`il-knop ${levend === 'verbonden' ? '' : 'is-primair'}`} href={href}>{levend === 'verbonden' ? tr('Налаштувати', 'Instellen') : tr('Підключити', 'Koppelen')}</a> : null}
          {i.status === 'instellen' && i.doel?.soort === 'directory' ? <button type='button' className='il-knop is-primair' onClick={onMappen}>{tr('Налаштувати', 'Instellen')}</button> : null}
          {echt ? <button type='button' className='il-knop' onClick={() => void controleer()} disabled={bezig === 'test'}><RefreshCw className={bezig === 'test' ? 'spin' : ''} aria-hidden />{tr('Перевірити стан', 'Status controleren')}</button> : null}
          {kanLos ? <button type='button' className='il-knop is-gevaar' onClick={() => void loskoppelen()} disabled={bezig === 'los'}><Power aria-hidden />{tr('Відключити', 'Loskoppelen')}</button> : null}
          <a className='il-knop is-stil' href={d.docs} target='_blank' rel='noopener noreferrer'><ExternalLink aria-hidden />{tr('Документація', 'Documentatie')}</a>
        </footer>
      </div>
    </div>
  );
}
