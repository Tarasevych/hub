// «Нещодавні пошуки», «Статус служб», «Системна інформація», de drie technische widgets en de oude blokken.
import { useEffect, useState } from 'react';
import { Activity, ArrowRight, Clock, Database, ExternalLink, HardDrive, Languages, MonitorSmartphone, Moon, Package, RefreshCw, Search, Server, Sun, Trash2, Wifi, WifiOff, X } from 'lucide-react';
import HubBlockWidget from '../../HubBlokWidget';
import { dienstenControleren, haalDiensten, haalGezondheid, haalTechSamenvatting, haalZoekRecent, useBron, wisAlleZoekRecent, wisZoekRecent, type Gezondheid, type TechSamenvatting, type ZoekRecent } from '../gegevens';
import { geleden, regelsVoor, tr, wanneer, type Lang, type WidgetProps } from '../soorten';
import { Fout, Leeg, Skelet } from './Vlak';
import type { TabelRij } from '../../../shared/diagnostiek-account';

// ---------------------------------------------------------------- recente zoekopdrachten (server, deze lade)
export function ZoekRecentWidget({ lang, item, acties, zichtbaar, kolommen }: WidgetProps) {
  const { waarde, fout, bezig, herlaad } = useBron<ZoekRecent[]>((f) => haalZoekRecent(f), null, zichtbaar);
  const [lokaal, setLokaal] = useState<ZoekRecent[] | null>(null);
  const lijst = lokaal ?? waarde;
  if (fout) return <Fout lang={lang} code={fout} opnieuw={herlaad} />;
  if (!lijst) return bezig || !zichtbaar ? <Skelet rijen={4} /> : <Fout lang={lang} code='GEEN_BRON' opnieuw={herlaad} />;
  if (!lijst.length) return <Leeg icoon={<Search aria-hidden='true' />}>{tr(lang, 'Ще нічого не шукали. Ctrl+K — пошук по всьому простору.', 'Nog niets gezocht. Ctrl+K — zoeken in de hele ruimte.')}</Leeg>;
  const weg = async (id: string) => { setLokaal(lijst.filter((x) => x.id !== id)); try { await wisZoekRecent(id); } catch { setLokaal(null); herlaad(); } };
  const allesWeg = async () => { setLokaal([]); try { await wisAlleZoekRecent(); } catch { setLokaal(null); herlaad(); } };
  return (
    <div className='wb-lijst-vlak'>
      <ul className='wb-rijen wb-zoek'>
        {lijst.slice(0, regelsVoor(item.r, kolommen, 2, 2)).map((z) => (
          <li key={z.id}>
            <button type='button' className='wb-zoek-rij' onClick={() => acties.zoek(z.vraag)}><Clock aria-hidden='true' /><span className='wb-rij-titel'>{z.vraag}</span><small>{geleden(lang, z.laatstOp)}</small></button>
            <button type='button' className='wb-icoonknop' aria-label={tr(lang, `Прибрати «${z.vraag}» з історії`, `«${z.vraag}» uit de geschiedenis halen`)} onClick={() => void weg(z.id)}><X aria-hidden='true' /></button>
          </li>
        ))}
      </ul>
      <div className='wb-rij-knoppen'>
        <button type='button' className='wb-alles' onClick={() => acties.zoek()}>{tr(lang, 'До пошуку', 'Naar zoeken')}<ArrowRight aria-hidden='true' /></button>
        <button type='button' className='knop-stil is-klein' onClick={() => void allesWeg()}><Trash2 aria-hidden='true' />{tr(lang, 'Очистити', 'Wissen')}</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- stand van de eigen diensten
const dienstNaam = (n: unknown, lang: Lang): string => (Array.isArray(n) ? String(lang === 'uk' ? n[0] : n[1]) : n && typeof n === 'object' ? String((n as Record<string, unknown>)[lang] || '') : String(n || ''));
export function DienstenWidget({ lang, item, acties, zichtbaar, kolommen }: WidgetProps) {
  const { waarde, fout, bezig, herlaad } = useBron<TabelRij[]>((f) => haalDiensten(f), null, zichtbaar);
  const [controle, setControle] = useState<'' | 'bezig' | 'te-vaak' | 'fout'>('');
  const controleer = async () => {
    setControle('bezig');
    try { await dienstenControleren(); setControle(''); herlaad(); }
    catch (e: unknown) { setControle(/429|RATE_LIMITED/.test(String((e as Error)?.message || '')) ? 'te-vaak' : 'fout'); }
  };
  if (fout) return <Fout lang={lang} code={fout} opnieuw={herlaad} />;
  if (!waarde) return bezig || !zichtbaar ? <Skelet rijen={4} /> : <Fout lang={lang} code='GEEN_BRON' opnieuw={herlaad} />;
  if (!waarde.length) return <div className='wb-lijst-vlak'><Leeg icoon={<Activity aria-hidden='true' />}>{tr(lang, 'Перевірок ще не було.', 'Er zijn nog geen controles geweest.')}</Leeg><button type='button' className='knop-secundair is-klein' onClick={() => void controleer()} disabled={controle === 'bezig'}><RefreshCw aria-hidden='true' />{tr(lang, 'Перевірити зараз', 'Nu controleren')}</button></div>;
  const klasse = (c: string) => (c === 'ok' ? 'pil-ok' : c === 'fout' ? 'pil-fout' : c === 'let-op' ? 'pil-warn' : 'pil-stil');
  const naam = (c: string) => (c === 'ok' ? tr(lang, 'Працює', 'Werkt') : c === 'fout' ? tr(lang, 'Збій', 'Storing') : c === 'let-op' ? tr(lang, 'Увага', 'Let op') : tr(lang, 'Не перевірено', 'Niet gecontroleerd'));
  return (
    <div className='wb-lijst-vlak'>
      <ul className='wb-rijen wb-diensten'>
        {waarde.slice(0, regelsVoor(item.r, kolommen, 2, 1)).map((r) => (
          <li key={r.dienst} data-wb-dienst={r.conclusie}>
            <span className='wb-rij-titel'>{dienstNaam(r.naam, lang)}</span>
            <span className={`pil ${klasse(String(r.conclusie))}`}>{naam(String(r.conclusie))}</span>
          </li>
        ))}
      </ul>
      <div className='wb-rij-knoppen'>
        <button type='button' className='wb-alles' onClick={() => acties.dienst('identity', 'account')}>{tr(lang, 'Детальніше', 'Meer')}<ArrowRight aria-hidden='true' /></button>
        <button type='button' className='knop-stil is-klein' onClick={() => void controleer()} disabled={controle === 'bezig'} data-wb-controle='1'><RefreshCw aria-hidden='true' className={controle === 'bezig' ? 'spin' : ''} />{tr(lang, 'Перевірити', 'Controleren')}</button>
      </div>
      {controle === 'te-vaak' ? <small className='wb-voet' role='status'>{tr(lang, 'Не частіше 10 разів за 10 хвилин.', 'Niet vaker dan 10 keer per 10 minuten.')}</small> : controle === 'fout' ? <small className='wb-voet' role='status'>{tr(lang, 'Перевірка не вдалася.', 'De controle is mislukt.')}</small> : null}
    </div>
  );
}

// ---------------------------------------------------------------- systeeminformatie (in plaats van weer: alleen wat er lokaal en op de eigen server echt is)
export function SysteemWidget({ lang, zichtbaar, item, kolommen }: WidgetProps) {
  const { waarde, fout, bezig, herlaad } = useBron<Gezondheid>((f) => haalGezondheid(f), null, zichtbaar);
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  // Het thema staat als klasse op <html> (theme-dark | theme-plum-dark); dat volgen we, geen eigen prefers-color-scheme (regel van tokens.css).
  const leesDonker = () => /theme-(plum-)?dark/.test(document.documentElement.className);
  const [donker, setDonker] = useState(leesDonker);
  useEffect(() => { const aan = () => setOnline(true), uit = () => setOnline(false); addEventListener('online', aan); addEventListener('offline', uit); return () => { removeEventListener('online', aan); removeEventListener('offline', uit); }; }, []);
  useEffect(() => { const mo = new MutationObserver(() => setDonker(leesDonker())); mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] }); return () => mo.disconnect(); }, []);
  const zone = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch { return ''; } })();
  return (
    <ul className='wb-systeem' data-wb-systeem={waarde ? (waarde.ok ? 'ok' : 'fout') : 'laden'}>
      <li><Server aria-hidden='true' /><span className='wb-rij-titel'>{tr(lang, 'Сайт', 'Site')}</span>
        {fout ? <Fout lang={lang} code={fout} opnieuw={herlaad} /> : !waarde ? <span className='pil pil-stil'>{bezig ? tr(lang, 'перевіряємо…', 'controleren…') : '—'}</span>
          : <span className={`pil ${waarde.ok ? 'pil-ok' : 'pil-fout'}`}>{waarde.ok ? tr(lang, `відповідає · ${waarde.ms} мс`, `antwoordt · ${waarde.ms} ms`) : tr(lang, 'не відповідає', 'antwoordt niet')}</span>}</li>
      <li><Database aria-hidden='true' /><span className='wb-rij-titel'>{tr(lang, 'База даних', 'Database')}</span><span className={`pil ${waarde ? (waarde.db ? 'pil-ok' : 'pil-fout') : 'pil-stil'}`}>{waarde ? (waarde.db ? tr(lang, 'працює', 'werkt') : tr(lang, 'збій', 'storing')) : '—'}</span></li>
      <li>{online ? <Wifi aria-hidden='true' /> : <WifiOff aria-hidden='true' />}<span className='wb-rij-titel'>{tr(lang, 'Цей пристрій', 'Dit apparaat')}</span><span className={`pil ${online ? 'pil-ok' : 'pil-warn'}`}>{online ? tr(lang, 'онлайн', 'online') : tr(lang, 'офлайн', 'offline')}</span></li>
      <li><Clock aria-hidden='true' /><span className='wb-rij-titel'>{tr(lang, 'Часовий пояс', 'Tijdzone')}</span><small>{zone || '—'}</small></li>
      {item.r >= 3 || kolommen === 1 ? <li><Languages aria-hidden='true' /><span className='wb-rij-titel'>{tr(lang, 'Мова · тема', 'Taal · thema')}</span><small>{lang === 'uk' ? 'Українська' : 'Nederlands'} · {donker ? <Moon aria-hidden='true' className='wb-inline-icoon' /> : <Sun aria-hidden='true' className='wb-inline-icoon' />} {donker ? tr(lang, 'темна', 'donker') : tr(lang, 'світла', 'licht')}</small></li> : null}
    </ul>
  );
}

