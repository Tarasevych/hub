// Спільний перегляд вкладень, етап 3, розділ 15.6 (CONSOL-001 / SPIL-WEERGAVE):
// вузький захищений маршрут розпізнавання тексту зі сканів та зображень для вкладень Пошти й Хмари.
// Проміжне сховище розпізнаного тексту — виключно app.zoek_ocr_tekst під захистом (user_id, ruimte) через ocrUitvoeren.
// Жодних прямих імпортів модуля прапорців (перевірка прапорця надходить ін’єкцією vlagAan із backend/index.ts).
// Жодного запису вмісту файлів чи розпізнаного тексту до журналів сервера.

import type { IncomingMessage } from 'node:http';
import { error, json, rateLimit } from '../server/platform';
import type { RouterContext, RouterMiddleware } from '../server/platform/router';
import { leesLadeBestandVoorDelen } from './cloud-vnext-bestanden';
import { leesMailBijlageVoorOcr } from './google-suite-mail-browser';
import { huidigeLade, ladeVoorVerzoek, MailRuimteFout, metLade } from './mail-ruimte';
import { can, rejectForeignOwnerUserId } from './rbac';
import { RuimteFout } from './ruimte-scheiding';
import { ruimteVanSessie, type Ruimte } from './ruimte-sessie';
import { MAX_OCR_BYTES, soortVan } from './zoek/ocr';
import { ocrUitvoeren } from './zoek/tekst-extractie';

export { MAX_OCR_BYTES };

export type OcrSessieGebruiker = {
  id: string;
  email?: string;
  role?: string;
  status?: string;
  accessLevel?: string;
};

export type OcrSessieUitkomst =
  | { errorCode: string }
  | { user: OcrSessieGebruiker; service?: string; tab?: string };

export type BijlageWeergaveOcrDeps = {
  requireSession: (req: IncomingMessage | Record<string, unknown>, body?: unknown) => Promise<OcrSessieUitkomst>;
  vlagAan?: (u: { id: string }) => Promise<boolean>;
  leesMail?: typeof leesMailBijlageVoorOcr;
  leesCloud?: typeof leesLadeBestandVoorDelen;
  voerOcrUit?: typeof ocrUitvoeren;
  rateLimitFn?: typeof rateLimit;
  ruimteFn?: () => Promise<Ruimte>;
};

const schoon = (v: unknown, max = 500): string => String(v ?? '').replace(/\u0000/g, '').trim().slice(0, max);

const BERICHT_ID_RE = /^[A-Za-z0-9_-]{3,300}$/;
const BIJLAGE_ID_RE = /^[A-Za-z0-9_-]{1,2000}$/;
const BESTAND_ID_RE = /^[A-Za-z0-9_-]{1,200}$/;

function isTeGrootFout(e: unknown): boolean {
  const code = String((e as { code?: unknown })?.code || (e as Error)?.message || '');
  return code === 'TE_GROOT' || code === 'GOOGLE_MAIL_ATTACHMENT_PREVIEW_TOO_LARGE' || /TOO_LARGE|MAX_BYTES/i.test(code);
}

