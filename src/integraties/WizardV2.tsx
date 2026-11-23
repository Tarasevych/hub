// UI-013 етап 2 + CONSOL-001 (0324, прапорець integraties-adapter-opslaan-v1) — майстер підключень у шість кроків.
// Вхід OAuth/IMAP/сховища ключів працює у наявних потоках цільових сторінок; перехідники (WebDAV/S3/MQTT) перевіряються наживо
// і за явною дією людини запечатуються ключем простору без повернення пароля в оглядач. Агенти ШІ автоматично доступу не отримують.
import { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, ExternalLink, RefreshCw, Save, X } from 'lucide-react';
import { api } from '../platform/client';
import { useVlag } from '../functievlag-lezen';
import { INTEGRATIES, METHODE_LABEL, type Integratie } from '../../shared/integraties-catalogus';
import { detailVan, codeTekst } from '../../shared/integraties-detail';
import { officieelTekst, registerVan, type LevendeStand } from '../../shared/integraties-register';
import { canonicalServiceUrl } from '../canoniek-dienst';
import GeheimInvoer from '../geheim/GeheimInvoer';
import Logo from '../merk/MerkLogo';
import { ADAPTER_OPSLAAN_VLAG, CONTROLE_FOUT, STAPPEN, autorisatieSoort, serverControleerbaar, volgende, vorige, wizardKan, type StapId } from './wizard-v2-logica';

type Lang = 'uk' | 'nl';
interface Props { lang: Lang; context: Record<string, unknown>; begin?: string; levend: (i: Integratie) => LevendeStand; href: (i: Integratie) => string; onSluit: () => void; onGewijzigd: () => void; onMappen: () => void; }