// ---------------------------------------------------------------- technische lade: server, updates, diagnostiek (één route, drie widgets)
const uptime = (lang: Lang, s: number) => { const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60); return d ? tr(lang, `${d} д ${h} год`, `${d} d ${h} u`) : h ? tr(lang, `${h} год ${m} хв`, `${h} u ${m} min`) : tr(lang, `${m} хв`, `${m} min`); };
export function TechWidget({ lang, item, acties, zichtbaar, kolommen }: WidgetProps) {
  const { waarde, fout, bezig, herlaad } = useBron<TechSamenvatting>((f) => haalTechSamenvatting(f), null, zichtbaar);
  if (fout) return <Fout lang={lang} code={fout} opnieuw={herlaad} />;
  if (!waarde) return bezig || !zichtbaar ? <Skelet rijen={4} /> : <Fout lang={lang} code='GEEN_BRON' opnieuw={herlaad} />;
  if (item.id === 'tech-server') {
    const s = waarde.server;
    const last = s.load1 / s.kernen;
    return (
      <ul className='wb-systeem' data-wb-tech='server'>
        <li><Database aria-hidden='true' /><span className='wb-rij-titel'>{tr(lang, 'База даних', 'Database')}</span><span className={`pil ${s.db ? 'pil-ok' : 'pil-fout'}`}>{s.db ? `${tr(lang, 'працює', 'werkt')} · ${s.dbMs} ms` : tr(lang, 'збій', 'storing')}</span></li>
        <li><Activity aria-hidden='true' /><span className='wb-rij-titel'>{tr(lang, 'Навантаження', 'Belasting')}</span><span className={`pil ${last > 3 ? 'pil-fout' : last > 1.5 ? 'pil-warn' : 'pil-ok'}`}>{s.load1} / {s.kernen} {tr(lang, 'ядер', 'kernen')}</span></li>
        <li><HardDrive aria-hidden='true' /><span className='wb-rij-titel'>{tr(lang, 'Пам’ять', 'Geheugen')}</span><span className={`pil ${s.geheugenPct > 96 ? 'pil-fout' : s.geheugenPct > 90 ? 'pil-warn' : 'pil-ok'}`}>{s.geheugenPct} % {tr(lang, 'з', 'van')} {Math.round(s.geheugenTotaalMb / 1024 * 10) / 10} GB</span></li>
        <li><Clock aria-hidden='true' /><span className='wb-rij-titel'>{tr(lang, 'Час роботи процесу', 'Uptime proces')}</span><small>{uptime(lang, s.uptimeS)} · Node {s.node}</small></li>
      </ul>
    );
  }
  // 23.10 (integratie): de stand van een run als woord van de interface, niet de interne code («klaar» stond in de Oekraïense UI).
  const staatNaam = (l: Lang, st: string) => ({ klaar: tr(l, 'готово', 'klaar'), bezig: tr(l, 'триває', 'bezig'), mislukt: tr(l, 'помилка', 'mislukt'),
    afgebroken: tr(l, 'перервано', 'afgebroken'), teruggedraaid: tr(l, 'відкочено', 'teruggedraaid') } as Record<string, string>)[st] || tr(l, 'інше', 'overig');
  if (item.id === 'tech-updates') {
    const r = waarde.release;
    return (
      <div className='wb-lijst-vlak'>
        <div className='wb-release'><Package aria-hidden='true' /><span className='wb-rij-titel'>{tr(lang, 'Поточний випуск', 'Huidige release')}<small>{r.versie || tr(lang, 'невідомо', 'onbekend')}{r.commit ? ` · ${r.commit}` : ''}{r.commitStatus === 'zonder-git' ? ` · ${tr(lang, 'поза git', 'buiten git')}` : ''}</small></span></div>
        {waarde.uitrol.length ? (
          <ul className='wb-rijen wb-uitrol'>
            {waarde.uitrol.slice(0, regelsVoor(item.r, kolommen, 2, 3)).map((u) => <li key={u.id} data-wb-run={u.staat}><span className={`pil ${u.staat === 'klaar' ? 'pil-ok' : u.staat === 'bezig' ? 'pil-info' : u.staat === 'mislukt' ? 'pil-fout' : 'pil-warn'}`}>{staatNaam(lang, u.staat)}</span><span className='wb-rij-titel'>{u.versie || '—'}<small title={lang === 'uk' ? u.uk : u.nl}>{lang === 'uk' ? u.uk : u.nl}</small></span><small>{wanneer(lang, Date.parse(u.geeindigd || u.gestart) || 0)}</small></li>)}
          </ul>
        ) : <Leeg>{tr(lang, 'Розгортань ще не було.', 'Er zijn nog geen uitrol-runs.')}</Leeg>}
        <button type='button' className='wb-alles' onClick={() => acties.dienst('admin', 'updates')}>{tr(lang, 'До оновлень', 'Naar updates')}<ArrowRight aria-hidden='true' /></button>
      </div>
    );
  }
  const d = waarde.diagnostiek;
  if (!d) return <Leeg>{tr(lang, 'Діагностика ще не запускалась.', 'De diagnostiek is nog niet uitgevoerd.')}</Leeg>;
  return (
    <div className='wb-lijst-vlak'>
      <div className='wb-tellers'>
        <span data-wb-diag='ok'><strong>{d.ok}</strong><small>ok</small></span>
        <span data-wb-diag='let-op'><strong>{d.letOp}</strong><small>{tr(lang, 'увага', 'let op')}</small></span>
        <span data-wb-diag='fout'><strong>{d.fout}</strong><small>{tr(lang, 'збій', 'fout')}</small></span>
      </div>
      {d.slecht.length ? <ul className='wb-rijen'>{d.slecht.slice(0, regelsVoor(item.r, kolommen, 2, 3)).map((s) => <li key={s.id}><span className={`pil ${s.stand === 'fout' ? 'pil-fout' : 'pil-warn'}`}>{s.stand === 'fout' ? tr(lang, 'збій', 'storing') : tr(lang, 'увага', 'let op')}</span><span className='wb-rij-titel'>{s.naam ? (lang === 'uk' ? s.naam[0] : s.naam[1]) : s.id}<small title={s.code}>{s.reden ? (lang === 'uk' ? s.reden[0] : s.reden[1]) : s.code}</small></span></li>)}</ul> : <Leeg>{tr(lang, 'Усі перевірки зелені.', 'Alle controles zijn groen.')}</Leeg>}
      <small className='wb-voet'>{d.laatsteOp ? tr(lang, `Остання перевірка: ${geleden(lang, d.laatsteOp)}`, `Laatste controle: ${geleden(lang, d.laatsteOp)}`) : ''}</small>
      <button type='button' className='wb-alles' onClick={() => acties.dienst('admin', 'diagnostics')}>{tr(lang, 'До діагностики', 'Naar diagnostiek')}<ArrowRight aria-hidden='true' /></button>
    </div>
  );
}

