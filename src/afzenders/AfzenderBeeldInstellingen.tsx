// Налаштування пошти → Безпека → «Відправники» → «Фото й логотипи відправників» (21.10.2026, backend/merk-bron.ts).
// Twee keuzes van de mens zelf, per ruimte, allebei standaard UIT:
//   • foto's uit de eigen Google-contacten (People API, alleen lezen; vraagt één extra toestemming van Google op de bestaande
//     Gmail-koppeling — geen nieuwe koppeling);
//   • Gravatar (de SHA-256 van elk zichtbaar afzenderadres gaat dan naar een derde — daarom uit tot de mens het aanzet).
// Logo's van organisaties (BIMI / pictogram van hun eigen website) zet de EIGENAAR van de site aan of uit (admin → Інтеграції);
// hier staat alleen of dat aan staat. Alle beelden komen van de eigen server; de browser laadt niets van buiten.
import { useEffect, useId, useState } from 'react';
import { api } from '../platform/client';
import { mailContext } from './api';
import { afzenderBeeldenVergeten } from './afzender-beelden';
import { MERK_BRON_TEKST } from '../../shared/merk-bron-tekst';

type Lang = 'uk' | 'nl';
type Stand = {
  voorkeur: { gravatar: boolean; googleContacten: boolean; googleStand: string; googleOp: number };
  google: { gekoppeld: boolean; lezen: boolean; ontbreekt: string[] };
  domeinen: boolean;
};
const t = (lang: Lang, uk: string, nl: string) => (lang === 'uk' ? uk : nl);
const GOOGLE_STAND: Record<string, [string, string]> = {
  'scope-ontbreekt': ['Google ще не дав доступу до контактів (або People API вимкнено в проєкті Google цього сервера).', 'Google gaf nog geen toegang tot de contacten (of de People API staat uit in het Google-project van deze server).'],
  'geen-account': ['Немає підключеної скриньки Gmail у цьому просторі.', 'Er is geen gekoppelde Gmail-mailbox in deze ruimte.'],
  'sleutel-gesloten': ['Ключ шифрування закритий — фото не завантажуються, доки ви його не відкриєте.', 'De versleutelingssleutel is dicht — foto\'s worden pas opgehaald als u hem opent.'],
  fout: ['Google не відповів; спробуємо пізніше.', 'Google antwoordde niet; we proberen het later opnieuw.'],
};

export default function AfzenderBeeldInstellingen({ lang }: { lang: Lang }) {
  const id = useId();
  const [stand, setStand] = useState<Stand | null>(null);
  const [bezig, setBezig] = useState(false);
  const [melding, setMelding] = useState<{ tekst: string; fout: boolean } | null>(null);
  const L = lang === 'uk' ? 'uk' : 'nl';

  const laden = async (patch?: Record<string, boolean>) => {
    setBezig(true);
    try {
      const r = await api.post('/api/owner/mail/afzender-beelden/voorkeur', { ...mailContext(), ...(patch || {}) });
      setStand(r.data as Stand);
      if (patch) { afzenderBeeldenVergeten(); setMelding({ fout: false, tekst: t(lang, 'Збережено.', 'Bewaard.') }); }
    } catch (e) {
      setMelding({ fout: true, tekst: `${t(lang, 'Не вдалося. Код сервера:', 'Mislukt. Servercode:')} ${String((e as { message?: string } | null)?.message || 'HTTP')}` });
    } finally { setBezig(false); }
  };
  useEffect(() => { void laden(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const toestemming = async () => {
    setBezig(true); setMelding(null);
    try {
      const r = await api.post('/api/owner/mail/afzender-beelden/google-toestemming', { ...mailContext(), returnTo: location.href, locale: lang });
      const url = String((r.data as { authUrl?: string } | null)?.authUrl || '');
      if (/^https:\/\/accounts\.google\.com\//.test(url)) { location.assign(url); return; }
      setMelding({ fout: true, tekst: t(lang, 'Google не повернув адресу для дозволу.', 'Google gaf geen adres voor de toestemming terug.') });
    } catch (e) {
      setMelding({ fout: true, tekst: `${t(lang, 'Не вдалося відкрити вікно Google. Код сервера:', 'Het venster van Google kon niet open. Servercode:')} ${String((e as { message?: string } | null)?.message || 'HTTP')}` });
    } finally { setBezig(false); }
  };

  const v = stand?.voorkeur;
  const googleTekst = v?.googleContacten && v.googleStand && GOOGLE_STAND[v.googleStand] ? GOOGLE_STAND[v.googleStand][L === 'uk' ? 0 : 1] : '';
  return <section className='afz-beelden' aria-labelledby={`${id}-kop`} data-afzender-beelden-instellingen>
    <h3 id={`${id}-kop`}>{t(lang, 'Фото й логотипи відправників', 'Foto\'s en logo\'s van afzenders')}</h3>
    <p className='afz-stil'>{stand === null ? t(lang, 'Завантаження…', 'Laden…') : stand.domeinen
      ? t(lang, 'Логотипи організацій (BIMI / значок їхнього сайту) увімкнено власником сайту. Для адрес безкоштовних поштових сервісів (gmail.com, ukr.net …) логотип сервісу як «фото» не показується.', 'Logo\'s van organisaties (BIMI / pictogram van hun website) staan aan bij de eigenaar van de site. Bij adressen van gratis maildiensten (gmail.com, ukr.net …) wordt het logo van de dienst niet als «foto» getoond.')
      : t(lang, 'Логотипи організацій з їхніх доменів вимкнено власником сайту.', 'Logo\'s van organisaties van hun domein staan uit bij de eigenaar van de site.')}</p>

    <label className='afz-beelden-keuze'>
      <input type='checkbox' checked={v?.googleContacten === true} disabled={bezig || !v} onChange={(e) => void laden({ googleContacten: e.target.checked })} />
      <span><strong>{MERK_BRON_TEKST.google[L]}</strong><small>{MERK_BRON_TEKST.googleUitleg[L]}</small></span>
    </label>
    {v?.googleContacten && stand && !stand.google.lezen && (stand.google.gekoppeld
      ? <button type='button' className='afz-knop afz-knop-hoofd' style={{ justifySelf: 'start' }} disabled={bezig} onClick={() => void toestemming()}>{t(lang, 'Дозволити Google показувати фото з контактів', 'Google toestaan foto\'s uit de contacten te tonen')}</button>
      : <p className='afz-stil'>{t(lang, 'Спершу підключіть Gmail (Пошта → Акаунти).', 'Koppel eerst Gmail (Post → Accounts).')}</p>)}
    {googleTekst && <p className='afz-stil' role='status'>{googleTekst}</p>}

    <label className='afz-beelden-keuze'>
      <input type='checkbox' checked={v?.gravatar === true} disabled={bezig || !v} onChange={(e) => void laden({ gravatar: e.target.checked })} />
      <span><strong>{MERK_BRON_TEKST.gravatar[L]}</strong><small>{MERK_BRON_TEKST.gravatarUitleg[L]}</small></span>
    </label>
    {melding && <p role={melding.fout ? 'alert' : 'status'} className='afz-stil' style={melding.fout ? { color: 'var(--fout)' } : undefined}>{melding.tekst}</p>}
  </section>;
}
