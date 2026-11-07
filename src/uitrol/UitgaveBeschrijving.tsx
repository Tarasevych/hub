// UI-010: tweetalige beschrijving + deelnemers van een release (UITROL-MANIFEST.json), met eerlijke terugval voor oude pakketten.
// Gebruikt in de wizard (voorbeeld vóór upload) en in «Про цей випуск» (Zijkant). De taal volgt `lang` zonder herladen.
import AgentLogo from '../agenten/AgentLogo';
import { kiesBeschrijving, oudeTaal, type Manifest, type Rol } from '../../shared/uitrol-manifest';
import { tr, type Lang } from './types';

const ROL: Record<Rol, [string, string]> = { ontwikkeling: ['розробка', 'ontwikkeling'], controle: ['перевірка', 'controle'], testen: ['тестування', 'testen'], verpakken: ['пакування', 'verpakken'], auteur: ['автор', 'auteur'] };
const slug = (s?: string) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
const GENERIEKE_MENS = /^(власник|eigenaar|owner|admin|administrator|адміністратор|user|користувач|gebruiker|автор|auteur|author|невідомо|onbekend|unknown)$/i;

/** Повертає справжнє ім'я або ел. пошту облікового запису власника замість загальних псевдонімів на кшталт «Власник». */
export function mensWeergaveNaam(naam: string | null | undefined, account?: { naam?: string; email?: string } | null): string {
  const schoon = (naam || '').trim();
  const accNaam = (account?.naam || '').trim();
  const accEmail = (account?.email || '').trim();
  const accVol = accNaam && accEmail ? `${accNaam} (${accEmail})` : accNaam || accEmail;
  if ((!schoon || GENERIEKE_MENS.test(schoon)) && accVol) return accVol;
  return schoon || accVol || '';
}

export function Deelnemers({ lang, m, account }: { lang: Lang; m: Manifest; account?: { naam?: string; email?: string } | null }) {
  return <ul className='ut-deelnemers' data-ut-deelnemers>
    {m.zonderAi && <li className='ut-hint'>{tr(lang, 'Випуск зроблено без ШІ (людське авторство).', 'Release gemaakt zonder AI (menselijk auteurschap).')}</li>}
    {m.deelnemers.map((d, i) => {
      const weergaveNaam = d.soort === 'mens' ? mensWeergaveNaam(d.naam, account) : d.naam;
      return <li key={i} className='ut-deelnemer'>
        {d.soort === 'ai' ? <AgentLogo agent={slug(d.naam)} naam={d.naam} size={22} /> : <span className='ut-deelnemer-mens' aria-hidden='true' data-kopieer-negeer>{weergaveNaam.slice(0, 1)}</span>}
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
