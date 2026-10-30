// UI-010 fase 2 (vlag uitrol-weergave-v2): «Хто має доступ до підготовки» op «Огляд» — compacte horizontale rijen.
// Agents met AgentLogo (merklogo, niet door het thema vervormd), mensen met hun echte foto (Persoon). Status = effectieveToegang,
// dezelfde definitie als de volledige lijst in «Налаштування». Twee rechten van dezelfde agent worden onderscheiden door soort,
// omvang en datum van toekenning — geen verzonnen ids. Details in de tooltip (title) van de rij.
import AgentLogo from '../agenten/AgentLogo';
import HulpVraag from '../hulp/HulpVraag';
import Persoon from './Persoon';
import { effectieveToegang, TOEGANG_TEKST } from './weergave-v2';
import { SOORT, datum, tr, type Grant, type Lang, type Overzicht } from './types';

const OMVANG: Record<Grant['soort'], [string, string]> = { account: ['свій акаунт', 'eigen account'], agent: ['усі підключення агента', 'alle koppelingen van de agent'], 'mcp-koppeling': ['одне підключення', 'één koppeling'], agenttoken: ['один токен', 'één token'] };
const kortTermijn = (lang: Lang, g: Grant) => {
  if (g.onbepaald || new Date(g.verlooptOp).getUTCFullYear() >= 9999) return tr(lang, 'безстроково', 'onbepaald');
  const ms = Date.parse(g.verlooptOp) - Date.now(); if (!(ms > 0)) return tr(lang, 'минув', 'verlopen');
  const d = Math.floor(ms / 86400_000); const u = Math.floor(ms / 3600_000);
  return d >= 1 ? tr(lang, `${d} дн.`, `${d} d`) : u >= 1 ? tr(lang, `${u} год`, `${u} u`) : tr(lang, '< 1 год', '< 1 u');
};

export default function ToegangBlok({ lang, data, naarInstellen }: { lang: Lang; data: Overzicht; naarInstellen: () => void }) {
  const rijen = data.voorbereiders.filter((g) => g.status === 'actief').map((g) => ({ g, staat: effectieveToegang(g, data) }));
  const zelfde = (g: Grant) => rijen.filter((r) => r.g.soort !== 'account' && r.g.label === g.label).length > 1;
  return <section className='ut-kaart ut-toegang' data-ut-toegang aria-labelledby='ut-toegang-titel'>
    <header className='ut-toegang-kop'><h2 id='ut-toegang-titel'>{tr(lang, 'Хто має доступ до підготовки', 'Wie heeft toegang tot voorbereiden')}</h2><HulpVraag k='uitrol.toegang' lang={lang} /></header>
    {rijen.length === 0 ? <p className='ut-hint'>{tr(lang, 'Ніхто окремо. Власний архів можна завантажити завжди.', 'Niemand apart. Uw eigen archief kunt u altijd uploaden.')}</p>
      : <ul className='ut-toegang-lijst'>{rijen.map(({ g, staat }) => {
        const naam = g.soort === 'account' && g.eigenaar?.naam ? g.eigenaar.naam : g.label;
        const titel = [`${tr(lang, SOORT[g.soort][0], SOORT[g.soort][1])} · ${tr(lang, OMVANG[g.soort][0], OMVANG[g.soort][1])}`,
          `${tr(lang, 'Надано', 'Gegeven')}: ${datum(lang, g.gegevenOp)}${g.gegevenDoor ? ` · ${g.gegevenDoor}` : ''}`,
          g.onbepaald ? tr(lang, 'До відкликання', 'Tot intrekking') : `${tr(lang, 'Діє до', 'Geldig tot')}: ${datum(lang, g.verlooptOp)}`,
          g.eigenaar?.email ? `${tr(lang, 'Акаунт', 'Account')}: ${g.eigenaar.email}` : '', g.bron === 'ai-beleid' ? tr(lang, 'Автоматично з політики ШІ', 'Automatisch uit het AI-beleid') : ''].filter(Boolean).join('\n');
        return <li key={g.id} className='ut-toegang-rij' data-staat={staat} title={titel} tabIndex={0} aria-label={`${naam}: ${tr(lang, TOEGANG_TEKST[staat][0], TOEGANG_TEKST[staat][1])}. ${titel.replace(/\n/g, '. ')}`}>
          <span className='ut-toegang-logo'>{g.soort === 'account' && g.eigenaar ? <Persoon naam={naam} id={g.onderwerp} foto={g.eigenaar.foto} klein /> : <AgentLogo agent={g.soort === 'agent' ? g.onderwerp : g.label} naam={g.label} size={28} />}</span>
          <span className='ut-toegang-tekst'><b>{naam}</b><small>{tr(lang, OMVANG[g.soort][0], OMVANG[g.soort][1])}{zelfde(g) ? ` · ${tr(lang, 'надано', 'gegeven')} ${datum(lang, g.gegevenOp)}` : ''}</small></span>
          <span className='ut-toegang-staat' data-staat={staat}>{staat === 'actief' ? kortTermijn(lang, g) : tr(lang, TOEGANG_TEKST[staat][0], TOEGANG_TEKST[staat][1])}</span>
        </li>; })}</ul>}
    <button type='button' className='ut-knop' onClick={naarInstellen}>{tr(lang, 'Керувати доступом', 'Toegang beheren')}</button>
  </section>;
}
