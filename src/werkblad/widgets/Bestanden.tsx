// «Останні файли» en «Хмарні сховища»: POST /api/owner/hub/blocks/data (cloud + Google Drive-projectie; opslag = quota die de server
// al kent). Merklogo's komen uitsluitend uit src/merk (officieel); een opslag zonder bekende quota krijgt geen balk — geen verzonnen cijfers.
import { ArrowRight, ExternalLink, File, FileImage, FileSpreadsheet, FileText, FileVideo, Folder, type LucideIcon } from 'lucide-react';
import Logo from '../../merk/MerkLogo';
import { loadHubBlockData, opslagUit, readHubBlockDataCache, useBron, type HubBlockDataPayload } from '../gegevens';
import { bytesTekst, regelsVoor, tr, wanneer, type Lang, type WidgetProps } from '../soorten';
import { BronToestand, Fout, Leeg, NietGekoppeld, Skelet } from './Vlak';
import { formaatInfo, formaatVan } from '../../../shared/zoek-formaten';

/** Kort formaat voor de regel («xlsx», «pdf», «zip»): eerst de extensie van de naam, dan het bekende formaat bij het MIME-type, en pas
 *  daarna het korte subtype. Nooit «vnd.openxmlformats-officedocument.spreadsheetml.sheet» (stand 23.10, 1280 en 390). */
const kortFormaat = (mime: string, titel: string): string => {
  const ext = /\.([a-z0-9]{1,8})$/i.exec(titel || '')?.[1]?.toLowerCase();
  if (ext) return ext;
  const id = formaatVan(mime, titel);
  const info = id !== 'onbekend' ? formaatInfo(id) : undefined;
  if (info?.extensies[0]) return info.extensies[0];
  const sub = (String(mime || '').split('/').pop() || '').replace(/^x-/, '');
  return sub.length <= 12 ? sub : '';
};

const icoonVoor = (mime: string, titel: string): LucideIcon => {
  const m = mime.toLowerCase(), t = titel.toLowerCase();
  if (m.includes('folder')) return Folder;
  if (m.startsWith('image/') || /\.(png|jpe?g|gif|webp|heic)$/.test(t)) return FileImage;
  if (m.startsWith('video/') || /\.(mp4|mov|mkv)$/.test(t)) return FileVideo;
  if (m.includes('spreadsheet') || m.includes('excel') || /\.(xlsx?|csv)$/.test(t)) return FileSpreadsheet;
  if (m.includes('pdf') || m.includes('document') || m.startsWith('text/') || /\.(pdf|docx?|txt|md)$/.test(t)) return FileText;
  return File;
};
const PROVIDER: Record<string, { naam: string; logo: string }> = { google_drive: { naam: 'Google Drive', logo: 'googledrive' }, onedrive: { naam: 'OneDrive', logo: 'microsoftonedrive' }, dropbox: { naam: 'Dropbox', logo: 'dropbox' } };

