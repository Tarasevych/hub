// Termijn, eigenaar en verantwoordelijke van een sleutel in de kluis (shared/kluis-meta.ts). Gebruikt in admin.*/contour en
// api.*/vault: een statusregel op de kaart en een formulier (bij toevoegen én «Деталі» bij een bestaande sleutel).
// Geen browservensters (confirm/alert): alles op de pagina zelf, met toetsenbord en schermlezer bruikbaar.
import { useId, useState } from 'react';
import { Bot, CalendarClock, Cpu, Server, UserRound } from 'lucide-react';
import { api } from './platform/client';
import { VAULT_SOORTEN, leegMeta, soortTekst, staatTekst, vandaag, type VaultMeta, type VaultSoort, type VaultStaat } from '../shared/kluis-meta';
import './kluis-meta.css';

type Lang = 'uk' | 'nl';
const tr = (lang: Lang, uk: string, nl: string) => (lang === 'uk' ? uk : nl);
const ICOON: Record<VaultSoort, typeof Bot> = { service: Server, ai: Bot, device: Cpu, person: UserRound };

/** Dag + n dagen/maanden (kalender), als JJJJ-MM-DD. */
function plus(dag: string, n: number, eenheid: 'd' | 'm'): string {
  const [y, m, d] = dag.split('-').map(Number);
  const t = eenheid === 'd' ? new Date(Date.UTC(y, m - 1, d + n)) : new Date(Date.UTC(y, m - 1 + n, Math.min(d, new Date(Date.UTC(y, m - 1 + n + 1, 0)).getUTCDate())));
  return t.toISOString().slice(0, 10);
}

export function VaultMetaRegel({ lang, meta, staat }: { lang: Lang; meta?: VaultMeta; staat?: VaultStaat }) {
  const m = meta ?? leegMeta();
  const Icoon = m.soort ? ICOON[m.soort] : null;
  const s = staat ?? 'zonder-termijn';
  return (
    <div className='vault-meta' data-vault-staat={s}>
      <span className={`vault-meta-termijn is-${s}`}><CalendarClock aria-hidden='true' />{staatTekst(m, lang)}</span>
      {m.soort || m.van ? <span className='vault-meta-van'>{Icoon ? <Icoon aria-hidden='true' /> : null}{tr(lang, 'Належить: ', 'Van: ')}{[soortTekst(m.soort, lang), m.van].filter(Boolean).join(' · ')}</span> : null}
      {m.verantwoordelijke ? <span className='vault-meta-wie'><UserRound aria-hidden='true' />{tr(lang, 'Відповідальний: ', 'Verantwoordelijke: ')}{m.verantwoordelijke}</span> : null}
      {m.geldigVan ? <span className='vault-meta-van-tot'>{tr(lang, 'Діє з ', 'Geldig vanaf ')}{m.geldigVan}{m.geldigTot ? ` ${tr(lang, 'до', 'tot')} ${m.geldigTot}` : ''}</span> : null}
      {m.notitie ? <small className='vault-meta-notitie'>{m.notitie}</small> : null}
    </div>
  );
}

