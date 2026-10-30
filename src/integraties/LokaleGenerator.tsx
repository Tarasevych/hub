// admin → Інтеграції → «Майстер підключень»: ЛОКАЛЬНИЙ ГЕНЕРАТОР ЗОБРАЖЕНЬ (BYOS, 21.10.2026; recht «Створювати зображення»).
// De eigenaar start zelf een generator op zijn eigen machine of in zijn lokale netwerk (bv. een geïsoleerde container met de HTTP-API
// van AUTOMATIC1111 of een OpenAI-compatibele lokale server) en zet hier het adres. Alleen loopback en privénetwerken; de server
// controleert dat bij elk verzoek opnieuw (shared/media-generator.ts). Opslaan vraagt een verse passkey (de api-client opent dat
// venster zelf en herhaalt het verzoek). «Перевірити» doet een echt leesverzoek naar de generator, zonder beeld en zonder prompt.
import { useEffect, useState, type ChangeEvent } from 'react';
import { CheckCircle2, ImagePlus, RefreshCw, TriangleAlert } from 'lucide-react';
import { api } from '../platform/client';
import HulpVraag from '../hulp/HulpVraag';
import { GENERATOR_SOORTEN, GENERATOR_SOORT_TEKST, STANDAARD_GENERATOR, generatorTekst, normaliseerGenerator, type GeneratorInstelling, type GeneratorSoort } from '../../shared/media-generator';

type Lang = 'uk' | 'nl';
type Stand = GeneratorInstelling & { bijgewerktOp: number; bijgewerktDoor: string };