function Opslag({ lang, p, acties, zichtbaar, bezig }: { lang: Lang; p: HubBlockDataPayload | null; acties: WidgetProps['acties']; zichtbaar: boolean; bezig: boolean }) {
  const bron = p?.sources?.files;
  if (!bron) return bezig || !zichtbaar ? <Skelet rijen={3} /> : <Leeg>{tr(lang, 'Дані сховищ зараз недоступні.', 'Opslaggegevens zijn nu niet beschikbaar.')}</Leeg>;
  if (bron.status === 'gesloten' && bron.gesloten) return BronToestand({ lang, bron, soort: 'files', acties, leeg: '' });
  const lijst = opslagUit(p);
  if (!lijst.length) return bron.gekoppeld === false ? <NietGekoppeld lang={lang} soort='files' acties={acties} /> : <Leeg>{tr(lang, 'Сервер ще не має даних про обсяг підключених сховищ (або сервер старіший за цей віджет).', 'De server kent nog geen opslaggegevens van de gekoppelde opslag (of de server is ouder dan dit widget).')}</Leeg>;
  const totaal = lijst.reduce((n, o) => n + (o.limiet > 0 ? o.limiet : 0), 0), gebruikt = lijst.reduce((n, o) => n + (o.limiet > 0 ? o.gebruik : 0), 0);
  return (
    <div className='wb-lijst-vlak'>
      {totaal > 0 ? (
        <div className='wb-opslag-totaal'>
          <small>{tr(lang, `Зайнято ${bytesTekst(lang, gebruikt)} з ${bytesTekst(lang, totaal)}`, `${bytesTekst(lang, gebruikt)} van ${bytesTekst(lang, totaal)} in gebruik`)}</small>
          <div className='wb-voortgang' role='progressbar' aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((gebruikt / totaal) * 100)} aria-label={tr(lang, 'Зайнято у підключених сховищах', 'In gebruik in gekoppelde opslag')}><span style={{ width: `${Math.min(100, Math.round((gebruikt / totaal) * 100))}%` }} /></div>
        </div>
      ) : null}
      <ul className='wb-rijen wb-opslag'>
        {lijst.map((o) => {
          const pr = PROVIDER[o.provider] || { naam: o.provider, logo: '' };
          return (
            <li key={o.id} data-wb-opslag={o.provider}>
              <span className='wb-merk' aria-hidden='true'><Logo id={o.provider} naam={pr.naam} logo={pr.logo} maat={28} /></span>
              <span className='wb-rij-titel'>{pr.naam}<small>{o.email}</small></span>
              <small className='wb-opslag-cijfer'>{o.limiet > 0 ? bytesTekst(lang, o.gebruik) : tr(lang, 'обсяг невідомий', 'gebruik onbekend')}</small>
            </li>
          );
        })}
      </ul>
      <button type='button' className='wb-alles' onClick={() => acties.dienst('cloud', 'accounts')}>{tr(lang, 'Переглянути всі', 'Alles bekijken')}<ArrowRight aria-hidden='true' /></button>
    </div>
  );
}

export default function Bestanden({ lang, item, acties, zichtbaar, ownerUserId: owner, kolommen }: WidgetProps) {
  const { waarde, fout, bezig, herlaad } = useBron<HubBlockDataPayload>((f) => loadHubBlockData(owner, f), readHubBlockDataCache(owner), zichtbaar);
  if (fout) return <Fout lang={lang} code={fout} opnieuw={herlaad} />;
  if (item.id === 'opslag') return <Opslag lang={lang} p={waarde} acties={acties} zichtbaar={zichtbaar} bezig={bezig} />;
  const bron = waarde?.sources?.files;
  if (!bron) return bezig || !zichtbaar ? <Skelet rijen={4} /> : <Fout lang={lang} code='GEEN_BRON' opnieuw={herlaad} />;
  const toestand = BronToestand({ lang, bron, soort: 'files', acties, leeg: tr(lang, 'У проєкції ще немає файлів.', 'De projectie bevat nog geen bestanden.') });
  if (toestand) return toestand;
  const max = regelsVoor(item.r, kolommen, 2, 2);
  return (
    <div className='wb-lijst-vlak'>
      <ul className='wb-rijen wb-bestanden'>
        {bron.items.slice(0, max).map((f) => {
          const Icoon = icoonVoor(f.subtitle, f.title);
          const body = <><Icoon aria-hidden='true' className={`wb-bestand-icoon is-${f.badge}`} /><span className='wb-rij-titel'>{f.title}<small>{kortFormaat(f.subtitle || '', f.title) ? `${kortFormaat(f.subtitle || '', f.title)} · ` : ''}{wanneer(lang, f.updatedAt)}</small></span></>;
          return <li key={f.id}>{f.url ? <a href={f.url} target='_blank' rel='noreferrer'>{body}<ExternalLink aria-hidden='true' /></a> : body}</li>;
        })}
      </ul>
      <button type='button' className='wb-alles' onClick={() => acties.dienst('cloud', 'recent')}>{tr(lang, 'Переглянути всі', 'Alles bekijken')}<ArrowRight aria-hidden='true' /></button>
    </div>
  );
}