export default function WizardV2({ lang, context, begin, levend, href, onSluit, onGewijzigd, onMappen }: Props) {
  const tr = (uk: string, nl: string) => (lang === 'uk' ? uk : nl);
  const adapterOpslaanAan = useVlag('integraties-adapter-opslaan-v1', false);
  const [stap, setStap] = useState<StapId>(begin ? 'wijze' : 'kies');
  const [id, setId] = useState(begin || '');
  const [zoek, setZoek] = useState('');
  const [wijze, setWijze] = useState('');
  const [velden, setVelden] = useState<Record<string, string>>({});
  const [bezig, setBezig] = useState(false);
  const [uitslag, setUitslag] = useState<{ ok: boolean; tekst: string; code?: string } | null>(null);
  const [bewaarFout, setBewaarFout] = useState<{ tekst: string; code?: string } | null>(null);
  const [opgeslagen, setOpgeslagen] = useState(false);
  const i = INTEGRATIES.find((x) => x.id === id);
  const r = i ? registerVan(i.id) : undefined;
  const soort = i ? autorisatieSoort(i) : 'geen';
  const keuzes = useMemo(() => INTEGRATIES.filter((x) => wizardKan(x, levend(x)) && (!zoek.trim() || x.naam.toLowerCase().includes(zoek.trim().toLowerCase()))), [zoek, levend]);
  const doelUrl = (() => { if (!i) return ''; const h = href(i); if (h) return h; const p = r?.pagina; if (!p) return ''; try { return canonicalServiceUrl(p.dienst as never, p.tab, lang, true); } catch { return ''; } })();
  const zet = (k: string) => (v: string) => { setOpgeslagen(false); setBewaarFout(null); setVelden((o) => ({ ...o, [k]: v })); };
  const wisGeheimen = () => setVelden((o) => Object.fromEntries(Object.entries(o).filter(([k]) => !/wachtwoord|geheim/.test(k))));
  const sluitVeilig = () => { setVelden({}); onSluit(); };

  const foutVertaling = (code: string, standaardUk: string, standaardNl: string) =>
    (CONTROLE_FOUT[code] || [standaardUk, standaardNl])[lang === 'uk' ? 0 : 1];

  const controleer = async () => {
    if (!i) return;
    setBezig(true); setUitslag(null); setBewaarFout(null);
    try {
      if (soort === 'adapter') {
        const res = (await api.post('/api/owner/admin/integraties/adapter-controle', { ...context, soort: r!.adapter, ...velden })).data as { ok: boolean; fout?: string; aantal?: number; ms?: number };
        setUitslag(res.ok
          ? { ok: true, tekst: r!.adapter === 'mqtt' ? tr(`Брокер прийняв вхід (${res.ms} мс). Повідомлень не надсилали.`, `De broker accepteerde de aanmelding (${res.ms} ms). Er is niets verstuurd.`) : tr(`Вхід вдався, видно елементів: ${res.aantal}.`, `Aanmelding gelukt, zichtbare items: ${res.aantal}.`) }
          : { ok: false, code: res.fout, tekst: foutVertaling(res.fout || '', res.fout || '', res.fout || '') });
        if (!adapterOpslaanAan) wisGeheimen();
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
      const code = String(((e as { response?: { data?: { error?: string } }; message?: string }).response?.data?.error) || (e as Error)?.message || 'CONTROLE_MISLUKT');
      setUitslag({ ok: false, code, tekst: foutVertaling(code, 'Перевірка не вдалася.', 'De controle mislukte.') });
    }
    setBezig(false);
  };

  const bewaarAdapter = async () => {
    if (!i || soort !== 'adapter' || !adapterOpslaanAan) { wisGeheimen(); setStap('klaar'); return; }
    setBezig(true); setBewaarFout(null);
    try {
      await api.post('/api/owner/admin/integraties/adapter-koppelingen/bewaar', { ...context, integratie: i.id, ...velden });
      wisGeheimen();
      setOpgeslagen(true);
      onGewijzigd();
      setStap('klaar');
    } catch (e) {
      const code = String(((e as { response?: { data?: { error?: string } }; message?: string }).response?.data?.error) || (e as Error)?.message || 'OPSLAAN_MISLUKT');
      setBewaarFout({ code, tekst: foutVertaling(code, 'Не вдалося зберегти підключення.', 'De koppeling kon niet worden bewaard.') });
    } finally {
      setBezig(false);
    }
  };

  const idx = STAPPEN.findIndex((x) => x.id === stap);
  const veld = (k: string, uk: string, nl: string, plaats = '') => <label className='iw2-veld'><span>{tr(uk, nl)}</span><input value={velden[k] || ''} onChange={(e) => zet(k)(e.target.value)} placeholder={plaats} autoComplete='off' spellCheck={false} /></label>;
  const geheim = (k: string, uk: string, nl: string) => <label className='iw2-veld'><span>{tr(uk, nl)}</span><GeheimInvoer lang={lang} value={velden[k] || ''} onChange={zet(k)} max={1024} soort='integratie' /></label>;

  return (
    <section className='iw2' role='dialog' aria-modal='false' aria-label={tr('Майстер підключень', 'Koppelwizard')} data-wizard-v2 data-vlag={ADAPTER_OPSLAAN_VLAG}>
      <header className='iw2-kop'>
        <h3>{tr('Майстер підключень', 'Koppelwizard')}{i ? <> · {i.naam}</> : null}</h3>
        <button type='button' className='ic2-knop is-icoon' onClick={sluitVeilig} aria-label={tr('Скасувати й закрити', 'Annuleren en sluiten')}><X aria-hidden /></button>
      </header>
      <ol className='iw2-stappen' aria-label={tr('Етапи', 'Stappen')}>
        {STAPPEN.map((s, n) => <li key={s.id} data-stand={n < idx ? 'klaar' : n === idx ? 'nu' : 'later'} aria-current={n === idx ? 'step' : undefined}><b>{n + 1}</b><span>{s[lang]}</span></li>)}
      </ol>

      {stap === 'kies' ? (
        <div className='iw2-inhoud'>
          <input className='iw2-zoek' type='search' value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder={tr('Знайти сервіс…', 'Dienst zoeken…')} aria-label={tr('Знайти сервіс', 'Dienst zoeken')} />
          <ul className='iw2-keuzes'>{keuzes.map((x) => <li key={x.id}><button type='button' aria-pressed={id === x.id} onClick={() => { setId(x.id); setWijze(''); setUitslag(null); setBewaarFout(null); setOpgeslagen(false); setStap('wijze'); }}><Logo id={x.id} naam={x.naam} logo={x.logo} /><span>{x.naam}</span></button></li>)}</ul>
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
          {soort === 'adapter' && r?.adapter === 's3' ? <>{veld('adres', 'Адреса сховища', 'Eindpunt', 'https://s3.example.com')}{veld('emmer', 'Кошик сховища (S3)', 'Opslagemmer (bucket)')}{veld('regio', 'Регіон', 'Regio', 'us-east-1')}{veld('toegangsId', 'Ідентифікатор ключа доступу', 'Toegangssleutel-ID')}{geheim('geheim', 'Секретний ключ', 'Geheime sleutel')}</> : null}
          {soort === 'adapter' && r?.adapter === 'mqtt' ? <>{veld('host', 'Адреса брокера', 'Brokeradres', 'mqtt.example.com')}{veld('poort', 'Порт (TLS)', 'Poort (TLS)', '8883')}{veld('gebruiker', 'Ім’я входу', 'Gebruikersnaam')}{geheim('wachtwoord', 'Пароль', 'Wachtwoord')}</> : null}
          {soort === 'adapter' ? <p className='iw2-noot'>{adapterOpslaanAan ? tr('Пароль перевіряється наживо й під час збереження запечатується ключем вашого простору, ніколи не повертаючись в оглядач.', 'Het wachtwoord wordt live gecontroleerd en bij bewaren versleuteld met de sleutel van uw ruimte; het keert nooit terug naar de browser.') : tr('Пароль використовується лише для разової живої перевірки зв’язку і одразу стирається з пам’яті.', 'Het wachtwoord wordt alleen voor de eenmalige verbindingstest gebruikt en direct gewist.')}</p> : null}
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
        <div className='iw2-inhoud' aria-live='polite'>
          <ul className='iw2-lijst'>{(detailVan(i).rechten.length ? detailVan(i).rechten : [r?.operaties || ['', '']]).map((t, n) => <li key={n}>{t[lang === 'uk' ? 0 : 1]}</li>)}</ul>
          <p className='iw2-noot'>{tr('ШІ-агенти не отримують доступу до цього підключення автоматично. Доступ для агента ви вмикаєте окремо на сторінці MCP.', 'AI-agenten krijgen niet vanzelf toegang tot deze koppeling. Toegang voor een agent zet u apart aan op de MCP-pagina.')}</p>
          {bewaarFout ? <p className='iw2-uitslag' data-ok={false} role='alert'>{bewaarFout.tekst}{bewaarFout.code ? <code> {bewaarFout.code}</code> : null}</p> : null}
        </div>
      ) : null}

      {stap === 'klaar' && i ? (
        <div className='iw2-inhoud'>
          <p>{soort === 'adapter' && opgeslagen ? tr('Підключення перевірено й зашифровано збережено у вашому просторі. Сервіс додано до розділу «Підключені».', 'De koppeling is gecontroleerd en versleuteld bewaard in uw ruimte. De dienst staat nu bij «Gekoppeld».') : tr('Готово. Стан оновлено в каталозі та в інших відкритих вкладках.', 'Klaar. De stand is bijgewerkt in de catalogus en in andere open tabbladen.')}</p>
          {doelUrl ? <a className='ic2-knop is-primair' href={doelUrl}>{tr('Перейти до сервісу', 'Naar de dienst')}<ArrowRight aria-hidden /></a> : null}
        </div>
      ) : null}

      <footer className='iw2-voet'>
        <button type='button' className='ic2-knop' onClick={() => { setBewaarFout(null); setStap(vorige(stap)); }} disabled={stap === 'kies' || bezig}><ArrowLeft aria-hidden />{tr('Назад', 'Terug')}</button>
        <button type='button' className='ic2-knop' onClick={sluitVeilig} disabled={bezig}>{tr('Скасувати', 'Annuleren')}</button>
        {stap !== 'klaar' && stap !== 'kies' && !(stap === 'rechten' && soort === 'adapter' && adapterOpslaanAan) ? <button type='button' className='ic2-knop is-primair' onClick={() => { if (stap === 'rechten') wisGeheimen(); setStap(volgende(stap)); }} disabled={bezig || (stap === 'wijze' && !wijze) || (stap === 'controle' && !uitslag?.ok && soort === 'adapter')}>{tr('Далі', 'Verder')}<ArrowRight aria-hidden /></button> : null}
        {stap === 'rechten' && soort === 'adapter' && adapterOpslaanAan ? <button type='button' className='ic2-knop is-primair' data-wizard-bewaar='' onClick={() => void bewaarAdapter()} disabled={bezig || !uitslag?.ok}><Save aria-hidden />{bezig ? tr('Збереження…', 'Bewaren…') : tr('Зберегти підключення', 'Koppeling bewaren')}</button> : null}
        {stap === 'klaar' ? <button type='button' className='ic2-knop is-primair' onClick={sluitVeilig}>{tr('Закрити', 'Sluiten')}</button> : null}
      </footer>
    </section>
  );
}
