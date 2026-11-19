// UI-015B — routes voor externe aanbieders. De kern van sessies/transacties blijft in backend/index.ts (zelfde code als Google);
// index.ts geeft die functies hier als `deps` mee, zodat er geen tweede sessielogica bestaat.
//
//   GET  /api/owner/identity/extern/:id/koppelen  — ingelogd + sterke step-up → naar de aanbieder (doel «koppelen»)
//   GET  /api/owner/identity/extern/:id/terug     — terug van Microsoft/Discord (query); Telegram: hulppagina die #tgAuthResult doorstuurt
//   POST /api/owner/identity/extern/:id/terug     — Apple (form_post) en Telegram (van de hulppagina)
//   GET  /api/owner/identity/extern/afronden      — eenmalige overdracht → aanmelden (eigenaartransactie) of koppelen (zelfde sessie)
// Aanmelden STARTEN gaat via de bestaande POST /api/owner/identity/transactions/create met { flowMode:'redirect', aanbieder }.
import { createHash } from 'node:crypto';
import { isExternAanbieder, REGISTER, TERUG_BASIS, type ExternAanbiederId } from './aanbieders';
import { neemResultaat, start, terug, type Deps, type Resultaat } from './stroom';

type Resp = { statusCode: number; headers: Record<string, string>; body: string };
type Ctx = { event: Record<string, unknown>; body: unknown; query?: Record<string, string>; params?: Record<string, string> };
type Sessie = { user: { id: string; email: string; role: string; status: string }; session?: { id: string; createdAt: number } | null; tabSession?: { id: string; createdAt: number } | null };
export type ExternRouteDeps = {
  stroom: () => Deps;
  requireSession: (event: Record<string, unknown>, body: unknown) => Promise<Sessie | { errorCode: string }>;
  sterkeStapOpFout: (auth: Sessie) => Promise<string>;
  toegestaan: (userId: string, id: ExternAanbiederId) => Promise<string>;
  koppelen: (userId: string, id: ExternAanbiederId, onderwerp: string, email: string, label: string) => Promise<'gekoppeld' | 'al-gekoppeld' | 'ander-account'>;
  /** Aanmelden afronden via de eigenaartransactie (index.ts). Geeft de router-respons (met cookies) of een foutcode. */
  aanmeldenAfronden: (ctx: Ctx, r: Resultaat) => Promise<{ ok: true; returnTo: string; headers: Record<string, string> } | { ok: false; code: string }>;
  audit: (userId: string, actie: string, uitkomst: string, details?: Record<string, unknown>) => Promise<unknown>;
  meld: (userId: string, soort: string, titel: string, tekst: string, link?: string) => Promise<void>;
};

