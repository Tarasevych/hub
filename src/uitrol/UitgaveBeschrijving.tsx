// UI-010: tweetalige beschrijving + deelnemers van een release (UITROL-MANIFEST.json), met eerlijke terugval voor oude pakketten.
// Gebruikt in de wizard (voorbeeld vóór upload) en in «Про цей випуск» (Zijkant). De taal volgt `lang` zonder herladen.
import { useEffect, useState } from 'react';
import AgentLogo from '../agenten/AgentLogo';
import { isEigenAccount, kiesBeschrijving, mensFotoUitAccount, mensWeergaveNaam, oudeTaal, type BijdrageSoort, type DeelnemerAccount, type Manifest, type ManifestBijdrage, type ManifestVerwijzing, type Rol } from '../../shared/uitrol-manifest';
import { actieveAccountFoto } from './Persoon';
import { tr, type Lang } from './types';

export { mensWeergaveNaam, type DeelnemerAccount };

const ROL: Record<Rol, [string, string]> = { ontwikkeling: ['розробка', 'ontwikkeling'], controle: ['перевірка', 'controle'], testen: ['тестування', 'testen'], verpakken: ['пакування', 'verpakken'], auteur: ['автор', 'auteur'] };
const slug = (s?: string) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-');

/** Знаходить фото профілю учасника-людини з особистого кабінету або списку облікових записів. */
export function mensFoto(naam: string | null | undefined, account?: DeelnemerAccount | null, accounts?: readonly DeelnemerAccount[]): string {
  return mensFotoUitAccount(naam, account, accounts) || (isEigenAccount(naam, account) ? actieveAccountFoto(account?.foto, true) : '');
}

function MensDeelnemerFoto({ naam, account, accounts }: { naam: string; account?: DeelnemerAccount | null; accounts?: readonly DeelnemerAccount[] }) {
  const foto = mensFoto(naam, account, accounts);
  const [kapot, setKapot] = useState(false);
  useEffect(() => { setKapot(false); }, [foto]);
  return <span className='ut-deelnemer-mens' aria-hidden='true' data-kopieer-negeer>
    {foto && !kapot ? <img src={foto} alt='' loading='lazy' decoding='async' referrerPolicy='no-referrer' onError={() => setKapot(true)} /> : (naam.slice(0, 1) || '?')}
  </span>;
}

// BIJDRAGE-001: wie deed wat (uit orchestratie/bijdragen/, via UITROL-MANIFEST.json → bijdragen).
const SOORT: Record<BijdrageSoort, [string, string]> = {
  begin: ['розпочав', 'begon'], nieuw: ['створив', 'maakte'], herwerkt: ['переробив', 'werkte om'], afgerond: ['доробив', 'maakte af'],
  overname: ['перейняв', 'nam over'], samenvoeging: ['об’єднав', 'voegde samen'], herstel: ['повернув утрачене', 'herstelde'], controle: ['перевірив', 'controleerde'], correctie: ['виправив облік', 'corrigeerde'],
};
import { PR_ADRES, VerwijzingRij } from './Verwijzingen';
export { staatTekst, verwijzingKnoppen, VerwijzingRij } from './Verwijzingen';

