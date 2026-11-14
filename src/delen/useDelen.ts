// IDENTITEIT-014 (фаза 3, крок «delen»): один хук спільного доступу для hub-модалки й центру налаштувань (id.*).
// Eén hook voor delen: leden laden, per adres uitnodigen, rol wijzigen, intrekken, privélink maken en kopiëren.
// Обидва клієнти відрізняються лише тілом запиту (hub — authData, центр — service/tabContext/sourceOrigin): його дає `post`.
// Права — лише з shared/werkruimte-rechten.ts; остаточне рішення завжди ухвалює сервер (і step-up для «адміністратора»).
import { useCallback, useEffect, useRef, useState } from 'react';
import { invitesClient } from '../platform/client';
import { KOPIEER_MISLUKT, kopieerTekst } from '../platform/klembord';
import { deelWeigering, foutNaarTekst } from '../weigeringen';
import { magDelen, werkruimteRol, type WerkruimteRol } from '../../shared/werkruimte-rechten';
import { keuzeNaarRol, type KeuzeRol, type Lid, type Paar } from './delen-logica';

/** POST naar de server met het juiste lichaam voor deze client; geeft response.data terug. */
export type DelenPost = (pad: string, lichaam: Record<string, unknown>) => Promise<Record<string, unknown>>;

/**
 * Privélink naar de HUB: alleen de hub leest de code (sessionStorage per host), meldt aan en sluit aan. Een link die op id.* werd
 * gemaakt en naar id.* wees, werd stil genegeerd. / Посилання-запрошення завжди веде на hub.
 */
export const uitnodigingsLink = (code: string, hubOrigin: string) => invitesClient.buildJoinUrl(code, { path: '#/join', origin: hubOrigin });