const VEILIG = { 'Cache-Control': 'no-store', Pragma: 'no-cache', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY' };
const SAFE_CODE = /^[A-Z0-9_]{3,60}$/;
export const naar = (location: string, extra: Record<string, string> = {}): Resp => ({ statusCode: 303, headers: { ...VEILIG, ...extra, Location: location }, body: '' });
const methodenPagina = (id: string, code: string, locale = 'uk') => `${TERUG_BASIS()}/aanmeldmethoden?extern=${encodeURIComponent(id)}&${code === 'OK' ? 'gekoppeld=1' : `fout=${SAFE_CODE.test(code) ? code : 'EXTERN_MISLUKT'}`}&lang=${locale === 'nl' ? 'nl' : 'uk'}`;
const aanmeldPagina = (code: string, locale = 'uk') => `${TERUG_BASIS()}/?extern_fout=${SAFE_CODE.test(code) ? code : 'EXTERN_MISLUKT'}&lang=${locale === 'nl' ? 'nl' : 'uk'}`;
const veiligeCode = (e: unknown) => { const m = e instanceof Error ? e.message : ''; return SAFE_CODE.test(m) && /^(EXTERN_|TELEGRAM_|OWNER_|LOGIN_|STEP_UP)/.test(m) ? m : 'EXTERN_MISLUKT'; };

/** Hulppagina voor Telegram: het resultaat staat in het #-fragment (komt nooit bij de server); stuur het met POST door. */
export function telegramHulpHtml(state: string): Resp {
  const script = `(()=>{const m=/tgAuthResult=([A-Za-z0-9_\\-+/=]+)/.exec(location.hash||'');history.replaceState(null,'',location.pathname);fetch(location.pathname,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({s:${JSON.stringify(state)},tgAuthResult:m?m[1].replace(/-/g,'+').replace(/_/g,'/'):''})}).then(r=>r.json()).then(j=>{location.replace(j&&typeof j.volgende==='string'&&j.volgende.startsWith('/')?j.volgende:'/aanmeldmethoden')}).catch(()=>location.replace('/aanmeldmethoden'))})();`;
  const html = `<!doctype html><html lang="uk"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Telegram</title><body><p>Перевіряємо вхід через Telegram… / Aanmelding via Telegram wordt gecontroleerd…</p><script>${script}</script></body></html>`;
  const hash = createHash('sha256').update(script, 'utf8').digest('base64');
  return { statusCode: 200, headers: { ...VEILIG, 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': `default-src 'none'; script-src 'sha256-${hash}'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'` }, body: html };
}

const paramsVan = (ctx: Ctx): Record<string, string> => {
  const uit: Record<string, string> = {};
  for (const [k, v] of Object.entries(ctx.query || {})) uit[k] = String(v ?? '');
  const b = ctx.body;
  if (typeof b === 'string' && b) for (const [k, v] of new URLSearchParams(b)) uit[k] = v; // Apple form_post (x-www-form-urlencoded)
  else if (b && typeof b === 'object') for (const [k, v] of Object.entries(b as Record<string, unknown>)) if (typeof v === 'string') uit[k] = v;
  return uit;
};

export function externRoutes(deps: ExternRouteDeps): Record<string, Array<(ctx: Ctx) => Promise<Resp>>> {
  const koppelStart = async (ctx: Ctx): Promise<Resp> => {
    const id = String(ctx.params?.id || '');
    if (!isExternAanbieder(id)) return naar(methodenPagina('onbekend', 'EXTERN_ONBEKEND'));
    const locale = ctx.query?.lang === 'nl' ? 'nl' : 'uk';
    const auth = await deps.requireSession(ctx.event, {});
    if ('errorCode' in auth || auth.user.status !== 'approved') return naar(methodenPagina(id, 'OWNER_SESSION_REQUIRED', locale));
    const niet = await deps.toegestaan(auth.user.id, id);
    if (niet) return naar(methodenPagina(id, niet, locale));
    const stap = await deps.sterkeStapOpFout(auth);
    if (stap) return naar(methodenPagina(id, stap, locale));
    try {
      const { url } = await start({ aanbieder: id, doel: 'koppelen', userId: auth.user.id, locale, remember: false }, deps.stroom());
      await deps.audit(auth.user.id, 'access.extern.koppelen.start', 'success', { aanbieder: id });
      return naar(url);
    } catch (e) { return naar(methodenPagina(id, veiligeCode(e), locale)); }
  };

  const terugkomst = async (ctx: Ctx): Promise<Resp> => {
    const id = String(ctx.params?.id || '');
    if (!isExternAanbieder(id)) return naar(aanmeldPagina('EXTERN_ONBEKEND'));
    const p = paramsVan(ctx);
    const method = String(((ctx.event.requestContext as { http?: { method?: string } } | undefined)?.http?.method) || 'GET').toUpperCase();
    // Telegram: eerst de hulppagina (GET zonder resultaat), daarna POST vanaf die pagina met JSON-antwoord.
    if (id === 'telegram' && method === 'GET') return /^[A-Za-z0-9_-]{43}$/.test(p.s || '') ? telegramHulpHtml(p.s) : naar(aanmeldPagina('EXTERN_STATE_ONGELDIG'));
    try {
      const { overdracht } = await terug(id, p, deps.stroom());
      const volgende = `/api/owner/identity/extern/afronden?h=${overdracht}`;
      if (id === 'telegram') return { statusCode: 200, headers: { ...VEILIG, 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify({ ok: true, volgende }) };
      return naar(volgende);
    } catch (e) {
      const code = veiligeCode(e);
      await deps.audit('anonymous', 'access.extern.terug', 'rejected', { aanbieder: id, reden: code }).catch(() => undefined);
      if (id === 'telegram') return { statusCode: 400, headers: { ...VEILIG, 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify({ ok: false, volgende: `/aanmeldmethoden?extern=telegram&fout=${code}` }) };
      return naar(aanmeldPagina(code));
    }
  };

  const afronden = async (ctx: Ctx): Promise<Resp> => {
    const r = await neemResultaat(String(ctx.query?.h || ''), deps.stroom());
    if (!r) return naar(aanmeldPagina('EXTERN_OVERDRACHT_ONGELDIG'));
    const { staat, identiteit } = r;
    const id = staat.aanbieder;
    if (staat.doel === 'koppelen') {
      const auth = await deps.requireSession(ctx.event, {});
      if ('errorCode' in auth || auth.user.id !== staat.userId) {
        await deps.audit(staat.userId || 'anonymous', 'access.extern.koppelen', 'rejected', { aanbieder: id, reden: 'EXTERN_SESSIE_ANDERS' });
        return naar(methodenPagina(id, 'EXTERN_SESSIE_ANDERS', staat.locale));
      }
      const niet = await deps.toegestaan(auth.user.id, id);
      if (niet) return naar(methodenPagina(id, niet, staat.locale));
      const uitkomst = await deps.koppelen(auth.user.id, id, identiteit.onderwerp, identiteit.email || '', identiteit.label);
      if (uitkomst === 'ander-account') {
        await deps.audit(auth.user.id, 'access.extern.koppelen', 'rejected', { aanbieder: id, reden: 'EXTERN_AL_BIJ_ANDER_ACCOUNT' });
        return naar(methodenPagina(id, 'EXTERN_AL_BIJ_ANDER_ACCOUNT', staat.locale));
      }
      await deps.audit(auth.user.id, 'access.extern.koppelen', 'success', { aanbieder: id, nieuw: uitkomst === 'gekoppeld' });
      if (uitkomst === 'gekoppeld') {
        const naam = REGISTER[id].naam;
        await deps.meld(auth.user.id, 'security_warning', `Підключено новий спосіб входу: ${naam} / Nieuwe aanmeldmethode gekoppeld: ${naam}`,
          `До облікового запису ${auth.user.email} підключено вхід через ${naam} (обліковий запис «${identiteit.label}»). Тепер ним можна входити в Мій простір. Якщо це були не ви — від’єднайте його на сторінці «Способи входу» і завершіть чужі сеанси. / Aan account ${auth.user.email} is aanmelden met ${naam} gekoppeld (account «${identiteit.label}»). Was u dit niet: ontkoppel het op «Aanmeldmethoden» en beëindig vreemde sessies.`,
          `${TERUG_BASIS()}/aanmeldmethoden?extern=${id}`);
      }
      return naar(methodenPagina(id, 'OK', staat.locale));
    }
    const uit = await deps.aanmeldenAfronden(ctx, r);
    if (!uit.ok) {
      await deps.audit('anonymous', 'access.extern.aanmelden', 'rejected', { aanbieder: id, reden: uit.code });
      return naar(aanmeldPagina(uit.code, staat.locale));
    }
    return naar(uit.returnTo, uit.headers);
  };

  return {
    'GET /api/owner/identity/extern/afronden': [afronden],
    'GET /api/owner/identity/extern/:id/koppelen': [koppelStart],
    'GET /api/owner/identity/extern/:id/terug': [terugkomst],
    'POST /api/owner/identity/extern/:id/terug': [terugkomst],
  };
}