/** Згорнутий перелік «Хто що зробив»: за задачами, з причиною переробки й посиланням на гілку чи запит на злиття. */
export function Bijdragen({ lang, lijst, verwijzingen = [] }: { lang: Lang; lijst: readonly ManifestBijdrage[]; verwijzingen?: readonly ManifestVerwijzing[] }) {
  if (!lijst.length) return null;
  const perTaak = new Map<string, ManifestBijdrage[]>();
  for (const b of lijst) perTaak.set(b.taakId, [...(perTaak.get(b.taakId) || []), b]);
  return <details className='ut-bijdragen' data-ut-bijdragen>
    <summary title={tr(lang, 'Хто з людей і яких ШІ-агентів (з моделлю) що зробив у цьому випуску, хто що переробив і чому. Допомагає знайти, де чия робота, якщо щось зникло чи змінилося.', 'Wie (mens of AI-agent met model) wat deed in deze release, wat werd omgewerkt en waarom. Helpt terugvinden wiens werk het is als iets verdween of veranderde.')}>
      {tr(lang, 'Хто що зробив', 'Wie deed wat')} <small className='ut-hint'>({lijst.length})</small>
    </summary>
    {[...perTaak].map(([taak, rijen]) => <div key={taak} className='ut-bijdragen-taak'>
      <small><b>{taak}</b></small>
      <ul>{rijen.map((b, i) => {
        const wat = lang === 'nl' ? b.wat.nl || b.wat.uk : b.wat.uk;
        const waarom = b.waarom ? (lang === 'nl' ? b.waarom.nl || b.waarom.uk : b.waarom.uk) : '';
        return <li key={i} className='ut-bijdrage'>
          {b.wie.soort === 'ai' ? <AgentLogo agent={[slug(b.wie.naam), b.wie.naam, b.wie.platform, b.wie.model].filter(Boolean).join(' ')} naam={b.wie.naam} size={18} /> : <span className='ut-deelnemer-mens' aria-hidden='true'>{b.wie.naam.slice(0, 1)}</span>}
          <span>
            <b>{b.wie.naam}</b>{b.wie.model ? <small className='ut-hint'> · {b.wie.model}</small> : null}
            {' '}<span className='ut-bijdrage-soort'>{tr(lang, SOORT[b.soort][0], SOORT[b.soort][1])}</span>
            {b.opdrachtgever?.naam ? <small className='ut-hint'> · {tr(lang, 'доручив', 'opdracht van')} {b.opdrachtgever.naam}</small> : null}
            {b.eerderGeregistreerd ? <small className='ut-hint' title={tr(lang, 'Виконавця в обліку виправлено окремим записом: первинний запис зберігається в історії.', 'De uitvoerder is met een aparte registratie gecorrigeerd; de oorspronkelijke registratie blijft in de geschiedenis.')}> · {tr(lang, 'в обліку виправлено, було:', 'gecorrigeerd, eerder:')} {b.eerderGeregistreerd.naam}{b.eerderGeregistreerd.model ? ` · ${b.eerderGeregistreerd.model}` : ''}</small> : null}
            <br /><span>{wat}</span>
            {waarom ? <><br /><small className='ut-hint'>{tr(lang, 'Чому: ', 'Waarom: ')}{waarom}</small></> : null}
            {verwijzingen.length ? null : b.pr ? <><br /><small><a href={`${PR_ADRES}${b.pr}`} target='_blank' rel='noreferrer noopener' title={tr(lang, 'Відкрити запит на злиття на GitHub: там повна історія змін і обговорення', 'Pull request op GitHub openen: volledige geschiedenis en bespreking')}>#{b.pr}</a>{b.tak ? ` · ${b.tak}` : ''}</small></> : b.tak ? <><br /><small className='ut-hint'>{b.tak}</small></> : null}
          </span>
        </li>;
      })}</ul>
      {verwijzingen.some((v) => v.taken.includes(taak)) ? <div className='ut-vw-rij'>{verwijzingen.filter((v) => v.taken.includes(taak)).map((v) => <VerwijzingRij key={`${v.soort}:${v.id}`} lang={lang} v={v} />)}</div> : null}
    </div>)}
    {verwijzingen.some((v) => !v.taken.length) ? <div className='ut-bijdragen-taak'><small><b>{tr(lang, 'Інше в цьому випуску', 'Overig in deze release')}</b></small><div className='ut-vw-rij'>{verwijzingen.filter((v) => !v.taken.length).map((v) => <VerwijzingRij key={`${v.soort}:${v.id}`} lang={lang} v={v} />)}</div></div> : null}
  </details>;
}

export function Deelnemers({ lang, m, account, accounts }: { lang: Lang; m: Manifest; account?: DeelnemerAccount | null; accounts?: readonly DeelnemerAccount[] }) {
  return <><ul className='ut-deelnemers' data-ut-deelnemers>
    {m.zonderAi && <li className='ut-hint'>{tr(lang, 'Випуск зроблено без ШІ (людське авторство).', 'Release gemaakt zonder AI (menselijk auteurschap).')}</li>}
    {m.deelnemers.map((d, i) => {
      const weergaveNaam = d.soort === 'mens' ? mensWeergaveNaam(d.naam, account) : d.naam;
      const aiSleutel = [slug(d.naam), d.naam, d.platform, d.tool, d.model?.id].filter(Boolean).join(' ');
      return <li key={i} className='ut-deelnemer'>
        {d.soort === 'ai' ? <AgentLogo agent={aiSleutel} naam={d.naam} size={22} /> : <MensDeelnemerFoto naam={weergaveNaam} account={account} accounts={accounts} />}
        <span><b>{weergaveNaam}</b>{d.platform ? ` · ${d.platform}` : ''}{d.tool && d.tool !== d.platform ? ` · ${d.tool}` : ''}
          {d.soort === 'ai' && <small className='ut-hint' title={d.model?.bron === 'omgeving' ? tr(lang, 'Підтверджено середовищем', 'Door de omgeving bevestigd') : d.model?.bron === 'auteur' ? tr(lang, 'Заявлено автором, не перевірено', 'Door de auteur opgegeven, niet gecontroleerd') : tr(lang, 'Модель невідома', 'Model onbekend')}>
            {' · '}{d.model?.id ? `${d.model.id}${d.model.versie ? ` ${d.model.versie}` : ''} (${d.model.bron === 'omgeving' ? tr(lang, 'підтверджено', 'bevestigd') : tr(lang, 'зі слів автора', 'volgens auteur')})` : tr(lang, 'модель невідома', 'model onbekend')}</small>}
          <small className='ut-hint'> · {d.rollen.map((r) => tr(lang, ROL[r][0], ROL[r][1])).join(', ')}</small></span>
      </li>;
    })}
  </ul>{m.bijdragen?.length ? <Bijdragen lang={lang} lijst={m.bijdragen} verwijzingen={m.verwijzingen ?? []} /> : null}</>;
}

export default function UitgaveBeschrijving({ lang, manifest, samenvatting, kort = false }: { lang: Lang; manifest: Manifest | null | undefined; samenvatting: string | null | undefined; kort?: boolean }) {
  const k = kiesBeschrijving(manifest, lang, samenvatting || null);
  if (k.tekst) {
    const t = k.tekst;
    return <div className='ut-release-tekst' lang={k.taal} data-taal={k.taal}>
      {k.taal !== lang && <p className='ut-hint' data-ut-taalterugval>{tr(lang, 'Перекладу немає — показано нідерландською.', 'Geen vertaling — getoond in het Oekraïens.')}</p>}
      <p><b>{t.titel}</b></p><p>{t.samenvatting}</p>
      {!kort && [[t.wijzigingen, 'Що змінено', 'Wijzigingen'], [t.fixes, 'Виправлено', 'Opgelost'], [t.beperkingen, 'Відомі обмеження', 'Bekende beperkingen']].map(([l, uk, nl]) => (l as string[]).length ? <div key={uk as string}><small><b>{tr(lang, uk as string, nl as string)}</b></small><ul>{(l as string[]).map((x, i) => <li key={i}>{x}</li>)}</ul></div> : null)}
      {!kort && t.instructies && <p className='ut-hint'>{t.instructies}</p>}
    </div>;
  }
  if (!samenvatting) return null;
  const oud = oudeTaal(samenvatting);
  return <div className='ut-release-tekst' data-taal='origineel'>
    {oud !== lang && <p className='ut-hint' data-ut-taalterugval>{tr(lang, 'Старий формат пакета: опис лише мовою оригіналу, перекладу немає.', 'Oud pakketformaat: beschrijving alleen in de oorspronkelijke taal, geen vertaling.')}</p>}
    <p lang={oud || undefined}>{kort ? samenvatting.slice(0, 600) : samenvatting}</p>
  </div>;
}
