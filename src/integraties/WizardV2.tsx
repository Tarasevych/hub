// UI-013 fase 2 — wizard «Майстер підключень» in zes stappen (achter dezelfde vlag als CatalogusV2). Geen eigen auth, geen opslag van
// geheimen: OAuth/IMAP/kluis gebeuren in hun bestaande stroom; WebDAV/S3/MQTT alleen controleren via /integraties/adapter-controle.
// AI-agenten krijgen hierdoor GEEN toegang: rechten voor agenten blijven een aparte stap op de MCP-pagina.
import { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, ExternalLink, RefreshCw, X } from 'lucide-react';
import { api } from '../platform/client';
import { INTEGRATIES, METHODE_LABEL, type Integratie } from '../../shared/integraties-catalogus';
import { detailVan, codeTekst } from '../../shared/integraties-detail';
import { officieelTekst, registerVan, type LevendeStand } from '../../shared/integraties-register';
import { canonicalServiceUrl } from '../canoniek-dienst';
import GeheimInvoer from '../geheim/GeheimInvoer';
import Logo from '../merk/MerkLogo';
import { CONTROLE_FOUT, STAPPEN, autorisatieSoort, serverControleerbaar, volgende, vorige, wizardKan, type StapId } from './wizard-v2-logica';

type Lang = 'uk' | 'nl';
interface Props { lang: Lang; context: Record<string, unknown>; begin?: string; levend: (i: Integratie) => LevendeStand; href: (i: Integratie) => string; onSluit: () => void; onGewijzigd: () => void; onMappen: () => void; }

