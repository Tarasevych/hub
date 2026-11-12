// Integraties: eerlijke catalogus (alleen Home Assistant is er; de rest heet gepland/niet ondersteund, met reden en bron) en de
// Home Assistant-stappen: instellen (adres + langlevend token, token wordt op de server versleuteld en nooit teruggegeven) →
// apparaten zoeken → importeren (selectie) → opdrachten toestaan (step-up) → synchroniseren → ontkoppelen. Geen merklogo's.
import { useMemo, useState } from 'react';
import { AlertCircle, Check, ExternalLink, Plug, RefreshCw, Search, ShieldCheck, Trash2 } from 'lucide-react';
import { INTEGRATIE_CATALOGUS, INTEGRATIE_STAND_LABEL, INTEGRATIE_STAND_TEKST, huisTekst, type Integratie } from '../../../shared/huis-model';
import type { OnderdeelProps } from '../HuisPagina';
import HuisLaag from '../HuisLaag';
import { HuisFout, huisClient, type OntdektApparaatUit } from '../huis-client';
import { datumTekst, foutTekst, geledenTekst, soortTekst, tr } from '../tekst';

export default function Integraties({ lang, smal, woningId, ov, vernieuw, toon }: OnderdeelProps) {
  const [wizard, setWizard] = useState(false);
  const [adres, setAdres] = useState('');
  const [token, setToken] = useState('');
  const [naam, setNaam] = useState('');
  const [fout, setFout] = useState('');
  const [bezig, setBezig] = useState('');
  const [ontdekt, setOntdekt] = useState<{ integratie: Integratie; lijst: OntdektApparaatUit[]; overgeslagen: number; keuze: Set<string> } | null>(null);
  const [laatste, setLaatste] = useState('');
  const mag = ov.lid.magSchrijven; const eigenaar = ov.lid.rol === 'eigenaar';
  const ha = useMemo(() => ov.integraties.filter((i) => i.soort === 'home-assistant'), [ov.integraties]);
  const meld = (e: unknown) => { const c = e instanceof HuisFout ? e.code : 'FOUT'; setFout(foutTekst(lang, c)); toon(foutTekst(lang, c), 'fout'); };

  const instellen = async () => {
    setBezig('instellen'); setFout('');
    try { const i = await huisClient.integratieInstellen(woningId, adres.trim(), token.trim(), naam.trim() || undefined); setToken(''); setAdres(''); setNaam(''); setWizard(false); await vernieuw(); toon(i.stand === 'verbonden' ? tr(lang, `Підключено: ${String(i.info.versie ?? '')} ${String(i.info.locatie ?? '')}`.trim(), `Verbonden: ${String(i.info.versie ?? '')} ${String(i.info.locatie ?? '')}`.trim()) : tr(lang, 'Збережено, але з’єднання не вдалося — див. стан.', 'Opgeslagen, maar verbinden lukte niet — zie de stand.')); }
    catch (e) { meld(e); } finally { setBezig(''); }
  };
  const ontdekken = async (i: Integratie) => {
    setBezig(i.id); setFout('');
    try { const d = await huisClient.integratieOntdekken(woningId, i.id); setOntdekt({ integratie: i, lijst: d.apparaten, overgeslagen: d.overgeslagen, keuze: new Set(d.apparaten.filter((a) => !a.bestaat).map((a) => a.bronId)) }); }
    catch (e) { meld(e); } finally { setBezig(''); }
  };
  const importeren = async () => {
    if (!ontdekt) return; setBezig('import');
    try { const r = await huisClient.integratieImporteren(woningId, ontdekt.integratie.id, ontdekt.keuze.size === ontdekt.lijst.length ? null : [...ontdekt.keuze]); setOntdekt(null); await vernieuw(); toon(tr(lang, `Імпортовано: ${r.nieuw} нових, ${r.bijgewerkt} оновлено, ${r.overgeslagen} пропущено.`, `Geïmporteerd: ${r.nieuw} nieuw, ${r.bijgewerkt} bijgewerkt, ${r.overgeslagen} overgeslagen.`)); }
    catch (e) { meld(e); } finally { setBezig(''); }
  };
  const sync = async (i: Integratie) => {
    setBezig(i.id);
    try { const r = await huisClient.integratieSynchroniseren(woningId, i.id); setLaatste(tr(lang, `Синхронізовано: ${r.bijgewerkt} оновлено, ${r.weg} зникло, ${r.nieuwBeschikbaar} нових доступні для імпорту.`, `Gesynchroniseerd: ${r.bijgewerkt} bijgewerkt, ${r.weg} weg, ${r.nieuwBeschikbaar} nieuw beschikbaar voor import.`)); await vernieuw(); }
    catch (e) { meld(e); } finally { setBezig(''); }
  };
  const schrijven = async (i: Integratie, aan: boolean) => {
    if (aan && !window.confirm(tr(lang, 'Дозволити командам з цього сайту змінювати стан пристроїв через Home Assistant? Критичні пристрої все одно вимагатимуть окремого підтвердження. Сервер попросить підтвердити вхід.', 'Opdrachten van deze site toestaan om via Home Assistant apparaten te bedienen? Kritieke apparaten vragen hoe dan ook aparte bevestiging. De server vraagt om bevestiging van de aanmelding.'))) return;
    setBezig(i.id);
    try { await huisClient.integratieSchrijven(woningId, i.id, aan); await vernieuw(); toon(aan ? tr(lang, 'Команди дозволено.', 'Opdrachten toegestaan.') : tr(lang, 'Лише читання.', 'Alleen lezen.')); }
    catch (e) { meld(e); } finally { setBezig(''); }
  };
  const verwijderen = async (i: Integratie) => {
    if (!window.confirm(tr(lang, `Від’єднати «${i.naam}»? Пристрої цієї інтеграції та їх стани буде видалено з сайту (у Home Assistant нічого не зміниться).`, `«${i.naam}» ontkoppelen? De apparaten van deze integratie en hun toestanden verdwijnen van de site (in Home Assistant verandert niets).`))) return;
    setBezig(i.id);
    try { await huisClient.integratieVerwijderen(woningId, i.id); await vernieuw(); toon(tr(lang, 'Інтеграцію від’єднано.', 'Integratie ontkoppeld.')); }
    catch (e) { meld(e); } finally { setBezig(''); }
  };

  return (
    <div className='hv-integraties'>
      <section className='hv-blok' aria-labelledby='hv-int-actief'>
        <h3 id='hv-int-actief'>{tr(lang, 'Підключені шлюзи', 'Gekoppelde gateways')}</h3>
        {!ha.length ? <p className='hv-hint' data-hv-leeg='geen-integratie'>{tr(lang, 'Ще нічого не підключено. Єдиний доступний адаптер у цьому випуску — Home Assistant (локально, через вихідне з’єднання з сервера).', 'Nog niets gekoppeld. De enige beschikbare adapter in deze release is Home Assistant (lokaal, via een uitgaande verbinding vanaf de server).')}</p> : null}
        {ha.map((i) => (
          <article key={i.id} className={`hv-integratie is-${i.stand}`} data-hv-integratie={i.id} data-hv-integratie-stand={i.stand}>
            <header><Plug aria-hidden='true' /><strong>{i.naam}</strong><span className={`hv-chip is-passief is-${i.stand}`}>{tr(lang, INTEGRATIE_STAND_TEKST[i.stand][0], INTEGRATIE_STAND_TEKST[i.stand][1])}</span>{i.schrijven ? <span className='hv-chip is-passief is-schrijven'><ShieldCheck aria-hidden='true' />{tr(lang, 'команди дозволено', 'opdrachten toegestaan')}</span> : <span className='hv-chip is-passief'>{tr(lang, 'лише читання', 'alleen lezen')}</span>}</header>
            <table className='hv-tabel'><tbody>
              <tr><th scope='row'>{tr(lang, 'Адреса', 'Adres')}</th><td><code>{i.adres}</code></td></tr>
              <tr><th scope='row'>{tr(lang, 'Версія / локація', 'Versie / locatie')}</th><td>{String(i.info.versie ?? '—')} · {String(i.info.locatie ?? '—')}</td></tr>
              <tr><th scope='row'>{tr(lang, 'Останній контакт', 'Laatste contact')}</th><td>{geledenTekst(lang, i.hartslag)} · {tr(lang, 'синхронізація', 'sync')}: {datumTekst(lang, i.laatsteSync)}</td></tr>
              <tr><th scope='row'>{tr(lang, 'Пристроїв на сайті', 'Apparaten op de site')}</th><td>{ov.apparaten.filter((a) => a.integratieId === i.id).length}</td></tr>
              {i.fout ? <tr><th scope='row'>{tr(lang, 'Помилка', 'Fout')}</th><td className='hv-fout-tekst'>{foutTekst(lang, i.fout)}</td></tr> : null}
            </tbody></table>
            {mag ? (
              <div className='hv-knoppen'>
                <button type='button' className='hv-knop is-klein is-hoofd' disabled={Boolean(bezig)} onClick={() => void ontdekken(i)} data-hv-ontdekken={i.id}><Search aria-hidden='true' />{tr(lang, 'Знайти пристрої', 'Apparaten zoeken')}</button>
                <button type='button' className='hv-knop is-klein' disabled={Boolean(bezig)} onClick={() => void sync(i)} data-hv-sync={i.id}><RefreshCw aria-hidden='true' />{tr(lang, 'Синхронізувати', 'Synchroniseren')}</button>
                {eigenaar ? <button type='button' className={`hv-knop is-klein${i.schrijven ? '' : ' is-stil'}`} disabled={Boolean(bezig)} onClick={() => void schrijven(i, !i.schrijven)} aria-pressed={i.schrijven} data-hv-schrijven={i.id}><ShieldCheck aria-hidden='true' />{i.schrijven ? tr(lang, 'Заборонити команди', 'Opdrachten verbieden') : tr(lang, 'Дозволити команди', 'Opdrachten toestaan')}</button> : null}
                {eigenaar ? <button type='button' className='hv-icoonknop is-gevaar' disabled={Boolean(bezig)} onClick={() => void verwijderen(i)} aria-label={tr(lang, 'Від’єднати', 'Ontkoppelen')} data-hv-ontkoppel={i.id}><Trash2 /></button> : null}
              </div>
            ) : null}
          </article>
        ))}
        {laatste ? <p className='hv-hint' data-hv-sync-uitkomst='1'>{laatste}</p> : null}
        {mag && !ha.length ? <button type='button' className='hv-knop is-hoofd' onClick={() => { setWizard(true); setFout(''); }} data-hv-ha-start='1'><Plug aria-hidden='true' />{tr(lang, 'Підключити Home Assistant', 'Home Assistant koppelen')}</button> : null}
        {mag && ha.length ? <button type='button' className='hv-knop is-klein is-stil' onClick={() => { setWizard(true); setFout(''); }}>{tr(lang, 'Ще один Home Assistant', 'Nog een Home Assistant')}</button> : null}
      </section>

      <section className='hv-blok' aria-labelledby='hv-int-cat'>
        <h3 id='hv-int-cat'>{tr(lang, 'Що підтримується — чесно', 'Wat ondersteund is — eerlijk')}</h3>
        <p className='hv-hint'>{tr(lang, 'Сумісність визначається моделлю пристрою та його можливостями, а не брендом. Статуси нижче — те, що реально є в коді цього випуску.', 'Compatibiliteit hangt af van het model en zijn mogelijkheden, niet van het merk. De standen hieronder zijn wat er echt in de code van deze release zit.')}</p>
        <div className='hv-raster'>
          {INTEGRATIE_CATALOGUS.map((k) => (
            <article key={k.id} className={`hv-kaart is-catalogus is-${k.stand}`} data-hv-catalogus={k.id} data-hv-catalogus-stand={k.stand}>
              <small className={`hv-chip is-passief is-${k.stand}`}>{tr(lang, INTEGRATIE_STAND_LABEL[k.stand][0], INTEGRATIE_STAND_LABEL[k.stand][1])}</small>
              <strong>{k.naam}</strong>
              <span className='hv-waarde'>{huisTekst(k.wat, lang)}</span>
              <dl className='hv-details'>
                <dt>{tr(lang, 'З’єднання', 'Verbinding')}</dt><dd>{huisTekst(k.lokaal, lang)}</dd>
                <dt>{tr(lang, 'Можливості', 'Mogelijkheden')}</dt><dd>{huisTekst(k.mogelijkheden, lang)}</dd>
                <dt>{tr(lang, 'Вимоги', 'Vereisten')}</dt><dd>{huisTekst(k.vereisten, lang)}</dd>
              </dl>
              <a href={k.bron} target='_blank' rel='noreferrer noopener' className='hv-link'><ExternalLink aria-hidden='true' />{tr(lang, 'документація', 'documentatie')}</a>
            </article>
          ))}
        </div>
      </section>

      {wizard ? (
        <HuisLaag lang={lang} soort={smal ? 'scherm' : 'venster'} titel={tr(lang, 'Home Assistant підключити', 'Home Assistant koppelen')} onSluit={() => setWizard(false)} data={{ 'hv-ha-wizard': '1' }}>
          <ol className='hv-uitleg'>
            <li>{tr(lang, 'У Home Assistant: Профіль → Безпека → «Довгострокові токени доступу» → створити токен для «Mijn Ruimte».', 'In Home Assistant: Profiel → Beveiliging → «Langlevende toegangstokens» → maak een token voor «Mijn Ruimte».')}</li>
            <li>{tr(lang, 'Адреса має бути доступною з сервера сайту (LAN або VPN), напр. http://homeassistant.local:8123. Не відкривайте порт в інтернет.', 'Het adres moet bereikbaar zijn vanaf de server van de site (LAN of VPN), bv. http://homeassistant.local:8123. Zet geen poort open naar internet.')}</li>
            <li>{tr(lang, 'Токен шифрується на сервері й більше не показується. Спочатку — лише читання; команди вмикаються окремо.', 'Het token wordt op de server versleuteld en nooit meer getoond. Eerst alleen lezen; opdrachten zet u apart aan.')}</li>
          </ol>
          <form onSubmit={(e) => { e.preventDefault(); void instellen(); }}>
            <label className='hv-veld'><span>{tr(lang, 'Назва (необов’язково)', 'Naam (optioneel)')}</span><input value={naam} maxLength={80} onChange={(e) => setNaam(e.target.value)} placeholder='Home Assistant' data-hv-eerste='1' /></label>
            <label className='hv-veld'><span>{tr(lang, 'Адреса', 'Adres')}</span><input value={adres} inputMode='url' autoComplete='off' placeholder='http://192.168.1.10:8123' required onChange={(e) => setAdres(e.target.value)} data-hv-ha-adres='1' /></label>
            <label className='hv-veld'><span>{tr(lang, 'Довгостроковий токен', 'Langlevend token')}</span><input type='password' value={token} autoComplete='off' required onChange={(e) => setToken(e.target.value)} data-hv-ha-token='1' /></label>
            {fout ? <p className='hv-melding is-fout' role='alert'><AlertCircle aria-hidden='true' />{fout}</p> : null}
            <div className='hv-knoppen'><button type='submit' className='hv-knop is-hoofd' disabled={bezig === 'instellen' || !adres.trim() || !token.trim()} data-hv-ha-opslaan='1'>{bezig === 'instellen' ? tr(lang, 'Перевіряю…', 'Testen…') : tr(lang, 'Перевірити та зберегти', 'Testen en opslaan')}</button></div>
          </form>
        </HuisLaag>
      ) : null}

      {ontdekt ? (
        <HuisLaag lang={lang} soort={smal ? 'scherm' : 'venster'} titel={tr(lang, `Знайдено: ${ontdekt.lijst.length}`, `Gevonden: ${ontdekt.lijst.length}`)} onSluit={() => setOntdekt(null)} data={{ 'hv-ontdekt': String(ontdekt.lijst.length) }}>
          <p className='hv-hint'>{tr(lang, `Пропущено ${ontdekt.overgeslagen} сутностей без корисної моделі (автоматизації, сонце, скрипти…). Позначте, що імпортувати; вже наявні на сайті оновляться.`, `${ontdekt.overgeslagen} entiteiten zonder bruikbaar model overgeslagen (automatiseringen, zon, scripts…). Vink aan wat u importeert; wat al op de site staat wordt bijgewerkt.`)}</p>
          <div className='hv-knoppen'>
            <button type='button' className='hv-knop is-klein is-stil' onClick={() => setOntdekt({ ...ontdekt, keuze: new Set(ontdekt.lijst.map((a) => a.bronId)) })}>{tr(lang, 'Усі', 'Alle')}</button>
            <button type='button' className='hv-knop is-klein is-stil' onClick={() => setOntdekt({ ...ontdekt, keuze: new Set() })}>{tr(lang, 'Жодного', 'Geen')}</button>
          </div>
          <ul className='hv-lijst is-dicht' data-hv-ontdekt-lijst='1'>
            {ontdekt.lijst.map((a) => (
              <li key={a.bronId}>
                <label className='hv-keuze'><input type='checkbox' checked={ontdekt.keuze.has(a.bronId)} onChange={(e) => { const k = new Set(ontdekt.keuze); if (e.target.checked) k.add(a.bronId); else k.delete(a.bronId); setOntdekt({ ...ontdekt, keuze: k }); }} data-hv-ontdekt-keuze={a.bronId} /><span><strong>{a.naam}</strong> <small>{soortTekst(lang, a.soort)} · <code>{a.bronId}</code>{a.kritiek ? ` · ${tr(lang, 'критично', 'kritiek')}` : ''}{a.bestaat ? ` · ${tr(lang, 'уже на сайті', 'al op de site')}` : ''}{!a.online ? ` · ${tr(lang, 'офлайн', 'offline')}` : ''}</small></span></label>
              </li>
            ))}
          </ul>
          <div className='hv-knoppen'><button type='button' className='hv-knop is-hoofd' disabled={bezig === 'import' || !ontdekt.keuze.size} onClick={() => void importeren()} data-hv-importeren='1'><Check aria-hidden='true' />{tr(lang, `Імпортувати ${ontdekt.keuze.size}`, `${ontdekt.keuze.size} importeren`)}</button></div>
        </HuisLaag>
      ) : null}
    </div>
  );
}
