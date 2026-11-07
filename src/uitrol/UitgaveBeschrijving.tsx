// UI-010: tweetalige beschrijving + deelnemers van een release (UITROL-MANIFEST.json), met eerlijke terugval voor oude pakketten.
// Gebruikt in de wizard (voorbeeld vóór upload) en in «Про цей випуск» (Zijkant). De taal volgt `lang` zonder herladen.
import { useEffect, useState } from 'react';
import AgentLogo from '../agenten/AgentLogo';
import { kiesBeschrijving, mensFotoUitAccount, mensWeergaveNaam, oudeTaal, type DeelnemerAccount, type Manifest, type Rol } from '../../shared/uitrol-manifest';
import { actieveAccountFoto } from './Persoon';
import { tr, type Lang } from './types';

export { mensWeergaveNaam, type DeelnemerAccount };

const ROL: Record<Rol, [string, string]> = { ontwikkeling: ['розробка', 'ontwikkeling'], controle: ['перевірка', 'controle'], testen: ['тестування', 'testen'], verpakken: ['пакування', 'verpakken'], auteur: ['автор', 'auteur'] };
const slug = (s?: string) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-');

/** Знаходить фото профілю учасника-людини з особистого кабінету або списку облікових записів. */
export function mensFoto(naam: string | null | undefined, account?: DeelnemerAccount | null, accounts?: readonly DeelnemerAccount[]): string {
  return mensFotoUitAccount(naam, account, accounts) || actieveAccountFoto(account?.foto);
}

function MensDeelnemerFoto({ naam, account, accounts }: { naam: string; account?: DeelnemerAccount | null; accounts?: readonly DeelnemerAccount[] }) {
  const foto = mensFoto(naam, account, accounts);
  const [kapot, setKapot] = useState(false);
  useEffect(() => { setKapot(false); }, [foto]);
  return <span className='ut-deelnemer-mens' aria-hidden='true' data-kopieer-negeer>
    {foto && !kapot ? <img src={foto} alt='' loading='lazy' decoding='async' referrerPolicy='no-referrer' onError={() => setKapot(true)} /> : (naam.slice(0, 1) || '?')}
  </span>;
}

export function Deelnemers({ lang, m, account, accounts }: { lang: Lang; m: Manifest; account?: DeelnemerAccount | null; accounts?: readonly DeelnemerAccount[] }) {
  return <ul className='ut-deelnemers' data-ut-deelnemers>
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
  </ul>;
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