export default function LokaleGenerator({ lang, context }: { lang: Lang; context: Record<string, unknown> }) {
  const t = (uk: string, nl: string) => (lang === 'uk' ? uk : nl);
  const [inst, setInst] = useState<GeneratorInstelling>({ ...STANDAARD_GENERATOR });
  const [stand, setStand] = useState<Stand | null>(null);
  const [bezig, setBezig] = useState<'' | 'test' | 'opslaan'>('');
  const [melding, setMelding] = useState<{ fout: boolean; tekst: string } | null>(null);
  const [modellen, setModellen] = useState<string[]>([]);

  const laden = async () => {
    try { const r = await api.post('/api/owner/admin/media-generator/stand', context); const s = (r.data as { instelling: Stand }).instelling; setStand(s); setInst({ aan: s.aan, url: s.url, soort: s.soort, model: s.model, timeoutS: s.timeoutS, maxZijde: s.maxZijde, stappen: s.stappen }); }
    catch { setStand(null); }
  };
  useEffect(() => { void laden(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const codeTekst = (e: unknown) => { const c = String((e as { message?: string } | null)?.message || ''); return generatorTekst(c, lang) || `${t('Код сервера:', 'Servercode:')} ${c || 'HTTP'}`; };
  const controleer = async () => {
    const n = normaliseerGenerator({ ...inst, aan: true });
    if (!n.ok) { setMelding({ fout: true, tekst: generatorTekst(n.code, lang) }); return; }
    setBezig('test'); setMelding(null); setModellen([]);
    try {
      const r = (await api.post('/api/owner/admin/media-generator/controleer', { ...context, ...n.instelling })).data as { ok: boolean; code: string; detail?: string; modellen?: string[] };
      setMelding({ fout: !r.ok, tekst: `${generatorTekst(r.code, lang)}${r.detail ? ` (${r.detail})` : ''}` });
      setModellen(r.modellen || []);
    } catch (e) { setMelding({ fout: true, tekst: codeTekst(e) }); }
    setBezig('');
  };
  const opslaan = async () => {
    const n = normaliseerGenerator(inst);
    if (!n.ok) { setMelding({ fout: true, tekst: generatorTekst(n.code, lang) }); return; }
    setBezig('opslaan'); setMelding(null);
    try { await api.post('/api/owner/admin/media-generator/opslaan', { ...context, ...n.instelling }); await laden(); setMelding({ fout: false, tekst: t('Збережено. Дію записано в журнал.', 'Opgeslagen. De actie staat in het logboek.') }); }
    catch (e) { setMelding({ fout: true, tekst: codeTekst(e) }); }
    setBezig('');
  };
  const getal = (k: 'timeoutS' | 'maxZijde' | 'stappen') => (e: ChangeEvent<HTMLInputElement>) => setInst((x) => ({ ...x, [k]: Number(e.target.value) || 0 }));

  return (
    <section className='il-sectie il-d-sectie' data-lokale-generator='v1' style={{ marginTop: 24, display: 'grid', gap: 12 }}>
      <h3 className='il-sectiekop'><ImagePlus aria-hidden /> {t('Локальний генератор зображень', 'Lokale afbeeldingsgenerator')}</h3>
      <p className='il-d-noot'>{t('Для дозволу ШІ «Створювати зображення». Генератор запускаєте ви самі — на цьому сервері чи в локальній мережі (наприклад, ізольований контейнер з HTTP API AUTOMATIC1111/Forge або OpenAI-сумісним API, як LocalAI). Сайт звертається лише до цієї адреси, лише до локальної мережі, і зберігає результат у хмару людини. Жодна стороння хмара не використовується.', 'Voor het AI-recht «Afbeeldingen genereren». De generator start u zelf — op deze server of in uw lokale netwerk (bv. een geïsoleerde container met de HTTP-API van AUTOMATIC1111/Forge of een OpenAI-compatibele API zoals LocalAI). De site spreekt alleen dit adres aan, alleen in het lokale netwerk, en bewaart het resultaat in de cloud van de persoon. Er wordt geen externe cloud gebruikt.')}</p>
      <form className='il-w-formulier' onSubmit={(e) => { e.preventDefault(); void opslaan(); }} autoComplete='off'>
        <label className='il-w-veld'><span>{t('Адреса генератора', 'Adres van de generator')}</span>
          <input type='url' value={inst.url} onChange={(e) => setInst((x) => ({ ...x, url: e.target.value }))} placeholder='http://127.0.0.1:7860' spellCheck={false} inputMode='url' />
          <small>{t('Лише 127.0.0.1, ::1 або приватна мережа (10.x, 172.16–31.x, 192.168.x). Службові порти (Docker, Caddy-admin, бази даних) заборонено.', 'Alleen 127.0.0.1, ::1 of een privénetwerk (10.x, 172.16–31.x, 192.168.x). Dienstpoorten (Docker, Caddy-admin, databases) zijn verboden.')}</small>
        </label>
        <label className='il-w-veld'><span>{t('Тип API', 'Soort API')} <HulpVraag k='integraties.generator-soort' /></span>
          <select data-hulp='integraties.generator-soort' value={inst.soort} onChange={(e) => setInst((x) => ({ ...x, soort: e.target.value as GeneratorSoort }))}>
            {GENERATOR_SOORTEN.map((s) => <option key={s} value={s}>{GENERATOR_SOORT_TEKST[s][lang]} — {GENERATOR_SOORT_TEKST[s].pad}</option>)}
          </select>
        </label>
        <label className='il-w-veld'><span>{t('Модель (необов’язково)', 'Model (optioneel)')}</span>
          <input type='text' value={inst.model} onChange={(e) => setInst((x) => ({ ...x, model: e.target.value }))} list='il-generator-modellen' spellCheck={false} />
          <datalist id='il-generator-modellen'>{modellen.map((m) => <option key={m} value={m} />)}</datalist>
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
          <label className='il-w-veld'><span>{t('Час очікування, с', 'Wachttijd, s')}</span><input type='number' min={10} max={900} value={inst.timeoutS} onChange={getal('timeoutS')} /></label>
          <label className='il-w-veld'><span>{t('Найбільша сторона, px', 'Grootste zijde, px')}</span><input type='number' min={256} max={2048} step={64} value={inst.maxZijde} onChange={getal('maxZijde')} /></label>
          <label className='il-w-veld'><span>{t('Кроки за замовчуванням', 'Standaard aantal stappen')}</span><input type='number' min={1} max={150} value={inst.stappen} onChange={getal('stappen')} /></label>
        </div>
        <label className='il-w-veld' style={{ display: 'flex', alignItems: 'center', gap: 8 }}><input data-hulp='integraties.generator-aan' type='checkbox' checked={inst.aan} onChange={(e) => setInst((x) => ({ ...x, aan: e.target.checked }))} style={{ width: 'auto' }} /><span>{t('Увімкнено: ШІ з цим дозволом може створювати зображення', 'Aan: een AI met dit recht kan afbeeldingen genereren')} <HulpVraag k='integraties.generator-aan' /></span></label>
        <div className='il-w-acties'>
          <button type='button' className='il-knop' onClick={() => void controleer()} disabled={bezig !== '' || !inst.url}><RefreshCw className={bezig === 'test' ? 'spin' : ''} aria-hidden />{t('Перевірити', 'Controleren')}</button>
          <button type='submit' className='il-knop is-primair' disabled={bezig !== ''}>{bezig === 'opslaan' ? t('Зберігаємо…', 'Opslaan…') : t('Зберегти (з passkey)', 'Opslaan (met passkey)')}</button>
        </div>
      </form>
      {stand?.bijgewerktOp ? <p className='il-d-noot'>{t('Востаннє змінено', 'Laatst gewijzigd')}: {new Date(stand.bijgewerktOp).toLocaleString(lang === 'uk' ? 'uk-UA' : 'nl-BE')}{stand.bijgewerktDoor ? ` · ${stand.bijgewerktDoor}` : ''}</p> : null}
      {melding ? <p className='il-d-bericht' data-soort={melding.fout ? 'fout' : 'ok'} role='status'>{melding.fout ? <TriangleAlert aria-hidden /> : <CheckCircle2 aria-hidden />}{melding.tekst}</p> : null}
    </section>
  );
}