export function bijlageWeergaveOcrRoutes(deps: BijlageWeergaveOcrDeps): Record<string, RouterMiddleware[]> {
  const leesMail = deps.leesMail ?? leesMailBijlageVoorOcr;
  const heeftEigenMailLezer = Boolean(deps.leesMail);
  const leesCloud = deps.leesCloud ?? leesLadeBestandVoorDelen;
  const voerOcrUit = deps.voerOcrUit ?? ocrUitvoeren;
  const limietControle = deps.rateLimitFn ?? rateLimit;
  const bepaalRuimte = deps.ruimteFn ?? ruimteVanSessie;

  const verwerkOcrVerzoek: RouterMiddleware = async (ctx: RouterContext) => {
    const verzoekEvent = (ctx?.event ?? (ctx as unknown)) as IncomingMessage | Record<string, unknown>;
    const ruwBody = ctx?.body;
    const auth = await deps.requireSession(verzoekEvent, ruwBody);
    if (!auth || 'errorCode' in auth) {
      return error(String(auth?.errorCode || 'OWNER_SESSION_REQUIRED'), 401);
    }
    if (auth.user?.status !== 'approved' || !auth.user.id) {
      return error('OWNER_APPROVED_SESSION_REQUIRED', 403);
    }

    const body = ruwBody && typeof ruwBody === 'object' && !Array.isArray(ruwBody)
      ? (ruwBody as Record<string, unknown>)
      : {};

    const vreemd = rejectForeignOwnerUserId(auth.user, body);
    if (vreemd) return vreemd;

    if (deps.vlagAan) {
      const aan = await deps.vlagAan({ id: auth.user.id }).catch(() => false);
      if (!aan) return error('BIJLAGE_WEERGAVE_UIT', 404);
    }

    const limiet = await limietControle(`bijlage-ocr:${auth.user.id}`, 30, 600);
    if (!limiet.ok) {
      return error('RATE_LIMITED', 429, { retryAfter: limiet.retryAfter });
    }

    // Простір береться виключно з перевіреного сеансу, ніколи не з тіла запиту.
    const sessieRuimte = await bepaalRuimte();
    let ruimte: 'prive' | 'technisch' = sessieRuimte === 'technisch' ? 'technisch' : 'prive';

    const bron = body.bron === 'mail' ? 'mail' : body.bron === 'cloud' ? 'cloud' : '';
    if (!bron) {
      return error('BIJLAGE_OCR_BRON_ONGELDIG', 400);
    }

    let bytes: Uint8Array;
    let mime: string;
    let naam: string;

    if (bron === 'mail') {
      if (!can(auth.user, 'mail.read')) {
        return error('RBAC_FORBIDDEN', 403);
      }
      const accountId = schoon(body.accountId, 300);
      const messageId = schoon(body.messageId, 300);
      const attachmentId = schoon(body.attachmentId, 2000);
      const filename = schoon(body.filename, 500) || 'bijlage';
      const declaredType = schoon(body.contentType, 200);

      if (!BERICHT_ID_RE.test(messageId) || !BIJLAGE_ID_RE.test(attachmentId)) {
        return error('GOOGLE_MAIL_ATTACHMENT_INVALID', 400);
      }

      try {
        const roepMailAan = () => leesMail(auth.user.id, accountId, messageId, attachmentId, filename, declaredType, MAX_OCR_BYTES);
        let gelezen: Awaited<ReturnType<typeof leesMailBijlageVoorOcr>>;
        if (!heeftEigenMailLezer && !huidigeLade(auth.user.id)) {
          const besluit = await ladeVoorVerzoek(auth.user.id, 'mail', body);
          if (!besluit.ok) {
            return json({ error: besluit.code, dienst: 'mail', uitleg: besluit.uitleg }, 403);
          }
          ruimte = besluit.lade.ruimte;
          gelezen = await metLade(besluit.lade, 'mail', roepMailAan);
        } else {
          gelezen = await roepMailAan();
        }
        if (gelezen.bytes.length > MAX_OCR_BYTES) {
          return json({ ok: false, status: 'te_groot', herkomst: 'geen', tekst: '', paginas: 0 });
        }
        bytes = gelezen.bytes;
        mime = gelezen.contentType;
        naam = gelezen.filename;
      } catch (e) {
        if (isTeGrootFout(e)) {
          return json({ ok: false, status: 'te_groot', herkomst: 'geen', tekst: '', paginas: 0 });
        }
        const code = e instanceof Error ? e.message : 'GOOGLE_MAIL_ATTACHMENT_FAILED';
        if (code === 'GOOGLE_MAIL_ATTACHMENT_EMPTY') {
          return json({ ok: false, status: 'leeg', herkomst: 'geen', tekst: '', paginas: 0 });
        }
        if (e instanceof MailRuimteFout) return error(e.code, e.status);
        if (e instanceof RuimteFout) return error(e.code, e.status);
        if (code.includes('_INVALID')) return error(code, 400);
        if (code === 'GOOGLE_MAIL_ACCOUNT_NOT_CONNECTED') return error(code, 409);
        return error('BIJLAGE_OCR_LEZEN_MISLUKT', 502);
      }
    } else {
      if (!can(auth.user, 'cloud.read')) {
        return error('RBAC_FORBIDDEN', 403);
      }
      const bestandId = schoon(body.bestandId, 200);
      if (!BESTAND_ID_RE.test(bestandId)) {
        return error('BESTAND_ONGELDIG', 400);
      }

      try {
        const gelezen = await leesCloud({ userId: auth.user.id, ruimte }, bestandId);
        if (!gelezen) {
          return error('BESTAND_ONBEKEND', 404);
        }
        if (gelezen.totaalBytes > MAX_OCR_BYTES || gelezen.data.length > MAX_OCR_BYTES) {
          return json({ ok: false, status: 'te_groot', herkomst: 'geen', tekst: '', paginas: 0 });
        }
        bytes = gelezen.data;
        mime = schoon(gelezen.bestand?.mime, 200) || schoon(body.contentType, 200);
        naam = schoon(gelezen.bestand?.naam, 500) || schoon(body.filename, 500) || 'bestand';
      } catch (e) {
        if (isTeGrootFout(e)) {
          return json({ ok: false, status: 'te_groot', herkomst: 'geen', tekst: '', paginas: 0 });
        }
        if (e instanceof RuimteFout) return error(e.code, e.status);
        return error('BIJLAGE_OCR_LEZEN_MISLUKT', 500);
      }
    }

    if (bytes.length === 0) {
      return json({ ok: false, status: 'leeg', herkomst: 'geen', tekst: '', paginas: 0 });
    }

    const soort = soortVan(mime, naam);
    if (soort !== 'pdf' && soort !== 'afbeelding') {
      return json({ ok: false, status: 'niet_ondersteund', herkomst: 'geen', tekst: '', paginas: 0 });
    }

    try {
      const uitslag = await voerOcrUit({
        bytes,
        mime,
        naam,
        maxBytes: MAX_OCR_BYTES,
        sleutel: { userId: auth.user.id, ruimte },
      });
      return json({
        ok: uitslag.status === 'ok',
        status: uitslag.status,
        herkomst: uitslag.herkomst,
        tekst: uitslag.tekst,
        paginas: uitslag.paginas?.length ?? 0,
      });
    } catch {
      return json({ ok: false, status: 'fout', herkomst: 'geen', tekst: '', paginas: 0 });
    }
  };

  return {
    'POST /api/owner/bijlage-weergave/ocr-tekst': [verwerkOcrVerzoek],
  };
}