export function useDelen(o: { werkruimteId: string; rol: WerkruimteRol | null | undefined; actief: boolean; post: DelenPost; melding: (p: Paar) => void; hubOrigin: string }) {
  const [leden, setLeden] = useState<Lid[]>([]);
  const [serverRol, setServerRol] = useState<WerkruimteRol | null>(null);
  const [link, setLink] = useState('');
  const [gekopieerd, setGekopieerd] = useState(false);
  const [bezig, setBezig] = useState(false);
  // Laatste waarden zonder de callbacks bij elke render opnieuw te maken (post/melding zijn vaak inline functies).
  const ref = useRef(o); ref.current = o;
  const id = o.werkruimteId;

  const laden = useCallback(async () => {
    const { werkruimteId, post } = ref.current;
    if (!werkruimteId) { setLeden([]); return; }
    try {
      const data = await post('/api/share/members', { workspaceId: werkruimteId });
      if (ref.current.werkruimteId !== werkruimteId) return; // intussen een andere ruimte gekozen
      setLeden(Array.isArray(data.members) ? (data.members as Lid[]) : []);
      // De server zegt welke rol u HIER hebt (dezelfde regel als bij elke actie) — die wint van de lijst van ruimtes.
      setServerRol(typeof data.rol === 'string' ? werkruimteRol({ permission: data.rol === 'owner' ? 'owner' : 'viewer', workspaceRole: data.rol }) : null);
    } catch { if (ref.current.werkruimteId === werkruimteId) setLeden([]); }
  }, []);

  // Andere ruimte → oude lijst, link en rol weg (anders lijkt de lijst bij de verkeerde ruimte te horen).
  useEffect(() => { setLeden([]); setLink(''); setServerRol(null); setGekopieerd(false); if (o.actief && id) void laden(); }, [id, o.actief, laden]);

  /** Per adres uitnodigen of de rol van een bestaande uitnodiging bijwerken. true = gelukt. */
  const perAdres = useCallback(async (v: { email: string; keuze: KeuzeRol; scopeBlockIds?: string[] }): Promise<boolean> => {
    const { werkruimteId, post, melding } = ref.current;
    if (!werkruimteId || !v.email.trim()) return false;
    setBezig(true);
    try {
      await post('/api/share/email', { workspaceId: werkruimteId, email: v.email.trim(), permission: v.keuze, workspaceRole: keuzeNaarRol(v.keuze), scopeBlockIds: v.scopeBlockIds || [] });
      melding(['Доступ надано. Людина отримає сповіщення.', 'Toegang gegeven. Deze persoon krijgt een melding.']);
      await laden();
      return true;
    } catch (e) {
      // SEC-002 (g02 opm. 13): de mens hoort waarom (grens van uitnodigingen, eigen adres, te hoge rol), niet niets.
      const w = deelWeigering(e); if (w) { melding(w); return false; }
      melding(foutNaarTekst(e) || ['Доступ не надано: сервер відмовив. Перевірте адресу й роль і спробуйте ще раз.', 'Er is geen toegang gegeven: de server weigerde. Controleer adres en rol en probeer het opnieuw.']);
      return false;
    } finally { setBezig(false); }
  }, [laden]);

  const rolWijzigen = useCallback(async (lidId: string, rol: WerkruimteRol): Promise<boolean> => {
    const { werkruimteId, post, melding } = ref.current;
    setBezig(true);
    try { await post('/api/share/role', { workspaceId: werkruimteId, memberId: lidId, workspaceRole: rol }); melding(['Роль змінено. Людина отримає сповіщення.', 'Rol gewijzigd. Deze persoon krijgt een melding.']); await laden(); return true; }
    catch (e) { melding(foutNaarTekst(e) || ['Роль не змінено. Оновіть список і спробуйте ще раз.', 'De rol is niet gewijzigd. Vernieuw de lijst en probeer het opnieuw.']); await laden(); return false; }
    finally { setBezig(false); }
  }, [laden]);

  const intrekken = useCallback(async (lidId: string): Promise<boolean> => {
    const { werkruimteId, post, melding } = ref.current;
    setBezig(true);
    try { await post('/api/share/revoke', { workspaceId: werkruimteId, memberId: lidId }); melding(['Доступ відкликано.', 'Toegang ingetrokken.']); await laden(); return true; }
    catch (e) { melding(foutNaarTekst(e) || ['Доступ не відкликано. Оновіть список і спробуйте ще раз.', 'De toegang is niet ingetrokken. Vernieuw de lijst en probeer het opnieuw.']); return false; }
    finally { setBezig(false); }
  }, [laden]);

  const linkMaken = useCallback(async (v: { keuze: KeuzeRol; scopeBlockIds?: string[] }): Promise<string> => {
    const { werkruimteId, post, melding, hubOrigin } = ref.current;
    if (!werkruimteId) return '';
    setBezig(true);
    try {
      const data = await post('/api/share/link', { workspaceId: werkruimteId, permission: v.keuze, workspaceRole: keuzeNaarRol(v.keuze), scopeBlockIds: v.scopeBlockIds || [] });
      const url = uitnodigingsLink(String(data.code || ''), hubOrigin); setLink(url); setGekopieerd(false); return url;
    } catch (e) { melding(foutNaarTekst(e) || ['Посилання не створено. Спробуйте ще раз.', 'De link is niet gemaakt. Probeer het opnieuw.']); return ''; }
    finally { setBezig(false); }
  }, []);

  const kopieren = useCallback(async () => {
    // IDENTITEIT-013: без мовчазної відмови
    if (!(await kopieerTekst(link))) { ref.current.melding(KOPIEER_MISLUKT); return; }
    setGekopieerd(true); setTimeout(() => setGekopieerd(false), 1500);
  }, [link]);

  const rol = serverRol ?? o.rol ?? null;
  return { leden, rol, mag: magDelen(rol), link, gekopieerd, bezig, laden, perAdres, rolWijzigen, intrekken, linkMaken, kopieren };
}
export type Delen = ReturnType<typeof useDelen>;