// ---------------------------------------------------------------- oude blokken (F5): dezelfde HubBlockWidget als vroeger, in een werkblad-tegel
export function OudBlokWidget({ lang, item, ownerUserId, zichtbaar }: WidgetProps) {
  const soort = String(item.inst?.soort || 'mail') as 'mail' | 'files' | 'calendar';
  if (!zichtbaar) return <Skelet rijen={4} />;
  return <div className='wb-oud-blok' data-wb-oud-blok={soort}><HubBlockWidget lang={lang} kind={soort} ownerUserId={ownerUserId} presentation={(String(item.inst?.presentation || 'summary') as 'summary' | 'list' | 'compact')} itemLimit={Number(item.inst?.itemLimit || 5)} showMeta={item.inst?.showMeta !== false} /></div>;
}
export function SnelkoppelingWidget({ lang, item }: WidgetProps) {
  const url = String(item.inst?.url || '');
  return (
    <a className='wb-snelkoppeling' href={url} target='_blank' rel='noreferrer'>
      <MonitorSmartphone aria-hidden='true' />
      <span className='wb-rij-titel'>{String(item.inst?.titel || url)}<small>{String(item.inst?.beschrijving || url)}</small></span>
      <ExternalLink aria-hidden='true' /><span className='sr-only'>{tr(lang, '(відкривається в новій вкладці)', '(opent in een nieuw tabblad)')}</span>
    </a>
  );
}
