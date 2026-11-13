// Eén bestand in «Mijn bestanden»: als kaart (raster) en als rij (lijst-tabel). Zelfde gegevens, zelfde handelingen:
// klik = openen (met Shift = reeks kiezen; in keuzestand = aan/uit), Enter = openen, spatie = kiezen, ster = favoriet,
// deelknop = direct koppeling maken/beheren, ⋯ = contextmenu. Slepen draagt {ids} als text/plain-JSON.
import { EllipsisVertical, Eye, Link2, Share2, Star } from 'lucide-react';
import type { CloudBestand } from '../../shared/cloud-vnext-model';
import type { DelenDoelSamenvatting } from './cloud-client';
import { SOORT_ICOON } from './hulp';
import { bytesTekst, datumTekst, soortTekst, tr, type Lang } from './tekst';

export type BestandActies = {
  lang: Lang; b: CloudBestand; gekozen: boolean; keuzestand: boolean; prullenbak: boolean;
  deelInfo?: DelenDoelSamenvatting;
  onOpen: (b: CloudBestand) => void;
  onKies: (b: CloudBestand, metShift: boolean) => void;
  onFavoriet: (b: CloudBestand) => void;
  onDeel?: (b: CloudBestand) => void;
  onMeer: (b: CloudBestand, e: React.MouseEvent) => void;
  sleepIds: (b: CloudBestand) => string[];
};

const klik = (p: BestandActies) => (e: React.MouseEvent) => {
  if (e.defaultPrevented) return;
  if (e.shiftKey || p.keuzestand) { e.preventDefault(); p.onKies(p.b, e.shiftKey); } else p.onOpen(p.b);
};
const toets = (p: BestandActies) => (e: React.KeyboardEvent) => {
  if (e.target !== e.currentTarget) return;
  if (e.key === 'Enter') { e.preventDefault(); p.onOpen(p.b); }
  if (e.key === ' ') { e.preventDefault(); p.onKies(p.b, e.shiftKey); }
};
const sleep = (p: BestandActies) => (e: React.DragEvent) => {
  e.dataTransfer.setData('text/plain', JSON.stringify({ ids: p.sleepIds(p.b) }));
  e.dataTransfer.effectAllowed = 'move';
};
const Kies = (p: BestandActies) => (
  <input type='checkbox' checked={p.gekozen} readOnly data-cvn-selectie={p.b.id}
    aria-label={tr(p.lang, `Вибрати ${p.b.naam}`, `${p.b.naam} kiezen`)}
    onClick={(e) => { e.stopPropagation(); p.onKies(p.b, e.shiftKey); }} />
);
const Ster = (p: BestandActies) => (
  <button type='button' className={`cvn-icoonknop cvn-ster${p.b.favoriet ? ' is-aan' : ''}`} data-cvn-favoriet={p.b.id}
    aria-label={p.b.favoriet ? tr(p.lang, `Прибрати ${p.b.naam} з обраного`, `${p.b.naam} uit favorieten halen`) : tr(p.lang, `Додати ${p.b.naam} до обраного`, `${p.b.naam} aan favorieten toevoegen`)}
    aria-pressed={p.b.favoriet} onClick={(e) => { e.stopPropagation(); e.preventDefault(); p.onFavoriet(p.b); }}>
    <Star aria-hidden='true' />
  </button>
);
const DeelKnop = (p: BestandActies) => (
  !p.prullenbak && p.onDeel ? (
    <button type='button' className={`cvn-icoonknop cvn-deelknop${p.deelInfo?.actief ? ' is-actief' : ''}`} data-cvn-deel={p.b.id}
      aria-label={tr(p.lang, `Поділитися ${p.b.naam}`, `${p.b.naam} delen`)}
      title={tr(p.lang, 'Поділитися або керувати посиланнями', 'Delen of koppelingen beheren')}
      onClick={(e) => { e.stopPropagation(); e.preventDefault(); p.onDeel!(p.b); }}>
      <Share2 aria-hidden='true' />
    </button>
  ) : null
);
const Meer = (p: BestandActies) => (
  <button type='button' className='cvn-icoonknop' data-cvn-meer={p.b.id} aria-haspopup='menu'
    aria-label={tr(p.lang, `Дії з ${p.b.naam}`, `Acties voor ${p.b.naam}`)}
    onClick={(e) => { e.stopPropagation(); e.preventDefault(); p.onMeer(p.b, e); }}>
    <EllipsisVertical aria-hidden='true' />
  </button>
);