export function VaultMetaVelden({ lang, waarde, onChange }: { lang: Lang; waarde: VaultMeta; onChange: (m: VaultMeta) => void }) {
  const id = useId();
  const zet = <K extends keyof VaultMeta>(k: K, v: VaultMeta[K]) => onChange({ ...waarde, [k]: v });
  const basis = waarde.geldigVan || vandaag();
  return (
    <fieldset className='vault-meta-velden'>
      <legend>{tr(lang, 'Кому належить і скільки діє', 'Van wie en hoe lang geldig')}</legend>
      <div className='vault-meta-rij'>
        <label htmlFor={`${id}-soort`}>{tr(lang, 'Належить', 'Hoort bij')}
          <select id={`${id}-soort`} value={waarde.soort} onChange={(e) => zet('soort', e.target.value as VaultSoort | '')}>
            <option value=''>{tr(lang, '— не вказано —', '— niet opgegeven —')}</option>
            {VAULT_SOORTEN.map((s) => <option key={s} value={s}>{soortTekst(s, lang)}</option>)}
          </select>
        </label>
        <label htmlFor={`${id}-van`}>{tr(lang, 'Назва (сервіс, ШІ, пристрій або людина)', 'Naam (dienst, AI, apparaat of persoon)')}
          <input id={`${id}-van`} value={waarde.van} maxLength={80} onChange={(e) => zet('van', e.target.value)} placeholder={tr(lang, 'напр. Home Assistant або Claude', 'bijv. Home Assistant of Claude')} autoComplete='off' />
        </label>
        <label htmlFor={`${id}-wie`}>{tr(lang, 'Відповідальний', 'Verantwoordelijke')}
          <input id={`${id}-wie`} value={waarde.verantwoordelijke} maxLength={120} onChange={(e) => zet('verantwoordelijke', e.target.value)} placeholder={tr(lang, 'хто оновлює й відкликає', 'wie vernieuwt en intrekt')} autoComplete='off' />
        </label>
      </div>
      <div className='vault-meta-rij'>
        <label htmlFor={`${id}-van-dag`}>{tr(lang, 'Діє з', 'Geldig vanaf')}
          <input id={`${id}-van-dag`} type='date' value={waarde.geldigVan} onChange={(e) => zet('geldigVan', e.target.value)} />
        </label>
        <label htmlFor={`${id}-tot-dag`}>{tr(lang, 'Діє до (включно)', 'Geldig tot (inclusief)')}
          <input id={`${id}-tot-dag`} type='date' value={waarde.geldigTot} min={waarde.geldigVan || undefined} onChange={(e) => zet('geldigTot', e.target.value)} />
        </label>
        <div className='vault-meta-snel' role='group' aria-label={tr(lang, 'Швидко вибрати кінець строку', 'Snel een einddatum kiezen')}>
          <button type='button' onClick={() => zet('geldigTot', plus(basis, 30, 'd'))}>{tr(lang, '30 днів', '30 dagen')}</button>
          <button type='button' onClick={() => zet('geldigTot', plus(basis, 90, 'd'))}>{tr(lang, '90 днів', '90 dagen')}</button>
          <button type='button' onClick={() => zet('geldigTot', plus(basis, 12, 'm'))}>{tr(lang, 'Рік', 'Jaar')}</button>
          <button type='button' onClick={() => zet('geldigTot', '')}>{tr(lang, 'Без строку', 'Zonder einde')}</button>
        </div>
      </div>
      <label htmlFor={`${id}-notitie`}>{tr(lang, 'Нотатка (без самого ключа!)', 'Notitie (zonder de sleutel zelf!)')}
        <input id={`${id}-notitie`} value={waarde.notitie} maxLength={240} onChange={(e) => zet('notitie', e.target.value)} placeholder={tr(lang, 'напр. права: repo, read:org', 'bijv. rechten: repo, read:org')} autoComplete='off' />
      </label>
    </fieldset>
  );
}

/** «Деталі» bij een bestaande sleutel: alleen metadata, de waarde blijft onaangeroerd. */
export function VaultMetaBewerker({ lang, id, meta, context, onOpgeslagen }: { lang: Lang; id: string; meta?: VaultMeta; context: Record<string, unknown>; onOpgeslagen: () => Promise<void> | void }) {
  const [open, setOpen] = useState(false);
  const [waarde, setWaarde] = useState<VaultMeta>(meta ?? leegMeta());
  const [bezig, setBezig] = useState(false);
  const [melding, setMelding] = useState<{ ok: boolean; tekst: string } | null>(null);
  const opslaan = async () => {
    setBezig(true); setMelding(null);
    try {
      await api.post(`/api/owner/api-platform/vault/${encodeURIComponent(id)}/meta`, { ...context, meta: waarde });
      setMelding({ ok: true, tekst: tr(lang, 'Збережено. Значення ключа не змінювалося.', 'Opgeslagen. De waarde van de sleutel is niet gewijzigd.') });
      setOpen(false);
      await onOpgeslagen();
    } catch (c) {
      const code = String((c as { response?: { data?: { error?: unknown } } })?.response?.data?.error || '');
      setMelding({ ok: false, tekst: code === 'OWNER_VAULT_META_RANGE_INVALID' ? tr(lang, 'Кінець строку раніше за початок.', 'Het einde ligt voor het begin.') : code === 'OWNER_VAULT_META_DATE_INVALID' ? tr(lang, 'Неправильна дата.', 'Ongeldige datum.') : tr(lang, 'Не вдалося зберегти: ', 'Opslaan mislukt: ') + (code || tr(lang, 'немає зв’язку', 'geen verbinding')) });
    } finally { setBezig(false); }
  };
  return (
    <div className='vault-meta-bewerker'>
      <button type='button' aria-expanded={open} onClick={() => { setOpen(!open); setWaarde(meta ?? leegMeta()); setMelding(null); }}>{open ? tr(lang, 'Закрити деталі', 'Details sluiten') : tr(lang, 'Деталі: строк і власник', 'Details: termijn en eigenaar')}</button>
      {open ? (
        <form onSubmit={(e) => { e.preventDefault(); void opslaan(); }}>
          <VaultMetaVelden lang={lang} waarde={waarde} onChange={setWaarde} />
          <div className='vault-meta-knoppen'>
            <button type='submit' disabled={bezig}>{tr(lang, 'Зберегти деталі', 'Details opslaan')}</button>
            <button type='button' onClick={() => setOpen(false)}>{tr(lang, 'Скасувати', 'Annuleren')}</button>
          </div>
        </form>
      ) : null}
      {melding ? <p className='vault-meta-melding' data-ok={String(melding.ok)} role={melding.ok ? 'status' : 'alert'}>{melding.tekst}</p> : null}
    </div>
  );
}
