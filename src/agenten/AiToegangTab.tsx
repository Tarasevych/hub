// Вкладка «Доступ ШІ»: детальні доступи одного підключення ШІ (per-user, per-agent, per-function).
// Малюється з ОДНОГО каталогу shared/ai-toegang.ts — жодних захардкоджених списків скоупів тут.
// Props-driven, щоб дошка-картка (своя чи сестринська з гілки board) просто підключала
// <AiToegangTab verbinding={{ soort: 'oauth', id, naam }} />. Українська, світла, вузький екран — ок.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Lock, RotateCcw, ShieldCheck, ShieldOff } from 'lucide-react';
import { api } from '../platform/client';
import { sessionBody } from '../agents-data';
import { serviceFromLocation } from '../canonical-navigation';
import { AI_TOEGANG_GROEPEN, AI_TOEGANG_SCOPES, STANDAARD_SCOPES, toegangScope, zichtbareScopes } from '../../shared/ai-toegang';
import { klantVan } from '../../shared/ai-verbinding';
import type { Tr } from '../mcp-ui';

export type ToegangVerbinding = { soort: 'oauth' | 'token'; id: string; naam: string };
const uk = (tr: Tr | undefined) => (s: string) => (tr ? tr(s, s) : s);
const toegangScopeGroep = (groep: string) => AI_TOEGANG_SCOPES.filter((s) => s.groep === groep);
const dienst = () => (serviceFromLocation() === 'ai' ? 'ai' : 'mcp');