/** Kaart in het raster. */
export default function BestandKaart(p: BestandActies) {
  const Icoon = SOORT_ICOON[p.b.soort];
  return (
    <article className={`cvn-kaart${p.gekozen ? ' is-gekozen' : ''}`} data-cvn-kaart={p.b.id} role='listitem' tabIndex={0}
      aria-label={`${p.b.naam} — ${soortTekst(p.lang, p.b.soort)}`} draggable={!p.prullenbak}
      onClick={klik(p)} onDoubleClick={() => p.onOpen(p.b)} onKeyDown={toets(p)} onDragStart={sleep(p)}
      onContextMenu={(e) => { e.preventDefault(); p.onMeer(p.b, e); }}>
      <span className='cvn-kaart-kies'>{Kies(p)}</span>
      <span className='cvn-kaart-acties'>{DeelKnop(p)}{Ster(p)}{Meer(p)}</span>
      <span className='cvn-kaart-icoon' aria-hidden='true'><Icoon /></span>
      <span className='cvn-kaart-naam'>{p.b.naam}</span>
      <span className='cvn-kaart-meta'>
        <span>{bytesTekst(p.lang, p.b.bytes)}</span>
        <span>{datumTekst(p.lang, p.b.bijgewerktOp, false) || datumTekst(p.lang, p.b.bijgewerktOp)}</span>
        {p.b.versies > 0 ? <span>{tr(p.lang, `в. ${p.b.versies + 1}`, `v. ${p.b.versies + 1}`)}</span> : null}
      </span>
      {p.deelInfo && p.deelInfo.actief > 0 ? (
        <span className='cvn-kaart-deelpil' onClick={(e) => { if (p.onDeel) { e.stopPropagation(); p.onDeel(p.b); } }}>
          <Link2 aria-hidden='true' />{p.deelInfo.actief}
          <Eye aria-hidden='true' />{p.deelInfo.weergaven}
        </span>
      ) : null}
      {p.b.tags.length ? <span className='cvn-kaart-tags'>{p.b.tags.slice(0, 2).map((t) => <i key={t}>#{t}</i>)}{p.b.tags.length > 2 ? <i>+{p.b.tags.length - 2}</i> : null}</span> : null}
    </article>
  );
}

/** Dezelfde gegevens als rij in de lijst-tabel. */
export function BestandRij(p: BestandActies) {
  const Icoon = SOORT_ICOON[p.b.soort];
  return (
    <tr className={p.gekozen ? 'is-gekozen' : ''} data-cvn-kaart={p.b.id} tabIndex={0} draggable={!p.prullenbak}
      aria-label={`${p.b.naam} — ${soortTekst(p.lang, p.b.soort)}`}
      onClick={klik(p)} onDoubleClick={() => p.onOpen(p.b)} onKeyDown={toets(p)} onDragStart={sleep(p)}
      onContextMenu={(e) => { e.preventDefault(); p.onMeer(p.b, e); }}>
      <td className='cvn-cel-kies'>{Kies(p)}</td>
      <td className='cvn-cel-naam'>
        <Icoon aria-hidden='true' />
        <span>{p.b.naam}</span>
        {p.deelInfo && p.deelInfo.actief > 0 ? (
          <span className='cvn-kaart-deelpil is-rij' title={tr(p.lang, `Активних посилань: ${p.deelInfo.actief}, переглядів: ${p.deelInfo.weergaven}`, `Actieve koppelingen: ${p.deelInfo.actief}, weergaven: ${p.deelInfo.weergaven}`)}>
            <Link2 aria-hidden='true' />{p.deelInfo.actief} · <Eye aria-hidden='true' />{p.deelInfo.weergaven}
          </span>
        ) : null}
      </td>
      <td className='cvn-verberg-smal'>{soortTekst(p.lang, p.b.soort)}</td>
      <td>{bytesTekst(p.lang, p.b.bytes)}</td>
      <td className='cvn-verberg-smal'>{datumTekst(p.lang, p.b.bijgewerktOp)}</td>
      <td className='cvn-cel-acties'>{DeelKnop(p)}{Ster(p)}{Meer(p)}</td>
    </tr>
  );
}