export default function WizardV2({ lang, context, begin, levend, href, onSluit, onGewijzigd, onMappen }: Props) {
  const tr = (uk: string, nl: string) => (lang === 'uk' ? uk : nl);
  const [stap, setStap] = useState<StapId>(begin ? 'wijze' : 'kies');
  const [id, setId] = useState(begin || '');
  const [zoek, setZoek] = useState('');
  const [wijze, setWijze] = useState('');
  const [velden, setVelden] = useState<Record<string, string>>({});
  const [bezig, setBezig] = useState(false);
  const [uitslag, setUitslag] = useState<{ ok: boolean; tekst: string; code?: string } | null>(null);
  const i = INTEGRATIES.find((x) => x.id === id);
  const r = i ? registerVan(i.id) : undefined;
  const soort = i ? autorisatieSoort(i) : 'geen';
  const keuzes = useMemo(() => INTEGRATIES.filter((x) => wizardKan(x, levend(x)) && (!zoek.trim() || x.naam.toLowerCase().includes(zoek.trim().toLowerCase()))), [zoek, levend]);
  const doelUrl = (() => { if (!i) return ''; const h = href(i); if (h) return h; const p = r?.pagina; if (!p) return ''; try { return canonicalServiceUrl(p.dienst as never, p.tab, lang, true); } catch { return ''; } })();
  const zet = (k: string) => (v: string) => setVelden((o) => ({ ...o, [k]: v }));

  const controleer = async () => {
    if (!i) return;
    setBezig(true); setUitslag(null);
    try {
      if (soort === 'adapter') {
        const res = (await api.post('/api/owner/admin/integraties/adapter-controle', { ...context, soort: r!.adapter, ...velden })).data as { ok: boolean; fout?: string; aantal?: number; ms?: number };
        setUitslag(res.ok
          ? { ok: true, tekst: r!.adapter === 'mqtt' ? tr(`Брокер прийняв вхід (${res.ms} мс). Повідомлень не надсилали.`, `De broker accepteerde de aanmelding (${res.ms} ms). Er is niets verstuurd.`) : tr(`Вхід вдався, видно елементів: ${res.aantal}.`, `Aanmelding gelukt, zichtbare items: ${res.aantal}.`) }
          : { ok: false, code: res.fout, tekst: (CONTROLE_FOUT[res.fout || ''] || [res.fout || '', res.fout || ''])[lang === 'uk' ? 0 : 1] });
      } else if (serverControleerbaar(i)) {
        const res = (await api.post('/api/owner/admin/integraties/controleer', { ...context, id: i.id })).data as { stand: string; code: string; detail: string };
        setUitslag({ ok: res.stand === 'ok', code: res.code, tekst: codeTekst(res.code, lang, undefined, lang === 'nl' ? res.detail : res.code) });
        onGewijzigd();
      } else {
        onGewijzigd();
        const l = levend(i);
        setUitslag(l === 'verbonden' ? { ok: true, tekst: tr('Сервер бачить підключення.', 'De server ziet de koppeling.') } : { ok: false, code: 'NIET_GEZIEN', tekst: tr('Сервер ще не бачить підключення. Завершіть вхід на сторінці сервісу й натисніть «Перевірити ще раз».', 'De server ziet de koppeling nog niet. Rond het aanmelden af op de pagina van de dienst en klik «Opnieuw controleren».') });
      }
    } catch (e) {
      const code = String(((e as { response?: { data?: { error?: string } } }).response?.data?.error) || 'CONTROLE_MISLUKT');
      setUitslag({ ok: false, code, tekst: (CONTROLE_FOUT[code] || [tr('Перевірка не вдалася.', 'De controle mislukte.'), tr('Перевірка не вдалася.', 'De controle mislukte.')])[lang === 'uk' ? 0 : 1] });
    }
    setVelden((o) => Object.fromEntries(Object.entries(o).filter(([k]) => !/wachtwoord|geheim/.test(k)))); // geheim niet in het geheugen houden
    setBezig(false);
  };

  const idx = STAPPEN.findIndex((x) => x.id === stap);
  const veld = (k: string, uk: string, nl: string, plaats = '') => <label className='iw2-veld'><span>{tr(uk, nl)}</span><input value={velden[k] || ''} onChange={(e) => zet(k)(e.target.value)} placeholder={plaats} autoComplete='off' spellCheck={false} /></label>;
  const geheim = (k: string, uk: string, nl: string) => <label className='iw2-veld'><span>{tr(uk, nl)}</span><GeheimInvoer lang={lang} value={velden[k] || ''} onChange={zet(k)} max={1024} soort='integratie' /></label>;

  return (
    <section className='iw2' role='dialog' aria-modal='false' aria-label={tr('Майстер підключень', 'Koppelwizard')} data-wizard-v2>
      <header className='iw2-kop'>
        <h3>{tr('Майстер підключень', 'Koppelwizard')}{i ? <> · {i.naam}</> : null}</h3>
        <button type='button' className='ic2-knop is-icoon' onClick={onSluit} aria-label={tr('Скасувати й закрити', 'Annuleren en sluiten')}><X aria-hidden /></button>
      </header>
      <ol className='iw2-stappen' aria-label={tr('Етапи', 'Stappen')}>
        {STAPPEN.map((s, n) => <li key={s.id} data-stand={n < idx ? 'klaar' : n === idx ? 'nu' : 'later'} aria-current={n === idx ? 'step' : undefined}><b>{n + 1}</b><span>{s[lang]}</span></li>)}
      </ol>

      {stap === 'kies' ? (
        <div className='iw2-inhoud'>
          <input className='iw2-zoek' type='search' value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder={tr('Знайти сервіс…', 'Dienst zoeken…')} aria-label={tr('Знайти сервіс', 'Dienst zoeken')} />
          <ul className='iw2-keuzes'>{keuzes.map((x) => <li key={x.id}><button type='button' aria-pressed={id === x.id} onClick={() => { setId(x.id); setWijze(''); setUitslag(null); setStap('wijze'); }}><Logo id={x.id} naam={x.naam} logo={x.logo} /><span>{x.naam}</span></button></li>)}</ul>
          <p className='iw2-noot'>{tr('Тут лише сервіси, які справді можна підключити або перевірити. Решта має «План» у каталозі.', 'Hier staan alleen diensten die echt te koppelen of te controleren zijn. De rest heeft een «Plan» in de catalogus.')}</p>
        </div>
      ) : null}

      {stap === 'wijze' && i ? (
        <div className='iw2-inhoud'>
          <p data-officieel>{officieelTekst(r, lang)}</p>
          <div className='iw2-wijzen' role='radiogroup' aria-label={tr('Спосіб підключення', 'Koppelwijze')}>
            {i.methoden.map((m) => <button key={m} type='button' data-hulp-vrij='keuze' role='radio' aria-checked={wijze === m} onClick={() => setWijze(m)}>{METHODE_LABEL[m][lang === 'uk' ? 0 : 1]}</button>)}
          </div>
          <p className='iw2-noot'>{tr('Потрібно', 'Nodig')}: {r?.vereist[lang === 'uk' ? 0 : 1]}</p>
        </div>
      ) : null}

      {stap === 'autorisatie' && i ? (
        <div className='iw2-inhoud'>
          {soort === 'adapter' && r?.adapter === 'webdav' ? <>{veld('adres', 'Адреса WebDAV', 'WebDAV-adres', 'https://cloud.example/remote.php/dav/files/naam/')}{veld('gebruiker', 'Ім’я користувача', 'Gebruikersnaam')}{geheim('wachtwoord', 'Пароль застосунку', 'App-wachtwoord')}</> : null}
          {soort === 'adapter' && r?.adapter === 's3' ? <>{veld('adres', 'Адреса сховища', 'Eindpunt', 'https://s3.example.com')}{veld('emmer', 'Bucket', 'Bucket')}{veld('regio', 'Регіон', 'Regio', 'us-east-1')}{veld('toegangsId', 'ID ключа доступу', 'Toegangssleutel-ID')}{geheim('geheim', 'Секретний ключ', 'Geheime sleutel')}</> : null}
          {soort === 'adapter' && r?.adapter === 'mqtt' ? <>{veld('host', 'Адреса брокера', 'Brokeradres', 'mqtt.example.com')}{veld('poort', 'Порт (TLS)', 'Poort (TLS)', '8883')}{veld('gebruiker', 'Логін', 'Gebruikersnaam')}{geheim('wachtwoord', 'Пароль', 'Wachtwoord')}</> : null}
          {soort === 'adapter' ? <p className='iw2-noot'>{tr('Пароль надсилається лише для цієї перевірки й ніде не зберігається.', 'Het wachtwoord gaat alleen mee voor deze controle en wordt nergens bewaard.')}</p> : null}
          {soort === 'pagina' ? <><p>{tr('Вхід відбувається на сторінці сервісу, у вже перевіреному процесі (захищене посилання входу, ключі зберігаються зашифровано).', 'Het aanmelden gebeurt op de pagina van de dienst, in de bestaande stroom (beveiligde aanmeldlink, sleutels versleuteld bewaard).')}</p>
            {doelUrl ? <a className='ic2-knop is-primair' href={doelUrl} target='_blank' rel='noopener'>{tr('Відкрити вхід', 'Aanmelden openen')}<ExternalLink aria-hidden /></a> : null}
            <p className='iw2-noot'>{tr('Після входу поверніться сюди й натисніть «Далі».', 'Kom na het aanmelden terug en klik «Verder».')}</p></> : null}
          {soort === 'directory' ? <button type='button' className='ic2-knop is-primair' onClick={onMappen}>{tr('Відкрити зовнішні каталоги', 'Externe directory’s openen')}</button> : null}
        </div>
      ) : null}

      {stap === 'controle' && i ? (
        <div className='iw2-inhoud' aria-live='polite'>
          <button type='button' className='ic2-knop is-primair' onClick={() => void controleer()} disabled={bezig}><RefreshCw aria-hidden className={bezig ? 'spin' : ''} />{uitslag ? tr('Перевірити ще раз', 'Opnieuw controleren') : tr('Перевірити', 'Controleren')}</button>
          {uitslag ? <p className='iw2-uitslag' data-ok={uitslag.ok}>{uitslag.ok ? <CheckCircle2 aria-hidden /> : null}{uitslag.tekst}{uitslag.code ? <code> {uitslag.code}</code> : null}</p> : null}
          {uitslag && !uitslag.ok ? <p className='iw2-noot'>{tr('Можна повернутися назад, виправити дані й перевірити ще раз.', 'U kunt teruggaan, de gegevens verbeteren en opnieuw controleren.')}</p> : null}
        </div>
      ) : null}

      {stap === 'rechten' && i ? (
        <div className='iw2-inhoud'>
          <ul className='iw2-lijst'>{(detailVan(i).rechten.length ? detailVan(i).rechten : [r?.operaties || ['', '']]).map((t, n) => <li key={n}>{t[lang === 'uk' ? 0 : 1]}</li>)}</ul>
          <p className='iw2-noot'>{tr('ШІ-агенти не отримують доступу до цього підключення автоматично. Доступ для агента ви вмикаєте окремо на сторінці MCP.', 'AI-agenten krijgen niet vanzelf toegang tot deze koppeling. Toegang voor een agent zet u apart aan op de MCP-pagina.')}</p>
        </div>
      ) : null}

      {stap === 'klaar' && i ? (
        <div className='iw2-inhoud'>
          <p>{soort === 'adapter' ? tr('Перевірку завершено. Збереження цього підключення буде в наступному етапі, тому сервіс поки лишається в «Потребують налаштування».', 'De controle is klaar. Deze koppeling bewaren komt in een volgende fase; daarom blijft de dienst voorlopig bij «Instellen nodig».') : tr('Готово. Стан оновлено в каталозі та в інших відкритих вкладках.', 'Klaar. De stand is bijgewerkt in de catalogus en in andere open tabbladen.')}</p>
          {doelUrl ? <a className='ic2-knop is-primair' href={doelUrl}>{tr('Перейти до сервісу', 'Naar de dienst')}<ArrowRight aria-hidden /></a> : null}
        </div>
      ) : null}

      <footer className='iw2-voet'>
        <button type='button' className='ic2-knop' onClick={() => setStap(vorige(stap))} disabled={stap === 'kies'}><ArrowLeft aria-hidden />{tr('Назад', 'Terug')}</button>
        <button type='button' className='ic2-knop' onClick={onSluit}>{tr('Скасувати', 'Annuleren')}</button>
        {stap !== 'klaar' && stap !== 'kies' ? <button type='button' className='ic2-knop is-primair' onClick={() => setStap(volgende(stap))} disabled={(stap === 'wijze' && !wijze) || (stap === 'controle' && !uitslag?.ok && soort === 'adapter')}>{tr('Далі', 'Verder')}<ArrowRight aria-hidden /></button> : null}
        {stap === 'klaar' ? <button type='button' className='ic2-knop is-primair' onClick={onSluit}>{tr('Закрити', 'Sluiten')}</button> : null}
      </footer>
    </section>
  );
}