export default function AiToegangTab({ verbinding, tr, metBeheer }: { verbinding: ToegangVerbinding; tr?: Tr; metBeheer?: boolean }) {
  const t = uk(tr);
  const klant = useMemo(() => klantVan(verbinding.naam), [verbinding.naam]);
  const scopes = useMemo(() => zichtbareScopes(klant), [klant]);
  const [granted, setGranted] = useState<string[] | null>(null);
  const [beheerUit, setBeheerUit] = useState<string[]>([]);
  const [fout, setFout] = useState('');
  const [ok, setOk] = useState('');
  const [bezig, setBezig] = useState(false);
  const [bevest, setBevest] = useState<string | null>(null);

  const laad = useCallback(async () => {
    setFout('');
    try {
      const [o, b] = await Promise.all([
        api.post('/api/owner/ai-toegang/overzicht', { ...sessionBody(dienst()), soort: verbinding.soort, id: verbinding.id }),
        api.post('/api/owner/ai-toegang/beheer', sessionBody(dienst())),
      ]);
      setGranted(Array.isArray((o.data as { granted?: unknown }).granted) ? (o.data as { granted: string[] }).granted : []);
      setBeheerUit(Array.isArray((b.data as { uit?: unknown }).uit) ? (b.data as { uit: string[] }).uit : []);
    } catch (e) {
      if (verbinding.id.startsWith('bord:')) {
        setGranted(STANDAARD_SCOPES.filter((s) => scopes.some((z) => z.id === s)));
      } else {
        setFout(e instanceof Error ? e.message : 'TOEGANG_LADEN_MISLUKT');
        setGranted([]);
      }
    }
  }, [verbinding.soort, verbinding.id, scopes]);
  useEffect(() => { setGranted(null); void laad(); }, [laad]);

  const schakel = (id: string) => {
    if (granted === null) return;
    const aan = granted.includes(id);
    const info = toegangScope(id);
    // Чутливий скоуп вмикається у два кроки (мітка + підтвердження).
    if (!aan && info?.gevoelig) { setBevest(id); return; }
    setGranted(aan ? granted.filter((s) => s !== id) : [...granted, id]);
    setOk('');
  };
  const bevestigJa = () => {
    if (bevest && granted !== null && !granted.includes(bevest)) setGranted([...granted, bevest]);
    setBevest(null);
    setOk('');
  };

  const bewaar = async () => {
    if (granted === null) return;
    setBezig(true); setFout(''); setOk('');
    try {
      const r = await api.post('/api/owner/ai-toegang/zet', { ...sessionBody(dienst()), soort: verbinding.soort, id: verbinding.id, scopes: granted, bevestigd: true });
      setGranted((r.data as { granted: string[] }).granted);
      setOk(t('Збережено. Діє з наступного виклику — перепідключати не треба.'));
    } catch (e) {
      setFout(e instanceof Error ? e.message : 'TOEGANG_BEWAREN_MISLUKT');
    } finally { setBezig(false); }
  };
  const reset = () => { void laad(); setOk(''); };

  if (granted === null) return <p className='at-leeg'>{t('Завантаження доступів…')}</p>;
  return (
    <div className='at' data-toegang={verbinding.id}>
      <p className='at-ondertitel'>
        {t(`Що саме цей ШІ («${verbinding.naam}») може робити у вашому просторі. Діє лише для нього і застосовується з наступного виклику.`)}
      </p>
      {fout ? <p className='at-melding at-fout' role='alert'>{fout}</p> : null}
      {ok ? <p className='at-melding at-ok' role='status'>{ok}</p> : null}
      {AI_TOEGANG_GROEPEN.map((groep) => {
        const rijen = scopes.filter((s) => s.groep === groep);
        if (!rijen.length) return null;
        return (
          <section key={groep} className='at-groep' data-groep={groep}>
            <h4>{t(groep)}</h4>
            <ul>
              {rijen.map((s) => {
                const aan = granted.includes(s.id);
                const adminUit = beheerUit.includes(s.id);
                return (
                  <li key={s.id} className={`at-rij${aan ? ' is-aan' : ''}${adminUit ? ' is-beheer-uit' : ''}`} data-scope={s.id}>
                    <button
                      type='button' role='switch' aria-checked={aan} disabled={adminUit}
                      className='at-schakelaar' data-scope-schakelaar={s.id}
                      onClick={() => schakel(s.id)}
                      aria-label={`${s.uk}: ${s.omschrijvingUk}`}
                    >
                      <span className='at-knop' aria-hidden='true' />
                    </button>
                    <span className='at-tekst'>
                      <span className='at-naam'>
                        {t(s.uk)}
                        {s.gevoelig ? <span className='at-gevoelig' title={t('Чутливі дані: вмикається лише з вашим підтвердженням')}><Lock size={12} aria-hidden='true' />{t('чутливе')}</span> : null}
                      </span>
                      <span className='at-lijn'>{t(s.omschrijvingUk)}</span>
                      {adminUit ? <span className='at-beheer'><ShieldOff size={12} aria-hidden='true' />{t('Вимкнено адміністратором для всього сайту')}</span> : null}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
      {bevest ? (
        <div className='at-bevest' role='alertdialog' aria-modal='false' aria-label={t('Підтвердження чутливого доступу')}>
          <p><Lock size={14} aria-hidden='true' /> <strong>{t(toegangScope(bevest)?.uk ?? bevest)}</strong></p>
          <p>{t('Це чутливі дані. ШІ зможе їх читати, доки ви не вимкнете доступ. Надати доступ?')}</p>
          <div className='at-bevest-knoppen'>
            <button type='button' className='at-knop-prim' data-bevest-ja='1' onClick={bevestigJa}>{t('Так, надати')}</button>
            <button type='button' className='at-knop-twee' data-bevest-nee='1' onClick={() => setBevest(null)}>{t('Скасувати')}</button>
          </div>
        </div>
      ) : null}
      <div className='at-voet'>
        <button type='button' className='at-knop-prim' data-bewaar='1' disabled={bezig} onClick={() => void bewaar()}>
          <ShieldCheck size={14} aria-hidden='true' />{bezig ? t('Збереження…') : t('Зберегти доступи')}
        </button>
        <button type='button' className='at-knop-twee' data-reset='1' disabled={bezig} onClick={reset}>
          <RotateCcw size={14} aria-hidden='true' />{t('Скасувати зміни')}
        </button>
      </div>
      {metBeheer ? <AiToegangBeheer tr={tr} beheerUit={beheerUit} onChanged={setBeheerUit} /> : null}
    </div>
  );
}

/** Адміністративна стеля (лише власник; іншим — 403, секція ховається). Дошка сестринської гілки може перевикористати. */
export function AiToegangBeheer({ tr, beheerUit, onChanged }: { tr?: Tr; beheerUit: string[]; onChanged: (uit: string[]) => void }) {
  const t = uk(tr);
  const [verboden, setVerboden] = useState(false);
  const [bezig, setBezig] = useState<string | null>(null);
  const zet = async (id: string, uit: boolean) => {
    setBezig(id);
    try {
      const r = await api.post('/api/owner/ai-toegang/beheer/zet', { ...sessionBody(dienst()), scope: id, uit });
      onChanged((r.data as { uit: string[] }).uit);
    } catch (e) {
      if (e instanceof Error && /OWNER_REQUIRED|403/.test(e.message)) setVerboden(true);
    } finally { setBezig(null); }
  };
  if (verboden) return null;
  return (
    <section className='at-beheer' data-beheer='1'>
      <h4><ShieldCheck size={14} aria-hidden='true' />{t('Стеля сайту (лише власник)')}</h4>
      <p className='at-ondertitel'>{t('Вимкнене тут не працює в жодного ШІ, навіть зі старим дозволом.')}</p>
      <ul className='at-beheer-lijst'>
        {AI_TOEGANG_GROEPEN.flatMap((groep) =>
          toegangScopeGroep(groep).map((s) => (
            <li key={s.id} className='at-beheer-rij2' data-beheer-scope={s.id}>
              <span>{t(s.uk)} <span className='at-beheer-groep-naam'>· {t(s.groep)}</span></span>
              <button
                type='button' role='switch' aria-checked={!beheerUit.includes(s.id)}
                className={`at-schakelaar${beheerUit.includes(s.id) ? '' : ' is-aan'}`}
                disabled={bezig !== null} onClick={() => void zet(s.id, !beheerUit.includes(s.id))}
                aria-label={`${s.uk} — ${beheerUit.includes(s.id) ? t('вимкнено для сайту') : t('увімкнено для сайту')}`}
              >
                <span className='at-knop' aria-hidden='true' />
              </button>
            </li>
          )),
        )}
      </ul>
    </section>
  );
}
